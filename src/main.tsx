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
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles/app.css';

import { Sidebar } from './components/sidebar';
import { MainPanel } from './components/main-panel';
import { RightPanel } from './components/right-panel';
import { ProjectModal } from './components/project-modal';
import { FuzzySearch } from './components/fuzzy-search';
import { ShortcutCheatsheet, toggleCheatsheet } from './components/shortcut-cheatsheet';
import { FirstRunWizard, openWizard } from './components/first-run-wizard';
import { PreferencesPanel, togglePreferences } from './components/preferences-panel';
import { ToastContainer } from './components/toast';
import { initDragManager } from './drag-manager';
import { initTheme, registerTerminal, toggleThemeMode } from './theme/theme-manager';
import { createNewTab, closeActiveTab, cycleToNextTab, initFirstTab, clearAllTabs, restoreTabs, saveProjectTabs, hasProjectTabs, restoreProjectTabs } from './components/terminal-tabs';
import {
  loadAppState, initBeforeUnload, sidebarCollapsed, updateLayout, updateSession,
  getProjects, getActiveProject, projects, activeProjectName
} from './state-manager';
import { openProjectModal } from './components/project-modal';
import { serverPaneState, saveCurrentProjectState, restoreProjectState } from './components/server-pane';
import { fileTreeFontSize, fileTreeLineHeight, fileTreeBgColor } from './components/file-tree';
import { detectAgent } from './server/server-bridge';

/**
 * Derive a tmux session name from a project name.
 * Sanitizes to alphanumeric + hyphen + underscore (matching pty.rs sanitization).
 */
function projectSessionName(projectName: string, suffix?: string): string {
  const base = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

// Module-level state for terminal session tracking
// *PtyKey = original PTY spawn session (for write_pty)
// *CurrentSession = which tmux session the client currently shows (for switch-client)
let mainPtyKey = '';
let mainCurrentSession = '';
let rightCurrentSession = '';

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
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('.titlebar-add-btn')) return;
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
  }

  // Wire beforeunload
  initBeforeUnload();

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
        createNewTab();
        break;
      case key === 'w' && !e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey):
        e.preventDefault(); e.stopPropagation();
        closeActiveTab();
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

  // Step 7: file-opened handler (PANEL-06)
  document.addEventListener('file-opened', async (e: Event) => {
    const { path, name } = (e as CustomEvent).detail;
    try {
      const content = await invoke('read_file_content', { path });
      document.dispatchEvent(new CustomEvent('show-file-viewer', {
        detail: { path, name, content }
      }));
    } catch (err) {
      console.error('[efxmux] Failed to read file:', err);
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
    // Right panel uses same project but with -right suffix
    rightCurrentSession = activeName
      ? projectSessionName(activeName, 'right')
      : (appState?.session?.['right-tmux-session'] ?? 'efx-mux-right');

    // Clean up dead tmux sessions from previous runs (Plan 05)
    try { await invoke('cleanup_dead_sessions'); } catch {}

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

    // Apply right-h-pct after DOM is ready
    if (appState?.layout?.['right-h-pct']) {
      const pct = parseFloat(String(appState.layout['right-h-pct']));
      if (!isNaN(pct)) {
        const rightPanel = document.querySelector('.right-panel') as HTMLElement;
        if (rightPanel) {
          const rt = rightPanel.querySelector('.right-top') as HTMLElement;
          const rb = rightPanel.querySelector('.right-bottom') as HTMLElement;
          if (rt) rt.style.flex = `0 0 ${pct.toFixed(1)}%`;
          if (rb) rb.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
        }
      }
    }
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
    saveProjectTabs(oldName);
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

      // Switch right panel bash terminal (silent via Rust)
      const newRightSession = projectSessionName(newProjectName, 'right');
      document.dispatchEvent(new CustomEvent('switch-bash-session', {
        detail: { currentSession: rightCurrentSession, targetSession: newRightSession, startDir: project.path }
      }));
      rightCurrentSession = newRightSession;

      // 07-06: Restore new project's server state (or defaults if never started)
      // Servers keep running in background -- only UI state switches
      restoreProjectState(newProjectName);
    }
  } catch (err) {
    console.warn('[efxmux] Failed to switch project:', err);
  }
});

bootstrap();
