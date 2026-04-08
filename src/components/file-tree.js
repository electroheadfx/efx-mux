// file-tree.js -- Keyboard-navigable file tree (D-07, D-08, PANEL-05, PANEL-06)
// Loads directory contents via list_directory Rust command.
// Dispatches file-opened CustomEvent for main.js to handle.

import { html, reactive } from '@arrow-js/core';

const { invoke } = window.__TAURI__.core;

/**
 * FileTree component.
 * Renders a navigable file tree for the active project directory.
 * Keyboard: ArrowUp/Down to select, Enter to open, Backspace to go up.
 *
 * @param {() => object|null} activeProject - Reactive getter returning active project data
 * @returns Arrow.js html template
 */
export const FileTree = (activeProject) => {
  const state = reactive({
    /** @type {Array<{name: string, path: string, is_dir: boolean}>} */
    entries: [],
    selectedIndex: 0,
    currentPath: '',
    loaded: false,
  });

  /**
   * Load directory contents from Rust backend.
   * @param {string} path - Absolute directory path
   */
  async function loadDir(path) {
    try {
      const project = activeProject();
      const entries = await invoke('list_directory', { path, projectRoot: project?.path || null });
      state.entries = entries;
      state.currentPath = path;
      state.selectedIndex = 0;
      state.loaded = true;
    } catch (err) {
      console.error('[efxmux] list_directory failed:', err);
      state.entries = [];
      state.loaded = true;
    }
  }

  /**
   * Open a file or navigate into a directory.
   * @param {{ name: string, path: string, is_dir: boolean }} entry
   */
  function openEntry(entry) {
    if (entry.is_dir) {
      loadDir(entry.path);
    } else {
      // Dispatch file-opened event for main.js (D-08, PANEL-06)
      document.dispatchEvent(new CustomEvent('file-opened', {
        detail: { path: entry.path, name: entry.name }
      }));
    }
  }

  /**
   * Keyboard navigation handler (PANEL-05).
   * ArrowUp/Down: move selection
   * Enter: open selected entry
   * Backspace: navigate to parent directory
   */
  function handleKeydown(e) {
    if (!state.loaded || state.entries.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        state.selectedIndex = Math.min(state.selectedIndex + 1, state.entries.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (state.entries[state.selectedIndex]) {
          openEntry(state.entries[state.selectedIndex]);
        }
        break;
      case 'Backspace': {
        e.preventDefault();
        const project = activeProject();
        const rootPath = project?.path;
        const parent = state.currentPath.split('/').slice(0, -1).join('/');
        // Only navigate up if parent is still within (or equal to) the project root
        if (parent && rootPath && parent.startsWith(rootPath)) {
          loadDir(parent);
        } else if (parent && !rootPath) {
          // No project context, allow navigation (fallback)
          loadDir(parent);
        }
        break;
      }
    }
  }

  // Listen for project-changed DOM event
  document.addEventListener('project-changed', () => {
    setTimeout(() => {
      const project = activeProject();
      if (project && project.path) loadDir(project.path);
    }, 50);
  });

  // Schedule initial load after Arrow.js renders (getElementById pattern, not ref)
  setTimeout(() => {
    const project = activeProject();
    if (project && project.path) loadDir(project.path);
  }, 0);

  return html`
    <div
      class="file-tree"
      tabindex="0"
      @keydown="${handleKeydown}"
      style="
        height: 100%;
        overflow-y: auto;
        padding: 4px 0;
        outline: none;
        background: var(--bg-base);
      "
    >
      ${() => {
        if (!state.loaded) {
          return html`<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Loading...</div>`;
        }
        if (state.entries.length === 0) {
          return html`<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Empty directory</div>`;
        }
        return state.entries.map((entry, i) => html`
          <div
            style="${() => `display: flex; align-items: center; padding: 4px 12px; cursor: pointer; font-size: 13px; color: ${state.selectedIndex === i ? 'var(--text-bright)' : 'var(--text)'}; background: ${state.selectedIndex === i ? 'var(--bg-raised)' : 'transparent'}; gap: 6px;`}"
            @click="${() => { state.selectedIndex = i; openEntry(entry); }}"
            @mouseenter="${() => { state.selectedIndex = i; }}"
          >
            <span style="color: var(--accent); font-size: 11px; width: 14px; flex-shrink: 0; font-family: monospace;">
              ${entry.is_dir ? '/' : ' '}
            </span>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${entry.name}
            </span>
          </div>
        `);
      }}
    </div>
  `;
};
