// state-manager.js -- Bridge between JS state and Rust state.json (Phase 4)
// Per D-11: beforeunload triggers save_state via invoke
// Per D-12: Rust uses spawn_blocking for synchronous file I/O

const { invoke } = window.__TAURI__.core;

/** @type {object | null} */
let currentState = null;

/**
 * Load app state from Rust backend (reads ~/.config/efxmux/state.json).
 * Returns defaults if missing or corrupt (D-09, D-10).
 * @returns {Promise<object>}
 */
export async function loadAppState() {
  try {
    currentState = await invoke('load_state');
    return currentState;
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
    return currentState;
  }
}

/**
 * Save app state to Rust backend (writes ~/.config/efxmux/state.json).
 * @param {object} state
 * @returns {Promise<void>}
 */
export async function saveAppState(state) {
  try {
    const stateJson = JSON.stringify(state);
    await invoke('save_state', { stateJson });
  } catch (err) {
    console.warn('[efxmux] Failed to save state:', err);
  }
}

/**
 * Get the current state (loaded or default).
 * @returns {object | null}
 */
export function getCurrentState() {
  return currentState;
}

/**
 * Update layout fields in current state and persist.
 * @param {{ [key: string]: string | boolean }} patch - e.g., { 'sidebar-w': '150px', 'sidebar-collapsed': true }
 */
export async function updateLayout(patch) {
  if (!currentState) return;
  if (!currentState.layout) currentState.layout = {};
  for (const [key, value] of Object.entries(patch)) {
    currentState.layout[key] = value;
  }
  await saveAppState(currentState);
}

/**
 * Update theme mode in current state and persist.
 * @param {'dark' | 'light'} mode
 */
export async function updateThemeMode(mode) {
  if (!currentState) return;
  if (!currentState.theme) currentState.theme = {};
  currentState.theme.mode = mode;
  await saveAppState(currentState);
}

/**
 * Update tmux session names in current state and persist.
 * @param {{ 'main-tmux-session'?: string, 'right-tmux-session'?: string }} patch
 */
export async function updateSession(patch) {
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
export function initBeforeUnload() {
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
 * @returns {Promise<Array<{path: string, name: string, agent: string, gsd_file?: string, server_cmd?: string}>>}
 */
export async function getProjects() {
  return await invoke('get_projects');
}

/**
 * Get the currently active project name.
 * @returns {Promise<string|null>}
 */
export async function getActiveProject() {
  return await invoke('get_active_project');
}

/**
 * Add a new project to the registry.
 * @param {{ path: string, name: string, agent: string, gsd_file?: string, server_cmd?: string }} entry
 */
export async function addProject(entry) {
  await invoke('add_project', { entry });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke('load_state');
}

/**
 * Remove a project from the registry.
 * @param {string} name
 */
export async function removeProject(name) {
  await invoke('remove_project', { name });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke('load_state');
}

/**
 * Switch to a different project (updates state.json active field).
 * Emits 'project-changed' custom event on document.
 * @param {string} name
 */
export async function switchProject(name) {
  await invoke('switch_project', { name });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke('load_state');
  document.dispatchEvent(new CustomEvent('project-changed', { detail: { name } }));
}

/**
 * Get git status for a project directory.
 * @param {string} path
 * @returns {Promise<{branch: string, modified: number, staged: number, untracked: number}>}
 */
export async function getGitStatus(path) {
  return await invoke('get_git_status', { path });
}
