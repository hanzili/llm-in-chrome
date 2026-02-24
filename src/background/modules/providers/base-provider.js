/**
 * Base Provider class - defines interface for all LLM providers
 * Each provider implements its own request/response format conversion
 */

export class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get provider name (e.g., 'anthropic', 'openai')
   * @returns {string}
   */
  getName() {
    throw new Error('Provider must implement getName()');
  }

  /**
   * Build HTTP headers for API request
   * @returns {Object} Headers object
   */
  getHeaders() {
    throw new Error('Provider must implement getHeaders()');
  }

  /**
   * Build API endpoint URL
   * @param {boolean} useStreaming - Whether to use streaming endpoint
   * @returns {string} Complete API URL
   */
  buildUrl(_useStreaming) {
    throw new Error('Provider must implement buildUrl()');
  }

  /**
   * Build request body from Anthropic-format messages
   * @param {Array} messages - Messages in Anthropic format
   * @param {string|Array} systemPrompt - System prompt
   * @param {Array} tools - Tool definitions in Anthropic format
   * @param {boolean} useStreaming - Whether to request streaming
   * @returns {Object} Provider-specific request body
   */
  buildRequestBody(_messages, _systemPrompt, _tools, _useStreaming) {
    throw new Error('Provider must implement buildRequestBody()');
  }

  /**
   * Normalize provider response to Anthropic format
   * @param {Object} response - Raw provider response
   * @returns {Object} Normalized response with {content, stop_reason, usage}
   */
  normalizeResponse(_response) {
    throw new Error('Provider must implement normalizeResponse()');
  }

  /**
   * Handle streaming response
   * @param {Response} response - Fetch Response object
   * @param {Function} onTextChunk - Callback for text chunks
   * @param {Function} log - Logging function
   * @returns {Promise<Object>} Normalized response
   */
  async handleStreaming(_response, _onTextChunk, _log) {
    throw new Error('Provider must implement handleStreaming()');
  }

  /**
   * Detect if a base URL belongs to this provider
   * @param {string} baseUrl - API base URL
   * @returns {boolean}
   */
  static matchesUrl(_baseUrl) {
    throw new Error('Provider must implement static matchesUrl()');
  }
}
