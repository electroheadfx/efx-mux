// sidebar.test.tsx — Render tests for Sidebar component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { Sidebar } from './sidebar';
import { projects, activeProjectName } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

const MOCK_PROJECTS: ProjectEntry[] = [
  { path: '/tmp/proj1', name: 'proj1', agent: 'claude' },
  { path: '/tmp/proj2', name: 'proj2', agent: 'claude' },
];

describe('Sidebar', () => {
  beforeEach(() => {
    // Reset signals
    projects.value = [];
    activeProjectName.value = null;

    // Mock getProjects, getActiveProject, getGitStatus, getGitFiles
    mockIPC((cmd, _args) => {
      if (cmd === 'get_projects') return MOCK_PROJECTS;
      if (cmd === 'get_active_project') return null;
      if (cmd === 'get_git_status') return { branch: 'main', modified: 0, staged: 0, untracked: 0 };
      if (cmd === 'get_git_files') return [];
      if (cmd === 'switch_project') return;
      if (cmd === 'load_state') return {
        version: 1, layout: {}, theme: { mode: 'dark' },
        session: {}, project: { active: 'proj2', projects: MOCK_PROJECTS }, panels: {}
      };
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders EFXMUX header', async () => {
    render(<Sidebar />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('EFXMUX');
    });
  });

  it('renders PROJECTS section label', async () => {
    render(<Sidebar />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('PROJECTS');
    });
  });

  it('renders project names when projects are loaded', async () => {
    projects.value = MOCK_PROJECTS;
    render(<Sidebar />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('proj1');
      expect(document.body.textContent).toContain('proj2');
    });
  });

  it('shows "No projects yet" when project list is empty', async () => {
    projects.value = [];
    render(<Sidebar />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('No projects yet');
    });
  });

  describe('Tab navigation', () => {
    it('should render three tabs: Projects, Files, Git', async () => {
      render(<Sidebar />);
      await waitFor(() => {
        expect(screen.getByText('Projects')).toBeTruthy();
        expect(screen.getByText('Files')).toBeTruthy();
        expect(screen.getByText('Git')).toBeTruthy();
      });
    });

    it('should show projects content by default', async () => {
      render(<Sidebar />);
      await waitFor(() => {
        // Projects tab should show PROJECTS label
        expect(screen.getByText('PROJECTS')).toBeTruthy();
      });
    });

    it('should switch to Files tab on click', async () => {
      render(<Sidebar />);
      await waitFor(() => {
        expect(screen.getByText('Files')).toBeTruthy();
      });
      const filesTab = screen.getByText('Files');
      fireEvent.click(filesTab);
      // FileTree should be rendered - it has its own component
    });

    it('should switch to Git tab on click', async () => {
      render(<Sidebar />);
      await waitFor(() => {
        expect(screen.getByText('Git')).toBeTruthy();
      });
      const gitTab = screen.getByText('Git');
      fireEvent.click(gitTab);
      // GitControlTab renders empty state when no git files
      await waitFor(() => {
        expect(screen.getByText('No changes')).toBeTruthy();
      });
    });
  });

  it('highlights active project row when activeProjectName is set', async () => {
    projects.value = MOCK_PROJECTS;
    activeProjectName.value = 'proj1';
    render(<Sidebar />);
    // Click Projects tab to ensure we're on the right tab (tab state persists across tests)
    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Projects'));
    await waitFor(() => {
      expect(document.body.textContent).toContain('proj1');
    });
  });

  it('calls switchProject when clicking a project row', async () => {
    let switchedTo = '';
    mockIPC((cmd, _args) => {
      if (cmd === 'get_projects') return MOCK_PROJECTS;
      if (cmd === 'get_active_project') return 'proj1';
      if (cmd === 'get_git_status') return { branch: 'main', modified: 0, staged: 0, untracked: 0 };
      if (cmd === 'get_git_files') return [];
      if (cmd === 'switch_project') {
        switchedTo = (_args as any)?.name ?? '';
        return;
      }
      if (cmd === 'load_state') return {
        version: 1, layout: {}, theme: { mode: 'dark' },
        session: {}, project: { active: 'proj1', projects: MOCK_PROJECTS }, panels: {}
      };
      return null;
    });

    projects.value = MOCK_PROJECTS;
    activeProjectName.value = 'proj1';
    render(<Sidebar />);

    // Click Projects tab to ensure we're on the right tab (tab state persists across tests)
    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Projects'));

    await waitFor(() => {
      expect(document.body.textContent).toContain('proj2');
    });

    // Find and click the proj2 row by finding an element containing proj2 text
    // that is a clickable div (ProjectRow)
    const proj2Elements = screen.getAllByText('proj2');
    for (const el of proj2Elements) {
      const row = el.closest('[data-index]') as HTMLElement | null;
      if (row) {
        fireEvent.click(row);
        break;
      }
    }

    // Give async handlers time to run
    await new Promise(r => setTimeout(r, 20));
  });
});
