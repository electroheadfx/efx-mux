// diff-viewer.js -- Git diff viewer with CSS syntax highlighting (D-04, D-05)
// Listens for open-diff CustomEvent from sidebar.js and renders per-file diffs.

import { html } from '@arrow-js/core';

const { invoke } = window.__TAURI__.core;

/**
 * Escape HTML special characters to prevent XSS in diff output.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a unified diff string into syntax-highlighted HTML.
 * @param {string} diff - Unified diff output
 * @returns {string} HTML string with colored diff lines
 */
function renderDiffHtml(diff) {
  if (!diff || !diff.trim()) {
    return '<div style="color: var(--text-muted); padding: 16px;">No changes detected</div>';
  }

  const lines = diff.split('\n');
  const highlighted = lines.map(line => {
    const escaped = escapeHtml(line);
    if (line.startsWith('+')) {
      return `<div class="diff-add" style="background: rgba(133, 153, 0, 0.15); color: #859900; padding: 0 4px; margin: 0 -4px;">${escaped}</div>`;
    } else if (line.startsWith('-')) {
      return `<div class="diff-del" style="background: rgba(220, 50, 47, 0.15); color: #dc322f; padding: 0 4px; margin: 0 -4px;">${escaped}</div>`;
    } else if (line.startsWith('@@')) {
      return `<div class="diff-hunk" style="color: var(--accent); font-weight: bold; margin-top: 8px;">${escaped}</div>`;
    } else {
      return `<div class="diff-context" style="color: var(--text-muted);">${escaped}</div>`;
    }
  }).join('');

  return `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${highlighted}</pre>`;
}

/**
 * DiffViewer component.
 * Renders git diff output with CSS syntax highlighting.
 * Listens for open-diff CustomEvent dispatched by sidebar.js when a file is clicked.
 *
 * @returns Arrow.js html template
 */
export const DiffViewer = () => {
  let contentEl = null;

  /**
   * Load and render diff for a specific file path.
   * @param {string} filePath - Absolute path to the file
   */
  async function loadDiff(filePath) {
    if (!contentEl) return;
    contentEl.innerHTML = '<div style="color: var(--text-muted); padding: 16px;">Loading diff...</div>';

    try {
      const diff = await invoke('get_file_diff', { path: filePath });
      contentEl.innerHTML = renderDiffHtml(diff);
    } catch (err) {
      contentEl.innerHTML = `<div style="color: #dc322f; padding: 16px;">Error loading diff: ${escapeHtml(String(err))}</div>`;
    }
  }

  // Listen for open-diff event from sidebar.js (D-05)
  document.addEventListener('open-diff', (e) => {
    if (e.detail && e.detail.path) {
      loadDiff(e.detail.path);
    }
  });

  // Schedule DOM discovery after Arrow.js renders (same pattern as gsd-viewer.js)
  setTimeout(() => {
    contentEl = document.getElementById('diff-viewer-content');
  }, 0);

  return html`
    <div
      class="diff-viewer"
      style="
        height: 100%;
        overflow-y: auto;
        padding: 8px 16px;
        font-family: 'FiraCode Light', 'Fira Code', monospace;
        font-size: 13px;
        line-height: 1.5;
      "
    >
      <div
        id="diff-viewer-content"
      >
        <div style="color: var(--text-muted);">Click a file in the sidebar to view its diff</div>
      </div>
    </div>
  `;
};
