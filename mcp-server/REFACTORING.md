# Refactoring Complete: Regex → LLM Intelligence

## Summary

Replaced brittle regex-based language understanding with LLM intelligence.
The system now uses the extension's multi-provider LLM system (Anthropic, OpenAI, Google, etc.)
to semantically understand tasks and reports.

## What Changed

### ✅ LLM Client (`src/llm/client.ts`) - CREATED

Routes LLM requests through native host to extension's provider system:

```typescript
import { askLLM, askLLMForJSON } from "../llm/client.js";

// Simple text response
const response = await askLLM({ prompt: "...", systemPrompt: "..." });

// Structured JSON response
const analysis = await askLLMForJSON<TaskAnalysis>({ prompt: task, systemPrompt: "..." });
```

### ✅ Planning Agent (`src/agents/planning.ts`) - UPDATED

**Before (Regex):**
```typescript
// Missed: "I'm flying next Tuesday", "going to Los Angeles", etc.
const INFO_PATTERNS = [
  { pattern: /\b(departure|travel|flight)\s*(date)?/i, ... },
  { pattern: /\bto\s+([A-Z][a-zA-Z\s]+?)/i, ... },
];
```

**After (LLM):**
```typescript
// Understands natural language semantically
const analysis = await askLLMForJSON<TaskAnalysis>({
  prompt: task,
  systemPrompt: `Analyze this task and return JSON with:
    - domain: target website
    - intent: what user wants
    - providedInfo: info already given
    - neededInfo: info that might be needed
    - criticallyMissing: info we MUST have`
});
```

### ✅ Explorer Agent (`src/agents/explorer.ts`) - UPDATED

**Before (Regex):**
```typescript
// Fragile section header matching
if (report.toLowerCase().includes('login')) {
  const authMatch = report.match(/authentication[:\s]*([\s\S]*?)(?=\n\n)/i);
  // ...
}
```

**After (LLM):**
```typescript
// Understands free-form exploration reports
const parsed = await askLLMForJSON<ParsedExplorationReport>({
  prompt: report,
  systemPrompt: `Parse this exploration report and return JSON with:
    - authentication: {method, steps, notes}
    - navigation: {mainSections, importantButtons, menuStructure}
    - workflows: [{name, steps, requiredInfo}]
    - quirks: [...]
    - tips: [...]`
});
```

### ✅ Info Gatherer (`src/orchestrator/info-gatherer.ts`) - DELETED

Its functionality is now part of Planning Agent's LLM analysis.

### ✅ Native Host (`oauth-server.cjs`) - UPDATED

Added message handlers:
- `llm_request` - Forwards LLM requests to extension
- `mcp_llm_response` - Forwards responses back to MCP server

### ✅ Extension (`mcp-bridge.js`) - UPDATED

Added `llm_request` handler that:
- Receives LLM requests from native host
- Calls `callLLMSimple()` using extension's configured provider
- Returns response through native host

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Planning Agent    │    Explorer Agent              │    │
│  │  - analyzeTask()   │    - parseReport()             │    │
│  │  - Uses LLM ✓      │    - extractLearnings()        │    │
│  │                    │    - Uses LLM ✓                │    │
│  └────────────────────┴────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  LLM Client                           │   │
│  │     askLLM() / askLLMForJSON()                       │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼ llm_request
┌──────────────────────────────────────────────────────────────┐
│                    Native Host                                │
│              (oauth-server.cjs)                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼ mcp-inbox.json
┌──────────────────────────────────────────────────────────────┐
│                  Chrome Extension                             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  MCP Bridge                           │    │
│  │     handleLLMRequest() → callLLMSimple()             │    │
│  └──────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Provider System                          │    │
│  │    Anthropic │ OpenAI │ Google │ OpenRouter │ Codex  │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## What's Still Regex (Appropriately)

These use regex because they parse **structure**, not **language**:

1. **URL parsing** - `new URL(url).hostname`
2. **Domain extraction from URLs** - `/https?:\/\/([^\s/]+)/`
3. **Context key:value parsing** - `/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/`

## Fallback Behavior

If LLM is not available (extension not connected, API error):
- Planning Agent returns minimal analysis with empty neededInfo
- Explorer Agent uses simple heuristics (treat report as single tip)

## Testing

To test the LLM integration:

1. Start the extension with a configured API provider
2. Run MCP server: `npm run dev`
3. Use Claude Code with browser_start tool
4. Check logs for `[PlanningAgent] LLM analysis:` and `[ExplorerAgent] LLM extracted`
