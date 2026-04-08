// project-modal.js -- Add Project modal (Phase 5)
import { html } from '@arrow-js/core';
import { reactive } from '@arrow-js/core';
import { addProject, getProjects, switchProject } from '../state-manager.js';

const TNS = window.__TAURI__.core;

/** @typedef {{ path: string, name: string, agent: string, gsd_file?: string, server_cmd?: string }} ProjectEntry */

const state = reactive({
  visible: false,
  directory: '',
  name: '',
  agent: 'claude',
  gsdFile: '',
  serverCmd: '',
  error: null,
  isFirstRun: false,
});

/**
 * Open the modal.
 * @param {{ firstRun?: boolean }} opts
 */
export function openProjectModal(opts = {}) {
  state.visible = true;
  state.isFirstRun = !!opts.firstRun;
  state.directory = '';
  state.name = '';
  state.agent = 'claude';
  state.gsdFile = '';
  state.serverCmd = '';
  state.error = null;
}

export function closeProjectModal() {
  if (state.isFirstRun) return; // First-run: only close via X button
  state.visible = false;
}

/** Escape key listener — registered once per modal open */
function handleKeydown(e) {
  if (e.key === 'Escape' && state.visible) {
    e.preventDefault();
    closeProjectModal();
    document.removeEventListener('keydown', handleKeydown);
  }
}

/** Backdrop click to dismiss (not first-run) */
function handleBackdropClick() {
  if (!state.isFirstRun) {
    closeProjectModal();
  }
}

const isValid = () => state.directory.trim().length > 0 && state.name.trim().length > 0;

async function handleSubmit() {
  if (!isValid()) return;
  state.error = null;
  try {
    /** @type {ProjectEntry} */
    const entry = {
      path: state.directory.trim(),
      name: state.name.trim(),
      agent: state.agent,
      gsd_file: state.gsdFile.trim() || undefined,
      server_cmd: state.serverCmd.trim() || undefined,
    };
    await addProject(entry);

    // Notify sidebar to refresh its project list BEFORE switching
    document.dispatchEvent(new CustomEvent('project-added', { detail: { entry } }));

    // Switch to the new project via state-manager (sets Rust active field + emits project-changed)
    await switchProject(entry.name);

    state.visible = false;
    document.removeEventListener('keydown', handleKeydown);
  } catch (err) {
    state.error = err?.toString() || 'Failed to add project';
  }
}

async function handleBrowse() {
  try {
    // Use invoke directly -- dynamic import('@tauri-apps/plugin-dialog') fails
    // in no-bundler ESM because the bare specifier is not in the import map.
    const selected = await TNS.invoke('plugin:dialog|open', {
      options: { directory: true, multiple: false },
    });
    if (selected) {
      state.directory = selected;
      // Auto-fill name from directory basename if empty
      if (!state.name) {
        const parts = selected.split('/');
        state.name = parts[parts.length - 1] || '';
      }
      // Auto-detect GSD planning directory
      try {
        const entries = await TNS.invoke('list_directory', { path: selected });
        const hasPlanningDir = entries.some(e => e.is_dir && e.name === '.planning');
        if (hasPlanningDir) {
          // Look for a roadmap or plan file inside .planning/
          const planningEntries = await TNS.invoke('list_directory', { path: selected + '/.planning' });
          const roadmap = planningEntries.find(e => !e.is_dir && /^(ROADMAP|PLAN)\.md$/i.test(e.name));
          if (roadmap) {
            state.gsdFile = '.planning/' + roadmap.name;
          }
        }
      } catch {
        // Silently ignore -- GSD detection is optional
      }
    }
  } catch (err) {
    console.warn('[efxmux] Directory picker failed:', err);
  }
}

export const ProjectModal = () => {
  return html`
    ${() => {
      if (!state.visible) return html``;

      // Register escape key listener when visible
      document.removeEventListener('keydown', handleKeydown);
      document.addEventListener('keydown', handleKeydown);

      return html`
    <div
      style="
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 100;
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 150ms ease-out;
      "
      @click="${handleBackdropClick}"
    >
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      </style>
      <div
        style="
          width: 480px;
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: 4px;
          z-index: 101;
          animation: fadeIn 150ms ease-out;
        "
        @click="${(e) => { e.stopPropagation(); }}"
      >
        <div style="
          display: flex;
          align-items: center;
          padding: 16px 24px 0;
        ">
          <div style="flex: 1; font-size: 16px; color: var(--text-bright);">Add Project</div>
          <div
            style="
              width: 24px; height: 24px;
              display: flex; align-items: center; justify-content: center;
              font-size: 16px; color: var(--text); cursor: pointer;
            "
            title="Close"
            @click="${() => {
              closeProjectModal();
              document.removeEventListener('keydown', handleKeydown);
            }}"
          >\u2715</div>
        </div>

        <form
          style="padding: 0 24px; margin-top: 16px;"
          @submit="${(e) => { e.preventDefault(); handleSubmit(); }}"
        >
          <div style="margin-bottom: 16px;">
            <label style="
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: var(--text);
              margin-bottom: 4px;
            ">Directory</label>
            <div style="display: flex;">
              <input
                type="text"
                placeholder="/path/to/project"
                style="
                  flex: 1;
                  height: 32px;
                  padding: 0 8px;
                  font-size: 14px;
                  background: var(--bg);
                  border: 1px solid var(--border);
                  border-radius: 2px 0 0 2px;
                  color: var(--text-bright);
                  outline: none;
                "
                value="${() => state.directory}"
                @input="${(e) => { state.directory = e.currentTarget.value; }}"
                @focus="${(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}"
                @blur="${(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}"
              />
              <button
                type="button"
                style="
                  width: 32px;
                  height: 32px;
                  background: var(--bg);
                  border: 1px solid var(--border);
                  border-left: none;
                  border-radius: 0 2px 2px 0;
                  color: var(--text);
                  cursor: pointer;
                  font-size: 14px;
                  flex-shrink: 0;
                "
                title="Browse"
                @click="${handleBrowse}"
              >[...]</button>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: var(--text);
              margin-bottom: 4px;
            ">Name</label>
            <input
              type="text"
              placeholder="project-name"
              style="
                width: 100%;
                height: 32px;
                padding: 0 8px;
                font-size: 14px;
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 2px;
                color: var(--text-bright);
                outline: none;
                box-sizing: border-box;
              "
              value="${() => state.name}"
              @input="${(e) => { state.name = e.currentTarget.value; }}"
              @focus="${(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}"
              @blur="${(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}"
            />
          </div>

          <div style="margin-bottom: 16px;">
            <label style="
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: var(--text);
              margin-bottom: 4px;
            ">Agent</label>
            <select
              style="
                width: 100%;
                height: 32px;
                padding: 0 8px;
                font-size: 14px;
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 2px;
                color: var(--text-bright);
                outline: none;
                box-sizing: border-box;
              "
              value="${() => state.agent}"
              @change="${(e) => { state.agent = e.currentTarget.value; }}"
            >
              <option value="claude">claude</option>
              <option value="opencode">opencode</option>
              <option value="bash">bash</option>
            </select>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: var(--text);
              margin-bottom: 4px;
            ">GSD File</label>
            <input
              type="text"
              placeholder="Optional .md path"
              style="
                width: 100%;
                height: 32px;
                padding: 0 8px;
                font-size: 14px;
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 2px;
                color: var(--text-bright);
                outline: none;
                box-sizing: border-box;
              "
              value="${() => state.gsdFile}"
              @input="${(e) => { state.gsdFile = e.currentTarget.value; }}"
              @focus="${(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}"
              @blur="${(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}"
            />
          </div>

          <div style="margin-bottom: 8px;">
            <label style="
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: var(--text);
              margin-bottom: 4px;
            ">Server Command</label>
            <input
              type="text"
              placeholder="Optional, e.g. npm run dev"
              style="
                width: 100%;
                height: 32px;
                padding: 0 8px;
                font-size: 14px;
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 2px;
                color: var(--text-bright);
                outline: none;
                box-sizing: border-box;
              "
              value="${() => state.serverCmd}"
              @input="${(e) => { state.serverCmd = e.currentTarget.value; }}"
              @focus="${(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}"
              @blur="${(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}"
            />
          </div>

          ${() => state.error ? html`
            <div style="
              font-size: 12px;
              color: #dc322f;
              margin-bottom: 8px;
            ">${() => state.error}</div>
          ` : ''}

          <div style="
            padding: 16px 0 24px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          ">
            ${() => !state.isFirstRun ? html`
              <button
                type="button"
                style="
                  background: transparent;
                  border: 1px solid var(--border);
                  color: var(--text);
                  padding: 8px 16px;
                  border-radius: 2px;
                  cursor: pointer;
                  font-size: 14px;
                "
                @click="${() => {
                  closeProjectModal();
                  document.removeEventListener('keydown', handleKeydown);
                }}"
              >Cancel Add</button>
            ` : ''}
            <button
              type="submit"
              disabled="${() => !isValid()}"
              style="${() => `background: var(--accent); border: none; color: #ffffff; padding: 8px 16px; border-radius: 2px; cursor: ${isValid() ? 'pointer' : 'not-allowed'}; font-size: 14px; opacity: ${isValid() ? 1 : 0.4};`}"
            >Add Project</button>
          </div>
        </form>
      </div>
    </div>
  `;
    }}
  `;
};
