/**
 * Info Gatherer Module
 *
 * Responsible for collecting information needed to execute a task.
 * Works with Mem0 to retrieve already-known info and identifies
 * what still needs to be asked from the user.
 */
import { searchMemory, isMemoryAvailable } from "../memory.js";
/**
 * Info Gatherer class handles the collection of required information
 */
export class InfoGatherer {
    /**
     * Gather required information for a task
     *
     * @param sessionId - Session ID (for Mem0 scoping)
     * @param requiredInfo - List of required information
     * @param existingInfo - Already collected info
     * @param context - Optional context string that might contain info
     */
    async gather(sessionId, requiredInfo, existingInfo = {}, context) {
        const found = { ...existingInfo };
        const missing = [];
        // Parse context for additional info
        if (context) {
            const contextInfo = this.parseContext(context);
            Object.assign(found, contextInfo);
        }
        // Check each required piece of info
        for (const info of requiredInfo) {
            // Skip if already have this info
            if (this.hasInfo(info.field, found)) {
                continue;
            }
            // Try to find in Mem0
            const memoryValue = await this.searchInMemory(sessionId, info);
            if (memoryValue) {
                found[info.field] = memoryValue;
                console.error(`[InfoGatherer] Found ${info.field} in memory: ${memoryValue.substring(0, 20)}...`);
                continue;
            }
            // Use default if available and not required
            if (!info.required && info.defaultValue) {
                found[info.field] = info.defaultValue;
                continue;
            }
            // Still missing
            if (info.required) {
                missing.push(info);
            }
        }
        // Generate questions for missing info
        const questions = this.generateQuestions(missing);
        const isComplete = missing.length === 0;
        console.error(`[InfoGatherer] Gathered ${Object.keys(found).length} items, missing ${missing.length} required`);
        return {
            found,
            missing,
            questions,
            isComplete,
        };
    }
    /**
     * Check if we have info for a field
     */
    hasInfo(field, info) {
        // Try exact match and common variations
        const variations = [
            field,
            field.toLowerCase(),
            field.replace(/_/g, ""),
            field.replace(/_/g, " "),
            this.toTitleCase(field.replace(/_/g, " ")),
        ];
        for (const key of Object.keys(info)) {
            const normalizedKey = key.toLowerCase().replace(/[_\s]/g, "");
            for (const variation of variations) {
                const normalizedVariation = variation.toLowerCase().replace(/[_\s]/g, "");
                if (normalizedKey === normalizedVariation) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Search for info in Mem0
     */
    async searchInMemory(sessionId, info) {
        if (!isMemoryAvailable()) {
            return null;
        }
        try {
            // Build search query from field info
            const searchQueries = [
                info.description,
                info.label,
                info.field.replace(/_/g, " "),
                ...(info.searchTags || []),
            ].filter(Boolean);
            for (const query of searchQueries) {
                const memories = await searchMemory(sessionId, query, 3);
                if (memories.length > 0) {
                    // Try to extract a value from the memory
                    const value = this.extractValueFromMemory(memories[0].memory, info);
                    if (value) {
                        return value;
                    }
                }
            }
        }
        catch (err) {
            console.error(`[InfoGatherer] Memory search error:`, err);
        }
        return null;
    }
    /**
     * Extract a specific value from a memory string
     */
    extractValueFromMemory(memory, info) {
        // Try to parse as key-value
        const patterns = [
            // "Field: Value" or "Field = Value"
            new RegExp(`${info.field}\\s*[:=]\\s*([^,\\n]+)`, "i"),
            new RegExp(`${info.label}\\s*[:=]\\s*([^,\\n]+)`, "i"),
            // Just the field name followed by a value-like string
            new RegExp(`${info.field.replace(/_/g, "\\s*")}\\s*(?:is|:)?\\s*([^,\\n]+)`, "i"),
        ];
        for (const pattern of patterns) {
            const match = memory.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        // If the memory is short and seems like a direct value, return it
        if (memory.length < 100 && !memory.includes(":") && !memory.includes("=")) {
            return memory.trim();
        }
        return null;
    }
    /**
     * Parse context string for key-value pairs
     */
    parseContext(context) {
        const info = {};
        // Try multiple parsing strategies
        const lines = context.split(/[\n]+/);
        for (const line of lines) {
            // Pattern: "Key: Value" or "Key = Value"
            const kvMatch = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
            if (kvMatch) {
                const key = kvMatch[1].toLowerCase().replace(/\s+/g, "_");
                info[key] = kvMatch[2].trim();
            }
        }
        // Also try comma-separated on single lines
        const commaParts = context.split(/,\s+/);
        for (const part of commaParts) {
            const kvMatch = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
            if (kvMatch) {
                const key = kvMatch[1].toLowerCase().replace(/\s+/g, "_");
                if (!info[key]) {
                    info[key] = kvMatch[2].trim();
                }
            }
        }
        return info;
    }
    /**
     * Generate questions for missing info
     */
    generateQuestions(missing) {
        return missing.map((info, index) => ({
            id: `q-${index}-${info.field}`,
            field: info.field,
            question: this.formatQuestion(info),
            hint: info.example ? `Example: ${info.example}` : undefined,
            required: info.required,
            type: info.type === "password" ? "password" : info.type === "date" ? "date" : info.type === "email" ? "email" : info.type === "number" ? "number" : info.type === "choice" ? "choice" : "text",
            options: info.options,
        }));
    }
    /**
     * Format a human-readable question from RequiredInfo
     */
    formatQuestion(info) {
        // If there's a good description, use it as a question
        if (info.description && info.description.length > 10) {
            // Convert description to question format
            const desc = info.description;
            if (!desc.endsWith("?")) {
                return `What is your ${info.label.toLowerCase()}? (${desc})`;
            }
            return desc;
        }
        // Simple question based on label
        return `What is your ${info.label.toLowerCase()}?`;
    }
    /**
     * Helper: Convert string to title case
     */
    toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }
    /**
     * Process user responses to questions
     */
    processResponses(questions, responses) {
        const collected = {};
        for (const question of questions) {
            // Check if we have a response for this question
            const response = responses[question.id] || responses[question.field];
            if (response) {
                collected[question.field] = response;
            }
        }
        return collected;
    }
}
// Export singleton instance
export const infoGatherer = new InfoGatherer();
