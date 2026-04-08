// sidebar.js -- Project sidebar (Phase 5: full rewrite replacing Phase 1 placeholder)
import { html } from '@arrow-js/core';
import { reactive } from '@arrow-js/core';
import { getProjects, getActiveProject, getGitStatus, switchProject } from '../state-manager.js';
import { openProjectModal } from './project-modal.js';

/** @typedef {{ branch: string, modified: number, staged: number, untracked: number }} GitData */

const { invoke } = window.__TAURI__.core;

// Reactive sidebar state
const state = reactive({
  projects: /** @type {Array<{path: string, name: string, agent: string, gsd_file?: string, server_cmd?: string}>} */ ([]),
  activeProject: /** @type {string|null} */ (null),
  collapsed: false,
  gitData: /** @type {Record<string, GitData>} */ ({}),
  gitSectionOpen: true,
  /** @type {string|null} */
  removeTarget: null,
  showModal: false,
  selectedIndex: -1,
  /** @type {Array<{name: string, path: string, status: string}>} */
  gitFiles: [],
});

/**
 * Load projects + git status on startup.
 * Listen for project-changed events to re-sync.
 */
export async function initSidebar() {
  try {
    const [projects, active] = await Promise.all([getProjects(), getActiveProject()]);
    state.projects = projects;
    state.activeProject = active;
    // Auto-open modal on first run
    if (projects.length === 0) {
      openProjectModal();
    }
    // Fetch git status for all projects in parallel
    await refreshAllGitStatus();
  } catch (err) {
    console.warn('[efxmux] Failed to load projects:', err);
  }

  // Re-sync when project changes
  document.addEventListener('project-changed', async (e) => {
    state.activeProject = e.detail.name;
    await refreshAllGitStatus();
  });

  // Listen for open-modal events (from "+" button)
  document.addEventListener('open-add-project', () => {
    openProjectModal();
  });
}

/** Refresh git status for all projects. */
async function refreshAllGitStatus() {
  const entries = await Promise.all(
    state.projects.map(async (p) => {
      try {
        const git = await getGitStatus(p.path);
        return { name: p.name, git };
      } catch {
        return { name: p.name, git: { branch: '', modified: 0, staged: 0, untracked: 0 } };
      }
    })
  );
  // Full reassignment to trigger Arrow.js reactive proxy (not in-place mutation)
  const newGitData = { ...state.gitData };
  for (const { name, git } of entries) {
    newGitData[name] = git;
  }
  state.gitData = newGitData;

  // Fetch file-level git data for the active project
  await refreshGitFiles();
}

/** Refresh file-level git entries for the active project. */
async function refreshGitFiles() {
  const activeProject = state.projects.find(p => p.name === state.activeProject);
  if (!activeProject) {
    state.gitFiles = [];
    return;
  }
  try {
    const files = await invoke('get_git_files', { path: activeProject.path });
    state.gitFiles = files;
  } catch (err) {
    console.warn('[efxmux] Failed to fetch git files:', err);
    state.gitFiles = [];
  }
}

/**
 * @param {{ name: string, gsd_file?: string, server_cmd?: string }} project
 */
function getGSDFile(project) {
  return project.gsd_file || 'PLAN.md';
}

// ============================================================================
// Components
// ============================================================================

const ProjectRow = (project, index) => {
  const isActive = () => state.activeProject === project.name;
  const git = () => state.gitData[project.name] || { branch: '', modified: 0, staged: 0, untracked: 0 };

  return html`
    <div
      class="${() => 'sidebar-project-row' + (isActive() ? ' active' : '')}"
      style="${() => `display: flex; align-items: center; padding: 4px 8px; min-height: 32px; cursor: pointer; color: ${isActive() ? 'var(--text-bright)' : 'var(--text)'}; background: ${isActive() ? 'rgba(37, 138, 209, 0.08)' : 'transparent'}; border-left: ${isActive() ? '3px solid var(--accent)' : '3px solid transparent'}; padding-left: ${isActive() ? '5px' : '8px'};`}"
      title="${project.path}"
      data-index="${index}"
      @click="${async () => {
        if (isActive()) return;
        try {
          await switchProject(project.name);
        } catch (err) {
          console.warn('[efxmux] Failed to switch project:', err);
        }
      }}"
      @mouseenter="${(e) => {
        if (!isActive()) e.currentTarget.style.background = 'var(--bg-raised)';
      }}"
      @mouseleave="${(e) => {
        if (!isActive()) e.currentTarget.style.background = 'transparent';
      }}"
    >
      <span style="flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${project.name}
      </span>
      ${git().branch ? html`
        <span style="font-size: 11px; color: var(--accent); margin-left: 8px; flex-shrink: 0;">
          ${git().branch}
        </span>
      ` : ''}
    </div>
  `;
};

const CollapsedIcon = (project, index) => {
  const isActive = () => state.activeProject === project.name;
  const initial = project.name.charAt(0).toUpperCase();
  return html`
    <div
      style="${() => `width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: ${isActive() ? 'var(--accent)' : 'var(--text)'}; cursor: pointer;`}"
      title="${project.name}"
      data-index="${index}"
      @click="${async () => {
        state.collapsed = false;
        try {
          await switchProject(project.name);
        } catch (err) {
          console.warn('[efxmux] Failed to switch project:', err);
        }
      }}"
    >${initial}</div>
  `;
};

const GitFileRow = (file) => {
  const statusChar = file.status; // 'M', 'S', 'U'
  const statusColor = {
    'M': '#b58900',
    'S': '#859900',
    'U': '#6c7b83',
  }[statusChar] || 'var(--text)';

  return html`
    <div
      style="
        display: flex;
        align-items: center;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--text);
        cursor: pointer;
      "
      @click="${() => {
        document.dispatchEvent(new CustomEvent('open-diff', { detail: { path: file.path } }));
      }}"
      @mouseenter="${(e) => { e.currentTarget.style.background = 'var(--bg-raised)'; }}"
      @mouseleave="${(e) => { e.currentTarget.style.background = 'transparent'; }}"
    >
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${file.name}
      </span>
      <span style="${`color: ${statusColor}; margin-left: 8px; font-size: 11px; flex-shrink: 0;`}">
        ${statusChar}
      </span>
    </div>
  `;
};

/** Remove project confirmation dialog */
const RemoveDialog = () => {
  if (!state.removeTarget) return html``;
  const name = state.removeTarget;

  return html`
    <div
      style="
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 101;
        display: flex; align-items: center; justify-content: center;
      "
      @click="${() => { state.removeTarget = null; }}"
    >
      <div
        style="
          width: 360px;
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 0 0 24px;
        "
        @click="${(e) => { e.stopPropagation(); }}"
      >
        <div style="padding: 16px 24px 0; font-size: 14px; color: var(--text-bright);">
          Remove ${name}
        </div>
        <div style="
          padding: 0 24px;
          margin-top: 12px;
          font-size: 14px;
          color: var(--text);
          line-height: 1.5;
        ">
          Remove this project from the sidebar?<br/>
          The project files will not be deleted.
        </div>
        <div style="padding: 16px 24px 0; display: flex; justify-content: flex-end; gap: 8px;">
          <button
            style="
              background: transparent;
              border: 1px solid var(--border);
              color: var(--text);
              padding: 8px 16px;
              border-radius: 2px;
              cursor: pointer;
              font-size: 14px;
            "
            @click="${() => { state.removeTarget = null; }}"
          >Cancel</button>
          <button
            style="
              background: #dc322f;
              border: none;
              color: #ffffff;
              padding: 8px 16px;
              border-radius: 2px;
              cursor: pointer;
              font-size: 14px;
            "
            @click="${async () => {
              const { removeProject } = await import('../state-manager.js');
              await removeProject(name);
              state.removeTarget = null;
              // Re-sync project list
              const projects = await getProjects();
              state.projects = projects;
              const active = await getActiveProject();
              state.activeProject = active;
            }}"
          >Remove Project</button>
        </div>
      </div>
    </div>
  `;
};

// ============================================================================
// Main Sidebar component
// ============================================================================

/**
 * @param {{ collapsed: { value: () => boolean } }} props
 */
export const Sidebar = ({ collapsed }) => {
  // Initialize sidebar data on mount
  initSidebar();
  // Sync collapsed state with reactive
  state.collapsed = collapsed.value();

  const git = () => {
    if (!state.activeProject) return { branch: '', modified: 0, staged: 0, untracked: 0 };
    return state.gitData[state.activeProject] || { branch: '', modified: 0, staged: 0, untracked: 0 };
  };

  const gitFiles = () => {
    return state.gitFiles;
  };

  const totalChanges = () => {
    const g = git();
    return (g.modified || 0) + (g.staged || 0) + (g.untracked || 0);
  };

  return html`
    <aside
      class="${() => `sidebar${state.collapsed ? ' collapsed' : ''}`}"
      aria-label="Sidebar"
    >
      ${RemoveDialog()}

      <div class="sidebar-content">
        ${state.collapsed ? html`
          <div class="sidebar-icons" style="
            display: flex;
            flex-direction: column;
            gap: 8px;
            align-items: center;
            padding-top: 8px;
          ">
            ${() => state.projects.map((p, i) => CollapsedIcon(p, i))}
            <div style="height: 8px;"></div>
            <div
              style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: var(--text); cursor: pointer;"
              title="Add project"
              aria-label="Add project"
              @click="${() => { openProjectModal(); }}"
            >+</div>
          </div>
        ` : html`
          <div class="sidebar-content-full" style="display: flex; flex-direction: column; height: 100%;">
            <div style="
              display: flex;
              align-items: center;
              padding: 4px 0 8px;
              border-bottom: 1px solid var(--border);
              margin-bottom: 8px;
            ">
              <div style="
                flex: 1;
                color: var(--text-bright);
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              ">EFXMUX</div>
              <div
                style="font-size: 16px; color: var(--text); cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;"
                title="Add project"
                aria-label="Add project"
                @click="${() => { openProjectModal(); }}"
              >+</div>
            </div>

            <div style="
              font-size: 11px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--text);
              padding: 0 0 4px;
            ">PROJECTS</div>

            <div style="flex: 1; overflow-y: auto;">
              ${state.projects.length === 0 ? html`
                <div style="padding: 16px 8px; font-size: 14px; color: var(--text); text-align: center;">
                  No projects yet
                </div>
              ` : () => state.projects.map((p, i) => ProjectRow(p, i))}
            </div>

            <div style="
              border-top: 1px solid var(--border);
              margin-top: 8px;
              padding-top: 8px;
            ">
              <div style="
                display: flex;
                align-items: center;
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text);
                padding-bottom: 4px;
              ">
                <span style="flex: 1;">GIT CHANGES</span>
                <div
                  style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--text); cursor: pointer;"
                  title="Refresh git status"
                  aria-label="Refresh git status"
                  @click="${async () => {
                    await refreshAllGitStatus();
                  }}"
                  @mouseenter="${(e) => { e.currentTarget.style.color = 'var(--accent)'; }}"
                  @mouseleave="${(e) => { e.currentTarget.style.color = 'var(--text)'; }}"
                >\u21BB</div>
              </div>

              ${git().branch ? html`
                <div style="padding: 2px 8px; font-size: 11px; color: var(--accent);">
                  ${git().branch}
                </div>
              ` : ''}

              <div style="display: flex; gap: 8px; padding: 4px 8px; flex-wrap: wrap;">
                ${git().modified > 0 ? html`
                  <span style="font-size: 12px; color: #b58900;">M ${git().modified}</span>
                ` : ''}
                ${git().staged > 0 ? html`
                  <span style="font-size: 12px; color: #859900;">S ${git().staged}</span>
                ` : ''}
                ${git().untracked > 0 ? html`
                  <span style="font-size: 12px; color: #6c7b83;">U ${git().untracked}</span>
                ` : ''}
                ${totalChanges() === 0 ? html`
                  <span style="font-size: 12px; color: var(--text);">No changes</span>
                ` : ''}
              </div>

              ${gitFiles().length > 0 ? html`
                <div style="max-height: 120px; overflow-y: auto;">
                  ${gitFiles().map(f => GitFileRow(f))}
                </div>
              ` : ''}
            </div>
          </div>
        `}
      </div>
    </aside>
  `;
};
