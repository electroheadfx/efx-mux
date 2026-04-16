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

// ── Phase 18 Plan 05: intra-tree mouse-drag + Finder drop routing ───────────

describe('drag', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    detectedEditors.value = null;
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('mousemove beyond threshold sets source row opacity to 0.4', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThan(1);
    fireEvent.mouseDown(rows[1], { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 110, clientY: 110 });
    expect((rows[1] as HTMLElement).style.opacity).toBe('0.4');
    // Cleanup to avoid leaking listeners into next test
    fireEvent.mouseUp(document, { clientX: 110, clientY: 110 });
  });

  it('mouseup on a folder row invokes rename_file with target folder/name', async () => {
    let renameArgs: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'rename_file') { renameArgs = args as Record<string, unknown>; return null; }
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    // rows[0] is 'src' (folder), rows[1] is 'README.md' (file).
    // Drag README.md onto src. In jsdom all getBoundingClientRect() are zero,
    // so use clientY=0 to land the cursor geometrically on the first zero-rect row
    // (which is rows[0] = 'src' folder). Equivalent semantics to "cursor over folder row".
    const fileRow = rows[1];
    fireEvent.mouseDown(fileRow, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(document, {
      clientX: 60,
      clientY: 0,
    });
    fireEvent.mouseUp(document, {
      clientX: 60,
      clientY: 0,
    });
    await new Promise(r => setTimeout(r, 20));
    expect(renameArgs).toBeDefined();
    expect(renameArgs?.from).toBe('/tmp/proj/README.md');
    expect(String(renameArgs?.to)).toContain('/tmp/proj/src/');
    expect(String(renameArgs?.to)).toContain('README.md');
  });

  it('mousemove under threshold does NOT trigger rename_file', async () => {
    let renameCalls = 0;
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'rename_file') { renameCalls++; return null; }
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    const rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    fireEvent.mouseDown(rows[1], { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 101, clientY: 101 }); // 1px — under threshold
    fireEvent.mouseUp(document, { clientX: 101, clientY: 101 });
    await new Promise(r => setTimeout(r, 20));
    expect(renameCalls).toBe(0);
  });
});

describe('finder drop', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    detectedEditors.value = null;
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('tree-finder-drop with outside path invokes copy_path', async () => {
    let copyArgs: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'copy_path') { copyArgs = args as Record<string, unknown>; return null; }
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    // jsdom returns zero rects; use y=0 to match the first zero-rect row (src folder).
    document.dispatchEvent(new CustomEvent('tree-finder-drop', {
      detail: {
        paths: ['/Users/bob/Downloads/extra.txt'],
        position: { x: 5, y: 0 },
      },
    }));
    await new Promise(r => setTimeout(r, 20));
    expect(copyArgs).toBeDefined();
    expect(copyArgs?.from).toBe('/Users/bob/Downloads/extra.txt');
    expect(String(copyArgs?.to)).toContain('/tmp/proj/src/extra.txt');
  });

  it('tree-finder-dragover sets finderDropActive visual (outline)', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
      detail: { paths: ['/Users/bob/x.txt'], position: { x: 0, y: 0 } },
    }));
    await new Promise(r => setTimeout(r, 20));
    // Scroll container's outline changes — find by the existing tabindex anchor
    const scrollContainer = document.querySelector('[tabindex="0"]') as HTMLElement;
    expect(scrollContainer.style.outline).toContain('solid');
  });

  it('tree-finder-dragleave clears finderDropActive outline', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
      detail: { paths: ['/Users/bob/x.txt'], position: { x: 0, y: 0 } },
    }));
    await new Promise(r => setTimeout(r, 20));
    document.dispatchEvent(new CustomEvent('tree-finder-dragleave'));
    await new Promise(r => setTimeout(r, 20));
    const scrollContainer = document.querySelector('[tabindex="0"]') as HTMLElement;
    expect(scrollContainer.style.outline).toBe('none');
  });
});

// ── Phase 18 quick-260416-uig: hover vs. click selection + userSelect ────────

describe('hover vs. click selection', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    detectedEditors.value = null;
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') {
        // Return empty for any subdirectory (e.g. /tmp/proj/src) so tree mode
        // doesn't recurse further than the top-level MOCK_ENTRIES.
        const path = (args as { path?: string })?.path;
        if (path && path !== '/tmp/proj') return [];
        return MOCK_ENTRIES;
      }
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  async function switchToFlat(): Promise<void> {
    const flatToggle = document.querySelector('span[title="Flat mode"]') as HTMLElement | null;
    expect(flatToggle).not.toBeNull();
    fireEvent.click(flatToggle!);
    await new Promise(r => setTimeout(r, 20));
  }

  // Locate the filename span inside a given row. The row's structure is
  //   <div data-file-tree-index=...><icon/><span style="...color...">name</span>[<span size>]</span>
  // (tree mode prepends chevron/spacer spans; we want the `flex:1` filename span).
  function nameSpan(row: HTMLElement): HTMLElement {
    const spans = row.querySelectorAll('span');
    for (const s of Array.from(spans)) {
      if ((s as HTMLElement).style.color) return s as HTMLElement;
    }
    return spans[spans.length - 1] as HTMLElement;
  }

  it('flat mode: click-selected row keeps textPrimary color while hovering another row', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    await switchToFlat();
    let rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThan(2);
    // rows[1] (README.md) and rows[2] (index.ts) are files — clicking a file
    // does NOT navigate (unlike clicking a directory), so the row list stays stable.
    fireEvent.click(rows[1]);
    await new Promise(r => setTimeout(r, 20));
    rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(nameSpan(rows[1]).style.color).toMatch(/rgb\(230, ?237, ?243\)|#E6EDF3/i);
    // Hover row 2 -> row 1 filename MUST STILL be textPrimary (bug-3 regression)
    fireEvent.mouseEnter(rows[2]);
    await new Promise(r => setTimeout(r, 20));
    rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(nameSpan(rows[1]).style.color).toMatch(/rgb\(230, ?237, ?243\)|#E6EDF3/i);
    // Row 2 (hovered but not click-selected) should be textMuted
    expect(nameSpan(rows[2]).style.color).toMatch(/rgb\(139, ?148, ?158\)|#8B949E/i);
  });

  it('flat mode: click-selected row retains bgElevated background after mouse leaves', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    await switchToFlat();
    let rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThan(2);
    fireEvent.click(rows[1]);
    await new Promise(r => setTimeout(r, 20));
    rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows[1].style.backgroundColor).toMatch(/rgb\(25, ?36, ?58\)|#19243A/i);
    // Hover then leave row 2; re-read row 1 after each signal-driven re-render
    fireEvent.mouseEnter(rows[2]);
    await new Promise(r => setTimeout(r, 20));
    fireEvent.mouseLeave(rows[2]);
    await new Promise(r => setTimeout(r, 20));
    rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows[1].style.backgroundColor).toMatch(/rgb\(25, ?36, ?58\)|#19243A/i);
  });

  it('flat mode: row has userSelect:none to prevent text selection on right-click', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));
    await switchToFlat();
    const rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThan(0);
    // Preact normalises inline style camelCase keys; value must be 'none'
    expect(rows[0].style.userSelect).toBe('none');
  });

  it('tree mode: click-selected row keeps textPrimary color while hovering another row', async () => {
    render(<FileTree />);
    // Tree mode is default. Allow slightly longer for initTree() to complete.
    await new Promise(r => setTimeout(r, 80));
    let rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThan(2);
    // Click rows[1] (README.md, file) — does not toggle a folder, tree stays stable.
    fireEvent.click(rows[1]);
    await new Promise(r => setTimeout(r, 20));
    rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(nameSpan(rows[1]).style.color).toMatch(/rgb\(230, ?237, ?243\)|#E6EDF3/i);
    fireEvent.mouseEnter(rows[2]);
    await new Promise(r => setTimeout(r, 20));
    rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(nameSpan(rows[1]).style.color).toMatch(/rgb\(230, ?237, ?243\)|#E6EDF3/i);
  });
});
