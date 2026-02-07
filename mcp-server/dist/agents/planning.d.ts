/**
 * Planning Agent Module (Fully Agentic Version)
 *
 * The Planning Agent gathers context for the browser agent using an agentic loop.
 * Follows the same pattern as the Browser Agent:
 * - While loop with max steps
 * - Maintains conversation history
 * - Executes tools and feeds results back
 * - Continues until finish_planning or max iterations
 *
 * Tools:
 * - search_knowledge: Search all site knowledge files
 * - read_knowledge: Read a specific domain's knowledge file
 * - query_memory: Query Mem0 for user information
 * - list_domains: List all domains we have knowledge about
 * - finish_planning: Signal that planning is complete
 */
import type { RequiredInfo, SiteKnowledge } from "../types/index.js";
export interface PlanningInput {
    task: string;
    url?: string;
    context?: string;
    sessionId?: string;
}
/**
 * Type of exploration the Planning Agent recommends
 */
export type ExplorationRecommendation = {
    type: 'none';
} | {
    type: 'overview';
    reason: string;
} | {
    type: 'workflow';
    task: string;
    reason: string;
};
export interface PlanningOutput {
    domain?: string;
    siteKnowledge?: SiteKnowledge;
    collectedInfo: Record<string, string>;
    missingInfo: RequiredInfo[];
    readyToExecute: boolean;
    /** Reasoning trace from the planning agent */
    planningTrace?: string[];
    /** What exploration is recommended (if any) */
    explorationNeeded?: ExplorationRecommendation;
}
export declare function gatherContext(input: PlanningInput): Promise<PlanningOutput>;
export declare class PlanningAgent {
    analyze(input: PlanningInput): Promise<PlanningOutput>;
}
export declare const planningAgent: PlanningAgent;
