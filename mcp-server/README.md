# LLM in Chrome MCP Server

Give Claude Code a browser agent that handles web tasks autonomously.

## Why This Exists

When you need to interact with the web, you have two options:

### 1. Low-Level Browser Tools (Playwright MCP, browser-use, etc.)
```
Claude: I'll click the login button
Claude: Now I'll type the username
Claude: Now I'll click submit
Claude: The page changed, let me screenshot
Claude: I see an error, let me try again
... 50 more tool calls ...
```

Every click, every keystroke, every navigation is a separate tool call. You're doing the browsing yourself.

### 2. This MCP Server (High-Level Agent)
```
Claude: browser_start("Log into my account and download the invoice")
Claude: browser_status → { status: "running", step: "Filling login form..." }
Claude: browser_status → { status: "complete", result: "Downloaded invoice.pdf" }
```

You delegate the entire task. The agent handles all browser interaction.

## Tools

| Tool | Description |
|------|-------------|
| `browser_start` | Start a new task. Returns session_id for tracking. |
| `browser_message` | Send follow-up instructions to a running task. |
| `browser_status` | Check progress. Works for single task or all tasks. |
| `browser_stop` | Stop a task and get partial results. |
| `browser_screenshot` | Capture current browser state. |

## Parallel Execution

Run multiple tasks simultaneously:

```
session1 = browser_start("Search for flights to Tokyo")
session2 = browser_start("Check hotel prices in Shibuya")
session3 = browser_start("Look up JR Pass costs")

# All three run in parallel
browser_status() → Shows all 3 active sessions
```

## Multi-Turn Interaction

Send follow-up messages to guide the agent:

```
session = browser_start("Fill out the job application")

# Agent might need clarification
browser_status(session) → { status: "waiting", step: "What's your desired salary?" }

browser_message(session, "Put $150k")

browser_status(session) → { status: "running", step: "Completing remaining fields..." }
```

## Installation

### 1. Install the Chrome Extension
The MCP server requires the LLM in Chrome extension to be installed and configured.

### 2. Install the MCP Server
```bash
cd mcp-server
npm install
npm run build
```

### 3. Configure Claude Code
Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/llm-in-chrome/mcp-server/dist/index.js"]
    }
  }
}
```

## Use Cases

**Form Filling**
```
browser_start("Apply for the senior engineer position on careers.example.com using my resume info")
```

**Research**
```
browser_start("Find the top 3 competitors for Acme Corp and summarize their pricing")
```

**Data Extraction**
```
browser_start("Go to my bank account and list all transactions from last month")
```

**Multi-Step Workflows**
```
browser_start("Log into Jira, find my open tickets, and summarize what needs attention this week")
```

## How It Works

```
Claude Code → MCP Server → Native Host → Chrome Extension → Browser
                ↑                              ↓
                └──────── Status Updates ──────┘
```

1. Claude Code calls `browser_start` with a task
2. MCP server creates a session and sends to native host
3. Native host relays to Chrome extension
4. Extension's agent handles all browser interaction
5. Status updates flow back through the chain
6. Claude Code monitors via `browser_status`

## Comparison with Other Tools

| Feature | This Server | Playwright MCP | browser-use |
|---------|------------|----------------|-------------|
| Abstraction | Task-level | Action-level | Action-level |
| Tool calls per task | ~3 | ~50+ | ~50+ |
| Parallel tasks | ✅ | Manual | Manual |
| Multi-turn | ✅ | N/A | N/A |
| Setup | Extension | Playwright | Python deps |

## License

MIT
