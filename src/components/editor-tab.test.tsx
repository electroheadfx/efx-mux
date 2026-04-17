// editor-tab.test.tsx -- Phase 18 Plan 11 (Gap G-01 secondary fix)
//
// Tests for the auto-close-on-deleted-file behavior added in Plan 11.
// Setup mirrors file-tree.test.tsx: jsdom + mockIPC + capture of the
// git-status-changed listener so we can invoke it synchronously in tests.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';

// Module-level listener capture (mirror Plan 18-08 pattern).
let capturedGitStatusListener: (() => void) | null = null;

vi.mock('@tauri-apps/api/event', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/event')>('@tauri-apps/api/event');
  return {
    ...actual,
    listen: vi.fn().mockImplementation(async (event: string, cb: () => void) => {
      if (event === 'git-status-changed') capturedGitStatusListener = cb;
      return () => {};
    }),
  };
});

import { EditorTab } from './editor-tab';
import { editorTabs, openEditorTab, activeUnifiedTabId } from './unified-tab-bar';
import { activeProjectName, projects } from '../state-manager';

describe('editor-tab file-deletion auto-close (Gap G-01)', () => {
  beforeEach(() => {
    cleanup();
    capturedGitStatusListener = null;
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';

    // Clear any leftover tabs from prior tests.
    // (openEditorTab appends; there's no clear helper, so we simulate it by
    //  pushing a fresh tab and tracking its id.)
  });

  it('closes the editor tab when readFile throws "No such file" on git-status-changed', async () => {
    // Seed an editor tab.
    openEditorTab('/tmp/proj/foo.ts', 'foo.ts', 'initial content');
    await new Promise(r => setTimeout(r, 20));
    const initialCount = editorTabs.value.length;
    expect(initialCount).toBeGreaterThanOrEqual(1);
    const fooTab = editorTabs.value.find(t => t.filePath === '/tmp/proj/foo.ts');
    expect(fooTab).toBeDefined();
    activeUnifiedTabId.value = fooTab!.id;

    // Mock IPC: read_file_content throws "No such file or directory" on call.
    mockIPC((cmd, _args) => {
      if (cmd === 'read_file_content') {
        throw new Error('No such file or directory (os error 2)');
      }
      return null;
    });

    // Mount an EditorTab instance for the seeded tab so its useEffect registers
    // the git-status-changed listener.
    render(
      <EditorTab
        tabId={fooTab!.id}
        filePath={fooTab!.filePath}
        fileName={fooTab!.fileName}
        content={fooTab!.content}
        isActive={true}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    expect(capturedGitStatusListener).not.toBeNull();

    // Fire the listener -- it will call readFile -> throw -> close the tab.
    capturedGitStatusListener!();
    await new Promise(r => setTimeout(r, 100));

    // Assert: the foo.ts tab is GONE from editorTabs.value.
    const stillThere = editorTabs.value.find(t => t.filePath === '/tmp/proj/foo.ts');
    expect(stillThere).toBeUndefined();
  });

  it('keeps the tab open when readFile throws a transient error (permission denied, etc.)', async () => {
    // Seed a second editor tab.
    openEditorTab('/tmp/proj/bar.ts', 'bar.ts', 'bar content');
    await new Promise(r => setTimeout(r, 20));
    const barTab = editorTabs.value.find(t => t.filePath === '/tmp/proj/bar.ts');
    expect(barTab).toBeDefined();
    activeUnifiedTabId.value = barTab!.id;

    // Mock IPC: read_file_content throws a permission error (NOT file-not-found).
    mockIPC((cmd, _args) => {
      if (cmd === 'read_file_content') {
        throw new Error('Permission denied (os error 13)');
      }
      return null;
    });

    render(
      <EditorTab
        tabId={barTab!.id}
        filePath={barTab!.filePath}
        fileName={barTab!.fileName}
        content={barTab!.content}
        isActive={true}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    expect(capturedGitStatusListener).not.toBeNull();

    capturedGitStatusListener!();
    await new Promise(r => setTimeout(r, 100));

    // Tab should STILL exist -- only file-not-found triggers auto-close.
    const stillThere = editorTabs.value.find(t => t.filePath === '/tmp/proj/bar.ts');
    expect(stillThere).toBeDefined();
  });
});
