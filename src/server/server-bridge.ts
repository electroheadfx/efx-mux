// server-bridge.ts -- Frontend bridge for server management commands (Phase 7)
// Wraps Rust invoke commands and Tauri event listeners for the server pane
// 07-06: All commands now accept projectId for per-project server management

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Start a server process with the given command in the specified working directory.
 * @param projectId - Project name used as key in Rust ServerProcesses HashMap
 */
export async function startServer(cmd: string, cwd: string, projectId: string): Promise<void> {
  await invoke('start_server', { cmd, cwd, projectId });
}

/**
 * Stop the running server process for a specific project.
 * @param projectId - Project name identifying which server to stop
 */
export async function stopServer(projectId: string): Promise<void> {
  await invoke('stop_server', { projectId });
}

/**
 * Restart the server for a specific project: stops existing process, then starts with new command.
 * @param projectId - Project name identifying which server to restart
 */
export async function restartServer(cmd: string, cwd: string, projectId: string): Promise<void> {
  await invoke('restart_server', { cmd, cwd, projectId });
}

/**
 * Detect whether an agent binary exists in PATH.
 * Returns the agent name if found, throws if not found.
 */
export async function detectAgent(agent: string): Promise<string> {
  return await invoke<string>('detect_agent', { agent });
}

/**
 * Listen for server stdout/stderr output events.
 * 07-06: Payload now includes project identifier for per-project filtering.
 * Returns an unlisten function to stop listening.
 */
export async function listenServerOutput(callback: (project: string, text: string) => void): Promise<() => void> {
  return await listen<{ project: string; text: string }>('server-output', (event) =>
    callback(event.payload.project, event.payload.text)
  );
}

/**
 * Listen for server process exit events.
 * 07-06: Payload now includes project identifier for per-project filtering.
 * Callback receives exit code: >= 0 = natural exit/crash (D-14).
 * Returns an unlisten function to stop listening.
 */
export async function listenServerStopped(callback: (project: string, exitCode: number) => void): Promise<() => void> {
  return await listen<{ project: string; code: number }>('server-stopped', (event) =>
    callback(event.payload.project, event.payload.code)
  );
}

/**
 * Open a URL in the system default browser.
 */
export async function openInBrowser(url: string): Promise<void> {
  await openUrl(url);
}
