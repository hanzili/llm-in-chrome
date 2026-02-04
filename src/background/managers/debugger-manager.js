/**
 * Debugger Manager
 * Handles Chrome DevTools Protocol debugger attachment and commands
 */

import { LIMITS } from '../modules/constants.js';

// Debugger state - now tracks multiple tabs for parallel execution
const attachedTabs = new Set(); // Set of tab IDs with debugger attached
const networkEnabledTabs = new Set(); // Tabs with network tracking enabled
const targetDiscoveryEnabled = new Set(); // Tabs with target discovery enabled
let debuggerListenerRegistered = false;

// Popup tracking: maps popup tabId -> opener tabId
const popupOpeners = new Map();

// Shared state references (will be initialized)
let consoleMessages = [];
let networkRequests = [];
let capturedCaptchaData = null;
let logFn = null;

// Callbacks for popup events (set by service worker)
let onPopupOpened = null;  // (popupTabId, openerTabId) => void
let onPopupClosed = null;  // (popupTabId, openerTabId) => void

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
 * Set callbacks for popup events
 * @param {Object} callbacks - Popup event callbacks
 * @param {Function} callbacks.onOpened - Called when popup opens: (popupTabId, openerTabId) => void
 * @param {Function} callbacks.onClosed - Called when popup closes: (popupTabId, openerTabId) => void
 */
export function setPopupCallbacks(callbacks) {
  onPopupOpened = callbacks.onOpened;
  onPopupClosed = callbacks.onClosed;
}

/**
 * Register debugger event listeners
 */
function registerDebuggerListener() {
  if (debuggerListenerRegistered) return;
  debuggerListenerRegistered = true;

  // Handle debugger detachment (tab closed, navigated, or user detached)
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (attachedTabs.has(source.tabId)) {
      console.log(`[DEBUGGER] Detached from tab ${source.tabId}: ${reason}`);
      attachedTabs.delete(source.tabId);
      networkEnabledTabs.delete(source.tabId);
    }
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    // Ignore events from tabs we're not attached to
    if (!attachedTabs.has(source.tabId)) return;

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

    // ============================================
    // POPUP/WINDOW TRACKING via CDP Target domain
    // ============================================

    if (method === 'Target.targetCreated') {
      const { targetInfo } = params;
      console.log(`[POPUP] Target created:`, targetInfo.type, targetInfo.targetId, 'opener:', targetInfo.openerId);

      // Only track page targets (not workers, iframes, etc.)
      if (targetInfo.type === 'page' && targetInfo.openerId) {
        // Find which of our attached tabs is the opener
        // The openerId is a targetId, we need to map it to a tabId
        (async () => {
          try {
            // Get all targets to find the opener's tabId
            const targets = await new Promise(resolve => {
              chrome.debugger.getTargets(resolve);
            });

            const openerTarget = targets.find(t => t.id === targetInfo.openerId);
            if (openerTarget && openerTarget.tabId && attachedTabs.has(openerTarget.tabId)) {
              // Find the new popup's tabId
              const popupTarget = targets.find(t => t.id === targetInfo.targetId);
              if (popupTarget && popupTarget.tabId) {
                console.log(`[POPUP] Popup ${popupTarget.tabId} opened by our tab ${openerTarget.tabId}`);

                // Track the relationship
                popupOpeners.set(popupTarget.tabId, openerTarget.tabId);

                // Notify service worker
                if (onPopupOpened) {
                  onPopupOpened(popupTarget.tabId, openerTarget.tabId);
                }
              }
            }
          } catch (e) {
            console.warn('[POPUP] Error processing targetCreated:', e.message);
          }
        })();
      }
    }

    if (method === 'Target.targetDestroyed') {
      const { targetId } = params;
      console.log(`[POPUP] Target destroyed:`, targetId);

      // Check if this was a tracked popup
      (async () => {
        try {
          const targets = await new Promise(resolve => {
            chrome.debugger.getTargets(resolve);
          });

          // Find if any of our tracked popups match this targetId
          for (const [popupTabId, openerTabId] of popupOpeners.entries()) {
            const popupTarget = targets.find(t => t.tabId === popupTabId);
            if (!popupTarget || popupTarget.id === targetId) {
              // This popup was closed
              console.log(`[POPUP] Popup ${popupTabId} (from opener ${openerTabId}) closed`);
              popupOpeners.delete(popupTabId);

              if (onPopupClosed) {
                onPopupClosed(popupTabId, openerTabId);
              }
              break;
            }
          }
        } catch (e) {
          console.warn('[POPUP] Error processing targetDestroyed:', e.message);
        }
      })();
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
    attachedTabs.add(tabId);
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
      // Enable Network to capture CAPTCHA responses
      if (!networkEnabledTabs.has(tabId)) {
        await chrome.debugger.sendCommand({ tabId }, 'Network.enable', { maxPostDataSize: 65536 });
        networkEnabledTabs.add(tabId);
      }
    } catch (e) {
      // Tab may have navigated, debugger may need reattachment
    }
    return true;
  }

  try {
    // For parallel execution: attach to this tab WITHOUT detaching from others
    // Chrome allows multiple debugger attachments to different tabs
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    // Enable Network to capture CAPTCHA responses
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable', { maxPostDataSize: 65536 });
    networkEnabledTabs.add(tabId);

    // Enable Target discovery to track popups/new windows
    if (!targetDiscoveryEnabled.has(tabId)) {
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Target.setDiscoverTargets', { discover: true });
        targetDiscoveryEnabled.add(tabId);
        console.log(`[DEBUGGER] Target discovery enabled for tab ${tabId}`);
      } catch (e) {
        // Some Chrome versions may not support this, continue anyway
        console.warn(`[DEBUGGER] Target discovery not available: ${e.message}`);
      }
    }

    attachedTabs.add(tabId);
    await logFn('DEBUGGER', 'Attached to tab', { tabId, totalAttached: attachedTabs.size });
    return true;
  } catch (err) {
    attachedTabs.delete(tabId);
    await logFn('ERROR', `Failed to attach debugger: ${err.message}`);
    return false;
  }
}

/**
 * Detach debugger from a specific tab or all tabs
 * @param {number} [tabId] - Optional tab ID to detach. If not provided, detaches from all tabs.
 * @returns {Promise<void>}
 */
export async function detachDebugger(tabId = null) {
  if (tabId !== null) {
    // Detach from specific tab
    if (!attachedTabs.has(tabId)) return;
    try {
      await chrome.debugger.detach({ tabId });
    } catch (err) {
      console.warn('[Debugger] Failed to detach debugger from tab', tabId, err);
    }
    attachedTabs.delete(tabId);
    networkEnabledTabs.delete(tabId);
    targetDiscoveryEnabled.delete(tabId);
    // Clean up any popup relationships involving this tab
    popupOpeners.delete(tabId);
    for (const [popupId, openerId] of popupOpeners.entries()) {
      if (openerId === tabId) popupOpeners.delete(popupId);
    }
  } else {
    // Detach from all tabs (legacy behavior for UI tasks)
    for (const attachedTabId of attachedTabs) {
      try {
        await chrome.debugger.detach({ tabId: attachedTabId });
      } catch (err) {
        console.warn('[Debugger] Failed to detach debugger from tab', attachedTabId, err);
      }
    }
    attachedTabs.clear();
    networkEnabledTabs.clear();
    targetDiscoveryEnabled.clear();
    popupOpeners.clear();
  }
}

/**
 * Get the opener tab for a popup
 * @param {number} popupTabId - The popup's tab ID
 * @returns {number|null} The opener's tab ID, or null if not a tracked popup
 */
export function getPopupOpener(popupTabId) {
  return popupOpeners.get(popupTabId) || null;
}

/**
 * Check if a tab is a tracked popup
 * @param {number} tabId - Tab ID to check
 * @returns {boolean} True if this is a tracked popup
 */
export function isTrackedPopup(tabId) {
  return popupOpeners.has(tabId);
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
      attachedTabs.delete(tabId);
      networkEnabledTabs.delete(tabId);

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
 * Get network tracking state for a tab
 * @param {number} [tabId] - Tab ID to check (if not provided, returns true if any tab has tracking)
 * @returns {boolean} True if network tracking is enabled
 */
export function isNetworkTrackingEnabled(tabId = null) {
  if (tabId !== null) {
    return networkEnabledTabs.has(tabId);
  }
  return networkEnabledTabs.size > 0;
}

/**
 * Enable network tracking for a tab
 * @param {number} tabId - Tab ID to enable network tracking for
 * @returns {Promise<void>}
 */
export async function enableNetworkTracking(tabId) {
  if (!networkEnabledTabs.has(tabId)) {
    await sendDebuggerCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
    networkEnabledTabs.add(tabId);
  }
}
