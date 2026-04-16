// right-panel.tsx -- Right panel with tabbed views and Bash Terminal
// D-11: Tab bars for right-top (GSD/File Tree) and right-bottom (Bash)
// D-12: Bash terminal lazy-connects via connectPty on first tab selection
// Phase 10: Navy-blue palette rewrite (Plan 06)

import { useEffect, useRef } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { rightTopTab, rightBottomTab, loadAppState, activeProjectName, projects } from '../state-manager';
import { getTheme, registerTerminal } from '../theme/theme-manager';
import { colors } from '../tokens';
import { TabBar } from './tab-bar';
import { GSDViewer } from './gsd-viewer';
import { FileTree } from './file-tree';

const RIGHT_TOP_TABS = ['File Tree', 'GSD'];
const RIGHT_BOTTOM_TABS = ['Bash'];

/**
 * RightPanel component.
 * Two sub-panels separated by a horizontal split handle.
 * Right-top: GSD Viewer, File Tree (tabbed)
 * Right-bottom: Bash Terminal (tabbed, lazy-connected)
 */
export function RightPanel() {
  const bashContainerRef = useRef<HTMLDivElement>(null);
  const bashConnected = useRef(false);
  const bashSessionRef = useRef('');

  // Guard: if persisted rightTopTab was 'Diff' (now removed), fall back to default
  if (rightTopTab.value === 'Diff') {
    rightTopTab.value = 'File Tree';
  }

  // Guard: if persisted rightBottomTab is not in RIGHT_BOTTOM_TABS, fall back to default
  if (!RIGHT_BOTTOM_TABS.includes(rightBottomTab.value)) {
    rightBottomTab.value = RIGHT_BOTTOM_TABS[0];
  }

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
          sessionName,
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

    // Listen for project switch events (silent via Rust command)
    function handleSwitchBash(e: Event) {
      const { currentSession, targetSession, startDir } = (e as CustomEvent).detail;
      if (!currentSession) return;
      invoke('switch_tmux_session', {
        currentSession,
        targetSession,
        startDir: startDir ?? null,
      }).catch((err) => console.error('[efxmux] Failed to switch bash session:', err));
    }

    document.addEventListener('switch-bash-session', handleSwitchBash);

    // Initial connection
    setTimeout(() => connectBashTerminal(), 200);

    return () => {
      document.removeEventListener('switch-bash-session', handleSwitchBash);
    };
  }, []);

  return (
    <aside class="right-panel" aria-label="Right panel" style={{ backgroundColor: colors.bgBase, borderLeft: `1px solid ${colors.bgBorder}` }}>
      {/* Top panel: GSD / File Tree */}
      <div class="right-top flex flex-col min-h-0">
        <TabBar
          tabs={RIGHT_TOP_TABS}
          activeTab={rightTopTab}
          onSwitch={(tab) => { rightTopTab.value = tab; }}
        />
        <div class="right-top-content flex-1 min-h-0 overflow-hidden relative p-1">
          <div style={{ height: '100%', display: rightTopTab.value === 'GSD' ? 'block' : 'none' }}>
            <GSDViewer />
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
      <div class="right-bottom flex flex-col min-h-0" style={{ borderTop: `1px solid ${colors.bgBorder}` }}>
        <TabBar
          tabs={RIGHT_BOTTOM_TABS}
          activeTab={rightBottomTab}
          onSwitch={(tab) => { rightBottomTab.value = tab; }}
        />
        <div class="right-bottom-content flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: colors.bgDeep }}>
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
