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
// IPC Module - WebSocket relay connection (replaces native messaging)
import { WebSocketClient } from "./ipc/websocket-client.js";
import type { NativeMessage } from "./ipc/index.js";

// Memory layer (Mem0)
import {
  initializeMemory,
  storeContext,
  searchMemory,
  deleteSessionMemories,
  isMemoryAvailable,
  addFacts,
  getRawContext,
} from "./memory-lite.js";

// Orchestrator (manages session state machine)
import { getOrchestrator, Orchestrator } from "./orchestrator/index.js";
import type { SessionState } from "./types/index.js";

// LLM Client (routes LLM requests through native host)
import { initializeLLMClient, handleLLMResponse } from "./llm/client.js";

// Browser-level session tracking (complements orchestrator)
// This tracks browser-specific details not in the orchestrator
interface BrowserSessionExtras {
  stepHistory: string[];        // Action steps only
  reasoningHistory: string[];   // Full reasoning/thinking from the agent
  screenshots: string[];
  pendingMessages: string[];    // Messages waiting to be injected into the agent
}

// Pending screenshot requests (for screenshots without session)
interface PendingScreenshot {
  resolve: (data: string | null) => void;
  timeout: NodeJS.Timeout;
}
const pendingScreenshots: Map<string, PendingScreenshot> = new Map();

// Browser-specific extras (keyed by session ID)
const browserExtras: Map<string, BrowserSessionExtras> = new Map();

// Orchestrator instance
let orchestrator: Orchestrator;

// Concurrency limit - too many parallel agents overloads Chrome
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.LLM_IN_CHROME_MAX_SESSIONS || '5', 10);

// Debug flag for verbose IPC logging (set DEBUG_IPC=1 to enable)
const DEBUG_IPC = process.env.DEBUG_IPC === '1';

/**
 * Get or create browser extras for a session
 */
function getBrowserExtras(sessionId: string): BrowserSessionExtras {
  let extras = browserExtras.get(sessionId);
  if (!extras) {
    extras = {
      stepHistory: [],
      reasoningHistory: [],
      screenshots: [],
      pendingMessages: [],
    };
    browserExtras.set(sessionId, extras);
  }
  return extras;
}

/**
 * Map orchestrator state to legacy status for backward compatibility
 */
function mapStateToLegacyStatus(state: SessionState): string {
  const mapping: Record<SessionState, string> = {
    CREATED: "starting",
    PLANNING: "running",
    NEEDS_INFO: "waiting_for_info",
    READY: "running",
    EXECUTING: "running",
    BLOCKED: "waiting",
    COMPLETED: "complete",
    FAILED: "error",
    CANCELLED: "stopped",
  };
  return mapping[state] || "running";
}

// WebSocket relay connection (replaces native host)
let connection: WebSocketClient;

const TOOLS: Tool[] = [
  {
    name: "browser_start",
    description: `Start a new browser automation task using a multi-agent system.

ARCHITECTURE (3 agents work together):
1. PLANNING AGENT - Figures out what to do
   - Determines which website from the task (e.g., "post on DevHunt" → devhunt.org)
   - Checks knowledge base for site-specific tips
   - Identifies what info is needed

2. EXPLORER AGENT - Learns unknown sites (triggered automatically)
   - If no knowledge exists for the domain, does a quick overview first
   - Creates knowledge file for future tasks

3. BROWSER AGENT - Executes the task
   - Navigates, clicks, types, fills forms
   - Uses knowledge from Planning + Explorer

Returns a session_id for tracking. Use browser_status to monitor ALL THREE agents' progress.

Examples (NO URL needed - just describe the task):
- "Help me publish my tool on DevHunt"
- "Search for 'MCP protocol' on Google and summarize the first 3 results"
- "Find jobs on LinkedIn that match my profile"
- "Log into my bank and download the latest statement"

WHEN TO USE THIS:
Use this when you need to interact with websites through a real browser - especially for:
- Sites requiring login/authentication (the user's browser is already logged in)
- Dynamic web apps that don't have APIs
- Tasks where no CLI tool or other MCP server can help

TASK GUIDELINES:
- Just describe what you want done naturally - the Planning Agent figures out where to go
- Break down complex multi-step tasks into separate tasks
- For exploration tasks ("find a good job for me"), give the goal and let the agent cook
- For precise tasks ("fill this form with X"), be specific about what you need

CONTEXT PARAMETER:
When the task requires specific information (descriptions, content to fill), pass it in the context parameter.
Example: context: "Product name: Claude Code. Description: An AI-powered CLI tool. Pricing: Free"

CONCURRENCY: Each task runs in its own browser window for isolation. Max 5 parallel tasks (configurable via LLM_IN_CHROME_MAX_SESSIONS). Windows auto-close when tasks complete.`,
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Natural language description of what you want done. Include the website name in the task (e.g., 'post on DevHunt', 'search on Google'). The Planning Agent will figure out the URL."
        },
        context: {
          type: "string",
          description: "Optional context with information needed to complete the task (e.g., descriptions, content to fill, preferences). The browser agent can query this when filling forms."
        }
      },
      required: ["task"]
    }
  },
  {
    name: "browser_message",
    description: `Send a follow-up message to a browser task. Works on running OR completed sessions.

Use this to:
- Continue a completed task with additional instructions ("now apply to this job")
- Provide context the agent needs mid-task
- Correct the agent if it's going wrong

The agent retains full memory of the session, so you can build on previous work.`,
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
    description: `Get the status of browser task(s). Shows which agent is active and what it's doing.

Call without session_id to get status of all active tasks.

Response includes:
- agent_phase: Which agent is active ("planning", "exploring", "executing", "complete")
- orchestrator_state: Internal state (PLANNING, EXECUTING, COMPLETED, etc.)
- planning_trace: What the Planning Agent did (tool calls, knowledge lookups)
- exploring: Whether Explorer Agent is running (learning a new site)
- steps: Browser Agent action summary
- reasoning: Browser Agent thinking process
- current_activity: What's happening right now
- answer: Final result when complete

AGENT PHASES:
1. "planning" - Planning Agent gathering context, checking knowledge base
2. "exploring" - Explorer Agent learning an unknown site (auto-triggered)
3. "executing" - Browser Agent performing the task
4. "complete" - Task finished

IMPORTANT: Poll this frequently (every few seconds) to monitor all agent progress in real-time. This allows you to intervene with browser_message if any agent goes off track.`,
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
    description: `Stop a browser task.

By default, the task is PAUSED - session is preserved and you can resume later with browser_message.

Set remove=true to DELETE the session completely (frees resources, can't resume).

Use cases:
- Pause (remove=false): Task went off track, want to correct it later
- Remove (remove=true): Task completed or failed, done with this session`,
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The session ID to stop"
        },
        remove: {
          type: "boolean",
          description: "If true, delete the session completely. If false (default), just pause - can resume with browser_message"
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
  },
  {
    name: "browser_debug",
    description: "Debug tool - dumps internal MCP server state including all sessions and their step history.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];


// NOTE: findNativeHostPath(), connectToNativeHost(), and processNativeMessages()
// are now handled by the NativeHostConnection class in ./ipc/native-host.ts

/**
 * Handle message from native host
 */
async function handleNativeMessage(message: any): Promise<void> {
  const { type, sessionId, results, ...data } = message;


  // Handle get_info requests from extension (uses MemoryLite)
  if (type === 'mcp_get_info') {
    const { query, requestId } = data;
    console.error(`[MCP] get_info request: sessionId=${sessionId}, query="${query}"`);

    let response: string;

    if (!isMemoryAvailable()) {
      // LLM not ready - fallback to raw context if available
      const rawContext = getRawContext(sessionId);
      if (rawContext) {
        response = `Memory search unavailable. Here is the raw context:\n${rawContext}`;
      } else {
        response = `Memory system not ready yet. Please check the <system-reminder> tags in your conversation for task context.`;
      }
    } else {
      // Search memory using LLM-based matching
      const memories = await searchMemory(sessionId, query, 5);

      if (memories.length === 0) {
        // No matches - try raw context fallback
        const rawContext = getRawContext(sessionId);
        if (rawContext) {
          response = `No specific match for "${query}". Here is the full context:\n${rawContext}`;
        } else {
          response = `No information found for "${query}". Check <system-reminder> tags or ask the user.`;
        }
      } else {
        // Return relevant facts
        const formattedMemories = memories
          .map((m, i) => `${i + 1}. ${m.memory} (relevance: ${(m.score * 100).toFixed(0)}%)`)
          .join('\n');
        response = `Found relevant information:\n${formattedMemories}`;
      }
    }

    // Send response back to extension
    await sendToNative({
      type: 'mcp_get_info_response',
      sessionId,
      requestId,
      response,
    });
    return;
  }

  // Handle batch results from polling
  if (type === 'mcp_results' && Array.isArray(results)) {
    if (DEBUG_IPC) console.error(`[MCP] Processing ${results.length} results from poll`);
    for (const result of results) {
      if (DEBUG_IPC) console.error(`[MCP] Result: ${JSON.stringify(result).substring(0, 200)}`);
      processResult(result);
    }
    return;
  }

  // Handle OAuth/API errors that affect all sessions
  if (type === 'api_error') {
    const errorType = data.errorType || 'unknown';
    const hint = data.hint || '';
    const action = data.action || '';

    console.error(`[MCP] API Error: ${data.error}`);
    if (hint) console.error(`[MCP] Hint: ${hint}`);
    if (action) console.error(`[MCP] Action: ${action}`);

    // If OAuth failed, mark all active sessions as errored
    if (errorType === 'oauth_refresh_failed') {
      const allStatuses = orchestrator.getAllStatuses();
      for (const status of allStatuses) {
        if (status.status === 'EXECUTING' || status.status === 'PLANNING' || status.status === 'READY') {
          orchestrator.updateFromBrowserEvent(status.sessionId, 'error', {
            error: `Authentication expired: ${data.error}. ${action}`,
          });
          console.error(`[MCP] Session ${status.sessionId} marked as error due to OAuth failure`);
        }
      }
    }
    return;
  }

  // Handle LLM responses directly (they use requestId, not sessionId)
  if (type === 'llm_response') {
    const requestId = data.requestId || sessionId;
    console.error(`[MCP] LLM response received for request: ${requestId}`);
    handleLLMResponse(requestId, {
      content: data.content,
      error: data.error,
      usage: data.usage,
    });
    return;
  }

  // Log other message types
  if (type !== 'no_commands' && type !== 'mcp_results') {
    console.error(`[MCP] Native message: ${type}`, sessionId || '');
  }

  // Handle single result
  if (sessionId && orchestrator.hasSession(sessionId)) {
    processResult({ type, sessionId, ...data });
  }
}

/**
 * Process a single result from extension
 */
function processResult(result: any): void {
  const { type, sessionId, ...data } = result;

  if (DEBUG_IPC) console.error(`[MCP] processResult: type=${type}, sessionId=${sessionId}`);

  // Handle LLM responses (not tied to browser sessions)
  if (type === 'llm_response') {
    const requestId = data.requestId || sessionId;
    console.error(`[MCP] LLM response received for request: ${requestId}`);
    handleLLMResponse(requestId, {
      content: data.content,
      error: data.error,
      usage: data.usage,
    });
    return;
  }

  // Handle screenshots that might be for pending requests (not real sessions)
  if (type === 'screenshot' && data.data && sessionId) {
    const pending = pendingScreenshots.get(sessionId);
    if (pending) {
      console.error(`[MCP] Screenshot received for pending request: ${sessionId}`);
      clearTimeout(pending.timeout);
      pending.resolve(data.data);
      pendingScreenshots.delete(sessionId);
      return;
    }
  }

  if (!sessionId || !orchestrator.hasSession(sessionId)) {
    console.error(`[MCP] Skipping result: sessionId=${sessionId}, exists=${orchestrator.hasSession(sessionId)}`);
    return;
  }

  const extras = getBrowserExtras(sessionId);
  const currentStep = data.step || data.status || data.message;

  switch (type) {
    case 'task_update':
      if (currentStep) {
        // Update orchestrator with progress
        orchestrator.updateFromBrowserEvent(sessionId, "progress", { step: currentStep });

        // Track in browser extras
        extras.reasoningHistory.push(currentStep);
        if (currentStep !== 'thinking' && !currentStep.startsWith('[thinking]')) {
          extras.stepHistory.push(currentStep);
        }
        // Clear pending messages when we see confirmation they were injected
        if (currentStep.startsWith('[User follow-up]:') && extras.pendingMessages.length > 0) {
          extras.pendingMessages.shift();
        }
      }
      break;

    case 'task_waiting':
      if (currentStep) {
        orchestrator.updateFromBrowserEvent(sessionId, "blocked", {
          questions: [currentStep],
        });
        extras.reasoningHistory.push(`[WAITING] ${currentStep}`);
        extras.stepHistory.push(`[WAITING] ${currentStep}`);
      }
      break;

    case 'task_complete':
      // Get the last step as the answer
      const session = orchestrator.getSession(sessionId);
      const answer = session?.currentStep || currentStep;
      orchestrator.updateFromBrowserEvent(sessionId, "complete", { answer });
      console.error(`[MCP] Session ${sessionId} marked COMPLETE`);
      break;

    case 'task_error':
      orchestrator.updateFromBrowserEvent(sessionId, "error", { error: data.error });
      break;

    case 'screenshot':
      if (data.data) {
        extras.screenshots.push(data.data);
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

/**
 * Send message to native host
 * (Wrapper for NativeHostConnection.send() with logging)
 */
async function sendToNative(message: NativeMessage): Promise<void> {
  console.error(`[MCP] Sending: ${message.type}`);
  await connection.send(message);
}

/**
 * Map orchestrator state to active agent for clarity
 */
function mapStateToAgentPhase(state: SessionState, session: any): string {
  if (state === 'PLANNING') return 'planning_agent';
  if (state === 'EXECUTING' && session?.collectedInfo?._exploring === 'true') return 'explorer_agent';
  if (state === 'EXECUTING') return 'browser_agent';
  if (state === 'COMPLETED') return 'complete';
  if (state === 'FAILED') return 'failed';
  if (state === 'NEEDS_INFO') return 'needs_info';
  if (state === 'BLOCKED') return 'blocked';
  return 'browser_agent';
}

/**
 * Format session for response
 *
 * Combines orchestrator session status with browser-specific extras.
 * Shows which agent is active and what each has done.
 */
function formatSession(sessionId: string): any {
  const status = orchestrator.getStatus(sessionId);
  if (!status) return null;

  const session = orchestrator.getSession(sessionId);
  const extras = browserExtras.get(sessionId);
  const legacyStatus = mapStateToLegacyStatus(status.status);

  const response: any = {
    session_id: sessionId,
    status: legacyStatus,
    // NEW: Show which agent phase we're in
    agent_phase: mapStateToAgentPhase(status.status, session),
    orchestrator_state: status.status,
  };

  // NEW: Agent traces grouped by agent (limited to last 10 each for brevity)
  const TRACE_LIMIT = 10;
  if (session?.executionTrace && session.executionTrace.length > 0) {
    // Planning Agent trace (limited)
    const planningSteps = session.executionTrace
      .filter((t: any) => t.type?.startsWith('planning_agent:'))
      .map((t: any) => ({ type: t.type, description: t.description, timestamp: t.timestamp }))
      .slice(-TRACE_LIMIT);
    if (planningSteps.length > 0) {
      response.planning_agent_trace = planningSteps;
    }

    // Explorer Agent trace (limited)
    const explorerSteps = session.executionTrace
      .filter((t: any) => t.type?.startsWith('explorer_agent:'))
      .map((t: any) => ({ type: t.type, description: t.description, timestamp: t.timestamp }))
      .slice(-TRACE_LIMIT);
    if (explorerSteps.length > 0) {
      response.explorer_agent_trace = explorerSteps;
    }

    // Browser Agent trace (limited) - just count, not full list
    const browserSteps = session.executionTrace
      .filter((t: any) => t.type?.startsWith('browser_agent:') || !t.type?.includes('_agent:'));
    if (browserSteps.length > 0) {
      response.browser_agent_actions = browserSteps.length;
      // Only show last few for context
      response.recent_browser_actions = browserSteps.slice(-5).map((t: any) => t.description);
    }
  }

  // NEW: Show if exploring
  if (session?.collectedInfo?._exploring === 'true') {
    response.exploring = true;
    response.original_task = session.collectedInfo._originalTask;
  }

  // NEW: Show domain and site knowledge status
  if (session?.domain) {
    response.domain = session.domain;
    response.has_site_knowledge = !!session.siteKnowledge;
  }

  // What's happening right now
  if (legacyStatus === 'running' || legacyStatus === 'waiting' || legacyStatus === 'waiting_for_info') {
    response.current_activity = status.currentStep;
  }

  // Step/reasoning counts + recent samples (not full history - too large)
  if (extras && extras.stepHistory.length > 0) {
    response.total_steps = extras.stepHistory.length;
    response.recent_steps = extras.stepHistory.slice(-5);
  }

  // Don't include full reasoning history - it's too verbose
  if (extras && extras.reasoningHistory.length > 0) {
    response.reasoning_count = extras.reasoningHistory.length;
  }

  // Show pending messages if any
  if (extras && extras.pendingMessages.length > 0) {
    response.pending_messages = extras.pendingMessages.length;
  }

  // Questions if waiting for info
  if (status.questions && status.questions.length > 0) {
    response.questions = status.questions;
  }

  // Final answer when complete
  if (legacyStatus === 'complete') {
    response.answer = status.answer || status.currentStep;
  }

  // Error details
  if (legacyStatus === 'error') {
    response.error = status.error;
  }

  return response;
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
        const context = args?.context as string | undefined;

        if (!task?.trim()) {
          return {
            content: [{ type: "text", text: "Error: task cannot be empty" }],
            isError: true
          };
        }

        // Check concurrency limit
        const activeCount = orchestrator.getActiveSessionCount();
        if (activeCount >= MAX_CONCURRENT_SESSIONS) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "max_concurrent_sessions",
                message: `Too many parallel browser agents (${activeCount}/${MAX_CONCURRENT_SESSIONS}). Wait for some to complete or stop them first.`,
                active_sessions: activeCount,
                max_sessions: MAX_CONCURRENT_SESSIONS,
                hint: "Use browser_status to check running tasks, browser_stop to stop some, then retry."
              }, null, 2)
            }],
            isError: true
          };
        }

        // Store context in Mem0 for semantic retrieval (before starting task)
        // We'll get the session ID first, then store
        const result = await orchestrator.startTask({ task, url, context });

        // Store context in Mem0 for semantic retrieval
        if (context && isMemoryAvailable()) {
          await storeContext(result.sessionId, context);
        }

        // Initialize browser extras for this session
        getBrowserExtras(result.sessionId);

        // Get the session for agent traces
        const session = orchestrator.getSession(result.sessionId);

        // Extract planning agent trace
        const planningAgentTrace = session?.executionTrace
          ?.filter((t: any) => t.type?.startsWith('planning_agent:'))
          .map((t: any) => ({ type: t.type, description: t.description })) || [];

        // Extract explorer agent trace
        const explorerAgentTrace = session?.executionTrace
          ?.filter((t: any) => t.type?.startsWith('explorer_agent:'))
          .map((t: any) => ({ type: t.type, description: t.description })) || [];

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              session_id: result.sessionId,
              status: mapStateToLegacyStatus(result.status),
              agent_phase: result.exploring ? 'explorer_agent' : 'browser_agent',
              domain: result.domain,
              has_context: !!context,
              has_site_knowledge: !!session?.siteKnowledge,
              exploring: result.exploring || false,
              planning_agent_trace: planningAgentTrace.length > 0 ? planningAgentTrace : undefined,
              explorer_agent_trace: explorerAgentTrace.length > 0 ? explorerAgentTrace : undefined,
            }, null, 2)
          }]
        };
      }

      case "browser_message": {
        const sessionId = args?.session_id as string;
        const message = args?.message as string;

        if (!sessionId || !orchestrator.hasSession(sessionId)) {
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

        const extras = getBrowserExtras(sessionId);

        // Track this message as pending (for visibility in status)
        extras.pendingMessages.push(message);

        // Send to orchestrator (handles state transitions)
        await orchestrator.sendMessage(sessionId, message);

        // Also send to native host for browser agent
        await sendToNative({
          type: 'mcp_send_message',
          sessionId,
          message
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              session_id: sessionId,
              status: "message_sent",
              message: "Follow-up message sent to the agent",
              pending_messages: extras.pendingMessages.length
            }, null, 2)
          }]
        };
      }

      case "browser_status": {
        const sessionId = args?.session_id as string | undefined;

        if (sessionId) {
          if (!orchestrator.hasSession(sessionId)) {
            return {
              content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
              isError: true
            };
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify(formatSession(sessionId), null, 2)
            }]
          };
        }

        // Return all active sessions
        const allStatuses = orchestrator.getAllStatuses();
        const activeSessions = allStatuses
          .filter(s => !["COMPLETED", "FAILED", "CANCELLED"].includes(s.status))
          .map(s => formatSession(s.sessionId))
          .filter(s => s !== null);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(activeSessions, null, 2)
          }]
        };
      }

      case "browser_stop": {
        const sessionId = args?.session_id as string;
        const shouldRemove = args?.remove === true;

        if (!sessionId || !orchestrator.hasSession(sessionId)) {
          return {
            content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
            isError: true
          };
        }

        await sendToNative({
          type: 'mcp_stop_task',
          sessionId,
          remove: shouldRemove  // Tell extension whether to delete or just pause
        });

        const session = orchestrator.getSession(sessionId);
        const partialResult = session?.answer || session?.currentStep;

        if (shouldRemove) {
          // Delete the session completely
          orchestrator.delete(sessionId);
          browserExtras.delete(sessionId);

          // Clean up Mem0 memories for this session
          if (isMemoryAvailable()) {
            deleteSessionMemories(sessionId).catch(err =>
              console.error(`[MCP] Failed to clean up memories for ${sessionId}:`, err)
            );
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                session_id: sessionId,
                status: "removed",
                message: "Session deleted. Cannot resume.",
                partial_result: partialResult
              }, null, 2)
            }]
          };
        } else {
          // Just pause - can resume later
          orchestrator.cancel(sessionId);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                session_id: sessionId,
                status: "paused",
                message: "Session paused. Use browser_message to resume.",
                partial_result: partialResult
              }, null, 2)
            }]
          };
        }
      }

      case "browser_screenshot": {
        const sessionId = args?.session_id as string | undefined;
        const requestId = sessionId || `screenshot-${Date.now()}`;

        // Create a promise that resolves when screenshot arrives
        const screenshotPromise = new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => {
            pendingScreenshots.delete(requestId);
            resolve(null);
          }, 5000); // 5 second timeout

          pendingScreenshots.set(requestId, { resolve, timeout });
        });

        await sendToNative({
          type: 'mcp_screenshot',
          sessionId: requestId
        });

        const screenshotData = await screenshotPromise;

        if (screenshotData) {
          return {
            content: [
              {
                type: "image",
                data: screenshotData,
                mimeType: "image/png"
              },
              {
                type: "text",
                text: "Screenshot of current browser state"
              }
            ]
          };
        }

        // Fallback: check session screenshots if we have a session
        if (sessionId && orchestrator.hasSession(sessionId)) {
          const extras = browserExtras.get(sessionId);
          if (extras && extras.screenshots.length > 0) {
            const latest = extras.screenshots[extras.screenshots.length - 1];
            return {
              content: [
                {
                  type: "image",
                  data: latest,
                  mimeType: "image/png"
                },
                {
                  type: "text",
                  text: "Screenshot from session cache"
                }
              ]
            };
          }
        }

        return {
          content: [{ type: "text", text: "Screenshot request timed out. The browser may not be responding." }],
          isError: true
        };
      }

      case "browser_debug": {
        // Debug tool to dump internal state
        const allStatuses = orchestrator.getAllStatuses();
        const debugSessions = allStatuses.map(status => {
          const extras = browserExtras.get(status.sessionId);
          return {
            id: status.sessionId,
            orchestratorState: status.status,
            legacyStatus: mapStateToLegacyStatus(status.status),
            task: status.task?.substring(0, 50),
            domain: status.domain,
            stepHistoryLength: extras?.stepHistory.length || 0,
            reasoningHistoryLength: extras?.reasoningHistory.length || 0,
            stepHistory: extras?.stepHistory.slice(-10) || [],
            reasoningHistory: extras?.reasoningHistory.slice(-10) || [],
            pendingMessages: extras?.pendingMessages.length || 0,
            currentStep: status.currentStep,
            answer: status.answer,
            error: status.error,
          };
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              totalSessions: allStatuses.length,
              activeSessions: orchestrator.getActiveSessionCount(),
              relayConnected: connection?.isConnected() ?? false,
              sessions: debugSessions
            }, null, 2)
          }]
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

// Start server
async function main() {
  console.error("[MCP] LLM in Chrome MCP Server starting...");

  // Initialize orchestrator
  orchestrator = getOrchestrator();

  // Set up browser execute callback - this bridges orchestrator to native host
  orchestrator.setBrowserExecuteCallback(async (sessionId, task, url, context, siteKnowledge) => {
    // Combine context with site knowledge for the browser agent
    let fullContext = context || "";
    if (siteKnowledge) {
      fullContext = `${fullContext}\n\n--- Site Knowledge ---\n${siteKnowledge}`;
    }

    await sendToNative({
      type: 'mcp_start_task',
      sessionId,
      task,
      url,
      context: fullContext.trim() || undefined
    });
  });

  console.error("[MCP] Orchestrator initialized");

  try {
    // Initialize WebSocket relay connection (replaces native host)
    connection = new WebSocketClient({
      role: 'mcp',
      autoStartRelay: true,
      onDisconnect: () => console.error("[MCP] Relay connection lost, will reconnect"),
    });
    connection.onMessage(handleNativeMessage);
    await connection.connect();
    console.error("[MCP] Connected to WebSocket relay");

    // Initialize LLM client (routes requests through relay → extension)
    initializeLLMClient(sendToNative);
    console.error("[MCP] LLM client initialized");

    // Initialize MemoryLite (needs LLM client to be ready)
    try {
      await initializeMemory();
      if (isMemoryAvailable()) {
        console.error("[MCP] MemoryLite ready (uses existing LLM infrastructure)");
      } else {
        console.error("[MCP] MemoryLite waiting for LLM client");
      }
    } catch (err) {
      console.error("[MCP] Memory layer initialization failed:", err);
    }

    // No polling needed — WebSocket pushes messages in real-time
  } catch (err) {
    console.error("[MCP] Warning: Could not connect to relay:", err);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Server running");
}

main().catch((error) => {
  console.error("[MCP] Fatal:", error);
  process.exit(1);
});
