/**
 * OpenRouter API Provider
 * Similar to OpenAI but with different parameter names and auth
 * Supports Qwen, Kimi K2.5, Mistral, and other models
 */

import { OpenAIProvider } from './openai-provider.js';

export class OpenRouterProvider extends OpenAIProvider {
  getName() {
    return 'openrouter';
  }

  static matchesUrl(baseUrl) {
    return baseUrl.includes('openrouter.ai');
  }

  buildRequestBody(messages, systemPrompt, tools, useStreaming) {
    const convertedMessages = this._convertMessages(messages);

    // Extract text from systemPrompt array (Anthropic format)
    const systemText = Array.isArray(systemPrompt)
      ? systemPrompt.map(p => p.text).join('\n\n')
      : systemPrompt;

    const openaiMessages = [
      { role: 'system', content: systemText },
      ...convertedMessages,
    ];

    // OpenRouter uses max_tokens (not max_completion_tokens like OpenAI)
    return {
      model: this.config.model,
      max_tokens: this.config.maxTokens || 10000, // Different from OpenAI!
      messages: openaiMessages,
      tools: this._convertTools(tools),
      stream: useStreaming,
    };
  }
}
