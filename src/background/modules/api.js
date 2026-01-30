/**
 * LLM API communication module (Refactored with Provider Pattern)
 * Handles API calls, streaming responses, and configuration.
 */

import { TOOL_DEFINITIONS, getToolsForUrl } from '../../tools/definitions.js';
import { buildSystemPrompt } from './system-prompt.js';
import { DOMAIN_SKILLS } from './domain-skills.js';
import { createProvider } from './providers/provider-factory.js';
import { getAccessToken } from './oauth-manager.js';

// Configuration (loaded from storage)
let config = {
  apiBaseUrl: 'http://127.0.0.1:8000/claude/v1/messages',
  apiKey: null,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 10000,
  maxSteps: 0,
};

// Abort controller for cancellation
let abortController = null;

// API call counter for debugging
let apiCallCounter = 0;

// Native host port for OAuth proxy (reused across API calls)
let nativeHostPort = null;

/**
 * Load configuration from storage
 */
export async function loadConfig() {
  const stored = await chrome.storage.local.get([
    'apiBaseUrl', 'apiKey', 'model', 'maxSteps', 'maxTokens',
    'providerKeys', 'customModels', 'currentModelIndex', 'userSkills', 'authMethod'
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
 * Get API headers based on the provider endpoint and auth method
 * Supports both OAuth tokens and API keys
 */
export async function getApiHeaders() {
  // Create provider to get base headers (Anthropic-specific headers, etc.)
  const provider = createProvider(config.apiBaseUrl || '', config);
  const providerHeaders = await provider.getHeaders();

  // Check if using OAuth authentication
  if (config.authMethod === 'oauth') {
    const accessToken = await getAccessToken();

    if (accessToken) {
      // Use OAuth Bearer token instead of x-api-key
      // Remove x-api-key if present and add Authorization header
      const { 'x-api-key': _, ...headersWithoutApiKey } = providerHeaders;

      return {
        ...headersWithoutApiKey,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };
    }

    // OAuth configured but no token - fall back to API key
    console.warn('OAuth configured but no token available, falling back to API key');
  }

  // Use API key (provider-based)
  return providerHeaders;
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
 * Reset API call counter (called at start of each task)
 */
export function resetApiCallCounter() {
  apiCallCounter = 0;
}

/**
 * Get current API call count
 */
export function getApiCallCount() {
  return apiCallCounter;
}

/**
 * Simple LLM API call (for quick tasks like summarization)
 */
export async function callLLMSimple(prompt, maxTokens = 800) {
  await loadConfig();
  const headers = await getApiHeaders();
  const response = await fetch(config.apiBaseUrl, {
    method: 'POST',
    headers: headers,
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
 * Get or create persistent native host connection for OAuth proxy
 * @private
 */
function getNativeHostPort() {
  if (!nativeHostPort || !nativeHostPort.name) {
    console.log('[API] Creating new native host connection for OAuth proxy');
    nativeHostPort = chrome.runtime.connectNative('com.llm_in_chrome.oauth_host');

    // Listen for token refresh events
    nativeHostPort.onMessage.addListener(async (message) => {
      if (message.type === 'tokens_refreshed') {
        console.log('[API] OAuth tokens were refreshed by native host');
        // Update extension storage with new tokens
        await chrome.storage.local.set({
          oauthAccessToken: message.credentials.accessToken,
          oauthRefreshToken: message.credentials.refreshToken,
          oauthExpiresAt: message.credentials.expiresAt
        });
        console.log('[API] Extension storage updated with refreshed tokens');
      }
    });

    nativeHostPort.onDisconnect.addListener(() => {
      console.log('[API] Native host disconnected');
      nativeHostPort = null;
    });
  }

  return nativeHostPort;
}

/**
 * Make API call through native messaging proxy (for OAuth)
 * @private
 */
async function callLLMThroughProxy(messages, onTextChunk = null, log = () => {}, currentUrl = null) {
  const provider = createProvider(config.apiBaseUrl || '', config);
  const useStreaming = onTextChunk !== null;
  const systemPrompt = buildSystemPrompt();

  // Filter tools based on current URL (hides domain-specific tools on non-matching sites)
  const tools = currentUrl ? getToolsForUrl(currentUrl) : TOOL_DEFINITIONS;

  // Build request body
  const requestBody = provider.buildRequestBody(messages, systemPrompt, tools, useStreaming);
  const apiUrl = provider.buildUrl(useStreaming);
  const requestBodyStr = JSON.stringify(requestBody);

  apiCallCounter++;
  const callNumber = apiCallCounter;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const port = getNativeHostPort();

    // Create unique listener for this API call
    const messageListener = async (message) => {
      if (message.type === 'api_response') {
        port.onMessage.removeListener(messageListener);

        if (message.status !== 200) {
          const errorMessage = parseErrorResponse(message.body, message.status);
          reject(new Error(errorMessage));
          return;
        }

        try {
          const result = JSON.parse(message.body);
          const duration = Date.now() - startTime;

          await log('API', `#${callNumber} ${config.model} → ${result.stop_reason}`, {
            model: config.model,
            messages: messages.length,
            stopReason: result.stop_reason,
            tokens: result.usage,
            duration: `${duration}ms`,
          });

          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse API response: ${err.message}`));
        }
      } else if (message.type === 'api_error') {
        port.onMessage.removeListener(messageListener);
        reject(new Error(message.error));
      }
    };

    port.onMessage.addListener(messageListener);

    // Send request to native host
    port.postMessage({
      type: 'proxy_api_call',
      data: {
        url: apiUrl,
        method: 'POST',
        headers: {}, // Native host will add auth headers
        body: requestBodyStr
      }
    });
  });
}

/**
 * Main LLM API call with tools and streaming support
 * @param {Array} messages - Conversation messages
 * @param {Function|null} onTextChunk - Callback for streaming text chunks
 * @param {Function} log - Logging function
 * @param {string|null} currentUrl - Current tab URL (used to filter domain-specific tools)
 */
export async function callLLM(messages, onTextChunk = null, log = () => {}, currentUrl = null) {
  await loadConfig();

  // If using OAuth, route through native messaging proxy
  if (config.authMethod === 'oauth') {
    return await callLLMThroughProxy(messages, null, log, currentUrl);
  }

  // Create provider instance
  const provider = createProvider(config.apiBaseUrl || '', config);
  const useStreaming = onTextChunk !== null;
  const signal = abortController?.signal;
  const systemPrompt = buildSystemPrompt();

  // Filter tools based on current URL (hides domain-specific tools on non-matching sites)
  const tools = currentUrl ? getToolsForUrl(currentUrl) : TOOL_DEFINITIONS;

  // Build provider-specific request body and URL
  const requestBody = provider.buildRequestBody(messages, systemPrompt, tools, useStreaming);
  const apiUrl = provider.buildUrl(useStreaming);

  // Add timeout to prevent hanging requests (2 minutes for API calls)
  const timeoutMs = 120000;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Combine user abort signal with timeout
  const combinedSignal = signal || timeoutController.signal;

  try {
    apiCallCounter++;
    const callNumber = apiCallCounter;
    const startTime = Date.now();

    const requestBodyStr = JSON.stringify(requestBody);

    const headers = await getApiHeaders();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: requestBodyStr,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = parseErrorResponse(errorText, response.status);
      throw new Error(errorMessage);
    }

    // Handle response based on streaming mode
    let result;
    if (useStreaming) {
      result = await provider.handleStreaming(response, onTextChunk, log);
    } else {
      const jsonResponse = await response.json();
      result = provider.normalizeResponse(jsonResponse);
    }

    const duration = Date.now() - startTime;
    await log('API', `#${callNumber} ${config.model} → ${result.stop_reason}`, {
      model: config.model,
      messages: messages.length,
      stopReason: result.stop_reason,
      tokens: result.usage,
      duration: `${duration}ms`,
    });

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if it was a timeout
    if (error.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeoutMs / 1000} seconds. The model may be overloaded or unavailable.`);
    }

    throw error;
  }
}

/**
 * Parse error response from API
 * @private
 */
function parseErrorResponse(errorText, status) {
  let errorMessage = `API error: ${status}`;

  try {
    const errorJson = JSON.parse(errorText);
    console.error('[API] Error response:', errorJson);

    // OpenAI/OpenRouter format
    if (errorJson.error?.message) {
      errorMessage += ` - ${errorJson.error.message}`;
      if (errorJson.error.code) {
        errorMessage += ` (${errorJson.error.code})`;
      }
      // Include metadata if available (OpenRouter specific)
      if (errorJson.error?.metadata) {
        errorMessage += ` [${JSON.stringify(errorJson.error.metadata)}]`;
      }
    }
    // Anthropic format
    else if (errorJson.error?.type) {
      errorMessage += ` - ${errorJson.error.type}: ${errorJson.error.message || 'Unknown error'}`;
    }
    // Google format or any other error object
    else if (errorJson.error) {
      errorMessage += ` - ${JSON.stringify(errorJson.error)}`;
    }
    // Direct message at top level (some providers)
    else if (errorJson.message) {
      errorMessage += ` - ${errorJson.message}`;
    }
    // Fallback: dump entire response
    else {
      errorMessage += ` - ${errorText.substring(0, 500)}`;
    }
  } catch {
    errorMessage += ` - ${errorText.substring(0, 500)}`;
  }

  return errorMessage;
}
