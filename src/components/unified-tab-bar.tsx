// unified-tab-bar.tsx -- Unified tab bar mixing terminal tabs, editor tabs, and git changes tab
// Replaces TerminalTabBar per D-01, D-02, D-03, D-04, D-05, EDIT-05
// Built per Plan 02

import { signal, computed } from '@preact/signals';
import type { VNode } from 'preact';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts, spacing } from '../tokens';
import { Dropdown, type DropdownItem } from './dropdown-menu';
import { showConfirmModal } from './confirm-modal';
import { Terminal, Bot, FileDiff } from 'lucide-preact';
import type { TerminalTab } from './terminal-tabs';
import {
  terminalTabs,
  activeTabId,
  createNewTab,
  closeTab,
  switchToTab,
} from './terminal-tabs';
import { writeFile, readFile } from '../services/file-service';
import { getEditorCurrentContent } from '../editor/setup';
import { activeProjectName, updateSession, getCurrentState } from '../state-manager';

// ── Tab Type System ─────────────────────────────────────────────────────────────

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
}

interface GitChangesTabData extends BaseTab {
  type: 'git-changes';
}

type UnifiedTab =
  | { type: 'terminal'; id: string; terminalTabId: string }
  | EditorTabData
  | GitChangesTabData;

// ── Signals ─────────────────────────────────────────────────────────────────---

/** Editor tabs keyed by project name */
const _editorTabsByProject = signal<Map<string, EditorTabData[]>>(new Map());
/** Tab order keyed by project name */
const _tabOrderByProject = signal<Map<string, string[]>>(new Map());

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

/** Combined tab list: terminals from terminalTabs + editors + git changes */
export const allTabs = computed<UnifiedTab[]>(() => {
  const terminals: UnifiedTab[] = terminalTabs.value.map(t => ({
    type: 'terminal' as const,
    id: t.id,
    terminalTabId: t.id,
  }));
  const editors: UnifiedTab[] = editorTabs.value;
  const git: UnifiedTab[] = gitChangesTab.value ? [gitChangesTab.value] : [];
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
 * Open a file in an editor tab (D-03: one-tab-per-file policy).
 * If the file is already open, focus its existing tab instead of creating a duplicate.
 */
export function openEditorTab(filePath: string, fileName: string, content: string): void {
  // D-03: one-tab-per-file enforcement
  const existing = editorTabs.value.find(t => t.filePath === filePath);
  if (existing) {
    activeUnifiedTabId.value = existing.id;
    return;
  }

  const newTab: EditorTabData = {
    id: 'editor-' + Date.now(),
    type: 'editor',
    filePath,
    fileName,
    content,
    dirty: false,
  };

  setProjectEditorTabs([...editorTabs.value, newTab]);
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  activeUnifiedTabId.value = newTab.id;
}

// ── Editor Tab Persistence ─────────────────────────────────────────────────────

/**
 * Persist the current editorTabs to state.json under the active project's key.
 * Saves only filePath and fileName (not content -- file content is re-read from disk on restore).
 */
function persistEditorTabs(): void {
  const activeName = activeProjectName.value;
  const tabs = editorTabs.value.map(t => ({
    filePath: t.filePath,
    fileName: t.fileName,
  }));
  const data = JSON.stringify({ tabs, activeTabId: activeUnifiedTabId.value });
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

  let parsed: { tabs: Array<{ filePath: string; fileName: string }>; activeTabId: string } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch { return false; }

  if (!parsed?.tabs?.length) return false;

  for (const tab of parsed.tabs) {
    try {
      const content = await readFile(tab.filePath);
      openEditorTab(tab.filePath, tab.fileName, content);
    } catch (err) {
      console.warn('[efxmux] Could not restore editor tab:', tab.filePath, err);
    }
  }
  return true;
}

// Watch editorTabs changes and persist
editorTabs.subscribe(() => {
  persistEditorTabs();
});

/**
 * Open the Git Changes tab, or focus it if already open.
 */
export function openGitChangesTab(): void {
  const existing = gitChangesTab.value;
  if (existing) {
    activeUnifiedTabId.value = existing.id;
    return;
  }

  const newTab: GitChangesTabData = {
    id: 'git-changes',
    type: 'git-changes',
  };

  gitChangesTab.value = newTab;
  setProjectTabOrder([...tabOrder.value, newTab.id]);
  activeUnifiedTabId.value = newTab.id;
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

function buildDropdownItems(): DropdownItem[] {
  return [
    {
      label: 'Terminal (Zsh)',
      icon: Terminal,
      action: () => createNewTab(),
    },
    {
      label: 'Agent',
      icon: Bot,
      action: () => createNewTab({ isAgent: true }),
    },
    {
      label: 'Git Changes',
      icon: FileDiff,
      action: () => openGitChangesTab(),
    },
  ];
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
  ghostEl: HTMLElement | null;
  startX: number;
  dragging: boolean;
}

const reorder: ReorderState = {
  sourceId: null,
  sourceEl: null,
  ghostEl: null,
  startX: 0,
  dragging: false,
};

function onTabMouseDown(e: MouseEvent, tabId: string): void {
  // Only left button, ignore close button clicks
  if (e.button !== 0) return;
  const target = e.currentTarget as HTMLElement;
  // Don't start drag from the close button
  if ((e.target as HTMLElement).closest('[title="Close tab"]')) return;

  // Prevent text selection during drag
  e.preventDefault();

  reorder.sourceId = tabId;
  reorder.sourceEl = target;
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
  reorder.ghostEl = null;
  reorder.startX = 0;
  reorder.dragging = false;
}

// ── Component ───────────────────────────────────────────────────────────────────

export function UnifiedTabBar() {
  const ordered = getOrderedTabs();
  const currentId = activeUnifiedTabId.value;
  const dropdownItems = buildDropdownItems();

  function handleTabClick(tab: UnifiedTab): void {
    activeUnifiedTabId.value = tab.id;
    // If it's a terminal tab, sync activeTabId and switch container visibility
    if (tab.type === 'terminal') {
      activeTabId.value = tab.id;
      switchToTab(tab.id);
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
      class="flex px-2 py-2 shrink-0 items-center border-b"
      role="tablist"
      style={{
        backgroundColor: colors.bgBase,
        borderColor: colors.bgBorder,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
      onWheel={handleWheel}
    >
      <style>{`
        .unified-tab-bar::-webkit-scrollbar { display: none; }
      `}</style>

      {ordered.map(tab => {
        const isActive = tab.id === currentId;
        return renderTab(tab, isActive, handleTabClick, handleClose);
      })}

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
  );
}

function renderTab(
  tab: UnifiedTab,
  isActive: boolean,
  onClick: (tab: UnifiedTab) => void,
  onClose: (e: MouseEvent, tabId: string) => void,
): VNode {
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
    label = tab.fileName;
    tabTitle = tab.filePath;
    if (tab.dirty) {
      indicator = (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.statusYellow,
            flexShrink: 0,
          }}
        />
      );
    }
  } else {
    // git-changes
    label = 'Git Changes';
    tabTitle = 'Git Changes';
    indicator = <FileDiff size={14} style={{ color: colors.accent, flexShrink: 0 }} />;
  }

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
      title={tabTitle}
      onMouseDown={e => onTabMouseDown(e, tab.id)}
    >
      {indicator}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
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
