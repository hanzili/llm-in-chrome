#!/usr/bin/env node

/**
 * LLM in Chrome MCP Server
 *
 * A browser automation agent as a service. Instead of exposing low-level
 * browser primitives (click, type, navigate), this exposes high-level
 * task-based tools. The agent handles all browser interaction autonomously.
 *
 * Key features:
 * - Parallel task execution (each task has a session ID)
 * - Multi-turn interaction (send follow-up messages)
 * - Real-time status monitoring
 * - No need to understand browser internals
 *
 * Use this when you need to:
 * - Fill out web forms
 * - Navigate complex websites
 * - Extract data from web pages
 * - Perform multi-step web workflows
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// Session management
interface BrowserSession {
  id: string;
  status: 'starting' | 'running' | 'waiting' | 'complete' | 'error' | 'stopped';
  task: string;
  url?: string;
  startedAt: number;
  currentStep?: string;
  result?: any;
  error?: string;
  screenshots: string[];
}

const sessions: Map<string, BrowserSession> = new Map();
let sessionCounter = 0;

// Native host connection
let nativeHost: ChildProcess | null = null;
let messageBuffer = Buffer.alloc(0);

const TOOLS: Tool[] = [
  {
    name: "browser_start",
    description: `Start a new browser automation task. The agent will autonomously navigate, click, type, and interact with web pages to complete your task.

Returns a session_id for tracking. Use browser_status to monitor progress.

Examples:
- "Fill out the contact form on example.com with my info"
- "Search for 'MCP protocol' on Google and summarize the first 3 results"
- "Log into my account and download the latest invoice"`,
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Natural language description of what you want done"
        },
        url: {
          type: "string",
          description: "Optional starting URL. If not provided, agent uses current tab or navigates as needed"
        }
      },
      required: ["task"]
    }
  },
  {
    name: "browser_message",
    description: `Send a follow-up message to a running browser task. Use this to:
- Provide additional instructions
- Answer the agent's questions
- Correct the agent's approach
- Continue a task after it's waiting for input`,
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The session ID from browser_start"
        },
        message: {
          type: "string",
          description: "Your follow-up message or instructions"
        }
      },
      required: ["session_id", "message"]
    }
  },
  {
    name: "browser_status",
    description: `Get the status of browser task(s). Returns current state, progress, and any intermediate results.

Call without session_id to get status of all active tasks.`,
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Optional session ID. If omitted, returns all active tasks"
        }
      }
    }
  },
  {
    name: "browser_stop",
    description: "Stop a running browser task and get any partial results.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The session ID to stop"
        }
      },
      required: ["session_id"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot of the current browser state for a task.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Optional session ID. If omitted, captures the active tab"
        }
      }
    }
  }
];

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  sessionCounter++;
  return `browser-${Date.now()}-${sessionCounter}`;
}

/**
 * Find native host path from installed manifest
 */
function findNativeHostPath(): string {
  const manifestPath = path.join(
    os.homedir(),
    'Library', 'Application Support', 'Google', 'Chrome',
    'NativeMessagingHosts', 'com.llm_in_chrome.oauth_host.json'
  );

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.path && fs.existsSync(manifest.path)) {
        return manifest.path;
      }
    } catch {}
  }

  // Development fallback
  const devPath = path.join(__dirname, '..', '..', 'native-host', 'native-host-wrapper.sh');
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  throw new Error("LLM in Chrome native host not found. Please install the extension first.");
}

/**
 * Connect to native host
 */
function connectToNativeHost(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    try {
      const hostPath = findNativeHostPath();
      console.error(`[MCP] Connecting to: ${hostPath}`);

      const host = spawn(hostPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      host.stdout?.on('data', (chunk: Buffer) => {
        messageBuffer = Buffer.concat([messageBuffer, chunk]);
        processNativeMessages();
      });

      host.stderr?.on('data', (data: Buffer) => {
        console.error(`[Native] ${data.toString().trim()}`);
      });

      host.on('error', reject);
      host.on('close', (code) => {
        console.error(`[MCP] Native host exited: ${code}`);
        nativeHost = null;
      });

      nativeHost = host;
      setTimeout(() => resolve(host), 100);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Process messages from native host
 */
function processNativeMessages(): void {
  while (messageBuffer.length >= 4) {
    const msgLen = messageBuffer.readUInt32LE(0);
    if (messageBuffer.length < 4 + msgLen) break;

    const msgStr = messageBuffer.subarray(4, 4 + msgLen).toString();
    messageBuffer = messageBuffer.subarray(4 + msgLen);

    try {
      const message = JSON.parse(msgStr);
      handleNativeMessage(message);
    } catch (e) {
      console.error('[MCP] Parse error:', e);
    }
  }
}

/**
 * Handle message from native host
 */
function handleNativeMessage(message: any): void {
  const { type, sessionId, results, ...data } = message;

  // Handle batch results from polling
  if (type === 'mcp_results' && Array.isArray(results)) {
    for (const result of results) {
      processResult(result);
    }
    return;
  }

  // Handle single result
  if (sessionId && sessions.has(sessionId)) {
    processResult({ type, sessionId, ...data });
  }
}

/**
 * Process a single result from extension
 */
function processResult(result: any): void {
  const { type, sessionId, ...data } = result;

  if (!sessionId || !sessions.has(sessionId)) {
    // Screenshot without session
    if (type === 'screenshot' && data.data) {
      console.error(`[MCP] Received screenshot (no session)`);
    }
    return;
  }

  const session = sessions.get(sessionId)!;

  switch (type) {
    case 'task_update':
      session.status = 'running';
      session.currentStep = data.step || data.status;
      break;
    case 'task_waiting':
      session.status = 'waiting';
      session.currentStep = data.message;
      break;
    case 'task_complete':
      session.status = 'complete';
      session.result = data.result;
      break;
    case 'task_error':
      session.status = 'error';
      session.error = data.error;
      break;
    case 'screenshot':
      if (data.data) {
        session.screenshots.push(data.data);
      }
      break;
  }
}

/**
 * Send message to native host
 */
async function sendToNative(message: any): Promise<void> {
  if (!nativeHost?.stdin) {
    await connectToNativeHost();
  }

  const json = JSON.stringify(message);
  const buffer = Buffer.from(json);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buffer.length, 0);

  nativeHost!.stdin!.write(len);
  nativeHost!.stdin!.write(buffer);
}

/**
 * Format session for response
 */
function formatSession(session: BrowserSession): any {
  return {
    session_id: session.id,
    status: session.status,
    task: session.task,
    url: session.url,
    started_at: new Date(session.startedAt).toISOString(),
    current_step: session.currentStep,
    ...(session.result && { result: session.result }),
    ...(session.error && { error: session.error }),
  };
}

// Create MCP server
const server = new Server(
  {
    name: "llm-in-chrome",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {
        listChanged: false
      }
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "browser_start": {
        const task = args?.task as string;
        const url = args?.url as string | undefined;

        if (!task?.trim()) {
          return {
            content: [{ type: "text", text: "Error: task cannot be empty" }],
            isError: true
          };
        }

        const sessionId = generateSessionId();
        const session: BrowserSession = {
          id: sessionId,
          status: 'starting',
          task,
          url,
          startedAt: Date.now(),
          screenshots: []
        };
        sessions.set(sessionId, session);

        // Send to extension via native host
        await sendToNative({
          type: 'mcp_start_task',
          sessionId,
          task,
          url
        });

        session.status = 'running';

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              session_id: sessionId,
              status: "started",
              message: `Task started. Use browser_status("${sessionId}") to monitor progress.`
            }, null, 2)
          }]
        };
      }

      case "browser_message": {
        const sessionId = args?.session_id as string;
        const message = args?.message as string;

        if (!sessionId || !sessions.has(sessionId)) {
          return {
            content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
            isError: true
          };
        }

        if (!message?.trim()) {
          return {
            content: [{ type: "text", text: "Error: message cannot be empty" }],
            isError: true
          };
        }

        await sendToNative({
          type: 'mcp_send_message',
          sessionId,
          message
        });

        const session = sessions.get(sessionId)!;
        session.status = 'running';

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              session_id: sessionId,
              status: "message_sent",
              message: "Follow-up message sent to the agent"
            }, null, 2)
          }]
        };
      }

      case "browser_status": {
        const sessionId = args?.session_id as string | undefined;

        if (sessionId) {
          if (!sessions.has(sessionId)) {
            return {
              content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
              isError: true
            };
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify(formatSession(sessions.get(sessionId)!), null, 2)
            }]
          };
        }

        // Return all active sessions
        const activeSessions = Array.from(sessions.values())
          .filter(s => s.status !== 'complete' && s.status !== 'error' && s.status !== 'stopped')
          .map(formatSession);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              active_sessions: activeSessions.length,
              sessions: activeSessions
            }, null, 2)
          }]
        };
      }

      case "browser_stop": {
        const sessionId = args?.session_id as string;

        if (!sessionId || !sessions.has(sessionId)) {
          return {
            content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
            isError: true
          };
        }

        await sendToNative({
          type: 'mcp_stop_task',
          sessionId
        });

        const session = sessions.get(sessionId)!;
        session.status = 'stopped';

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              session_id: sessionId,
              status: "stopped",
              partial_result: session.result || session.currentStep
            }, null, 2)
          }]
        };
      }

      case "browser_screenshot": {
        const sessionId = args?.session_id as string | undefined;

        await sendToNative({
          type: 'mcp_screenshot',
          sessionId
        });

        // Wait briefly for screenshot
        await new Promise(r => setTimeout(r, 2000));

        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          if (session.screenshots.length > 0) {
            const latest = session.screenshots[session.screenshots.length - 1];
            return {
              content: [{
                type: "image",
                data: latest,
                mimeType: "image/png"
              }]
            };
          }
        }

        return {
          content: [{ type: "text", text: "Screenshot captured (check browser_status for result)" }]
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

/**
 * Poll for results from extension via native host
 */
async function pollForResults(): Promise<void> {
  if (!nativeHost?.stdin) return;

  try {
    sendToNative({ type: 'mcp_poll_results' });
  } catch (err) {
    console.error('[MCP] Poll error:', err);
  }
}

// Start server
async function main() {
  console.error("[MCP] LLM in Chrome MCP Server starting...");

  try {
    // Pre-connect to native host
    await connectToNativeHost();
    console.error("[MCP] Connected to native host");

    // Start polling for results every 500ms
    setInterval(pollForResults, 500);
  } catch (err) {
    console.error("[MCP] Warning: Could not connect to native host:", err);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Server running");
}

main().catch((error) => {
  console.error("[MCP] Fatal:", error);
  process.exit(1);
});
