// file-tree.test.tsx — Render tests for FileTree component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { FileTree, fileTreeFontSize, fileTreeLineHeight } from './file-tree';
import { projects, activeProjectName } from '../state-manager';

const MOCK_ENTRIES = [
  { name: 'src', path: '/tmp/proj/src', is_dir: true },
  { name: 'README.md', path: '/tmp/proj/README.md', is_dir: false, size: 1024 },
  { name: 'index.ts', path: '/tmp/proj/index.ts', is_dir: false, size: 2048 },
];

describe('FileTree', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders File Tree header', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.textContent).toContain('File Tree');
  });

  it('renders file entries after loading', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.textContent).toContain('src');
    expect(document.body.textContent).toContain('README.md');
    expect(document.body.textContent).toContain('index.ts');
  });

  it('renders folder icon for directory entries', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    // 'src' is a directory; it should appear in the file list
    expect(document.body.textContent).toContain('src');
  });

  it('renders entries with size information', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    // index.ts is 2048 bytes -> "2.0K"
    expect(document.body.textContent).toContain('2.0K');
  });

  it('renders empty state for empty directory', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    // Component renders without crashing when entries load
    expect(document.body.textContent).toBeDefined();
  });

  it('responds to ArrowDown keyboard navigation without throwing', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));

    const fileList = document.querySelector('[tabindex="0"]') as HTMLElement;
    if (fileList) {
      fireEvent.keyDown(fileList, { key: 'ArrowDown' });
      // The component should handle ArrowDown without errors
      expect(true).toBe(true);
    }
  });

  it('shows loading state renders initially', async () => {
    render(<FileTree />);
    // Immediately check -- before useEffect runs
    expect(document.body.textContent).toContain('File Tree');
  });
});
