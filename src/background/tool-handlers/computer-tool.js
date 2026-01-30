/**
 * Computer tool handler - browser automation actions
 * Handles: screenshot, zoom, clicks, hover, drag, type, key, wait, scroll
 */

import { getKeyCode, requiresShift, pressKey, pressKeyChord } from '../modules/keys.js';
import { DELAYS } from '../modules/constants.js';
import { cdpHelper } from '../modules/cdp-helper.js';

/**
 * Scale coordinates from screenshot space to viewport space
 * On Retina/HiDPI displays, screenshots are larger than viewport
 *
 * @param {number} x - X coordinate from screenshot
 * @param {number} y - Y coordinate from screenshot
 * @param {Object} context - Screenshot context with viewport/screenshot dimensions
 * @returns {[number, number]} Scaled [x, y] coordinates
 */
function scaleCoordinates(x, y, context) {
  if (!context || !context.screenshotWidth || !context.viewportWidth) {
    return [x, y];
  }
  const scaleX = context.viewportWidth / context.screenshotWidth;
  const scaleY = context.viewportHeight / context.screenshotHeight;
  return [Math.round(x * scaleX), Math.round(y * scaleY)];
}

/**
 * @typedef {Object} ComputerToolDeps
 * @property {Function} sendDebuggerCommand - Send CDP command to tab
 * @property {Function} ensureDebugger - Attach debugger to tab if needed
 * @property {Function} log - Log function for debugging
 * @property {Function} sendToContent - Send message to content script
 * @property {Function} hideIndicatorsForToolUse - Hide visual indicators during tool use
 * @property {Function} showIndicatorsAfterToolUse - Show visual indicators after tool use
 * @property {Object} screenshotCounter - Counter for screenshot IDs
 * @property {Map<string, string>} capturedScreenshots - Map of screenshot IDs to data URLs
 * @property {Map<string, Object>} screenshotContexts - Map of screenshot IDs to viewport metadata
 * @property {Array<string>} taskScreenshots - Array of screenshot data URLs for task logging
 * @property {Set<number>} agentOpenedTabs - Set of tab IDs opened by agent
 */

/**
 * Handle computer automation tool actions (screenshot, clicks, typing, scrolling, etc.)
 * @param {Object} toolInput - Tool input parameters
 * @param {string} toolInput.action - Action to perform (screenshot, left_click, type, etc.)
 * @param {number} toolInput.tabId - Tab ID to operate on
 * @param {Array<number>} [toolInput.coordinate] - [x, y] coordinates for click/hover actions
 * @param {string} [toolInput.ref] - Element reference from accessibility tree
 * @param {Array<number>} [toolInput.region] - [x0, y0, x1, y1] region for zoom action
 * @param {string} [toolInput.text] - Text to type or key to press
 * @param {number} [toolInput.repeat] - Number of times to repeat key press
 * @param {string} [toolInput.modifiers] - Modifier keys (alt, ctrl, shift, etc.)
 * @param {string} [toolInput.scroll_direction] - Scroll direction (up, down, left, right)
 * @param {number} [toolInput.scroll_amount] - Scroll amount multiplier
 * @param {Array<number>} [toolInput.start_coordinate] - Starting coordinates for drag
 * @param {number} [toolInput.duration] - Wait duration in seconds
 * @param {ComputerToolDeps} deps - Dependency injection object
 * @returns {Promise<Object|string>} Tool execution result or error message
 */
export async function handleComputer(toolInput, deps) {
  const { action, tabId } = toolInput;
  const {
    sendDebuggerCommand,
    ensureDebugger,
    log,
    sendToContent,
    hideIndicatorsForToolUse,
    showIndicatorsAfterToolUse,
    screenshotCounter,
    capturedScreenshots,
    screenshotContexts,
    taskScreenshots,
    agentOpenedTabs,
  } = deps;

  switch (action) {
    case 'screenshot': {
      try {
        // Ensure debugger is attached before cdpHelper.screenshot can use it
        await ensureDebugger(tabId);

        // Use cdpHelper.screenshot() which handles:
        // - Hiding/showing indicators
        // - DPR scaling (divides by devicePixelRatio)
        // - Additional resizing to fit token limits via calculateTargetDimensions
        // - Screenshot context storage
        const result = await cdpHelper.screenshot(tabId);

        // Store screenshot for upload_image
        const imageId = `screenshot_${++screenshotCounter.value}`;
        const dataUrl = `data:image/${result.format};base64,${result.base64}`;
        capturedScreenshots.set(imageId, dataUrl);

        // Store screenshot context for coordinate scaling
        // Note: After DPR scaling, screenshot dimensions match viewport dimensions
        const contextData = {
          viewportWidth: result.viewportWidth,
          viewportHeight: result.viewportHeight,
          screenshotWidth: result.width,
          screenshotHeight: result.height,
          devicePixelRatio: 1, // Already scaled by cdpHelper.screenshot
        };
        screenshotContexts.set(imageId, contextData);
        screenshotContexts.set(`tab_${tabId}`, contextData);

        // Collect for task logging
        taskScreenshots.push(dataUrl);

        // Return format
        return {
          output: `Successfully captured screenshot (${result.width}x${result.height}, ${result.format}) - ID: ${imageId}`,
          base64Image: result.base64,
          imageFormat: result.format,
          imageId,
        };
      } catch (err) {
        return {
          error: `Error capturing screenshot: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    }

    case 'zoom': {
      // Validate region parameter      if (!toolInput.region || toolInput.region.length !== 4) {
        throw new Error('Region parameter is required for zoom action and must be [x0, y0, x1, y1]');
      }
      let [x0, y0, x1, y1] = toolInput.region;
      if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) {
        throw new Error('Invalid region coordinates: x0 and y0 must be non-negative, and x1 > x0, y1 > y0');
      }

      try {
        // Scale region coordinates from screenshot space to viewport space (for HiDPI displays)
        const context = screenshotContexts.get(`tab_${tabId}`);
        if (context) {
          [x0, y0] = scaleCoordinates(x0, y0, context);
          [x1, y1] = scaleCoordinates(x1, y1, context);
        }

        // Validate against viewport boundaries        const viewportInfo = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({ width: window.innerWidth, height: window.innerHeight }),
        });
        if (!viewportInfo || !viewportInfo[0]?.result) {
          throw new Error('Failed to get viewport dimensions');
        }
        const { width, height } = viewportInfo[0].result;
        if (x1 > width || y1 > height) {
          throw new Error(`Region exceeds viewport boundaries (${width}x${height}). Please choose a region within the visible viewport.`);
        }

        const regionWidth = x1 - x0;
        const regionHeight = y1 - y0;

        await ensureDebugger(tabId);
        // Use CDP clip parameter to actually crop the region
        const result = await sendDebuggerCommand(tabId, 'Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true,
          clip: { x: x0, y: y0, width: regionWidth, height: regionHeight, scale: 1 },
        });

        if (!result || !result.data) {
          throw new Error('Failed to capture zoomed screenshot via CDP');
        }

        return {
          output: `Successfully captured zoomed screenshot of region (${x0},${y0}) to (${x1},${y1}) - ${regionWidth}x${regionHeight} pixels`,
          base64Image: result.data,
          imageFormat: 'png',
        };
      } catch (err) {
        return {
          error: `Error capturing zoomed screenshot: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    }

    case 'left_click':
    case 'right_click':
    case 'middle_click':
    case 'double_click':
    case 'triple_click': {
      // Hide indicators before click      await hideIndicatorsForToolUse(tabId);
      await new Promise(r => setTimeout(r, 50));

      try {
        let x, y;
        let rectInfo = null;
        if (toolInput.ref) {
          const result = await sendToContent(tabId, 'GET_ELEMENT_RECT', { ref: toolInput.ref });
          if (!result.success) {
            return { error: result.error };
          }
          [x, y] = result.coordinates || [result.rect?.centerX, result.rect?.centerY];
          rectInfo = result.rect;
        } else if (toolInput.coordinate) {
          // Scale coordinates from screenshot space to viewport space (for HiDPI displays)
          [x, y] = toolInput.coordinate;
          const context = screenshotContexts.get(`tab_${tabId}`);
          if (context) {
            [x, y] = scaleCoordinates(x, y, context);
          }
        } else {
          throw new Error('Either ref or coordinate parameter is required for click action');
        }

        // Debug logging for click coordinates (helps diagnose scaling issues)
        await log('CLICK', `${toolInput.ref || 'coordinate'} → (${Math.round(x)}, ${Math.round(y)})`, rectInfo);

        await ensureDebugger(tabId);
        const clickCount = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1;
        const button = action === 'right_click' ? 'right' : action === 'middle_click' ? 'middle' : 'left';
        // Button codes: left=1, right=2, middle=4        const buttonCode = button === 'left' ? 1 : button === 'right' ? 2 : 4;

        let modifiers = 0;
        if (toolInput.modifiers) {
          const modMap = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, command: 4, win: 4, windows: 4, shift: 8 };
          const mods = toolInput.modifiers.toLowerCase().split('+');
          for (const mod of mods) {
            modifiers |= modMap[mod.trim()] || 0;
          }
        }

        // Move mouse to position first        await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers,
        });
        await new Promise(r => setTimeout(r, 100));

        // Click
        for (let i = 1; i <= clickCount; i++) {
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x, y, button, buttons: buttonCode, clickCount: i, modifiers,
          });
          await new Promise(r => setTimeout(r, 12));
          await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i, modifiers,
          });
          if (i < clickCount) await new Promise(r => setTimeout(r, 100));
        }

        const clickType = clickCount === 1 ? 'Clicked' : clickCount === 2 ? 'Double-clicked' : 'Triple-clicked';
        // Return format
        return toolInput.ref
          ? { output: `${clickType} on element ${toolInput.ref}` }
          : { output: `${clickType} at (${Math.round(toolInput.coordinate[0])}, ${Math.round(toolInput.coordinate[1])})` };
      } finally {
        // Restore indicators after click        await showIndicatorsAfterToolUse(tabId);
      }
    }

    case 'hover': {
      let x, y;
      if (toolInput.ref) {
        // Get element coordinates from ref        const result = await sendToContent(tabId, 'GET_ELEMENT_RECT', { ref: toolInput.ref });
        if (!result.success) {
          return { error: result.error };
        }
        [x, y] = result.coordinates || [result.rect?.centerX, result.rect?.centerY];
      } else if (toolInput.coordinate) {
        // Scale coordinates from screenshot space to viewport space (for HiDPI displays)
        [x, y] = toolInput.coordinate;
        const context = screenshotContexts.get(`tab_${tabId}`);
        if (context) {
          [x, y] = scaleCoordinates(x, y, context);
        }
      } else {
        throw new Error('Either ref or coordinate parameter is required for hover action');
      }

      await ensureDebugger(tabId);
      // Dispatch mouseMoved with modifiers: 0      await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
        modifiers: 0,
      });

      // Return format
      return toolInput.ref
        ? { output: `Hovered over element ${toolInput.ref}` }
        : { output: `Hovered at (${Math.round(toolInput.coordinate[0])}, ${Math.round(toolInput.coordinate[1])})` };
    }

    case 'left_click_drag': {
      // Validate parameters      if (!toolInput.start_coordinate || toolInput.start_coordinate.length !== 2) {
        throw new Error('start_coordinate parameter is required for left_click_drag action');
      }
      if (!toolInput.coordinate || toolInput.coordinate.length !== 2) {
        throw new Error('coordinate parameter (end position) is required for left_click_drag action');
      }

      // Scale coordinates from screenshot space to viewport space (for HiDPI displays)
      let [startX, startY] = toolInput.start_coordinate;
      let [endX, endY] = toolInput.coordinate;
      const context = screenshotContexts.get(`tab_${tabId}`);
      if (context) {
        [startX, startY] = scaleCoordinates(startX, startY, context);
        [endX, endY] = scaleCoordinates(endX, endY, context);
      }

      await ensureDebugger(tabId);

      // Move to start position      await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: startX,
        y: startY,
        button: 'none',
        buttons: 0,
        modifiers: 0,
      });

      // Press at start position
      await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: startX,
        y: startY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        modifiers: 0,
      });

      // Drag to end position
      await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 1,
        modifiers: 0,
      });

      // Release at end position
      await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
        modifiers: 0,
      });

      return { output: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})` };
    }

    case 'type': {
      // Validate text parameter      if (!toolInput.text) {
        throw new Error('Text parameter is required for type action');
      }

      await ensureDebugger(tabId);

      // Type character by character      // Uses pressKey for characters with key codes, insertText for others
      for (const char of toolInput.text) {
        let keyChar = char;

        // Convert newlines to Enter key
        if (char === '\n' || char === '\r') {
          keyChar = 'Enter';
        }

        // Try to get key code for the character
        const keyDef = getKeyCode(keyChar);
        if (keyDef) {
          // Use shift modifier for uppercase letters and symbols that require shift
          const shiftMod = requiresShift(char) ? 8 : 0;
          await pressKey(tabId, keyDef, shiftMod);
        } else {
          // Fall back to insertText for characters without key codes
          await sendDebuggerCommand(tabId, 'Input.insertText', { text: char });
        }
      }

      return { output: `Typed "${toolInput.text}"` };
    }

    case 'key': {
      // Validate parameters      if (!toolInput.text) {
        throw new Error('Text parameter is required for key action');
      }
      const repeat = toolInput.repeat ?? 1;
      if (!Number.isInteger(repeat) || repeat < 1) {
        throw new Error('Repeat parameter must be a positive integer');
      }
      if (repeat > 100) {
        throw new Error('Repeat parameter cannot exceed 100');
      }

      // Split by whitespace and filter empty      const keys = toolInput.text.trim().split(/\s+/).filter(k => k.length > 0);

      // Special handling for reload shortcuts - use chrome.tabs.reload() instead of key simulation
            if (keys.length === 1) {
        const key = keys[0].toLowerCase();
        if (
          key === 'cmd+r' || key === 'cmd+shift+r' ||
          key === 'ctrl+r' || key === 'ctrl+shift+r' ||
          key === 'f5' || key === 'ctrl+f5' || key === 'shift+f5'
        ) {
          const hardReload = key === 'cmd+shift+r' || key === 'ctrl+shift+r' ||
                            key === 'ctrl+f5' || key === 'shift+f5';
          await chrome.tabs.reload(tabId, { bypassCache: hardReload });
          const reloadType = hardReload ? 'hard reload' : 'reload';
          return { output: `Executed ${keys[0]} (${reloadType} page)` };
        }
      }

      await ensureDebugger(tabId);

      for (let i = 0; i < repeat; i++) {
        for (const key of keys) {
          if (key.includes('+')) {
            await pressKeyChord(tabId, key);
          } else {
            const keyDef = getKeyCode(key);
            if (keyDef) {
              // Note: key action does NOT use shift modifier (unlike type action)
              // Expected behavior
              await pressKey(tabId, keyDef, 0);
            } else {
              await sendDebuggerCommand(tabId, 'Input.insertText', { text: key });
            }
          }
        }
      }
      const repeatText = repeat > 1 ? ` (repeated ${repeat} times)` : '';
      return { output: `Pressed ${keys.length} key${keys.length === 1 ? '' : 's'}: ${keys.join(' ')}${repeatText}` };
    }

    case 'wait': {
      // Validate duration parameter      if (!toolInput.duration || toolInput.duration <= 0) {
        throw new Error('Duration parameter is required and must be positive');
      }
      if (toolInput.duration > 30) {
        throw new Error('Duration cannot exceed 30 seconds');
      }
      const ms = Math.round(1000 * toolInput.duration);
      await new Promise(resolve => setTimeout(resolve, ms));
      return {
        output: `Waited for ${toolInput.duration} second${toolInput.duration === 1 ? '' : 's'}`,
      };
    }

    case 'scroll': {
      // Validate coordinate parameter      if (!toolInput.coordinate || toolInput.coordinate.length !== 2) {
        throw new Error('Coordinate parameter is required for scroll action');
      }

      const direction = toolInput.scroll_direction || 'down';
      const amount = (toolInput.scroll_amount || 3) * 100;
      const scrollDeltas = {
        up: { deltaX: 0, deltaY: -amount },
        down: { deltaX: 0, deltaY: amount },
        left: { deltaX: -amount, deltaY: 0 },
        right: { deltaX: amount, deltaY: 0 },
      };
      const delta = scrollDeltas[direction];
      if (!delta) {
        throw new Error(`Invalid scroll direction: ${direction}`);
      }
      const { deltaX, deltaY } = delta;

      // Scale coordinates from screenshot space to viewport space (for HiDPI displays)
      const context = screenshotContexts.get(`tab_${tabId}`);
      let [x, y] = toolInput.coordinate;
      if (context) {
        [x, y] = scaleCoordinates(x, y, context);
      }

      // Get initial scroll position for verification
      const getScrollPosition = async () => {
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({ x: window.pageXOffset, y: window.pageYOffset }),
        });
        return result[0]?.result || { x: 0, y: 0 };
      };

      const initialPos = await getScrollPosition();

      // Check if tab is active before using CDP      const tabInfo = await chrome.tabs.get(tabId);
      const tabIsActive = tabInfo.active ?? false;

      let cdpWorked = false;
      if (tabIsActive) {
        // Try CDP mouseWheel scroll first        // This lets the browser route the wheel event to the correct scrollable element
        try {
          await ensureDebugger(tabId);

          // Use 5 second timeout for CDP scroll          const scrollPromise = sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x,
            y,
            deltaX,
            deltaY,
            modifiers: 0,
          });
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Scroll timeout')), 5000);
          });

          await Promise.race([scrollPromise, timeoutPromise]);
          await new Promise(r => setTimeout(r, 200));

          // Verify scroll worked (position changed by more than 5px)
          const newPos = await getScrollPosition();
          if (Math.abs(newPos.x - initialPos.x) > 5 || Math.abs(newPos.y - initialPos.y) > 5) {
            cdpWorked = true;
          } else {
            throw new Error('CDP scroll ineffective');
          }
        } catch (e) {
          // CDP scroll failed, will fall back to content script
        }
      }

      // Fall back to content script scroll if CDP didn't work or tab is not active
      if (!cdpWorked) {
        await sendToContent(tabId, 'FIND_AND_SCROLL', {
          x, y, deltaX, deltaY, direction, amount
        });
        await new Promise(r => setTimeout(r, 200));
      }

      // Return format - scroll_amount is in "ticks" where 1 tick = 100px
      const ticks = toolInput.scroll_amount || 3;
      return { output: `Scrolled ${direction} by ${ticks} ticks at (${x}, ${y})` };
    }

    case 'scroll_to': {
      // Validate ref parameter      if (!toolInput.ref) {
        throw new Error('ref parameter is required for scroll_to action');
      }
      const result = await sendToContent(tabId, 'SCROLL_TO_ELEMENT', { ref: toolInput.ref });
      if (result.success) {
        return { output: `Scrolled to element with reference: ${toolInput.ref}` };
      }
      return { error: result.error };
    }

    default:
      return `Error: Unknown action: ${action}`;
  }
}
