/**
 * Logging Manager
 * Handles agent logging, task log building, and log persistence
 */

import { LIMITS } from '../modules/constants.js';

const LOG_KEY = 'agent_log';

/**
 * Log state - shared reference that will be passed from service worker
 */
let taskDebugLog = [];

/**
 * Initialize logging with task debug log reference
 * @param {Array<Object>} debugLogRef - Reference to taskDebugLog array from service worker
 */
export function initLogging(debugLogRef) {
  taskDebugLog = debugLogRef;
}

/**
 * Sanitize data for logging - strip base64 images and long binary-looking strings
 * @param {*} data - Data to sanitize
 * @returns {*} Sanitized data safe for logging
 */
function sanitizeForLogging(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    // Strip base64 data URLs
    if (data.startsWith('data:image/')) {
      return '[base64 image stripped]';
    }
    // Strip long strings that look like base64 (>500 chars, mostly alphanumeric)
    if (data.length > 500 && /^[A-Za-z0-9+/=]+$/.test(data.substring(0, 100))) {
      return `[base64 data stripped, ${data.length} chars]`;
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }
  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip known base64 fields
      if (key === 'base64Image' || key === 'base64' || key === 'data' && typeof value === 'string' && value.length > 1000) {
        sanitized[key] = `[stripped, ${typeof value === 'string' ? value.length : 'N/A'} chars]`;
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }
  return data;
}

/**
 * Log a message to console and storage
 * @param {string} type - Log type (e.g., 'ERROR', 'TOOL', 'DEBUGGER', 'CLICK', 'DPR')
 * @param {string} message - Log message
 * @param {*} [data] - Optional data to include in log (will be JSON stringified)
 * @returns {Promise<void>}
 */
export async function log(type, message, data = null) {
  const sanitizedData = sanitizeForLogging(data);
  const entry = {
    time: new Date().toISOString(),
    type,
    message,
    data: sanitizedData ? JSON.stringify(sanitizedData).substring(0, LIMITS.LOG_DATA_CHARS) : null,
  };
  console.log(`[${type}] ${message}`, data || '');

  // Also collect in taskDebugLog for saving to file
  taskDebugLog.push(entry);

  // Save to storage
  const stored = await chrome.storage.local.get([LOG_KEY]);
  const existingLog = stored[LOG_KEY] || [];
  const newLog = [...existingLog, entry].slice(-LIMITS.LOG_ENTRIES);
  await chrome.storage.local.set({ [LOG_KEY]: newLog });
}

/**
 * Clear all logs from storage
 * @returns {Promise<void>}
 */
export async function clearLog() {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
}

/**
 * Filter debug log entries to keep only essential information
 * Keeps: API calls, AI_RESPONSE, TOOL, TOOL_RESULT, errors, lifecycle events, memory/compaction info
 * Removes: MCP updates (redundant with TOOL entries), SCREENSHOT_API
 * @param {Array<Object>} debugLog - Raw debug log entries
 * @returns {Array<Object>} Filtered log entries
 */
function filterDebugLog(debugLog) {
  // Only keep essential entry types for clean, readable logs
  const essentialTypes = [
    'API',           // API calls with timing and tokens
    'AI_RESPONSE',   // AI reasoning and tool choices
    'TOOL',          // Tool execution start
    'TOOL_RESULT',   // Tool execution result
    'ERROR',         // Errors
    'START',         // Task start
    'SKILLS',        // Domain skills loaded
    'TASK',          // Task completion
    'MEMORY',        // Token counts per turn
    'COMPACT',       // Context compression events
  ];
  return debugLog.filter(entry => essentialTypes.includes(entry.type));
}

/**
 * Build turns array from debug log entries
 * This uses AI_RESPONSE and TOOL_RESULT entries which contain complete history
 * (unlike compressed messages which lose middle turns)
 * @param {Array<Object>} debugLog - Debug log entries
 * @returns {Array<Object>} Array of turns with tools and ai_response
 */
function buildTurnsFromDebugLog(debugLog) {
  const turns = [];
  let currentTurn = null;
  let pendingToolResults = [];

  for (const entry of debugLog) {
    if (entry.type === 'AI_RESPONSE') {
      // Flush any pending tool results to previous turn
      if (currentTurn && pendingToolResults.length > 0) {
        for (const result of pendingToolResults) {
          const tool = currentTurn.tools.find(t => t.name === result.toolName && t.result === null);
          if (tool) {
            tool.result = result.result;
          }
        }
        pendingToolResults = [];
      }

      // Start new turn
      try {
        const data = JSON.parse(entry.data);
        currentTurn = {
          tools: (data.toolCalls || []).map(tc => ({
            name: tc.name,
            input: tc.input,
            result: null
          })),
          ai_response: data.textContent || null
        };
        turns.push(currentTurn);
      } catch (e) {
        // Skip malformed entries
      }
    } else if (entry.type === 'TOOL_RESULT' && currentTurn) {
      try {
        const data = JSON.parse(entry.data);
        const toolName = data.tool;
        // Try to find matching tool in current turn
        const tool = currentTurn.tools.find(t => t.name === toolName && t.result === null);
        if (tool) {
          // Build result string
          let result = data.error || data.textResult || '';
          if (data.objectResult) {
            result = typeof data.objectResult === 'string'
              ? data.objectResult
              : JSON.stringify(data.objectResult);
          }
          if (data.screenshot) {
            result += ' [+screenshot]';
          }
          tool.result = result.substring(0, 2000); // Limit result size
        } else {
          // Queue for next matching
          pendingToolResults.push({
            toolName,
            result: data.error || data.textResult || JSON.stringify(data.objectResult || {})
          });
        }
      } catch (e) {
        // Skip malformed entries
      }
    }
  }

  // Clean up empty turns
  return turns.filter(t => t.ai_response || t.tools.length > 0);
}

/**
 * Save task logs to a folder with clean format for debugging
 * @param {Object} taskData - Task data object
 * @param {string} taskData.task - Task description
 * @param {string} taskData.status - Task status (success/error)
 * @param {string} [taskData.startTime] - ISO timestamp when task started
 * @param {string} [taskData.endTime] - ISO timestamp when task ended
 * @param {Array<Object>} [taskData.messages] - Agent messages for this task
 * @param {string} [taskData.error] - Error message if task failed
 * @param {Object} [taskData.usage] - Token usage for this task
 * @param {Array<string>} [screenshots] - Array of screenshot data URLs
 * @returns {Promise<void>}
 */
export async function saveTaskLogs(taskData, screenshots = []) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const folder = `browser-agent/${timestamp}`;

    // Build clean log format
    // Build turns from debug log (complete history) instead of compressed messages
    const turns = buildTurnsFromDebugLog(taskDebugLog);

    const cleanLog = {
      task: taskData.task,
      status: taskData.status,
      startTime: taskData.startTime,
      endTime: taskData.endTime,
      duration: taskData.startTime && taskData.endTime
        ? `${((new Date(taskData.endTime) - new Date(taskData.startTime)) / 1000).toFixed(1)}s`
        : null,
      usage: taskData.usage || null,
      turns: turns,
      screenshots: screenshots.map((_, i) => `screenshot_${i + 1}.png`),
      debug: filterDebugLog(taskDebugLog), // Filter redundant entries for cleaner logs
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
 * @param {Array<Object>} messages - Raw message history with roles and content blocks
 * @returns {Array<Object>} Clean turn-based format with tools and AI responses
 */
export function buildCleanTurns(messages) {
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
              // Sanitize and truncate non-array content
              const sanitized = sanitizeForLogging(item.content);
              tool.result = typeof sanitized === 'string'
                ? sanitized.substring(0, LIMITS.CLEAN_TURN_CONTENT)
                : JSON.stringify(sanitized).substring(0, LIMITS.CLEAN_TURN_CONTENT);
            }
          }
        }
      }
    }
  }

  // Clean up empty turns
  return turns.filter(t => t.ai_response || t.tools.length > 0);
}
