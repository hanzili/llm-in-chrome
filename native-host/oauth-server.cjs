#!/usr/bin/env node

// Based on working example from https://github.com/guest271314/NativeMessagingHosts
// KEY FIX: Set stdout to non-blocking mode to prevent EPIPE crashes
process.stdout?._handle?.setBlocking?.(false);

const http = require('http');
const url = require('url');
const fs = require('fs');
const os = require('os');

const PORT = 8080;
const CALLBACK_PATH = '/callback';
const logFile = require('path').join(os.tmpdir(), 'oauth-debug.log');

let server = null;

// Log to file only (never to stderr/stdout)
function log(msg) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
  } catch (e) {}
}

// Send message using native messaging protocol
function send(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json);
  log(`send() - Message type: ${message.type}, length: ${buffer.length} bytes`);
  log(`send() - JSON: ${json}`);
  // Write length header (4 bytes, little-endian)
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(buffer.length, 0);
  log(`send() - Writing length header: ${buffer.length} (${Array.from(lengthBuffer).join(',')})`);
  process.stdout.write(lengthBuffer);
  // Write message
  log(`send() - Writing message buffer`);
  process.stdout.write(buffer);
  log(`send() - Message sent successfully`);
}

function startServer() {
  log('startServer() called');
  if (server) {
    log('ERROR: Server already running');
    send({ type: 'error', error: 'Server already running' });
    return;
  }
  log('Creating HTTP server...');

  server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === CALLBACK_PATH) {
      const code = parsedUrl.query.code;
      const state = parsedUrl.query.state;

      if (code && state) {
        send({ type: 'oauth_success', code, state });
        log(`OAuth success: code=${code.substring(0, 10)}...`);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Success</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>✓ Authorization Successful!</h1>
            <p>You can close this tab now.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
          </html>
        `);

        setTimeout(() => stopServer(), 3000);
      } else {
        send({ type: 'oauth_error', error: 'Missing code or state' });
        res.writeHead(400);
        res.end('Missing parameters');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    const msg = {
      type: 'server_started',
      port: PORT,
      callback_url: `http://127.0.0.1:${PORT}${CALLBACK_PATH}`
    };
    log(`Server listening on port ${PORT}`);
    log(`Sending server_started message: ${JSON.stringify(msg)}`);
    send(msg);
    log(`Server started successfully`);
  });

  server.on('error', (err) => {
    send({ type: 'error', error: `Server error: ${err.message}` });
    log(`Server error: ${err.message}`);
    stopServer();
  });
}

function stopServer() {
  if (server) {
    server.close(() => {
      send({ type: 'server_stopped' });
      log('Server stopped');
      server = null;
    });
  }
}

// Get OAuth credentials from file
function getCredentials() {
  try {
    const homeDir = os.homedir();
    const credentialsPath = require('path').join(homeDir, '.claude', '.credentials.json');

    if (!fs.existsSync(credentialsPath)) {
      return null;
    }

    const fileContent = fs.readFileSync(credentialsPath, 'utf8');
    const credentialsFile = JSON.parse(fileContent);
    const oauth = credentialsFile.claudeAiOauth;

    if (!oauth || !oauth.accessToken) {
      return null;
    }

    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
      path: credentialsPath
    };
  } catch (err) {
    log(`ERROR getting credentials: ${err.message}`);
    return null;
  }
}

// Check if token is expired or about to expire (within 5 minutes)
function isTokenExpired(expiresAt) {
  if (!expiresAt) return true;
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
  return now >= (expiresAt - bufferMs);
}

// Refresh OAuth token using refresh token
async function refreshToken(refreshToken) {
  const https = require('https');

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const options = {
      hostname: 'console.anthropic.com',
      port: 443,
      path: '/v1/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    log(`Refreshing OAuth token...`);

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        log(`Token refresh response status: ${res.statusCode}`);

        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            log('Token refresh successful');
            resolve({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided
              expiresAt: Date.now() + (data.expires_in * 1000)
            });
          } catch (err) {
            reject(new Error(`Failed to parse token response: ${err.message}`));
          }
        } else {
          log(`Token refresh failed: ${body}`);
          reject(new Error(`Token refresh failed: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      log(`Token refresh error: ${err.message}`);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// Update credentials file with new tokens
function updateCredentials(newTokens) {
  try {
    const homeDir = os.homedir();
    const credentialsPath = require('path').join(homeDir, '.claude', '.credentials.json');

    const fileContent = fs.readFileSync(credentialsPath, 'utf8');
    const credentialsFile = JSON.parse(fileContent);

    // Update tokens
    credentialsFile.claudeAiOauth.accessToken = newTokens.accessToken;
    credentialsFile.claudeAiOauth.refreshToken = newTokens.refreshToken;
    credentialsFile.claudeAiOauth.expiresAt = newTokens.expiresAt;

    // Write back to file
    fs.writeFileSync(credentialsPath, JSON.stringify(credentialsFile, null, 2), 'utf8');
    log('Credentials file updated with new tokens');

    return true;
  } catch (err) {
    log(`ERROR updating credentials: ${err.message}`);
    return false;
  }
}

// Get valid access token (refresh if needed)
async function getAccessToken() {
  const creds = getCredentials();

  if (!creds) {
    log('No credentials found');
    return null;
  }

  // Check if token is expired or about to expire
  if (isTokenExpired(creds.expiresAt)) {
    log('Access token expired or expiring soon, refreshing...');

    if (!creds.refreshToken) {
      log('ERROR: No refresh token available');
      return null;
    }

    try {
      const newTokens = await refreshToken(creds.refreshToken);
      updateCredentials(newTokens);

      // Notify extension that tokens were refreshed
      send({
        type: 'tokens_refreshed',
        credentials: {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          expiresAt: newTokens.expiresAt
        }
      });

      return newTokens.accessToken;
    } catch (err) {
      log(`ERROR refreshing token: ${err.message}`);
      return null;
    }
  }

  log('Using existing valid access token');
  return creds.accessToken;
}

// Read Claude CLI credentials from ~/.claude/.credentials.json
function readCLICredentials() {
  try {
    log('readCLICredentials() called');
    const homeDir = os.homedir();
    const credentialsPath = require('path').join(homeDir, '.claude', '.credentials.json');
    log(`Credentials path: ${credentialsPath}`);

    // Check if file exists
    if (!fs.existsSync(credentialsPath)) {
      log('ERROR: Credentials file does not exist');
      send({
        type: 'credentials_not_found',
        error: 'Claude CLI credentials not found. Please run: claude login'
      });
      return;
    }

    log('Reading credentials file...');
    const fileContent = fs.readFileSync(credentialsPath, 'utf8');
    log(`File content length: ${fileContent.length} bytes`);

    const credentialsFile = JSON.parse(fileContent);
    log(`Top-level keys: ${Object.keys(credentialsFile).join(', ')}`);

    // Claude CLI stores credentials under 'claudeAiOauth' key
    const oauth = credentialsFile.claudeAiOauth;
    if (!oauth) {
      log('ERROR: No claudeAiOauth section found in credentials file');
      send({
        type: 'error',
        error: 'Invalid credentials file format. Please run: claude login'
      });
      return;
    }

    log(`OAuth keys: ${Object.keys(oauth).join(', ')}`);
    log(`Credentials (masked): ${JSON.stringify({
      accessToken: oauth.accessToken ? oauth.accessToken.substring(0, 20) + '...' : undefined,
      refreshToken: oauth.refreshToken ? oauth.refreshToken.substring(0, 20) + '...' : undefined,
      expiresAt: oauth.expiresAt,
      scopes: oauth.scopes,
      subscriptionType: oauth.subscriptionType
    }, null, 2)}`);

    // Send credentials back to extension
    send({
      type: 'cli_credentials',
      credentials: {
        accessToken: oauth.accessToken,
        refreshToken: oauth.refreshToken,
        expiresAt: oauth.expiresAt,
        scopes: oauth.scopes,
        subscriptionType: oauth.subscriptionType
      }
    });
    log('Credentials sent successfully');

  } catch (err) {
    log(`ERROR reading credentials: ${err.message}`);
    log(`Stack: ${err.stack}`);
    send({
      type: 'error',
      error: `Failed to read Claude CLI credentials: ${err.message}`
    });
  }
}

// Proxy API call to Anthropic using CLI OAuth tokens
async function proxyApiCall(requestData) {
  const https = require('https');

  try {
    log('proxyApiCall() called');
    log(`Request: ${JSON.stringify({
      url: requestData.url,
      method: requestData.method,
      bodyLength: requestData.body ? requestData.body.length : 0
    })}`);

    // Get access token (will refresh if expired)
    const accessToken = await getAccessToken();
    if (!accessToken) {
      send({
        type: 'api_error',
        error: 'No OAuth token found. Please run: claude login'
      });
      return;
    }

    log(`Access token obtained (first 20 chars): ${accessToken.substring(0, 20)}...`);

    // Parse URL
    const urlParts = new URL(requestData.url);

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
      ...requestData.headers
    };

    log(`Headers: ${JSON.stringify(Object.keys(headers))}`);

    // Make HTTPS request
    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || 443,
      path: urlParts.pathname + urlParts.search,
      method: requestData.method || 'POST',
      headers: headers
    };

    log(`Making request to ${options.hostname}${options.path}`);

    const req = https.request(options, (res) => {
      log(`Response status: ${res.statusCode}`);
      log(`Response headers: ${JSON.stringify(res.headers)}`);

      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        log(`Response body length: ${responseBody.length} bytes`);

        send({
          type: 'api_response',
          status: res.statusCode,
          headers: res.headers,
          body: responseBody
        });
      });
    });

    req.on('error', (err) => {
      log(`Request error: ${err.message}`);
      send({
        type: 'api_error',
        error: `API request failed: ${err.message}`
      });
    });

    // Send request body
    if (requestData.body) {
      req.write(requestData.body);
    }

    req.end();

  } catch (err) {
    log(`ERROR in proxyApiCall: ${err.message}`);
    log(`Stack: ${err.stack}`);
    send({
      type: 'api_error',
      error: `Failed to proxy API call: ${err.message}`
    });
  }
}

// Read messages from stdin
function readMessages() {
  let buffer = Buffer.alloc(0);
  let headerRead = false;
  let messageLength = 0;

  process.stdin.on('data', (chunk) => {
    try {
      log(`stdin data received: ${chunk.length} bytes`);
      buffer = Buffer.concat([buffer, chunk]);
      log(`Total buffer size: ${buffer.length} bytes`);

      while (true) {
        if (!headerRead && buffer.length >= 4) {
          messageLength = buffer.readUInt32LE(0);
          log(`Read message length from header: ${messageLength} bytes`);
          headerRead = true;
        }

        if (headerRead && buffer.length >= 4 + messageLength) {
          log(`Complete message received (${messageLength} bytes)`);
          const messageBuffer = buffer.slice(4, 4 + messageLength);
          const messageStr = messageBuffer.toString();
          log(`Message string: ${messageStr}`);
          const message = JSON.parse(messageStr);

          log(`Parsed message: ${JSON.stringify(message)}`);
          log(`Message type: ${message.type}`);

          // Handle message
          if (message.type === 'start_server') {
            log('Handling start_server command');
            startServer();
          } else if (message.type === 'stop_server') {
            log('Handling stop_server command');
            stopServer();
          } else if (message.type === 'ping') {
            log('Handling ping command');
            send({ type: 'pong' });
          } else if (message.type === 'read_cli_credentials') {
            log('Handling read_cli_credentials command');
            readCLICredentials();
          } else if (message.type === 'proxy_api_call') {
            log('Handling proxy_api_call command');
            proxyApiCall(message.data);
          } else {
            log(`ERROR: Unknown message type: ${message.type}`);
            send({ type: 'error', error: `Unknown message type: ${message.type}` });
          }

          buffer = buffer.slice(4 + messageLength);
          headerRead = false;
          messageLength = 0;
        } else {
          break;
        }
      }
    } catch (err) {
      log(`Error: ${err.message}`);
      send({ type: 'error', error: err.message });
    }
  });

  process.stdin.on('end', () => {
    log('=== stdin ended ===');
  });

  process.stdin.on('error', (err) => {
    log(`!!! stdin error: ${err.message}`);
    log(`Stack: ${err.stack}`);
  });

  log('stdin listener registered, waiting for messages...');
}

// Main
try {
  log('=== Native Messaging Host Started ===');
  log(`PID: ${process.pid}`);
  log(`Node: ${process.version}`);
  log(`Working directory: ${process.cwd()}`);
  log(`Script path: ${__filename}`);
  log(`Arguments: ${JSON.stringify(process.argv)}`);

  process.stdin.resume();
  readMessages();

  process.on('SIGINT', () => {
    log('SIGINT received');
    stopServer();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.message}`);
    log(`Stack: ${err.stack}`);
    stopServer();
    process.exit(1);
  });
} catch (err) {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
}
