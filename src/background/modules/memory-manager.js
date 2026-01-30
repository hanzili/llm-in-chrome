/**
 * Memory Manager - Handles conversation history compression
 *
 * Implements hybrid memory management:
 * - Keeps first message (initial context)
 * - Keeps recent N messages (full detail)
 * - Summarizes middle section (saves tokens)
 *
 * This prevents context pollution and reduces costs while maintaining quality.
 */

import { callLLMSimple } from './api.js';

// Configuration
const DEFAULT_MAX_MESSAGES = 40;      // Trigger compression at this size
const RECENT_MESSAGES_COUNT = 15;     // Keep this many recent messages
const MIN_MESSAGES_TO_SUMMARIZE = 10; // Don't summarize if fewer than this

/**
 * Manages conversation memory with automatic summarization
 *
 * @param {Array} messages - Full conversation history
 * @param {Object} options - Configuration options
 * @param {number} options.maxMessages - Max messages before compression (default: 40)
 * @param {number} options.recentCount - Number of recent messages to keep (default: 15)
 * @param {Function} options.log - Optional logging function
 * @returns {Promise<Array>} Compressed message history
 */
export async function manageMemory(messages, options = {}) {
  const {
    maxMessages = DEFAULT_MAX_MESSAGES,
    recentCount = RECENT_MESSAGES_COUNT,
    log = () => {}
  } = options;

  // No compression needed if under threshold
  if (messages.length <= maxMessages) {
    return messages;
  }

  try {
    // STEP 1: Extract components
    const firstMessage = messages[0];              // Initial task context
    const recentMessages = messages.slice(-recentCount); // Recent conversation
    const middleMessages = messages.slice(1, -recentCount); // To be summarized

    // Don't summarize if middle section is too small
    if (middleMessages.length < MIN_MESSAGES_TO_SUMMARIZE) {
      return messages;
    }

    // STEP 2: Summarize middle section
    const summary = await summarizeMessages(middleMessages, log);

    // STEP 3: Rebuild compressed history
    const compressedHistory = [
      firstMessage,
      {
        role: 'user',
        content: [{
          type: 'text',
          text: `<system-reminder>CONVERSATION HISTORY SUMMARY:\n${summary}\n\nThe above is a summary of earlier conversation turns. Recent messages follow with full detail.</system-reminder>`
        }]
      },
      ...recentMessages
    ];

    await log('MEMORY', `Compressed: ${messages.length} → ${compressedHistory.length} msgs (~${estimateTokens(messages)}K → ~${estimateTokens(compressedHistory)}K tokens)`);

    return compressedHistory;

  } catch (error) {
    await log('ERROR', `Memory compression failed: ${error.message}`);
    // Fall back to recent messages only if compression fails
    return [messages[0], ...messages.slice(-recentCount)];
  }
}

/**
 * Summarizes a section of conversation history
 *
 * @param {Array} messages - Messages to summarize
 * @param {Function} log - Logging function
 * @returns {Promise<string>} Summary text
 */
async function summarizeMessages(messages, log) {

  // Group messages by task/topic
  const tasks = groupMessagesByTask(messages);

  // Generate summaries for each task
  const taskSummaries = [];
  for (const task of tasks) {
    const summary = await summarizeTask(task, log);
    taskSummaries.push(summary);
  }

  return taskSummaries.join('\n\n');
}

/**
 * Groups messages by task boundaries
 * Tasks are identified by new user messages that aren't tool results
 *
 * @param {Array} messages - Messages to group
 * @returns {Array<Object>} Array of task groups
 */
function groupMessagesByTask(messages) {
  const tasks = [];
  let currentTask = null;

  for (const msg of messages) {
    // Start new task on user message (not tool results)
    if (msg.role === 'user') {
      const isToolResult = Array.isArray(msg.content) &&
                          msg.content.some(block => block.type === 'tool_result');

      if (!isToolResult) {
        // New task starting
        if (currentTask) {
          tasks.push(currentTask);
        }
        currentTask = {
          userMessage: msg,
          exchanges: []
        };
      } else if (currentTask) {
        // Tool result for current task
        currentTask.exchanges.push(msg);
      }
    } else if (msg.role === 'assistant' && currentTask) {
      // Assistant response
      currentTask.exchanges.push(msg);
    }
  }

  // Add final task
  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

/**
 * Summarizes a single task
 *
 * @param {Object} task - Task object with userMessage and exchanges
 * @param {Function} log - Logging function
 * @returns {Promise<string>} Task summary
 */
async function summarizeTask(task, log) {
  // Extract task goal
  const userContent = Array.isArray(task.userMessage.content)
    ? task.userMessage.content.find(b => b.type === 'text')?.text || ''
    : task.userMessage.content;

  // Extract key actions (tool uses)
  const actions = [];
  for (const exchange of task.exchanges) {
    if (exchange.role === 'assistant' && Array.isArray(exchange.content)) {
      const toolUses = exchange.content.filter(b => b.type === 'tool_use');
      for (const tool of toolUses) {
        actions.push({
          name: tool.name,
          input: tool.input
        });
      }
    }
  }

  // Build summary prompt
  const conversationText = JSON.stringify({
    userRequest: userContent,
    actions: actions,
    exchangeCount: task.exchanges.length
  });

  const summaryPrompt = `Summarize this task completion in 2-3 sentences, focusing on:
- What the user requested
- Key actions taken (tools used)
- Outcome/result

Task data: ${conversationText}

Format: Direct summary without preamble.`;

  try {
    const summary = await callLLMSimple(summaryPrompt);
    return `• ${summary.trim()}`;
  } catch (error) {
    await log('ERROR', `Failed to summarize task: ${error.message}`);
    // Fall back to basic summary
    const toolNames = actions.map(a => a.name).filter((v, i, a) => a.indexOf(v) === i);
    return `• Task: "${userContent.substring(0, 100)}..." (Used: ${toolNames.join(', ')})`;
  }
}

/**
 * Estimates token count for messages
 * Rough estimate: 4 characters ≈ 1 token
 *
 * @param {Array} messages - Messages to estimate
 * @returns {number} Estimated tokens in thousands (K)
 */
function estimateTokens(messages) {
  const text = JSON.stringify(messages);
  const chars = text.length;
  const tokens = Math.ceil(chars / 4);
  return Math.round(tokens / 1000); // Return in K
}

/**
 * Gets memory statistics for monitoring
 *
 * @param {Array} messages - Current message history
 * @returns {Object} Memory stats
 */
export function getMemoryStats(messages) {
  const totalMessages = messages.length;
  const estimatedTokensK = estimateTokens(messages);

  // Count by role
  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;

  // Count tool uses
  let toolUseCount = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      toolUseCount += msg.content.filter(b => b.type === 'tool_use').length;
    }
  }

  return {
    totalMessages,
    userMessages,
    assistantMessages,
    toolUseCount,
    estimatedTokensK,
    compressionNeeded: totalMessages > DEFAULT_MAX_MESSAGES
  };
}

/**
 * Clears memory (resets conversation)
 *
 * @returns {Array} Empty message array
 */
export function clearMemory() {
  return [];
}
