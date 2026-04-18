---
phase: 20
plan: 05-D
subsystem: unified-tab-bar / right-panel editor tabs
tags: [ui, editor, drag-drop, preact, scope, cross-scope]
key-files:
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/main-panel.tsx
    - src/components/right-panel.tsx
    - src/components/unified-tab-bar.test.tsx
    - src/components/right-panel.test.tsx
    - .planning/phases/20-right-panel-multi-terminal/20-05-SUMMARY.md
---

# Phase 20 Plan 05-D: Editor tabs across scopes — Summary

One-liner: Editor (file) tabs can now live in either panel; drag-drop
between main and right flips `ownerScope`, activates via the correct
scope signal, renders a second CodeMirror mount under `RightPanel`,
and round-trips through state.json restart.

## Commits (atomic)

| Hash      | Type | Title                                                            |
| --------- | ---- | ---------------------------------------------------------------- |
| `bfe85e9` | feat | add ownerScope to editor tabs; render in right panel             |
| `1e35dda` | feat | cross-scope drop + click routing for editor tabs                 |
| `2e4746b` | feat | persist editor tab ownerScope across restart                     |
| `901ec34` | test | cover editor tab cross-scope drag + right-panel mount            |
| `478fee5` | docs | close cross-scope editor tab follow-up in 20-05 summary          |

## What changed

### 1. `EditorTabData.ownerScope: TerminalScope`

- New field on the `EditorTabData` interface; every creator
  (`openEditorTab`, `openEditorTabPinned`) sets `ownerScope: 'main'`.
- Legacy tabs without the field are treated as `'main'` everywhere
  (`(t.ownerScope ?? 'main')`).
- On `openEditorTab*`, the new tab's id is also seeded into the main
  scoped tab order (`setScopedTabOrder('main', ...)`) so the
  per-scope ordering stays authoritative.

### 2. `computeDynamicTabsForScope` filters by `ownerScope`

Before:
```ts
const editors = scope === 'main' ? editorTabs.value : [];
```

After:
```ts
const editors = editorTabs.value.filter(
  t => (t.ownerScope ?? 'main') === scope,
);
```

So the right tab bar now renders editor tabs owned by right, and
the main tab bar excludes any that have migrated to right.

### 3. Right panel renders editor tabs

`right-panel.tsx` imports `EditorTab` and `editorTabs`, computes
`rightEditors = editorTabs.value.filter(t => t.ownerScope === 'right')`,
and maps each to an `<EditorTab>` under `.right-panel-content`. The
CodeMirror `registerEditorView` registry is keyed on `tabId`, so each
editor still has exactly one `EditorView` — `main-panel.tsx` is updated
to filter by `ownerScope === 'main'` so the two mount points never
collide.

Exclusive display is preserved: `RightPanel` computes `isEditorActive`
against the right-scope `activeTabId` and hides the
`.terminal-containers[data-scope="right"]` wrapper whenever an editor
tab is the active one. Sticky File Tree / GSD and Git Changes display
toggles are unchanged.

### 4. `handleCrossScopeDrop` — editor branch

Replaces the prior `if (sourceId.startsWith('editor-')) return;`
short-circuit with real handling:

1. Find the editor in `editorTabs`, bail if missing or already in
   target scope.
2. Immutable map → flip `ownerScope` to `targetScope`; call
   `setProjectEditorTabs(updated)` so the reactive computed fires.
3. Remove the id from the source's scoped order, append to target's.
4. Activate in target via the proper signal:
   - `target === 'right'` → set `getTerminalScope('right').activeTabId`
     to the editor id; fall `activeUnifiedTabId` back to first
     remaining main dynamic tab (or `''`).
   - `target === 'main'` → set `activeUnifiedTabId` to the editor id;
     fall right scope's `activeTabId` back to first remaining right
     dynamic tab, or `'file-tree'` sticky default.

### 5. `handleTabClick` — route editor activation by scope

Editor clicks now route to the owning scope's signal:

```ts
if (tab.type === 'editor') {
  if ((tab.ownerScope ?? 'main') === 'right') {
    getTerminalScope('right').activeTabId.value = tab.id;
    return;
  }
  activeUnifiedTabId.value = tab.id;
  return;
}
```

This stops the pre-existing `activeTabId.subscribe` hijack path from
dragging `activeUnifiedTabId` onto a right-scope editor id, which would
otherwise cause `MainPanel` to also render the editor as active.

### 6. Persistence round-trip

`persistEditorTabs` now writes `ownerScope` for each tab (defaulting to
`'main'` for legacy in-memory tabs). `restoreEditorTabs` reads it back:
tabs are opened via the existing `openEditorTab` / `openEditorTabPinned`
path (which defaults to main), then if the persisted scope is `right`,
the restored tab is flipped to right in-place and its id is moved from
main's to right's scoped order.

## Minimap trade-off (documented, intentional)

`minimapVisible` is a module-level signal in `src/editor/setup.ts`
shared by every `EditorView`. Toggling it affects both main and right
editors simultaneously. The unified-tab-bar's minimap icon already
renders per scope (via `isEditorTabActiveInScope`) and calls the shared
`toggleMinimap`, so either tab bar can toggle the setting. Making
minimap state per-scope would require splitting the compartment
configuration and the signal, and is out of scope for this plan. The
trade-off matches how 20-05-D2 handles minimap tracking — see
`abd7173` commit message ("minimap tracks own-scope active").

## Verification

- `pnpm exec tsc --noEmit` → exit 0
- `pnpm exec vitest run src/components/unified-tab-bar.test.tsx src/components/right-panel.test.tsx src/components/terminal-tabs.test.ts src/state-manager.test.ts` → **86 / 86 passed** (4 files)
  - `unified-tab-bar.test.tsx`: 33 tests (28 baseline + 5 new for Plan 20-05-D)
  - `right-panel.test.tsx`: 15 tests (12 baseline + 3 new for Plan 20-05-D)
  - `terminal-tabs.test.ts`: 37 tests (baseline, no regressions)
  - `state-manager.test.ts`: 1 test (baseline, no regressions)
- `cd src-tauri && cargo check` → exit 0

## Files Modified

| File                                                                   | Purpose                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/components/unified-tab-bar.tsx`                                   | ownerScope field, scoped filters, drop/click routing, persistence   |
| `src/components/main-panel.tsx`                                        | filter editor tabs by `ownerScope === 'main'` before mount          |
| `src/components/right-panel.tsx`                                       | mount `<EditorTab>` for right-owned editors; exclusive display      |
| `src/components/unified-tab-bar.test.tsx`                              | 5 new tests for editor cross-scope drop + click                     |
| `src/components/right-panel.test.tsx`                                  | 3 new tests for editor mount + exclusive display under right panel  |
| `.planning/phases/20-right-panel-multi-terminal/20-05-SUMMARY.md`      | close the cross-scope editor follow-up                              |

## Deviations from plan

**None.** Task list executed exactly as specified:

1. ownerScope on EditorTabData ✓ (defaults `'main'`, legacy tabs treated as main)
2. `computeDynamicTabsForScope` filters editors by scope ✓
3. Editor content renders in right panel via a second mount ✓ (Option A:
   dedicated mounts per panel; main + right each mount their own
   editors filtered by ownerScope, so each `EditorView` has one parent)
4. Cross-scope drop for editor tabs ✓
5. Persist ownerScope ✓ (round-trips via `persistEditorTabs` +
   `restoreEditorTabs`; backward-compatible default 'main')
6. Tests added ✓ (5 unified-tab-bar + 3 right-panel)
7. 20-05-SUMMARY.md updated ✓ (TODO removed; "completed by 20-05-D"
   section added; remaining xterm container follow-up kept)

Plan specifies Monaco; the codebase actually uses CodeMirror 6 (see
`src/editor/setup.ts`, `editor-tab.tsx`). The plan's intent — render a
second editor under the right panel — is satisfied: each `EditorTab`
component creates its own `EditorView` in its own container, and the
`registerEditorView` registry keys on `tabId`, so the save + dirty +
`triggerEditorSave` pipeline works identically for right-scope editors.

## Scope Compliance

Did NOT modify per plan instructions:
- `.planning/STATE.md`
- `.planning/ROADMAP.md`

All commits use `--no-verify` per plan.

## Self-Check: PASSED

- [x] `src/components/unified-tab-bar.tsx` modified (commits bfe85e9, 1e35dda, 2e4746b)
- [x] `src/components/main-panel.tsx` modified (commit bfe85e9)
- [x] `src/components/right-panel.tsx` modified (commit bfe85e9)
- [x] `src/components/unified-tab-bar.test.tsx` modified (commit 901ec34)
- [x] `src/components/right-panel.test.tsx` modified (commit 901ec34)
- [x] `.planning/phases/20-right-panel-multi-terminal/20-05-SUMMARY.md` modified (commit 478fee5)
- [x] Commit `bfe85e9` exists in log
- [x] Commit `1e35dda` exists in log
- [x] Commit `2e4746b` exists in log
- [x] Commit `901ec34` exists in log
- [x] Commit `478fee5` exists in log
- [x] `pnpm exec tsc --noEmit` exit 0
- [x] All specified tests pass (86/86)
- [x] `cargo check` exit 0
