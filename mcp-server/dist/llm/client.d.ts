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
/**
 * Initialize the LLM client with the sendToNative callback
 *
 * Must be called before using askLLM()
 */
export declare function initializeLLMClient(sendToNative: (message: any) => Promise<void>): void;
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
export declare function askLLM(request: LLMRequest, timeoutMs?: number): Promise<LLMResponse>;
/**
 * Handle LLM response from native host
 *
 * Called by processResult() in index.ts when a response arrives
 */
export declare function handleLLMResponse(requestId: string, response: {
    content?: string;
    error?: string;
    usage?: any;
}): void;
/**
 * Convenience method: Ask LLM and expect JSON response
 *
 * Throws if response is not valid JSON
 */
export declare function askLLMForJSON<T = any>(request: LLMRequest, timeoutMs?: number): Promise<T>;
/**
 * Check if LLM client is available
 */
export declare function isLLMAvailable(): boolean;
/**
 * Get count of pending LLM requests (for debugging)
 */
export declare function getPendingRequestCount(): number;
/**
 * Get IDs of all pending LLM requests (for filtered polling)
 */
export declare function getPendingRequestIds(): string[];
/**
 * Send a debug log message through the native host.
 * This allows agent logs to appear in the mcp-debug.log file.
 *
 * @param source - The source of the log (e.g., "PlanningAgent", "ExplorerAgent")
 * @param message - The log message
 * @param data - Optional additional data
 */
export declare function sendAgentLog(source: string, message: string, data?: any): Promise<void>;
