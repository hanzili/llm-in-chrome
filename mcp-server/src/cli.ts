#!/usr/bin/env node

/**
 * LLM Browser CLI
 *
 * Command-line interface for browser automation.
 * Alternative to the MCP server - simpler, direct communication.
 *
 * Usage:
 *   llm-browser start "task" --url https://example.com
 *   llm-browser status [session_id]
 *   llm-browser message <session_id> "message"
 *   llm-browser logs <session_id> [--follow]
 *   llm-browser stop <session_id> [--remove]
 *   llm-browser screenshot <session_id>
 */

import { existsSync, readFileSync, watch } from 'fs';

import { NativeHostConnection, NativeMessage } from './ipc/index.js';
import { getOrchestrator, Orchestrator } from './orchestrator/index.js';
import { initializeLLMClient, handleLLMResponse, getPendingRequestIds } from './llm/client.js';
import {
  writeSessionStatus,
  readSessionStatus,
  appendSessionLog,
  addTraceEntry,
  listSessions,
  deleteSessionFiles,
  getSessionLogPath,
} from './cli/session-files.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Shared state
let connection: NativeHostConnection;
let orchestrator: Orchestrator;

// Track active session IDs for filtered polling
// This prevents race conditions with MCP server consuming our results
const activeSessionIds: Set<string> = new Set();

/**
 * Initialize and connect to native host
 */
async function initConnection(): Promise<void> {
  if (connection?.isConnected()) return;

  connection = new NativeHostConnection({
    onStderr: (text) => console.error(`[Native] ${text}`),
    onDisconnect: (code) => console.error(`[CLI] Native host exited: ${code}`),
  });

  connection.onMessage(handleNativeMessage);
  await connection.connect();
  console.error('[CLI] Connected to native host');
}

/**
 * Handle message from native host
 */
function handleNativeMessage(message: NativeMessage): void {
  const { type, sessionId, ...data } = message;

  // Handle LLM responses (direct)
  if (type === 'llm_response') {
    handleLLMResponse(data.requestId || sessionId || '', {
      content: data.content,
      error: data.error,
      usage: data.usage,
    });
    return;
  }

  // Handle batch results (from mcp_poll_results)
  if (type === 'mcp_results' && Array.isArray(data.results)) {
    for (const result of data.results) {
      if (result.type === 'llm_response') {
        handleLLMResponse(result.requestId, {
          content: result.content,
          error: result.error,
          usage: result.usage,
        });
        continue;
      }
      processSessionResult(result);
    }
    return;
  }

  // Handle single result
  if (sessionId) {
    processSessionResult({ type, sessionId, ...data });
  }
}

/**
 * Process a session result and update session files
 * (Renamed from processResult for clarity - this handles session-specific results)
 */
function processSessionResult(result: any): void {
  const { type, sessionId, ...data } = result;

  if (!sessionId) return;

  const currentStep = data.step || data.status || data.message;

  switch (type) {
    case 'task_update':
      if (currentStep) {
        // Determine agent from step prefix
        let agent: 'planning_agent' | 'explorer_agent' | 'browser_agent' = 'browser_agent';
        if (currentStep.includes('planning_agent')) agent = 'planning_agent';
        else if (currentStep.includes('explorer_agent')) agent = 'explorer_agent';

        addTraceEntry(sessionId, agent, 'info', currentStep);

        writeSessionStatus(sessionId, {
          status: 'running',
          agent_phase: agent,
        });
      }
      break;

    case 'task_complete':
      // First, notify orchestrator so it can handle exploration completion
      const answer = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);

      // Check if this was an exploration BEFORE marking complete
      const session = orchestrator.getSession(sessionId);
      const wasExploring = session?.collectedInfo._exploring === 'true';
      const originalTask = session?.collectedInfo._originalTask;

      console.error(`[CLI] task_complete: sessionId=${sessionId}, wasExploring=${wasExploring}, originalTask=${originalTask?.substring(0, 50)}`);

      // Notify orchestrator (this transitions to COMPLETED)
      orchestrator.updateFromBrowserEvent(sessionId, 'complete', { answer });

      if (wasExploring && originalTask) {
        // Exploration finished - now run the original task
        console.log(`\n[CLI] Exploration completed for ${session!.domain}`);
        console.log(`[CLI] Now executing original task: ${originalTask}`);

        addTraceEntry(sessionId, 'explorer_agent', 'explorer_agent:complete',
          `Exploration finished, continuing with original task`);

        writeSessionStatus(sessionId, {
          status: 'running',
          agent_phase: 'browser_agent',
          exploring: false,
        });

        // Send follow-up message to continue with original task
        connection.send({
          type: 'mcp_send_message',
          sessionId,
          message: `Great, now that you've explored the site, please complete the original task: ${originalTask}`,
        }).catch(err => console.error('[CLI] Failed to send follow-up:', err));

        appendSessionLog(sessionId, `[EXPLORATION COMPLETE] Now executing: ${originalTask}`);
      } else {
        // Normal task completion
        writeSessionStatus(sessionId, {
          status: 'complete',
          agent_phase: 'complete',
          result: data.result || currentStep,
        });
        appendSessionLog(sessionId, `[COMPLETE] ${answer}`);
        console.log(`\n[CLI] Task completed: ${sessionId}`);
        console.log(answer);
        // Clean up session tracking
        activeSessionIds.delete(sessionId);
      }
      break;

    case 'task_error':
      orchestrator.updateFromBrowserEvent(sessionId, 'error', { error: data.error });
      writeSessionStatus(sessionId, {
        status: 'error',
        agent_phase: 'error',
        error: data.error,
      });
      appendSessionLog(sessionId, `[ERROR] ${data.error}`);
      console.error(`\n[CLI] Task error: ${data.error}`);
      // Clean up session tracking
      activeSessionIds.delete(sessionId);
      break;
  }
}

/**
 * Send message to native host (wrapper for compatibility)
 */
async function sendToNative(message: NativeMessage): Promise<void> {
  await connection.send(message);
}

/**
 * Start polling for results from the extension
 * Uses filtered polling to only receive results for our pending requests
 */
function startPolling(): void {
  setInterval(() => {
    if (!connection?.isConnected()) return;

    // Collect all IDs we're interested in: pending LLM requests + active sessions
    const pendingLLMIds = getPendingRequestIds();
    const sessionIds = Array.from(activeSessionIds);
    const requestIds = [...pendingLLMIds, ...sessionIds];

    // Pass request IDs filter to prevent race condition with MCP server
    // Note: Errors are logged (not swallowed) but don't crash the polling loop
    connection.send({ type: 'mcp_poll_results', requestIds }).catch(err => {
      console.error('[CLI] Poll send error:', err.message);
    });
  }, 500);
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Start a new browser task
 */
async function cmdStart(): Promise<void> {
  // Parse arguments
  const task = args[1];
  if (!task) {
    console.error('Usage: llm-browser start "task description" [--url URL] [--context TEXT]');
    process.exit(1);
  }

  let url: string | undefined;
  let context: string | undefined;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--url' || args[i] === '-u') {
      url = args[++i];
    } else if (args[i] === '--context' || args[i] === '-c') {
      context = args[++i];
    }
  }

  console.log('[CLI] Starting browser task...');
  console.log(`  Task: ${task}`);
  if (url) console.log(`  URL: ${url}`);
  if (context) console.log(`  Context: ${context.substring(0, 50)}...`);

  // Initialize connection and orchestrator
  await initConnection();
  initializeLLMClient(sendToNative);
  orchestrator = getOrchestrator();

  // Start polling BEFORE starting the task
  // This is critical because planning phase sends LLM requests that need polling
  startPolling();

  // Set up browser execute callback - bridges orchestrator to native host
  orchestrator.setBrowserExecuteCallback(async (sessionId, taskText, taskUrl, taskContext, siteKnowledge) => {
    let fullContext = taskContext || '';
    if (siteKnowledge) {
      fullContext = `${fullContext}\n\n--- Site Knowledge ---\n${siteKnowledge}`;
    }

    await connection.send({
      type: 'mcp_start_task',
      sessionId,
      task: taskText,
      url: taskUrl,
      context: fullContext.trim() || undefined,
    });
  });

  // Start the task
  const result = await orchestrator.startTask({ task, url, context });

  // Track this session for filtered polling (prevents race condition with MCP server)
  activeSessionIds.add(result.sessionId);

  // Write initial status
  writeSessionStatus(result.sessionId, {
    session_id: result.sessionId,
    status: 'running',
    task,
    url,
    context,
    domain: result.domain,
    agent_phase: result.exploring ? 'explorer_agent' : 'browser_agent',
    exploring: result.exploring || false,
  });

  // Add planning trace
  const session = orchestrator.getSession(result.sessionId);
  if (session?.executionTrace) {
    for (const trace of session.executionTrace) {
      if (trace.type?.startsWith('planning_agent:')) {
        addTraceEntry(result.sessionId, 'planning_agent', trace.type, trace.description);
      } else if (trace.type?.startsWith('explorer_agent:')) {
        addTraceEntry(result.sessionId, 'explorer_agent', trace.type, trace.description);
      }
    }
  }

  console.log(`\n[CLI] Session started: ${result.sessionId}`);
  console.log(`  Status file: ~/.llm-in-chrome/sessions/${result.sessionId}.json`);
  console.log(`  Log file: ~/.llm-in-chrome/sessions/${result.sessionId}.log`);
  console.log(`\nMonitor with:`);
  console.log(`  llm-browser status ${result.sessionId}`);
  console.log(`  llm-browser logs ${result.sessionId} --follow`);

  // Keep running until task completes
  const checkInterval = setInterval(() => {
    const status = readSessionStatus(result.sessionId);
    if (status && (status.status === 'complete' || status.status === 'error')) {
      clearInterval(checkInterval);
      setTimeout(() => process.exit(0), 1000);
    }
  }, 1000);
}

/**
 * Show status of session(s)
 */
function cmdStatus(): void {
  const sessionId = args[1];

  if (sessionId) {
    const status = readSessionStatus(sessionId);
    if (!status) {
      console.error(`Session not found: ${sessionId}`);
      process.exit(1);
    }
    console.log(JSON.stringify(status, null, 2));
  } else {
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log('No sessions found.');
    } else {
      console.log(`Found ${sessions.length} session(s):\n`);
      for (const s of sessions) {
        const statusEmoji = {
          starting: '🔄',
          planning: '🧠',
          exploring: '🔍',
          running: '▶️',
          complete: '✅',
          error: '❌',
          stopped: '⏹️',
        }[s.status] || '❓';

        console.log(`${statusEmoji} ${s.session_id}`);
        console.log(`   Task: ${s.task.substring(0, 60)}${s.task.length > 60 ? '...' : ''}`);
        console.log(`   Status: ${s.status} (${s.agent_phase})`);
        console.log(`   Updated: ${s.updated_at}`);
        console.log('');
      }
    }
  }
}

/**
 * Send message to a session
 */
async function cmdMessage(): Promise<void> {
  const sessionId = args[1];
  const message = args[2];

  if (!sessionId || !message) {
    console.error('Usage: llm-browser message <session_id> "message"');
    process.exit(1);
  }

  const status = readSessionStatus(sessionId);
  if (!status) {
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  await initConnection();

  await connection.send({
    type: 'mcp_send_message',
    sessionId,
    message,
  });

  appendSessionLog(sessionId, `[USER] ${message}`);
  console.log(`Message sent to session ${sessionId}`);
}

/**
 * Show logs for a session
 */
function cmdLogs(): void {
  const sessionId = args[1];
  const follow = args.includes('--follow') || args.includes('-f');
  const lines = 50;

  if (!sessionId) {
    console.error('Usage: llm-browser logs <session_id> [--follow]');
    process.exit(1);
  }

  const logPath = getSessionLogPath(sessionId);

  if (!existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    process.exit(1);
  }

  // Print existing content
  const content = readFileSync(logPath, 'utf-8');
  const allLines = content.split('\n');
  console.log(allLines.slice(-lines).join('\n'));

  if (follow) {
    console.log('\n--- Watching for new logs (Ctrl+C to stop) ---\n');

    let lastSize = content.length;

    const watcher = watch(logPath, () => {
      const newContent = readFileSync(logPath, 'utf-8');
      if (newContent.length > lastSize) {
        process.stdout.write(newContent.slice(lastSize));
        lastSize = newContent.length;
      }
    });

    process.on('SIGINT', () => {
      watcher.close();
      process.exit(0);
    });
  }
}

/**
 * Stop a session
 */
async function cmdStop(): Promise<void> {
  const sessionId = args[1];
  const remove = args.includes('--remove') || args.includes('-r');

  if (!sessionId) {
    console.error('Usage: llm-browser stop <session_id> [--remove]');
    process.exit(1);
  }

  const status = readSessionStatus(sessionId);
  if (!status) {
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  await initConnection();

  await connection.send({
    type: 'mcp_stop_task',
    sessionId,
    remove,
  });

  if (remove) {
    deleteSessionFiles(sessionId);
    console.log(`Session ${sessionId} stopped and removed.`);
  } else {
    writeSessionStatus(sessionId, { status: 'stopped' });
    console.log(`Session ${sessionId} stopped. Use --remove to delete files.`);
  }
}

/**
 * Take screenshot
 */
async function cmdScreenshot(): Promise<void> {
  const sessionId = args[1];

  await initConnection();

  await connection.send({
    type: 'mcp_screenshot',
    sessionId: sessionId || `screenshot-${Date.now()}`,
  });

  console.log('Screenshot requested. Check the browser extension.');
}

/**
 * Show help
 */
function cmdHelp(): void {
  console.log(`
LLM Browser CLI - Browser automation from the command line

Usage:
  llm-browser <command> [options]

Commands:
  start <task>              Start a new browser task
    --url, -u <url>         Starting URL
    --context, -c <text>    Context information for the task

  status [session_id]       Show status of session(s)

  message <session_id> <msg>  Send a follow-up message to a session

  logs <session_id>         Show logs for a session
    --follow, -f            Watch logs in real-time

  stop <session_id>         Stop a session
    --remove, -r            Also delete session files

  screenshot [session_id]   Take a screenshot

  help                      Show this help message

Examples:
  llm-browser start "Search for AI news" --url https://google.com
  llm-browser status abc123
  llm-browser logs abc123 --follow
  llm-browser message abc123 "Click the first result"
  llm-browser stop abc123 --remove
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  switch (command) {
    case 'start':
      await cmdStart();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'message':
      await cmdMessage();
      break;
    case 'logs':
      cmdLogs();
      break;
    case 'stop':
      await cmdStop();
      break;
    case 'screenshot':
      await cmdScreenshot();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      cmdHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[CLI] Error:', err);
  process.exit(1);
});
