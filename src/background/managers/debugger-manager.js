/**
 * Debugger Manager
 * Handles Chrome DevTools Protocol debugger attachment and commands
 */

import { LIMITS } from '../modules/constants.js';

// Debugger state
let debuggerAttached = false;
let debuggerTabId = null;
let debuggerListenerRegistered = false;
let networkTrackingEnabled = false;

// Shared state references (will be initialized)
let consoleMessages = [];
let networkRequests = [];
let capturedCaptchaData = null;
let logFn = null;

/**
 * @typedef {Object} DebuggerDeps
 * @property {Array<Object>} consoleMessages - Shared array for console messages
 * @property {Array<Object>} networkRequests - Shared array for network requests
 * @property {Map<number, Object>} capturedCaptchaData - Map of tab IDs to CAPTCHA data
 * @property {Function} log - Logging function
 */

/**
 * Initialize debugger manager with shared state references
 * @param {DebuggerDeps} deps - Dependency injection object
 */
export function initDebugger(deps) {
  consoleMessages = deps.consoleMessages;
  networkRequests = deps.networkRequests;
  capturedCaptchaData = deps.capturedCaptchaData;
  logFn = deps.log;
}

/**
 * Register debugger event listeners
 */
function registerDebuggerListener() {
  if (debuggerListenerRegistered) return;
  debuggerListenerRegistered = true;

  // Handle debugger detachment (tab closed, navigated, or user detached)
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === debuggerTabId) {
      console.log(`[DEBUGGER] Detached from tab ${source.tabId}: ${reason}`);
      debuggerAttached = false;
      debuggerTabId = null;
      networkTrackingEnabled = false;
    }
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    // Ignore events from tabs we're not attached to
    if (source.tabId !== debuggerTabId || !debuggerAttached) return;

    if (method === 'Runtime.consoleAPICalled') {
      const msg = {
        type: params.type,
        text: params.args.map(arg => arg.value || arg.description || '').join(' '),
        timestamp: Date.now(),
      };
      consoleMessages.push(msg);
      if (consoleMessages.length > LIMITS.CONSOLE_MESSAGES) {
        consoleMessages.splice(0, consoleMessages.length - LIMITS.CONSOLE_MESSAGES);
      }
    }

    if (method === 'Network.requestWillBeSent') {
      const request = {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        timestamp: Date.now(),
      };
      networkRequests.push(request);
      if (networkRequests.length > LIMITS.NETWORK_REQUESTS) {
        networkRequests.splice(0, networkRequests.length - LIMITS.NETWORK_REQUESTS);
      }
    }

    if (method === 'Network.responseReceived') {
      const req = networkRequests.find(r => r.requestId === params.requestId);
      if (req) {
        req.status = params.response.status;
        req.responseUrl = params.response.url;
      }
    }

    // Capture response body when loading finishes (body is now available)
    if (method === 'Network.loadingFinished') {
      const req = networkRequests.find(r => r.requestId === params.requestId);
      if (req && req.responseUrl && req.responseUrl.includes('/captcha/challenge')) {
        (async () => {
          try {
            const result = await chrome.debugger.sendCommand(
              { tabId: source.tabId },
              'Network.getResponseBody',
              { requestId: params.requestId }
            );
            if (result && result.body) {
              const data = JSON.parse(result.body);
              capturedCaptchaData.set(source.tabId, {
                imageUrls: data.images.map(img => img.url),
                encryptedAnswer: data.encrypted_answer,
                timestamp: Date.now(),
                challengeType: new URL(req.responseUrl).searchParams.get('challenge_type')
              });
              console.log('[CAPTCHA] Captured challenge for tab', source.tabId);
            }
          } catch (e) {
            console.log('[CAPTCHA] Failed to capture response:', e.message);
          }
        })();
      }
    }

    if (method === 'Network.loadingFailed') {
      const req = networkRequests.find(r => r.requestId === params.requestId);
      if (req) {
        req.status = 0;
        req.error = params.errorText;
      }
    }
  });
}

/**
 * Check if debugger is attached to a tab
 */
async function isDebuggerAttached(tabId) {
  return new Promise(resolve => {
    chrome.debugger.getTargets(targets => {
      const target = targets.find(t => t.tabId === tabId);
      resolve(target?.attached ?? false);
    });
  });
}

/**
 * Ensure debugger is attached to a tab
 * @param {number} tabId - Tab ID to attach debugger to
 * @returns {Promise<boolean>} True if debugger attached successfully, false otherwise
 */
export async function ensureDebugger(tabId) {
  registerDebuggerListener();

  // Verify tab exists before attempting to attach
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.id) {
      await logFn('DEBUGGER', 'Tab does not exist', { tabId });
      return false;
    }
  } catch (e) {
    await logFn('DEBUGGER', 'Tab not accessible', { tabId, error: e.message });
    return false;
  }

  const alreadyAttached = await isDebuggerAttached(tabId);
  if (alreadyAttached) {
    debuggerAttached = true;
    debuggerTabId = tabId;
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
      // Enable Network to capture CAPTCHA responses
      if (!networkTrackingEnabled) {
        await chrome.debugger.sendCommand({ tabId }, 'Network.enable', { maxPostDataSize: 65536 });
        networkTrackingEnabled = true;
      }
    } catch (e) {
      // Tab may have navigated, debugger may need reattachment
    }
    return true;
  }

  try {
    // Detach from previous tab if attached to a different one
    if (debuggerTabId && debuggerTabId !== tabId && debuggerAttached) {
      try {
        await chrome.debugger.detach({ tabId: debuggerTabId });
      } catch (e) {
        // Already detached, that's fine
      }
      debuggerAttached = false;
      debuggerTabId = null;
    }

    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    // Enable Network to capture CAPTCHA responses
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable', { maxPostDataSize: 65536 });
    networkTrackingEnabled = true;

    debuggerAttached = true;
    debuggerTabId = tabId;
    await logFn('DEBUGGER', 'Attached to tab', { tabId });
    return true;
  } catch (err) {
    debuggerAttached = false;
    debuggerTabId = null;
    await logFn('ERROR', `Failed to attach debugger: ${err.message}`);
    return false;
  }
}

/**
 * Detach debugger from current tab
 * @returns {Promise<void>}
 */
export async function detachDebugger() {
  if (!debuggerAttached) return;
  try {
    await chrome.debugger.detach({ tabId: debuggerTabId });
  } catch (err) {
    console.warn('[Debugger] Failed to detach debugger:', err);
  }
  debuggerAttached = false;
  debuggerTabId = null;
}

/**
 * Send a debugger command with auto-reattachment
 * @param {number} tabId - Tab ID to send command to
 * @param {string} method - CDP method name (e.g., 'Page.captureScreenshot')
 * @param {Object} [params] - CDP method parameters
 * @returns {Promise<*>} CDP command result
 * @throws {Error} If command fails or reattachment fails
 */
export async function sendDebuggerCommand(tabId, method, params = {}) {
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (err) {
    const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();

    // If debugger is not attached, reattach and retry
    if (errMsg.includes('not attached') || errMsg.includes('detached')) {
      debuggerAttached = false;
      debuggerTabId = null;

      const attached = await ensureDebugger(tabId);
      if (!attached) {
        throw new Error('Failed to reattach debugger');
      }

      // Retry the command after reattachment
      return await chrome.debugger.sendCommand({ tabId }, method, params);
    }

    throw err;
  }
}

/**
 * Get network tracking state
 * @returns {boolean} True if network tracking is enabled
 */
export function isNetworkTrackingEnabled() {
  return networkTrackingEnabled;
}

/**
 * Enable network tracking
 * @param {number} tabId - Tab ID to enable network tracking for
 * @returns {Promise<void>}
 */
export async function enableNetworkTracking(tabId) {
  if (!networkTrackingEnabled) {
    await sendDebuggerCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
    networkTrackingEnabled = true;
  }
}
