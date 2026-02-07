/**
 * Session Files Module
 *
 * Manages file-based session storage for the CLI.
 * Sessions are stored as JSON files in ~/.llm-in-chrome/sessions/
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, appendFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Session directory
const SESSION_DIR = join(homedir(), '.llm-in-chrome', 'sessions');

/**
 * Session status stored in JSON file
 */
export interface SessionFileStatus {
  session_id: string;
  status: 'starting' | 'planning' | 'exploring' | 'running' | 'complete' | 'error' | 'stopped';
  task: string;
  url?: string;
  context?: string;
  domain?: string;

  agent_phase: 'planning_agent' | 'explorer_agent' | 'browser_agent' | 'complete' | 'error';
  has_site_knowledge: boolean;
  exploring: boolean;

  started_at: string;
  updated_at: string;

  planning_agent_trace: Array<{
    time: string;
    type: string;
    description: string;
  }>;

  explorer_agent_trace: Array<{
    time: string;
    type: string;
    description: string;
  }>;

  browser_agent_trace: Array<{
    time: string;
    type: string;
    description: string;
  }>;

  needs_input: boolean;
  input_prompt?: string;

  result?: string;
  error?: string;
}

/**
 * Ensure session directory exists
 */
export function ensureSessionDir(): void {
  mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Get path to session status file
 */
export function getSessionFilePath(sessionId: string): string {
  return join(SESSION_DIR, `${sessionId}.json`);
}

/**
 * Get path to session log file
 */
export function getSessionLogPath(sessionId: string): string {
  return join(SESSION_DIR, `${sessionId}.log`);
}

/**
 * Write session status to file
 */
export function writeSessionStatus(sessionId: string, status: Partial<SessionFileStatus>): void {
  ensureSessionDir();

  const filePath = getSessionFilePath(sessionId);
  let current: SessionFileStatus;

  // Read existing or create new
  if (existsSync(filePath)) {
    try {
      current = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      current = createInitialStatus(sessionId, status.task || '');
    }
  } else {
    current = createInitialStatus(sessionId, status.task || '');
  }

  // Merge updates
  const updated: SessionFileStatus = {
    ...current,
    ...status,
    updated_at: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(updated, null, 2));
}

/**
 * Create initial session status
 */
function createInitialStatus(sessionId: string, task: string): SessionFileStatus {
  return {
    session_id: sessionId,
    status: 'starting',
    task,
    agent_phase: 'planning_agent',
    has_site_knowledge: false,
    exploring: false,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    planning_agent_trace: [],
    explorer_agent_trace: [],
    browser_agent_trace: [],
    needs_input: false,
  };
}

/**
 * Read session status from file
 */
export function readSessionStatus(sessionId: string): SessionFileStatus | null {
  const filePath = getSessionFilePath(sessionId);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err: any) {
    // Log corruption errors - helps debug data issues
    console.error(`[Session] Failed to parse ${sessionId}.json:`, err.message);
    return null;
  }
}

/**
 * Append to session log
 */
export function appendSessionLog(sessionId: string, message: string): void {
  ensureSessionDir();
  const logPath = getSessionLogPath(sessionId);
  const timestamp = new Date().toISOString();
  appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

/**
 * Read session log
 */
export function readSessionLog(sessionId: string, lines?: number): string {
  const logPath = getSessionLogPath(sessionId);

  if (!existsSync(logPath)) {
    return '';
  }

  const content = readFileSync(logPath, 'utf-8');

  if (lines) {
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  }

  return content;
}

/**
 * List all sessions
 */
export function listSessions(): SessionFileStatus[] {
  ensureSessionDir();

  const files = readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
  const sessions: SessionFileStatus[] = [];

  for (const file of files) {
    const sessionId = file.replace('.json', '');
    const status = readSessionStatus(sessionId);
    if (status) {
      sessions.push(status);
    }
  }

  // Sort by updated_at descending
  sessions.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return sessions;
}

/**
 * List active sessions only
 */
export function listActiveSessions(): SessionFileStatus[] {
  return listSessions().filter(s =>
    s.status === 'starting' ||
    s.status === 'planning' ||
    s.status === 'exploring' ||
    s.status === 'running'
  );
}

/**
 * Delete session files
 */
export function deleteSessionFiles(sessionId: string): boolean {
  const statusPath = getSessionFilePath(sessionId);
  const logPath = getSessionLogPath(sessionId);

  let deleted = false;

  if (existsSync(statusPath)) {
    unlinkSync(statusPath);
    deleted = true;
  }

  if (existsSync(logPath)) {
    unlinkSync(logPath);
    deleted = true;
  }

  return deleted;
}

/**
 * Add trace entry to session
 */
export function addTraceEntry(
  sessionId: string,
  agent: 'planning_agent' | 'explorer_agent' | 'browser_agent',
  type: string,
  description: string
): void {
  const status = readSessionStatus(sessionId);
  if (!status) return;

  const entry = {
    time: new Date().toISOString(),
    type,
    description,
  };

  const traceKey = `${agent}_trace` as keyof SessionFileStatus;
  const trace = status[traceKey] as Array<typeof entry>;
  trace.push(entry);

  writeSessionStatus(sessionId, { [traceKey]: trace });

  // Also append to log
  appendSessionLog(sessionId, `[${agent}] ${type}: ${description}`);
}
