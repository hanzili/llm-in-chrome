# llm in chrome

open-source, llm-agnostic browser automation. basically claude in chrome but you can use any model.

## demo

[![demo video](https://img.youtube.com/vi/cal0k351Rwo/maxresdefault.jpg)](https://youtu.be/cal0k351Rwo)

the agent successfully completed the deckathon dropout challenge from concordia. watch it solve captchas and navigate through the anti-bot protections. 

## what is this

you know how claude in chrome can browse the web and click stuff for you? this does that but works with claude, gpt, gemini, or literally any llm you want. it's open source so you can run it yourself.

tell it what to do in plain english and it navigates websites, fills forms, extracts data, whatever. works across multiple tabs too.

## why i built this

proprietary tools lock you into one provider. wanted something open that lets you choose your own model and see how it actually works under the hood.

also wanted to experiment with different approaches and configuration. some sites work better with screenshots, some with accessibility trees, some need javascript injection. built a system that knows which approach to use for each site.

## how it works

the extension gives the llm a set of tools:

**computer** - take screenshots, click elements, type text, scroll

**navigate** - control url navigation

**read_page** - extract page structure via accessibility tree

**javascript_tool** - execute javascript in page context

**solve_captcha** - automated captcha solving (brute force)

**tabs_context** - manage multiple tabs

plus it has domain knowledge. like it knows google docs is canvas-based so it should use screenshots instead of trying to read the dom. github works better with accessibility tree. linkedin needs specific patterns to avoid bot detection.

we tested this on concordia's deckathon dropout challenge which has heavy anti-bot protections and captchas. the agent successfully navigated through everything autonomously.


## what's next

**more user control** - right now domain skills are hardcoded. want to let people customize system prompts, inject custom scripts, and integrate chrome devtools for more device-side control.

**mcp integration** - could work both ways. as a client it uses any mcp tool to help with tasks. as a server other clients just send it a task and it handles everything autonomously instead of the client orchestrating each step. already been experimenting with this idea in [comet-mcp](https://github.com/hanzili/comet-mcp).

**better stealth** - cdp gets detected by some sites. thinking about anti-detection browsers in docker with os-level access to look more like a real user.

**more domain knowledge** - expand built-in strategies for popular sites. 

---

repo: https://github.com/hanzili/llm-in-chrome
