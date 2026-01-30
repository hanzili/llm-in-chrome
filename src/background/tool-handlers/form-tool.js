/**
 * Form tool handlers
 * Handles: form_input, file_upload
 */

/**
 * @typedef {Object} FormToolDeps
 * @property {Function} sendToContent - Send message to content script
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
 * Handle file_upload tool - upload files to file input elements
 * @param {Object} toolInput - Tool input parameters
 * @param {number} toolInput.tabId - Tab ID containing the file input
 * @param {string} toolInput.ref - Element reference for file input from accessibility tree
 * @param {string} toolInput.file_path - Path to file within extension (e.g., 'assets/resume.pdf')
 * @param {FormToolDeps} deps - Dependency injection object
 * @returns {Promise<string>} Success message or error
 */
export async function handleFileUpload(toolInput, deps) {
  const { tabId } = toolInput;
  const { sendToContent } = deps;

  if (!toolInput.ref) {
    return 'Error: ref is required for file_upload';
  }
  if (!toolInput.file_path) {
    return 'Error: file_path is required for file_upload';
  }

  // Get file path and read it
  const filePath = toolInput.file_path;
  let fileData, fileName;

  try {
    // Read file using chrome.runtime (works in service worker)
    const response = await fetch(chrome.runtime.getURL(filePath));
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    fileData = Array.from(new Uint8Array(arrayBuffer));
    fileName = filePath.split('/').pop();
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }

  // Send to content script
  const result = await sendToContent(tabId, 'FILE_UPLOAD', {
    ref: toolInput.ref,
    fileName,
    fileData,
  });

  return result.success ? `Uploaded file to ${toolInput.ref}` : `Error: ${result.error}`;
}
