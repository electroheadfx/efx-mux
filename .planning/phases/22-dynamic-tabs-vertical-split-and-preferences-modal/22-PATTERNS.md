# Phase 22: Dynamic tabs, vertical split, and preferences modal - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 9 modified / 0 created
**Analogs found:** 9 / 9 (all modifications reuse in-repo patterns; no net-new files required)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/unified-tab-bar.tsx` (MOD) | component / tab-bar | event-driven (mouse) + signals | self — Phase 20 Plan 20-05-D/E already implements generalized cross-scope drag and `ownerScope`. This phase extends, not replaces. | exact (self-extension) |
| `src/components/main-panel.tsx` (REWRITE) | component / layout container | reactive render (signals) | `src/components/right-panel.tsx` — stacked tab-bar + body toggled via `display: block/none`; crash overlay mount. Also `src/components/server-pane.tsx` for vertical intra-panel stacking pattern. | exact (role) + role-match (data flow) |
| `src/components/right-panel.tsx` (REWRITE) | component / layout container | reactive render (signals) | self — current implementation is the N=1 instance of what N=1..3 needs. Extract `SubScopePane` helper and iterate. | exact (self-generalize) |
| `src/components/terminal-tabs.tsx` (MOD) | module / scope registry | reactive state (signals) | self — `scopes` Map, `createScopeState`, `getScope` already parametric on `TerminalScope`. Extend the union, the Map literal, and `createScopeState`'s `persistenceKey` / `containerSelector` switch. | exact (self-extension) |
| `src/state-manager.ts` (MOD) | module / persistence bridge | request-response (Tauri `invoke`) | self lines 82-89 — Phase 20 D-20 legacy-key silent migration template. Add a second migration loop for `terminal-tabs:<project>` → `terminal-tabs:<project>:main-0`. | exact (self-extension) |
| `src/drag-manager.ts` (MOD) | utility / DOM handle plumbing | event-driven (mouse) | self — `makeDragH` already exists; register new `[data-handle^="main-intra-"]` / `[data-handle^="right-intra-"]` handles. Needs a call-site re-run hook (MutationObserver or explicit re-init on split add/remove). | exact (self-extension) |
| `src/main.tsx` (MOD) | entry / titlebar | static JSX | self lines 91-98 — `.titlebar-add-btn` `+` button mirror. Replicate on the right side with `Settings` icon + `togglePreferences()` onClick. | exact (self-mirror) |
| `src/styles/app.css` (MOD) | stylesheet | static CSS | self lines 336-356 (`.split-handle-h`) and 444-470 (`.titlebar-add-btn`) — mirror both; add `.titlebar-prefs-btn`, `.split-handle-h-intra`, `.tab-bar-split-icon`, `.drop-target`, `.scope-empty-placeholder`. | exact (self-mirror) |
| `src/components/*.test.tsx` (MOD + NEW) | test | unit + component | `src/state-manager.test.ts` lines 1-80 — `mockIPC` + signal-reset pattern. Plus `src/components/unified-tab-bar.test.tsx` for component render + drag. | exact (role) |

## Pattern Assignments

---

### `src/components/main-panel.tsx` (component, layout container — REWRITE)

**Primary analog:** `src/components/right-panel.tsx` (current single-scope pattern to replicate N times)
**Secondary analog:** `src/components/server-pane.tsx` (horizontal stacking inside a vertical column)

**Imports pattern** (right-panel.tsx:13-21):
```typescript
import { colors } from '../tokens';
import { UnifiedTabBar, gitChangesTab, editorTabs } from './unified-tab-bar';
import { GSDPane } from './gsd-pane';
import { FileTree } from './file-tree';
import { GitChangesTab } from './git-changes-tab';
import { EditorTab } from './editor-tab';
import { getTerminalScope } from './terminal-tabs';

const { ActiveTabCrashOverlay: RightCrashOverlay } = getTerminalScope('right');
```

**Per-scope body render + display-toggle pattern** (right-panel.tsx:46-115). Each sub-scope becomes an iteration of this block. The current single `<UnifiedTabBar scope="right" />` becomes a loop over active sub-scopes:

```typescript
<aside
  class="right-panel flex flex-col"
  aria-label="Right panel"
  style={{
    backgroundColor: colors.bgBase,
    borderLeft: `1px solid ${colors.bgBorder}`,
  }}
>
  <UnifiedTabBar scope="right" />
  <div class="right-panel-content flex-1 relative overflow-hidden">
    {/* Sticky File Tree body — always mounted, display toggled */}
    <div
      style={{
        height: '100%',
        display: activeId === 'file-tree' ? 'block' : 'none',
      }}
    >
      <FileTree />
    </div>
    {/* …other bodies… */}
    <div
      class="terminal-containers"
      data-scope="right"
      style={{
        position: 'absolute',
        inset: 0,
        display: isDynamic ? 'block' : 'none',
      }}
    />
    {isDynamic && <RightCrashOverlay />}
  </div>
</aside>
```

**Phase-22 transformation:**
- Extract the body block into a `SubScopePane` helper taking `scope: TerminalScope` (e.g. `'main-0'`).
- Loop `activeSubScopesFor('main').map(scope => <SubScopePane scope={scope} />)` with `.split-handle-h-intra` between siblings.
- Each sub-scope mounts its own `<UnifiedTabBar scope={scope} />`, its own `terminal-containers[data-scope={scope}]`, its own crash overlay.
- The `gsdTab` / `gitChangesTab` singleton bodies render inside whichever sub-scope currently owns them (`owningScope === scope`), mirroring the existing `gcOwnedHere` gate at right-panel.tsx:34.

**Vertical-stacking layout pattern** (main-panel.tsx:21-74 + server-pane intra-handle at line 62-71):
```typescript
<main class="main-panel relative" aria-label="Main panel">
  <UnifiedTabBar scope="main" />
  {/* body */}
  {serverPaneState.value === 'expanded' && (
    <div class="split-handle-h" data-handle="main-h" role="separator"
         aria-orientation="horizontal" aria-label="Resize server pane" />
  )}
  <ServerPane />
</main>
```
— Phase 22 replicates this `{body}{handle}{body}{handle}{body}` pattern between sub-scopes with `data-handle="main-intra-0"`, `main-intra-1`, etc.

**Always-mount + `display:none` invariant** (right-panel.tsx:57-73, main-panel.tsx:25-37): every sub-scope body stays mounted across split add/remove so xterm WebGL contexts and editor parse caches survive. Never unmount on deactivation.

---

### `src/components/right-panel.tsx` (component, layout container — REWRITE)

Same pattern as main-panel.tsx above. Current file IS the analog — treat it as the base case (N=1) and generalize to N=1..3.

**Additional considerations specific to right-panel:**
- Current `rightEditors = editorTabs.value.filter(t => (t.ownerScope ?? 'main') === 'right')` (right-panel.tsx:37-40) becomes per-sub-scope: `editorTabs.value.filter(t => (t.ownerScope ?? 'main-0') === scope)`. Default `'main-0'` per D-10 migration.
- `getTerminalScope('right')` consumers (line 19, 31) expand to per-sub-scope handles (`getTerminalScope(scope)` where `scope` is one of `'right-0' | 'right-1' | 'right-2'`).

---

### `src/components/unified-tab-bar.tsx` (component, tab-bar — MOD)

**Primary analog:** self (Phase 20 Plan 20-05-D/E already implements the generalized cross-scope drag). Phase 22 is an extension, not a rewrite.

**Imports pattern** (unified-tab-bar.tsx:1-27):
```typescript
import { signal, computed } from '@preact/signals';
import type { VNode } from 'preact';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts, spacing } from '../tokens';
import { Dropdown, type DropdownItem } from './dropdown-menu';
// ... lucide-preact icons ...
import { Terminal, Bot, FileDiff, Pin, PanelRightClose, PanelRight, FolderOpen, ListChecks } from 'lucide-preact';
```
**Phase 22 additions:** `Rows2`, `Settings` (Settings goes in main.tsx, not here). Possibly `X` if the close-button icon is swapped to Lucide for uniformity.

**Sticky-tab deletion sites** (to REMOVE per D-01):
- Line 72-76: `StickyTabData` interface — delete.
- Line 82: remove `StickyTabData` from `UnifiedTab` union.
- Line 95 comment, line 100: remove the sticky-ID stripping note (still keep the filter defensively in case of corrupt persisted data).
- Line 1131-1143: `getOrderedTabsForScope` sticky-prepend — delete; scope just returns `computeDynamicTabsForScope(scope)`.
- Line 1189-1191: `onTabMouseDown` sticky reject — delete.
- Line 1371-1372: `handleCrossScopeDrop` sticky no-op — delete.
- Line 1488-1502: `handleTabClick` sticky branches — delete.
- Line 1580-1603: sticky/dynamic divider block — delete (no divider needed once there are no sticky tabs).
- Line 1682-1731: `renderTab` sticky branch — delete entirely.

**Singleton generalization (D-04, D-13) — the load-bearing analog: `gitChangesTab` signal + `openGitChangesTab` / `openOrMoveGitChangesToRight`** (unified-tab-bar.tsx:693-795):

```typescript
// Phase 20 pattern for gitChangesTab — GENERALIZE to gsdTab + file-tree dynamic tab kind
export const gitChangesTab = signal<GitChangesTabData | null>(null);

export function restoreGitChangesTab(projectName: string): void {
  const state = getCurrentState();
  const raw = state?.session?.[`${GIT_CHANGES_KEY_PREFIX}${projectName}`];
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { id?: string; owningScope?: TerminalScope };
    if (!parsed?.id || !parsed?.owningScope) return;
    const restored: GitChangesTabData = {
      type: 'git-changes',
      id: parsed.id,
      owningScope: parsed.owningScope,
    };
    gitChangesTab.value = restored;
    // Route into the correct scoped tab order so the tab bar renders it.
    // ...
  } catch { /* corrupt payload */ }
}

// Persistence subscription (fire-and-forget)
gitChangesTab.subscribe(() => { persistGitChangesTab(); });

export function openOrMoveGitChangesToRight(): void {
  const existing = gitChangesTab.value;
  const rightScope = getTerminalScope('right');

  if (existing?.owningScope === 'right') {
    rightScope.activeTabId.value = existing.id;
    activeUnifiedTabId.value = existing.id;
    return;
  }

  if (existing?.owningScope === 'main') {
    removeFromMainTabOrder(existing.id);
    appendToRightTabOrder(existing.id);
    gitChangesTab.value = { ...existing, owningScope: 'right' };
    rightScope.activeTabId.value = existing.id;
    // …main active-tab fallback…
  }
}
```

**Phase 22 generalization recipe:**
1. Define parallel `gsdTab = signal<GsdTabData | null>(null)` with `{ id, type: 'gsd', owningScope: TerminalScope }`. Title is fixed (D-05).
2. Replicate `restoreGsdTab` + `persistGsdTab` + `gsdTab.subscribe(persistGsdTab)` mirroring the git-changes pattern at unified-tab-bar.tsx:693-721.
3. Replace scope-specific `openOrMoveGitChangesToRight` with generic `openOrMoveSingletonToScope(kind: 'gsd' | 'git-changes', scope: TerminalScope)`.
4. File Tree is NOT a singleton (D-04 / UI-SPEC Singleton Dimming). Every scope can own a dynamic `file-tree-<id>` tab with an `ownerScope` field (pattern identical to editor tabs).

**Dropdown `disabled` dimming pattern** (unified-tab-bar.tsx:1089-1093 + dropdown-menu.tsx:13, 226-243):
```typescript
return [
  // ...
  {
    label: 'Git Changes',
    icon: FileDiff,
    action: () => openOrMoveGitChangesToRight(),
    disabled: gcInRight,  // ← dimming gate
  },
];
```
Dropdown renders `aria-disabled={item.disabled}` and clicks are no-ops when disabled (dropdown-menu.tsx:226-228). Phase 22 extends: `disabled: gsdTab.value !== null && gsdTab.value.owningScope !== scope` for both GSD and Git Changes.

**Cross-scope drag pattern (the main analog — `handleCrossScopeDrop`)** (unified-tab-bar.tsx:1364-1461):
```typescript
export function handleCrossScopeDrop(
  sourceId: string,
  sourceScope: TerminalScope,
  _targetId: string,
  targetScope: TerminalScope,
  _insertAfter: boolean,
): void {
  // Git Changes — delegate to existing move helpers.
  const gc = gitChangesTab.value;
  if (gc && gc.id === sourceId) {
    if (targetScope === 'right') openOrMoveGitChangesToRight();
    else if (targetScope === 'main') openGitChangesTab();
    return;
  }

  // Editor tabs — flip ownerScope + update scoped orders.
  if (sourceId.startsWith('editor-')) {
    const edTab = editorTabs.value.find(t => t.id === sourceId);
    if (!edTab) return;
    if ((edTab.ownerScope ?? 'main') === targetScope) return;

    const updated = editorTabs.value.map(t =>
      t.id === sourceId ? { ...t, ownerScope: targetScope } : t,
    );
    setProjectEditorTabs(updated);

    setScopedTabOrder(sourceScope,
      getScopedTabOrder(sourceScope).filter(id => id !== sourceId));
    setScopedTabOrder(targetScope,
      [...getScopedTabOrder(targetScope).filter(id => id !== sourceId), sourceId]);

    // Activate in target scope via the appropriate signal. …
    return;
  }

  // Terminal/Agent tabs
  const sourceTabs = getTerminalScope(sourceScope).tabs.value;
  const found = sourceTabs.find(t => t.id === sourceId);
  if (!found) return;

  const movedTab = { ...found, ownerScope: targetScope };
  getTerminalScope(sourceScope).tabs.value = sourceTabs.filter(t => t.id !== sourceId);
  getTerminalScope(targetScope).tabs.value = [
    ...getTerminalScope(targetScope).tabs.value, movedTab,
  ];

  setScopedTabOrder(sourceScope,
    getScopedTabOrder(sourceScope).filter(id => id !== sourceId));
  setScopedTabOrder(targetScope,
    [...getScopedTabOrder(targetScope), sourceId]);

  getTerminalScope(targetScope).activeTabId.value = sourceId;
  if (getTerminalScope(sourceScope).activeTabId.value === sourceId) {
    const remaining = getTerminalScope(sourceScope).tabs.value;
    getTerminalScope(sourceScope).activeTabId.value = remaining[0]?.id ?? '';
  }
}
```

**Phase 22 modifications:**
1. Delete the sticky no-op branch (lines 1371-1372).
2. Add a `gsd` branch (top-of-function — reject self-scope drops, flip `owningScope`, move across `setScopedTabOrder`, activate in target).
3. Add a `file-tree-*` dynamic-tab branch (mirrors editor branch since File Tree is non-singleton).
4. Replace hard-coded `'main'/'right'` in the Git Changes delegate path with `openOrMoveSingletonToScope('git-changes', targetScope)`.
5. Replace the main-active fallback `remainingRight[0]?.id ?? 'file-tree'` (line 1427) with `?? ''` — no sticky fallback (D-03 empty scope allowed).

**Mouse-drag ghost pattern** (unified-tab-bar.tsx:1216-1269):
```typescript
function onDocMouseMove(e: MouseEvent): void {
  if (!reorder.sourceId || !reorder.sourceEl) return;
  const dx = Math.abs(e.clientX - reorder.startX);

  if (!reorder.dragging && dx >= DRAG_THRESHOLD) {
    reorder.dragging = true;
    reorder.sourceEl.style.opacity = '0.4';

    const ghost = reorder.sourceEl.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.top = `${reorder.sourceEl.getBoundingClientRect().top}px`;
    ghost.style.left = `${e.clientX - 40}px`;
    ghost.style.opacity = '0.8';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    // …
    document.body.appendChild(ghost);
    reorder.ghostEl = ghost;
  }

  // …indicator logic using [data-tab-id] hit-test + colors.accent border…
  for (const el of tabEls) {
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right) {
      const mid = rect.left + rect.width / 2;
      if (el.dataset.tabId !== reorder.sourceId) {
        if (e.clientX < mid) el.style.borderLeft = `2px solid ${colors.accent}`;
        else el.style.borderRight = `2px solid ${colors.accent}`;
      }
      break;
    }
  }
}
```

**Phase 22 drop-affordance extension (D-14):** in `onDocMouseMove`, resolve the tab-bar under cursor via `document.querySelectorAll('[data-tablist-scope]')`. If that scope differs from `reorder.sourceScope`, toggle `.drop-target` class on the wrapper. Clear in `cleanupReorder` (unified-tab-bar.tsx:1463-1481) right next to the existing indicator clear loop.

**Split-icon button insertion point** — adjacent to the `+` Dropdown trigger at unified-tab-bar.tsx:1649-1676:
```tsx
<Dropdown
  items={dropdownItems}
  trigger={({ onClick, 'aria-haspopup': ariaHasPopup, 'aria-expanded': ariaExpanded }) => (
    <button
      class="w-7 h-7 rounded flex items-center justify-center text-base cursor-pointer shrink-0"
      style={{
        color: colors.textDim,
        fontFamily: fonts.sans,
        backgroundColor: 'transparent',
        border: 'none',
      }}
      aria-label="Add new tab"
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      onMouseEnter={e => {
        const t = e.target as HTMLElement;
        t.style.color = colors.textPrimary;
        t.style.backgroundColor = colors.bgElevated;
      }}
      onMouseLeave={e => {
        const t = e.target as HTMLElement;
        t.style.color = colors.textDim;
        t.style.backgroundColor = 'transparent';
      }}
    >+</button>
  )}
/>
```
— Phase 22 inserts a sibling `<button class="tab-bar-split-icon">` with the same event handler shape, substituting `<Rows2 size={14} />` for the `+` glyph and swapping action to `spawnSubScopeForZone(zone)`. `zone = scope.startsWith('main') ? 'main' : 'right'`.

---

### `src/components/terminal-tabs.tsx` (module, scope registry — MOD)

**Analog:** self — `createScopeState` + `scopes` Map are already parametric on `TerminalScope`.

**Scope-union + registry pattern** (terminal-tabs.tsx:39, 77-100):
```typescript
export type TerminalScope = 'main' | 'right';

function createScopeState(scope: TerminalScope): ScopeState {
  return {
    scope,
    tabs: signal<TerminalTab[]>([]),
    activeTabId: signal<string>(scope === 'right' ? 'file-tree' : ''),
    counter: { n: 0 },
    containerSelector: scope === 'main'
      ? '.terminal-containers'
      : '.terminal-containers[data-scope="right"]',
    persistenceKey: (projectName: string) =>
      scope === 'main'
        ? `terminal-tabs:${projectName}`
        : `right-terminal-tabs:${projectName}`,
    projectTabCache: new Map(),
  };
}

const scopes = new Map<TerminalScope, ScopeState>([
  ['main', createScopeState('main')],
  ['right', createScopeState('right')],
]);
```

**Phase 22 transformation:**
```typescript
export type TerminalScope =
  | 'main-0' | 'main-1' | 'main-2'
  | 'right-0' | 'right-1' | 'right-2';

function createScopeState(scope: TerminalScope): ScopeState {
  return {
    scope,
    tabs: signal<TerminalTab[]>([]),
    activeTabId: signal<string>(''),  // D-03: no sticky fallback; empty scope allowed
    counter: { n: 0 },
    containerSelector: `.terminal-containers[data-scope="${scope}"]`,
    persistenceKey: (projectName: string) => `terminal-tabs:${projectName}:${scope}`,
    projectTabCache: new Map(),
  };
}

const scopes = new Map<TerminalScope, ScopeState>([
  ['main-0',  createScopeState('main-0')],
  ['main-1',  createScopeState('main-1')],
  ['main-2',  createScopeState('main-2')],
  ['right-0', createScopeState('right-0')],
  ['right-1', createScopeState('right-1')],
  ['right-2', createScopeState('right-2')],
]);
```

**PTY-session-name collision pattern — D-12 shared counter (RESEARCH.md Code Examples):**
```typescript
const projectTabCounter = signal<Map<string, number>>(new Map());

function allocateNextSessionName(project: string | null): { name: string; n: number } {
  const key = project ?? '';
  const current = projectTabCounter.value.get(key) ?? 0;
  const n = current + 1;
  projectTabCounter.value = new Map(projectTabCounter.value).set(key, n);
  const suffix = n > 1 ? String(n) : undefined;
  return { name: projectSessionName(project, suffix), n };
}
```
Replaces the per-scope `s.counter.n` suffix logic at terminal-tabs.tsx:178-189.

**Existing tab-create pattern to preserve** (terminal-tabs.tsx:165-286): the `createNewTabScoped` flow of `wrapper = getTerminalContainersElForScope(scope)` → counter increment → `createTerminal` + `connectPty` + `attachResizeHandler` → `s.tabs.value = [...s.tabs.value, partialTab]` is unchanged in structure. Only the session-name allocation line swaps.

---

### `src/state-manager.ts` (module, persistence bridge — MOD)

**Analog:** self — lines 82-89 are the Phase 20 D-20 silent-migration template.

**Existing migration pattern** (state-manager.ts:82-89):
```typescript
// Phase 20 D-20: silent, idempotent migration — drop legacy right-panel layout keys.
// These keys were written by the pre-Phase-20 right-panel layout and have no consumers anymore.
// Deleting pre-signal-restore ensures signals never read stale migrated values.
if (currentState) {
  delete (currentState.panels as Record<string, string | undefined>)['right-bottom-tab'];
  delete (currentState.session as Record<string, string | undefined>)['right-tmux-session'];
  delete (currentState.layout as Record<string, string | boolean | undefined>)['right-h-pct'];
}
```

**Phase 22 migration (D-06 + D-10)** — insert after the Phase 20 block, before signal restore (RESEARCH.md Pattern 2):
```typescript
if (currentState) {
  const session = currentState.session as Record<string, string | undefined>;
  // D-10 scope-id migration
  for (const key of Object.keys(session)) {
    const mainLegacy = /^terminal-tabs:([^:]+)$/.exec(key);
    if (mainLegacy) {
      const project = mainLegacy[1];
      const target = `terminal-tabs:${project}:main-0`;
      if (session[target] === undefined) session[target] = session[key];
      delete session[key];
      continue;
    }
    const rightLegacy = /^right-terminal-tabs:(.+)$/.exec(key);
    if (rightLegacy) {
      const project = rightLegacy[1];
      const target = `terminal-tabs:${project}:right-0`;
      if (session[target] === undefined) session[target] = session[key];
      delete session[key];
    }
  }
  // D-06 sticky-ID drop from persisted activeTabId
  for (const key of Object.keys(session)) {
    if (!/^terminal-tabs:.+:(main|right)-[0-2]$/.test(key)) continue;
    try {
      const parsed = JSON.parse(session[key] as string);
      if (parsed.activeTabId === 'file-tree' || parsed.activeTabId === 'gsd') {
        parsed.activeTabId = '';
        session[key] = JSON.stringify(parsed);
      }
    } catch { /* fail-soft */ }
  }
}
```

**Split-ratio persistence pattern** — mirror `sidebar-w` / `right-w` at state-manager.ts:130-140 (`updateLayout`). New keys per D-09: `main-ratios` (or `main-split-<i>-pct`) and `right-ratios`. `updateLayout({ 'main-split-0-pct': '50%' })` writes through the existing `updateLayout` plumbing with no signature change.

---

### `src/drag-manager.ts` (utility, DOM handle plumbing — MOD)

**Analog:** self — `makeDragH` at lines 133-156 is the intra-zone resize primitive.

**Existing handle registration pattern** (drag-manager.ts:64-88):
```typescript
// -- Main terminal <-> Server pane horizontal handle (D-03) ------------------
const mainHHandle = document.querySelector<HTMLElement>('[data-handle="main-h"]');
if (mainHHandle && !mainHHandle.dataset.dragInit) {
  mainHHandle.dataset.dragInit = 'true';
  makeDragH(mainHHandle, {
    onDrag(clientY: number) {
      const mainPanel = document.querySelector<HTMLElement>('.main-panel');
      if (!mainPanel) return;
      const rect = mainPanel.getBoundingClientRect();
      const newHeight = rect.bottom - clientY;
      const clamped = Math.min(rect.height * 0.5, Math.max(100, newHeight));
      document.documentElement.style.setProperty('--server-pane-h', `${Math.round(clamped)}px`);
    },
    onEnd(clientY: number) {
      // ...same math...
      updateLayout({ 'server-pane-height': `${Math.round(clamped)}px` });
    },
  });
}
```

**Phase 22 intra-zone extension** — generalize the above per sub-scope boundary. Key insight: split creation happens at runtime, so the `initDragManager()` one-shot at main.tsx:195 is insufficient. Re-run strategies (Claude's Discretion):
- Option A: `attachIntraZoneHandles('main')` + `attachIntraZoneHandles('right')` called after every split add/remove from `main-panel.tsx` / `right-panel.tsx` via `useEffect`.
- Option B: MutationObserver on `.main-panel` / `.right-panel` watching `[data-handle^="main-intra-"]` insertions.
- Either is acceptable; Option A is simpler (explicit re-init from the split action callback).

**`makeDragH` reuse verbatim** — the primitive at lines 133-156 already captures `mousedown` → `mousemove` → `mouseup`, toggles `.app-dragging` on `#app`, adds `.dragging` class on the handle. No changes needed.

---

### `src/main.tsx` (entry, titlebar — MOD)

**Analog:** self — `.titlebar-add-btn` at lines 91-98 is the visual/CSS template.

**Existing titlebar button pattern** (main.tsx:69-99):
```tsx
<div
  data-tauri-drag-region
  class="titlebar-drag-region"
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 28,
    minHeight: 28,
    paddingLeft: 78,
    paddingRight: 12,
  }}
  onMouseDown={(e) => {
    if ((e.target as HTMLElement).closest('.titlebar-add-btn')) return;
    e.preventDefault();
    getCurrentWindow().startDragging();
  }}
>
  <button
    class="titlebar-add-btn"
    title="Add Project"
    aria-label="Add project"
    onClick={() => { openProjectModal(); }}
  >
    +
  </button>
</div>
```

**Phase 22 transformation:**
1. Change `justifyContent: 'flex-start'` → `'space-between'` (or add a right-side flex container).
2. Append the preferences button after `.titlebar-add-btn`:
```tsx
<button
  class="titlebar-prefs-btn"
  title="Preferences (Cmd+,)"
  aria-label="Open Preferences"
  onClick={() => { togglePreferences(); }}
>
  <Settings size={14} />
</button>
```
3. Extend the `onMouseDown` no-drag guard to cover the new button: `(e.target as HTMLElement).closest('.titlebar-add-btn, .titlebar-prefs-btn')`.
4. Import `Settings` from `lucide-preact`. `togglePreferences` is already imported (line 24).

**Keybind preservation (D-17):** the existing `listen('preferences-requested', () => togglePreferences())` at main.tsx:179 and the `Cmd+,` handler at lines 272-275 are **unchanged**. The new button calls the same `togglePreferences()` — no Tauri event emission, no Rust edits.

---

### `src/styles/app.css` (stylesheet — MOD)

**Analog:** self — existing handle + button classes are the exact templates.

**`.titlebar-add-btn` analog for `.titlebar-prefs-btn`** (app.css:444-470):
```css
.titlebar-add-btn {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background-color: transparent;
  color: white;
  font-size: 16px;
  font-weight: 400;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.5);
  line-height: 1;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}

.titlebar-add-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.titlebar-add-btn:active {
  color: #e67e22;
  border-color: #e67e22;
}
```
**Phase 22 `.titlebar-prefs-btn`** — mirror the above per UI-SPEC Component Inventory, but:
- Drop the `#e67e22` `:active` override (UI-SPEC explicitly notes prefs btn has no orange active state).
- Drop `font-size: 16px` / `font-weight: 400` (the icon is an SVG, not a glyph).

**`.split-handle-h` analog for `.split-handle-h-intra`** (app.css:337-356):
```css
.split-handle-h {
  width: 100%;
  height: var(--handle-size);
  min-height: var(--handle-size);
  cursor: row-resize;
  background: var(--color-border);
  background-clip: content-box;
  flex-shrink: 0;
  margin: calc((var(--handle-hit) - var(--handle-size)) / -2) 0;
  padding: calc((var(--handle-hit) - var(--handle-size)) / 2) 0;
  z-index: 10;
  transition: background 0.1s ease;
}

.split-handle-h:hover,
.split-handle-h.dragging {
  background: var(--color-accent);
  background-clip: content-box;
}
```
**Phase 22 `.split-handle-h-intra`** — mirror verbatim but swap `cursor: row-resize` → `cursor: ns-resize` (UI-SPEC explicit distinction). All other properties unchanged.

**New classes per UI-SPEC Component Inventory:**
- `.tab-bar-split-icon` — 18×18px, `var(--color-text)` idle, `var(--color-accent)` hover, `opacity: 0.4` + `cursor: not-allowed` when disabled.
- `.drop-target` — `outline: 1px solid var(--color-accent); outline-offset: -1px;` toggled on `[data-tablist-scope]` wrapper during cross-scope drag.
- `.scope-empty-placeholder` — centered flexbox, `var(--color-text-muted)`, 11px, `font-family: var(--font-family-sans)`.

---

### `src/components/*.test.tsx` and `src/*.test.ts` (tests — NEW + MOD)

**Analog:** `src/state-manager.test.ts` lines 1-80 for migration tests; `src/components/unified-tab-bar.test.tsx` for component tests; Phase 20 Plan 20-05-D test file for cross-scope drag.

**Import + mockIPC + signal-reset pattern** (state-manager.test.ts:1-56):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import {
  projects, activeProjectName, sidebarCollapsed, rightTopTab,
  loadAppState, saveAppState, getCurrentState, updateSession,
  addProject, updateProject, removeProject, switchProject,
} from './state-manager';
import type { AppState } from './state-manager';

const MOCK_STATE: AppState = {
  version: 1,
  layout: { 'sidebar-w': '200px', 'right-w': '25%', 'sidebar-collapsed': false },
  theme: { mode: 'dark' },
  session: { 'main-tmux-session': 'efx-mux' },
  project: { active: 'test-project', projects: [/* … */] },
  panels: { 'right-top-tab': 'File Tree' },
};

describe('state-manager', () => {
  beforeEach(async () => {
    projects.value = [];
    activeProjectName.value = null;
    sidebarCollapsed.value = false;
    rightTopTab.value = 'File Tree';
    mockIPC(() => { throw new Error('reset'); });
  });

  describe('loadAppState', () => {
    it('loads state successfully via invoke', async () => {
      mockIPC((cmd, args) => {
        if (cmd === 'load_state') return MOCK_STATE;
      });
      const state = await loadAppState();
      expect(state.version).toBe(1);
    });
  });
});
```

**Phase 22 test sites per RESEARCH.md Phase Requirements → Test Map (§Validation Architecture):**
| Req ID | Test File | Test Name |
|--------|-----------|-----------|
| TABS-01 | `src/components/unified-tab-bar.test.tsx` | "dynamic sticky-removed tabs" |
| TABS-01 | `src/components/unified-tab-bar.test.tsx` | "fixed titles no-rename" |
| TABS-01 | `src/state-manager.test.ts` | "sticky id migration" |
| SPLIT-01 | `src/components/main-panel.test.tsx` (NEW) | "split adds sub-scope" |
| SPLIT-01 | `src/components/unified-tab-bar.test.tsx` | "split cap disables icon" |
| SPLIT-02 | `src/drag-manager.test.ts` (NEW) | "intra-zone handle" |
| SPLIT-03 | `src/components/unified-tab-bar.test.tsx` | "cross-scope drag terminal" |
| SPLIT-03 | `src/components/unified-tab-bar.test.tsx` | "gsd singleton drag" |
| SPLIT-03 | `src/components/unified-tab-bar.test.tsx` | "cross-scope drop affordance" |
| SPLIT-04 | `src/components/terminal-tabs.test.ts` | "sessionName stable on drag" |
| SPLIT-04 | `src/components/terminal-tabs.test.ts` | "shared counter unique names" |
| PREF-01 | `src/main.test.tsx` (NEW) | "prefs button opens panel" |

---

## Shared Patterns

### Singleton Tab Ownership (D-04, D-13)

**Source:** `src/components/unified-tab-bar.tsx:155, 693-795` (`gitChangesTab` + `restoreGitChangesTab` + `openOrMoveGitChangesToRight`)
**Apply to:** GSD (new `gsdTab` signal) + Git Changes (existing — generalize scope parameter from `'main'|'right'` to full `TerminalScope`).

```typescript
export const gitChangesTab = signal<GitChangesTabData | null>(null);

gitChangesTab.subscribe(() => { persistGitChangesTab(); });

// Always assign a NEW object on mutation — Preact signals shallow-compare references.
// Pitfall 7: gsdTab.value.owningScope = X (mutation) would NOT trigger a re-render.
gitChangesTab.value = { ...existing, owningScope: 'right' };
```

Replicate verbatim for `gsdTab: Signal<GsdTabData | null>` with key `gsd-tab:<project>` in `state.session`.

### Always-Mount + `display:none` (Pitfall xterm WebGL)

**Source:** `src/components/right-panel.tsx:57-113` + `src/components/main-panel.tsx:25-54`
**Apply to:** every new sub-scope body. Never unmount xterm / CodeMirror / GSDPane containers on scope deactivation.

```tsx
<div style={{ height: '100%', display: activeId === 'file-tree' ? 'block' : 'none' }}>
  <FileTree />
</div>
```

### Tailwind 4 `@theme` tokens via `src/tokens.ts`

**Source:** `src/tokens.ts` (canonical export) + `src/styles/app.css:4-34` (CSS custom properties)
**Apply to:** all new inline `style={{ color: colors.accent }}` and all new CSS classes (`var(--color-accent)`, `var(--color-border)`). No hex literals (except the legacy `#e67e22` in `.titlebar-add-btn:active` which is itself legacy — do not propagate).

```typescript
// tokens.ts
export const colors = {
  bgBase: '#111927',
  bgElevated: '#19243A',
  bgBorder: '#243352',
  accent: '#258AD1',
  textPrimary: '#E6EDF3',
  textMuted: '#8B949E',
  textDim: '#556A85',
  // …
};
```

```css
/* app.css @theme */
--color-bg: #111927;
--color-border: #243352;
--color-accent: #258AD1;
--color-text: #8B949E;
--color-text-bright: #E6EDF3;
--color-text-muted: #556A85;
```

### Mouse-based drag (never HTML5 DnD — WKWebView Anti-Pattern)

**Source:** `src/components/unified-tab-bar.tsx:1189-1269` (tab reorder) + `src/drag-manager.ts:104-126` (handle resize)
**Apply to:** every new drag interaction — split-icon spawn animation (if any), cross-scope tab drop affordance, intra-zone resize. Use `mousedown` → `mousemove` on `document` → `mouseup` on `document`. Never `dragstart`/`dragend`.

```typescript
handle.addEventListener('mousedown', (startEvent: MouseEvent) => {
  startEvent.preventDefault();
  app?.classList.add('app-dragging');
  handle.classList.add('dragging');

  function onMove(e: MouseEvent): void { onDrag(e.clientY); }
  function onUp(e: MouseEvent): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    app?.classList.remove('app-dragging');
    handle.classList.remove('dragging');
    onEnd(e.clientY);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});
```

### State persistence via `updateLayout` / `updateSession`

**Source:** `src/state-manager.ts:133-162`
**Apply to:** new per-zone split ratios (`main-split-0-pct`, `right-split-1-pct`) and new per-scope tab persistence keys (`terminal-tabs:<project>:<scope-id>`, `tab-counter:<project>`). No new IPC commands; Rust backend stores arbitrary string key/values.

```typescript
export async function updateLayout(patch: Record<string, string | boolean>): Promise<void> {
  if (!currentState) return;
  if (!currentState.layout) currentState.layout = {};
  for (const [key, value] of Object.entries(patch)) {
    currentState.layout[key] = value;
  }
  await saveAppState(currentState);
}
```

### Legacy-key silent migration on load

**Source:** `src/state-manager.ts:82-89` (Phase 20 D-20 template)
**Apply to:** D-06 (sticky-ID drop) and D-10 (scope-id migration). Run once on `loadAppState` after JSON parse, before signal restore. Idempotent — re-running is a no-op after first run.

---

## No Analog Found

*(empty)* — every modification site has a direct in-repo pattern analog. This is a pure extension phase.

---

## Metadata

**Analog search scope:**
- `src/components/` (32 files scanned)
- `src/` root modules (`main.tsx`, `state-manager.ts`, `drag-manager.ts`, `tokens.ts`)
- `src/styles/app.css`
- `src-tauri/src/` (scanned — confirmed NO Rust edits required per canonical_refs)
- Phase 17, 19, 20 planning artifacts (referenced as context via RESEARCH.md)

**Files scanned:** ~50 source files; 9 load-bearing analogs cited.
**Pattern extraction date:** 2026-04-18
