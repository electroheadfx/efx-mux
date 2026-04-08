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

    const sessionName = appState?.session?.['main-tmux-session'] ?? 'efx-mux';
    try {
      await connectPty(terminal, sessionName);
    } catch (err) {
      console.error('[efxmux] Failed to connect PTY:', err);
      terminal.writeln('\r\n\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + err);
      terminal.writeln('\r\n\x1b[33mA fresh session will be created automatically.\x1b[0m');
      const freshSession = sessionName + '-new';
      try {
        await connectPty(terminal, freshSession);
        updateSession({ 'main-tmux-session': freshSession });
      } catch (err2) {
        terminal.writeln('\r\n\x1b[31mFailed to create fresh session: ' + err2 + '\x1b[0m');
        terminal.writeln('\r\n\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
      }
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

// project-changed listener for md file watcher
document.addEventListener('project-changed', async (e: Event) => {
  const newProjectName = (e as CustomEvent).detail.name;
  try {
    const projectList = await getProjects();
    const project = projectList.find(p => p.name === newProjectName);
    if (project?.path) {
      await invoke('set_project_path', { path: project.path });
    }
  } catch (err) {
    console.warn('[efxmux] Failed to set project path for watcher:', err);
  }
});

bootstrap();
