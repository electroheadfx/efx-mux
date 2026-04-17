---
phase: 20
plan: 04
subsystem: ui-integration
tags: [preact, ui, integration, bootstrap, right-panel, tdd]

# Dependency graph
requires:
  - 20-01 (getTerminalScope scope registry + right-scope lifecycle)
  - 20-02 (UnifiedTabBar scope prop + sticky tabs + openOrMoveGitChangesToRight)
  - 20-03 (state-manager migration + kill_legacy_right_sessions Rust command)
provides:
  - Single-pane RightPanel component driven by scope='right' tab bar
  - Dual-scope bootstrap in main.tsx (legacy migration + restore on project switch)
  - Legacy right-panel CSS removed; single-pane .right-panel-content rules added
  - 12 integration tests (D-01, D-17, D-21, Pitfall 6)
affects:
  - Right-panel user experience (SIDE-02)
  - Phase 20 human-verification gate (Task 4 checkpoint)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pane content area with always-mounted sticky bodies + PTY wrapper toggled via display:block/none (Pitfall 6 exclusive display)"
    - "Dual-scope restore serialized via await chain (Pitfall 4 mitigation — no concurrent persist race requires _suppressPersist flag)"
    - "Signal-seed-at-creation for scope-specific defaults (right-scope activeTabId initializes to 'file-tree' at scope-state creation time, so first render is deterministic without a separate init-effect)"

key-files:
  created:
    - src/components/right-panel.test.tsx
    - .planning/phases/20-right-panel-multi-terminal/20-04-SUMMARY.md
  modified:
    - src/components/right-panel.tsx
    - src/components/terminal-tabs.tsx
    - src/main.tsx
    - src/styles/app.css
    - src/drag-manager.ts

key-decisions:
  - "Seeded right-scope activeTabId signal to 'file-tree' at scope-state creation time (in terminal-tabs.tsx createScopeState), not in a component useEffect. This guarantees D-17 (new-project default) is met on the very first render without requiring a mount-time effect or race-prone init path."
  - "Deleted the stale drag-manager right-h handle block (Rule 2 auto-fix). The block was dead after the right-panel rewrite because the `[data-handle=right-h]` element no longer exists. Removing it prevents accidental resurrection of the right-h-pct layout write if a future refactor reintroduces the handle."
  - "Right-scope restore is serialized after main-scope restore (await chain) in both initial bootstrap and project-changed handler. This sidesteps Pitfall 4's suggested `_suppressPersist` flag — there is no overlap between the two restores' persist writes because they touch different keys (`terminal-tabs:<project>` vs `right-terminal-tabs:<project>`)."
  - "Active-tab fallback is inlined in main.tsx (not deferred to the scoped restoreProjectTabs function). If the persisted activeTabId no longer resolves to any sticky id, git-changes id, or dynamic tab id after restore, fall back to 'file-tree'. Keeps the fallback logic visible at the call site for easier audit."

patterns-established:
  - "Signal-seeded-at-creation pattern: scope-specific default values (like D-17's file-tree default) live in createScopeState, not in component useEffect hooks."
  - "Exclusive-display single-pane pattern: all bodies always mounted with display:block/none toggled by a single activeId signal, yielding O(1) tab-switch cost with no mount/unmount thrashing."

requirements-completed: [SIDE-02]

# Metrics
duration: ~13 min
completed: 2026-04-17
tasks: 4 (1 checkpoint)
files_modified: 5
tests_added: 12
tests_passing: 59 (Phase 20 subset — terminal-tabs + unified-tab-bar + right-panel + state-manager)
---

# Phase 20 Plan 04: Right Panel Integration Summary

**The prior two-pane right panel (`[File Tree|GSD]` top + `[Bash]` bottom) is replaced by a single full-height pane driven by `UnifiedTabBar scope='right'`, with sticky File Tree + GSD bodies always mounted and dynamic terminal/agent/Git-Changes tabs rendered via display:block/none toggles. main.tsx is extended with legacy migration, dual-scope restore on project switch, and removal of the stale switch-bash-session/right-h-pct infrastructure.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-17T22:40Z
- **Completed (pre-checkpoint):** 2026-04-17T22:55Z
- **Tasks:** 4 (Task 4 is the human-verification checkpoint — automation work complete)
- **Files modified:** 5 (right-panel.tsx, terminal-tabs.tsx, main.tsx, app.css, drag-manager.ts) + 1 created (right-panel.test.tsx)

## Accomplishments

- **Single-pane RightPanel** (92 lines, down from 156 lines in the prior split layout). Structure: `aside.right-panel` > `UnifiedTabBar scope='right'` + `div.right-panel-content` containing [File Tree body, GSD body, optional Git Changes body, `.terminal-containers[data-scope='right']` wrapper]. Exactly one body is `display: block` at any time.
- **D-17 default active tab** seeded in `createScopeState('right')` so the first render of the right panel shows File Tree without any mount-time effect.
- **main.tsx bootstrap** extended to:
  - Invoke `kill_legacy_right_sessions` after `cleanup_dead_sessions` (D-19 migration — silently kills any `<project>-right` tmux session from the prior layout).
  - Restore right-scope tabs for the active project after main-scope restore in both initial bootstrap and `project-changed` handler. Active-tab fallback to `'file-tree'` if persisted ID no longer resolves.
  - Save right-scope tabs on `project-pre-switch` for the outgoing project.
  - Remove the `rightCurrentSession` let binding, the `switch-bash-session` CustomEvent dispatch, and the `right-h-pct` layout-apply block.
- **CSS migration:** removed `.right-top` / `.right-bottom` / `.right-top-content` / `.right-bottom-content` rules; added `.right-panel-content` and `.terminal-containers[data-scope='right']` per UI-SPEC.
- **drag-manager cleanup (Rule 2 auto-fix):** removed the dead `[data-handle='right-h']` drag block, which was inert after the right-panel rewrite but would resurrect the stale `right-h-pct` layout write if someone reintroduced the handle.
- **12 integration tests** covering D-01 (no split handle, no right-top/right-bottom nodes, terminal-containers wrapper), D-17 (default active=file-tree, tab bar labels), D-21 (switch-bash-session dispatch is inert), Pitfall 6 (exclusive display for file-tree / GSD / terminal / git-changes states). All pass.

## Task Commits

| Task | Type | Hash | Message |
|------|------|------|---------|
| 1 RED | test | 36fa4eb | test(20-04): add failing integration tests for single-pane RightPanel |
| 1 GREEN | feat | a80c6ae | feat(20-04): rewrite right-panel as single-pane with UnifiedTabBar scope='right' |
| 2 | feat | 9da233b | feat(20-04): wire main.tsx for dual-scope bootstrap + legacy migration |
| Rule 2 | feat | e72f7b7 | feat(20-04): remove stale drag-manager right-h handle block (Rule 2 auto-fix) |
| 3 | (covered by 36fa4eb) | — | The integration test file serves as both the Task 1 RED gate and the Task 3 deliverable — acceptance criteria for both are identical. |
| 4 | checkpoint | — | **Human-verification checkpoint — awaiting user approval** |

TDD gate sequence: `test (36fa4eb) → feat (a80c6ae) → ...` — RED before GREEN verified in git log.

## Files Created/Modified

- **`src/components/right-panel.tsx`** (REWRITTEN, 92 lines) — single-pane shell with UnifiedTabBar scope='right' and .right-panel-content flex container. Zero useRef, zero useEffect, zero imports from state-manager (legacy), zero hex literals.
- **`src/components/right-panel.test.tsx`** (CREATED, 229 lines) — 12 it() blocks covering D-01/D-17/D-21/Pitfall 6.
- **`src/components/terminal-tabs.tsx`** (ONE-LINE AMENDMENT) — `createScopeState` initializes right-scope `activeTabId` signal to `'file-tree'` (was `''`).
- **`src/main.tsx`** (+76/-27 lines) — imports `getTerminalScope` + `gitChangesTab`; adds `kill_legacy_right_sessions` invocation; adds right-scope restore to initial bootstrap + project-changed handler with file-tree fallback; extends project-pre-switch to save right scope; removes `rightCurrentSession`, `switch-bash-session` dispatch, and `right-h-pct` apply block.
- **`src/styles/app.css`** — removed legacy right-top/right-bottom CSS; added .right-panel-content + .terminal-containers[data-scope='right'] rules.
- **`src/drag-manager.ts`** (-29/+5 lines) — removed dead `[data-handle='right-h']` block.

## Before/After DOM Structure

**Before (Phase 17 split layout, now gone):**
```
aside.right-panel
├── .right-top  (flex 60%)
│   ├── TabBar(File Tree / GSD)
│   └── .right-top-content
│       ├── GSDPane (display toggled)
│       └── FileTree (display toggled)
├── .split-handle-h [data-handle="right-h"]
└── .right-bottom  (flex 40%)
    ├── TabBar(Bash)
    └── .right-bottom-content
        └── #bash-terminal-container
```

**After (Phase 20 single pane):**
```
aside.right-panel
├── UnifiedTabBar scope="right"   (renders: File Tree | GSD | [dynamic tabs...])
└── .right-panel-content
    ├── div[display: toggled] > FileTree
    ├── div[display: toggled] > GSDPane
    ├── div[display: toggled] > GitChangesTab    (rendered only when owningScope==='right')
    └── .terminal-containers[data-scope="right"][display: toggled]
         (PTY mount point for scope='right' dynamic terminal/agent tabs)
```

## CSS Diff Summary

**Removed (28 lines):**
- `.right-top { flex: 1 1 60%; ... }`
- `.right-bottom { flex: 1 1 40%; ... }`
- `.right-top-content { overflow-y: auto; padding: 4px; }`
- `.right-bottom-content { overflow: hidden; }`

**Added (12 lines):**
- `.right-panel-content { flex: 1; min-height: 0; overflow: hidden; position: relative; }`
- `.terminal-containers[data-scope="right"] { position: absolute; inset: 0; }`

Net: **-16 lines** of CSS.

`.split-handle-h` rules are preserved — the class is still used by main-panel.tsx for the server-pane resize handle.

## main.tsx Line Changes Summary

- `+1` import: `getTerminalScope` from terminal-tabs
- `+1` import: `gitChangesTab` from unified-tab-bar
- `-1` binding: `let rightCurrentSession = ''`
- `-4` lines: `rightCurrentSession` derivation inside `requestAnimationFrame`
- `+14` lines: `kill_legacy_right_sessions` invocation block
- `+18` lines: initial bootstrap right-scope restore + file-tree fallback
- `+1` line: right-scope save in project-pre-switch handler
- `+18` lines: project-changed handler right-scope restore + file-tree fallback
- `-4` lines: `switch-bash-session` CustomEvent dispatch + `rightCurrentSession` update
- `-13` lines: `right-h-pct` layout-apply block

Net: **+76 insertions / -27 deletions**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Deleted stale drag-manager right-h handle block**
- **Found during:** Post-Task-2 grep sweep (`grep -rn "right-h-pct" src/`)
- **Issue:** `src/drag-manager.ts:91-117` contained a `[data-handle="right-h"]` query + makeDragH registration block. The handle no longer exists in the DOM after the right-panel rewrite, so the block was inert — but it would still execute `updateLayout({ 'right-h-pct': ... })` on drag-end if someone ever accidentally reintroduced the handle, defeating the D-20 migration. Cleaner to delete the block entirely with a breadcrumb comment.
- **Fix:** Removed 29 lines; added a 5-line comment documenting the Phase 20 D-01 removal.
- **Files modified:** `src/drag-manager.ts`
- **Verification:** `pnpm exec tsc --noEmit` clean; no test regressions.
- **Committed in:** `e72f7b7`

**2. [Rule 3 - Blocking] Test helper signature widened from HTMLElement to Element**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** `@testing-library/preact`'s `render()` returns `{ container: Element }` (not `HTMLElement`). Passing `container` to `getBodies(container: HTMLElement)` produced 6 TS2345 errors.
- **Fix:** Widened `getBodies` parameter to `Element`. Internal `querySelector` still returns `HTMLElement` via explicit casts, so body-side logic is unaffected.
- **Files modified:** `src/components/right-panel.test.tsx` (helper signature)
- **Verification:** `pnpm exec tsc --noEmit` clean.
- **Committed in:** `a80c6ae` (bundled into Task 1 GREEN commit)

### Minor Deviations from Plan Action Text

- **Plan Task 1 Action 2 asked to seed the default active tab via an inline init at module top-level OR in a component useEffect.** Instead, the seed was placed in `createScopeState('right')` in terminal-tabs.tsx — this is what the plan actually recommends at the bottom of Action 2 ("Revisit Plan 01's createScopeState..."). No functional deviation; just followed the preferred path.

- **Plan Task 2 Action 7 asked to verify `_suppressPersist` guard pattern.** Audited Plan 01's `restoreProjectTabsScoped` — it does not set a module-level suppression flag. Chose to rely on the await-chained serialization in main.tsx instead (main restore completes before right restore begins, so their persist writes never overlap in time). Documented in the key-decisions frontmatter.

## Acceptance Criteria Verification

**Task 1:**
- `grep -n "UnifiedTabBar scope=\"right\"" src/components/right-panel.tsx` → **1 match at line 45** ✓
- `grep -n "data-scope=\"right\"" src/components/right-panel.tsx` → **1 match at line 81** ✓
- Forbidden tokens (useRef, useEffect, bashContainerRef, bashSessionRef, rightBottomTab, switch-bash-session, handleSwitchBash, split-handle-h, RIGHT_TOP_TABS, RIGHT_BOTTOM_TABS) → **0** ✓
- `grep -n "gitChangesTab" src/components/right-panel.tsx` → **2 matches** ✓
- `grep -n "getTerminalScope('right')" src/components/right-panel.tsx` → **2 matches** ✓
- Hex literals → **0** ✓
- `grep -n "right-panel-content" src/styles/app.css` → **1 match** ✓
- `grep -n "data-scope=\"right\"" src/styles/app.css` → **1 match** ✓
- `pnpm exec tsc --noEmit` → **exits 0** ✓

**Task 2:**
- `grep -n "kill_legacy_right_sessions" src/main.tsx` → **1 match** ✓
- `grep -c "getTerminalScope('right')" src/main.tsx` → **6 matches** (>= 2 required) ✓
- `grep -c "rightCurrentSession|switch-bash-session|handleSwitchBash|right-h-pct|right-bash"` in main.tsx **active code** → **0 matches** (only comment references remain) ✓
- `grep -n "'file-tree'" src/main.tsx` → **6 matches** (>= 1 required) ✓
- `pnpm exec tsc --noEmit` → **exits 0** ✓
- `npx vitest run` (Phase 20 subset) → **59/59 passing** ✓

**Task 3:**
- File `src/components/right-panel.test.tsx` exists → **yes** ✓
- `grep -c "^\s*it(" src/components/right-panel.test.tsx` → **12** (>= 6 required) ✓
- `grep -n "data-handle=\"right-h\"" src/components/right-panel.test.tsx` → **match** ✓
- `grep -n "switch-bash-session" src/components/right-panel.test.tsx` → **5 matches** ✓
- `grep -n "data-scope=\"right\"" src/components/right-panel.test.tsx` → **matches** ✓
- `npx vitest run src/components/right-panel.test.tsx` → **12/12 passing** ✓

**Task 4:** Awaiting human verification (checkpoint).

## Full-Suite Test Run

```
Test Files  2 failed | 18 passed (21)
      Tests  11 failed | 295 passed (314)
```

All 11 failing tests are in `src/components/git-control-tab.test.tsx` (9 failures) and `src/components/sidebar.test.tsx` (2 failures) — **these are the exact pre-existing failures documented in `.planning/phases/20-right-panel-multi-terminal/deferred-items.md`** and verified pre-existing in Plans 20-01, 20-02, 20-03. No new regressions from Plan 20-04.

Phase 20 test files (59 tests total) all pass: terminal-tabs (16), unified-tab-bar (14), right-panel (12), state-manager (17).

## Rust Verification

- `cd src-tauri && cargo check` → **exits 0** ✓

## Grep Cleanup Final State

```
grep -rn "switch-bash-session|rightBottomTab|right-bottom-tab|right-h-pct|right-tmux-session" src/ --include="*.ts" --include="*.tsx"
```

Remaining matches are all intentional:
- `src/state-manager.ts` — migration delete calls (silently drops legacy keys)
- `src/state-manager.test.ts` — tests that verify the migration works
- `src/drag-manager.ts:93` — breadcrumb comment
- `src/main.tsx:506,616` — removal breadcrumb comments
- `src/components/right-panel.test.tsx` — D-21 absence tests (verify no listener installed)

**No active code uses any of the legacy keys anywhere in the tree.**

## UAT Outcome

**Task 4 checkpoint reached — awaiting user approval.**

The automation-ready verification environment is the user's existing dev workflow: the user will run `pnpm tauri dev` on their side (per CLAUDE.md directive: "Please do not run the server, I do on my side") and execute the 12-step verification protocol from the plan's Task 4 `<how-to-verify>` block.

## Remaining Follow-up Items

None blocking the plan. The 11 pre-existing test failures in `sidebar.test.tsx` and `git-control-tab.test.tsx` are already tracked in `deferred-items.md` and are out of scope per SCOPE BOUNDARY rule (they pre-date Phase 20 entirely).

## Self-Check: PASSED

**Files claimed created/modified:**
- `src/components/right-panel.tsx` — FOUND (modified, 92 lines)
- `src/components/right-panel.test.tsx` — FOUND (created, 229 lines, 12 it() blocks)
- `src/components/terminal-tabs.tsx` — FOUND (modified, 1-line amendment to createScopeState)
- `src/main.tsx` — FOUND (modified, +76/-27)
- `src/styles/app.css` — FOUND (modified, -16 net lines)
- `src/drag-manager.ts` — FOUND (modified, -24 net lines)

**Commits claimed:**
- `36fa4eb` (test RED) — FOUND in git log
- `a80c6ae` (feat GREEN) — FOUND in git log
- `9da233b` (main.tsx wire) — FOUND in git log
- `e72f7b7` (drag-manager cleanup) — FOUND in git log

**Verification claims:**
- `npx tsc --noEmit` → clean
- `npx vitest run src/components/right-panel.test.tsx` → 12/12 green
- `npx vitest run` (full suite) → 295/314 passing; 11 failures pre-existing and documented
- `cd src-tauri && cargo check` → exits 0

**TDD gate sequence:** `test(36fa4eb) → feat(a80c6ae)` — RED before GREEN verified ✓

---
*Phase: 20-right-panel-multi-terminal*
*Plan: 04*
*Status: Tasks 1-3 complete; Task 4 checkpoint awaiting human approval*
*Completed (automation): 2026-04-17*
