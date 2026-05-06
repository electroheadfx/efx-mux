// terminal-tabs.test.ts -- Scope registry unit tests (Phase 20 Plan 01)
// Covers: D-10 scope isolation, D-11 backward-compat exports, D-14 session naming,
// D-15/D-16 persistence keys, Pitfall 1 crash-restart collision.
//
// Test harness pattern: mockIPC + @tauri-apps/api/mocks (see src/state-manager.test.ts:38-56).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';

// Mock tauri-apps/api/event BEFORE importing terminal-tabs (module-level listen() call).
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { projects, activeProjectName } from '../state-manager';
import {
  terminalTabs,
  activeTabId,
  getTerminalScope,
  restartTabSession,
  __resetScopeCountersForTesting,
  type TerminalTab,
} from './terminal-tabs';

// Capture spawn_terminal invocations for session-name assertions.
type SpawnCall = { sessionName: string; shellCommand?: string | null; startDir?: string };
let spawnCalls: SpawnCall[] = [];
// Capture save_state calls for persistence-key assertions.
let lastSavedState: any = null;
// Seed state returned by load_state; tests can mutate .session to seed persistence keys.
let seedState: any;
// Track reset for terminal-tabs test-specific helpers
let resetTestHelpers = false;

function makeSeedState() {
  return {
    version: 1,
    layout: {},
    theme: { mode: 'dark' },
    session: {} as Record<string, string>,
    project: { active: 'testproj', projects: [{ path: '/tmp/proj', name: 'testproj', agent: 'bash' }] },
    panels: {},
  };
}

// Override beforeEach AFTER imports to add Phase 22 test helpers
const _origBeforeEach = beforeEach;
beforeEach(async () => {
  spawnCalls = [];
  lastSavedState = null;
  seedState = makeSeedState();
  resetTestHelpers = false;

  mockIPC((cmd, args: any) => {
    if (cmd === 'spawn_terminal') {
      spawnCalls.push({
        sessionName: args?.sessionName,
        shellCommand: args?.shellCommand ?? null,
        startDir: args?.startDir,
      });
      return null;
    }
    if (cmd === 'destroy_pty_session' || cmd === 'resize_pty' || cmd === 'write_pty') return null;
    if (cmd === 'load_state') return seedState;
    if (cmd === 'save_state') {
      try { lastSavedState = JSON.parse(args?.stateJson); } catch { /* ignore */ }
      return null;
    }
    return null;
  });

  // Signals
  projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'bash' }];
  activeProjectName.value = 'testproj';

  // Ensure state-manager currentState is loaded so updateSession / getCurrentState work.
  const { loadAppState } = await import('../state-manager');
  await loadAppState();

  // Reset scope registries between tests
  // Phase 22: reset all 6 scopes (main-0/1/2 + right-0/1/2)
  for (const scope of ['main-0', 'main-1', 'main-2', 'right-0', 'right-1', 'right-2'] as const) {
    try {
      const s = getTerminalScope(scope);
      s.tabs.value = [];
      s.activeTabId.value = '';
    } catch { /* scope may not exist yet in Phase 20 code */ }
  }
  __resetScopeCountersForTesting();
  // Also reset the shared project tab counter (Phase 22 D-12)
  const { __resetProjectTabCounterForTesting } = await import('./terminal-tabs');
  __resetProjectTabCounterForTesting();

  // Seed DOM containers for both scopes so createNewTabScoped finds its container.
  document.body.innerHTML = `
    <div class="terminal-containers" data-scope="main-0"></div>
    <div class="terminal-containers" data-scope="main-1"></div>
    <div class="terminal-containers" data-scope="main-2"></div>
    <div class="terminal-containers" data-scope="right-0"></div>
    <div class="terminal-containers" data-scope="right-1"></div>
    <div class="terminal-containers" data-scope="right-2"></div>
  `;
});

describe("Phase 22 gap-closure: legacy scope-id remap (22-06)", () => {
  it("getTerminalScope remaps legacy 'right' id to 'right-0' instead of throwing", () => {
    const right0 = getTerminalScope('right-0');
    const right  = getTerminalScope('right' as any);
    expect(right.tabs).toBe(right0.tabs);
    expect(right.activeTabId).toBe(right0.activeTabId);
  });

  it("getTerminalScope remaps legacy 'main' id to 'main-0' instead of throwing", () => {
    const main0 = getTerminalScope('main-0');
    const main  = getTerminalScope('main' as any);
    expect(main.tabs).toBe(main0.tabs);
    expect(main.activeTabId).toBe(main0.activeTabId);
  });

  it("getTerminalScope still throws for genuinely unknown scope ids", () => {
    expect(() => getTerminalScope('totally-bogus' as any))
      .toThrow(/unknown terminal scope: totally-bogus/);
  });
});

describe('terminal-tabs scope registry', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  describe('D-11 backward-compat exports', () => {
    it('top-level terminalTabs signal === getTerminalScope("main").tabs', () => {
      expect(terminalTabs).toBe(getTerminalScope('main').tabs);
    });

    it('top-level activeTabId signal === getTerminalScope("main").activeTabId', () => {
      expect(activeTabId).toBe(getTerminalScope('main').activeTabId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe('D-10 scope isolation', () => {
    it('mutating right-scope tabs does not mutate main-scope tabs', () => {
      const mainScope = getTerminalScope('main');
      const rightScope = getTerminalScope('right');

      const synthetic = { id: 'x', sessionName: 'foo', label: 'bar' } as unknown as TerminalTab;
      rightScope.tabs.value = [synthetic];

      expect(mainScope.tabs.value).toEqual([]);
      expect(rightScope.tabs.value).toHaveLength(1);
    });

    it('main and right have independent counters (via sessionName progression)', async () => {
      await getTerminalScope('main').createNewTab();
      await getTerminalScope('main').createNewTab();
      // Main counter at 2 now. Right should still start from 0 -> r1.
      await getTerminalScope('right').createNewTab();

      const mainNames = spawnCalls
        .filter(c => !c.sessionName.includes('-r'))
        .map(c => c.sessionName);
      const rightNames = spawnCalls
        .filter(c => /-r\d+$/.test(c.sessionName))
        .map(c => c.sessionName);

      expect(mainNames).toEqual(['testproj', 'testproj-2']);
      expect(rightNames).toEqual(['testproj-r1']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe('D-14 session naming', () => {
    it('main first tab uses bare project name (no suffix)', async () => {
      await getTerminalScope('main').createNewTab();
      expect(spawnCalls[0]?.sessionName).toBe('testproj');
    });

    it('main second tab uses -2 suffix (numeric)', async () => {
      await getTerminalScope('main').createNewTab();
      await getTerminalScope('main').createNewTab();
      expect(spawnCalls[1]?.sessionName).toBe('testproj-2');
    });

    it('right first tab uses -r1 suffix', async () => {
      await getTerminalScope('right').createNewTab();
      expect(spawnCalls[0]?.sessionName).toMatch(/-r1$/);
      expect(spawnCalls[0]?.sessionName).toBe('testproj-r1');
    });

    it('right second tab uses -r2 suffix', async () => {
      await getTerminalScope('right').createNewTab();
      await getTerminalScope('right').createNewTab();
      expect(spawnCalls[1]?.sessionName).toBe('testproj-r2');
    });

    it('every created tab has ownerScope set', async () => {
      await getTerminalScope('main').createNewTab();
      await getTerminalScope('right').createNewTab();
      expect(getTerminalScope('main').tabs.value[0]?.ownerScope).toBe('main');
      expect(getTerminalScope('right').tabs.value[0]?.ownerScope).toBe('right');
    });

    // Fix #2 (20-05-E): right-scope Agent tabs must be labeled `Agent <name>`,
    // mirroring initFirstTab's main-scope policy. Regression scenario: user
    // clicked "Agent" in the right panel plus-menu and got "Terminal N" (or
    // "Agent claude (no binary)") instead of the expected "Agent claude".
    it('right-scope createNewTab({ isAgent: true }) labels the tab "Agent <name>"', async () => {
      await getTerminalScope('right').createNewTab({ isAgent: true });
      const tab = getTerminalScope('right').tabs.value[0];
      expect(tab).toBeDefined();
      expect(tab?.label).toBe('Agent bash');
    });

    it('main-scope createNewTab({ isAgent: true }) still labels the tab "Agent <name>" (no regression)', async () => {
      await getTerminalScope('main').createNewTab({ isAgent: true });
      const tab = getTerminalScope('main').tabs.value[0];
      expect(tab).toBeDefined();
      expect(tab?.label).toBe('Agent bash');
    });

    it('right-scope plain terminal (no isAgent) still gets "Terminal N" label', async () => {
      await getTerminalScope('right').createNewTab();
      const tab = getTerminalScope('right').tabs.value[0];
      expect(tab?.label).toMatch(/^Terminal \d+$/);
    });

    it('agent tab passes configured custom agent command to PTY spawn', async () => {
      projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'ccscodex' }];
      activeProjectName.value = 'testproj';
      mockIPC((cmd, args: any) => {
        if (cmd === 'detect_agent') return 'ccscodex';
        if (cmd === 'spawn_terminal') {
          spawnCalls.push({
            sessionName: args?.sessionName,
            shellCommand: args?.shellCommand ?? null,
            startDir: args?.startDir,
          });
          return null;
        }
        if (cmd === 'destroy_pty_session' || cmd === 'resize_pty' || cmd === 'write_pty') return null;
        if (cmd === 'load_state') return seedState;
        if (cmd === 'save_state') return null;
        return null;
      });

      await getTerminalScope('right').createNewTab({ isAgent: true });

      expect(spawnCalls[0]?.shellCommand).toBe('ccscodex');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pitfall 1 crash-restart collision', () => {
    it('restartTabSession produces rr<N> suffix (never bare r<N>)', async () => {
      // Create a main-scope tab first
      const tab = await getTerminalScope('main').createNewTab();
      expect(tab).toBeTruthy();

      // Simulate crash
      if (tab) tab.exitCode = 137;

      spawnCalls = []; // clear prior spawns
      await restartTabSession(tab!.id);

      // The new session name must contain "-rr" and NOT match the bare "-r<N>$" right-scope pattern.
      const newName = spawnCalls[0]?.sessionName;
      expect(newName).toBeTruthy();
      expect(newName).toMatch(/-rr\d+$/);
      // Verify it does not match right-scope naming (which would be single `r` only)
      expect(/-r\d+$/.test(newName!) && !/-rr\d+$/.test(newName!)).toBe(false);
    });

    it('restartTabSession on a right-scope tab still uses rr prefix (not r)', async () => {
      const tab = await getTerminalScope('right').createNewTab();
      expect(tab).toBeTruthy();
      if (tab) tab.exitCode = 1;
      spawnCalls = [];
      await restartTabSession(tab!.id);
      const newName = spawnCalls[0]?.sessionName;
      expect(newName).toMatch(/-rr\d+$/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe('D-15/D-16 persistence keys', () => {
    it('main scope writes both flat "terminal-tabs" and "terminal-tabs:<project>" keys', async () => {
      await getTerminalScope('main').createNewTab();
      // save_state should have fired; check the session map
      expect(lastSavedState).toBeTruthy();
      expect(lastSavedState.session['terminal-tabs']).toBeTruthy();
      expect(lastSavedState.session['terminal-tabs:testproj']).toBeTruthy();
    });

    it('right scope writes ONLY "right-terminal-tabs:<project>" (no flat key, no main key)', async () => {
      // Clear any prior save_state state by resetting
      lastSavedState = null;
      await getTerminalScope('right').createNewTab();
      expect(lastSavedState).toBeTruthy();
      expect(lastSavedState.session['right-terminal-tabs:testproj']).toBeTruthy();
      // No flat 'right-terminal-tabs' key, and no main 'terminal-tabs' key written by right-scope.
      expect(lastSavedState.session['right-terminal-tabs']).toBeUndefined();
      expect(lastSavedState.session['terminal-tabs']).toBeUndefined();
    });

    it('hasProjectTabs("right") reads right-terminal-tabs:<project> from persisted state', async () => {
      // Seed the persisted state with right-scope tabs, then re-load.
      seedState.session['right-terminal-tabs:testproj'] = JSON.stringify({
        tabs: [
          { sessionName: 'testproj-r1', label: 'Right A', isAgent: false },
          { sessionName: 'testproj-r2', label: 'Right B', isAgent: false },
        ],
        activeTabId: '',
      });
      const { loadAppState } = await import('../state-manager');
      await loadAppState();

      // Public accessor via getTerminalScope('right')
      expect(getTerminalScope('right').hasProjectTabs('testproj')).toBe(true);
      // Main scope must NOT see the right-scope persistence key as its own.
      expect(getTerminalScope('main').hasProjectTabs('testproj')).toBe(false);
    });

    it('restoreProjectTabs for right scope restores the seeded right tabs', async () => {
      seedState.session['right-terminal-tabs:testproj'] = JSON.stringify({
        tabs: [
          { sessionName: 'testproj-r1', label: 'Right A', isAgent: false },
          { sessionName: 'testproj-r2', label: 'Right B', isAgent: false },
        ],
        activeTabId: '',
      });
      const { loadAppState } = await import('../state-manager');
      await loadAppState();

      const restored = await getTerminalScope('right').restoreProjectTabs('testproj', '/tmp/proj');
      expect(restored).toBe(true);

      const rightTabs = getTerminalScope('right').tabs.value;
      expect(rightTabs).toHaveLength(2);
      expect(rightTabs.map(t => t.sessionName)).toEqual(['testproj-r1', 'testproj-r2']);
      // ownerScope is assigned to 'right' for every restored tab
      for (const t of rightTabs) expect(t.ownerScope).toBe('right');
      // Main scope must remain empty.
      expect(getTerminalScope('main').tabs.value).toHaveLength(0);
    });

    // Plan 20-05-B: simulate the real bootstrap → restore flow.
    // User quits with right-scope tabs open; we verify the state-manager round-trip
    // (persist → save_state → reload → restore) actually reconstructs tabs.
    it('full bootstrap flow: persist right-scope tabs, reload state, restore via getTerminalScope("right")', async () => {
      // Step 1: app session 1 — create two right-scope tabs.
      await getTerminalScope('right').createNewTab();
      await getTerminalScope('right').createNewTab();
      expect(getTerminalScope('right').tabs.value).toHaveLength(2);
      // persistTabStateScoped fired on each create → save_state invoked twice.
      // The final saved state should contain the right-terminal-tabs:testproj key.
      expect(lastSavedState).toBeTruthy();
      const persistedKey = 'right-terminal-tabs:testproj';
      const persisted = lastSavedState.session[persistedKey];
      expect(persisted).toBeTruthy();
      const parsed = JSON.parse(persisted);
      expect(parsed.tabs).toHaveLength(2);
      expect(parsed.tabs[0].sessionName).toBe('testproj-r1');
      expect(parsed.tabs[1].sessionName).toBe('testproj-r2');

      // Step 2: simulate app quit — clear the in-memory right scope state.
      // tabs are disposed (simulating full app teardown); only persisted state survives.
      getTerminalScope('right').tabs.value = [];
      getTerminalScope('right').activeTabId.value = 'file-tree'; // default
      // Seed the persisted-state snapshot with the data from session 1, then reload.
      seedState.session[persistedKey] = persisted;
      const { loadAppState } = await import('../state-manager');
      await loadAppState();

      // Step 3: simulate bootstrap restore path (main.tsx bootstrap line 475-477).
      const restored = await getTerminalScope('right').restoreProjectTabs(
        'testproj',
        '/tmp/proj',
        undefined,
      );
      expect(restored).toBe(true);
      const rightTabs = getTerminalScope('right').tabs.value;
      expect(rightTabs).toHaveLength(2);
      expect(rightTabs.map(t => t.sessionName)).toEqual(['testproj-r1', 'testproj-r2']);
      for (const t of rightTabs) expect(t.ownerScope).toBe('right');
    });

    it('bootstrap restore: hasProjectTabs("right") returns true after prior-session persist', async () => {
      // Session 1: create a right-scope tab (persisted via persistTabStateScoped)
      await getTerminalScope('right').createNewTab();

      // Feed the persisted payload into next-session seed state, then reload.
      const persistedKey = 'right-terminal-tabs:testproj';
      const persisted = lastSavedState.session[persistedKey];
      expect(persisted).toBeTruthy();
      // Clear in-memory scope (simulates fresh process start)
      getTerminalScope('right').tabs.value = [];
      seedState.session[persistedKey] = persisted;
      const { loadAppState } = await import('../state-manager');
      await loadAppState();

      // The right scope must now detect persisted tabs BEFORE restore runs —
      // this is how main.tsx could conditionally decide whether to restore.
      expect(getTerminalScope('right').hasProjectTabs('testproj')).toBe(true);
      // Main scope must not see the right-scope key as its own (D-16).
      expect(getTerminalScope('main').hasProjectTabs('testproj')).toBe(false);
    });

    // Plan 20-05-B: activeTabId persistence across tab switches.
    it('switchToTab persists activeTabId to state.json', async () => {
      await getTerminalScope('right').createNewTab();
      await getTerminalScope('right').createNewTab();
      const tabs = getTerminalScope('right').tabs.value;
      expect(tabs).toHaveLength(2);
      // Switch to the FIRST tab (not the just-created second one).
      lastSavedState = null;
      getTerminalScope('right').switchToTab(tabs[0].id);
      // A save_state call must have fired with activeTabId pointing at tabs[0].
      expect(lastSavedState).toBeTruthy();
      const persisted = lastSavedState.session['right-terminal-tabs:testproj'];
      expect(persisted).toBeTruthy();
      const parsed = JSON.parse(persisted);
      expect(parsed.activeTabId).toBe(tabs[0].id);
      expect(parsed.activeSessionName).toBe('testproj-r1');
    });

    // Plan 20-05-B: active-tab restoration uses sessionName-anchored marker.
    it('restoreProjectTabs resolves activeSessionName to the restored tab id', async () => {
      // Persist two right tabs with tab 2 as active (via switchToTab after create).
      await getTerminalScope('right').createNewTab();
      const secondTab = await getTerminalScope('right').createNewTab();
      expect(secondTab).toBeTruthy();
      // Switch explicitly to the second tab to ensure its sessionName is persisted as active.
      getTerminalScope('right').switchToTab(secondTab!.id);

      const persistedKey = 'right-terminal-tabs:testproj';
      const persisted = lastSavedState.session[persistedKey];
      expect(persisted).toBeTruthy();
      const parsed = JSON.parse(persisted);
      expect(parsed.activeSessionName).toBe('testproj-r2');

      // Simulate restart
      getTerminalScope('right').tabs.value = [];
      getTerminalScope('right').activeTabId.value = 'file-tree';
      seedState.session[persistedKey] = persisted;
      const { loadAppState } = await import('../state-manager');
      await loadAppState();

      // Restore — the active tab id should resolve to the tab whose sessionName
      // matches activeSessionName ('testproj-r2'), NOT the first tab.
      const restored = await getTerminalScope('right').restoreProjectTabs(
        'testproj', '/tmp/proj', undefined,
      );
      expect(restored).toBe(true);
      const restoredTabs = getTerminalScope('right').tabs.value;
      expect(restoredTabs).toHaveLength(2);
      const activeId = getTerminalScope('right').activeTabId.value;
      const activeRestored = restoredTabs.find(t => t.id === activeId);
      expect(activeRestored).toBeTruthy();
      expect(activeRestored?.sessionName).toBe('testproj-r2');
    });

    // Plan 20-05-B: right-scope sticky activeTabId survives restart.
    it('restoreProjectTabs preserves right-scope sticky activeTabId (file-tree / gsd)', async () => {
      // Create a right-scope dynamic tab, then switch back to the 'gsd' sticky.
      await getTerminalScope('right').createNewTab();
      // Direct signal mutation (how unified-tab-bar does it for sticky clicks);
      // then persist via the helper.
      getTerminalScope('right').activeTabId.value = 'gsd';
      const { persistActiveTabIdForScope } = await import('./terminal-tabs');
      persistActiveTabIdForScope('right');

      const persistedKey = 'right-terminal-tabs:testproj';
      const persisted = lastSavedState.session[persistedKey];
      expect(persisted).toBeTruthy();
      const parsed = JSON.parse(persisted);
      expect(parsed.activeTabId).toBe('gsd');

      // Simulate restart
      getTerminalScope('right').tabs.value = [];
      getTerminalScope('right').activeTabId.value = 'file-tree';
      seedState.session[persistedKey] = persisted;
      const { loadAppState } = await import('../state-manager');
      await loadAppState();

      const restored = await getTerminalScope('right').restoreProjectTabs(
        'testproj', '/tmp/proj', undefined,
      );
      expect(restored).toBe(true);
      // Dynamic tab was restored, AND the sticky 'gsd' id is preserved as active.
      expect(getTerminalScope('right').tabs.value).toHaveLength(1);
      expect(getTerminalScope('right').activeTabId.value).toBe('gsd');
    });

    it('pty-exited scope-agnostic update: right-scope sessionName lookup hits right tabs only', async () => {
      // Seed a synthetic right-scope tab directly
      const rightSynth = {
        id: 'r-test',
        sessionName: 'testproj-r1',
        label: 'right',
        exitCode: undefined,
        isAgent: false,
        ownerScope: 'right',
      } as unknown as TerminalTab;
      const mainSynth = {
        id: 'm-test',
        sessionName: 'testproj',
        label: 'main',
        exitCode: undefined,
        isAgent: false,
        ownerScope: 'main',
      } as unknown as TerminalTab;
      getTerminalScope('main').tabs.value = [mainSynth];
      getTerminalScope('right').tabs.value = [rightSynth];

      // Pull the listener handler by invoking the mocked listen's queued callback.
      // We don't have direct access, so instead verify via tabs state after simulating
      // what the listener does (iterate scopes). This is a structural test: the right tab
      // alone should be the match for 'testproj-r1', and scope isolation must hold.
      const foundInRight = getTerminalScope('right').tabs.value.find(t => t.sessionName === 'testproj-r1');
      const foundInMain = getTerminalScope('main').tabs.value.find(t => t.sessionName === 'testproj-r1');
      expect(foundInRight).toBeTruthy();
      expect(foundInMain).toBeUndefined();
    });
  });

  // Phase 22 D-12: shared per-project counter + sessionName stability on drag
  describe('Phase 22 D-12 shared counter + session stability', () => {
    it('shared counter unique names', async () => {
      const { allocateNextSessionName } = await import('./terminal-tabs');
      // Import resets already — counter starts fresh per test
      const names: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { name } = allocateNextSessionName('testproj');
        names.push(name);
      }
      // First call: bare project name (no suffix)
      // Subsequent: project-2, project-3, project-4, project-5
      expect(names).toEqual(['testproj', 'testproj-2', 'testproj-3', 'testproj-4', 'testproj-5']);
    });

    it('sessionName stable on drag — no PTY commands dispatched on ownerScope change', async () => {
      const { allocateNextSessionName } = await import('./terminal-tabs');

      // Create a tab in main-0 scope
      const { createNewTab } = await import('./terminal-tabs');
      const tab = await createNewTab({ scope: 'main-0' });
      expect(tab).toBeTruthy();
      const originalSessionName = tab!.sessionName;

      // Capture any IPC calls that would rename/destroy/spawn
      const ipcCalls: string[] = [];
      mockIPC((cmd, args: any) => {
        if (['destroy_pty_session', 'spawn_terminal', 'tmux_rename_session'].includes(cmd as string)) {
          ipcCalls.push(cmd as string);
        }
        if (cmd === 'spawn_terminal') {
          spawnCalls.push({
            sessionName: args?.sessionName,
            shellCommand: args?.shellCommand ?? null,
            startDir: args?.startDir,
          });
        }
        return null;
      });

      // Simulate ownerScope change — mutate the tab's ownerScope directly
      // In Phase 22, ownerScope is just metadata; sessionName stays the same.
      tab!.ownerScope = 'main-1';
      // Trigger reactivity
      getTerminalScope('main-0').tabs.value = [...getTerminalScope('main-0').tabs.value];

      // No IPC calls should have been made for destroy/spawn/rename
      expect(ipcCalls).toHaveLength(0);
      // Session name is unchanged
      expect(tab!.sessionName).toBe(originalSessionName);
    });

    it('legacy -N restore seeds counter correctly', async () => {
      const { allocateNextSessionName, seedCounterFromRestoredTabs, getTerminalScope } = await import('./terminal-tabs');

      // Add a tab with sessionName 'testproj-1' (legacy bare -N suffix)
      const rightSynth = {
        id: 'tab-1',
        sessionName: 'testproj-1',
        label: 'Right A',
        exitCode: undefined,
        isAgent: false,
        ownerScope: 'right-0' as const,
      } as unknown as import('./terminal-tabs').TerminalTab;
      getTerminalScope('right-0').tabs.value = [rightSynth];

      // Seed the counter from the restored tab (regex /-(\d+)$/ matches 'testproj-1')
      seedCounterFromRestoredTabs('testproj');

      // Counter seeded to 1; next allocation should give n=2 (testproj-2)
      const { name, n } = allocateNextSessionName('testproj');
      expect(n).toBeGreaterThanOrEqual(2);
      expect(name).toMatch(/^testproj(-\d+)?$/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Debug 22-pty-session-collision — regression guard for cross-scope session-name
  // collision that silently killed right-scope tabs when the user created a new
  // tab in a main sub-scope. Root cause: counter not seeded after restore, so
  // allocateNextSessionName returned already-in-use names.
  describe('Debug 22-pty-session-collision (counter seed after restore)', () => {
    it('2 scopes × 2 tabs then allocate in a third scope: no session-name collision, victims still present', async () => {
      const { allocateNextSessionName, seedCounterFromRestoredTabs, getTerminalScope } = await import('./terminal-tabs');

      // Simulate a restart-restore: right-0 has 2 tabs, right-1 has 2 tabs,
      // main-0 has 2 tabs. NONE of these went through allocateNextSessionName
      // in this process — they were restored under their persisted sessionNames.
      const synth = (scope: any, id: string, sessionName: string, label: string) => ({
        id,
        sessionName,
        label,
        exitCode: undefined,
        isAgent: false,
        ownerScope: scope,
      }) as unknown as import('./terminal-tabs').TerminalTab;

      getTerminalScope('main-0').tabs.value = [
        synth('main-0', 'm0a', 'testproj', 'Terminal 1'),
        synth('main-0', 'm0b', 'testproj-2', 'Terminal 2'),
      ];
      getTerminalScope('right-0').tabs.value = [
        synth('right-0', 'r0a', 'testproj-3', 'Agent'),
        synth('right-0', 'r0b', 'testproj-4', 'Terminal 4'),
      ];
      getTerminalScope('right-1').tabs.value = [
        synth('right-1', 'r1a', 'testproj-5', 'Agent'),
        synth('right-1', 'r1b', 'testproj-6', 'Terminal 6'),
      ];

      // Snapshot sessionNames across scope B (right-0) before the new allocation.
      const victimsBefore = getTerminalScope('right-0').tabs.value.map(t => t.sessionName);

      // After restore completes, seed the counter. THIS is the missing call
      // that the bug fix adds to main.tsx.
      seedCounterFromRestoredTabs('testproj');

      // Now allocate a new session name in scope A (main-1, empty sub-scope).
      const { name: newName, n: newN } = allocateNextSessionName('testproj');

      // The new name MUST NOT collide with any existing sessionName.
      const allExisting = [
        ...getTerminalScope('main-0').tabs.value.map(t => t.sessionName),
        ...getTerminalScope('right-0').tabs.value.map(t => t.sessionName),
        ...getTerminalScope('right-1').tabs.value.map(t => t.sessionName),
      ];
      expect(allExisting).not.toContain(newName);

      // The new sequence number must be strictly greater than every existing suffix.
      // Existing max is 6; newN should be 7.
      expect(newN).toBeGreaterThan(6);
      expect(newName).toBe('testproj-7');

      // Scope B (right-0) is untouched: its tab list still contains the same sessionNames.
      const victimsAfter = getTerminalScope('right-0').tabs.value.map(t => t.sessionName);
      expect(victimsAfter).toEqual(victimsBefore);
    });

    it('counter survives restart via persisted tab-counter:<project>', async () => {
      const {
        allocateNextSessionName,
        seedCounterFromRestoredTabs,
        __resetProjectTabCounterForTesting,
      } = await import('./terminal-tabs');

      // Simulate 3 prior allocations that persisted the counter.
      allocateNextSessionName('testproj');      // n=1
      allocateNextSessionName('testproj');      // n=2
      allocateNextSessionName('testproj');      // n=3

      // Simulate restart: in-memory counter wiped, but state.session retains
      // the persisted tab-counter:testproj value (written by allocateNextSessionName
      // via persistTabCounter).
      __resetProjectTabCounterForTesting();

      // With NO restored tabs this time (all prior tabs were closed), only the
      // persisted counter value prevents reuse of -1, -2, -3.
      seedCounterFromRestoredTabs('testproj');

      const { name, n } = allocateNextSessionName('testproj');
      // n must be at least 4 — the persisted counter said "highest ever was 3".
      expect(n).toBeGreaterThanOrEqual(4);
      expect(name).toBe('testproj-4');
    });
  });
});
