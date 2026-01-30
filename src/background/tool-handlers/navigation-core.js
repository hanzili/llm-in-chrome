/**
 * Navigation tool handler
 * Handles URL navigation and back/forward actions
 */

/**
 * Handle navigate tool - navigate to URL or back/forward
 *
 * @param {Object} input - Tool input
 * @param {string} input.url - URL to navigate to, or 'back'/'forward'
 * @param {number} input.tabId - Tab ID to navigate
 * @returns {Promise<{output?: string, error?: string}>}
 */
export async function handleNavigate(input) {
  try {
    const { url, tabId } = input;

    if (!url) {
      throw new Error("URL parameter is required");
    }
    if (!tabId) {
      throw new Error("No active tab found");
    }

    const tab = await chrome.tabs.get(tabId);
    if (!tab.id) {
      throw new Error("Active tab has no ID");
    }

    // Handle back navigation
    if (url.toLowerCase() === "back") {
      await chrome.tabs.goBack(tab.id);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updatedTab = await chrome.tabs.get(tab.id);
      return {
        output: `Navigated back to ${updatedTab.url}`,
      };
    }

    // Handle forward navigation
    if (url.toLowerCase() === "forward") {
      await chrome.tabs.goForward(tab.id);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updatedTab = await chrome.tabs.get(tab.id);
      return {
        output: `Navigated forward to ${updatedTab.url}`,
      };
    }

    // Normalize URL
    let fullUrl = url;
    if (!fullUrl.match(/^https?:\/\//)) {
      fullUrl = `https://${fullUrl}`;
    }

    // Validate URL
    try {
      new URL(fullUrl);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Navigate to URL
    await chrome.tabs.update(tabId, { url: fullUrl });
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      output: `Navigated to ${fullUrl}`,
    };
  } catch (err) {
    return {
      error: `Failed to navigate: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}
