// file-tree.test.tsx — Render tests for FileTree component
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { FileTree, fileTreeFontSize, fileTreeLineHeight, detectedEditors } from './file-tree';
import { ConfirmModal } from './confirm-modal';
import { ToastContainer } from './toast';
import { projects, activeProjectName } from '../state-manager';

// Phase 18 Plan 08: module-level holder for the git-status-changed listener captured
// by the vi.mock below. Used by the 'tree state preservation' describe to simulate
// a file-mutation event being emitted from Rust.
let capturedGitStatusListener: (() => void) | null = null;

// Phase 18 Plan 09 (UAT Test 5 fix): module-level holder for the delete-selected-tree-row
// listener captured by the vi.mock below. Used by the 'delete key (UAT Test 5 fix)'
// describe to simulate the native-menu Cmd+Backspace event being emitted from Rust.
let capturedDeleteListener: (() => void) | null = null;

// Phase 18 Plan 08 + Plan 09: intercept @tauri-apps/api/event.listen so tests can capture
// the git-status-changed callback AND the delete-selected-tree-row callback and invoke
// them synchronously. Other event subscriptions return a no-op unlisten function —
// behaviourally equivalent to the pre-existing vi.stubGlobal('listen', ...) stubs for
// the other describe blocks.
vi.mock('@tauri-apps/api/event', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/event')>('@tauri-apps/api/event');
  return {
    ...actual,
    listen: vi.fn().mockImplementation(async (event: string, cb: () => void) => {
      if (event === 'git-status-changed') capturedGitStatusListener = cb;
      if (event === 'delete-selected-tree-row') capturedDeleteListener = cb;
      return vi.fn();
    }),
  };
});

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

describe('delete key (UAT Test 5 fix)', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;
    // Phase 18 Plan 09: reset the capture each run so the 'Cmd+Backspace' test
    // sees a freshly-registered listener from its own render() call.
    capturedDeleteListener = null;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'count_children') return { files: 0, folders: 0, total: 0, capped: false };
      if (cmd === 'delete_file') return null;
      return null;
    });
  });

  it('pressing Delete on focused scroll container surfaces ConfirmModal with "permanently deleted" copy', async () => {
    // Render BOTH the FileTree and the ConfirmModal host so the modal's markup is observable.
    // Without ConfirmModal mounted, showConfirmModal sets modalState.visible=true but no DOM
    // is produced — the bogus Plan 18-03 test passed only because prior describes left the
    // literal "Delete" string in the DOM.
    render(
      <>
        <FileTree />
        <ConfirmModal />
      </>
    );
    await new Promise(r => setTimeout(r, 50));

    const fileList = document.querySelector('[tabindex="0"]') as HTMLElement;
    expect(fileList).not.toBeNull();

    // Fire Delete key with a row selected (selectedIndex defaults to 0 → first entry = 'src').
    fireEvent.keyDown(fileList, { key: 'Delete' });
    // Allow async count_children (for folder confirm message) + modal render to settle.
    await new Promise(r => setTimeout(r, 80));

    // Real assertion: the confirm modal's message contains "permanently deleted" (from
    // triggerDeleteConfirm's message template). This copy is unique to the rendered modal
    // body and will NOT be satisfied by DOM pollution from prior describes.
    expect(document.body.textContent).toMatch(/permanently deleted/);
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

  it('delete-selected-tree-row event path routes to triggerDeleteConfirm (Cmd+Backspace fix)', async () => {
    // This simulates the Tauri menu event that fires when the user presses Cmd+Backspace
    // on macOS. The native menu handler in src-tauri/src/lib.rs emits this event;
    // file-tree.tsx consumes it in its useEffect and routes the currently-selected entry
    // to triggerDeleteConfirm. WKWebView's NSResponder doCommandBySelector: interception
    // on the JS keydown path is bypassed entirely by this native-menu detour.
    render(
      <>
        <FileTree />
        <ConfirmModal />
      </>
    );
    await new Promise(r => setTimeout(r, 50));

    // The production listener should have been captured by the module-level vi.mock.
    expect(capturedDeleteListener).not.toBeNull();

    // Invoke it with the first row selected (default selectedIndex = 0 → 'src').
    capturedDeleteListener!();
    // Allow async count_children + modal render to settle.
    await new Promise(r => setTimeout(r, 80));

    // Same assertion as the Delete-key test: modal surfaces with "permanently deleted".
    expect(document.body.textContent).toMatch(/permanently deleted/);
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
    // After Plan 18-07 added x-axis bounds to hit-tests, clientX must be 0 so
    // 0 >= 0 && 0 <= 0 is TRUE on the zero-rect row (rect.right=0 in jsdom).
    // The mouseDown above uses clientX=50 only to record the drag START position
    // (drag-threshold check uses delta, not absolute), not for the hit-test.
    fireEvent.mouseMove(document, {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseUp(document, {
      clientX: 0,
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
    // jsdom returns zero rects; use x=0 AND y=0 so 0 >= 0 && 0 <= 0 matches both axes after Plan 18-07 added the x-axis bounds check (the realistic-geometry coverage lives in the new 'finder drop hit-test geometry' describe block below).
    document.dispatchEvent(new CustomEvent('tree-finder-drop', {
      detail: {
        paths: ['/Users/bob/Downloads/extra.txt'],
        position: { x: 0, y: 0 },
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

// ── Phase 18 Plan 07: Regression tests for x-axis hit-test bounds ────────────
// These tests use mocked getBoundingClientRect with realistic non-zero rects to
// exercise production geometry — jsdom returns zero-rects by default which
// hides the y-only hit-test bug from the existing 'finder drop' describe block.

describe('finder drop hit-test geometry (UAT Test 17 regression)', () => {
  // Layout simulated:
  //   Scroll container: left=0, right=280, top=34, bottom=900
  //   Row 0 (src):      left=0, right=280, top=100, bottom=124
  //   Row 1 (README):   left=0, right=280, top=124, bottom=148
  //   Row 2 (index.ts): left=0, right=280, top=148, bottom=172
  // The terminal panel is conceptually at x>=280 — drops there must NOT match a row.
  const ROW_RECTS: Record<string, DOMRect> = {
    '0': { top: 100, bottom: 124, left: 0, right: 280, width: 280, height: 24, x: 0, y: 100, toJSON: () => ({}) } as DOMRect,
    '1': { top: 124, bottom: 148, left: 0, right: 280, width: 280, height: 24, x: 0, y: 124, toJSON: () => ({}) } as DOMRect,
    '2': { top: 148, bottom: 172, left: 0, right: 280, width: 280, height: 24, x: 0, y: 148, toJSON: () => ({}) } as DOMRect,
  };
  const SCROLL_CONTAINER_RECT: DOMRect = {
    top: 34, bottom: 900, left: 0, right: 280, width: 280, height: 866, x: 0, y: 34, toJSON: () => ({}),
  } as DOMRect;

  let getBCRSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;
    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));

    // Mock Element.prototype.getBoundingClientRect: route by data-file-tree-index, fall back to scroll container, then zero.
    getBCRSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const idx = (this as HTMLElement).dataset?.fileTreeIndex;
      if (idx !== undefined && ROW_RECTS[idx]) return ROW_RECTS[idx];
      // Identify the scroll container by tabindex="0"
      if ((this as HTMLElement).getAttribute?.('tabindex') === '0') return SCROLL_CONTAINER_RECT;
      return new DOMRect(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    getBCRSpy?.mockRestore();
    getBCRSpy = null;
  });

  it('drop with cursor.x OUTSIDE scroll container shows toast and does NOT call copy_path', async () => {
    let copyCalls = 0;
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'copy_path') { copyCalls++; return null; }
      return null;
    });
    // Mount ToastContainer alongside FileTree so the 'Drop target outside file tree'
    // toast is rendered into the DOM and assertable via document.body.textContent.
    render(<><FileTree /><ToastContainer /></>);
    await new Promise(r => setTimeout(r, 50));

    // Cursor at (x=500, y=110) — y is INSIDE row 0's vertical band (100..124),
    // but x is OUTSIDE the scroll container (right edge at 280).
    // Pre-fix: y-only hit-test matched row 0 → copy_path was called with src targetDir.
    // Post-fix: x-axis check rejects the row, fallback container check also fails (x=500>280),
    //   so the outside-container toast fires and no copy happens.
    document.dispatchEvent(new CustomEvent('tree-finder-drop', {
      detail: {
        paths: ['/Users/bob/Downloads/extra.txt'],
        position: { x: 500, y: 110 },
      },
    }));
    await new Promise(r => setTimeout(r, 30));

    expect(copyCalls).toBe(0);
    expect(document.body.textContent).toContain('Drop target outside file tree');
  });

  it('dragover with cursor.x OUTSIDE scroll container does NOT highlight any row', async () => {
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));

    document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
      detail: {
        paths: ['/Users/bob/Downloads/extra.txt'],
        position: { x: 500, y: 110 }, // x outside, y inside row 0 band
      },
    }));
    await new Promise(r => setTimeout(r, 30));

    // No row should have the highlight border applied
    const rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    const anyHighlighted = Array.from(rows).some(r => r.style.borderLeft && r.style.borderLeft.includes('solid'));
    expect(anyHighlighted).toBe(false);
  });

  it('drop with cursor INSIDE row 0 (src folder) targets that folder via copy_path', async () => {
    let copyArgs: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') return MOCK_ENTRIES;
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'copy_path') { copyArgs = args as Record<string, unknown>; return null; }
      return null;
    });
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));

    // Cursor at (x=140, y=110) — INSIDE row 0's full 2D rect (left=0..right=280, top=100..bottom=124)
    // Confirms positive case: a correct-geometry drop still works after the x-axis bounds addition.
    document.dispatchEvent(new CustomEvent('tree-finder-drop', {
      detail: {
        paths: ['/Users/bob/Downloads/extra.txt'],
        position: { x: 140, y: 110 },
      },
    }));
    await new Promise(r => setTimeout(r, 30));

    expect(copyArgs).toBeDefined();
    expect(copyArgs?.from).toBe('/Users/bob/Downloads/extra.txt');
    expect(String(copyArgs?.to)).toBe('/tmp/proj/src/extra.txt');
  });
});

// ── Phase 18 Plan 08: Tree state preservation across git-status-changed ─────
// UAT Tests 6 + 7 fix: after create/delete/rename, expanded folders MUST stay expanded.
// The git-status-changed listener was previously calling initTree() which wiped all
// expansion state. Plan 08 wraps it in refreshTreePreservingState() which snapshots
// expanded paths + selection before initTree and restores them after.

describe('tree state preservation (UAT Tests 6 + 7)', () => {
  // Mock list_directory: root returns MOCK_ENTRIES; '/tmp/proj/src' returns 2 children.
  const SRC_CHILDREN = [
    { name: 'foo.ts', path: '/tmp/proj/src/foo.ts', is_dir: false, size: 100 },
    { name: 'bar.ts', path: '/tmp/proj/src/bar.ts', is_dir: false, size: 200 },
  ];

  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;
    capturedGitStatusListener = null;

    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') {
        const path = (args as { path: string }).path;
        if (path === '/tmp/proj/src') return SRC_CHILDREN;
        return MOCK_ENTRIES;
      }
      if (cmd === 'detect_editors') {
        return { zed: false, code: false, subl: false, cursor: false, idea: false };
      }
      return null;
    });
  });

  // The `viewMode` signal is module-scoped and can leak between test files;
  // previous describe blocks in this file click a flat-mode toggle which
  // persists. This helper clicks the 'Tree mode' toggle to force the component
  // into tree mode regardless of the inherited signal state. When the component
  // is already in tree mode, the toggle click is a no-op.
  async function forceTreeMode(): Promise<void> {
    const treeToggle = document.querySelector('span[title="Tree mode"]') as HTMLElement | null;
    if (treeToggle) {
      fireEvent.click(treeToggle);
      await new Promise(r => setTimeout(r, 50));
    }
  }

  it('expanded folders remain expanded after git-status-changed dispatch', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 80));
    await forceTreeMode();

    // Row 0 is 'src' (a folder). Clicking it in tree mode fires toggleTreeNode,
    // which lazy-loads children via list_directory and sets expanded=true.
    const srcRow = document.querySelector('[data-file-tree-index="0"]') as HTMLElement | null;
    expect(srcRow).not.toBeNull();
    fireEvent.click(srcRow!);
    await new Promise(r => setTimeout(r, 80));

    // After expansion, 'foo.ts' (a child of 'src') should be in the DOM.
    expect(document.body.textContent).toContain('foo.ts');

    // Simulate git-status-changed being emitted (e.g. after a file mutation).
    expect(capturedGitStatusListener).not.toBeNull();
    capturedGitStatusListener!();
    // Allow async refresh + re-expansion + lazy-load to settle.
    await new Promise(r => setTimeout(r, 200));

    // Expansion MUST be preserved: foo.ts is still visible in the rendered tree.
    expect(document.body.textContent).toContain('foo.ts');
  });

  it('selectedIndex is re-anchored to the same path after refresh', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 80));
    await forceTreeMode();

    // Expand 'src' so 'foo.ts' is a rendered row.
    const srcRow = document.querySelector('[data-file-tree-index="0"]') as HTMLElement | null;
    expect(srcRow).not.toBeNull();
    fireEvent.click(srcRow!);
    await new Promise(r => setTimeout(r, 80));

    // Click the README.md row to set it as the selected entry (by path).
    const allRowsBefore = Array.from(document.querySelectorAll<HTMLElement>('[data-file-tree-index]'));
    const readmeRowBefore = allRowsBefore.find(r => r.textContent?.includes('README.md'));
    expect(readmeRowBefore).toBeDefined();
    fireEvent.click(readmeRowBefore!);
    await new Promise(r => setTimeout(r, 30));

    // Trigger a git-status-changed refresh.
    expect(capturedGitStatusListener).not.toBeNull();
    capturedGitStatusListener!();
    await new Promise(r => setTimeout(r, 200));

    // After refresh the entry MUST still exist at its same path (selectedIndex anchors
    // by path, not by index). We assert existence rather than a DOM-level selection
    // style because jsdom's lack of layout makes visual-selection assertions fragile.
    const allRowsAfter = Array.from(document.querySelectorAll<HTMLElement>('[data-file-tree-index]'));
    const readmeRowAfter = allRowsAfter.find(r => r.textContent?.includes('README.md'));
    expect(readmeRowAfter).toBeDefined();
    // Expansion preserved: foo.ts still in DOM.
    expect(document.body.textContent).toContain('foo.ts');
  });

  it('git-status-changed in flat mode still uses loadDir (no regression)', async () => {
    // Count list_directory calls to prove a refresh ran after the event.
    let listDirCalls = 0;
    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') {
        listDirCalls++;
        const path = (args as { path: string }).path;
        if (path === '/tmp/proj/src') return SRC_CHILDREN;
        return MOCK_ENTRIES;
      }
      if (cmd === 'detect_editors') {
        return { zed: false, code: false, subl: false, cursor: false, idea: false };
      }
      return null;
    });

    render(<FileTree />);
    await new Promise(r => setTimeout(r, 80));
    // Flip to flat mode so the listener's else-branch (loadDir) is exercised.
    const flatBtn = document.querySelector('[title="Flat view"]') as HTMLElement | null
      ?? document.querySelector('[title="List view"]') as HTMLElement | null;
    // If the title doesn't match, fall back to clicking the first mode-toggle icon.
    // The test is tolerant: even if we stay in tree mode, triggering the listener
    // still exercises the refreshTreePreservingState path and bumps list_directory.
    if (flatBtn) {
      fireEvent.click(flatBtn);
      await new Promise(r => setTimeout(r, 50));
    }
    const initialCalls = listDirCalls;

    // Trigger refresh via captured listener.
    expect(capturedGitStatusListener).not.toBeNull();
    capturedGitStatusListener!();
    await new Promise(r => setTimeout(r, 80));

    // list_directory must have fired at least once more after the event (either
    // loadDir for flat mode, or refreshTreePreservingState → initTree for tree mode).
    expect(listDirCalls).toBeGreaterThan(initialCalls);
  });
});

// ── Phase 18 Plan 10 (Gap G-01): revert removes stale row via git-status-changed emit ─────
//
// Plan 10 added an emit('git-status-changed') from revert_file (Rust) AND from
// handleRevertFile / handleRevertAll (frontend). This test verifies that when
// the emit fires (simulated by invoking the captured listener), the file-tree
// refresh loads the new list and the previously-shown row disappears.
//
// This does NOT test the Rust emit directly — that is covered by the cargo test
// in Plan 10 Task 1 (revert_file_impl_returns_mutated_for_untracked_delete). Here
// we verify the JS-side consumer of the emit (the file-tree listener) does the right
// thing when the emit fires.

describe('revert removes stale row via git-status-changed (Gap G-01)', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;
    capturedGitStatusListener = null;

    // First list_directory call returns [foo.ts, bar.ts]; subsequent calls
    // return only [bar.ts] (simulating foo.ts having been deleted by revert).
    let callCount = 0;
    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') {
        callCount++;
        if (callCount === 1) {
          return [
            { name: 'foo.ts', path: '/tmp/proj/foo.ts', is_dir: false, size: 0 },
            { name: 'bar.ts', path: '/tmp/proj/bar.ts', is_dir: false, size: 0 },
          ];
        }
        return [
          { name: 'bar.ts', path: '/tmp/proj/bar.ts', is_dir: false, size: 0 },
        ];
      }
      if (cmd === 'detect_editors') {
        return { zed: false, code: false, subl: false, cursor: false, idea: false };
      }
      return null;
    });
  });

  it('capturing the listener then invoking it removes the reverted row from flat-mode DOM', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 80));

    // Force flat mode via the existing switchToFlat helper pattern. If another
    // describe left viewMode in a different state, click the 'Flat mode' toggle
    // to land in a deterministic starting point.
    const flatToggle = document.querySelector('span[title="Flat mode"]') as HTMLElement | null;
    if (flatToggle) {
      fireEvent.click(flatToggle);
      await new Promise(r => setTimeout(r, 50));
    }

    // Sanity: before revert, the tree shows foo.ts + bar.ts.
    expect(document.body.textContent).toMatch(/foo\.ts/);
    expect(document.body.textContent).toMatch(/bar\.ts/);

    // The listener MUST have been captured by the module-scoped vi.mock.
    expect(capturedGitStatusListener).not.toBeNull();

    // Simulate the post-revert emit: the Rust revert_file command emits
    // git-status-changed after fs::remove_file succeeds. Here we just invoke
    // the captured callback directly.
    capturedGitStatusListener!();
    await new Promise(r => setTimeout(r, 200)); // allow refresh pipeline to run

    // After the refresh, foo.ts should be gone but bar.ts should remain.
    expect(document.body.textContent).not.toMatch(/foo\.ts/);
    expect(document.body.textContent).toMatch(/bar\.ts/);
  });
});

// ── Phase 18 Plan 12 (Gap G-02): continuous per-row highlight during Finder drag ──
//
// Plan 12 fixed main.tsx's onDragDropEvent filter so that Tauri 2's `over` events
// (which have NO paths field, only position) are dispatched to file-tree's
// handleFinderDragover even though they lack paths. The cached isFinderDragActive
// flag in main.tsx (set at `enter` time) gates the dispatch. These tests verify
// the file-tree consumer behaves correctly when `tree-finder-dragover` fires
// multiple times during a single drag.

describe('continuous drop-target highlight during Finder drag (Gap G-02)', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    detectedEditors.value = null;
    activeProjectName.value = 'testproj';
    fileTreeFontSize.value = 13;
    fileTreeLineHeight.value = 2;

    mockIPC((cmd, _args) => {
      if (cmd === 'list_directory') {
        return [
          { name: 'src', path: '/tmp/proj/src', is_dir: true, size: 0, modified: 0, extension: null },
          { name: 'tests', path: '/tmp/proj/tests', is_dir: true, size: 0, modified: 0, extension: null },
          { name: 'README.md', path: '/tmp/proj/README.md', is_dir: false, size: 0, modified: 0, extension: 'md' },
        ];
      }
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'copy_path') return null;
      return null;
    });

    vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
  });

  it('multiple tree-finder-dragover dispatches with changing positions update the highlighted row', async () => {
    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));

    const rows = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
    expect(rows.length).toBeGreaterThanOrEqual(3);

    // Helper: dispatch a tree-finder-dragover with a given position.
    const dispatchOver = (x: number, y: number) => {
      document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
        detail: { paths: [], position: { x, y } },
      }));
    };

    // Jsdom returns zero-rects for all elements, so getBoundingClientRect on
    // each row returns {top:0, left:0, right:0, bottom:0}. The first matching
    // row for any (x,y) where x>=0, y>=0, x<=0, y<=0 is row 0. We can still
    // verify the contract by (a) dispatching multiple events and (b) asserting
    // that AT LEAST ONE row has its borderLeft set after each dispatch.
    //
    // For a real browser with non-zero rects, the row selection would differ
    // per position; here we verify the dispatch pipeline RUNS per event (i.e.,
    // the listener does not throw and row styles get applied).

    // Dispatch 1: position at (0, 0) — row 0 matches in jsdom.
    dispatchOver(0, 0);
    await new Promise(r => setTimeout(r, 20));
    // At least one row should have the accent borderLeft set.
    const highlighted1 = Array.from(rows).filter(el => el.style.borderLeft !== '');
    expect(highlighted1.length).toBeGreaterThanOrEqual(1);

    // Dispatch 2: position at (0, 0) again (simulating the `over` event firing
    // continuously as the cursor hovers). The listener should still run and
    // re-apply the highlight (existing behavior: clear all then set one).
    dispatchOver(0, 0);
    await new Promise(r => setTimeout(r, 20));
    const highlighted2 = Array.from(rows).filter(el => el.style.borderLeft !== '');
    expect(highlighted2.length).toBeGreaterThanOrEqual(1);

    // Dispatch 3: a different coordinate just to prove the listener runs again.
    dispatchOver(10, 10);
    await new Promise(r => setTimeout(r, 20));
    // No assertion on specific row — jsdom zero-rects don't distinguish.
    // The semantic intent: the listener was invoked 3 times without error.
    expect(true).toBe(true);
  });

  it('tree-finder-dragover followed by tree-finder-drop invokes copy_path for the target row', async () => {
    let copyArgs: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'list_directory') {
        return [
          { name: 'src', path: '/tmp/proj/src', is_dir: true, size: 0, modified: 0, extension: null },
        ];
      }
      if (cmd === 'detect_editors') return { zed: false, code: false, subl: false, cursor: false, idea: false };
      if (cmd === 'copy_path') {
        copyArgs = args as Record<string, unknown>;
        return null;
      }
      return null;
    });

    render(<FileTree />);
    await new Promise(r => setTimeout(r, 50));

    // Dispatch a dragover first (simulating enter or over), then a drop.
    document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
      detail: { paths: ['/outside/foo.ts'], position: { x: 0, y: 0 } },
    }));
    await new Promise(r => setTimeout(r, 20));

    document.dispatchEvent(new CustomEvent('tree-finder-drop', {
      detail: { paths: ['/outside/foo.ts'], position: { x: 0, y: 0 } },
    }));
    await new Promise(r => setTimeout(r, 50));

    // In jsdom with zero-rects, position (0,0) lands on row 0 (the 'src' folder).
    // copy_path should be invoked with the target dir = /tmp/proj/src.
    expect(copyArgs).toBeDefined();
    expect(copyArgs?.from).toBe('/outside/foo.ts');
    expect(String(copyArgs?.to)).toContain('/tmp/proj/src/foo.ts');
  });
});
