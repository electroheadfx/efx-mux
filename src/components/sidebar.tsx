// sidebar.tsx -- Project sidebar with projects, git status, git files, collapsed mode
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Restyled with Lucide icons, status dots, git badges (Phase 9)

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { Circle, GitBranch, Plus, RotateCw, X } from 'lucide-preact';
import {
  projects,
  activeProjectName,
  sidebarCollapsed,
  getGitStatus,
  switchProject,
  getProjects,
  getActiveProject,
  removeProject,
} from '../state-manager';
import type { ProjectEntry, GitData } from '../state-manager';
import { openProjectModal } from './project-modal';

// ---------------------------------------------------------------------------
// Local signals for sidebar-only state
// ---------------------------------------------------------------------------

const gitData = signal<Record<string, GitData>>({});
const gitFiles = signal<Array<{ name: string; path: string; status: string }>>([]);
const gitSectionOpen = signal(true);
const removeTarget = signal<string | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Refresh git status for all projects. */
async function refreshAllGitStatus(): Promise<void> {
  const entries = await Promise.all(
    projects.value.map(async (p) => {
      try {
        const git = await getGitStatus(p.path);
        return { name: p.name, git };
      } catch {
        return { name: p.name, git: { branch: '', modified: 0, staged: 0, untracked: 0 } };
      }
    })
  );
  const newGitData: Record<string, GitData> = { ...gitData.value };
  for (const { name, git } of entries) {
    newGitData[name] = git;
  }
  gitData.value = newGitData;

  // Fetch file-level git data for the active project
  await refreshGitFiles();
}

/** Refresh file-level git entries for the active project. */
async function refreshGitFiles(): Promise<void> {
  const activeProject = projects.value.find(p => p.name === activeProjectName.value);
  if (!activeProject) {
    gitFiles.value = [];
    return;
  }
  try {
    const files = await invoke<Array<{ name: string; path: string; status: string }>>('get_git_files', { path: activeProject.path });
    gitFiles.value = files;
  } catch (err) {
    console.warn('[efxmux] Failed to fetch git files:', err);
    gitFiles.value = [];
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProjectRow({ project, index }: { project: ProjectEntry; index: number }) {
  const isActive = activeProjectName.value === project.name;
  const git = gitData.value[project.name] || { branch: '', modified: 0, staged: 0, untracked: 0 };

  return (
    <div
      class={`group flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer ${
        isActive
          ? 'bg-bg-raised'
          : 'hover:bg-bg-raised/50'
      }`}
      title={project.path}
      data-index={index}
      onClick={async () => {
        if (isActive) return;
        try {
          await switchProject(project.name);
        } catch (err) {
          console.warn('[efxmux] Failed to switch project:', err);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        removeTarget.value = project.name;
      }}
    >
      {/* Status dot */}
      {isActive ? (
        <Circle size={8} fill="currentColor" class="text-success shrink-0" />
      ) : (
        <Circle size={8} class="text-text-muted shrink-0" />
      )}

      {/* Project info */}
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-text-bright truncate">{project.name}</div>
        <div class="text-[11px] text-text truncate">{project.path}</div>
      </div>

      {/* Git branch badge */}
      {git.branch && (
        <span class="flex items-center gap-1 text-[11px] text-accent px-1.5 py-0.5 bg-accent/10 rounded shrink-0">
          <GitBranch size={10} />
          {git.branch}
        </span>
      )}

      {/* Remove button */}
      <span
        class="opacity-0 group-hover:opacity-100 cursor-pointer shrink-0 text-text hover:text-danger transition-opacity"
        title="Remove project"
        onClick={(e) => {
          e.stopPropagation();
          removeTarget.value = project.name;
        }}
      >
        <X size={12} />
      </span>
    </div>
  );
}

function CollapsedIcon({ project, index }: { project: ProjectEntry; index: number }) {
  const isActive = activeProjectName.value === project.name;
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <div
      class={`relative w-6 h-6 flex items-center justify-center text-xs cursor-pointer ${
        isActive ? 'text-accent' : 'text-text'
      }`}
      title={project.name}
      data-index={index}
      onClick={async () => {
        sidebarCollapsed.value = false;
        try {
          await switchProject(project.name);
        } catch (err) {
          console.warn('[efxmux] Failed to switch project:', err);
        }
      }}
    >
      {initial}
      {isActive && (
        <Circle size={6} fill="currentColor" class="text-success absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
      )}
    </div>
  );
}

function GitFileRow({ file }: { file: { name: string; path: string; status: string } }) {
  const badgeClass: Record<string, string> = {
    'M': 'bg-warning/20 text-warning',
    'S': 'bg-success/20 text-success',
    'U': 'bg-accent/20 text-accent',
  };
  const cls = badgeClass[file.status] || 'bg-bg-raised text-text';

  return (
    <div
      class="flex items-center px-2 py-1 text-xs text-text cursor-pointer hover:bg-bg-raised"
      onClick={() => {
        document.dispatchEvent(new CustomEvent('open-diff', { detail: { path: file.path } }));
      }}
    >
      <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {file.name}
      </span>
      <span class={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ml-2 shrink-0 ${cls}`}>
        {file.status}
      </span>
    </div>
  );
}

function RemoveDialog() {
  if (!removeTarget.value) return null;
  const name = removeTarget.value;

  return (
    <div
      class="fixed inset-0 bg-black/50 z-[101] flex items-center justify-center"
      onClick={() => { removeTarget.value = null; }}
    >
      <div
        class="w-[360px] bg-bg-raised border border-border rounded pb-6"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div class="px-6 pt-4 text-sm text-text-bright">
          Remove {name}
        </div>
        <div class="px-6 mt-3 text-sm text-text leading-relaxed">
          Remove this project from the sidebar?<br />
          The project files will not be deleted.
        </div>
        <div class="px-6 pt-4 flex justify-end gap-2">
          <button
            class="bg-transparent border border-border text-text px-4 py-2 rounded-sm cursor-pointer text-sm"
            onClick={() => { removeTarget.value = null; }}
          >Cancel</button>
          <button
            class="bg-danger border-none text-white px-4 py-2 rounded-sm cursor-pointer text-sm"
            onClick={async () => {
              await removeProject(name);
              removeTarget.value = null;
              // Re-sync project list
              const updatedProjects = await getProjects();
              projects.value = updatedProjects;
              const active = await getActiveProject();
              activeProjectName.value = active;
            }}
          >Remove Project</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const git = computed(() => {
    if (!activeProjectName.value) return { branch: '', modified: 0, staged: 0, untracked: 0 };
    return gitData.value[activeProjectName.value] || { branch: '', modified: 0, staged: 0, untracked: 0 };
  });

  const totalChanges = computed(() => {
    const g = git.value;
    return (g.modified || 0) + (g.staged || 0) + (g.untracked || 0);
  });

  // Initialize sidebar data on mount
  useEffect(() => {
    async function init() {
      try {
        const [loadedProjects, active] = await Promise.all([getProjects(), getActiveProject()]);
        projects.value = loadedProjects;
        activeProjectName.value = active;
        // Note: Zero-project detection is handled by the wizard in main.tsx initProjects().
        // The sidebar must NOT open modals -- it only displays the project list.
        await refreshAllGitStatus();
      } catch (err) {
        console.warn('[efxmux] Failed to load projects:', err);
      }
    }
    init();

    // Re-sync when project changes
    function handleProjectChanged(e: Event) {
      const detail = (e as CustomEvent).detail;
      activeProjectName.value = detail.name;
      refreshAllGitStatus();
    }

    // Refresh project list when a new project is added
    async function handleProjectAdded() {
      try {
        const updatedProjects = await getProjects();
        projects.value = updatedProjects;
      } catch (err) {
        console.warn('[efxmux] Failed to refresh projects after add:', err);
      }
    }

    // Listen for open-modal events (from "+" button)
    function handleOpenAddProject() {
      openProjectModal();
    }

    document.addEventListener('project-changed', handleProjectChanged);
    document.addEventListener('project-added', handleProjectAdded);
    document.addEventListener('open-add-project', handleOpenAddProject);

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
      document.removeEventListener('project-added', handleProjectAdded);
      document.removeEventListener('open-add-project', handleOpenAddProject);
    };
  }, []);

  return (
    <aside
      class={`sidebar${sidebarCollapsed.value ? ' collapsed' : ''}`}
      aria-label="Sidebar"
    >
      <RemoveDialog />

      <div class="sidebar-content">
        {sidebarCollapsed.value ? (
          <div class="sidebar-icons flex flex-col gap-2 items-center pt-2">
            {projects.value.map((p, i) => (
              <CollapsedIcon project={p} index={i} />
            ))}
            <div class="h-2" />
            <div
              class="w-6 h-6 flex items-center justify-center text-text cursor-pointer hover:text-accent"
              title="Add project"
              aria-label="Add project"
              onClick={() => { openProjectModal(); }}
            >
              <Plus size={14} />
            </div>
          </div>
        ) : (
          <div class="sidebar-content-full flex flex-col h-full">
            <div class="flex items-center py-1 pb-2 border-b border-border mb-2">
              <div class="flex-1 section-label">
                Efxmux
              </div>
              <div
                class="text-text cursor-pointer w-6 h-6 flex items-center justify-center hover:text-accent"
                title="Add project"
                aria-label="Add project"
                onClick={() => { openProjectModal(); }}
              >
                <Plus size={14} />
              </div>
            </div>

            <div class="section-label pb-1">Projects</div>

            <div class="flex-1 overflow-y-auto">
              {projects.value.length === 0 ? (
                <div class="py-4 px-2 text-sm text-text text-center">
                  No projects yet
                </div>
              ) : (
                projects.value.map((p, i) => (
                  <ProjectRow project={p} index={i} />
                ))
              )}
            </div>

            <div class="border-t border-border mt-2 pt-2 flex-1 min-h-0 flex flex-col">
              <div class="flex items-center pb-1">
                <span class="section-label flex-1">Git Changes</span>
                <div
                  class="w-5 h-5 flex items-center justify-center text-text cursor-pointer hover:text-accent"
                  title="Refresh git status"
                  aria-label="Refresh git status"
                  onClick={async () => { await refreshAllGitStatus(); }}
                >
                  <RotateCw size={12} />
                </div>
              </div>

              {git.value.branch && (
                <div class="flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent">
                  <GitBranch size={10} />
                  {git.value.branch}
                </div>
              )}

              <div class="flex gap-2 px-2 py-1 flex-wrap">
                {git.value.modified > 0 && (
                  <span class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent">M {git.value.modified}</span>
                )}
                {git.value.staged > 0 && (
                  <span class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-success/15 text-success">S {git.value.staged}</span>
                )}
                {git.value.untracked > 0 && (
                  <span class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning">U {git.value.untracked}</span>
                )}
                {totalChanges.value === 0 && (
                  <span class="text-xs text-text">No changes</span>
                )}
              </div>

              {gitFiles.value.length > 0 && (
                <div class="flex-1 overflow-y-auto min-h-0">
                  {gitFiles.value.map(f => (
                    <GitFileRow file={f} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
