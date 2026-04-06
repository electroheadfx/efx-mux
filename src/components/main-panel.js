// main-panel.js -- Main panel with terminal-area + server-pane (per D-05)
// Phase 1: placeholder only. PTY + xterm.js wired in Phase 2.
import { html } from '@arrow-js/core';

/**
 * MainPanel component.
 * terminal-area: takes remaining height (flex: 1) -- Phase 2 mounts xterm.js here.
 * server-pane: height: 0 collapsed placeholder -- Phase 7 adds controls.
 */
export const MainPanel = () => html`
  <main class="main-panel" aria-label="Main panel">
    <div class="terminal-area">
      <span style="color: var(--text); font-size: 12px; letter-spacing: 0.04em;">
        [ Terminal -- Phase 2 ]
      </span>
    </div>
    <!--
      server-pane: height=0, overflow=hidden. Structural placeholder per D-05.
      Phase 7 will expand this with start/stop/open-in-browser controls.
    -->
    <div class="server-pane" aria-hidden="true"></div>
  </main>
`;
