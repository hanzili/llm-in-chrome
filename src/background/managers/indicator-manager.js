/**
 * Indicator Manager
 * Handles visual agent indicators on tabs
 *
 * Manages visual indicators during tool execution
 * with CDPHelper which calls K.hideIndicatorForToolUse() and K.restoreIndicatorAfterToolUse()
 */

let indicatorTabId = null;

/**
 * Show the pulsing glow indicator on a tab
 * @param {number} tabId - Tab ID to show indicators on
 * @returns {Promise<void>}
 */
async function showAgentIndicators(tabId) {
  indicatorTabId = tabId;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_AGENT_INDICATORS' });
  } catch (e) {
    // Tab might not have content script loaded
  }
}

/**
 * Hide the pulsing glow indicator
 * @param {number} [tabId] - Tab ID to hide indicators on (uses last indicator tab if omitted)
 * @returns {Promise<void>}
 */
async function hideAgentIndicators(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId || indicatorTabId, { type: 'HIDE_AGENT_INDICATORS' });
  } catch (e) {
    // Ignore - tab might not have content script
  }
  indicatorTabId = null;
}

/**
 * Temporarily hide indicators for tool use (screenshots, clicks, etc.)
 * Called by CDPHelper before capturing screenshots or performing clicks
 *
 * Hide indicator before tool use
 *
 * @param {number} tabId - Tab ID to hide indicators on
 * @returns {Promise<void>}
 */
async function hideIndicatorForToolUse(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'HIDE_FOR_TOOL_USE' });
  } catch (e) {
    // Ignore - tab might not have content script
  }
}

/**
 * Restore indicators after tool use
 * Called by CDPHelper after capturing screenshots or performing clicks
 *
 * Restore indicator after tool use
 *
 * @param {number} tabId - Tab ID to restore indicators on
 * @returns {Promise<void>}
 */
async function restoreIndicatorAfterToolUse(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_AFTER_TOOL_USE' });
  } catch (e) {
    // Ignore - tab might not have content script
  }
}

/**
 * Get the effective tab ID, validating it's in the same group
 * Get effective tab ID
 *
 * @param {number|undefined} providedTabId - Tab ID provided by tool input
 * @param {number} defaultTabId - Default tab ID to use
 * @returns {Promise<number>} The effective tab ID
 */
async function getEffectiveTabId(providedTabId, defaultTabId) {
  if (providedTabId === undefined) {
    return defaultTabId;
  }
  // For now, just return the provided tab ID
  // Full implementation would validate it's in the same tab group
  return providedTabId;
}

// Export as object
export const indicatorManager = {
  showAgentIndicators,
  hideAgentIndicators,
  hideIndicatorForToolUse,
  restoreIndicatorAfterToolUse,
  getEffectiveTabId,
};

// Also export individual functions for backwards compatibility
export {
  showAgentIndicators,
  hideAgentIndicators,
  hideIndicatorForToolUse,
  restoreIndicatorAfterToolUse,
  getEffectiveTabId,
};

// Aliases for old names used by service-worker.js
export const hideIndicatorsForToolUse = hideIndicatorForToolUse;
export const showIndicatorsAfterToolUse = restoreIndicatorAfterToolUse;
