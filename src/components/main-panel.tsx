// main-panel.tsx -- Main panel with unified tab system
// Phase 17: Uses UnifiedTabBar, EditorTab, GitChangesTab. File viewer overlay removed.

import { UnifiedTabBar, activeUnifiedTabId, editorTabs, gitChangesTab, allTabs } from './unified-tab-bar';
import { EditorTab } from './editor-tab';
import { GitChangesTab } from './git-changes-tab';
import { ActiveTabCrashOverlay } from './terminal-tabs';
import { AgentHeader } from './agent-header';
import { ServerPane, serverPaneState } from './server-pane';

export function MainPanel() {
  const currentTabId = activeUnifiedTabId.value;
  const currentTab = allTabs.value.find(t => t.id === currentTabId);
  const isTerminalActive = !currentTab || currentTab.type === 'terminal';
  const isGitChangesActive = currentTab?.type === 'git-changes';

  return (
    <main class="main-panel relative" aria-label="Main panel">
      <UnifiedTabBar />

      {/* Terminal area -- visible when a terminal tab is active */}
      <div
        class="terminal-area flex-1 bg-bg-terminal overflow-hidden relative min-h-[100px]"
        style={{ display: isTerminalActive ? 'flex' : 'none', flexDirection: 'column' }}
      >
        <AgentHeader />
        <div class="terminal-containers absolute inset-0" />
        <ActiveTabCrashOverlay />
      </div>

      {/* Editor tabs -- each EditorTab manages its own display:none/flex */}
      {editorTabs.value.map(tab => (
        <EditorTab
          key={tab.id}
          tabId={tab.id}
          filePath={tab.filePath}
          fileName={tab.fileName}
          content={tab.content}
          isActive={tab.id === currentTabId}
        />
      ))}

      {/* Git changes tab */}
      {gitChangesTab.value && (
        <div style={{ display: isGitChangesActive ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <GitChangesTab />
        </div>
      )}

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
