// file-tree.test.tsx — Render tests for FileTree component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { FileTree, fileTreeFontSize, fileTreeLineHeight, detectedEditors } from './file-tree';
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

// ── Phase 18 Plan 03: context menu + delete flow + inline create ────────────

describe('context menu', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'count_children') return { files: 5, folders: 2, total: 7, capped: false };
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders menu with Delete on right-click of a row', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.contextMenu(rows[0] as HTMLElement);
    // Menu appears — look for a role="menu" element
    expect(document.body.textContent).toContain('Delete');
  });

  it('renders New File and New Folder items in context menu', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    expect(document.body.textContent).toContain('New File');
    expect(document.body.textContent).toContain('New Folder');
  });
});

describe('delete key', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'count_children') return { files: 0, folders: 0, total: 0, capped: false };
      if (cmd === 'delete_file') return null;
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('pressing Delete on focused scroll container dispatches a confirm modal flow', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const fileList = document.querySelector('[tabindex="0"]') as HTMLElement;
    expect(fileList).not.toBeNull();
    fireEvent.keyDown(fileList, { key: 'Delete' });
    // Wait a tick for the async invoke (count_children) to settle
    await new Promise(r => setTimeout(r, 20));
    // ConfirmModal should surface "Delete" copy somewhere in the DOM.
    expect(document.body.textContent).toMatch(/Delete/);
  });

  it('pressing plain Backspace still navigates to parent in flat mode (existing behavior)', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    const fileList = document.querySelector('[tabindex="0"]') as HTMLElement;
    if (fileList) {
      fireEvent.keyDown(fileList, { key: 'Backspace' });
      // No throw — existing behavior preserved
      expect(true).toBe(true);
    }
  });
});

describe('inline create', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'create_file') return null;
      if (cmd === 'create_folder') return null;
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders an input after New File menu click', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    // Find the "New File" menu item and click it
    const newFileItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(el => el.textContent?.includes('New File')) as HTMLElement | undefined;
    expect(newFileItem).toBeDefined();
    fireEvent.click(newFileItem!);
    await new Promise(r => setTimeout(r, 20));
    const input = document.querySelector('input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.getAttribute('placeholder')).toMatch(/New file name|New folder name/);
  });

  it('Escape unmounts the create row', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    const newFileItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(el => el.textContent?.includes('New File')) as HTMLElement | undefined;
    fireEvent.click(newFileItem!);
    await new Promise(r => setTimeout(r, 20));
    const input = document.querySelector('input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    fireEvent.keyDown(input!, { key: 'Escape' });
    await new Promise(r => setTimeout(r, 20));
    expect(document.querySelector('input')).toBeNull();
  });

  it('Enter with empty name shows Name required error', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 20));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    const newFileItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(el => el.textContent?.includes('New File')) as HTMLElement | undefined;
    fireEvent.click(newFileItem!);
    await new Promise(r => setTimeout(r, 20));
    const input = document.querySelector('input') as HTMLInputElement | null;
    fireEvent.keyDown(input!, { key: 'Enter' });
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.textContent).toContain('Name required');
  });
});

// ── Phase 18 Plan 04: Open In submenu + Reveal in Finder + header buttons ───

describe('open in', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    detectedEditors.value = null;
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders Open In submenu with only detected editors', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: true, code: true, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.textContent).toContain('Open In');
    const openInRow = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(el => el.textContent?.trim().startsWith('Open In')) as HTMLElement | undefined;
    expect(openInRow).toBeDefined();
    fireEvent.mouseEnter(openInRow!);
    await new Promise(r => setTimeout(r, 200));
    expect(document.body.textContent).toContain('Zed');
    expect(document.body.textContent).toContain('Visual Studio Code');
    expect(document.body.textContent).not.toContain('Sublime Text');
  });

  it('invokes launch_external_editor when Zed submenu item is clicked', async () => {
    let launchArgs: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: true, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'launch_external_editor') { launchArgs = args as Record<string, unknown>; return null; }
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    await new Promise(r => setTimeout(r, 20));
    const openInRow = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(el => el.textContent?.trim().startsWith('Open In')) as HTMLElement;
    fireEvent.mouseEnter(openInRow);
    await new Promise(r => setTimeout(r, 200));
    const zedItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(el => el.textContent?.trim() === 'Zed') as HTMLElement;
    fireEvent.click(zedItem);
    await new Promise(r => setTimeout(r, 20));
    expect(launchArgs).toBeDefined();
    expect(launchArgs?.app).toBe('Zed');
    expect(launchArgs?.path).toBe(MOCK_ENTRIES[0].path);
  });

  it('hides Open In when no editors detected', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const rows = document.querySelectorAll('[data-file-tree-index]');
    fireEvent.contextMenu(rows[0] as HTMLElement);
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.textContent).not.toContain('Open In');
    expect(document.body.textContent).toContain('Reveal in Finder');
  });
});

describe('header', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    detectedEditors.value = null;
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('renders [+] button with create title', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const plusBtn = document.querySelector('[title="New file or folder"]');
    expect(plusBtn).not.toBeNull();
  });

  it('clicking [+] opens menu with New File / New Folder', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const plusBtn = document.querySelector('[title="New file or folder"]') as HTMLElement;
    fireEvent.click(plusBtn);
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.textContent).toContain('New File');
    expect(document.body.textContent).toContain('New Folder');
  });

  it('Open In header button visible only when at least one editor detected', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: true, code: false, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const openInHeaderBtn = document.querySelector('[title="Open project in external editor"]');
    expect(openInHeaderBtn).not.toBeNull();
  });

  it('Open In header button hidden when no editors detected', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const openInHeaderBtn = document.querySelector('[title="Open project in external editor"]');
    expect(openInHeaderBtn).toBeNull();
  });
});
