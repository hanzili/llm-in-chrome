# Structured Logging Format

Clean, non-redundant logs for debugging agent behavior.

## Log Types

### AI_RESPONSE - AI's Reasoning (Essential)

```json
{
  "type": "AI_RESPONSE",
  "message": "Turn 3: AI reasoning and tool choices",
  "data": {
    "stopReason": "tool_use",
    "textContent": "I can see the LinkedIn feed. I need to scroll down to find the Experience section.",
    "toolCalls": [
      {
        "name": "computer",
        "input": { "action": "scroll", "scroll_direction": "down" }
      }
    ]
  }
}
```

### TOOL_RESULT - What Tools Returned (Essential)

```json
{
  "type": "TOOL_RESULT",
  "message": "Result from computer",
  "data": {
    "tool": "computer",
    "success": true,
    "resultType": "screenshot",
    "screenshot": "screenshot_3.png",
    "textResult": null,
    "error": null
  }
}
```

For text results:
```json
{
  "type": "TOOL_RESULT",
  "data": {
    "tool": "read_page",
    "success": true,
    "resultType": "string",
    "textResult": "heading \"Profile\" [ref_1]\nbutton \"Edit\" [ref_2]..."
  }
}
```

### API - Request Summary (One per call)

```json
{
  "type": "API",
  "message": "#1 claude-sonnet-4 → tool_use",
  "data": {
    "model": "claude-sonnet-4",
    "messages": 5,
    "stopReason": "tool_use",
    "tokens": { "input_tokens": 12000, "output_tokens": 500 },
    "duration": "2500ms"
  }
}
```

### CLICK - Click Coordinates

```json
{
  "type": "CLICK",
  "message": "ref_43 → (166, 226)",
  "data": { "x": 71, "y": 188, "width": 190, "height": 75, "centerX": 166, "centerY": 225 }
}
```

### COMPACT - When Compaction Happens

```json
{
  "type": "COMPACT",
  "message": "15 msgs → 5 msgs",
  "data": { "beforeTokens": 180000, "afterTokens": 45000, "reduction": "75%" }
}
```

### TASK - Task Start/End

```json
{
  "type": "TASK",
  "message": "Task complete - Total API calls: 8",
  "data": { "totalApiCalls": 8, "status": "success", "turns": 8 }
}
```

---

## Debugging

### Why did AI make this decision?
```bash
# Check AI's reasoning for each turn
cat log.json | jq '.debug[] | select(.type=="AI_RESPONSE") | {msg: .message, text: .data | fromjson | .textContent[:200]}'
```

### What did the tool return?
```bash
# Check tool results
cat log.json | jq '.debug[] | select(.type=="TOOL_RESULT") | .data | fromjson | {tool, success, resultType, error}'
```

### API timing and token usage?
```bash
# Check API performance
cat log.json | jq '.debug[] | select(.type=="API") | .data | fromjson | {model, messages, duration, tokens}'
```

---

## Log Files

- `~/Downloads/browser-agent/[timestamp]/log.json`
- `~/Downloads/browser-agent/[timestamp]/screenshot_N.png`
