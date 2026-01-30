/**
 * Service Worker - LLM in Chrome
 *
 * Orchestrates browser automation by:
 * 1. Receiving tasks from the sidepanel
 * 2. Calling LLM API with tools
 * 3. Executing tool calls via content scripts
 * 4. Looping until task is complete
 */

import { getDomainSkills } from './modules/domain-skills.js';
import {
  loadConfig, getConfig, setConfig,
  createAbortController, abortRequest,
  callLLM, callLLMSimple, resetApiCallCounter, getApiCallCount
} from './modules/api.js';
import { manageMemory, getMemoryStats } from './modules/memory-manager.js';
import { compactIfNeeded, calculateContextTokens } from './modules/conversation-compaction.js';
import { startOAuthLogin, importCLICredentials, logout, getAuthStatus } from './modules/oauth-manager.js';
import { hasHandler, executeToolHandler } from './tool-handlers/index.js';
import { log, clearLog, saveTaskLogs, initLogging } from './managers/logging-manager.js';
import { ensureDebugger, detachDebugger, sendDebuggerCommand, initDebugger, isNetworkTrackingEnabled, enableNetworkTracking } from './managers/debugger-manager.js';
import { showAgentIndicators, hideAgentIndicators, hideIndicatorsForToolUse, showIndicatorsAfterToolUse } from './managers/indicator-manager.js';
import { ensureTabGroup, addTabToGroup, validateTabInGroup, isTabManagedByAgent, registerTabCleanupListener, initTabManager } from './managers/tab-manager.js';

// ============================================
// STATE
// ============================================

// Task debug log - shared with logging manager
let taskDebugLog = [];
initLogging(taskDebugLog);

// ============================================
// STATE
// ============================================

let currentTask = null;
let taskCancelled = false;
let conversationHistory = []; // Persists across tasks in the same chat session

// Screenshot storage for upload_image
let capturedScreenshots = new Map();
let screenshotCounter = { value: 0 };
let taskScreenshots = []; // Screenshots collected during task for logging

// Screenshot context tracking
// Maps screenshot ID to {viewportWidth, viewportHeight, screenshotWidth, screenshotHeight, devicePixelRatio}
let screenshotContexts = new Map();

// Plan approval state
let pendingPlanResolve = null;
let askBeforeActing = true;

// Session metadata (removed - not used)

// ARCHITECTURAL CHANGE: sessionTabGroupId removed from global state
// Tab groups are now managed by the UI/client and passed as parameters
// Multi-session support

// Track tabs opened BY agent actions (popups, new windows from clicks)
const agentOpenedTabs = new Set();

// Track if we're currently in an active agent session
let agentSessionActive = false;

/**
 * ============================================================================
 * POPUP/WINDOW TRACKING
 * ============================================================================
 *
 * The listeners below (chrome.tabs.onCreated, chrome.windows.onCreated) were
 * designed to automatically track popup windows and new tabs opened by agent
 * actions (e.g., payment flows, OAuth redirects, external links).
 *
 * STATUS: DISABLED (but tracking still works via tabs_context tool)
 *
 * KNOWN ISSUE - CHROME FULLSCREEN BUG:
 * Chrome crashes when a new tab is created in the same window while in
 * fullscreen mode. This is a Chrome-level bug, not caused by our extension.
 * Disabling these listeners doesn't fix the crash, but we keep them disabled
 * to reduce any potential interference.
 *
 * WHAT WORKS:
 * - Non-fullscreen mode: New tabs and popups are tracked correctly
 * - Fullscreen + new popup window: Works fine
 * - Fullscreen + new tab (same window): Chrome crashes (Chrome bug)
 *
 * WORKAROUND FOR DEMOS:
 * Run the agent in non-fullscreen mode if the workflow involves opening
 * new tabs in the same window (e.g., payment checkouts).
 *
 * NOTE: Even with these listeners disabled, the tabs_context tool still
 * correctly detects new tabs via chrome.tabs.query. The agent successfully
 * handles payment flows and multi-tab interactions in non-fullscreen mode.
 *
 * TO RE-ENABLE (if needed):
 * 1. Remove the early `return;` statements in both listeners
 * 2. Test thoroughly in fullscreen mode
 * ============================================================================
 */

// Listen for new tabs and track ones that might be opened by agent actions
chrome.tabs.onCreated.addListener(async (tab) => {
  // DISABLED: This was causing browser crashes in fullscreen mode
  return;

  // DISABLED CODE BELOW (unreachable):
  // If no active session, don't track
  // eslint-disable-next-line no-unreachable, no-undef
  if (!agentSessionActive) return;

  console.log(`[TAB TRACKING] New tab created: ${tab.id}, openerTabId: ${tab.openerTabId}, windowId: ${tab.windowId}`);

  // Track if opener is one of our managed tabs
  if (tab.openerTabId) {
    const isOpenerManaged = await isTabManagedByAgent(tab.openerTabId);
    if (isOpenerManaged) {
      agentOpenedTabs.add(tab.id);
      console.log(`[TAB TRACKING] Tracking tab ${tab.id} (opened by agent tab ${tab.openerTabId})`);
      return;
    }
  }

  // Also track tabs in new popup windows that appear during active session
  // These might be payment popups, OAuth flows, etc.
  try {
    const window = await chrome.windows.get(tab.windowId);
    if (window.type === 'popup' && agentSessionActive) {
      agentOpenedTabs.add(tab.id);
      console.log(`[TAB TRACKING] Tracking popup tab ${tab.id} (popup window during active session)`);
    }
  } catch (e) {
    // Window might not exist
  }
});

// Listen for new windows (catches popup windows)
// NOTE: Disabled to fix browser crashes in fullscreen mode
chrome.windows.onCreated.addListener(async (window) => {
  // DISABLED: This was causing browser crashes in fullscreen mode
  return;

  // DISABLED CODE BELOW (unreachable):
  // eslint-disable-next-line no-unreachable
  if (!agentSessionActive) return;

  console.log(`[WINDOW TRACKING] New window created: ${window.id}, type: ${window.type}`);

  // If it's a popup window during an active session, track its tabs
  if (window.type === 'popup') {
    // Wait a moment for tabs to be created in the window
    await new Promise(r => setTimeout(r, 100));

    const tabs = await chrome.tabs.query({ windowId: window.id });
    for (const tab of tabs) {
      if (!agentOpenedTabs.has(tab.id)) {
        agentOpenedTabs.add(tab.id);
        console.log(`[WINDOW TRACKING] Tracking tab ${tab.id} from popup window ${window.id}`);
      }
    }
  }
});

// Clean up tracking when tabs are closed
chrome.tabs.onRemoved.addListener((_tabId) => {
  // Tab cleanup handled by tab manager now
});

// Tab management delegated to tab-manager.js
// Initialize tab manager with shared state
// NOTE: sessionTabGroupId removed - now passed as parameter from client
registerTabCleanupListener(agentOpenedTabs);
initTabManager({ agentOpenedTabs, agentSessionActive, log });

// ============================================
// DEBUGGER MANAGEMENT
// Debugger and indicator management delegated to manager modules
// Initialize debugger manager with shared state
let consoleMessages = [];
let networkRequests = [];
let capturedCaptchaData = new Map();

initDebugger({ consoleMessages, networkRequests, capturedCaptchaData, log });

// ============================================
// CONTENT SCRIPT COMMUNICATION
// ============================================

async function ensureContentScripts(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId: 0 });
    return true;
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: ['src/content/accessibility-tree.js', 'src/content/content.js'],
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (injectError) {
      console.error('Failed to inject content scripts:', injectError);
      return false;
    }
  }
}

/**
 * Send a message to a tab's content script
 * @param {number} tabId - Tab ID to send message to
 * @param {string} type - Message type
 * @param {Object} [payload] - Message payload
 * @returns {Promise<*>} Response from content script
 */
async function sendToContent(tabId, type, payload = {}) {
  await ensureContentScripts(tabId);
  return await chrome.tabs.sendMessage(tabId, { type, payload }, { frameId: 0 });
}

// ============================================
// ERROR MESSAGE ENHANCEMENT
// ============================================

/**
 * Enhance error messages with additional context for the LLM
 * Prevents retry loops on non-retryable errors
 * @param {string} errorMessage - Original error message
 * @returns {string} Enhanced error message with context
 */
function enhanceErrorMessage(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return errorMessage;
  }

  // Permission denial - prevent infinite retry loops
  if (errorMessage.toLowerCase().includes('permission denied') ||
      errorMessage.toLowerCase().includes('user declined') ||
      errorMessage.toLowerCase().includes('user denied')) {
    return `${errorMessage}\n\nThe user has declined this action. Ask how to proceed instead.`;
  }

  // Restricted pages - explain Chrome's limitations (not obvious to LLM)
  if (errorMessage.includes('chrome://') ||
      errorMessage.includes('Chrome blocks extensions') ||
      errorMessage.includes('about:')) {
    return `${errorMessage}\n\nChrome blocks extensions from system pages.`;
  }

  // Return original error for everything else
  return errorMessage;
}

// ============================================
// TOOL EXECUTION
// ============================================

/**
 * Execute a tool and return its result
 * @param {string} toolName - Name of the tool to execute (e.g., 'computer', 'navigate', 'read_page')
 * @param {Object} toolInput - Tool-specific input parameters
 * @param {number} [toolInput.tabId] - Tab ID to operate on (required for most tools)
 * @param {string} [toolInput.action] - Action to perform (for computer tool)
 * @param {string} [toolInput.url] - URL to navigate to (for navigate tool)
 * @param {number|null} [sessionTabGroupId] - Current session tab group ID (from client)
 * @returns {Promise<Object|string>} Tool execution result or error message
 */
async function executeTool(toolName, toolInput, sessionTabGroupId = null) {
  await log('TOOL', `Executing: ${toolName}`, toolInput);
  const tabId = toolInput.tabId;

  // Validate tab is in our group (for tools that use tabId)
  // Skip URL validation for navigate tool since it changes the URL anyway
  const tabTools = ['computer', 'read_page', 'find', 'form_input', 'get_page_text',
                    'javascript_tool', 'upload_image', 'read_console_messages', 'read_network_requests', 'resize_window', 'solve_captcha'];
  if (tabId && tabTools.includes(toolName)) {
    const validation = await validateTabInGroup(tabId, sessionTabGroupId);
    if (!validation.valid) {
      return validation.error;
    }
  }

  // For navigate tool, only check if tab is managed (not URL restrictions)
  if (toolName === 'navigate' && tabId) {
    if (sessionTabGroupId === null) {
      // No group yet - allow first navigation
    } else {
      const isManaged = await isTabManagedByAgent(tabId, sessionTabGroupId);
      if (!isManaged) {
        return `Tab ${tabId} is not managed by the Agent. Use tabs_context to see available tabs.`;
      }
    }
  }

  // Use extracted handler if available
  if (hasHandler(toolName)) {
    const deps = {
      sendDebuggerCommand,
      ensureDebugger,
      log,
      sendToContent,
      hideIndicatorsForToolUse,
      showIndicatorsAfterToolUse,
      screenshotCounter,
      capturedScreenshots,
      screenshotContexts,
      taskScreenshots,
      agentOpenedTabs,
      sessionTabGroupId,
      agentSessionActive,
      addTabToGroup,
      ensureContentScripts,
      getConfig,
      callLLMSimple,
      consoleMessages,
      networkRequests,
      isNetworkTrackingEnabled,
      enableNetworkTracking,
      capturedCaptchaData,
      askBeforeActing,
      setPendingPlanResolve: (resolver) => { pendingPlanResolve = resolver; },
    };
    return await executeToolHandler(toolName, toolInput, deps);
  }

  // All tools have been migrated to handlers - this should never be reached
  return `Error: Unknown tool ${toolName}`;
}

// ============================================
// AGENT LOOP
// ============================================

/**
 * Main agent loop - coordinates with LLM to execute a task
 * @param {number} initialTabId - Tab ID to start the task in
 * @param {string} task - Natural language task description
 * @param {Function} onUpdate - Callback for status updates (receives {status, message, data})
 * @param {Array<string>} [images] - Array of base64 image data URLs to include in initial message
 * @param {boolean} [askBeforeActing] - Whether to ask user before executing actions
 * @param {Array<Object>} [existingHistory] - Existing conversation history to continue from
 * @param {number|null} [initialTabGroupId] - Optional initial tab group ID from client
 * @returns {Promise<Object>} Task result with {success: boolean, message: string, error?: string}
 */
async function runAgentLoop(initialTabId, task, onUpdate, images = [], askBeforeActing = true, existingHistory = [], initialTabGroupId = null) {
  await clearLog();
  await log('START', 'Agent loop started', { tabId: initialTabId, task: task.substring(0, 100) });

  // Load config first to ensure userSkills and other settings are available
  await loadConfig();

  // Create or adopt tab group for this session (receives tabGroupId from client)
  let sessionTabGroupId = initialTabGroupId;
  const newGroupId = await ensureTabGroup(initialTabId, sessionTabGroupId);
  if (newGroupId !== sessionTabGroupId) {
    // Group was created or changed - notify client
    sessionTabGroupId = newGroupId;
    chrome.runtime.sendMessage({
      type: 'SESSION_GROUP_UPDATE',
      tabGroupId: sessionTabGroupId
    }).catch(() => {});
  }

  // Get tab info for system-reminder
  let tabInfo = { availableTabs: [], initialTabId, domainSkills: [] };
  let currentTabUrl = null; // Track current URL for tool filtering
  try {
    const tab = await chrome.tabs.get(initialTabId);
    currentTabUrl = tab.url || null;
    tabInfo.availableTabs = [{
      tabId: initialTabId,
      title: tab.title || 'New Tab',
      url: tab.url || 'chrome://newtab/',
    }];

    // Add domain-specific skills if available for this site
    const skills = getDomainSkills(tab.url, getConfig().userSkills || []);
    if (skills.length > 0) {
      tabInfo.domainSkills = skills.map(s => ({ domain: s.domain, skill: s.skill }));
      await log('SKILLS', `Loaded ${skills.length} domain skill(s) for ${tab.url}`, { domains: skills.map(s => s.domain) });
    }
  } catch (e) {
    // Tab not accessible, use defaults
  }

  // Build new user message with optional images and system-reminders
  const userContent = [];

  // Add images first if present
  if (images && images.length > 0) {
    for (const image of images) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const mediaType = image.match(/^data:(image\/\w+);/)?.[1] || 'image/png';
      userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } });
    }
  }

  // Add task text
  userContent.push({ type: 'text', text: task });

  // Add tab context as system-reminder
  userContent.push({
    type: 'text',
    text: `<system-reminder>${JSON.stringify(tabInfo)}</system-reminder>`,
  });

  // Add planning mode reminder if askBeforeActing is enabled AND this is a new conversation
  if (askBeforeActing && existingHistory.length === 0) {
    userContent.push({
      type: 'text',
      text: '<system-reminder>You are in planning mode. Before executing any tools, you must first present a plan to the user using the update_plan tool. The plan should include: domains (list of domains you will visit) and approach (high-level steps you will take).</system-reminder>',
    });
  }

  // Continue from existing history or start fresh
  let messages = [...existingHistory, { role: 'user', content: userContent }];
  let steps = 0;
  // maxSteps: 0 means unlimited, otherwise use configured value or default to 100
  const configMaxSteps = getConfig().maxSteps;
  const maxSteps = configMaxSteps === 0 ? Infinity : (configMaxSteps || 100);

  while (steps < maxSteps) {
    // Check if task was cancelled
    if (taskCancelled) {
      return { success: false, message: 'Task stopped by user', messages, steps };
    }

    steps++;
    onUpdate({ step: steps, status: 'thinking' });

    // Calculate token count for monitoring
    const currentTokens = calculateContextTokens(messages);
    const memStats = getMemoryStats(messages);
    await log('MEMORY', `Turn ${steps}: ${memStats.totalMessages} messages (${currentTokens.toLocaleString()} tokens)`, {
      atThreshold: currentTokens >= 190000,
      toolUses: memStats.toolUseCount
    });

    // Stream text chunks to UI
    let streamedText = '';
    const onTextChunk = (chunk) => {
      streamedText += chunk;
      onUpdate({ step: steps, status: 'streaming', text: streamedText });
    };

    // Conversation compaction strategy
    // Triggers at 190K tokens, preserves last 3 screenshots + summary
    messages = await compactIfNeeded(messages, callLLM, log);

    let response;
    try {
      response = await callLLM(messages, onTextChunk, log, currentTabUrl);

      // Log AI's complete response including reasoning
      const textBlocks = response.content.filter(b => b.type === 'text');
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      await log('AI_RESPONSE', `Turn ${steps}: AI reasoning and tool choices`, {
        stopReason: response.stop_reason,
        textContent: textBlocks.map(b => b.text).join('\n'),
        toolCalls: toolUseBlocks.map(t => ({
          name: t.name,
          input: t.input
        }))
      });
    } catch (error) {
      // Handle abort gracefully
      if (error.name === 'AbortError' || taskCancelled) {
        return { success: false, message: 'Task stopped by user', messages, steps };
      }
      throw error; // Re-throw other errors
    }
    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(b => b.type === 'tool_use');

    if (toolUses.length === 0) {
      const textBlock = response.content.find(b => b.type === 'text');
      if (textBlock) {
        onUpdate({ step: steps, status: 'message', text: textBlock.text });
      }
      if (response.stop_reason === 'end_turn') {
        return { success: true, message: 'Task completed', messages, steps };
      }
      continue;
    }

    const toolResults = [];
    for (const toolUse of toolUses) {
      onUpdate({ step: steps, status: 'executing', tool: toolUse.name, input: toolUse.input });

      const result = await executeTool(toolUse.name, toolUse.input, sessionTabGroupId);

      // Log structured tool result
      const isScreenshot = result && result.type === 'screenshot';
      const isError = result?.error || (typeof result === 'string' && result.includes('Error:'));

      await log('TOOL_RESULT', `Result from ${toolUse.name}`, {
        tool: toolUse.name,
        toolUseId: toolUse.id,
        success: !isError,
        resultType: isScreenshot ? 'screenshot' : typeof result,
        // For screenshots, reference the file
        screenshot: isScreenshot ? `screenshot_${screenshotCounter.value}.png` : null,
        // For text results, include full content
        textResult: typeof result === 'string' && !isScreenshot ? result : null,
        // For object results (not screenshots), include structure
        objectResult: typeof result === 'object' && !isScreenshot ? result : null,
        // Error info
        error: isError ? (typeof result === 'string' ? result : result.error) : null
      });

      // Check for cancellation
      if (result && result.cancelled) {
        return { success: false, message: result.message, messages, steps };
      }

      // Handle screenshot results
      // computer-tool uses cdpHelper.screenshot() which already handles DPR scaling
      // Returns { base64Image, imageId, imageFormat, output }
      // Note: scroll/scroll_to actions also return base64Image with an output message
      if (result && result.base64Image) {
        const mediaType = result.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        await log('SCREENSHOT_API', `Sending to API: ${result.base64Image.length} chars, format=${result.imageFormat}`);
        // Include the actual output message if present (e.g., "Scrolled down by 5 ticks at (x, y)")
        // Fall back to generic screenshot message if no output
        const textMessage = result.output || (result.imageId ? `Screenshot captured (ID: ${result.imageId})` : 'Screenshot captured');
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: [
            { type: 'text', text: textMessage },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: result.base64Image } },
          ],
        });
        onUpdate({ step: steps, status: 'executed', tool: toolUse.name, input: toolUse.input, result: textMessage.substring(0, 100) });
      } else {
        // Enhance error messages for better LLM understanding
        let content = typeof result === 'string' ? result : JSON.stringify(result);
        if (typeof result === 'string' && result.toLowerCase().includes('error')) {
          content = enhanceErrorMessage(result);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: content,
        });
        onUpdate({
          step: steps,
          status: 'executed',
          tool: toolUse.name,
          input: toolUse.input,
          result: typeof result === 'string' ? result.substring(0, 200) : 'done',
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return { success: false, message: `Reached max steps (${maxSteps})`, messages, steps };
}

// ============================================
// TASK MANAGEMENT
// ============================================

/**
 * Start a new agent task
 * @param {number} tabId - Tab ID to start the task in
 * @param {string} task - Natural language task description
 * @param {boolean} [shouldAskBeforeActing] - Whether to ask user before executing actions
 * @param {Array<string>} [images] - Array of base64 image data URLs to include
 * @param {number|null} [tabGroupId] - Optional tab group ID from client (UI manages this)
 * @returns {Promise<Object>} Task result with {success: boolean, message: string}
 */
async function startTask(tabId, task, shouldAskBeforeActing = true, images = [], tabGroupId = null) {
  // Reset state for new task (but preserve conversation history)
  // NOTE: tabGroupId is now passed from client, not stored globally
  agentOpenedTabs.clear();  // Clear tracked tabs from previous session
  agentSessionActive = true;  // Mark session as active for popup tracking
  askBeforeActing = shouldAskBeforeActing;
  taskCancelled = false;
  taskScreenshots = [];
  taskDebugLog = []; // Clear debug log for new task
  resetApiCallCounter(); // Reset API call counter for logging

  // Create new abort controller for this task
  createAbortController();
  const startTime = new Date().toISOString();
  currentTask = { tabId, task, status: 'running', steps: [], startTime };

  // Show visual indicator on the tab
  await showAgentIndicators(tabId);

  try {
    const result = await runAgentLoop(tabId, task, update => {
      currentTask.steps.push(update);
      chrome.runtime.sendMessage({ type: 'TASK_UPDATE', update }).catch(() => {});
    }, images, askBeforeActing, conversationHistory, tabGroupId);

    // Update conversation history with the full message history from this run
    if (result.messages) {
      conversationHistory = result.messages;
    }

    await detachDebugger();
    agentSessionActive = false;  // Mark session as inactive
    currentTask.status = result.success ? 'completed' : 'failed';
    currentTask.result = result;
    currentTask.endTime = new Date().toISOString();

    // Log API call summary
    const totalApiCalls = getApiCallCount();
    await log('TASK', `📈 TASK COMPLETE - Total API calls: ${totalApiCalls}`, {
      totalApiCalls,
      status: currentTask.status,
      turns: result.steps || 0,
    });

    // Save clean task log
    const logData = {
      task,
      status: currentTask.status,
      startTime,
      endTime: currentTask.endTime,
      messages: result.messages || [],
      error: null,
    };
    await saveTaskLogs(logData, taskScreenshots);

    // Hide visual indicators
    await hideAgentIndicators(tabId);

    chrome.runtime.sendMessage({ type: 'TASK_COMPLETE', result }).catch(() => {});
    return result;
  } catch (error) {
    await detachDebugger();
    agentSessionActive = false;  // Mark session as inactive
    // Hide visual indicators
    await hideAgentIndicators(tabId);

    // Check if this was a user cancellation
    const isCancelled = error.name === 'AbortError' || taskCancelled;

    currentTask.status = isCancelled ? 'stopped' : 'error';
    currentTask.error = error.message;
    currentTask.endTime = new Date().toISOString();

    // Save log with conversation history (not empty)
    const logData = {
      task,
      status: currentTask.status,
      startTime,
      endTime: currentTask.endTime,
      messages: conversationHistory || [],
      error: isCancelled ? 'Stopped by user' : error.message,
    };
    await saveTaskLogs(logData, taskScreenshots);

    chrome.runtime.sendMessage({
      type: isCancelled ? 'TASK_COMPLETE' : 'TASK_ERROR',
      result: isCancelled ? { success: false, message: 'Task stopped by user' } : undefined,
      error: isCancelled ? undefined : error.message
    }).catch(() => {});

    if (!isCancelled) {
      throw error;
    }
  }
}

// ============================================
// MESSAGE HANDLER
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'START_TASK':
      startTask(
        payload.tabId,
        payload.task,
        payload.askBeforeActing !== false,
        payload.images || [],
        payload.tabGroupId || null  // Accept tabGroupId from client
      )
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_STATUS':
      sendResponse({ task: currentTask });
      return false;

    case 'SAVE_CONFIG':
      chrome.storage.local.set(payload).then(() => {
        setConfig(payload);
        sendResponse({ success: true });
      });
      return true;

    case 'GET_CONFIG':
      loadConfig().then(cfg => sendResponse(cfg));
      return true;

    case 'GET_LOG':
      chrome.storage.local.get(['agent_log']).then(data => {
        sendResponse({ log: data['agent_log'] || [] });
      });
      return true;

    case 'PLAN_APPROVAL_RESPONSE':
      if (pendingPlanResolve) {
        pendingPlanResolve(payload);
        pendingPlanResolve = null;
      }
      sendResponse({ success: true });
      return false;

    case 'CLEAR_CONVERSATION':
      // Reset state for new conversation
      currentTask = null;
      consoleMessages = [];
      networkRequests = [];
      capturedScreenshots.clear();
      clearLog();
      sendResponse({ success: true });
      return false;

    case 'STOP_TASK':
      taskCancelled = true;
      // Abort any ongoing API call
      abortRequest();
      // Also resolve any pending plan approval
      if (pendingPlanResolve) {
        pendingPlanResolve({ approved: false });
        pendingPlanResolve = null;
      }
      sendResponse({ success: true });
      return false;

    case 'START_OAUTH_LOGIN':
      console.log('[ServiceWorker] START_OAUTH_LOGIN message received');
      console.log('[ServiceWorker] Calling startOAuthLogin()...');
      startOAuthLogin()
        .then(async tokens => {
          console.log('[ServiceWorker] ✓ OAuth login successful');
          console.log('[ServiceWorker] Reloading config to pick up authMethod...');
          await loadConfig();
          console.log('[ServiceWorker] Config reloaded, authMethod:', getConfig().authMethod);
          console.log('[ServiceWorker] Tokens received, sending response to sidepanel');
          sendResponse({ success: true, tokens });
        })
        .catch(error => {
          console.error('[ServiceWorker] ✗ OAuth login failed:', error);
          console.error('[ServiceWorker] Error message:', error.message);
          console.error('[ServiceWorker] Error stack:', error.stack);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'OAUTH_LOGOUT':
      console.log('[ServiceWorker] OAUTH_LOGOUT message received');
      logout().then(async () => {
        console.log('[ServiceWorker] ✓ OAuth logout complete');
        console.log('[ServiceWorker] Reloading config to clear authMethod...');
        await loadConfig();
        console.log('[ServiceWorker] Config reloaded');
        sendResponse({ success: true });
      });
      return true;

    case 'GET_OAUTH_STATUS':
      console.log('[ServiceWorker] GET_OAUTH_STATUS message received');
      getAuthStatus().then(status => {
        console.log('[ServiceWorker] OAuth status:', status);
        sendResponse(status);
      });
      return true;

    case 'IMPORT_CLI_CREDENTIALS':
      console.log('[ServiceWorker] IMPORT_CLI_CREDENTIALS message received');
      console.log('[ServiceWorker] Calling importCLICredentials()...');
      importCLICredentials()
        .then(async credentials => {
          console.log('[ServiceWorker] ✓ CLI credentials import successful');
          console.log('[ServiceWorker] Reloading config to pick up authMethod...');
          await loadConfig();
          console.log('[ServiceWorker] Config reloaded, authMethod:', getConfig().authMethod);
          console.log('[ServiceWorker] Credentials received, sending response to sidepanel');
          sendResponse({ success: true, credentials });
        })
        .catch(error => {
          console.error('[ServiceWorker] ✗ CLI credentials import failed:', error);
          console.error('[ServiceWorker] Error message:', error.message);
          console.error('[ServiceWorker] Error stack:', error.stack);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CLEAR_CHAT':
      // Clear conversation history for new chat session
      conversationHistory = [];
      sendResponse({ success: true });
      return false;
  }
});

// Open side panel when clicking the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

console.log('[LLM in Chrome] Service worker loaded');
