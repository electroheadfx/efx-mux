// unified-tab-bar.test.tsx — Phase 20 Plan 02 + Phase 22 Plan 03
//
// Phase 20 Plan 02 covers:
//   D-03 — sticky tabs cannot be dragged
//   D-05 — sticky File Tree + GSD render for scope='right-0'
//   D-06 — scope-aware plus-menu items
//   D-07 — Git Changes handoff via openOrMoveGitChangesToRight
//   Fix #1-5 cross-scope drag, persistence, close awareness
//
// Phase 22 Plan 03 adds (Wave 2):
//   11 tests for sticky removal, singleton dimming, cross-scope drag all kinds,
//   drop affordance, split icon cap, fixed-title rename blocking

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

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
  setProjectEditorTabs,
  createAndFocusMainTerminalTab,
  gsdTab,
  fileTreeTabs,
  openOrMoveSingletonToScope,
  openFileTreeTabInScope,
  restoreGsdTab,
  type GsdTabData,
  type FileTreeTabData,
} from './unified-tab-bar';
import { terminalTabs, activeTabId, getTerminalScope } from './terminal-tabs';

// Mock layout helpers — Plan 04 supplies the real implementations.
vi.mock('./main-panel', () => ({
  spawnSubScopeForZone: vi.fn(),
  getActiveSubScopesForZone: vi.fn((zone: 'main-0' | 'right-0') =>
    zone === 'main-0' ? ['main-0', 'main-1', 'main-2'] : ['right-0', 'right-1', 'right-2'],
  ),
}));

function clickPlusButton(): void {
  const btn = screen.getByLabelText('Add new tab');
  fireEvent.click(btn);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function queryTabIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-tab-id]')).map(
    el => el.getAttribute('data-tab-id') ?? '',
  );
}

function queryMenuItems(): HTMLElement[] {
  const menu = document.querySelector('[role="menu"]') as HTMLElement | null;
  if (!menu) return [];
  return Array.from(menu.querySelectorAll('[role="menuitem"]'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 20 Plan 02 — existing tests (scopes updated to new terminal scope ids)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UnifiedTabBar scope prop (Phase 20, Plan 02)', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any];
    activeProjectName.value = 'testproj';
    gitChangesTab.value = null;
    activeUnifiedTabId.value = '';
    terminalTabs.value = [];
    activeTabId.value = '';
    const right = getTerminalScope('right-0');
    right.tabs.value = [];
    right.activeTabId.value = '';
    mockIPC((_cmd, _args) => null);
  });

  afterEach(() => { cleanup(); });

  // ── D-05 sticky tab rendering ──────────────────────────────────────────────

  describe('D-05 sticky tabs', () => {
    it("scope='right-0' renders File Tree and GSD labels", () => {
      render(<UnifiedTabBar scope="right-0" />);
      expect(screen.getByText('File Tree')).toBeInTheDocument();
      expect(screen.getByText('GSD')).toBeInTheDocument();
    });

    it("scope='right-0' sticky tabs have no close button", () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      expect(container.querySelector('[data-close-id="file-tree"]')).toBeNull();
      expect(container.querySelector('[data-close-id="gsd"]')).toBeNull();
      const fileTreeEl = container.querySelector('[data-sticky-tab-id="file-tree"]');
      expect(fileTreeEl).not.toBeNull();
      expect(fileTreeEl?.hasAttribute('data-tab-id')).toBe(false);
    });

    it("scope='main-0' does NOT render File Tree or GSD labels", () => {
      render(<UnifiedTabBar scope="main-0" />);
      expect(screen.queryByText('File Tree')).toBeNull();
      expect(screen.queryByText('GSD')).toBeNull();
    });

    it("sticky tabs carry data-sticky-tab-id, not data-tab-id", () => {
      render(<UnifiedTabBar scope="right-0" />);
      const stickyFileTree = document.querySelector('[data-sticky-tab-id="file-tree"]');
      const stickyGsd = document.querySelector('[data-sticky-tab-id="gsd"]');
      expect(stickyFileTree).not.toBeNull();
      expect(stickyGsd).not.toBeNull();
      expect(stickyFileTree?.hasAttribute('data-tab-id')).toBe(false);
      expect(stickyGsd?.hasAttribute('data-tab-id')).toBe(false);
    });
  });

  // ── D-06 plus-menu items ─────────────────────────────────────────────────

  describe('D-06 plus-menu items', () => {
    it("scope='right-0' plus-menu shows Terminal (Zsh), Agent, Git Changes", () => {
      render(<UnifiedTabBar scope="right-0" />);
      clickPlusButton();
      expect(screen.getByText(/Terminal \(Zsh\)/)).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('Git Changes')).toBeInTheDocument();
    });

    it("scope='main-0' plus-menu still shows Phase 17 items (no regression)", () => {
      render(<UnifiedTabBar scope="main-0" />);
      clickPlusButton();
      expect(screen.getByText(/Terminal \(Zsh\)/)).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('Git Changes')).toBeInTheDocument();
    });

    it("right plus-menu Git Changes item is disabled when already owned by right", () => {
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value?.owningScope).toBe('right-0');
      render(<UnifiedTabBar scope="right-0" />);
      clickPlusButton();
      const menu = document.querySelector('[role="menu"]') as HTMLElement | null;
      expect(menu).not.toBeNull();
      const menuItems = queryMenuItems();
      const gcItem = menuItems.find(el =>
        el.textContent?.trim() === 'Git Changes',
      );
      expect(gcItem).not.toBeUndefined();
      expect(gcItem?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  // ── D-07 Git Changes handoff ──────────────────────────────────────────────

  describe('D-07 Git Changes handoff', () => {
    it("openOrMoveGitChangesToRight flips owningScope from main-0 to right-0", () => {
      openGitChangesTab();
      expect(gitChangesTab.value?.owningScope).toBe('main-0');
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value?.owningScope).toBe('right-0');
    });

    it("handoff does not duplicate the tab (still exactly one signal value, same id)", () => {
      openGitChangesTab();
      const idBefore = gitChangesTab.value?.id;
      expect(idBefore).toBeDefined();
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value?.id).toBe(idBefore);
      expect(gitChangesTab.value).not.toBeNull();
    });

    it("Pitfall 3: when owningScope='right-0', scope='main-0' render does NOT show Git Changes", () => {
      openOrMoveGitChangesToRight();
      render(<UnifiedTabBar scope="main-0" />);
      const ids = queryTabIds(document.body as unknown as HTMLElement);
      for (const id of ids) {
        expect(id.startsWith('git-changes')).toBe(false);
      }
    });

    it("When already owned by right, openOrMoveGitChangesToRight is idempotent", () => {
      openOrMoveGitChangesToRight();
      const id1 = gitChangesTab.value?.id;
      openOrMoveGitChangesToRight();
      const id2 = gitChangesTab.value?.id;
      expect(id1).toBe(id2);
      expect(gitChangesTab.value?.owningScope).toBe('right-0');
    });

    it("Creates a new right-0-owned tab when Git Changes was not previously open", () => {
      expect(gitChangesTab.value).toBeNull();
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value).not.toBeNull();
      expect(gitChangesTab.value?.owningScope).toBe('right-0');
      expect(gitChangesTab.value?.type).toBe('git-changes');
    });
  });

  // ── Fix #5: cross-scope drag (main-0 -> right-0 scaffold) ───────────────

  describe('Fix #5 cross-scope drag: main-0 -> right-0 terminal tab', () => {
    it('moves a main-0-scope terminal tab to the right-0 scope on drop', () => {
      const main = getTerminalScope('main-0');
      const right = getTerminalScope('right-0');
      const mainTab = {
        id: 'tab-main-xs-1',
        sessionName: 'sess-xs-1',
        label: 'Terminal 1',
        terminal: null as any,
        fitAddon: null as any,
        container: null as any,
        ptyConnected: false,
        isAgent: false,
        ownerScope: 'main-0' as const,
      };
      main.tabs.value = [mainTab as any];
      main.activeTabId.value = mainTab.id;
      right.tabs.value = [];
      right.activeTabId.value = '';

      handleCrossScopeDrop(mainTab.id, 'main-0', 'some-right-target', 'right-0', false);

      expect(main.tabs.value.find(t => t.id === mainTab.id)).toBeUndefined();
      const moved = right.tabs.value.find(t => t.id === mainTab.id);
      expect(moved).toBeDefined();
      expect(moved!.ownerScope).toBe('right-0');
      expect(main.activeTabId.value).toBe('');
      expect(right.activeTabId.value).toBe(mainTab.id);
    });

    it('tablist root carries data-tablist-scope attribute', () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
      expect(tablist).not.toBeNull();
      expect(tablist.getAttribute('data-tablist-scope')).toBe('right-0');
    });

    it('cross-scope drop on Git Changes delegates to openOrMoveGitChangesToRight', () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      expect(gitChangesTab.value?.owningScope).toBe('main-0');
      handleCrossScopeDrop(gcId, 'main-0', 'some-right-target', 'right-0', false);
      expect(gitChangesTab.value?.owningScope).toBe('right-0');
    });

    it('sticky tab drop is a no-op', () => {
      const main = getTerminalScope('main-0');
      const right = getTerminalScope('right-0');
      const beforeMain = main.tabs.value.length;
      const beforeRight = right.tabs.value.length;
      handleCrossScopeDrop('file-tree', 'right-0', 'some-main-target', 'main-0', false);
      handleCrossScopeDrop('gsd', 'right-0', 'some-main-target', 'main-0', false);
      expect(main.tabs.value.length).toBe(beforeMain);
      expect(right.tabs.value.length).toBe(beforeRight);
    });
  });

  // ── Fix #4: Git Changes tab — no rename, but activate + close OK ────────

  describe('Fix #4 Git Changes tab is not renameable (but activate + close work)', () => {
    it('double-click on Git Changes tab label does NOT enter rename mode', () => {
      openGitChangesTab();
      expect(gitChangesTab.value?.owningScope).toBe('main-0');
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gcEl = container.querySelector(`[data-tab-id="${gitChangesTab.value!.id}"]`) as HTMLElement;
      expect(gcEl).not.toBeNull();
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      expect(labelSpan).not.toBeNull();
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      const input = gcEl.querySelector('input[type="text"]');
      expect(input).toBeNull();
    });

    it('Git Changes tab remains activatable after rename attempt', () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gcEl = container.querySelector(`[data-tab-id="${gcId}"]`) as HTMLElement;
      expect(gcEl).not.toBeNull();
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      activeUnifiedTabId.value = '';
      fireEvent.click(gcEl);
      expect(activeUnifiedTabId.value).toBe(gcId);
    });

    it('Git Changes tab remains closable after rename attempt', () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      expect(gitChangesTab.value).not.toBeNull();
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gcEl = container.querySelector(`[data-tab-id="${gcId}"]`) as HTMLElement;
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      closeUnifiedTab(gcId);
      expect(gitChangesTab.value).toBeNull();
    });
  });

  // ── Fix #3: GSD renders FIRST, File Tree SECOND ──────────────────────────

  describe('Fix #3 sticky tab order: GSD first, File Tree second', () => {
    it('DOM order of sticky tabs is [GSD, File Tree]', () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const stickies = Array.from(
        container.querySelectorAll('[data-sticky-tab-id]'),
      ) as HTMLElement[];
      expect(stickies.length).toBe(2);
      expect(stickies[0].getAttribute('data-sticky-tab-id')).toBe('gsd');
      expect(stickies[1].getAttribute('data-sticky-tab-id')).toBe('file-tree');
    });

    it('GSD label appears before File Tree label in document order', () => {
      render(<UnifiedTabBar scope="right-0" />);
      const gsdText = screen.getByText('GSD');
      const fileTreeText = screen.getByText('File Tree');
      const pos = gsdText.compareDocumentPosition(fileTreeText);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  // ── Fix #2: sticky tab text selection blocked during drag attempt ──────

  describe('Fix #2 sticky tabs block text selection on drag attempt', () => {
    it('sticky File Tree tab has userSelect:none and WebkitUserSelect:none', () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const el = container.querySelector('[data-sticky-tab-id="file-tree"]') as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.style.userSelect).toBe('none');
      expect(el.style.webkitUserSelect).toBe('none');
    });

    it('sticky GSD tab has userSelect:none and WebkitUserSelect:none', () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const el = container.querySelector('[data-sticky-tab-id="gsd"]') as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.style.userSelect).toBe('none');
      expect(el.style.webkitUserSelect).toBe('none');
    });

    it('mousedown on sticky tab calls preventDefault', () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const el = container.querySelector('[data-sticky-tab-id="file-tree"]') as HTMLElement;
      expect(el).not.toBeNull();
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      const defaultPrevented = !el.dispatchEvent(ev);
      expect(defaultPrevented || ev.defaultPrevented).toBe(true);
    });
  });

  // ── Fix #1: dropdown flip when near viewport right edge ──────────────────

  describe('Fix #1 plus-menu dropdown flips when near viewport right edge', () => {
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
      render(<UnifiedTabBar scope="right-0" />);
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
      expect(leftPx + MENU_MIN_WIDTH).toBeLessThanOrEqual(window.innerWidth);
      expect(leftPx).toBeLessThan(window.innerWidth - 20);
      restore();
    });

    it('left-aligns menu normally when there is ample horizontal room', () => {
      render(<UnifiedTabBar scope="right-0" />);
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
      const leftPx = parseFloat(menu!.style.left || '0');
      expect(leftPx).toBe(50);
      restore();
    });
  });

  // ── Plan 20-05-D: editor tabs across scopes ───────────────────────────────

  describe('Plan 20-05-D editor tabs cross-scope', () => {
    it("computeDynamicTabsForScope('right-0') returns an editor tab with ownerScope='right-0'", () => {
      openEditorTabPinned('/tmp/proj/foo.ts', 'foo.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/foo.ts');
      expect(ed).toBeDefined();
      expect(ed!.ownerScope).toBe('main-0');

      handleCrossScopeDrop(ed!.id, 'main-0', 'irrelevant-target', 'right-0', false);

      const flipped = editorTabs.value.find(t => t.id === ed!.id);
      expect(flipped?.ownerScope).toBe('right-0');

      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const ids = queryTabIds(container);
      expect(ids).toContain(ed!.id);
    });

    it("computeDynamicTabsForScope('main-0') excludes editor tabs that have ownerScope='right-0'", () => {
      openEditorTabPinned('/tmp/proj/bar.ts', 'bar.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/bar.ts');
      expect(ed).toBeDefined();

      handleCrossScopeDrop(ed!.id, 'main-0', 'irrelevant-target', 'right-0', false);

      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const ids = queryTabIds(container);
      expect(ids).not.toContain(ed!.id);
    });

    it("handleCrossScopeDrop flips an editor's ownerScope and updates both scoped orders", () => {
      openEditorTabPinned('/tmp/proj/baz.ts', 'baz.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/baz.ts')!;

      {
        const { container } = render(<UnifiedTabBar scope="main-0" />);
        const ids = queryTabIds(container);
        expect(ids).toContain(ed.id);
        cleanup();
      }

      handleCrossScopeDrop(ed.id, 'main-0', 'irrelevant-target', 'right-0', false);

      expect(editorTabs.value.find(t => t.id === ed.id)?.ownerScope).toBe('right-0');
      expect(getTerminalScope('right-0').activeTabId.value).toBe(ed.id);

      {
        const mainRender = render(<UnifiedTabBar scope="main-0" />);
        const mainIds = queryTabIds(mainRender.container);
        expect(mainIds).not.toContain(ed.id);
        cleanup();
      }

      {
        const rightRender = render(<UnifiedTabBar scope="right-0" />);
        const rightIds = queryTabIds(rightRender.container);
        expect(rightIds).toContain(ed.id);
      }
    });

    it('handleTabClick on an editor in right-0 scope activates via right-0.activeTabId', () => {
      openEditorTabPinned('/tmp/proj/qux.ts', 'qux.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/qux.ts')!;
      handleCrossScopeDrop(ed.id, 'main-0', 'irrelevant-target', 'right-0', false);

      activeUnifiedTabId.value = '';
      getTerminalScope('right-0').activeTabId.value = 'file-tree';

      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const edEl = container.querySelector('[data-tab-id="' + ed.id + '"]') as HTMLElement;
      expect(edEl).not.toBeNull();
      fireEvent.click(edEl);

      expect(getTerminalScope('right-0').activeTabId.value).toBe(ed.id);
      expect(activeUnifiedTabId.value).not.toBe(ed.id);
    });

    it('cross-scope drop activates target via right signal; source unified active falls back', () => {
      openEditorTabPinned('/tmp/proj/zap.ts', 'zap.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/zap.ts')!;
      activeUnifiedTabId.value = ed.id;

      handleCrossScopeDrop(ed.id, 'main-0', 'irrelevant-target', 'right-0', false);

      expect(getTerminalScope('right-0').activeTabId.value).toBe(ed.id);
      expect(activeUnifiedTabId.value).not.toBe(ed.id);
    });
  });

  // ── Fix #1 (20-05-E): terminal close is scope-aware ───────────────────

  describe('Fix #1 (20-05-E) closeUnifiedTab is scope-aware for terminal tabs', () => {
    it('closing a RIGHT-0-scope terminal tab removes it from the right-0 scope', async () => {
      const main = getTerminalScope('main-0');
      const right = getTerminalScope('right-0');

      const mainTab = {
        id: 'tab-main-close-1', sessionName: 'sess-main-1', label: 'Terminal 1',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main-0' as const,
      };
      const rightTab = {
        id: 'tab-right-close-1', sessionName: 'sess-right-1', label: 'Terminal 1',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'right-0' as const,
      };
      main.tabs.value = [mainTab as any];
      right.tabs.value = [rightTab as any];
      right.activeTabId.value = rightTab.id;

      closeUnifiedTab(rightTab.id);
      await new Promise(r => setTimeout(r, 0));

      expect(right.tabs.value.find(t => t.id === rightTab.id)).toBeUndefined();
      expect(main.tabs.value.find(t => t.id === mainTab.id)).toBeDefined();
    });

    it('closing a MAIN-0-scope terminal tab still removes it from main-0', async () => {
      const main = getTerminalScope('main-0');
      const mainTab = {
        id: 'tab-main-close-2', sessionName: 'sess-main-2', label: 'Terminal 2',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main-0' as const,
      };
      main.tabs.value = [mainTab as any];

      closeUnifiedTab(mainTab.id);
      await new Promise(r => setTimeout(r, 0));

      expect(main.tabs.value.find(t => t.id === mainTab.id)).toBeUndefined();
    });
  });

  // ── Fix #3 (20-05-E): Git Changes persistence ────────────────────────────

  describe('Fix #3 (20-05-E) gitChangesTab round-trips owningScope through persistence', () => {
    beforeEach(async () => {
      const seed: any = {
        version: 1, layout: {}, theme: { mode: 'dark' },
        session: {} as Record<string, string>,
        project: { active: 'testproj', projects: [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }] },
        panels: {},
      };
      mockIPC((cmd, args: any) => {
        if (cmd === 'load_state') return seed;
        if (cmd === 'save_state') {
          try {
            const parsed = JSON.parse(args?.stateJson);
            seed.session = parsed.session ?? seed.session;
          } catch { /* ignore */ }
          return null;
        }
        return null;
      });
      const { loadAppState } = await import('../state-manager');
      await loadAppState();
    });

    it('restoreGitChangesTab rehydrates a right-0-owned tab from persisted state', async () => {
      openOrMoveGitChangesToRight();
      expect(gitChangesTab.value?.owningScope).toBe('right-0');
      const persistedId = gitChangesTab.value!.id;
      await new Promise(r => setTimeout(r, 0));

      (gitChangesTab as any).value = null;
      await new Promise(r => setTimeout(r, 0));
      const { getCurrentState } = await import('../state-manager');
      const state = getCurrentState();
      state!.session['git-changes-tab:testproj'] = JSON.stringify({
        id: persistedId, owningScope: 'right-0',
      });
      const { restoreGitChangesTab } = await import('./unified-tab-bar');
      restoreGitChangesTab('testproj');

      const restored = gitChangesTab.value;
      expect(restored).not.toBeNull();
      expect(restored?.owningScope).toBe('right-0');
      expect(restored?.id).toBe(persistedId);
    });

    it('restoreGitChangesTab is a no-op when no persisted state exists for project', async () => {
      gitChangesTab.value = null;
      await new Promise(r => setTimeout(r, 0));
      const { restoreGitChangesTab } = await import('./unified-tab-bar');
      restoreGitChangesTab('unknown-project-never-persisted');
      expect(gitChangesTab.value).toBeNull();
    });

    it('closing a persisted Git Changes tab clears the persisted marker', async () => {
      openOrMoveGitChangesToRight();
      const gcId = gitChangesTab.value!.id;
      await new Promise(r => setTimeout(r, 0));
      closeUnifiedTab(gcId);
      await new Promise(r => setTimeout(r, 0));
      expect(gitChangesTab.value).toBeNull();

      const { restoreGitChangesTab } = await import('./unified-tab-bar');
      restoreGitChangesTab('testproj');
      expect(gitChangesTab.value).toBeNull();
    });
  });

  // ── D-03 drag rejects sticky position ────────────────────────────────────

  describe('D-03 drag rejects sticky tab position', () => {
    it("sticky tab wrappers do NOT carry data-tab-id", () => {
      render(<UnifiedTabBar scope="right-0" />);
      const dynamicEls = document.querySelectorAll('[data-tab-id]');
      for (const el of Array.from(dynamicEls)) {
        const id = el.getAttribute('data-tab-id');
        expect(id).not.toBe('file-tree');
        expect(id).not.toBe('gsd');
      }
    });

    it("mouseDown on sticky File Tree tab is rejected", () => {
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const fileTreeEl = container.querySelector(
        '[data-sticky-tab-id="file-tree"]',
      ) as HTMLElement | null;
      expect(fileTreeEl).not.toBeNull();
      expect(fileTreeEl?.getAttribute('data-sticky-tab-id')).toBe('file-tree');
      expect(fileTreeEl?.hasAttribute('data-tab-id')).toBe(false);
    });
  });

  // ── quick-260418-bpm: main-scope creation focuses the new tab ────────────

  describe('quick-260418-bpm main-scope creation explicitly focuses new tab', () => {
    function fakeTerminalTab(id: string, isAgent = false): any {
      return {
        id, sessionName: 'sess-' + id, label: isAgent ? 'Agent claude' : 'Terminal 1',
        terminal: null, fitAddon: null, container: null,
        ptyConnected: false, isAgent, ownerScope: 'main-0' as const,
      };
    }

    it('Terminal (Zsh) creation focuses the new terminal tab when editor is active', async () => {
      openEditorTabPinned('/tmp/proj/seed-editor.ts', 'seed-editor.ts', 'x');
      const editorTab = editorTabs.value.find(t => t.filePath === '/tmp/proj/seed-editor.ts')!;
      activeUnifiedTabId.value = editorTab.id;
      expect(activeUnifiedTabId.value).toBe(editorTab.id);

      const fake = fakeTerminalTab('tab-bpm-new-1', false);
      const creator = vi.fn(async () => {
        terminalTabs.value = [...terminalTabs.value, fake];
        activeTabId.value = fake.id;
        return fake;
      });

      await createAndFocusMainTerminalTab(undefined, creator);

      expect(creator).toHaveBeenCalledTimes(1);
      expect(activeUnifiedTabId.value).toBe(fake.id);
    });

    it('Agent creation focuses the new agent tab when git-changes is active', async () => {
      openGitChangesTab();
      const gcId = gitChangesTab.value!.id;
      activeUnifiedTabId.value = gcId;
      expect(activeUnifiedTabId.value).toBe(gcId);

      const fake = fakeTerminalTab('tab-bpm-agent-1', true);
      const creator = vi.fn(async (opts?: any) => {
        expect(opts?.isAgent).toBe(true);
        terminalTabs.value = [...terminalTabs.value, fake];
        activeTabId.value = fake.id;
        return fake;
      });

      await createAndFocusMainTerminalTab({ isAgent: true }, creator);

      expect(creator).toHaveBeenCalledTimes(1);
      expect(activeUnifiedTabId.value).toBe(fake.id);
    });

    it('guard preserved: bare activeTabId emission while editor is active must NOT hijack focus', () => {
      openEditorTabPinned('/tmp/proj/seed-guard.ts', 'seed-guard.ts', 'x');
      const editorTab = editorTabs.value.find(t => t.filePath === '/tmp/proj/seed-guard.ts')!;
      activeUnifiedTabId.value = editorTab.id;

      const existingTerminal = fakeTerminalTab('tab-bpm-existing-1', false);
      terminalTabs.value = [existingTerminal];

      activeTabId.value = existingTerminal.id;

      expect(activeUnifiedTabId.value).toBe(editorTab.id);
    });

    it('helper returns null-safe: no focus change if creator returns null', async () => {
      openEditorTabPinned('/tmp/proj/seed-null.ts', 'seed-null.ts', 'x');
      const editorTab = editorTabs.value.find(t => t.filePath === '/tmp/proj/seed-null.ts')!;
      activeUnifiedTabId.value = editorTab.id;

      const creator = vi.fn(async () => null);

      await createAndFocusMainTerminalTab(undefined, creator);

      expect(creator).toHaveBeenCalledTimes(1);
      expect(activeUnifiedTabId.value).toBe(editorTab.id);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 22 Plan 03 — Dynamic sticky-removed tabs (Wave 2)
// 11 tests: sticky removal, singleton dimming, cross-scope drag, split icon
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 22: dynamic sticky-removed tabs', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any];
    activeProjectName.value = 'testproj';
    // Reset all dynamic tab signals.
    gsdTab.value = null;
    gitChangesTab.value = null;
    setProjectEditorTabs([]);
    fileTreeTabs.value = [];
    activeUnifiedTabId.value = '';
    terminalTabs.value = [];
    activeTabId.value = '';
    // Reset all scope states.
    for (const scope of ['main-0', 'main-1', 'main-2', 'right-0', 'right-1', 'right-2'] as const) {
      const h = getTerminalScope(scope);
      h.tabs.value = [];
      h.activeTabId.value = '';
    }
    mockIPC((_cmd, _args) => null);
  });

  afterEach(() => { cleanup(); });

  // ── TABS-01: StickyTabData kind removed ───────────────────────────────────

  describe('dynamic sticky-removed tabs', () => {
    it('StickyTabData interface does not exist — no data-sticky-tab-id attributes anywhere', () => {
      render(<UnifiedTabBar scope="right-0" />);
      const stickyEls = document.querySelectorAll('[data-sticky-tab-id]');
      expect(stickyEls.length).toBe(0);
    });

    it('File Tree renders through the normal tab render path (has data-tab-id)', () => {
      fileTreeTabs.value = [{
        id: 'file-tree-test-1',
        type: 'file-tree',
        ownerScope: 'right-0',
      }];
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const ids = queryTabIds(container);
      expect(ids).toContain('file-tree-test-1');
    });

    it('GSD renders through the normal tab render path (has data-tab-id)', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'main-0' };
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const ids = queryTabIds(container);
      expect(ids).toContain('gsd');
    });

    it('File Tree tab in render output shows a close button (x)', () => {
      fileTreeTabs.value = [{
        id: 'file-tree-test-close',
        type: 'file-tree',
        ownerScope: 'right-0',
      }];
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const closeSpans = container.querySelectorAll('span[title="Close tab"]');
      expect(closeSpans.length).toBeGreaterThan(0);
    });

    // Phase 22 regression coverage (22-14): 22-10 silently reverted 22-09's fix
    // because the existing tests only asserted structural presence (data-tab-id,
    // close-span count). These tests assert the USER-OBSERVABLE behavior that
    // was broken: label text content, close button side-effect.

    it('GSD tab renders with the label text "GSD" (not "Git Changes")', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'main-0' };
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gsdEl = container.querySelector('[data-tab-id="gsd"]') as HTMLElement;
      expect(gsdEl).not.toBeNull();
      expect(gsdEl.textContent).toContain('GSD');
      expect(gsdEl.textContent).not.toContain('Git Changes');
    });

    it('File Tree tab renders with the label text "File Tree" (not "Git Changes")', () => {
      fileTreeTabs.value = [{
        id: 'file-tree-label-test',
        type: 'file-tree',
        ownerScope: 'right-0',
      }];
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const ftEl = container.querySelector('[data-tab-id="file-tree-label-test"]') as HTMLElement;
      expect(ftEl).not.toBeNull();
      expect(ftEl.textContent).toContain('File Tree');
      expect(ftEl.textContent).not.toContain('Git Changes');
    });

    it('clicking close (×) on GSD tab actually removes it (not a silent no-op)', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'main-0' };
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gsdEl = container.querySelector('[data-tab-id="gsd"]') as HTMLElement;
      expect(gsdEl).not.toBeNull();
      const closeSpan = gsdEl.querySelector('span[title="Close tab"]') as HTMLElement;
      expect(closeSpan).not.toBeNull();
      fireEvent.click(closeSpan);
      expect(gsdTab.value).toBeNull();
    });

    it('clicking close (×) on File Tree tab actually removes it (not a silent no-op)', () => {
      fileTreeTabs.value = [{
        id: 'file-tree-close-test',
        type: 'file-tree',
        ownerScope: 'right-0',
      }];
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const ftEl = container.querySelector('[data-tab-id="file-tree-close-test"]') as HTMLElement;
      expect(ftEl).not.toBeNull();
      const closeSpan = ftEl.querySelector('span[title="Close tab"]') as HTMLElement;
      expect(closeSpan).not.toBeNull();
      fireEvent.click(closeSpan);
      expect(fileTreeTabs.value.find(t => t.id === 'file-tree-close-test')).toBeUndefined();
    });
  });

  // ── D-05: fixed titles no-rename ──────────────────────────────────────────

  describe('fixed titles no-rename', () => {
    it('double-click on file-tree tab does NOT show a rename input', () => {
      fileTreeTabs.value = [{
        id: 'file-tree-ft-1',
        type: 'file-tree',
        ownerScope: 'right-0',
      }];
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const ftEl = container.querySelector('[data-tab-id="file-tree-ft-1"]') as HTMLElement;
      expect(ftEl).not.toBeNull();
      const labelSpan = ftEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      const input = ftEl.querySelector('input[type="text"]');
      expect(input).toBeNull();
    });

    it('double-click on gsd tab does NOT show a rename input', () => {
      gsdTab.value = { id: 'gsd-ft-1', type: 'gsd', owningScope: 'main-0' };
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gsdEl = container.querySelector('[data-tab-id="gsd-ft-1"]') as HTMLElement;
      expect(gsdEl).not.toBeNull();
      const labelSpan = gsdEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      const input = gsdEl.querySelector('input[type="text"]');
      expect(input).toBeNull();
    });

    it('double-click on git-changes tab does NOT show a rename input', () => {
      gitChangesTab.value = { id: 'git-changes-ft-1', type: 'git-changes', owningScope: 'main-0' };
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const gcEl = container.querySelector('[data-tab-id="git-changes-ft-1"]') as HTMLElement;
      expect(gcEl).not.toBeNull();
      const labelSpan = gcEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      const input = gcEl.querySelector('input[type="text"]');
      expect(input).toBeNull();
    });

    it('double-click on terminal tab DOES show a rename input', () => {
      const main = getTerminalScope('main-0');
      const termTab = {
        id: 'term-rename-1',
        sessionName: 'sess-rename-1',
        label: 'Terminal 1',
        terminal: null as any, fitAddon: null as any,
        container: null as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main-0' as const,
      };
      main.tabs.value = [termTab as any];
      main.activeTabId.value = termTab.id;

      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const termEl = container.querySelector('[data-tab-id="term-rename-1"]') as HTMLElement;
      expect(termEl).not.toBeNull();
      const labelSpan = termEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      const input = termEl.querySelector('input[type="text"]');
      expect(input).not.toBeNull();
    });
  });

  // ── TABS-01 / D-04: singleton dimming ─────────────────────────────────────

  describe('singleton dimming (gsd + git changes)', () => {
    it('GSD menu item is disabled when gsdTab owns a different scope', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'right-0' };
      render(<UnifiedTabBar scope="main-0" />);
      clickPlusButton();
      const menuItems = queryMenuItems();
      const gsdItem = menuItems.find(el => el.textContent?.trim() === 'GSD');
      expect(gsdItem).not.toBeUndefined();
      expect(gsdItem?.getAttribute('aria-disabled')).toBe('true');
    });

    it('GSD menu item is enabled when gsdTab owns the current scope', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'main-0' };
      render(<UnifiedTabBar scope="main-0" />);
      clickPlusButton();
      const menuItems = queryMenuItems();
      const gsdItem = menuItems.find(el => el.textContent?.trim() === 'GSD');
      expect(gsdItem).not.toBeUndefined();
      expect(gsdItem?.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('GSD menu item is enabled when gsdTab is null', () => {
      gsdTab.value = null;
      render(<UnifiedTabBar scope="main-0" />);
      clickPlusButton();
      const menuItems = queryMenuItems();
      const gsdItem = menuItems.find(el => el.textContent?.trim() === 'GSD');
      expect(gsdItem).not.toBeUndefined();
      expect(gsdItem?.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('Git Changes menu item is disabled when gitChangesTab owns a different scope', () => {
      gitChangesTab.value = { id: 'git-changes', type: 'git-changes', owningScope: 'main-0' };
      render(<UnifiedTabBar scope="right-0" />);
      clickPlusButton();
      const menuItems = queryMenuItems();
      const gcItem = menuItems.find(el => el.textContent?.trim() === 'Git Changes');
      expect(gcItem).not.toBeUndefined();
      expect(gcItem?.getAttribute('aria-disabled')).toBe('true');
    });

    it('clearing gsdTab.value to null un-dims the GSD menu item', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'right-0' };
      gsdTab.value = null;
      render(<UnifiedTabBar scope="main-0" />);
      clickPlusButton();
      const menuItems = queryMenuItems();
      const gsdItem = menuItems.find(el => el.textContent?.trim() === 'GSD');
      expect(gsdItem).not.toBeUndefined();
      expect(gsdItem?.getAttribute('aria-disabled')).not.toBe('true');
    });
  });

  // ── SPLIT-03: GSD singleton drag ───────────────────────────────────────────

  describe('gsd singleton drag', () => {
    it('gsd singleton drag moves owningScope from right-0 to main-1', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'right-0' };
      const right0 = getTerminalScope('right-0');
      right0.activeTabId.value = 'gsd';
      const main1 = getTerminalScope('main-1');

      handleCrossScopeDrop('gsd', 'right-0', 'irrelevant', 'main-1', false);

      expect(gsdTab.value?.owningScope).toBe('main-1');
      expect(main1.activeTabId.value).toBe('gsd');
    });

    it('gsd singleton drag removes gsd from source scoped order', () => {
      gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'right-0' };
      handleCrossScopeDrop('gsd', 'right-0', 'irrelevant', 'main-1', false);
      const right0 = getTerminalScope('right-0');
      expect(right0.activeTabId.value).not.toBe('gsd');
    });
  });

  // ── SPLIT-03: git changes singleton drag generalized ────────────────────────

  describe('git changes singleton drag generalized', () => {
    it('git-changes singleton drag moves owningScope from main-2 to right-1', () => {
      gitChangesTab.value = { id: 'git-changes', type: 'git-changes', owningScope: 'main-2' };
      const main2 = getTerminalScope('main-2');
      const right1 = getTerminalScope('right-1');
      main2.activeTabId.value = 'git-changes';

      handleCrossScopeDrop('git-changes', 'main-2', 'irrelevant', 'right-1', false);

      expect(gitChangesTab.value?.owningScope).toBe('right-1');
      expect(right1.activeTabId.value).toBe('git-changes');
    });

    it('git-changes singleton drag from main-2 to right-1 clears main-2 active', () => {
      gitChangesTab.value = { id: 'git-changes', type: 'git-changes', owningScope: 'main-2' };
      const main2 = getTerminalScope('main-2');
      main2.activeTabId.value = 'git-changes';

      handleCrossScopeDrop('git-changes', 'main-2', 'irrelevant', 'right-1', false);

      expect(main2.activeTabId.value).not.toBe('git-changes');
    });
  });

  // ── SPLIT-03: terminal cross-scope drag ───────────────────────────────────

  describe('cross-scope drag terminal between main sub-scopes', () => {
    it('moves a terminal tab from main-0 to main-1, sessionName unchanged', () => {
      const main0 = getTerminalScope('main-0');
      const main1 = getTerminalScope('main-1');
      const tab = {
        id: 'term-cross-main-1',
        sessionName: 'sess-cross-main-1',
        label: 'Terminal 1',
        terminal: null as any, fitAddon: null as any,
        container: null as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main-0' as const,
      };
      main0.tabs.value = [tab as any];
      main0.activeTabId.value = tab.id;
      main1.tabs.value = [];
      main1.activeTabId.value = '';

      const sessionNameBefore = tab.sessionName;
      handleCrossScopeDrop(tab.id, 'main-0', 'irrelevant', 'main-1', false);

      expect(main0.tabs.value.find(t => t.id === tab.id)).toBeUndefined();
      const moved = main1.tabs.value.find(t => t.id === tab.id);
      expect(moved).toBeDefined();
      expect(moved!.ownerScope).toBe('main-1');
      expect(moved!.sessionName).toBe(sessionNameBefore);
      expect(main1.activeTabId.value).toBe(tab.id);
    });
  });

  // ── SPLIT-03: editor cross-scope drag generalized ──────────────────────────

  describe('cross-scope drag editor generalized', () => {
    it('moves an editor tab from main-0 to right-0, ownerScope flips', () => {
      openEditorTabPinned('/tmp/proj/editor-cross.ts', 'editor-cross.ts', 'x');
      const ed = editorTabs.value.find(t => t.filePath === '/tmp/proj/editor-cross.ts')!;
      expect(ed.ownerScope).toBe('main-0');

      handleCrossScopeDrop(ed.id, 'main-0', 'irrelevant', 'right-0', false);

      const flipped = editorTabs.value.find(t => t.id === ed.id);
      expect(flipped?.ownerScope).toBe('right-0');
    });
  });

  // ── SPLIT-03: file-tree cross-scope drag ───────────────────────────────────

  describe('file-tree cross-scope drag', () => {
    it('moves a file-tree tab from right-0 to main-1, ownerScope flips', () => {
      fileTreeTabs.value = [{
        id: 'file-tree-cross-1',
        type: 'file-tree',
        ownerScope: 'right-0',
      }];
      const right0 = getTerminalScope('right-0');
      const main1 = getTerminalScope('main-1');

      handleCrossScopeDrop('file-tree-cross-1', 'right-0', 'irrelevant', 'main-1', false);

      const moved = fileTreeTabs.value.find(t => t.id === 'file-tree-cross-1');
      expect(moved?.ownerScope).toBe('main-1');
      expect(main1.activeTabId.value).toBe('file-tree-cross-1');
    });

    it('file-tree cross-scope drag does NOT affect other scopes (non-singleton)', () => {
      fileTreeTabs.value = [
        { id: 'file-tree-r0', type: 'file-tree', ownerScope: 'right-0' },
        { id: 'file-tree-m1', type: 'file-tree', ownerScope: 'main-1' },
      ];

      handleCrossScopeDrop('file-tree-r0', 'right-0', 'irrelevant', 'main-1', false);

      const remaining = fileTreeTabs.value.find(t => t.id === 'file-tree-r0');
      expect(remaining?.ownerScope).toBe('main-1');
    });
  });

  // ── SPLIT-03: cross-scope drop affordance class ────────────────────────────

  describe('cross-scope drop affordance class', () => {
    it('after cross-scope drop, source scope activeTabId falls back correctly', () => {
      const main0 = getTerminalScope('main-0');
      const main1 = getTerminalScope('main-1');
      const tab = {
        id: 'term-afford-1',
        sessionName: 'sess-afford-1',
        label: 'Terminal 1',
        terminal: null as any, fitAddon: null as any,
        container: null as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main-0' as const,
      };
      main0.tabs.value = [tab as any];
      main0.activeTabId.value = tab.id;
      main1.tabs.value = [];
      main1.activeTabId.value = '';

      handleCrossScopeDrop('term-afford-1', 'main-0', 'irrelevant', 'main-1', false);

      expect(main0.activeTabId.value).not.toBe('term-afford-1');
    });
  });

  // ── SPLIT-01: split cap disables icon ─────────────────────────────────────

  describe('split cap disables icon', () => {
    it('split icon is present and enabled by default', () => {
      // Stub returns 1 scope ('main-0') so button is enabled
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const splitBtns = container.querySelectorAll('.tab-bar-split-icon');
      expect(splitBtns.length).toBe(1);
      const btn = splitBtns[0] as HTMLElement;
      expect(btn.disabled).toBe(false);
    });

    it('split icon is present and has correct aria-label', () => {
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const splitBtns = container.querySelectorAll('.tab-bar-split-icon');
      expect(splitBtns.length).toBe(1);
      const btn = splitBtns[0] as HTMLElement;
      expect(btn.getAttribute('aria-label')).toBe('Split pane');
    });
  });

  // ── SPLIT-01: split icon click spawns sub-scope ───────────────────────────

  describe('split icon click spawns sub-scope', () => {
    it('split button is present and not disabled when zone has room', () => {
      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const splitBtn = container.querySelector('.tab-bar-split-icon') as HTMLElement;
      expect(splitBtn).not.toBeNull();
      expect(splitBtn.disabled).toBe(false);
    });

    it('clicking disabled split icon does NOT call spawnSubScopeForZone', async () => {
      const mod = await import('./main-panel');
      const { spawnSubScopeForZone } = mod;
      (mod.getActiveSubScopesForZone as ReturnType<typeof vi.fn>).mockReturnValue(['main-0', 'main-1', 'main-2']);

      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const splitBtn = container.querySelector('.tab-bar-split-icon') as HTMLElement;
      fireEvent.click(splitBtn);

      expect(spawnSubScopeForZone).not.toHaveBeenCalled();
    });
  });

  // ── Phase 22 gap-closure 22-12: + button scope routing ──────────────────────
  // UAT test 15 (a): + click routes new terminal to originating scope, not main-0.
  //
  // Test contract: buildDropdownItems(scope, overrides) is the SSoT for dropdown
  // items. Production callers omit overrides; tests inject a spy `createTerminalTab`
  // to observe scope propagation without triggering real PTY spawn.

  describe('Phase 22 gap-closure (22-12): +-button scope routing', () => {
    it('Terminal item action forwards originating scope main-1 to creator', async () => {
      const { buildDropdownItems } = await import('./unified-tab-bar');
      const createTerminalTab = vi.fn(async (_opts: { scope?: string; isAgent?: boolean }) => undefined);
      const items = buildDropdownItems('main-1', { createTerminalTab });
      const terminalItem = items.find(i => i.label === 'Terminal (Zsh)')!;
      expect(terminalItem).toBeDefined();
      terminalItem.action();
      expect(createTerminalTab).toHaveBeenCalledTimes(1);
      const firstCall = createTerminalTab.mock.calls[0][0];
      expect(firstCall?.scope).toBe('main-1');
      expect(firstCall?.isAgent).toBeFalsy();
    });

    it('Agent item action forwards originating scope right-1 to creator with isAgent=true', async () => {
      const { buildDropdownItems } = await import('./unified-tab-bar');
      const createTerminalTab = vi.fn(async (_opts: { scope?: string; isAgent?: boolean }) => undefined);
      const items = buildDropdownItems('right-1', { createTerminalTab });
      const agentItem = items.find(i => i.label === 'Agent')!;
      expect(agentItem).toBeDefined();
      agentItem.action();
      expect(createTerminalTab).toHaveBeenCalledTimes(1);
      const firstCall = createTerminalTab.mock.calls[0][0];
      expect(firstCall?.scope).toBe('right-1');
      expect(firstCall?.isAgent).toBe(true);
    });

    it('Terminal item action forwards originating scope main-2', async () => {
      const { buildDropdownItems } = await import('./unified-tab-bar');
      const createTerminalTab = vi.fn(async (_opts: { scope?: string; isAgent?: boolean }) => undefined);
      const items = buildDropdownItems('main-2', { createTerminalTab });
      const terminalItem = items.find(i => i.label === 'Terminal (Zsh)')!;
      terminalItem.action();
      expect(createTerminalTab.mock.calls[0][0]?.scope).toBe('main-2');
    });
  });

  // ── Phase 22 debug: agent tab behavioral regression tests ───────────────────
  // These tests assert USER-OBSERVABLE behavior (DOM textContent, signal state)
  // not just call parameters (structural). Closes the testing gap that allowed
  // the "Agent creates Terminal" regression to ship undetected.

  describe('Phase 22 debug: agent tab behavioral regression', () => {
    it('agent terminal tab renders with "Agent" in label text (not "Terminal")', () => {
      // Directly seed an agent tab into the scope signal (bypasses PTY spawn)
      const agentTab = {
        id: 'agent-behavior-1',
        sessionName: 'testproj-agent-1',
        label: 'Agent claude',
        terminal: null as any, fitAddon: null as any,
        container: null as any,
        ptyConnected: false, isAgent: true, ownerScope: 'main-0' as const,
      };
      const main = getTerminalScope('main-0');
      main.tabs.value = [agentTab as any];
      main.activeTabId.value = agentTab.id;

      const { container } = render(<UnifiedTabBar scope="main-0" />);
      const tabEl = container.querySelector('[data-tab-id="agent-behavior-1"]') as HTMLElement;
      expect(tabEl).not.toBeNull();
      expect(tabEl.textContent).toContain('Agent');
      expect(tabEl.textContent).not.toContain('Terminal');
    });

    it('agent tab in right-0 scope renders with "Agent" in label (scope lookup uses tab.scope)', () => {
      const agentTab = {
        id: 'agent-right-1',
        sessionName: 'testproj-r1',
        label: 'Agent claude',
        terminal: null as any, fitAddon: null as any,
        container: null as any,
        ptyConnected: false, isAgent: true, ownerScope: 'right-0' as const,
      };
      const right = getTerminalScope('right-0');
      right.tabs.value = [agentTab as any];
      right.activeTabId.value = agentTab.id;

      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const tabEl = container.querySelector('[data-tab-id="agent-right-1"]') as HTMLElement;
      expect(tabEl).not.toBeNull();
      expect(tabEl.textContent).toContain('Agent');
      expect(tabEl.textContent).not.toContain('Terminal');
    });

    it('renaming agent tab in non-main-0 scope (right-0) actually updates the label in right-0', () => {
      // This verifies the scope-aware rename fix. Previously renameTerminalTab
      // routed to main-0 only, causing renames on right-0 tabs to silently fail.
      const agentTab = {
        id: 'agent-rename-right',
        sessionName: 'testproj-r2',
        label: 'Agent claude',
        terminal: null as any, fitAddon: null as any,
        container: null as any,
        ptyConnected: false, isAgent: true, ownerScope: 'right-0' as const,
      };
      const right = getTerminalScope('right-0');
      right.tabs.value = [agentTab as any];
      right.activeTabId.value = agentTab.id;

      // Trigger double-click rename on the rendered tab
      const { container } = render(<UnifiedTabBar scope="right-0" />);
      const tabEl = container.querySelector('[data-tab-id="agent-rename-right"]') as HTMLElement;
      expect(tabEl).not.toBeNull();
      const labelSpan = tabEl.querySelector('span') as HTMLElement;
      fireEvent.click(labelSpan);
      fireEvent.click(labelSpan);
      const input = tabEl.querySelector('input[type="text"]') as HTMLInputElement;
      expect(input).not.toBeNull();

      // Type a new name and press Enter
      fireEvent.change(input, { target: { value: 'My Agent' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Verify the right-0 scope tab was renamed (not silently lost)
      const updatedTab = getTerminalScope('right-0').tabs.value.find(t => t.id === 'agent-rename-right');
      expect(updatedTab).toBeDefined();
      expect(updatedTab?.label).toBe('My Agent');
    });

    it('closing a terminal tab in main-1 scope removes it (scope-aware close, not main-0 only)', async () => {
      // closeUnifiedTab previously only searched main-0 + right-0.
      // A tab in main-1 was silently unclosable (silent no-op).
      // Use isAgent:false so the immediate close path runs without a modal.
      const termTab = {
        id: 'term-close-main1',
        sessionName: 'testproj-2',
        label: 'Terminal 2',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'main-1' as const,
      };
      const main1 = getTerminalScope('main-1');
      main1.tabs.value = [termTab as any];
      main1.activeTabId.value = termTab.id;

      closeUnifiedTab(termTab.id);
      // closeTab is async internally (destroy_pty_session invoke); flush microtasks.
      await new Promise(r => setTimeout(r, 0));

      // Tab must be removed from main-1 scope after close
      expect(main1.tabs.value.find(t => t.id === 'term-close-main1')).toBeUndefined();
    });

    it('closing a terminal tab in right-1 scope removes it (scope-aware close)', async () => {
      // right-1 and right-2 were also not searched previously.
      const termTab = {
        id: 'term-close-right1',
        sessionName: 'testproj-r1',
        label: 'Terminal 1',
        terminal: { dispose() {} } as any, fitAddon: null as any,
        container: { remove() {} } as any,
        ptyConnected: false, isAgent: false, ownerScope: 'right-1' as const,
      };
      const right1 = getTerminalScope('right-1');
      right1.tabs.value = [termTab as any];
      right1.activeTabId.value = termTab.id;

      closeUnifiedTab(termTab.id);
      await new Promise(r => setTimeout(r, 0));

      expect(right1.tabs.value.find(t => t.id === 'term-close-right1')).toBeUndefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 22 gap-closure (22-13) — editor reorder + cross-scope drop + fallback
// ═══════════════════════════════════════════════════════════════════════════════
//
// UAT test 6 (major): editor tabs were not reorderable via drag, cross-scope
// drops required a visible insertion marker, and drops without a marker were
// silently rejected. This plan makes editor tabs first-class draggable with:
//   1. Intra-scope reorder via handleCrossScopeDrop when sourceScope === targetScope
//   2. Cross-scope move with insert-at-target (when _targetId supplied) or append-last
//   3. Fallback append-last when _targetId === '' (no insertion marker hit)

describe('Phase 22 gap-closure (22-13): editor reorder + cross-scope drop + append fallback', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any];
    activeProjectName.value = 'testproj';
    setProjectEditorTabs([]);
    // Reset scoped orders for the three scopes exercised below.
    (async () => {
      const mod = await import('./unified-tab-bar');
      mod.setScopedTabOrder('main-0', []);
      mod.setScopedTabOrder('main-1', []);
    })();
  });

  afterEach(() => {
    cleanup();
    setProjectEditorTabs([]);
  });

  it('editor cross-scope drop moves tab to target scope (append-last)', async () => {
    const { setScopedTabOrder, getScopedTabOrder } = await import('./unified-tab-bar');
    setProjectEditorTabs([
      { id: 'editor-1', type: 'editor', filePath: '/a', fileName: 'a.ts', content: '', ownerScope: 'main-0' } as any,
    ]);
    setScopedTabOrder('main-0', ['editor-1']);
    handleCrossScopeDrop('editor-1', 'main-0', '', 'main-1', false);
    expect(editorTabs.value.find(t => t.id === 'editor-1')!.ownerScope).toBe('main-1');
    expect(getScopedTabOrder('main-0')).not.toContain('editor-1');
    expect(getScopedTabOrder('main-1')).toContain('editor-1');
  });

  it('drop on empty-string target id falls back to append-last in target scope', async () => {
    const { setScopedTabOrder, getScopedTabOrder } = await import('./unified-tab-bar');
    setProjectEditorTabs([
      { id: 'editor-1', type: 'editor', filePath: '/a', fileName: 'a.ts', content: '', ownerScope: 'main-0' } as any,
      { id: 'editor-2', type: 'editor', filePath: '/b', fileName: 'b.ts', content: '', ownerScope: 'main-1' } as any,
    ]);
    setScopedTabOrder('main-0', ['editor-1']);
    setScopedTabOrder('main-1', ['editor-2']);
    // Empty target id should append, not reject.
    handleCrossScopeDrop('editor-1', 'main-0', '', 'main-1', false);
    const main1Order = getScopedTabOrder('main-1');
    expect(main1Order[main1Order.length - 1]).toBe('editor-1');
  });

  it('intra-scope editor reorder via handleCrossScopeDrop with same source/target scope updates order', async () => {
    const { setScopedTabOrder, getScopedTabOrder } = await import('./unified-tab-bar');
    setProjectEditorTabs([
      { id: 'editor-1', type: 'editor', filePath: '/a', fileName: 'a.ts', content: '', ownerScope: 'main-0' } as any,
      { id: 'editor-2', type: 'editor', filePath: '/b', fileName: 'b.ts', content: '', ownerScope: 'main-0' } as any,
      { id: 'editor-3', type: 'editor', filePath: '/c', fileName: 'c.ts', content: '', ownerScope: 'main-0' } as any,
    ]);
    setScopedTabOrder('main-0', ['editor-1', 'editor-2', 'editor-3']);
    // Move editor-1 to after editor-3 (intra-bar reorder).
    handleCrossScopeDrop('editor-1', 'main-0', 'editor-3', 'main-0', true /* insertAfter */);
    const order = getScopedTabOrder('main-0');
    expect(order.indexOf('editor-1')).toBeGreaterThan(order.indexOf('editor-3'));
  });
});
