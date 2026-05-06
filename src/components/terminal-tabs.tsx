// terminal-tabs.tsx -- Multi-tab terminal management, scope-parametrized (Phase 20 Plan 01).
//
// Prior life: single-instance module backing the main panel's terminal tabs (Phase 17).
// Phase 22: expanded to 6 hierarchical scope ids ('main-0'..'main-2', 'right-0'..'right-2').
// Every existing top-level export resolves to scope 'main-0' (D-11 backward compat).
// Right-panel call sites use the new `getTerminalScope('right-0')` accessor.
//
// Scope differences per D-10 (hierarchical scope ids):
//   containerSelector : '.terminal-containers[data-scope="<scope-id>"]'
//   persistenceKey    : `terminal-tabs:<project>:<scope-id>`
//   first-launch seed : scope-0 of each zone gets D-02 defaults; scope-1/2 start empty (D-03)
//   session-name      : shared per-project counter (D-12) — `<project>`, `<project>-2`, `<project>-3`, …
//                       PTY names stay stable across cross-scope drags.
//
// Shared pipeline (scope-agnostic per D-12): createTerminal, connectPty, attachResizeHandler,
// registerTerminal (theme), projectSessionName.

import { signal, type Signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { createTerminal, type TerminalOptions } from '../terminal/terminal-manager';
import { connectPty } from '../terminal/pty-bridge';
import { attachResizeHandler } from '../terminal/resize-handler';
import { registerTerminal, getTheme } from '../theme/theme-manager';
import { updateSession, activeProjectName, projects, getCurrentState, loadTabCounter, persistTabCounter } from '../state-manager';
import { projectSessionName } from '../utils/session-name';
import { CrashOverlay } from './crash-overlay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TerminalScope =
  | 'main-0' | 'main-1' | 'main-2'
  | 'right-0' | 'right-1' | 'right-2';

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
  errorMessage?: string | null;
  isAgent: boolean;  // true if this tab runs an agent (claude/opencode)
  ownerScope: TerminalScope;  // Phase 20 D-10: scope this tab belongs to
}

export interface CreateTabOptions {
  /** When true, resolve and launch the project's configured agent binary */
  isAgent?: boolean;
  /** Phase 20 D-11: top-level createNewTab() wrapper forwards this to createNewTabScoped. Default 'main'. */
  scope?: TerminalScope;
}

// ---------------------------------------------------------------------------
// Scope registry (D-10)
// ---------------------------------------------------------------------------

interface ScopeState {
  scope: TerminalScope;
  tabs: Signal<TerminalTab[]>;
  activeTabId: Signal<string>;
  counter: { n: number };
  containerSelector: string;
  persistenceKey: (projectName: string) => string;
  projectTabCache: Map<string, Array<{ sessionName: string; label: string; isAgent: boolean }>>;
}

function createScopeState(scope: TerminalScope): ScopeState {
  return {
    scope,
    tabs: signal<TerminalTab[]>([]),
    activeTabId: signal<string>(''),  // D-03: empty scope allowed; first-launch defaults applied elsewhere
    counter: { n: 0 },  // retained for internal book-keeping only; shared counter is authoritative
    containerSelector: `.terminal-containers[data-scope="${scope}"]`,
    persistenceKey: (projectName: string) => `terminal-tabs:${projectName}:${scope}`,
    projectTabCache: new Map(),
  };
}

const scopes = new Map<TerminalScope, ScopeState>([
  ['main-0',  createScopeState('main-0')],
  ['main-1',  createScopeState('main-1')],
  ['main-2',  createScopeState('main-2')],
  ['right-0', createScopeState('right-0')],
  ['right-1', createScopeState('right-1')],
  ['right-2', createScopeState('right-2')],
]);

// ---------------------------------------------------------------------------
// Shared per-project session-name counter (D-12) — prevents collisions when
// tabs cross scopes. Allocated once at create time, stable across drags.
// ---------------------------------------------------------------------------

export const projectTabCounter = signal<Map<string, number>>(new Map());

// Phase 22 gap-closure 22-12: the per-project counter is MONOTONIC by design.
// User-confirmed 2026-04-18. Deleting Terminal-N does NOT free slot N for
// reuse; the next allocation always returns max+1. Rationale:
//   1. PTY safety — a deleted Terminal-N may leave an orphan tmux session
//      `<project>-N` alive; reusing N would re-attach that orphan and
//      surface stale screen content.
//   2. Matches D-12 (CONTEXT.md): "PTY session name is stable on scope move."
//      Slot reuse would violate the stable-name invariant.
//   3. Simpler implementation: one integer per project vs. gap-fill requiring
//      a full scan of all 6 scopes' tab lists on every allocation.
// Alternatives considered (gap-fill, gap-fill-with-tmux-wipe) were rejected
// in the Task 1 design checkpoint of plan 22-12. See STATE.md Decisions.
export function allocateNextSessionName(project: string | null): { name: string; n: number } {
  const key = project ?? '';
  const current = projectTabCounter.value.get(key) ?? 0;
  const n = current + 1;
  projectTabCounter.value = new Map(projectTabCounter.value).set(key, n);
  // Debug 22-pty-session-collision: persist the counter on every allocation so
  // restart → create-new-tab continues numbering from the last-used value
  // instead of restarting from 1 and colliding with restored session names.
  // Fire-and-forget; ordering guaranteed by state-manager's debounced save.
  if (key) void persistTabCounter(key, n);
  const suffix = n > 1 ? String(n) : undefined;
  return { name: projectSessionName(project, suffix), n };
}

export function seedCounterFromRestoredTabs(project: string): void {
  let max = 0;
  for (const state of scopes.values()) {
    for (const tab of state.tabs.value) {
      const m = /-(\d+)$/.exec(tab.sessionName);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  // Debug 22-pty-session-collision: also consider the persisted counter value,
  // which reflects the highest-ever allocated n (including tabs later closed).
  // T-22-08-01: loadTabCounter guards with parseInt + Number.isFinite; it
  // returns 0 on any parse failure or tampered value, so the max-of-three
  // (session-name, persisted, in-memory) is always safe.
  const persisted = loadTabCounter(project);
  const inMemory = projectTabCounter.value.get(project) ?? 0;
  const seeded = Math.max(max, persisted, inMemory);
  const next = new Map(projectTabCounter.value);
  next.set(project, seeded);
  projectTabCounter.value = next;
}

/** Testing-only: reset counter state. */
export function __resetProjectTabCounterForTesting(): void {
  projectTabCounter.value = new Map();
}

function getScope(scope: TerminalScope): ScopeState {
  const s = scopes.get(scope);
  if (!s) throw new Error(`[efxmux] unknown terminal scope: ${scope}`);
  return s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTerminalContainersElForScope(scope: TerminalScope): HTMLElement | null {
  return document.querySelector(getScope(scope).containerSelector);
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

function resolveAgentBinary(agent?: string): string | undefined {
  if (!agent || agent === 'bash') return undefined;
  return agent;
}

/**
 * Derive a human-readable label for an agent binary name.
 */
function agentLabel(agent?: string): string {
  return agent ? `Agent ${agent}` : 'Agent';
}

// ---------------------------------------------------------------------------
// Scoped lifecycle functions
// ---------------------------------------------------------------------------

/**
 * Create a new terminal tab in the given scope with its own tmux session.
 */
async function createNewTabScoped(
  scope: TerminalScope,
  options?: CreateTabOptions,
): Promise<TerminalTab | null> {
  const s = getScope(scope);
  const wrapper = getTerminalContainersElForScope(scope);
  if (!wrapper) {
    console.error(`[efxmux] ${s.containerSelector} not found`);
    return null;
  }

  const wantAgent = options?.isAgent ?? false;

  s.counter.n++;
  const { name: sessionName, n: seq } = allocateNextSessionName(activeProjectName.value);
  const id = `tab-${Date.now()}-${seq}`;
  // Retain per-scope s.counter.n for backward-compat of any caller reading it; not used for naming
  s.counter.n = Math.max(s.counter.n, seq);

  // Resolve project info (needed for working directory and agent config)
  const projectInfo = await getActiveProjectInfo();

  const agentBinary = wantAgent ? resolveAgentBinary(projectInfo?.agent) : undefined;
  const isAgent = wantAgent && !!agentBinary;

  // Label: agent tabs get the agent name, plain tabs get "Terminal N".
  //
  // Fix #2 (20-05-E): mirror initFirstTab's main-scope label policy —
  // when the user requested an Agent tab (`wantAgent === true`), always
  // label it `Agent <name>` using the project's configured agent command,
  // regardless of whether the agent binary actually resolved. The UAT
  // reported right-scope Agent tabs showing "Terminal N" (or, in
  // test-without-mock conditions, "Agent claude (no binary)") — both hide
  // the user-meaningful label. Binary resolution still gates PTY spawn
  // (`agentBinary` below), so a missing binary becomes a runtime warning
  // written into the terminal, not a corrupted tab label.
  let label: string;
  if (wantAgent) {
    label = agentLabel(projectInfo?.agent);
  } else {
    // Debug 22-pty-session-collision: use the monotonic per-project sequence
    // number for the label, not the per-scope counter `s.counter.n`. The
    // per-scope counter can produce duplicate "Terminal N" labels across
    // scopes (main-1 and right-0 both showing "Terminal 3") and is reset to 0
    // on every process start. The monotonic `seq` matches the session-name
    // suffix and stays unique across scopes AND restarts.
    label = `Terminal ${seq}`;
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'absolute inset-0';
  container.style.display = 'none'; // Will be shown by switchToTabScoped
  wrapper.appendChild(container);

  // Create terminal
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(container, { ...themeOpts, sessionName });
  registerTerminal(terminal, fitAddon);

  // Show the tab and register it before connecting PTY so switchToTabScoped makes
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
    ownerScope: scope,
  };
  s.tabs.value = [...s.tabs.value, partialTab];
  s.activeTabId.value = id;
  switchToTabScoped(scope, id);

  // Wait for browser layout so fitAddon.fit() reads the real container dimensions.
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
    const message = err instanceof Error ? err.message : String(err);
    console.error('[efxmux] Failed to connect PTY for tab:', err);
    terminal.writeln(`\x1b[33mFailed to connect PTY: ${message}\x1b[0m`);
    partialTab.exitCode = 1;
    partialTab.errorMessage = message;
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(container, terminal, fitAddon, sessionName);

  // Update the partial tab in-place with PTY connection results
  partialTab.ptyConnected = ptyConnected;
  partialTab.disconnectPty = disconnectPty;
  partialTab.detachResize = resizeHandle.detach;
  // Trigger reactivity
  s.tabs.value = [...s.tabs.value];

  persistTabStateScoped(scope);

  return partialTab;
}

async function closeActiveTabScoped(scope: TerminalScope): Promise<void> {
  const s = getScope(scope);
  const tabs = s.tabs.value;
  const currentId = s.activeTabId.value;
  const idx = tabs.findIndex(t => t.id === currentId);
  if (idx === -1) return;

  const tab = tabs[idx];
  try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch (err) {
    console.warn('[efxmux] closeActiveTabScoped: destroy_pty_session failed', { sessionName: tab.sessionName, scope, err });
  }
  disposeTab(tab);

  const remaining = tabs.filter(t => t.id !== currentId);
  s.tabs.value = remaining;

  if (remaining.length === 0) {
    s.activeTabId.value = '';
  } else {
    const newIdx = Math.min(idx, remaining.length - 1);
    s.activeTabId.value = remaining[newIdx].id;
    switchToTabScoped(scope, remaining[newIdx].id);
  }

  persistTabStateScoped(scope);
}

async function closeTabScoped(scope: TerminalScope, tabId: string): Promise<void> {
  const s = getScope(scope);
  const tabs = s.tabs.value;
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  if (tabId === s.activeTabId.value) {
    await closeActiveTabScoped(scope);
    return;
  }

  const tab = tabs[idx];
  try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch (err) {
    console.warn('[efxmux] closeTabScoped: destroy_pty_session failed', { sessionName: tab.sessionName, tabId, scope, err });
  }
  disposeTab(tab);
  s.tabs.value = tabs.filter(t => t.id !== tabId);
  persistTabStateScoped(scope);
}

function cycleToNextTabScoped(scope: TerminalScope): void {
  const s = getScope(scope);
  const tabs = s.tabs.value;
  if (tabs.length <= 1) return;

  const idx = tabs.findIndex(t => t.id === s.activeTabId.value);
  const nextIdx = (idx + 1) % tabs.length;
  s.activeTabId.value = tabs[nextIdx].id;
  switchToTabScoped(scope, tabs[nextIdx].id);
}

function renameTerminalTabScoped(scope: TerminalScope, tabId: string, newLabel: string): void {
  const s = getScope(scope);
  const tabs = s.tabs.value;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.label = newLabel;
  s.tabs.value = [...tabs]; // trigger reactivity
  persistTabStateScoped(scope);
}

function getActiveTerminalScoped(scope: TerminalScope): { terminal: Terminal; fitAddon: FitAddon } | null {
  const s = getScope(scope);
  const tab = s.tabs.value.find(t => t.id === s.activeTabId.value);
  if (!tab) return null;
  return { terminal: tab.terminal, fitAddon: tab.fitAddon };
}

function switchToTabScoped(scope: TerminalScope, tabId: string): void {
  const s = getScope(scope);
  const tabs = s.tabs.value;
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
// Scoped persistence (D-15)
// ---------------------------------------------------------------------------

function persistTabStateScoped(scope: TerminalScope): void {
  const s = getScope(scope);
  const activeName = activeProjectName.value;
  const tabs = s.tabs.value.map(t => ({
    sessionName: t.sessionName,
    label: t.label,
    isAgent: t.isAgent ?? false,
  }));
  // Plan 20-05-B: anchor the active-tab marker by sessionName (which survives
  // restart) when the current activeTabId resolves to a dynamic tab. Tab ids
  // are regenerated on each run, so the raw id alone cannot be restored.
  // Phase 22 D-01: sticky tabs removed — no sticky id routing needed.
  const activeId = s.activeTabId.value;
  const activeTab = s.tabs.value.find(t => t.id === activeId);
  const activeSessionName = activeTab?.sessionName;
  const data = JSON.stringify({
    tabs,
    activeTabId: activeId,
    activeSessionName,
  });
  const patch: Record<string, string> = {};
  if (activeName) {
    patch[s.persistenceKey(activeName)] = data;
  }
  if (Object.keys(patch).length > 0) {
    updateSession(patch);
  }
}

// ---------------------------------------------------------------------------
// Restart (Pitfall 1: use -rr<N> suffix to avoid collision with right-scope -r<N>)
// ---------------------------------------------------------------------------

export async function restartTabSession(tabId: string, options: { preserveSession?: boolean; agent?: string } = {}): Promise<void> {
  // Find the tab across all scopes.
  let owningScope: TerminalScope | null = null;
  let tab: TerminalTab | undefined;
  for (const [scopeName, state] of scopes) {
    const found = state.tabs.value.find(t => t.id === tabId);
    if (found) {
      owningScope = scopeName;
      tab = found;
      break;
    }
  }
  if (!tab || !owningScope) return;

  const s = getScope(owningScope);

  // Disconnect old PTY
  tab.disconnectPty?.();
  tab.detachResize?.();
  tab.terminal.dispose();

  tab.exitCode = undefined;
  tab.errorMessage = null;

  const projectInfo = await getActiveProjectInfo();
  let newSessionName = tab.sessionName;
  if (!options.preserveSession) {
    s.counter.n++;
    const newSessionSuffix = `rr${s.counter.n}`;
    newSessionName = projectSessionName(activeProjectName.value, newSessionSuffix);
  }

  // Create new terminal in same container
  tab.container.innerHTML = '';
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(tab.container, { ...themeOpts, sessionName: newSessionName });
  registerTerminal(terminal, fitAddon);

  await nextFrame();
  fitAddon.fit();

  const restartAgentBinary = tab.isAgent ? resolveAgentBinary(options.agent ?? projectInfo?.agent) : undefined;
  try {
    const conn = await connectPty(terminal, newSessionName, projectInfo?.path, restartAgentBinary, !options.preserveSession);
    tab.disconnectPty = conn.disconnect;
    tab.ptyConnected = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[efxmux] Failed to restart PTY:', err);
    terminal.writeln(`\x1b[33mFailed to restart: ${message}\x1b[0m`);
    tab.exitCode = 1;
    tab.errorMessage = message;
    tab.ptyConnected = false;
  }

  const resizeHandle = attachResizeHandler(tab.container, terminal, fitAddon, newSessionName);
  tab.detachResize = resizeHandle.detach;

  tab.terminal = terminal;
  tab.fitAddon = fitAddon;
  tab.sessionName = newSessionName;

  // Trigger re-render on the owning scope
  s.tabs.value = [...s.tabs.value];
  terminal.focus();
  fitAddon.fit();
  persistTabStateScoped(owningScope);
}

// ---------------------------------------------------------------------------
// Per-project cache + restore (scoped)
// ---------------------------------------------------------------------------

function saveProjectTabsScoped(projectName: string, scope: TerminalScope): void {
  const s = getScope(scope);
  const tabs = s.tabs.value;
  if (tabs.length > 0) {
    const tabMeta = tabs.map(t => ({
      sessionName: t.sessionName,
      label: t.label,
      isAgent: t.isAgent ?? false,
    }));
    s.projectTabCache.set(projectName, tabMeta);
    // Persist to disk so tabs survive app restart
    updateSession({
      [s.persistenceKey(projectName)]: JSON.stringify({ tabs: tabMeta, activeTabId: s.activeTabId.value }),
    });
  }
}

function hasProjectTabsScoped(projectName: string, scope: TerminalScope): boolean {
  const s = getScope(scope);
  const cached = s.projectTabCache.get(projectName);
  if (cached && cached.length > 0) return true;
  const state = getCurrentState();
  const persisted = state?.session?.[s.persistenceKey(projectName)];
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted);
      return parsed?.tabs?.length > 0;
    } catch { return false; }
  }
  return false;
}

async function restoreProjectTabsScoped(
  projectName: string,
  projectPath: string | undefined,
  agentBinary: string | undefined,
  scope: TerminalScope,
): Promise<boolean> {
  const s = getScope(scope);
  let tabData: Array<{ sessionName: string; label: string; isAgent?: boolean }> | null = null;
  // Plan 20-05-B: preserve the persisted active-tab marker.
  //   - `activeSessionName` is the stable identifier across restart (tab ids
  //     are regenerated), so we prefer it when present.
  //   - `activeStickyId` covers the right-scope case where the user last had
  //     'file-tree' or 'gsd' selected (sticky tabs have no sessionName).
  let savedActiveSessionName: string | undefined;
  let savedActiveStickyId: string | undefined;

  // Try in-memory cache first
  const cached = s.projectTabCache.get(projectName);
  if (cached && cached.length > 0) {
    tabData = cached;
  }

  // Fall back to persisted state on disk
  if (!tabData) {
    const state = getCurrentState();
    const persisted = state?.session?.[s.persistenceKey(projectName)];
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted);
        if (parsed?.tabs?.length > 0) {
          // T-20-01 mitigation: reject entries missing required fields.
          tabData = (parsed.tabs as Array<any>).filter(t =>
            t && typeof t.sessionName === 'string'
              && typeof t.label === 'string'
              && (typeof t.isAgent === 'boolean' || typeof t.isAgent === 'undefined'),
          );
          // Prefer the sessionName-anchored active marker written by
          // persistTabStateScoped. This survives tab-id regeneration.
          if (typeof parsed.activeSessionName === 'string' && parsed.activeSessionName) {
            savedActiveSessionName = parsed.activeSessionName;
          }
          // Phase 22: if activeTabId is a non-terminal tab (gsd, file-tree, git-changes),
          // preserve it so the scope opens to that tab instead of defaulting to terminal.
          if (typeof parsed.activeTabId === 'string' && parsed.activeTabId) {
            const isNonTerminal = parsed.activeTabId.startsWith('gsd') ||
              parsed.activeTabId.startsWith('file-tree') ||
              parsed.activeTabId.startsWith('git-changes') ||
              parsed.activeTabId.startsWith('editor-');
            if (isNonTerminal) {
              savedActiveStickyId = parsed.activeTabId;
            }
          }
        }
      } catch (err) {
        console.warn('[efxmux] Failed to restore scoped tabs:', err);
      }
    }
  }

  if (!tabData || tabData.length === 0) return false;

  const restored = await restoreTabsScoped(
    {
      tabs: tabData,
      activeTabId: '',
      activeSessionName: savedActiveSessionName,
      activeStickyId: savedActiveStickyId,
    },
    projectPath,
    agentBinary,
    scope,
  );

  if (restored) {
    s.projectTabCache.delete(projectName);
  }

  return restored;
}

async function clearAllTabsScoped(scope: TerminalScope): Promise<void> {
  const s = getScope(scope);
  // Destroy PTY sessions in Rust so old PTY clients disconnect.
  for (const tab of s.tabs.value) {
    try {
      await invoke('destroy_pty_session', { sessionName: tab.sessionName });
    } catch {
      // Session may already be gone -- safe to ignore
    }
    disposeTab(tab);
  }
  s.tabs.value = [];
  s.activeTabId.value = '';
  s.counter.n = 0;
}

// ---------------------------------------------------------------------------
// Tab restoration (scoped)
// ---------------------------------------------------------------------------

async function restoreTabsScoped(
  savedData: {
    tabs: Array<{ sessionName: string; label: string; isAgent?: boolean }>;
    activeTabId: string;
    // Plan 20-05-B: sessionName-anchored active-tab hint (survives restart).
    activeSessionName?: string;
    // Plan 20-05-B: right-scope sticky id ('file-tree' | 'gsd') to seed post-restore.
    activeStickyId?: string;
  },
  projectPath: string | undefined,
  agentBinary: string | undefined,
  scope: TerminalScope,
): Promise<boolean> {
  if (!savedData?.tabs?.length) return false;

  const s = getScope(scope);
  const wrapper = getTerminalContainersElForScope(scope);
  if (!wrapper) return false;

  const restoredTabs: TerminalTab[] = [];

  for (let i = 0; i < savedData.tabs.length; i++) {
    const saved = savedData.tabs[i];
    s.counter.n++;
    const id = `tab-${Date.now()}-${s.counter.n}`;

    const container = document.createElement('div');
    container.className = 'absolute inset-0';
    wrapper.appendChild(container);

    const themeOpts = getThemeOptions();
    const { terminal, fitAddon } = createTerminal(container, { ...themeOpts, sessionName: saved.sessionName });
    registerTerminal(terminal, fitAddon);

    await nextFrame();
    fitAddon.fit();

    container.style.display = 'none';

    const isAgentTab = saved.isAgent ?? (i === 0 && !!agentBinary);
    const shellCmd = (isAgentTab && agentBinary) ? agentBinary : undefined;

    // Commit the tab to scope state BEFORE spawning the PTY so the
    // module-level `pty-exited` listener can find it if the tmux pane
    // is already dead and the Rust monitor thread emits before the
    // loop finishes. (Startup TOCTOU race fix — debug:terminal-exited-no-restart)
    const tab: TerminalTab = {
      id,
      sessionName: saved.sessionName,
      label: saved.label,
      terminal,
      fitAddon,
      container,
      ptyConnected: false,
      disconnectPty: undefined,
      detachResize: () => {},
      exitCode: undefined,
      isAgent: isAgentTab,
      ownerScope: scope,
    };
    restoredTabs.push(tab);
    s.tabs.value = [...restoredTabs];

    try {
      const conn = await connectPty(terminal, saved.sessionName, projectPath, shellCmd);
      tab.disconnectPty = conn.disconnect;
      tab.ptyConnected = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[efxmux] Failed to restore PTY for tab:', saved.sessionName, err);
      terminal.writeln(`\x1b[33mFailed to restore session "${saved.sessionName}": ${message}\x1b[0m`);
      tab.exitCode = 1;
      tab.errorMessage = message;
    }

    const resizeHandle = attachResizeHandler(container, terminal, fitAddon, saved.sessionName);
    tab.detachResize = resizeHandle.detach;
  }

  if (restoredTabs.length === 0) return false;

  s.tabs.value = [...restoredTabs];

  // Plan 20-05-B: prefer the sessionName-anchored active marker (survives
  // restart), then fall back to first-tab.
  // Phase 22: if activeStickyId is set (non-terminal tab like gsd/file-tree),
  // use it directly — the tab exists as a singleton, not in restoredTabs.
  let activeId: string | undefined;
  if (savedData.activeStickyId) {
    // Non-terminal tab was active — set it directly without calling switchToTabScoped
    // (which only handles terminal containers). The tab body visibility is handled
    // by SubScopePane reading activeTabId.
    activeId = savedData.activeStickyId;
  } else if (savedData.activeSessionName) {
    const match = restoredTabs.find(t => t.sessionName === savedData.activeSessionName);
    if (match) activeId = match.id;
  }
  if (!activeId) activeId = restoredTabs[0].id;

  s.activeTabId.value = activeId;
  // Only call switchToTabScoped for terminal tabs (it manages container display:none/block)
  if (!savedData.activeStickyId) {
    switchToTabScoped(scope, activeId);
  }

  persistTabStateScoped(scope);
  return true;
}

// ---------------------------------------------------------------------------
// Crash overlay (scoped)
// ---------------------------------------------------------------------------

function ActiveTabCrashOverlayScoped(scope: TerminalScope) {
  const s = getScope(scope);
  const tab = s.tabs.value.find(t => t.id === s.activeTabId.value);
  if (!tab || tab.exitCode === undefined || tab.exitCode === null) return null;

  return (
    <CrashOverlay
      tab={tab}
      onRestart={() => restartTabSession(tab.id)}
    />
  );
}

// ---------------------------------------------------------------------------
// initFirstTab (main-only semantics; preserved)
// ---------------------------------------------------------------------------

/**
 * Initialize the first terminal tab during app bootstrap.
 * Main-panel semantics. Preserved signature for main.tsx bootstrap.
 */
export async function initFirstTab(
  themeOptions: TerminalOptions,
  sessionName: string,
  projectPath?: string,
  agentBinary?: string,
): Promise<{ terminal: Terminal; fitAddon: FitAddon } | null> {
  const s = getScope('main-0');
  const wrapper = getTerminalContainersElForScope('main-0');
  if (!wrapper) {
    console.error('[efxmux] .terminal-containers not found');
    return null;
  }

  s.counter.n++;
  const id = `tab-${Date.now()}-${s.counter.n}`;

  const activeName = activeProjectName.value;
  const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
  let label: string;
  if (activeProject?.agent && activeProject.agent !== 'bash') {
    label = agentLabel(activeProject.agent);
  } else {
    label = 'Terminal 1';
  }

  const container = document.createElement('div');
  container.className = 'absolute inset-0';
  wrapper.appendChild(container);

  const { terminal, fitAddon } = createTerminal(container, { ...themeOptions, sessionName });

  await nextFrame();
  fitAddon.fit();

  // Commit the tab to scope state BEFORE spawning the PTY so the
  // module-level `pty-exited` listener can find it if the tmux pane is
  // already dead and the Rust monitor thread emits before this function
  // returns. (Same startup TOCTOU race as restoreTabsScoped — quick-260418-b1a.)
  const tab: TerminalTab = {
    id,
    sessionName,
    label,
    terminal,
    fitAddon,
    container,
    ptyConnected: false,
    disconnectPty: undefined,
    detachResize: () => {},
    exitCode: undefined,
    errorMessage: null,
    isAgent: !!agentBinary,
    ownerScope: 'main-0',
  };
  s.tabs.value = [tab];
  s.activeTabId.value = id;

  try {
    const conn = await connectPty(terminal, sessionName, projectPath, agentBinary);
    tab.disconnectPty = conn.disconnect;
    tab.ptyConnected = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[efxmux] Failed to connect PTY:', err);
    terminal.writeln('\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + message);
    terminal.writeln('\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
    tab.exitCode = 1;
    tab.errorMessage = message;
  }

  const resizeHandle = attachResizeHandler(container, terminal, fitAddon, sessionName);
  tab.detachResize = resizeHandle.detach;

  persistTabStateScoped('main-0');

  return { terminal, fitAddon };
}

// ---------------------------------------------------------------------------
// Backward-compat top-level exports (D-11)
// Every export below MUST still resolve to scope 'main-0' with identical signatures.
// ---------------------------------------------------------------------------

/** D-11 backward-compat: same Signal reference as getTerminalScope('main-0').tabs */
export const terminalTabs = scopes.get('main-0')!.tabs;
/** D-11 backward-compat: same Signal reference as getTerminalScope('main-0').activeTabId */
export const activeTabId = scopes.get('main-0')!.activeTabId;

export function createNewTab(options?: CreateTabOptions): Promise<TerminalTab | null> {
  return createNewTabScoped(options?.scope ?? 'main-0', options);
}
export function closeTab(tabId: string): Promise<void> { return closeTabScoped('main-0', tabId); }
export function closeActiveTab(): Promise<void> { return closeActiveTabScoped('main-0'); }
// Plan 20-05-B: cycleToNextTab and switchToTab persist activeTabId so tab-switch
// selections survive a quit+restart (previously only tab mutations persisted).
export function cycleToNextTab(): void { cycleToNextTabScoped('main-0'); persistTabStateScoped('main-0'); }
export function switchToTab(tabId: string): void {
  scopes.get('main-0')!.activeTabId.value = tabId;
  switchToTabScoped('main-0', tabId);
  persistTabStateScoped('main-0');
}
export function renameTerminalTab(tabId: string, newLabel: string): void {
  renameTerminalTabScoped('main-0', tabId, newLabel);
}
export function getActiveTerminal(): { terminal: Terminal; fitAddon: FitAddon } | null {
  return getActiveTerminalScoped('main-0');
}
export function saveProjectTabs(projectName: string, scope: TerminalScope = 'main-0'): void {
  saveProjectTabsScoped(projectName, scope);
}
export function restoreProjectTabs(
  projectName: string,
  projectPath?: string,
  agentBinary?: string,
  scope: TerminalScope = 'main-0',
): Promise<boolean> {
  return restoreProjectTabsScoped(projectName, projectPath, agentBinary, scope);
}

export async function restartAgentTabsForActiveProject(agent?: string): Promise<void> {
  const projectInfo = await getActiveProjectInfo();
  const requestedAgent = agent ?? projectInfo?.agent;
  const restarts: Promise<void>[] = [];
  for (const [, state] of scopes) {
    for (const tab of state.tabs.value) {
      if (!tab.isAgent) continue;
      tab.label = agentLabel(requestedAgent);
      tab.exitCode = undefined;
      tab.errorMessage = null;
      restarts.push(restartTabSession(tab.id, { preserveSession: true, agent: requestedAgent }));
    }
    state.tabs.value = [...state.tabs.value];
  }
  await Promise.all(restarts);
}
export function hasProjectTabs(projectName: string, scope: TerminalScope = 'main-0'): boolean {
  return hasProjectTabsScoped(projectName, scope);
}
export function clearAllTabs(): Promise<void> { return clearAllTabsScoped('main-0'); }
export function ActiveTabCrashOverlay() { return ActiveTabCrashOverlayScoped('main-0'); }

/**
 * Phase 22: restore activeTabId for a scope when the persisted value is a
 * non-terminal tab (gsd, file-tree, git-changes, editor). Call this AFTER
 * singleton tabs have been restored (restoreGsdTab, restoreFileTreeTabs, etc.)
 * so the tab exists when we set it as active.
 *
 * This handles the case where there are no terminal tabs but a non-terminal
 * tab was active — restoreProjectTabsScoped returns early without setting
 * activeTabId, so we need this separate restore path.
 */
export function restoreNonTerminalActiveTabId(projectName: string, scope: TerminalScope): void {
  const s = getScope(scope);
  const state = getCurrentState();
  const persisted = state?.session?.[s.persistenceKey(projectName)];
  if (!persisted) return;
  try {
    const parsed = JSON.parse(persisted);
    const activeTabId = parsed?.activeTabId;
    if (typeof activeTabId !== 'string' || !activeTabId) return;
    // Only set if it's a non-terminal tab id
    const isNonTerminal = activeTabId.startsWith('gsd') ||
      activeTabId.startsWith('file-tree') ||
      activeTabId.startsWith('git-changes') ||
      activeTabId.startsWith('editor-');
    if (isNonTerminal) {
      s.activeTabId.value = activeTabId;
    }
  } catch { /* ignore parse errors */ }
}

/**
 * Plan 20-05-B: persistence helper for code paths that mutate a scope's
 * activeTabId signal directly (e.g., unified-tab-bar's sticky-tab click
 * handlers for 'file-tree' / 'gsd' in the right panel, which bypass
 * switchToTabScoped). Call this after any direct `activeTabId.value = ...`
 * mutation to flush the change to state.json so it survives restart.
 */
export function persistActiveTabIdForScope(scope: TerminalScope): void {
  // Phase 22 gap-closure (22-06): defensive remap matching getTerminalScope().
  const remapped: TerminalScope =
    (scope as string) === 'right' ? ('right-0' as TerminalScope)
    : (scope as string) === 'main' ? ('main-0' as TerminalScope)
    : scope;
  persistTabStateScoped(remapped);
}

/**
 * Get the default label for a terminal tab (used when resetting a rename).
 * Preserved signature: takes the tab object, returns its canonical label.
 */
export function getDefaultTerminalLabel(tab: TerminalTab): string {
  if (tab.isAgent) {
    const activeName = activeProjectName.value;
    const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
    return activeProject?.agent ? `Agent ${activeProject.agent}` : 'Agent';
  }
  return 'Terminal';
}

/**
 * Restore tabs from persisted state.json data on app startup (main scope).
 * Preserved signature for main.tsx bootstrap.
 */
export async function restoreTabs(
  savedData: { tabs: Array<{ sessionName: string; label: string; isAgent?: boolean }>; activeTabId: string },
  projectPath?: string,
  agentBinary?: string,
): Promise<boolean> {
  return restoreTabsScoped(savedData, projectPath, agentBinary, 'main-0');
}

// ---------------------------------------------------------------------------
// New export: getTerminalScope for right-panel (and future) call sites
// ---------------------------------------------------------------------------

export function getTerminalScope(scope: TerminalScope) {
  // Phase 22 gap-closure (22-06): defensive remap for any callsite still
  // passing the pre-Phase-22 legacy ids 'main'/'right'. This lets us fix
  // the most-load-bearing callsite (main.tsx restore loop) atomically with
  // the iterative migration of the rest of the codebase.
  const remapped: TerminalScope =
    (scope as string) === 'right' ? ('right-0' as TerminalScope)
    : (scope as string) === 'main' ? ('main-0' as TerminalScope)
    : scope;
  const s = getScope(remapped);
  scope = remapped;
  return {
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    createNewTab: (opts?: CreateTabOptions) => createNewTabScoped(scope, opts),
    closeTab: (id: string) => closeTabScoped(scope, id),
    closeActiveTab: () => closeActiveTabScoped(scope),
    // Plan 20-05-B: persist on switch/cycle so activeTabId selections survive restart.
    // switchToTab also sets the activeTabId signal (prior callers set it manually
    // before calling switchToTab; this makes the helper self-contained and the
    // persist-on-switch guarantee independent of caller contract).
    cycleToNextTab: () => { cycleToNextTabScoped(scope); persistTabStateScoped(scope); },
    switchToTab: (id: string) => {
      s.activeTabId.value = id;
      switchToTabScoped(scope, id);
      persistTabStateScoped(scope);
    },
    renameTerminalTab: (id: string, label: string) => renameTerminalTabScoped(scope, id, label),
    getActiveTerminal: () => getActiveTerminalScoped(scope),
    saveProjectTabs: (projectName: string) => saveProjectTabsScoped(projectName, scope),
    restoreProjectTabs: (projectName: string, projectPath?: string, agentBinary?: string) =>
      restoreProjectTabsScoped(projectName, projectPath, agentBinary, scope),
    hasProjectTabs: (projectName: string) => hasProjectTabsScoped(projectName, scope),
    clearAllTabs: () => clearAllTabsScoped(scope),
    ActiveTabCrashOverlay: () => ActiveTabCrashOverlayScoped(scope),
  };
}

// ---------------------------------------------------------------------------
// Test-only utility -- do not call in production.
// Resets per-scope counters so each test starts from a clean baseline.
// ---------------------------------------------------------------------------

export function __resetScopeCountersForTesting(): void {
  for (const [, state] of scopes) {
    state.counter.n = 0;
    state.projectTabCache.clear();
  }
}

// ---------------------------------------------------------------------------
// PTY exit event listener (scope-agnostic; single instance; HMR-resilient)
// ---------------------------------------------------------------------------

listen<{ session: string; code: number }>('pty-exited', (event) => {
  const { session, code } = event.payload;
  for (const [, state] of scopes) {
    const tab = state.tabs.value.find(t => t.sessionName === session);
    if (tab) {
      tab.exitCode = code;
      tab.errorMessage = null;
      state.tabs.value = [...state.tabs.value]; // trigger reactivity
      return; // D-14 guarantees unique session names across scopes
    }
  }
}).catch((err) => {
  // Defensive: listen() rejects in test environments that don't provide a
  // Tauri event plugin (e.g., sibling test files that import this module
  // transitively via unified-tab-bar but don't vi.mock('@tauri-apps/api/event')).
  // In production this never fires.
  console.warn('[efxmux] pty-exited listener setup failed:', err);
});
