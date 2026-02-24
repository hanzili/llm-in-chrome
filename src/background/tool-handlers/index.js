/**
 * Tool Handlers Index
 * Maps tool names to their handler functions
 */

// Core tool handlers
import { handleComputer } from './computer-core.js';
import { handleNavigate } from './navigation-core.js';
import { handleFormInput } from './form-core.js';
import { handleReadPage } from './read-page-core.js';
import {
  handleFind,
  handleGetPageText,
  handleJavaScriptTool as handleJavascriptTool,
} from './utility-core.js';

// Our implementations (tabs, monitoring, agent tools)
import { handleFileUpload } from './form-tool.js';
import { handleUploadImage as handleViewScreenshot } from './utility-tool.js';
import {
  handleTabsContext,
  handleTabsCreate,
  handleTabsClose,
} from './tabs-tool.js';
import {
  handleReadConsoleMessages,
  handleReadNetworkRequests,
} from './monitoring-tool.js';
import {
  handleUpdatePlan,
  handleTurnAnswerStart,
  handleSolveCaptcha,
  handleResizeWindow,
  handleGetInfo,
  handleEscalate,
} from './agent-tool.js';

/**
 * Tool handler registry
 * Maps tool names to their handler functions
 */
export const toolHandlers = {
  computer: handleComputer,
  navigate: handleNavigate,
  read_page: handleReadPage,
  find: handleFind,
  form_input: handleFormInput,
  file_upload: handleFileUpload,
  tabs_context: handleTabsContext,
  tabs_create: handleTabsCreate,
  tabs_close: handleTabsClose,
  get_page_text: handleGetPageText,
  javascript_tool: handleJavascriptTool,
  view_screenshot: handleViewScreenshot,
  read_console_messages: handleReadConsoleMessages,
  read_network_requests: handleReadNetworkRequests,
  update_plan: handleUpdatePlan,
  turn_answer_start: handleTurnAnswerStart,
  solve_captcha: handleSolveCaptcha,
  resize_window: handleResizeWindow,
  get_info: handleGetInfo,
  escalate: handleEscalate,
};

/**
 * Check if a tool has been extracted to a handler module
 * @param {string} toolName - Name of the tool to check
 * @returns {boolean} True if handler exists for this tool
 */
export function hasHandler(toolName) {
  return toolName in toolHandlers;
}

/**
 * Execute a tool using its handler
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} toolInput - Input parameters for the tool
 * @param {Object} deps - Dependency injection object (shape varies by tool)
 * @returns {Promise<Object|string>} Tool execution result
 * @throws {Error} If no handler found for the tool
 */
export async function executeToolHandler(toolName, toolInput, deps) {
  const handler = toolHandlers[toolName];
  if (!handler) {
    throw new Error(`No handler found for tool: ${toolName}`);
  }
  return await handler(toolInput, deps);
}
