/**
 * Provider Factory - creates the appropriate provider instance
 * based on the API base URL
 */

import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import { GoogleProvider } from './google-provider.js';
import { CodexProvider } from './codex-provider.js';

// List of all available providers
const PROVIDERS = [
  AnthropicProvider,
  OpenAIProvider,
  OpenRouterProvider,
  GoogleProvider,
  CodexProvider,
];

/**
 * Create a provider instance based on the API base URL or explicit provider name
 * @param {string} baseUrl - API base URL
 * @param {Object} config - Configuration object
 * @param {string} [providerName] - Optional explicit provider name
 * @returns {BaseProvider} Provider instance
 */
export function createProvider(baseUrl, config, providerName = null) {
  // If explicit provider name is given, use it
  if (providerName) {
    const ProviderClass = PROVIDERS.find(P => {
      const instance = new P({});
      return instance.getName() === providerName;
    });
    if (ProviderClass) {
      return new ProviderClass(config);
    }
  }

  // Find matching provider by URL
  for (const ProviderClass of PROVIDERS) {
    if (ProviderClass.matchesUrl(baseUrl)) {
      return new ProviderClass(config);
    }
  }

  // Default to Anthropic if no match (backward compatibility)
  console.warn(`[API] Unknown provider for URL: ${baseUrl}, defaulting to Anthropic format`);
  return new AnthropicProvider(config);
}

/**
 * Get provider name from base URL
 * @param {string} baseUrl - API base URL
 * @returns {string} Provider name
 */
export function detectProvider(baseUrl) {
  for (const ProviderClass of PROVIDERS) {
    if (ProviderClass.matchesUrl(baseUrl)) {
      return new ProviderClass({}).getName();
    }
  }
  return 'anthropic'; // Default
}
