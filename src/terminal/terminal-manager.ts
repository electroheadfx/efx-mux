// terminal-manager.ts -- xterm.js lifecycle: create, mount, WebGL/DOM fallback
// Per D-06: retry WebGL once on context loss, then permanent DOM fallback
// Per D-07: silent fallback -- no visible indicator
// Per D-08: mount via querySelector, not Arrow.js ref
// Migrated to TypeScript (Phase 6.1)

import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';

export interface TerminalOptions {
  theme?: Record<string, string>;
  font?: string;
  fontSize?: number;
}

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

/**
 * Create and mount an xterm.js Terminal instance.
 */
export function createTerminal(container: HTMLElement, options: TerminalOptions = {}): TerminalInstance {
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    fontSize: options.fontSize || 14,
    fontFamily: options.font ? `'${options.font}', monospace` : "'FiraCode Light', 'Fira Code', monospace",
    theme: options.theme || {
      background: '#111927',
      foreground: '#92a0a0',
      cursor: '#258ad1',
      selectionBackground: '#3e454a',
    },
    overviewRuler: { width: 10 },
    allowProposedApi: true,
  });

  // Word/line navigation: convert macOS shortcuts to terminal escape codes
  terminal.attachCustomKeyEventHandler((ev: KeyboardEvent): boolean => {
    if (ev.type !== 'keydown') return true;

    // Cmd+K -> clear terminal scrollback (standard macOS shortcut)
    if (ev.metaKey && !ev.ctrlKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      terminal.clear();
      return false;
    }

    // Cmd+Left -> beginning of line (Ctrl+A)
    if (ev.metaKey && ev.key === 'ArrowLeft') {
      ev.preventDefault();
      terminal.write('\x01'); // Ctrl+A - beginning of line
      return false;
    }
    // Cmd+Right -> end of line (Ctrl+E)
    if (ev.metaKey && ev.key === 'ArrowRight') {
      ev.preventDefault();
      terminal.write('\x05'); // Ctrl+E - end of line
      return false;
    }
    // Alt+Left -> word left (ESC b)
    if (ev.altKey && ev.key === 'ArrowLeft') {
      ev.preventDefault();
      terminal.write('\x1bb'); // ESC b - word backward
      return false;
    }
    // Alt+Right -> word right (ESC f)
    if (ev.altKey && ev.key === 'ArrowRight') {
      ev.preventDefault();
      terminal.write('\x1bf'); // ESC f - word forward
      return false;
    }
    // Block all Ctrl+key app shortcuts from reaching terminal (D-01, UX-01)
    if (ev.ctrlKey && !ev.metaKey) {
      const k = ev.key.toLowerCase();
      // App-claimed non-shift keys
      if (!ev.shiftKey && !ev.altKey && ['t', 'w', 'b', 's', 'p', 'k'].includes(k)) return false;
      // Ctrl+Tab
      if (ev.key === 'Tab' && !ev.shiftKey) return false;
      // Ctrl+? (Ctrl+Shift+/) and Ctrl+/
      if (k === '/' || ev.key === '?') return false;
      // Ctrl+Shift+T (theme toggle)
      if (k === 't' && ev.shiftKey) return false;
    }
    return true;
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Mount to DOM
  terminal.open(container);

  // Attempt WebGL renderer (D-06: retry once on context loss)
  let webglAttempts = 0;
  function tryWebGL(): void {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        webglAttempts++;
        if (webglAttempts < 2) {
          // Retry once (D-06)
          tryWebGL();
        }
        // If second attempt fails, DOM renderer stays active (D-07: silent, no indicator)
      });
      terminal.loadAddon(webgl);
    } catch (e: unknown) {
      // WebGL2 not available -- DOM renderer is the default, nothing to do (D-07)
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[efx-mux] WebGL not available, using DOM renderer:', msg);
    }
  }
  tryWebGL();

  // Initial fit after mount
  fitAddon.fit();

  return {
    terminal,
    fitAddon,
    dispose(): void {
      terminal.dispose();
    },
  };
}
