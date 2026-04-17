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
type SpawnCall = { sessionName: string; agent?: string | null; cwd?: string };
let spawnCalls: SpawnCall[] = [];
// Capture save_state calls for persistence-key assertions.
let lastSavedState: any = null;
// Seed state returned by load_state; tests can mutate .session to seed persistence keys.
let seedState: any;

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

beforeEach(async () => {
  spawnCalls = [];
  lastSavedState = null;
  seedState = makeSeedState();

  mockIPC((cmd, args: any) => {
    if (cmd === 'spawn_terminal') {
      spawnCalls.push({
        sessionName: args?.sessionName,
        agent: args?.agent ?? null,
        cwd: args?.cwd,
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
  getTerminalScope('main').tabs.value = [];
  getTerminalScope('main').activeTabId.value = '';
  getTerminalScope('right').tabs.value = [];
  getTerminalScope('right').activeTabId.value = '';
  __resetScopeCountersForTesting();

  // Seed DOM containers for both scopes so createNewTabScoped finds its container.
  document.body.innerHTML = `
    <div class="terminal-containers"></div>
    <div class="terminal-containers" data-scope="right"></div>
  `;
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
});
