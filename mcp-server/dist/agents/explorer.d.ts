/**
 * Explorer Agent Module
 *
 * The Explorer Agent handles TWO types of exploration:
 *
 * 1. OVERVIEW EXPLORATION (first visit to a site)
 *    - Quick, high-level understanding of what the site IS
 *    - Just 2-3 sentences about purpose and main sections
 *    - NO workflows! We don't guess what the user might want to do
 *
 * 2. WORKFLOW EXPLORATION (on-demand)
 *    - Triggered when user asks to do something we don't have a workflow for
 *    - Explores the SPECIFIC task the user wants
 *    - Documents: steps, required info, tips
 *    - Appends to existing knowledge file
 *
 * Knowledge grows INCREMENTALLY based on actual user needs.
 */
import type { Session } from "../types/index.js";
/**
 * Result of exploration
 */
export interface ExplorationResult {
    domain: string;
    knowledgeUpdated: boolean;
    mode: "overview" | "workflow" | "learning";
}
/**
 * Type of exploration needed
 */
export type ExplorationType = "overview" | "workflow";
/**
 * Exploration task for the browser agent
 */
export interface ExplorationTask {
    domain: string;
    url: string;
    explorationPrompt: string;
    type: ExplorationType;
    workflowName?: string;
}
/**
 * Explorer Agent class
 */
export declare class ExplorerAgent {
    /**
     * Check if a domain needs initial exploration (no knowledge at all)
     */
    needsOverviewExploration(domain: string): Promise<boolean>;
    /**
     * Check if a specific workflow exists for a domain
     * Returns the workflow name if found, null otherwise
     */
    findWorkflow(domain: string, taskDescription: string): Promise<string | null>;
    /**
     * Legacy method - check if domain needs any exploration
     * @deprecated Use needsOverviewExploration or findWorkflow instead
     */
    needsExploration(domain: string): Promise<boolean>;
    /**
     * Create a SITE OVERVIEW exploration (quick, high-level)
     *
     * Goal: Understand what this website IS in ~30 seconds
     * Output: Brief overview, NO workflows
     */
    createOverviewTask(domain: string, url: string): ExplorationTask;
    /**
     * Create a WORKFLOW exploration (task-specific)
     *
     * Goal: Learn how to do a SPECIFIC task on this site
     * Output: Step-by-step workflow with required info
     */
    createWorkflowTask(domain: string, url: string, taskDescription: string, workflowName?: string): ExplorationTask;
    /**
     * Generate a workflow name from a task description
     */
    private generateWorkflowName;
    /**
     * Legacy method - creates overview task for backward compatibility
     * @deprecated Use createOverviewTask or createWorkflowTask instead
     */
    createExplorationTask(domain: string, url: string, taskHint?: string): ExplorationTask;
    /**
     * Process OVERVIEW exploration results
     * Creates a minimal knowledge file with just the site overview
     */
    processOverviewReport(domain: string, report: string): Promise<ExplorationResult>;
    /**
     * Process WORKFLOW exploration results
     * Appends a new workflow to the existing knowledge file
     */
    processWorkflowReport(domain: string, report: string, workflowName: string, taskDescription: string): Promise<ExplorationResult>;
    /**
     * Legacy method - process exploration report
     * @deprecated Use processOverviewReport or processWorkflowReport instead
     */
    processExplorationReport(domain: string, report: string, taskHint?: string): Promise<ExplorationResult>;
    /**
     * Write a minimal overview (no workflows!)
     */
    private writeOverviewMarkdown;
    /**
     * Write a workflow section with required info
     */
    private writeWorkflowMarkdown;
    /**
     * Learn from a completed session (post-execution)
     * Extracts tips and gotchas from what actually happened
     */
    learnFromSession(session: Session): Promise<ExplorationResult | null>;
    /**
     * Extract learnings from a completed session
     */
    private extractLearnings;
}
export declare const explorerAgent: ExplorerAgent;
