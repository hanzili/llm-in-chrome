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
import { getSessionManager } from "./session.js";
import { planningAgent } from "../agents/planning.js";
import { explorerAgent } from "../agents/explorer.js";
/**
 * Orchestrator class coordinates the full task lifecycle
 */
export class Orchestrator {
    sessionManager;
    browserExecute = null;
    constructor(sessionManager) {
        this.sessionManager = sessionManager || getSessionManager();
    }
    /**
     * Set the browser execution callback
     * Called when orchestrator is ready to send task to browser
     */
    setBrowserExecuteCallback(callback) {
        this.browserExecute = callback;
    }
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
    async startTask(options) {
        // Create the session
        const session = this.sessionManager.createSession(options);
        const sessionId = session.id;
        // Transition to PLANNING
        this.sessionManager.transition(sessionId, "PLANNING");
        // Run Planning Agent to gather context
        const planningResult = await planningAgent.analyze({
            task: options.task,
            url: options.url,
            context: options.context,
            sessionId,
        });
        // Store planning trace in session's executionTrace for visibility
        if (planningResult.planningTrace && planningResult.planningTrace.length > 0) {
            for (const traceStep of planningResult.planningTrace) {
                // Detect which planning tool was used from the trace step
                let traceType = "planning_agent:info";
                if (traceStep.includes("search_knowledge"))
                    traceType = "planning_agent:search_knowledge";
                else if (traceStep.includes("read_knowledge"))
                    traceType = "planning_agent:read_knowledge";
                else if (traceStep.includes("query_memory"))
                    traceType = "planning_agent:query_memory";
                else if (traceStep.includes("list_domains"))
                    traceType = "planning_agent:list_domains";
                else if (traceStep.includes("finish_planning") || traceStep.includes("Planning complete"))
                    traceType = "planning_agent:finish";
                else if (traceStep.includes("error") || traceStep.includes("Error"))
                    traceType = "planning_agent:error";
                this.sessionManager.addTraceEntry(sessionId, {
                    type: traceType,
                    description: traceStep,
                    timestamp: new Date().toISOString(),
                    success: !traceStep.includes("error"),
                });
            }
        }
        // Store domain if found
        if (planningResult.domain) {
            this.sessionManager.setDomain(sessionId, planningResult.domain);
        }
        // Check if exploration is needed based on Planning Agent's recommendation
        const exploration = planningResult.explorationNeeded;
        if (exploration && exploration.type !== 'none' && this.browserExecute && planningResult.domain) {
            const domain = planningResult.domain;
            const explorationType = exploration.type;
            const reason = 'reason' in exploration ? exploration.reason : '';
            console.error(`[Orchestrator] Exploration needed (${explorationType}): ${reason}`);
            // Add trace entry for exploration trigger
            this.sessionManager.addTraceEntry(sessionId, {
                type: "explorer_agent:explore",
                description: `${explorationType} exploration: ${reason}`,
                timestamp: new Date().toISOString(),
                success: true,
            });
            // Create the appropriate exploration task
            let explorationTask;
            if (explorationType === 'overview') {
                explorationTask = explorerAgent.createOverviewTask(domain, options.url || `https://${domain}`);
            }
            else {
                // workflow exploration
                const workflowTask = 'task' in exploration ? exploration.task : options.task;
                explorationTask = explorerAgent.createWorkflowTask(domain, options.url || `https://${domain}`, workflowTask);
            }
            // Store that we're exploring (for tracking)
            this.sessionManager.addCollectedInfo(sessionId, {
                _exploring: "true",
                _explorationType: explorationType,
                _originalTask: options.task,
            });
            // Send exploration task to browser
            this.sessionManager.transition(sessionId, "READY");
            this.sessionManager.transition(sessionId, "EXECUTING");
            await this.browserExecute(sessionId, explorationTask.explorationPrompt, explorationTask.url, explorationType === 'overview'
                ? "Quick overview only - just tell me what this site is in 2-3 sentences."
                : "Explore this workflow - don't complete it, just report the steps.", undefined // No site knowledge yet
            );
            return {
                sessionId,
                status: "EXECUTING",
                domain,
                message: explorationType === 'overview'
                    ? `Getting quick overview of ${domain}...`
                    : `Learning workflow for: ${options.task}`,
                exploring: true,
            };
        }
        // Store site knowledge if found
        if (planningResult.siteKnowledge) {
            this.sessionManager.setSiteKnowledge(sessionId, planningResult.siteKnowledge);
        }
        // Store collected info
        for (const [key, value] of Object.entries(planningResult.collectedInfo)) {
            this.sessionManager.addCollectedInfo(sessionId, { [key]: value });
        }
        // Check if we need more info
        if (!planningResult.readyToExecute) {
            // Need critical info from user
            this.sessionManager.setPendingQuestions(sessionId, planningResult.missingInfo.map((info, i) => ({
                id: `q-${i}`,
                field: info.field,
                question: info.description,
                required: info.required,
            })));
            this.sessionManager.transition(sessionId, "NEEDS_INFO");
            return {
                sessionId,
                status: "NEEDS_INFO",
                domain: planningResult.domain,
                questions: planningResult.missingInfo.map(i => i.description),
                message: "Need more information to proceed",
            };
        }
        // Ready to execute - transition through states
        this.sessionManager.transition(sessionId, "READY");
        this.sessionManager.transition(sessionId, "EXECUTING");
        // Send to browser with all gathered context
        if (this.browserExecute) {
            // Build context string with collected info
            let fullContext = options.context || "";
            if (Object.keys(planningResult.collectedInfo).length > 0) {
                const infoStr = Object.entries(planningResult.collectedInfo)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n");
                fullContext = `${fullContext}\n\n${infoStr}`.trim();
            }
            await this.browserExecute(sessionId, options.task, options.url, fullContext || undefined, planningResult.siteKnowledge?.content);
        }
        return {
            sessionId,
            status: "EXECUTING",
            domain: planningResult.domain,
            message: "Task started",
        };
    }
    /**
     * Process exploration completion
     *
     * Called when an exploration session completes.
     * Processes the report and saves knowledge to disk.
     */
    async processExplorationComplete(sessionId, explorationReport) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.domain)
            return;
        console.error(`[Orchestrator] Processing exploration results for ${session.domain}`);
        // Process the exploration report (saves knowledge file)
        await explorerAgent.processExplorationReport(session.domain, explorationReport, session.collectedInfo._originalTask);
    }
    /**
     * Continue with original task after exploration
     *
     * Called after exploration completes to restart the original task
     * with the newly gathered knowledge.
     */
    async continueAfterExploration(sessionId) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        const originalTask = session.collectedInfo._originalTask;
        if (!originalTask) {
            throw new Error(`No original task found for session: ${sessionId}`);
        }
        console.error(`[Orchestrator] Continuing with original task: ${originalTask}`);
        // Clear exploration flags
        this.sessionManager.addCollectedInfo(sessionId, {
            _exploring: "false",
            _explorationComplete: "true",
        });
        // Add trace entry
        this.sessionManager.addTraceEntry(sessionId, {
            type: "explorer_agent:complete",
            description: `Exploration complete, continuing with original task`,
            timestamp: new Date().toISOString(),
            success: true,
        });
        // Transition back to PLANNING to re-analyze with new knowledge
        this.sessionManager.transition(sessionId, "PLANNING");
        // Re-run Planning Agent - it should now find the knowledge we just saved
        const planningResult = await planningAgent.analyze({
            task: originalTask,
            url: session.url,
            context: session.context,
            sessionId,
        });
        // Store planning trace
        if (planningResult.planningTrace && planningResult.planningTrace.length > 0) {
            for (const traceStep of planningResult.planningTrace) {
                let traceType = "planning_agent:info";
                if (traceStep.includes("search_knowledge"))
                    traceType = "planning_agent:search_knowledge";
                else if (traceStep.includes("read_knowledge"))
                    traceType = "planning_agent:read_knowledge";
                else if (traceStep.includes("query_memory"))
                    traceType = "planning_agent:query_memory";
                else if (traceStep.includes("list_domains"))
                    traceType = "planning_agent:list_domains";
                else if (traceStep.includes("finish_planning") || traceStep.includes("Planning complete"))
                    traceType = "planning_agent:finish";
                else if (traceStep.includes("error") || traceStep.includes("Error"))
                    traceType = "planning_agent:error";
                this.sessionManager.addTraceEntry(sessionId, {
                    type: traceType,
                    description: traceStep,
                    timestamp: new Date().toISOString(),
                    success: !traceStep.includes("error"),
                });
            }
        }
        // Store site knowledge if found
        if (planningResult.siteKnowledge) {
            this.sessionManager.setSiteKnowledge(sessionId, planningResult.siteKnowledge);
        }
        // Store collected info
        for (const [key, value] of Object.entries(planningResult.collectedInfo)) {
            this.sessionManager.addCollectedInfo(sessionId, { [key]: value });
        }
        // Check if we need more info
        if (!planningResult.readyToExecute) {
            this.sessionManager.setPendingQuestions(sessionId, planningResult.missingInfo.map((info, i) => ({
                id: `q-${i}`,
                field: info.field,
                question: info.description,
                required: info.required,
            })));
            this.sessionManager.transition(sessionId, "NEEDS_INFO");
            console.error(`[Orchestrator] Need more info before continuing: ${planningResult.missingInfo.map(i => i.field).join(", ")}`);
            return;
        }
        // Ready to execute - transition through states
        this.sessionManager.transition(sessionId, "READY");
        this.sessionManager.transition(sessionId, "EXECUTING");
        // Send to browser with all gathered context
        if (this.browserExecute) {
            // Build context string from original context plus collected info
            let fullContext = session.context || "";
            const collectedInfo = this.sessionManager.getSession(sessionId)?.collectedInfo || {};
            const infoStr = Object.entries(collectedInfo)
                .filter(([k]) => !k.startsWith("_")) // Skip internal flags
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n");
            if (infoStr) {
                fullContext = `${fullContext}\n\n${infoStr}`.trim();
            }
            console.error(`[Orchestrator] Executing original task with knowledge`);
            await this.browserExecute(sessionId, originalTask, session.url, fullContext || undefined, planningResult.siteKnowledge?.content);
        }
    }
    /**
     * Send a follow-up message to a session
     *
     * Used for:
     * - Providing answers to questions (NEEDS_INFO state)
     * - Additional instructions during execution
     * - Continuing after completion
     */
    async sendMessage(sessionId, message) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        // Parse the message for key-value pairs
        const parsedInfo = this.parseUserResponse(message);
        for (const [key, value] of Object.entries(parsedInfo)) {
            this.sessionManager.addCollectedInfo(sessionId, { [key]: value });
        }
        // Also store the raw message
        this.sessionManager.addCollectedInfo(sessionId, {
            user_response: message,
        });
        // If we were waiting for info, re-evaluate
        if (session.state === "NEEDS_INFO") {
            // Transition back to PLANNING to re-check
            this.sessionManager.transition(sessionId, "PLANNING");
            // Get updated session with new collected info
            const updatedSession = this.sessionManager.getSession(sessionId);
            // Re-run Planning Agent with all collected info
            const planningResult = await planningAgent.analyze({
                task: updatedSession.task,
                url: updatedSession.url,
                context: this.formatCollectedInfo(updatedSession.collectedInfo),
                sessionId,
            });
            // Update site knowledge if we found it now
            if (planningResult.siteKnowledge && !updatedSession.siteKnowledge) {
                this.sessionManager.setSiteKnowledge(sessionId, planningResult.siteKnowledge);
            }
            // Check if we can proceed now
            if (!planningResult.readyToExecute) {
                // Still need more info
                this.sessionManager.setPendingQuestions(sessionId, planningResult.missingInfo.map((info, i) => ({
                    id: `q-${i}`,
                    field: info.field,
                    question: info.description,
                    required: info.required,
                })));
                this.sessionManager.transition(sessionId, "NEEDS_INFO");
                return {
                    sessionId,
                    status: "NEEDS_INFO",
                    questions: planningResult.missingInfo.map(i => i.description),
                    message: "Still need more information",
                };
            }
            // Ready to execute!
            this.sessionManager.transition(sessionId, "READY");
            this.sessionManager.transition(sessionId, "EXECUTING");
            // Build full context from all collected info
            const fullContext = this.formatCollectedInfo(updatedSession.collectedInfo);
            if (this.browserExecute) {
                await this.browserExecute(sessionId, updatedSession.task, updatedSession.url, fullContext, planningResult.siteKnowledge?.content || updatedSession.siteKnowledge?.content);
            }
            return {
                sessionId,
                status: "EXECUTING",
                message: "Information received, task started",
            };
        }
        // If executing or completed, the message will be handled by the browser agent
        // The native host communication handles this
        return {
            sessionId,
            status: session.state,
            message: "Message received",
        };
    }
    /**
     * Parse user response for key-value pairs
     */
    parseUserResponse(message) {
        const info = {};
        // Try to parse "key: value" or "key = value" patterns
        const lines = message.split(/[\n,]+/);
        for (const line of lines) {
            const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
            if (match) {
                const key = match[1].toLowerCase().replace(/\s+/g, "_");
                info[key] = match[2].trim();
            }
        }
        return info;
    }
    /**
     * Format collected info as a context string
     */
    formatCollectedInfo(info) {
        return Object.entries(info)
            .filter(([key]) => key !== "user_response" && key !== "timestamp")
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");
    }
    /**
     * Get session status
     */
    getStatus(sessionId) {
        return this.sessionManager.getSessionStatus(sessionId);
    }
    /**
     * Get all session statuses
     */
    getAllStatuses() {
        return this.sessionManager.getAllSessionStatuses();
    }
    /**
     * Get the raw session (for advanced operations)
     */
    getSession(sessionId) {
        return this.sessionManager.getSession(sessionId);
    }
    /**
     * Update session from browser events
     */
    updateFromBrowserEvent(sessionId, eventType, data) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session)
            return;
        switch (eventType) {
            case "progress":
                if (data.step) {
                    this.sessionManager.setCurrentStep(sessionId, data.step);
                    this.sessionManager.addTraceEntry(sessionId, {
                        type: "info",
                        description: data.step,
                        timestamp: new Date().toISOString(),
                        success: true,
                    });
                }
                break;
            case "complete":
                // Check if this was an exploration session BEFORE marking complete
                const completingSession = this.sessionManager.getSession(sessionId);
                const wasExploring = completingSession?.collectedInfo._exploring === "true";
                if (wasExploring && completingSession?.domain) {
                    // Exploration completed - process results and continue with original task
                    console.error(`[Orchestrator] Exploration completed for ${completingSession.domain}`);
                    // Store the exploration report as the answer for now
                    if (data.answer) {
                        this.sessionManager.setAnswer(sessionId, data.answer);
                    }
                    // Process exploration results (saves knowledge file)
                    this.processExplorationComplete(sessionId, data.answer || completingSession.answer || "").then(() => {
                        // After exploration, continue with original task automatically
                        this.continueAfterExploration(sessionId).catch(err => {
                            console.error(`[Orchestrator] Failed to continue after exploration:`, err);
                            // If we can't continue, mark as failed
                            this.sessionManager.setError(sessionId, `Failed to continue after exploration: ${err.message}`);
                            this.sessionManager.transition(sessionId, "FAILED");
                        });
                    }).catch(err => {
                        console.error(`[Orchestrator] Failed to process exploration:`, err);
                    });
                    // Don't transition to COMPLETED yet - we'll continue with the task
                }
                else {
                    // Normal task completion
                    if (data.answer) {
                        this.sessionManager.setAnswer(sessionId, data.answer);
                    }
                    this.sessionManager.transition(sessionId, "COMPLETED");
                    // Trigger learning from completed session
                    if (completingSession) {
                        explorerAgent.learnFromSession(completingSession).catch(err => {
                            console.error(`[Orchestrator] Explorer agent error:`, err);
                        });
                    }
                }
                break;
            case "error":
                if (data.error) {
                    this.sessionManager.setError(sessionId, data.error);
                }
                this.sessionManager.transition(sessionId, "FAILED");
                break;
            case "blocked":
                // Browser agent is blocked, needs more info
                if (data.questions) {
                    this.sessionManager.setPendingQuestions(sessionId, data.questions.map((q, i) => ({
                        id: `q-${i}`,
                        field: `field_${i}`,
                        question: q,
                        required: true,
                    })));
                }
                this.sessionManager.transition(sessionId, "BLOCKED");
                break;
        }
    }
    /**
     * Cancel a session
     */
    cancel(sessionId) {
        const result = this.sessionManager.transition(sessionId, "CANCELLED");
        return result.success;
    }
    /**
     * Delete a session
     */
    delete(sessionId) {
        return this.sessionManager.deleteSession(sessionId);
    }
    /**
     * Check if session exists
     */
    hasSession(sessionId) {
        return this.sessionManager.hasSession(sessionId);
    }
    /**
     * Get active session count
     */
    getActiveSessionCount() {
        return this.sessionManager.getActiveSessionCount();
    }
    /**
     * Get IDs of all active sessions (for filtered polling)
     */
    getActiveSessionIds() {
        const allStatuses = this.sessionManager.getAllSessionStatuses();
        return allStatuses
            .filter(s => !["COMPLETED", "FAILED", "CANCELLED"].includes(s.status))
            .map(s => s.sessionId);
    }
    /**
     * Stop cleanup (for testing/shutdown)
     */
    shutdown() {
        this.sessionManager.stopCleanup();
    }
}
// Default singleton instance
let defaultOrchestrator = null;
/**
 * Get the default Orchestrator instance
 */
export function getOrchestrator() {
    if (!defaultOrchestrator) {
        defaultOrchestrator = new Orchestrator();
    }
    return defaultOrchestrator;
}
/**
 * Create a new Orchestrator instance (for testing)
 */
export function createOrchestrator(sessionManager) {
    return new Orchestrator(sessionManager);
}
