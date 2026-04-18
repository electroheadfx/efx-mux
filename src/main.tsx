// main.tsx -- Preact entry point for Efxmux
// Execution order matters:
//   1. Load persisted state from Rust backend (prevents layout flash)
//   2. Create sidebar collapsed signal effect
//   3. Mount Preact app
//   4. Wire drag handles, project system, keyboard handlers
//   5. Init theme + terminal (after DOM is ready)

import { render } from 'preact';
import { effect } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './styles/app.css';

import { Sidebar } from './components/sidebar';
import { MainPanel, restoreActiveSubScopes } from './components/main-panel';
import { RightPanel } from './components/right-panel';
import { ProjectModal } from './components/project-modal';
import { FuzzySearch } from './components/fuzzy-search';
import { ShortcutCheatsheet, toggleCheatsheet } from './components/shortcut-cheatsheet';
import { FirstRunWizard, openWizard } from './components/first-run-wizard';
import { PreferencesPanel, togglePreferences } from './components/preferences-panel';
import { ToastContainer, showToast } from './components/toast';
import { ConfirmModal, showConfirmModal } from './components/confirm-modal';
import { initDragManager } from './drag-manager';
import { initTheme, registerTerminal, toggleThemeMode } from './theme/theme-manager';
import { createNewTab, cycleToNextTab, initFirstTab, clearAllTabs, restoreTabs, saveProjectTabs, hasProjectTabs, restoreProjectTabs, getTerminalScope } from './components/terminal-tabs';
import { getActiveSubScopesForZone, shouldSeedFirstLaunch, markFirstLaunchSeeded } from './components/sub-scope-pane';
import {
  loadAppState, saveAppState, getCurrentState, initBeforeUnload, sidebarCollapsed, updateLayout, updateSession,
  getProjects, getActiveProject, projects, activeProjectName
} from './state-manager';
import { openProjectModal } from './components/project-modal';
import { openEditorTab, openEditorTabPinned, restoreEditorTabs, activeUnifiedTabId, closeUnifiedTab, suppressEditorPersist, persistEditorTabs, gitChangesTab, restoreGitChangesTab, createAndFocusMainTerminalTab, openFileTreeTabInScope, openOrMoveSingletonToScope, restoreFileTreeTabs, restoreGsdTab, fileTreeTabs, gsdTab } from './components/unified-tab-bar';
import { triggerEditorSave } from './editor/setup';
import { serverPaneState, saveCurrentProjectState, restoreProjectState } from './components/server-pane';
import { fileTreeFontSize, fileTreeLineHeight, fileTreeBgColor, defaultExternalEditor } from './components/file-tree';
import { detectAgent } from './server/server-bridge';
import { projectSessionName } from './utils/session-name';
import { Settings } from 'lucide-preact';

// Module-level state for terminal session tracking
// *PtyKey = original PTY spawn session (for write_pty)
// *CurrentSession = which tmux session the client currently shows (for switch-client)
// Phase 20 D-21: rightCurrentSession was removed — the right panel no longer has
// a singleton bash session; each right-scope tab owns its own tmux session.
let mainPtyKey = '';
let mainCurrentSession = '';

// Phase 18 Plan 07 (UAT Test 16 fix): Tauri 2.10.x onDragDropEvent payload.position.y
// is reported in WINDOW coordinates (origin = top of macOS native title bar) when
// titleBarStyle is "Overlay". getBoundingClientRect() uses VIEWPORT coordinates
// (origin = top of webview content). The y-axis difference is the macOS title-bar
// height — stable at 28 CSS px on Sonoma/Sequoia. Subtract this offset before
// dispatching tree-finder-* CustomEvents so the file-tree's hit-test math aligns.
// Upstream bug: Tauri GitHub Issue #10744 (still open as of late 2025).
const MACOS_TITLE_BAR_OFFSET = 28;

// Plan 18-12 (Gap G-02 fix): Tauri 2 `over` events fire continuously during a
// drag but their payload has NO paths — only position. The inside-project filter
// therefore can't run on `over` events. We cache the decision at `enter` time and
// apply it to subsequent `over` events, enabling per-row drop-target highlight
// updates as the cursor moves.
//
// Set to true on enter when at least one path is outside the active project;
// reset on leave, drop, or an enter that resolves to an intra-project drag.
let isFinderDragActive = false;

function App() {
  return (
    <div id="app-root" class="flex flex-col w-screen h-screen overflow-hidden bg-bg text-text-bright font-mono text-sm font-light antialiased">
      {/* Custom title bar region (overlay mode — sits over native title bar) */}
      <div
        data-tauri-drag-region
        class="titlebar-drag-region"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          height: 28,
          minHeight: 28,
          paddingLeft: 78,
          paddingRight: 12,
          gap: 8,
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('.titlebar-add-btn, .titlebar-prefs-btn')) return;
          e.preventDefault();
          getCurrentWindow().startDragging();
        }}
      >
        <button
          class="titlebar-add-btn"
          title="Add Project"
          aria-label="Add project"
          onClick={() => { openProjectModal(); }}
        >
          +
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button
            class="titlebar-prefs-btn"
            title="Preferences (Cmd+,)"
            aria-label="Open Preferences"
            onClick={() => { togglePreferences(); }}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
      <div class="flex flex-1 overflow-hidden">
        <Sidebar />
        <div class="split-handle-v" data-handle="sidebar-main" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" />
        <MainPanel />
        <div class="split-handle-v" data-handle="main-right" role="separator" aria-orientation="vertical" aria-label="Resize main panel" />
        <RightPanel />
      </div>
      <ProjectModal />
      <FuzzySearch />
      <ShortcutCheatsheet />
      <FirstRunWizard />
      <PreferencesPanel />
      <ToastContainer />
      <ConfirmModal />
    </div>
  );
}

async function bootstrap() {
  // Step 1: Load persisted state (prevents layout flash)
  let appState = null;
  try {
    appState = await loadAppState();
  } catch (err) {
    console.warn('[efxmux] State load failed, using defaults:', err);
  }

  // Apply loaded layout to CSS custom properties immediately
  if (appState?.layout) {
    const { layout } = appState;
    if (layout['sidebar-w']) document.documentElement.style.setProperty('--sidebar-w', String(layout['sidebar-w']));
    if (layout['right-w']) document.documentElement.style.setProperty('--right-w', String(layout['right-w']));
    // Restore file tree preferences (always present as typed fields in Rust LayoutState)
    fileTreeFontSize.value = parseInt(String(layout['file-tree-font-size'])) || 13;
    fileTreeLineHeight.value = parseInt(String(layout['file-tree-line-height'])) || 2;
    fileTreeBgColor.value = String(layout['file-tree-bg-color'] ?? '');
    defaultExternalEditor.value = String(layout['default-external-editor'] ?? '');
  }

  // Phase 22 Plan 04 D-02 / gap-closure 22-07: restore persisted active sub-scope
  // lists and split ratios for the active project (per-project keys). When no
  // project is active yet, pass null so signals reset to defaults.
  restoreActiveSubScopes(activeProjectName.value);

  // Wire beforeunload
  initBeforeUnload();

  // Quit confirmation: intercept window X button (quick-260416-gma)
  getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    showConfirmModal({
      title: 'Quit Efxmux?',
      message: 'Are you sure you want to quit? Active terminal sessions will be preserved by tmux.',
      confirmLabel: 'Quit',
      onConfirm: async () => {
        const state = getCurrentState();
        if (state) await saveAppState(state);
        invoke('force_quit');
      },
      onCancel: () => {},
    });
  });

  // Quit confirmation: intercept Cmd+Q / Menu > Quit (quick-260416-gma)
  listen('quit-requested', () => {
    showConfirmModal({
      title: 'Quit Efxmux?',
      message: 'Are you sure you want to quit? Active terminal sessions will be preserved by tmux.',
      confirmLabel: 'Quit',
      onConfirm: async () => {
        const state = getCurrentState();
        if (state) await saveAppState(state);
        invoke('force_quit');
      },
      onCancel: () => {},
    });
  });

  // File > Add Project (Cmd+N) menu action (quick-260416-hce)
  listen('add-project-requested', () => {
    openProjectModal();
  });

  // Efxmux > Preferences (Cmd+,) menu action (quick-260416-hk9)
  listen('preferences-requested', () => {
    togglePreferences();
  });

  // Step 2: Sidebar collapsed signal effect (replaces Arrow.js watch())
  effect(() => {
    const collapsed = sidebarCollapsed.value;
    const w = collapsed ? '40px' : '200px';
    document.documentElement.style.setProperty('--sidebar-w', w);
    updateLayout({ 'sidebar-w': w, 'sidebar-collapsed': collapsed });
  });

  // Step 3: Mount Preact app
  render(<App />, document.getElementById('app')!);

  // Step 4: Wire drag handles (must be after render so [data-handle] elements exist)
  requestAnimationFrame(() => initDragManager());

  // Step 5: Init project system
  // Suppress editor tab persist until restore completes — prevents empty-array overwrite race
  // (activeProjectName change triggers computed → subscribe → persist empty before restore runs)
  suppressEditorPersist(true);
  initProjects();

  // Step 6: Consolidated keyboard handler (D-01, D-02, UX-01)
  // Single capture-phase listener fires before xterm.js
  // Terminal passthrough set (D-02): c, d, z, l, r always reach terminal
  const TERMINAL_PASSTHROUGH = new Set(['c', 'd', 'z', 'l', 'r']);

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Allow both Ctrl+key and Cmd+key through (Cmd+W closes tab on macOS)
    if (!e.ctrlKey && !e.metaKey) return;

    const key = e.key.toLowerCase();

    // Terminal passthrough: never intercept Ctrl+C/D/Z/L/R (D-02)
    // Only applies to Ctrl -- Cmd variants are not terminal signals
    if (e.ctrlKey && TERMINAL_PASSTHROUGH.has(key) && !e.shiftKey && !e.altKey) return;

    // App shortcuts
    switch (true) {
      case key === 'b' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        sidebarCollapsed.value = !sidebarCollapsed.value;
        break;
      case key === 's' && e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault();
        if (activeUnifiedTabId.value.startsWith('editor-')) {
          triggerEditorSave(activeUnifiedTabId.value);
        }
        break;
      case key === 's' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        serverPaneState.value = serverPaneState.value === 'strip' ? 'expanded' : 'strip';
        updateLayout({ 'server-pane-state': serverPaneState.value });
        if (serverPaneState.value === 'expanded') {
          requestAnimationFrame(() => initDragManager());
        }
        break;
      case key === 't' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        // quick-260418-bpm: use shared helper so the new tab is focused even
        // when the main panel currently shows a non-terminal tab.
        void createAndFocusMainTerminalTab();
        break;
      case key === 'w' && !e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey):
        e.preventDefault(); e.stopPropagation();
        if (activeUnifiedTabId.value) {
          closeUnifiedTab(activeUnifiedTabId.value);
        }
        break;
      case e.key === 'Tab' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        cycleToNextTab();
        break;
      case key === 'p' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        document.dispatchEvent(new CustomEvent('open-fuzzy-search'));
        break;
      case (key === '/' && e.ctrlKey && e.shiftKey) || (e.key === '?' && e.ctrlKey && !e.altKey):
        // Ctrl+? = Ctrl+Shift+/ on US layout, also handle e.key === '?' for AZERTY (D-03)
        e.preventDefault(); e.stopPropagation();
        toggleCheatsheet();
        break;
      case key === '/' && e.ctrlKey && !e.shiftKey && !e.altKey:
        // Ctrl+/ as AZERTY fallback for cheatsheet (UI-SPEC)
        e.preventDefault(); e.stopPropagation();
        toggleCheatsheet();
        break;
      case key === 't' && e.ctrlKey && e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        toggleThemeMode();
        break;
      case key === ',' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        togglePreferences();
        break;
    }
  }, { capture: true });

  // Step 6b (Phase 18 D-18): OS-level drag-drop from Finder.
  // Rust `dragDropEnabled: true` in tauri.conf.json (Plan 18-02) unblocks these events.
  // We ignore drops that come entirely from INSIDE the active project — those are intra-tree drags
  // handled by the mouse-event pipeline in file-tree.tsx.
  (async () => {
    try {
      await getCurrentWebviewWindow().onDragDropEvent((event) => {
        const payload = event.payload as
          | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
          | { type: 'over'; position: { x: number; y: number } }      // Plan 18-12: `over` has NO paths
          | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
          | { type: 'leave' };

        // Handle leave immediately — no position, no paths, just reset state.
        if (payload.type === 'leave') {
          isFinderDragActive = false;
          document.dispatchEvent(new CustomEvent('tree-finder-dragleave'));
          return;
        }

        // For enter, compute the inside-project decision and cache it.
        if (payload.type === 'enter') {
          const projectName = activeProjectName.value;
          const project = projectName ? projects.value.find(p => p.name === projectName) : undefined;
          const projectPath = project?.path ?? '';
          const paths = payload.paths ?? [];
          const anyOutside = paths.length > 0
            && paths.some(p => !projectPath || !p.startsWith(projectPath));
          isFinderDragActive = anyOutside;
          if (!anyOutside) return;  // intra-tree drag — mouse pipeline owns it
        }

        // For over + drop: respect the cached decision from enter.
        // (over has NO paths; drop has paths.)
        if ((payload.type === 'over' || payload.type === 'drop') && !isFinderDragActive) {
          return;
        }

        // Convert physical-pixel position to CSS pixels, then subtract the
        // macOS overlay title-bar offset so y aligns with viewport-relative
        // getBoundingClientRect() coordinates used by file-tree hit-tests.
        // (UAT Test 16 fix — Tauri Issue #10744; preserved from Plan 18-07.)
        const dpr = window.devicePixelRatio || 1;
        const position = {
          x: payload.position.x / dpr,
          y: payload.position.y / dpr - MACOS_TITLE_BAR_OFFSET,
        };

        if (payload.type === 'enter' || payload.type === 'over') {
          // over has no paths; enter does, but file-tree's dragover handler only
          // uses position — paths are irrelevant for the hover highlight.
          const paths = 'paths' in payload ? payload.paths : [];
          document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
            detail: { paths, position },
          }));
        } else if (payload.type === 'drop') {
          document.dispatchEvent(new CustomEvent('tree-finder-drop', {
            detail: { paths: payload.paths, position },
          }));
          isFinderDragActive = false;  // reset after drop closes the drag
        }
      });
    } catch (err) {
      console.warn('[efxmux] onDragDropEvent subscribe failed:', err);
    }
  })();

  // Restore server pane state from persisted state (map legacy 'collapsed' to 'strip')
  if (appState?.layout?.['server-pane-state']) {
    const saved = appState.layout['server-pane-state'] as string;
    if (saved === 'expanded') {
      serverPaneState.value = 'expanded';
    } else {
      serverPaneState.value = 'strip';
    }
  }
  if (appState?.layout?.['server-pane-height']) {
    document.documentElement.style.setProperty('--server-pane-h', String(appState.layout['server-pane-height']));
  }

  // Step 7: file-opened handler -- opens editor tab as preview (EDIT-01)
  document.addEventListener('file-opened', async (e: Event) => {
    const { path, name } = (e as CustomEvent).detail;
    try {
      const content = await invoke<string>('read_file_content', { path });
      openEditorTab(path, name, content);
    } catch (err) {
      console.error('[efxmux] Failed to read file:', err);
      showToast({ type: 'error', message: `Could not open file: ${name}` });
    }
  });

  // Step 7b: file-opened-pinned handler -- opens editor tab as pinned (double-click)
  document.addEventListener('file-opened-pinned', async (e: Event) => {
    const { path, name } = (e as CustomEvent).detail;
    try {
      const content = await invoke<string>('read_file_content', { path });
      openEditorTabPinned(path, name, content);
    } catch (err) {
      console.error('[efxmux] Failed to read file:', err);
      showToast({ type: 'error', message: `Could not open file: ${name}` });
    }
  });

  // Step 8: Init theme + terminal (after DOM is ready)
  requestAnimationFrame(async () => {
    let loadedTheme = null;
    try {
      loadedTheme = await initTheme();
    } catch (err) {
      console.warn('[efxmux] Theme init failed, using defaults:', err);
    }

    // Use project-specific tmux session name (or fallback)
    const activeName = activeProjectName.value;
    const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
    const sessionName = activeName
      ? projectSessionName(activeName)
      : (appState?.session?.['main-tmux-session'] ?? 'efx-mux');
    mainPtyKey = sessionName; // Store PTY key (never changes)
    mainCurrentSession = sessionName;

    // Clean up dead tmux sessions from previous runs (Plan 05)
    try { await invoke('cleanup_dead_sessions'); } catch {}

    // Phase 20 D-19: kill any legacy <project>-right tmux sessions from the
    // prior right-panel layout. Best-effort; migration failure must not block
    // bootstrap, so the invocation is wrapped in try/catch.
    try {
      const projectNames = projects.value.map(p => p.name);
      if (projectNames.length > 0) {
        const killed = await invoke<string[]>('kill_legacy_right_sessions', { projectNames });
        if (killed.length > 0) {
          console.log('[efxmux] killed legacy right sessions:', killed);
        }
      }
    } catch {
      // Best-effort: migration failure must not block bootstrap.
    }

    // Agent detection (D-10, D-11, AGENT-03/04/05)
    let agentBinary: string | null = null;
    if (activeProject?.agent && activeProject.agent !== 'bash') {
      try {
        agentBinary = await detectAgent(activeProject.agent);
      } catch {
        // Agent binary not found -- will show banner (D-13, AGENT-05)
        agentBinary = null;
      }
    }

    // Try to restore tabs from persisted state (per-project key first, then legacy flat key)
    let tabsRestored = false;
    const perProjectTabKey = activeName ? `terminal-tabs:${activeName}` : null;
    const tabDataRaw = (perProjectTabKey && appState?.session?.[perProjectTabKey])
      || appState?.session?.['terminal-tabs']
      || null;
    if (tabDataRaw) {
      try {
        const parsedData = JSON.parse(tabDataRaw);
        if (parsedData?.tabs?.length > 0) {
          tabsRestored = await restoreTabs(parsedData, activeProject?.path, agentBinary ?? undefined);
        }
      } catch (err) {
        console.warn('[efxmux] Failed to restore tabs, will create fresh:', err);
      }
    }

    // Fall through to fresh first tab if restore failed or no saved data
    if (!tabsRestored) {
      const themeOptions = {
        theme: loadedTheme?.terminal,
        font: loadedTheme?.chrome?.font,
        fontSize: loadedTheme?.chrome?.fontSize,
      };
      const firstTab = await initFirstTab(themeOptions, sessionName, activeProject?.path, agentBinary ?? undefined);

      if (firstTab) {
        const { terminal, fitAddon } = firstTab;
        registerTerminal(terminal, fitAddon);
        updateSession({ 'main-tmux-session': sessionName });

        // Agent fallback banner (D-13, AGENT-05, per UI-SPEC copywriting)
        if (activeProject?.agent && activeProject.agent !== 'bash' && !agentBinary) {
          terminal.writeln('');
          terminal.writeln('\x1b[33mNo agent binary found. Install claude or opencode to enable AI assistance.\x1b[0m');
          terminal.writeln('\x1b[33mStarting plain bash session...\x1b[0m');
        }

        setTimeout(() => fitAddon.fit(), 100);
        terminal.focus();
      }
    }

    // Phase 20 D-18: restore right-scope tabs for the active project. The main
    // restore above has already populated main-scope tabs; here we add the right-
    // scope siblings from the per-project `right-terminal-tabs:<project>` key.
    // main.tsx serializes both restores (await chain) so the race that Pitfall 4
    // guards against (concurrent persist during restore) cannot happen here.
    if (activeName) {
      // Fix #3 (20-05-E): restore Git Changes tab (incl. owningScope=right) so
      // a user who had Git Changes pinned in the right panel still has it on
      // the next launch. Must run BEFORE right-scope tab restoration so the
      // RightPanel renders the gc body correctly when its activeTabId matches
      // the restored Git Changes id.
      restoreGitChangesTab(activeName);
      try {
        for (const scope of getActiveSubScopesForZone('right')) {
          await getTerminalScope(scope).restoreProjectTabs(activeName, activeProject?.path, agentBinary ?? undefined);
        }
      } catch (err) {
        console.warn('[efxmux] Failed to restore right-scope tabs:', err);
      }
      // Phase 22 D-03/D-06: sticky-tab fallback removed. Empty scope is allowed;
      // state-manager (22-01) drops legacy 'file-tree'/'gsd' activeTabId on load.
      // Right-scope D-02 first-launch defaults are seeded by sub-scope-pane.tsx
      // (covered by gap-closure plan 22-07). No fallback needed here.

      // Phase 22 Plan 04 D-02 / gap-closure 22-07: first-launch-only seed.
      // Gate on `first-launch:<project>` flag so deleting a tab and quitting
      // does NOT cause the seed to recreate the default tabs on next launch.
      if (shouldSeedFirstLaunch(activeName)) {
        const rightFileTreeExists = fileTreeTabs.value.some(t => t.ownerScope === 'right-0');
        if (!rightFileTreeExists && !gsdTab.value) {
          openFileTreeTabInScope('right-0');
          openOrMoveSingletonToScope('gsd', 'right-0');
        }
        await markFirstLaunchSeeded(activeName);
      }
    }

    // Restore editor tabs from persisted state
    if (activeName) {
      await restoreEditorTabs(activeName);
    }
    suppressEditorPersist(false);
    // quick-260417-f6e: flush restored focus back to state.json (subscribe fires
    // only on changes, and the restore loop's last activeUnifiedTabId assignment
    // happened while persist was suppressed).
    persistEditorTabs();

    // Phase 20 D-01: the prior right-h-pct layout-apply block (sized the legacy
    // .right-top / .right-bottom sub-panels) is removed — the right panel is
    // now a single-pane shell with no horizontal split.
  });
}

async function initProjects() {
  try {
    const projectList = await getProjects();
    projects.value = projectList;
    if (projectList.length === 0) {
      openWizard();
      return;
    }
    const activeName = await getActiveProject();
    if (activeName) {
      activeProjectName.value = activeName;
      const project = projectList.find(p => p.name === activeName);
      if (project?.path) {
        invoke('set_project_path', { path: project.path });
      }
    }
  } catch (err) {
    console.warn('[efxmux] Failed to load projects:', err);
  }
}

// Save server pane state and terminal tabs BEFORE activeProjectName changes (fixes per-project isolation)
document.addEventListener('project-pre-switch', (e: Event) => {
  const { oldName } = (e as CustomEvent).detail;
  if (oldName) {
    saveCurrentProjectState(oldName);
    saveProjectTabs(oldName);                              // main scope
    // Phase 22 D-10: persist right-scope tabs for every active right sub-scope.
    for (const scope of getActiveSubScopesForZone('right')) {
      getTerminalScope(scope).saveProjectTabs(oldName);
    }
  }
});

// project-changed listener: switch tmux sessions + update file watcher + agent detection
// 07-06: Servers keep running across project switches; only UI state swaps via cache
// 08-02: Clear all tabs and create new first tab for new project
document.addEventListener('project-changed', async (e: Event) => {
  const newProjectName = (e as CustomEvent).detail.name;
  try {
    const projectList = await getProjects();
    const project = projectList.find(p => p.name === newProjectName);
    if (project?.path) {
      await invoke('set_project_path', { path: project.path });

      // Clear all main panel tabs (PTY clients disconnect but tmux sessions stay alive)
      await clearAllTabs();

      const newMainSession = projectSessionName(newProjectName);
      mainPtyKey = newMainSession;
      mainCurrentSession = newMainSession;

      // Detect agent for the new project (AGENT-03, AGENT-04)
      let agentBinary: string | null = null;
      if (project.agent && project.agent !== 'bash') {
        try {
          agentBinary = await detectAgent(project.agent);
        } catch {
          agentBinary = null;
        }
      }

      // Try restoring cached tabs from a previous visit to this project.
      // spawn_terminal in pty.rs clears tmux history before re-attach to prevent
      // stale screen content from appearing as extra newlines.
      const restored = await restoreProjectTabs(newProjectName, project.path, agentBinary ?? undefined);

      if (!restored) {
        // First visit to this project (no cached tabs) -- create fresh first tab
        const themeOptions = {
          theme: undefined, // Will use current theme from getTheme() inside initFirstTab
        };
        await initFirstTab(themeOptions, newMainSession, project.path, agentBinary ?? undefined);
      }

      // Fix #3 (20-05-E): clear gitChangesTab (prior project may have owned it)
      // then restore from new project's persisted state. Cast through `any`
      // to prevent TS from narrowing subsequent `gitChangesTab.value` reads
      // below — `restoreGitChangesTab` may reassign the signal but control-flow
      // analysis cannot see across the function boundary.
      (gitChangesTab as any).value = null;
      restoreGitChangesTab(newProjectName);

      // Phase 22 D-10: restore right-scope tabs for every active right sub-scope.
      // Serialized after main-scope restore to avoid concurrent persist writes
      // racing on the same state.json blob.
      try {
        for (const scope of getActiveSubScopesForZone('right')) {
          await getTerminalScope(scope).restoreProjectTabs(newProjectName, project.path, agentBinary ?? undefined);
        }
      } catch (err) {
        console.warn('[efxmux] Failed to restore right-scope tabs:', err);
      }
      // Phase 22 D-03/D-06: sticky-tab fallback removed. Empty scope is allowed;
      // state-manager (22-01) drops legacy 'file-tree'/'gsd' activeTabId on load.

      // Phase 22 gap-closure 22-07: restore per-project split state
      // (active-sub-scope lists + split ratios) for the newly-active project.
      // This runs BEFORE the first-launch seed so the seed observes the correct
      // per-project scope list when checking for existing tabs.
      restoreActiveSubScopes(newProjectName);

      // Phase 22 gap-closure 22-07: first-launch seed runs exactly once per
      // project. The `first-launch:<project>` flag lives in state.session and
      // gates re-seeding — without this, deleting a tab and switching away /
      // back causes the seed to recreate it.
      if (shouldSeedFirstLaunch(newProjectName)) {
        const rightFileTreeExists = fileTreeTabs.value.some(t => t.ownerScope === 'right-0');
        if (!rightFileTreeExists && !gsdTab.value) {
          openFileTreeTabInScope('right-0');
          openOrMoveSingletonToScope('gsd', 'right-0');
        }
        await markFirstLaunchSeeded(newProjectName);
      }

      // Restore editor tabs for the new project.
      // quick-260417-f6e: suppress persist during the restore loop — each
      // open*EditorTab() mutation would otherwise overwrite activeFilePath in
      // state.json with whatever tab was opened LAST, clobbering the saved focus.
      suppressEditorPersist(true);
      await restoreEditorTabs(newProjectName);
      suppressEditorPersist(false);
      // Force one persist now that activeUnifiedTabId has been set to the saved focus
      persistEditorTabs();

      // Phase 20 D-21: the legacy `switch-bash-session` dispatch is removed.
      // Right-scope terminals are now plain PTY tabs owned by each active
      // right-N sub-scope (Phase 22 D-10); their session names already include
      // the project prefix via persistenceKey derivation, so no cross-project
      // session switch is needed.

      // 07-06: Restore new project's server state (or defaults if never started)
      // Servers keep running in background -- only UI state switches
      restoreProjectState(newProjectName);
    }
  } catch (err) {
    console.warn('[efxmux] Failed to switch project:', err);
  }
});

bootstrap();
