/**
 * Anthropic Claude API Provider
 * Native format - minimal conversion needed
 */

import { BaseProvider } from './base-provider.js';

export class AnthropicProvider extends BaseProvider {
  getName() {
    return 'anthropic';
  }

  static matchesUrl(baseUrl) {
    return baseUrl.includes('anthropic.com');
  }

  async getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    // Add OAuth beta feature if using OAuth authentication
    if (this.config.authMethod === 'oauth') {
      headers['anthropic-beta'] = 'oauth-2025-04-20';
    }

    // Only add x-api-key if we have an API key (not using OAuth)
    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }

    return headers;
  }

  buildUrl(useStreaming) {
    return this.config.apiBaseUrl;
  }

  buildRequestBody(messages, systemPrompt, tools, useStreaming) {
    const cachedMessages = this._addConversationCaching(messages);

    return {
      model: this.config.model,
      max_tokens: this.config.maxTokens || 10000,
      system: systemPrompt,
      tools: tools,
      messages: cachedMessages,
      stream: useStreaming,
      metadata: { user_id: 'browser_extension_user' },
    };
  }

  normalizeResponse(response) {
    // Already in Anthropic format
    return response;
  }

  async handleStreaming(response, onTextChunk, _log) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let result = {
      content: [],
      stop_reason: null,
    };

    let currentTextBlock = null;
    let currentToolUse = null;
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
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

    return result;
  }

  /**
   * Add cache_control to the last assistant message for conversation caching
   * @private
   */
  _addConversationCaching(messages) {
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
}
