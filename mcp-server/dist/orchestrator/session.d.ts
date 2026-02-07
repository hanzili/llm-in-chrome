/**
 * Session Management Module
 *
 * Manages browser automation sessions with a state machine.
 * Each session tracks the full lifecycle from task creation
 * through planning, info gathering, execution, and completion.
 */
import type { Session, SessionState, Question, TraceEntry, CreateSessionOptions, TransitionResult, SessionStatus, ExecutionPlan, SiteKnowledge } from "../types/index.js";
/**
 * SessionManager handles creation, retrieval, and state transitions
 * for browser automation sessions.
 */
export declare class SessionManager {
    /** In-memory session storage */
    private sessions;
    /** Session timeout in milliseconds (default: 30 minutes) */
    private sessionTimeoutMs;
    /** Cleanup interval reference */
    private cleanupInterval;
    constructor(options?: {
        sessionTimeoutMs?: number;
    });
    /**
     * Create a new session.
     *
     * @param options - Session creation options
     * @returns The created session
     */
    createSession(options: CreateSessionOptions): Session;
    /**
     * Get a session by ID.
     *
     * @param sessionId - Session ID
     * @returns Session or null if not found
     */
    getSession(sessionId: string): Session | null;
    /**
     * Get all sessions (optionally filtered by state).
     *
     * @param state - Optional state filter
     * @returns Array of sessions
     */
    getAllSessions(state?: SessionState): Session[];
    /**
     * Transition a session to a new state.
     * Validates that the transition is allowed.
     *
     * @param sessionId - Session ID
     * @param newState - Target state
     * @returns Transition result
     */
    transition(sessionId: string, newState: SessionState): TransitionResult;
    /**
     * Update session fields (except state - use transition() for that).
     *
     * @param sessionId - Session ID
     * @param updates - Partial session updates
     * @returns Whether update succeeded
     */
    updateSession(sessionId: string, updates: Partial<Omit<Session, "id" | "state" | "createdAt">>): boolean;
    /**
     * Set the execution plan for a session.
     */
    setPlan(sessionId: string, plan: ExecutionPlan): boolean;
    /**
     * Set site knowledge for a session.
     */
    setSiteKnowledge(sessionId: string, siteKnowledge: SiteKnowledge): boolean;
    /**
     * Set the target domain for a session.
     */
    setDomain(sessionId: string, domain: string): boolean;
    /**
     * Set pending questions (for NEEDS_INFO state).
     */
    setPendingQuestions(sessionId: string, questions: Question[]): boolean;
    /**
     * Add collected info from user response.
     */
    addCollectedInfo(sessionId: string, info: Record<string, string>): boolean;
    /**
     * Add an entry to the execution trace.
     */
    addTraceEntry(sessionId: string, entry: TraceEntry): boolean;
    /**
     * Set the current step description.
     */
    setCurrentStep(sessionId: string, step: string): boolean;
    /**
     * Set the final answer/result.
     */
    setAnswer(sessionId: string, answer: string): boolean;
    /**
     * Set error message (usually before transitioning to FAILED).
     */
    setError(sessionId: string, error: string): boolean;
    /**
     * Get session status for external API responses.
     */
    getSessionStatus(sessionId: string): SessionStatus | null;
    /**
     * Get status for all sessions.
     */
    getAllSessionStatuses(): SessionStatus[];
    /**
     * Delete a session.
     */
    deleteSession(sessionId: string): boolean;
    /**
     * Check if a session exists.
     */
    hasSession(sessionId: string): boolean;
    /**
     * Get count of active sessions (not in terminal states).
     */
    getActiveSessionCount(): number;
    /**
     * Start periodic cleanup of old sessions.
     */
    private startCleanup;
    /**
     * Clean up sessions that have timed out.
     */
    private cleanupOldSessions;
    /**
     * Stop the cleanup interval (for testing/shutdown).
     */
    stopCleanup(): void;
    /**
     * Clear all sessions (for testing).
     */
    clearAll(): void;
}
/**
 * Get the default SessionManager instance.
 */
export declare function getSessionManager(): SessionManager;
/**
 * Create a new SessionManager instance (for testing).
 */
export declare function createSessionManager(options?: {
    sessionTimeoutMs?: number;
}): SessionManager;
