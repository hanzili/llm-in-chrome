/**
 * Memory Lite - Simple Memory Layer using existing LLM infrastructure
 *
 * Replaces Mem0 with a lightweight implementation that:
 * - Uses askLLM() to extract facts (routes through Codex/your LLM provider)
 * - Stores facts as plain text (no embeddings needed)
 * - Uses LLM for semantic search (finds relevant facts for a query)
 * - Supports incremental context updates
 *
 * Why this approach:
 * - No external API keys needed (uses existing LLM routing)
 * - Works with any LLM provider (Claude, GPT, Codex, etc.)
 * - Simple and debuggable
 * - Trade-off: Uses more tokens than vector search, but avoids embedding costs
 *
 * Flow:
 * 1. storeContext(sessionId, context) → LLM extracts facts → stored in memory
 * 2. addFacts(sessionId, facts) → Add facts directly (for incremental updates)
 * 3. searchMemory(sessionId, query) → LLM finds relevant facts → returns matches
 */
import { askLLMForJSON, isLLMAvailable } from "./llm/client.js";
// ============================================================================
// Storage (in-memory, per-session)
// ============================================================================
const sessionMemories = new Map();
// Track initialization state
let initialized = false;
// ============================================================================
// Initialization
// ============================================================================
/**
 * Initialize memory layer
 * Unlike Mem0, this doesn't need API keys - uses existing LLM infrastructure
 */
export async function initializeMemory() {
    if (initialized)
        return;
    // Memory Lite is always available if LLM client is available
    // The LLM client routes through native host → extension → Codex
    initialized = true;
    console.error("[MemoryLite] Initialized (uses existing LLM infrastructure)");
}
/**
 * Check if memory is available
 * Returns true if LLM client is ready (for fact extraction/search)
 */
export function isMemoryAvailable() {
    return initialized && isLLMAvailable();
}
// ============================================================================
// Core Functions
// ============================================================================
/**
 * Store context for a session
 * Extracts facts using LLM and stores them
 *
 * @param sessionId - Unique session identifier
 * @param context - Raw context string to process
 */
export async function storeContext(sessionId, context) {
    if (!context?.trim()) {
        return;
    }
    console.error(`[MemoryLite] Storing context for ${sessionId}: ${context.substring(0, 100)}...`);
    // Get or create session memory
    let memory = sessionMemories.get(sessionId);
    if (!memory) {
        memory = {
            sessionId,
            facts: [],
            rawContext: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        sessionMemories.set(sessionId, memory);
    }
    // Append to raw context (for fallback)
    memory.rawContext = memory.rawContext
        ? `${memory.rawContext}\n\n${context}`
        : context;
    memory.updatedAt = new Date().toISOString();
    // Extract facts using LLM
    try {
        const facts = await extractFacts(context);
        if (facts.length > 0) {
            memory.facts.push(...facts);
            console.error(`[MemoryLite] Extracted ${facts.length} facts:`);
            for (const fact of facts) {
                console.error(`[MemoryLite]   • ${fact}`);
            }
        }
    }
    catch (error) {
        console.error(`[MemoryLite] Fact extraction failed: ${error.message}`);
        // Still have raw context as fallback
    }
}
/**
 * Add facts directly (for incremental updates)
 * Use this when you have structured info to add
 *
 * @param sessionId - Session to add facts to
 * @param facts - Array of fact strings
 */
export async function addFacts(sessionId, facts) {
    if (!facts || facts.length === 0)
        return;
    let memory = sessionMemories.get(sessionId);
    if (!memory) {
        memory = {
            sessionId,
            facts: [],
            rawContext: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        sessionMemories.set(sessionId, memory);
    }
    memory.facts.push(...facts);
    memory.updatedAt = new Date().toISOString();
    console.error(`[MemoryLite] Added ${facts.length} facts to ${sessionId}`);
}
/**
 * Search memory for relevant information
 * Uses LLM to find facts relevant to the query
 *
 * @param sessionId - Session to search within
 * @param query - Natural language query
 * @param limit - Maximum results (default: 5)
 * @returns Array of relevant facts with relevance scores
 */
export async function searchMemory(sessionId, query, limit = 5) {
    if (!query?.trim()) {
        return [];
    }
    const memory = sessionMemories.get(sessionId);
    if (!memory) {
        console.error(`[MemoryLite] No memory found for session ${sessionId}`);
        return [];
    }
    // If no facts extracted, return raw context as single result
    if (memory.facts.length === 0) {
        if (memory.rawContext) {
            console.error(`[MemoryLite] No facts, returning raw context`);
            return [{ memory: memory.rawContext, score: 0.5 }];
        }
        return [];
    }
    console.error(`[MemoryLite] Searching ${memory.facts.length} facts for: "${query}"`);
    try {
        // Use LLM to find relevant facts
        const relevant = await findRelevantFacts(memory.facts, query, limit);
        console.error(`[MemoryLite] Found ${relevant.length} relevant facts`);
        return relevant;
    }
    catch (error) {
        console.error(`[MemoryLite] Search failed: ${error.message}`);
        // Fallback: return all facts with low scores
        return memory.facts.slice(0, limit).map(f => ({ memory: f, score: 0.3 }));
    }
}
/**
 * Get all memories for a session
 *
 * @param sessionId - Session to retrieve
 * @param limit - Maximum memories to return
 */
export async function getAllMemories(sessionId, limit = 20) {
    const memory = sessionMemories.get(sessionId);
    if (!memory)
        return [];
    // Return facts if available, otherwise raw context
    if (memory.facts.length > 0) {
        return memory.facts.slice(0, limit);
    }
    if (memory.rawContext) {
        return [memory.rawContext];
    }
    return [];
}
/**
 * Get raw context for a session (useful for fallback)
 */
export function getRawContext(sessionId) {
    return sessionMemories.get(sessionId)?.rawContext || null;
}
/**
 * Delete all memories for a session
 *
 * @param sessionId - Session to clean up
 */
export async function deleteSessionMemories(sessionId) {
    if (sessionMemories.has(sessionId)) {
        sessionMemories.delete(sessionId);
        console.error(`[MemoryLite] Deleted memories for ${sessionId}`);
    }
}
/**
 * Get memory stats (for debugging)
 */
export function getMemoryStats() {
    const sessions = Array.from(sessionMemories.entries()).map(([id, mem]) => ({
        id,
        factCount: mem.facts.length,
        hasRawContext: !!mem.rawContext,
    }));
    return {
        sessionCount: sessionMemories.size,
        totalFacts: sessions.reduce((sum, s) => sum + s.factCount, 0),
        sessions,
    };
}
// ============================================================================
// LLM-based Operations
// ============================================================================
/**
 * Extract facts from context using LLM
 *
 * @param context - Raw context to extract facts from
 * @returns Array of extracted facts
 */
async function extractFacts(context) {
    // Skip LLM for very short context
    if (context.length < 50) {
        return [context.trim()];
    }
    const response = await askLLMForJSON({
        prompt: `Extract key facts from this context. Focus on:
- Names, titles, descriptions
- URLs, links, identifiers
- Pricing, categories, features
- Preferences, requirements

Context:
${context}

Return JSON: { "facts": ["fact 1", "fact 2", ...] }
Keep facts concise (1 sentence each). Maximum 10 facts.`,
        systemPrompt: "You are a fact extractor. Return only valid JSON with a 'facts' array.",
        modelTier: "fast", // Use fast model for efficiency
        maxTokens: 500,
    });
    return response.facts || [];
}
/**
 * Find facts relevant to a query using LLM
 *
 * @param facts - All facts to search through
 * @param query - What we're looking for
 * @param limit - Max results
 * @returns Relevant facts with scores
 */
async function findRelevantFacts(facts, query, limit) {
    // For small fact sets, just ask LLM to rank them
    if (facts.length <= 15) {
        return rankFactsWithLLM(facts, query, limit);
    }
    // For larger sets, chunk and process
    const chunkSize = 15;
    const allResults = [];
    for (let i = 0; i < facts.length; i += chunkSize) {
        const chunk = facts.slice(i, i + chunkSize);
        const chunkResults = await rankFactsWithLLM(chunk, query, Math.min(limit, 5));
        allResults.push(...chunkResults);
    }
    // Sort by score and take top results
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, limit);
}
/**
 * Use LLM to rank facts by relevance to query
 */
async function rankFactsWithLLM(facts, query, limit) {
    const numberedFacts = facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
    const response = await askLLMForJSON({
        prompt: `Given these facts:
${numberedFacts}

Which facts are relevant to this query: "${query}"?

Return JSON with relevant fact indices and relevance scores (0.0-1.0):
{ "relevant": [{ "index": 1, "score": 0.9 }, ...] }

Only include facts with score > 0.3. Maximum ${limit} results.
If no facts are relevant, return: { "relevant": [] }`,
        systemPrompt: "You are a relevance scorer. Return only valid JSON.",
        modelTier: "fast",
        maxTokens: 300,
    });
    // Map back to facts
    const results = [];
    for (const item of response.relevant || []) {
        const factIndex = item.index - 1; // Convert 1-indexed to 0-indexed
        if (factIndex >= 0 && factIndex < facts.length) {
            results.push({
                memory: facts[factIndex],
                score: Math.min(1, Math.max(0, item.score)), // Clamp to 0-1
            });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
