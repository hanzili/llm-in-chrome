/**
 * Form tool handlers
 * Handles: form_input, file_upload
 */

import { ensureDebugger, sendDebuggerCommand } from '../managers/debugger-manager.js';

/**
 * @typedef {Object} FormToolDeps
 * @property {Function} sendToContent - Send message to content script
 * @property {Function} log - Logging function
 */

/**
 * Handle form_input tool - fill form fields with values
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID containing the form
 * @param {string} toolInput.ref - Element reference from accessibility tree
 * @param {string} toolInput.value - Value to set in the form field
 * @param {FormToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Success message or error
 */
export async function handleFormInput(toolInput, deps) {
  const { tabId } = toolInput;
  const { sendToContent } = deps;

  const result = await sendToContent(tabId, 'FORM_INPUT', {
    ref: toolInput.ref,
    value: toolInput.value,
  });
  return result.success ? (result.output || 'Value set successfully') : `Error: ${result.error}`;
}

/**
 * Handle file_upload tool - upload files to file input elements using CDP
 *
 * Uses Chrome DevTools Protocol DOM.setFileInputFiles for reliable uploads.
 * Just provide a local file path - CDP handles the rest.
 *
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID containing the file input
 * @param {string} [toolInput.ref] - Element reference from accessibility tree (e.g., "ref_123")
 * @param {string} [toolInput.selector] - CSS selector for file input (used if ref not provided)
 * @param {string} toolInput.filePath - Absolute path to local file (e.g., "/Users/name/resume.pdf")
 * @param {FormToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Success message or error
 */
export async function handleFileUpload(toolInput, deps) {
  const { tabId, ref, selector } = toolInput;
  // Support both filePath and file_path (LLM might use either)
  const filePath = toolInput.filePath || toolInput.file_path;
  const log = deps?.log || console.log;

  // Validate inputs
  if (!ref && !selector) {
    return 'Error: Either ref or selector is required to identify the file input element';
  }
  if (!filePath) {
    return 'Error: filePath is required (absolute path to the file)';
  }

  try {
    // Ensure debugger is attached
    const attached = await ensureDebugger(tabId);
    if (!attached) {
      return 'Error: Could not attach debugger to tab';
    }

    // Get the document root
    const { root } = await sendDebuggerCommand(tabId, 'DOM.getDocument', {});

    // Find the file input element
    let nodeId;
    const selectorToUse = selector || `input[type="file"]`;

    if (ref) {
      // Use ref attribute to find element - try multiple formats
      const refSelectors = [
        `[data-llm-ref="${ref}"]`,
        `[data-ref="${ref}"]`,
        `#${ref}`,
      ];

      for (const refSelector of refSelectors) {
        try {
          const result = await sendDebuggerCommand(tabId, 'DOM.querySelector', {
            nodeId: root.nodeId,
            selector: refSelector
          });
          if (result.nodeId && result.nodeId !== 0) {
            nodeId = result.nodeId;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }
    }

    if (!nodeId) {
      // Use CSS selector as fallback
      const result = await sendDebuggerCommand(tabId, 'DOM.querySelector', {
        nodeId: root.nodeId,
        selector: selectorToUse
      });
      nodeId = result.nodeId;
    }

    if (!nodeId || nodeId === 0) {
      const identifier = ref ? 'ref="' + ref + '"' : 'selector="' + selectorToUse + '"';
      return 'Error: Could not find file input element with ' + identifier;
    }

    // Check if it's a file input, if not search children
    let fileInputNodeId = nodeId;
    try {
      const { node } = await sendDebuggerCommand(tabId, 'DOM.describeNode', { nodeId });

      const isFileInput = node.nodeName === 'INPUT' &&
        node.attributes &&
        node.attributes.includes('type') &&
        node.attributes[node.attributes.indexOf('type') + 1] === 'file';

      if (!isFileInput) {
        // Search for file input in children
        const childResult = await sendDebuggerCommand(tabId, 'DOM.querySelector', {
          nodeId: nodeId,
          selector: 'input[type="file"]'
        });
        if (childResult.nodeId && childResult.nodeId !== 0) {
          fileInputNodeId = childResult.nodeId;
          await log?.('FILE_UPLOAD', 'Found file input in children');
        }
      }
    } catch (e) {
      // Continue with original node
    }

    // Set files on the input using CDP
    await sendDebuggerCommand(tabId, 'DOM.setFileInputFiles', {
      nodeId: fileInputNodeId,
      files: [filePath]
    });

    // Trigger change event via JavaScript to notify the page
    const triggerSelector = ref ?
      `[data-llm-ref="${ref}"], [data-ref="${ref}"], #${ref}` :
      selectorToUse;

    await sendDebuggerCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const input = document.querySelector('${triggerSelector}');
          if (input) {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `
    });

    const uploadedFileName = filePath.split('/').pop();
    return `Successfully uploaded "${uploadedFileName}" to file input`;

  } catch (err) {
    return `Error uploading file: ${err.message}`;
  }
}
