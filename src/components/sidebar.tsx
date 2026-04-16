// sidebar.tsx -- Project sidebar with projects, git status, git files, collapsed mode
// Restyled with Lucide icons, status dots, git badges (Phase 9)
// Visual rewrite to reference Sidebar pattern (Phase 10)

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { GitBranch, Plus, RotateCw, Settings, X } from 'lucide-preact';
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
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
import { FileTree } from './file-tree';
import { GitControlTab } from './git-control-tab';
import { openGitChangesTab } from './unified-tab-bar';

// ---------------------------------------------------------------------------
// Local signals for sidebar-only state
// ---------------------------------------------------------------------------

const gitData = signal<Record<string, GitData>>({});
const gitFiles = signal<Array<{ name: string; path: string; status: string }>>([]);
const gitSectionOpen = signal(true);
const removeTarget = signal<string | null>(null);
const appVersion = signal<string>('');

// Tab navigation state (Phase 16, D-01 through D-04)
export type SidebarTab = 'projects' | 'files' | 'git';
export const leftSidebarActiveTab = signal<SidebarTab>('projects');

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
// Tab navigation components (Phase 16, D-01 through D-04)
// ---------------------------------------------------------------------------

function TabRow() {
  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'projects', label: 'Projects' },
    { id: 'files', label: 'Files' },
    { id: 'git', label: 'Git' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        padding: `0 ${spacing['3xl']}px`,
        borderBottom: `1px solid ${colors.bgBorder}`,
      }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => { leftSidebarActiveTab.value = tab.id; }}
          style={{
            padding: `${spacing.xl}px ${spacing['3xl']}px`,
            fontFamily: fonts.sans,
            fontSize: 11,
            fontWeight: leftSidebarActiveTab.value === tab.id ? 600 : 400,
            color: leftSidebarActiveTab.value === tab.id ? colors.textPrimary : colors.textMuted,
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: leftSidebarActiveTab.value === tab.id
              ? `2px solid ${colors.accent}`
              : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TabContent() {
  if (leftSidebarActiveTab.value === 'projects') {
    return (
      <>
        {/* Projects section label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '1px 7px 4px',
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '1.5px',
              color: colors.textDim,
            }}
          >
            PROJECTS
          </span>
        </div>

        {/* Project list */}
        <div class="flex-1 overflow-y-auto">
          {projects.value.length === 0 ? (
            <div
              style={{
                padding: `${spacing['4xl']}px ${spacing.md}px`,
                fontSize: fontSizes.base,
                color: colors.textMuted,
                textAlign: 'center',
              }}
            >
              No projects yet
            </div>
          ) : (
            projects.value.map((p, i) => (
              <ProjectRow key={p.name} project={p} index={i} />
            ))
          )}
        </div>
      </>
    );
  }

  if (leftSidebarActiveTab.value === 'files') {
    return (
      <div class="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <FileTree />
      </div>
    );
  }

  if (leftSidebarActiveTab.value === 'git') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <GitControlTab />
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProjectRow({ project, index }: { project: ProjectEntry; index: number }) {
  const isActive = activeProjectName.value === project.name;
  const git = gitData.value[project.name] || { branch: '', modified: 0, staged: 0, untracked: 0 };

  return (
    <div
      class="group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['2xl'],
        padding: '10px 2px 10px 2px',
        borderRadius: radii.lg,
        backgroundColor: isActive ? colors.bgElevated : 'transparent',
        borderLeft: isActive ? `3px solid ${colors.accent}` : '3px solid transparent',
        cursor: 'pointer',
      }}
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
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: isActive ? colors.statusGreen : colors.textDim,
          flexShrink: 0,
        }}
      />

      {/* Project info — matches reference ProjectItem */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            fontWeight: isActive ? 500 : 400,
            color: isActive ? colors.textPrimary : colors.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: isActive ? colors.accent : colors.textDim,
            }}
          >
            ⎇
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.textDim,
            }}
          >
            {git.branch || 'main'}
          </span>
        </div>
      </div>

      {/* Action buttons (edit + remove) — hidden until row hover */}
      <div
        class="project-row-actions"
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', opacity: 0, transition: 'opacity 0.15s' }}
      >
        <span
          style={{
            cursor: 'pointer',
            flexShrink: 0,
            color: colors.textMuted,
          }}
          class="hover:text-accent"
          title="Edit project settings"
          onClick={(e) => {
            e.stopPropagation();
            openProjectModal({ project });
          }}
        >
          <Settings size={12} />
        </span>
        <span
          style={{
            cursor: 'pointer',
            flexShrink: 0,
            color: colors.textMuted,
          }}
          class="hover:text-danger"
          title="Remove project"
          onClick={(e) => {
            e.stopPropagation();
            removeTarget.value = project.name;
          }}
        >
          <X size={12} />
        </span>
      </div>
    </div>
  );
}

function CollapsedIcon({ project, index }: { project: ProjectEntry; index: number }) {
  const isActive = activeProjectName.value === project.name;
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSizes.base,
        cursor: 'pointer',
        color: isActive ? colors.accent : colors.textMuted,
        position: 'relative',
      }}
      title={project.name}
      data-index={index}
      aria-label={`${project.name} project`}
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
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.statusGreen,
            position: 'absolute',
            bottom: -2,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </div>
  );
}

function GitFileRow({ file }: { file: { name: string; path: string; status: string } }) {
  const badgeBg = file.status === 'M' ? colors.statusYellowBg :
    file.status === 'S' ? colors.statusGreenBg :
    colors.statusMutedBg;
  const badgeColor = file.status === 'M' ? colors.statusYellow :
    file.status === 'S' ? colors.statusGreen :
    colors.textMuted;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px',
        cursor: 'pointer',
      }}
      class="hover:bg-bg-raised"
      onClick={() => {
        openGitChangesTab();
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 3,
          backgroundColor: badgeBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 600,
            color: badgeColor,
          }}
        >
          {file.status}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: colors.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {file.name}
      </span>
    </div>
  );
}

function RemoveDialog() {
  if (!removeTarget.value) return null;
  const name = removeTarget.value;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 101,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => { removeTarget.value = null; }}
    >
      <div
        style={{
          width: 360,
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgBorder}`,
          borderRadius: radii.xl,
          paddingBottom: spacing['5xl'],
        }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div
          style={{
            padding: `${spacing.lg}px ${spacing['4xl']}px`,
            fontSize: fontSizes.lg,
            fontFamily: fonts.sans,
            color: colors.textPrimary,
          }}
        >
          Remove {name}
        </div>
        <div
          style={{
            padding: `0 ${spacing['4xl']}px ${spacing.lg}px`,
            marginTop: spacing.sm,
            fontSize: fontSizes.base,
            fontFamily: fonts.sans,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          Remove this project from the sidebar?<br />
          The project files will not be deleted.
        </div>
        <div
          style={{
            padding: `${spacing.lg}px ${spacing['4xl']}px 0`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: spacing['2xl'],
          }}
        >
          <button
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${colors.bgBorder}`,
              color: colors.textMuted,
              padding: `${spacing.sm}px ${spacing['4xl']}px`,
              borderRadius: radii.sm,
              cursor: 'pointer',
              fontSize: fontSizes.base,
              fontFamily: fonts.sans,
            }}
            onClick={() => { removeTarget.value = null; }}
          >Cancel</button>
          <button
            style={{
              backgroundColor: colors.diffRed,
              border: 'none',
              color: 'white',
              padding: `${spacing.sm}px ${spacing['4xl']}px`,
              borderRadius: radii.sm,
              cursor: 'pointer',
              fontSize: fontSizes.base,
              fontFamily: fonts.sans,
            }}
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
        // Fetch app version
        const ver = await getVersion();
        appVersion.value = ver;
        await getCurrentWindow().setTitle(`${active || 'no project'} - efx-mux v${ver}`);
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
      if (appVersion.value) {
        getCurrentWindow().setTitle(`${detail.name} - efx-mux v${appVersion.value}`);
      }
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

    // Listen for git-status-changed Tauri event (auto-refresh when git operations occur)
    let unlistenGit: (() => void) | undefined;
    listen('git-status-changed', () => {
      refreshAllGitStatus();
    }).then((unlisten) => {
      unlistenGit = unlisten;
    });

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
      document.removeEventListener('project-added', handleProjectAdded);
      document.removeEventListener('open-add-project', handleOpenAddProject);
      if (unlistenGit) unlistenGit();
    };
  }, []);

  return (
    <aside
      class={`sidebar${sidebarCollapsed.value ? ' collapsed' : ''}`}
      aria-label="Sidebar"
      style={{
        backgroundColor: colors.bgBase,
      }}
    >
      <RemoveDialog />

      <div class="sidebar-content">
        {sidebarCollapsed.value ? (
          <div
            class="sidebar-icons"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: spacing['2xl'],
              paddingTop: spacing.sm,
            }}
          >
            {projects.value.map((p, i) => (
              <CollapsedIcon key={p.name} project={p} index={i} />
            ))}
            <div style={{ height: spacing.sm }} />
            <div
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.textMuted,
                cursor: 'pointer',
              }}
              class="hover:text-accent"
              title="Add project"
              aria-label="Add project"
              onClick={() => { openProjectModal(); }}
            >
              <Plus size={14} />
            </div>
          </div>
        ) : (
          <div
            class="sidebar-content-full"
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            {/* Header — current project name */}
            <div
              style={{
                padding: '16px 16px 12px 12px',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  letterSpacing: '1px',
                }}
              >
                {activeProjectName.value || 'no project'}
              </span>
            </div>

            {/* Tab row (Phase 16, D-01 through D-04) */}
            <TabRow />

            {/* Tab content */}
            <TabContent />
          </div>
        )}
      </div>
    </aside>
  );
}
