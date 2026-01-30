/**
 * Retry Utilities
 * Provides retry logic with exponential backoff
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.delay - Initial delay in ms (default: 200)
 * @param {Function} options.shouldRetry - Optional function to determine if error is retryable
 * @param {Function} options.onRetry - Optional callback called on each retry attempt
 * @returns {Promise} Result of the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    delay = 200,
    shouldRetry = null,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(error, attempt)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Exponential backoff: delay * attempt
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }

  throw lastError;
}

/**
 * Check if error is a "tab being dragged" error
 */
export function isTabDraggingError(error) {
  const message = error?.message?.toLowerCase() || '';
  return message.includes('dragging') || message.includes('being dragged');
}

/**
 * Check if error is a debugger detachment error
 */
export function isDebuggerDetachedError(error) {
  const message = error?.message?.toLowerCase() || '';
  return message.includes('not attached') || message.includes('detached');
}
