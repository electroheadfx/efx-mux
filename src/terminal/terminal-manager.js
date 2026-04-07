// terminal-manager.js -- xterm.js lifecycle: create, mount, WebGL/DOM fallback
// Per D-06: retry WebGL once on context loss, then permanent DOM fallback
// Per D-07: silent fallback -- no visible indicator
// Per D-08: mount via querySelector, not Arrow.js ref

import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';

/**
 * Create and mount an xterm.js Terminal instance.
 * @param {HTMLElement} container - DOM element to mount into (e.g., document.querySelector('.terminal-area'))
 * @param {{ theme?: object, font?: string, fontSize?: number }} [options={}] - Theme and font options from theme-manager
 * @returns {{ terminal: Terminal, fitAddon: FitAddon, dispose: () => void }}
 */
export function createTerminal(container, options = {}) {
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    fontSize: options.fontSize || 14,
    fontFamily: options.font ? `'${options.font}', monospace` : "'FiraCode Light', 'Fira Code', monospace",
    theme: options.theme || {
      background: '#282d3a',
      foreground: '#92a0a0',
      cursor: '#258ad1',
      selectionBackground: '#3e454a',
    },
    overviewRuler: { width: 10 },
    allowProposedApi: true,
  });

  // Word/line navigation: convert macOS shortcuts to terminal escape codes
  terminal.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true;

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
    // Ctrl+Shift+T -> let document handler toggle dark/light mode (THEME-04)
    if (ev.ctrlKey && ev.shiftKey && ev.key === 'T') {
      return false;
    }
    // Ctrl+B -> let document handler toggle sidebar (LAYOUT-03)
    if (ev.ctrlKey && ev.key === 'b') {
      return false;
    }
    return true;
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Mount to DOM
  terminal.open(container);

  // Attempt WebGL renderer (D-06: retry once on context loss)
  let webglAttempts = 0;
  function tryWebGL() {
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
    } catch (e) {
      // WebGL2 not available -- DOM renderer is the default, nothing to do (D-07)
      console.warn('[efx-mux] WebGL not available, using DOM renderer:', e.message);
    }
  }
  tryWebGL();

  // Initial fit after mount
  fitAddon.fit();

  return {
    terminal,
    fitAddon,
    dispose() {
      terminal.dispose();
    },
  };
}
