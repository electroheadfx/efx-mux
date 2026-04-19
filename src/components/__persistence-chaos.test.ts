// __persistence-chaos.test.ts -- Behavioral regression tests for debug session
// 22-persistence-chaos. Simulates the full quit → restart round-trip for
// terminal-tab + sub-scope persistence.
//
// These tests deliberately bypass the "mock saveProjectTabs call count" anti-
// pattern and assert on the actual round-trip: what is written to the mocked
// state.json, what the restore path restores when that state is fed back in.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { projects, activeProjectName, loadAppState } from '../state-manager';
import {
  getTerminalScope,
  __resetScopeCountersForTesting,
  __resetProjectTabCounterForTesting,
} from './terminal-tabs';

// Capture all spawn_terminal invocations so we can assert on force_new behavior.
type SpawnCall = {
  sessionName: string;
  shellCommand: string | null;
  forceNew: boolean;
};
let spawnCalls: SpawnCall[] = [];
let lastSavedState: any = null;
let seedState: any;

function makeSeedState() {
  return {
    version: 1,
    layout: {},
    theme: { mode: 'dark' },
    session: {} as Record<string, string>,
    project: {
      active: 'proj-a',
      projects: [
        { path: '/tmp/proj-a', name: 'proj-a', agent: 'claude' },
        { path: '/tmp/proj-b', name: 'proj-b', agent: 'claude' },
      ],
    },
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
        shellCommand: args?.shellCommand ?? null,
        forceNew: !!args?.forceNew,
      });
      return null;
    }
    if (cmd === 'destroy_pty_session' || cmd === 'resize_pty' || cmd === 'write_pty' || cmd === 'ack_bytes') return null;
    if (cmd === 'load_state') return seedState;
    if (cmd === 'save_state') {
      try { lastSavedState = JSON.parse(args?.stateJson); } catch { /* ignore */ }
      return null;
    }
    return null;
  });

  projects.value = seedState.project.projects;
  activeProjectName.value = 'proj-a';

  await loadAppState();

  for (const scope of ['main-0', 'main-1', 'main-2', 'right-0', 'right-1', 'right-2'] as const) {
    const s = getTerminalScope(scope);
    s.tabs.value = [];
    s.activeTabId.value = '';
  }
  __resetScopeCountersForTesting();
  __resetProjectTabCounterForTesting();

  document.body.innerHTML = `
    <div class="terminal-containers" data-scope="main-0"></div>
    <div class="terminal-containers" data-scope="main-1"></div>
    <div class="terminal-containers" data-scope="main-2"></div>
    <div class="terminal-containers" data-scope="right-0"></div>
    <div class="terminal-containers" data-scope="right-1"></div>
    <div class="terminal-containers" data-scope="right-2"></div>
  `;
});

describe('22-persistence-chaos: label round-trip', () => {
  it('label survives quit → restart verbatim (no truncation on whitespace)', async () => {
    // Simulate user quit: the currently persisted state already contains a tab
    // with a multi-word label.
    seedState.session['terminal-tabs:proj-a:main-0'] = JSON.stringify({
      tabs: [
        { sessionName: 'proj-a', label: 'Agent claude', isAgent: true },
        { sessionName: 'proj-a-2', label: 'Terminal 1', isAgent: false },
      ],
      activeTabId: '',
      activeSessionName: 'proj-a',
    });
    await loadAppState();

    // Simulate restart: restore the main scope.
    const ok = await getTerminalScope('main-0').restoreProjectTabs('proj-a', '/tmp/proj-a', '/usr/local/bin/claude');
    expect(ok).toBe(true);

    const tabs = getTerminalScope('main-0').tabs.value;
    expect(tabs.map(t => t.label)).toEqual(['Agent claude', 'Terminal 1']);
  });

  it('label with unicode and punctuation survives round-trip', async () => {
    seedState.session['terminal-tabs:proj-a:main-0'] = JSON.stringify({
      tabs: [
        { sessionName: 'proj-a', label: 'My · Weird (Label) 🚀', isAgent: false },
      ],
      activeTabId: '',
    });
    await loadAppState();

    await getTerminalScope('main-0').restoreProjectTabs('proj-a', '/tmp/proj-a');
    const tabs = getTerminalScope('main-0').tabs.value;
    expect(tabs[0].label).toBe('My · Weird (Label) 🚀');
  });
});

describe('22-persistence-chaos: agent tab reattach (not respawn)', () => {
  it('restore path does NOT pass forceNew=true to spawn_terminal', async () => {
    // Seed: one persisted agent tab.
    seedState.session['terminal-tabs:proj-a:main-0'] = JSON.stringify({
      tabs: [
        { sessionName: 'proj-a', label: 'Agent claude', isAgent: true },
      ],
      activeTabId: '',
    });
    await loadAppState();

    await getTerminalScope('main-0').restoreProjectTabs('proj-a', '/tmp/proj-a', '/usr/local/bin/claude');

    // The restore path must NOT set forceNew — that is reserved for createNewTab.
    // If forceNew were true, pty.rs would kill the live tmux session and re-spawn
    // claude from scratch (the root cause of "Agent gets crazy / [exited]").
    expect(spawnCalls.length).toBeGreaterThan(0);
    for (const call of spawnCalls) {
      expect(call.forceNew).toBe(false);
    }
  });

  it('createNewTab path DOES pass forceNew=true', async () => {
    await getTerminalScope('main-0').createNewTab({ isAgent: false });
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].forceNew).toBe(true);
  });
});

describe('22-persistence-chaos: no cross-project state bleed', () => {
  it('restoring proj-a does not surface tabs persisted under proj-b', async () => {
    // Both projects have persisted tabs under the correct per-scope keys.
    seedState.session['terminal-tabs:proj-a:main-0'] = JSON.stringify({
      tabs: [{ sessionName: 'proj-a', label: 'A-Main', isAgent: false }],
      activeTabId: '',
    });
    seedState.session['terminal-tabs:proj-b:main-0'] = JSON.stringify({
      tabs: [{ sessionName: 'proj-b', label: 'B-Main', isAgent: false }],
      activeTabId: '',
    });
    // Also a stale legacy flat key that the buggy bootstrap used to read.
    seedState.session['terminal-tabs'] = JSON.stringify({
      tabs: [{ sessionName: 'ghost', label: 'Ghost-From-Legacy', isAgent: false }],
      activeTabId: '',
    });
    await loadAppState();

    // Restore only proj-a's main-0 scope.
    await getTerminalScope('main-0').restoreProjectTabs('proj-a', '/tmp/proj-a');

    const tabs = getTerminalScope('main-0').tabs.value;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].label).toBe('A-Main');
    // Confirm the ghost from the stale legacy flat key did NOT leak through.
    expect(tabs.map(t => t.label)).not.toContain('Ghost-From-Legacy');
  });

  it('restoring a project with no persisted tabs returns false (does not fall back to any other project)', async () => {
    seedState.session['terminal-tabs:proj-b:main-0'] = JSON.stringify({
      tabs: [{ sessionName: 'proj-b', label: 'B-Main', isAgent: false }],
      activeTabId: '',
    });
    await loadAppState();

    const restored = await getTerminalScope('main-0').restoreProjectTabs('proj-a', '/tmp/proj-a');
    expect(restored).toBe(false);
    expect(getTerminalScope('main-0').tabs.value).toHaveLength(0);
  });
});

describe('22-persistence-chaos: all main sub-scopes restore', () => {
  it('each of main-0, main-1, main-2 restores from its own per-scope key', async () => {
    seedState.session['terminal-tabs:proj-a:main-0'] = JSON.stringify({
      tabs: [{ sessionName: 'proj-a', label: 'Main-0 tab', isAgent: false }],
      activeTabId: '',
    });
    seedState.session['terminal-tabs:proj-a:main-1'] = JSON.stringify({
      tabs: [{ sessionName: 'proj-a-2', label: 'Main-1 tab', isAgent: false }],
      activeTabId: '',
    });
    seedState.session['terminal-tabs:proj-a:main-2'] = JSON.stringify({
      tabs: [{ sessionName: 'proj-a-3', label: 'Main-2 tab', isAgent: false }],
      activeTabId: '',
    });
    await loadAppState();

    // Simulate the bootstrap loop over active main sub-scopes.
    for (const scope of ['main-0', 'main-1', 'main-2'] as const) {
      await getTerminalScope(scope).restoreProjectTabs('proj-a', '/tmp/proj-a');
    }

    expect(getTerminalScope('main-0').tabs.value[0]?.label).toBe('Main-0 tab');
    expect(getTerminalScope('main-1').tabs.value[0]?.label).toBe('Main-1 tab');
    expect(getTerminalScope('main-2').tabs.value[0]?.label).toBe('Main-2 tab');
  });
});

describe('22-persistence-chaos: persistence write format', () => {
  it('creating a tab writes ONLY the per-scope key, never the legacy flat key', async () => {
    await getTerminalScope('main-0').createNewTab({ isAgent: false });

    expect(lastSavedState).toBeTruthy();
    // The correct key must be present.
    expect(lastSavedState.session['terminal-tabs:proj-a:main-0']).toBeTruthy();
    // The legacy flat keys must NOT be written (preventing reintroduction of the bleed).
    expect(lastSavedState.session['terminal-tabs']).toBeUndefined();
    expect(lastSavedState.session['terminal-tabs:proj-a']).toBeUndefined();
  });
});
