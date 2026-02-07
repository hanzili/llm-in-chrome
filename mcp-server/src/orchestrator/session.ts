/**
 * Session Management Module
 *
 * Manages browser automation sessions with a state machine.
 * Each session tracks the full lifecycle from task creation
 * through planning, info gathering, execution, and completion.
 */

import { randomUUID } from "crypto";
import type {
  Session,
  SessionState,
  Question,
  TraceEntry,
  CreateSessionOptions,
  TransitionResult,
  SessionStatus,
  ExecutionPlan,
  SiteKnowledge,
} from "../types/index.js";
import { VALID_TRANSITIONS } from "../types/index.js";

/**
 * SessionManager handles creation, retrieval, and state transitions
 * for browser automation sessions.
 */
export class SessionManager {
  /** In-memory session storage */
  private sessions: Map<string, Session> = new Map();

  /** Session timeout in milliseconds (default: 30 minutes) */
  private sessionTimeoutMs: number;

  /** Cleanup interval reference */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options?: { sessionTimeoutMs?: number }) {
    this.sessionTimeoutMs = options?.sessionTimeoutMs ?? 30 * 60 * 1000;

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Create a new session.
   *
   * @param options - Session creation options
   * @returns The created session
   */
  createSession(options: CreateSessionOptions): Session {
    const id = randomUUID();
    const now = new Date();

    const session: Session = {
      id,
      userId: options.userId ?? id, // Default to session ID if no user ID
      state: "CREATED",
      task: options.task,
      url: options.url,
      context: options.context,
      collectedInfo: {},
      pendingQuestions: [],
      executionTrace: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    console.error(`[SessionManager] Created session ${id} for task: ${options.task.substring(0, 50)}...`);

    return session;
  }

  /**
   * Get a session by ID.
   *
   * @param sessionId - Session ID
   * @returns Session or null if not found
   */
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get all sessions (optionally filtered by state).
   *
   * @param state - Optional state filter
   * @returns Array of sessions
   */
  getAllSessions(state?: SessionState): Session[] {
    const sessions = Array.from(this.sessions.values());
    if (state) {
      return sessions.filter((s) => s.state === state);
    }
    return sessions;
  }

  /**
   * Transition a session to a new state.
   * Validates that the transition is allowed.
   *
   * @param sessionId - Session ID
   * @param newState - Target state
   * @returns Transition result
   */
  transition(sessionId: string, newState: SessionState): TransitionResult {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        success: false,
        error: `Session ${sessionId} not found`,
      };
    }

    const currentState = session.state;
    const allowedTransitions = VALID_TRANSITIONS[currentState];

    if (!allowedTransitions.includes(newState)) {
      return {
        success: false,
        error: `Invalid transition from ${currentState} to ${newState}. Allowed: ${allowedTransitions.join(", ")}`,
      };
    }

    const previousState = session.state;
    session.state = newState;
    session.updatedAt = new Date();

    // Set completion time for terminal states
    if (newState === "COMPLETED" || newState === "FAILED" || newState === "CANCELLED") {
      session.completedAt = new Date();
    }

    console.error(`[SessionManager] Session ${sessionId}: ${previousState} → ${newState}`);

    return {
      success: true,
      previousState,
      newState,
    };
  }

  /**
   * Update session fields (except state - use transition() for that).
   *
   * @param sessionId - Session ID
   * @param updates - Partial session updates
   * @returns Whether update succeeded
   */
  updateSession(
    sessionId: string,
    updates: Partial<Omit<Session, "id" | "state" | "createdAt">>
  ): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      console.error(`[SessionManager] Cannot update: session ${sessionId} not found`);
      return false;
    }

    // Apply updates
    Object.assign(session, updates);
    session.updatedAt = new Date();

    return true;
  }

  /**
   * Set the execution plan for a session.
   */
  setPlan(sessionId: string, plan: ExecutionPlan): boolean {
    return this.updateSession(sessionId, { plan });
  }

  /**
   * Set site knowledge for a session.
   */
  setSiteKnowledge(sessionId: string, siteKnowledge: SiteKnowledge): boolean {
    return this.updateSession(sessionId, { siteKnowledge });
  }

  /**
   * Set the target domain for a session.
   */
  setDomain(sessionId: string, domain: string): boolean {
    return this.updateSession(sessionId, { domain });
  }

  /**
   * Set pending questions (for NEEDS_INFO state).
   */
  setPendingQuestions(sessionId: string, questions: Question[]): boolean {
    return this.updateSession(sessionId, { pendingQuestions: questions });
  }

  /**
   * Add collected info from user response.
   */
  addCollectedInfo(sessionId: string, info: Record<string, string>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return this.updateSession(sessionId, {
      collectedInfo: { ...session.collectedInfo, ...info },
    });
  }

  /**
   * Add an entry to the execution trace.
   */
  addTraceEntry(sessionId: string, entry: TraceEntry): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return this.updateSession(sessionId, {
      executionTrace: [...session.executionTrace, entry],
    });
  }

  /**
   * Set the current step description.
   */
  setCurrentStep(sessionId: string, step: string): boolean {
    return this.updateSession(sessionId, { currentStep: step });
  }

  /**
   * Set the final answer/result.
   */
  setAnswer(sessionId: string, answer: string): boolean {
    return this.updateSession(sessionId, { answer });
  }

  /**
   * Set error message (usually before transitioning to FAILED).
   */
  setError(sessionId: string, error: string): boolean {
    return this.updateSession(sessionId, { error });
  }

  /**
   * Get session status for external API responses.
   */
  getSessionStatus(sessionId: string): SessionStatus | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Build step summary from trace
    const steps = session.executionTrace
      .filter((t) => t.type !== "thinking")
      .map((t) => t.description);

    // Build questions list
    const questions = session.pendingQuestions.map((q) => q.question);

    return {
      sessionId: session.id,
      status: session.state,
      task: session.task,
      domain: session.domain,
      currentStep: session.currentStep,
      steps,
      questions: questions.length > 0 ? questions : undefined,
      answer: session.answer,
      error: session.error,
    };
  }

  /**
   * Get status for all sessions.
   */
  getAllSessionStatuses(): SessionStatus[] {
    return Array.from(this.sessions.values())
      .map((s) => this.getSessionStatus(s.id))
      .filter((s): s is SessionStatus => s !== null);
  }

  /**
   * Delete a session.
   */
  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      console.error(`[SessionManager] Deleted session ${sessionId}`);
    }
    return deleted;
  }

  /**
   * Check if a session exists.
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get count of active sessions (not in terminal states).
   */
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(
      (s) => !["COMPLETED", "FAILED", "CANCELLED"].includes(s.state)
    ).length;
  }

  /**
   * Start periodic cleanup of old sessions.
   */
  private startCleanup(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up sessions that have timed out.
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      const age = now - session.updatedAt.getTime();

      // Clean up if session is old AND in a terminal state or stale
      const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(session.state);
      const isStale = age > this.sessionTimeoutMs;

      if (isTerminal && isStale) {
        this.sessions.delete(id);
        cleaned++;
      } else if (isStale && !isTerminal) {
        // Mark stale non-terminal sessions as failed
        console.error(`[SessionManager] Session ${id} timed out in state ${session.state}`);
        session.state = "FAILED";
        session.error = "Session timed out";
        session.completedAt = new Date();
      }
    }

    if (cleaned > 0) {
      console.error(`[SessionManager] Cleaned up ${cleaned} old sessions`);
    }
  }

  /**
   * Stop the cleanup interval (for testing/shutdown).
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all sessions (for testing).
   */
  clearAll(): void {
    this.sessions.clear();
  }
}

// Default singleton instance
let defaultManager: SessionManager | null = null;

/**
 * Get the default SessionManager instance.
 */
export function getSessionManager(): SessionManager {
  if (!defaultManager) {
    defaultManager = new SessionManager();
  }
  return defaultManager;
}

/**
 * Create a new SessionManager instance (for testing).
 */
export function createSessionManager(options?: { sessionTimeoutMs?: number }): SessionManager {
  return new SessionManager(options);
}
