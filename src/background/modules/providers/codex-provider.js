/**
 * Codex Provider
 * Handles Codex/ChatGPT Pro API through native messaging proxy
 *
 * Uses OAuth credentials from Codex CLI (~/.codex/auth.json)
 * Routes through native host to bypass CORS and use authenticated requests
 */

import { BaseProvider } from './base-provider.js';

const NATIVE_HOST_NAME = 'com.llm_in_chrome.oauth_host';
const CODEX_API_URL = 'https://chatgpt.com/backend-api/codex/responses';

export class CodexProvider extends BaseProvider {
  getName() {
    return 'codex';
  }

  static matchesUrl(baseUrl) {
    return baseUrl.includes('chatgpt.com') || baseUrl.includes('codex');
  }

  getHeaders() {
    // Headers are handled by native host using stored credentials
    return {
      'Content-Type': 'application/json',
    };
  }

  buildUrl(useStreaming) {
    return CODEX_API_URL;
  }

  buildRequestBody(messages, systemPrompt, tools, useStreaming) {
    // Extract text from systemPrompt array (Anthropic format)
    const systemText = Array.isArray(systemPrompt)
      ? systemPrompt.map(p => p.text).join('\n\n')
      : systemPrompt;

    // Convert messages to Responses API "input" format
    const input = this._convertToResponsesInput(messages);

    // Codex uses Responses API format (not chat completions)
    // Required: store=false, stream=true (Codex backend requires these)
    return {
      model: this.config.model || 'gpt-5.1-codex-max',
      instructions: systemText,
      input: input,
      tools: this._convertToolsForResponses(tools),
      stream: true,  // Codex backend requires stream=true
      store: false,  // Required by Codex API
    };
  }

  /**
   * Override call method to use native messaging proxy
   */
  async call(messages, systemPrompt, tools, onTextChunk, log) {
    const useStreaming = !!onTextChunk;
    const requestBody = this.buildRequestBody(messages, systemPrompt, tools, useStreaming);
    const url = this.buildUrl(useStreaming);

    await log?.('DEBUG', 'Codex API call through proxy', {
      url,
      model: requestBody.model,
      messageCount: messages.length,
      streaming: useStreaming,
    });

    return new Promise((resolve, reject) => {
      let port = null;
      let result = {
        content: [],
        usage: null,
        stop_reason: 'end_turn',
      };
      let currentText = '';
      let toolCalls = {};

      try {
        port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

        port.onMessage.addListener(async (message) => {
          if (message.type === 'stream_chunk') {
            // Handle Responses API streaming events
            const event = message.data;

            // Handle different Responses API event types
            if (event.type === 'response.output_text.delta') {
              // Text delta
              const text = event.delta || '';
              currentText += text;
              if (onTextChunk) onTextChunk(text);

            } else if (event.type === 'response.function_call_arguments.delta') {
              // Function call arguments delta
              const callId = event.call_id || event.item_id;
              if (!toolCalls[callId]) {
                toolCalls[callId] = {
                  id: callId,
                  name: event.name || '',
                  arguments: '',
                };
              }
              toolCalls[callId].arguments += event.delta || '';

            } else if (event.type === 'response.output_item.added') {
              // New output item (could be text or function call)
              const item = event.item;
              if (item?.type === 'function_call') {
                toolCalls[item.call_id] = {
                  id: item.call_id,
                  name: item.name,
                  arguments: item.arguments || '',
                };
              }

            } else if (event.type === 'response.completed') {
              // Response completed - extract final data
              const response = event.response;
              if (response?.usage) {
                result.usage = response.usage;
              }
              // Status from response
              if (response?.status === 'incomplete') {
                result.stop_reason = 'max_tokens';
              }
            }

            // Also handle legacy chat completions format (fallback)
            if (event.choices?.[0]?.delta) {
              const delta = event.choices[0].delta;
              if (delta.content) {
                currentText += delta.content;
                if (onTextChunk) onTextChunk(delta.content);
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = { id: tc.id || `call_${idx}`, name: '', arguments: '' };
                  }
                  if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                  if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                }
              }
            }

            // Handle usage in chunk
            if (event.usage) {
              result.usage = event.usage;
            }

          } else if (message.type === 'stream_end') {
            // Finalize streaming response
            if (currentText) {
              result.content.push({ type: 'text', text: currentText });
            }

            // Add tool calls
            for (const toolCall of Object.values(toolCalls)) {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(toolCall.arguments || '{}');
              } catch (e) {
                parsedArgs = {};
              }

              result.content.push({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.name,
                input: parsedArgs,
              });
            }

            // Set stop reason based on content
            if (Object.keys(toolCalls).length > 0) {
              result.stop_reason = 'tool_use';
            }

            // Ensure content is never empty
            if (result.content.length === 0) {
              result.content.push({ type: 'text', text: '' });
            }

            if (port) port.disconnect();
            resolve(result);

          } else if (message.type === 'api_response') {
            // Handle non-streaming response
            if (message.status >= 400) {
              if (port) port.disconnect();
              reject(new Error(`Codex API error: ${message.status} - ${message.body}`));
              return;
            }

            try {
              const response = JSON.parse(message.body);
              const normalized = this.normalizeResponse(response);
              if (port) port.disconnect();
              resolve(normalized);
            } catch (e) {
              if (port) port.disconnect();
              reject(new Error(`Failed to parse Codex response: ${e.message}`));
            }

          } else if (message.type === 'api_error') {
            if (port) port.disconnect();
            reject(new Error(message.error));
          }
        });

        port.onDisconnect.addListener(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Native host error: ${chrome.runtime.lastError.message}`));
          }
        });

        // Send API request through proxy
        port.postMessage({
          type: 'proxy_api_call',
          data: {
            url: url,
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: this.getHeaders(),
          },
        });

      } catch (error) {
        if (port) port.disconnect();
        reject(new Error(`Failed to connect to native host: ${error.message}`));
      }
    });
  }

  normalizeResponse(response) {
    const content = [];
    let stopReason = 'end_turn';

    // Handle Responses API format (has "output" array)
    if (response.output) {
      for (const item of response.output) {
        if (item.type === 'message' && item.role === 'assistant') {
          // Extract text from message content
          for (const part of item.content || []) {
            if (part.type === 'output_text' && part.text) {
              content.push({ type: 'text', text: part.text });
            }
          }
        } else if (item.type === 'function_call') {
          // Convert function_call to tool_use
          let parsedArgs = {};
          try {
            parsedArgs = typeof item.arguments === 'string'
              ? JSON.parse(item.arguments)
              : item.arguments || {};
          } catch (e) {
            parsedArgs = {};
          }

          content.push({
            type: 'tool_use',
            id: item.call_id,
            name: item.name,
            input: parsedArgs,
          });
          stopReason = 'tool_use';
        }
      }

      // Map status to stop_reason
      if (response.status === 'incomplete') {
        stopReason = 'max_tokens';
      }

    } else if (response.choices?.[0]?.message) {
      // Fallback: Handle legacy chat completions format
      const message = response.choices[0].message;

      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }

      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments,
          });
        }
        stopReason = 'tool_use';
      }

      const finishReason = response.choices[0].finish_reason;
      if (finishReason === 'length') {
        stopReason = 'max_tokens';
      }
    } else {
      throw new Error(`Unexpected Codex response format: ${JSON.stringify(response).substring(0, 200)}`);
    }

    // Ensure content is never empty
    if (content.length === 0) {
      content.push({ type: 'text', text: '' });
    }

    return {
      content,
      stop_reason: stopReason,
      usage: response.usage,
    };
  }

  /**
   * Convert tools to Responses API format
   * @private
   */
  _convertToolsForResponses(anthropicTools) {
    if (!anthropicTools || anthropicTools.length === 0) return [];

    return anthropicTools.map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    }));
  }

  /**
   * Convert Anthropic messages to Responses API "input" format
   * ccproxy only sends the last user message - Responses API is stateless per request
   * @private
   */
  _convertToResponsesInput(anthropicMessages) {
    // Find the last user message (like ccproxy does)
    let lastUserText = null;

    for (let i = anthropicMessages.length - 1; i >= 0; i--) {
      const msg = anthropicMessages[i];
      if (msg.role !== 'user') continue;

      if (typeof msg.content === 'string') {
        lastUserText = msg.content;
        break;
      }

      if (Array.isArray(msg.content)) {
        const texts = [];
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            texts.push(block.text);
          }
        }
        if (texts.length > 0) {
          lastUserText = texts.join(' ');
          break;
        }
      }
    }

    if (lastUserText) {
      return [{
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: lastUserText }],
      }];
    }

    return [];
  }
}
