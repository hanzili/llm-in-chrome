/**
 * Plan Types
 *
 * Defines the execution plan structure created by the Planning Agent.
 * A plan describes what steps to take and what information is needed.
 */
import type { SiteKnowledge } from "./knowledge.js";
/**
 * Type of action in a plan step.
 */
export type StepAction = "navigate" | "click" | "fill" | "select" | "scroll" | "wait" | "screenshot" | "extract" | "authenticate" | "submit" | "custom";
/**
 * A single step in the execution plan.
 */
export interface PlanStep {
    /** Unique identifier for this step */
    id: string;
    /** Human-readable name for the step */
    name: string;
    /** Type of action */
    action: StepAction;
    /** Detailed description of what this step does */
    description: string;
    /** For navigate: the target URL (may contain placeholders like {origin}) */
    url?: string;
    /**
     * Selector to target (from knowledge base or to be discovered).
     * Can be CSS selector, XPath, or text content.
     */
    selector?: string;
    /** Multiple selectors to try in order (fallback pattern) */
    selectorFallbacks?: string[];
    /**
     * Value to fill (may reference collected info with {fieldName} syntax).
     * Example: "{email}" will be replaced with collectedInfo.email
     */
    value?: string;
    /** Fields from collectedInfo that this step requires */
    requiredFields?: string[];
    /** Whether this step can be skipped if it fails */
    optional?: boolean;
    /** Maximum time to wait for this step (ms) */
    timeout?: number;
    /** Condition to check before executing (e.g., "element_visible") */
    precondition?: StepCondition;
    /** Expected state after step completes */
    postcondition?: StepCondition;
    /** Child steps (for compound actions like authenticate) */
    subSteps?: PlanStep[];
    /** Additional metadata for the step */
    metadata?: Record<string, unknown>;
}
/**
 * A condition to check (for pre/post conditions).
 */
export interface StepCondition {
    /** Type of condition */
    type: "element_visible" | "element_hidden" | "url_contains" | "text_present" | "custom";
    /** Selector or pattern to check */
    value: string;
    /** Whether to negate the condition */
    negate?: boolean;
}
/**
 * Information required to complete the task.
 */
export interface RequiredInfo {
    /** Field name (used as key in collectedInfo) */
    field: string;
    /** Human-readable label */
    label: string;
    /** Description of what this info is for */
    description: string;
    /** Data type */
    type: "text" | "email" | "date" | "password" | "number" | "choice" | "file";
    /** Whether this is required or optional */
    required: boolean;
    /** For choice type, available options */
    options?: string[];
    /** Example value (for hints) */
    example?: string;
    /**
     * Semantic tags for Mem0 search.
     * Example: ["email", "contact", "user email address"]
     */
    searchTags?: string[];
    /** Default value if not provided */
    defaultValue?: string;
    /** Validation pattern (regex) */
    validationPattern?: string;
    /** Validation error message */
    validationMessage?: string;
    /** Sensitivity level (affects logging and storage) */
    sensitive?: boolean;
}
/**
 * Complete execution plan for a task.
 */
export interface ExecutionPlan {
    /** Plan identifier */
    id: string;
    /** Original task description */
    task: string;
    /** Target domain for this plan */
    domain: string;
    /** Detected task type (for categorization) */
    taskType?: TaskType;
    /**
     * Ordered list of steps to execute.
     * Steps may have subSteps for complex flows.
     */
    steps: PlanStep[];
    /**
     * All information required to execute this plan.
     * Planning agent identifies these from task + site knowledge.
     */
    requiredInfo: RequiredInfo[];
    /** Site knowledge used to create this plan (if available) */
    siteKnowledge?: SiteKnowledge;
    /** Plan creation timestamp */
    createdAt: string;
    /** Confidence score (0-1) for this plan */
    confidence?: number;
    /**
     * Alternative approaches if primary fails.
     * Each alternative is a simplified plan.
     */
    alternatives?: AlternativePlan[];
    /** Notes or warnings about this plan */
    notes?: string[];
}
/**
 * Simplified alternative plan for fallback.
 */
export interface AlternativePlan {
    /** Description of this alternative */
    description: string;
    /** When to try this alternative */
    trigger: "primary_failed" | "element_not_found" | "timeout";
    /** Steps for the alternative */
    steps: PlanStep[];
}
/**
 * Common task types for categorization.
 */
export type TaskType = "form_fill" | "login" | "search" | "purchase" | "booking" | "data_extract" | "navigation" | "file_upload" | "file_download" | "account_action" | "content_create" | "custom";
/**
 * Result of plan creation.
 */
export interface PlanningResult {
    /** Whether planning succeeded */
    success: boolean;
    /** The created plan (if successful) */
    plan?: ExecutionPlan;
    /** Error message (if failed) */
    error?: string;
    /** Warnings or notes */
    warnings?: string[];
}
/**
 * Input for the planning agent.
 */
export interface PlanningInput {
    /** The task to plan */
    task: string;
    /** Optional context with additional info */
    context?: string;
    /** Site knowledge (if available) */
    siteKnowledge?: SiteKnowledge;
    /** URL hint for the task */
    url?: string;
    /** Previously collected info (for replanning) */
    collectedInfo?: Record<string, string>;
}
