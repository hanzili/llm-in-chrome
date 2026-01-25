# llm in chrome

open-source claude in chrome that works with any llm.

## what is this

you know claude in chrome? this is basically that but open source and llm-agnostic. tell it what to do in plain english and it navigates websites, fills forms, extracts data, handles multi-step workflows, whatever you need.

runs locally on your machine. you choose which model to use.

## demo

[![demo video](https://img.youtube.com/vi/cal0k351Rwo/maxresdefault.jpg)](https://youtu.be/cal0k351Rwo)

shows the agent applying to jobs, unsubscribing from emails in gmail, and completing the deckathon dropout challenge (captchas and anti-bot protections).

## how it works

![architecture](docs/architecture-diagram.png)

the extension gives your llm a set of tools to interact with the browser:

**computer** - take screenshots, click elements, type text, scroll

**navigate** - control url navigation

**read_page** - extract page structure via accessibility tree

**javascript_tool** - execute javascript in page context

**solve_captcha** - automated captcha solving

**tabs_context** - manage multiple tabs

plus it has domain knowledge. knows google docs is canvas-based so it should use screenshots. github works better with accessibility tree. linkedin needs specific patterns to avoid detection.

you can add your own domain knowledge through settings.

## supported models

works with any openai-compatible api.

**anthropic** - opus 4.5, opus 4, sonnet 4, haiku 4.5

**openai** - gpt-5, gpt-5 mini, gpt-4.1, gpt-4o, o3, o4-mini

**google** - gemini 3 pro, gemini 2.5 flash, gemini 2.5 pro

**openrouter** - access to all major models through one api

**custom** - any openai-compatible endpoint

## installation

```bash
git clone https://github.com/hanzili/llm-in-chrome.git
```

1. open chrome://extensions/
2. enable developer mode
3. click load unpacked
4. select the llm-in-chrome folder
5. click the extension icon, go to settings
6. choose your llm provider and add api key

## why domain knowledge matters

different sites need different approaches.

**vision-first** - google docs, figma, canva (canvas-based uis)

**accessibility tree** - github, gmail (structured content)

**javascript injection** - sites with dynamic content or anti-bot measures

without domain knowledge the agent uses the wrong tool and fails. with it, works reliably.

you can customize or add new domain strategies in settings.

## use cases

automate boring web stuff. fill forms, extract data, test workflows, manage emails, apply to jobs, research, accessibility testing.

privacy first. runs locally, only sends requests to your chosen llm provider. no tracking, no data collection.


## what's next

**more user control** - right now domain skills are hardcoded. want to let people customize system prompts, inject custom scripts, and integrate chrome devtools for more device-side control.

**mcp integration** - could work both ways. as a client it uses any mcp tool to help with tasks. as a server other clients just send it a task and it handles everything autonomously instead of the client orchestrating each step. already been experimenting with this idea in [comet-mcp](https://github.com/hanzili/comet-mcp).

**better stealth** - cdp gets detected by some sites. thinking about anti-detection browsers in docker with os-level access to look more like a real user.

**more domain knowledge** - expand built-in strategies for popular sites. 
