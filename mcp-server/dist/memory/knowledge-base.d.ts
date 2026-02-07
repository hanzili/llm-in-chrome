/**
 * Knowledge Base Module
 *
 * Stores and retrieves site knowledge as Markdown files.
 * The knowledge is high-level guidance for agents, not rigid instructions.
 *
 * Storage: Markdown files in knowledge/sites/{domain}.md
 *
 * Design principle: Knowledge is GUIDANCE, not INSTRUCTIONS.
 * - Agents read the Markdown to understand workflows and quirks
 * - Explorer Agent appends new learnings as freeform notes
 * - Humans can easily read and edit the files
 */
import type { SiteKnowledge, KnowledgeLookupResult } from "../types/index.js";
/**
 * Normalize a domain for consistent lookups.
 * - Removes protocol (https://)
 * - Removes www. prefix
 * - Removes trailing slashes and paths
 * - Converts to lowercase
 *
 * @param domain - Domain to normalize (e.g., "https://www.Example.com/path")
 * @returns Normalized domain (e.g., "example.com")
 */
export declare function normalizeDomain(domain: string): string;
/**
 * Get site knowledge for a domain.
 *
 * @param domain - Domain to look up (e.g., "united.com" or "https://www.united.com/path")
 * @returns Site knowledge with Markdown content, or null if not found
 *
 * @example
 * const knowledge = await getKnowledge("devhunt.org");
 * if (knowledge) {
 *   // Inject knowledge.content into agent context
 *   console.log(knowledge.content);
 * }
 */
export declare function getKnowledge(domain: string): Promise<SiteKnowledge | null>;
/**
 * Look up knowledge with simplified result.
 *
 * @param domain - Domain to look up
 * @returns Lookup result with found status and content
 */
export declare function lookupKnowledge(domain: string): Promise<KnowledgeLookupResult>;
/**
 * Save site knowledge (overwrites existing).
 *
 * @param domain - Domain to save knowledge for
 * @param content - Markdown content
 *
 * @example
 * await saveKnowledge("example.com", `# example.com
 *
 * ## Overview
 * A simple example website.
 *
 * ## Tips
 * - The login form is on /login
 * `);
 */
export declare function saveKnowledge(domain: string, content: string): Promise<void>;
/**
 * Append new knowledge to existing file.
 * If no file exists, creates one with a header.
 *
 * This is what the Explorer Agent uses to add learnings.
 *
 * @param domain - Domain to append to
 * @param newContent - New Markdown content to append
 *
 * @example
 * await appendKnowledge("devhunt.org", `
 * ## Learned on 2024-02-04
 * - The submit button is hidden until you scroll past the hero section
 * - Categories are checkboxes, can select multiple
 * `);
 */
export declare function appendKnowledge(domain: string, newContent: string): Promise<void>;
/**
 * List all domains with stored knowledge.
 *
 * @returns Array of domain names
 *
 * @example
 * const domains = await listKnowledge();
 * // ["devhunt.org", "example.com"]
 */
export declare function listKnowledge(): Promise<string[]>;
/**
 * Delete knowledge for a domain.
 *
 * @param domain - Domain to delete
 * @returns Whether deletion succeeded
 */
export declare function deleteKnowledge(domain: string): Promise<boolean>;
/**
 * Check if knowledge exists for a domain.
 *
 * @param domain - Domain to check
 * @returns Whether knowledge exists
 */
export declare function hasKnowledge(domain: string): Promise<boolean>;
/**
 * Get knowledge content as a string, or empty string if not found.
 * Useful for injecting into agent context.
 *
 * @param domain - Domain to look up
 * @returns Markdown content or empty string
 */
export declare function getKnowledgeContent(domain: string): Promise<string>;
/**
 * Alias for listKnowledge - returns all domains with stored knowledge.
 * Used by the Planning Agent's list_domains tool.
 *
 * @returns Array of domain names
 */
export declare function listKnowledgeDomains(): Promise<string[]>;
/**
 * Search result from knowledge base search.
 */
export interface KnowledgeSearchResult {
    domain: string;
    snippet: string;
    score: number;
}
/**
 * Search all knowledge files for a query.
 * Used by the Planning Agent's search_knowledge tool.
 *
 * This does a simple text search through all knowledge files,
 * returning domains where the query terms appear.
 *
 * @param query - Search query (e.g., "login form", "checkout process")
 * @returns Array of matching results with domain and relevant snippet
 *
 * @example
 * const results = await searchKnowledge("login form");
 * // [{ domain: "example.com", snippet: "The login form is at /login...", score: 2 }]
 */
export declare function searchKnowledge(query: string): Promise<KnowledgeSearchResult[]>;
