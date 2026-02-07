/**
 * IPC Module - Communication with Chrome Extension
 *
 * This module provides a clean abstraction over the native messaging protocol
 * used to communicate with the Chrome extension.
 */
export { NativeHostConnection, getDefaultConnection, resetDefaultConnection, } from './native-host.js';
