import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { ProjectModal, openProjectModal } from './project-modal';
import { activeProjectName, projects } from '../state-manager';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('ProjectModal agent command validation', () => {
  beforeEach(() => {
    cleanup();
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'bash' }];
    activeProjectName.value = 'testproj';
  });

  it('validates the configured agent before saving and stays editable when unavailable', async () => {
    let updateCalled = false;
    mockIPC((cmd) => {
      if (cmd === 'detect_agent') throw new Error('No such file or directory (os error 2)');
      if (cmd === 'update_project') {
        updateCalled = true;
        return null;
      }
      if (cmd === 'load_state') return {
        version: 1,
        layout: {},
        theme: { mode: 'dark' },
        session: {},
        project: { active: 'testproj', projects: [{ path: '/tmp/proj', name: 'testproj', agent: 'bash' }] },
        panels: {},
      };
      if (cmd === 'get_projects') return projects.value;
      if (cmd === 'switch_project') return null;
      return null;
    });
    openProjectModal({ project: { path: '/tmp/proj', name: 'testproj', agent: 'bash' } });
    render(<ProjectModal />);

    const agentInput = screen.getByPlaceholderText('claude') as HTMLInputElement;
    fireEvent.input(agentInput, { target: { value: 'ccscode' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Agent "ccscode" is not available');
    });
    expect(agentInput.value).toBe('ccscode');
    expect(updateCalled).toBe(false);
  });
});
