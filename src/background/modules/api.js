/**
 * Claude API communication module.
 * Handles API calls, streaming responses, and configuration.
 */

import { TOOL_DEFINITIONS } from '../../tools/definitions.js';
import { buildSystemPrompt } from './system-prompt.js';
import { DOMAIN_SKILLS } from './domain-skills.js';

// Configuration (loaded from storage)
let config = {
  apiBaseUrl: 'http://127.0.0.1:8000/claude/v1/messages',
  apiKey: null,
  model: 'claude-opus-4-5-20251101',
  maxTokens: 10000,
  maxSteps: 0,
};

// Abort controller for cancellation
let abortController = null;

/**
 * Load configuration from storage
 */
export async function loadConfig() {
  const stored = await chrome.storage.local.get([
    'apiBaseUrl', 'apiKey', 'model', 'maxSteps', 'maxTokens',
    'providerKeys', 'customModels', 'currentModelIndex', 'userSkills'
  ]);
  config = { ...config, ...stored };

  // Include built-in skills for UI display
  config.builtInSkills = DOMAIN_SKILLS.map(s => ({ domain: s.domain, skill: s.skill }));
  config.userSkills = stored.userSkills || [];

  return config;
}

/**
 * Get current config
 */
export function getConfig() {
  return config;
}

/**
 * Update config
 */
export function setConfig(newConfig) {
  config = { ...config, ...newConfig };
}

/**
 * Get API headers
 */
export function getApiHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'computer-use-2025-01-24',
  };
  if (config.apiKey) {
    headers['x-api-key'] = config.apiKey;
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

/**
 * Create a new abort controller for task cancellation
 */
export function createAbortController() {
  abortController = new AbortController();
  return abortController;
}

/**
 * Get current abort controller
 */
export function getAbortController() {
  return abortController;
}

/**
 * Abort current request
 */
export function abortRequest() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

/**
 * Simple Claude API call (for quick tasks like summarization)
 */
export async function callClaudeSimple(prompt, maxTokens = 800) {
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

/**
 * Add cache_control to the last assistant message for conversation caching.
 * This matches Claude in Chrome's caching strategy.
 */
function addConversationCaching(messages) {
  if (!messages || messages.length === 0) return messages;

  // Deep clone to avoid mutating original
  const cachedMessages = JSON.parse(JSON.stringify(messages));

  // Find last assistant message
  for (let i = cachedMessages.length - 1; i >= 0; i--) {
    if (cachedMessages[i].role === 'assistant') {
      const content = cachedMessages[i].content;
      if (Array.isArray(content) && content.length > 0) {
        // Add cache_control to the last content block
        content[content.length - 1].cache_control = { type: 'ephemeral' };
      }
      break;
    }
  }

  return cachedMessages;
}

/**
 * Main Claude API call with tools and streaming support
 */
export async function callClaude(messages, onTextChunk = null, log = () => {}) {
  await loadConfig();
  await log('API', `Calling API (${config.model})`, { messageCount: messages.length });

  const useStreaming = onTextChunk !== null;
  const signal = abortController?.signal;

  // Add conversation caching to messages
  const cachedMessages = addConversationCaching(messages);

  const response = await fetch(config.apiBaseUrl, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens || 10000,
      system: buildSystemPrompt(),
      tools: TOOL_DEFINITIONS,
      messages: cachedMessages,
      stream: useStreaming,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }

  if (useStreaming) {
    return await handleStreamingResponse(response, onTextChunk, log);
  }

  const result = await response.json();
  await log('API', 'Response received', { stopReason: result.stop_reason });
  return result;
}

/**
 * Handle SSE streaming response
 */
async function handleStreamingResponse(response, onTextChunk, log) {
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
    buffer = lines.pop() || '';

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
              currentToolUse._inputJson = (currentToolUse._inputJson || '') + event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentTextBlock) {
              result.content.push(currentTextBlock);
              currentTextBlock = null;
            } else if (currentToolUse) {
              let parsedInput = {};
              if (currentToolUse._inputJson) {
                try {
                  parsedInput = JSON.parse(currentToolUse._inputJson);
                } catch (e) {
                  parsedInput = {};
                }
              }
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
