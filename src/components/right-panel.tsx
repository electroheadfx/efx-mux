// right-panel.tsx -- Right panel with tabbed views and Bash Terminal
// D-11: Tab bars for right-top (GSD/Diff/File Tree) and right-bottom (Bash)
// D-12: Bash terminal lazy-connects via connectPty on first tab selection
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { useEffect, useRef } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { rightTopTab, rightBottomTab, loadAppState, activeProjectName, projects } from '../state-manager';
import { getTheme, registerTerminal } from '../theme/theme-manager';
import { TabBar } from './tab-bar';
import { GSDViewer } from './gsd-viewer';
import { DiffViewer } from './diff-viewer';
import { FileTree } from './file-tree';

const RIGHT_TOP_TABS = ['GSD', 'Diff', 'File Tree'];
const RIGHT_BOTTOM_TABS = ['Bash'];

/**
 * RightPanel component.
 * Two sub-panels separated by a horizontal split handle.
 * Right-top: GSD Viewer, Diff Viewer, File Tree (tabbed)
 * Right-bottom: Bash Terminal (tabbed, lazy-connected)
 */
export function RightPanel() {
  const bashContainerRef = useRef<HTMLDivElement>(null);
  const bashConnected = useRef(false);
  const bashSessionRef = useRef('');

  // Auto-switch to Diff tab when a file is clicked in sidebar GIT CHANGES
  useEffect(() => {
    function handleOpenDiff() {
      rightTopTab.value = 'Diff';
    }
    document.addEventListener('open-diff', handleOpenDiff);
    return () => {
      document.removeEventListener('open-diff', handleOpenDiff);
    };
  }, []);

  // Lazy-connect bash terminal on mount
  useEffect(() => {
    async function connectBashTerminal() {
      const container = bashContainerRef.current;
      if (!container || bashConnected.current) return;

      try {
        const { createTerminal } = await import('../terminal/terminal-manager');
        const { connectPty } = await import('../terminal/pty-bridge');
        const { attachResizeHandler } = await import('../terminal/resize-handler');

        const activeName = activeProjectName.value;
        const appState = await loadAppState();
        const sessionName = activeName
          ? activeName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() + '-right'
          : (appState?.session?.['right-tmux-session'] || 'efx-mux-right');
        bashSessionRef.current = sessionName;

        const theme = getTheme();
        const { terminal, fitAddon } = createTerminal(container, {
          theme: theme?.terminal,
          font: theme?.chrome?.font,
          fontSize: theme?.chrome?.fontSize || 13,
        });
        registerTerminal(terminal, fitAddon);

        const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
        await connectPty(terminal, sessionName, activeProject?.path);
        bashConnected.current = true;

        setTimeout(() => {
          fitAddon.fit();
          attachResizeHandler(container, terminal, fitAddon, sessionName);
        }, 100);
      } catch (err) {
        console.error('[efxmux] Failed to connect bash terminal:', err);
      }
    }

    // Listen for project switch events (tmux switch-client)
    // Always use bashSessionRef.current (the original PTY key) for write_pty
    function handleSwitchBash(e: Event) {
      const { targetSession, startDir } = (e as CustomEvent).detail;
      const ptyKey = bashSessionRef.current; // Original PTY session key — never update
      if (!ptyKey) return;
      const escaped = startDir ? ` -c '${startDir.replace(/'/g, "'\\''")}'` : '';
      const cmd = `tmux has-session -t ${targetSession} 2>/dev/null || tmux new-session -d -s ${targetSession}${escaped}; tmux set-option -t ${targetSession} mouse on 2>/dev/null; tmux switch-client -t ${targetSession}\n`;
      invoke('write_pty', { data: cmd, sessionName: ptyKey }).catch(() => {});
    }

    document.addEventListener('switch-bash-session', handleSwitchBash);

    // Initial connection
    setTimeout(() => connectBashTerminal(), 200);

    return () => {
      document.removeEventListener('switch-bash-session', handleSwitchBash);
    };
  }, []);

  return (
    <aside class="right-panel" aria-label="Right panel">
      {/* Top panel: GSD / Diff / File Tree */}
      <div class="right-top flex flex-col min-h-0">
        <TabBar
          tabs={RIGHT_TOP_TABS}
          activeTab={rightTopTab}
          onSwitch={(tab) => { rightTopTab.value = tab; }}
        />
        <div class="right-top-content flex-1 min-h-0 overflow-hidden relative">
          <div style={{ height: '100%', display: rightTopTab.value === 'GSD' ? 'block' : 'none' }}>
            <GSDViewer />
          </div>
          <div style={{ height: '100%', display: rightTopTab.value === 'Diff' ? 'block' : 'none' }}>
            <DiffViewer />
          </div>
          <div style={{ height: '100%', display: rightTopTab.value === 'File Tree' ? 'block' : 'none' }}>
            <FileTree />
          </div>
        </div>
      </div>

      {/* Split handle */}
      <div
        class="split-handle-h"
        data-handle="right-h"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize right panels"
      />

      {/* Bottom panel: Bash */}
      <div class="right-bottom flex flex-col min-h-0">
        <TabBar
          tabs={RIGHT_BOTTOM_TABS}
          activeTab={rightBottomTab}
          onSwitch={(tab) => { rightBottomTab.value = tab; }}
        />
        <div class="right-bottom-content flex-1 min-h-0 overflow-hidden">
          <div
            ref={bashContainerRef}
            class="bash-terminal h-full"
            id="bash-terminal-container"
          />
        </div>
      </div>
    </aside>
  );
}
