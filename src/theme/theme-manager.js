// theme-manager.js -- Theme lifecycle: load, apply, hot-reload, dark/light toggle
// Per D-10: loads theme from Rust backend on startup
// Per D-13: hot-reload via Tauri 'theme-changed' event
// Per D-14: dark/light chrome toggle with state.json persistence (Phase 4)
// Per D-15: light mode only affects app chrome; terminal colors always from theme.json
// Per T-03-05: guard with null checks before property access

import { updateThemeMode as persistThemeMode, getCurrentState } from '../state-manager.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

/** @type {{ chrome?: object, terminal?: object } | null} */
let currentTheme = null;

/** Session-scoped flag: true after user manually toggles theme mode (resets on app restart) */
let manualToggle = false;

/** Terminal registry for hot-reload updates */
const terminals = [];

/**
 * Register a terminal instance for hot-reload theme updates.
 * @param {import('@xterm/xterm').Terminal} terminal
 * @param {import('@xterm/addon-fit').FitAddon} fitAddon
 */
export function registerTerminal(terminal, fitAddon) {
  terminals.push({ terminal, fitAddon });
}

/**
 * Unregister a terminal (e.g., on dispose).
 * @param {import('@xterm/xterm').Terminal} terminal
 */
export function unregisterTerminal(terminal) {
  const idx = terminals.findIndex(t => t.terminal === terminal);
  if (idx !== -1) terminals.splice(idx, 1);
}

/**
 * Apply a full theme object to CSS custom properties and all registered xterm.js terminals.
 * Caches theme in currentTheme for getTerminalTheme().
 * @param {{ chrome?: object, terminal?: object }} theme
 */
export function applyTheme(theme) {
  currentTheme = theme;

  if (theme.chrome) {
    const style = document.documentElement.style;
    if (theme.chrome.bg) style.setProperty('--bg', theme.chrome.bg);
    if (theme.chrome.bgRaised) style.setProperty('--bg-raised', theme.chrome.bgRaised);
    if (theme.chrome.border) style.setProperty('--border', theme.chrome.border);
    if (theme.chrome.text) style.setProperty('--text', theme.chrome.text);
    if (theme.chrome.textBright) style.setProperty('--text-bright', theme.chrome.textBright);
    if (theme.chrome.accent) style.setProperty('--accent', theme.chrome.accent);
    if (theme.chrome.font) style.setProperty('--font', `'${theme.chrome.font}', monospace`);
    if (theme.chrome.fontSize) style.setProperty('--font-size', `${theme.chrome.fontSize}px`);
  }

  if (theme.terminal) {
    for (const reg of terminals) {
      reg.terminal.options.theme = theme.terminal;
      if (theme.chrome?.font) {
        reg.terminal.options.fontFamily = `'${theme.chrome.font}', monospace`;
      }
      if (theme.chrome?.fontSize) {
        reg.terminal.options.fontSize = theme.chrome.fontSize;
      }
      reg.fitAddon.fit();
    }
  }
}

/**
 * Get the cached terminal theme section from the last applyTheme() call.
 * Used by terminal-manager.js for initial Terminal creation.
 * @returns {object | null}
 */
export function getTerminalTheme() {
  return currentTheme?.terminal ?? null;
}

/** Chrome CSS properties set by applyTheme() — must be cleared for light mode CSS to take effect */
const CHROME_PROPS = ['--bg', '--bg-raised', '--border', '--text', '--text-bright', '--accent'];

/**
 * Set dark/light chrome mode and persist to state.json via Rust backend.
 * When switching to light: clears inline chrome CSS vars so :root[data-theme="light"] in
 * theme.css takes effect (inline styles have higher specificity than CSS selectors).
 * When switching to dark: re-applies chrome vars from cached theme.
 * @param {'dark' | 'light'} mode
 */
export function setThemeMode(mode) {
  const style = document.documentElement.style;
  document.documentElement.setAttribute('data-theme', mode);
  // Persist to state.json via Rust backend (Phase 4)
  persistThemeMode(mode);

  if (mode === 'light') {
    // Remove inline chrome vars so CSS :root[data-theme="light"] wins
    for (const prop of CHROME_PROPS) {
      style.removeProperty(prop);
    }
  } else if (currentTheme?.chrome) {
    // Re-apply dark theme chrome vars from cached theme
    const c = currentTheme.chrome;
    if (c.bg) style.setProperty('--bg', c.bg);
    if (c.bgRaised) style.setProperty('--bg-raised', c.bgRaised);
    if (c.border) style.setProperty('--border', c.border);
    if (c.text) style.setProperty('--text', c.text);
    if (c.textBright) style.setProperty('--text-bright', c.textBright);
    if (c.accent) style.setProperty('--accent', c.accent);
  }
}

/**
 * Toggle dark/light chrome mode and persist to state.json.
 * Light mode only affects CSS custom properties (D-14, D-15).
 * Terminal colors remain from theme.json.
 */
export function toggleThemeMode() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  // Mark as manually toggled for this session (resets on app restart)
  manualToggle = true;
  setThemeMode(current === 'dark' ? 'light' : 'dark');
}

/**
 * Follow OS dark/light preference via matchMedia.
 * On first launch (no stored preference), adopts OS setting.
 * On OS change mid-session, always follows OS (standard macOS behavior).
 */
function initOsThemeListener() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');

  // On first launch, follow OS if no preference stored in state.json
  const currentMode = getCurrentState()?.theme?.mode;
  if (currentMode === undefined || currentMode === null) {
    setThemeMode(mq.matches ? 'dark' : 'light');
  }

  // Only follow OS changes if user hasn't manually toggled
  mq.addEventListener('change', (e) => {
    if (!manualToggle) {
      setThemeMode(e.matches ? 'dark' : 'light');
    }
  });
}

/**
 * Initialize theme on startup:
 * 1. Restore dark/light mode from state.json (before paint, with localStorage fallback)
 * 2. Load theme from Rust backend
 * 3. Apply theme to CSS + xterm.js terminals
 * 4. Set up hot-reload listener
 * @returns {Promise<{ chrome?: object, terminal?: object } | null>}
 */
export async function initTheme() {
  // Use theme mode from already-loaded state (Phase 4: state.json, not localStorage)
  // Falls back to localStorage for upgrade users (Phase 3 -> Phase 4 transition)
  const savedMode = getCurrentState()?.theme?.mode
    ?? localStorage.getItem('efxmux:theme-mode')
    ?? 'dark';
  document.documentElement.setAttribute('data-theme', savedMode);

  const theme = await invoke('load_theme');
  applyTheme(theme);
  // Apply saved mode after applyTheme() -- clears inline CSS vars for light mode (Fix 1: UAT Test 4)
  setThemeMode(savedMode);

  await listen('theme-changed', (event) => {
    applyTheme(event.payload);
  });

  initOsThemeListener();

  return theme;
}
