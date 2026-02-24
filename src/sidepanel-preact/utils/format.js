// Markdown formatting utilities

export function formatMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  let result = [];
  let inList = false;
  let listType = null;

  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);

    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${formatInline(ulMatch[1])}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${formatInline(olMatch[2])}</li>`);
    } else {
      if (inList) {
        result.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      if (line.trim() === '') {
        result.push('<br>');
      } else {
        result.push(`<p>${formatInline(line)}</p>`);
      }
    }
  }
  if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
  return result.join('');
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Get action description for tool execution
export function getActionDescription(toolName, input) {
  if (!input) return toolName;

  switch (toolName) {
    case 'computer': {
      const action = input.action;
      if (action === 'screenshot') return 'Taking screenshot';
      if (action === 'left_click') {
        if (input.ref) return `Clicking ${input.ref}`;
        if (input.coordinate) return `Clicking at (${input.coordinate[0]}, ${input.coordinate[1]})`;
        return 'Clicking';
      }
      if (action === 'right_click') return 'Right-clicking';
      if (action === 'double_click') return 'Double-clicking';
      if (action === 'type') return `Typing "${(input.text || '').substring(0, 30)}${input.text?.length > 30 ? '...' : ''}"`;
      if (action === 'key') return `Pressing ${input.text}`;
      if (action === 'scroll') return `Scrolling ${input.scroll_direction}`;
      if (action === 'mouse_move') return 'Moving mouse';
      if (action === 'drag') return 'Dragging';
      return `Computer: ${action}`;
    }
    case 'navigate':
      if (input.action === 'back') return 'Going back';
      if (input.action === 'forward') return 'Going forward';
      return `Navigating to ${(input.url || '').substring(0, 50)}...`;
    case 'read_page':
      return 'Reading page structure';
    case 'get_page_text':
      return 'Extracting page text';
    case 'find':
      return `Finding "${input.query}"`;
    case 'form_input':
      return `Filling form field ${input.ref}`;
    case 'file_upload':
      return 'Uploading file';
    case 'javascript_tool':
      return 'Running JavaScript';
    case 'tabs_context':
      return 'Getting tab context';
    case 'tabs_create':
      return 'Creating new tab';
    case 'tabs_close':
      return 'Closing tab';
    case 'read_console_messages':
      return 'Reading console';
    case 'read_network_requests':
      return 'Reading network requests';
    default:
      return toolName;
  }
}

// Get tool icon SVG
export function getToolIcon(toolName) {
  const icons = {
    computer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    navigate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    read_page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    get_page_text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
    form_input: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    javascript_tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>',
    tabs_context: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
    tabs_create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>',
    tabs_close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  };
  return icons[toolName] || icons.default;
}

// Format step result for display
export function formatStepResult(result) {
  if (!result) return '';
  if (typeof result === 'string') {
    if (result.length > 100) {
      return result.substring(0, 100) + '...';
    }
    return result;
  }
  if (typeof result === 'object') {
    if (result.error) return `Error: ${result.error}`;
    if (result.output) {
      const output = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
      return output.length > 100 ? output.substring(0, 100) + '...' : output;
    }
  }
  return '';
}
