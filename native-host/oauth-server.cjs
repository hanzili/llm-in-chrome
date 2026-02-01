#!/usr/bin/env node
/**
 * Native Messaging Host for LLM in Chrome
 *
 * This serves as a bridge between:
 * 1. Chrome Extension (via native messaging)
 * 2. MCP Server (via file-based IPC)
 * 3. Claude/Codex APIs (for OAuth proxy)
 *
 * File-based IPC for MCP:
 * - MCP writes to: ~/.llm-in-chrome/mcp-inbox.json
 * - Extension reads from inbox, writes to: ~/.llm-in-chrome/mcp-outbox.json
 * - MCP reads from outbox
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

// OAuth configuration
const OAUTH_CONFIG = {
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
};

// MCP IPC paths
const MCP_DIR = path.join(os.homedir(), '.llm-in-chrome');
const MCP_INBOX = path.join(MCP_DIR, 'mcp-inbox.json');   // MCP server writes here
const MCP_OUTBOX = path.join(MCP_DIR, 'mcp-outbox.json'); // Extension writes here

// Ensure MCP directory exists
try {
  if (!fs.existsSync(MCP_DIR)) {
    fs.mkdirSync(MCP_DIR, { recursive: true });
  }
} catch (e) {}

// Log to file for debugging
const logFile = path.join(os.tmpdir(), 'llm-chrome-native-host.log');
function log(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

log('=== Native host started ===');
log(`PID: ${process.pid}`);

// Native messaging protocol - send message
function send(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buffer.length, 0);
  process.stdout.write(len);
  process.stdout.write(buffer);
  log(`Sent: ${message.type}`);
}

// Read Claude CLI credentials from file or macOS Keychain
function getClaudeCredentials() {
  // Try file first (legacy location)
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  if (fs.existsSync(credPath)) {
    try {
      const content = fs.readFileSync(credPath, 'utf8');
      const creds = JSON.parse(content);
      if (creds.claudeAiOauth) {
        log('Loaded credentials from file');
        return creds.claudeAiOauth;
      }
    } catch (e) {
      log(`Error reading credentials file: ${e.message}`);
    }
  }

  // Fallback to macOS Keychain (Claude Code v2.1.29+)
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const result = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      if (result && result.trim()) {
        const creds = JSON.parse(result.trim());
        log('Loaded credentials from macOS Keychain');
        return creds.claudeAiOauth || null;
      }
    } catch (e) {
      log(`Keychain read failed: ${e.message}`);
    }
  }

  log('No Claude credentials found in file or Keychain');
  return null;
}

// Save Claude CLI credentials after refresh
function saveClaudeCredentials(newCreds) {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');

  try {
    // Read existing file to preserve other data
    let existingData = {};
    if (fs.existsSync(credPath)) {
      const content = fs.readFileSync(credPath, 'utf8');
      existingData = JSON.parse(content);
    }

    // Update claudeAiOauth section
    existingData.claudeAiOauth = {
      ...existingData.claudeAiOauth,
      accessToken: newCreds.accessToken,
      refreshToken: newCreds.refreshToken || existingData.claudeAiOauth?.refreshToken,
      expiresAt: newCreds.expiresAt,
    };

    fs.writeFileSync(credPath, JSON.stringify(existingData, null, 2));
    log('Credentials file updated with new tokens');
    return true;
  } catch (e) {
    log(`Error saving credentials: ${e.message}`);
    return false;
  }
}

// Refresh OAuth token using refresh token
function refreshClaudeToken(refreshToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_CONFIG.clientId,
    });

    log('Attempting to refresh OAuth token...');

    const url = new URL(OAUTH_CONFIG.tokenUrl);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(responseBody);
            const expiresAt = Date.now() + (data.expires_in * 1000);
            log(`Token refreshed successfully, expires at ${new Date(expiresAt).toISOString()}`);
            resolve({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || refreshToken,
              expiresAt: expiresAt,
            });
          } catch (e) {
            reject(new Error(`Failed to parse refresh response: ${e.message}`));
          }
        } else {
          log(`Token refresh failed: ${res.statusCode} ${responseBody}`);
          reject(new Error(`Token refresh failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      log(`Token refresh request error: ${err.message}`);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// Read Codex CLI credentials
function getCodexCredentials() {
  const credPath = path.join(os.homedir(), '.codex', 'auth.json');
  if (!fs.existsSync(credPath)) return null;

  try {
    const content = fs.readFileSync(credPath, 'utf8');
    const creds = JSON.parse(content);
    if (creds.tokens && creds.tokens.access_token) {
      return {
        accessToken: creds.tokens.access_token,
        refreshToken: creds.tokens.refresh_token,
        accountId: creds.tokens.account_id,
      };
    }
    return null;
  } catch (e) {
    log(`Error reading Codex credentials: ${e.message}`);
    return null;
  }
}

// Timeout constants
const IDLE_TIMEOUT_MS = 30000;  // 30 seconds without data = stall
const TOTAL_TIMEOUT_MS = 120000; // 2 minutes max total

// Proxy API call to Claude or Codex (supports streaming)
// Includes auto-refresh on 401 for Claude OAuth tokens
async function proxyApiCall(data, isRetry = false) {
  const { url, method, body, headers } = data;
  log(`Proxying: ${method} ${url}${isRetry ? ' (retry after refresh)' : ''}`);

  // Check if streaming requested
  let isStreaming = false;
  try {
    const bodyObj = JSON.parse(body);
    isStreaming = bodyObj.stream === true;
  } catch (e) {}

  const urlObj = new URL(url);
  const isCodex = urlObj.hostname.includes('chatgpt.com') || urlObj.hostname.includes('openai.com');
  const isClaude = urlObj.hostname.includes('anthropic.com');

  let requestHeaders = {};
  let claudeCreds = null;

  if (isCodex) {
    // Codex/OpenAI request
    const creds = getCodexCredentials();
    if (!creds || !creds.accessToken) {
      send({ type: 'api_error', error: 'No Codex credentials found. Run: codex login' });
      return;
    }

    // Generate session and conversation IDs (required by Codex API)
    const crypto = require('crypto');
    const sessionId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();

    requestHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${creds.accessToken}`,
      'openai-beta': 'responses=experimental',
      'chatgpt-account-id': creds.accountId || '',
      'session_id': sessionId,
      'conversation_id': conversationId,
      'user-agent': 'codex_cli_rs/0.34.0 (Darwin; arm64)',
      'originator': 'codex_cli_rs',
      'accept': 'text/event-stream',
      ...headers
    };
  } else if (isClaude) {
    // Claude/Anthropic request
    claudeCreds = getClaudeCredentials();
    if (!claudeCreds || !claudeCreds.accessToken) {
      send({ type: 'api_error', error: 'No Claude CLI credentials found. Run: claude login' });
      return;
    }

    requestHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${claudeCreds.accessToken}`,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14',
      'x-app': 'cli',
      'user-agent': 'claude-code/2.1.29 (Darwin; arm64)',
      ...headers
    };
  } else {
    send({ type: 'api_error', error: `Unknown API host: ${urlObj.hostname}` });
    return;
  }

  try {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method || 'POST',
      headers: requestHeaders
    };

    log(`Request to ${options.hostname}${options.path} (streaming: ${isStreaming}, type: ${isCodex ? 'codex' : 'claude'})`);

    const req = https.request(options, async (res) => {
      // Set total timeout for the entire response
      req.setTimeout(TOTAL_TIMEOUT_MS, () => {
        log(`Request timeout after ${TOTAL_TIMEOUT_MS}ms`);
        req.destroy();
        send({ type: 'api_error', error: `Request timed out after ${TOTAL_TIMEOUT_MS/1000} seconds` });
      });
      // Handle 401 Unauthorized or 403 Forbidden - try to refresh token (Claude only, and only once)
      // 401 = token expired, 403 = token possibly revoked (worth trying refresh anyway)
      if ((res.statusCode === 401 || res.statusCode === 403) && isClaude && !isRetry && claudeCreds?.refreshToken) {
        log(`Got ${res.statusCode}, attempting token refresh...`);

        // Drain the response body
        res.on('data', () => {});
        res.on('end', async () => {
          try {
            const newCreds = await refreshClaudeToken(claudeCreds.refreshToken);

            // Save new credentials to file
            saveClaudeCredentials(newCreds);

            // Notify extension about refreshed tokens
            send({
              type: 'tokens_refreshed',
              credentials: newCreds
            });

            // Retry the original request with new token
            await proxyApiCall(data, true);
          } catch (refreshErr) {
            log(`Token refresh failed: ${refreshErr.message}`);
            send({
              type: 'api_error',
              error: `OAuth token invalid and refresh failed: ${refreshErr.message}. Run: claude login`
            });
          }
        });
        return;
      }

      if (isStreaming && res.statusCode === 200) {
        // Handle SSE streaming with idle timeout detection
        let buffer = '';
        let lastChunkTime = Date.now();
        let streamEnded = false;

        // Check for idle timeout (no data received for IDLE_TIMEOUT_MS)
        const idleChecker = setInterval(() => {
          if (streamEnded) {
            clearInterval(idleChecker);
            return;
          }
          const idleTime = Date.now() - lastChunkTime;
          if (idleTime > IDLE_TIMEOUT_MS) {
            clearInterval(idleChecker);
            streamEnded = true;
            log(`Stream stalled - no data for ${idleTime}ms, aborting`);
            req.destroy();
            send({ type: 'api_error', error: `Stream stalled - no data received for ${Math.round(idleTime/1000)} seconds. Claude API may be overloaded.` });
          }
        }, 5000);

        res.on('data', chunk => {
          lastChunkTime = Date.now(); // Reset idle timer on each chunk
          buffer += chunk.toString();

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                streamEnded = true;
                clearInterval(idleChecker);
                send({ type: 'stream_end' });
              } else {
                try {
                  const event = JSON.parse(data);
                  send({ type: 'stream_chunk', data: event });
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        });

        res.on('end', () => {
          if (!streamEnded) {
            streamEnded = true;
            clearInterval(idleChecker);
            log('Stream ended');
            send({ type: 'stream_end' });
          }
        });

        res.on('error', (err) => {
          streamEnded = true;
          clearInterval(idleChecker);
          log(`Stream error: ${err.message}`);
          send({ type: 'api_error', error: `Stream error: ${err.message}` });
        });
      } else {
        // Non-streaming response
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          log(`Response: ${res.statusCode}, ${responseBody.length} bytes`);
          send({
            type: 'api_response',
            status: res.statusCode,
            headers: res.headers,
            body: responseBody
          });
        });
      }
    });

    req.on('error', (err) => {
      log(`Request error: ${err.message}`);
      send({ type: 'api_error', error: err.message });
    });

    if (body) {
      req.write(body);
    }
    req.end();

  } catch (err) {
    log(`Proxy error: ${err.message}`);
    send({ type: 'api_error', error: err.message });
  }
}

// ============================================
// MCP FILE-BASED IPC FUNCTIONS
// ============================================

/**
 * Write command to MCP inbox (for MCP server to send to extension)
 */
function writeMcpInbox(command) {
  try {
    // Read existing inbox
    let inbox = [];
    if (fs.existsSync(MCP_INBOX)) {
      try {
        inbox = JSON.parse(fs.readFileSync(MCP_INBOX, 'utf8'));
        if (!Array.isArray(inbox)) inbox = [];
      } catch (e) {
        inbox = [];
      }
    }
    // Add new command
    inbox.push({ ...command, timestamp: Date.now() });
    fs.writeFileSync(MCP_INBOX, JSON.stringify(inbox, null, 2));
    log(`MCP inbox: wrote ${command.type} (${inbox.length} pending)`);
    return true;
  } catch (e) {
    log(`MCP inbox write error: ${e.message}`);
    return false;
  }
}

/**
 * Read and clear MCP inbox (for extension to read commands)
 */
function readMcpInbox() {
  try {
    if (!fs.existsSync(MCP_INBOX)) return [];
    const inbox = JSON.parse(fs.readFileSync(MCP_INBOX, 'utf8'));
    // Clear inbox after reading
    fs.writeFileSync(MCP_INBOX, '[]');
    log(`MCP inbox: read ${inbox.length} commands`);
    return Array.isArray(inbox) ? inbox : [];
  } catch (e) {
    log(`MCP inbox read error: ${e.message}`);
    return [];
  }
}

/**
 * Write result to MCP outbox (for extension to send to MCP server)
 */
function writeMcpOutbox(result) {
  try {
    let outbox = [];
    if (fs.existsSync(MCP_OUTBOX)) {
      try {
        outbox = JSON.parse(fs.readFileSync(MCP_OUTBOX, 'utf8'));
        if (!Array.isArray(outbox)) outbox = [];
      } catch (e) {
        outbox = [];
      }
    }
    outbox.push({ ...result, timestamp: Date.now() });
    fs.writeFileSync(MCP_OUTBOX, JSON.stringify(outbox, null, 2));
    log(`MCP outbox: wrote ${result.type} (${outbox.length} pending)`);
    return true;
  } catch (e) {
    log(`MCP outbox write error: ${e.message}`);
    return false;
  }
}

/**
 * Read and clear MCP outbox (for MCP server to read results)
 */
function readMcpOutbox() {
  try {
    if (!fs.existsSync(MCP_OUTBOX)) return [];
    const outbox = JSON.parse(fs.readFileSync(MCP_OUTBOX, 'utf8'));
    fs.writeFileSync(MCP_OUTBOX, '[]');
    log(`MCP outbox: read ${outbox.length} results`);
    return Array.isArray(outbox) ? outbox : [];
  } catch (e) {
    log(`MCP outbox read error: ${e.message}`);
    return [];
  }
}

// Handle incoming messages
function handleMessage(msg) {
  log(`Message: ${msg.type} (full: ${JSON.stringify(msg).substring(0, 200)})`);
  log(`Type check: "${msg.type}" === "mcp_start_task" ? ${msg.type === 'mcp_start_task'}`);

  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' });
      break;

    case 'debug_log':
      // Write debug entry to a dedicated debug log file
      try {
        const debugFile = path.join(MCP_DIR, 'mcp-debug.log');
        const entry = `[${msg.entry?.time || new Date().toISOString()}] ${msg.entry?.msg}: ${JSON.stringify(msg.entry?.data)}\n`;
        fs.appendFileSync(debugFile, entry);
      } catch (e) {}
      send({ type: 'debug_logged' });
      break;

    // ============================================
    // MCP SERVER COMMANDS (from MCP server via stdin)
    // Write to inbox for extension to pick up
    // ============================================

    case 'mcp_start_task':
      log(`ENTERED mcp_start_task CASE`);
      log(`MCP: Queuing task: ${msg.task?.substring(0, 50)}...`);
      writeMcpInbox({
        type: 'start_task',
        sessionId: msg.sessionId,
        task: msg.task,
        url: msg.url,
      });
      send({ type: 'task_queued', sessionId: msg.sessionId });
      break;

    case 'mcp_send_message':
      log(`MCP: Queuing message for session ${msg.sessionId}`);
      writeMcpInbox({
        type: 'send_message',
        sessionId: msg.sessionId,
        message: msg.message,
      });
      send({ type: 'message_queued', sessionId: msg.sessionId });
      break;

    case 'mcp_stop_task':
      log(`MCP: Queuing stop for session ${msg.sessionId}`);
      writeMcpInbox({
        type: 'stop_task',
        sessionId: msg.sessionId,
      });
      send({ type: 'stop_queued', sessionId: msg.sessionId });
      break;

    case 'mcp_screenshot':
      log(`MCP: Queuing screenshot for session ${msg.sessionId || 'active'}`);
      writeMcpInbox({
        type: 'screenshot',
        sessionId: msg.sessionId,
      });
      send({ type: 'screenshot_queued' });
      break;

    case 'mcp_poll_results':
      // MCP server polling for results from extension
      const results = readMcpOutbox();
      send({ type: 'mcp_results', results });
      break;

    // ============================================
    // EXTENSION COMMANDS (from Chrome extension via native messaging)
    // Read from inbox, write results to outbox
    // ============================================

    case 'poll_mcp_inbox':
      // Extension checking for MCP commands
      const commands = readMcpInbox();
      if (commands.length > 0) {
        send({ type: 'mcp_commands', commands });
      } else {
        send({ type: 'no_commands' });
      }
      break;

    case 'mcp_task_update':
      // Extension sending task progress
      log(`MCP: Task update for ${msg.sessionId}: ${msg.status}`);
      writeMcpOutbox({
        type: 'task_update',
        sessionId: msg.sessionId,
        status: msg.status,
        step: msg.step,
      });
      send({ type: 'update_recorded' });
      break;

    case 'mcp_task_complete':
      // Extension sending task completion
      log(`MCP: Task complete for ${msg.sessionId}`);
      writeMcpOutbox({
        type: 'task_complete',
        sessionId: msg.sessionId,
        result: msg.result,
      });
      send({ type: 'complete_recorded' });
      break;

    case 'mcp_task_error':
      // Extension sending task error
      log(`MCP: Task error for ${msg.sessionId}: ${msg.error}`);
      writeMcpOutbox({
        type: 'task_error',
        sessionId: msg.sessionId,
        error: msg.error,
      });
      send({ type: 'error_recorded' });
      break;

    case 'mcp_screenshot_result':
      // Extension sending screenshot
      log(`MCP: Screenshot captured`);
      writeMcpOutbox({
        type: 'screenshot',
        sessionId: msg.sessionId,
        data: msg.data,
      });
      send({ type: 'screenshot_recorded' });
      break;

    case 'read_cli_credentials':
      const claudeCreds = getClaudeCredentials();
      if (claudeCreds) {
        send({
          type: 'cli_credentials',
          credentials: {
            accessToken: claudeCreds.accessToken,
            refreshToken: claudeCreds.refreshToken,
            expiresAt: claudeCreds.expiresAt
          }
        });
      } else {
        send({
          type: 'credentials_not_found',
          error: 'Claude CLI credentials not found. Run: claude login'
        });
      }
      break;

    case 'read_codex_credentials':
      const codexCreds = getCodexCredentials();
      if (codexCreds) {
        send({
          type: 'codex_credentials',
          credentials: {
            accessToken: codexCreds.accessToken,
            refreshToken: codexCreds.refreshToken,
            accountId: codexCreds.accountId
          }
        });
      } else {
        send({
          type: 'credentials_not_found',
          error: 'Codex CLI credentials not found. Run: codex login'
        });
      }
      break;

    case 'proxy_api_call':
      proxyApiCall(msg.data);
      break;

    default:
      log(`DEFAULT CASE HIT - type: "${msg.type}", typeof: ${typeof msg.type}`);
      send({ type: 'error', error: `Unknown message type: ${msg.type}` });
  }
}

// Message buffer for native messaging protocol
let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (buffer.length >= 4) {
    const msgLen = buffer.readUInt32LE(0);
    if (buffer.length < 4 + msgLen) break;

    const msgStr = buffer.slice(4, 4 + msgLen).toString();
    buffer = buffer.slice(4 + msgLen);

    try {
      handleMessage(JSON.parse(msgStr));
    } catch (e) {
      log(`Parse error: ${e.message}`);
      send({ type: 'error', error: e.message });
    }
  }
});

process.stdin.on('end', () => log('stdin ended'));
process.stdin.resume();
log('Waiting for messages...');
