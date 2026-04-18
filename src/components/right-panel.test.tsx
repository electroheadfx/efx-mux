// right-panel.test.tsx — Phase 20 Plan 04 integration tests
//
// Covers:
//   D-01 — single-pane right panel: no `.split-handle-h[data-handle="right-h"]`
//          element, no `.right-top` / `.right-bottom` DOM nodes anywhere
//   D-17 — new-project default: right-scope active tab = 'file-tree';
//          File Tree body display:block, GSD body display:none on first render
//   D-21 — no `switch-bash-session` document listener installed by RightPanel;
//          dispatching the event is a no-op against right-scope signals
//   Pitfall 6 — exclusive display: at any time, exactly one of (File Tree body,
//          GSD body, Git Changes body, terminal-containers wrapper) is
//          display:block; the rest are display:none.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';

import { projects, activeProjectName } from '../state-manager';
import { getTerminalScope } from './terminal-tabs';
import {
  gitChangesTab,
  activeUnifiedTabId,
  openEditorTabPinned,
  editorTabs,
  handleCrossScopeDrop,
} from './unified-tab-bar';

// Tauri event listener mock — listen() returns a no-op unsubscribe.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { RightPanel } from './right-panel';

// ─── helpers ────────────────────────────────────────────────────────────────

function getBodies(container: Element): {
  fileTree: HTMLElement;
  gsd: HTMLElement;
  terminalWrapper: HTMLElement;
  gitChanges: HTMLElement | null;
} {
  const panelContent = container.querySelector('.right-panel-content') as HTMLElement;
  expect(panelContent).not.toBeNull();
  const terminalWrapper = container.querySelector(
    '.terminal-containers[data-scope="right"]',
  ) as HTMLElement;
  expect(terminalWrapper).not.toBeNull();

  // The sticky File Tree body is the first always-mounted body; the sticky
  // GSD body is the second. Git Changes body is rendered conditionally.
  const children = Array.from(panelContent.children) as HTMLElement[];
  // First two children are File Tree and GSD. Optional third is Git Changes.
  const fileTree = children[0];
  const gsd = children[1];
  // Detect optional git-changes body — render order per component is
  // [file-tree, gsd, gitChanges?, terminal-containers]. Filter out the
  // terminal wrapper to find the optional git-changes body.
  const maybeGc = children
    .slice(2)
    .find((c) => c !== terminalWrapper) ?? null;
  return { fileTree, gsd, terminalWrapper, gitChanges: maybeGc };
}

// ─── describe groups ────────────────────────────────────────────────────────

describe('RightPanel (Phase 20, Plan 04)', () => {
  beforeEach(() => {
    projects.value = [
      { path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any,
    ];
    activeProjectName.value = 'testproj';
    // Reset right-scope to initial state (D-17 default active = file-tree).
    const right = getTerminalScope('right');
    right.tabs.value = [];
    right.activeTabId.value = 'file-tree';
    gitChangesTab.value = null;
    activeUnifiedTabId.value = '';
    // Provide a permissive IPC mock so child components (FileTree, GSDPane,
    // GitChangesTab) that fire invoke() on mount do not throw.
    mockIPC((_cmd, _args) => {
      // Return neutral defaults for any IPC the children might make.
      return null;
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ─── D-17 initial state ───────────────────────────────────────────────────

  describe('D-17 initial state', () => {
    it('renders a UnifiedTabBar scope="right" with File Tree and GSD sticky tabs', () => {
      const { container } = render(<RightPanel />);
      // Sticky File Tree and GSD tabs are rendered by the tab bar.
      expect(
        container.querySelector('[data-sticky-tab-id="file-tree"]'),
      ).not.toBeNull();
      expect(container.querySelector('[data-sticky-tab-id="gsd"]')).not.toBeNull();
    });

    it('right-scope active tab defaults to file-tree on fresh render', () => {
      expect(getTerminalScope('right').activeTabId.value).toBe('file-tree');
      const { container } = render(<RightPanel />);
      const { fileTree, gsd, terminalWrapper } = getBodies(container);
      expect(fileTree.style.display).toBe('block');
      expect(gsd.style.display).toBe('none');
      expect(terminalWrapper.style.display).toBe('none');
    });

    it('root aside has aria-label="Right panel"', () => {
      const { container } = render(<RightPanel />);
      const aside = container.querySelector('aside.right-panel');
      expect(aside).not.toBeNull();
      expect(aside?.getAttribute('aria-label')).toBe('Right panel');
    });
  });

  // ─── D-01 layout — no split handle, no bottom pane ───────────────────────

  describe('D-01 layout — no split handle, no top/bottom pane', () => {
    it('has no element with data-handle="right-h"', () => {
      const { container } = render(<RightPanel />);
      expect(container.querySelector('[data-handle="right-h"]')).toBeNull();
    });

    it('has no .right-top, .right-bottom, .right-top-content, .right-bottom-content nodes', () => {
      const { container } = render(<RightPanel />);
      expect(container.querySelector('.right-top')).toBeNull();
      expect(container.querySelector('.right-bottom')).toBeNull();
      expect(container.querySelector('.right-top-content')).toBeNull();
      expect(container.querySelector('.right-bottom-content')).toBeNull();
    });

    it('has a .terminal-containers[data-scope="right"] wrapper inside the panel content', () => {
      const { container } = render(<RightPanel />);
      const wrapper = container.querySelector(
        '.terminal-containers[data-scope="right"]',
      );
      expect(wrapper).not.toBeNull();
      // Wrapper lives inside the .right-panel-content container.
      expect(
        container.querySelector('.right-panel-content .terminal-containers[data-scope="right"]'),
      ).not.toBeNull();
    });
  });

  // ─── D-21 no switch-bash-session listener ───────────────────────────────

  describe('D-21 no switch-bash-session listener', () => {
    it('dispatching switch-bash-session does not mutate right-scope tabs or active id', () => {
      render(<RightPanel />);
      const right = getTerminalScope('right');
      const tabsBefore = right.tabs.value.length;
      const activeBefore = right.activeTabId.value;
      document.dispatchEvent(
        new CustomEvent('switch-bash-session', {
          detail: {
            currentSession: 'foo',
            targetSession: 'bar',
            startDir: '/tmp',
          },
        }),
      );
      expect(right.tabs.value.length).toBe(tabsBefore);
      expect(right.activeTabId.value).toBe(activeBefore);
    });
  });

  // ─── Pitfall 6 exclusive display ────────────────────────────────────────

  describe('Pitfall 6 exclusive display', () => {
    it('only File Tree body is visible when activeId=file-tree', () => {
      getTerminalScope('right').activeTabId.value = 'file-tree';
      const { container } = render(<RightPanel />);
      const { fileTree, gsd, terminalWrapper, gitChanges } = getBodies(container);
      expect(fileTree.style.display).toBe('block');
      expect(gsd.style.display).toBe('none');
      expect(terminalWrapper.style.display).toBe('none');
      // Git changes body is not rendered when gitChangesTab is null.
      expect(gitChanges).toBeNull();
    });

    it('only GSD body is visible when activeId=gsd', () => {
      getTerminalScope('right').activeTabId.value = 'gsd';
      const { container } = render(<RightPanel />);
      const { fileTree, gsd, terminalWrapper } = getBodies(container);
      expect(fileTree.style.display).toBe('none');
      expect(gsd.style.display).toBe('block');
      expect(terminalWrapper.style.display).toBe('none');
    });

    it('only terminal-containers wrapper is visible when activeId is a dynamic terminal id', () => {
      getTerminalScope('right').activeTabId.value = 'tab-right-123-1';
      const { container } = render(<RightPanel />);
      const { fileTree, gsd, terminalWrapper } = getBodies(container);
      expect(fileTree.style.display).toBe('none');
      expect(gsd.style.display).toBe('none');
      expect(terminalWrapper.style.display).toBe('block');
    });

    it('only Git Changes body is visible when gitChangesTab owned by right and active', () => {
      const gcId = 'git-changes-12345';
      gitChangesTab.value = {
        type: 'git-changes',
        id: gcId,
        owningScope: 'right',
      } as any;
      getTerminalScope('right').activeTabId.value = gcId;
      const { container } = render(<RightPanel />);
      const { fileTree, gsd, terminalWrapper, gitChanges } = getBodies(container);
      expect(gitChanges).not.toBeNull();
      expect(gitChanges!.style.display).toBe('block');
      expect(fileTree.style.display).toBe('none');
      expect(gsd.style.display).toBe('none');
      expect(terminalWrapper.style.display).toBe('none');
    });

    it('Git Changes body is not rendered when gitChangesTab owned by main', () => {
      gitChangesTab.value = {
        type: 'git-changes',
        id: 'git-changes-main-1',
        owningScope: 'main',
      } as any;
      const { container } = render(<RightPanel />);
      // There should be no extra body between GSD and terminal wrapper.
      const { gitChanges } = getBodies(container);
      expect(gitChanges).toBeNull();
    });
  });

  // ─── Plan 20-05-D: editor tab rendering in right panel ─────────────────────

  describe('Plan 20-05-D right-scope editor tabs', () => {
    // Use distinct project names per test so the module-private
    // _editorTabsByProject Map doesn't leak tabs across tests.
    beforeEach(() => {
      const projName = `rp-d-proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      projects.value = [{ path: '/tmp/proj', name: projName, agent: 'claude' } as any];
      activeProjectName.value = projName;
    });

    it('renders an EditorTab mount when a right-owned editor tab is active', () => {
      // Open an editor in main scope, then flip it to right via drag drop.
      openEditorTabPinned('/tmp/proj/rp-a.ts', 'rp-a.ts', 'hello');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/rp-a.ts');
      expect(ed).toBeDefined();
      handleCrossScopeDrop(ed!.id, 'main', 'irrelevant', 'right', false);
      expect(editorTabs.value.find(t => t.id === ed!.id)?.ownerScope).toBe('right');

      // Activate the editor in right scope.
      getTerminalScope('right').activeTabId.value = ed!.id;

      const { container } = render(<RightPanel />);

      // The CodeMirror container lives as a child of the right-panel-content
      // wrapper. We check for a `.cm-editor` descendant (CodeMirror root).
      // Under jsdom CodeMirror does render its DOM even without layout.
      const content = container.querySelector('.right-panel-content') as HTMLElement;
      expect(content).not.toBeNull();
      const cmRoot = content.querySelector('.cm-editor');
      expect(cmRoot).not.toBeNull();
    });

    it('hides the terminal-containers wrapper when a right editor tab is active', () => {
      openEditorTabPinned('/tmp/proj/rp-b.ts', 'rp-b.ts', 'hi');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/rp-b.ts')!;
      handleCrossScopeDrop(ed.id, 'main', 'irrelevant', 'right', false);
      getTerminalScope('right').activeTabId.value = ed.id;

      const { container } = render(<RightPanel />);
      const wrapper = container.querySelector(
        '.terminal-containers[data-scope="right"]',
      ) as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.display).toBe('none');
    });

    it('right panel does NOT mount editor tabs that still have ownerScope=main', () => {
      openEditorTabPinned('/tmp/proj/rp-c.ts', 'rp-c.ts', 'hi');
      // Intentionally do NOT cross-scope drop.
      const { container } = render(<RightPanel />);
      const content = container.querySelector('.right-panel-content') as HTMLElement;
      // No CodeMirror mount inside right panel content.
      expect(content.querySelector('.cm-editor')).toBeNull();
    });
  });
});
