/**
 * Session Files Module
 *
 * Manages file-based session storage for the CLI.
 * Sessions are stored as JSON files in ~/.llm-in-chrome/sessions/
 */
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
export declare function ensureSessionDir(): void;
/**
 * Get path to session status file
 */
export declare function getSessionFilePath(sessionId: string): string;
/**
 * Get path to session log file
 */
export declare function getSessionLogPath(sessionId: string): string;
/**
 * Write session status to file
 */
export declare function writeSessionStatus(sessionId: string, status: Partial<SessionFileStatus>): void;
/**
 * Read session status from file
 */
export declare function readSessionStatus(sessionId: string): SessionFileStatus | null;
/**
 * Append to session log
 */
export declare function appendSessionLog(sessionId: string, message: string): void;
/**
 * Read session log
 */
export declare function readSessionLog(sessionId: string, lines?: number): string;
/**
 * List all sessions
 */
export declare function listSessions(): SessionFileStatus[];
/**
 * List active sessions only
 */
export declare function listActiveSessions(): SessionFileStatus[];
/**
 * Delete session files
 */
export declare function deleteSessionFiles(sessionId: string): boolean;
/**
 * Add trace entry to session
 */
export declare function addTraceEntry(sessionId: string, agent: 'planning_agent' | 'explorer_agent' | 'browser_agent', type: string, description: string): void;
