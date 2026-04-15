// terminal-tabs.tsx -- Multi-tab terminal management for main panel (UX-02, D-04/D-05/D-06/D-07)
// Each tab is its own tmux session backed by a separate PTY.
// Tab state persists to state.json via updateSession (Pitfall 6).
// display:none/block preserves xterm.js scrollback + WebGL context.

import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { createTerminal, type TerminalOptions } from '../terminal/terminal-manager';
import { connectPty } from '../terminal/pty-bridge';
import { attachResizeHandler } from '../terminal/resize-handler';
import { registerTerminal, getTheme } from '../theme/theme-manager';
import { updateSession, activeProjectName, projects, getCurrentState } from '../state-manager';
import { detectAgent } from '../server/server-bridge';
import { colors, fonts } from '../tokens';
import { projectSessionName } from '../utils/session-name';
import { CrashOverlay } from './crash-overlay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalTab {
  id: string;
  sessionName: string;
  label: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  ptyConnected: boolean;
  disconnectPty?: () => void;
  detachResize?: () => void;
  exitCode?: number | null;  // undefined = running, number = exited
  isAgent: boolean;  // true if this tab runs an agent (claude/opencode)
}

export interface CreateTabOptions {
  /** When true, resolve and launch the project's configured agent binary */
  isAgent?: boolean;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export const terminalTabs = signal<TerminalTab[]>([]);
export const activeTabId = signal<string>('');
let tabCounter = 0;

/**
 * In-memory cache of tab metadata per project name.
 * Used to restore tabs when switching back to a previously visited project.
 * Key: project name, Value: array of { sessionName, label } for each tab.
 */
const projectTabCache = new Map<string, Array<{ sessionName: string; label: string; isAgent: boolean }>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTerminalContainersEl(): HTMLElement | null {
  return document.querySelector('.terminal-containers');
}

/**
 * Wait for the next animation frame so the browser has laid out newly-appended
 * elements before FitAddon measures them. Without this, fitAddon.fit() reads
 * a zero-sized or default-sized (80-col) container and the PTY is spawned at
 * the wrong column count, causing paste truncation at col 80.
 */
function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function getThemeOptions(): TerminalOptions {
  const theme = getTheme();
  return {
    theme: theme?.terminal,
    font: theme?.chrome?.font,
    fontSize: theme?.chrome?.fontSize,
  };
}

async function getActiveProjectInfo(): Promise<{ path?: string; agent?: string } | null> {
  const activeName = activeProjectName.value;
  if (!activeName) return null;
  const project = projects.value.find(p => p.name === activeName);
  return project ? { path: project.path, agent: project.agent } : null;
}

async function resolveAgentBinary(agent?: string): Promise<string | undefined> {
  if (!agent || agent === 'bash') return undefined;
  try {
    return await detectAgent(agent);
  } catch {
    return undefined;
  }
}

/**
 * Derive a human-readable label for an agent binary name.
 */
function agentLabel(agent?: string): string {
  if (agent === 'claude') return 'Claude';
  if (agent === 'opencode') return 'OpenCode';
  return agent ?? 'Agent';
}

// ---------------------------------------------------------------------------
// Tab management functions (exported for keyboard handler)
// ---------------------------------------------------------------------------

/**
 * Create a new terminal tab with its own tmux session.
 * @param options.isAgent - When true, resolve the project's configured agent
 *   binary and launch it instead of a plain shell.
 */
export async function createNewTab(options?: CreateTabOptions): Promise<TerminalTab | null> {
  const wrapper = getTerminalContainersEl();
  if (!wrapper) {
    console.error('[efxmux] .terminal-containers not found');
    return null;
  }

  const wantAgent = options?.isAgent ?? false;

  tabCounter++;
  const id = `tab-${Date.now()}-${tabCounter}`;

  // Derive session name
  const activeName = activeProjectName.value;
  const sessionSuffix = tabCounter > 1 ? String(tabCounter) : undefined;
  const sessionName = projectSessionName(activeName, sessionSuffix);

  // Resolve project info (needed for working directory and agent config)
  const projectInfo = await getActiveProjectInfo();

  // Resolve agent binary when requested
  let agentBinary: string | undefined;
  if (wantAgent) {
    agentBinary = await resolveAgentBinary(projectInfo?.agent);
  }
  const isAgent = wantAgent && !!agentBinary;

  // Label: agent tabs get the agent name, plain tabs get "Terminal N"
  let label: string;
  if (isAgent) {
    label = agentLabel(projectInfo?.agent);
  } else if (wantAgent && !agentBinary) {
    // User requested agent but binary not found — label makes failure visible
    label = `${agentLabel(projectInfo?.agent)} (no binary)`;
  } else {
    label = `Terminal ${tabCounter}`;
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'absolute inset-0';
  container.style.display = 'none'; // Will be shown by switchToTab
  wrapper.appendChild(container);

  // Create terminal
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(container, { ...themeOpts, sessionName });
  registerTerminal(terminal, fitAddon);

  // Show the tab and register it before connecting PTY so switchToTab makes
  // the container visible and the browser can lay it out before we measure.
  const partialTab: TerminalTab = {
    id,
    sessionName,
    label,
    terminal,
    fitAddon,
    container,
    ptyConnected: false,
    disconnectPty: undefined,
    detachResize: undefined,
    exitCode: undefined,
    isAgent,
  };
  terminalTabs.value = [...terminalTabs.value, partialTab];
  activeTabId.value = id;
  switchToTab(id);

  // Wait for browser layout so fitAddon.fit() reads the real container dimensions.
  // Without this, terminal.cols is the xterm.js default (80) and the PTY opens at
  // 80 cols — causing paste text to wrap at col 80 regardless of the visible width.
  await nextFrame();
  fitAddon.fit();

  // Warn if user requested agent but binary not available
  if (wantAgent && !agentBinary) {
    terminal.writeln(`\x1b[33mAgent binary "${projectInfo?.agent ?? 'unknown'}" not found. Starting plain shell.\x1b[0m`);
  }

  // Connect PTY -- pass agent binary when creating an agent tab
  let disconnectPty: (() => void) | undefined;
  let ptyConnected = false;

  try {
    const conn = await connectPty(terminal, sessionName, projectInfo?.path, agentBinary, true);
    disconnectPty = conn.disconnect;
    ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY for tab:', err);
    terminal.writeln(`\x1b[33mFailed to connect PTY: ${err}\x1b[0m`);
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(container, terminal, fitAddon, sessionName);

  // Update the partial tab in-place with PTY connection results
  partialTab.ptyConnected = ptyConnected;
  partialTab.disconnectPty = disconnectPty;
  partialTab.detachResize = resizeHandle.detach;
  // Trigger reactivity
  terminalTabs.value = [...terminalTabs.value];

  persistTabState();

  return partialTab;
}

/**
 * Close the active terminal tab. If last tab, auto-creates a fresh one (D-07).
 */
export async function closeActiveTab(): Promise<void> {
  const tabs = terminalTabs.value;
  const currentId = activeTabId.value;
  const idx = tabs.findIndex(t => t.id === currentId);
  if (idx === -1) return;

  const tab = tabs[idx];
  // Destroy PTY session in Rust before disposing JS-side resources
  try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch (err) {
    console.warn('[efxmux] Failed to destroy PTY session:', err);
  }
  disposeTab(tab);

  const remaining = tabs.filter(t => t.id !== currentId);
  terminalTabs.value = remaining;

  if (remaining.length === 0) {
    // Last terminal tab closed — don't auto-create if other unified tabs exist
    activeTabId.value = '';
  } else {
    // Switch to previous tab (or first)
    const newIdx = Math.min(idx, remaining.length - 1);
    activeTabId.value = remaining[newIdx].id;
    switchToTab(remaining[newIdx].id);
  }

  persistTabState();
}

/**
 * Close a specific tab by ID.
 */
export async function closeTab(tabId: string): Promise<void> {
  const tabs = terminalTabs.value;
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  // If this is the active tab, use closeActiveTab logic
  if (tabId === activeTabId.value) {
    await closeActiveTab();
    return;
  }

  const tab = tabs[idx];
  try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch (err) {
    console.warn('[efxmux] Failed to destroy PTY session:', err);
  }
  disposeTab(tab);
  terminalTabs.value = tabs.filter(t => t.id !== tabId);
  persistTabState();
}

/**
 * Cycle to the next tab (wraps around).
 */
export function cycleToNextTab(): void {
  const tabs = terminalTabs.value;
  if (tabs.length <= 1) return;

  const idx = tabs.findIndex(t => t.id === activeTabId.value);
  const nextIdx = (idx + 1) % tabs.length;
  activeTabId.value = tabs[nextIdx].id;
  switchToTab(tabs[nextIdx].id);
}

/**
 * Get the active terminal + fitAddon, or null if no tabs.
 */
export function getActiveTerminal(): { terminal: Terminal; fitAddon: FitAddon } | null {
  const tab = terminalTabs.value.find(t => t.id === activeTabId.value);
  if (!tab) return null;
  return { terminal: tab.terminal, fitAddon: tab.fitAddon };
}

// ---------------------------------------------------------------------------
// Init first tab (called from main.tsx bootstrap)
// ---------------------------------------------------------------------------

/**
 * Initialize the first terminal tab during app bootstrap.
 * Replaces inline createTerminal + connectPty in main.tsx.
 */
export async function initFirstTab(
  themeOptions: TerminalOptions,
  sessionName: string,
  projectPath?: string,
  agentBinary?: string,
): Promise<{ terminal: Terminal; fitAddon: FitAddon } | null> {
  const wrapper = getTerminalContainersEl();
  if (!wrapper) {
    console.error('[efxmux] .terminal-containers not found');
    return null;
  }

  tabCounter++;
  const id = `tab-${Date.now()}-${tabCounter}`;

  // Label: use agent name if configured
  const activeName = activeProjectName.value;
  const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
  let label: string;
  if (activeProject?.agent && activeProject.agent !== 'bash') {
    label = activeProject.agent === 'claude' ? 'Claude' : activeProject.agent === 'opencode' ? 'OpenCode' : 'Terminal 1';
  } else {
    label = 'Terminal 1';
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'absolute inset-0';
  wrapper.appendChild(container);

  // Create terminal
  const { terminal, fitAddon } = createTerminal(container, { ...themeOptions, sessionName });

  // Wait for browser layout before measuring. createTerminal calls fitAddon.fit()
  // synchronously, but the container was just appended — no layout has occurred yet.
  // Without this frame, terminal.cols stays at the xterm.js default (80) and the PTY
  // opens at 80 cols, causing paste text to wrap at col 80 regardless of visible width.
  await nextFrame();
  fitAddon.fit();

  // Connect PTY
  let disconnectPty: (() => void) | undefined;
  let ptyConnected = false;

  try {
    const conn = await connectPty(terminal, sessionName, projectPath, agentBinary);
    disconnectPty = conn.disconnect;
    ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY:', err);
    terminal.writeln('\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + err);
    terminal.writeln('\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(container, terminal, fitAddon, sessionName);

  const tab: TerminalTab = {
    id,
    sessionName,
    label,
    terminal,
    fitAddon,
    container,
    ptyConnected,
    disconnectPty,
    detachResize: resizeHandle.detach,
    exitCode: undefined,
    isAgent: !!agentBinary,
  };

  terminalTabs.value = [tab];
  activeTabId.value = id;
  // Container is already visible (no display:none needed for first tab)

  persistTabState();

  return { terminal, fitAddon };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function switchToTab(tabId: string): void {
  const tabs = terminalTabs.value;
  for (const tab of tabs) {
    if (tab.id === tabId) {
      tab.container.style.display = 'block';
    } else {
      tab.container.style.display = 'none';
    }
  }
  // Defer focus+fit until after browser reflow (UAT gap 3)
  requestAnimationFrame(() => {
    const active = tabs.find(t => t.id === tabId);
    if (active) {
      active.fitAddon.fit();
      active.terminal.focus();
    }
  });
}

function disposeTab(tab: TerminalTab): void {
  tab.disconnectPty?.();
  tab.detachResize?.();
  tab.terminal.dispose();
  tab.container.remove();
}

// ---------------------------------------------------------------------------
// Tab persistence (Pitfall 6)
// ---------------------------------------------------------------------------

function persistTabState(): void {
  const activeName = activeProjectName.value;
  const tabs = terminalTabs.value.map(t => ({
    sessionName: t.sessionName,
    label: t.label,
    isAgent: t.isAgent ?? false,
  }));
  const data = JSON.stringify({ tabs, activeTabId: activeTabId.value });
  // Save under per-project key (and legacy flat key for backward compat)
  const patch: Record<string, string> = { 'terminal-tabs': data };
  if (activeName) {
    patch[`terminal-tabs:${activeName}`] = data;
  }
  updateSession(patch);
}

// ---------------------------------------------------------------------------
// Restart a tab's PTY session (for crash overlay)
// ---------------------------------------------------------------------------

export async function restartTabSession(tabId: string): Promise<void> {
  const tabs = terminalTabs.value;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Disconnect old PTY
  tab.disconnectPty?.();
  tab.detachResize?.();
  tab.terminal.dispose();

  // Clear exit code
  tab.exitCode = undefined;

  // New session name (increment suffix) — must be computed before createTerminal
  // so the key handler's sessionName closure captures the correct value.
  const projectInfo = await getActiveProjectInfo();
  tabCounter++;
  const newSessionSuffix = `r${tabCounter}`;
  const newSessionName = projectSessionName(activeProjectName.value, newSessionSuffix);

  // Create new terminal in same container
  tab.container.innerHTML = '';
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(tab.container, { ...themeOpts, sessionName: newSessionName });
  registerTerminal(terminal, fitAddon);

  // Wait for browser layout before measuring, then fit — ensures the PTY opens
  // at the real container width instead of the 80-col xterm.js default.
  await nextFrame();
  fitAddon.fit();

  // Connect PTY -- only resolve agent binary if this tab was originally an agent tab
  const restartAgentBinary = tab.isAgent ? await resolveAgentBinary(projectInfo?.agent) : undefined;
  try {
    const conn = await connectPty(terminal, newSessionName, projectInfo?.path, restartAgentBinary, true);
    tab.disconnectPty = conn.disconnect;
    tab.ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to restart PTY:', err);
    terminal.writeln(`\x1b[33mFailed to restart: ${err}\x1b[0m`);
    tab.ptyConnected = false;
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(tab.container, terminal, fitAddon, newSessionName);
  tab.detachResize = resizeHandle.detach;

  tab.terminal = terminal;
  tab.fitAddon = fitAddon;
  tab.sessionName = newSessionName;

  // Trigger re-render
  terminalTabs.value = [...tabs];
  terminal.focus();
  fitAddon.fit();
  persistTabState();
}

// ---------------------------------------------------------------------------
// Clear all tabs (for project switch)
// ---------------------------------------------------------------------------

/**
 * Save current tabs to the per-project cache before clearing.
 * Call this with the OLD project name before switching away.
 */
export function saveProjectTabs(projectName: string): void {
  const tabs = terminalTabs.value;
  if (tabs.length > 0) {
    const tabMeta = tabs.map(t => ({
      sessionName: t.sessionName,
      label: t.label,
      isAgent: t.isAgent ?? false,
    }));
    projectTabCache.set(projectName, tabMeta);
    // Persist to disk so tabs survive app restart
    updateSession({
      [`terminal-tabs:${projectName}`]: JSON.stringify({ tabs: tabMeta, activeTabId: activeTabId.value }),
    });
  }
}

/**
 * Check if cached tabs exist for a project (in-memory or persisted on disk).
 */
export function hasProjectTabs(projectName: string): boolean {
  const cached = projectTabCache.get(projectName);
  if (cached && cached.length > 0) return true;
  // Also check persisted state on disk
  const state = getCurrentState();
  const persisted = state?.session?.[`terminal-tabs:${projectName}`];
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted);
      return parsed?.tabs?.length > 0;
    } catch { return false; }
  }
  return false;
}

/**
 * Restore tabs from the per-project cache (in-memory first, then disk).
 * Re-attaches to existing tmux sessions (whose history was cleared by
 * spawn_terminal in pty.rs to prevent stale content dump).
 * Returns true if tabs were restored, false if no cache exists.
 */
export async function restoreProjectTabs(
  projectName: string,
  projectPath?: string,
  agentBinary?: string,
): Promise<boolean> {
  let tabData: Array<{ sessionName: string; label: string }> | null = null;

  // Try in-memory cache first (from same-session project switch)
  const cached = projectTabCache.get(projectName);
  if (cached && cached.length > 0) {
    tabData = cached;
  }

  // Fall back to persisted state on disk (survives app restart)
  if (!tabData) {
    const state = getCurrentState();
    const persisted = state?.session?.[`terminal-tabs:${projectName}`];
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted);
        if (parsed?.tabs?.length > 0) {
          tabData = parsed.tabs;
        }
      } catch { /* ignore parse errors */ }
    }
  }

  if (!tabData || tabData.length === 0) return false;

  const restored = await restoreTabs(
    { tabs: tabData, activeTabId: '' },
    projectPath,
    agentBinary,
  );

  if (restored) {
    // Clear the in-memory cache entry since tabs are now live again
    projectTabCache.delete(projectName);
  }

  return restored;
}

export async function clearAllTabs(): Promise<void> {
  // Destroy PTY sessions in Rust so old PTY clients disconnect.
  // The tmux sessions are kept alive (not killed) so tabs can be restored
  // when switching back to this project. Stale screen content is cleared
  // by spawn_terminal before re-attaching.
  for (const tab of terminalTabs.value) {
    try {
      await invoke('destroy_pty_session', { sessionName: tab.sessionName });
    } catch {
      // Session may already be gone -- safe to ignore
    }
    disposeTab(tab);
  }
  terminalTabs.value = [];
  activeTabId.value = '';
  tabCounter = 0;
}

// ---------------------------------------------------------------------------
// Tab restoration (called from main.tsx bootstrap for session persistence)
// ---------------------------------------------------------------------------

/**
 * Restore tabs from persisted state.json data on app startup.
 * Returns true if at least 1 tab was restored, false otherwise.
 */
export async function restoreTabs(
  savedData: { tabs: Array<{ sessionName: string; label: string; isAgent?: boolean }>; activeTabId: string },
  projectPath?: string,
  agentBinary?: string,
): Promise<boolean> {
  if (!savedData?.tabs?.length) return false;

  const wrapper = getTerminalContainersEl();
  if (!wrapper) return false;

  const restoredTabs: TerminalTab[] = [];

  for (let i = 0; i < savedData.tabs.length; i++) {
    const saved = savedData.tabs[i];
    tabCounter++;
    const id = `tab-${Date.now()}-${tabCounter}`;

    // Create container — make it visible so the browser can lay it out and
    // fitAddon.fit() reads real dimensions. switchToTab will hide non-active tabs.
    const container = document.createElement('div');
    container.className = 'absolute inset-0';
    // Intentionally NOT setting display:none here — container must be visible for
    // fitAddon to measure the real column count before PTY spawn.
    wrapper.appendChild(container);

    // Create terminal — pass sessionName so the Shift+Enter key handler can invoke
    // send_literal_sequence with the correct tmux target.
    const themeOpts = getThemeOptions();
    const { terminal, fitAddon } = createTerminal(container, { ...themeOpts, sessionName: saved.sessionName });
    registerTerminal(terminal, fitAddon);

    // Wait for browser layout so fitAddon.fit() reads the real container width.
    // Without this, terminal.cols is 80 (xterm.js default) and the PTY opens at
    // 80 cols — causing paste text to wrap at col 80 regardless of visible width.
    await nextFrame();
    fitAddon.fit();

    // Hide after measuring — switchToTab will reveal the active tab.
    container.style.display = 'none';

    // Connect PTY -- use persisted isAgent flag (backward compat: old data without isAgent falls back to index heuristic)
    const isAgentTab = saved.isAgent ?? (i === 0 && !!agentBinary);
    const shellCmd = (isAgentTab && agentBinary) ? agentBinary : undefined;
    let disconnectPty: (() => void) | undefined;
    let ptyConnected = false;

    try {
      const conn = await connectPty(terminal, saved.sessionName, projectPath, shellCmd);
      disconnectPty = conn.disconnect;
      ptyConnected = true;
    } catch (err) {
      console.error('[efxmux] Failed to restore PTY for tab:', saved.sessionName, err);
      terminal.writeln(`\x1b[33mFailed to restore session "${saved.sessionName}": ${err}\x1b[0m`);
    }

    // Attach resize handler
    const resizeHandle = attachResizeHandler(container, terminal, fitAddon, saved.sessionName);

    restoredTabs.push({
      id,
      sessionName: saved.sessionName,
      label: saved.label,
      terminal,
      fitAddon,
      container,
      ptyConnected,
      disconnectPty,
      detachResize: resizeHandle.detach,
      exitCode: undefined,
      isAgent: isAgentTab,
    });
  }

  if (restoredTabs.length === 0) return false;

  terminalTabs.value = restoredTabs;

  // Activate the saved active tab (or first if saved ID no longer maps)
  // Since we generate new IDs, activate by index -- savedData.activeTabId won't match
  // Default to first tab
  activeTabId.value = restoredTabs[0].id;
  switchToTab(restoredTabs[0].id);

  persistTabState();
  return true;
}

// ---------------------------------------------------------------------------
// PTY exit event listener
// ---------------------------------------------------------------------------

listen<{ session: string; code: number }>('pty-exited', (event) => {
  const { session, code } = event.payload;
  const tabs = terminalTabs.value;
  const tab = tabs.find(t => t.sessionName === session);
  if (tab) {
    tab.exitCode = code;
    terminalTabs.value = [...tabs]; // trigger re-render
  }
});

// ---------------------------------------------------------------------------
// Active tab crash overlay rendering (used in main-panel.tsx)
// ---------------------------------------------------------------------------

export function ActiveTabCrashOverlay() {
  const tab = terminalTabs.value.find(t => t.id === activeTabId.value);
  if (!tab || tab.exitCode === undefined || tab.exitCode === null) return null;

  return (
    <CrashOverlay
      tab={tab}
      onRestart={() => restartTabSession(tab.id)}
    />
  );
}
