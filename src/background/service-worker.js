/**
 * Service Worker - Claude in Chrome Clone
 *
 * Orchestrates browser automation by:
 * 1. Receiving tasks from the popup
 * 2. Calling Claude API with tools
 * 3. Executing tool calls via content scripts
 * 4. Looping until task is complete
 */

import { TOOL_DEFINITIONS } from '../tools/definitions.js';

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
// CONFIGURATION
// ============================================

let config = {
  apiBaseUrl: 'http://127.0.0.1:8000/claude/v1/messages',
  apiKey: null, // Optional API key for direct API access
  model: 'claude-sonnet-4-20250514', // Default model (overridden by UI setting)
  maxTokens: 10000,
  maxSteps: 0,
};

// ============================================
// DOMAIN SKILLS
// ============================================

/**
 * Domain-specific skills and best practices for common websites.
 * These are injected into the agent's context when visiting matching domains.
 */
const DOMAIN_SKILLS = [
  {
    domain: 'mail.google.com',
    skill: `Gmail best practices:
- To open an email, click directly on the email subject/preview text, NOT the checkbox or star
- Use keyboard shortcuts: 'c' to compose, 'r' to reply, 'a' to reply all, 'f' to forward, 'e' to archive
- To search, use the search bar at the top with operators like 'from:', 'to:', 'subject:', 'is:unread'
- Reading pane may be on the right or below depending on user settings - check which layout is active
- Verification codes are often in emails from 'noreply@' addresses with subjects containing 'verification', 'code', or 'confirm'`
  },
  {
    domain: 'docs.google.com',
    skill: `Google Docs best practices:
- This is a canvas-based application - use screenshots to see content, read_page may not capture all text
- Use keyboard shortcuts: Cmd/Ctrl+B for bold, Cmd/Ctrl+I for italic, Cmd/Ctrl+K for links
- To navigate, use Cmd/Ctrl+F to find text, then click on the result
- For editing, click to place cursor then type - triple-click to select a paragraph
- Access menus via the menu bar at the top (File, Edit, View, Insert, Format, etc.)`
  },
  {
    domain: 'sheets.google.com',
    skill: `Google Sheets best practices:
- Click on cells to select them, double-click to edit cell content
- Use Tab to move right, Enter to move down, arrow keys to navigate
- Formulas start with '=' - e.g., =SUM(A1:A10), =VLOOKUP(), =IF()
- Use Cmd/Ctrl+C and Cmd/Ctrl+V for copy/paste
- Select ranges by clicking and dragging, or Shift+click for range selection`
  },
  {
    domain: 'github.com',
    skill: `GitHub best practices:
- Repository navigation: Code tab for files, Issues for bug tracking, Pull requests for code review
- To view a file, click on the filename in the file tree
- Use 't' to open file finder, 'l' to jump to a line
- In PRs: 'Files changed' tab shows diffs, 'Conversation' tab shows comments
- Use the search bar with qualifiers: 'is:open is:pr', 'is:issue label:bug'`
  },
  {
    domain: 'linkedin.com',
    skill: `LinkedIn best practices:
- Job search: Use the Jobs tab, filter by location, experience level, date posted
- To apply: Click 'Easy Apply' button if available, or 'Apply' to go to external site
- Profile sections are collapsible - click 'Show all' to expand
- Connection requests and messages are in the 'My Network' and 'Messaging' tabs
- Use search filters to narrow down people, companies, or jobs`
  },
  {
    domain: 'indeed.com',
    skill: `Indeed best practices:
- Search for jobs using the 'What' and 'Where' fields at the top
- Filter results by date posted, salary, job type, experience level
- Click job title to view full description
- 'Apply now' or 'Apply on company site' buttons are typically on the right panel
- Sign in to save jobs and track applications`
  },
  {
    domain: 'calendar.google.com',
    skill: `Google Calendar best practices:
- Click on a time slot to create a new event
- Drag events to reschedule them
- Click on an event to view details, edit, or delete
- Use the mini calendar on the left to navigate to different dates
- Keyboard: 'c' to create event, 't' to go to today, arrow keys to navigate`
  },
  {
    domain: 'drive.google.com',
    skill: `Google Drive best practices:
- Double-click files to open them, single-click to select
- Right-click for context menu (download, share, rename, etc.)
- Use the search bar to find files by name or content
- Create new items with the '+ New' button on the left
- Drag and drop to move files between folders`
  },
  {
    domain: 'notion.so',
    skill: `Notion best practices:
- Click to place cursor, type '/' to open command menu
- Drag blocks using the ⋮⋮ handle on the left
- Use sidebar for navigation between pages
- Toggle blocks expand/collapse on click
- Databases can be viewed as table, board, calendar, etc.`
  },
  {
    domain: 'figma.com',
    skill: `Figma best practices:
- This is a canvas-based design tool - always use screenshots to see content
- Use 'V' for select tool, 'R' for rectangle, 'T' for text
- Zoom with Cmd/Ctrl+scroll or Cmd/Ctrl++ and Cmd/Ctrl+-
- Navigate frames in the left sidebar
- Right-click for context menus and additional options`
  },
  {
    domain: 'slack.com',
    skill: `Slack best practices:
- Channels listed in left sidebar - click to switch
- Cmd/Ctrl+K to quickly switch channels/DMs
- @ mentions notify users, # references channels
- Thread replies keep conversations organized
- Use the search bar to find messages, files, and people`
  },
  {
    domain: 'twitter.com',
    skill: `X/Twitter best practices:
- Compose new post with the 'Post' or compose button
- Scroll to load more content
- Click on a post to view full thread and replies
- Like, repost, reply buttons are below each post
- Use search with operators: 'from:user', 'to:user', 'filter:media'`
  },
  {
    domain: 'x.com',
    skill: `X/Twitter best practices:
- Compose new post with the 'Post' or compose button
- Scroll to load more content
- Click on a post to view full thread and replies
- Like, repost, reply buttons are below each post
- Use search with operators: 'from:user', 'to:user', 'filter:media'`
  },
  {
    domain: 'amazon.com',
    skill: `Amazon best practices:
- Use the search bar at the top for product search
- Filter results using the left sidebar (price, ratings, Prime, etc.)
- Click 'Add to Cart' or 'Buy Now' to purchase
- Product details and reviews are on the product page
- Check seller information and shipping times before purchasing`
  },
];

/**
 * Get domain skills for a given URL
 * @param {string} url - The URL to check
 * @returns {Array} - Array of matching domain skills
 */
function getDomainSkills(url) {
  if (!url) return [];

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return DOMAIN_SKILLS.filter(skill => {
      // Check if the hostname ends with or equals the skill domain
      return hostname === skill.domain || hostname.endsWith('.' + skill.domain);
    });
  } catch {
    return [];
  }
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
    return results[0]?.result || 1;
  } catch {
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
let abortController = null; // For aborting API calls on stop
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
        color: 'orange',
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
 * Validate that a tab is in our session's group
 */
async function validateTabInGroup(tabId) {
  if (sessionTabGroupId === null) {
    // No group yet - allow any tab
    return { valid: true };
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === sessionTabGroupId) {
      return { valid: true };
    } else {
      return {
        valid: false,
        error: `Tab ${tabId} is not in the Agent group. Use tabs_context to see available tabs, or tabs_create to make a new one.`
      };
    }
  } catch (err) {
    return { valid: false, error: `Tab ${tabId} not found: ${err.message}` };
  }
}

// ============================================
// SYSTEM PROMPT - Claude in Chrome style
// ============================================

function buildSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US');

  return [
    {
      type: 'text',
      text: `You are a web automation assistant with browser tools. Your priority is to complete the user's request efficiently and autonomously.

Browser tasks often require long-running, agentic capabilities. When you encounter a user request that feels time-consuming or extensive in scope, you should be persistent and use all available context needed to accomplish the task. The user expects you to work autonomously until the task is complete. Do not ask for permission - just do it.

<behavior_instructions>
The current date is ${dateStr}, ${timeStr}.

Claude avoids over-formatting responses. Keep responses concise and action-oriented.
Claude does not use emojis unless asked.

IMPORTANT: Do not ask for permission or confirmation. The user has already given you all the information you need. Just complete the task.
</behavior_instructions>

<tool_usage_requirements>
Claude uses the "read_page" tool first to assign reference identifiers to all DOM elements and get an overview of the page. This allows Claude to reliably take action on the page even if the viewport size changes or the element is scrolled out of view.

Claude takes action on the page using explicit references to DOM elements (e.g. ref_123) using the "left_click" action of the "computer" tool and the "form_input" tool whenever possible and only uses coordinate-based actions when references fail or if Claude needs to use an action that doesn't support references (e.g. dragging).

Claude avoids repeatedly scrolling down the page to read long web pages, instead Claude uses the "get_page_text" tool and "read_page" tools to efficiently read the content.

Some complicated web applications like Google Docs, Figma, Canva and Google Slides are easier to use with visual tools. If Claude does not find meaningful content on the page when using the "read_page" tool, then Claude uses screenshots to see the content.
</tool_usage_requirements>`,
    },
    {
      type: 'text',
      text: `Platform-specific information:
- You are on a Mac system
- Use "cmd" as the modifier key for keyboard shortcuts (e.g., "cmd+a" for select all, "cmd+c" for copy, "cmd+v" for paste)`,
    },
    {
      type: 'text',
      text: `<browser_tabs_usage>
You have the ability to work with multiple browser tabs simultaneously. This allows you to be more efficient by working on different tasks in parallel.
## Getting Tab Information
IMPORTANT: If you don't have a valid tab ID, you can call the "tabs_context" tool first to get the list of available tabs:
- tabs_context: {} (no parameters needed - returns all tabs in the current group)
## Tab Context Information
Tool results and user messages may include <system-reminder> tags. <system-reminder> tags contain useful information and reminders. They are NOT part of the user's provided input or the tool result, but may contain tab context information.
After a tool execution or user message, you may receive tab context as <system-reminder> if the tab context has changed, showing available tabs in JSON format.
Example tab context:
<system-reminder>{"availableTabs":[{"tabId":<TAB_ID_1>,"title":"Google","url":"https://google.com"},{"tabId":<TAB_ID_2>,"title":"GitHub","url":"https://github.com"}],"initialTabId":<TAB_ID_1>,"domainSkills":[{"domain":"google.com","skill":"Search tips..."}]}</system-reminder>
The "initialTabId" field indicates the tab where the user interacts with Claude and is what the user may refer to as "this tab" or "this page".
The "domainSkills" field contains domain-specific guidance and best practices for working with particular websites.
## Using the tabId Parameter (REQUIRED)
The tabId parameter is REQUIRED for all tools that interact with tabs. You must always specify which tab to use:
- computer tool: {"action": "screenshot", "tabId": <TAB_ID>}
- navigate tool: {"url": "https://example.com", "tabId": <TAB_ID>}
- read_page tool: {"tabId": <TAB_ID>}
- find tool: {"query": "search button", "tabId": <TAB_ID>}
- get_page_text tool: {"tabId": <TAB_ID>}
- form_input tool: {"ref": "ref_1", "value": "text", "tabId": <TAB_ID>}
## Creating New Tabs
Use the tabs_create tool to create new empty tabs:
- tabs_create: {} (creates a new tab at chrome://newtab in the current group)
## Best Practices
- ALWAYS call the "tabs_context" tool first if you don't have a valid tab ID
- Use multiple tabs to work more efficiently (e.g., researching in one tab while filling forms in another)
- Pay attention to the tab context after each tool use to see updated tab information
- Remember that new tabs created by clicking links or using the "tabs_create" tool will automatically be added to your available tabs
- Each tab maintains its own state (scroll position, loaded page, etc.)
## Tab Management
- Tabs are automatically grouped together when you create them through navigation, clicking, or "tabs_create"
- Tab IDs are unique numbers that identify each tab
- Tab titles and URLs help you identify which tab to use for specific tasks
</browser_tabs_usage>`,
    },
    {
      type: 'text',
      text: `<turn_answer_start_instructions>
Before outputting any text response to the user this turn, call turn_answer_start first.

WITH TOOL CALLS: After completing all tool calls, call turn_answer_start, then write your response.
WITHOUT TOOL CALLS: Call turn_answer_start immediately, then write your response.

RULES:
- Call exactly once per turn
- Call immediately before your text response
- NEVER call during intermediate thoughts, reasoning, or while planning to use more tools
- No more tools after calling this
</turn_answer_start_instructions>`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

// ============================================
// DEBUGGER MANAGEMENT
// ============================================

function registerDebuggerListener() {
  if (debuggerListenerRegistered) return;
  debuggerListenerRegistered = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId !== debuggerTabId) return;

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

  const alreadyAttached = await isDebuggerAttached(tabId);
  if (alreadyAttached) {
    debuggerAttached = true;
    debuggerTabId = tabId;
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    } catch (e) {}
    return true;
  }

  try {
    if (debuggerTabId && debuggerTabId !== tabId) {
      try {
        await chrome.debugger.detach({ tabId: debuggerTabId });
      } catch (e) {}
    }

    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');

    debuggerAttached = true;
    debuggerTabId = tabId;
    await log('DEBUGGER', 'Attached to tab', { tabId });
    return true;
  } catch (err) {
    await log('ERROR', `Failed to attach debugger: ${err.message}`);
    return false;
  }
}

async function detachDebugger() {
  if (!debuggerAttached) return;
  try {
    await chrome.debugger.detach({ tabId: debuggerTabId });
  } catch (err) {}

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
// KEY DEFINITIONS
// ============================================

const KEY_DEFINITIONS = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  f1: { key: 'F1', code: 'F1', keyCode: 112 },
  f2: { key: 'F2', code: 'F2', keyCode: 113 },
  f3: { key: 'F3', code: 'F3', keyCode: 114 },
  f4: { key: 'F4', code: 'F4', keyCode: 115 },
  f5: { key: 'F5', code: 'F5', keyCode: 116 },
  f6: { key: 'F6', code: 'F6', keyCode: 117 },
  f7: { key: 'F7', code: 'F7', keyCode: 118 },
  f8: { key: 'F8', code: 'F8', keyCode: 119 },
  f9: { key: 'F9', code: 'F9', keyCode: 120 },
  f10: { key: 'F10', code: 'F10', keyCode: 121 },
  f11: { key: 'F11', code: 'F11', keyCode: 122 },
  f12: { key: 'F12', code: 'F12', keyCode: 123 },
};

function getKeyCode(key) {
  const lowerKey = key.toLowerCase();
  const def = KEY_DEFINITIONS[lowerKey];
  if (def) return def;

  if (key.length === 1) {
    const upper = key.toUpperCase();
    let code;
    if (upper >= 'A' && upper <= 'Z') {
      code = `Key${upper}`;
    } else if (key >= '0' && key <= '9') {
      code = `Digit${key}`;
    } else {
      return null;
    }
    return { key, code, keyCode: upper.charCodeAt(0), text: key };
  }
  return null;
}

function requiresShift(char) {
  return '~!@#$%^&*()_+{}|:"<>?'.includes(char) || (char >= 'A' && char <= 'Z');
}

async function pressKey(tabId, keyDef, modifiers = 0) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: keyDef.text ? 'keyDown' : 'rawKeyDown',
    key: keyDef.key,
    code: keyDef.code,
    windowsVirtualKeyCode: keyDef.keyCode,
    modifiers,
    text: keyDef.text || '',
    unmodifiedText: keyDef.text || '',
  });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyDef.key,
    code: keyDef.code,
    windowsVirtualKeyCode: keyDef.keyCode,
    modifiers,
  });
}

async function pressKeyChord(tabId, chord) {
  const parts = chord.toLowerCase().split('+');
  let mainKey = '';
  const modMap = { alt: 1, option: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, command: 4, shift: 8 };
  let modifiers = 0;

  for (const part of parts) {
    if (modMap[part] !== undefined) {
      modifiers |= modMap[part];
    } else {
      mainKey = part;
    }
  }

  if (mainKey) {
    const keyDef = getKeyCode(mainKey);
    if (keyDef) await pressKey(tabId, keyDef, modifiers);
  }
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

            const result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
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
            const result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
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
            return 'Error: No ref or coordinate provided for click';
          }

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

          // Move mouse first
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers,
          });
          await new Promise(r => setTimeout(r, 50));

          // Click
          for (let i = 1; i <= clickCount; i++) {
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
              type: 'mousePressed', x, y, button, buttons: buttonCode, clickCount: i, modifiers,
            });
            await new Promise(r => setTimeout(r, 12));
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i, modifiers,
            });
            if (i < clickCount) await new Promise(r => setTimeout(r, 80));
          }

          // Record for GIF
          if (gifRecording.isRecording) {
            gifRecording.actions.push({ type: 'click', x, y, clickCount });
          }

          const clickType = clickCount === 1 ? 'Clicked' : clickCount === 2 ? 'Double-clicked' : 'Triple-clicked';
          return toolInput.ref
            ? `${clickType} on element ${toolInput.ref}`
            : `${clickType} at (${Math.round(x)}, ${Math.round(y)})`;
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
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x, y, button: 'none', buttons: 0,
          });
          return `Hovered at (${Math.round(x)}, ${Math.round(y)})`;
        }

        case 'left_click_drag': {
          const [startX, startY] = toolInput.start_coordinate || [0, 0];
          const [endX, endY] = toolInput.coordinate || [0, 0];

          await ensureDebugger(tabId);

          // Move to start
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: startX, y: startY, button: 'none', buttons: 0,
          });
          await new Promise(r => setTimeout(r, 50));

          // Press
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: startX, y: startY, button: 'left', buttons: 1, clickCount: 1,
          });
          await new Promise(r => setTimeout(r, 50));

          // Drag
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: endX, y: endY, button: 'left', buttons: 1,
          });
          await new Promise(r => setTimeout(r, 50));

          // Release
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: endX, y: endY, button: 'left', buttons: 0, clickCount: 1,
          });

          if (gifRecording.isRecording) {
            gifRecording.actions.push({ type: 'drag', startX, startY, endX, endY });
          }

          return `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`;
        }

        case 'type': {
          await ensureDebugger(tabId);
          await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: toolInput.text });
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
                  await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: key });
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

          // Find scrollable container at coordinates and scroll it
          const scrollResult = await sendToContent(tabId, 'FIND_AND_SCROLL', {
            x, y, deltaX, deltaY, direction, amount
          });

          if (scrollResult.scrolledContainer) {
            return `Scrolled ${direction} by ${amount}px in ${scrollResult.containerType}`;
          }

          // Fallback to mouse wheel event if no scrollable container found
          await ensureDebugger(tabId);
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseWheel', x, y, deltaX, deltaY,
          });
          return `Scrolled ${direction} by ${amount}px`;
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
        filter: toolInput.filter || 'all',
        depth: toolInput.depth || 15,
        ref_id: toolInput.ref_id,
        maxChars: toolInput.max_chars || 50000,
      });
      if (result.success) {
        const viewport = result.viewport ? `\nViewport: ${result.viewport.width}x${result.viewport.height}` : '';
        return `Page: ${result.title}\nURL: ${result.url}${viewport}\n\nAccessibility Tree:\n${result.tree}`;
      }
      return `Error: ${result.error}`;
    }

    // ----------------------------------------
    // FIND TOOL
    // ----------------------------------------
    case 'find': {
      const query = toolInput.query;
      const result = await sendToContent(tabId, 'READ_PAGE', { filter: 'all', depth: 20 });

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
        const result = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
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
    // TABS_CONTEXT TOOL
    // ----------------------------------------
    case 'tabs_context': {
      let tabs;
      if (sessionTabGroupId !== null) {
        // Only return tabs in our group
        tabs = await chrome.tabs.query({ currentWindow: true, groupId: sessionTabGroupId });
      } else {
        // No group yet - return active tab
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      const tabInfo = tabs.map(t => ({
        tabId: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        groupId: t.groupId,
      }));
      return JSON.stringify({
        availableTabs: tabInfo,
        groupId: sessionTabGroupId,
        note: sessionTabGroupId ? 'Showing tabs in Agent group only' : 'No group created yet'
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
          await chrome.debugger.sendCommand({ tabId }, 'Network.enable', { maxPostDataSize: 65536 });
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
// CLAUDE API
// ============================================

async function loadConfig() {
  const stored = await chrome.storage.local.get([
    'apiBaseUrl', 'apiKey', 'model', 'maxSteps', 'maxTokens',
    'providerKeys', 'customModels', 'currentModelIndex'
  ]);
  config = { ...config, ...stored };
  return config;
}

function getApiHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'computer-use-2025-01-24',
  };
  if (config.apiKey) {
    // Support both Anthropic and OpenAI/OpenRouter style auth
    headers['x-api-key'] = config.apiKey;
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

async function callClaudeSimple(prompt, maxTokens = 800) {
  await loadConfig();
  const response = await fetch(config.apiBaseUrl, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const result = await response.json();
  return result.content?.find(b => b.type === 'text')?.text || '';
}

async function callClaude(messages, onTextChunk = null) {
  await loadConfig();
  await log('API', `Calling API (${config.model})`, { messageCount: messages.length });

  const useStreaming = onTextChunk !== null;

  // Use abort signal for cancellation
  const signal = abortController?.signal;

  const response = await fetch(config.apiBaseUrl, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens || 10000,
      system: buildSystemPrompt(),
      tools: TOOL_DEFINITIONS,
      messages,
      stream: useStreaming,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }

  // Handle streaming response
  if (useStreaming) {
    return await handleStreamingResponse(response, onTextChunk);
  }

  const result = await response.json();
  await log('API', 'Response received', { stopReason: result.stop_reason });
  return result;
}

/**
 * Handle SSE streaming response
 */
async function handleStreamingResponse(response, onTextChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let result = {
    content: [],
    stop_reason: null,
  };

  let currentTextBlock = null;
  let currentToolUse = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);

        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'text') {
              currentTextBlock = { type: 'text', text: '' };
            } else if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                type: 'tool_use',
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              };
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta' && currentTextBlock) {
              currentTextBlock.text += event.delta.text;
              if (onTextChunk) onTextChunk(event.delta.text);
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              // Accumulate JSON input
              currentToolUse._inputJson = (currentToolUse._inputJson || '') + event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentTextBlock) {
              result.content.push(currentTextBlock);
              currentTextBlock = null;
            } else if (currentToolUse) {
              // Parse accumulated JSON and create clean object
              let parsedInput = {};
              if (currentToolUse._inputJson) {
                try {
                  parsedInput = JSON.parse(currentToolUse._inputJson);
                } catch (e) {
                  parsedInput = {};
                }
              }
              // Push clean object without _inputJson
              result.content.push({
                type: 'tool_use',
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: parsedInput,
              });
              currentToolUse = null;
            }
            break;

          case 'message_delta':
            if (event.delta.stop_reason) {
              result.stop_reason = event.delta.stop_reason;
            }
            break;
        }
      } catch (e) {
        // Ignore JSON parse errors for malformed events
      }
    }
  }

  await log('API', 'Streaming response complete', { stopReason: result.stop_reason });
  return result;
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
  const maxSteps = config.maxSteps || 50;

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
      response = await callClaude(messages, onTextChunk);
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
  sessionId = generateSessionId();
  askBeforeActing = shouldAskBeforeActing;
  taskCancelled = false;
  taskScreenshots = [];

  // Create new abort controller for this task
  abortController = new AbortController();
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
        config = { ...config, ...payload };
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
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
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

console.log('[Browser Agent] Service worker loaded');
