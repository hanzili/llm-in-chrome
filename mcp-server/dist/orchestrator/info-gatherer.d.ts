/**
 * Info Gatherer Module
 *
 * Responsible for collecting information needed to execute a task.
 * Works with Mem0 to retrieve already-known info and identifies
 * what still needs to be asked from the user.
 */
import type { RequiredInfo, Question } from "../types/index.js";
/**
 * Info gathering result
 */
export interface GatheringResult {
    /** Info that was found (from Mem0 or context) */
    found: Record<string, string>;
    /** Info that is still missing */
    missing: RequiredInfo[];
    /** Questions to ask the user */
    questions: Question[];
    /** Whether all required info is available */
    isComplete: boolean;
}
/**
 * Info Gatherer class handles the collection of required information
 */
export declare class InfoGatherer {
    /**
     * Gather required information for a task
     *
     * @param sessionId - Session ID (for Mem0 scoping)
     * @param requiredInfo - List of required information
     * @param existingInfo - Already collected info
     * @param context - Optional context string that might contain info
     */
    gather(sessionId: string, requiredInfo: RequiredInfo[], existingInfo?: Record<string, string>, context?: string): Promise<GatheringResult>;
    /**
     * Check if we have info for a field
     */
    private hasInfo;
    /**
     * Search for info in Mem0
     */
    private searchInMemory;
    /**
     * Extract a specific value from a memory string
     */
    private extractValueFromMemory;
    /**
     * Parse context string for key-value pairs
     */
    private parseContext;
    /**
     * Generate questions for missing info
     */
    private generateQuestions;
    /**
     * Format a human-readable question from RequiredInfo
     */
    private formatQuestion;
    /**
     * Helper: Convert string to title case
     */
    private toTitleCase;
    /**
     * Process user responses to questions
     */
    processResponses(questions: Question[], responses: Record<string, string>): Record<string, string>;
}
export declare const infoGatherer: InfoGatherer;
