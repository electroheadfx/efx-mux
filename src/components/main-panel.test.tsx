// main-panel.test.tsx — Phase 22 Plan 04: N-sub-scope layout tests
//
// Tests:
//   - split adds sub-scope (spawnSubScopeForZone)
//   - split cap no-op at 3
//   - getActiveSubScopesForZone returns in order
//   - empty scope placeholder renders
//   - persistence of active sub-scopes via updateLayout

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';

import { MainPanel, spawnSubScopeForZone, getActiveSubScopesForZone, __resetActiveSubScopesForTesting } from './main-panel';
import { getTerminalScope } from './terminal-tabs';
import { gsdTab, fileTreeTabs } from './unified-tab-bar';
import { projects, activeProjectName, updateLayout } from '../state-manager';

// Tauri event listener mock
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Tauri invoke mock — return neutral values for any invoke the component makes
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve(undefined)),
}));

function mockState() {
  mockIPC((cmd: string, _args: any) => {
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
    return undefined;
  });
}

describe('Phase 22: split spawning', () => {
  beforeEach(() => {
    __resetActiveSubScopesForTesting();
    mockState();
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any];
    activeProjectName.value = 'testproj';
  });

  afterEach(() => {
    cleanup();
  });

  it('split adds sub-scope', () => {
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0']);
    spawnSubScopeForZone('main');
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0', 'main-1']);
    spawnSubScopeForZone('main');
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0', 'main-1', 'main-2']);
  });

  it('split cap no-op at 3', () => {
    spawnSubScopeForZone('main');
    spawnSubScopeForZone('main');
    spawnSubScopeForZone('main');
    spawnSubScopeForZone('main'); // no-op — at cap
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0', 'main-1', 'main-2']);
  });

  it('getActiveSubScopesForZone returns in order', () => {
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0']);
    spawnSubScopeForZone('main');
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0', 'main-1']);
    spawnSubScopeForZone('main');
    expect(getActiveSubScopesForZone('main')).toEqual(['main-0', 'main-1', 'main-2']);
    // right zone is independent
    expect(getActiveSubScopesForZone('right')).toEqual(['right-0']);
    spawnSubScopeForZone('right');
    expect(getActiveSubScopesForZone('right')).toEqual(['right-0', 'right-1']);
  });

  it('persistence of active sub-scopes', async () => {
    // Spy on updateLayout to verify it is called with the correct key
    const updateLayoutSpy = vi.spyOn(await import('../state-manager'), 'updateLayout');

    spawnSubScopeForZone('main');
    spawnSubScopeForZone('main');

    // Expect updateLayout to have been called with the main-active-subscopes key
    expect(updateLayoutSpy).toHaveBeenCalled();
    const calls = updateLayoutSpy.mock.calls;
    const layoutCall = calls.find(([patch]) =>
      'main-active-subscopes' in (patch as Record<string, unknown>)
    );
    expect(layoutCall).toBeDefined();
    expect((layoutCall![0] as Record<string, unknown>)['main-active-subscopes']).toBe('["main-0","main-1"]');
  });
});

describe('Phase 22: empty scope placeholder', () => {
  beforeEach(() => {
    __resetActiveSubScopesForTesting();
    mockState();
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' } as any];
    activeProjectName.value = 'testproj';
  });

  afterEach(() => {
    cleanup();
  });

  it('empty scope placeholder renders when scope has no tabs', () => {
    // Render MainPanel — with no terminal tabs created yet it should show placeholder in main-0.
    const { container } = render(<MainPanel />);
    // The placeholder may appear for scopes with no active tabs
    const placeholder = container.querySelector('.scope-empty-placeholder');
    // With no tabs, the first scope should show empty state
    expect(placeholder).not.toBeNull();
  });

  it('placeholder has correct copy', () => {
    const { container } = render(<MainPanel />);
    const placeholder = container.querySelector('.scope-empty-placeholder');
    expect(placeholder?.textContent).toContain('No tabs open');
    expect(placeholder?.textContent).toContain('Press + to add a tab');
  });
});
