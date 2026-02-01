/**
 * Tabs tool handlers
 * Handles: tabs_context, tabs_create, tabs_close
 */

import { clearPosition } from '../modules/mouse-movement.js';

/**
 * @typedef {Object} TabsToolDeps
 * @property {number|null} sessionTabGroupId - ID of the current agent session tab group
 * @property {Set<number>} agentOpenedTabs - Set of tab IDs opened by agent actions
 * @property {Function} isAnySessionActive - Function that returns true if any session is active
 * @property {Function} addTabToGroup - Add tab to agent session group
 */

/**
 * Check if a URL is restricted (Chrome blocks extension access)
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is restricted
 */
function isRestrictedUrl(url) {
  if (!url) return false;
  const restrictedProtocols = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'];
  return restrictedProtocols.some(protocol => url.startsWith(protocol));
}

/**
 * Handle tabs_context tool - list all tabs managed by the agent
 * @param {Object} toolInput - Tool input parameters (currently unused)
 * @param {TabsToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} JSON string with available tabs, group ID, and note
 */
export async function handleTabsContext(toolInput, deps) {
  const { sessionTabGroupId, agentOpenedTabs, isAnySessionActive } = deps;
  let tabs = [];
  const existingTabIds = new Set();

  // 1. Get tabs in our group across ALL windows
  if (sessionTabGroupId !== null) {
    const groupTabs = await chrome.tabs.query({ groupId: sessionTabGroupId });
    for (const tab of groupTabs) {
      // Skip restricted pages - Chrome blocks extension access
      if (!isRestrictedUrl(tab.url)) {
        tabs.push(tab);
        existingTabIds.add(tab.id);
      }
    }
  }

  // 2. Add tabs opened by agent actions (popups, new windows from clicks)
  for (const tabId of agentOpenedTabs) {
    if (!existingTabIds.has(tabId)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        // Skip restricted pages - Chrome blocks extension access
        if (tab && !isRestrictedUrl(tab.url)) {
          tabs.push(tab);
          existingTabIds.add(tab.id);
        }
      } catch (e) {
        // Tab was closed, remove from tracking
        agentOpenedTabs.delete(tabId);
      }
    }
  }

  // 3. FALLBACK: Scan popup windows AND new normal windows during active session
  // This catches popups/windows that weren't detected by listeners (payment flows, OAuth, etc.)
  if (isAnySessionActive()) {
    try {
      // Get the main window ID (where the original tab group is)
      let mainWindowId = null;
      if (sessionTabGroupId !== null && tabs.length > 0) {
        mainWindowId = tabs[0].windowId;
      }

      // Scan all windows (popup and normal)
      const allWindows = await chrome.windows.getAll({ populate: false });
      for (const window of allWindows) {
        // Skip the main window (already got tabs from group)
        if (mainWindowId && window.id === mainWindowId) continue;

        const windowTabs = await chrome.tabs.query({ windowId: window.id });
        for (const tab of windowTabs) {
          // Skip restricted pages - Chrome blocks extension access
          if (!existingTabIds.has(tab.id) && !isRestrictedUrl(tab.url)) {
            tabs.push(tab);
            existingTabIds.add(tab.id);
            // Also add to tracking for future reference
            agentOpenedTabs.add(tab.id);
            const windowType = window.type || 'normal';
            console.log(`[TABS_CONTEXT] Found untracked ${windowType} window tab: ${tab.id} - ${tab.url}`);
          }
        }
      }
    } catch (e) {
      console.log(`[TABS_CONTEXT] Error scanning windows: ${e.message}`);
    }
  }

  // 4. If still no tabs, return active tab (if not restricted)
  if (tabs.length === 0) {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    // Only include if not a restricted page
    tabs = activeTabs.filter(tab => !isRestrictedUrl(tab.url));
  }

  const tabInfo = tabs.map(t => ({
    tabId: t.id,
    url: t.url,
    title: t.title,
    active: t.active,
    groupId: t.groupId,
    openedByAgent: agentOpenedTabs.has(t.id),
  }));

  return JSON.stringify({
    availableTabs: tabInfo,
    groupId: sessionTabGroupId,
    note: 'Showing tabs in Agent group, agent-opened tabs, and popup windows. Chrome system pages (chrome://, about:) are filtered out as they cannot be accessed by extensions.'
  }, null, 2);
}

/**
 * Handle tabs_create tool - create a new tab and add it to agent group
 * @param {Object} toolInput - Tool input parameters (currently unused)
 * @param {TabsToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Success message with new tab ID
 */
export async function handleTabsCreate(toolInput, deps) {
  const { addTabToGroup, sessionTabGroupId } = deps;
  const newTab = await chrome.tabs.create({ url: 'chrome://newtab' });
  // Add to session's tab group
  await addTabToGroup(newTab.id, sessionTabGroupId);
  return `Created new tab with ID: ${newTab.id} (added to Agent group)`;
}

/**
 * Handle tabs_close tool - close a tab and clean up tracking
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to close
 * @param {TabsToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Success message or error
 */
export async function handleTabsClose(toolInput, deps) {
  const { agentOpenedTabs } = deps;
  const closeTabId = toolInput.tabId;
  if (!closeTabId) {
    return 'Error: tabId is required';
  }
  try {
    // Check if tab exists
    await chrome.tabs.get(closeTabId);
    // Close the tab
    await chrome.tabs.remove(closeTabId);
    // Clean up tracking
    agentOpenedTabs.delete(closeTabId);
    clearPosition(closeTabId);
    return `Successfully closed tab ${closeTabId}`;
  } catch (e) {
    return `Error closing tab ${closeTabId}: ${e.message}`;
  }
}
