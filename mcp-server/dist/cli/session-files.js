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
 * Ensure session directory exists
 */
export function ensureSessionDir() {
    mkdirSync(SESSION_DIR, { recursive: true });
}
/**
 * Get path to session status file
 */
export function getSessionFilePath(sessionId) {
    return join(SESSION_DIR, `${sessionId}.json`);
}
/**
 * Get path to session log file
 */
export function getSessionLogPath(sessionId) {
    return join(SESSION_DIR, `${sessionId}.log`);
}
/**
 * Write session status to file
 */
export function writeSessionStatus(sessionId, status) {
    ensureSessionDir();
    const filePath = getSessionFilePath(sessionId);
    let current;
    // Read existing or create new
    if (existsSync(filePath)) {
        try {
            current = JSON.parse(readFileSync(filePath, 'utf-8'));
        }
        catch {
            current = createInitialStatus(sessionId, status.task || '');
        }
    }
    else {
        current = createInitialStatus(sessionId, status.task || '');
    }
    // Merge updates
    const updated = {
        ...current,
        ...status,
        updated_at: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(updated, null, 2));
}
/**
 * Create initial session status
 */
function createInitialStatus(sessionId, task) {
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
export function readSessionStatus(sessionId) {
    const filePath = getSessionFilePath(sessionId);
    if (!existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
    catch (err) {
        // Log corruption errors - helps debug data issues
        console.error(`[Session] Failed to parse ${sessionId}.json:`, err.message);
        return null;
    }
}
/**
 * Append to session log
 */
export function appendSessionLog(sessionId, message) {
    ensureSessionDir();
    const logPath = getSessionLogPath(sessionId);
    const timestamp = new Date().toISOString();
    appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}
/**
 * Read session log
 */
export function readSessionLog(sessionId, lines) {
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
export function listSessions() {
    ensureSessionDir();
    const files = readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    const sessions = [];
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
export function listActiveSessions() {
    return listSessions().filter(s => s.status === 'starting' ||
        s.status === 'planning' ||
        s.status === 'exploring' ||
        s.status === 'running');
}
/**
 * Delete session files
 */
export function deleteSessionFiles(sessionId) {
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
export function addTraceEntry(sessionId, agent, type, description) {
    const status = readSessionStatus(sessionId);
    if (!status)
        return;
    const entry = {
        time: new Date().toISOString(),
        type,
        description,
    };
    const traceKey = `${agent}_trace`;
    const trace = status[traceKey];
    trace.push(entry);
    writeSessionStatus(sessionId, { [traceKey]: trace });
    // Also append to log
    appendSessionLog(sessionId, `[${agent}] ${type}: ${description}`);
}
