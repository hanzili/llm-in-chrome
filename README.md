# LLM in Chrome

Your AI copilot for the web. Automate tasks, navigate sites, and complete workflows with large language models directly in Chrome.

**[Watch Demo Video](https://youtu.be/cal0k351Rwo)**

---

## Overview

LLM in Chrome is a Chrome extension that brings autonomous AI agents to your browser. Describe what you want in plain English, and the AI navigates websites, fills forms, extracts information, and completes multi-step workflows on your behalf.

## Key Features

- **Natural Language Control** - Describe tasks in plain English
- **Visual Understanding** - AI sees and understands web pages
- **Autonomous Actions** - Automated clicking, typing, navigation, and scrolling
- **Multi-Step Workflows** - Handles complex tasks across multiple pages
- **Domain Intelligence** - Built-in knowledge for Gmail, LinkedIn, GitHub, and more
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
   - Select your AI provider (Claude, OpenAI, Gemini, or Custom)
   - Add your API credentials
   - Choose your model

## Supported AI Models

| Provider | Models | Notes |
|----------|--------|-------|
| Anthropic Claude | Opus 4.5, Sonnet 4, Haiku 4.5 | Best for complex tasks |
| OpenAI | GPT-4, GPT-5 | Strong all-around performance |
| Google Gemini | 2.0 Flash, 2.0 Pro | Fast and cost-effective |
| Custom | Any OpenAI-compatible API | Bring your own endpoint |

Default: **Claude Sonnet 4**

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

## Built-in Site Knowledge

Pre-configured domain knowledge for:
- **Productivity**: Gmail, Google Docs/Sheets, Notion, Slack
- **Development**: GitHub, Stack Overflow
- **Social**: LinkedIn, Twitter/X
- **Commerce**: Amazon, eBay

Custom site rules can be added or overridden per domain.

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

Open an issue or submit a pull request.

## License

MIT License - see [LICENSE](LICENSE) for details

## Author

**Hanzi Li**
hanzili0217@gmail.com

Built with inspiration from Claude in Chrome and powered by Anthropic, OpenAI, and Google AI models.
