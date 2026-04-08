// gsd-viewer.js -- GSD Markdown viewer with checkbox write-back + auto-refresh
// D-01: Checkbox write-back via write_checkbox Rust command
// D-02: marked.js renders markdown with task checkboxes
// D-03: Auto-refresh on md-file-changed Tauri event

import { html } from '@arrow-js/core';
import { marked } from 'marked';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

/**
 * Build a map of checkbox index -> line number (0-indexed).
 * Scans markdown text for task list items: `- [ ]`, `- [x]`, `* [ ]`, `* [x]`.
 * @param {string} text - Raw markdown content
 * @returns {number[]} Array of line numbers (0-indexed) for each checkbox in order
 */
function buildLineMap(text) {
  const lines = text.split('\n');
  const lineMap = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-*]\s*\[[ xX]\]/.test(lines[i])) {
      lineMap.push(i);
    }
  }
  return lineMap;
}

/**
 * Inject data-line attributes into rendered HTML.
 * Finds <input> checkboxes and wraps their parent <li> with data-line.
 * @param {string} renderedHtml - HTML from marked.parse()
 * @param {number[]} lineMap - Checkbox line numbers from buildLineMap
 * @returns {string} HTML with data-line attributes on checkbox list items
 */
function injectLineNumbers(renderedHtml, lineMap) {
  let checkboxIndex = 0;
  // Replace each task-checkbox input with one that has data-line
  return renderedHtml.replace(
    /<input type="checkbox" class="task-checkbox"([^>]*)>/g,
    (match, attrs) => {
      const line = lineMap[checkboxIndex] !== undefined ? lineMap[checkboxIndex] : -1;
      checkboxIndex++;
      return `<input type="checkbox" class="task-checkbox" data-line="${line}"${attrs}>`;
    }
  );
}

// Configure marked with custom checkbox renderer (D-02)
marked.use({
  renderer: {
    checkbox({ checked }) {
      return `<input type="checkbox" class="task-checkbox"${checked ? ' checked' : ''}>`;
    }
  }
});

/**
 * GSD Viewer component.
 * Renders markdown with interactive checkboxes that write back to the .md file.
 * Auto-refreshes when the watched .md file changes externally.
 *
 * @param {() => object|null} activeProject - Reactive getter returning active project data
 * @returns Arrow.js html template
 */
export const GSDViewer = (activeProject) => {
  let currentPath = null;
  let contentEl = null;
  let unlisten = null;

  /**
   * Load and render the GSD markdown file for a project.
   * @param {object} project - Project object with path and optional gsd_file
   */
  async function loadGSD(project) {
    if (!project || !project.path) return;
    const gsdFile = project.gsd_file || 'PLAN.md';
    const path = project.path + '/' + gsdFile;
    currentPath = path;

    try {
      const content = await invoke('read_file_content', { path });
      const lineMap = buildLineMap(content);
      const rendered = marked.parse(content);
      const withLines = injectLineNumbers(rendered, lineMap);
      if (contentEl) {
        contentEl.innerHTML = `<div class="gsd-content">${withLines}</div>`;
      }
    } catch (err) {
      console.warn('[efxmux] Failed to load GSD file:', err);
      if (contentEl) {
        contentEl.innerHTML = `<div class="gsd-empty" style="padding: 16px; color: var(--text-muted); font-size: 13px;">No GSD file found (${gsdFile})</div>`;
      }
    }
  }

  // Listen for md-file-changed Tauri event (D-03: auto-refresh)
  listen('md-file-changed', () => {
    const project = activeProject();
    if (project && currentPath) {
      loadGSD(project);
    }
  }).then(fn => { unlisten = fn; });

  // Listen for project-changed DOM event (re-render when project switches)
  document.addEventListener('project-changed', () => {
    // Defer to next tick so activeProject() reflects new value
    setTimeout(() => {
      const project = activeProject();
      if (project) loadGSD(project);
    }, 50);
  });

  // Schedule DOM discovery after Arrow.js renders (06-04 pattern: getElementById, not ref)
  setTimeout(() => {
    contentEl = document.getElementById('gsd-viewer-content');
    if (contentEl) {
      const project = activeProject();
      if (project) loadGSD(project);
    }
  }, 0);

  /**
   * Handle checkbox click events (D-01: write-back).
   * Delegates from container to avoid per-checkbox listeners.
   */
  function handleClick(e) {
    if (!e.target.classList.contains('task-checkbox')) return;
    const line = parseInt(e.target.dataset.line, 10);
    if (isNaN(line) || line < 0) return;
    const checked = e.target.checked;
    if (!currentPath) return;
    invoke('write_checkbox', { path: currentPath, line, checked }).catch(err => {
      console.error('[efxmux] write_checkbox failed:', err);
      // Revert checkbox visual state on error
      e.target.checked = !checked;
    });
  }

  return html`
    <div
      class="gsd-viewer"
      @click="${handleClick}"
      style="height: 100%; overflow-y: auto; padding: 16px;"
    >
      <div
        id="gsd-viewer-content"
        class="gsd-viewer-content"
        style="color: var(--text); font-size: 14px; line-height: 1.6;"
      >
        <div style="color: var(--text-muted); font-size: 13px;">Loading GSD...</div>
      </div>
    </div>
  `;
};
