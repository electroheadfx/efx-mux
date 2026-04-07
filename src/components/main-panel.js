// main-panel.js -- Main panel with terminal-area + file viewer overlay + server-pane
// Phase 2: terminal-area is empty -- xterm.js mounts via querySelector (D-08)
// Phase 6 gap closure: file viewer overlay for read-only file display (PANEL-06)
import { html, reactive } from '@arrow-js/core';

const state = reactive({
  fileViewerVisible: false,
  fileName: '',
  filePath: '',
  fileContent: '',
});

// Listen for show-file-viewer events from main.js
document.addEventListener('show-file-viewer', (e) => {
  const { path, name, content } = e.detail;
  state.fileName = name;
  state.filePath = path;
  state.fileContent = content;
  state.fileViewerVisible = true;
});

function closeFileViewer() {
  state.fileViewerVisible = false;
  state.fileContent = '';
}

// Escape key closes file viewer
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.fileViewerVisible) {
    e.preventDefault();
    closeFileViewer();
  }
});

/**
 * Escape HTML entities for safe rendering in pre block.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const MainPanel = () => html`
  <main class="main-panel" aria-label="Main panel" style="position: relative;">
    <div class="terminal-area"></div>
    <div
      class="file-viewer-overlay"
      style="
        display: ${() => state.fileViewerVisible ? 'flex' : 'none'};
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        flex-direction: column;
        background: var(--bg-base);
        z-index: 10;
      "
    >
      <div class="file-viewer-header" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--bg-raised);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      ">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          <span style="
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 3px;
            background: var(--accent);
            color: var(--bg-base);
            font-weight: 600;
            letter-spacing: 0.05em;
            flex-shrink: 0;
          ">READ-ONLY</span>
          <span style="
            color: var(--text-bright);
            font-size: 13px;
            font-family: var(--font-mono, 'Fira Code', monospace);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">${() => state.fileName}</span>
        </div>
        <button
          @click="${closeFileViewer}"
          style="
            background: none;
            border: 1px solid var(--border);
            color: var(--text);
            cursor: pointer;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-family: var(--font-mono, 'Fira Code', monospace);
          "
          title="Close file viewer (Esc)"
        >Close</button>
      </div>
      <pre class="file-viewer-content" style="
        flex: 1;
        margin: 0;
        padding: 12px 16px;
        overflow: auto;
        color: var(--text);
        font-size: 13px;
        font-family: var(--font-mono, 'Fira Code', monospace);
        line-height: 1.5;
        white-space: pre;
        tab-size: 4;
      ">${() => escapeHtml(state.fileContent)}</pre>
    </div>
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
