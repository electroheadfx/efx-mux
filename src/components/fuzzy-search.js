// fuzzy-search.js -- Ctrl+P fuzzy project search overlay (Phase 5)
import { html } from '@arrow-js/core';
import { reactive } from '@arrow-js/core';
import { getProjects, switchProject, getGitStatus } from '../state-manager.js';

const state = reactive({
  visible: false,
  query: '',
  projects: /** @type {Array<{path: string, name: string, agent: string, gsd_file?: string, server_cmd?: string}>} */ ([]),
  selectedIndex: 0,
  gitBranches: /** @type {Record<string, string>} */ ({}),
});

/** Fuzzy match: case-insensitive substring search */
function fuzzyMatch(projects, query) {
  if (!query.trim()) return projects;
  const q = query.toLowerCase();
  return projects.filter(p => p.name.toLowerCase().includes(q));
}

function openSearch() {
  state.visible = true;
  state.query = '';
  state.selectedIndex = 0;
  loadProjects();
}

function closeSearch() {
  state.visible = false;
  state.query = '';
  state.selectedIndex = 0;
}

async function loadProjects() {
  try {
    const projects = await getProjects();
    state.projects = projects;
    // Fetch git branches in parallel
    const branches = await Promise.allSettled(
      projects.map(async (p) => {
        try {
          const status = await getGitStatus(p.path);
          return { name: p.name, branch: status.branch };
        } catch {
          return { name: p.name, branch: '' };
        }
      })
    );
    for (const r of branches) {
      if (r.status === 'fulfilled') {
        state.gitBranches[r.value.name] = r.value.branch;
      }
    }
  } catch (err) {
    console.warn('[efxmux] Fuzzy search: failed to load projects:', err);
  }
}

async function selectCurrent() {
  const results = fuzzyMatch(state.projects, state.query);
  if (results.length === 0) return;
  const project = results[state.selectedIndex];
  if (!project) return;
  try {
    await switchProject(project.name);
  } catch (err) {
    console.warn('[efxmux] Fuzzy search: failed to switch project:', err);
  }
  closeSearch();
}

/** Global Ctrl+P handler */
function handleGlobalKeydown(e) {
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    openSearch();
    return;
  }
  if (!state.visible) return;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeSearch();
      break;
    case 'ArrowDown':
      e.preventDefault();
      {
        const results = fuzzyMatch(state.projects, state.query);
        state.selectedIndex = Math.min(state.selectedIndex + 1, results.length - 1);
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
      break;
    case 'Enter':
      e.preventDefault();
      selectCurrent();
      break;
  }
}

document.addEventListener('keydown', handleGlobalKeydown);

// Also listen for open-fuzzy-search events from main.js
document.addEventListener('open-fuzzy-search', openSearch);

const SearchResult = (project, index) => {
  const isSelected = () => state.selectedIndex === index;
  const branch = () => state.gitBranches[project.name] || '';

  return html`
    <div
      style="${() => `display: flex; align-items: center; padding: 8px 16px; font-size: 14px; color: var(--text-bright); background: ${isSelected() ? 'rgba(37, 138, 209, 0.12)' : 'transparent'}; cursor: pointer; min-height: 36px;`}"
      data-index="${index}"
      @click="${() => {
        state.selectedIndex = index;
        selectCurrent();
      }}"
      @mouseenter="${() => { state.selectedIndex = index; }}"
    >
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${project.name}
      </span>
      ${branch() ? html`
        <span style="font-size: 11px; color: var(--accent); margin-left: 16px; flex-shrink: 0;">
          ${branch()}
        </span>
      ` : ''}
    </div>
  `;
};

export const FuzzySearch = () => {
  if (!state.visible) return html``;

  const results = () => fuzzyMatch(state.projects, state.query);

  return html`
    <div
      style="
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.3);
        z-index: 100;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 20vh;
        animation: fadeInSearch 100ms ease-out;
      "
      @click="${closeSearch}"
    >
      <style>
        @keyframes fadeInSearch {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      </style>
      <div
        style="
          width: 480px;
          max-height: 60vh;
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: 4px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          z-index: 101;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: fadeInSearch 100ms ease-out;
        "
        @click="${(e) => { e.stopPropagation(); }}"
      >
        <div style="
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        ">
          <span style="color: var(--accent); margin-right: 8px; font-size: 16px;">></span>
          <input
            type="text"
            placeholder="Switch to project..."
            autofocus
            style="
              flex: 1;
              background: transparent;
              border: none;
              outline: none;
              font-size: 16px;
              color: var(--text-bright);
              caret-color: var(--accent);
            "
            value="${() => state.query}"
            @input="${(e) => {
              state.query = e.currentTarget.value;
              state.selectedIndex = 0;
            }}"
          />
        </div>

        <div style="overflow-y: auto; max-height: 360px;">
          ${results().length === 0 ? html`
            <div style="
              padding: 16px;
              font-size: 14px;
              color: var(--text);
              text-align: center;
            ">No matching projects</div>
          ` : () => results().map((p, i) => SearchResult(p, i))}
        </div>
      </div>
    </div>
  `;
};
