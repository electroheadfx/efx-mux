// main.js -- App bootstrap for GSD MUX
// Execution order matters:
//   1. Load persisted state from Rust backend (prevents layout flash)
//   2. Create reactive state
//   3. Mount Arrow.js components
//   4. Wire keyboard handlers
import { reactive, html, watch } from '@arrow-js/core';
import { Sidebar }     from './components/sidebar.js';
import { MainPanel }   from './components/main-panel.js';
import { RightPanel }  from './components/right-panel.js';
import { initDragManager } from './drag-manager.js';
import { createTerminal } from './terminal/terminal-manager.js';
import { connectPty } from './terminal/pty-bridge.js';
import { attachResizeHandler } from './terminal/resize-handler.js';
import { initTheme, registerTerminal, toggleThemeMode } from './theme/theme-manager.js';
import { loadAppState, initBeforeUnload, updateLayout, updateSession, getProjects, getActiveProject, switchProject } from './state-manager.js';
import { ProjectModal } from './components/project-modal.js';
import { FuzzySearch }  from './components/fuzzy-search.js';

const { invoke } = window.__TAURI__.core;

// --- Step 1: Load persisted state from Rust backend ---
// Must run before components mount to avoid layout flash.
// Uses state.json at ~/.config/efxmux/ (Phase 4 replaces localStorage).
let appState = null;
try {
  appState = await loadAppState();
} catch (err) {
  console.warn('[efxmux] State load failed, using defaults:', err);
}

// Apply loaded layout to CSS custom properties immediately
if (appState?.layout) {
  const { layout } = appState;
  if (layout['sidebar-w']) document.documentElement.style.setProperty('--sidebar-w', layout['sidebar-w']);
  if (layout['right-w']) document.documentElement.style.setProperty('--right-w', layout['right-w']);
  if (layout['right-h-pct']) {
    const pct = parseFloat(layout['right-h-pct']);
    if (!isNaN(pct)) {
      const rightPanel = document.querySelector('.right-panel');
      if (rightPanel) {
        const rt = rightPanel.querySelector('.right-top');
        const rb = rightPanel.querySelector('.right-bottom');
        if (rt) rt.style.flex = `0 0 ${pct.toFixed(1)}%`;
        if (rb) rb.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
      }
    }
  }
}

// Wire beforeunload to save state on app close (D-11)
initBeforeUnload();

// --- Step 2: Reactive state ---
const state = reactive({
  sidebarCollapsed: appState?.layout?.['sidebar-collapsed'] ?? false,
});

// Keep CSS and state.json in sync when sidebarCollapsed changes.
watch(() => {
  const collapsed = state.sidebarCollapsed;
  const w = collapsed ? '40px' : '200px';
  document.documentElement.style.setProperty('--sidebar-w', w);
  // Persist to state.json via Rust
  updateLayout({ 'sidebar-w': w, 'sidebar-collapsed': collapsed });
});

// --- Step 3: Mount components ---
const app = document.getElementById('app');
if (!app) throw new Error('GSD MUX: #app element not found');

html`
  ${Sidebar({ collapsed: { value: () => state.sidebarCollapsed } })}
  <div class="split-handle-v" data-handle="sidebar-main" role="separator" aria-orientation="vertical" aria-label="Resize sidebar"></div>
  ${MainPanel()}
  <div class="split-handle-v" data-handle="main-right" role="separator" aria-orientation="vertical" aria-label="Resize main panel"></div>
  ${RightPanel()}
  ${ProjectModal()}
  ${FuzzySearch()}
`(app);

// --- Step 4: Wire drag handles ---
// Must be after html`...`(app) so [data-handle] elements exist in DOM
initDragManager();

// --- Step 4b: Init project system ---
initProjects();

// --- Step 5: Keyboard handlers ---
// Ctrl+B -- toggle sidebar (per D-06 / LAYOUT-03)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    state.sidebarCollapsed = !state.sidebarCollapsed;
  }
  // Ctrl+Shift+T -- toggle dark/light mode (per THEME-04)
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    e.preventDefault();
    toggleThemeMode();
  }
  // Ctrl+P -- fuzzy project search overlay (handled by fuzzy-search.js global listener)
  // but also dispatch event here for explicit control
  if (e.ctrlKey && e.key === 'p') {
    // fuzzy-search.js already captures this at document level
    // Dispatch event for explicit cross-component communication
    document.dispatchEvent(new CustomEvent('open-fuzzy-search'));
  }
});

// --- Step 4b: Project system init ---
// Load projects on startup; auto-open modal if empty
async function initProjects() {
  try {
    const projects = await getProjects();
    if (projects.length === 0) {
      // Signal first-run modal
      const { openProjectModal } = await import('./components/project-modal.js');
      openProjectModal({ firstRun: true });
      return;
    }
    // Activate md file watcher for active project on startup (PANEL-03 gap closure)
    const activeName = await getActiveProject();
    if (activeName) {
      const project = projects.find(p => p.name === activeName);
      if (project && project.path) {
        invoke('set_project_path', { path: project.path });
      }
    }
  } catch (err) {
    console.warn('[efxmux] Failed to load projects:', err);
  }
}

// Listen for project switches — update sidebar + tmux sessions
document.addEventListener('project-changed', async (e) => {
  const newProjectName = e.detail.name;
  console.log('[efxmux] Project switched to:', newProjectName);
  // Activate md file watcher for new project (PANEL-03 gap closure)
  try {
    const projects = await getProjects();
    const project = projects.find(p => p.name === newProjectName);
    if (project && project.path) {
      await invoke('set_project_path', { path: project.path });
    }
  } catch (err) {
    console.warn('[efxmux] Failed to set project path for watcher:', err);
  }
});

// Handle file-opened from File Tree (PANEL-06 gap closure)
document.addEventListener('file-opened', async (e) => {
  const { path, name } = e.detail;
  try {
    const content = await invoke('read_file_content', { path });
    document.dispatchEvent(new CustomEvent('show-file-viewer', {
      detail: { path, name, content }
    }));
  } catch (err) {
    console.error('[efxmux] Failed to read file:', err);
  }
});

// --- Step 6: Initialize theme ---
// Must run before terminal creation so theme values are available.
// Restores dark/light mode from state.json + loads theme.json from Rust backend.
// Uses requestAnimationFrame to ensure Arrow.js has finished rendering.
requestAnimationFrame(async () => {
  let loadedTheme = null;
  try {
    loadedTheme = await initTheme();
  } catch (err) {
    console.warn('[efxmux] Theme init failed, using defaults:', err);
  }

  // --- Step 7: Initialize terminal ---
  // Must run after html`...`(app) so .terminal-area exists in DOM (D-08: querySelector mount)
  const container = document.querySelector('.terminal-area');
  if (!container) {
    console.error('[efxmux] .terminal-area not found in DOM');
    return;
  }

  // Create xterm.js Terminal with WebGL/DOM fallback
  const { terminal, fitAddon } = createTerminal(container, {
    theme: loadedTheme?.terminal,
    font: loadedTheme?.chrome?.font,
    fontSize: loadedTheme?.chrome?.fontSize,
  });

  // Register terminal for hot-reload theme updates
  registerTerminal(terminal, fitAddon);

  // Connect to PTY via Channel (D-03: use saved session name, reattach via tmux -A -s)
  // Phase 4: read session name from state.json instead of hardcoded 'efx-mux'
  const sessionName = appState?.session?.['main-tmux-session'] ?? 'efx-mux';
  try {
    await connectPty(terminal, sessionName);
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY:', err);
    // D-05/D-06: Dead session recovery -- warn to console, tmux -A -s will auto-create
    terminal.writeln('\r\n\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + err);
    terminal.writeln('\r\n\x1b[33mA fresh session will be created automatically.\x1b[0m');
    // Try again with a fresh session name (append -new to avoid conflict)
    const freshSession = sessionName + '-new';
    try {
      await connectPty(terminal, freshSession);
      // Update saved session name to the new one
      updateSession({ 'main-tmux-session': freshSession });
    } catch (err2) {
      terminal.writeln('\r\n\x1b[31mFailed to create fresh session: ' + err2 + '\x1b[0m');
      terminal.writeln('\r\n\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
    }
  }

  // Attach resize handler (D-12: 150ms debounce)
  attachResizeHandler(container, terminal, fitAddon);

  // Apply right-h-pct after DOM is ready (right panel now exists)
  if (appState?.layout?.['right-h-pct']) {
    const pct = parseFloat(appState.layout['right-h-pct']);
    if (!isNaN(pct)) {
      const rightPanel = document.querySelector('.right-panel');
      if (rightPanel) {
        const rt = rightPanel.querySelector('.right-top');
        const rb = rightPanel.querySelector('.right-bottom');
        if (rt) rt.style.flex = `0 0 ${pct.toFixed(1)}%`;
        if (rb) rb.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
      }
    }
  }

  // Focus terminal for immediate keyboard input
  terminal.focus();
});
