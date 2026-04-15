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
import { writeFile } from '../services/file-service';

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

// ── Signals ───────────────────────────────────────────────────────────────────

export const editorTabs = signal<EditorTabData[]>([]);
export const gitChangesTab = signal<GitChangesTabData | null>(null);
export const activeUnifiedTabId = signal<string>('');

/** Ordered list of tab IDs for drag-and-drop reordering */
export const tabOrder = signal<string[]>([]);

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
    tabOrder.value = [...tabOrder.value, t.id];
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

  editorTabs.value = [...editorTabs.value, newTab];
  tabOrder.value = [...tabOrder.value, newTab.id];
  activeUnifiedTabId.value = newTab.id;
}

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
  tabOrder.value = [...tabOrder.value, newTab.id];
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
          editorTabs.value = editorTabs.value.filter(t => t.id !== tabId);
          tabOrder.value = tabOrder.value.filter(id => id !== tabId);
          switchToAdjacentTab(tabId);
        },
        onCancel: () => {},
        onSave: () => {
          // Save then close
          writeFile(tab.filePath, tab.content)
            .then(() => {
              setEditorDirty(tabId, false);
              editorTabs.value = editorTabs.value.filter(t => t.id !== tabId);
              tabOrder.value = tabOrder.value.filter(id => id !== tabId);
              switchToAdjacentTab(tabId);
            })
            .catch(err => {
              console.error('[efxmux] Save failed:', err);
            });
        },
      });
    } else {
      editorTabs.value = editorTabs.value.filter(t => t.id !== tabId);
      tabOrder.value = tabOrder.value.filter(id => id !== tabId);
      switchToAdjacentTab(tabId);
    }
    return;
  }

  if (tab.type === 'git-changes') {
    gitChangesTab.value = null;
    tabOrder.value = tabOrder.value.filter(id => id !== tabId);
    switchToAdjacentTab(tabId);
  }
}

/**
 * Mark an editor tab as dirty/clean.
 */
export function setEditorDirty(tabId: string, dirty: boolean): void {
  const tab = editorTabs.value.find(t => t.id === tabId);
  if (!tab) return;
  tab.dirty = dirty;
  // Trigger reactivity
  editorTabs.value = [...editorTabs.value];
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
  if (tabOrder.value.length === 0) return all;
  const ordered = tabOrder.value
    .map(id => all.find(t => t.id === id))
    .filter((t): t is UnifiedTab => t !== undefined);
  // Fallback for any tabs not in tabOrder
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

  const order = [...tabOrder.value];
  const sourceIdx = order.indexOf(sourceId);
  const targetIdx = order.indexOf(targetId);

  if (sourceIdx === -1 || targetIdx === -1) {
    clearDragState();
    return;
  }

  // Remove source from order
  order.splice(sourceIdx, 1);
  // Insert source before target
  const insertAt = order.indexOf(targetId);
  order.splice(insertAt, 0, sourceId);

  tabOrder.value = order;
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
