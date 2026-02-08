/**
 * LLM Client Module
 *
 * Calls ccproxy (local Claude Code proxy) directly via HTTP.
 * No extension dependency — planning/explorer agents don't need the browser.
 *
 * Flow: MCP Server → ccproxy (localhost:8000) → Anthropic API
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
    jsonMode?: boolean;
    maxTokens?: number;
    modelTier?: ModelTier;
}
export interface LLMResponse {
    content: string;
    json?: any;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}
/**
 * Send an LLM request directly to ccproxy and return the response.
 */
export declare function askLLM(request: LLMRequest, timeoutMs?: number): Promise<LLMResponse>;
/**
 * Convenience method: Ask LLM and expect JSON response
 */
export declare function askLLMForJSON<T = any>(request: LLMRequest, timeoutMs?: number): Promise<T>;
/**
 * Check if LLM client is available (always true with ccproxy)
 */
export declare function isLLMAvailable(): boolean;
export declare function initializeLLMClient(_sendToNative: (message: any) => Promise<void>): void;
export declare function handleLLMResponse(requestId: string, _response: {
    content?: string;
    error?: string;
    usage?: any;
}): void;
export declare function getPendingRequestCount(): number;
export declare function getPendingRequestIds(): string[];
/**
 * Send a debug log message (falls back to console.error since we no longer need native host)
 */
export declare function sendAgentLog(source: string, message: string, data?: any): Promise<void>;
