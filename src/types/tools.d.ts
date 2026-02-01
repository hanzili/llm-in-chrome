/**
 * Type definitions for browser agent tool system
 * Provides autocomplete and type checking for tool inputs and outputs
 */

/**
 * Computer tool input for browser automation actions
 */
export interface ComputerToolInput {
  tabId: number;
  action: 'screenshot' | 'zoom' | 'left_click' | 'right_click' | 'double_click' | 'triple_click' |
          'hover' | 'left_click_drag' | 'type' | 'key' | 'wait' | 'scroll' | 'scroll_to';
  coordinate?: [number, number];
  ref?: string;
  region?: [number, number, number, number]; // [x0, y0, x1, y1] for zoom
  text?: string;
  repeat?: number;
  modifiers?: string; // e.g., "ctrl+shift"
  scroll_direction?: 'up' | 'down' | 'left' | 'right';
  scroll_amount?: number;
  start_coordinate?: [number, number];
  duration?: number; // for wait action
}

/**
 * Navigation tool input
 */
export interface NavigateToolInput {
  tabId: number;
  url: string; // URL or 'back'/'forward'
}

/**
 * Read page tool input
 */
export interface ReadPageToolInput {
  tabId: number;
  filter?: 'interactive' | 'all';
  depth?: number;
  ref_id?: string;
  max_chars?: number;
}

/**
 * Find tool input
 */
export interface FindToolInput {
  tabId: number;
  query: string; // Natural language query
}

/**
 * Form input tool input
 */
export interface FormInputToolInput {
  tabId: number;
  ref: string;
  value: string;
}

/**
 * File upload tool input
 */
export interface FileUploadToolInput {
  tabId: number;
  ref: string;
  file_path: string; // Path within extension
}

/**
 * Tabs context tool input
 */
export interface TabsContextToolInput {
  // No specific input needed
}

/**
 * Tabs create tool input
 */
export interface TabsCreateToolInput {
  // No specific input needed
}

/**
 * Tabs close tool input
 */
export interface TabsCloseToolInput {
  tabId: number;
}

/**
 * Union type of all tool inputs
 */
export type ToolInput =
  | ComputerToolInput
  | NavigateToolInput
  | ReadPageToolInput
  | FindToolInput
  | FormInputToolInput
  | FileUploadToolInput
  | TabsContextToolInput
  | TabsCreateToolInput
  | TabsCloseToolInput;

/**
 * Screenshot result from computer tool
 */
export interface ScreenshotResult {
  type: 'screenshot';
  dataUrl: string;
  imageId: string;
  tabId: number;
  region?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  note?: string;
}

/**
 * Tool execution result - can be object or string
 */
export type ToolResult = ScreenshotResult | string | object;

/**
 * Log entry structure
 */
export interface LogEntry {
  time: string; // ISO timestamp
  type: string; // Log type (ERROR, TOOL, DEBUGGER, etc.)
  message: string;
  data?: string; // JSON stringified data
}

/**
 * Task data structure
 */
export interface TaskData {
  task: string;
  status: 'success' | 'error' | 'cancelled';
  startTime?: string;
  endTime?: string;
  messages?: Array<Message>;
  error?: string;
}

/**
 * Message structure for agent conversation
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string | Array<ContentBlock>;
}

/**
 * Content block in message
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: ToolInput;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<ContentBlock>;
  is_error?: boolean;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/webp';
    data: string;
  };
}

/**
 * Clean turn format for logging
 */
export interface CleanTurn {
  ai_response: string | null;
  tools: Array<{
    name: string;
    input: ToolInput;
    result: string | null;
  }>;
}

/**
 * Tab information structure
 */
export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  active: boolean;
  groupId?: number;
  openedByAgent: boolean;
}

/**
 * Screenshot context metadata
 */
export interface ScreenshotContext {
  viewportWidth: number;
  viewportHeight: number;
  screenshotWidth: number;
  screenshotHeight: number;
  devicePixelRatio: number;
}

/**
 * Dependency injection object for tool handlers
 */
export interface ToolHandlerDeps {
  sendDebuggerCommand: (tabId: number, method: string, params?: object) => Promise<any>;
  ensureDebugger: (tabId: number) => Promise<boolean>;
  log: (type: string, message: string, data?: any) => Promise<void>;
  sendToContent: (tabId: number, type: string, payload?: object) => Promise<any>;
  hideIndicatorsForToolUse?: (tabId: number) => Promise<void>;
  showIndicatorsAfterToolUse?: (tabId: number) => Promise<void>;
  screenshotCounter?: { value: number };
  capturedScreenshots?: Map<string, string>;
  screenshotContexts?: Map<string, ScreenshotContext>;
  taskScreenshots?: Array<string>;
  agentOpenedTabs?: Set<number>;
  sessionTabGroupId?: number | null;
  isAnySessionActive?: () => boolean;
  addTabToGroup?: (tabId: number) => Promise<void>;
  ensureContentScripts?: (tabId: number) => Promise<void>;
  getConfig?: () => any;
  callLLMSimple?: (prompt: string, maxTokens: number) => Promise<string>;
}
