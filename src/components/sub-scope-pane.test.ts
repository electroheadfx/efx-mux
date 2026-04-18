// src/components/sub-scope-pane.test.ts
// Phase 22 gap-closure (22-07): per-project split state + first-launch flag.
// RED tests — the APIs they exercise (per-project restoreActiveSubScopes,
// shouldSeedFirstLaunch, markFirstLaunchSeeded) do not yet exist.

import { describe, it, expect, beforeEach } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import {
  spawnSubScopeForZone,
  getActiveSubScopesForZone,
  restoreActiveSubScopes,
  __resetActiveSubScopesForTesting,
  shouldSeedFirstLaunch,
  markFirstLaunchSeeded,
  activeMainSubScopes,
  activeRightSubScopes,
  closeSubScope,
} from './sub-scope-pane';
import { activeProjectName, loadAppState } from '../state-manager';
import { gsdTab, gitChangesTab, fileTreeTabs, setProjectEditorTabs } from './unified-tab-bar';
import { getTerminalScope } from './terminal-tabs';

describe('Phase 22 gap-closure (22-07): per-project split state', () => {
  let savedStates: any[] = [];
  let layoutPatches: any[] = [];

  beforeEach(async () => {
    savedStates = [];
    layoutPatches = [];
    __resetActiveSubScopesForTesting();
    activeProjectName.value = null;
    document.documentElement.style.removeProperty('--main-split-0-pct');
    document.documentElement.style.removeProperty('--main-split-1-pct');
    document.documentElement.style.removeProperty('--right-split-0-pct');
    document.documentElement.style.removeProperty('--right-split-1-pct');

    mockIPC((cmd, args) => {
      if (cmd === 'load_state') {
        return {
          version: 1,
          layout: {
            'main-active-subscopes:projB': '["main-0","main-1","main-2"]',
            'main-active-subscopes': '["main-0"]', // stale global, must be ignored
            'main-split-0-pct:projC': '60.0%',
          },
          theme: { mode: 'dark' },
          session: {},
          project: { active: null, projects: [] },
          panels: {},
        };
      }
      if (cmd === 'save_state') {
        savedStates.push(args);
        const state = JSON.parse((args as any).stateJson);
        layoutPatches.push(state.layout);
        return undefined;
      }
      return undefined;
    });
    await loadAppState();
  });

  it('spawnSubScopeForZone uses per-project key when project is active', () => {
    activeProjectName.value = 'projA';
    spawnSubScopeForZone('main');
    const lastPatch = layoutPatches[layoutPatches.length - 1];
    expect(lastPatch).toHaveProperty('main-active-subscopes:projA');
    expect(lastPatch['main-active-subscopes:projA']).toBe('["main-0","main-1"]');
    // The stale bare global key must NOT have been overwritten to the new
    // per-project value — spawnSubScopeForZone's write targets the per-project
    // key only. (The bare key remains at its pre-existing fixture value.)
    expect(lastPatch['main-active-subscopes']).toBe('["main-0"]');
  });

  it('restoreActiveSubScopes(projectName) reads per-project keys and ignores stale global keys', () => {
    restoreActiveSubScopes('projB');
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0', 'main-1', 'main-2']);
  });

  it('split ratio CSS var is restored per-project', () => {
    restoreActiveSubScopes('projC');
    expect(document.documentElement.style.getPropertyValue('--main-split-0-pct')).toBe('60.0%');
  });

  it("switching projects clears prior project's split CSS vars", () => {
    document.documentElement.style.setProperty('--main-split-0-pct', '30.0%');
    restoreActiveSubScopes('projB'); // projB has no split ratio
    expect(document.documentElement.style.getPropertyValue('--main-split-0-pct')).toBe('');
  });

  it('shouldSeedFirstLaunch returns true when no flag, false when flag set', async () => {
    expect(shouldSeedFirstLaunch('projA')).toBe(true);
    await markFirstLaunchSeeded('projA');
    expect(shouldSeedFirstLaunch('projA')).toBe(false);
  });
});

describe('Phase 22 gap-closure (22-10): closeSubScope', () => {
  let savedStates: any[] = [];
  let layoutPatches: any[] = [];

  beforeEach(async () => {
    savedStates = [];
    layoutPatches = [];
    __resetActiveSubScopesForTesting();
    activeProjectName.value = null;

    gsdTab.value = null;
    gitChangesTab.value = null;
    setProjectEditorTabs([]);
    fileTreeTabs.value = [];

    // Clear tab lists for all 6 hierarchical scopes so each test starts clean.
    for (const s of ['main-0', 'main-1', 'main-2', 'right-0', 'right-1', 'right-2'] as const) {
      getTerminalScope(s).tabs.value = [];
    }

    mockIPC((cmd, args) => {
      if (cmd === 'load_state') {
        return {
          version: 1,
          layout: {},
          theme: { mode: 'dark' },
          session: {},
          project: { active: null, projects: [] },
          panels: {},
        };
      }
      if (cmd === 'save_state') {
        savedStates.push(args);
        const state = JSON.parse((args as any).stateJson);
        layoutPatches.push(state.layout);
        return undefined;
      }
      return undefined;
    });
    await loadAppState();
  });

  it('removes the scope from activeMainSubScopes (fill-gap-at-end convention)', () => {
    activeMainSubScopes.value = ['main-0', 'main-1', 'main-2'];
    closeSubScope('main', 1);
    // Per fill-gap convention, the list shrinks from the end (last scope id
    // removed; tabs from the closed slot migrated to scope-0).
    expect(activeMainSubScopes.value).toEqual(['main-0', 'main-1']);
  });

  it('migrates tabs from closed scope to scope-0 with ownerScope re-pointed', () => {
    activeMainSubScopes.value = ['main-0', 'main-1'];
    const tab1: any = { id: 't1', label: 'a', sessionName: 's1', ownerScope: 'main-1' };
    const tab2: any = { id: 't2', label: 'b', sessionName: 's2', ownerScope: 'main-1' };
    getTerminalScope('main-1').tabs.value = [tab1, tab2];
    closeSubScope('main', 1);
    const main0Tabs = getTerminalScope('main-0').tabs.value;
    expect(main0Tabs.find(t => t.id === 't1')).toBeDefined();
    expect(main0Tabs.find(t => t.id === 't2')).toBeDefined();
    expect(main0Tabs.find(t => t.id === 't1')!.ownerScope).toBe('main-0');
    expect(main0Tabs.find(t => t.id === 't2')!.ownerScope).toBe('main-0');
    expect(getTerminalScope('main-1').tabs.value).toEqual([]);
  });

  it('re-points gsdTab.owningScope to scope-0 when closed scope owned it', () => {
    activeRightSubScopes.value = ['right-0', 'right-1'];
    gsdTab.value = { id: 'gsd', type: 'gsd', owningScope: 'right-1' } as any;
    closeSubScope('right', 1);
    expect(gsdTab.value!.owningScope).toBe('right-0');
  });

  it('is a no-op for index 0 (cannot close scope-0)', () => {
    activeMainSubScopes.value = ['main-0', 'main-1'];
    closeSubScope('main', 0);
    expect(activeMainSubScopes.value).toEqual(['main-0', 'main-1']);
  });

  it('persists per-project active list on close', () => {
    activeProjectName.value = 'projA';
    activeMainSubScopes.value = ['main-0', 'main-1'];
    layoutPatches = []; // reset so we inspect only the write triggered by close
    closeSubScope('main', 1);
    const lastPatch = layoutPatches[layoutPatches.length - 1];
    expect(lastPatch?.['main-active-subscopes:projA']).toBe('["main-0"]');
  });
});
