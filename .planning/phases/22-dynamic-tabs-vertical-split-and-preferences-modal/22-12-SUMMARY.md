---
phase: 22
plan: 12
subsystem: unified-tab-bar + terminal-tabs
tags: [gap-closure, plus-button, scope-routing, counter-decision, uat-test-15]
requires:
  - 22-06 (hierarchical scope registry + getTerminalScope remap)
  - 22-08 (projectTabCounter persistence path)
  - 22-09 (tab signals stable across sub-scopes)
provides:
  - buildDropdownItems exported with optional test-injection overrides
  - +-menu Terminal/Agent actions now forward originating scope to createNewTab
  - Monotonic counter invariant documented inline near allocateNextSessionName
affects:
  - User: clicking + in main-1/main-2/right-0/right-1/right-2 spawns the new tab in that pane (previously always landed in main-0)
  - Design: counter-behavior decision finalized → option-monotonic (STATE.md Decisions)
  - No PTY backend changes (option-gap-fill-with-tmux-wipe rejected)
tech-stack:
  added: []
  patterns:
    - Optional `overrides` parameter pattern for testability (matches existing createAndFocusMainTerminalTab's `creator` test-injection parameter)
    - Scope propagation via CreateTabOptionsShape.scope → createNewTab → createNewTabScoped(scope, options)
    - Empty git commit for no-op task documentation (Task 3 monotonic branch)
key-files:
  created: []
  modified:
    - src/components/unified-tab-bar.tsx (buildDropdownItems exported; BuildDropdownItemsOverrides interface; spawnTerminal indirection; Terminal/Agent actions forward scope)
    - src/components/terminal-tabs.tsx (inline rationale comment at allocateNextSessionName documenting MONOTONIC invariant)
    - src/components/unified-tab-bar.test.tsx (3 new 22-12 tests: main-1, right-1 agent, main-2)
    - .planning/STATE.md (Phase 22-12 decision entry)
decisions:
  - "[Phase 22-12]: counter behavior = monotonic; preserves PTY-safety and D-12 stable-name invariant"
  - buildDropdownItems is exported as the single-source-of-truth for +-menu action wiring. Overrides parameter enables test injection without leaking the creator into production consumers (UnifiedTabBar omits overrides and gets createAndFocusMainTerminalTab).
  - Task 3 is an empty git commit rather than a skipped-task marker — keeps one commit per task for SUMMARY traceability and makes the "no-op" decision visible in git log.
metrics:
  duration: "~10min"
  completed: "2026-04-18"
---

# Phase 22 Plan 12: Gap-Closure — +-Button Scope Routing + Counter Decision Summary

Fixes UAT test 15a (sub-issue: + click always routes new terminal to main-0 regardless of which tab bar was clicked). Also finalizes the counter-behavior design question raised in UAT test 15b via a blocking checkpoint.

## Tasks Completed

| # | Task                                                                   | Commit   |
| - | ---------------------------------------------------------------------- | -------- |
| 1 | Decision checkpoint → record option-monotonic + inline rationale       | 8987915  |
| 2 | RED: 3 failing tests for +-button scope routing                        | 324bfbe  |
| 2 | GREEN: buildDropdownItems exported; Terminal/Agent actions forward scope | 1202c8f  |
| 3 | No-op — monotonic branch (empty commit for task traceability)          | 232bf0d  |

## Task 1: Counter-Behavior Decision

**User selected:** `option-monotonic` (the planner's defended default).

**Recorded in:** `.planning/STATE.md` Decisions section:
> `[Phase 22-12]: counter behavior = monotonic; preserves PTY-safety and D-12 stable-name invariant (deleting Terminal-N does not reuse slot N; next slot is max+1). Rationale: orphan tmux sessions may survive slot deletion → reuse would re-attach stale content; matches D-12 "PTY session name is stable on scope move"; simpler (one integer counter) vs. gap-fill (scan all 6 scopes per allocation).`

**Inline documentation:** `src/components/terminal-tabs.tsx:104` — 10-line comment block preceding `allocateNextSessionName` documenting the three rationale points (PTY safety, D-12 stable-name invariant, implementation simplicity) and noting that gap-fill / gap-fill-with-tmux-wipe alternatives were rejected.

## Task 2: + Button Scope Routing Fix

### Diagnosis

`buildDropdownItems(scope)` in `src/components/unified-tab-bar.tsx` constructed a dropdown with Terminal/Agent actions that called `createAndFocusMainTerminalTab()` — *without* a scope argument. The underlying `createNewTab(options)` defaulted to `options?.scope ?? 'main-0'`, so every + click, regardless of the originating pane, routed the new tab into `main-0`.

### Fix

Three changes in `unified-tab-bar.tsx`:

1. **Exported `buildDropdownItems`** with an optional `overrides?: BuildDropdownItemsOverrides` parameter. Production callers (`UnifiedTabBar`) omit it and get default behavior. Tests pass `{ createTerminalTab: spy }` to intercept the creator without triggering real PTY spawn.

2. **`spawnTerminal` indirection** inside `buildDropdownItems`:
   ```ts
   const spawnTerminal = (opts: CreateTabOptionsShape) => {
     if (overrides?.createTerminalTab) return overrides.createTerminalTab(opts);
     return createAndFocusMainTerminalTab(opts);
   };
   ```

3. **Terminal/Agent action callbacks forward scope**:
   ```ts
   { label: 'Terminal (Zsh)', action: () => { void spawnTerminal({ scope }); } }
   { label: 'Agent',          action: () => { void spawnTerminal({ scope, isAgent: true }); } }
   ```

Scope flows through `CreateTabOptionsShape.scope` → `createNewTab({scope, isAgent})` → `createNewTabScoped(scope, options)` → `s.tabs.value = [...]` (writes to the correct scope's signal) and sets `ownerScope: scope` on the new tab.

### Tests Added (3 green)

| Test | Scope | Assertion |
|------|-------|-----------|
| Terminal item action forwards originating scope main-1 to creator | main-1 | creator.mock.calls[0][0].scope === 'main-1' && !isAgent |
| Agent item action forwards originating scope right-1 with isAgent=true | right-1 | creator.mock.calls[0][0].scope === 'right-1' && isAgent === true |
| Terminal item action forwards originating scope main-2 | main-2 | creator.mock.calls[0][0].scope === 'main-2' |

## Task 3: Counter Gap-Fill (Conditional — No-Op)

Per Task 1 user decision (`option-monotonic`), Task 3's gap-fill implementation branches (B and C) were rejected. Task 3 is an empty git commit (`232bf0d`) for atomic task traceability; the rationale comment was folded into Task 1's commit since both document the same monotonic invariant.

**No changes to:**
- `src-tauri/src/pty.rs` (no `wipe_tmux_session` command added — option-C was rejected)
- `src-tauri/src/lib.rs` (no new command registration)
- `src/components/terminal-tabs.tsx` `allocateNextSessionName` body (current monotonic implementation retained verbatim)

## Verification Results

| Check                                                                                               | Result                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `grep -c "Phase 22-12.*counter behavior" .planning/STATE.md`                                        | 1                                                |
| `grep -in "monotonic by design" src/components/terminal-tabs.tsx`                                   | 1 (line 104)                                     |
| `grep -nE "export function buildDropdownItems" src/components/unified-tab-bar.tsx`                  | 1 (line 1252)                                    |
| `grep -nE "spawnTerminal\(\{ scope" src/components/unified-tab-bar.tsx`                             | 2 (Terminal + Agent items)                       |
| `grep -cE "scope: 'main-0'\|scope: 'main'" src/components/unified-tab-bar.tsx` (+-menu construction) | 0 (no hardcoded scope in the dropdown actions)   |
| `grep -cE "ownerScope: scope" src/components/terminal-tabs.tsx`                                     | 2 (createNewTabScoped + restore loop)            |
| `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "22-12"`                           | 3 passed / 0 failed                              |
| `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` (vs 22-11 baseline 17 fail / 54 pass) | 14 failed / 57 passed (+3 new, 0 regressions)   |
| `pnpm exec tsc --noEmit 2>&1` — errors in 22-12 additions (unified-tab-bar lines 1252-1285, test lines 1121-1156) | 0 |

### Pre-existing Failures Not Touched

The 14 failing tests in `unified-tab-bar.test.tsx` are pre-existing (sticky-tab rendering, D-05, D-06 plus-menu, Fix #3 sticky order, rename suppression, split icon presence) and unrelated to 22-12. The stash-compare baseline (17 fail / 54 pass → 14 fail / 57 pass) shows 3 new passes and 0 regressions — scope routing fix does not perturb sibling suites.

## Deviations from Plan

### Auto-Fixed

**1. [Rule 3 — Blocking] File extension mismatch: plan says `terminal-tabs.ts`, actual file is `terminal-tabs.tsx`**
- **Found during:** Task 2 pre-flight file inspection.
- **Issue:** Plan's `<files_modified>` and `<read_first>` reference `src/components/terminal-tabs.ts`. The actual file is `src/components/terminal-tabs.tsx` (contains JSX for `ActiveTabCrashOverlayScoped`).
- **Fix:** Treated plan references as the `.tsx` file. Grep-based acceptance gates using `terminal-tabs.ts` were interpreted as `terminal-tabs.tsx` (same symbolic file).
- **Files:** `src/components/terminal-tabs.tsx` (unchanged structurally, comment added at line 104).
- **Commit:** 8987915.

**2. [Rule 3 — Blocking] Plan test template used `mockIPC` + DOM click flow; actual test infrastructure requires module-level injection**
- **Found during:** Task 2 RED design.
- **Issue:** The plan's RED test template rendered `<UnifiedTabBar scope="main-1" />` and clicked through the + menu, expecting `getTerminalScope('main-1').tabs.value.length === 1` after the click. In practice, real `createNewTab` calls `document.querySelector('.terminal-containers[data-scope=main-1]')`, creates xterm.js objects, and spawns a PTY — none of which are viable in jsdom without heavy mocking. The plan explicitly flagged this ("The exact API depends on Plan 22-01's shipped surface").
- **Fix:** Export `buildDropdownItems` with a `createTerminalTab` test-injection override (matching the existing `createAndFocusMainTerminalTab(options, creator?)` pattern from quick-260418-bpm tests). Tests invoke `buildDropdownItems(scope, { createTerminalTab: spy })` directly, assert the action forwards scope through the spy. Much faster, more reliable, and no flaky PTY setup.
- **Files:** `src/components/unified-tab-bar.tsx` (exported + override param), `src/components/unified-tab-bar.test.tsx` (3 tests using the override).
- **Commit:** 324bfbe (RED), 1202c8f (GREEN).

**3. [Rule 2 — Critical] `vi.fn(async () => undefined)` infers args as empty tuple in TS**
- **Found during:** Task 2 post-GREEN TS check.
- **Issue:** `pnpm exec tsc --noEmit` reported 7 new errors on lines 1130/1131/1132/1143/1144/1145/1154 of the form `Tuple type '[]' of length '0' has no element at index '0'` — because vitest's `vi.fn(async () => undefined)` infers zero-arg signature, breaking `mock.calls[0][0]` access.
- **Fix:** Typed the spy parameter explicitly: `vi.fn(async (_opts: { scope?: string; isAgent?: boolean }) => undefined)`. Preserves the spy behavior (returns undefined) while giving TS a proper signature.
- **Files:** `src/components/unified-tab-bar.test.tsx` (all 3 test instances via replace_all).
- **Commit:** 1202c8f (same commit as GREEN).

## Threat Flags

None — all changes are scope-parameter plumbing through existing typed interfaces (TerminalScope union). No new network, auth, or filesystem surface introduced.

## Success Criteria

- [x] Task 1 decision recorded in STATE.md + inline comment (option-monotonic)
- [x] Task 2 RED → GREEN: + button routes to originating scope
- [x] Task 3 no-op (empty commit) with rationale documented in Task 1 commit
- [x] 3 new tests green, 0 regressions in unified-tab-bar.test.tsx
- [x] TS clean on all 22-12 additions
- [x] Plan acceptance gates satisfied (scope routing count ≥ 2; no hardcoded scope in +-menu; ownerScope set)

## Hand-off Note for Plan 22-13

Plan 22-12 closes UAT test 15a (scope routing) and resolves the 15b design question. The counter is frozen as monotonic — future plans that touch `allocateNextSessionName` should NOT change this behavior without re-opening the decision in a new checkpoint. If a user ever re-raises the gap-fill concern (e.g., "my counter is Terminal-47 and it's ugly"), the defended answer is: D-12 + PTY safety trump label aesthetics.

`buildDropdownItems` is now the canonical export for +-menu wiring. Any future dropdown additions (File Tree in non-right scopes, custom commands, shell picker, etc.) should extend this function rather than introducing parallel builders.

## Self-Check: PASSED

Files verified present:
- `src/components/unified-tab-bar.tsx` — FOUND (exported buildDropdownItems + scope forwarding)
- `src/components/unified-tab-bar.test.tsx` — FOUND (3 new 22-12 tests)
- `src/components/terminal-tabs.tsx` — FOUND (MONOTONIC rationale comment at line 104)
- `.planning/STATE.md` — FOUND (Phase 22-12 decision entry)

Commits verified present via `git log --oneline -5`:
- `8987915 docs(22-12): record counter-behavior decision = monotonic` — FOUND
- `324bfbe test(22-12): RED tests for +-button scope routing` — FOUND
- `1202c8f fix(22-12): + button spawns in originating scope, not always main-0` — FOUND
- `232bf0d chore(22-12): Task 3 no-op — counter remains monotonic per user decision` — FOUND
