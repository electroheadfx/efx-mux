// main-panel.tsx -- Main panel with unified tab system
// Phase 17: Uses UnifiedTabBar, EditorTab, GitChangesTab. File viewer overlay removed.
// Phase 17 feature: Pane drag-and-drop reordering via HTML5 DnD.

import { signal } from '@preact/signals';
import { UnifiedTabBar, activeUnifiedTabId, editorTabs, gitChangesTab, allTabs } from './unified-tab-bar';
import { EditorTab } from './editor-tab';
import { GitChangesTab } from './git-changes-tab';
import { ActiveTabCrashOverlay } from './terminal-tabs';
import { AgentHeader } from './agent-header';
import { ServerPane, serverPaneState } from './server-pane';
import { colors } from '../tokens';

// ── Pane Order State (for drag-and-drop reordering) ─────────────────────────
// 'terminal' | 'editor' | 'git-changes'
export const paneOrder = signal<PaneType[]>(['terminal', 'editor', 'git-changes']);
export type PaneType = 'terminal' | 'editor' | 'git-changes';

// ── Drag State ────────────────────────────────────────────────────────────────
interface PaneDragState {
  source: PaneType | null;
  over: PaneType | null;
}

const paneDrag: PaneDragState = { source: null, over: null };

function clearPaneDrag(): void {
  paneDrag.source = null;
  paneDrag.over = null;
  document.querySelectorAll('[data-pane-id]').forEach(el => {
    const e = el as HTMLElement;
    e.style.opacity = '';
    e.style.boxShadow = '';
  });
}

function handlePaneDragStart(e: DragEvent, pane: PaneType): void {
  if (!e.dataTransfer) return;
  paneDrag.source = pane;
  e.dataTransfer.setData('text/plain', pane);
  e.dataTransfer.effectAllowed = 'move';
  const target = e.target as HTMLElement;
  target.style.opacity = '0.6';
}

function handlePaneDragOver(e: DragEvent, pane: PaneType): void {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  if (paneDrag.over !== pane) {
    paneDrag.over = pane;
    document.querySelectorAll('[data-pane-id]').forEach(el => {
      const e_ = el as HTMLElement;
      if (e_.dataset.paneId === pane) {
        e_.style.boxShadow = `0 0 0 2px ${colors.accent}`;
        e_.style.opacity = '1';
      } else {
        e_.style.boxShadow = '';
        e_.style.opacity = '';
      }
    });
  }
}

function handlePaneDrop(e: DragEvent, targetPane: PaneType): void {
  e.preventDefault();
  const sourcePane = paneDrag.source;
  if (!sourcePane || sourcePane === targetPane) {
    clearPaneDrag();
    return;
  }

  const order = [...paneOrder.value];
  const srcIdx = order.indexOf(sourcePane);
  const tgtIdx = order.indexOf(targetPane);

  if (srcIdx === -1 || tgtIdx === -1) {
    clearPaneDrag();
    return;
  }

  // Remove source and insert before target
  order.splice(srcIdx, 1);
  order.splice(tgtIdx, 0, sourcePane);
  paneOrder.value = order;
  clearPaneDrag();
}

function handlePaneDragEnd(): void {
  clearPaneDrag();
}

// ── Component ────────────────────────────────────────────────────────────────

export function MainPanel() {
  const currentTabId = activeUnifiedTabId.value;
  const currentTab = allTabs.value.find(t => t.id === currentTabId);
  const isTerminalActive = !currentTab || currentTab.type === 'terminal';
  const isGitChangesActive = currentTab?.type === 'git-changes';

  const ordered = paneOrder.value;
  const getPaneStyle = (pane: PaneType): preact.CSSProperties => {
    const idx = ordered.indexOf(pane);
    return { order: idx === -1 ? 999 : idx };
  };

  return (
    <main class="main-panel relative" aria-label="Main panel">
      <UnifiedTabBar />

      {/* Pane containers -- always rendered, ordered by paneOrder, inner content controls visibility */}
      {/* Terminal area -- visible when a terminal tab is active */}
      <div
        class="pane-container flex-1 bg-bg-terminal overflow-hidden relative min-h-[100px]"
        data-pane-id="terminal"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          ...getPaneStyle('terminal'),
        }}
        draggable
        onDragStart={e => handlePaneDragStart(e, 'terminal')}
        onDragOver={e => handlePaneDragOver(e, 'terminal')}
        onDrop={e => handlePaneDrop(e, 'terminal')}
        onDragEnd={handlePaneDragEnd}
      >
        <div style={{ display: isTerminalActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <AgentHeader />
          <div class="terminal-containers absolute inset-0" />
          <ActiveTabCrashOverlay />
        </div>
        {!isTerminalActive && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: colors.textMuted, fontFamily: 'Geist', fontSize: 13 }}>
            Terminal inactive — drag to reorder
          </div>
        )}
      </div>

      {/* Editor pane -- shows active editor tab or placeholder */}
      <div
        class="pane-container overflow-hidden"
        data-pane-id="editor"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          ...getPaneStyle('editor'),
        }}
        draggable
        onDragStart={e => handlePaneDragStart(e, 'editor')}
        onDragOver={e => handlePaneDragOver(e, 'editor')}
        onDrop={e => handlePaneDrop(e, 'editor')}
        onDragEnd={handlePaneDragEnd}
      >
        {editorTabs.value.length > 0 ? (
          editorTabs.value.map(tab => (
            <EditorTab
              key={tab.id}
              tabId={tab.id}
              filePath={tab.filePath}
              fileName={tab.fileName}
              content={tab.content}
              isActive={tab.id === currentTabId}
            />
          ))
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: colors.textMuted, fontFamily: 'Geist', fontSize: 13 }}>
            No editor tabs open
          </div>
        )}
      </div>

      {/* Git changes pane -- visible when git-changes tab is active */}
      <div
        class="pane-container overflow-hidden"
        data-pane-id="git-changes"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          ...getPaneStyle('git-changes'),
        }}
        draggable
        onDragStart={e => handlePaneDragStart(e, 'git-changes')}
        onDragOver={e => handlePaneDragOver(e, 'git-changes')}
        onDrop={e => handlePaneDrop(e, 'git-changes')}
        onDragEnd={handlePaneDragEnd}
      >
        {gitChangesTab.value ? (
          <div style={{ display: isGitChangesActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <GitChangesTab />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: colors.textMuted, fontFamily: 'Geist', fontSize: 13 }}>
            No git changes tab open
          </div>
        )}
      </div>

      {serverPaneState.value === 'expanded' && (
        <div
          class="split-handle-h"
          data-handle="main-h"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize server pane"
        />
      )}
      <ServerPane />
    </main>
  );
}
