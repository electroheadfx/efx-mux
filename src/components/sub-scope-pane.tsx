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
import { gitChangesTab, editorTabs, fileTreeTabs, gsdTab, setProjectEditorTabs } from './unified-tab-bar';
import { attachIntraZoneHandles } from '../drag-manager';
import { dispatchLayoutChanged } from '../terminal/resize-handler';
import { getCellMetricsForScope, snapDown } from '../terminal/cell-metrics';
import {
  updateLayout,
  updateSession,
  getCurrentState,
  activeProjectName,
} from '../state-manager';

type Zone = 'main' | 'right';

// ── Per-project key builders (Phase 22 gap-closure 22-07) ─────────────────────

function activeSubScopesKey(zone: Zone, projectName?: string | null): string {
  return projectName
    ? `${zone}-active-subscopes:${projectName}`
    : `${zone}-active-subscopes`;
}

function splitRatioKey(zone: Zone, idx: number, projectName?: string | null): string {
  return projectName
    ? `${zone}-split-${idx}-pct:${projectName}`
    : `${zone}-split-${idx}-pct`;
}

function firstLaunchKey(projectName: string): string {
  return `first-launch:${projectName}`;
}

// ── Shared active-sub-scopes state ─────────────────────────────────────────────

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
  const key = activeSubScopesKey(zone, activeProjectName.value);
  void updateLayout({ [key]: JSON.stringify(sig.value) });

  // Debug 22-terminal-not-filling-pane: adding a sub-scope shrinks every
  // pre-existing pane in this zone. Pre-existing terminals must refit their
  // xterm rows/cols to match the new pane geometry — ResizeObserver alone is
  // unreliable for this transition. Dispatch on a microtask so Preact has
  // applied the new inline styles (height: var(--...)) before fit() reads
  // the container's clientHeight.
  queueMicrotask(() => dispatchLayoutChanged());
}

export function __resetActiveSubScopesForTesting(): void {
  activeMainSubScopes.value = ['main-0'];
  activeRightSubScopes.value = ['right-0'];
}

/**
 * Close a sub-scope at `index` within `zone` — Phase 22 gap-closure (22-10).
 *
 * UX contract (per 22-10-PLAN):
 *  - index 0 cannot be closed (scope-0 is always present)
 *  - tabs from the closed scope MIGRATE to scope-0 (no work destroyed)
 *  - gsdTab / gitChangesTab / editorTabs / fileTreeTabs that were owned by the
 *    closed scope have `owningScope`/`ownerScope` re-pointed to scope-0
 *  - PTY session names stay stable (D-12) because we only update the tab's
 *    `ownerScope` field — the underlying sessionName is untouched
 *  - Fill-gap-at-end convention: the active list shrinks by dropping its last
 *    id. Scope ids are added monotonically (main-0 → main-1 → main-2), so
 *    after migration the list is simply `current.slice(0, -1)` regardless of
 *    which index the user clicked.
 *  - Persists the new active-subscopes list under the per-project key
 *    (`${zone}-active-subscopes:<project>`) and saves the migrated tab list
 *    for scope-0 and the (now-empty) closed scope.
 */
export function closeSubScope(zone: Zone, index: number): void {
  if (index === 0) return;
  const sig = zone === 'main' ? activeMainSubScopes : activeRightSubScopes;
  const current = sig.value;
  if (index >= current.length) return;

  const closedScope = `${zone}-${index}` as TerminalScope;
  const scope0 = `${zone}-0` as TerminalScope;

  // 1. Migrate terminal/agent tabs to scope-0 with ownerScope re-pointed.
  //    PTY session names stay stable (D-12).
  const closedTabs = getTerminalScope(closedScope).tabs.value;
  const migratedTabs = closedTabs.map(t => ({ ...t, ownerScope: scope0 }));
  getTerminalScope(scope0).tabs.value = [
    ...getTerminalScope(scope0).tabs.value,
    ...migratedTabs,
  ];
  getTerminalScope(closedScope).tabs.value = [];

  // 2. Re-point singleton ownership (gsd + git-changes).
  if (gsdTab.value?.owningScope === closedScope) {
    gsdTab.value = { ...gsdTab.value, owningScope: scope0 };
  }
  if (gitChangesTab.value?.owningScope === closedScope) {
    gitChangesTab.value = { ...gitChangesTab.value, owningScope: scope0 };
  }

  // 3. Re-point dynamic tab kinds (editor + file-tree) whose ownerScope matches
  //    the closed scope so SubScopePane filters them into scope-0.
  const updatedEditors = editorTabs.value.map(t =>
    t.ownerScope === closedScope ? { ...t, ownerScope: scope0 } : t,
  );
  setProjectEditorTabs(updatedEditors);

  fileTreeTabs.value = fileTreeTabs.value.map(t =>
    t.ownerScope === closedScope ? { ...t, ownerScope: scope0 } : t,
  );

  // 4. Drop the LAST scope id from the active list (fill-gap-at-end).
  sig.value = current.slice(0, -1);

  // 5. Persist the new active-subscopes list per project.
  const project = activeProjectName.value;
  const key = activeSubScopesKey(zone, project);
  void updateLayout({ [key]: JSON.stringify(sig.value) });

  // 6. Persist the migrated tab list (scope-0 gained tabs; closed scope is empty).
  if (project) {
    getTerminalScope(scope0).saveProjectTabs(project);
    getTerminalScope(closedScope).saveProjectTabs(project);
  }

  // Debug 22-terminal-not-filling-pane: closing a sub-scope grows the
  // remaining panes. Migrated terminals land inside a pane whose effective
  // height just changed; pre-existing terminals in scope-0 see the pane grow
  // (or the `flex:1` vs `flex:none` mode flip). Dispatch on a microtask so
  // Preact has applied the new inline styles before terminals read the new
  // container clientHeight.
  queueMicrotask(() => dispatchLayoutChanged());
}

/**
 * Restore per-project active-sub-scope lists + split ratios.
 *
 * Phase 22 gap-closure 22-07: takes an optional projectName; reads per-project
 * keys (`main-active-subscopes:<project>` etc) and clears stale CSS vars
 * before applying the new project's ratios so project A's split ratio does not
 * leak into project B (test 4).
 */
export function restoreActiveSubScopes(projectName?: string | null): void {
  const state = getCurrentState();
  if (!state) return;

  // Always reset signals to defaults first so the prior project's scope list
  // does not leak into a project that has no per-project entry.
  activeMainSubScopes.value = ['main-0'];
  activeRightSubScopes.value = ['right-0'];

  // Always clear ALL split-ratio CSS vars first so blank projects start fresh.
  for (const zone of ['main', 'right'] as const) {
    for (let i = 0; i < 2; i++) {
      document.documentElement.style.removeProperty(`--${zone}-split-${i}-pct`);
    }
  }

  const mainRaw = state.layout?.[activeSubScopesKey('main', projectName)];
  const rightRaw = state.layout?.[activeSubScopesKey('right', projectName)];
  if (typeof mainRaw === 'string') {
    try {
      const parsed = JSON.parse(mainRaw) as TerminalScope[];
      if (Array.isArray(parsed) && parsed.length > 0) activeMainSubScopes.value = parsed;
    } catch { /* fail-soft */ }
  }
  if (typeof rightRaw === 'string') {
    try {
      const parsed = JSON.parse(rightRaw) as TerminalScope[];
      if (Array.isArray(parsed) && parsed.length > 0) activeRightSubScopes.value = parsed;
    } catch { /* fail-soft */ }
  }

  // Restore split ratios into CSS custom properties (per-project).
  for (const zone of ['main', 'right'] as const) {
    for (let i = 0; i < 2; i++) {
      const val = state.layout?.[splitRatioKey(zone, i, projectName)];
      if (typeof val === 'string') {
        document.documentElement.style.setProperty(`--${zone}-split-${i}-pct`, val);
      }
    }
  }
}

// ── First-launch flag helpers (gap-closure 22-07) ─────────────────────────────
//
// `first-launch:<project>` lives in state.session (Rust's arbitrary string map).
// Presence of any value gates D-02 defaults from re-seeding on subsequent
// launches — this is what makes deletes survive restart.

export function shouldSeedFirstLaunch(projectName: string): boolean {
  const state = getCurrentState();
  if (!state) return true; // safest default
  return state.session?.[firstLaunchKey(projectName)] === undefined;
}

export async function markFirstLaunchSeeded(projectName: string): Promise<void> {
  await updateSession({ [firstLaunchKey(projectName)]: '1' });
}

// ── SubScopePane component ──────────────────────────────────────────────────────

interface SubScopePaneProps {
  scope: TerminalScope;
  /** Zone name for intra-zone handle registration ('main' or 'right') */
  zone: Zone;
  /** Index of this pane within its zone's active sub-scope list. Optional — defaults to 0. */
  index?: number;
  /** Total number of panes in this zone. Optional — defaults to 1. */
  total?: number;
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
export function SubScopePane({ scope, zone, index = 0, total = 1 }: SubScopePaneProps) {
  const scopeState = getTerminalScope(scope);
  const { activeTabId } = scopeState;
  const activeId = activeTabId.value;

  // Phase 22 gap-closure (22-11): non-last panes take their persisted ratio via
  // CSS var; the last pane absorbs remaining space via flex:1.
  const isLast = index === total - 1;

  // Register intra-zone drag handles for this zone on mount
  useEffect(() => {
    attachIntraZoneHandles(zone);
  }, [zone]);

  // Phase-22 follow-up (quick 260419-k1n): quantize this pane's own height on
  // initial mount + on tab switches. createTerminal()'s double-RAF fit has
  // already run by this point for newly-created terminals; for tab switches
  // we still run it because switching TO a terminal tab may land on a pane
  // with row-remainder from a prior layout state.
  useEffect(() => {
    // Re-run after 2x RAF so the terminal double-RAF fit (in createTerminal)
    // has finished and xterm cell dimensions are readable.
    let id2: number | undefined;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        const metrics = getCellMetricsForScope(scope);
        if (!metrics) return; // mixed content — leave alone
        const pane = document.querySelector<HTMLElement>(`.sub-scope-pane[data-subscope="${scope}"]`);
        if (!pane) return;
        const current = pane.offsetHeight;
        const snapped = snapDown(current, metrics.cellHeight, 48);
        if (Math.abs(current - snapped) >= 1) {
          pane.style.height = `${snapped}px`;
          pane.style.flex = 'none';
        }
      });
    });
    return () => {
      if (typeof id2 === 'number') cancelAnimationFrame(id2);
      cancelAnimationFrame(id1);
    };
  }, [scope, activeId]);

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
      style={{
        position: 'relative',
        // Non-last panes consume their persisted split ratio; last pane absorbs remainder.
        height: isLast ? undefined : `var(--${zone}-split-${index}-pct, ${(100 / total).toFixed(1)}%)`,
        flex: isLast ? 1 : 'none',
        minHeight: 48,
        overflow: 'hidden',
      }}
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
