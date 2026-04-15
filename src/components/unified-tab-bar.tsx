// unified-tab-bar.tsx -- Unified tab bar mixing terminal tabs, editor tabs, and git changes tab
// Replaces TerminalTabBar per D-01, D-02, D-03, D-04, D-05, EDIT-05
// Built per Plan 02

import { signal, computed } from '@preact/signals';
import type { VNode } from 'preact';
import { colors, fonts } from '../tokens';
import { Dropdown, type DropdownItem } from './dropdown-menu';
import { showConfirmModal } from './confirm-modal';
import { Terminal, Bot, FileDiff } from 'lucide-preact';
import type { TerminalTab } from './terminal-tabs';
import {
  terminalTabs,
  activeTabId,
  createNewTab,
  closeTab,
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
activeTabId.subscribe(id => {
  if (id && activeUnifiedTabId.value !== id) {
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
    closeTab(tabId);
    return;
  }

  if (tab.type === 'editor') {
    if (tab.dirty) {
      showConfirmModal({
        title: 'Unsaved Changes',
        message: `${tab.fileName} has unsaved changes that will be lost.`,
        onConfirm: () => {
          // Discard: remove tab
          setProjectEditorTabs(editorTabs.value.filter(t => t.id !== tabId));
          setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
          switchToAdjacentTab(tabId);
        },
        onCancel: () => {},
        onSave: () => {
          // Get CURRENT content from EditorView (not stale tab.content)
          const currentContent = getEditorCurrentContent(tabId) ?? tab.content;
          writeFile(tab.filePath, currentContent)
            .then(() => {
              setEditorDirty(tabId, false);
              setProjectEditorTabs(editorTabs.value.filter(t => t.id !== tabId));
              setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
              switchToAdjacentTab(tabId);
            })
            .catch(err => {
              console.error('[efxmux] Save failed:', err);
            });
        },
      });
    } else {
      setProjectEditorTabs(editorTabs.value.filter(t => t.id !== tabId));
      setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
      switchToAdjacentTab(tabId);
    }
    return;
  }

  if (tab.type === 'git-changes') {
    gitChangesTab.value = null;
    setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
    switchToAdjacentTab(tabId);
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
    // If it's a terminal tab, also sync activeTabId
    if (nextTab.type === 'terminal') {
      activeTabId.value = nextTab.id;
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
      action: () => createNewTab(),
    },
    {
      label: 'Git Changes',
      icon: FileDiff,
      action: () => openGitChangesTab(),
    },
  ];
}

// ── Drag-and-Drop ───────────────────────────────────────────────────────────────

interface DragState {
  sourceId: string | null;
  overId: string | null;
}

const dragState = { sourceId: null as string | null, overId: null as string | null };

function handleDragStart(e: DragEvent, tabId: string): void {
  if (!e.dataTransfer) return;
  dragState.sourceId = tabId;
  e.dataTransfer.setData('text/plain', tabId);
  e.dataTransfer.effectAllowed = 'move';
  const target = e.target as HTMLElement;
  target.style.opacity = '0.5';
}

function handleDragOver(e: DragEvent, tabId: string): void {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  if (dragState.overId !== tabId) {
    dragState.overId = tabId;
    // Visual indicator: 2px left border in accent color
    const allTabEls = document.querySelectorAll('[data-tab-id]');
    allTabEls.forEach(el => {
      const el_ = el as HTMLElement;
      if (el_.dataset.tabId === tabId) {
        el_.style.borderLeft = `2px solid ${colors.accent}`;
      } else {
        el_.style.borderLeft = '';
      }
    });
  }
}

function handleDragLeave(_e: DragEvent, _tabId: string): void {
  // Could remove border here, but handleDragOver handles most cases
}

function handleDrop(e: DragEvent, targetId: string): void {
  e.preventDefault();
  const sourceId = dragState.sourceId;
  if (!sourceId || sourceId === targetId) {
    clearDragState();
    return;
  }

  // Operate on the full ordered list (all tab types) so terminal tabs can also be reordered
  const ordered = getOrderedTabs();
  const allIds = ordered.map(t => t.id);
  const sourceIdx = allIds.indexOf(sourceId);
  const targetIdx = allIds.indexOf(targetId);

  if (sourceIdx === -1 || targetIdx === -1) {
    clearDragState();
    return;
  }

  // Remove source from order
  allIds.splice(sourceIdx, 1);
  // Insert source before target
  const insertAt = allIds.indexOf(targetId);
  allIds.splice(insertAt, 0, sourceId);

  setProjectTabOrder(allIds);
  clearDragState();
}

function handleDragEnd(): void {
  clearDragState();
}

function clearDragState(): void {
  dragState.sourceId = null;
  dragState.overId = null;
  // Remove all visual indicators
  const allTabEls = document.querySelectorAll('[data-tab-id]');
  allTabEls.forEach(el => {
    const el_ = el as HTMLElement;
    el_.style.borderLeft = '';
    el_.style.opacity = '';
  });
}

// ── Component ───────────────────────────────────────────────────────────────────

export function UnifiedTabBar() {
  const ordered = getOrderedTabs();
  const currentId = activeUnifiedTabId.value;
  const dropdownItems = buildDropdownItems();

  function handleTabClick(tab: UnifiedTab): void {
    activeUnifiedTabId.value = tab.id;
    // If it's a terminal tab, also sync activeTabId so terminal container visibility works
    if (tab.type === 'terminal') {
      activeTabId.value = tab.id;
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
      class="flex gap-1 px-2 py-2 shrink-0 items-center border-b"
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
    <button
      key={tab.id}
      role="tab"
      aria-selected={isActive}
      data-tab-id={tab.id}
      class="flex items-center gap-2 cursor-pointer transition-all duration-150 shrink-0"
      style={{
        backgroundColor: isActive ? colors.bgElevated : 'transparent',
        border: isActive ? `1px solid ${colors.bgSurface}` : '1px solid transparent',
        borderRadius: 6,
        padding: '9px 16px',
        fontFamily: fonts.sans,
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        color: isActive ? colors.textPrimary : colors.textDim,
        maxWidth: 200,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      onClick={() => onClick(tab)}
      title={tabTitle}
      draggable
      onDragStart={e => handleDragStart(e, tab.id)}
      onDragOver={e => handleDragOver(e, tab.id)}
      onDragLeave={e => handleDragLeave(e, tab.id)}
      onDrop={e => handleDrop(e, tab.id)}
      onDragEnd={handleDragEnd}
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
    </button>
  );
}
