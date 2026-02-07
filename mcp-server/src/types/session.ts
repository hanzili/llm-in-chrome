/**
 * Session Types
 *
 * Defines the session state machine and related types for browser automation tasks.
 * The session tracks the full lifecycle from task creation through planning,
 * info gathering, execution, and completion.
 */

import type { ExecutionPlan, RequiredInfo } from "./plan.js";
import type { SiteKnowledge } from "./knowledge.js";

/**
 * All possible states a session can be in.
 *
 * State transitions:
 *   CREATED → PLANNING → NEEDS_INFO ↔ PLANNING → READY → EXECUTING → COMPLETED
 *                     ↘ READY ────────────────────────↗      ↓
 *                                                         BLOCKED → PLANNING
 *   Any state can transition to FAILED or CANCELLED
 */
export type SessionState =
  | "CREATED"     // Session just initialized
  | "PLANNING"    // Planning agent analyzing task
  | "NEEDS_INFO"  // Waiting for user to provide missing information
  | "READY"       // All info gathered, ready to execute
  | "EXECUTING"   // Browser agent running
  | "BLOCKED"     // Execution paused, needs more info
  | "COMPLETED"   // Task finished successfully
  | "FAILED"      // Task failed (error)
  | "CANCELLED";  // User cancelled

/**
 * Valid state transitions for the session state machine.
 * Used to enforce valid state changes.
 */
export const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  CREATED: ["PLANNING", "FAILED", "CANCELLED"],
  PLANNING: ["NEEDS_INFO", "READY", "FAILED", "CANCELLED"],
  NEEDS_INFO: ["PLANNING", "FAILED", "CANCELLED"],
  READY: ["EXECUTING", "FAILED", "CANCELLED"],
  EXECUTING: ["COMPLETED", "BLOCKED", "PLANNING", "FAILED", "CANCELLED"],  // PLANNING for after exploration
  BLOCKED: ["PLANNING", "FAILED", "CANCELLED"],
  COMPLETED: [],  // Terminal state
  FAILED: [],     // Terminal state
  CANCELLED: [],  // Terminal state
};

/**
 * A question to ask the user for missing information.
 */
export interface Question {
  /** Unique identifier for the question */
  id: string;
  /** The field/info this question is asking about (e.g., "email", "departure_date") */
  field: string;
  /** Human-readable question to display */
  question: string;
  /** Optional hint or example */
  hint?: string;
  /** Whether this is required or optional */
  required: boolean;
  /** Data type expected (for validation) */
  type?: "text" | "email" | "date" | "password" | "number" | "choice";
  /** For choice type, the available options */
  options?: string[];
}

/**
 * A single entry in the execution trace.
 * Used for debugging and learning from successful executions.
 */
export interface TraceEntry {
  /** Timestamp of the action */
  timestamp: string;
  /** Type of trace entry - prefixed by agent that produced it */
  type:
    // Browser Agent actions
    | "browser_agent:navigation"
    | "browser_agent:click"
    | "browser_agent:fill"
    | "browser_agent:screenshot"
    | "browser_agent:thinking"
    | "browser_agent:error"
    | "browser_agent:info"
    // Planning Agent actions
    | "planning_agent:search_knowledge"
    | "planning_agent:read_knowledge"
    | "planning_agent:query_memory"
    | "planning_agent:list_domains"
    | "planning_agent:finish"
    | "planning_agent:info"
    | "planning_agent:error"
    // Explorer Agent actions
    | "explorer_agent:explore"
    | "explorer_agent:complete"
    | "explorer_agent:learn"
    | "explorer_agent:info"
    | "explorer_agent:error"
    // Legacy types (for backward compatibility)
    | "navigation" | "click" | "fill" | "screenshot" | "thinking" | "error" | "info" | "planning";
  /** Human-readable description */
  description: string;
  /** For navigation: the URL */
  url?: string;
  /** For click/fill: the selector used */
  selector?: string;
  /** For fill: the value entered (may be redacted for sensitive data) */
  value?: string;
  /** For screenshot: base64 data or file path */
  screenshot?: string;
  /** Whether this action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Main session object tracking a browser automation task.
 */
export interface Session {
  /** Unique session identifier */
  id: string;

  /** User identifier (for Mem0 scoping) */
  userId: string;

  /** Current state in the state machine */
  state: SessionState;

  /** Original task description from user */
  task: string;

  /** Optional starting URL */
  url?: string;

  /** Optional context provided by user (stored in Mem0) */
  context?: string;

  /** Target domain for this task (e.g., "united.com") */
  domain?: string;

  /** Execution plan created by planning agent */
  plan?: ExecutionPlan;

  /** Site knowledge loaded for this domain */
  siteKnowledge?: SiteKnowledge;

  /**
   * Information collected for this task.
   * Keys are field names (e.g., "email", "departure_date")
   * Values are the collected data
   */
  collectedInfo: Record<string, string>;

  /** Questions currently pending user response */
  pendingQuestions: Question[];

  /** Full execution trace for debugging and learning */
  executionTrace: TraceEntry[];

  /** Current step description (for status display) */
  currentStep?: string;

  /** Final answer/result when completed */
  answer?: string;

  /** Error message if failed */
  error?: string;

  /** Session creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Completion timestamp (for COMPLETED/FAILED/CANCELLED) */
  completedAt?: Date;
}

/**
 * Serializable session data for storage/transport.
 * Dates are converted to ISO strings.
 */
export interface SerializedSession {
  id: string;
  userId: string;
  state: SessionState;
  task: string;
  url?: string;
  context?: string;
  domain?: string;
  plan?: ExecutionPlan;
  siteKnowledge?: SiteKnowledge;
  collectedInfo: Record<string, string>;
  pendingQuestions: Question[];
  executionTrace: TraceEntry[];
  currentStep?: string;
  answer?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  /** The task to perform */
  task: string;
  /** Optional starting URL */
  url?: string;
  /** Optional context with user info/preferences */
  context?: string;
  /** Optional user ID (defaults to session ID) */
  userId?: string;
}

/**
 * Result of a state transition attempt.
 */
export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** Previous state (if successful) */
  previousState?: SessionState;
  /** New state (if successful) */
  newState?: SessionState;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Session status for external API responses.
 * Simplified view of session state.
 */
export interface SessionStatus {
  sessionId: string;
  status: SessionState;
  task: string;
  domain?: string;
  currentStep?: string;
  /** Summary of steps taken */
  steps: string[];
  /** If NEEDS_INFO, the questions to answer */
  questions?: string[];
  /** If COMPLETED, the answer/result */
  answer?: string;
  /** If FAILED, the error message */
  error?: string;
}
