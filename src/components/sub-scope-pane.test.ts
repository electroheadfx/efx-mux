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
} from './sub-scope-pane';
import { activeProjectName, loadAppState } from '../state-manager';

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
