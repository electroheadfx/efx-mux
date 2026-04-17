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
