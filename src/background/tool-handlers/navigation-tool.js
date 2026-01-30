/**
 * Navigation tool handlers
 * Handles: navigate, find, read_page
 */

import { DELAYS, LIMITS } from '../modules/constants.js';
import { getDomainSkills } from '../modules/domain-skills.js';

/**
 * @typedef {Object} NavigationToolDeps
 * @property {Function} ensureContentScripts - Ensure content scripts are loaded in tab
 * @property {Function} getConfig - Get extension configuration
 * @property {Function} ensureDebugger - Attach debugger to tab if needed
 * @property {Function} sendDebuggerCommand - Send CDP command to tab
 * @property {Function} sendToContent - Send message to content script
 * @property {Function} callLLMSimple - Call LLM for simple queries
 */

/**
 * Handle navigate tool - navigate to URL or back/forward
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to navigate
 * @param {string} toolInput.url - URL to navigate to, or 'back'/'forward' for history navigation
 * @param {NavigationToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Navigation result message, including domain skills if applicable
 */
export async function handleNavigate(toolInput, deps) {
  const { tabId } = toolInput;
  const { ensureContentScripts, getConfig } = deps;
  const url = toolInput.url;

  if (url === 'back') {
    await chrome.tabs.goBack(tabId);
    await new Promise(r => setTimeout(r, 1500));
    await ensureContentScripts(tabId);
    // Check for domain skills at new location
    const backTab = await chrome.tabs.get(tabId);
    const backSkills = getDomainSkills(backTab.url, getConfig().userSkills || []);
    if (backSkills.length > 0) {
      return `Navigated back to ${backTab.url}\n\n<system-reminder>Domain skills for ${backSkills[0].domain}:\n${backSkills[0].skill}</system-reminder>`;
    }
    return 'Navigated back';
  }

  if (url === 'forward') {
    await chrome.tabs.goForward(tabId);
    await new Promise(r => setTimeout(r, 1500));
    await ensureContentScripts(tabId);
    // Check for domain skills at new location
    const fwdTab = await chrome.tabs.get(tabId);
    const fwdSkills = getDomainSkills(fwdTab.url, getConfig().userSkills || []);
    if (fwdSkills.length > 0) {
      return `Navigated forward to ${fwdTab.url}\n\n<system-reminder>Domain skills for ${fwdSkills[0].domain}:\n${fwdSkills[0].skill}</system-reminder>`;
    }
    return 'Navigated forward';
  }

  let fullUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    fullUrl = `https://${url}`;
  }

  // Check if current tab is on a restricted page (chrome://, about:, chrome-extension://)
  const tab = await chrome.tabs.get(tabId);
  const isRestrictedPage = tab.url && (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('about:')
  );

  if (isRestrictedPage) {
    // Navigating from restricted pages requires more time for Chrome to close the page first
    await chrome.tabs.update(tabId, { url: fullUrl });
    await new Promise(r => setTimeout(r, 3000)); // Wait 3s instead of 2s
    await ensureContentScripts(tabId);
    const skills = getDomainSkills(fullUrl, getConfig().userSkills || []);
    if (skills.length > 0) {
      return `Navigated to ${fullUrl}\n\n<system-reminder>Domain skills for ${skills[0].domain}:\n${skills[0].skill}</system-reminder>`;
    }
    return `Navigated to ${fullUrl}`;
  }

  // Normal navigation
  await chrome.tabs.update(tabId, { url: fullUrl });
  await new Promise(r => setTimeout(r, DELAYS.NAVIGATE_WAIT));
  await ensureContentScripts(tabId);
  // Check for domain skills at new URL
  const skills = getDomainSkills(fullUrl, getConfig().userSkills || []);
  if (skills.length > 0) {
    return `Navigated to ${fullUrl}\n\n<system-reminder>Domain skills for ${skills[0].domain}:\n${skills[0].skill}</system-reminder>`;
  }
  return `Navigated to ${fullUrl}`;
}

/**
 * Handle read_page tool - extract accessibility tree from page
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to read from
 * @param {string} [toolInput.filter] - Element filter ('interactive', 'all', etc.) - defaults to 'interactive'
 * @param {number} [toolInput.depth] - Tree depth limit - defaults to 15
 * @param {string} [toolInput.ref_id] - Optional reference ID to focus on specific subtree
 * @param {number} [toolInput.max_chars] - Maximum characters to return - defaults to LIMITS.PAGE_TEXT_CHARS
 * @param {NavigationToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Accessibility tree as formatted text with viewport dimensions
 */
export async function handleReadPage(toolInput, deps) {
  const { tabId } = toolInput;
  const { sendToContent } = deps;

  const result = await sendToContent(tabId, 'READ_PAGE', {
    filter: toolInput.filter || 'interactive',  // Default to 'interactive'
    depth: toolInput.depth || 15,
    ref_id: toolInput.ref_id,
    maxChars: toolInput.max_chars || LIMITS.PAGE_TEXT_CHARS,
  });
  if (result.success) {
    // Format: elements first, then \n\nViewport at end
    const viewportDimensions = result.viewport ? result.viewport.width + 'x' + result.viewport.height : null;
    const viewport = viewportDimensions ? '\n\nViewport: ' + viewportDimensions : '';
    return result.tree + viewport;
  }
  return `Error: ${result.error}`;
}

/**
 * Handle find tool - use LLM to find matching elements on page
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to search in
 * @param {string} toolInput.query - Natural language query describing what to find
 * @param {NavigationToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} List of matching elements with references, or error message
 */
export async function handleFind(toolInput, deps) {
  const { tabId } = toolInput;
  const { sendToContent, callLLMSimple } = deps;
  const query = toolInput.query;
  const result = await sendToContent(tabId, 'READ_PAGE', { filter: 'interactive', depth: 20 });

  if (!result.success) {
    return `Error: ${result.error}`;
  }

  // Use AI to find matching elements
  const findPrompt = `You are helping find elements on a web page. The user wants to find: "${query}"

Here is the accessibility tree:
${result.tree}

Find ALL elements that match. Return up to 20 matches in this format:

FOUND: <total>
---
ref_X | role | name | reason
ref_Y | role | name | reason

If none found:
FOUND: 0
ERROR: explanation`;

  try {
    const aiResponse = await callLLMSimple(findPrompt, 800);
    const lines = aiResponse.trim().split('\n').filter(l => l.trim());
    const matches = [];
    let totalFound = 0;

    for (const line of lines) {
      if (line.startsWith('FOUND:')) {
        totalFound = parseInt(line.split(':')[1]) || 0;
      } else if (line.includes('|') && line.trim().startsWith('ref_')) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 3) {
          matches.push({ ref: parts[0], role: parts[1], name: parts[2], reason: parts[3] });
        }
      }
    }

    if (matches.length === 0) {
      return `No matching elements found for: "${query}"`;
    }

    const matchList = matches.map(m => {
      const reasonText = m.reason ? ' - ' + m.reason : '';
      return '- ' + m.ref + ': ' + m.role + ' "' + m.name + '"' + reasonText;
    }).join('\n');
    return `Found ${totalFound} element(s):\n\n${matchList}`;
  } catch (err) {
    return `Error in find: ${err.message}`;
  }
}
