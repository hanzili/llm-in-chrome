/**
 * Domain-specific skills and best practices for common websites.
 * These are injected into the agent's context when visiting matching domains.
 */

export const DOMAIN_SKILLS = [
  {
    domain: 'mail.google.com',
    skill: `Gmail best practices:
- To open an email, click directly on the email subject/preview text, NOT the checkbox or star
- Use keyboard shortcuts: 'c' to compose, 'r' to reply, 'a' to reply all, 'f' to forward, 'e' to archive
- To search, use the search bar at the top with operators like 'from:', 'to:', 'subject:', 'is:unread'
- Reading pane may be on the right or below depending on user settings - check which layout is active
- Verification codes are often in emails from 'noreply@' addresses with subjects containing 'verification', 'code', or 'confirm'`
  },
  {
    domain: 'docs.google.com',
    skill: `Google Docs best practices:
- This is a canvas-based application - use screenshots to see content, read_page may not capture all text
- Use keyboard shortcuts: Cmd/Ctrl+B for bold, Cmd/Ctrl+I for italic, Cmd/Ctrl+K for links
- To navigate, use Cmd/Ctrl+F to find text, then click on the result
- For editing, click to place cursor then type - triple-click to select a paragraph
- Access menus via the menu bar at the top (File, Edit, View, Insert, Format, etc.)`
  },
  {
    domain: 'sheets.google.com',
    skill: `Google Sheets best practices:
- Click on cells to select them, double-click to edit cell content
- Use Tab to move right, Enter to move down, arrow keys to navigate
- Formulas start with '=' - e.g., =SUM(A1:A10), =VLOOKUP(), =IF()
- Use Cmd/Ctrl+C and Cmd/Ctrl+V for copy/paste
- Select ranges by clicking and dragging, or Shift+click for range selection`
  },
  {
    domain: 'github.com',
    skill: `GitHub best practices:
- Repository navigation: Code tab for files, Issues for bug tracking, Pull requests for code review
- To view a file, click on the filename in the file tree
- Use 't' to open file finder, 'l' to jump to a line
- In PRs: 'Files changed' tab shows diffs, 'Conversation' tab shows comments
- Use the search bar with qualifiers: 'is:open is:pr', 'is:issue label:bug'`
  },
  {
    domain: 'linkedin.com',
    skill: `LinkedIn best practices:
- Job search: Use the Jobs tab, filter by location, experience level, date posted
- To apply: Click 'Easy Apply' button if available, or 'Apply' to go to external site
- Profile sections are collapsible - click 'Show all' to expand
- Connection requests and messages are in the 'My Network' and 'Messaging' tabs
- Use search filters to narrow down people, companies, or jobs`
  },
  {
    domain: 'indeed.com',
    skill: `Indeed best practices:
- Search for jobs using the 'What' and 'Where' fields at the top
- Filter results by date posted, salary, job type, experience level
- Click job title to view full description
- 'Apply now' or 'Apply on company site' buttons are typically on the right panel
- Sign in to save jobs and track applications`
  },
  {
    domain: 'calendar.google.com',
    skill: `Google Calendar best practices:
- Click on a time slot to create a new event
- Drag events to reschedule them
- Click on an event to view details, edit, or delete
- Use the mini calendar on the left to navigate to different dates
- Keyboard: 'c' to create event, 't' to go to today, arrow keys to navigate`
  },
  {
    domain: 'drive.google.com',
    skill: `Google Drive best practices:
- Double-click files to open them, single-click to select
- Right-click for context menu (download, share, rename, etc.)
- Use the search bar to find files by name or content
- Create new items with the '+ New' button on the left
- Drag and drop to move files between folders`
  },
  {
    domain: 'notion.so',
    skill: `Notion best practices:
- Click to place cursor, type '/' to open command menu
- Drag blocks using the ⋮⋮ handle on the left
- Use sidebar for navigation between pages
- Toggle blocks expand/collapse on click
- Databases can be viewed as table, board, calendar, etc.`
  },
  {
    domain: 'figma.com',
    skill: `Figma best practices:
- This is a canvas-based design tool - always use screenshots to see content
- Use 'V' for select tool, 'R' for rectangle, 'T' for text
- Zoom with Cmd/Ctrl+scroll or Cmd/Ctrl++ and Cmd/Ctrl+-
- Navigate frames in the left sidebar
- Right-click for context menus and additional options`
  },
  {
    domain: 'slack.com',
    skill: `Slack best practices:
- Channels listed in left sidebar - click to switch
- Cmd/Ctrl+K to quickly switch channels/DMs
- @ mentions notify users, # references channels
- Thread replies keep conversations organized
- Use the search bar to find messages, files, and people`
  },
  {
    domain: 'twitter.com',
    skill: `X/Twitter best practices:
- Compose new post with the 'Post' or compose button
- Scroll to load more content
- Click on a post to view full thread and replies
- Like, repost, reply buttons are below each post
- Use search with operators: 'from:user', 'to:user', 'filter:media'`
  },
  {
    domain: 'x.com',
    skill: `X/Twitter best practices:
- Compose new post with the 'Post' or compose button
- Scroll to load more content
- Click on a post to view full thread and replies
- Like, repost, reply buttons are below each post
- Use search with operators: 'from:user', 'to:user', 'filter:media'`
  },
  {
    domain: 'amazon.com',
    skill: `Amazon best practices:
- Use the search bar at the top for product search
- Filter results using the left sidebar (price, ratings, Prime, etc.)
- Click 'Add to Cart' or 'Buy Now' to purchase
- Product details and reviews are on the product page
- Check seller information and shipping times before purchasing`
  },
  {
    domain: 'deckathon-concordia.com',
    skill: `Deckathon Hackathon Site:

## Dropout Process
- Dropping out requires completing prerequisite tasks first (e.g., dropping classes, paying balances)
- If you see "Not Yet Eligible" or similar warnings, you MUST complete the required steps first
- Check if buttons are disabled before clicking - don't assume buttons will work
- Look for checklists or status indicators showing what needs to be done
- Complete all required tasks before attempting the final dropout action

## Anti-Bot Challenges on This Site:

This site has multiple anti-bot mechanisms. Here's how to handle each:

### 1. Mouse Tracking (Login/Registration)
- Login and registration pages track mouse movements (count and total distance)
- This is handled automatically - our clicks include simulated mouse movement
- No special action needed

### 1b. Dropout Page Activity Verification
The dropout form has strict activity thresholds you MUST meet before submitting:

**"Demonstrate activity" requires:**
- 75+ mouse movements (each 5-500px distance)
- 20+ direction changes (sharp turns >45°)

**"Navigate erratically" requires:**
- 15+ total keystrokes
- 8+ unique keys pressed

**EXACT FLOW TO ENABLE NEXT BUTTON:**
1. Select a dropout reason FIRST (required before countdown starts)
2. Use javascript_tool to simulate activity:
\`\`\`javascript
// Simulate mouse movements with direction changes
for (let i = 0; i < 100; i++) {
  const angle = (i % 4) * 90; // Change direction every move
  const x = 400 + Math.cos(angle * Math.PI/180) * 50;
  const y = 300 + Math.sin(angle * Math.PI/180) * 50;
  window.dispatchEvent(new MouseEvent('mousemove', {clientX: x, clientY: y, bubbles: true}));
}
// Simulate keystrokes with unique keys
'abcdefghijklmnop'.split('').forEach(key => {
  window.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
});
\`\`\`
3. Once ALL thresholds are met AND reason is selected, a 10-second countdown starts automatically
4. **CRITICAL: You MUST continue showing activity DURING the countdown** - dispatch at least one mouse/keyboard event during this time
5. Only after countdown completes WITH activity during it, the Next button enables

**Why this matters:** The countdown sets a flag, but a SEPARATE flag for "activity during countdown" must also be true. Without activity during the 10 seconds, the button stays disabled even after countdown.

### 1c. Dropout Popup Challenges
After activity verification, 8 random popup modals appear. You must solve ALL of them.

**Quick bypass**: \`localStorage.setItem("skip_popups", "true")\` skips all popups.

**Manual solutions for each popup type:**

| Challenge | Solution |
|-----------|----------|
| **ssn-input** | Type "nice try" (or any 9 digits) |
| **robot-check** | Click the "Verify" button (don't answer the philosophical question) |
| **wait-timer** | Click Start, wait for progress bar to reach 100%, then Submit |
| **button-mash** | Press 5+ different keys while focused on the popup |
| **dodgy-close** | Click the moving X button 3 times, then click it again to close |
| **newsletter** | Type "unsubscribe" in the input field |
| **terms-conditions** | Scroll to bottom of text, check the accept box, then Submit |
| **email-verify** | Type "VERIFY" (uppercase) in the input |
| **browser-update** | Check the acknowledge checkbox, then click Update |
| **country-select** | Select a country, then state, then city from dropdowns |
| **iframe-survey** | Check the checkbox inside the iframe |
| **overlapping-buttons** | One button is correct (random) - try each until one works |

### 2. Bouncing Slider Modal ("Confirm Payment" / "결제 확인")
- A modal appears that BOUNCES around the screen
- Normal clicks won't work because the modal moves before the click lands
- **Solution**: Use javascript_tool to dispatch mouse events directly:

\`\`\`javascript
javascript_tool with action='javascript_exec' and text:

const handle = document.querySelector('.slider-handle');
if (handle) {
  const rect = handle.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + rect.height / 2;

  // Mousedown stops the bouncing
  handle.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, clientX: startX, clientY: startY}));

  // Drag to the right
  setTimeout(() => {
    document.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, cancelable: true, clientX: startX + 300, clientY: startY}));
    setTimeout(() => {
      document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, clientX: startX + 300, clientY: startY}));
    }, 100);
  }, 50);

  'Slider solved - mousedown stops bouncing, then drag completes it';
}
\`\`\`

### 3. Number Sequence CAPTCHA ("Click numbers in order: X → Y → Z")
- Read the sequence from the page (e.g., "8 → 3 → 7")
- Click the buttons in that exact order
- Buttons are labeled 1-9, just click them in the specified sequence

### 4. Image CAPTCHAs

**On /dropout page ONLY - use solve_captcha tool:**
- Just call: solve_captcha(tabId)
- The tool brute forces correct images and calls the dropout API directly
- Wait for page to reload after success
- If 401 error: Session expired - log in again
- If entropy error: Complete more activity on the form first

**On OTHER pages (payment, etc.) - solve visually:**
- solve_captcha does NOT work outside /dropout (it would break the CAPTCHA)
- Take a screenshot to see the images clearly
- Read the category carefully (e.g., "Select all logos", "Select the sun")
- Click the correct images based on what you see
- **BEFORE clicking Verify**: Take another screenshot to confirm your selections look correct
- Check that selected images have a visible border/highlight
- Only then click Verify

**"Select the sun" hint:** "Sun" might be a person's name - look for images of people/humans
**"Select logos" hint:** Look for Deck logo (overlapping rectangles) or Concordia logo

### 5. Form Token Expiration
- Form tokens expire quickly
- Complete forms promptly after they load
- If you get "Invalid or expired form token", refresh and try again faster

### 5b. Session Expiration
- Sessions can expire unexpectedly - you may find yourself back at the login page
- If this happens, log in again with: netname: hanzili5, password: 123456

### 6. Popup Windows (Payment, Verification, etc.)
- Some actions open a NEW POPUP WINDOW instead of showing content inline
- Signs a popup opened: "Complete Payment in Popup Window", "A secure payment window has been opened", loading spinner that doesn't resolve
- **CRITICAL**: When you see these signs, you MUST:
  1. Use \`tabs_context\` tool to list all open tabs
  2. Find the new popup tab (usually the most recent tab, or one with payment/verification URL)
  3. Switch to that tab by using its tabId in subsequent tool calls
  4. Complete the action in the popup
  5. Use \`tabs_close\` tool to close the popup when done, or if session expires
- **DO NOT** navigate away from the current page or go to a different URL when waiting for a popup
- **DO NOT** assume a popup closed just because a button click said "Close Window" - use \`tabs_close\` to actually close it
- **DO NOT** assume the popup failed just because the main page shows a waiting message

## General Debugging Approach

If you encounter a new anti-bot challenge:
1. Use javascript_tool to fetch and inspect the site's JS:
   \`fetch('URL').then(r => r.text()).then(code => { /* analyze */ })\`
2. Look for event listeners, timers, or tracking mechanisms
3. Craft a solution using javascript_tool to dispatch events or modify state directly`
  },
];

/**
 * Get domain skills for a given URL
 * @param {string} url - The URL to check
 * @param {Array} userSkills - Optional array of user-defined skills [{ domain, skill }]
 * @returns {Array} - Array of matching domain skills (user skills override built-in)
 */
export function getDomainSkills(url, userSkills = []) {
  if (!url) return [];

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    const matchSkill = (skill) => {
      return hostname === skill.domain || hostname.endsWith('.' + skill.domain);
    };

    // Get matching built-in skills
    const builtInMatches = DOMAIN_SKILLS.filter(matchSkill);

    // Get matching user skills
    const userMatches = userSkills.filter(matchSkill);

    // Merge: user skills override built-in for same domain
    const result = [...builtInMatches];
    for (const userSkill of userMatches) {
      const existingIndex = result.findIndex(s => s.domain === userSkill.domain);
      if (existingIndex >= 0) {
        // Override built-in with user skill
        result[existingIndex] = userSkill;
      } else {
        result.push(userSkill);
      }
    }

    return result;
  } catch {
    return [];
  }
}
