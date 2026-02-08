/**
 * IPC Module - Communication with Chrome Extension
 *
 * WebSocketClient is the primary transport (via WebSocket relay).
 * NativeHostConnection is kept for reference/fallback.
 */
export { WebSocketClient } from './websocket-client.js';
export { NativeHostConnection, getDefaultConnection, resetDefaultConnection, } from './native-host.js';
