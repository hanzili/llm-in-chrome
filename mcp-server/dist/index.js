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
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
const pendingScreenshots = new Map();
const sessions = new Map();
let sessionCounter = 0;
// Native host connection
let nativeHost = null;
let messageBuffer = Buffer.alloc(0);
const TOOLS = [
    {
        name: "browser_start",
        description: `Start a new browser automation task. The agent will autonomously navigate, click, type, and interact with web pages to complete your task.

Returns a session_id for tracking. Use browser_status to monitor progress.

Examples:
- "Fill out the contact form on example.com with my info"
- "Search for 'MCP protocol' on Google and summarize the first 3 results"
- "Log into my account and download the latest invoice"

WHEN TO USE THIS:
Use this when you need to interact with websites through a real browser - especially for:
- Sites requiring login/authentication (the user's browser is already logged in)
- Dynamic web apps that don't have APIs
- Tasks where no CLI tool or other MCP server can help

TASK GUIDELINES:
- Break down complex multi-step tasks. Instead of "research my profile AND find jobs AND apply", do each as a separate task.
- But don't over-specify. If you're unsure whether a detail helps, leave it out and let the agent figure it out.
- For exploration tasks ("find a good job for me"), give the goal and let the agent cook.
- For precise tasks ("fill this form with X"), be specific about what you need.`,
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
        description: `Get the status of browser task(s). Returns current state, steps, reasoning, and answer.

Call without session_id to get status of all active tasks.

Response includes:
- steps: Action summary (what the agent did)
- reasoning: Full agent thinking process
- current_activity: What's happening now
- answer: Final result when complete

Options:
- wait: Block until task completes (with timeout). Great for fire-and-forget tasks.
- timeout_ms: Max wait time when wait=true (default: 2 min)`,
        inputSchema: {
            type: "object",
            properties: {
                session_id: {
                    type: "string",
                    description: "Optional session ID. If omitted, returns all active tasks"
                },
                wait: {
                    type: "boolean",
                    description: "If true, block until task completes or timeout (default: false)"
                },
                timeout_ms: {
                    type: "number",
                    description: "Max time to wait in ms when wait=true (default: 120000 = 2 min)"
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
/**
 * Generate unique session ID
 */
function generateSessionId() {
    sessionCounter++;
    return `browser-${Date.now()}-${sessionCounter}`;
}
/**
 * Find native host path from installed manifest
 */
function findNativeHostPath() {
    const manifestPath = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.llm_in_chrome.oauth_host.json');
    if (fs.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest.path && fs.existsSync(manifest.path)) {
                return manifest.path;
            }
        }
        catch { }
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
function connectToNativeHost() {
    return new Promise((resolve, reject) => {
        try {
            const hostPath = findNativeHostPath();
            console.error(`[MCP] Connecting to: ${hostPath}`);
            const host = spawn(hostPath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            host.stdout?.on('data', (chunk) => {
                messageBuffer = Buffer.concat([messageBuffer, chunk]);
                processNativeMessages();
            });
            host.stderr?.on('data', (data) => {
                console.error(`[Native] ${data.toString().trim()}`);
            });
            host.on('error', reject);
            host.on('close', (code) => {
                console.error(`[MCP] Native host exited: ${code}`);
                nativeHost = null;
            });
            nativeHost = host;
            setTimeout(() => resolve(host), 100);
        }
        catch (err) {
            reject(err);
        }
    });
}
/**
 * Process messages from native host
 */
function processNativeMessages() {
    while (messageBuffer.length >= 4) {
        const msgLen = messageBuffer.readUInt32LE(0);
        if (messageBuffer.length < 4 + msgLen)
            break;
        const msgStr = messageBuffer.subarray(4, 4 + msgLen).toString();
        messageBuffer = messageBuffer.subarray(4 + msgLen);
        try {
            const message = JSON.parse(msgStr);
            handleNativeMessage(message);
        }
        catch (e) {
            console.error('[MCP] Parse error:', e);
        }
    }
}
/**
 * Handle message from native host
 */
function handleNativeMessage(message) {
    const { type, sessionId, results, ...data } = message;
    // LOG EVERYTHING for debugging
    console.error(`[MCP DEBUG] handleNativeMessage called: type=${type}, hasResults=${!!results}, resultsLen=${results?.length || 0}`);
    // Handle batch results from polling
    if (type === 'mcp_results' && Array.isArray(results)) {
        console.error(`[MCP DEBUG] Processing ${results.length} results from poll`);
        for (const result of results) {
            console.error(`[MCP DEBUG] Result: ${JSON.stringify(result).substring(0, 200)}`);
            processResult(result);
        }
        return;
    }
    // Log other message types
    if (type !== 'no_commands' && type !== 'mcp_results') {
        console.error(`[MCP] Native message: ${type}`, sessionId || '');
    }
    // Handle single result
    if (sessionId && sessions.has(sessionId)) {
        processResult({ type, sessionId, ...data });
    }
}
/**
 * Process a single result from extension
 */
function processResult(result) {
    const { type, sessionId, ...data } = result;
    console.error(`[MCP] processResult: type=${type}, sessionId=${sessionId}, activeSessions=${Array.from(sessions.keys()).join(',')}`);
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
    if (!sessionId || !sessions.has(sessionId)) {
        // Log why we're skipping
        console.error(`[MCP] Skipping result: sessionId=${sessionId}, exists=${sessions.has(sessionId)}`);
        return;
    }
    const session = sessions.get(sessionId);
    switch (type) {
        case 'task_update':
            session.status = 'running';
            session.currentStep = data.step || data.status;
            if (session.currentStep) {
                // Always add to reasoning history (full trace)
                session.reasoningHistory.push(session.currentStep);
                // Only add non-thinking steps to stepHistory (action summary)
                if (session.currentStep !== 'thinking' && !session.currentStep.startsWith('[thinking]')) {
                    session.stepHistory.push(session.currentStep);
                }
                // Clear pending messages when we see confirmation they were injected
                if (session.currentStep.startsWith('[User follow-up]:') && session.pendingMessages.length > 0) {
                    session.pendingMessages.shift(); // Remove the oldest pending message
                }
            }
            break;
        case 'task_waiting':
            session.status = 'waiting';
            session.currentStep = data.message;
            if (session.currentStep) {
                session.reasoningHistory.push(`[WAITING] ${session.currentStep}`);
                session.stepHistory.push(`[WAITING] ${session.currentStep}`);
            }
            break;
        case 'task_complete':
            session.status = 'complete';
            session.completedAt = Date.now();
            session.result = data.result;
            // Extract answer from currentStep (where extension puts the final answer)
            session.answer = session.currentStep;
            console.error(`[MCP] Session ${sessionId} marked COMPLETE`);
            break;
        case 'task_error':
            session.status = 'error';
            session.completedAt = Date.now();
            session.error = data.error;
            break;
        case 'screenshot':
            if (data.data) {
                session.screenshots.push(data.data);
                // Check if there's a pending screenshot request for this session
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
 */
async function sendToNative(message) {
    if (!nativeHost?.stdin || !nativeHost.stdin.writable) {
        console.error(`[MCP] Reconnecting to native host (stdin=${!!nativeHost?.stdin}, writable=${nativeHost?.stdin?.writable})`);
        nativeHost = null;
        await connectToNativeHost();
    }
    const json = JSON.stringify(message);
    const buffer = Buffer.from(json);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(buffer.length, 0);
    console.error(`[MCP] Sending: ${message.type} (${json.length} bytes)`);
    try {
        nativeHost.stdin.write(len);
        nativeHost.stdin.write(buffer);
    }
    catch (err) {
        console.error(`[MCP] Write error:`, err);
        nativeHost = null;
        throw err;
    }
}
/**
 * Format session for response
 *
 * Keep it simple - the client needs:
 * - Current activity (what's happening now)
 * - Full step history (to detect wrong paths or loops)
 * - Full reasoning history (agent's thinking process)
 * - Answer when complete
 */
function formatSession(session) {
    const response = {
        session_id: session.id,
        status: session.status,
    };
    // What's happening right now
    if (session.status === 'running' || session.status === 'waiting') {
        response.current_activity = session.currentStep;
    }
    // Full step history - action summary (no thinking markers)
    if (session.stepHistory.length > 0) {
        response.steps = session.stepHistory;
    }
    // Full reasoning history - includes all thinking and actions
    if (session.reasoningHistory.length > 0) {
        response.reasoning = session.reasoningHistory;
    }
    // Show pending messages if any
    if (session.pendingMessages.length > 0) {
        response.pending_messages = session.pendingMessages.length;
    }
    // Final answer when complete
    if (session.status === 'complete') {
        response.answer = session.answer || session.currentStep;
    }
    // Error details
    if (session.status === 'error') {
        response.error = session.error;
    }
    return response;
}
// Create MCP server
const server = new Server({
    name: "llm-in-chrome",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {
            listChanged: false
        }
    }
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "browser_start": {
                const task = args?.task;
                const url = args?.url;
                if (!task?.trim()) {
                    return {
                        content: [{ type: "text", text: "Error: task cannot be empty" }],
                        isError: true
                    };
                }
                const sessionId = generateSessionId();
                const session = {
                    id: sessionId,
                    status: 'starting',
                    task,
                    url,
                    startedAt: Date.now(),
                    stepHistory: [],
                    reasoningHistory: [],
                    screenshots: [],
                    pendingMessages: []
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
                                status: "running"
                            }, null, 2)
                        }]
                };
            }
            case "browser_message": {
                const sessionId = args?.session_id;
                const message = args?.message;
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
                const session = sessions.get(sessionId);
                // Track this message as pending (for visibility in status)
                session.pendingMessages.push(message);
                await sendToNative({
                    type: 'mcp_send_message',
                    sessionId,
                    message
                });
                // If session was running, it stays running
                // If session was complete/stopped, it will be re-activated by the extension
                if (session.status !== 'running') {
                    session.status = 'running';
                }
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                session_id: sessionId,
                                status: "message_sent",
                                message: "Follow-up message sent to the agent",
                                pending_messages: session.pendingMessages.length
                            }, null, 2)
                        }]
                };
            }
            case "browser_status": {
                const sessionId = args?.session_id;
                const shouldWait = args?.wait === true;
                const timeoutMs = args?.timeout_ms || 120000; // 2 min default
                if (sessionId) {
                    if (!sessions.has(sessionId)) {
                        return {
                            content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
                            isError: true
                        };
                    }
                    // If wait=true, poll until task completes or timeout
                    if (shouldWait) {
                        const startTime = Date.now();
                        while (Date.now() - startTime < timeoutMs) {
                            const session = sessions.get(sessionId);
                            if (session.status === 'complete' || session.status === 'error' || session.status === 'stopped') {
                                return {
                                    content: [{
                                            type: "text",
                                            text: JSON.stringify(formatSession(session), null, 2)
                                        }]
                                };
                            }
                            // Wait 500ms before checking again
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                        // Timeout - return current status
                        const session = sessions.get(sessionId);
                        return {
                            content: [{
                                    type: "text",
                                    text: JSON.stringify({
                                        ...formatSession(session),
                                        timeout: true,
                                        message: `Task still running after ${timeoutMs}ms timeout`
                                    }, null, 2)
                                }]
                        };
                    }
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify(formatSession(sessions.get(sessionId)), null, 2)
                            }]
                    };
                }
                // Return all active sessions
                const activeSessions = Array.from(sessions.values())
                    .filter(s => s.status !== 'complete' && s.status !== 'error' && s.status !== 'stopped')
                    .map(s => formatSession(s));
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify(activeSessions, null, 2)
                        }]
                };
            }
            case "browser_stop": {
                const sessionId = args?.session_id;
                const shouldRemove = args?.remove === true;
                if (!sessionId || !sessions.has(sessionId)) {
                    return {
                        content: [{ type: "text", text: `Error: Session not found: ${sessionId}` }],
                        isError: true
                    };
                }
                await sendToNative({
                    type: 'mcp_stop_task',
                    sessionId,
                    remove: shouldRemove // Tell extension whether to delete or just pause
                });
                const session = sessions.get(sessionId);
                const partialResult = session.result || session.currentStep;
                if (shouldRemove) {
                    // Delete the session completely
                    sessions.delete(sessionId);
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
                }
                else {
                    // Just pause - can resume later
                    session.status = 'stopped';
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
                const sessionId = args?.session_id;
                const requestId = sessionId || `screenshot-${Date.now()}`;
                // Create a promise that resolves when screenshot arrives
                const screenshotPromise = new Promise((resolve) => {
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
                if (sessionId && sessions.has(sessionId)) {
                    const session = sessions.get(sessionId);
                    if (session.screenshots.length > 0) {
                        const latest = session.screenshots[session.screenshots.length - 1];
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
                const allSessions = Array.from(sessions.entries()).map(([id, s]) => ({
                    id,
                    status: s.status,
                    task: s.task?.substring(0, 50),
                    stepHistoryLength: s.stepHistory.length,
                    reasoningHistoryLength: s.reasoningHistory?.length || 0,
                    stepHistory: s.stepHistory.slice(-10), // Last 10 steps
                    reasoningHistory: s.reasoningHistory?.slice(-10), // Last 10 reasoning entries
                    pendingMessages: s.pendingMessages?.length || 0,
                    currentStep: s.currentStep,
                    answer: s.answer,
                    error: s.error,
                    startedAt: s.startedAt,
                    completedAt: s.completedAt,
                }));
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                totalSessions: sessions.size,
                                nativeHostConnected: !!nativeHost?.stdin,
                                sessions: allSessions
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
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
});
/**
 * Poll for results from extension via native host
 */
async function pollForResults() {
    if (!nativeHost?.stdin)
        return;
    try {
        sendToNative({ type: 'mcp_poll_results' });
    }
    catch (err) {
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
    }
    catch (err) {
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
