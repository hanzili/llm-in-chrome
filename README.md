# LLM in Chrome

Your AI copilot for the web. Automate tasks, navigate sites, and complete workflows with large language models directly in Chrome.

**LLM-agnostic**: Works with any language model - Claude, GPT, Gemini, or your own custom API.

---

## Demo

<details open>
<summary>Watch the full demo video</summary>

[![LLM in Chrome Demo](https://img.youtube.com/vi/cal0k351Rwo/maxresdefault.jpg)](https://youtu.be/cal0k351Rwo)

See the AI agent autonomously navigate websites, fill forms, and complete multi-step workflows.

</details>

---

## Overview

LLM in Chrome is a Chrome extension that brings autonomous AI agents to your browser. Describe what you want in plain English, and the AI navigates websites, fills forms, extracts information, and completes multi-step workflows on your behalf.

## Architecture

![Architecture Diagram](docs/architecture-diagram.png)

The extension provides the AI with a **tool suite** for browser interaction:

- **computer** - Take screenshots, click elements, type text, scroll
- **navigate** - Control URL navigation (go to, back, forward, reload)
- **read_page** - Extract page structure via accessibility tree
- **javascript_tool** - Execute JavaScript in page context
- **solve_captcha** - Automated CAPTCHA solving (brute force)
- **tabs_context** - Manage multiple tabs

Combined with **domain-specific knowledge**, the agent chooses the right approach for each site.

## Key Features

- **LLM-Agnostic** - Use any language model (Claude, GPT, Gemini, or custom)
- **Natural Language Control** - Describe tasks in plain English
- **Visual Understanding** - AI sees and understands web pages
- **Autonomous Actions** - Automated clicking, typing, navigation, and scrolling
- **Multi-Step Workflows** - Handles complex tasks across multiple pages
- **Domain Intelligence** - Site-specific strategies and patterns
- **Multi-Modal Input** - Supports text and image inputs
- **Real-Time Streaming** - See the AI's reasoning as it works
- **Privacy First** - Runs locally, your data stays private

## Installation

1. Clone this repository
   ```bash
   git clone https://github.com/hanzili/llm-in-chrome.git
   ```

2. Load the extension in Chrome
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `llm-in-chrome` folder

3. Configure your AI provider
   - Click the extension icon
   - Open Settings
   - Select your AI provider (Anthropic, OpenAI, Google, OpenRouter, or Custom)
   - Add your API credentials
   - Choose your model

## Supported Models

| Provider | Models |
|----------|--------|
| **Anthropic** | Opus 4.5, Opus 4, Sonnet 4, Haiku 4.5 |
| **OpenAI** | GPT-5, GPT-5 Mini, GPT-4.1, GPT-4o, o3, o4-mini |
| **Google** | Gemini 3 Pro, Gemini 2.5 Flash, Gemini 2.5 Pro |
| **OpenRouter** | Access to all major models through one API |
| **Custom** | Any OpenAI-compatible API endpoint |

Default: **Claude Sonnet 4**

## Domain-Specific Knowledge

Each website is built differently and requires different interaction strategies. LLM in Chrome comes with **built-in knowledge** for popular sites that tells the agent:

- **Which approach to use**: Vision-first (screenshots), JavaScript injection, or accessibility tree navigation
- **Site-specific patterns**: Where buttons are located, how forms work, keyboard shortcuts
- **Anti-bot bypasses**: Techniques for sites with CAPTCHA or bot detection
- **Best practices**: Optimal workflows for common tasks on each platform

### Supported Sites

- **Productivity**: Gmail, Google Docs/Sheets/Drive, Notion, Slack, Calendar
- **Development**: GitHub
- **Social**: LinkedIn, Twitter/X
- **Commerce**: Amazon

### Why This Matters

Without domain knowledge, the AI might:
- Use the wrong tool for the task (e.g., trying to click a canvas-based UI)
- Miss keyboard shortcuts or efficient workflows
- Trigger bot detection systems
- Fail to handle site-specific quirks

With domain knowledge, the agent:
- Chooses the optimal strategy for each site
- Works faster and more reliably
- Handles edge cases and anti-bot measures
- Adapts to site-specific patterns

**You can add your own domain knowledge** or override built-in rules for any site through the Settings panel.

## Use Cases

**Web Automation**
- Fill forms and applications
- Extract data from multiple pages
- Navigate complex workflows
- Submit repetitive tasks

**Research & Productivity**
- Browse and summarize articles
- Collect information from multiple sources
- Compare products or services
- Monitor website changes

**Testing & Development**
- Test user flows and interactions
- Debug UI issues
- Verify form validations
- Check accessibility

**Personal Assistant**
- Manage email (Gmail, Outlook)
- Apply to jobs (LinkedIn, Indeed)
- Book appointments
- Track packages and orders

## Privacy & Security

- **Local-first**: All processing on your machine
- **API-only**: Requests only to your chosen LLM provider
- **No tracking**: No data collection or storage
- **Open source**: Full code transparency

## Contributing

Contributions welcome:
- Bug reports
- Feature suggestions
- Documentation improvements
- Code contributions
- New domain knowledge for additional sites

Open an issue or submit a pull request.

## License

MIT License - see [LICENSE](LICENSE) for details

## Author

**Hanzi Li**
hanzili0217@gmail.com

Built with inspiration from Claude in Chrome and powered by Anthropic, OpenAI, and Google AI models.
