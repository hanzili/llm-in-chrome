/**
 * Service Worker - LLM in Chrome
 *
 * Orchestrates browser automation by:
 * 1. Receiving tasks from the sidepanel
 * 2. Calling Claude API with tools
 * 3. Executing tool calls via content scripts
 * 4. Looping until task is complete
 */

import { TOOL_DEFINITIONS } from '../tools/definitions.js';
import { getDomainSkills } from './modules/domain-skills.js';
import { getKeyCode, requiresShift, pressKey, pressKeyChord } from './modules/keys.js';
import { buildSystemPrompt } from './modules/system-prompt.js';
import {
  loadConfig, getConfig, setConfig, getApiHeaders,
  createAbortController, getAbortController, abortRequest,
  callClaude, callClaudeSimple
} from './modules/api.js';

// ============================================
// LOGGING
// ============================================

const LOG_KEY = 'agent_log';

async function log(type, message, data = null) {
  const entry = {
    time: new Date().toISOString(),
    type,
    message,
    data: data ? JSON.stringify(data).substring(0, 500) : null,
  };
  console.log(`[${type}] ${message}`, data || '');

  // Also collect in taskDebugLog for saving to file
  taskDebugLog.push(entry);

  // Save to storage
  const stored = await chrome.storage.local.get([LOG_KEY]);
  const existingLog = stored[LOG_KEY] || [];
  const newLog = [...existingLog, entry].slice(-200);
  await chrome.storage.local.set({ [LOG_KEY]: newLog });
}

async function clearLog() {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
}

/**
 * Save complete task log to file via downloads API
 */
/**
 * Save task logs to a folder with clean format for debugging
 */
async function saveTaskLogs(taskData, screenshots = []) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const folder = `browser-agent/${timestamp}`;

    // Build clean log format
    const cleanLog = {
      task: taskData.task,
      status: taskData.status,
      startTime: taskData.startTime,
      endTime: taskData.endTime,
      duration: taskData.startTime && taskData.endTime
        ? `${((new Date(taskData.endTime) - new Date(taskData.startTime)) / 1000).toFixed(1)}s`
        : null,
      turns: buildCleanTurns(taskData.messages || []),
      screenshots: screenshots.map((_, i) => `screenshot_${i + 1}.png`),
      debug: taskDebugLog.filter(e => ['DPR', 'CLICK', 'WINDOW TRACKING', 'TAB TRACKING'].includes(e.type)),
      error: taskData.error || null,
    };

    // Save log.json
    const logContent = JSON.stringify(cleanLog, null, 2);
    const logDataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(logContent)));
    await chrome.downloads.download({
      url: logDataUrl,
      filename: `${folder}/log.json`,
      saveAs: false,
    });

    // Save screenshots
    for (let i = 0; i < screenshots.length; i++) {
      const dataUrl = screenshots[i];
      await chrome.downloads.download({
        url: dataUrl,
        filename: `${folder}/screenshot_${i + 1}.png`,
        saveAs: false,
      });
    }

    console.log('[LOG] Task saved to:', folder);
  } catch (err) {
    console.error('[LOG] Failed to save task:', err);
  }
}

/**
 * Convert raw messages to clean turn-based format
 */
function buildCleanTurns(messages) {
  const turns = [];
  let currentTurn = null;

  for (const msg of messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      // User message starts context (first message is the task)
      continue;
    }

    if (msg.role === 'assistant') {
      // Start new turn
      currentTurn = { tools: [], ai_response: null };
      turns.push(currentTurn);

      for (const block of msg.content || []) {
        if (block.type === 'text') {
          currentTurn.ai_response = block.text;
        } else if (block.type === 'tool_use') {
          currentTurn.tools.push({
            name: block.name,
            input: block.input,
            result: null, // Will be filled from tool_result
          });
        }
      }
    }

    if (msg.role === 'user' && Array.isArray(msg.content)) {
      // Tool results
      for (const item of msg.content) {
        if (item.type === 'tool_result' && currentTurn) {
          const tool = currentTurn.tools.find(t => t.result === null);
          if (tool) {
            // Extract result, handle images specially
            if (Array.isArray(item.content)) {
              const textParts = item.content
                .filter(c => c.type === 'text')
                .map(c => c.text);
              const hasImage = item.content.some(c => c.type === 'image');
              tool.result = textParts.join('\n') + (hasImage ? ' [+screenshot]' : '');
            } else {
              tool.result = typeof item.content === 'string'
                ? item.content.substring(0, 2000) // Truncate long results
                : JSON.stringify(item.content).substring(0, 2000);
            }
          }
        }
      }
    }
  }

  // Clean up empty turns
  return turns.filter(t => t.ai_response || t.tools.length > 0);
}

// ============================================
// IMAGE UTILS
// ============================================

/**
 * Get device pixel ratio from a tab
 */
async function getTabDPR(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.devicePixelRatio || 1,
    });
    const dpr = results[0]?.result || 1;
    await log('DPR', `Tab ${tabId}: devicePixelRatio = ${dpr}`);
    return dpr;
  } catch (err) {
    await log('DPR', `Tab ${tabId}: Failed to get DPR, defaulting to 1. Error: ${err.message}`);
    return 1; // Default to 1 if we can't get it
  }
}

/**
 * Convert screenshot coordinates to viewport coordinates
 * Used when Claude outputs coordinates based on what it sees in screenshots
 */
function screenshotToViewportCoords(screenshotX, screenshotY, context) {
  if (!context) return [screenshotX, screenshotY];

  const scaleX = context.viewportWidth / context.screenshotWidth;
  const scaleY = context.viewportHeight / context.screenshotHeight;

  return [
    Math.round(screenshotX * scaleX),
    Math.round(screenshotY * scaleY),
  ];
}

/**
 * Get screenshot context by ID
 */
function getScreenshotContext(imageId) {
  return screenshotContexts.get(imageId);
}

/**
 * Resize a data URL image to account for DPR (device pixel ratio)
 * Screenshots are captured at device resolution (e.g., 2x on Retina)
 * but Claude should see coordinates in CSS/viewport pixels
 */
async function resizeScreenshotForClaude(dataUrl, dpr = 2) {
  // Only resize if DPR > 1
  if (dpr <= 1) {
    return dataUrl;
  }

  try {
    // Fetch the image as a blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create ImageBitmap from blob
    const imageBitmap = await createImageBitmap(blob);

    const currentWidth = imageBitmap.width;
    const currentHeight = imageBitmap.height;

    // Resize to 1x (CSS pixels) so Claude's coordinates match viewport
    const newWidth = Math.round(currentWidth / dpr);
    const newHeight = Math.round(currentHeight / dpr);

    // Create OffscreenCanvas and draw resized image
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);

    // Convert back to data URL
    const resizedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(resizedBlob);
    });
  } catch (err) {
    console.error('[Screenshot] Failed to resize:', err);
    // Return original if resize fails
    return dataUrl;
  }
}

// ============================================
// STATE
// ============================================

let currentTask = null;
let taskCancelled = false;
let debuggerAttached = false;
let debuggerTabId = null;
let consoleMessages = [];
let networkRequests = [];
let conversationHistory = []; // Persists across tasks in the same chat session
let networkTrackingEnabled = false;
let debuggerListenerRegistered = false;

// Screenshot storage for upload_image
let capturedScreenshots = new Map();
let screenshotCounter = 0;
let taskScreenshots = []; // Screenshots collected during task for logging
let taskDebugLog = []; // Debug entries collected during task for logging

// Screenshot context tracking (like Claude in Chrome)
// Maps screenshot ID to {viewportWidth, viewportHeight, screenshotWidth, screenshotHeight, devicePixelRatio}
let screenshotContexts = new Map();

// GIF recording state
let gifRecording = {
  isRecording: false,
  frames: [],
  actions: [],
};

// Plan approval state
let pendingPlanResolve = null;
let approvedDomains = new Set();
let askBeforeActing = true;

// Session metadata
let sessionId = null;

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// Tab group state
let sessionTabGroupId = null;

// Track tabs opened BY agent actions (popups, new windows from clicks)
const agentOpenedTabs = new Set();

// Track if we're currently in an active agent session
let agentSessionActive = false;

// Listen for new tabs and track ones that might be opened by agent actions
chrome.tabs.onCreated.addListener(async (tab) => {
  // If no active session, don't track
  if (!agentSessionActive && sessionTabGroupId === null) return;

  console.log(`[TAB TRACKING] New tab created: ${tab.id}, openerTabId: ${tab.openerTabId}, windowId: ${tab.windowId}`);

  // Track if opener is one of our managed tabs
  if (tab.openerTabId) {
    const isOpenerManaged = await isTabManagedByAgent(tab.openerTabId);
    if (isOpenerManaged) {
      agentOpenedTabs.add(tab.id);
      console.log(`[TAB TRACKING] Tracking tab ${tab.id} (opened by agent tab ${tab.openerTabId})`);

      // Try to add it to the agent's tab group (may fail for popup windows)
      try {
        if (sessionTabGroupId !== null) {
          await chrome.tabs.group({ tabIds: [tab.id], groupId: sessionTabGroupId });
        }
      } catch (e) {
        console.log(`[TAB TRACKING] Could not add tab ${tab.id} to group: ${e.message}`);
      }
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
chrome.windows.onCreated.addListener(async (window) => {
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
chrome.tabs.onRemoved.addListener((tabId) => {
  agentOpenedTabs.delete(tabId);
});

/**
 * Check if a tab is managed by the agent (in group or opened by agent)
 */
async function isTabManagedByAgent(tabId) {
  // Check if it's in our tab group
  if (sessionTabGroupId !== null) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId === sessionTabGroupId) return true;
    } catch (e) {
      // Tab doesn't exist
    }
  }

  // Check if it was opened by an agent action
  if (agentOpenedTabs.has(tabId)) return true;

  return false;
}

/**
 * Get or create a tab group for this session
 */
async function ensureTabGroup(tabId) {
  // Check if group still exists
  if (sessionTabGroupId !== null) {
    try {
      const group = await chrome.tabGroups.get(sessionTabGroupId);
      if (group) return sessionTabGroupId;
    } catch (e) {
      // Group was deleted
      sessionTabGroupId = null;
    }
  }

  // Create new group with the initial tab (with retry logic for "dragging" errors)
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 200; // ms

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, {
        title: 'Agent',
        color: 'cyan',
        collapsed: false,
      });
      sessionTabGroupId = groupId;
      return groupId;
    } catch (err) {
      const isDragging = err.message?.includes('dragging') || err.message?.includes('being dragged');
      if (isDragging && attempt < MAX_RETRIES) {
        await log('WARN', `Tab group creation failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      await log('WARN', `Failed to create tab group: ${err.message}`);
      return null;
    }
  }
  return null;
}

/**
 * Add a tab to the session's tab group (with retry logic)
 */
async function addTabToGroup(tabId) {
  if (sessionTabGroupId === null) {
    await ensureTabGroup(tabId);
    return;
  }

  const MAX_RETRIES = 5;
  const RETRY_DELAY = 200;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await chrome.tabs.group({ tabIds: [tabId], groupId: sessionTabGroupId });
      return;
    } catch (err) {
      const isDragging = err.message?.includes('dragging') || err.message?.includes('being dragged');
      if (isDragging && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      // Group may have been deleted or other error, create new one
      await ensureTabGroup(tabId);
      return;
    }
  }
}

/**
 * Validate that a tab is accessible to the agent
 * Allows tabs in our group OR tabs opened by agent actions
 */
async function validateTabInGroup(tabId) {
  if (sessionTabGroupId === null) {
    // No group yet - allow any tab
    return { valid: true };
  }

  // Use the unified check
  const isManaged = await isTabManagedByAgent(tabId);
  if (isManaged) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Tab ${tabId} is not managed by the Agent. Use tabs_context to see available tabs.`
  };
}

// ============================================
// DEBUGGER MANAGEMENT
// ============================================

function registerDebuggerListener() {
  if (debuggerListenerRegistered) return;
  debuggerListenerRegistered = true;

  // Handle debugger detachment (tab closed, navigated, or user detached)
  // This prevents crashes when tabs change unexpectedly
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
      if (consoleMessages.length > 500) {
        consoleMessages = consoleMessages.slice(-500);
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
      if (networkRequests.length > 1000) {
        networkRequests = networkRequests.slice(-1000);
      }
    }

    if (method === 'Network.responseReceived') {
      const req = networkRequests.find(r => r.requestId === params.requestId);
      if (req) req.status = params.response.status;
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

async function isDebuggerAttached(tabId) {
  return new Promise(resolve => {
    chrome.debugger.getTargets(targets => {
      const target = targets.find(t => t.tabId === tabId);
      resolve(target?.attached ?? false);
    });
  });
}

async function ensureDebugger(tabId) {
  registerDebuggerListener();

  // Verify tab exists before attempting to attach
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.id) {
      await log('DEBUGGER', 'Tab does not exist', { tabId });
      return false;
    }
  } catch (e) {
    await log('DEBUGGER', 'Tab not accessible', { tabId, error: e.message });
    return false;
  }

  const alreadyAttached = await isDebuggerAttached(tabId);
  if (alreadyAttached) {
    debuggerAttached = true;
    debuggerTabId = tabId;
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
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

    debuggerAttached = true;
    debuggerTabId = tabId;
    await log('DEBUGGER', 'Attached to tab', { tabId });
    return true;
  } catch (err) {
    debuggerAttached = false;
    debuggerTabId = null;
    await log('ERROR', `Failed to attach debugger: ${err.message}`);
    return false;
  }
}

async function detachDebugger() {
  if (!debuggerAttached) return;
  try {
    await chrome.debugger.detach({ tabId: debuggerTabId });
  } catch (err) {}
  debuggerAttached = false;
  debuggerTabId = null;
}

/**
 * Send a debugger command with auto-reattachment (like Claude in Chrome)
 * If debugger is not attached, reattach and retry the command
 */
async function sendDebuggerCommand(tabId, method, params = {}) {
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (err) {
    const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();

    // If debugger is not attached, reattach and retry (like Claude in Chrome)
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

// ============================================
// VISUAL INDICATORS
// ============================================

let indicatorTabId = null;

/**
 * Show the pulsing glow indicator on a tab
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
 */
async function hideAgentIndicators(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId || indicatorTabId, { type: 'HIDE_AGENT_INDICATORS' });
  } catch (e) {}
  indicatorTabId = null;
}

/**
 * Temporarily hide indicators for tool use (screenshots, etc.)
 */
async function hideIndicatorsForToolUse(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'HIDE_FOR_TOOL_USE' });
  } catch (e) {}
}

/**
 * Show indicators again after tool use
 */
async function showIndicatorsAfterToolUse(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_AFTER_TOOL_USE' });
  } catch (e) {}
  debuggerAttached = false;
  debuggerTabId = null;
  consoleMessages = [];
  networkRequests = [];
  networkTrackingEnabled = false;
}

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

async function sendToContent(tabId, type, payload = {}) {
  await ensureContentScripts(tabId);
  return await chrome.tabs.sendMessage(tabId, { type, payload }, { frameId: 0 });
}

// ============================================
// TOOL EXECUTION
// ============================================

async function executeTool(toolName, toolInput) {
  await log('TOOL', `Executing: ${toolName}`, toolInput);
  const tabId = toolInput.tabId;

  // Validate tab is in our group (for tools that use tabId)
  const tabTools = ['computer', 'read_page', 'find', 'form_input', 'navigate', 'get_page_text',
                    'javascript_tool', 'upload_image', 'read_console_messages', 'read_network_requests', 'resize_window'];
  if (tabId && tabTools.includes(toolName)) {
    const validation = await validateTabInGroup(tabId);
    if (!validation.valid) {
      return validation.error;
    }
  }

  switch (toolName) {
    // ----------------------------------------
    // COMPUTER TOOL
    // ----------------------------------------
    case 'computer': {
      const action = toolInput.action;

      switch (action) {
        case 'screenshot': {
          try {
            // Hide visual indicators before screenshot so they don't appear in the image
            await hideIndicatorsForToolUse(tabId);

            // Use CDP for screenshot (like Claude in Chrome)
            await ensureDebugger(tabId);

            // Get viewport info and DPR from tab
            const viewportInfo = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => ({
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1,
              }),
            });
            const { viewportWidth, viewportHeight, devicePixelRatio } = viewportInfo[0]?.result || {
              viewportWidth: 1280, viewportHeight: 720, devicePixelRatio: 1
            };

            const result = await sendDebuggerCommand(tabId, 'Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: false,
              fromSurface: true,
            });
            const dataUrl = `data:image/png;base64,${result.data}`;

            // Store screenshot for upload_image
            const imageId = `screenshot_${++screenshotCounter}`;
            capturedScreenshots.set(imageId, dataUrl);

            // Store screenshot context (viewport, DPR info)
            screenshotContexts.set(imageId, {
              viewportWidth,
              viewportHeight,
              screenshotWidth: Math.round(viewportWidth * devicePixelRatio),
              screenshotHeight: Math.round(viewportHeight * devicePixelRatio),
              devicePixelRatio,
            });

            // Collect for task logging
            taskScreenshots.push(dataUrl);
            // Record for GIF if recording
            if (gifRecording.isRecording) {
              gifRecording.frames.push({ dataUrl, timestamp: Date.now(), viewportWidth, viewportHeight });
            }

            // Show visual indicators again after screenshot
            await showIndicatorsAfterToolUse(tabId);

            return { type: 'screenshot', dataUrl, imageId, tabId };
          } catch (err) {
            // Show indicators again even on error
            await showIndicatorsAfterToolUse(tabId);
            return `Error taking screenshot: ${err.message}`;
          }
        }

        case 'zoom': {
          // Take screenshot of a specific region using CDP clip
          const [x0, y0, x1, y1] = toolInput.region || [0, 0, 200, 200];
          try {
            await ensureDebugger(tabId);
            // Use CDP clip parameter to actually crop the region
            const result = await sendDebuggerCommand(tabId, 'Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: false,
              fromSurface: true,
              clip: {
                x: x0,
                y: y0,
                width: x1 - x0,
                height: y1 - y0,
                scale: 1,
              },
            });
            const dataUrl = `data:image/png;base64,${result.data}`;
            const imageId = `zoom_${++screenshotCounter}`;
            capturedScreenshots.set(imageId, dataUrl);
            return {
              type: 'screenshot',
              dataUrl,
              imageId,
              region: { x0, y0, x1, y1 },
              note: `Zoomed region (${x0},${y0}) to (${x1},${y1}).`,
            };
          } catch (err) {
            return `Error taking zoom screenshot: ${err.message}`;
          }
        }

        case 'left_click':
        case 'right_click':
        case 'double_click':
        case 'triple_click': {
          let x, y;
          let rectInfo = null;
          if (toolInput.ref) {
            const result = await sendToContent(tabId, 'GET_ELEMENT_RECT', { ref: toolInput.ref });
            if (!result.success || !result.rect) {
              return `Error: ${result.error || 'Element not found'}`;
            }
            x = result.rect.centerX;
            y = result.rect.centerY;
            rectInfo = result.rect;
          } else if (toolInput.coordinate) {
            [x, y] = toolInput.coordinate;
          } else {
            return 'Error: No ref or coordinate provided for click';
          }

          // Debug logging for click coordinates (helps diagnose scaling issues)
          await log('CLICK', `${toolInput.ref || 'coordinate'} → (${Math.round(x)}, ${Math.round(y)})`, rectInfo);

          await ensureDebugger(tabId);
          const clickCount = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1;
          const button = action === 'right_click' ? 'right' : 'left';
          const buttonCode = button === 'left' ? 1 : 2;

          let modifiers = 0;
          if (toolInput.modifiers) {
            const modMap = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 };
            const mods = toolInput.modifiers.toLowerCase().split('+');
            for (const mod of mods) {
              modifiers |= modMap[mod.trim()] || 0;
            }
          }

          // Record tabs before click to detect new ones
          const tabsBeforeClick = new Set(agentOpenedTabs);

          // Move mouse first
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers,
          });
          await new Promise(r => setTimeout(r, 50));

          // Click
          for (let i = 1; i <= clickCount; i++) {
            await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
              type: 'mousePressed', x, y, button, buttons: buttonCode, clickCount: i, modifiers,
            });
            await new Promise(r => setTimeout(r, 12));
            await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i, modifiers,
            });
            if (i < clickCount) await new Promise(r => setTimeout(r, 80));
          }

          // Record for GIF
          if (gifRecording.isRecording) {
            gifRecording.actions.push({ type: 'click', x, y, clickCount });
          }

          // Wait a moment for potential new tab/window to open
          await new Promise(r => setTimeout(r, 300));

          // Check if new tabs were opened by this click (via our onCreated listener)
          const newTabIds = [...agentOpenedTabs].filter(id => !tabsBeforeClick.has(id));

          const clickType = clickCount === 1 ? 'Clicked' : clickCount === 2 ? 'Double-clicked' : 'Triple-clicked';
          let result = toolInput.ref
            ? `${clickType} on element ${toolInput.ref}`
            : `${clickType} at (${Math.round(x)}, ${Math.round(y)})`;

          // Inform agent about new tabs opened by this click
          if (newTabIds.length > 0) {
            result += `\n\nNote: This click opened new tab(s) with ID(s): ${newTabIds.join(', ')}. Use tabs_context to see all available tabs, then switch to the new tab if needed.`;
          }

          return result;
        }

        case 'hover': {
          let x, y;
          if (toolInput.ref) {
            const result = await sendToContent(tabId, 'GET_ELEMENT_RECT', { ref: toolInput.ref });
            if (!result.success || !result.rect) {
              return `Error: ${result.error || 'Element not found'}`;
            }
            x = result.rect.centerX;
            y = result.rect.centerY;
          } else if (toolInput.coordinate) {
            [x, y] = toolInput.coordinate;
          } else {
            return 'Error: No ref or coordinate provided for hover';
          }

          await ensureDebugger(tabId);
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x, y, button: 'none', buttons: 0,
          });
          return `Hovered at (${Math.round(x)}, ${Math.round(y)})`;
        }

        case 'left_click_drag': {
          const [startX, startY] = toolInput.start_coordinate || [0, 0];
          const [endX, endY] = toolInput.coordinate || [0, 0];

          await ensureDebugger(tabId);

          // Move to start
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: startX, y: startY, button: 'none', buttons: 0,
          });
          await new Promise(r => setTimeout(r, 50));

          // Press
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: startX, y: startY, button: 'left', buttons: 1, clickCount: 1,
          });
          await new Promise(r => setTimeout(r, 50));

          // Drag
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: endX, y: endY, button: 'left', buttons: 1,
          });
          await new Promise(r => setTimeout(r, 50));

          // Release
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: endX, y: endY, button: 'left', buttons: 0, clickCount: 1,
          });

          if (gifRecording.isRecording) {
            gifRecording.actions.push({ type: 'drag', startX, startY, endX, endY });
          }

          return `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`;
        }

        case 'type': {
          await ensureDebugger(tabId);
          await sendDebuggerCommand(tabId, 'Input.insertText', { text: toolInput.text });
          return `Typed: "${toolInput.text}"`;
        }

        case 'key': {
          const keys = toolInput.text.split(' ');
          const repeat = toolInput.repeat || 1;
          await ensureDebugger(tabId);

          for (let i = 0; i < repeat; i++) {
            for (const key of keys) {
              if (key.includes('+')) {
                await pressKeyChord(tabId, key);
              } else {
                const keyDef = getKeyCode(key);
                if (keyDef) {
                  const shiftMod = requiresShift(key) ? 8 : 0;
                  await pressKey(tabId, keyDef, shiftMod);
                } else {
                  await sendDebuggerCommand(tabId, 'Input.insertText', { text: key });
                }
              }
            }
          }
          return `Pressed: ${keys.join(' ')}${repeat > 1 ? ` (${repeat}x)` : ''}`;
        }

        case 'wait': {
          const seconds = Math.min(toolInput.duration || 1, 30);
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));
          return `Waited ${seconds} seconds`;
        }

        case 'scroll': {
          const direction = toolInput.scroll_direction;
          const amount = (toolInput.scroll_amount || 3) * 100;
          let deltaX = 0, deltaY = 0;
          if (direction === 'up') deltaY = -amount;
          if (direction === 'down') deltaY = amount;
          if (direction === 'left') deltaX = -amount;
          if (direction === 'right') deltaX = amount;

          const [x, y] = toolInput.coordinate || [400, 300];

          // Find scrollable container at coordinates and scroll it (like Claude in Chrome)
          // Uses behavior: "instant" for immediate scroll, falls back to window.scrollBy
          const scrollResult = await sendToContent(tabId, 'FIND_AND_SCROLL', {
            x, y, deltaX, deltaY, direction, amount
          });

          return `Scrolled ${direction} by ${amount}px in ${scrollResult.containerType || 'page'}`;
        }

        case 'scroll_to': {
          if (!toolInput.ref) {
            return 'Error: ref is required for scroll_to action';
          }
          const result = await sendToContent(tabId, 'SCROLL_TO_ELEMENT', { ref: toolInput.ref });
          if (result.success) {
            return `Scrolled to element ${toolInput.ref}`;
          }
          return `Error: ${result.error}`;
        }

        default:
          return `Error: Unknown action: ${action}`;
      }
    }

    // ----------------------------------------
    // READ_PAGE TOOL
    // ----------------------------------------
    case 'read_page': {
      const result = await sendToContent(tabId, 'READ_PAGE', {
        filter: toolInput.filter || 'interactive',  // Default to 'interactive' like Claude in Chrome
        depth: toolInput.depth || 15,
        ref_id: toolInput.ref_id,
        maxChars: toolInput.max_chars || 50000,
      });
      if (result.success) {
        // Match Claude in Chrome format exactly: elements first, then \n\nViewport at end
        const viewport = result.viewport ? `\n\nViewport: ${result.viewport.width}x${result.viewport.height}` : '';
        return `${result.tree}${viewport}`;
      }
      return `Error: ${result.error}`;
    }

    // ----------------------------------------
    // FIND TOOL
    // ----------------------------------------
    case 'find': {
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
        const aiResponse = await callClaudeSimple(findPrompt, 800);
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

        return `Found ${totalFound} element(s):\n\n` +
          matches.map(m => `- ${m.ref}: ${m.role} "${m.name}"${m.reason ? ` - ${m.reason}` : ''}`).join('\n');
      } catch (err) {
        return `Error in find: ${err.message}`;
      }
    }

    // ----------------------------------------
    // FORM_INPUT TOOL
    // ----------------------------------------
    case 'form_input': {
      const result = await sendToContent(tabId, 'FORM_INPUT', {
        ref: toolInput.ref,
        value: toolInput.value,
      });
      return result.success ? (result.output || 'Value set successfully') : `Error: ${result.error}`;
    }

    // ----------------------------------------
    // NAVIGATE TOOL
    // ----------------------------------------
    case 'navigate': {
      const url = toolInput.url;
      if (url === 'back') {
        await chrome.tabs.goBack(tabId);
        await new Promise(r => setTimeout(r, 1500));
        await ensureContentScripts(tabId);
        // Check for domain skills at new location
        const backTab = await chrome.tabs.get(tabId);
        const backSkills = getDomainSkills(backTab.url);
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
        const fwdSkills = getDomainSkills(fwdTab.url);
        if (fwdSkills.length > 0) {
          return `Navigated forward to ${fwdTab.url}\n\n<system-reminder>Domain skills for ${fwdSkills[0].domain}:\n${fwdSkills[0].skill}</system-reminder>`;
        }
        return 'Navigated forward';
      }
      let fullUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = `https://${url}`;
      }
      await chrome.tabs.update(tabId, { url: fullUrl });
      await new Promise(r => setTimeout(r, 2000));
      await ensureContentScripts(tabId);
      // Check for domain skills at new URL
      const skills = getDomainSkills(fullUrl);
      if (skills.length > 0) {
        return `Navigated to ${fullUrl}\n\n<system-reminder>Domain skills for ${skills[0].domain}:\n${skills[0].skill}</system-reminder>`;
      }
      return `Navigated to ${fullUrl}`;
    }

    // ----------------------------------------
    // GET_PAGE_TEXT TOOL
    // ----------------------------------------
    case 'get_page_text': {
      const result = await sendToContent(tabId, 'GET_PAGE_TEXT');
      if (result.success) {
        const maxChars = toolInput.max_chars || 50000;
        const text = result.text.substring(0, maxChars);
        return `Page text (${result.title}):\n${text}`;
      }
      return `Error: ${result.error}`;
    }

    // ----------------------------------------
    // JAVASCRIPT_TOOL
    // ----------------------------------------
    case 'javascript_tool': {
      if (toolInput.action !== 'javascript_exec') {
        return `Error: action must be 'javascript_exec'`;
      }
      try {
        // Escape backticks and dollar signs for template literal safety
        const escapedCode = toolInput.text.replace(/`/g, '\\`').replace(/\$/g, '\\$');

        // Wrap in IIFE with strict mode (matching Claude in Chrome)
        const expression = `
          (function() {
            'use strict';
            try {
              return eval(\`${escapedCode}\`);
            } catch (e) {
              throw e;
            }
          })()
        `;

        // Use Chrome DevTools Protocol Runtime.evaluate (bypasses CSP!)
        // This runs in the debugger context, not the page context
        const result = await sendDebuggerCommand(tabId, 'Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
          timeout: 10000,
        });

        if (result.exceptionDetails) {
          return `Error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Unknown error'}`;
        }

        // Filter sensitive data (matching Claude in Chrome)
        const filterSensitive = (value, depth = 0) => {
          if (depth > 5) return '[TRUNCATED: Max depth exceeded]';

          const sensitivePatterns = [/password/i, /token/i, /secret/i, /api[_-]?key/i, /auth/i, /credential/i, /private[_-]?key/i];

          if (typeof value === 'string') {
            // Block cookie/query strings
            if (value.includes('=') && (value.includes(';') || value.includes('&'))) {
              return '[BLOCKED: Cookie/query string data]';
            }
            // Block JWT tokens
            if (value.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
              return '[BLOCKED: JWT token]';
            }
            // Truncate long strings
            if (value.length > 1000) return value.substring(0, 1000) + '[TRUNCATED]';
          }

          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const filtered = {};
            for (const [key, val] of Object.entries(value)) {
              const isSensitive = sensitivePatterns.some(p => p.test(key));
              filtered[key] = isSensitive ? '[BLOCKED: Sensitive key]' : filterSensitive(val, depth + 1);
            }
            return filtered;
          }

          return value;
        };

        let output = result.result?.value;
        if (output === undefined) return 'undefined';
        if (output === null) return 'null';
        if (typeof output === 'object') {
          output = filterSensitive(output);
          return JSON.stringify(output, null, 2);
        }
        return String(output);
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    // ----------------------------------------
    // FILE_UPLOAD TOOL
    // ----------------------------------------
    case 'file_upload': {
      try {
        await ensureDebugger(tabId);

        // Find the file input element
        let nodeId;
        if (toolInput.ref) {
          // Use ref to find the element
          const result = await sendToContent(tabId, 'GET_ELEMENT_SELECTOR', { ref: toolInput.ref });
          if (!result.success) {
            return `Error: Could not find element with ref ${toolInput.ref}`;
          }
          // Get the DOM node using the selector
          const doc = await sendDebuggerCommand(tabId, 'DOM.getDocument');
          const node = await sendDebuggerCommand(tabId, 'DOM.querySelector', {
            nodeId: doc.root.nodeId,
            selector: result.selector,
          });
          nodeId = node.nodeId;
        } else if (toolInput.selector) {
          // Use CSS selector directly
          const doc = await sendDebuggerCommand(tabId, 'DOM.getDocument');
          const node = await sendDebuggerCommand(tabId, 'DOM.querySelector', {
            nodeId: doc.root.nodeId,
            selector: toolInput.selector,
          });
          if (!node.nodeId) {
            return `Error: Could not find element with selector "${toolInput.selector}"`;
          }
          nodeId = node.nodeId;
        } else {
          return 'Error: Either ref or selector must be provided';
        }

        // Verify it's a file input
        const nodeInfo = await sendDebuggerCommand(tabId, 'DOM.describeNode', { nodeId });
        if (nodeInfo.node.nodeName !== 'INPUT') {
          return `Error: Element is not an input element (found: ${nodeInfo.node.nodeName})`;
        }

        // Determine file source and prepare the file
        let filePath;

        if (toolInput.filePath) {
          // Use local file path directly
          filePath = toolInput.filePath;
        } else if (toolInput.fileUrl) {
          // Download file from URL using chrome.downloads API
          const fileName = toolInput.fileName || toolInput.fileUrl.split('/').pop() || 'downloaded_file';
          const downloadId = await new Promise((resolve, reject) => {
            chrome.downloads.download({
              url: toolInput.fileUrl,
              filename: `browser-agent-uploads/${fileName}`,
              conflictAction: 'uniquify',
            }, (id) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(id);
              }
            });
          });

          // Wait for download to complete
          filePath = await new Promise((resolve, reject) => {
            const listener = (delta) => {
              if (delta.id === downloadId) {
                if (delta.state?.current === 'complete') {
                  chrome.downloads.onChanged.removeListener(listener);
                  chrome.downloads.search({ id: downloadId }, (results) => {
                    if (results && results[0]) {
                      resolve(results[0].filename);
                    } else {
                      reject(new Error('Could not find downloaded file'));
                    }
                  });
                } else if (delta.state?.current === 'interrupted') {
                  chrome.downloads.onChanged.removeListener(listener);
                  reject(new Error('Download interrupted'));
                }
              }
            };
            chrome.downloads.onChanged.addListener(listener);

            // Timeout after 60 seconds
            setTimeout(() => {
              chrome.downloads.onChanged.removeListener(listener);
              reject(new Error('Download timeout'));
            }, 60000);
          });
        } else {
          return 'Error: Must provide filePath or fileUrl';
        }

        // Use CDP to set the file on the input element
        await sendDebuggerCommand(tabId, 'DOM.setFileInputFiles', {
          files: [filePath],
          nodeId: nodeId,
        });

        // Extract filename from path for the success message
        const uploadedFileName = filePath.split('/').pop() || filePath;
        return `Successfully uploaded file "${uploadedFileName}" to the file input element`;
      } catch (err) {
        return `Error uploading file: ${err.message}`;
      }
    }

    // ----------------------------------------
    // TABS_CONTEXT TOOL
    // ----------------------------------------
    case 'tabs_context': {
      let tabs = [];
      const existingTabIds = new Set();

      // 1. Get tabs in our group across ALL windows
      if (sessionTabGroupId !== null) {
        const groupTabs = await chrome.tabs.query({ groupId: sessionTabGroupId });
        for (const tab of groupTabs) {
          tabs.push(tab);
          existingTabIds.add(tab.id);
        }
      }

      // 2. Add tabs opened by agent actions (popups, new windows from clicks)
      for (const tabId of agentOpenedTabs) {
        if (!existingTabIds.has(tabId)) {
          try {
            const tab = await chrome.tabs.get(tabId);
            if (tab && !tab.url?.startsWith('chrome://')) {
              tabs.push(tab);
              existingTabIds.add(tab.id);
            }
          } catch (e) {
            // Tab was closed, remove from tracking
            agentOpenedTabs.delete(tabId);
          }
        }
      }

      // 3. FALLBACK: Scan all popup windows for tabs during active session
      // This catches popups that weren't detected by listeners
      if (agentSessionActive) {
        try {
          const allWindows = await chrome.windows.getAll({ windowTypes: ['popup'] });
          for (const window of allWindows) {
            const windowTabs = await chrome.tabs.query({ windowId: window.id });
            for (const tab of windowTabs) {
              if (!existingTabIds.has(tab.id) && !tab.url?.startsWith('chrome://') && !tab.url?.startsWith('chrome-extension://')) {
                tabs.push(tab);
                existingTabIds.add(tab.id);
                // Also add to tracking for future reference
                agentOpenedTabs.add(tab.id);
                console.log(`[TABS_CONTEXT] Found untracked popup tab: ${tab.id} - ${tab.url}`);
              }
            }
          }
        } catch (e) {
          console.log(`[TABS_CONTEXT] Error scanning popup windows: ${e.message}`);
        }
      }

      // 4. If still no tabs, return active tab
      if (tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
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
        note: 'Showing tabs in Agent group, agent-opened tabs, and popup windows'
      }, null, 2);
    }

    // ----------------------------------------
    // TABS_CREATE TOOL
    // ----------------------------------------
    case 'tabs_create': {
      const newTab = await chrome.tabs.create({ url: 'chrome://newtab' });
      // Add to session's tab group
      await addTabToGroup(newTab.id);
      return `Created new tab with ID: ${newTab.id} (added to Agent group)`;
    }

    // ----------------------------------------
    // UPDATE_PLAN TOOL
    // ----------------------------------------
    case 'update_plan': {
      const { domains, approach } = toolInput;

      // If askBeforeActing is disabled, auto-approve
      if (!askBeforeActing) {
        approvedDomains = new Set(domains);
        return `Plan auto-approved. Proceeding with:\n${approach.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      }

      // Send plan to popup and wait for approval
      const approval = await new Promise(resolve => {
        pendingPlanResolve = resolve;
        chrome.runtime.sendMessage({
          type: 'PLAN_APPROVAL_REQUIRED',
          plan: { domains, approach },
        }).catch(() => {});
      });

      if (approval.approved) {
        approvedDomains = new Set(domains);
        return `Plan approved by user. Proceeding with:\n${approach.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      } else {
        return { cancelled: true, message: 'User cancelled the plan' };
      }
    }

    // ----------------------------------------
    // TURN_ANSWER_START TOOL
    // ----------------------------------------
    case 'turn_answer_start': {
      return 'Ready to respond to user.';
    }

    // ----------------------------------------
    // UPLOAD_IMAGE TOOL
    // ----------------------------------------
    case 'upload_image': {
      const { imageId, ref, coordinate, filename } = toolInput;

      const dataUrl = capturedScreenshots.get(imageId);
      if (!dataUrl) {
        return `Error: No image found with ID "${imageId}". Take a screenshot first.`;
      }

      // Execute upload in content script
      const result = await sendToContent(tabId, 'UPLOAD_IMAGE', {
        dataUrl,
        ref,
        coordinate,
        filename: filename || 'image.png',
      });

      return result.success ? result.output : `Error: ${result.error}`;
    }

    // ----------------------------------------
    // READ_CONSOLE_MESSAGES TOOL
    // ----------------------------------------
    case 'read_console_messages': {
      await ensureDebugger(tabId);
      const pattern = toolInput.pattern;
      const limit = toolInput.limit || 100;
      let messages = [...consoleMessages];

      if (toolInput.onlyErrors) {
        messages = messages.filter(m => m.type === 'error' || m.type === 'exception');
      }
      if (pattern) {
        try {
          const regex = new RegExp(pattern, 'i');
          messages = messages.filter(m => regex.test(m.text));
        } catch (e) {
          return `Invalid regex: ${pattern}`;
        }
      }

      if (toolInput.clear) {
        consoleMessages = [];
      }

      messages = messages.slice(-limit);

      if (messages.length === 0) {
        return 'No console messages found' + (pattern ? ` matching "${pattern}"` : '');
      }

      return `Found ${messages.length} messages:\n` +
        messages.map(m => `[${m.type.toUpperCase()}] ${m.text}`).join('\n');
    }

    // ----------------------------------------
    // READ_NETWORK_REQUESTS TOOL
    // ----------------------------------------
    case 'read_network_requests': {
      await ensureDebugger(tabId);
      if (!networkTrackingEnabled) {
        try {
          await sendDebuggerCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
          networkTrackingEnabled = true;
        } catch (err) {
          return `Error enabling network tracking: ${err.message}`;
        }
      }

      const pattern = toolInput.urlPattern;
      const limit = toolInput.limit || 100;
      let requests = [...networkRequests];

      if (pattern) {
        requests = requests.filter(r => r.url.includes(pattern));
      }

      if (toolInput.clear) {
        networkRequests = [];
      }

      requests = requests.slice(-limit);

      if (requests.length === 0) {
        return 'No network requests found' + (pattern ? ` matching "${pattern}"` : '');
      }

      return `Found ${requests.length} requests:\n` +
        requests.map(r => `[${r.method}] ${r.url}${r.status ? ` (${r.status})` : ''}`).join('\n');
    }

    // ----------------------------------------
    // RESIZE_WINDOW TOOL
    // ----------------------------------------
    case 'resize_window': {
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, {
          width: toolInput.width,
          height: toolInput.height,
        });
        return `Resized window to ${toolInput.width}x${toolInput.height}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    // ----------------------------------------
    // GIF_CREATOR TOOL
    // ----------------------------------------
    case 'gif_creator': {
      const action = toolInput.action;

      switch (action) {
        case 'start_recording':
          gifRecording = { isRecording: true, frames: [], actions: [] };
          return 'GIF recording started. Take screenshots to capture frames.';

        case 'stop_recording':
          gifRecording.isRecording = false;
          return `Recording stopped. ${gifRecording.frames.length} frames captured.`;

        case 'clear':
          gifRecording = { isRecording: false, frames: [], actions: [] };
          return 'GIF recording cleared.';

        case 'export':
          if (gifRecording.frames.length === 0) {
            return 'Error: No frames to export. Take screenshots while recording.';
          }
          // For now, just download the frames as a zip or first frame
          // Full GIF encoding would require a library like gif.js
          return `GIF export not fully implemented. ${gifRecording.frames.length} frames available.`;

        default:
          return `Unknown gif_creator action: ${action}`;
      }
    }

    default:
      return `Error: Unknown tool ${toolName}`;
  }
}

// ============================================
// AGENT LOOP
// ============================================

async function runAgentLoop(initialTabId, task, onUpdate, image = null, askBeforeActing = true, existingHistory = []) {
  await clearLog();
  await log('START', 'Agent loop started', { tabId: initialTabId, task: task.substring(0, 100) });

  // Create tab group for this session
  await ensureTabGroup(initialTabId);

  // Get tab info for system-reminder (matching Claude in Chrome format)
  let tabInfo = { availableTabs: [], initialTabId, domainSkills: [] };
  try {
    const tab = await chrome.tabs.get(initialTabId);
    tabInfo.availableTabs = [{
      tabId: initialTabId,
      title: tab.title || 'New Tab',
      url: tab.url || 'chrome://newtab/',
    }];

    // Add domain-specific skills if available for this site
    const skills = getDomainSkills(tab.url);
    if (skills.length > 0) {
      tabInfo.domainSkills = skills.map(s => ({ domain: s.domain, skill: s.skill }));
    }
  } catch (e) {
    // Tab not accessible, use defaults
  }

  // Build new user message with optional image and system-reminders (matching Claude in Chrome format)
  const userContent = [];

  // Add image first if present
  if (image) {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = image.match(/^data:(image\/\w+);/)?.[1] || 'image/png';
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } });
  }

  // Add task text
  userContent.push({ type: 'text', text: task });

  // Add tab context as system-reminder (matching Claude in Chrome format)
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
  const messages = [...existingHistory, { role: 'user', content: userContent }];
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

    // Stream text chunks to UI
    let streamedText = '';
    const onTextChunk = (chunk) => {
      streamedText += chunk;
      onUpdate({ step: steps, status: 'streaming', text: streamedText });
    };

    let response;
    try {
      response = await callClaude(messages, onTextChunk, log);
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

      const result = await executeTool(toolUse.name, toolUse.input);

      // Check for cancellation
      if (result && result.cancelled) {
        return { success: false, message: result.message, messages, steps };
      }

      // Handle screenshot results
      if (result && result.type === 'screenshot' && result.dataUrl) {
        // Get DPR from the tab to resize screenshot to 1x (CSS pixels)
        const screenshotTabId = toolUse.input?.tabId;
        const dpr = screenshotTabId ? await getTabDPR(screenshotTabId) : 2;
        const resizedDataUrl = await resizeScreenshotForClaude(result.dataUrl, dpr);
        const base64Data = resizedDataUrl.replace(/^data:image\/\w+;base64,/, '');
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: [
            { type: 'text', text: result.imageId ? `Screenshot captured (ID: ${result.imageId})` : 'Screenshot captured' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } },
          ],
        });
        onUpdate({ step: steps, status: 'executed', tool: toolUse.name, input: toolUse.input, result: 'Screenshot captured' });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
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

async function startTask(tabId, task, shouldAskBeforeActing = true, image = null) {
  // Reset state for new task (but preserve conversation history)
  sessionTabGroupId = null;
  agentOpenedTabs.clear();  // Clear tracked tabs from previous session
  agentSessionActive = true;  // Mark session as active for popup tracking
  sessionId = generateSessionId();
  askBeforeActing = shouldAskBeforeActing;
  taskCancelled = false;
  taskScreenshots = [];
  taskDebugLog = []; // Clear debug log for new task

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
    }, image, askBeforeActing, conversationHistory);

    // Update conversation history with the full message history from this run
    if (result.messages) {
      conversationHistory = result.messages;
    }

    await detachDebugger();
    agentSessionActive = false;  // Mark session as inactive
    currentTask.status = result.success ? 'completed' : 'failed';
    currentTask.result = result;
    currentTask.endTime = new Date().toISOString();

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
      startTask(payload.tabId, payload.task, payload.askBeforeActing !== false, payload.image)
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
      chrome.storage.local.get([LOG_KEY]).then(data => {
        sendResponse({ log: data[LOG_KEY] || [] });
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

    case 'CLEAR_CHAT':
    case 'CLEAR_CONVERSATION':
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
