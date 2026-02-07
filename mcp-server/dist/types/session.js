/**
 * Session Types
 *
 * Defines the session state machine and related types for browser automation tasks.
 * The session tracks the full lifecycle from task creation through planning,
 * info gathering, execution, and completion.
 */
/**
 * Valid state transitions for the session state machine.
 * Used to enforce valid state changes.
 */
export const VALID_TRANSITIONS = {
    CREATED: ["PLANNING", "FAILED", "CANCELLED"],
    PLANNING: ["NEEDS_INFO", "READY", "FAILED", "CANCELLED"],
    NEEDS_INFO: ["PLANNING", "FAILED", "CANCELLED"],
    READY: ["EXECUTING", "FAILED", "CANCELLED"],
    EXECUTING: ["COMPLETED", "BLOCKED", "PLANNING", "FAILED", "CANCELLED"], // PLANNING for after exploration
    BLOCKED: ["PLANNING", "FAILED", "CANCELLED"],
    COMPLETED: [], // Terminal state
    FAILED: [], // Terminal state
    CANCELLED: [], // Terminal state
};
