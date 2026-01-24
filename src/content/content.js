/**
 * Content Script
 *
 * Bridges the accessibility tree and tool execution with the background service worker.
 */

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'PING':
      sendResponse({ success: true });
      return false;

    case 'READ_PAGE':
      handleReadPage(payload, sendResponse);
      return true; // async response

    case 'FORM_INPUT':
      handleFormInput(payload, sendResponse);
      return true;

    case 'GET_ELEMENT_RECT':
      handleGetElementRect(payload, sendResponse);
      return true;

    case 'SCROLL_TO_REF':
      handleScrollToRef(payload, sendResponse);
      return true;

    case 'CLICK_REF':
      handleClickRef(payload, sendResponse);
      return true;

    case 'GET_PAGE_TEXT':
      handleGetPageText(sendResponse);
      return true;

    case 'SCROLL_TO_ELEMENT':
      handleScrollToElement(payload, sendResponse);
      return true;

    case 'UPLOAD_IMAGE':
      handleUploadImage(payload, sendResponse);
      return true;

    case 'FIND_AND_SCROLL':
      handleFindAndScroll(payload, sendResponse);
      return true;

    default:
      sendResponse({ error: `Unknown message type: ${type}` });
      return false;
  }
});

/**
 * Handle read_page tool
 * Uses Claude in Chrome compatible function signature
 */
function handleReadPage(payload, sendResponse) {
  try {
    const { filter = 'all', depth = 15, maxChars = 50000, ref_id = null } = payload || {};

    // Call with positional args matching Claude in Chrome: (filter, maxDepth, maxChars, refId)
    const result = window.__generateAccessibilityTree(filter, depth, maxChars, ref_id);

    // Result is { pageContent, viewport, error? }
    if (result.error) {
      sendResponse({
        success: false,
        error: result.error,
        viewport: result.viewport,
      });
      return;
    }

    sendResponse({
      success: true,
      tree: result.pageContent,
      viewport: result.viewport,
      url: window.location.href,
      title: document.title,
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle form_input tool
 * Matches Claude in Chrome's implementation exactly
 */
function handleFormInput(payload, sendResponse) {
  try {
    const { ref, value } = payload;

    // Get element by ref
    let element = null;
    if (window.__claudeElementMap && window.__claudeElementMap[ref]) {
      element = window.__claudeElementMap[ref].deref() || null;
      if (element && !document.contains(element)) {
        delete window.__claudeElementMap[ref];
        element = null;
      }
    }

    if (!element) {
      sendResponse({
        success: false,
        error: `No element found with reference: "${ref}". The element may have been removed from the page.`
      });
      return;
    }

    // Scroll element into view first (like Claude in Chrome)
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Handle SELECT elements
    if (element instanceof HTMLSelectElement) {
      const previousValue = element.value;
      const options = Array.from(element.options);
      let found = false;
      const valueStr = String(value);

      for (let i = 0; i < options.length; i++) {
        if (options[i].value === valueStr || options[i].text === valueStr) {
          element.selectedIndex = i;
          found = true;
          break;
        }
      }

      if (found) {
        element.focus();
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        sendResponse({
          success: true,
          output: `Selected option "${valueStr}" in dropdown (previous: "${previousValue}")`
        });
      } else {
        sendResponse({
          success: false,
          error: `Option "${valueStr}" not found. Available options: ${options.map(o => `"${o.text}" (value: "${o.value}")`).join(', ')}`
        });
      }
      return;
    }

    // Handle CHECKBOX inputs
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      const previousValue = element.checked;
      if (typeof value !== 'boolean') {
        sendResponse({ success: false, error: 'Checkbox requires a boolean value (true/false)' });
        return;
      }
      element.checked = value;
      element.focus();
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({
        success: true,
        output: `Checkbox ${element.checked ? 'checked' : 'unchecked'} (previous: ${previousValue})`
      });
      return;
    }

    // Handle RADIO inputs
    if (element instanceof HTMLInputElement && element.type === 'radio') {
      const previousValue = element.checked;
      const groupName = element.name;
      element.checked = true;
      element.focus();
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({
        success: true,
        output: `Radio button selected${groupName ? ` in group "${groupName}"` : ''}`
      });
      return;
    }

    // Handle DATE/TIME inputs
    if (element instanceof HTMLInputElement &&
        ['date', 'time', 'datetime-local', 'month', 'week'].includes(element.type)) {
      const previousValue = element.value;
      element.value = String(value);
      element.focus();
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({
        success: true,
        output: `Set ${element.type} to "${element.value}" (previous: ${previousValue})`
      });
      return;
    }

    // Handle RANGE inputs
    if (element instanceof HTMLInputElement && element.type === 'range') {
      const previousValue = element.value;
      const numValue = Number(value);
      if (isNaN(numValue)) {
        sendResponse({ success: false, error: 'Range input requires a numeric value' });
        return;
      }
      element.value = String(numValue);
      element.focus();
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({
        success: true,
        output: `Set range to ${element.value} (min: ${element.min}, max: ${element.max})`
      });
      return;
    }

    // Handle NUMBER inputs
    if (element instanceof HTMLInputElement && element.type === 'number') {
      const previousValue = element.value;
      const numValue = Number(value);
      if (isNaN(numValue) && value !== '') {
        sendResponse({ success: false, error: 'Number input requires a numeric value' });
        return;
      }
      element.value = String(value);
      element.focus();
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({
        success: true,
        output: `Set number input to ${element.value} (previous: ${previousValue})`
      });
      return;
    }

    // Handle TEXT inputs and TEXTAREAs
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const previousValue = element.value;
      element.value = String(value);
      element.focus();

      // Move cursor to end (like Claude in Chrome)
      if (element instanceof HTMLTextAreaElement ||
          (element instanceof HTMLInputElement &&
           ['text', 'search', 'url', 'tel', 'password'].includes(element.type))) {
        element.setSelectionRange(element.value.length, element.value.length);
      }

      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));

      const inputType = element instanceof HTMLTextAreaElement ? 'textarea' : (element.type || 'text');
      sendResponse({
        success: true,
        output: `Set ${inputType} value to "${element.value}" (previous: "${previousValue}")`
      });
      return;
    }

    sendResponse({
      success: false,
      error: `Element type "${element.tagName}" is not a supported form input`
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: `Error setting form value: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

/**
 * Handle getting element bounding rect
 */
function handleGetElementRect(payload, sendResponse) {
  try {
    const { ref } = payload;
    const rect = window.__getElementRect(ref);

    if (!rect) {
      sendResponse({ success: false, error: `Element ${ref} not found` });
      return;
    }

    sendResponse({ success: true, rect });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle scroll to element
 */
function handleScrollToRef(payload, sendResponse) {
  try {
    const { ref } = payload;
    const element = window.__getElementByRef(ref);

    if (!element) {
      sendResponse({ success: false, error: `Element ${ref} not found` });
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle direct click on element by ref
 */
function handleClickRef(payload, sendResponse) {
  try {
    const { ref } = payload;
    const element = window.__getElementByRef(ref);

    if (!element) {
      sendResponse({ success: false, error: `Element ${ref} not found` });
      return;
    }

    element.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Small delay to ensure scroll completes
    setTimeout(() => {
      element.focus();
      element.click();
      sendResponse({ success: true });
    }, 100);
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle get_page_text tool
 */
function handleGetPageText(sendResponse) {
  try {
    // Get main content, fallback to body
    const main = document.querySelector('main, article, [role="main"]') || document.body;

    // Clone and remove scripts, styles, etc.
    const clone = main.cloneNode(true);
    const removeSelectors = ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside'];
    removeSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    const text = clone.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50000);

    sendResponse({
      success: true,
      text,
      url: window.location.href,
      title: document.title,
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle scroll_to action
 */
function handleScrollToElement(payload, sendResponse) {
  try {
    const { ref } = payload;

    let element = null;
    if (window.__claudeElementMap && window.__claudeElementMap[ref]) {
      element = window.__claudeElementMap[ref].deref() || null;
      if (element && !document.contains(element)) {
        delete window.__claudeElementMap[ref];
        element = null;
      }
    }

    if (!element) {
      sendResponse({ success: false, error: `Element ${ref} not found` });
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle upload_image tool
 */
function handleUploadImage(payload, sendResponse) {
  try {
    const { dataUrl, ref, coordinate, filename } = payload;

    // Convert data URL to blob
    const [header, base64] = dataUrl.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const file = new File([blob], filename || 'image.png', { type: mimeType });

    // If ref is provided, upload to file input
    if (ref) {
      let element = null;
      if (window.__claudeElementMap && window.__claudeElementMap[ref]) {
        element = window.__claudeElementMap[ref].deref() || null;
        if (element && !document.contains(element)) {
          delete window.__claudeElementMap[ref];
          element = null;
        }
      }

      if (!element) {
        sendResponse({ success: false, error: `Element ${ref} not found` });
        return;
      }

      if (element.tagName !== 'INPUT' || element.type !== 'file') {
        sendResponse({ success: false, error: `Element ${ref} is not a file input` });
        return;
      }

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      element.files = dataTransfer.files;
      element.dispatchEvent(new Event('change', { bubbles: true }));

      sendResponse({ success: true, output: `Uploaded ${filename} to file input` });
      return;
    }

    // If coordinate is provided, simulate drag & drop
    if (coordinate) {
      const [x, y] = coordinate;
      const target = document.elementFromPoint(x, y);

      if (!target) {
        sendResponse({ success: false, error: `No element found at (${x}, ${y})` });
        return;
      }

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: x,
        clientY: y,
      });

      target.dispatchEvent(dropEvent);
      sendResponse({ success: true, output: `Dropped ${filename} at (${x}, ${y})` });
      return;
    }

    sendResponse({ success: false, error: 'Either ref or coordinate is required' });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Find scrollable container at coordinates and scroll it
 * Claude in Chrome checks overflowY/X for "auto" or "scroll" to find scrollable parents
 */
function handleFindAndScroll(payload, sendResponse) {
  try {
    const { x, y, deltaX, deltaY, direction, amount } = payload;

    // Helper to check if element is scrollable
    function isScrollable(element) {
      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll') &&
                            element.scrollHeight > element.clientHeight;
      const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll') &&
                            element.scrollWidth > element.clientWidth;
      return isScrollableY || isScrollableX;
    }

    // Find element at coordinates
    const elementAtPoint = document.elementFromPoint(x, y);
    if (!elementAtPoint) {
      sendResponse({ scrolledContainer: false });
      return;
    }

    // Walk up the DOM to find scrollable container
    let scrollContainer = elementAtPoint;
    while (scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement) {
      if (isScrollable(scrollContainer)) {
        break;
      }
      scrollContainer = scrollContainer.parentElement;
    }

    // If we found a scrollable container (not body/html), scroll it
    if (scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement && isScrollable(scrollContainer)) {
      if (direction === 'up' || direction === 'down') {
        scrollContainer.scrollBy({ top: deltaY, behavior: 'smooth' });
      } else {
        scrollContainer.scrollBy({ left: deltaX, behavior: 'smooth' });
      }
      sendResponse({
        scrolledContainer: true,
        containerType: scrollContainer.tagName.toLowerCase(),
      });
      return;
    }

    // No scrollable container found, let caller use fallback
    sendResponse({ scrolledContainer: false });
  } catch (error) {
    sendResponse({ scrolledContainer: false, error: error.message });
  }
}

console.log('[Browser Agent] Content script loaded');
