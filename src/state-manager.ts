// state-manager.ts -- Bridge between JS state and Rust state.json (Phase 4)
// Per D-11: beforeunload triggers save_state via invoke
// Per D-12: Rust uses spawn_blocking for synchronous file I/O
// Migrated to TypeScript with @preact/signals (Phase 6.1)

import { invoke } from '@tauri-apps/api/core';
import { signal } from '@preact/signals';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface ProjectEntry {
  path: string;
  name: string;
  agent: string;
  gsd_file?: string;
  server_cmd?: string;
}

export interface GitData {
  branch: string;
  modified: number;
  staged: number;
  untracked: number;
}

export interface AppState {
  version: number;
  layout: Record<string, string | boolean>;
  theme: { mode: string };
  session: Record<string, string>;
  project: { active: string | null };
  panels: Record<string, string>;
}

// ---------------------------------------------------------------------------
// App-wide signals that components can import and subscribe to
// ---------------------------------------------------------------------------

export const projects = signal<ProjectEntry[]>([]);
export const activeProjectName = signal<string | null>(null);
export const sidebarCollapsed = signal(false);
export const rightTopTab = signal('GSD');
export const rightBottomTab = signal('Bash');

// ---------------------------------------------------------------------------
// Internal state (raw Rust state blob, not UI-reactive)
// ---------------------------------------------------------------------------

let currentState: AppState | null = null;

// ---------------------------------------------------------------------------
// State persistence functions
// ---------------------------------------------------------------------------

/**
 * Load app state from Rust backend (reads ~/.config/efxmux/state.json).
 * Returns defaults if missing or corrupt (D-09, D-10).
 */
export async function loadAppState(): Promise<AppState> {
  try {
    currentState = await invoke<AppState>('load_state');
  } catch (err) {
    console.warn('[efxmux] Failed to load state, using defaults:', err);
    // Return a minimal default state matching Rust defaults
    currentState = {
      version: 1,
      layout: { 'sidebar-w': '200px', 'right-w': '25%', 'right-h-pct': '50', 'sidebar-collapsed': false },
      theme: { mode: 'dark' },
      session: { 'main-tmux-session': 'efx-mux', 'right-tmux-session': 'efx-mux-right' },
      project: { active: null },
      panels: { 'right-top-tab': 'gsd', 'right-bottom-tab': 'git' },
    };
  }

  // Set signals from loaded state
  sidebarCollapsed.value = currentState?.layout?.['sidebar-collapsed'] === true || currentState?.layout?.['sidebar-collapsed'] === 'true';
  if (currentState?.panels?.['right-top-tab']) rightTopTab.value = currentState.panels['right-top-tab'];
  if (currentState?.panels?.['right-bottom-tab']) rightBottomTab.value = currentState.panels['right-bottom-tab'];

  return currentState!;
}

/**
 * Save app state to Rust backend (writes ~/.config/efxmux/state.json).
 */
export async function saveAppState(state: AppState): Promise<void> {
  try {
    const stateJson = JSON.stringify(state);
    await invoke('save_state', { stateJson });
  } catch (err) {
    console.warn('[efxmux] Failed to save state:', err);
  }
}

/**
 * Get the current state (loaded or default).
 */
export function getCurrentState(): AppState | null {
  return currentState;
}

/**
 * Update layout fields in current state and persist.
 */
export async function updateLayout(patch: Record<string, string | boolean>): Promise<void> {
  if (!currentState) return;
  if (!currentState.layout) currentState.layout = {};
  for (const [key, value] of Object.entries(patch)) {
    currentState.layout[key] = value;
  }
  await saveAppState(currentState);
}

/**
 * Update theme mode in current state and persist.
 */
export async function updateThemeMode(mode: 'dark' | 'light'): Promise<void> {
  if (!currentState) return;
  if (!currentState.theme) currentState.theme = { mode: 'dark' };
  currentState.theme.mode = mode;
  await saveAppState(currentState);
}

/**
 * Update tmux session names in current state and persist.
 */
export async function updateSession(patch: Record<string, string>): Promise<void> {
  if (!currentState) return;
  if (!currentState.session) currentState.session = {};
  for (const [key, value] of Object.entries(patch)) {
    currentState.session[key] = value;
  }
  await saveAppState(currentState);
}

/**
 * Wire window:beforeunload to save state before app closes (D-11).
 * Call this once during app init.
 */
export function initBeforeUnload(): void {
  window.addEventListener('beforeunload', () => {
    if (currentState) {
      // Invoke save_state -- the spawn_blocking on Rust side ensures the write
      // completes before the process exits (Tauri waits for pending commands).
      invoke('save_state', { stateJson: JSON.stringify(currentState) }).catch(() => {});
    }
  });
}

// ============================================================================
// Project registry helpers (Phase 5: project system sidebar)
// ============================================================================

/**
 * Get all registered projects from Rust state.
 */
export async function getProjects(): Promise<ProjectEntry[]> {
  return await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Get the currently active project name.
 */
export async function getActiveProject(): Promise<string | null> {
  return await invoke<string | null>('get_active_project');
}

/**
 * Add a new project to the registry.
 */
export async function addProject(entry: ProjectEntry): Promise<void> {
  await invoke('add_project', { entry });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  projects.value = await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Remove a project from the registry.
 */
export async function removeProject(name: string): Promise<void> {
  await invoke('remove_project', { name });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  projects.value = await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Switch to a different project (updates state.json active field).
 * Updates activeProjectName signal and emits 'project-changed' custom event for backward compat.
 */
export async function switchProject(name: string): Promise<void> {
  await invoke('switch_project', { name });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  activeProjectName.value = name;
  // Backward compat: main.js project-changed listener (will be removed in Plan 05)
  document.dispatchEvent(new CustomEvent('project-changed', { detail: { name } }));
}

/**
 * Get git status for a project directory.
 */
export async function getGitStatus(path: string): Promise<GitData> {
  return await invoke<GitData>('get_git_status', { path });
}
