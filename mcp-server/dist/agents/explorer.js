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
import { getKnowledge, saveKnowledge, appendKnowledge } from "../memory/knowledge-base.js";
import { askLLM } from "../llm/client.js";
/**
 * Explorer Agent class
 */
export class ExplorerAgent {
    /**
     * Check if a domain needs initial exploration (no knowledge at all)
     */
    async needsOverviewExploration(domain) {
        const knowledge = await getKnowledge(domain);
        return knowledge === null;
    }
    /**
     * Check if a specific workflow exists for a domain
     * Returns the workflow name if found, null otherwise
     */
    async findWorkflow(domain, taskDescription) {
        const knowledge = await getKnowledge(domain);
        if (!knowledge)
            return null;
        // Use LLM to check if any existing workflow matches the task
        const response = await askLLM({
            prompt: `Task the user wants to do: "${taskDescription}"

Existing knowledge file:
${knowledge.content}

Question: Is there already a workflow documented that covers this task?

If YES, respond with just the workflow name (e.g., "submit-tool" or "login").
If NO workflow exists for this task, respond with just: NO_WORKFLOW`,
            systemPrompt: "You are checking if a workflow exists. Be strict - only say yes if the workflow clearly matches.",
            modelTier: "fast",
            maxTokens: 50,
        });
        const answer = response.content.trim();
        if (answer === "NO_WORKFLOW" || answer.toLowerCase().includes("no")) {
            return null;
        }
        return answer;
    }
    /**
     * Legacy method - check if domain needs any exploration
     * @deprecated Use needsOverviewExploration or findWorkflow instead
     */
    async needsExploration(domain) {
        return this.needsOverviewExploration(domain);
    }
    /**
     * Create a SITE OVERVIEW exploration (quick, high-level)
     *
     * Goal: Understand what this website IS in ~30 seconds
     * Output: Brief overview, NO workflows
     */
    createOverviewTask(domain, url) {
        const explorationPrompt = `
QUICK SITE OVERVIEW for ${domain}

Look at this website and tell me:
1. What is this website? (one sentence)
2. What's it used for? (one sentence)
3. How do you log in? (one sentence - e.g., "GitHub OAuth", "email/password", etc.)

DO NOT explore workflows or document how to do things.
Just tell me what the site IS. Be brief - 3 sentences max.
`.trim();
        return {
            domain,
            url: url.startsWith("http") ? url : `https://${domain}`,
            explorationPrompt,
            type: "overview",
        };
    }
    /**
     * Create a WORKFLOW exploration (task-specific)
     *
     * Goal: Learn how to do a SPECIFIC task on this site
     * Output: Step-by-step workflow with required info
     */
    createWorkflowTask(domain, url, taskDescription, workflowName) {
        const explorationPrompt = `
WORKFLOW EXPLORATION for ${domain}

Task to learn: ${taskDescription}

Please explore and document:

1. STEPS - What's the step-by-step process?
   - What do I click first?
   - What page/form does that open?
   - What fields need to be filled?
   - Where's the submit button?

2. REQUIRED INFO - What information is needed to complete this?
   - List each field that needs to be filled
   - Note which are required vs optional

3. TIPS - Any gotchas or quirks?
   - Hidden buttons?
   - Tricky navigation?
   - Popups to expect?

Navigate through the workflow (you can stop before actually submitting).
Report everything you find.
`.trim();
        return {
            domain,
            url: url.startsWith("http") ? url : `https://${domain}`,
            explorationPrompt,
            type: "workflow",
            workflowName: workflowName || this.generateWorkflowName(taskDescription),
        };
    }
    /**
     * Generate a workflow name from a task description
     */
    generateWorkflowName(taskDescription) {
        // Extract key words and create a slug
        const words = taskDescription.toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter(w => w.length > 2 && !["the", "and", "for", "with", "how", "to"].includes(w))
            .slice(0, 3);
        return words.join("-") || "custom-workflow";
    }
    /**
     * Legacy method - creates overview task for backward compatibility
     * @deprecated Use createOverviewTask or createWorkflowTask instead
     */
    createExplorationTask(domain, url, taskHint) {
        if (taskHint) {
            return this.createWorkflowTask(domain, url, taskHint);
        }
        return this.createOverviewTask(domain, url);
    }
    /**
     * Process OVERVIEW exploration results
     * Creates a minimal knowledge file with just the site overview
     */
    async processOverviewReport(domain, report) {
        console.error(`[ExplorerAgent] Processing overview for ${domain}`);
        const markdown = await this.writeOverviewMarkdown(domain, report);
        try {
            await saveKnowledge(domain, markdown);
            console.error(`[ExplorerAgent] Created overview for ${domain}`);
            return {
                domain,
                knowledgeUpdated: true,
                mode: "overview",
            };
        }
        catch (err) {
            console.error(`[ExplorerAgent] Failed to save overview:`, err);
            return {
                domain,
                knowledgeUpdated: false,
                mode: "overview",
            };
        }
    }
    /**
     * Process WORKFLOW exploration results
     * Appends a new workflow to the existing knowledge file
     */
    async processWorkflowReport(domain, report, workflowName, taskDescription) {
        console.error(`[ExplorerAgent] Processing workflow "${workflowName}" for ${domain}`);
        const workflowMarkdown = await this.writeWorkflowMarkdown(workflowName, taskDescription, report);
        try {
            await appendKnowledge(domain, workflowMarkdown);
            console.error(`[ExplorerAgent] Added workflow "${workflowName}" to ${domain}`);
            return {
                domain,
                knowledgeUpdated: true,
                mode: "workflow",
            };
        }
        catch (err) {
            console.error(`[ExplorerAgent] Failed to save workflow:`, err);
            return {
                domain,
                knowledgeUpdated: false,
                mode: "workflow",
            };
        }
    }
    /**
     * Legacy method - process exploration report
     * @deprecated Use processOverviewReport or processWorkflowReport instead
     */
    async processExplorationReport(domain, report, taskHint) {
        if (taskHint) {
            const workflowName = this.generateWorkflowName(taskHint);
            return this.processWorkflowReport(domain, report, workflowName, taskHint);
        }
        return this.processOverviewReport(domain, report);
    }
    /**
     * Write a minimal overview (no workflows!)
     */
    async writeOverviewMarkdown(domain, report) {
        const response = await askLLM({
            prompt: `Exploration report for ${domain}:

${report}

Write a MINIMAL knowledge file. Just 3 sections:
1. One sentence: What is this site?
2. One sentence: What's it used for?
3. One sentence: How do you authenticate?

That's it. No workflows, no detailed navigation, no tips yet.
Those will be added later when the user actually asks to do something.`,
            systemPrompt: `You are writing a minimal site overview.
Start with: # ${domain}

Then write:
## Overview
(2-3 sentences max)

## Authentication
(1 sentence about how to log in)

## Workflows
(Leave empty - workflows are added on-demand)

Keep it SHORT. No extra details.`,
            modelTier: "fast",
            maxTokens: 300,
        });
        return response.content;
    }
    /**
     * Write a workflow section with required info
     */
    async writeWorkflowMarkdown(workflowName, taskDescription, report) {
        const response = await askLLM({
            prompt: `Workflow exploration report:

Task: ${taskDescription}
Report: ${report}

Write a workflow documentation section with this EXACT format:

### ${workflowName}
*Task: ${taskDescription}*

**Required Information:**
- field_name: Description of what's needed
- field_name: Description of what's needed
(list ALL fields the form requires)

**Optional Information:**
- field_name: Description (if any optional fields)

**Steps:**
1. First step
2. Second step
...

**Tips:**
- Any gotchas, hidden buttons, quirks discovered`,
            systemPrompt: `You are documenting a workflow.
Be precise about:
1. REQUIRED INFO - What fields MUST be filled? This is critical so the agent knows what to ask the user for.
2. STEPS - Clear numbered steps
3. TIPS - Anything tricky about this workflow

Use the exact format requested. Don't add extra sections.`,
            modelTier: "smart",
            maxTokens: 800,
        });
        return "\n" + response.content;
    }
    /**
     * Learn from a completed session (post-execution)
     * Rewrites the knowledge file with specific details from the execution trace
     */
    async learnFromSession(session) {
        if (session.state !== "COMPLETED" || !session.domain)
            return null;
        const domain = session.domain;
        console.error(`[ExplorerAgent] Learning from session for ${domain}`);
        const updatedContent = await this.updateKnowledge(session);
        if (!updatedContent) {
            return { domain, knowledgeUpdated: false, mode: "learning" };
        }
        try {
            await saveKnowledge(domain, updatedContent);
            console.error(`[ExplorerAgent] Updated knowledge for ${domain}`);
            return { domain, knowledgeUpdated: true, mode: "learning" };
        }
        catch (err) {
            console.error(`[ExplorerAgent] Failed to save updated knowledge:`, err);
            return { domain, knowledgeUpdated: false, mode: "learning" };
        }
    }
    /**
     * Build a rich trace and ask Sonnet to produce an updated knowledge file
     * that merges existing knowledge with new details from the execution.
     */
    async updateKnowledge(session) {
        const domain = session.domain;
        const existingKnowledge = await getKnowledge(domain);
        const existingContent = existingKnowledge?.content || "";
        // Build rich trace from browser agent entries only
        const richTrace = session.executionTrace
            .filter(entry => entry.type.startsWith("browser_agent:") || entry.type === "info")
            .map(entry => {
            const parts = [`[${entry.type}] ${entry.description}`];
            if (entry.url)
                parts.push(`  URL: ${entry.url}`);
            if (entry.selector)
                parts.push(`  Selector: ${entry.selector}`);
            if (entry.value)
                parts.push(`  Value: ${entry.value}`);
            if (entry.error)
                parts.push(`  Error: ${entry.error}`);
            if (!entry.success)
                parts.push(`  Success: false`);
            return parts.join("\n");
        })
            .join("\n\n");
        if (!richTrace.trim())
            return null;
        const response = await askLLM({
            prompt: `## Task executed\n${session.task}\n\n## Result\n${session.state === "COMPLETED" ? "SUCCESS" : "FAILED"}\n${session.answer || "No answer"}\n\n## Execution trace\n${richTrace}\n\n## Existing knowledge for ${domain}\n${existingContent || "(empty)"}\n\n---\n\nProduce an UPDATED knowledge file.\nRules:\n1. PRESERVE existing workflows NOT touched by this execution\n2. UPDATE/IMPROVE the matching workflow with specific details from the trace\n3. ADD a new workflow section if no existing workflow matches\n4. REMOVE information the trace contradicts\n5. Keep concise and structured\n6. If existing knowledge is already accurate, respond: NO_UPDATE_NEEDED\n\nOutput the complete markdown (starting with # ${domain}), or NO_UPDATE_NEEDED.`,
            systemPrompt: `You maintain a knowledge base for browser automation.\nGood knowledge: specific button/link text, URLs, form field names, selectors, timing tips.\nBad knowledge: "find the button", "fill in fields", generic steps.`,
            modelTier: "smart",
            maxTokens: 2000,
        });
        const content = response.content.trim();
        return content === "NO_UPDATE_NEEDED" ? null : content;
    }
}
// Export singleton
export const explorerAgent = new ExplorerAgent();
