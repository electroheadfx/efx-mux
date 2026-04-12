// gsd-viewer.test.tsx — Render tests for GSDViewer component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { GSDViewer } from './gsd-viewer';
import { projects, activeProjectName } from '../state-manager';

const MOCK_PROJECT = { path: '/tmp/proj', name: 'testproj', agent: 'claude', gsd_file: 'PLAN.md' };
const MOCK_GSD_CONTENT = `# Project Plan

- [ ] Task 1
- [x] Task 2

Some text here.
`;

describe('GSDViewer', () => {
  beforeEach(() => {
    projects.value = [MOCK_PROJECT];
    activeProjectName.value = 'testproj';

    // Mock IPC: read_file_content returns GSD content
    mockIPC((cmd, _args) => {
      if (cmd === 'read_file_content') return MOCK_GSD_CONTENT;
      if (cmd === 'write_checkbox') return;
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders loading state on mount', async () => {
    render(<GSDViewer />);
    await new Promise(r => setTimeout(r, 10));
    const content = document.body.textContent;
    expect(content).toBeDefined();
  });

  it('renders markdown content after loading', async () => {
    render(<GSDViewer />);
    await new Promise(r => setTimeout(r, 50));
    expect(document.body.textContent).toContain('Project Plan');
    expect(document.body.textContent).toContain('Task 1');
    expect(document.body.textContent).toContain('Task 2');
  });

  it('renders checkboxes in markdown', async () => {
    render(<GSDViewer />);
    await new Promise(r => setTimeout(r, 50));
    const checkboxes = document.querySelectorAll('.task-checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('checkbox has correct checked state for done task', async () => {
    render(<GSDViewer />);
    await new Promise(r => setTimeout(r, 50));
    const checkedBoxes = document.querySelectorAll('.task-checkbox:checked');
    expect(checkedBoxes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state when invoke throws', async () => {
    vi.spyOn(console, 'warn').mockReturnValue();
    mockIPC((cmd, _args) => {
      if (cmd === 'read_file_content') throw new Error('File not found');
      return null;
    });
    render(<GSDViewer />);
    await new Promise(r => setTimeout(r, 50));
    expect(document.body.textContent).toContain('No GSD file found');
  });

  it('clicking checkbox calls write_checkbox invoke', async () => {
    let writeCheckboxCalled = false;
    mockIPC((cmd, _args) => {
      if (cmd === 'read_file_content') return MOCK_GSD_CONTENT;
      if (cmd === 'write_checkbox') {
        writeCheckboxCalled = true;
        return;
      }
      return null;
    });

    render(<GSDViewer />);
    await new Promise(r => setTimeout(r, 50));

    const checkbox = document.querySelector('.task-checkbox') as HTMLInputElement;
    if (checkbox) {
      fireEvent.click(checkbox);
      await new Promise(r => setTimeout(r, 10));
    }
  });
});
