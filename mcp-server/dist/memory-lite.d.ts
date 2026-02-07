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
interface SearchResult {
    memory: string;
    score: number;
}
/**
 * Initialize memory layer
 * Unlike Mem0, this doesn't need API keys - uses existing LLM infrastructure
 */
export declare function initializeMemory(): Promise<void>;
/**
 * Check if memory is available
 * Returns true if LLM client is ready (for fact extraction/search)
 */
export declare function isMemoryAvailable(): boolean;
/**
 * Store context for a session
 * Extracts facts using LLM and stores them
 *
 * @param sessionId - Unique session identifier
 * @param context - Raw context string to process
 */
export declare function storeContext(sessionId: string, context: string): Promise<void>;
/**
 * Add facts directly (for incremental updates)
 * Use this when you have structured info to add
 *
 * @param sessionId - Session to add facts to
 * @param facts - Array of fact strings
 */
export declare function addFacts(sessionId: string, facts: string[]): Promise<void>;
/**
 * Search memory for relevant information
 * Uses LLM to find facts relevant to the query
 *
 * @param sessionId - Session to search within
 * @param query - Natural language query
 * @param limit - Maximum results (default: 5)
 * @returns Array of relevant facts with relevance scores
 */
export declare function searchMemory(sessionId: string, query: string, limit?: number): Promise<SearchResult[]>;
/**
 * Get all memories for a session
 *
 * @param sessionId - Session to retrieve
 * @param limit - Maximum memories to return
 */
export declare function getAllMemories(sessionId: string, limit?: number): Promise<string[]>;
/**
 * Get raw context for a session (useful for fallback)
 */
export declare function getRawContext(sessionId: string): string | null;
/**
 * Delete all memories for a session
 *
 * @param sessionId - Session to clean up
 */
export declare function deleteSessionMemories(sessionId: string): Promise<void>;
/**
 * Get memory stats (for debugging)
 */
export declare function getMemoryStats(): {
    sessionCount: number;
    totalFacts: number;
    sessions: {
        id: string;
        factCount: number;
        hasRawContext: boolean;
    }[];
};
export {};
