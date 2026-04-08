// right-panel.js -- Right panel with tabbed views and Bash Terminal (Phase 6)
// D-11: Tab bars for right-top (GSD/Diff/File Tree) and right-bottom (Bash)
// D-12: Bash terminal lazy-connects via connectPty on first tab selection
// PANEL-01: Tab bar switching between views
// PANEL-07: Bash terminal in right-bottom panel

import { html, reactive } from '@arrow-js/core';
import { TabBar } from './tab-bar.js';
import { GSDViewer } from './gsd-viewer.js';
import { DiffViewer } from './diff-viewer.js';
import { FileTree } from './file-tree.js';
import { connectPty } from '../terminal/pty-bridge.js';
import { attachResizeHandler } from '../terminal/resize-handler.js';
import { getActiveProject, getProjects, loadAppState } from '../state-manager.js';

const RIGHT_TOP_TABS = ['GSD', 'Diff', 'File Tree'];
const RIGHT_BOTTOM_TABS = ['Bash'];

/**
 * RightPanel component.
 * Two sub-panels separated by a horizontal split handle.
 * Right-top: GSD Viewer, Diff Viewer, File Tree (tabbed)
 * Right-bottom: Bash Terminal (tabbed, lazy-connected)
 */
export const RightPanel = () => {
  const state = reactive({
    rightTopTab: 'GSD',
    rightBottomTab: 'Bash',
    /** @type {object|null} */
    activeProject: null,
  });

  let bashTerminalConnected = false;
  let bashContainerEl = null;

  // Load active project data for GSD Viewer and File Tree
  async function loadActiveProject() {
    try {
      const [projects, activeName] = await Promise.all([
        getProjects(),
        getActiveProject()
      ]);
      if (activeName) {
        state.activeProject = projects.find(p => p.name === activeName) || null;
      }
    } catch (err) {
      console.warn('[efxmux] Failed to load active project:', err);
    }
  }
  loadActiveProject();

  // Listen for project changes
  document.addEventListener('project-changed', () => {
    loadActiveProject();
  });

  // Lazy-connect bash terminal when Bash tab is first selected
  async function connectBashTerminal() {
    if (bashTerminalConnected || !bashContainerEl) return;

    try {
      const { createTerminal } = await import('../terminal/terminal-manager.js');

      // Get right-tmux-session name from persisted state
      const appState = await loadAppState();
      const sessionName = appState?.session?.['right-tmux-session'] || 'efx-mux-right';

      const { terminal, fitAddon } = createTerminal(bashContainerEl, {
        fontSize: 13,
      });

      await connectPty(terminal, sessionName);
      bashTerminalConnected = true;

      // Fit after a short delay to ensure container has dimensions
      setTimeout(() => {
        fitAddon.fit();
        // Attach resize observer for responsive resize (same mechanism as main terminal)
        attachResizeHandler(bashContainerEl, terminal, fitAddon, sessionName);
      }, 100);
    } catch (err) {
      console.error('[efxmux] Failed to connect bash terminal:', err);
      if (bashContainerEl) {
        bashContainerEl.innerHTML = `<div style="padding: 16px; color: #dc322f; font-size: 13px;">Failed to connect terminal: ${err}</div>`;
      }
    }
  }

  // Schedule bash terminal discovery after Arrow.js renders the DOM
  setTimeout(() => {
    bashContainerEl = document.getElementById('bash-terminal-container');
    if (bashContainerEl && !bashTerminalConnected) {
      setTimeout(() => connectBashTerminal(), 200);
    }
  }, 0);

  // Build view components once (they manage their own state internally)
  const gsdViewer = GSDViewer(() => state.activeProject);
  const diffViewer = DiffViewer();
  const fileTree = FileTree(() => state.activeProject);

  return html`
    <aside class="right-panel" aria-label="Right panel">
      <div class="right-top" style="display: flex; flex-direction: column; min-height: 0;">
        ${TabBar(RIGHT_TOP_TABS, () => state.rightTopTab, (tab) => { state.rightTopTab = tab; })}
        <div class="right-top-content" style="flex: 1; min-height: 0; overflow: hidden; position: relative;">
          <div style="${() => `height: 100%; display: ${state.rightTopTab === 'GSD' ? 'block' : 'none'};`}">
            ${gsdViewer}
          </div>
          <div style="${() => `height: 100%; display: ${state.rightTopTab === 'Diff' ? 'block' : 'none'};`}">
            ${diffViewer}
          </div>
          <div style="${() => `height: 100%; display: ${state.rightTopTab === 'File Tree' ? 'block' : 'none'};`}">
            ${fileTree}
          </div>
        </div>
      </div>

      <div
        class="split-handle-h"
        data-handle="right-h"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize right panels"
      ></div>

      <div class="right-bottom" style="display: flex; flex-direction: column; min-height: 0;">
        ${TabBar(RIGHT_BOTTOM_TABS, () => state.rightBottomTab, (tab) => { state.rightBottomTab = tab; })}
        <div class="right-bottom-content" style="flex: 1; min-height: 0; overflow: hidden;">
          <div id="bash-terminal-container" class="bash-terminal" style="height: 100%;"></div>
        </div>
      </div>
    </aside>
  `;
};
