/**
 * LLM Client Module
 *
 * Routes LLM requests through the native host to the Chrome extension,
 * which uses its multi-provider system (Anthropic, OpenAI, Google, etc.).
 *
 * This allows the MCP server's agents (Planner, Explorer) to use LLM
 * intelligence without duplicating the provider infrastructure.
 *
 * Flow:
 * MCP Server → Native Host → Extension → LLM Provider → Response
 */

/**
 * Model tier for intelligent model selection
 * - "fast": Use Haiku-class models (quick, cheap) - good for browser execution
 * - "smart": Use Sonnet-class models (balanced) - good for planning, analysis
 * - "powerful": Use Opus-class models (best quality) - good for complex reasoning
 */
export type ModelTier = "fast" | "smart" | "powerful";

// Types for LLM requests and responses
export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  /** Optional: request JSON response */
  jsonMode?: boolean;
  /** Optional: max tokens for response */
  maxTokens?: number;
  /** Optional: model tier preference (fast/smart/powerful) */
  modelTier?: ModelTier;
}

export interface LLMResponse {
  content: string;
  /** If jsonMode was true and response is valid JSON */
  json?: any;
  /** Token usage if available */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Pending request tracking
interface PendingLLMRequest {
  resolve: (response: LLMResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Map of pending requests by requestId
const pendingRequests: Map<string, PendingLLMRequest> = new Map();

// Callback to send messages to native host (set by index.ts)
let sendToNativeCallback: ((message: any) => Promise<void>) | null = null;

// Default timeout for LLM requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Initialize the LLM client with the sendToNative callback
 *
 * Must be called before using askLLM()
 */
export function initializeLLMClient(
  sendToNative: (message: any) => Promise<void>
): void {
  sendToNativeCallback = sendToNative;
  console.error("[LLM] Client initialized");
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Send an LLM request and wait for the response
 *
 * Routes through: MCP Server → Native Host → Extension → LLM Provider
 *
 * @param request - The LLM request (prompt, systemPrompt, options)
 * @param timeoutMs - Timeout in milliseconds (default: 30s)
 * @returns The LLM response
 * @throws Error if timeout or communication failure
 */
export async function askLLM(
  request: LLMRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<LLMResponse> {
  if (!sendToNativeCallback) {
    throw new Error("LLM client not initialized. Call initializeLLMClient() first.");
  }

  const requestId = generateRequestId();
  const startTime = Date.now();
  console.error(`[LLM] askLLM called at ${new Date().toISOString()}, requestId=${requestId}, timeout=${timeoutMs}ms`);

  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeout = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      console.error(`[LLM] TIMEOUT fired for ${requestId} after ${elapsed}ms (expected ${timeoutMs}ms)`);
      pendingRequests.delete(requestId);
      reject(new Error(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Store pending request
    pendingRequests.set(requestId, { resolve, reject, timeout });

    // Send to native host
    sendToNativeCallback!({
      type: "llm_request",
      requestId,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      jsonMode: request.jsonMode,
      maxTokens: request.maxTokens,
      modelTier: request.modelTier,  // "fast", "smart", or "powerful"
    }).catch((err) => {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
      reject(new Error(`Failed to send LLM request: ${err.message}`));
    });
  });
}

/**
 * Handle LLM response from native host
 *
 * Called by processResult() in index.ts when a response arrives
 */
export function handleLLMResponse(
  requestId: string,
  response: { content?: string; error?: string; usage?: any }
): void {
  console.error(`[LLM] handleLLMResponse called at ${new Date().toISOString()} for requestId=${requestId}`);
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    console.error(`[LLM] Received response for unknown request: ${requestId} (request may have timed out already)`);
    console.error(`[LLM] Current pending requests: ${Array.from(pendingRequests.keys()).join(', ') || '(none)'}`);
    return;
  }
  console.error(`[LLM] Response matched pending request, resolving...`);

  clearTimeout(pending.timeout);
  pendingRequests.delete(requestId);

  if (response.error) {
    pending.reject(new Error(response.error));
    return;
  }

  if (!response.content) {
    pending.reject(new Error("LLM returned empty response"));
    return;
  }

  // Try to parse as JSON if it looks like JSON
  let json: any = undefined;
  const trimmed = response.content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      // Not valid JSON, that's fine
    }
  }

  pending.resolve({
    content: response.content,
    json,
    usage: response.usage,
  });
}

/**
 * Convenience method: Ask LLM and expect JSON response
 *
 * Throws if response is not valid JSON
 */
export async function askLLMForJSON<T = any>(
  request: LLMRequest,
  timeoutMs?: number
): Promise<T> {
  const response = await askLLM({ ...request, jsonMode: true }, timeoutMs);

  if (!response.json) {
    // Try harder to extract JSON
    const content = response.content.trim();

    // Try to find JSON in markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through to error
      }
    }

    throw new Error(`LLM did not return valid JSON: ${content.substring(0, 100)}...`);
  }

  return response.json as T;
}

/**
 * Check if LLM client is available
 */
export function isLLMAvailable(): boolean {
  return sendToNativeCallback !== null;
}

/**
 * Get count of pending LLM requests (for debugging)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Get IDs of all pending LLM requests (for filtered polling)
 */
export function getPendingRequestIds(): string[] {
  return Array.from(pendingRequests.keys());
}

/**
 * Send a debug log message through the native host.
 * This allows agent logs to appear in the mcp-debug.log file.
 *
 * @param source - The source of the log (e.g., "PlanningAgent", "ExplorerAgent")
 * @param message - The log message
 * @param data - Optional additional data
 */
export async function sendAgentLog(
  source: string,
  message: string,
  data?: any
): Promise<void> {
  if (!sendToNativeCallback) {
    // Fall back to console.error if native host not connected
    console.error(`[${source}] ${message}`, data || "");
    return;
  }

  try {
    await sendToNativeCallback({
      type: "agent_log",
      source,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Silent fail, also log to console
    console.error(`[${source}] ${message}`, data || "");
  }
}
