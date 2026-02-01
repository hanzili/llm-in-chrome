/**
 * Usage Tracker
 * Tracks token usage and costs across tasks for overnight runs
 *
 * Cost reference (as of Jan 2025):
 * - Claude Opus 4.5: $15/1M input, $75/1M output
 * - Claude Sonnet 4: $3/1M input, $15/1M output
 * - Claude Haiku 4: $1/1M input, $5/1M output
 * - With OAuth: $0 (included in Claude subscription)
 */

// Session-wide usage stats
let sessionStats = {
  startTime: null,
  tasksCompleted: 0,
  tasksFailed: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheCreationTokens: 0,
  totalCacheReadTokens: 0,
  apiCalls: 0,
};

// Per-task usage (reset per task)
let currentTaskUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  apiCalls: 0,
};

// Pricing per 1M tokens (USD) - Jan 2025 rates
const PRICING = {
  // Claude 4 family
  'claude-opus-4-5-20250514': { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-20250414': { input: 1, output: 5 },
  // Legacy models
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 1, output: 5 },
  'default': { input: 3, output: 15 },
};

/**
 * Start a new tracking session
 */
export function startSession() {
  sessionStats = {
    startTime: new Date().toISOString(),
    tasksCompleted: 0,
    tasksFailed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    apiCalls: 0,
  };
  resetTaskUsage();
}

/**
 * Reset per-task usage counters
 */
export function resetTaskUsage() {
  currentTaskUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    apiCalls: 0,
  };
}

/**
 * Record API call usage from response
 * @param {Object} usage - Usage object from API response
 * @param {number} usage.input_tokens - Input tokens used
 * @param {number} usage.output_tokens - Output tokens used
 * @param {number} [usage.cache_creation_input_tokens] - Tokens for cache creation
 * @param {number} [usage.cache_read_input_tokens] - Tokens read from cache
 */
export function recordApiCall(usage) {
  if (!usage) return;

  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  // Update current task
  currentTaskUsage.inputTokens += input;
  currentTaskUsage.outputTokens += output;
  currentTaskUsage.cacheCreationTokens += cacheCreation;
  currentTaskUsage.cacheReadTokens += cacheRead;
  currentTaskUsage.apiCalls++;

  // Update session totals
  sessionStats.totalInputTokens += input;
  sessionStats.totalOutputTokens += output;
  sessionStats.totalCacheCreationTokens += cacheCreation;
  sessionStats.totalCacheReadTokens += cacheRead;
  sessionStats.apiCalls++;
}

/**
 * Record task completion
 * @param {boolean} success - Whether task completed successfully
 */
export function recordTaskCompletion(success) {
  if (success) {
    sessionStats.tasksCompleted++;
  } else {
    sessionStats.tasksFailed++;
  }
}

/**
 * Get current task usage
 */
export function getTaskUsage() {
  return { ...currentTaskUsage };
}

/**
 * Get session stats with cost calculation
 * @param {string} [model] - Model name for cost calculation
 */
export function getSessionStats(model = 'default') {
  const pricing = PRICING[model] || PRICING.default;

  // Calculate cost (per 1M tokens)
  const inputCost = (sessionStats.totalInputTokens / 1_000_000) * pricing.input;
  const outputCost = (sessionStats.totalOutputTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  // Calculate averages
  const totalTasks = sessionStats.tasksCompleted + sessionStats.tasksFailed;
  const avgTokensPerTask = totalTasks > 0
    ? Math.round((sessionStats.totalInputTokens + sessionStats.totalOutputTokens) / totalTasks)
    : 0;
  const avgCostPerTask = totalTasks > 0 ? totalCost / totalTasks : 0;

  return {
    ...sessionStats,
    endTime: new Date().toISOString(),
    totalTasks,
    successRate: totalTasks > 0 ? (sessionStats.tasksCompleted / totalTasks * 100).toFixed(1) + '%' : 'N/A',
    estimatedCost: {
      input: `$${inputCost.toFixed(4)}`,
      output: `$${outputCost.toFixed(4)}`,
      total: `$${totalCost.toFixed(4)}`,
      withOAuth: '$0.00 (included in subscription)',
    },
    averages: {
      tokensPerTask: avgTokensPerTask,
      costPerTask: `$${avgCostPerTask.toFixed(4)}`,
    },
    cacheEfficiency: sessionStats.totalCacheReadTokens > 0
      ? `${((sessionStats.totalCacheReadTokens / sessionStats.totalInputTokens) * 100).toFixed(1)}% cache hits`
      : 'No caching',
  };
}

/**
 * Format session stats as human-readable summary
 * @param {string} [model] - Model name
 */
export function formatSessionSummary(model) {
  const stats = getSessionStats(model);

  return `
═══════════════════════════════════════════
  SESSION USAGE SUMMARY
═══════════════════════════════════════════

  Duration: ${stats.startTime} → ${stats.endTime}

  TASKS
  ─────
  Completed: ${stats.tasksCompleted}
  Failed:    ${stats.tasksFailed}
  Success:   ${stats.successRate}

  TOKENS
  ──────
  Input:  ${stats.totalInputTokens.toLocaleString()}
  Output: ${stats.totalOutputTokens.toLocaleString()}
  Cache:  ${stats.cacheEfficiency}

  COST ESTIMATE (if using API key)
  ────────────────────────────────
  Input:  ${stats.estimatedCost.input}
  Output: ${stats.estimatedCost.output}
  Total:  ${stats.estimatedCost.total}

  Average per task: ${stats.averages.costPerTask}

  WITH OAUTH: ${stats.estimatedCost.withOAuth}

═══════════════════════════════════════════
`;
}

/**
 * Save session summary to downloads folder
 */
export async function saveSessionSummary(model) {
  const stats = getSessionStats(model);
  const summary = formatSessionSummary(model);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `browser-agent/session-summary-${timestamp}.json`;

  const data = {
    ...stats,
    formattedSummary: summary,
  };

  const content = JSON.stringify(data, null, 2);
  const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(content)));

  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
    });
    console.log('[Usage] Session summary saved:', filename);
  } catch (err) {
    console.error('[Usage] Failed to save summary:', err);
  }

  return stats;
}
