// main-panel.js -- Main panel with terminal-area + server-pane
// Phase 2: terminal-area is empty -- xterm.js mounts via querySelector (D-08)
import { html } from '@arrow-js/core';

export const MainPanel = () => html`
  <main class="main-panel" aria-label="Main panel">
    <div class="terminal-area"></div>
    <div
      class="split-handle-h"
      data-handle="main-h"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize server pane"
    ></div>
    <div class="server-pane" aria-label="Server pane">
      <div class="server-pane-toolbar">
        <span style="color: var(--text-bright); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;">Server</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button class="server-btn" title="Start server">Start</button>
          <button class="server-btn" title="Stop server" disabled>Stop</button>
          <button class="server-btn" title="Open in browser" disabled>Open</button>
        </div>
      </div>
      <div class="server-pane-logs">
        <span style="color: var(--text); font-size: 11px; opacity: 0.6;">[ Server logs -- Phase 7 ]</span>
      </div>
    </div>
  </main>
`;
