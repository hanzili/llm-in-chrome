/**
 * Planning Agent Module (Fully Agentic Version)
 *
 * The Planning Agent gathers context for the browser agent using an agentic loop.
 * Follows the same pattern as the Browser Agent:
 * - While loop with max steps
 * - Maintains conversation history
 * - Executes tools and feeds results back
 * - Continues until finish_planning or max iterations
 *
 * Tools:
 * - search_knowledge: Search all site knowledge files
 * - read_knowledge: Read a specific domain's knowledge file
 * - query_memory: Query Mem0 for user information
 * - list_domains: List all domains we have knowledge about
 * - finish_planning: Signal that planning is complete
 */

import type { RequiredInfo, SiteKnowledge } from "../types/index.js";
import { getKnowledge, listKnowledgeDomains, searchKnowledge } from "../memory/knowledge-base.js";
import { searchMemory, isMemoryAvailable, getRawContext } from "../memory-lite.js";
import { askLLM, isLLMAvailable } from "../llm/client.js";

// ============================================================================
// Logging
// ============================================================================

import { appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PLANNING_LOG_FILE = join(homedir(), ".llm-in-chrome", "planning-agent.log");

function log(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const dataStr = data ? `: ${JSON.stringify(data)}` : "";
  const entry = `[${timestamp}] ${message}${dataStr}\n`;

  // Write to stderr for MCP server output
  console.error(`[PlanningAgent] ${message}`, data || "");

  // Also write to dedicated log file for visibility
  try {
    appendFileSync(PLANNING_LOG_FILE, entry);
  } catch (e) {
    // Silent fail if can't write
  }
}

// ============================================================================
// Types
// ============================================================================

export interface PlanningInput {
  task: string;
  url?: string;
  context?: string;
  sessionId?: string;
}

/**
 * Type of exploration the Planning Agent recommends
 */
export type ExplorationRecommendation =
  | { type: 'none' }  // No exploration needed
  | { type: 'overview'; reason: string }  // Need quick site overview
  | { type: 'workflow'; task: string; reason: string };  // Need specific workflow

export interface PlanningOutput {
  domain?: string;
  siteKnowledge?: SiteKnowledge;
  collectedInfo: Record<string, string>;
  missingInfo: RequiredInfo[];
  readyToExecute: boolean;
  /** Reasoning trace from the planning agent */
  planningTrace?: string[];
  /** What exploration is recommended (if any) */
  explorationNeeded?: ExplorationRecommendation;
}

/** Tool call parsed from LLM response */
interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOL_DESCRIPTIONS = `
<tools>
1. search_knowledge(query) — Search all site knowledge files for a topic or domain.
2. read_knowledge(domain) — Read the full knowledge file for a specific domain.
3. query_memory(query) — Query memory for user-specific info (preferences, credentials).
4. list_domains() — List all domains we have knowledge files for.
5. finish_planning(domain?, collected_info?, missing_info?, ready_to_execute, reasoning?, exploration?) — Signal planning is complete.
</tools>
`;

// ============================================================================
// Tool Execution
// ============================================================================

async function executeTool(
  name: string,
  input: Record<string, any>,
  sessionId?: string
): Promise<string> {
  await log(`Executing tool: ${name}`, input);

  switch (name) {
    case "search_knowledge": {
      const query = input.query as string;
      const results = await searchKnowledge(query);
      if (results.length === 0) {
        return `No knowledge found matching "${query}". The domain may not have been explored yet.`;
      }
      return `Found ${results.length} matching entries:\n\n${results
        .map((r) => `## ${r.domain}\n${r.snippet}`)
        .join("\n\n")}`;
    }

    case "read_knowledge": {
      const domain = input.domain as string;
      const knowledge = await getKnowledge(domain);
      if (!knowledge) {
        return `No knowledge file exists for ${domain}. This domain has not been explored yet.`;
      }
      return `# Knowledge for ${domain}\n\n${knowledge.content}`;
    }

    case "query_memory": {
      if (!isMemoryAvailable()) {
        return "Memory system is not available.";
      }
      if (!sessionId) {
        return "No session ID provided - cannot query memory.";
      }
      const query = input.query as string;
      const memories = await searchMemory(sessionId, query, 5);
      if (memories.length === 0) {
        return `No memories found for "${query}".`;
      }
      return `Found ${memories.length} memories:\n${memories
        .map((m, i) => `${i + 1}. ${m.memory}`)
        .join("\n")}`;
    }

    case "list_domains": {
      const domains = await listKnowledgeDomains();
      if (domains.length === 0) {
        return "No domains in knowledge base yet.";
      }
      return `Known domains (${domains.length}):\n${domains.map((d) => `- ${d}`).join("\n")}`;
    }

    case "finish_planning":
      return "FINISH";

    default:
      return `Unknown tool: ${name}`;
  }
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Attempt to repair common JSON issues from LLM responses.
 * - Extra trailing braces/brackets: `{...}}}` → `{...}`
 * - Missing closing brackets: `[{...}` → `[{...}]`
 * - Trailing commas: `{...,}` → `{...}`
 */
function repairJSON(str: string): string {
  let repaired = str.trim();

  // Remove trailing extra braces/brackets (common Codex issue)
  // Match balanced JSON and remove anything after
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = 0;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;

    // Found the end of balanced JSON
    if (braceCount === 0 && bracketCount === 0 && (char === '}' || char === ']')) {
      endIndex = i + 1;
      break;
    }
  }

  if (endIndex > 0 && endIndex < repaired.length) {
    repaired = repaired.substring(0, endIndex);
  }

  // Fix trailing commas before closing braces/brackets
  repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  return repaired;
}

/**
 * Parse tool calls from LLM response.
 * Handles multiple formats and repairs common JSON issues:
 * - Direct JSON array: [{"type":"tool_use",...}]
 * - JSON in code block: ```json [...] ```
 * - Single tool object: {"type":"tool_use",...}
 * - Malformed JSON with extra braces
 */
function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const trimmed = content.trim();

  // Try to extract JSON from various formats
  let jsonStr: string | null = null;

  // Format 1: Direct JSON (starts with [ or {)
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    jsonStr = trimmed;
  }

  // Format 2: JSON in code block
  if (!jsonStr) {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
  }

  // Format 3: JSON embedded in text (look for tool_use pattern)
  if (!jsonStr) {
    const embeddedMatch = trimmed.match(/\[?\s*\{\s*"type"\s*:\s*"tool_use"[\s\S]*?\}\s*\]?/);
    if (embeddedMatch) {
      jsonStr = embeddedMatch[0];
    }
  }

  if (!jsonStr) {
    return calls;
  }

  // Try parsing, with repair on failure
  let parsed: any = null;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Try repairing the JSON
    log(`JSON parse failed, attempting repair: ${(e as Error).message}`);
    try {
      const repaired = repairJSON(jsonStr);
      parsed = JSON.parse(repaired);
      log(`JSON repair successful`);
    } catch (e2) {
      log(`JSON repair also failed: ${(e2 as Error).message}`);
      return calls;
    }
  }

  // Extract tool calls from parsed JSON
  const items = Array.isArray(parsed) ? parsed : [parsed];

  for (const item of items) {
    if (item.type === "tool_use" && item.name) {
      calls.push({
        id: item.id || `call_${calls.length + 1}`,
        name: item.name,
        input: item.input || {},
      });
    }
  }

  return calls;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Common site names to domains mapping
const KNOWN_SITES: Record<string, string> = {
  'devhunt': 'devhunt.org',
  'dev hunt': 'devhunt.org',
  'linkedin': 'linkedin.com',
  'google': 'google.com',
  'github': 'github.com',
  'twitter': 'twitter.com',
  'x': 'x.com',
  'facebook': 'facebook.com',
  'instagram': 'instagram.com',
  'youtube': 'youtube.com',
  'reddit': 'reddit.com',
  'amazon': 'amazon.com',
  'ebay': 'ebay.com',
  'netflix': 'netflix.com',
  'spotify': 'spotify.com',
  'slack': 'slack.com',
  'notion': 'notion.so',
  'figma': 'figma.com',
  'dribbble': 'dribbble.com',
  'producthunt': 'producthunt.com',
  'product hunt': 'producthunt.com',
  'hacker news': 'news.ycombinator.com',
  'hackernews': 'news.ycombinator.com',
  'hn': 'news.ycombinator.com',
  'stackoverflow': 'stackoverflow.com',
  'stack overflow': 'stackoverflow.com',
};

function inferDomainFromTask(task: string): string | undefined {
  // 1. Check for explicit URLs in task
  const urlMatch = task.match(/https?:\/\/([^\s/]+)/i);
  if (urlMatch) return urlMatch[1].replace(/^www\./, "");

  // 2. Check for domain patterns like "on example.com"
  const domainMatch = task.match(
    /\b(?:on|at|from|to|visit|go to)\s+([a-z0-9-]+\.(com|org|net|io|dev|co|ai|so))\b/i
  );
  if (domainMatch) return domainMatch[1];

  // 3. Check for known site names
  const taskLower = task.toLowerCase();
  for (const [siteName, domain] of Object.entries(KNOWN_SITES)) {
    // Match "on DevHunt", "to LinkedIn", "from Google", etc.
    const patterns = [
      new RegExp(`\\b(?:on|at|to|from|using|via|through)\\s+${siteName}\\b`, 'i'),
      new RegExp(`\\b${siteName}\\s+(?:website|site|page)\\b`, 'i'),
      new RegExp(`\\bpost(?:ing)?\\s+(?:on|to)\\s+${siteName}\\b`, 'i'),
      new RegExp(`\\bpublish(?:ing)?\\s+(?:on|to)\\s+${siteName}\\b`, 'i'),
      new RegExp(`\\blaunch(?:ing)?\\s+(?:on|to)\\s+${siteName}\\b`, 'i'),
      new RegExp(`\\bsearch(?:ing)?\\s+(?:on)?\\s*${siteName}\\b`, 'i'),
    ];

    if (patterns.some(p => p.test(taskLower))) {
      return domain;
    }
  }

  // 4. Look for any site name mention as fallback
  for (const [siteName, domain] of Object.entries(KNOWN_SITES)) {
    if (taskLower.includes(siteName)) {
      return domain;
    }
  }

  return undefined;
}

function parseContext(context?: string): Record<string, string> {
  if (!context) return {};
  const info: Record<string, string> = {};

  const lines = context.split(/[\n]+/);
  for (const line of lines) {
    const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
    if (match) {
      const key = match[1].toLowerCase().replace(/\s+/g, "_");
      info[key] = match[2].trim();
    }
  }

  return info;
}

// ============================================================================
// Main Agentic Loop
// ============================================================================

const LLM_TIMEOUT_MS = 30000; // 30 seconds per LLM call
const TOTAL_PLANNING_TIMEOUT_MS = 180000; // 3 minutes safety net

const SYSTEM_PROMPT = `You are the Planning Agent. You gather context before a Browser Agent executes a web automation task.

<role>
Your job is to:
1. Identify the target domain from the task
2. Check if we have existing site knowledge
3. Query memory for user-specific info if needed
4. Decide whether the Browser Agent needs site exploration before executing
5. Call finish_planning with your findings
</role>

<response_format>
Respond ONLY with a single JSON tool call per message. No natural language.

Format: [{"type":"tool_use","id":"1","name":"TOOL_NAME","input":{...}}]

IMPORTANT: Call exactly ONE tool per response. Wait for the result before
deciding your next action. This ensures your decisions are based on real data,
not assumptions about what a tool might return.
</response_format>

<strategy>
Typical flow (2-4 steps):

Step 1: Check what we know
  [{"type":"tool_use","id":"1","name":"search_knowledge","input":{"query":"linkedin jobs"}}]

Step 2: Read full knowledge if found
  [{"type":"tool_use","id":"2","name":"read_knowledge","input":{"domain":"linkedin.com"}}]

Step 3: Query user memory if needed (e.g., task requires personal info)
  [{"type":"tool_use","id":"3","name":"query_memory","input":{"query":"user resume"}}]

Step 4: Finish with findings
  [{"type":"tool_use","id":"4","name":"finish_planning","input":{
    "domain":"linkedin.com",
    "ready_to_execute":true,
    "reasoning":"Have site overview but no job application workflow documented",
    "exploration":{"type":"workflow","reason":"Need to learn the Easy Apply flow"}
  }}]

You can also start with list_domains() to see all known domains.
Be efficient — skip steps that aren't needed.
</strategy>

<exploration_decision>
When calling finish_planning, include an "exploration" field to tell the system
whether the Browser Agent needs site exploration before executing the task.

Set exploration.type to:

"none" — No exploration needed. Use when:
  - Task is simple (search, read, check, tell me, what is, find)
  - Site is universally known AND task is straightforward
  - Knowledge file has an ACTIONABLE workflow that covers this task.
    Actionable means: specific button/link text, page URLs, form field
    names, CSS selectors — details that only apply to THIS site.
  - The task doesn't involve multi-step form filling or complex navigation

"overview" — Quick site overview needed. Use when:
  - No knowledge file exists AND the site is unfamiliar or specialized
  - You genuinely don't know what the site is or how it's structured
  - NEVER for universally known sites (Google, Wikipedia, YouTube, Amazon,
    GitHub, Reddit, Twitter/X, Facebook, LinkedIn, etc.)

"workflow" — Specific workflow exploration needed. Use when:
  - No knowledge file exists for a complex task (even on well-known sites)
  - Knowledge file exists but lacks guidance for THIS specific task type
  - Task involves multi-step interactions: apply, submit, checkout, post,
    register, book, upload, create account, send message, etc.
  - Knowledge file has a workflow but it is VAGUE or GENERIC:
    * Steps use language like "find the button", "fill in the fields",
      "look for the option" without naming specific UI elements
    * No specific page URLs, button text, or form field names
    * Steps could describe ANY website, not specifically THIS site
    In this case, set reason to explain what details are missing.

Always provide a reason based on what you actually found (or didn't find)
in the knowledge files.
</exploration_decision>
`;

export async function gatherContext(input: PlanningInput): Promise<PlanningOutput> {
  const { task, url, context, sessionId } = input;

  // Quick extractions (no LLM needed)
  const hintDomain = extractDomain(url) || inferDomainFromTask(task);
  const contextInfo = parseContext(context);
  const planningTrace: string[] = [];

  await log(`Starting planning for: ${task.substring(0, 60)}...`);
  await log(`Hint domain: ${hintDomain || "none"}, Context keys: ${Object.keys(contextInfo).join(", ") || "none"}`);

  // If LLM not available, return minimal result
  if (!isLLMAvailable()) {
    await log("LLM not available, using minimal context");
    return {
      domain: hintDomain,
      collectedInfo: contextInfo,
      missingInfo: [],
      readyToExecute: true,
      planningTrace: ["LLM not available - using domain hint only"],
    };
  }

  // Build conversation history
  const conversationHistory: string[] = [];
  let finishResult: Record<string, any> | null = null;
  let step = 0;
  let noToolCallRetries = 0;
  const MAX_NO_TOOL_RETRIES = 2; // Max times to retry if LLM doesn't return tool calls
  const planningStartTime = Date.now();

  // Initial user message
  let initialPrompt = `Task: ${task}`;
  if (url) initialPrompt += `\nURL: ${url}`;
  if (context) initialPrompt += `\nUser context:\n${context}`;
  if (hintDomain) initialPrompt += `\n\n[System note: Target domain appears to be "${hintDomain}"]`;

  conversationHistory.push(`User: ${initialPrompt}`);

  // Agentic loop - runs until finish_planning is called (with safety timeout)
  while (!finishResult) {
    // Check total planning timeout
    const elapsed = Date.now() - planningStartTime;
    if (elapsed > TOTAL_PLANNING_TIMEOUT_MS) {
      log(`Total planning timeout reached (${elapsed}ms), finishing with defaults`);
      planningTrace.push(`Planning timeout after ${Math.round(elapsed / 1000)}s`);
      break;
    }

    step++;
    log(`Step ${step} (${Math.round(elapsed / 1000)}s elapsed)`);

    // Build prompt with conversation history
    const fullPrompt = conversationHistory.join("\n\n") + "\n\nAssistant:";

    // Call LLM
    let response;
    try {
      response = await askLLM(
        {
          prompt: fullPrompt,
          systemPrompt: SYSTEM_PROMPT + "\n" + TOOL_DESCRIPTIONS,
          maxTokens: 1500,
          modelTier: "smart",
        },
        LLM_TIMEOUT_MS
      );
    } catch (e) {
      await log(`LLM error: ${e}`);
      planningTrace.push(`Step ${step}: LLM error - ${e}`);
      break;
    }

    const content = response.content;
    await log(`Response (${content.length} chars): ${content.substring(0, 150)}...`);

    // Parse tool calls
    const toolCalls = parseToolCalls(content);

    if (toolCalls.length === 0) {
      noToolCallRetries++;
      // No tool calls - check if LLM is confused or done
      planningTrace.push(`Step ${step}: No tool calls parsed (retry ${noToolCallRetries}). Response: ${content.substring(0, 100)}`);
      log(`No tool calls in response (retry ${noToolCallRetries}/${MAX_NO_TOOL_RETRIES})`);

      // If response mentions being done/ready, treat as implicit finish
      if (content.toLowerCase().includes("ready") || content.toLowerCase().includes("finish") || content.toLowerCase().includes("proceed")) {
        log("Implicit finish detected in response");
        finishResult = { ready_to_execute: true };
        break;
      }

      // If we've retried enough times, just finish with defaults
      if (noToolCallRetries >= MAX_NO_TOOL_RETRIES) {
        log("Max retries reached, finishing with defaults");
        finishResult = { ready_to_execute: true };
        break;
      }

      // Add response to history and continue (give LLM another chance)
      conversationHistory.push(`Assistant: ${content}`);
      conversationHistory.push(`User: Please respond with a JSON tool call. Use finish_planning if you're done.`);
      continue;
    }

    // Reset retry counter on successful tool call
    noToolCallRetries = 0;

    // Check if finish_planning is batched with other tools (hallucination risk)
    const hasFinish = toolCalls.some(c => c.name === "finish_planning");
    const hasOtherTools = toolCalls.some(c => c.name !== "finish_planning");

    if (hasFinish && hasOtherTools) {
      // finish_planning was batched with info-gathering tools — the LLM wrote
      // its finish result before seeing tool results. Execute the other tools
      // and force the LLM to re-call finish_planning with real data.
      await log("finish_planning batched with other tools — executing others first, will re-call finish");
      planningTrace.push(`Step ${step}: Skipped premature finish_planning (batched with other tools)`);

      const results: string[] = [];
      for (const call of toolCalls) {
        if (call.name === "finish_planning") continue; // Skip it
        await log(`Tool call: ${call.name}`, call.input);
        planningTrace.push(`Step ${step}: ${call.name}(${JSON.stringify(call.input)})`);
        const result = await executeTool(call.name, call.input, sessionId);
        results.push(`[${call.name}] ${result}`);
        planningTrace.push(`  → ${result.substring(0, 150)}${result.length > 150 ? "..." : ""}`);
      }

      conversationHistory.push(`Assistant: ${content}`);
      conversationHistory.push(`User: Tool results:\n${results.join("\n\n")}\n\nNow review the results and call finish_planning based on what you actually found.`);
      continue;
    }

    // Execute each tool call
    const results: string[] = [];
    for (const call of toolCalls) {
      await log(`Tool call: ${call.name}`, call.input);
      planningTrace.push(`Step ${step}: ${call.name}(${JSON.stringify(call.input)})`);

      if (call.name === "finish_planning") {
        finishResult = call.input;
        await log("finish_planning called", finishResult);
        planningTrace.push(`Step ${step}: Planning complete`);
        break;
      }

      const result = await executeTool(call.name, call.input, sessionId);
      results.push(`[${call.name}] ${result}`);
      planningTrace.push(`  → ${result.substring(0, 150)}${result.length > 150 ? "..." : ""}`);
    }

    // If finish was called, we're done
    if (finishResult) break;

    // Add tool results to conversation history for next turn
    if (results.length > 0) {
      conversationHistory.push(`Assistant: ${content}`);
      conversationHistory.push(`User: Tool results:\n${results.join("\n\n")}\n\nContinue with next tool call, or call finish_planning if done.`);
    }
  }

  // Build output
  const output: PlanningOutput = {
    domain: finishResult?.domain || hintDomain,
    collectedInfo: {
      ...contextInfo,
      // Handle collected_info being either an object or a string
      ...(typeof finishResult?.collected_info === 'object'
        ? finishResult.collected_info
        : finishResult?.collected_info
          ? { _summary: finishResult.collected_info }
          : {}),
    },
    missingInfo: Array.isArray(finishResult?.missing_info)
      ? finishResult.missing_info.map((m: any) => ({
          field: m.field || "unknown",
          label: m.label || m.field || "Unknown",
          description: m.description || "",
          type: "text" as const,
          required: m.required ?? false,
        }))
      : [], // Handle string like "None" or undefined
    readyToExecute: finishResult?.ready_to_execute ?? true,
    planningTrace,
  };

  // Load site knowledge if we have a domain
  if (output.domain) {
    const knowledge = await getKnowledge(output.domain);
    if (knowledge) {
      output.siteKnowledge = knowledge;
      await log(`Loaded site knowledge for ${output.domain}`);
    }
  }

  // Extract exploration decision from Planning Agent's finish_planning call
  if (finishResult?.exploration) {
    const exp = finishResult.exploration;
    if (exp.type === 'overview') {
      output.explorationNeeded = { type: 'overview', reason: exp.reason || 'Planning agent requested overview' };
    } else if (exp.type === 'workflow') {
      output.explorationNeeded = { type: 'workflow', task: task, reason: exp.reason || 'Planning agent requested workflow exploration' };
    } else {
      output.explorationNeeded = { type: 'none' };
    }
  } else {
    // Default to none if Planning Agent didn't specify
    output.explorationNeeded = { type: 'none' };
  }

  await log(`Complete: domain=${output.domain}, collected=${Object.keys(output.collectedInfo).length}, ready=${output.readyToExecute}, exploration=${output.explorationNeeded?.type || 'none'}, steps=${step}`);

  return output;
}

// ============================================================================
// Exports
// ============================================================================

export class PlanningAgent {
  async analyze(input: PlanningInput): Promise<PlanningOutput> {
    return gatherContext(input);
  }
}

export const planningAgent = new PlanningAgent();
