/**
 * Native Host IPC Module
 *
 * Handles communication with the Chrome extension via native messaging protocol.
 * This module is shared between the MCP server and CLI to eliminate duplication.
 *
 * Protocol: Chrome Native Messaging (4-byte little-endian length prefix + JSON)
 *
 * Architecture:
 *   MCP Server/CLI → NativeHostConnection → Native Host Process → Chrome Extension
 *                  ↑                                            ↓
 *                  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ←
 */
/** Message types sent TO the native host */
export type OutgoingMessageType = 'mcp_start_task' | 'mcp_stop_task' | 'mcp_send_message' | 'mcp_screenshot' | 'mcp_poll_results' | 'mcp_get_info' | 'llm_request' | 'debug_log';
/** Message types received FROM the native host */
export type IncomingMessageType = 'llm_response' | 'llm_request_queued' | 'llm_response_recorded' | 'mcp_results' | 'task_queued' | 'task_update' | 'task_complete' | 'task_error' | 'screenshot_result' | 'mcp_info' | 'api_error' | 'pong';
/** Base message structure */
export interface NativeMessage {
    type: string;
    sessionId?: string;
    requestId?: string;
    [key: string]: any;
}
/** Callback for handling incoming messages */
export type MessageHandler = (message: NativeMessage) => void | Promise<void>;
/** Connection options */
export interface ConnectionOptions {
    /** Custom path to native host executable */
    hostPath?: string;
    /** Callback when connection is lost */
    onDisconnect?: (code: number | null) => void;
    /** Callback for native host stderr output */
    onStderr?: (data: string) => void;
}
/**
 * Manages a connection to the native host process.
 *
 * Usage:
 *   const conn = new NativeHostConnection();
 *   conn.onMessage((msg) => console.log('Received:', msg));
 *   await conn.connect();
 *   await conn.send({ type: 'mcp_poll_results', requestIds: ['abc'] });
 */
export declare class NativeHostConnection {
    private process;
    private messageBuffer;
    private messageHandlers;
    private options;
    private connected;
    constructor(options?: ConnectionOptions);
    /**
     * Find the native host executable path from the installed Chrome manifest
     */
    private findHostPath;
    /**
     * Register a handler for incoming messages
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Remove a message handler
     */
    offMessage(handler: MessageHandler): void;
    /**
     * Connect to the native host process
     */
    connect(): Promise<void>;
    /**
     * Process buffered messages using the native messaging protocol
     * (4-byte little-endian length prefix + JSON payload)
     */
    private processMessages;
    /**
     * Dispatch a message to all registered handlers
     */
    private dispatchMessage;
    /**
     * Send a message to the native host
     */
    send(message: NativeMessage): Promise<void>;
    /**
     * Check if connected to native host
     */
    isConnected(): boolean;
    /**
     * Disconnect from the native host
     */
    disconnect(): void;
}
/**
 * Get the default native host connection (creates one if needed)
 */
export declare function getDefaultConnection(): NativeHostConnection;
/**
 * Reset the default connection (useful for testing)
 */
export declare function resetDefaultConnection(): void;
