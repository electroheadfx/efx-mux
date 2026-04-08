// right-panel.tsx -- Right panel with tabbed views and Bash Terminal
// D-11: Tab bars for right-top (GSD/Diff/File Tree) and right-bottom (Bash)
// D-12: Bash terminal lazy-connects via connectPty on first tab selection
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { useEffect, useRef } from 'preact/hooks';
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
  const bashTerminalRef = useRef<{ terminal: import('@xterm/xterm').Terminal; fitAddon: import('@xterm/addon-fit').FitAddon } | null>(null);
  const bashDisconnectRef = useRef<(() => void) | null>(null);

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
    async function connectBashTerminal(projectName?: string, projectPath?: string) {
      const container = bashContainerRef.current;
      if (!container) return;

      const { createTerminal } = await import('../terminal/terminal-manager');
      const { connectPty } = await import('../terminal/pty-bridge');
      const { attachResizeHandler } = await import('../terminal/resize-handler');

      // Create terminal only once
      if (!bashTerminalRef.current) {
        const theme = getTheme();
        bashTerminalRef.current = createTerminal(container, {
          theme: theme?.terminal,
          font: theme?.chrome?.font,
          fontSize: theme?.chrome?.fontSize || 13,
        });
        registerTerminal(bashTerminalRef.current.terminal, bashTerminalRef.current.fitAddon);
      }

      const { terminal, fitAddon } = bashTerminalRef.current;
      const activeName = projectName || activeProjectName.value;
      const appState = await loadAppState();
      const sessionName = activeName
        ? activeName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() + '-right'
        : (appState?.session?.['right-tmux-session'] || 'efx-mux-right');

      try {
        const activeProject = projectPath || (activeName ? projects.value.find(p => p.name === activeName)?.path : undefined);
        const conn = await connectPty(terminal, sessionName, activeProject);
        bashDisconnectRef.current = conn.disconnect;
        bashConnected.current = true;

        setTimeout(() => {
          fitAddon.fit();
          attachResizeHandler(container, terminal, fitAddon, sessionName);
        }, 100);
      } catch (err) {
        console.error('[efxmux] Failed to connect bash terminal:', err);
      }
    }

    // Listen for project reconnect events
    async function handleReconnectBash(e: Event) {
      const { projectName, projectPath } = (e as CustomEvent).detail;
      // Disconnect current
      if (bashDisconnectRef.current) bashDisconnectRef.current();
      if (bashTerminalRef.current) {
        bashTerminalRef.current.terminal.clear();
        bashTerminalRef.current.terminal.reset();
      }
      await connectBashTerminal(projectName, projectPath);
    }

    document.addEventListener('reconnect-bash', handleReconnectBash);

    // Initial connection
    setTimeout(() => connectBashTerminal(), 200);

    return () => {
      document.removeEventListener('reconnect-bash', handleReconnectBash);
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
