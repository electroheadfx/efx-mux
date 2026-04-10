// main-panel.tsx -- Main panel with terminal-area + file viewer overlay + server-pane
// Phase 2: terminal-area is empty -- xterm.js mounts via querySelector (D-08)
// Phase 6 gap closure: file viewer overlay for read-only file display (PANEL-06)
// Phase 7: Server pane component with 3-state collapse
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { ServerPane, serverPaneState } from './server-pane';
import { TerminalTabBar, ActiveTabCrashOverlay } from './terminal-tabs';
import { AgentHeader } from './agent-header';

// Module-level signals for file viewer state
const fileViewerVisible = signal(false);
const fileName = signal('');
const filePath = signal('');
const fileContent = signal('');

function closeFileViewer(): void {
  fileViewerVisible.value = false;
  fileContent.value = '';
}

/**
 * Escape HTML entities for safe rendering in pre block.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function MainPanel() {
  // Register show-file-viewer and Escape key listeners
  useEffect(() => {
    function handleShowFile(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        fileName.value = detail.name || '';
        filePath.value = detail.path || '';
        fileContent.value = detail.content || '';
        fileViewerVisible.value = true;
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && fileViewerVisible.value) {
        e.preventDefault();
        closeFileViewer();
      }
    }

    document.addEventListener('show-file-viewer', handleShowFile);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('show-file-viewer', handleShowFile);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  return (
    <main class="main-panel relative" aria-label="Main panel">
      <TerminalTabBar />
      <div class="terminal-area flex-1 bg-bg-terminal overflow-hidden relative min-h-[100px]">
        <div class="p-3 pb-0">
          <AgentHeader />
        </div>
        <div class="terminal-containers absolute inset-0" />
        <ActiveTabCrashOverlay />
      </div>

      {fileViewerVisible.value && (
        <div class="absolute inset-0 flex flex-col bg-bg z-10">
          <div class="flex items-center justify-between px-3 py-1.5 bg-bg-raised border-b border-border shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-[10px] px-1.5 py-px rounded-sm bg-accent text-bg font-semibold tracking-wider shrink-0">READ-ONLY</span>
              <span class="text-text-bright text-[13px] font-mono overflow-hidden text-ellipsis whitespace-nowrap">{fileName.value}</span>
            </div>
            <button
              onClick={closeFileViewer}
              class="bg-transparent border border-border text-text cursor-pointer px-2.5 py-1 rounded text-xs font-mono transition-colors duration-150 hover:bg-bg hover:text-text-bright hover:border-accent"
              title="Close file viewer (Esc)"
            >Close</button>
          </div>
          <pre class="flex-1 m-0 px-4 py-3 overflow-auto text-text text-[13px] font-mono leading-relaxed whitespace-pre tab-[4]"
            dangerouslySetInnerHTML={{ __html: escapeHtml(fileContent.value) }}
          />
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
