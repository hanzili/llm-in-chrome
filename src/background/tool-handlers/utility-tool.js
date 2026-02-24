/**
 * Utility tool handlers
 * Handles: get_page_text, javascript_tool, upload_image
 */

import { LIMITS } from '../modules/constants.js';

/**
 * @typedef {Object} UtilityToolDeps
 * @property {Function} sendToContent - Send message to content script
 * @property {Function} sendDebuggerCommand - Send CDP command to tab
 * @property {Function} ensureDebugger - Attach debugger to tab if needed
 * @property {Map<string, string>} capturedScreenshots - Map of screenshot IDs to data URLs
 */

/**
 * Handle get_page_text tool - extract plain text from page
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to read from
 * @param {number} [toolInput.max_chars] - Maximum characters to return
 * @param {UtilityToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Page text or error message
 */
export async function handleGetPageText(toolInput, deps) {
  const { tabId } = toolInput;
  const { sendToContent } = deps;

  const result = await sendToContent(tabId, 'GET_PAGE_TEXT');
  if (result.success) {
    const maxChars = toolInput.max_chars || LIMITS.PAGE_TEXT_CHARS;
    const text = result.text.substring(0, maxChars);
    return `Page text (${result.title}):\n${text}`;
  }
  return `Error: ${result.error}`;
}

/**
 * Handle javascript_tool - execute JavaScript in page context
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to execute in
 * @param {string} toolInput.action - Must be 'javascript_exec'
 * @param {string} toolInput.text - JavaScript code to execute
 * @param {UtilityToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Execution result or error message
 */
export async function handleJavascriptTool(toolInput, deps) {
  const { tabId } = toolInput;
  const { sendDebuggerCommand } = deps;

  if (toolInput.action !== 'javascript_exec') {
    return `Error: action must be 'javascript_exec'`;
  }

  try {
    // Escape backticks and dollar signs for template literal safety
    const escapedCode = toolInput.text.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    // Wrap in IIFE with strict mode
    const expression = `
      (function() {
        'use strict';
        try {
          return eval(\`${escapedCode}\`);
        } catch (e) {
          throw e;
        }
      })()
    `;

    // Use Chrome DevTools Protocol Runtime.evaluate (bypasses CSP!)
    const result = await sendDebuggerCommand(tabId, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: 10000,
    });

    if (result.exceptionDetails) {
      return `Error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Unknown error'}`;
    }

    // Filter sensitive data
    const filterSensitive = (value, depth = 0) => {
      if (depth > 5) return '[TRUNCATED: Max depth exceeded]';

      const sensitivePatterns = [/password/i, /token/i, /secret/i, /api[_-]?key/i, /auth/i, /credential/i, /private[_-]?key/i];

      if (typeof value === 'string') {
        // Block cookie/query strings
        if (value.includes('=') && (value.includes(';') || value.includes('&'))) {
          return '[BLOCKED: Cookie/query string data]';
        }
        // Block JWT tokens
        if (value.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
          return '[BLOCKED: JWT token]';
        }
        // Truncate long strings
        if (value.length > 1000) return value.substring(0, 1000) + '[TRUNCATED]';
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const filtered = {};
        for (const [key, val] of Object.entries(value)) {
          const isSensitive = sensitivePatterns.some(p => p.test(key));
          filtered[key] = isSensitive ? '[BLOCKED: Sensitive key]' : filterSensitive(val, depth + 1);
        }
        return filtered;
      }

      return value;
    };

    let output = result.result?.value;
    if (output === undefined) return 'undefined';
    if (output === null) return 'null';
    if (typeof output === 'object') {
      output = filterSensitive(output);
      return JSON.stringify(output, null, 2);
    }
    return String(output);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

/**
 * Handle view_screenshot tool - return a previously captured screenshot to the LLM
 * @param {Object} toolInput - Tool input parameters
 * @param {string} toolInput.imageId - ID of captured screenshot
 * @param {UtilityToolDeps} deps - Dependency injection object
 * @returns {Promise<Object>} Image result with base64 data
 */
export async function handleUploadImage(toolInput, deps) {
  const { capturedScreenshots } = deps;

  const imageId = toolInput.imageId || toolInput.image_id;
  const dataUrl = capturedScreenshots.get(imageId);

  if (!dataUrl) {
    return `Error: Screenshot ${imageId} not found. Use computer tool with action=screenshot first.`;
  }

  // Extract base64 data from data URL
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: base64Data,
    },
  };
}
