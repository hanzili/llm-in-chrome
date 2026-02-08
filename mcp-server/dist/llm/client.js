/**
 * LLM Client Module
 *
 * Calls ccproxy (local Claude Code proxy) directly via HTTP.
 * No extension dependency — planning/explorer agents don't need the browser.
 *
 * Flow: MCP Server → ccproxy (localhost:8000) → Anthropic API
 */
// ccproxy endpoint
const CCPROXY_URL = "http://127.0.0.1:8000/claude/v1/messages";
// Model tier → Anthropic model ID
const MODEL_MAP = {
    fast: "claude-haiku-4-5-20251001",
    smart: "claude-sonnet-4-5-20250929",
    powerful: "claude-opus-4-5-20251101",
};
const DEFAULT_TIMEOUT_MS = 60000; // 60s — LLM calls can be slow
/**
 * Send an LLM request directly to ccproxy and return the response.
 */
export async function askLLM(request, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const model = MODEL_MAP[request.modelTier || "smart"];
    const body = {
        model,
        max_tokens: request.maxTokens || 2000,
        messages: [{ role: "user", content: request.prompt }],
        ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
    };
    console.error(`[LLM] Calling ccproxy: model=${model}, prompt=${request.prompt.substring(0, 60)}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(CCPROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ccproxy ${response.status}: ${errorText.substring(0, 200)}`);
        }
        const result = await response.json();
        const content = result.content?.find((b) => b.type === "text")?.text || "";
        console.error(`[LLM] Response: ${content.length} chars, model=${model}`);
        // Try to parse as JSON if it looks like JSON
        let json = undefined;
        const trimmed = content.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                json = JSON.parse(trimmed);
            }
            catch {
                // Not valid JSON, that's fine
            }
        }
        return {
            content,
            json,
            usage: result.usage
                ? { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens }
                : undefined,
        };
    }
    catch (err) {
        if (err.name === "AbortError") {
            throw new Error(`LLM request timed out after ${timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Convenience method: Ask LLM and expect JSON response
 */
export async function askLLMForJSON(request, timeoutMs) {
    const response = await askLLM({ ...request, jsonMode: true }, timeoutMs);
    if (!response.json) {
        const content = response.content.trim();
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            }
            catch {
                // Fall through to error
            }
        }
        throw new Error(`LLM did not return valid JSON: ${content.substring(0, 100)}...`);
    }
    return response.json;
}
/**
 * Check if LLM client is available (always true with ccproxy)
 */
export function isLLMAvailable() {
    return true;
}
// ── Legacy exports (kept for compatibility but no longer needed) ──
export function initializeLLMClient(_sendToNative) {
    console.error("[LLM] Client initialized (using ccproxy directly, sendToNative callback ignored)");
}
export function handleLLMResponse(requestId, _response) {
    console.error(`[LLM] handleLLMResponse called for ${requestId} — ignored (using ccproxy directly)`);
}
export function getPendingRequestCount() {
    return 0;
}
export function getPendingRequestIds() {
    return [];
}
/**
 * Send a debug log message (falls back to console.error since we no longer need native host)
 */
export async function sendAgentLog(source, message, data) {
    console.error(`[${source}] ${message}`, data || "");
}
