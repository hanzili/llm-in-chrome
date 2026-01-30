/**
 * Monitoring tool handlers
 * Handles: read_console_messages, read_network_requests
 */

/**
 * @typedef {Object} MonitoringToolDeps
 * @property {Function} ensureDebugger - Attach debugger to tab if needed
 * @property {Function} isNetworkTrackingEnabled - Check if network tracking is enabled
 * @property {Function} enableNetworkTracking - Enable network tracking
 * @property {Array<Object>} consoleMessages - Shared array of console messages
 * @property {Array<Object>} networkRequests - Shared array of network requests
 */

/**
 * Handle read_console_messages tool - read browser console messages
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to read console from
 * @param {string} [toolInput.pattern] - Regex pattern to filter messages
 * @param {boolean} [toolInput.onlyErrors] - Only return error messages
 * @param {boolean} [toolInput.clear] - Clear console after reading
 * @param {number} [toolInput.limit] - Maximum messages to return (default: 100)
 * @param {MonitoringToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Console messages or error
 */
export async function handleReadConsoleMessages(toolInput, deps) {
  const { tabId } = toolInput;
  const { ensureDebugger, consoleMessages } = deps;

  await ensureDebugger(tabId);
  const pattern = toolInput.pattern;
  const limit = toolInput.limit || 100;
  let messages = [...consoleMessages];

  if (toolInput.onlyErrors) {
    messages = messages.filter(m => m.type === 'error' || m.type === 'exception');
  }
  if (pattern) {
    try {
      const regex = new RegExp(pattern, 'i');
      messages = messages.filter(m => regex.test(m.text));
    } catch (e) {
      return `Invalid regex: ${pattern}`;
    }
  }

  if (toolInput.clear) {
    consoleMessages.length = 0; // Clear array in place
  }

  messages = messages.slice(-limit);

  if (messages.length === 0) {
    return 'No console messages found' + (pattern ? ` matching "${pattern}"` : '');
  }

  const messageList = messages.map(m => '[' + m.type.toUpperCase() + '] ' + m.text).join('\n');
  return `Found ${messages.length} messages:\n${messageList}`;
}

/**
 * Handle read_network_requests tool - read network requests
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID to read network from
 * @param {string} [toolInput.urlPattern] - URL pattern to filter requests
 * @param {boolean} [toolInput.clear] - Clear network log after reading
 * @param {number} [toolInput.limit] - Maximum requests to return (default: 100)
 * @param {MonitoringToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Network requests or error
 */
export async function handleReadNetworkRequests(toolInput, deps) {
  const { tabId } = toolInput;
  const { ensureDebugger, isNetworkTrackingEnabled, enableNetworkTracking, networkRequests } = deps;

  await ensureDebugger(tabId);
  if (!isNetworkTrackingEnabled()) {
    try {
      await enableNetworkTracking(tabId);
    } catch (err) {
      return `Error enabling network tracking: ${err.message}`;
    }
  }

  const pattern = toolInput.urlPattern;
  const limit = toolInput.limit || 100;
  let requests = [...networkRequests];

  if (pattern) {
    requests = requests.filter(r => r.url.includes(pattern));
  }

  if (toolInput.clear) {
    networkRequests.length = 0; // Clear array in place
  }

  requests = requests.slice(-limit);

  if (requests.length === 0) {
    return 'No network requests found' + (pattern ? ` matching "${pattern}"` : '');
  }

  const requestList = requests.map(r => {
    const statusText = r.status ? ' (' + r.status + ')' : '';
    return '[' + r.method + '] ' + r.url + statusText;
  }).join('\n');
  return `Found ${requests.length} requests:\n${requestList}`;
}
