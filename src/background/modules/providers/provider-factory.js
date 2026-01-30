/**
 * Provider Factory - creates the appropriate provider instance
 * based on the API base URL
 */

import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import { GoogleProvider } from './google-provider.js';

// List of all available providers
const PROVIDERS = [
  AnthropicProvider,
  OpenAIProvider,
  OpenRouterProvider,
  GoogleProvider,
];

/**
 * Create a provider instance based on the API base URL
 * @param {string} baseUrl - API base URL
 * @param {Object} config - Configuration object
 * @returns {BaseProvider} Provider instance
 */
export function createProvider(baseUrl, config) {
  // Find matching provider
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
