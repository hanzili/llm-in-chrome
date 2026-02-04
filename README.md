# LLM in Chrome

An autonomous browser agent that lets any LLM control your browser. Multi-provider support (Claude, GPT, Gemini, Mistral, Qwen) with full browser automation capabilities.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iklpkemlmbhemkiojndpbhoakgikpmcd)](https://chrome.google.com/webstore/detail/iklpkemlmbhemkiojndpbhoakgikpmcd)

**[Install from Chrome Web Store](https://chrome.google.com/webstore/detail/iklpkemlmbhemkiojndpbhoakgikpmcd)**

## Demo

[![demo video](https://img.youtube.com/vi/cal0k351Rwo/maxresdefault.jpg)](https://youtu.be/cal0k351Rwo)

Shows the agent applying to jobs, unsubscribing from emails in Gmail, and completing challenges with captchas and anti-bot protections.

## Features

- **Browser Automation**: Click, type, scroll, drag, and navigate web pages
- **Screenshots**: Capture and analyze page content with automatic DPR scaling
- **Accessibility Tree**: Read page structure for intelligent element interaction
- **Tab Management**: Create, close, and switch between tabs
- **Form Handling**: Fill forms and upload files
- **Console/Network Monitoring**: Track page logs and network requests
- **Domain Skills**: Built-in best practices for Gmail, Google Docs, GitHub, LinkedIn, and more
- **Multi-Provider Support**: Works with Anthropic, OpenAI, Google, and OpenRouter
- **MCP Server**: Integrate with Claude Code for high-level task automation

## Installation

### Option 1: Chrome Web Store (Recommended)

1. **[Install from Chrome Web Store](https://chrome.google.com/webstore/detail/iklpkemlmbhemkiojndpbhoakgikpmcd)**

2. Install the native host (required for subscription plans):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/hanzili/llm-in-chrome/main/install.sh | bash
   ```

### Option 2: Load Unpacked (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/hanzili/llm-in-chrome.git
   cd llm-in-chrome
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the extension directory

5. The extension icon should appear in your toolbar

6. **Install native host** (for Claude Code/Codex plan support):
   ```bash
   cd native-host
   ./install.sh
   ```

   > **Note:** The install script includes both production (`iklpkemlmbhemkiojndpbhoakgikpmcd`) and a default development extension ID (`dnajlkacmnpfmilkeialficajdgkkkfo`). If your unpacked extension has a different ID (visible in `chrome://extensions`), edit the `DEV_ID` variable in `install.sh` or `native-host/install.sh` before running.

### Prerequisites

- Google Chrome (version 120+)
- Node.js 18+ (for native host)

### Configuration

You can use either **subscription-based plans** (no API billing) or **API keys** (pay-per-use).

#### Subscription Plans (Recommended)

Use your existing Claude or ChatGPT subscription - no API billing!

### Claude Code Plan Setup

Use your Claude Pro/Max subscription ($20-200/month) instead of paying per API call.

**Prerequisites:**
- Claude Pro or Max subscription
- Claude Code CLI installed

**Steps:**

1. **Install Claude Code CLI:**
   ```bash
   # macOS/Linux
   curl -fsSL https://claude.ai/install.sh | sh

   # Or with npm
   npm install -g @anthropic-ai/claude-code
   ```

2. **Login to Claude Code:**
   ```bash
   claude login
   ```
   This opens a browser window to authenticate with your Claude account.

3. **Install Native Host** (required for Chrome extension):
   ```bash
   # One-liner install
   curl -fsSL https://raw.githubusercontent.com/hanzili/llm-in-chrome/main/install.sh | bash
   ```

4. **Connect in Extension:**
   - Open the extension settings
   - Click "Connect" under Claude Code Plan
   - Credentials are auto-detected from macOS Keychain or `~/.claude/credentials.json`

**Models available:** Opus 4.5, Opus 4, Sonnet 4, Haiku 4.5 (labeled as "Claude Code")

### Codex Plan Setup

Use your ChatGPT Pro/Plus subscription ($20-200/month) instead of paying per API call.

**Prerequisites:**
- ChatGPT Pro or Plus subscription
- Codex CLI installed

**Steps:**

1. **Install Codex CLI:**
   ```bash
   npm install -g @openai/codex
   ```

2. **Login to Codex:**
   ```bash
   codex login
   ```
   This opens a browser window to authenticate with your OpenAI/ChatGPT account.

3. **Install Native Host** (required for Chrome extension):
   ```bash
   # One-liner install
   curl -fsSL https://raw.githubusercontent.com/hanzili/llm-in-chrome/main/install.sh | bash
   ```

4. **Connect in Extension:**
   - Open the extension settings
   - Click "Connect" under Codex Plan
   - The extension will read credentials from `~/.codex/auth.json`

**Models available:** GPT-5.1 Codex Max, GPT-5.2 Codex, GPT-5.1 Codex Mini (labeled as "Codex Plan")

#### API Keys (Pay-per-use)

Alternatively, use API keys for pay-per-use billing:

1. Click the extension icon and open Settings
2. Enter your API key for your preferred provider:
   - **Anthropic**: Get key from [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI**: Get key from [platform.openai.com](https://platform.openai.com)
   - **Google**: Get key from [aistudio.google.com](https://aistudio.google.com)
   - **OpenRouter**: Get key from [openrouter.ai](https://openrouter.ai)

## Usage

1. Navigate to any web page
2. Click the extension icon to open the side panel
3. Describe what you want to accomplish
4. The AI agent will autonomously browse and complete your task

### Available Tools

| Tool | Description |
|------|-------------|
| `computer` | Mouse/keyboard actions (click, type, scroll, etc.) |
| `navigate` | Go to URLs, back/forward navigation |
| `tabs_context` | List available tabs |
| `tabs_create` | Open new tabs |
| `tabs_close` | Close tabs |
| `read_page` | Get accessibility tree representation |
| `get_page_text` | Extract text content from pages |
| `form_input` | Fill form fields |
| `file_upload` | Upload files to file inputs |
| `javascript_tool` | Execute JavaScript on pages |
| `read_console_messages` | Get browser console logs |
| `read_network_requests` | Get network request history |

## MCP Server Integration

Use the browser agent as a tool in Claude Code for high-level task automation.

### Setup

```bash
cd mcp-server
npm install && npm run build
```

Add to `~/.claude/claude_desktop_config.json`:
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

### Usage

```
# Start a task
browser_start("Log into my bank and download last month's statement")

# Check progress
browser_status(session_id) → { status: "running", steps: [...] }

# Continue after completion
browser_message(session_id, "Now download the one from two months ago")
```

**Features:**
- **Task-level abstraction**: Delegate entire workflows, not individual clicks
- **Session continuation**: Send follow-up messages to completed tasks
- **Parallel execution**: Run multiple tasks simultaneously with isolated memory
- **Progress monitoring**: Track steps and intervene if needed

See [mcp-server/README.md](mcp-server/README.md) for full documentation.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by [Claude in Chrome](https://chrome.google.com/webstore/detail/claude/) by Anthropic
- Built on the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
