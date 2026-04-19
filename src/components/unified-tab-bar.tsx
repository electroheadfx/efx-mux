// unified-tab-bar.tsx -- Unified tab bar mixing terminal tabs, editor tabs, and git changes tab
// Replaces TerminalTabBar per D-01, D-02, D-03, D-04, D-05, EDIT-05
// Built per Plan 02

import { signal, computed } from '@preact/signals';
import type { VNode } from 'preact';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts, spacing } from '../tokens';
import { Dropdown, type DropdownItem } from './dropdown-menu';
import { showConfirmModal } from './confirm-modal';
import { Terminal, Bot, FileDiff, Pin, PanelRightClose, PanelRight, FolderOpen, ListChecks, Rows2, X } from 'lucide-preact';
import type { TerminalTab, TerminalScope } from './terminal-tabs';
import {
  terminalTabs,
  activeTabId,
  createNewTab,
  closeTab,
  switchToTab,
  renameTerminalTab,
  getDefaultTerminalLabel,
  getTerminalScope,
} from './terminal-tabs';
import { writeFile, readFile } from '../services/file-service';
import { getEditorCurrentContent, minimapVisible, toggleMinimap } from '../editor/setup';
import { activeProjectName, rightTopTab, updateSession, getCurrentState } from '../state-manager';
import { leftSidebarActiveTab } from './sidebar';
import { revealFileInTree } from './file-tree';

// ── Tab Type System ─────────────────────────────────────────────────────────────

/** Props for the scope-parametrized UnifiedTabBar (Phase 20, Plan 02) */
export interface UnifiedTabBarProps {
  scope: TerminalScope;
}

interface BaseTab {
  id: string;
  type: 'terminal' | 'editor' | 'git-changes';
}

interface EditorTabData extends BaseTab {
  type: 'editor';
  filePath: string;
  fileName: string;
  content: string;
  dirty: boolean;
  pinned: boolean;
  displayName?: string;  // Custom user-set name; falls back to fileName
  /**
   * Plan 20-05-D: which panel renders this editor tab.
   * Defaults to 'main-0' for both newly-opened tabs and for tabs restored from
   * persisted state that predate the `ownerScope` field. Cross-scope drag
   * flips this via handleCrossScopeDrop.
   */
  ownerScope: TerminalScope;
  /**
   * Phase 21 Plan 01 (FIX-01 / D-07): set when the file on disk changed while
   * the editor tab is dirty (unsaved edits). We refuse to clobber the user's
   * work but surface a non-intrusive indicator on the tab label so the user
   * knows something changed externally. Cleared on save, clean-reload, or
   * when the disk content once again matches the editor's saved baseline.
   */
  changedOnDisk?: boolean;
}

interface GitChangesTabData extends BaseTab {
  type: 'git-changes';
  /** Which scope owns this tab (Phase 22: any TerminalScope, not just 'main-0'/'right'). */
  owningScope: TerminalScope;
}

export interface FileTreeTabData {
  type: 'file-tree';
  id: string;
  ownerScope: TerminalScope;
}

export interface GsdTabData {
  type: 'gsd';
  id: string;
  owningScope: TerminalScope;
}

type UnifiedTab =
  | { type: 'terminal'; id: string; terminalTabId: string; scope: TerminalScope }
  | EditorTabData
  | GitChangesTabData
  | FileTreeTabData
  | GsdTabData;

// ── Signals ─────────────────────────────────────────────────────────────────---

/** Editor tabs keyed by project name */
const _editorTabsByProject = signal<Map<string, EditorTabData[]>>(new Map());
/** Tab order keyed by project name (legacy, used for main scope) */
const _tabOrderByProject = signal<Map<string, string[]>>(new Map());
/**
 * Phase 20 Plan 02: per-scope, per-project tab order.
 * Outer key = TerminalScope ('main-0'..'main-2' | 'right-0'..'right-2'), inner key = project name.
 * Only dynamic tab IDs are stored — singleton IDs ('gsd') NEVER appear here (D-03 drag-reject).
 */
const _tabOrderByProjectScoped = signal<Map<TerminalScope, Map<string, string[]>>>(
  new Map<TerminalScope, Map<string, string[]>>([
    ['main-0', new Map<string, string[]>()],
    ['main-1', new Map<string, string[]>()],
    ['main-2', new Map<string, string[]>()],
    ['right-0', new Map<string, string[]>()],
    ['right-1', new Map<string, string[]>()],
    ['right-2', new Map<string, string[]>()],
  ])
);

/** Get tabs for a specific project */
function getProjectEditorTabs(projectName: string): EditorTabData[] {
  return _editorTabsByProject.value.get(projectName) ?? [];
}

/** Get tab order for a specific project */
function getProjectTabOrder(projectName: string): string[] {
  return _tabOrderByProject.value.get(projectName) ?? [];
}

/** Initialize a project in the Maps if it doesn't exist */
function ensureProjectInMaps(projectName: string): void {
  if (!_editorTabsByProject.value.has(projectName)) {
    _editorTabsByProject.value = new Map(_editorTabsByProject.value).set(projectName, []);
  }
  if (!_tabOrderByProject.value.has(projectName)) {
    _tabOrderByProject.value = new Map(_tabOrderByProject.value).set(projectName, []);
  }
}

/** Update editor tabs for the active project */
export function setProjectEditorTabs(tabs: EditorTabData[]): void {
  const name = activeProjectName.value;
  if (!name) return;
  ensureProjectInMaps(name);
  _editorTabsByProject.value = new Map(_editorTabsByProject.value).set(name, tabs);
}

/** Update tab order for the active project */
function setProjectTabOrder(order: string[]): void {
  const name = activeProjectName.value;
  if (!name) return;
  ensureProjectInMaps(name);
  _tabOrderByProject.value = new Map(_tabOrderByProject.value).set(name, order);
}

/** Get tabs for the active project (read-only computed for compatibility) */
export const editorTabs = computed<EditorTabData[]>(() => {
  const name = activeProjectName.value;
  if (!name) return [];
  ensureProjectInMaps(name);
  return getProjectEditorTabs(name);
});

/** Get tab order for the active project (read-only computed for compatibility) */
export const tabOrder = computed<string[]>(() => {
  const name = activeProjectName.value;
  if (!name) return [];
  ensureProjectInMaps(name);
  return getProjectTabOrder(name);
});

export const gitChangesTab = signal<GitChangesTabData | null>(null);
export const gsdTab = signal<GsdTabData | null>(null);
export const fileTreeTabs = signal<FileTreeTabData[]>([]);
export const activeUnifiedTabId = signal<string>('');
const renamingTabId = signal<string>('');

// ── Scoped tab-order helpers (Phase 20, Plan 02) ─────────────────────────────

/** Get the mutable inner Map for a scope, creating it if missing. */
function _getScopeOrderMap(scope: TerminalScope): Map<string, string[]> {
  const outer = _tabOrderByProjectScoped.value;
  let inner = outer.get(scope);
  if (!inner) {
    inner = new Map<string, string[]>();
    outer.set(scope, inner);
  }
  return inner;
}

/** Read the dynamic-tab order for a scope + active project. */
function getScopedTabOrder(scope: TerminalScope): string[] {
  const name = activeProjectName.value;
  if (!name) return [];
  const inner = _getScopeOrderMap(scope);
  return inner.get(name) ?? [];
}

/** Replace the dynamic-tab order for a scope + active project. */
function setScopedTabOrder(scope: TerminalScope, order: string[]): void {
  const name = activeProjectName.value;
  if (!name) return;
  // Strip the singleton gsd ID — singleton is stored in gsdTab signal, not in scoped order.
  const clean = order.filter(id => id !== 'gsd');
  const nextOuter = new Map(_tabOrderByProjectScoped.value);
  const inner = new Map(nextOuter.get(scope) ?? new Map<string, string[]>());
  inner.set(name, clean);
  nextOuter.set(scope, inner);
  _tabOrderByProjectScoped.value = nextOuter;
}

/** Remove a tab ID from main-scope order (used by Git Changes handoff). */
function removeFromMainTabOrder(id: string): void {
  setScopedTabOrder('main-0', getScopedTabOrder('main-0').filter(x => x !== id));
}

/** Append a tab ID to right-0 scope order (used by Git Changes handoff). */
function appendToRightTabOrder(id: string): void {
  const cur = getScopedTabOrder('right-0');
  if (!cur.includes(id)) setScopedTabOrder('right-0', [...cur, id]);
}

// ── Tab label click timer (single-click reveal vs double-click rename) ────────
let tabLabelClickTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTabLabelClick: string | null = null;

/** Combined tab list: terminals from terminalTabs + editors + git changes.
 *  Main-scope view only (legacy export). Right-scope rendering uses
 *  getOrderedTabsForScope('right') internally. */
export const allTabs = computed<UnifiedTab[]>(() => {
  const terminals: UnifiedTab[] = terminalTabs.value.map(t => ({
    type: 'terminal' as const,
    id: t.id,
    terminalTabId: t.id,
    scope: 'main-0' as const,
  }));
  const editors: UnifiedTab[] = editorTabs.value;
  const git: UnifiedTab[] = (gitChangesTab.value && !gitChangesTab.value.owningScope.startsWith('right'))
    ? [gitChangesTab.value]
    : [];
  return [...terminals, ...editors, ...git];
});

// ── Active tab synchronization ──────────────────────────────────────────────────

// When terminalTabs changes, sync tabOrder (append any new terminal IDs)
terminalTabs.value.forEach(t => {
  if (!tabOrder.value.includes(t.id)) {
    setProjectTabOrder([...tabOrder.value, t.id]);
  }
});

// When activeTabId changes from terminal-tabs, sync activeUnifiedTabId
// Guard: only sync if the current unified tab is already a terminal tab (or empty).
// This prevents terminal-tabs signal emissions from hijacking focus away from
// editor/git-changes tabs during unrelated signal cascades.
activeTabId.subscribe(id => {
  if (!id) return;
  const current = activeUnifiedTabId.value;
  if (current === id) return;
  const currentTab = allTabs.value.find(t => t.id === current);
  // Only sync if no unified tab is active, or the active tab is already a terminal
  // NEVER hijack focus from editor or git-changes tabs
  if (!current || !currentTab || currentTab.type === 'terminal') {
    activeUnifiedTabId.value = id;
  }
});

// ── Tab Actions ─────────────────────────────────────────────────────────────────

/**
 * quick-260418-bpm: create a new main-scope terminal (or agent) tab AND
 * explicitly focus it by writing to `activeUnifiedTabId`.
 *
 * Background: the `activeTabId.subscribe` guard above (~line 230) intentionally
 * blocks the subscribe-driven sync when the active unified tab is an editor or
 * git-changes tab, to prevent unrelated terminal signal cascades (restart,
 * tab-list reactivity, cross-scope events) from hijacking editor focus. That
 * guard is correct for passive cascades, but it ALSO blocks the sync when the
 * user explicitly asks for a new terminal — leaving the new tab invisible
 * behind whatever non-terminal tab was previously active.
 *
 * This helper is the single write path for user-initiated main-scope tab
 * creation (dropdown Terminal, dropdown Agent, and Ctrl+T in main.tsx). It
 * bypasses the guard by setting `activeUnifiedTabId.value = tab.id` AFTER
 * awaiting the creator — this is safe because the user explicitly requested
 * the new tab, so focus-stealing is the desired behavior.
 *
 * The optional `creator` parameter exists for test injection only — production
 * callers omit it and get the real top-level `createNewTab`.
 */
export async function createAndFocusMainTerminalTab(
  options?: CreateTabOptionsShape,
  creator: (options?: CreateTabOptionsShape) => Promise<{ id: string } | null> = createNewTab as any,
): Promise<void> {
  const tab = await creator(options);
  if (tab) activeUnifiedTabId.value = tab.id;
}

/** Local shape for options; matches CreateTabOptions in terminal-tabs.tsx. */
type CreateTabOptionsShape = { isAgent?: boolean; scope?: TerminalScope };

/**
 * Phase 21 Plan 03 (FIX-06): scope-aware activation helper for editor tabs.
 *
 * Background: Plan 20-05-D introduced `ownerScope` and a separate right-panel
 * active-tab signal (`getTerminalScope('right-0').activeTabId`). RightPanel reads
 * THAT signal — not `activeUnifiedTabId` — to decide whether to render a
 * right-scoped editor body. `UnifiedTabBar.handleTabClick` (line ~1410) was
 * updated to route by `ownerScope`, but the programmatic openers
 * (`openEditorTab`, `openEditorTabPinned`) continued to write only
 * `activeUnifiedTabId`. Consequence: if an existing tab for the clicked file
 * has `ownerScope: 'right'`, it gets "focused" in a signal RightPanel does not
 * read — so nothing becomes visible, the ServerPane shows at full height, and
 * the user sees the FIX-06 symptom (D-10 screenshot).
 *
 * This helper is the single source of truth for activating an existing editor
 * tab from ANY code path. Writers should prefer this over setting
 * `activeUnifiedTabId` directly. We also write `activeUnifiedTabId` regardless
 * so tab-persistence (which keys off it; see `persistEditorTabs` → `activeTab`
 * lookup) continues to track focus correctly across scope.
 */
function _activateEditorTab(tab: EditorTabData): void {
  const scope = tab.ownerScope ?? 'main-0';
  if (scope.startsWith('right-')) {
    getTerminalScope('right-0').activeTabId.value = tab.id;
  } else {
    // Phase 22 gap-closure (22-10): SubScopePane reads
    // getTerminalScope(scope).activeTabId.value — not activeUnifiedTabId —
    // to decide which body to render. Without this assignment the first
    // file-tree click opens a new editor tab whose id is written to
    // activeUnifiedTabId, but the main-scope's activeTabId remains empty,
    // so SubScopePane's editor body filter (`activeId === et.id`) is false
    // and the body never renders until the user manually re-clicks the tab
    // (UAT test 18a / gap 1 sub-issue).
    getTerminalScope(scope).activeTabId.value = tab.id;
  }
  // Always also set activeUnifiedTabId so save shortcuts, persistence, and
  // cross-scope drag reorder logic can find the focused tab by id without
  // needing to poll both scope signals.
  activeUnifiedTabId.value = tab.id;
}

/**
 * Migrate an editor tab from the right panel to the main panel.
 * Called when the user opens a right-scoped tab from the file tree — file-tree
 * opens always target the main panel (VS Code / Zed semantics).
 *
 * Performs the same scope-signal cleanup as the unpinned-replacement migration
 * in openEditorTab so the right panel reverts to its file-tree sticky default.
 */
function _migrateTabToMain(tabId: string): void {
  // Update ownerScope in editorTabs signal
  const updatedTabs = editorTabs.value.map(t =>
    t.id === tabId ? { ...t, ownerScope: 'main-0' as const } : t,
  );
  setProjectEditorTabs(updatedTabs);
  // Remove from right scoped tab order; add to main if not already present
  setScopedTabOrder('right-0', getScopedTabOrder('right-0').filter(id => id !== tabId));
  if (!getScopedTabOrder('main-0').includes(tabId)) {
    setScopedTabOrder('main-0', [...getScopedTabOrder('main-0'), tabId]);
  }
  // Reset right panel active tab to file-tree sticky default
  const rightScope = getTerminalScope('right-0');
  if (rightScope.activeTabId.value === tabId) {
    rightScope.activeTabId.value = 'file-tree';
  }
}

/**
 * Open a file in an editor tab as a preview (single-click behavior).
 * D-03: one-tab-per-file policy. If already open, focus it.
 * Otherwise, replace the existing unpinned (preview) tab, or create a new one.
 */
export function openEditorTab(filePath: string, fileName: string, content: string): void {
  // D-03: one-tab-per-file enforcement -- if already open, just focus it
  const existing = editorTabs.value.find(t => t.filePath === filePath);
  if (existing) {
    // FIX-06: refresh stale cached content so the editor body shows current
    // disk state. EditorTab's useEffect keys on `filePath`, not `content`, so
    // a content-only change won't remount — but the file-tree-changed and
    // git-status-changed listeners in editor-tab.tsx handle re-reading for
    // already-mounted editors. This refresh keeps the `editorTabs` signal
    // consistent with what was just read from disk for downstream consumers
    // (save baseline, persistence).
    if (existing.content !== content) {
      const refreshed = editorTabs.value.map(t =>
        t.id === existing.id ? { ...t, content } : t,
      );
      setProjectEditorTabs(refreshed);
    }
    // FIX (Bug: CLAUDE.md / right-scoped tab blank main panel): if the existing tab
    // lives in the right panel, migrate it to main on any file-tree open. File-tree
    // opens always target the main editor area (VS Code / Zed semantics). Without
    // migration, _activateEditorTab sets activeUnifiedTabId to a right-scoped tab ID,
    // causing the main panel to show neither terminal nor editor (blank state), while
    // the right panel unexpectedly hides the file tree.
    if ((existing.ownerScope ?? 'main-0').startsWith('right-')) {
      _migrateTabToMain(existing.id);
      // editorTabs was just mutated — read fresh reference for activation
      const migrated = editorTabs.value.find(t => t.id === existing.id)!;
      _activateEditorTab(migrated);
      return;
    }
    _activateEditorTab(existing);
    return;
  }

  // Find existing unpinned (preview) tab to replace
  const unpinned = editorTabs.value.find(t => !t.pinned);
  if (unpinned) {
    // FIX-06: force replacement to main scope. If the previous preview tab
    // had been dragged to the right panel, preserving its scope would silently
    // swallow subsequent file-tree previews (user clicks in file tree, new
    // file takes over right-panel preview slot that the user isn't looking at).
    // Preview-follows-file-tree matches VS Code / Zed semantics; if the user
    // wants the new file in the right panel they can drag it.
    const prevScope = unpinned.ownerScope ?? 'main-0';
    const updatedTabs = editorTabs.value.map(t =>
      t.id === unpinned.id
        ? { ...t, filePath, fileName, content, dirty: false, pinned: false, ownerScope: 'main-0' as const }
        : t
    );
    setProjectEditorTabs(updatedTabs);
    // If we just pulled a tab out of the right scope, update scoped tab orders
    // so the right panel doesn't still think this tab is one of its own.
    if (prevScope.startsWith('right-')) {
      setScopedTabOrder('right-0', getScopedTabOrder('right-0').filter(id => id !== unpinned.id));
      if (!getScopedTabOrder('main-0').includes(unpinned.id)) {
        setScopedTabOrder('main-0', [...getScopedTabOrder('main-0'), unpinned.id]);
      }
      // If right scope was pointing at this tab, reset to file-tree so the
      // right panel reverts to its sticky default instead of stranding active.
      const rightScope = getTerminalScope('right-0');
      if (rightScope.activeTabId.value === unpinned.id) {
        rightScope.activeTabId.value = 'file-tree';
      }
    }
    // After mutation the tab is now main-scoped; activation goes through the
    // helper so both signals are kept in sync.
    _activateEditorTab({ ...unpinned, ownerScope: 'main-0', filePath, fileName, content, dirty: false, pinned: false });
    return;
  }

  // No unpinned tab exists -- create a new unpinned tab
  const newTab: EditorTabData = {
    id: 'editor-' + Date.now(),
    type: 'editor',
    filePath,
    fileName,
    content,
    dirty: false,
    pinned: false,
    ownerScope: 'main-0', // Plan 20-05-D: new tabs open in main; drag flips to right.
  };

  setProjectEditorTabs([...editorTabs.value, newTab]);
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  setScopedTabOrder('main-0', [...getScopedTabOrder('main-0'), newTab.id]);
  _activateEditorTab(newTab);
}

/**
 * Open a file directly as a pinned editor tab (double-click behavior).
 * If already open, pin it and focus. Otherwise create a new pinned tab.
 */
export function openEditorTabPinned(filePath: string, fileName: string, content: string): void {
  // One-tab-per-file: if already open, pin it and focus
  const existing = editorTabs.value.find(t => t.filePath === filePath);
  if (existing) {
    // FIX-06: refresh stale cached content (same rationale as openEditorTab).
    if (existing.content !== content) {
      const refreshed = editorTabs.value.map(t =>
        t.id === existing.id ? { ...t, content } : t,
      );
      setProjectEditorTabs(refreshed);
    }
    // FIX (Bug: CLAUDE.md / right-scoped tab blank main panel): same migration
    // as openEditorTab. Double-click from file tree must also target main panel.
    if ((existing.ownerScope ?? 'main-0').startsWith('right-')) {
      _migrateTabToMain(existing.id);
    }
    if (!existing.pinned) {
      pinEditorTab(existing.id);
    }
    // Read fresh tab reference after potential migration + pin mutations
    const updated = editorTabs.value.find(t => t.id === existing.id)!;
    _activateEditorTab(updated);
    return;
  }

  // Create a new pinned tab
  const newTab: EditorTabData = {
    id: 'editor-' + Date.now(),
    type: 'editor',
    filePath,
    fileName,
    content,
    dirty: false,
    pinned: true,
    ownerScope: 'main-0', // Plan 20-05-D: new tabs open in main; drag flips to right.
  };

  setProjectEditorTabs([...editorTabs.value, newTab]);
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  setScopedTabOrder('main-0', [...getScopedTabOrder('main-0'), newTab.id]);
  _activateEditorTab(newTab);
}

/**
 * Pin an editor tab (prevents it from being replaced by single-click opens).
 */
export function pinEditorTab(tabId: string): void {
  const tabs = editorTabs.value.map(t =>
    t.id === tabId ? { ...t, pinned: true } : t
  );
  setProjectEditorTabs(tabs);
}

/**
 * Unpin an editor tab (makes it replaceable by single-click opens).
 */
export function unpinEditorTab(tabId: string): void {
  const tabs = editorTabs.value.map(t =>
    t.id === tabId ? { ...t, pinned: false } : t
  );
  setProjectEditorTabs(tabs);
}

/**
 * Toggle pin state of an editor tab.
 */
export function togglePinEditorTab(tabId: string): void {
  const tab = editorTabs.value.find(t => t.id === tabId);
  if (!tab) return;
  if (tab.pinned) unpinEditorTab(tabId);
  else pinEditorTab(tabId);
}

/**
 * Rename an editor tab. Empty string resets to fileName (clears displayName).
 */
export function renameEditorTab(tabId: string, newName: string): void {
  const tabs = editorTabs.value.map(t =>
    t.id === tabId ? { ...t, displayName: newName || undefined } : t
  );
  setProjectEditorTabs(tabs);
}

// ── Editor Tab Persistence ─────────────────────────────────────────────────────

/**
 * Persist the current editorTabs to state.json under the active project's key.
 * Saves only filePath and fileName (not content -- file content is re-read from disk on restore).
 */
export function persistEditorTabs(): void {
  const activeName = activeProjectName.value;
  const tabs = editorTabs.value.map(t => ({
    filePath: t.filePath,
    fileName: t.fileName,
    pinned: t.pinned,
    // Plan 20-05-D: persist ownerScope so cross-scope drag survives restart.
    // Legacy tabs without the field default to 'main-0' on restore.
    ownerScope: t.ownerScope ?? 'main-0',
    ...(t.displayName ? { displayName: t.displayName } : {}),
  }));
  // Never overwrite saved tabs with empty — prevents init race where computed
  // fires with [] before restoreEditorTabs runs (activeProjectName set triggers
  // recompute on empty _editorTabsByProject Map)
  if (tabs.length === 0) return;
  // Save active file path (not tab ID which gets regenerated on restore).
  // quick-260417-f6e: when activeUnifiedTabId points to a tab that doesn't belong
  // to THIS project (e.g. during project switch the signal still holds the prior
  // project's terminal/editor id before the handler restores focus), preserve
  // the previously persisted activeFilePath instead of blanking it. Blanking
  // would corrupt saved focus and make the next restore open the wrong file.
  const activeTab = editorTabs.value.find(t => t.id === activeUnifiedTabId.value);
  let activeFilePath: string;
  if (activeTab) {
    activeFilePath = activeTab.filePath;
  } else {
    const prior = activeName ? getCurrentState()?.session?.[`editor-tabs:${activeName}`] : null;
    let priorActive = '';
    if (prior) {
      try {
        priorActive = (JSON.parse(prior)?.activeFilePath as string) ?? '';
      } catch { /* fall through */ }
    }
    activeFilePath = priorActive;
  }
  const data = JSON.stringify({ tabs, activeTabId: activeUnifiedTabId.value, activeFilePath });
  const patch: Record<string, string> = { 'editor-tabs': data };
  if (activeName) {
    patch[`editor-tabs:${activeName}`] = data;
  }
  updateSession(patch);
}

/**
 * Restore editor tabs from persisted state for a given project.
 * Re-reads file content from disk (one-tab-per-file policy is enforced by openEditorTab).
 * Returns true if any tabs were restored.
 */
export async function restoreEditorTabs(projectName: string): Promise<boolean> {
  const state = getCurrentState();
  const key = `editor-tabs:${projectName}`;
  const raw = state?.session?.[key] ?? state?.session?.['editor-tabs'];
  if (!raw) return false;

  let parsed: { tabs: Array<{ filePath: string; fileName: string; pinned?: boolean; displayName?: string; ownerScope?: TerminalScope }>; activeTabId: string } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch { return false; }

  if (!parsed?.tabs?.length) return false;

  for (const tab of parsed.tabs) {
    try {
      const content = await readFile(tab.filePath);
      // Backward compat: if pinned is undefined (old persisted data), default to true
      // (assume previously-open tabs should persist as pinned)
      if (tab.pinned === false) {
        openEditorTab(tab.filePath, tab.fileName, content);
      } else {
        openEditorTabPinned(tab.filePath, tab.fileName, content);
      }
      // Restore custom display name if present
      if (tab.displayName) {
        const opened = editorTabs.value.find(t => t.filePath === tab.filePath);
        if (opened) {
          renameEditorTab(opened.id, tab.displayName);
        }
      }
      // Plan 20-05-D: honor persisted ownerScope. openEditorTab* default to
      // 'main-0', so flip to 'right' AFTER the tab exists. Also re-route the
      // scoped tab order: openEditorTab* seeded it in 'main-0' by default.
      const restoredScope = tab.ownerScope ?? 'main-0';
      if (restoredScope.startsWith('right-')) {
        const opened = editorTabs.value.find(t => t.filePath === tab.filePath);
        if (opened) {
          const updated = editorTabs.value.map(t =>
            t.id === opened.id ? { ...t, ownerScope: 'right-0' as const } : t,
          );
          setProjectEditorTabs(updated);
          setScopedTabOrder(
            'main-0',
            getScopedTabOrder('main-0').filter(id => id !== opened.id),
          );
          setScopedTabOrder(
            'right-0',
            [...getScopedTabOrder('right-0').filter(id => id !== opened.id), opened.id],
          );
        }
      }
    } catch (err) {
      console.warn('[efxmux] Could not restore editor tab:', tab.filePath, err);
    }
  }

  // Restore active tab by file path (tab IDs are regenerated on restore)
  const activePath = (parsed as any).activeFilePath;
  if (activePath) {
    const match = editorTabs.value.find(t => t.filePath === activePath);
    if (match) {
      activeUnifiedTabId.value = match.id;
    }
  }
  return true;
}

// Guard: suppress persist during init/restore to prevent empty-array overwrite race.
// Set before activeProjectName is assigned (which triggers computed → subscribe → persist empty).
let _suppressPersist = false;
export function suppressEditorPersist(on: boolean): void { _suppressPersist = on; }

// Watch editorTabs changes and persist
editorTabs.subscribe(() => {
  if (!_suppressPersist) persistEditorTabs();
});

// quick-260417-f6e: also persist when the active tab changes (clicking between
// already-open editor tabs mutates activeUnifiedTabId but NOT editorTabs, so
// the prior editorTabs-only subscription missed every focus change — next boot
// restored whichever tab was last ADDED instead of last FOCUSED).
activeUnifiedTabId.subscribe(() => {
  if (!_suppressPersist) persistEditorTabs();
});

// ── Git Changes persistence (Fix #3, Plan 20-05-E) ───────────────────────────
//
// Prior to this fix, `gitChangesTab` was ephemeral — a user who moved Git
// Changes into the right panel would find it gone after a quit/restart. We
// now round-trip the tab's id + owningScope through state.json under a
// per-project key (`git-changes-tab:<project>`), and restore it on bootstrap.

const GIT_CHANGES_KEY_PREFIX = 'git-changes-tab:';

/** Serialize gitChangesTab into state.json under a per-project session key. */
function persistGitChangesTab(): void {
  const activeName = activeProjectName.value;
  if (!activeName) return;
  const key = `${GIT_CHANGES_KEY_PREFIX}${activeName}`;
  const current = gitChangesTab.value;
  if (!current) {
    // Tab was closed — write empty marker so next restore knows it's gone.
    updateSession({ [key]: '' });
    return;
  }
  updateSession({
    [key]: JSON.stringify({
      id: current.id,
      owningScope: current.owningScope,
    }),
  });
}

/**
 * Restore gitChangesTab from persisted state for a given project.
 * Must be called during the app's post-load bootstrap (after loadAppState
 * has populated getCurrentState). Safe to call when no prior state exists.
 */
export function restoreGitChangesTab(projectName: string): void {
  const state = getCurrentState();
  const raw = state?.session?.[`${GIT_CHANGES_KEY_PREFIX}${projectName}`];
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { id?: string; owningScope?: TerminalScope };
    if (!parsed?.id || !parsed?.owningScope) return;
    const restored: GitChangesTabData = {
      type: 'git-changes',
      id: parsed.id,
      owningScope: parsed.owningScope,
    };
    gitChangesTab.value = restored;
    // Route into the correct scoped tab order so the tab bar renders it.
    if (parsed.owningScope.startsWith('right')) {
      appendToRightTabOrder(restored.id);
    } else {
      setScopedTabOrder('main-0', [...getScopedTabOrder('main-0'), restored.id]);
      setProjectTabOrder([...tabOrder.value, restored.id]);
    }
  } catch {
    // Corrupt persisted payload — ignore silently.
  }
}

// Watch gitChangesTab for changes and persist.
gitChangesTab.subscribe(() => { persistGitChangesTab(); });

// ── GSD tab persistence (Phase 22 Plan 03) ───────────────────────────────────

const GSD_KEY_PREFIX = 'gsd-tab:';

/** Serialize gsdTab into state.json under a per-project session key. */
function persistGsdTab(): void {
  const activeName = activeProjectName.value;
  if (!activeName) return;
  const key = `${GSD_KEY_PREFIX}${activeName}`;
  const current = gsdTab.value;
  if (!current) {
    updateSession({ [key]: '' });
    return;
  }
  updateSession({
    key: JSON.stringify({ id: current.id, owningScope: current.owningScope }),
  });
}

/**
 * Restore gsdTab from persisted state for a given project.
 */
export function restoreGsdTab(projectName: string): void {
  const state = getCurrentState();
  const raw = state?.session?.[`${GSD_KEY_PREFIX}${projectName}`];
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { id?: string; owningScope?: TerminalScope };
    if (!parsed?.id || !parsed?.owningScope) return;
    gsdTab.value = { type: 'gsd', id: parsed.id, owningScope: parsed.owningScope };
  } catch { /* corrupt */ }
}

gsdTab.subscribe(() => { persistGsdTab(); });

// ── File Tree tabs persistence (Phase 22 Plan 03) ─────────────────────────────

const FILE_TREE_KEY_PREFIX = 'file-tree-tabs:';

function persistFileTreeTabs(): void {
  const activeName = activeProjectName.value;
  if (!activeName) return;
  const key = `${FILE_TREE_KEY_PREFIX}${activeName}`;
  updateSession({ [key]: JSON.stringify(fileTreeTabs.value) });
}

export function restoreFileTreeTabs(projectName: string): void {
  const state = getCurrentState();
  const raw = state?.session?.[`${FILE_TREE_KEY_PREFIX}${projectName}`];
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as FileTreeTabData[];
    if (!Array.isArray(parsed)) return;
    fileTreeTabs.value = parsed;
  } catch { /* corrupt */ }
}

fileTreeTabs.subscribe(() => { persistFileTreeTabs(); });

// ── Singleton helpers (Phase 22 Plan 03) ────────────────────────────────────

/**
 * Open or move a singleton tab (GSD or Git Changes) to a target scope.
 * If already in target scope: activate. If in another scope: move. If not open: create.
 */
export function openOrMoveSingletonToScope(
  kind: 'gsd' | 'git-changes',
  targetScope: TerminalScope,
): void {
  if (kind === 'gsd') {
    const existing = gsdTab.value;
    if (!existing) {
      const newTab: GsdTabData = { type: 'gsd', id: 'gsd', owningScope: targetScope };
      gsdTab.value = newTab;
      setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), 'gsd']);
      getTerminalScope(targetScope).activeTabId.value = 'gsd';
      activeUnifiedTabId.value = 'gsd';
      return;
    }
    if (existing.owningScope === targetScope) {
      getTerminalScope(targetScope).activeTabId.value = existing.id;
      activeUnifiedTabId.value = existing.id;
      return;
    }
    // Move: update source + target scoped orders; flip signal.
    setScopedTabOrder(existing.owningScope, getScopedTabOrder(existing.owningScope).filter(id => id !== existing.id));
    setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), existing.id]);
    gsdTab.value = { ...existing, owningScope: targetScope };
    getTerminalScope(targetScope).activeTabId.value = existing.id;
    const src = getTerminalScope(existing.owningScope);
    if (src.activeTabId.value === existing.id) {
      src.activeTabId.value = '';
    }
    return;
  }

  // git-changes
  const existing = gitChangesTab.value;
  if (!existing) {
    const newTab: GitChangesTabData = { type: 'git-changes', id: `git-changes-${Date.now()}`, owningScope: targetScope };
    gitChangesTab.value = newTab;
    setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), newTab.id]);
    getTerminalScope(targetScope).activeTabId.value = newTab.id;
    activeUnifiedTabId.value = newTab.id;
    return;
  }
  if (existing.owningScope === targetScope) {
    getTerminalScope(targetScope).activeTabId.value = existing.id;
    activeUnifiedTabId.value = existing.id;
    return;
  }
  setScopedTabOrder(existing.owningScope, getScopedTabOrder(existing.owningScope).filter(id => id !== existing.id));
  setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), existing.id]);
  gitChangesTab.value = { ...existing, owningScope: targetScope };
  getTerminalScope(targetScope).activeTabId.value = existing.id;
  const src = getTerminalScope(existing.owningScope);
  if (src.activeTabId.value === existing.id) {
    src.activeTabId.value = '';
  }
}

/**
 * Open a file tree tab in the given scope, or activate it if already present.
 * File Tree is NOT a singleton — each scope can have its own.
 */
export function openFileTreeTabInScope(scope: TerminalScope): void {
  const existing = fileTreeTabs.value.find(t => t.ownerScope === scope);
  if (existing) {
    getTerminalScope(scope).activeTabId.value = existing.id;
    activeUnifiedTabId.value = existing.id;
    return;
  }
  const newTab: FileTreeTabData = {
    type: 'file-tree',
    id: `file-tree-${Date.now()}`,
    ownerScope: scope,
  };
  fileTreeTabs.value = [...fileTreeTabs.value, newTab];
  setScopedTabOrder(scope, [...getScopedTabOrder(scope), newTab.id]);
  getTerminalScope(scope).activeTabId.value = newTab.id;
  activeUnifiedTabId.value = newTab.id;
}

// ── Layout helpers (Phase 22 Plan 04) ─────────────────────────────────────────

// Import real implementations from main-panel (re-exported from sub-scope-pane)
import { spawnSubScopeForZone as realSpawnSubScope, getActiveSubScopesForZone as realGetActiveSubScopesForZone, closeSubScope as realCloseSubScope } from './main-panel';

/** Map 'main-0' → 'main' for spawnSubScopeForZone, pass 'right' through */
function spawnSubScopeForZone(zone: 'main-0' | 'right'): void {
  return realSpawnSubScope(zone === 'main-0' ? 'main' : zone);
}

/** Map 'main-0' → 'main' for getActiveSubScopesForZone, pass 'right' through */
function getActiveSubScopesForZone(zone: 'main-0' | 'right'): TerminalScope[] {
  return realGetActiveSubScopesForZone(zone === 'main-0' ? 'main' : zone);
}

/** Phase 22 gap-closure (22-10): close a sub-scope and migrate tabs to scope-0. */
function closeSubScope(zone: 'main' | 'right', index: number): void {
  return realCloseSubScope(zone, index);
}

/**
 * Open the Git Changes tab (main scope), or focus it if already open.
 * Pitfall 3: gitChangesTab carries `owningScope` so only the owning panel renders it.
 */
export function openGitChangesTab(): void {
  const existing = gitChangesTab.value;
  if (existing) {
    // If currently owned by right-0, flip back to main-0 (symmetrical to handoff)
    if (existing.owningScope.startsWith('right')) {
      gitChangesTab.value = { ...existing, owningScope: 'main-0' };
    }
    activeUnifiedTabId.value = existing.id;
    return;
  }

  const newTab: GitChangesTabData = {
    id: 'git-changes',
    type: 'git-changes',
    owningScope: 'main-0',
  };

  gitChangesTab.value = newTab;
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  setScopedTabOrder('main-0', [...getScopedTabOrder('main-0'), newTab.id]);
  activeUnifiedTabId.value = newTab.id;
}

/**
 * Open or move Git Changes into the right-0 panel (D-07). Three branches:
 *   - already owned by right-0 → just activate it (no duplication)
 *   - owned by main-0 → move to right-0 (flip owningScope, update orders)
 *   - not yet open → create a new tab owned by right-0
 */
export function openOrMoveGitChangesToRight(): void {
  const existing = gitChangesTab.value;
  const rightScope = getTerminalScope('right-0');

  if (existing?.owningScope.startsWith('right')) {
    rightScope.activeTabId.value = existing.id;
    activeUnifiedTabId.value = existing.id;
    return;
  }

  if (existing?.owningScope.startsWith('main-0')) {
    setScopedTabOrder('main-0', getScopedTabOrder('main-0').filter(x => x !== existing.id));
    setScopedTabOrder('right-0', [...getScopedTabOrder('right-0'), existing.id]);
    gitChangesTab.value = { ...existing, owningScope: 'right-0' };
    rightScope.activeTabId.value = existing.id;
    // Main active-tab fallback: first remaining main-scope dynamic tab, else ''
    const mainTabs = getTerminalScope('main-0').tabs.value;
    if (mainTabs.length > 0) {
      getTerminalScope('main-0').activeTabId.value = mainTabs[0].id;
      activeUnifiedTabId.value = mainTabs[0].id;
    } else {
      getTerminalScope('main-0').activeTabId.value = '';
      activeUnifiedTabId.value = '';
    }
    return;
  }

  // Create new, owned by right-0
  const id = `git-changes-${Date.now()}`;
  const newTab: GitChangesTabData = {
    id,
    type: 'git-changes',
    owningScope: 'right-0',
  };
  gitChangesTab.value = newTab;
  setScopedTabOrder('right-0', [...getScopedTabOrder('right-0'), id]);
  rightScope.activeTabId.value = id;
  activeUnifiedTabId.value = id;
}

/**
 * Close a tab by ID, handling dirty state for editor tabs (D-11).
 *
 * Fix #1 (20-05-E): terminal close must be scope-aware. Previously the
 * terminal branch unconditionally called `closeTab(tabId)` — a backward-compat
 * wrapper that routes through the MAIN scope only — so right-scope terminal
 * tabs' × button appeared to do nothing (the tab entry was never removed from
 * `getTerminalScope('right-0').tabs`). We resolve the tab's owning scope first
 * by searching both scope registries and dispatch close to the correct one.
 */
export function closeUnifiedTab(tabId: string): void {
  const tab = allTabs.value.find(t => t.id === tabId);

  // Terminal tabs are not surfaced by `allTabs` (which is main-only); resolve
  // them through the scope registry. Check both scopes so right-panel terminal
  // tabs close correctly too.
  const mainTermTab = terminalTabs.value.find(t => t.id === tabId);
  const rightTermTab = getTerminalScope('right-0').tabs.value.find(t => t.id === tabId);
  const termTab = mainTermTab ?? rightTermTab;
  const termScope: TerminalScope | null = mainTermTab ? 'main-0' : rightTermTab ? 'right-0' : null;

  if (termTab && termScope) {
    const scopeHandle = getTerminalScope(termScope);
    const isMain = termScope.startsWith('main-0');

    if (termTab.isAgent) {
      showConfirmModal({
        title: 'Quit Agent',
        message: 'Do you want to quit just the agent or close the terminal session entirely?',
        confirmLabel: 'Quit Terminal',
        onConfirm: () => {
          // Red button: destroy PTY session and remove tab (existing behavior)
          // Update unified selection BEFORE close removes the tab.
          if (isMain && tabId === activeUnifiedTabId.value) {
            switchToAdjacentTab(tabId);
          }
          if (isMain) {
            setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
          }
          scopeHandle.closeTab(tabId);
        },
        onCancel: () => {
          // Cancel: do nothing, keep tab as-is
        },
        onSave: () => {
          // Blue button: send /exit to gracefully quit agent, keep tab open
          invoke('write_pty', { data: '/exit\r', sessionName: termTab.sessionName });
        },
        saveLabel: 'Quit Agent Only',
      });
      return;
    }

    // Non-agent terminal: close immediately on the owning scope.
    if (isMain && tabId === activeUnifiedTabId.value) {
      switchToAdjacentTab(tabId);
    }
    if (isMain) {
      setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
    }
    scopeHandle.closeTab(tabId);
    return;
  }

  // Fix #3 (20-05-E): right-owned Git Changes is excluded from `allTabs`
  // (main view), so the normal `tab` lookup misses it. Handle it here so
  // the × button still closes the tab and clears persistence.
  const gc = gitChangesTab.value;
  if (gc && gc.id === tabId && gc.owningScope.startsWith('right')) {
    // Fall right-scope active back to '' if it was pointing here.
    const right = getTerminalScope('right-0');
    if (right.activeTabId.value === tabId) {
      right.activeTabId.value = '';
    }
    gitChangesTab.value = null;
    // Clean the right-0 scoped tab order too.
    setScopedTabOrder('right-0', getScopedTabOrder('right-0').filter(id => id !== tabId));
    return;
  }

  if (!tab) return;

  if (tab.type === 'editor') {
    if (tab.dirty) {
      showConfirmModal({
        title: 'Unsaved Changes',
        message: `${tab.fileName} has unsaved changes that will be lost.`,
        onConfirm: () => {
          // Discard: switch BEFORE removing so switchToAdjacentTab can find the tab
          if (tabId === activeUnifiedTabId.value) {
            switchToAdjacentTab(tabId);
          }
          setProjectEditorTabs(editorTabs.value.filter(t => t.id !== tabId));
          setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
        },
        onCancel: () => {},
        onSave: () => {
          // Get CURRENT content from EditorView (not stale tab.content)
          const currentContent = getEditorCurrentContent(tabId) ?? tab.content;
          writeFile(tab.filePath, currentContent)
            .then(() => {
              setEditorDirty(tabId, false);
              // Switch BEFORE removing so switchToAdjacentTab can find the tab
              if (tabId === activeUnifiedTabId.value) {
                switchToAdjacentTab(tabId);
              }
              setProjectEditorTabs(editorTabs.value.filter(t => t.id !== tabId));
              setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
            })
            .catch(err => {
              console.error('[efxmux] Save failed:', err);
            });
        },
      });
    } else {
      // Switch BEFORE removing — switchToAdjacentTab needs the tab still in allTabs
      if (tabId === activeUnifiedTabId.value) {
        switchToAdjacentTab(tabId);
      }
      setProjectEditorTabs(editorTabs.value.filter(t => t.id !== tabId));
      setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
    }
    return;
  }

  if (tab.type === 'git-changes') {
    // Switch BEFORE removing — switchToAdjacentTab needs the tab still in allTabs
    if (tabId === activeUnifiedTabId.value) {
      switchToAdjacentTab(tabId);
    }
    gitChangesTab.value = null;
    setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
  }
}

/**
 * Plan 18-11 (Gap G-01 secondary fix): auto-close an editor tab when its
 * backing file is deleted from disk. Bypasses the unsaved-changes confirm
 * modal because the file is gone and saving is impossible. Called by
 * editor-tab.tsx when its git-status-changed listener detects that
 * readFile(filePath) now fails with a file-not-found error.
 *
 * If multiple tabs point at the same filePath (e.g. one pinned + one
 * unpinned), all matching tabs are removed. If filePath does not match
 * any open tab, this is a silent no-op.
 */
export function closeEditorTabForDeletedFile(filePath: string): void {
  const matching = editorTabs.value.filter(t => t.filePath === filePath);
  if (matching.length === 0) return;

  // If any of the matching tabs is active, switch away first.
  const activeId = activeUnifiedTabId.value;
  if (matching.some(t => t.id === activeId)) {
    // Use the same helper closeUnifiedTab uses — switches to the adjacent
    // tab based on tabOrder. switchToAdjacentTab works only while the tab
    // is still present in allTabs, so call it BEFORE removing.
    switchToAdjacentTab(activeId);
  }

  // Clear dirty state for each matching tab so persistence doesn't keep a
  // dirty=true entry pointing at a deleted file.
  for (const tab of matching) {
    setEditorDirty(tab.id, false);
  }

  // Remove from editorTabs AND from tabOrder.
  const matchingIds = new Set(matching.map(t => t.id));
  setProjectEditorTabs(editorTabs.value.filter(t => !matchingIds.has(t.id)));
  setProjectTabOrder(tabOrder.value.filter(id => !matchingIds.has(id)));
}

/**
 * Mark an editor tab as dirty/clean.
 */
export function setEditorDirty(tabId: string, dirty: boolean): void {
  const tabs = editorTabs.value;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.dirty = dirty;
  // Trigger reactivity by updating through the map
  setProjectEditorTabs([...tabs]);
}

/**
 * Phase 21 Plan 01 (FIX-01 / D-07): mark an editor tab's on-disk-changed flag.
 * This is independent of `dirty` — a tab can be clean+changedOnDisk (rare race:
 * save + immediate external edit) or dirty+changedOnDisk (user has unsaved
 * edits AND the file changed under them). The tab label renders a subtle
 * indicator when this flag is true so the user knows the file on disk diverged
 * from the editor buffer. Cleared after clean-reload or after save.
 */
export function setEditorChangedOnDisk(tabId: string, changed: boolean): void {
  const tabs = editorTabs.value;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.changedOnDisk = changed;
  setProjectEditorTabs([...tabs]);
}

/**
 * Update the saved content after a successful file save.
 */
export function updateEditorSavedContent(tabId: string): void {
  setEditorDirty(tabId, false);
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function switchToAdjacentTab(currentId: string): void {
  const ordered = getOrderedTabs();
  const idx = ordered.findIndex(t => t.id === currentId);
  if (idx === -1) return;

  // Try previous, then next
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];
  const nextTab = prev || next;

  if (nextTab) {
    activeUnifiedTabId.value = nextTab.id;
    // If it's a terminal tab, also sync activeTabId and switch container visibility
    if (nextTab.type === 'terminal') {
      activeTabId.value = nextTab.id;
      switchToTab(nextTab.id);
    }
  }
}

function getOrderedTabs(): UnifiedTab[] {
  const all = allTabs.value;

  if (tabOrder.value.length === 0) {
    return all; // No custom order yet, return natural order
  }

  // Sort ALL tabs (terminals, editors, git-changes) by their position in tabOrder.
  // Tabs not in tabOrder get appended at the end in their original order.
  const order = tabOrder.value;
  const ordered: UnifiedTab[] = order
    .map(id => all.find(t => t.id === id))
    .filter((t): t is UnifiedTab => t !== undefined);

  // Append any tabs not yet in tabOrder (backward compat for new tabs)
  all.forEach(t => {
    if (!ordered.find(ot => ot.id === t.id)) {
      ordered.push(t);
    }
  });

  return ordered;
}

// ── Dropdown Items ─────────────────────────────────────────────────────────────

/**
 * Overrides for buildDropdownItems (test injection only).
 * Production callers omit this and get the real createAndFocusMainTerminalTab.
 */
export interface BuildDropdownItemsOverrides {
  /** Test spy for creator (bypasses real PTY spawn). */
  createTerminalTab?: (opts: CreateTabOptionsShape) => Promise<unknown>;
}

/**
 * Phase 22 gap-closure 22-12: `scope` is the originating UnifiedTabBar's scope.
 * Every action callback that spawns a terminal/agent MUST forward this scope to
 * the creator so the new tab appears in the originating pane, not always main-0.
 *
 * The bug this fixes (UAT test 15a): previously `action: () => { void
 * createAndFocusMainTerminalTab(); }` omitted the scope, so createNewTab
 * defaulted to `'main-0'` — clicking + in main-1 / main-2 / right-* put the new
 * tab in main-0.
 */
export function buildDropdownItems(
  scope: TerminalScope,
  overrides?: BuildDropdownItemsOverrides,
): DropdownItem[] {
  const gsdOwnedElsewhere = gsdTab.value !== null && gsdTab.value.owningScope !== scope;
  const gcOwnedElsewhere = gitChangesTab.value !== null && gitChangesTab.value.owningScope !== scope;

  const spawnTerminal = (opts: CreateTabOptionsShape) => {
    if (overrides?.createTerminalTab) {
      return overrides.createTerminalTab(opts);
    }
    return createAndFocusMainTerminalTab(opts);
  };

  return [
    {
      label: 'Terminal (Zsh)',
      icon: Terminal,
      action: () => { void spawnTerminal({ scope }); },
    },
    {
      label: 'Agent',
      icon: Bot,
      action: () => { void spawnTerminal({ scope, isAgent: true }); },
    },
    {
      label: 'GSD',
      icon: ListChecks,
      action: () => openOrMoveSingletonToScope('gsd', scope),
      disabled: gsdOwnedElsewhere,
    },
    {
      label: 'Git Changes',
      icon: FileDiff,
      action: () => openOrMoveSingletonToScope('git-changes', scope),
      disabled: gcOwnedElsewhere,
    },
    {
      label: 'File Tree',
      icon: FolderOpen,
      action: () => openFileTreeTabInScope(scope),
    },
  ];
}

// ── Scope-aware ordering (Phase 20, Plan 02) ─────────────────────────────────

/** Compute the dynamic-tab list for a given scope (terminals + editors +
 *  git-changes singleton if owned by this scope + file-tree tabs owned by this scope).
 *  Phase 22: GSD singleton also included via gsdTab signal. */
function computeDynamicTabsForScope(scope: TerminalScope): UnifiedTab[] {
  const scopeHandle = getTerminalScope(scope);
  const terminals: UnifiedTab[] = scopeHandle.tabs.value.map(t => ({
    type: 'terminal' as const,
    id: t.id,
    terminalTabId: t.id,
    scope,
  }));
  // Editor tabs scoped via `ownerScope`.
  const editors: UnifiedTab[] = editorTabs.value.filter(
    t => (t.ownerScope ?? 'main-0') === scope,
  );
  // Git Changes singleton (Phase 22: any scope can own it).
  const git: UnifiedTab[] = (gitChangesTab.value && gitChangesTab.value.owningScope === scope)
    ? [gitChangesTab.value]
    : [];
  // GSD singleton (Phase 22 dynamic tab).
  const gsd: UnifiedTab[] = (gsdTab.value && gsdTab.value.owningScope === scope)
    ? [gsdTab.value]
    : [];
  // File Tree non-singleton tabs (Phase 22: per-scope, not sticky).
  const fileTree: UnifiedTab[] = fileTreeTabs.value
    .filter(t => t.ownerScope === scope);

  const all: UnifiedTab[] = [...terminals, ...editors, ...git, ...gsd, ...fileTree];
  const order = getScopedTabOrder(scope);
  if (order.length === 0) return all;

  const ordered: UnifiedTab[] = order
    .map(id => all.find(t => t.id === id))
    .filter((t): t is UnifiedTab => t !== undefined);
  all.forEach(t => {
    if (!ordered.find(ot => ot.id === t.id)) ordered.push(t);
  });
  return ordered;
}

/** Compute the full ordered tab list for a scope (all dynamic, no sticky prepend). */
function getOrderedTabsForScope(scope: TerminalScope): UnifiedTab[] {
  return computeDynamicTabsForScope(scope);
}

/**
 * Returns true iff the currently-active tab within the given scope's tab list
 * is a file (editor) tab. Used to gate the minimap toggle icon so it appears
 * ONLY when the user is looking at a file in that scope — NOT for terminal,
 * agent, git-changes, file-tree, or gsd tabs (Plan 20-05-C).
 *
 * @param ordered  Scope-filtered tab list (output of getOrderedTabsForScope).
 * @param activeId The scope's active tab id (may be '' when nothing active).
 */
export function isEditorTabActiveInScope(
  ordered: UnifiedTab[],
  activeId: string,
): boolean {
  if (!activeId) return false;
  const active = ordered.find(t => t.id === activeId);
  return active?.type === 'editor';
}

// ── Tab Reorder (mouse-based) ───────────────────────────────────────────────────
// HTML5 Drag and Drop API does NOT work in Tauri/WKWebView on macOS.
// WKWebView's native drag system hijacks dragstart and fires dragend immediately
// without any dragover/drop events. The green plus/copy OS badge appears instead.
// Solution: pure mouse events (mousedown → mousemove → mouseup).

const DRAG_THRESHOLD = 5; // px before drag starts

interface ReorderState {
  sourceId: string | null;
  sourceEl: HTMLElement | null;
  sourceScope: TerminalScope | null; // Fix #5 (20-05-E): cross-scope drag
  ghostEl: HTMLElement | null;
  startX: number;
  dragging: boolean;
}

const reorder: ReorderState = {
  sourceId: null,
  sourceEl: null,
  sourceScope: null,
  ghostEl: null,
  startX: 0,
  dragging: false,
};

function onTabMouseDown(e: MouseEvent, tabId: string, scope: TerminalScope): void {
  // Phase 20 Plan 02: sticky tabs are not draggable (D-03, Pitfall 7).
  if (tabId === 'file-tree' || tabId === 'gsd') return;
  // Only left button, ignore close button clicks
  if (e.button !== 0) return;
  const target = e.currentTarget as HTMLElement;
  // Don't start drag from the close button
  if ((e.target as HTMLElement).closest('[title="Close tab"]') ||
      (e.target as HTMLElement).closest('[title="Pin tab"]') ||
      (e.target as HTMLElement).closest('[title="Unpin tab"]')) return;

  // Don't start drag while renaming a tab
  if (renamingTabId.value === tabId) return;

  // Prevent text selection during drag
  e.preventDefault();

  reorder.sourceId = tabId;
  reorder.sourceEl = target;
  reorder.sourceScope = scope; // Fix #5 (20-05-E)
  reorder.startX = e.clientX;
  reorder.dragging = false;

  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
}

function onDocMouseMove(e: MouseEvent): void {
  if (!reorder.sourceId || !reorder.sourceEl) return;

  const dx = Math.abs(e.clientX - reorder.startX);

  // Start dragging after threshold
  if (!reorder.dragging && dx >= DRAG_THRESHOLD) {
    reorder.dragging = true;
    reorder.sourceEl.style.opacity = '0.4';

    // Create ghost element
    const ghost = reorder.sourceEl.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.top = `${reorder.sourceEl.getBoundingClientRect().top}px`;
    ghost.style.left = `${e.clientX - 40}px`;
    ghost.style.opacity = '0.8';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.transition = 'none';
    ghost.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    ghost.style.borderRadius = '6px';
    document.body.appendChild(ghost);
    reorder.ghostEl = ghost;
  }

  if (!reorder.dragging) return;

  // Move ghost
  if (reorder.ghostEl) {
    reorder.ghostEl.style.left = `${e.clientX - 40}px`;
  }

  // Find tab under cursor and show drop indicator
  const tabEls = document.querySelectorAll<HTMLElement>('[data-tab-id]');
  tabEls.forEach(el => {
    el.style.borderLeft = '';
    el.style.borderRight = '';
  });

  for (const el of tabEls) {
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right) {
      const mid = rect.left + rect.width / 2;
      if (el.dataset.tabId !== reorder.sourceId) {
        if (e.clientX < mid) {
          el.style.borderLeft = `2px solid ${colors.accent}`;
        } else {
          el.style.borderRight = `2px solid ${colors.accent}`;
        }
      }
      break;
    }
  }

  // Phase 22 D-14: drop affordance on target tab bar wrapper.
  // Clear previous drop-target classes first.
  document.querySelectorAll('[data-tablist-scope].drop-target').forEach(el => {
    el.classList.remove('drop-target');
  });
  // Find the hovered tab bar wrapper and add drop-target if crossing scope boundary.
  const hoveredScopeWrapper = (e.target as HTMLElement | null)?.closest?.('[data-tablist-scope]') as HTMLElement | null;
  if (hoveredScopeWrapper) {
    const hoveredScope = hoveredScopeWrapper.dataset.tablistScope as TerminalScope | undefined;
    if (hoveredScope && hoveredScope !== reorder.sourceScope) {
      hoveredScopeWrapper.classList.add('drop-target');
    }
  }
}

function onDocMouseUp(e: MouseEvent): void {
  document.removeEventListener('mousemove', onDocMouseMove);
  document.removeEventListener('mouseup', onDocMouseUp);

  if (!reorder.dragging || !reorder.sourceId) {
    cleanupReorder();
    return;
  }

  // Find drop target
  const tabEls = document.querySelectorAll<HTMLElement>('[data-tab-id]');
  let targetId: string | null = null;
  let insertAfter = false;

  for (const el of tabEls) {
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right) {
      targetId = el.dataset.tabId ?? null;
      const mid = rect.left + rect.width / 2;
      insertAfter = e.clientX >= mid;
      break;
    }
  }

  // If dropped outside tabs, find nearest
  if (!targetId) {
    let closestDist = Infinity;
    for (const el of tabEls) {
      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(e.clientX - center);
      if (dist < closestDist) {
        closestDist = dist;
        targetId = el.dataset.tabId ?? null;
        insertAfter = e.clientX > center;
      }
    }
  }

  if (targetId && targetId !== reorder.sourceId) {
    // ── Fix #5 (20-05-E): cross-scope drop detection ──────────────────────
    const targetEl = Array.from(tabEls).find(el => el.dataset.tabId === targetId) ?? null;
    const targetScope = (targetEl?.closest('[data-tablist-scope]') as HTMLElement | null)
      ?.getAttribute('data-tablist-scope') as TerminalScope | null;
    if (
      reorder.sourceScope &&
      targetScope &&
      targetScope !== reorder.sourceScope
    ) {
      handleCrossScopeDrop(
        reorder.sourceId,
        reorder.sourceScope,
        targetId,
        targetScope,
        insertAfter,
      );
      cleanupReorder();
      return;
    }
    // ── Same-scope reorder (existing behavior) ───────────────────────────
    const ordered = getOrderedTabs();
    const allIds = ordered.map(t => t.id);
    const sourceIdx = allIds.indexOf(reorder.sourceId);

    if (sourceIdx !== -1) {
      // Remove source
      allIds.splice(sourceIdx, 1);
      // Find target position (after removal)
      let targetIdx = allIds.indexOf(targetId);
      if (targetIdx !== -1) {
        if (insertAfter) targetIdx += 1;
        allIds.splice(targetIdx, 0, reorder.sourceId);
        setProjectTabOrder(allIds);
      }
    }
  }

  cleanupReorder();
}

/**
 * Move a tab across scopes (Phase 22 generalized cross-scope drag).
 * Handles: GSD singleton, Git Changes singleton, File Tree (per-scope),
 * Editor tabs, and Terminal/Agent tabs.
 */
export function handleCrossScopeDrop(
  sourceId: string,
  sourceScope: TerminalScope,
  _targetId: string,
  targetScope: TerminalScope,
  _insertAfter: boolean,
): void {
  if (sourceScope === targetScope) return;

  // GSD singleton drag
  const gsd = gsdTab.value;
  if (gsd && gsd.id === sourceId) {
    openOrMoveSingletonToScope('gsd', targetScope);
    return;
  }

  // Git Changes singleton drag (generalized from openOrMoveGitChangesToRight).
  const gc = gitChangesTab.value;
  if (gc && gc.id === sourceId) {
    openOrMoveSingletonToScope('git-changes', targetScope);
    return;
  }

  // File Tree (non-singleton, per-scope).
  if (sourceId.startsWith('file-tree-')) {
    const tab = fileTreeTabs.value.find(t => t.id === sourceId);
    if (!tab || tab.ownerScope === targetScope) return;
    fileTreeTabs.value = fileTreeTabs.value.map(t =>
      t.id === sourceId ? { ...t, ownerScope: targetScope } : t
    );
    setScopedTabOrder(sourceScope, getScopedTabOrder(sourceScope).filter(id => id !== sourceId));
    setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), sourceId]);
    getTerminalScope(targetScope).activeTabId.value = sourceId;
    if (getTerminalScope(sourceScope).activeTabId.value === sourceId) {
      getTerminalScope(sourceScope).activeTabId.value = '';
    }
    return;
  }

  // Plan 20-05-D: editor tabs — flip ownerScope and update scoped orders.
  if (sourceId.startsWith('editor-')) {
    const edTab = editorTabs.value.find(t => t.id === sourceId);
    if (!edTab) return;
    if ((edTab.ownerScope ?? 'main-0') === targetScope) return;

    const updated = editorTabs.value.map(t =>
      t.id === sourceId ? { ...t, ownerScope: targetScope } : t,
    );
    setProjectEditorTabs(updated);

    setScopedTabOrder(
      sourceScope,
      getScopedTabOrder(sourceScope).filter(id => id !== sourceId),
    );
    setScopedTabOrder(
      targetScope,
      [...getScopedTabOrder(targetScope).filter(id => id !== sourceId), sourceId],
    );

    if (targetScope.startsWith('right')) {
      getTerminalScope('right-0').activeTabId.value = sourceId;
      if (activeUnifiedTabId.value === sourceId) {
        const remainingMain = computeDynamicTabsForScope('main-0');
        activeUnifiedTabId.value = remainingMain[0]?.id ?? '';
      }
    } else {
      activeUnifiedTabId.value = sourceId;
      const rightScope = getTerminalScope('right-0');
      if (rightScope.activeTabId.value === sourceId) {
        const remainingRight = computeDynamicTabsForScope('right-0');
        rightScope.activeTabId.value = remainingRight[0]?.id ?? '';
      }
    }
    return;
  }

  // Terminal/Agent tabs.
  const sourceTabs = getTerminalScope(sourceScope).tabs.value;
  const found = sourceTabs.find(t => t.id === sourceId);
  if (!found) return;

  const movedTab = { ...found, ownerScope: targetScope };
  getTerminalScope(sourceScope).tabs.value = sourceTabs.filter(t => t.id !== sourceId);
  getTerminalScope(targetScope).tabs.value = [
    ...getTerminalScope(targetScope).tabs.value,
    movedTab,
  ];

  setScopedTabOrder(
    sourceScope,
    getScopedTabOrder(sourceScope).filter(id => id !== sourceId),
  );
  setScopedTabOrder(
    targetScope,
    [...getScopedTabOrder(targetScope), sourceId],
  );

  getTerminalScope(targetScope).activeTabId.value = sourceId;
  if (getTerminalScope(sourceScope).activeTabId.value === sourceId) {
    const remaining = getTerminalScope(sourceScope).tabs.value;
    getTerminalScope(sourceScope).activeTabId.value = remaining[0]?.id ?? '';
  }
}

function cleanupReorder(): void {
  if (reorder.sourceEl) {
    reorder.sourceEl.style.opacity = '';
  }
  if (reorder.ghostEl) {
    reorder.ghostEl.remove();
  }
  // Clear all indicators
  document.querySelectorAll<HTMLElement>('[data-tab-id]').forEach(el => {
    el.style.borderLeft = '';
    el.style.borderRight = '';
  });
  // Phase 22 D-14: clear any lingering drop-target classes.
  document.querySelectorAll('[data-tablist-scope].drop-target').forEach(el => {
    el.classList.remove('drop-target');
  });
  reorder.sourceId = null;
  reorder.sourceEl = null;
  reorder.sourceScope = null; // Fix #5 (20-05-E)
  reorder.ghostEl = null;
  reorder.startX = 0;
  reorder.dragging = false;
}

// ── Component ───────────────────────────────────────────────────────────────────

export function UnifiedTabBar({ scope }: UnifiedTabBarProps) {
  const ordered = getOrderedTabsForScope(scope);
  // Phase 22: active tab for each scope reads from that scope's own signal,
  // so sub-scopes maintain independent focus state.
  const scopeActiveId = getTerminalScope(scope).activeTabId.value;
  const currentId = activeUnifiedTabId.value;
  const dropdownItems = buildDropdownItems(scope);
  const hasDynamicRight = scope.startsWith('right') && computeDynamicTabsForScope(scope).length > 0;

  // Compute zone for split icon: 'main-0' or 'right'
  const zone: 'main-0' | 'right' = scope.startsWith('main-0') ? 'main-0' : 'right';
  const activeSubScopes = getActiveSubScopesForZone(zone);
  const atCap = activeSubScopes.length >= 3;

  function handleTabClick(tab: UnifiedTab): void {
    // Phase 22: GSD singleton, File Tree, Git Changes all route via owningScope.
    if (tab.type === 'gsd') {
      getTerminalScope(tab.owningScope).activeTabId.value = tab.id;
      activeUnifiedTabId.value = tab.id;
      return;
    }
    if (tab.type === 'file-tree') {
      getTerminalScope(tab.ownerScope).activeTabId.value = tab.id;
      activeUnifiedTabId.value = tab.id;
      return;
    }
    if (tab.type === 'git-changes') {
      getTerminalScope(tab.owningScope).activeTabId.value = tab.id;
      activeUnifiedTabId.value = tab.id;
      return;
    }
    // Terminal tab: scope determined by tab.scope.
    if (tab.type === 'terminal') {
      const scopeHandle = getTerminalScope(tab.scope);
      scopeHandle.activeTabId.value = tab.id;
      activeUnifiedTabId.value = tab.id;
      activeTabId.value = tab.id;
      switchToTab(tab.id);
      return;
    }
    // Editor tabs — route to owning scope's signal.
    if (tab.type === 'editor') {
      const ownerScope = tab.ownerScope ?? 'main-0';
      getTerminalScope(ownerScope).activeTabId.value = tab.id;
      // Only update global activeUnifiedTabId for main-scope editors;
      // right-scope has its own isolated focus tracking.
      if (!ownerScope.startsWith('right-')) {
        activeUnifiedTabId.value = tab.id;
      }
      return;
    }
  }

  function handleClose(e: MouseEvent, tabId: string): void {
    e.stopPropagation();
    e.preventDefault();
    closeUnifiedTab(tabId);
  }

  // Horizontal scroll on wheel
  function handleWheel(e: WheelEvent): void {
    const container = e.currentTarget as HTMLElement;
    container.scrollLeft += e.deltaY;
  }

  return (
    <div
      class="flex shrink-0 items-center border-b"
      role="tablist"
      data-tablist-scope={scope}
      style={{
        backgroundColor: colors.bgBase,
        borderColor: colors.bgBorder,
      }}
    >
      <style>{`
        .unified-tab-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Scrollable tabs area */}
      <div
        class="unified-tab-scroll flex items-center px-2 py-2"
        style={{
          flex: 1,
          minWidth: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
        onWheel={handleWheel}
      >
        {ordered.map((tab, i) => {
          const isActive = tab.id === currentId;
          const rendered = renderTab(tab, isActive, handleTabClick, handleClose, scope);
          // D-05 optional divider: insert 1px rule after the sticky pair when
          // right scope has at least one dynamic tab. Sticky tabs occupy
          // indices 0 (file-tree) and 1 (gsd); divider goes after index 1.
          if (scope.startsWith('right-') && i === 1 && hasDynamicRight) {
            return (
              <>
                {rendered}
                <div
                  key="sticky-dynamic-divider"
                  class="sticky-dynamic-divider"
                  style={{
                    width: '1px',
                    height: '12px',
                    alignSelf: 'center',
                    backgroundColor: colors.bgBorder,
                    marginLeft: '4px',
                    marginRight: '4px',
                  }}
                  aria-hidden="true"
                />
              </>
            );
          }
          return rendered;
        })}
      </div>

      {/* Sticky right actions */}
      <div
        class="flex items-center gap-1 px-2 py-2 shrink-0"
        style={{
          borderLeft: `1px solid ${colors.bgBorder}`,
        }}
      >
        {/*
          Minimap toggle: visible ONLY when the active tab in THIS scope is an
          editor (file) tab. Each scope maintains its own activeTabId, so the
          main and right tab bars independently show/hide this icon based on
          what the user is looking at in that scope (Plan 20-05-C).
        */}
        {isEditorTabActiveInScope(ordered, currentId) && (
          <button
            class="w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
            style={{
              color: minimapVisible.value ? colors.textDim : colors.textMuted,
              backgroundColor: 'transparent',
              border: 'none',
            }}
            aria-label={minimapVisible.value ? 'Hide minimap' : 'Show minimap'}
            title={minimapVisible.value ? 'Hide minimap' : 'Show minimap'}
            onClick={() => toggleMinimap()}
            onMouseEnter={(e: MouseEvent) => {
              const t = e.currentTarget as HTMLElement;
              t.style.color = colors.textPrimary;
              t.style.backgroundColor = colors.bgElevated;
            }}
            onMouseLeave={(e: MouseEvent) => {
              const t = e.currentTarget as HTMLElement;
              t.style.color = minimapVisible.value ? colors.textDim : colors.textMuted;
              t.style.backgroundColor = 'transparent';
            }}
          >
            {minimapVisible.value
              ? <PanelRightClose size={14} />
              : <PanelRight size={14} />}
          </button>
        )}

        <Dropdown
          items={dropdownItems}
          trigger={({ onClick, 'aria-haspopup': ariaHasPopup, 'aria-expanded': ariaExpanded }) => (
            <button
              class="w-7 h-7 rounded flex items-center justify-center text-base cursor-pointer shrink-0"
              style={{
                color: colors.textDim,
                fontFamily: fonts.sans,
                backgroundColor: 'transparent',
                border: 'none',
              }}
              aria-label="Add new tab"
              aria-haspopup={ariaHasPopup}
              aria-expanded={ariaExpanded}
              onClick={onClick}
              onMouseEnter={e => {
                const t = e.target as HTMLElement;
                t.style.color = colors.textPrimary;
                t.style.backgroundColor = colors.bgElevated;
              }}
              onMouseLeave={e => {
                const t = e.target as HTMLElement;
                t.style.color = colors.textDim;
                t.style.backgroundColor = 'transparent';
              }}
            >+</button>
          )}
        />

        {/* Phase 22 Plan 03: split icon button (Rows2, 14px) */}
        <button
          class="tab-bar-split-icon"
          aria-label={atCap ? 'Split pane (maximum 3 panes reached)' : 'Split pane'}
          aria-disabled={atCap}
          disabled={atCap}
          title={atCap ? 'Split pane (maximum 3 panes reached)' : 'Split pane'}
          onClick={() => { if (!atCap) spawnSubScopeForZone(zone); }}
          style={{
            width: 18,
            height: 18,
            borderRadius: 3,
            background: 'transparent',
            color: atCap ? colors.textDim : colors.textMuted,
            border: 'none',
            cursor: atCap ? 'not-allowed' : 'pointer',
            opacity: atCap ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s, background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (atCap) return;
            (e.currentTarget as HTMLElement).style.color = colors.accent;
          }}
          onMouseLeave={(e) => {
            if (atCap) return;
            (e.currentTarget as HTMLElement).style.color = colors.textMuted;
          }}
        >
          <Rows2 size={14} />
        </button>

        {/* Phase 22 gap-closure (22-10): close-split button (X, 14px).
            Only rendered when THIS scope is not scope-0 (i.e. scope id ends
            with `-1` or `-2`). Scope-0 cannot be closed. */}
        {(() => {
          const m = /-(\d+)$/.exec(scope);
          const idx = m ? parseInt(m[1], 10) : 0;
          if (idx === 0) return null;
          const zKind: 'main' | 'right' = scope.startsWith('main') ? 'main' : 'right';
          return (
            <button
              class="tab-bar-close-split-icon"
              aria-label="Close split"
              title="Close split (move tabs to first pane)"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                closeSubScope(zKind, idx);
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                background: 'transparent',
                color: colors.textMuted,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 4,
                transition: 'color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = colors.accent;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = colors.textMuted;
              }}
            >
              <X size={14} />
            </button>
          );
        })()}
      </div>
    </div>
  );
}

function renderTab(
  tab: UnifiedTab,
  isActive: boolean,
  onClick: (tab: UnifiedTab) => void,
  onClose: (e: MouseEvent, tabId: string) => void,
  scope: TerminalScope,
): VNode {
  // Phase 22: all dynamic tabs render through the unified branch.
  // Fixed titles for file-tree/gsd/git-changes (no double-click rename).
  // All tabs have a close button. All tabs are draggable (via onTabMouseDown).
  const isFixedTitle = tab.type === 'file-tree' || tab.type === 'gsd' || tab.type === 'git-changes';
  const doubleClickRename = !isFixedTitle;

  let label: string;
  let indicator: VNode | null = null;
  let tabTitle: string;

  if (tab.type === 'terminal') {
    const scopeTabs = getTerminalScope(tab.scope).tabs.value;
    const termTab = scopeTabs.find(t => t.id === tab.terminalTabId);
    label = termTab?.label ?? 'Terminal';
    tabTitle = termTab?.sessionName ?? label;
    if (isActive) {
      indicator = (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.statusGreen,
            flexShrink: 0,
          }}
        />
      );
    }
  } else if (tab.type === 'editor') {
    label = tab.displayName || tab.fileName;
    tabTitle = tab.filePath;
    indicator = (
      <span
        class="flex items-center justify-center"
        style={{
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          togglePinEditorTab(tab.id);
        }}
        title={tab.pinned ? 'Unpin tab' : 'Pin tab'}
      >
        <Pin
          size={12}
          style={{
            color: tab.pinned ? colors.accent : colors.textDim,
            transition: 'color 0.15s ease',
          }}
        />
      </span>
    );
  } else {
    // git-changes
    label = 'Git Changes';
    tabTitle = 'Git Changes';
    indicator = <FileDiff size={14} style={{ color: colors.accent, flexShrink: 0 }} />;
  }

  const isUnpinnedEditor = tab.type === 'editor' && !tab.pinned;

  return (
    <div
      key={tab.id}
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      data-tab-id={tab.id}
      class="flex items-center gap-2 cursor-pointer shrink-0"
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: isActive ? `2px solid ${colors.accent}` : '2px solid transparent',
        marginBottom: -1,
        padding: `${spacing.xl}px ${spacing['3xl']}px`,
        fontFamily: fonts.sans,
        fontSize: 11,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? colors.textPrimary : colors.textMuted,
        maxWidth: 200,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        userSelect: 'none',
      }}
      onClick={() => onClick(tab)}
      onDblClick={() => {
        // Phase 22 D-05: fixed-title tabs (file-tree/gsd/git-changes) cannot be renamed.
        if (!doubleClickRename) return;
        if (tab.type === 'editor' && !tab.pinned) {
          pinEditorTab(tab.id);
        }
      }}
      title={tabTitle}
      onMouseDown={e => onTabMouseDown(e, tab.id, scope)}
    >
      {indicator}
      {renamingTabId.value === tab.id ? (
        <input
          type="text"
          style={{
            background: colors.bgElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.accent}`,
            borderRadius: 3,
            padding: '0 4px',
            fontFamily: fonts.sans,
            fontSize: 11,
            fontWeight: 400,
            width: 100,
            outline: 'none',
          }}
          value={label}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              const input = e.currentTarget as HTMLInputElement;
              const newName = input.value.trim();
              if (tab.type === 'terminal') {
                renameTerminalTab(tab.id, newName || getDefaultTerminalLabel(
                  terminalTabs.value.find(t => t.id === tab.terminalTabId)!
                ));
              } else if (tab.type === 'editor') {
                renameEditorTab(tab.id, newName);
              }
              renamingTabId.value = '';
            } else if (e.key === 'Escape') {
              renamingTabId.value = '';
            }
            e.stopPropagation();
          }}
          onBlur={() => { renamingTabId.value = ''; }}
          ref={(el: HTMLInputElement | null) => {
            if (el) {
              el.focus();
              el.select();
            }
          }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
          onMouseDown={(e: MouseEvent) => e.stopPropagation()}
        />
      ) : (
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontStyle: isUnpinnedEditor ? 'italic' : 'normal',
          }}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();

            // Double-click detection: if timer pending for same tab, it's a double-click
            if (tabLabelClickTimer && pendingTabLabelClick === tab.id) {
              clearTimeout(tabLabelClickTimer);
              tabLabelClickTimer = null;
              pendingTabLabelClick = null;
              // Phase 22 D-05: fixed-title tabs (file-tree/gsd/git-changes) cannot be renamed.
              if (!doubleClickRename) {
                return;
              }
              // Do NOT call onClick(tab) here -- tab is already active from first click.
              renamingTabId.value = tab.id;
              return;
            }

            // Clear any pending timer for a different tab
            if (tabLabelClickTimer) {
              clearTimeout(tabLabelClickTimer);
            }

            // First click: always switch to this tab
            onClick(tab);

            pendingTabLabelClick = tab.id;
            tabLabelClickTimer = setTimeout(() => {
              tabLabelClickTimer = null;
              pendingTabLabelClick = null;

              // Only reveal for editor tabs
              if (tab.type !== 'editor') return;

              const leftHasFiles = leftSidebarActiveTab.value === 'files';
              const rightHasFiles = rightTopTab.value === 'File Tree';

              if (!leftHasFiles && !rightHasFiles) {
                // Neither has Files tab active -- open Files in left sidebar
                leftSidebarActiveTab.value = 'files';
              }
              // Reveal in tree
              revealFileInTree(tab.filePath);
            }, 250);
          }}
        >
          {label}
        </span>
      )}
      {tab.type === 'editor' && !tab.pinned && tab.dirty && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.statusYellow,
            flexShrink: 0,
          }}
        />
      )}
      {tab.type === 'editor' && tab.changedOnDisk === true && (
        // Phase 21 Plan 01 (FIX-01 / D-07): on-disk-changed indicator. Independent
        // of the dirty dot so the two can render side-by-side when the user has
        // unsaved edits AND the file changed externally.
        <span
          title="File changed on disk since last read."
          style={{
            color: colors.accent,
            fontSize: 12,
            lineHeight: 1,
            marginLeft: 2,
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          {'\u27F3'}
        </span>
      )}
      <span
        class="ml-1 flex items-center justify-center"
        style={{ color: colors.textDim, fontSize: 14 }}
        onClick={e => onClose(e, tab.id)}
        onMouseEnter={e => {
          const t = e.target as HTMLElement;
          if (t.textContent === '\u00D7') t.style.color = colors.textPrimary;
        }}
        onMouseLeave={e => {
          const t = e.target as HTMLElement;
          if (t.textContent === '\u00D7') t.style.color = colors.textDim;
        }}
        title="Close tab"
      >
        {'\u00D7'}
      </span>
    </div>
  );
}
