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
import './styles/app.css';

import { Sidebar } from './components/sidebar';
import { MainPanel } from './components/main-panel';
import { RightPanel } from './components/right-panel';
import { ProjectModal } from './components/project-modal';
import { FuzzySearch } from './components/fuzzy-search';
import { initDragManager } from './drag-manager';
import { createTerminal } from './terminal/terminal-manager';
import { connectPty } from './terminal/pty-bridge';
import { attachResizeHandler } from './terminal/resize-handler';
import { initTheme, registerTerminal, toggleThemeMode } from './theme/theme-manager';
import {
  loadAppState, initBeforeUnload, sidebarCollapsed, updateLayout, updateSession,
  getProjects, getActiveProject, projects, activeProjectName
} from './state-manager';
import { openProjectModal } from './components/project-modal';

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
let rightPtyKey = '';
let rightCurrentSession = '';

/**
 * Switch a tmux client to a different session silently via Rust system commands.
 * No PTY output — completely invisible in the terminal.
 */
async function switchTmuxSession(currentSession: string, targetSession: string, startDir?: string): Promise<void> {
  await invoke('switch_tmux_session', {
    currentSession,
    targetSession,
    startDir: startDir ?? null,
  });
}

function App() {
  return (
    <div id="app-root" class="flex w-screen h-screen overflow-hidden bg-bg text-text-bright font-mono text-sm font-light antialiased">
      <Sidebar />
      <div class="split-handle-v" data-handle="sidebar-main" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" />
      <MainPanel />
      <div class="split-handle-v" data-handle="main-right" role="separator" aria-orientation="vertical" aria-label="Resize main panel" />
      <RightPanel />
      <ProjectModal />
      <FuzzySearch />
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

  // Step 6: Keyboard handlers
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      sidebarCollapsed.value = !sidebarCollapsed.value;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      toggleThemeMode();
    }
  });

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

    const container = document.querySelector('.terminal-area') as HTMLElement;
    if (!container) {
      console.error('[efxmux] .terminal-area not found in DOM');
      return;
    }

    const { terminal, fitAddon } = createTerminal(container, {
      theme: loadedTheme?.terminal,
      font: loadedTheme?.chrome?.font,
      fontSize: loadedTheme?.chrome?.fontSize,
    });

    registerTerminal(terminal, fitAddon);

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
    try {
      await connectPty(terminal, sessionName, activeProject?.path);
      updateSession({ 'main-tmux-session': sessionName });
    } catch (err) {
      console.error('[efxmux] Failed to connect PTY:', err);
      terminal.writeln('\r\n\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + err);
      terminal.writeln('\r\n\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
    }

    attachResizeHandler(container, terminal, fitAddon, sessionName);
    setTimeout(() => fitAddon.fit(), 100);

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

    terminal.focus();
  });
}

async function initProjects() {
  try {
    const projectList = await getProjects();
    projects.value = projectList;
    if (projectList.length === 0) {
      openProjectModal({ firstRun: true });
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

// project-changed listener: switch tmux sessions + update file watcher
document.addEventListener('project-changed', async (e: Event) => {
  const newProjectName = (e as CustomEvent).detail.name;
  try {
    const projectList = await getProjects();
    const project = projectList.find(p => p.name === newProjectName);
    if (project?.path) {
      await invoke('set_project_path', { path: project.path });

      // Switch main terminal to new project's tmux session (silent via Rust)
      const newMainSession = projectSessionName(newProjectName);
      if (newMainSession !== mainCurrentSession) {
        await switchTmuxSession(mainCurrentSession, newMainSession, project.path);
        mainCurrentSession = newMainSession;
      }

      // Switch right panel bash terminal (silent via Rust)
      const newRightSession = projectSessionName(newProjectName, 'right');
      document.dispatchEvent(new CustomEvent('switch-bash-session', {
        detail: { currentSession: rightCurrentSession, targetSession: newRightSession, startDir: project.path }
      }));
      rightCurrentSession = newRightSession;
    }
  } catch (err) {
    console.warn('[efxmux] Failed to switch project:', err);
  }
});

bootstrap();
