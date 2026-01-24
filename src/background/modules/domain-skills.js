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
];

/**
 * Get domain skills for a given URL
 * @param {string} url - The URL to check
 * @returns {Array} - Array of matching domain skills
 */
export function getDomainSkills(url) {
  if (!url) return [];

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return DOMAIN_SKILLS.filter(skill => {
      // Check if the hostname ends with or equals the skill domain
      return hostname === skill.domain || hostname.endsWith('.' + skill.domain);
    });
  } catch {
    return [];
  }
}
