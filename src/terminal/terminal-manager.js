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
 * @returns {{ terminal: Terminal, fitAddon: FitAddon, dispose: () => void }}
 */
export function createTerminal(container) {
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    fontSize: 14,
    fontFamily: "'FiraCode Light', 'Fira Code', monospace",
    theme: {
      background: '#1a2e1a',
      foreground: '#d4d4c8',
      cursor: '#7fba4c',
      selectionBackground: '#3a5a3a',
    },
    allowProposedApi: true,
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
