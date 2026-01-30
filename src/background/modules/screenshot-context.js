/**
 * ScreenshotContextManager - Manages screenshot context for coordinate scaling
 * Stores viewport/screenshot dimensions per tab for DPR coordinate scaling
 */

class ScreenshotContextManager {
  contexts = new Map();

  /**
   * Store screenshot context for a tab
   * @param {number} tabId - The tab ID
   * @param {Object} screenshotResult - Result from screenshot operation
   */
  setContext(tabId, screenshotResult) {
    if (screenshotResult.viewportWidth && screenshotResult.viewportHeight) {
      const context = {
        viewportWidth: screenshotResult.viewportWidth,
        viewportHeight: screenshotResult.viewportHeight,
        screenshotWidth: screenshotResult.width,
        screenshotHeight: screenshotResult.height,
      };
      this.contexts.set(tabId, context);
    }
  }

  /**
   * Get screenshot context for a tab
   * @param {number} tabId - The tab ID
   * @returns {Object|undefined} The context or undefined
   */
  getContext(tabId) {
    return this.contexts.get(tabId);
  }

  /**
   * Clear context for a specific tab
   * @param {number} tabId - The tab ID
   */
  clearContext(tabId) {
    this.contexts.delete(tabId);
  }

  /**
   * Clear all stored contexts
   */
  clearAllContexts() {
    this.contexts.clear();
  }
}

// Singleton instance
export const screenshotContextManager = new ScreenshotContextManager();

// Also export the class for testing
export { ScreenshotContextManager };

/**
 * Scale coordinates from screenshot space to viewport space
 * Scale coordinates based on DPR
 *
 * @param {number} x - X coordinate in screenshot space
 * @param {number} y - Y coordinate in screenshot space
 * @param {Object} context - Screenshot context with viewport/screenshot dimensions
 * @returns {[number, number]} Scaled [x, y] coordinates
 */
export function scaleCoordinates(x, y, context) {
  const scaleX = context.viewportWidth / context.screenshotWidth;
  const scaleY = context.viewportHeight / context.screenshotHeight;
  return [x * scaleX, y * scaleY];
}
