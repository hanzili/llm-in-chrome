#!/usr/bin/env node
/**
 * Native Messaging Host for LLM in Chrome
 * - Reads Claude CLI credentials from ~/.claude/.credentials.json
 * - Proxies API calls to Anthropic (bypasses CORS)
 * - Auto-refreshes expired OAuth tokens
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

// OAuth configuration (same as oauth-manager.js)
const OAUTH_CONFIG = {
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
};

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

// Read Claude CLI credentials
function getClaudeCredentials() {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  if (!fs.existsSync(credPath)) return null;

  try {
    const content = fs.readFileSync(credPath, 'utf8');
    const creds = JSON.parse(content);
    return creds.claudeAiOauth || null;
  } catch (e) {
    log(`Error reading Claude credentials: ${e.message}`);
    return null;
  }
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
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
      'x-app': 'cli',
      'user-agent': 'claude-cli/1.0.113 (external, sdk-cli)',
      'x-stainless-lang': 'js',
      'x-stainless-package-version': '0.60.0',
      'x-stainless-os': 'Darwin',
      'x-stainless-arch': 'arm64',
      'x-stainless-runtime': 'node',
      'x-stainless-runtime-version': 'v22.7.0',
      'x-stainless-retry-count': '0',
      'x-stainless-timeout': '600',
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
      // Handle 401 Unauthorized - try to refresh token (Claude only, and only once)
      if (res.statusCode === 401 && isClaude && !isRetry && claudeCreds?.refreshToken) {
        log('Got 401, attempting token refresh...');

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
              error: `OAuth token expired and refresh failed: ${refreshErr.message}. Run: claude login`
            });
          }
        });
        return;
      }

      if (isStreaming && res.statusCode === 200) {
        // Handle SSE streaming
        let buffer = '';

        res.on('data', chunk => {
          buffer += chunk.toString();

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
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
          log('Stream ended');
          send({ type: 'stream_end' });
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

// Handle incoming messages
function handleMessage(msg) {
  log(`Message: ${msg.type}`);

  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' });
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
