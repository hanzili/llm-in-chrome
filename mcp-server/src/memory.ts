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

import { Memory } from "mem0ai/oss";

let memory: Memory | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize Mem0 with configuration
 * Uses OpenAI by default, but can be configured for Ollama (local)
 */
export async function initializeMemory(): Promise<void> {
  // Prevent multiple initializations
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        console.error("[Memory] Warning: OPENAI_API_KEY not set. Memory features disabled.");
        console.error("[Memory] Set OPENAI_API_KEY environment variable to enable semantic memory.");
        return;
      }

      memory = new Memory({
        version: "v1.1",
        embedder: {
          provider: "openai",
          config: {
            apiKey,
            model: "text-embedding-3-small",
          },
        },
        vectorStore: {
          provider: "memory",  // In-memory for now, can switch to persistent store
          config: {
            collectionName: "browser_agent_memories",
            dimension: 1536,
          },
        },
        llm: {
          provider: "openai",
          config: {
            apiKey,
            model: "gpt-4.1-nano-2025-04-14",  // Use nano for cost efficiency
          },
        },
        disableHistory: true,  // We don't need history tracking
      });

      console.error("[Memory] Mem0 initialized successfully");
    } catch (error) {
      console.error("[Memory] Failed to initialize Mem0:", error);
      memory = null;
    }
  })();

  return initializationPromise;
}

/**
 * Store context for a session
 * Mem0 will extract facts and store them with embeddings
 *
 * @param sessionId - Unique session identifier (used as userId in Mem0)
 * @param context - Raw context string to process
 */
export async function storeContext(sessionId: string, context: string): Promise<void> {
  if (!memory) {
    console.error("[Memory] Memory not initialized, skipping context storage");
    return;
  }

  if (!context?.trim()) {
    return;
  }

  try {
    console.error(`[Memory] Storing context for session ${sessionId}: ${context.substring(0, 100)}...`);

    const result = await memory.add(context, {
      userId: sessionId,
      metadata: {
        source: "browser_start",
        timestamp: new Date().toISOString(),
      },
    });

    console.error(`[Memory] Stored ${result.results?.length || 0} facts for session ${sessionId}`);

    // Log extracted facts for debugging
    if (result.results && result.results.length > 0) {
      for (const fact of result.results) {
        console.error(`[Memory]   - ${fact.memory}`);
      }
    }
  } catch (error) {
    console.error(`[Memory] Error storing context for ${sessionId}:`, error);
  }
}

/**
 * Search memory for relevant information
 * Used by get_info tool to retrieve semantically similar facts
 *
 * @param sessionId - Session to search within
 * @param query - Natural language query
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of relevant memories with scores
 */
export async function searchMemory(
  sessionId: string,
  query: string,
  limit: number = 5
): Promise<{ memory: string; score: number }[]> {
  if (!memory) {
    return [];
  }

  if (!query?.trim()) {
    return [];
  }

  try {
    console.error(`[Memory] Searching for "${query}" in session ${sessionId}`);

    const results = await memory.search(query, {
      userId: sessionId,
      limit,
    });

    const memories = (results.results || []).map(r => ({
      memory: r.memory,
      score: r.score || 0,
    }));

    console.error(`[Memory] Found ${memories.length} results`);
    for (const m of memories) {
      console.error(`[Memory]   - [${m.score.toFixed(3)}] ${m.memory}`);
    }

    return memories;
  } catch (error) {
    console.error(`[Memory] Search error for ${sessionId}:`, error);
    return [];
  }
}

/**
 * Get all memories for a session
 * Useful for pre-fetching context when starting agent
 *
 * @param sessionId - Session to retrieve memories for
 * @param limit - Maximum number of memories (default: 20)
 */
export async function getAllMemories(
  sessionId: string,
  limit: number = 20
): Promise<string[]> {
  if (!memory) {
    return [];
  }

  try {
    const results = await memory.getAll({
      userId: sessionId,
      limit,
    });

    return (results.results || []).map(r => r.memory);
  } catch (error) {
    console.error(`[Memory] Error getting all memories for ${sessionId}:`, error);
    return [];
  }
}

/**
 * Delete all memories for a session
 * Called when session is removed
 *
 * @param sessionId - Session to clean up
 */
export async function deleteSessionMemories(sessionId: string): Promise<void> {
  if (!memory) {
    return;
  }

  try {
    await memory.deleteAll({ userId: sessionId });
    console.error(`[Memory] Deleted memories for session ${sessionId}`);
  } catch (error) {
    console.error(`[Memory] Error deleting memories for ${sessionId}:`, error);
  }
}

/**
 * Check if memory is available
 */
export function isMemoryAvailable(): boolean {
  return memory !== null;
}
