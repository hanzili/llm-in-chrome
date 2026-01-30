/**
 * Read page tool handler
 * Generates accessibility tree representation of the page
 */

/**
 * Handle read_page tool - get accessibility tree representation
 *
 * @param {Object} input - Tool input
 * @param {string} [input.filter] - 'interactive' or 'all' (default: 'all')
 * @param {number} input.tabId - Tab ID to read from
 * @param {number} [input.depth] - Max tree depth (default: 15)
 * @param {string} [input.ref_id] - Focus on specific element by ref
 * @param {number} [input.max_chars] - Max output chars (default: 50000)
 * @returns {Promise<{output?: string, error?: string}>}
 */
export async function handleReadPage(input) {
  const { filter, tabId, depth, ref_id, max_chars } = input || {};

  if (!tabId) {
    throw new Error("No active tab found");
  }

  const tab = await chrome.tabs.get(tabId);
  if (!tab.id) {
    throw new Error("Active tab has no ID");
  }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',  // Run in content script's world to access __generateAccessibilityTree
      func: (filterArg, depthArg, maxCharsArg, refIdArg) => {
        if (typeof window.__generateAccessibilityTree !== "function") {
          throw new Error(
            "Accessibility tree function not found. Please refresh the page."
          );
        }
        return window.__generateAccessibilityTree(filterArg, depthArg, maxCharsArg, refIdArg);
      },
      args: [
        filter || null,
        depth ?? null,
        max_chars ?? 50000,
        ref_id ?? null,
      ],
    });

    if (!result || result.length === 0) {
      throw new Error("No results returned from page script");
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
    if (pageResult.error) {
      return { error: pageResult.error };
    }

    const viewportInfo = `Viewport: ${pageResult.viewport.width}x${pageResult.viewport.height}`;
    return {
      output: `${pageResult.pageContent}\n\n${viewportInfo}`,
    };
  } catch (err) {
    return {
      error: `Failed to read page: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}
