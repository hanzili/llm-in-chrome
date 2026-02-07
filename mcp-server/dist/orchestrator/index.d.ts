/**
 * Orchestrator Module
 *
 * Central coordination layer for browser automation tasks.
 * Manages the flow from task creation through planning,
 * info gathering, execution, and completion.
 *
 * This module bridges the SessionManager (orchestration state)
 * with the native host communication (browser execution).
 */
import { SessionManager } from "./session.js";
import type { Session, SessionState, SessionStatus, CreateSessionOptions } from "../types/index.js";
/**
 * Result from starting a task
 */
export interface StartTaskResult {
    sessionId: string;
    status: SessionState;
    questions?: string[];
    message?: string;
    domain?: string;
    /** If true, we're exploring the site first before executing */
    exploring?: boolean;
}
/**
 * Result from sending a message
 */
export interface MessageResult {
    sessionId: string;
    status: SessionState;
    questions?: string[];
    message?: string;
}
/**
 * Browser execution callback type
 * This is called when the orchestrator is ready to execute
 */
export type BrowserExecuteCallback = (sessionId: string, task: string, url?: string, context?: string, siteKnowledge?: string) => Promise<void>;
/**
 * Orchestrator class coordinates the full task lifecycle
 */
export declare class Orchestrator {
    private sessionManager;
    private browserExecute;
    constructor(sessionManager?: SessionManager);
    /**
     * Set the browser execution callback
     * Called when orchestrator is ready to send task to browser
     */
    setBrowserExecuteCallback(callback: BrowserExecuteCallback): void;
    /**
     * Start a new browser automation task
     *
     * Flow:
     * 1. Create session (CREATED)
     * 2. Run Planning Agent to gather context
     * 3. If unknown domain & no knowledge → explore first (optional)
     * 4. If critical info missing → NEEDS_INFO
     * 5. If ready → EXECUTING → send to browser with context
     */
    startTask(options: CreateSessionOptions): Promise<StartTaskResult>;
    /**
     * Process exploration completion
     *
     * Called when an exploration session completes.
     * Processes the report and saves knowledge to disk.
     */
    processExplorationComplete(sessionId: string, explorationReport: string): Promise<void>;
    /**
     * Continue with original task after exploration
     *
     * Called after exploration completes to restart the original task
     * with the newly gathered knowledge.
     */
    continueAfterExploration(sessionId: string): Promise<void>;
    /**
     * Send a follow-up message to a session
     *
     * Used for:
     * - Providing answers to questions (NEEDS_INFO state)
     * - Additional instructions during execution
     * - Continuing after completion
     */
    sendMessage(sessionId: string, message: string): Promise<MessageResult>;
    /**
     * Parse user response for key-value pairs
     */
    private parseUserResponse;
    /**
     * Format collected info as a context string
     */
    private formatCollectedInfo;
    /**
     * Get session status
     */
    getStatus(sessionId: string): SessionStatus | null;
    /**
     * Get all session statuses
     */
    getAllStatuses(): SessionStatus[];
    /**
     * Get the raw session (for advanced operations)
     */
    getSession(sessionId: string): Session | null;
    /**
     * Update session from browser events
     */
    updateFromBrowserEvent(sessionId: string, eventType: "progress" | "complete" | "error" | "blocked", data: {
        step?: string;
        answer?: string;
        error?: string;
        questions?: string[];
    }): void;
    /**
     * Cancel a session
     */
    cancel(sessionId: string): boolean;
    /**
     * Delete a session
     */
    delete(sessionId: string): boolean;
    /**
     * Check if session exists
     */
    hasSession(sessionId: string): boolean;
    /**
     * Get active session count
     */
    getActiveSessionCount(): number;
    /**
     * Get IDs of all active sessions (for filtered polling)
     */
    getActiveSessionIds(): string[];
    /**
     * Stop cleanup (for testing/shutdown)
     */
    shutdown(): void;
}
/**
 * Get the default Orchestrator instance
 */
export declare function getOrchestrator(): Orchestrator;
/**
 * Create a new Orchestrator instance (for testing)
 */
export declare function createOrchestrator(sessionManager?: SessionManager): Orchestrator;
