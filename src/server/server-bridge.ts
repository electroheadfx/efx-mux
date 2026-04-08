// server-bridge.ts -- Frontend bridge for server management commands (Phase 7)
// Wraps Rust invoke commands and Tauri event listeners for the server pane

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Start a server process with the given command in the specified working directory.
 */
export async function startServer(cmd: string, cwd: string): Promise<void> {
  await invoke('start_server', { cmd, cwd });
}

/**
 * Stop the currently running server process.
 */
export async function stopServer(): Promise<void> {
  await invoke('stop_server');
}

/**
 * Restart the server: stops existing process, then starts with new command.
 */
export async function restartServer(cmd: string, cwd: string): Promise<void> {
  await invoke('restart_server', { cmd, cwd });
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
 * Returns an unlisten function to stop listening.
 */
export async function listenServerOutput(callback: (text: string) => void): Promise<() => void> {
  return await listen<string>('server-output', (event) => callback(event.payload));
}

/**
 * Listen for server process exit events.
 * Callback receives exit code: -1 = intentional stop, >= 0 = natural exit/crash (D-14).
 * Returns an unlisten function to stop listening.
 */
export async function listenServerStopped(callback: (exitCode: number) => void): Promise<() => void> {
  return await listen<number>('server-stopped', (event) => callback(event.payload));
}

/**
 * Open a URL in the system default browser.
 */
export async function openInBrowser(url: string): Promise<void> {
  await openUrl(url);
}
