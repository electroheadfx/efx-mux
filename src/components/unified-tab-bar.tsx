// unified-tab-bar.tsx -- Unified tab bar mixing terminal tabs, editor tabs, and git changes tab
// Replaces TerminalTabBar per D-01, D-02, D-03, D-04, D-05, EDIT-05
// Built per Plan 02

import { signal, computed } from '@preact/signals';
import type { VNode } from 'preact';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts, spacing } from '../tokens';
import { Dropdown, type DropdownItem } from './dropdown-menu';
import { showConfirmModal } from './confirm-modal';
import { Terminal, Bot, FileDiff, Pin, PanelRightClose, PanelRight, FolderOpen, ListChecks } from 'lucide-preact';
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
}

interface GitChangesTabData extends BaseTab {
  type: 'git-changes';
  /** Which panel owns this tab (D-07). Defaults to 'main' on first render. */
  owningScope: TerminalScope;
}

/** Sticky tab variant for right-scope File Tree / GSD pinned tabs (D-03, D-05). */
interface StickyTabData {
  type: 'file-tree' | 'gsd';
  id: 'file-tree' | 'gsd';
}

type UnifiedTab =
  | { type: 'terminal'; id: string; terminalTabId: string; scope: TerminalScope }
  | EditorTabData
  | GitChangesTabData
  | StickyTabData;

// ── Signals ─────────────────────────────────────────────────────────────────---

/** Editor tabs keyed by project name */
const _editorTabsByProject = signal<Map<string, EditorTabData[]>>(new Map());
/** Tab order keyed by project name (legacy, used for main scope) */
const _tabOrderByProject = signal<Map<string, string[]>>(new Map());
/**
 * Phase 20 Plan 02: per-scope, per-project tab order.
 * Outer key = TerminalScope ('main' | 'right'), inner key = project name.
 * Only dynamic tab IDs are stored — sticky IDs ('file-tree', 'gsd') NEVER
 * appear here (D-03 drag-reject; Pitfall 7).
 */
const _tabOrderByProjectScoped = signal<Map<TerminalScope, Map<string, string[]>>>(
  new Map<TerminalScope, Map<string, string[]>>([
    ['main', new Map<string, string[]>()],
    ['right', new Map<string, string[]>()],
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
function setProjectEditorTabs(tabs: EditorTabData[]): void {
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
  // Defensive: strip any sticky IDs (D-03).
  const clean = order.filter(id => id !== 'file-tree' && id !== 'gsd');
  const nextOuter = new Map(_tabOrderByProjectScoped.value);
  const inner = new Map(nextOuter.get(scope) ?? new Map<string, string[]>());
  inner.set(name, clean);
  nextOuter.set(scope, inner);
  _tabOrderByProjectScoped.value = nextOuter;
}

/** Remove a tab ID from main-scope order (used by Git Changes handoff). */
function removeFromMainTabOrder(id: string): void {
  setScopedTabOrder('main', getScopedTabOrder('main').filter(x => x !== id));
}

/** Append a tab ID to right-scope order (used by Git Changes handoff). */
function appendToRightTabOrder(id: string): void {
  const cur = getScopedTabOrder('right');
  if (!cur.includes(id)) setScopedTabOrder('right', [...cur, id]);
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
    scope: 'main' as const,
  }));
  const editors: UnifiedTab[] = editorTabs.value;
  const git: UnifiedTab[] = (gitChangesTab.value && gitChangesTab.value.owningScope !== 'right')
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
 * Open a file in an editor tab as a preview (single-click behavior).
 * D-03: one-tab-per-file policy. If already open, focus it.
 * Otherwise, replace the existing unpinned (preview) tab, or create a new one.
 */
export function openEditorTab(filePath: string, fileName: string, content: string): void {
  // D-03: one-tab-per-file enforcement -- if already open, just focus it
  const existing = editorTabs.value.find(t => t.filePath === filePath);
  if (existing) {
    activeUnifiedTabId.value = existing.id;
    return;
  }

  // Find existing unpinned (preview) tab to replace
  const unpinned = editorTabs.value.find(t => !t.pinned);
  if (unpinned) {
    // Replace the unpinned tab's content (keep same ID so tab position is preserved)
    const updatedTabs = editorTabs.value.map(t =>
      t.id === unpinned.id
        ? { ...t, filePath, fileName, content, dirty: false, pinned: false }
        : t
    );
    setProjectEditorTabs(updatedTabs);
    activeUnifiedTabId.value = unpinned.id;
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
  };

  setProjectEditorTabs([...editorTabs.value, newTab]);
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  activeUnifiedTabId.value = newTab.id;
}

/**
 * Open a file directly as a pinned editor tab (double-click behavior).
 * If already open, pin it and focus. Otherwise create a new pinned tab.
 */
export function openEditorTabPinned(filePath: string, fileName: string, content: string): void {
  // One-tab-per-file: if already open, pin it and focus
  const existing = editorTabs.value.find(t => t.filePath === filePath);
  if (existing) {
    if (!existing.pinned) {
      pinEditorTab(existing.id);
    }
    activeUnifiedTabId.value = existing.id;
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
  };

  setProjectEditorTabs([...editorTabs.value, newTab]);
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  activeUnifiedTabId.value = newTab.id;
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

  let parsed: { tabs: Array<{ filePath: string; fileName: string; pinned?: boolean; displayName?: string }>; activeTabId: string } | null = null;
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

/**
 * Open the Git Changes tab (main scope), or focus it if already open.
 * Pitfall 3: gitChangesTab carries `owningScope` so only the owning panel renders it.
 */
export function openGitChangesTab(): void {
  const existing = gitChangesTab.value;
  if (existing) {
    // If currently owned by right, flip back to main (symmetrical to handoff)
    if (existing.owningScope === 'right') {
      gitChangesTab.value = { ...existing, owningScope: 'main' };
    }
    activeUnifiedTabId.value = existing.id;
    return;
  }

  const newTab: GitChangesTabData = {
    id: 'git-changes',
    type: 'git-changes',
    owningScope: 'main',
  };

  gitChangesTab.value = newTab;
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  setScopedTabOrder('main', [...getScopedTabOrder('main'), newTab.id]);
  activeUnifiedTabId.value = newTab.id;
}

/**
 * Open or move Git Changes into the right panel (D-07). Three branches:
 *  - already owned by right → just activate it (no duplication)
 *  - owned by main → move to right (same ID, flip owningScope, update orders,
 *    fall back main active to first remaining main tab)
 *  - not yet open → create a new tab owned by right
 */
export function openOrMoveGitChangesToRight(): void {
  const existing = gitChangesTab.value;
  const rightScope = getTerminalScope('right');

  if (existing?.owningScope === 'right') {
    rightScope.activeTabId.value = existing.id;
    activeUnifiedTabId.value = existing.id;
    return;
  }

  if (existing?.owningScope === 'main') {
    removeFromMainTabOrder(existing.id);
    appendToRightTabOrder(existing.id);
    gitChangesTab.value = { ...existing, owningScope: 'right' };
    rightScope.activeTabId.value = existing.id;
    // Main active-tab fallback: first remaining main-scope dynamic tab, else ''
    const mainTabs = getTerminalScope('main').tabs.value;
    if (mainTabs.length > 0) {
      getTerminalScope('main').activeTabId.value = mainTabs[0].id;
      activeUnifiedTabId.value = mainTabs[0].id;
    } else {
      getTerminalScope('main').activeTabId.value = '';
      activeUnifiedTabId.value = '';
    }
    return;
  }

  // Create new, owned by right
  const id = `git-changes-${Date.now()}`;
  const newTab: GitChangesTabData = {
    id,
    type: 'git-changes',
    owningScope: 'right',
  };
  gitChangesTab.value = newTab;
  appendToRightTabOrder(id);
  rightScope.activeTabId.value = id;
  activeUnifiedTabId.value = id;
}

/**
 * Close a tab by ID, handling dirty state for editor tabs (D-11).
 */
export function closeUnifiedTab(tabId: string): void {
  const tab = allTabs.value.find(t => t.id === tabId);
  if (!tab) return;

  if (tab.type === 'terminal') {
    // Check if this is an agent tab -- offer graceful quit option
    const termTab = terminalTabs.value.find(t => t.id === tabId);

    if (termTab?.isAgent) {
      showConfirmModal({
        title: 'Quit Agent',
        message: 'Do you want to quit just the agent or close the terminal session entirely?',
        confirmLabel: 'Quit Terminal',
        onConfirm: () => {
          // Red button: destroy PTY session and remove tab (existing behavior)
          // Update unified selection BEFORE closeTab removes the tab from allTabs.
          // switchToAdjacentTab reads getOrderedTabs() which needs the tab still present.
          if (tabId === activeUnifiedTabId.value) {
            switchToAdjacentTab(tabId);
          }
          setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
          closeTab(tabId);
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

    // Non-agent terminal: close immediately
    // Update unified selection BEFORE closeTab removes the tab from allTabs.
    // switchToAdjacentTab reads getOrderedTabs() which needs the tab still present.
    if (tabId === activeUnifiedTabId.value) {
      switchToAdjacentTab(tabId);
    }
    setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
    closeTab(tabId);
    return;
  }

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

function buildDropdownItems(scope: TerminalScope): DropdownItem[] {
  if (scope === 'main') {
    // Phase 17 items preserved verbatim for backward compat (SIDE-02)
    return [
      {
        label: 'Terminal (Zsh)',
        icon: Terminal,
        action: () => { void createNewTab(); },
      },
      {
        label: 'Agent',
        icon: Bot,
        action: () => { void createNewTab({ isAgent: true }); },
      },
      {
        label: 'Git Changes',
        icon: FileDiff,
        action: () => openGitChangesTab(),
      },
    ];
  }
  // scope === 'right' — D-06
  const rightScope = getTerminalScope('right');
  const gcInRight = gitChangesTab.value?.owningScope === 'right';
  return [
    {
      label: 'Terminal (Zsh)',
      icon: Terminal,
      action: () => { void rightScope.createNewTab(); },
    },
    {
      label: 'Agent',
      icon: Bot,
      action: () => { void rightScope.createNewTab({ isAgent: true }); },
    },
    {
      label: 'Git Changes',
      icon: FileDiff,
      action: () => openOrMoveGitChangesToRight(),
      disabled: gcInRight,
    },
  ];
}

// ── Scope-aware ordering (Phase 20, Plan 02) ─────────────────────────────────

/** Compute the dynamic-tab list for a given scope (terminals + editors [main only]
 *  + git-changes if owned by this scope). Does NOT include sticky tabs. */
function computeDynamicTabsForScope(scope: TerminalScope): UnifiedTab[] {
  const scopeHandle = getTerminalScope(scope);
  const terminals: UnifiedTab[] = scopeHandle.tabs.value.map(t => ({
    type: 'terminal' as const,
    id: t.id,
    terminalTabId: t.id,
    scope,
  }));
  const editors: UnifiedTab[] = scope === 'main' ? editorTabs.value : [];
  const git: UnifiedTab[] = (gitChangesTab.value && gitChangesTab.value.owningScope === scope)
    ? [gitChangesTab.value]
    : [];

  const all: UnifiedTab[] = [...terminals, ...editors, ...git];
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

/** Compute the full ordered tab list for a scope, with sticky tabs
 *  prepended for scope==='right' (File Tree at 0, GSD at 1). */
function getOrderedTabsForScope(scope: TerminalScope): UnifiedTab[] {
  const dynamic = computeDynamicTabsForScope(scope);
  if (scope === 'main') return dynamic;
  // Fix #3 (20-05-C): GSD FIRST, File Tree SECOND (overrides D-17 spec
  // per UAT feedback — users expect the progress/plan view to lead).
  const sticky: UnifiedTab[] = [
    { type: 'gsd',       id: 'gsd' },
    { type: 'file-tree', id: 'file-tree' },
  ];
  return [...sticky, ...dynamic];
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
 * Fix #5 (20-05-E): move a tab across scopes.
 *
 * Scaffold: handles `main <-> right` for terminal/agent tabs (the most common
 * UAT case) and the Git Changes move via the existing
 * openOrMoveGitChangesToRight / openGitChangesTab helpers.
 * Full xterm DOM container migration + cross-scope session persistence are
 * TODO (tracked in 20-05-SUMMARY.md).
 */
export function handleCrossScopeDrop(
  sourceId: string,
  sourceScope: TerminalScope,
  _targetId: string,
  targetScope: TerminalScope,
  _insertAfter: boolean,
): void {
  // Sticky tabs cannot cross scopes (rejected in onTabMouseDown already).
  if (sourceId === 'file-tree' || sourceId === 'gsd') return;

  // Git Changes — delegate to existing move helpers.
  const gc = gitChangesTab.value;
  if (gc && gc.id === sourceId) {
    if (targetScope === 'right') {
      openOrMoveGitChangesToRight();
    } else if (targetScope === 'main') {
      // Flip back to main (openGitChangesTab handles the flip symmetrically).
      openGitChangesTab();
    }
    return;
  }

  // Editor tabs — right scope does not render editor tabs; skip (TODO).
  if (sourceId.startsWith('editor-')) {
    return;
  }

  // Terminal/Agent tabs — primary UAT path.
  const sourceTabs = getTerminalScope(sourceScope).tabs.value;
  const found = sourceTabs.find(t => t.id === sourceId);
  if (!found) return;

  const movedTab = { ...found, ownerScope: targetScope };
  getTerminalScope(sourceScope).tabs.value = sourceTabs.filter(t => t.id !== sourceId);
  getTerminalScope(targetScope).tabs.value = [
    ...getTerminalScope(targetScope).tabs.value,
    movedTab,
  ];

  // Move scoped tab order.
  setScopedTabOrder(
    sourceScope,
    getScopedTabOrder(sourceScope).filter(id => id !== sourceId),
  );
  setScopedTabOrder(
    targetScope,
    [...getScopedTabOrder(targetScope), sourceId],
  );

  // Activate in target scope; fall back source active-tab if needed.
  getTerminalScope(targetScope).activeTabId.value = sourceId;
  if (getTerminalScope(sourceScope).activeTabId.value === sourceId) {
    const remaining = getTerminalScope(sourceScope).tabs.value;
    getTerminalScope(sourceScope).activeTabId.value = remaining[0]?.id ?? '';
  }

  // TODO (20-05-E): migrate xterm DOM container from source
  // `.terminal-containers[data-scope=X]` wrapper to the target scope wrapper,
  // and sync session persistence so the move survives an app restart.
  console.info(
    '[efxmux] cross-scope drag: moved tab',
    sourceId,
    'from', sourceScope, 'to', targetScope,
    '— DOM container migration + session persistence still TODO',
  );
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
  // For right-scope, the active-tab indicator reads from the right scope signal
  // (sticky tabs store their active id there too); for main it stays on the
  // unified signal so editor/git-changes activation continues to work.
  const scopeActiveId = scope === 'right'
    ? getTerminalScope('right').activeTabId.value
    : activeUnifiedTabId.value;
  const currentId = scope === 'right' ? scopeActiveId : activeUnifiedTabId.value;
  const dropdownItems = buildDropdownItems(scope);
  const hasDynamicRight = scope === 'right' && computeDynamicTabsForScope('right').length > 0;

  function handleTabClick(tab: UnifiedTab): void {
    activeUnifiedTabId.value = tab.id;
    // Sticky tabs: set the right-scope active id so the right panel content switches
    if (tab.type === 'file-tree' || tab.type === 'gsd') {
      getTerminalScope('right').activeTabId.value = tab.id;
      return;
    }
    // If it's a terminal tab, sync activeTabId and switch container visibility
    if (tab.type === 'terminal') {
      const scopeHandle = getTerminalScope(tab.scope);
      scopeHandle.activeTabId.value = tab.id;
      if (tab.scope === 'main') {
        activeTabId.value = tab.id;
        switchToTab(tab.id);
      } else {
        scopeHandle.switchToTab(tab.id);
      }
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
          if (scope === 'right' && i === 1 && hasDynamicRight) {
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
  // D-03 / D-05 sticky tab branch (right scope only). Sticky tabs carry
  // `data-sticky-tab-id` (NOT `data-tab-id`) so the drag hit-test never
  // targets them (Pitfall 7). No × button, no double-click rename.
  if (tab.type === 'file-tree' || tab.type === 'gsd') {
    const Icon  = tab.type === 'file-tree' ? FolderOpen : ListChecks;
    const label = tab.type === 'file-tree' ? 'File Tree' : 'GSD';
    const iconColor = isActive ? colors.accent : colors.textMuted;
    return (
      <div
        key={tab.id}
        role="tab"
        aria-selected={isActive}
        data-sticky-tab-id={tab.id}
        title={label}
        onClick={() => onClick(tab)}
        // Fix #2 (20-05-B): block WKWebView text-selection initiated by a
        // drag attempt on a sticky tab. preventDefault on mousedown stops
        // the browser from starting a text-selection range.
        onMouseDown={(e: MouseEvent) => { e.preventDefault(); }}
        class={`unified-tab sticky-tab select-none ${isActive ? 'active' : ''}`}
        style={{
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? colors.textPrimary : colors.textMuted,
          borderBottom: `2px solid ${isActive ? colors.accent : 'transparent'}`,
          marginBottom: -1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          flexShrink: 0,
        }}
      >
        <Icon size={14} style={{ color: iconColor, flexShrink: 0, pointerEvents: 'none' }} />
        <span style={{ userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'none' }}>{label}</span>
        {/* No close button — sticky tabs are uncloseable (D-03). */}
        {/* No onDblClick — sticky tabs cannot be renamed (D-03). */}
      </div>
    );
  }

  let label: string;
  let indicator: VNode | null = null;
  let tabTitle: string;

  if (tab.type === 'terminal') {
    const termTab = terminalTabs.value.find(t => t.id === tab.terminalTabId);
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
              // Fix #4 (20-05-D): Git Changes cannot be renamed. Activating +
              // closing must remain functional. Suppress the rename-input
              // render path for git-changes; other branches are unchanged.
              if (tab.type === 'git-changes') {
                return;
              }
              // Do NOT call onClick(tab) here -- tab is already active from first click.
              // Calling it would trigger switchToTab -> terminal.focus() which steals
              // focus from the rename input that's about to render.
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
