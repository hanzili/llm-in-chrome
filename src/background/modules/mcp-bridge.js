/**
 * MCP Bridge Module
 *
 * Enables communication between MCP server and the Chrome extension
 * via native host file-based IPC.
 *
 * Flow:
 * 1. MCP server writes commands to inbox via native host
 * 2. Extension polls inbox and executes commands
 * 3. Extension writes results to outbox via native host
 * 4. MCP server polls outbox for results
 */

import { callLLMSimpleViaCodex, loadConfig } from './api.js';

const NATIVE_HOST_NAME = 'com.llm_in_chrome.oauth_host';
const POLL_INTERVAL_MS = 500;

let pollInterval = null;
let isPolling = false;

// Active MCP sessions
const mcpSessions = new Map();

// Pending get_info requests (waiting for MCP server response)
// Map<requestId, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>
const pendingGetInfoRequests = new Map();
let getInfoRequestCounter = 0;

// Callbacks for MCP events
let onStartTask = null;
let onSendMessage = null;
let onStopTask = null;
let onScreenshot = null;

/**
 * Initialize MCP bridge with callbacks
 */
export function initMcpBridge(callbacks) {
  onStartTask = callbacks.onStartTask;
  onSendMessage = callbacks.onSendMessage;
  onStopTask = callbacks.onStopTask;
  onScreenshot = callbacks.onScreenshot;

  console.log('[MCP Bridge] Initialized');
}

/**
 * Start polling for MCP commands
 */
export function startMcpPolling() {
  if (pollInterval) return;

  console.log('[MCP Bridge] Starting polling');
  pollInterval = setInterval(pollForCommands, POLL_INTERVAL_MS);
}

/**
 * Stop polling
 */
export function stopMcpPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  console.log('[MCP Bridge] Stopped polling');
}

/**
 * Poll native host for MCP commands
 */
async function pollForCommands() {
  if (isPolling) return;
  isPolling = true;

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        port.disconnect();
        resolve(null);
      }, 1000);

      port.onMessage.addListener((message) => {
        clearTimeout(timeout);
        port.disconnect();
        resolve(message);
      });

      port.onDisconnect.addListener(() => {
        clearTimeout(timeout);
        resolve(null);
      });

      port.postMessage({ type: 'poll_mcp_inbox' });
    });

    if (result?.type === 'mcp_commands' && result.commands?.length > 0) {
      for (const cmd of result.commands) {
        await handleMcpCommand(cmd);
      }
    }
  } catch (e) {
    // Silent fail - native host might not be available
  } finally {
    isPolling = false;
  }
}

/**
 * Handle an MCP command from the inbox
 */
async function handleMcpCommand(command) {
  console.log('[MCP Bridge] Received command:', command.type, command.sessionId);

  switch (command.type) {
    case 'start_task':
      if (onStartTask) {
        debugLog('Adding session to mcpSessions', command.sessionId);
        mcpSessions.set(command.sessionId, { status: 'starting', context: command.context });
        debugLog('mcpSessions now has', Array.from(mcpSessions.keys()));
        onStartTask(command.sessionId, command.task, command.url, command.context);
      }
      break;

    case 'send_message':
      // Allow send_message even if session is complete/error (for continuation)
      // The service worker will validate if the session actually exists
      if (onSendMessage) {
        onSendMessage(command.sessionId, command.message);
      }
      break;

    case 'stop_task':
      if (onStopTask && mcpSessions.has(command.sessionId)) {
        const shouldRemove = command.remove === true;
        onStopTask(command.sessionId, shouldRemove);
        // Only delete from bridge if removing completely
        if (shouldRemove) {
          mcpSessions.delete(command.sessionId);
        }
      }
      break;

    case 'screenshot':
      if (onScreenshot) {
        onScreenshot(command.sessionId);
      }
      break;

    case 'get_info_response':
      // Response from MCP server for a get_info request
      const pending = pendingGetInfoRequests.get(command.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(command.response);
        pendingGetInfoRequests.delete(command.requestId);
        debugLog('get_info response received', { requestId: command.requestId, response: command.response?.substring(0, 100) });
      } else {
        debugLog('get_info response for unknown request', command.requestId);
      }
      break;

    case 'llm_request':
      // MCP server requesting LLM completion
      debugLog('llm_request received', { requestId: command.requestId, prompt: command.prompt?.substring(0, 50) });
      handleLLMRequest(command);
      break;
  }
}

// Debug logging - writes to native host which saves to file
function debugLog(msg, data = null) {
  const entry = { time: new Date().toISOString(), msg, data };
  console.log('[MCP Debug]', msg, data || '');
  // Send to native host to write to debug log file
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    port.postMessage({ type: 'debug_log', entry });
    setTimeout(() => port.disconnect(), 50);
  } catch (_e) { /* Silent fail - native host may not be available */ }
}

/**
 * Send task update to MCP server
 */
export function sendMcpUpdate(sessionId, status, step) {
  debugLog('sendMcpUpdate called', { sessionId, status, step: step?.substring?.(0, 50), hasSes: mcpSessions.has(sessionId), sessions: Array.from(mcpSessions.keys()) });

  if (!mcpSessions.has(sessionId)) {
    debugLog('Session not found, skipping update');
    return;
  }

  mcpSessions.get(sessionId).status = status;

  sendToNativeHost({
    type: 'mcp_task_update',
    sessionId,
    status,
    step,
  });
  debugLog('Update sent to native host');
}

/**
 * Send task completion to MCP server
 * Note: Session is NOT deleted - allows continuation via send_message
 */
export function sendMcpComplete(sessionId, result) {
  if (mcpSessions.has(sessionId)) {
    mcpSessions.get(sessionId).status = 'complete';
  }

  sendToNativeHost({
    type: 'mcp_task_complete',
    sessionId,
    result,
  });
}

/**
 * Send task error to MCP server
 * Note: Session is NOT deleted - allows retry via send_message
 */
export function sendMcpError(sessionId, error) {
  if (mcpSessions.has(sessionId)) {
    mcpSessions.get(sessionId).status = 'error';
  }

  sendToNativeHost({
    type: 'mcp_task_error',
    sessionId,
    error,
  });
}

/**
 * Send screenshot to MCP server
 */
export function sendMcpScreenshot(sessionId, data) {
  sendToNativeHost({
    type: 'mcp_screenshot_result',
    sessionId,
    data,
  });
}

/**
 * Query Mem0 for information via MCP server
 * This is used by the get_info tool to retrieve semantically relevant memories
 *
 * @param {string} sessionId - Session ID to search within
 * @param {string} query - Natural language query
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise<string>} Response from Mem0 search
 */
export function queryMemory(sessionId, query, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const requestId = `get_info_${Date.now()}_${++getInfoRequestCounter}`;

    // Set up timeout
    const timeout = setTimeout(() => {
      pendingGetInfoRequests.delete(requestId);
      // Don't reject on timeout, just return a helpful message
      resolve(`Information lookup timed out. The query "${query}" could not be processed. You can:
1. Skip this field if it's optional
2. Use a reasonable default
3. Mention in your response that you couldn't retrieve this information`);
    }, timeoutMs);

    // Store the pending request
    pendingGetInfoRequests.set(requestId, { resolve, reject, timeout });

    // Send request to MCP server via native host
    sendToNativeHost({
      type: 'mcp_get_info',
      sessionId,
      query,
      requestId,
    });

    debugLog('get_info request sent', { sessionId, query, requestId });
  });
}

/**
 * Handle LLM request from MCP server
 * Uses Codex (ChatGPT Pro/Plus) via native host proxy
 * Reads credentials from ~/.codex/auth.json
 * (Planning Agent, Explorer Agent don't need browser tools)
 */
async function handleLLMRequest(command) {
  const { requestId, prompt, systemPrompt, maxTokens, modelTier } = command;

  try {
    // Ensure config is loaded
    await loadConfig();

    // Build messages array - just the user prompt
    // System prompt goes to Codex "instructions" field
    const messages = [{ role: 'user', content: prompt }];

    // Use Codex (ChatGPT Pro/Plus) for LLM calls
    // modelTier: 'fast' → gpt-5.1-mini, 'smart' → gpt-5.1-codex, 'powerful' → gpt-5.1-codex-max
    debugLog('llm_request calling Codex', { requestId, messageCount: messages.length, modelTier: modelTier || 'smart' });

    const result = await callLLMSimpleViaCodex(messages, maxTokens || 2000, modelTier || 'smart', systemPrompt);

    // Extract text content from response
    const content = result.content?.find(b => b.type === 'text')?.text || '';

    // Send response back to MCP server
    sendToNativeHost({
      type: 'mcp_llm_response',
      requestId,
      content,
      usage: result.usage,
    });

    debugLog('llm_request completed (Codex)', { requestId, contentLength: content.length, modelTier: modelTier || 'smart' });
  } catch (error) {
    console.error('[MCP Bridge] Codex LLM request failed:', error);

    // Send error response
    sendToNativeHost({
      type: 'mcp_llm_response',
      requestId,
      error: error.message || 'Codex LLM request failed',
    });

    debugLog('llm_request failed', { requestId, error: error.message });
  }
}

/**
 * Get MCP session data (including context)
 */
export function getMcpSession(sessionId) {
  return mcpSessions.get(sessionId);
}

/**
 * Send message to native host (fire and forget)
 */
function sendToNativeHost(message) {
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    port.postMessage(message);
    setTimeout(() => port.disconnect(), 100);
  } catch (e) {
    console.error('[MCP Bridge] Send error:', e);
  }
}

/**
 * Check if a session is an MCP session
 */
export function isMcpSession(sessionId) {
  return mcpSessions.has(sessionId);
}

/**
 * Get all active MCP sessions
 */
export function getMcpSessions() {
  return Array.from(mcpSessions.keys());
}
