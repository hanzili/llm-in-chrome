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
 * Log a message to console and storage
 * @param {string} type - Log type (e.g., 'ERROR', 'TOOL', 'DEBUGGER', 'CLICK', 'DPR')
 * @param {string} message - Log message
 * @param {*} [data] - Optional data to include in log (will be JSON stringified)
 * @returns {Promise<void>}
 */
export async function log(type, message, data = null) {
  const entry = {
    time: new Date().toISOString(),
    type,
    message,
    data: data ? JSON.stringify(data).substring(0, LIMITS.LOG_DATA_CHARS) : null,
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
 * Save task logs to a folder with clean format for debugging
 * @param {Object} taskData - Task data object
 * @param {string} taskData.task - Task description
 * @param {string} taskData.status - Task status (success/error)
 * @param {string} [taskData.startTime] - ISO timestamp when task started
 * @param {string} [taskData.endTime] - ISO timestamp when task ended
 * @param {Array<Object>} [taskData.messages] - Agent messages for this task
 * @param {string} [taskData.error] - Error message if task failed
 * @param {Array<string>} [screenshots] - Array of screenshot data URLs
 * @returns {Promise<void>}
 */
export async function saveTaskLogs(taskData, screenshots = []) {
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
      debug: taskDebugLog, // Include all logs for debugging (removed filter)
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
              tool.result = typeof item.content === 'string'
                ? item.content.substring(0, LIMITS.CLEAN_TURN_CONTENT) // Truncate long results
                : JSON.stringify(item.content).substring(0, LIMITS.CLEAN_TURN_CONTENT);
            }
          }
        }
      }
    }
  }

  // Clean up empty turns
  return turns.filter(t => t.ai_response || t.tools.length > 0);
}
