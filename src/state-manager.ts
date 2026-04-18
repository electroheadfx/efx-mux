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
  server_url?: string;
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
  project: { active: string | null; projects: ProjectEntry[] };
  panels: Record<string, string>;
}

// ---------------------------------------------------------------------------
// App-wide signals that components can import and subscribe to
// ---------------------------------------------------------------------------

export const projects = signal<ProjectEntry[]>([]);
export const activeProjectName = signal<string | null>(null);
export const sidebarCollapsed = signal(false);
export const rightTopTab = signal('File Tree');
// (Phase 20 D-01/D-20: removed rightBottomTab signal — right panel no longer has a separate bottom tab.)
export const gsdSubTab = signal('State'); // Phase 19 D-02: default sub-tab is State

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
    // Ensure project.projects exists even if loaded from older state.json (T-08-07-02)
    if (!currentState.project) currentState.project = { active: null, projects: [] };
    if (!currentState.project.projects) currentState.project.projects = [];
  } catch (err) {
    console.warn('[efxmux] Failed to load state, using defaults:', err);
    // Return a minimal default state matching Rust defaults (Phase 20 D-20: legacy keys dropped)
    currentState = {
      version: 1,
      layout: { 'sidebar-w': '200px', 'right-w': '25%', 'sidebar-collapsed': false },
      theme: { mode: 'dark' },
      session: { 'main-tmux-session': 'efx-mux' },
      project: { active: null, projects: [] },
      panels: { 'right-top-tab': 'File Tree', 'gsd-sub-tab': 'State' },
    };
  }

  // Phase 20 D-20: silent, idempotent migration — drop legacy right-panel layout keys.
  // These keys were written by the pre-Phase-20 right-panel layout and have no consumers anymore.
  // Deleting pre-signal-restore ensures signals never read stale migrated values.
  if (currentState) {
    delete (currentState.panels as Record<string, string | undefined>)['right-bottom-tab'];
    delete (currentState.session as Record<string, string | undefined>)['right-tmux-session'];
    delete (currentState.layout as Record<string, string | boolean | undefined>)['right-h-pct'];
  }

  // Phase 22 D-10: migrate legacy terminal-tabs persistence keys to hierarchical scope ids.
  // Legacy:  terminal-tabs:<project>          → terminal-tabs:<project>:main-0
  //          right-terminal-tabs:<project>   → terminal-tabs:<project>:right-0
  // Idempotent: re-running is a no-op after first pass.
  if (currentState) {
    const session = currentState.session as Record<string, string | undefined>;
    for (const key of Object.keys(session)) {
      const mainLegacy = /^terminal-tabs:([^:]+)$/.exec(key);
      if (mainLegacy) {
        const project = mainLegacy[1];
        const target = `terminal-tabs:${project}:main-0`;
        if (session[target] === undefined) session[target] = session[key];
        delete session[key];
        continue;
      }
      const rightLegacy = /^right-terminal-tabs:(.+)$/.exec(key);
      if (rightLegacy) {
        const project = rightLegacy[1];
        const target = `terminal-tabs:${project}:right-0`;
        if (session[target] === undefined) session[target] = session[key];
        delete session[key];
      }
    }

    // Phase 22 D-06: drop sticky ids 'file-tree' / 'gsd' from persisted activeTabId
    // in any per-scope blob. D-02 defaults re-seed at render time.
    for (const key of Object.keys(session)) {
      if (!/^terminal-tabs:.+:(main|right)-[0-2]$/.test(key)) continue;
      const raw = session[key];
      if (raw === undefined) continue;
      try {
        const parsed = JSON.parse(raw) as { activeTabId?: string };
        if (parsed.activeTabId === 'file-tree' || parsed.activeTabId === 'gsd') {
          parsed.activeTabId = '';
          session[key] = JSON.stringify(parsed);
        }
      } catch { /* corrupt entry — fail-soft */ }
    }
  }

  // Set signals from loaded state
  sidebarCollapsed.value = currentState?.layout?.['sidebar-collapsed'] === true || currentState?.layout?.['sidebar-collapsed'] === 'true';
  if (currentState?.panels?.['right-top-tab']) rightTopTab.value = currentState.panels['right-top-tab'];
  if (currentState?.panels?.['gsd-sub-tab']) gsdSubTab.value = currentState.panels['gsd-sub-tab'];

  // Restore projects and active project from persisted state (T-08-07-02)
  if (currentState?.project?.projects?.length) {
    projects.value = currentState.project.projects;
  }
  if (currentState?.project?.active) {
    activeProjectName.value = currentState.project.active;
  }

  return currentState!;
}

/**
 * Save app state to Rust backend (writes ~/.config/efxmux/state.json).
 */
export async function saveAppState(state: AppState): Promise<void> {
  try {
    // Sync project data from signals before every save (T-08-07-02)
    if (!state.project) state.project = { active: null, projects: [] };
    state.project.active = activeProjectName.value;
    state.project.projects = projects.value;
    const stateJson = JSON.stringify(state);
    await invoke('save_state', { stateJson });
  } catch (err) {
    console.warn('[efxmux] Failed to save state:', err);
  }
}

const TAB_COUNTER_PREFIX = 'tab-counter:';

export function loadTabCounter(project: string): number {
  if (!currentState) return 0;
  const raw = (currentState.session as Record<string, string | undefined>)[`${TAB_COUNTER_PREFIX}${project}`];
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function persistTabCounter(project: string, n: number): Promise<void> {
  await updateSession({ [`${TAB_COUNTER_PREFIX}${project}`]: String(n) });
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
      // Sync project data from signals into state before saving (T-08-07-02)
      if (!currentState.project) currentState.project = { active: null, projects: [] };
      currentState.project.active = activeProjectName.value;
      currentState.project.projects = projects.value;
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
 * Update an existing project in the registry.
 */
export async function updateProject(name: string, entry: ProjectEntry): Promise<void> {
  await invoke('update_project', { name, entry });
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
  // Emit pre-switch event so listeners can save state under the OLD project name
  // BEFORE activeProjectName changes (fixes per-project server pane isolation)
  document.dispatchEvent(new CustomEvent('project-pre-switch', { detail: { oldName: activeProjectName.value, newName: name } }));
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
