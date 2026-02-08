/**
 * IPC Module - Communication with Chrome Extension
 *
 * WebSocketClient is the primary transport (via WebSocket relay).
 * NativeHostConnection is kept for reference/fallback.
 */
export { WebSocketClient, type WebSocketClientOptions } from './websocket-client.js';
export { NativeHostConnection, getDefaultConnection, resetDefaultConnection, type NativeMessage, type MessageHandler, type ConnectionOptions, type OutgoingMessageType, type IncomingMessageType, } from './native-host.js';
