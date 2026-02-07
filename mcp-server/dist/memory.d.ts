/**
 * Memory Module - Mem0 Integration
 *
 * Provides semantic memory storage and retrieval for browser agent tasks.
 *
 * Flow:
 * 1. When browser_start(context) is called → storeContext() extracts and stores facts
 * 2. When agent needs info → searchMemory() performs semantic search
 * 3. Optional: getRelevantContext() pre-fetches memories when preparing agent
 */
/**
 * Initialize Mem0 with configuration
 * Uses OpenAI by default, but can be configured for Ollama (local)
 */
export declare function initializeMemory(): Promise<void>;
/**
 * Store context for a session
 * Mem0 will extract facts and store them with embeddings
 *
 * @param sessionId - Unique session identifier (used as userId in Mem0)
 * @param context - Raw context string to process
 */
export declare function storeContext(sessionId: string, context: string): Promise<void>;
/**
 * Search memory for relevant information
 * Used by get_info tool to retrieve semantically similar facts
 *
 * @param sessionId - Session to search within
 * @param query - Natural language query
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of relevant memories with scores
 */
export declare function searchMemory(sessionId: string, query: string, limit?: number): Promise<{
    memory: string;
    score: number;
}[]>;
/**
 * Get all memories for a session
 * Useful for pre-fetching context when starting agent
 *
 * @param sessionId - Session to retrieve memories for
 * @param limit - Maximum number of memories (default: 20)
 */
export declare function getAllMemories(sessionId: string, limit?: number): Promise<string[]>;
/**
 * Delete all memories for a session
 * Called when session is removed
 *
 * @param sessionId - Session to clean up
 */
export declare function deleteSessionMemories(sessionId: string): Promise<void>;
/**
 * Check if memory is available
 */
export declare function isMemoryAvailable(): boolean;
