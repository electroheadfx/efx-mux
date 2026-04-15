// git-control-tab.test.tsx -- Tests for GitControlTab component (Phase 16)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock state-manager
vi.mock('../state-manager', () => ({
  projects: { value: [{ name: 'test-project', path: '/test/path' }] },
  activeProjectName: { value: 'test-project' },
}));

// Mock git-service
vi.mock('../services/git-service', () => ({
  stageFile: vi.fn(() => Promise.resolve()),
  unstageFile: vi.fn(() => Promise.resolve()),
  commit: vi.fn(() => Promise.resolve('abc1234')),
  push: vi.fn(() => Promise.resolve()),
  getUnpushedCount: vi.fn(() => Promise.resolve(0)),
  GitError: class GitError extends Error {
    constructor(public code: string, public details?: string) {
      super(code);
    }
  },
}));

// Mock toast
vi.mock('./toast', () => ({
  showToast: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { stageFile, unstageFile, commit, getUnpushedCount } from '../services/git-service';
import { showToast } from './toast';

describe('GitControlTab', () => {
  // Use dynamic import to get a fresh module with reset signals for each test
  let GitControlTab: typeof import('./git-control-tab').GitControlTab;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset module to clear signal state
    vi.resetModules();

    // Re-import the component to get fresh signals
    const module = await import('./git-control-tab');
    GitControlTab = module.GitControlTab;

    // Default: return some files
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_git_files') {
        return Promise.resolve([
          { name: 'file1.ts', path: 'src/file1.ts', status: 'M' },
          { name: 'file2.ts', path: 'src/file2.ts', status: 'SM' },
        ]);
      }
      if (cmd === 'get_git_status') {
        return Promise.resolve({ branch: 'main' });
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should render STAGED section with file count', async () => {
    render(<GitControlTab />);
    await waitFor(() => {
      expect(screen.getByText(/STAGED.*\(1\)/)).toBeTruthy();
    });
  });

  it('should render CHANGES section with file count', async () => {
    render(<GitControlTab />);
    await waitFor(() => {
      expect(screen.getByText(/CHANGES.*\(1\)/)).toBeTruthy();
    });
  });

  it('should call stageFile when checkbox is checked', async () => {
    render(<GitControlTab />);
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    const checkboxes = screen.getAllByRole('checkbox');
    // Find the unchecked one (unstaged file)
    const unchecked = checkboxes.find(cb => !(cb as HTMLInputElement).checked);
    if (unchecked) {
      fireEvent.click(unchecked);
      await waitFor(() => {
        expect(stageFile).toHaveBeenCalled();
      });
    }
  });

  it('should call unstageFile when checkbox is unchecked', async () => {
    render(<GitControlTab />);
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    const checkboxes = screen.getAllByRole('checkbox');
    // Find the checked one (staged file)
    const checked = checkboxes.find(cb => (cb as HTMLInputElement).checked);
    if (checked) {
      fireEvent.click(checked);
      await waitFor(() => {
        expect(unstageFile).toHaveBeenCalled();
      });
    }
  });

  it('should enable Commit button when staged > 0 and message non-empty', async () => {
    render(<GitControlTab />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Commit message...')).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText('Commit message...');
    fireEvent.input(textarea, { target: { value: 'Test commit' } });

    await waitFor(() => {
      const commitBtn = screen.getByText(/Commit.*\(1 files\)/);
      expect((commitBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('should disable Commit button when no message', async () => {
    render(<GitControlTab />);

    await waitFor(() => {
      const commitBtn = screen.getByText(/Commit.*\(1 files\)/);
      // No message typed, should be disabled
      expect((commitBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('should show empty state when no changes', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_git_files') {
        return Promise.resolve([]);
      }
      return Promise.resolve();
    });

    render(<GitControlTab />);

    await waitFor(() => {
      expect(screen.getByText('No changes')).toBeTruthy();
      expect(screen.getByText('Working directory is clean.')).toBeTruthy();
    });
  });

  it('should show Push button when unpushed commits exist', async () => {
    vi.mocked(getUnpushedCount).mockResolvedValue(2);

    render(<GitControlTab />);

    await waitFor(() => {
      expect(screen.getByText('Push to origin')).toBeTruthy();
    });
  });

  it('should hide Push button when no unpushed commits', async () => {
    vi.mocked(getUnpushedCount).mockResolvedValue(0);

    render(<GitControlTab />);

    // Wait for component to render
    await waitFor(() => {
      expect(screen.queryByText('Push to origin')).toBeNull();
    });
  });

  it('should call commit and show success toast', async () => {
    render(<GitControlTab />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Commit message...')).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText('Commit message...');
    fireEvent.input(textarea, { target: { value: 'Test commit' } });

    const commitBtn = screen.getByText(/Commit.*\(1 files\)/);
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(commit).toHaveBeenCalledWith('/test/path', 'Test commit');
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', message: 'Committed abc1234' })
      );
    });
  });
});
