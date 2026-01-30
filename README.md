# Job Apply Extension

A Chrome extension that provides Claude-powered browser automation, extracted and documented from Claude in Chrome for full behavioral compatibility.

## Features

- **Browser Automation**: Click, type, scroll, drag, and navigate web pages
- **Screenshots**: Capture and analyze page content with automatic DPR scaling
- **Accessibility Tree**: Read page structure for intelligent element interaction
- **Tab Management**: Create, close, and switch between tabs
- **Form Handling**: Fill forms and upload files
- **Console/Network Monitoring**: Track page logs and network requests
- **Multi-Provider Support**: Works with Anthropic, OpenAI, Google, and OpenRouter

## Installation

### Prerequisites

- Google Chrome (version 120+)
- Node.js 18+ (for development)

### Load the Extension

1. Clone this repository:
   ```bash
   git clone https://github.com/your-repo/job-apply-extension.git
   cd job-apply-extension
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the extension directory

5. The extension icon should appear in your toolbar

### Configuration

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
4. Claude will use the available tools to complete your task

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

## Architecture

```
src/
├── background/
│   ├── service-worker.js      # Main orchestration, agent loop
│   ├── modules/
│   │   ├── cdp-helper.js      # Chrome DevTools Protocol (copied from Claude in Chrome's `te` class)
│   │   ├── key-definitions.js # Key codes (copied from Claude in Chrome's `ee` constant)
│   │   ├── mac-commands.js    # Mac commands (copied from Claude in Chrome's `Z` constant)
│   │   ├── screenshot-context.js # DPR coordinate scaling
│   │   ├── api.js             # LLM API calls
│   │   └── providers/         # Multi-provider support (Anthropic, OpenAI, Google, OpenRouter)
│   └── tool-handlers/
│       ├── computer-tool-claude.js   # Copied from Claude in Chrome's `ie` constant
│       ├── navigation-tool-claude.js # Copied from Claude in Chrome's `Y` constant
│       ├── form-tool-claude.js       # Copied from Claude in Chrome's `de` constant
│       ├── read-page-tool-claude.js  # Copied from Claude in Chrome's `le` constant
│       ├── utility-tools-claude.js   # find (`pe`), get_page_text (`he`), javascript_tool (`De`)
│       ├── tabs-tool.js       # Our implementation
│       ├── monitoring-tool.js # Our implementation
│       └── agent-tool.js      # Our implementation
├── content/
│   ├── content-script.js      # Injected into pages
│   └── accessibility-tree.js  # A11y tree generation (uses __claudeElementMap naming)
├── sidepanel/
│   ├── sidepanel.html         # Side panel UI
│   └── sidepanel.js           # Side panel logic
└── tools/
    └── definitions.js         # Tool schemas for Claude
```

## Development

### Running Tests

```bash
# Unit tests
node src/background/tool-handlers/computer-tool.test.js

# Differential tests (compares behavior with Claude in Chrome)
node tests/differential/run-differential-tests.js
```

### Key Files

| File | Purpose |
|------|---------|
| `src/background/modules/cdp-helper.js` | Core browser automation (copied from Claude in Chrome's `te` class) |
| `src/background/tool-handlers/computer-tool-claude.js` | Computer tool (copied from Claude in Chrome's `ie` constant) |
| `src/content/accessibility-tree.js` | Accessibility tree generation (uses `__claudeElementMap`) |
| `docs/CLAUDE_IN_CHROME_ARCHITECTURE.md` | Maps obfuscated names to real purposes |

### Code Extraction from Claude in Chrome

This extension's core automation code is **copied directly** from Claude in Chrome to ensure behavioral equivalence.

#### Tool Handlers (Copied)

| Claude in Chrome | This Extension | File |
|-----------------|----------------|------|
| `ie` (computer) | `handleComputer` | `tool-handlers/computer-tool-claude.js` |
| `Y` (navigate) | `handleNavigate` | `tool-handlers/navigation-tool-claude.js` |
| `de` (form_input) | `handleFormInput` | `tool-handlers/form-tool-claude.js` |
| `le` (read_page) | `handleReadPage` | `tool-handlers/read-page-tool-claude.js` |
| `pe` (find) | `handleFind` | `tool-handlers/utility-tools-claude.js` |
| `he` (get_page_text) | `handleGetPageText` | `tool-handlers/utility-tools-claude.js` |
| `De` (javascript_tool) | `handleJavaScriptTool` | `tool-handlers/utility-tools-claude.js` |

#### Core Infrastructure (Copied)

| Claude in Chrome | This Extension | Purpose |
|-----------------|----------------|---------|
| `te` class | `CDPHelper` | CDP command handling |
| `re` instance | `cdpHelper` | Singleton instance |
| `oe` function | `scaleCoordinates` | DPR coordinate scaling |
| `ee` constant | `KEY_DEFINITIONS` | Keyboard key codes |
| `Z` constant | `MAC_COMMANDS` | macOS keyboard commands |
| `Q` class | `ScreenshotContextManager` | Screenshot context storage |

#### API Headers

Claude in Chrome uses `betas: ["oauth-2025-04-20"]` for OAuth authentication. No special "computer-use" beta header is required - the computer use feature is generally available.

## Documentation

- [Architecture](docs/CLAUDE_IN_CHROME_ARCHITECTURE.md) - Detailed mapping of Claude in Chrome internals
- [Extraction Plan](docs/EXTRACTION_PLAN.md) - How code was extracted and organized
- [Provider Architecture](docs/PROVIDER_ARCHITECTURE.md) - Multi-provider support design

## Behavioral Equivalence

The goal is **100% behavioral equivalence** with Claude in Chrome. This is verified through:

1. **Differential Testing**: Same inputs → same CDP commands → same outputs
2. **Line-by-line extraction**: Code logic is preserved exactly, only variable names change
3. **Timing preservation**: All delays match the original (50ms, 100ms, 12ms, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes (preserve behavioral equivalence!)
4. Run differential tests: `node tests/differential/run-differential-tests.js`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Based on behavioral analysis of [Claude in Chrome](https://chrome.google.com/webstore/detail/claude/...) by Anthropic
- Uses the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) for browser automation
