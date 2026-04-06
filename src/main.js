// main.js -- App bootstrap for GSD MUX
// Execution order matters:
//   1. Restore persisted ratios from localStorage (prevents layout flash)
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

// --- Step 1: Restore persisted split ratios ---
// Must run before components mount to avoid a flash of default widths.
// Phase 4 will migrate this to state.json via Tauri IPC; localStorage is the
// Phase 1 temporary measure (per D-08).
const RATIO_KEY = 'gsd-mux:split-ratios';
const DEFAULT_RATIOS = {
  '--sidebar-w': '200px',
  '--right-w':   '25%',
};

function loadRatios() {
  try {
    return JSON.parse(localStorage.getItem(RATIO_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveRatios(patch) {
  const current = loadRatios();
  localStorage.setItem(RATIO_KEY, JSON.stringify({ ...current, ...patch }));
}

function applyRatios(ratios) {
  const merged = { ...DEFAULT_RATIOS, ...ratios };
  for (const [prop, value] of Object.entries(merged)) {
    document.documentElement.style.setProperty(prop, value);
  }
}

// Apply immediately -- before first paint
applyRatios(loadRatios());

// --- Step 2: Reactive state ---
const saved = loadRatios();
const state = reactive({
  // Sidebar collapsed: true if sidebar-w is 40px
  sidebarCollapsed: saved['--sidebar-w'] === '40px',
});

// Keep CSS in sync when sidebarCollapsed changes.
// Arrow.js watch() re-runs whenever any reactive data accessed inside changes.
watch(() => {
  const collapsed = state.sidebarCollapsed;
  const w = collapsed ? '40px' : '200px';
  document.documentElement.style.setProperty('--sidebar-w', w);
  saveRatios({ '--sidebar-w': w });
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
`(app);

// --- Step 4: Wire drag handles ---
// Must be after html`...`(app) so [data-handle] elements exist in DOM
initDragManager({ saveRatios });

// --- Step 5: Keyboard handlers ---
// Ctrl+B -- toggle sidebar (per D-06 / LAYOUT-03)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    state.sidebarCollapsed = !state.sidebarCollapsed;
  }
});

// --- Step 6: Initialize terminal ---
// Must run after html`...`(app) so .terminal-area exists in DOM (D-08: querySelector mount)
// Uses requestAnimationFrame to ensure Arrow.js has finished rendering
requestAnimationFrame(async () => {
  const container = document.querySelector('.terminal-area');
  if (!container) {
    console.error('[efx-mux] .terminal-area not found in DOM');
    return;
  }

  // Create xterm.js Terminal with WebGL/DOM fallback
  const { terminal, fitAddon } = createTerminal(container);

  // Connect to PTY via Channel (D-02: session name = directory basename)
  // For Phase 2 MVP, use a fixed session name. Phase 5 will derive from project config.
  const sessionName = 'efx-mux';
  try {
    await connectPty(terminal, sessionName);
  } catch (err) {
    console.error('[efx-mux] Failed to connect PTY:', err);
    // If tmux is missing (D-01), show error in terminal
    terminal.writeln('\r\n\x1b[31mFailed to start terminal: ' + err + '\x1b[0m');
    terminal.writeln('\r\n\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
    return;
  }

  // Attach resize handler (D-12: 150ms debounce)
  attachResizeHandler(container, terminal, fitAddon);

  // Focus terminal for immediate keyboard input
  terminal.focus();
});
