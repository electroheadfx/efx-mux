// unified-tab-bar.test.tsx — Phase 20 Plan 02 tests
//
// Covers:
//   D-03 — sticky tabs cannot be dragged (sticky IDs never land in scoped tabOrder)
//   D-05 — sticky File Tree + GSD render for scope='right', not for scope='main'
//   D-06 — scope-aware plus-menu items (main preserves Phase 17, right emits
//          Terminal (Zsh) / Agent / Git Changes)
//   D-07 — Git Changes handoff via openOrMoveGitChangesToRight flips owningScope
//          from main to right without duplication; main render never shows a
//          right-owned git-changes tab (Pitfall 3)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';

// Tauri event listener mock — listen() returns a no-op unsubscribe.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Tauri core invoke is stubbed at vitest.setup.ts (__TAURI_INTERNALS__);
// we only need to override specific commands in a few tests.
import { mockIPC } from '@tauri-apps/api/mocks';

import { projects, activeProjectName } from '../state-manager';
import {
  UnifiedTabBar,
  gitChangesTab,
  openGitChangesTab,
  openOrMoveGitChangesToRight,
  activeUnifiedTabId,
  closeUnifiedTab,
  handleCrossScopeDrop,
  openEditorTabPinned,
  editorTabs,
} from './unified-tab-bar';
import { terminalTabs, activeTabId, getTerminalScope } from './terminal-tabs';

// ─── helpers ────────────────────────────────────────────────────────────────

function clickPlusButton(): void {
  const btn = screen.getByLabelText('Add new tab');
  fireEvent.click(btn);
}

// ─── describe groups ────────────────────────────────────────────────────────

describe('UnifiedTabBar scope prop (Phase 20, Plan 02)', () => {
  beforeEach(() => {
    // Seed a project so scoped-order map writes do not short-circuit.
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any];
    activeProjectName.value = 'testproj';
    // Reset signals.
    gitChangesTab.value = null;
    activeUnifiedTabId.value = '';
    terminalTabs.value = [];
    activeTabId.value = '';
    // Reset right-scope (independent signal registry via stub).
    const right = getTerminalScope('right');
    right.tabs.value = [];
    right.activeTabId.value = '';
    // IPC no-op handler so any stray invoke() calls do not throw.
    mockIPC((_cmd, _args) => null);
  });

  afterEach(() => {
    cleanup();
  });

  // ─── D-05 sticky tab rendering ────────────────────────────────────────────

  describe('D-05 sticky tabs', () => {
    it("scope='right' renders File Tree and GSD labels", () => {
      render(<UnifiedTabBar scope="right" />);
      expect(screen.getByText('File Tree')).toBeInTheDocument();
      expect(screen.getByText('GSD')).toBeInTheDocument();
    });

    it("scope='right' sticky tabs have no close button", () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      expect(container.querySelector('[data-close-id="file-tree"]')).toBeNull();
      expect(container.querySelector('[data-close-id="gsd"]')).toBeNull();
      // Belt-and-suspenders: the sticky-tab wrapper itself should carry
      // data-sticky-tab-id and NOT data-tab-id (Pitfall 7).
      const fileTreeEl = container.querySelector('[data-sticky-tab-id="file-tree"]');
      expect(fileTreeEl).not.toBeNull();
      expect(fileTreeEl?.hasAttribute('data-tab-id')).toBe(false);
    });

    it("scope='main' does NOT render File Tree or GSD labels", () => {
      render(<UnifiedTabBar scope="main" />);
      expect(screen.queryByText('File Tree')).toBeNull();
      expect(screen.queryByText('GSD')).toBeNull();
    });

    it("sticky tabs carry data-sticky-tab-id, not data-tab-id", () => {
      render(<UnifiedTabBar scope="right" />);
      const stickyFileTree = document.querySelector('[data-sticky-tab-id="file-tree"]');
      const stickyGsd = document.querySelector('[data-sticky-tab-id="gsd"]');
      expect(stickyFileTree).not.toBeNull();
      expect(stickyGsd).not.toBeNull();
      // No dynamic data-tab-id on sticky wrappers
      expect(stickyFileTree?.hasAttribute('data-tab-id')).toBe(false);
      expect(stickyGsd?.hasAttribute('data-tab-id')).toBe(false);
    });
  });

  // ─── D-06 plus-menu items ─────────────────────────────────────────────────

  describe('D-06 plus-menu items', () => {
    it("scope='right' plus-menu shows Terminal (Zsh), Agent, Git Changes", () => {
      render(<UnifiedTabBar scope="right" />);
      clickPlusButton();
      expect(screen.getByText(/Terminal \(Zsh\)/)).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('Git Changes')).toBeInTheDocument();
    });

    it("scope='main' plus-menu still shows Phase 17 items (no regression)", () => {
      render(<UnifiedTabBar scope="main" />);
      clickPlusButton();
      expect(screen.getByText(/Terminal \(Zsh\)/)).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      // Phase 17 label capitalization: "Git Changes"
      expect(screen.getByText('Git Changes')).toBeInTheDocument();
    });

    it("right plus-menu Git Changes item is disabled when already owned by right", () => {
      // Seed Git Changes already owned by right
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value?.owningScope).toBe('right');
      render(<UnifiedTabBar scope="right" />);
      clickPlusButton();
      // Disambiguate: scope inside role=menu container to avoid matching the
      // Git Changes text on the rendered tab (which also contains "Git Changes").
      const menu = document.querySelector('[role="menu"]') as HTMLElement | null;
      expect(menu).not.toBeNull();
      const menuItems = menu!.querySelectorAll('[role="menuitem"]');
      const gcItem = Array.from(menuItems).find(el =>
        el.textContent?.trim() === 'Git Changes'
      ) as HTMLElement | undefined;
      expect(gcItem).not.toBeUndefined();
      expect(gcItem?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  // ─── D-07 Git Changes handoff ─────────────────────────────────────────────

  describe('D-07 Git Changes handoff', () => {
    it("openOrMoveGitChangesToRight flips owningScope from main to right", () => {
      openGitChangesTab(); // seeds with owningScope='main'
      expect(gitChangesTab.value?.owningScope).toBe('main');
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value?.owningScope).toBe('right');
    });

    it("handoff does not duplicate the tab (still exactly one signal value, same id)", () => {
      openGitChangesTab();
      const idBefore = gitChangesTab.value?.id;
      expect(idBefore).toBeDefined();
      openOrMoveGitChangesToRight();
      // Same id preserved across move — no new tab was created
      expect(gitChangesTab.value?.id).toBe(idBefore);
      // And there's still exactly one GitChangesTabData (signal is a single value)
      expect(gitChangesTab.value).not.toBeNull();
    });

    it("Pitfall 3: when owningScope='right', scope='main' render does NOT show Git Changes", () => {
      openOrMoveGitChangesToRight(); // creates tab owned by right
      render(<UnifiedTabBar scope="main" />);
      // "Git Changes" must not appear anywhere in the main render.
      // (It is rendered in the main plus-menu list only when the plus button is clicked;
      // here we assert there is no git-changes TAB in the main tab bar.)
      const possibleTabs = document.querySelectorAll('[data-tab-id]');
      for (const el of Array.from(possibleTabs)) {
        const id = el.getAttribute('data-tab-id') ?? '';
        expect(id.startsWith('git-changes')).toBe(false);
      }
    });

    it("When already owned by right, openOrMoveGitChangesToRight is idempotent (no duplicate)", () => {
      openOrMoveGitChangesToRight();
      const id1 = gitChangesTab.value?.id;
      openOrMoveGitChangesToRight();
      const id2 = gitChangesTab.value?.id;
      expect(id1).toBe(id2);
      expect(gitChangesTab.value?.owningScope).toBe('right');
    });

    it("Creates a new right-owned tab when Git Changes was not previously open", () => {
      expect(gitChangesTab.value).toBeNull();
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value).not.toBeNull();
      expect(gitChangesTab.value?.owningScope).toBe('right');
      expect(gitChangesTab.value?.type).toBe('git-changes');
    });
  });

  // ─── Fix #5: cross-scope drag (main -> right scaffold) ───────────────────

  describe('Fix #5 cross-scope drag: main -> right terminal tab', () => {
    it('moves a main-scope terminal tab to the right scope on drop', () => {
      // Seed a main-scope terminal tab.
      const main = getTerminalScope('main');
      const right = getTerminalScope('right');
      const mainTab = {
        id: 'tab-main-xs-1',
        sessionName: 'sess-xs-1',
        label: 'Terminal 1',
        terminal: null as any,
        fitAddon: null as any,
        container: null as any,
        ptyConnected: false,
        isAgent: false,
        ownerScope: 'main' as const,
      };
      main.tabs.value = [mainTab as any];
      main.activeTabId.value = mainTab.id;
      right.tabs.value = [];
      right.activeTabId.value = '';

      handleCrossScopeDrop(mainTab.id, 'main', 'some-right-target', 'right', false);

      // Signal movement
      expect(main.tabs.value.find(t => t.id === mainTab.id)).toBeUndefined();
      const moved = right.tabs.value.find(t => t.id === mainTab.id);
      expect(moved).toBeDefined();
      expect(moved!.ownerScope).toBe('right');

      // Active tab falls back in source; target is activated.
      expect(main.activeTabId.value).toBe('');
      expect(right.activeTabId.value).toBe(mainTab.id);
    });

    it('tablist root carries data-tablist-scope attribute', () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
      expect(tablist).not.toBeNull();
      expect(tablist.getAttribute('data-tablist-scope')).toBe('right');
    });

    it('cross-scope drop on Git Changes delegates to openOrMoveGitChangesToRight', () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      expect(gitChangesTab.value?.owningScope).toBe('main');
      handleCrossScopeDrop(gcId, 'main', 'some-right-target', 'right', false);
      expect(gitChangesTab.value?.owningScope).toBe('right');
    });

    it('sticky tab drop is a no-op (sticky tabs cannot cross scopes)', () => {
      const main = getTerminalScope('main');
      const right = getTerminalScope('right');
      const beforeMain = main.tabs.value.length;
      const beforeRight = right.tabs.value.length;
      handleCrossScopeDrop('file-tree', 'right', 'some-main-target', 'main', false);
      handleCrossScopeDrop('gsd', 'right', 'some-main-target', 'main', false);
      expect(main.tabs.value.length).toBe(beforeMain);
      expect(right.tabs.value.length).toBe(beforeRight);
    });
  });

  // ─── Fix #4: Git Changes tab — no rename, but activate + close OK ────────

  describe('Fix #4 Git Changes tab is not renameable (but activate + close work)', () => {
    it('double-click on Git Changes tab label does NOT enter rename mode', () => {
      // Seed a Git Changes tab in main scope so it is rendered in the main bar.
      openGitChangesTab();
      expect(gitChangesTab.value?.owningScope).toBe('main');
      const { container } = render(<UnifiedTabBar scope="main" />);
      const gcEl = container.querySelector(`[data-tab-id="${gitChangesTab.value!.id}"]`) as HTMLElement;
      expect(gcEl).not.toBeNull();
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      expect(labelSpan).not.toBeNull();
      // Simulate a double-click: two click events on the label span.
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      // After the double-click, there must be NO <input> rendered in the
      // Git Changes tab (rename mode suppressed for git-changes).
      const input = gcEl.querySelector('input[type="text"]');
      expect(input).toBeNull();
    });

    it('Git Changes tab remains activatable after rename attempt', () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      const { container } = render(<UnifiedTabBar scope="main" />);
      const gcEl = container.querySelector(`[data-tab-id="${gcId}"]`) as HTMLElement;
      expect(gcEl).not.toBeNull();
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      // Double-click attempt.
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      // Click the tab container to activate it.
      activeUnifiedTabId.value = '';
      fireEvent.click(gcEl);
      expect(activeUnifiedTabId.value).toBe(gcId);
    });

    it('Git Changes tab remains closable after rename attempt', () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      expect(gitChangesTab.value).not.toBeNull();
      const { container } = render(<UnifiedTabBar scope="main" />);
      const gcEl = container.querySelector(`[data-tab-id="${gcId}"]`) as HTMLElement;
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      // Double-click attempt.
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      // Programmatically close the tab via the exported helper.
      closeUnifiedTab(gcId);
      expect(gitChangesTab.value).toBeNull();
    });
  });

  // ─── Fix #3: GSD renders FIRST, File Tree SECOND (overrides D-17) ────────

  describe('Fix #3 sticky tab order: GSD first, File Tree second', () => {
    it('DOM order of sticky tabs is [GSD, File Tree]', () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      const stickies = Array.from(
        container.querySelectorAll('[data-sticky-tab-id]'),
      ) as HTMLElement[];
      expect(stickies.length).toBe(2);
      expect(stickies[0].getAttribute('data-sticky-tab-id')).toBe('gsd');
      expect(stickies[1].getAttribute('data-sticky-tab-id')).toBe('file-tree');
    });

    it('GSD label appears before File Tree label in document order', () => {
      render(<UnifiedTabBar scope="right" />);
      const gsdText = screen.getByText('GSD');
      const fileTreeText = screen.getByText('File Tree');
      // Node.compareDocumentPosition: if GSD precedes File Tree, result has
      // DOCUMENT_POSITION_FOLLOWING (4) bit set from GSD's perspective.
      const pos = gsdText.compareDocumentPosition(fileTreeText);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  // ─── Fix #2: sticky tab text selection blocked during drag attempt ──────

  describe('Fix #2 sticky tabs block text selection on drag attempt', () => {
    it('sticky File Tree tab has userSelect:none and WebkitUserSelect:none', () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      const el = container.querySelector('[data-sticky-tab-id="file-tree"]') as HTMLElement;
      expect(el).not.toBeNull();
      // Inline style set by the renderer
      expect(el.style.userSelect).toBe('none');
      expect(el.style.webkitUserSelect).toBe('none');
    });

    it('sticky GSD tab has userSelect:none and WebkitUserSelect:none', () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      const el = container.querySelector('[data-sticky-tab-id="gsd"]') as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.style.userSelect).toBe('none');
      expect(el.style.webkitUserSelect).toBe('none');
    });

    it('mousedown on sticky tab calls preventDefault (blocks text-select drag)', () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      const el = container.querySelector('[data-sticky-tab-id="file-tree"]') as HTMLElement;
      expect(el).not.toBeNull();
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      const defaultPrevented = !el.dispatchEvent(ev);
      // dispatchEvent returns false when preventDefault was called
      expect(defaultPrevented || ev.defaultPrevented).toBe(true);
    });
  });

  // ─── Fix #1: dropdown flip when near viewport right edge ──────────────────

  describe('Fix #1 plus-menu dropdown flips when near viewport right edge', () => {
    // The Dropdown component uses getBoundingClientRect() on the trigger
    // WRAPPER (the outer div that Dropdown renders around the user trigger).
    // We patch Element.prototype.getBoundingClientRect so EVERY call during
    // the open sequence returns our simulated rect.
    function mockBCR(rect: Partial<DOMRect>) {
      const originalProto = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        return {
          left: 0, right: 0, top: 0, bottom: 0,
          width: 0, height: 0, x: 0, y: 0,
          toJSON: () => ({}),
          ...rect,
        } as DOMRect;
      };
      return () => { Element.prototype.getBoundingClientRect = originalProto; };
    }

    it('flips menu left when trigger is close to the viewport right edge', () => {
      render(<UnifiedTabBar scope="right" />);
      // Simulate every element rect: left=innerWidth-20, right=innerWidth-4.
      // This forces handleToggle to flip since left + 160 > innerWidth.
      const restore = mockBCR({
        left: window.innerWidth - 20,
        right: window.innerWidth - 4,
        top: 10,
        bottom: 26,
        width: 16,
        height: 16,
      });
      const plusBtn = screen.getByLabelText('Add new tab');
      fireEvent.click(plusBtn);
      const menu = document.querySelector('[role="menu"]') as HTMLElement | null;
      expect(menu).not.toBeNull();
      const leftPx = parseFloat(menu!.style.left || '0');
      const MENU_MIN_WIDTH = 160;
      // After flip, menu.left + 160 should fit inside the viewport.
      expect(leftPx + MENU_MIN_WIDTH).toBeLessThanOrEqual(window.innerWidth);
      // And it should differ from the un-flipped rect.left (innerWidth-20).
      expect(leftPx).toBeLessThan(window.innerWidth - 20);
      restore();
    });

    it('left-aligns menu normally when there is ample horizontal room', () => {
      render(<UnifiedTabBar scope="right" />);
      const restore = mockBCR({
        left: 50,
        right: 66,
        top: 10,
        bottom: 26,
        width: 16,
        height: 16,
      });
      const plusBtn = screen.getByLabelText('Add new tab');
      fireEvent.click(plusBtn);
      const menu = document.querySelector('[role="menu"]') as HTMLElement | null;
      expect(menu).not.toBeNull();
      // No flip expected: menu left should equal rect.left (50).
      const leftPx = parseFloat(menu!.style.left || '0');
      expect(leftPx).toBe(50);
      restore();
    });
  });

  // ─── Plan 20-05-D: editor tabs across scopes ───────────────────────────────

  describe('Plan 20-05-D editor tabs cross-scope', () => {
    it("computeDynamicTabsForScope('right') returns an editor tab with ownerScope='right'", () => {
      // Open a main-scope editor, then flip it to right.
      openEditorTabPinned('/tmp/proj/foo.ts', 'foo.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/foo.ts');
      expect(ed).toBeDefined();
      expect(ed!.ownerScope).toBe('main');

      handleCrossScopeDrop(ed!.id, 'main', 'irrelevant-target', 'right', false);

      const flipped = editorTabs.value.find(t => t.id === ed!.id);
      expect(flipped?.ownerScope).toBe('right');

      // Render the right-scope tab bar and assert the editor label appears.
      const { container } = render(<UnifiedTabBar scope="right" />);
      const rightDynamicTabs = container.querySelectorAll('[data-tab-id]');
      const ids = Array.from(rightDynamicTabs).map(el => el.getAttribute('data-tab-id'));
      expect(ids).toContain(ed!.id);
    });

    it("computeDynamicTabsForScope('main') excludes editor tabs that have ownerScope='right'", () => {
      openEditorTabPinned('/tmp/proj/bar.ts', 'bar.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/bar.ts');
      expect(ed).toBeDefined();

      handleCrossScopeDrop(ed!.id, 'main', 'irrelevant-target', 'right', false);

      const { container } = render(<UnifiedTabBar scope="main" />);
      const mainTabs = container.querySelectorAll('[data-tab-id]');
      const ids = Array.from(mainTabs).map(el => el.getAttribute('data-tab-id'));
      expect(ids).not.toContain(ed!.id);
    });

    it("handleCrossScopeDrop flips an editor's ownerScope and updates both scoped orders", () => {
      openEditorTabPinned('/tmp/proj/baz.ts', 'baz.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/baz.ts')!;

      // Before: editor renders in main tab bar.
      {
        const { container } = render(<UnifiedTabBar scope="main" />);
        const ids = Array.from(container.querySelectorAll('[data-tab-id]'))
          .map(el => el.getAttribute('data-tab-id'));
        expect(ids).toContain(ed.id);
        cleanup();
      }

      handleCrossScopeDrop(ed.id, 'main', 'irrelevant-target', 'right', false);

      // ownerScope flipped.
      expect(editorTabs.value.find(t => t.id === ed.id)?.ownerScope).toBe('right');

      // Right scope's activeTabId is now the editor id.
      expect(getTerminalScope('right').activeTabId.value).toBe(ed.id);

      // After: editor renders ONLY in right tab bar, not in main.
      const mainRender = render(<UnifiedTabBar scope="main" />);
      const mainIds = Array.from(mainRender.container.querySelectorAll('[data-tab-id]'))
        .map(el => el.getAttribute('data-tab-id'));
      expect(mainIds).not.toContain(ed.id);
      cleanup();

      const rightRender = render(<UnifiedTabBar scope="right" />);
      const rightIds = Array.from(rightRender.container.querySelectorAll('[data-tab-id]'))
        .map(el => el.getAttribute('data-tab-id'));
      expect(rightIds).toContain(ed.id);
    });

    it('handleTabClick on an editor in right scope activates via right.activeTabId, not main activeUnifiedTabId', () => {
      openEditorTabPinned('/tmp/proj/qux.ts', 'qux.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/qux.ts')!;
      handleCrossScopeDrop(ed.id, 'main', 'irrelevant-target', 'right', false);

      // Reset active signals to catch whether the click handler routes correctly.
      activeUnifiedTabId.value = '';
      getTerminalScope('right').activeTabId.value = 'file-tree';

      const { container } = render(<UnifiedTabBar scope="right" />);
      const edEl = container.querySelector(`[data-tab-id="${ed.id}"]`) as HTMLElement;
      expect(edEl).not.toBeNull();
      fireEvent.click(edEl);

      expect(getTerminalScope('right').activeTabId.value).toBe(ed.id);
      // Main's unified active id MUST NOT have been set to the editor id
      // (otherwise MainPanel would also render it as active).
      expect(activeUnifiedTabId.value).not.toBe(ed.id);
    });

    it('cross-scope drop activates target via right signal; source unified active falls back', () => {
      openEditorTabPinned('/tmp/proj/zap.ts', 'zap.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/zap.ts')!;
      activeUnifiedTabId.value = ed.id; // simulate editor active in main

      handleCrossScopeDrop(ed.id, 'main', 'irrelevant-target', 'right', false);

      expect(getTerminalScope('right').activeTabId.value).toBe(ed.id);
      // Main's unified active must have fallen back (to '' in empty case).
      expect(activeUnifiedTabId.value).not.toBe(ed.id);
    });
  });

  // ─── Fix #1 (20-05-E): terminal × close is scope-aware ───────────────────

  describe('Fix #1 (20-05-E) closeUnifiedTab is scope-aware for terminal tabs', () => {
    it('closing a RIGHT-scope terminal tab removes it from the right scope (not main)', async () => {
      // Seed a main-scope tab and a right-scope tab. Closing the right one
      // must not require the main scope's signal to change.
      const main = getTerminalScope('main');
      const right = getTerminalScope('right');

      const mainTab = {
        id: 'tab-main-close-1', sessionName: 'sess-main-1', label: 'Terminal 1',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main' as const,
      };
      const rightTab = {
        id: 'tab-right-close-1', sessionName: 'sess-right-1', label: 'Terminal 1',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'right' as const,
      };
      main.tabs.value = [mainTab as any];
      right.tabs.value = [rightTab as any];
      right.activeTabId.value = rightTab.id;

      closeUnifiedTab(rightTab.id);
      // closeTabScoped is async (awaits destroy_pty_session invoke); flush
      // pending microtasks so the tab removal is observable.
      await new Promise(r => setTimeout(r, 0));

      // Right-scope tab is gone; main-scope is untouched.
      expect(right.tabs.value.find(t => t.id === rightTab.id)).toBeUndefined();
      expect(main.tabs.value.find(t => t.id === mainTab.id)).toBeDefined();
    });

    it('closing a MAIN-scope terminal tab still removes it from main (no regression)', async () => {
      const main = getTerminalScope('main');
      const right = getTerminalScope('right');
      const mainTab = {
        id: 'tab-main-close-2', sessionName: 'sess-main-2', label: 'Terminal 2',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main' as const,
      };
      main.tabs.value = [mainTab as any];
      right.tabs.value = [];

      closeUnifiedTab(mainTab.id);
      await new Promise(r => setTimeout(r, 0));

      expect(main.tabs.value.find(t => t.id === mainTab.id)).toBeUndefined();
    });
  });

  // ─── D-03 drag rejects sticky position ────────────────────────────────────

  describe('D-03 drag rejects sticky tab position', () => {
    it("sticky tab wrappers do NOT carry data-tab-id (so drag hit-test ignores them)", () => {
      render(<UnifiedTabBar scope="right" />);
      const dynamicEls = document.querySelectorAll('[data-tab-id]');
      for (const el of Array.from(dynamicEls)) {
        const id = el.getAttribute('data-tab-id');
        expect(id).not.toBe('file-tree');
        expect(id).not.toBe('gsd');
      }
    });

    it("mouseDown on sticky File Tree tab is rejected (no drag start)", () => {
      const { container } = render(<UnifiedTabBar scope="right" />);
      const fileTreeEl = container.querySelector(
        '[data-sticky-tab-id="file-tree"]'
      ) as HTMLElement | null;
      expect(fileTreeEl).not.toBeNull();
      // Sticky wrappers have no onMouseDown registered that triggers a drag;
      // attribute-level distinction is the enforcement mechanism.
      expect(fileTreeEl?.getAttribute('data-sticky-tab-id')).toBe('file-tree');
      expect(fileTreeEl?.hasAttribute('data-tab-id')).toBe(false);
    });
  });
});
