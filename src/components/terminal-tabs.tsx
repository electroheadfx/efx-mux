// terminal-tabs.tsx -- Multi-tab terminal management for main panel (UX-02, D-04/D-05/D-06/D-07)
// Each tab is its own tmux session backed by a separate PTY.
// Tab state persists to state.json via updateSession (Pitfall 6).
// display:none/block preserves xterm.js scrollback + WebGL context.

import { signal } from '@preact/signals';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { createTerminal, type TerminalOptions } from '../terminal/terminal-manager';
import { connectPty } from '../terminal/pty-bridge';
import { attachResizeHandler } from '../terminal/resize-handler';
import { registerTerminal, getTheme } from '../theme/theme-manager';
import { updateSession, activeProjectName, projects } from '../state-manager';
import { detectAgent } from '../server/server-bridge';

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
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export const terminalTabs = signal<TerminalTab[]>([]);
export const activeTabId = signal<string>('');
let tabCounter = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a tmux session name from a project name.
 * Sanitizes to alphanumeric + hyphen + underscore (matching pty.rs sanitization).
 */
function projectSessionName(projectName: string | null, suffix?: string): string {
  if (!projectName) return suffix ? `efx-mux-${suffix}` : 'efx-mux';
  const base = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

function getTerminalContainersEl(): HTMLElement | null {
  return document.querySelector('.terminal-containers');
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

// ---------------------------------------------------------------------------
// Tab management functions (exported for keyboard handler)
// ---------------------------------------------------------------------------

/**
 * Create a new terminal tab with its own tmux session.
 */
export async function createNewTab(): Promise<TerminalTab | null> {
  const wrapper = getTerminalContainersEl();
  if (!wrapper) {
    console.error('[efxmux] .terminal-containers not found');
    return null;
  }

  tabCounter++;
  const id = `tab-${Date.now()}-${tabCounter}`;

  // Derive session name
  const activeName = activeProjectName.value;
  const sessionSuffix = tabCounter > 1 ? String(tabCounter) : undefined;
  const sessionName = projectSessionName(activeName, sessionSuffix);

  // Label: first tab gets agent name if configured
  const projectInfo = await getActiveProjectInfo();
  const isFirstTab = terminalTabs.value.length === 0;
  let label: string;
  if (isFirstTab && projectInfo?.agent && projectInfo.agent !== 'bash') {
    label = projectInfo.agent === 'claude' ? 'Claude' : projectInfo.agent === 'opencode' ? 'OpenCode' : `Terminal ${tabCounter}`;
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
  const { terminal, fitAddon } = createTerminal(container, themeOpts);
  registerTerminal(terminal, fitAddon);

  // Connect PTY -- Ctrl+T tabs are always plain shell (UAT gap 1)
  const agentBinary = undefined;
  let disconnectPty: (() => void) | undefined;
  let ptyConnected = false;

  try {
    const conn = await connectPty(terminal, sessionName, projectInfo?.path, agentBinary);
    disconnectPty = conn.disconnect;
    ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY for tab:', err);
    terminal.writeln(`\r\n\x1b[33mFailed to connect PTY: ${err}\x1b[0m`);
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
  };

  terminalTabs.value = [...terminalTabs.value, tab];
  activeTabId.value = id;
  switchToTab(id);
  persistTabState();

  return tab;
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
  disposeTab(tab);

  const remaining = tabs.filter(t => t.id !== currentId);
  terminalTabs.value = remaining;

  if (remaining.length === 0) {
    // D-07: closing last tab auto-creates fresh default
    await createNewTab();
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
  const { terminal, fitAddon } = createTerminal(container, themeOptions);

  // Connect PTY
  let disconnectPty: (() => void) | undefined;
  let ptyConnected = false;

  try {
    const conn = await connectPty(terminal, sessionName, projectPath, agentBinary);
    disconnectPty = conn.disconnect;
    ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY:', err);
    terminal.writeln('\r\n\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + err);
    terminal.writeln('\r\n\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
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

function switchToTab(tabId: string): void {
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
  const tabs = terminalTabs.value.map(t => ({
    sessionName: t.sessionName,
    label: t.label,
  }));
  updateSession({ 'terminal-tabs': JSON.stringify({ tabs, activeTabId: activeTabId.value }) });
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

  // Create new terminal in same container
  tab.container.innerHTML = '';
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(tab.container, themeOpts);
  registerTerminal(terminal, fitAddon);

  // New session name (increment suffix)
  const projectInfo = await getActiveProjectInfo();
  tabCounter++;
  const newSessionSuffix = `r${tabCounter}`;
  const newSessionName = projectSessionName(activeProjectName.value, newSessionSuffix);

  // Connect PTY
  const agentBinary = await resolveAgentBinary(projectInfo?.agent);
  try {
    const conn = await connectPty(terminal, newSessionName, projectInfo?.path, agentBinary);
    tab.disconnectPty = conn.disconnect;
    tab.ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to restart PTY:', err);
    terminal.writeln(`\r\n\x1b[33mFailed to restart: ${err}\x1b[0m`);
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

export function clearAllTabs(): void {
  for (const tab of terminalTabs.value) {
    disposeTab(tab);
  }
  terminalTabs.value = [];
  activeTabId.value = '';
  tabCounter = 0;
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
// TerminalTabBar component (UI-SPEC Component 1)
// ---------------------------------------------------------------------------

import { CrashOverlay } from './crash-overlay';

export function TerminalTabBar() {
  const tabs = terminalTabs.value;
  const currentId = activeTabId.value;

  return (
    <div class="flex gap-1 px-2 py-1.5 bg-bg-raised border-b border-border shrink-0 items-center h-[32px]" role="tablist">
      {tabs.map(tab => {
        const isActive = tab.id === currentId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            class={isActive
              ? 'flex items-center gap-1 px-3 py-1 text-xs cursor-pointer font-[inherit] bg-accent text-white rounded-full border border-accent transition-all duration-150'
              : 'flex items-center gap-1 px-3 py-1 text-xs cursor-pointer font-[inherit] bg-transparent text-text rounded-full border border-transparent transition-all duration-150 hover:text-text-bright hover:bg-bg-raised/40'}
            onClick={() => {
              activeTabId.value = tab.id;
              switchToTab(tab.id);
            }}
            title={tab.sessionName}
          >
            <span>{tab.label}</span>
            <span
              class="ml-1 text-[10px] opacity-60 hover:opacity-100 hover:text-[#dc322f]"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              title="Close tab"
            >{'\u00D7'}</span>
          </button>
        );
      })}
      {/* New tab button */}
      <button
        class="w-6 h-6 text-text text-sm rounded hover:bg-bg hover:text-text-bright cursor-pointer flex items-center justify-center"
        onClick={() => createNewTab()}
        title="New terminal tab (Ctrl+T)"
      >+</button>
    </div>
  );
}

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
