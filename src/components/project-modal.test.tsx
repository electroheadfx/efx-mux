import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { ProjectModal, openProjectModal } from './project-modal';
import { activeProjectName, projects } from '../state-manager';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('ProjectModal save behavior', () => {
  beforeEach(() => {
    cleanup();
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'bash' }];
    activeProjectName.value = 'testproj';
    document.body.innerHTML = '<div class="terminal-containers" data-scope="main-0"></div>';
  });

  it('shows save progress immediately while saving settings', async () => {
    let resolveUpdate: () => void = () => {};
    mockIPC((cmd) => {
      if (cmd === 'update_project') return new Promise(resolve => { resolveUpdate = () => resolve(); });
      if (cmd === 'load_state') return {
        version: 1,
        layout: {},
        theme: { mode: 'dark' },
        session: {},
        project: { active: 'testproj', projects: [{ path: '/tmp/proj', name: 'testproj', agent: 'ccscodex' }] },
        panels: {},
      };
      if (cmd === 'get_projects') return projects.value;
      if (cmd === 'switch_project') return null;
      return null;
    });
    openProjectModal({ project: { path: '/tmp/proj', name: 'testproj', agent: 'bash' } });
    render(<ProjectModal />);

    const agentInput = screen.getByPlaceholderText('claude') as HTMLInputElement;
    fireEvent.input(agentInput, { target: { value: 'ccscodex' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Saving project settings...');
    });
    expect(screen.getByText('Saving...').closest('button')).toBeDisabled();
    resolveUpdate();
  });
});
