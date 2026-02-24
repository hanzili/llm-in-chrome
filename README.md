# LLM in Chrome

Give your AI agent a browser. Works with Claude Code, Cursor, Windsurf, Codex CLI, and anything that supports MCP.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iklpkemlmbhemkiojndpbhoakgikpmcd)](https://chrome.google.com/webstore/detail/iklpkemlmbhemkiojndpbhoakgikpmcd)

## Demo

[![demo video](https://img.youtube.com/vi/cal0k351Rwo/maxresdefault.jpg)](https://youtu.be/cal0k351Rwo)

## Why?

Other browser tools (Playwright MCP, Browser Use) give your AI a **new, empty browser**. Every click is a separate tool call. Logging in is a nightmare.

This gives your AI **your actual Chrome** — already logged into Gmail, GitHub, Jira, everything. It delegates the entire task to a browser agent that handles all the clicking and typing autonomously.

```
# Other tools: 50+ tool calls, one click at a time
ai: click login button
ai: type username
ai: type password
ai: click submit
ai: wait for page load
ai: click menu
... (you get the idea)

# This: 1 tool call, entire task delegated
ai: browser_start("Log into Jira and summarize my open tickets")
ai: → { status: "complete", answer: "You have 3 open tickets..." }
```

## Quick Start

### 1. Install the Chrome extension

**[Install from Chrome Web Store](https://chrome.google.com/webstore/detail/iklpkemlmbhemkiojndpbhoakgikpmcd)**

### 2. Install the native host

```bash
curl -fsSL https://raw.githubusercontent.com/hanzili/llm-in-chrome/main/install.sh | bash
```

### 3. Add the MCP server

```bash
cd mcp-server && npm install && npm run build
```

Add to your MCP config:

<details>
<summary><strong>Claude Code</strong> (~/.claude/claude_desktop_config.json)</summary>

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
</details>

<details>
<summary><strong>Cursor</strong> (.cursor/mcp.json)</summary>

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
</details>

<details>
<summary><strong>Windsurf / Other MCP clients</strong></summary>

Point your MCP client to:
```
node /path/to/llm-in-chrome/mcp-server/dist/index.js
```
</details>

### 4. Set up credentials

The extension needs LLM credentials to power the browser agent. Choose one:

<details>
<summary><strong>Claude Code subscription</strong> (recommended — no extra cost)</summary>

If you already have Claude Code set up, the extension auto-detects your credentials:
```bash
claude login  # if not already logged in
```
Open the extension settings and click "Connect" under Claude Code Plan.
</details>

<details>
<summary><strong>Codex subscription</strong></summary>

```bash
npm install -g @openai/codex
codex login
```
Open the extension settings and click "Connect" under Codex Plan.
</details>

<details>
<summary><strong>API keys</strong> (pay-per-use)</summary>

Open the extension settings and enter your key for:
- [Anthropic](https://console.anthropic.com)
- [OpenAI](https://platform.openai.com)
- [Google](https://aistudio.google.com)
- [OpenRouter](https://openrouter.ai)
</details>

That's it. Your AI can now use your browser.

## What You Can Do

### Web research
```
browser_start("Search for 'MCP protocol' on Google and summarize the first 3 results")
```

### Logged-in tasks
```
browser_start("Go to Gmail and unsubscribe from all marketing emails from the last week")
```

### Form filling
```
browser_start(
  "Apply for the senior engineer position on careers.acme.com",
  context="Name: Jane Doe, Email: jane@example.com, Experience: 10 years Python..."
)
```

### Multi-step workflows
```
browser_start("Log into my bank and download last month's statement")
```

### Follow-up messages
```
session = browser_start("Find AI engineer jobs on LinkedIn in San Francisco")
# → { session_id: "abc123", status: "complete", answer: "Found 5 results..." }

browser_message("abc123", "Apply to the first one using my profile")
```

### Parallel tasks
```
browser_start("Search for flights to Tokyo on Google Flights")
browser_start("Check hotel prices in Shibuya on Booking.com")
browser_start("Look up JR Pass costs")
# All three run simultaneously in separate windows
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `browser_start` | Run a task. Blocks until complete, returns the result. |
| `browser_message` | Send follow-up instructions to an existing session. |
| `browser_status` | Check progress of active tasks. |
| `browser_stop` | Stop a task. |
| `browser_screenshot` | Capture current browser state. |

## CLI

There's also a CLI for running tasks from the terminal:

```bash
# Start a task (blocks until complete)
node mcp-server/dist/cli.js start "Search for AI news" --url https://google.com

# Check status
node mcp-server/dist/cli.js status

# Watch logs in real-time
node mcp-server/dist/cli.js logs <session_id> --follow

# Send follow-up message
node mcp-server/dist/cli.js message <session_id> "Click the first result"

# Stop a task
node mcp-server/dist/cli.js stop <session_id>
```

## How It Works

```
Claude Code / Cursor / AI Tool
        ↓ MCP Protocol (stdio)
   MCP Server
        ↓ WebSocket (localhost:7862)
   Chrome Extension (your browser)
        ↓ Browser automation
   Target Website
```

1. Your AI tool calls `browser_start` with a task description
2. The MCP server sends it to the Chrome extension via WebSocket relay
3. The extension's built-in agent handles all browser interaction autonomously
4. Results flow back to your AI tool

The browser agent uses an accessibility tree to understand pages, not screenshots. It clicks, types, scrolls, navigates, and manages tabs — all on its own.

## Comparison

| | LLM in Chrome | Playwright MCP | Browser Use |
|---|---|---|---|
| **Abstraction** | Task-level (1 call) | Action-level (50+ calls) | Action-level (50+ calls) |
| **Browser** | Your real Chrome | New headless browser | New Chromium instance |
| **Logged-in sites** | Already authenticated | Must handle auth | Must handle auth |
| **Setup** | Chrome extension | Playwright + Node | Python + pip |
| **Parallel tasks** | Built-in | Manual | Manual |
| **Session follow-ups** | Built-in | N/A | N/A |

## Using as a Standalone Extension

The extension also works on its own without the MCP server — just open the side panel and chat with the agent directly. It supports multiple LLM providers (Claude, GPT, Gemini, Mistral, Qwen) and can be configured through the extension settings.

## Development

```bash
# Load unpacked extension
git clone https://github.com/hanzili/llm-in-chrome.git
# Open chrome://extensions → Enable Developer Mode → Load Unpacked → select the repo

# Build MCP server
cd mcp-server && npm install && npm run build

# Watch for changes
cd mcp-server && npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Submit a pull request

## License

MIT
