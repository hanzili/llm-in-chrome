/**
 * Type Exports
 *
 * Central export point for all type definitions.
 * Import from here: import { Session, ExecutionPlan, SiteKnowledge } from "./types/index.js";
 */

// Session types
export type {
  SessionState,
  Session,
  SerializedSession,
  Question,
  TraceEntry,
  CreateSessionOptions,
  TransitionResult,
  SessionStatus,
} from "./session.js";

export { VALID_TRANSITIONS } from "./session.js";

// Plan types
export type {
  StepAction,
  PlanStep,
  StepCondition,
  RequiredInfo,
  ExecutionPlan,
  AlternativePlan,
  TaskType,
  PlanningResult,
  PlanningInput,
} from "./plan.js";

// Knowledge types (simplified for Markdown-based storage)
export type {
  SiteKnowledge,
  KnowledgeLookupResult,
  ExplorationInput,
  ExplorationResult,
} from "./knowledge.js";
