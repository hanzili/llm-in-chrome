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
import { readFile, writeFile, mkdir, readdir, stat, appendFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
// Get the directory where this module lives
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Knowledge files are stored relative to the mcp-server root
// mcp-server/src/memory/knowledge-base.ts -> mcp-server/knowledge/sites/
const KNOWLEDGE_DIR = join(__dirname, "..", "..", "knowledge", "sites");
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
export function normalizeDomain(domain) {
    let normalized = domain.toLowerCase().trim();
    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, "");
    // Remove www. prefix
    normalized = normalized.replace(/^www\./, "");
    // Remove trailing slash and path
    normalized = normalized.split("/")[0];
    // Remove port number
    normalized = normalized.split(":")[0];
    return normalized;
}
/**
 * Get the file path for a domain's knowledge file.
 *
 * @param domain - Domain (will be normalized)
 * @returns Full file path
 */
function getKnowledgePath(domain) {
    const normalized = normalizeDomain(domain);
    return join(KNOWLEDGE_DIR, `${normalized}.md`);
}
/**
 * Ensure the knowledge directory exists.
 */
async function ensureKnowledgeDir() {
    try {
        await mkdir(KNOWLEDGE_DIR, { recursive: true });
    }
    catch (error) {
        // Directory might already exist, that's fine
        if (error.code !== "EEXIST") {
            throw error;
        }
    }
}
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
export async function getKnowledge(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const filePath = getKnowledgePath(domain);
    try {
        const content = await readFile(filePath, "utf-8");
        const stats = await stat(filePath);
        return {
            domain: normalizedDomain,
            lastUpdated: stats.mtime.toISOString(),
            content,
            filePath,
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            // File doesn't exist - no knowledge for this domain
            return null;
        }
        console.error(`[KnowledgeBase] Error reading ${filePath}:`, error);
        return null;
    }
}
/**
 * Look up knowledge with simplified result.
 *
 * @param domain - Domain to look up
 * @returns Lookup result with found status and content
 */
export async function lookupKnowledge(domain) {
    const knowledge = await getKnowledge(domain);
    if (!knowledge) {
        return { found: false };
    }
    return {
        found: true,
        content: knowledge.content,
        domain: knowledge.domain,
    };
}
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
export async function saveKnowledge(domain, content) {
    await ensureKnowledgeDir();
    const normalizedDomain = normalizeDomain(domain);
    const filePath = getKnowledgePath(normalizedDomain);
    try {
        await writeFile(filePath, content, "utf-8");
        console.error(`[KnowledgeBase] Saved knowledge for ${normalizedDomain}`);
    }
    catch (error) {
        console.error(`[KnowledgeBase] Error saving ${filePath}:`, error);
        throw error;
    }
}
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
export async function appendKnowledge(domain, newContent) {
    await ensureKnowledgeDir();
    const normalizedDomain = normalizeDomain(domain);
    const filePath = getKnowledgePath(normalizedDomain);
    // Check if file exists
    const exists = await hasKnowledge(domain);
    if (!exists) {
        // Create new file with header
        const initialContent = `# ${normalizedDomain}

*Knowledge file created automatically*

---

${newContent}
`;
        await writeFile(filePath, initialContent, "utf-8");
        console.error(`[KnowledgeBase] Created new knowledge file for ${normalizedDomain}`);
    }
    else {
        // Append to existing
        const separator = "\n\n---\n\n";
        await appendFile(filePath, separator + newContent, "utf-8");
        console.error(`[KnowledgeBase] Appended knowledge for ${normalizedDomain}`);
    }
}
/**
 * List all domains with stored knowledge.
 *
 * @returns Array of domain names
 *
 * @example
 * const domains = await listKnowledge();
 * // ["devhunt.org", "example.com"]
 */
export async function listKnowledge() {
    try {
        await ensureKnowledgeDir();
        const files = await readdir(KNOWLEDGE_DIR);
        return files
            .filter((f) => f.endsWith(".md"))
            .map((f) => f.replace(".md", ""));
    }
    catch (error) {
        console.error("[KnowledgeBase] Error listing knowledge:", error);
        return [];
    }
}
/**
 * Delete knowledge for a domain.
 *
 * @param domain - Domain to delete
 * @returns Whether deletion succeeded
 */
export async function deleteKnowledge(domain) {
    const filePath = getKnowledgePath(domain);
    try {
        const { unlink } = await import("fs/promises");
        await unlink(filePath);
        console.error(`[KnowledgeBase] Deleted knowledge for ${normalizeDomain(domain)}`);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT") {
            // File didn't exist anyway
            return true;
        }
        console.error(`[KnowledgeBase] Error deleting ${filePath}:`, error);
        return false;
    }
}
/**
 * Check if knowledge exists for a domain.
 *
 * @param domain - Domain to check
 * @returns Whether knowledge exists
 */
export async function hasKnowledge(domain) {
    const filePath = getKnowledgePath(domain);
    try {
        await stat(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get knowledge content as a string, or empty string if not found.
 * Useful for injecting into agent context.
 *
 * @param domain - Domain to look up
 * @returns Markdown content or empty string
 */
export async function getKnowledgeContent(domain) {
    const knowledge = await getKnowledge(domain);
    return knowledge?.content || "";
}
/**
 * Alias for listKnowledge - returns all domains with stored knowledge.
 * Used by the Planning Agent's list_domains tool.
 *
 * @returns Array of domain names
 */
export async function listKnowledgeDomains() {
    return listKnowledge();
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
export async function searchKnowledge(query) {
    const results = [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (queryTerms.length === 0) {
        return results;
    }
    const domains = await listKnowledge();
    for (const domain of domains) {
        const knowledge = await getKnowledge(domain);
        if (!knowledge)
            continue;
        const contentLower = knowledge.content.toLowerCase();
        let score = 0;
        // Count how many query terms appear in the content
        for (const term of queryTerms) {
            if (contentLower.includes(term)) {
                score++;
            }
        }
        // Also check if domain matches any query term
        if (queryTerms.some(term => domain.toLowerCase().includes(term))) {
            score += 2; // Boost for domain match
        }
        if (score > 0) {
            // Extract a relevant snippet around the first match
            const snippet = extractSnippet(knowledge.content, queryTerms);
            results.push({ domain, snippet, score });
        }
    }
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
}
/**
 * Extract a relevant snippet from content around matching terms.
 *
 * @param content - Full content to extract from
 * @param terms - Terms to search for
 * @returns A ~200 char snippet around the first match
 */
function extractSnippet(content, terms) {
    const contentLower = content.toLowerCase();
    // Find the first occurrence of any term
    let firstMatch = -1;
    for (const term of terms) {
        const idx = contentLower.indexOf(term);
        if (idx !== -1 && (firstMatch === -1 || idx < firstMatch)) {
            firstMatch = idx;
        }
    }
    if (firstMatch === -1) {
        // No match found, return beginning of content
        return content.substring(0, 200).trim() + "...";
    }
    // Extract ~100 chars before and after the match
    const start = Math.max(0, firstMatch - 100);
    const end = Math.min(content.length, firstMatch + 100);
    let snippet = content.substring(start, end).trim();
    // Clean up snippet
    if (start > 0)
        snippet = "..." + snippet;
    if (end < content.length)
        snippet = snippet + "...";
    return snippet;
}
