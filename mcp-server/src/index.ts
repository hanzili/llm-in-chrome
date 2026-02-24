#!/usr/bin/env node

/**
 * LLM in Chrome MCP Server
 *
 * Simple browser automation: send a task, get back the result.
 * The browser agent in the Chrome extension handles everything autonomously.
 *
 * browser_start blocks until the task completes — no polling needed.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketClient } from "./ipc/websocket-client.js";
import type { NativeMessage } from "./ipc/index.js";
import { randomUUID } from "crypto";

// --- Session tracking ---

interface Session {
  id: string;
  task: string;
  url?: string;
  context?: string;
  status: "running" | "complete" | "error" | "stopped";
  steps: string[];
  answer?: string;
  error?: string;
  resolve?: (value: void) => void;
}

const sessions = new Map<string, Session>();

// Pending screenshot requests
interface PendingScreenshot {
  resolve: (data: string | null) => void;
  timeout: NodeJS.Timeout;
}
const pendingScreenshots = new Map<string, PendingScreenshot>();

// Max time a task can run before we return (5 minutes)
const TASK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_CONCURRENT = parseInt(process.env.LLM_IN_CHROME_MAX_SESSIONS || "5", 10);

// WebSocket relay connection
let connection: WebSocketClient;

// --- Message handling ---

async function handleMessage(message: any): Promise<void> {
  const { type, sessionId, results, ...data } = message;

  // Handle get_info requests from extension — return raw context
  if (type === "mcp_get_info") {
    const session = sessions.get(sessionId);
    const response = session?.context
      ? `Here is the context:\n${session.context}`
      : `No context available. Check <system-reminder> tags in your conversation.`;
    await send({ type: "mcp_get_info_response", sessionId, requestId: data.requestId, response });
    return;
  }

  // Handle batch results from polling
  if (type === "mcp_results" && Array.isArray(results)) {
    for (const result of results) processResult(result);
    return;
  }

  // Handle single result
  if (sessionId) {
    processResult({ type, sessionId, ...data });
  }
}

function processResult(result: any): void {
  const { type, sessionId, ...data } = result;

  // Handle screenshots for pending requests (not real sessions)
  if (type === "screenshot" && data.data && sessionId) {
    const pending = pendingScreenshots.get(sessionId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(data.data);
      pendingScreenshots.delete(sessionId);
      return;
    }
  }

  const session = sessions.get(sessionId);
  if (!session) return;

  const step = data.step || data.status || data.message;

  switch (type) {
    case "task_update":
      if (step && step !== "thinking" && !step.startsWith("[thinking]")) {
        session.steps.push(step);
      }
      break;

    case "task_complete":
      session.status = "complete";
      session.answer = step || session.steps[session.steps.length - 1];
      console.error(`[MCP] Session ${sessionId} complete`);
      session.resolve?.();
      break;

    case "task_error":
      session.status = "error";
      session.error = data.error || "Unknown error";
      console.error(`[MCP] Session ${sessionId} error: ${session.error}`);
      session.resolve?.();
      break;

    case "screenshot":
      if (data.data) {
        const pending = pendingScreenshots.get(sessionId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(data.data);
          pendingScreenshots.delete(sessionId);
        }
      }
      break;
  }
}

async function send(message: NativeMessage): Promise<void> {
  await connection.send(message);
}

/**
 * Wait for a session to reach a terminal state (complete or error).
 */
function waitForSession(session: Session): Promise<void> {
  if (session.status !== "running") return Promise.resolve();
  return new Promise((resolve) => {
    session.resolve = resolve;
    // Safety timeout
    setTimeout(() => {
      if (session.status === "running") {
        session.status = "error";
        session.error = "Task timed out after 5 minutes";
        resolve();
      }
    }, TASK_TIMEOUT_MS);
  });
}

function formatResult(session: Session): any {
  const result: any = {
    session_id: session.id,
    status: session.status,
    task: session.task,
  };
  if (session.answer) result.answer = session.answer;
  if (session.error) result.error = session.error;
  if (session.steps.length > 0) {
    result.total_steps = session.steps.length;
    result.recent_steps = session.steps.slice(-5);
  }
  return result;
}

// --- Tool definitions ---

const TOOLS: Tool[] = [
  {
    name: "browser_start",
    description: `Run a browser automation task. Blocks until the task completes and returns the result.

The browser agent navigates, clicks, types, and fills forms autonomously.

Examples:
- "Search for 'MCP protocol' on Google and summarize the first 3 results"
- "Go to linkedin.com and find AI engineer jobs in San Francisco"
- "Fill out the contact form on example.com with my info"

Use this when you need to interact with websites through a real browser — especially for sites requiring login (the user's browser is already logged in), dynamic web apps, or tasks where no API exists.

Pass specific information (form data, descriptions, preferences) in the context parameter.`,
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What you want done. Be specific about the website and goal.",
        },
        url: {
          type: "string",
          description: "Optional starting URL. If omitted, agent navigates based on the task.",
        },
        context: {
          type: "string",
          description: "Extra information the agent needs (form data, content to paste, preferences).",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "browser_message",
    description: `Send a follow-up message to a running or completed browser task. Blocks until the agent finishes acting on it.

Use this to continue a task, provide corrections, or give additional instructions.`,
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID from browser_start" },
        message: { type: "string", description: "Follow-up instructions" },
      },
      required: ["session_id", "message"],
    },
  },
  {
    name: "browser_status",
    description: "Check the status of active browser tasks.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Optional. If omitted, returns all active tasks." },
      },
    },
  },
  {
    name: "browser_stop",
    description: "Stop a browser task and optionally delete the session.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session to stop" },
        remove: { type: "boolean", description: "If true, delete session completely" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot of the current browser state.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Optional session ID" },
      },
    },
  },
];

// --- MCP Server ---

const server = new Server(
  { name: "llm-in-chrome", version: "1.0.0" },
  { capabilities: { tools: { listChanged: false } } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "browser_start": {
        const task = args?.task as string;
        const url = args?.url as string | undefined;
        const context = args?.context as string | undefined;

        if (!task?.trim()) {
          return { content: [{ type: "text", text: "Error: task cannot be empty" }], isError: true };
        }

        // Check concurrency
        const activeCount = [...sessions.values()].filter((s) => s.status === "running").length;
        if (activeCount >= MAX_CONCURRENT) {
          return {
            content: [{
              type: "text",
              text: `Too many parallel tasks (${activeCount}/${MAX_CONCURRENT}). Wait for some to complete or stop them first.`,
            }],
            isError: true,
          };
        }

        const session: Session = {
          id: randomUUID().slice(0, 8),
          task,
          url,
          context,
          status: "running",
          steps: [],
        };
        sessions.set(session.id, session);

        // Dispatch to browser extension
        await send({ type: "mcp_start_task", sessionId: session.id, task, url, context });
        console.error(`[MCP] Started task ${session.id}: ${task.slice(0, 80)}`);

        // Block until complete
        await waitForSession(session);

        return {
          content: [{ type: "text", text: JSON.stringify(formatResult(session), null, 2) }],
          isError: session.status === "error",
        };
      }

      case "browser_message": {
        const sessionId = args?.session_id as string;
        const message = args?.message as string;
        const session = sessions.get(sessionId);

        if (!session) {
          return { content: [{ type: "text", text: `Session not found: ${sessionId}` }], isError: true };
        }
        if (!message?.trim()) {
          return { content: [{ type: "text", text: "Error: message cannot be empty" }], isError: true };
        }

        // Reset to running so we can wait again
        session.status = "running";
        session.answer = undefined;
        session.error = undefined;

        await send({ type: "mcp_send_message", sessionId, message });
        console.error(`[MCP] Message sent to ${sessionId}: ${message.slice(0, 80)}`);

        // Block until the agent finishes acting on it
        await waitForSession(session);

        const msgResult = formatResult(session);
        return {
          content: [{ type: "text", text: JSON.stringify(msgResult, null, 2) }],
          isError: msgResult.status !== "complete",
        };
      }

      case "browser_status": {
        const sessionId = args?.session_id as string | undefined;

        if (sessionId) {
          const session = sessions.get(sessionId);
          if (!session) {
            return { content: [{ type: "text", text: `Session not found: ${sessionId}` }], isError: true };
          }
          return { content: [{ type: "text", text: JSON.stringify(formatResult(session), null, 2) }] };
        }

        const active = [...sessions.values()]
          .filter((s) => s.status === "running")
          .map(formatResult);
        return { content: [{ type: "text", text: JSON.stringify(active, null, 2) }] };
      }

      case "browser_stop": {
        const sessionId = args?.session_id as string;
        const session = sessions.get(sessionId);

        if (!session) {
          return { content: [{ type: "text", text: `Session not found: ${sessionId}` }], isError: true };
        }

        await send({ type: "mcp_stop_task", sessionId, remove: args?.remove === true });

        if (args?.remove) {
          sessions.delete(sessionId);
          return { content: [{ type: "text", text: `Session ${sessionId} removed.` }] };
        }

        session.status = "stopped";
        session.resolve?.();
        return { content: [{ type: "text", text: `Session ${sessionId} stopped.` }] };
      }

      case "browser_screenshot": {
        const sessionId = args?.session_id as string | undefined;
        const requestId = sessionId || `screenshot-${Date.now()}`;

        const screenshotPromise = new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => {
            pendingScreenshots.delete(requestId);
            resolve(null);
          }, 5000);
          pendingScreenshots.set(requestId, { resolve, timeout });
        });

        await send({ type: "mcp_screenshot", sessionId: requestId });
        const data = await screenshotPromise;

        if (data) {
          return {
            content: [
              { type: "image", data, mimeType: "image/png" },
              { type: "text", text: "Screenshot of current browser state" },
            ],
          };
        }

        return { content: [{ type: "text", text: "Screenshot timed out." }], isError: true };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// --- Startup ---

async function main() {
  console.error("[MCP] Starting...");

  connection = new WebSocketClient({
    role: "mcp",
    autoStartRelay: true,
    onDisconnect: () => console.error("[MCP] Relay disconnected, will reconnect"),
  });
  connection.onMessage(handleMessage);
  await connection.connect();
  console.error("[MCP] Connected to relay");

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Server running");
}

main().catch((error) => {
  console.error("[MCP] Fatal:", error);
  process.exit(1);
});
