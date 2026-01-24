# Browser Agent: Dual-Mode Architecture Spec

## Overview

Add support for two browser backends:
1. **Local Chrome** (default) - Current CDP-based implementation
2. **Camoufox Docker** - Anti-detection Firefox with system-level clicks

This allows users to switch between fast local automation and stealth mode for anti-bot protected sites.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Chrome Extension                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Sidepanel UI                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Mode: [🔵 Local Chrome] [🦊 Camoufox Docker]       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  Model selector, chat messages, input                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                    ┌─────────┴─────────┐                        │
│                    ▼                   ▼                        │
│            ┌─────────────┐     ┌─────────────┐                  │
│            │   Chrome    │     │  Camoufox   │                  │
│            │   Backend   │     │   Backend   │                  │
│            └──────┬──────┘     └──────┬──────┘                  │
└───────────────────│───────────────────│─────────────────────────┘
                    │                   │
                    ▼                   ▼
            Chrome DevTools      Docker Container
            Protocol (CDP)       HTTP API :8080
                                 VNC View :5900
```

---

## Mode Comparison

| Feature | Local Chrome | Camoufox Docker |
|---------|--------------|-----------------|
| Speed | Fast | Slower (network + container) |
| Setup | None | Docker required |
| `isTrusted` events | No (CDP synthetic) | Yes (PyAutoGUI) |
| Fingerprint spoofing | No | Yes (C++ level) |
| Bot detection bypass | Low | High |
| User can browse | Same browser | Isolated container |
| View automation | Same tab | VNC tab |

---

## File Structure

### New Files
```
src/background/modules/
├── chrome-backend.js      # Extracted CDP logic
├── camoufox-backend.js    # New HTTP client for Docker
└── browser-backend.js     # Abstraction layer + routing
```

### Modified Files
```
src/background/service-worker.js   # Use browser-backend abstraction
src/sidepanel/sidepanel.html       # Add mode selector UI
src/sidepanel/sidepanel.js         # Mode switching logic
```

---

## API Contracts

### Browser Backend Interface

Both backends must implement this interface:

```typescript
interface BrowserBackend {
  // Connection
  connect(tabId?: number): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Screenshots
  screenshot(): Promise<string>;  // base64 PNG

  // Actions
  click(x: number, y: number): Promise<void>;
  doubleClick(x: number, y: number): Promise<void>;
  type(text: string): Promise<void>;
  keypress(keys: string[]): Promise<void>;
  scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void>;

  // Navigation
  navigate(url: string): Promise<void>;

  // Page info
  getPageText(): Promise<string>;
  getInteractiveElements(): Promise<Element[]>;
  getViewportInfo(): Promise<ViewportInfo>;

  // File upload
  uploadFile(selector: string, filePath: string): Promise<void>;
}
```

### Camoufox HTTP API

Docker container exposes these endpoints:

```
POST /                    # Execute action
GET  /screenshot/browser  # Viewport screenshot (PNG)
GET  /screenshot/desktop  # Full desktop screenshot (PNG)
GET  /state              # Browser state (JSON)
GET  /health             # Health check
```

Action payloads:
```javascript
// Click
{ "action": "playwright_click", "x": 100, "y": 200 }

// Type
{ "action": "playwright_type", "text": "hello" }

// Key press
{ "action": "playwright_key", "key": "Enter" }

// Scroll
{ "action": "playwright_scroll", "delta_x": 0, "delta_y": 300, "x": 500, "y": 400 }

// Navigate
{ "action": "goto", "url": "https://example.com" }

// Get elements
{ "action": "get_interactive_elements" }

// File upload
{ "action": "set_file", "selector": "input[type=file]", "file_path": "/uploads/resume.pdf" }
```

---

## UI Changes

### Mode Selector (Header)

Add to sidepanel header, between model selector and action buttons:

```html
<div class="mode-selector" id="mode-selector">
  <button class="mode-btn active" data-mode="chrome" title="Local Chrome">
    <svg><!-- Chrome icon --></svg>
    <span>Chrome</span>
  </button>
  <button class="mode-btn" data-mode="camoufox" title="Camoufox (Anti-Bot)">
    <svg><!-- Fox icon --></svg>
    <span>Stealth</span>
  </button>
</div>
```

### Styles

```css
.mode-selector {
  display: flex;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 2px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
}

.mode-btn.active {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.mode-btn svg {
  width: 16px;
  height: 16px;
}
```

### Status Indicator

Show connection status for Camoufox mode:

```html
<div class="camoufox-status" id="camoufox-status">
  <span class="status-dot"></span>
  <span class="status-text">Docker not running</span>
  <button class="open-vnc-btn">Open VNC</button>
</div>
```

---

## Implementation Steps

### Phase 1: Extract Chrome Backend
1. [ ] Create `src/background/modules/chrome-backend.js`
2. [ ] Move CDP logic from service-worker.js
3. [ ] Export functions matching BrowserBackend interface
4. [ ] Update service-worker.js to import from chrome-backend

### Phase 2: Create Camoufox Backend
1. [ ] Create `src/background/modules/camoufox-backend.js`
2. [ ] Implement HTTP client for Docker API
3. [ ] Implement all BrowserBackend interface methods
4. [ ] Add health check and connection management

### Phase 3: Create Abstraction Layer
1. [ ] Create `src/background/modules/browser-backend.js`
2. [ ] Implement mode switching logic
3. [ ] Route calls to correct backend based on mode
4. [ ] Handle mode persistence in chrome.storage

### Phase 4: Update Service Worker
1. [ ] Replace direct CDP calls with browser-backend calls
2. [ ] Update tool execution to use abstraction
3. [ ] Handle mode-specific behaviors (VNC tab, etc.)

### Phase 5: Update UI
1. [ ] Add mode selector to sidepanel.html
2. [ ] Add mode switching logic to sidepanel.js
3. [ ] Add Camoufox status indicator
4. [ ] Add "Open VNC" button
5. [ ] Style mode selector for light/dark mode

### Phase 6: Testing & Polish
1. [ ] Test Chrome mode (regression)
2. [ ] Test Camoufox mode with Docker
3. [ ] Test mode switching
4. [ ] Add error handling for Docker not running
5. [ ] Add setup instructions in UI

---

## Docker Setup (User Instructions)

When user selects Camoufox mode for the first time:

```
┌─────────────────────────────────────────────────────────┐
│  🦊 Camoufox Mode Setup                                 │
│                                                         │
│  This mode requires Docker. Run these commands:         │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ cd /path/to/auto-apply/docker-browser-stealthy   │ │
│  │ docker compose up                                 │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Then click "Check Connection" below.                   │
│                                                         │
│  [Check Connection]  [Open VNC Tab]  [Cancel]          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## VNC Tab Behavior

When Camoufox mode is active:

1. **Auto-open VNC tab** on first task (or when user clicks "Open VNC")
2. **Tab URL**: `http://localhost:5900` (noVNC web client)
3. **Tab position**: Move to left of sidepanel if possible
4. **Tab group**: Group VNC tab with the original tab

```javascript
// Open VNC tab
async function openVncTab() {
  const vncTab = await chrome.tabs.create({
    url: 'http://localhost:5900',
    active: false
  });

  // Try to group with session tabs
  if (sessionTabGroupId) {
    await chrome.tabs.group({
      tabIds: [vncTab.id],
      groupId: sessionTabGroupId
    });
  }
}
```

---

## Error Handling

### Docker Not Running
```javascript
async function checkCamoufoxConnection() {
  try {
    const res = await fetch('http://localhost:8080/health', {
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

Show in UI:
```
⚠️ Camoufox container not running
   Run: docker compose up -d
   [Retry] [Switch to Chrome mode]
```

### Action Timeout
```javascript
async function executeWithTimeout(action, params, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await executeCamoufoxAction(action, params, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## Storage Schema

```javascript
// chrome.storage.local
{
  // Existing...
  "apiBaseUrl": "...",
  "model": "...",

  // New
  "browserMode": "chrome" | "camoufox",
  "camoufoxApiUrl": "http://localhost:8080",
  "camoufoxVncUrl": "http://localhost:5900",
  "autoOpenVnc": true
}
```

---

## Future Enhancements

1. **Auto-detect when to use Camoufox**
   - If bot detection encountered, suggest switching modes

2. **Embedded VNC viewer**
   - Use noVNC library directly in sidepanel
   - Split view: VNC on top, chat on bottom

3. **Multiple Camoufox containers**
   - For parallel automation
   - Load balancing

4. **Cloud Camoufox option**
   - Remote Docker container
   - For users who can't run Docker locally

---

## References

- Camoufox: https://github.com/nicxlau/camoufox
- noVNC: https://novnc.com/
- Chrome Extension Messaging: https://developer.chrome.com/docs/extensions/mv3/messaging/
- Docker Browser Container: `/Users/apple/Dev/auto-apply/docker-browser-stealthy/`
