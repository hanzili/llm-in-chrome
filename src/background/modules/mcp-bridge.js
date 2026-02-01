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

const NATIVE_HOST_NAME = 'com.llm_in_chrome.oauth_host';
const POLL_INTERVAL_MS = 500;

let pollInterval = null;
let isPolling = false;

// Active MCP sessions
const mcpSessions = new Map();

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
        mcpSessions.set(command.sessionId, { status: 'starting' });
        debugLog('mcpSessions now has', Array.from(mcpSessions.keys()));
        onStartTask(command.sessionId, command.task, command.url);
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
