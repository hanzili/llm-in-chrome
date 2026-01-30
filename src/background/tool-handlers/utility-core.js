/**
 * Utility tool handlers
 * Contains: find, get_page_text, javascript_tool
 */

import { cdpHelper } from '../modules/cdp-helper.js';

// ============================================================================
// FIND TOOL
// Source: lines 7344-7533 (pe constant)
// ============================================================================

/**
 * Handle find tool - find elements using natural language
 *
 * NOTE: This tool requires LLM to parse accessibility tree and find matches.
 * We need to pass a callLLM function to make this work.
 *
 * @param {Object} input - Tool input
 * @param {string} input.query - Natural language search query
 * @param {number} input.tabId - Tab ID
 * @param {Object} deps - Dependencies
 * @param {Function} deps.callLLMSimple - Function to call LLM
 * @returns {Promise<{output?: string, error?: string}>}
 */
export async function handleFind(input, deps) {
  try {
    const { query, tabId } = input;
    if (!query) {
      throw new Error("Query parameter is required");
    }
    if (!tabId) {
      throw new Error("No active tab found");
    }

    const tab = await chrome.tabs.get(tabId);
    if (!tab.id) {
      throw new Error("Active tab has no ID");
    }

    // Get accessibility tree
    const treeResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',  // Run in content script's world to access __generateAccessibilityTree
      func: () => {
        if (typeof window.__generateAccessibilityTree !== "function") {
          throw new Error(
            "Accessibility tree function not found. Please refresh the page."
          );
        }
        return window.__generateAccessibilityTree("all");
      },
      args: [],
    });

    if (!treeResult || treeResult.length === 0) {
      throw new Error("No results returned from page script");
    }
    if ("error" in treeResult[0] && treeResult[0].error) {
      throw new Error(
        `Script execution failed: ${treeResult[0].error.message || "Unknown error"}`
      );
    }
    if (!treeResult[0].result) {
      throw new Error("Page script returned empty result");
    }

    const pageData = treeResult[0].result;

    // Use LLM to find matching elements
    if (!deps?.callLLMSimple) {
      throw new Error(
        "LLM client not available. Please check your API configuration."
      );
    }

    const llmResponse = await deps.callLLMSimple({
      maxTokens: 800,
      messages: [
        {
          role: "user",
          content: `You are helping find elements on a web page. The user wants to find: "${query}"

Here is the accessibility tree of the page:
${pageData.pageContent}

Find ALL elements that match the user's query. Return up to 20 most relevant matches, ordered by relevance.

Return your findings in this exact format (one line per matching element):

FOUND: <total_number_of_matching_elements>
SHOWING: <number_shown_up_to_20>
---
ref_X | role | name | type | reason why this matches
ref_Y | role | name | type | reason why this matches
...

If there are more than 20 matches, add this line at the end:
MORE: Use a more specific query to see additional results

If no matching elements are found, return only:
FOUND: 0
ERROR: explanation of why no elements were found`,
        },
      ],
    });

    const responseText = llmResponse.content[0];
    if (responseText.type !== "text") {
      throw new Error("Unexpected response type from API");
    }

    const lines = responseText.text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);

    let totalFound = 0;
    const matches = [];
    let errorMsg;
    let hasMore = false;

    for (const line of lines) {
      if (line.startsWith("FOUND:")) {
        totalFound = parseInt(line.split(":")[1].trim()) || 0;
      } else if (line.startsWith("SHOWING:")) {
        // Ignore, we count matches ourselves
      } else if (line.startsWith("ERROR:")) {
        errorMsg = line.substring(6).trim();
      } else if (line.startsWith("MORE:")) {
        hasMore = true;
      } else if (line.includes("|") && line.startsWith("ref_")) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 4) {
          matches.push({
            ref: parts[0],
            role: parts[1],
            name: parts[2],
            type: parts[3] || undefined,
            description: parts[4] || undefined,
          });
        }
      }
    }

    if (totalFound === 0 || matches.length === 0) {
      return { error: errorMsg || "No matching elements found" };
    }

    let summary = `Found ${totalFound} matching element${totalFound === 1 ? "" : "s"}`;
    if (hasMore) {
      summary += ` (showing first ${matches.length}, use a more specific query to narrow results)`;
    }

    const matchList = matches
      .map((m) => {
        let line = `- ${m.ref}: ${m.role}`;
        if (m.name) line += ` "${m.name}"`;
        if (m.type) line += ` (${m.type})`;
        if (m.description) line += ` - ${m.description}`;
        return line;
      })
      .join("\n");

    return {
      output: `${summary}\n\n${matchList}`,
    };
  } catch (err) {
    return {
      error: `Failed to find element: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}

// ============================================================================
// GET PAGE TEXT TOOL
// Source: lines 7145-7342 (he constant)
// ============================================================================

/**
 * Handle get_page_text tool - extract raw text content from page
 *
 * @param {Object} input - Tool input
 * @param {number} input.tabId - Tab ID
 * @param {number} [input.max_chars] - Max chars (default: 50000)
 * @returns {Promise<{output?: string, error?: string}>}
 */
export async function handleGetPageText(input) {
  const { tabId, max_chars } = input || {};

  if (!tabId) {
    throw new Error("No active tab found");
  }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (maxChars) => {
        // Priority selectors for article content
        const selectors = [
          "article",
          "main",
          '[class*="articleBody"]',
          '[class*="article-body"]',
          '[class*="post-content"]',
          '[class*="entry-content"]',
          '[class*="content-body"]',
          '[role="main"]',
          ".content",
          "#content",
        ];

        let contentElement = null;
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            // Find the element with the most text
            let bestElement = elements[0];
            let maxLen = 0;
            elements.forEach((el) => {
              const len = el.textContent?.length || 0;
              if (len > maxLen) {
                maxLen = len;
                bestElement = el;
              }
            });
            contentElement = bestElement;
            break;
          }
        }

        if (!contentElement) {
          if ((document.body.textContent || "").length > maxChars) {
            return {
              text: "",
              source: "none",
              title: document.title,
              url: window.location.href,
              error:
                "No semantic content element found and page body is too large (likely contains CSS/scripts). Try using read_page instead.",
            };
          }
          contentElement = document.body;
        }

        const text = (contentElement.textContent || "")
          .replace(/\s+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (!text || text.length < 10) {
          return {
            text: "",
            source: "none",
            title: document.title,
            url: window.location.href,
            error:
              "No text content found. Page may contain only images, videos, or canvas-based content.",
          };
        }

        if (text.length > maxChars) {
          return {
            text: "",
            source: contentElement.tagName.toLowerCase(),
            title: document.title,
            url: window.location.href,
            error: `Output exceeds ${maxChars} character limit (${text.length} characters). Try using read_page with a specific ref_id to focus on a smaller section, or increase max_chars.`,
          };
        }

        return {
          text,
          source: contentElement.tagName.toLowerCase(),
          title: document.title,
          url: window.location.href,
        };
      },
      args: [max_chars ?? 50000],
    });

    if (!result || result.length === 0) {
      throw new Error("No main text content found.");
    }
    if ("error" in result[0] && result[0].error) {
      throw new Error(
        `Script execution failed: ${result[0].error.message || "Unknown error"}`
      );
    }
    if (!result[0].result) {
      throw new Error("Page script returned empty result");
    }

    const pageResult = result[0].result;
    return pageResult.error
      ? { error: pageResult.error }
      : {
          output: `Title: ${pageResult.title}\nURL: ${pageResult.url}\nSource element: <${pageResult.source}>\n---\n${pageResult.text}`,
        };
  } catch (err) {
    return {
      error: `Failed to extract page text: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}

// ============================================================================
// JAVASCRIPT TOOL
// Source: lines 8994-9220 (De constant)
// ============================================================================

/**
 * Sanitize output to remove sensitive data
 * Execute JavaScript and capture result
 */
function sanitizeOutput(value, depth = 0) {
  if (depth > 5) {
    return "[TRUNCATED: Max depth exceeded]";
  }

  const sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private[_-]?key/i,
    /access[_-]?key/i,
    /bearer/i,
    /oauth/i,
    /session/i,
  ];

  if (typeof value === "string") {
    // Check for cookie/query string data
    if (value.includes("=") && (value.includes(";") || value.includes("&"))) {
      return "[BLOCKED: Cookie/query string data]";
    }
    // Check for JWT token
    if (value.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
      return "[BLOCKED: JWT token]";
    }
    // Check for base64 encoded data
    if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(value)) {
      return "[BLOCKED: Base64 encoded data]";
    }
    // Check for hex credential
    if (/^[a-f0-9]{32,}$/i.test(value)) {
      return "[BLOCKED: Hex credential]";
    }
    // Truncate long strings
    if (value.length > 1000) {
      return `${value.substring(0, 1000)}[TRUNCATED]`;
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      const isSensitiveKey = sensitivePatterns.some((p) => p.test(key));
      sanitized[key] = isSensitiveKey
        ? "[BLOCKED: Sensitive key]"
        : key === "cookie" || key === "cookies"
        ? "[BLOCKED: Cookie access]"
        : sanitizeOutput(val, depth + 1);
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    const sanitized = value.slice(0, 100).map((v) => sanitizeOutput(v, depth + 1));
    if (value.length > 100) {
      sanitized.push(`[TRUNCATED: ${value.length - 100} more items]`);
    }
    return sanitized;
  }

  return value;
}

/**
 * Handle javascript_tool - execute JavaScript in page context
 *
 * @param {Object} input - Tool input
 * @param {string} input.action - Must be 'javascript_exec'
 * @param {string} input.text - JavaScript code to execute
 * @param {number} input.tabId - Tab ID
 * @returns {Promise<{output?: string, error?: string}>}
 */
export async function handleJavaScriptTool(input) {
  try {
    const { action, text, tabId } = input;

    if (action !== "javascript_exec") {
      throw new Error("'javascript_exec' is the only supported action");
    }
    if (!text) {
      throw new Error("Code parameter is required");
    }
    if (!tabId) {
      throw new Error("No active tab found");
    }

    // Build the expression wrapper
    const expression = `
      (function() {
        'use strict';
        try {
          return eval(\`${text.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`);
        } catch (e) {
          throw e;
        }
      })()
    `;

    // Execute via CDP Runtime.evaluate
    const result = await cdpHelper.sendCommand(tabId, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: 10000,
    });

    let output = "";
    let isError = false;
    let errorMsg = "";
    const maxOutputSize = 51200;

    if (result.exceptionDetails) {
      isError = true;
      const exception = result.exceptionDetails.exception;
      const isTimeout = exception?.description?.includes("execution was terminated");
      errorMsg = isTimeout
        ? "Execution timeout: Code exceeded 10-second limit"
        : exception?.description || exception?.value || "Unknown error";
    } else if (result.result) {
      const evalResult = result.result;
      if (evalResult.type === "undefined") {
        output = "undefined";
      } else if (evalResult.type === "object" && evalResult.subtype === "null") {
        output = "null";
      } else if (evalResult.type === "function") {
        output = evalResult.description || "[Function]";
      } else if (evalResult.type === "object") {
        if (evalResult.subtype === "node") {
          output = evalResult.description || "[DOM Node]";
        } else if (evalResult.subtype === "array") {
          output = evalResult.description || "[Array]";
        } else {
          const sanitized = sanitizeOutput(evalResult.value || {});
          output = evalResult.description || JSON.stringify(sanitized, null, 2);
        }
      } else if (evalResult.value !== undefined) {
        const sanitized = sanitizeOutput(evalResult.value);
        output = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized, null, 2);
      } else {
        output = evalResult.description || String(evalResult.value);
      }
    } else {
      output = "undefined";
    }

    if (isError) {
      return { error: `JavaScript execution error: ${errorMsg}` };
    }

    if (output.length > maxOutputSize) {
      output = `${output.substring(0, maxOutputSize)}\n[OUTPUT TRUNCATED: Exceeded 50KB limit]`;
    }

    return { output };
  } catch (err) {
    return {
      error: `Failed to execute JavaScript: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}
