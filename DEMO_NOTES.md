# Deckathon Demo Notes

## Our Approach: Adaptive AI Agent with Technique Mixing

We built an AI browser agent that combines multiple techniques based on the challenge type, rather than a one-size-fits-all approach.

---

## Techniques by Challenge Type

### 1. Mouse Tracking Detection
**Challenge**: Site tracks `mouse_movement_count` and `mouse_total_distance`
**Technique**: Simulated human-like mouse movements
- Before every click/scroll, we generate 10-20 `mouseMoved` events along a curved path
- Uses ease-out quadratic curve + small jitter for realism
- Builds up realistic movement count and distance automatically

### 2. Bouncing Slider Modal
**Challenge**: Modal bounces around screen at 60fps, impossible to click normally
**Technique**: JavaScript injection via `javascript_tool`
- Agent inspects the page, recognizes the bouncing modal
- Uses `javascript_tool` to dispatch MouseEvents directly (instant, no timing issues)
- Key insight: `mousedown` on the handle stops the bouncing, then drag completes it

### 3. Image CAPTCHAs

**"pretty_faces"** - Subjective, can't be solved visually
- **Technique**: API brute force via `solve_captcha` tool
- Intercepts challenge data via Chrome DevTools Protocol
- Tries all image combinations until correct answer found
- Auto-clicks correct images and submits

**"select the sun"** - Wordplay trick
- **Technique**: Domain knowledge injection
- "Sun" is a person's name, not the celestial object
- Agent knows to select the human face, not the yellow sun

**"select logos"** - Visual recognition
- **Technique**: Standard visual solving
- Agent uses screenshots to identify logo images

### 4. Number Sequence CAPTCHA
**Challenge**: "Click numbers in order: 8 → 3 → 7"
**Technique**: Read and execute
- Agent reads the sequence from accessibility tree
- Clicks buttons in specified order

### 5. Form Token Expiration
**Challenge**: Tokens expire quickly
**Technique**: Speed + retry logic
- Complete forms promptly after loading
- Refresh and retry if token expires

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude API (LLM)                        │
│                   Reasoning & Decision Making                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    General Tools Layer                       │
│  ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌─────────────────┐  │
│  │  click  │ │ scroll  │ │screenshot │ │ javascript_tool │  │
│  └─────────┘ └─────────┘ └───────────┘ └─────────────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌─────────────────┐  │
│  │read_page│ │  type   │ │  navigate │ │  solve_captcha  │  │
│  └─────────┘ └─────────┘ └───────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Domain Skills Layer                        │
│         Site-specific knowledge & technique hints            │
│    (CAPTCHA tricks, anti-bot patterns, debugging tips)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Chrome Extension (Service Worker)             │
│     Mouse simulation, CDP integration, tool execution        │
└─────────────────────────────────────────────────────────────┘
```

---

## Future Potential / Where This Could Go

### 1. Self-Debugging Agent
The agent already has `javascript_tool` to execute arbitrary JS. Next step:
- Agent fetches and analyzes site's JavaScript files
- Understands anti-bot mechanisms by reading source code
- Crafts solutions dynamically without pre-programmed knowledge

### 2. Learning from Failures
- When a technique fails, agent tries alternative approaches
- Successful solutions get added to domain skills
- System improves over time

### 3. Cross-Site Pattern Recognition
- Anti-bot techniques are often similar across sites
- Agent learns patterns: "bouncing element → use JS injection"
- Knowledge transfers to new sites automatically

### 4. Collaborative Intelligence
- Multiple agents share discovered techniques
- Crowdsourced anti-bot solutions
- Constantly evolving capability

---

## Demo Talking Points

### Opening
"We built an AI browser agent that adapts its approach based on the challenge type, rather than using a single technique for everything."

### Show the Variety
- "For mouse tracking, we simulate human-like movement curves"
- "For the bouncing slider, the agent uses JavaScript injection because normal clicks can't keep up"
- "For the pretty_faces CAPTCHA, we brute force via API since it's subjective"
- "For the sun CAPTCHA, we encoded the wordplay trick as domain knowledge"

### Highlight the Flexibility
"The agent has general tools - click, scroll, screenshot, JavaScript execution. Domain skills guide it on WHICH technique to use for each challenge."

### Future Vision
"The agent can already inspect source code via `javascript_tool`. The next step is having it debug new challenges autonomously - fetch the JS, understand the mechanism, craft a solution. The system grows by learning from each new challenge it encounters."

### If Something Fails
"Even when it fails, you can see the agent reasoning about the problem. That debugging capability is the foundation for self-improvement."

---

## Known Limitations

1. **Fullscreen + New Tab**: Chrome crashes when new tabs open in fullscreen mode (Chrome bug, not our code)
2. **Speed vs Reliability**: More complex reasoning = slower execution
3. **Non-deterministic**: AI decisions can vary between runs
4. **Token Costs**: Each reasoning step costs API tokens

---

## Quick Commands for Demo

```bash
# Start Chrome with debugging (for chrome-devtools MCP)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Reload extension after changes
# Go to chrome://extensions → Click refresh icon on the extension
```
