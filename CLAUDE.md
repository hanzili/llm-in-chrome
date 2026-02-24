## Browser Automation CLI

This project includes a CLI tool for browser automation. It runs a 3-agent pipeline (planning agent → explorer agent → browser agent) that controls a Chrome extension via WebSocket relay.

### Usage

```bash
# Start a task (runs in background, monitors until complete)
node mcp-server/dist/cli.js start "task description" --url <url> --context "extra context"

# Check status of all sessions or a specific one
node mcp-server/dist/cli.js status
node mcp-server/dist/cli.js status <session_id>

# Watch logs in real-time
node mcp-server/dist/cli.js logs <session_id> --follow

# Send a follow-up message to a running/completed session
node mcp-server/dist/cli.js message <session_id> "do something else"

# Stop a session (--remove to also delete session files)
node mcp-server/dist/cli.js stop <session_id> --remove
```

### How it works

1. **Planning agent** (Sonnet) — checks site knowledge, decides if exploration is needed
2. **Explorer agent** — learns unknown site workflows before executing (auto-triggered)
3. **Browser agent** — controls the browser via the Chrome extension to complete the task

The CLI connects to the WebSocket relay at `ws://localhost:7862`. The Chrome extension must be loaded and running. Session state is stored in `~/.llm-in-chrome/sessions/`.

### Tips

- Run `start` commands in the background since they block until completion
- Use `--context` to pass tone guidelines, form data, or other info the agent needs
- The `--url` flag sets the starting page — without it, the agent navigates based on the task description
- Build the CLI with `cd mcp-server && npm run build` if source changes are made
