// theme-manager.js -- Theme lifecycle: load, apply, hot-reload, dark/light toggle
// Per D-10: loads theme from Rust backend on startup
// Per D-13: hot-reload via Tauri 'theme-changed' event
// Per D-14: dark/light chrome toggle with localStorage persistence
// Per D-15: light mode only affects app chrome; terminal colors always from theme.json
// Per T-03-05: guard with null checks before property access

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

/** @type {{ chrome?: object, terminal?: object } | null} */
let currentTheme = null;

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

/**
 * Set dark/light chrome mode and persist to localStorage.
 * @param {'dark' | 'light'} mode
 */
export function setThemeMode(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('efxmux:theme-mode', mode);
}

/**
 * Toggle dark/light chrome mode and persist to localStorage.
 * Light mode only affects CSS custom properties (D-14, D-15).
 * Terminal colors remain from theme.json.
 */
export function toggleThemeMode() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setThemeMode(current === 'dark' ? 'light' : 'dark');
}

/**
 * Follow OS dark/light preference via matchMedia.
 * On first launch (no stored preference), adopts OS setting.
 * On OS change mid-session, always follows OS (standard macOS behavior).
 */
function initOsThemeListener() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');

  // On first launch, follow OS if no manual preference stored
  if (localStorage.getItem('efxmux:theme-mode') === null) {
    setThemeMode(mq.matches ? 'dark' : 'light');
  }

  // Follow OS changes mid-session
  mq.addEventListener('change', (e) => {
    setThemeMode(e.matches ? 'dark' : 'light');
  });
}

/**
 * Initialize theme on startup:
 * 1. Restore dark/light mode from localStorage (before paint)
 * 2. Load theme from Rust backend
 * 3. Apply theme to CSS + xterm.js terminals
 * 4. Set up hot-reload listener
 * @returns {Promise<{ chrome?: object, terminal?: object } | null>}
 */
export async function initTheme() {
  const savedMode = localStorage.getItem('efxmux:theme-mode') || 'dark';
  document.documentElement.setAttribute('data-theme', savedMode);

  const theme = await invoke('load_theme');
  applyTheme(theme);

  await listen('theme-changed', (event) => {
    applyTheme(event.payload);
  });

  initOsThemeListener();

  return theme;
}
