# Job Apply Agent

AI-powered Chrome extension for automated job application form filling.

## Architecture

Based on reverse engineering the Claude in Chrome extension:
- **Accessibility Tree**: Semantic representation of page elements using a11y roles
- **Ref ID System**: Stable element identifiers using WeakRef for reliable targeting
- **Claude API**: Uses tool calling for read → act → verify loop

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `job-apply-extension` folder

## Setup

1. Make sure ccproxy is running (`http://127.0.0.1:8000`)
2. Click the extension icon
3. Go to "Settings" tab
4. Verify the CCProxy URL is correct (default: `http://127.0.0.1:8000/claude/v1/messages`)
5. Save settings

## Usage

1. Navigate to a job application page
2. Click the extension icon
3. Fill in your profile info (saved for future use)
4. Click "Start Filling Application"
5. Watch the agent fill out the form

## Project Structure

```
job-apply-extension/
├── manifest.json                    # Chrome extension config
├── src/
│   ├── content/
│   │   ├── accessibility-tree.js   # A11y tree generator (key innovation)
│   │   └── content.js              # Bridge to service worker
│   ├── background/
│   │   └── service-worker.js       # Claude API + orchestration
│   ├── tools/
│   │   └── definitions.js          # Tool schemas for Claude
│   └── popup/
│       ├── popup.html              # Extension UI
│       └── popup.js                # UI logic
```

## How It Works

1. **read_page**: Generates accessibility tree of the page
   ```
   textbox "Email" [ref_1] required
   textbox "Password" [ref_2]
   button "Submit" [ref_3]
   ```

2. **form_input**: Fills fields by ref ID
   ```js
   form_input(ref="ref_1", value="user@example.com")
   ```

3. **click**: Clicks elements by ref ID

4. **Agent Loop**: Claude sees the tree → decides action → executes → verifies

## Development

The accessibility tree approach is fundamentally different from:
- **Vision-based** (screenshots + coordinate clicks) - more reliable
- **DOM selectors** (CSS/XPath) - more semantic and stable
- **Record/replay** - adapts to different page layouts

## TODO

- [ ] Add resume/cover letter upload support
- [ ] Handle CAPTCHA detection (pause and alert user)
- [ ] Support multi-page applications
- [ ] Add job tracking/history
