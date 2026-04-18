// sub-scope-pane.tsx — Phase 22 Plan 04: N-sub-scope layout
//
// Contains shared sub-scope state + SubScopePane component.
// Both main-panel.tsx and right-panel.tsx import from this file.

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { colors } from '../tokens';
import { UnifiedTabBar } from './unified-tab-bar';
import { FileTree } from './file-tree';
import { GSDPane } from './gsd-pane';
import { GitChangesTab } from './git-changes-tab';
import { EditorTab } from './editor-tab';
import { getTerminalScope, type TerminalScope } from './terminal-tabs';
import { gitChangesTab, editorTabs, fileTreeTabs, gsdTab } from './unified-tab-bar';
import { attachIntraZoneHandles } from '../drag-manager';
import { updateLayout, getCurrentState } from '../state-manager';

type Zone = 'main' | 'right';

// ── Shared active-sub-scopes state ─────────────────────────────────────────────

const MAIN_SUBSCOPES_KEY = 'main-active-subscopes';
const RIGHT_SUBSCOPES_KEY = 'right-active-subscopes';

export const activeMainSubScopes = signal<TerminalScope[]>(['main-0']);
export const activeRightSubScopes = signal<TerminalScope[]>(['right-0']);

export function getActiveSubScopesForZone(zone: Zone): TerminalScope[] {
  return zone === 'main' ? activeMainSubScopes.value : activeRightSubScopes.value;
}

export function spawnSubScopeForZone(zone: Zone): void {
  const sig = zone === 'main' ? activeMainSubScopes : activeRightSubScopes;
  const current = sig.value;
  if (current.length >= 3) return; // cap at 3
  const nextIdx = current.length;
  const nextScope = `${zone}-${nextIdx}` as TerminalScope;
  sig.value = [...current, nextScope];
  const key = zone === 'main' ? MAIN_SUBSCOPES_KEY : RIGHT_SUBSCOPES_KEY;
  void updateLayout({ [key]: JSON.stringify(sig.value) });
}

export function __resetActiveSubScopesForTesting(): void {
  activeMainSubScopes.value = ['main-0'];
  activeRightSubScopes.value = ['right-0'];
}

/** Called on app mount to restore persisted active sub-scope lists + split ratios. */
export function restoreActiveSubScopes(): void {
  const state = getCurrentState();
  if (!state) return;
  const mainRaw = state.layout?.[MAIN_SUBSCOPES_KEY];
  const rightRaw = state.layout?.[RIGHT_SUBSCOPES_KEY];
  if (typeof mainRaw === 'string') {
    try { activeMainSubScopes.value = JSON.parse(mainRaw); } catch { /* fail-soft */ }
  }
  if (typeof rightRaw === 'string') {
    try { activeRightSubScopes.value = JSON.parse(rightRaw); } catch { /* fail-soft */ }
  }
  // Restore split ratios into CSS custom properties
  for (const z of ['main', 'right'] as const) {
    for (let i = 0; i < 2; i++) {
      const val = state.layout?.[`${z}-split-${i}-pct`];
      if (typeof val === 'string') {
        document.documentElement.style.setProperty(`--${z}-split-${i}-pct`, val);
      }
    }
  }
}

// ── SubScopePane component ──────────────────────────────────────────────────────

interface SubScopePaneProps {
  scope: TerminalScope;
  /** Zone name for intra-zone handle registration ('main' or 'right') */
  zone: Zone;
}

/**
 * SubScopePane — renders one sub-scope's tab bar and always-mounted body stack.
 *
 * Always-mounts (never unmounts on deactivation):
 *   - .terminal-containers[data-scope="${scope}"]
 *   - FileTree bodies (one per scoped file-tree tab)
 *   - GSDPane body (only when gsdTab.owningScope === scope)
 *   - GitChangesTab body (only when gitChangesTab.owningScope === scope)
 *   - Editor bodies (filtered by ownerScope === scope)
 *
 * Empty state: when no tabs/singletons/file-trees exist in this scope,
 * renders .scope-empty-placeholder.
 */
export function SubScopePane({ scope, zone }: SubScopePaneProps) {
  const scopeState = getTerminalScope(scope);
  const { activeTabId } = scopeState;
  const activeId = activeTabId.value;

  // Register intra-zone drag handles for this zone on mount
  useEffect(() => {
    attachIntraZoneHandles(zone);
  }, [zone]);

  // Filter tabs/bodies for this scope
  const scopedFileTrees = fileTreeTabs.value.filter(t => t.ownerScope === scope);
  const scopedEditors = editorTabs.value.filter(t => (t.ownerScope ?? 'main-0') === scope);
  const gsdHere = gsdTab.value?.owningScope === scope;
  const gcHere = gitChangesTab.value?.owningScope === scope;
  const tabs = scopeState.tabs.value;

  const hasAnyTab =
    tabs.length > 0 ||
    scopedFileTrees.length > 0 ||
    scopedEditors.length > 0 ||
    gsdHere ||
    gcHere;

  // Determine if terminal containers should be visible
  // Visible when the active tab is one of THIS scope's terminal/agent tabs
  const terminalTabIds = tabs.map(t => t.id);
  const isTerminalActive = terminalTabIds.includes(activeId);

  return (
    <div
      class="sub-scope-pane flex flex-col"
      data-subscope={scope}
      style={{ position: 'relative', flex: 1, minHeight: 48, overflow: 'hidden' }}
    >
      <UnifiedTabBar scope={scope} />

      <div
        class="sub-scope-body"
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
      >
        {/* Terminal containers — always mounted, display toggled */}
        <div
          class="terminal-containers"
          data-scope={scope}
          style={{
            position: 'absolute',
            inset: 0,
            display: isTerminalActive ? 'block' : 'none',
          }}
        />

        {/* File Tree bodies — one per scoped file-tree tab */}
        {scopedFileTrees.map(ft => (
          <div
            key={ft.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: activeId === ft.id ? 'block' : 'none',
            }}
          >
            <FileTree />
          </div>
        ))}

        {/* GSD body — mounts only in the scope that owns it */}
        {gsdHere && gsdTab.value && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: activeId === gsdTab.value.id ? 'block' : 'none',
            }}
          >
            <GSDPane />
          </div>
        )}

        {/* Git Changes body */}
        {gcHere && gitChangesTab.value && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: activeId === gitChangesTab.value.id ? 'block' : 'none',
            }}
          >
            <GitChangesTab />
          </div>
        )}

        {/* Editor bodies */}
        {scopedEditors.map(et => (
          <div
            key={et.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: activeId === et.id ? 'block' : 'none',
            }}
          >
            <EditorTab
              key={et.id}
              tabId={et.id}
              filePath={et.filePath}
              fileName={et.fileName}
              content={et.content}
              isActive={et.id === activeId}
            />
          </div>
        ))}

        {/* Empty-state placeholder */}
        {!hasAnyTab && (
          <div class="scope-empty-placeholder">
            <span class="heading">No tabs open</span>
            <span>Press + to add a tab.</span>
          </div>
        )}
      </div>
    </div>
  );
}
