/**
 * Knowledge Types
 *
 * Site knowledge is stored as Markdown files - human-readable notes that
 * both LLMs and humans can easily read and write.
 *
 * Key design principle: The knowledge is GUIDANCE, not INSTRUCTIONS.
 * The agent figures out the actual selectors and interactions.
 *
 * Distinction from Mem0:
 * - Knowledge Base: HOW to navigate a site (workflows, tips, quirks)
 * - Mem0: WHAT info to use (user data, preferences, task context)
 */
/**
 * Site knowledge loaded from a Markdown file.
 * The content is freeform Markdown that the agent reads as context.
 */
export interface SiteKnowledge {
    /** Domain this knowledge applies to (e.g., "united.com") */
    domain: string;
    /** When this knowledge was last updated */
    lastUpdated: string;
    /**
     * The actual knowledge content as Markdown.
     * This is what gets injected into the agent's context.
     */
    content: string;
    /** File path (for reference) */
    filePath?: string;
}
/**
 * Result of a knowledge lookup.
 */
export interface KnowledgeLookupResult {
    /** Whether knowledge was found */
    found: boolean;
    /** The knowledge content (Markdown) */
    content?: string;
    /** The domain */
    domain?: string;
}
/**
 * Input for the Explorer Agent when learning about a site.
 */
export interface ExplorationInput {
    /** Domain being explored */
    domain: string;
    /** URL that was visited */
    url: string;
    /** Page title */
    title?: string;
    /** Execution trace to learn from */
    trace: import("./session.js").TraceEntry[];
    /** Whether the task succeeded */
    success: boolean;
    /** The task that was performed */
    task?: string;
}
/**
 * Output from the Explorer Agent.
 * The agent writes freeform notes about what it learned.
 */
export interface ExplorationResult {
    /** New knowledge to append (Markdown format) */
    newKnowledge: string;
    /** Summary of what was learned */
    summary: string;
}
