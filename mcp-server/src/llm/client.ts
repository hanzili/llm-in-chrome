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

// ccproxy endpoint
const CCPROXY_URL = "http://127.0.0.1:8000/claude/v1/messages";

// Model tier → Anthropic model ID
const MODEL_MAP: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-5-20250929",
  powerful: "claude-opus-4-5-20251101",
};

const DEFAULT_TIMEOUT_MS = 60000; // 60s — LLM calls can be slow

/**
 * Send an LLM request directly to ccproxy and return the response.
 */
export async function askLLM(
  request: LLMRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<LLMResponse> {
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
    const content = result.content?.find((b: any) => b.type === "text")?.text || "";

    console.error(`[LLM] Response: ${content.length} chars, model=${model}`);

    // Try to parse as JSON if it looks like JSON
    let json: any = undefined;
    const trimmed = content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        json = JSON.parse(trimmed);
      } catch {
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
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience method: Ask LLM and expect JSON response
 */
export async function askLLMForJSON<T = any>(
  request: LLMRequest,
  timeoutMs?: number
): Promise<T> {
  const response = await askLLM({ ...request, jsonMode: true }, timeoutMs);

  if (!response.json) {
    const content = response.content.trim();
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
 * Check if LLM client is available (always true with ccproxy)
 */
export function isLLMAvailable(): boolean {
  return true;
}

// ── Legacy exports (kept for compatibility but no longer needed) ──

export function initializeLLMClient(_sendToNative: (message: any) => Promise<void>): void {
  console.error("[LLM] Client initialized (using ccproxy directly, sendToNative callback ignored)");
}

export function handleLLMResponse(
  requestId: string,
  _response: { content?: string; error?: string; usage?: any }
): void {
  console.error(`[LLM] handleLLMResponse called for ${requestId} — ignored (using ccproxy directly)`);
}

export function getPendingRequestCount(): number {
  return 0;
}

export function getPendingRequestIds(): string[] {
  return [];
}

/**
 * Send a debug log message (falls back to console.error since we no longer need native host)
 */
export async function sendAgentLog(
  source: string,
  message: string,
  data?: any
): Promise<void> {
  console.error(`[${source}] ${message}`, data || "");
}
