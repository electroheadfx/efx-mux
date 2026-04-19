// terminal-manager.ts -- xterm.js lifecycle: create, mount, WebGL/DOM fallback
// Per D-06: retry WebGL once on context loss, then permanent DOM fallback
// Per D-07: silent fallback -- no visible indicator
// Per D-08: mount via querySelector, not Arrow.js ref
// Migrated to TypeScript (Phase 6.1)

import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { syncIncrementsDebounced } from '../window/resize-increments';

export interface TerminalOptions {
  theme?: Record<string, string>;
  font?: string;
  fontSize?: number;
  /** tmux session name — required for Shift+Enter newline injection via send_literal_sequence */
  sessionName?: string;
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
    // overviewRuler.width is subtracted by FitAddon from the available width
    // before cols are computed, producing a permanent right-side gap equal to
    // this value. It also sets the VS Code scrollbar widget width (hidden via
    // CSS). FitAddon falls back to 14 when width is 0/undefined (`|| 14`), so
    // 1 is the minimum we can set without triggering the fallback. This yields
    // a ~1px right gap instead of 10px, so tmux status bar visually fills the
    // pane width (gap is one pixel-ish, invisible against terminal bg).
    overviewRuler: { width: 1 },
    allowProposedApi: true,
  });

  // Word/line navigation: convert macOS shortcuts to terminal escape codes
  terminal.attachCustomKeyEventHandler((ev: KeyboardEvent): boolean => {
    if (ev.type !== 'keydown') return true;

    // Shift+Enter -> ESC+CR sequence for newline insert (Claude Code multi-line input)
    // By default xterm.js sends \r for both Enter and Shift+Enter. Claude Code recognises
    // \x1b\r (ESC followed by CR) as "meta+return" = insert newline. This is the same
    // sequence Claude Code's own /terminal-setup writes for non-native terminals (VS Code,
    // Alacritty, Warp). CSI u (\x1b[13;2u) requires the kitty keyboard protocol handshake
    // which efx-mux never initiates, so Claude Code ignores it.
    //
    // WHY NOT terminal.input(): terminal.input() routes through onData → write_pty →
    // PTY master → tmux client keyboard-input path. tmux with extended-keys=off does
    // NOT recognise extended sequences from the PTY and silently discards them.
    //
    // FIX: invoke send_literal_sequence which runs `tmux send-keys -l -t {session}`.
    // send-keys -l bypasses tmux's key-parsing table entirely and writes the raw bytes
    // directly to the pane's stdin. Claude Code receives \x1b\r and inserts a newline.
    if (ev.key === 'Enter' && ev.shiftKey && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      const sn = options.sessionName;
      if (sn) {
        invoke('send_literal_sequence', {
          sessionName: sn,
          sequence: '\x1b[13;2u',
        }).catch(() => {});
      }
      return false;
    }

    // Cmd+K -> clear terminal (standard macOS shortcut). Send Ctrl+L (form feed,
    // 0x0c) through the PTY so the shell clears + redraws naturally. `terminal.clear()`
    // only wipes xterm's local buffer which desyncs against tmux: tmux keeps rendering
    // its last frame and the status bar ends up stuck at the top row until the next
    // tmux refresh. Shell-level clear lets tmux repaint the whole viewport.
    if (ev.metaKey && !ev.ctrlKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      const sn = options.sessionName;
      if (sn) {
        invoke('send_literal_sequence', {
          sessionName: sn,
          sequence: '\x0c',
        }).catch(() => {});
      } else {
        terminal.clear();
      }
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
      console.warn('[efxmux] WebGL not available, using DOM renderer:', msg);
    }
  }
  tryWebGL();

  // Register onRender catch-all AFTER tryWebGL() so the first onRender fires
  // with the chosen renderer's measured cell geometry. This is a low-fi
  // fallback that coalesces into the shared 100ms debounce — cheap even if it
  // fires frequently.
  terminal.onRender(() => syncIncrementsDebounced());

  // Initial fit: defer two animation frames so the browser has completed
  // flex layout before FitAddon measures the container. A synchronous
  // fit() call here measures the container at its pre-layout (0) height
  // and computes the wrong row count, producing a larger-than-expected
  // row remainder band (diagnosed ea798dd).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitAddon.fit();
      syncIncrementsDebounced(); // sync after first real fit so cell dims are valid
    });
  });

  return {
    terminal,
    fitAddon,
    dispose(): void {
      terminal.dispose();
    },
  };
}
