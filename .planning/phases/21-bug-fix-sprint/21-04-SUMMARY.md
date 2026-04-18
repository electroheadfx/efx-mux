---
phase: 21-bug-fix-sprint
plan: 04
subsystem: code-review-debt / planning-artifacts
tags:
  - refactor
  - code-review
  - debt
  - useref
  - eslint
  - requirements
  - roadmap

dependency_graph:
  requires:
    - phase: 21-bug-fix-sprint
      provides: FIX-01 file-tree-changed listener + dirty-tracking refs on editor-tab.tsx (Plan 21-01) — IN-02 refactor integrates against this shape without duplication
  provides:
    - WR-01 fix: dropdown-menu.tsx clears typeaheadTimeout when items prop mutates
    - WR-02 fix: structured-context logging on PTY destroy failures in closeActiveTabScoped + closeTabScoped
    - WR-03 verified clean (projectSessionName lives only in src/utils/session-name.ts)
    - IN-02 fix: editor-tab.tsx createEditorState useEffect uses refs — no exhaustive-deps suppression
    - Reconciled REQUIREMENTS.md (FIX-02/03/04 Superseded; FIX-05 + FIX-06 added)
    - Reconciled ROADMAP.md Phase 21 entry (Goal / Requirements / Success Criteria rewrite)
  affects:
    - Future phase planners scanning debt state
    - v0.3.0 release notes (FIX-02/03/04 now explicitly Superseded, not pending)

tech-stack:
  added: []
  patterns:
    - "useRef-for-latest-values: stash props/callbacks in `xxxRef.current = xxx` on every render so useEffects that should run only on identity-stable deps can still reach the latest closure values without suppressing exhaustive-deps"
    - "Structured-context logging: `console.warn('[efxmux] <fn>: <action> failed', { ...context, err })` with the function name baked into the first arg so stack-less log lines remain diagnosable"

key-files:
  created:
    - .planning/phases/21-bug-fix-sprint/21-04-SUMMARY.md
  modified:
    - src/components/dropdown-menu.tsx
    - src/components/terminal-tabs.tsx
    - src/components/editor-tab.tsx
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Approach (a) for IN-02 (useRef refactor) chosen over approach (b) (targeted eslint-disable) — zero suppressions, cleaner deps array"
  - "Added latestContentRef alongside initialContentRef so the useEffect never reads `content` directly — avoids any need for exhaustive-deps suppression"
  - "WR-03 verified pre-resolved (single definition in utils/session-name.ts); no code change required, documented in this summary"
  - "FIX-05 + FIX-06 marked Complete (not Pending) in REQUIREMENTS.md because Plans 21-02 and 21-03 already shipped before this plan executed"

patterns-established:
  - "Pattern: `xxxRef.current = xxx` above useEffects to bridge stale-closure gap while keeping deps arrays honest"
  - "Pattern: structured console.warn payloads for best-effort cleanup failures — keep cleanup continuing, but make logs grep-friendly across tabs / sessions"

requirements-completed: []  # This plan closes WR-01/WR-02/WR-03/IN-02 debt items and does REQUIREMENTS/ROADMAP housekeeping; FIX-02/03/04 marked Superseded. No new FIX requirement completed here.

# Metrics
duration: 4m21s
completed: 2026-04-18
---

# Phase 21 Plan 04: Code-Review Debt Bundle + Scope Reconciliation Summary

**WR-01 / WR-02 / WR-03 / IN-02 code-review debt closed (dropdown typeahead cleanup on items change; structured PTY-destroy warnings with sessionName + scope context; projectSessionName util dedup verified; editor-tab EditorView useEffect refactored to useRef pattern removing the final exhaustive-deps suppression); REQUIREMENTS.md and ROADMAP.md reconciled to reflect the Phase 21 scope decisions (FIX-02/03/04 Superseded; FIX-05 + FIX-06 added with Phase 21 traceability).**

## Performance

- **Duration:** 4m 21s
- **Started:** 2026-04-18T11:22:13Z
- **Completed:** 2026-04-18T11:26:34Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- **WR-01:** `src/components/dropdown-menu.tsx` — second `useEffect` added with `[items]` deps that clears `typeaheadTimeout` when the parent swaps the `items` prop. Original `[isOpen]` cleanup preserved (different lifecycle semantics; combining them would change close-vs-items-change behavior).
- **WR-02:** `src/components/terminal-tabs.tsx` — the two `destroy_pty_session` catch blocks (`closeActiveTabScoped` line 297, `closeTabScoped` line 328) now log a structured payload `{ sessionName, (tabId,) scope, err }` with the function name in the first arg. Cleanup stays best-effort: no throw, `disposeTab(tab)` still runs.
- **WR-03:** Verified clean — `grep -rn "function projectSessionName" src/` returns exactly one match (`src/utils/session-name.ts`). Both `src/main.tsx:40` and `src/components/terminal-tabs.tsx:32` import from there. No code change required.
- **IN-02:** `src/components/editor-tab.tsx` — the `// eslint-disable-next-line react-hooks/exhaustive-deps` suppression on the `createEditorState` useEffect is gone. The refactor introduces `fileNameRef`, `initialContentRef`, `latestContentRef`, `handleSaveRef`, and `handleDirtyChangeRef` (each updated via `xxxRef.current = xxx` on every render) so the useEffect can reach the latest values via `.current` without declaring them as deps. The useEffect's deps are now `[filePath, tabId]` — honest and exhaustive-deps clean. EditorView recreation semantics are preserved (still only on filePath change), so cursor / scroll / selection are not destroyed on unrelated re-renders. Plan 21-01's file-tree-changed listener and dirty-tracking refs (`viewRef`, `setupRef`) were reused rather than redeclared.
- **REQUIREMENTS.md:** FIX-02, FIX-03, FIX-04 entries marked `[~]` Superseded with rationale citing CONTEXT.md D-01; FIX-05 and FIX-06 entries added with Phase 21 traceability; traceability table updated (FIX-05 + FIX-06 = Complete since Plans 21-02 / 21-03 shipped earlier in this phase); coverage updated from 29 → 31 total requirements.
- **ROADMAP.md:** Phase 21 Goal, Requirements, Success Criteria lines rewritten to match actual scope (file-watcher, Open-In, CLAUDE.md tab-open, debt bundle); 21-04-PLAN.md marked `[x]`; progress-table row updated from `3/4 In Progress` → `4/4 Complete (2026-04-18)`; milestone-summary checkbox for Phase 21 flipped to `[x]` with completion note.

## Task Commits

Each task was committed atomically:

1. **Task 1: WR-01 dropdown typeahead on items change** — `4b51e76` (fix)
2. **Task 2: WR-02 structured PTY-destroy warnings + WR-03 verify** — `8a11b89` (fix)
3. **Task 3: IN-02 editor-tab useRef refactor** — `aca242e` (refactor)
4. **Task 4: REQUIREMENTS + ROADMAP scope reconciliation** — `759d99d` (docs)

**Plan metadata:** (this commit) — `docs(21-04): complete code-review debt bundle plan`

## Files Created/Modified

- `src/components/dropdown-menu.tsx` — added second useEffect with `[items]` deps clearing typeahead timer (WR-01)
- `src/components/terminal-tabs.tsx` — enriched two catch-block log payloads with `{ sessionName, (tabId,) scope, err }` structured context (WR-02)
- `src/components/editor-tab.tsx` — refactored `createEditorState` useEffect with ref-based callback / fileName / content access; removed `eslint-disable-next-line react-hooks/exhaustive-deps` (IN-02)
- `.planning/REQUIREMENTS.md` — FIX-02/03/04 Superseded; FIX-05 + FIX-06 added; traceability table + coverage updated
- `.planning/ROADMAP.md` — Phase 21 block rewritten; progress row + milestone-summary checkbox updated
- `.planning/phases/21-bug-fix-sprint/21-04-SUMMARY.md` (this file, created)

## Decisions Made

- **Approach (a) for IN-02 (useRef refactor).** The plan offered two options: (a) move callbacks into refs so deps can stay honest, or (b) keep the suppression with inline justification. (a) was chosen because it eliminates the suppression entirely — cleaner deps array, no future lint debt. Correctness is preserved: EditorView still recreates only on filePath change (filePath is effectively stable per EditorTab instance since `main-panel.tsx` and `right-panel.tsx` key each `<EditorTab>` by `tab.id`, so filePath doesn't mutate in practice).
- **Added `latestContentRef` alongside `initialContentRef`.** The useEffect needs to seed CodeMirror with the latest `content` prop at EditorView-creation time, but it must NOT recreate the view on every content change (that would destroy user state). Reading `content` directly inside the useEffect would require it in the deps array (and re-creating on every content edit). Reading `initialContentRef.current` on each useEffect invocation would stall at the mount-time value. Solution: `latestContentRef.current = content` updates on every render (cheap), and the useEffect reads `latestContentRef.current` → copies it to `initialContentRef.current` → passes it to `createEditorState`. This is exhaustive-deps clean because the useEffect only reads from refs whose identities are stable across renders.
- **FIX-05 + FIX-06 marked Complete in REQUIREMENTS.md** (not Pending as the plan suggested). Plans 21-02 and 21-03 shipped before this plan executed (see their SUMMARY files), so the requirements are genuinely complete. Marking them Pending would have contradicted observable history.

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed exactly as written modulo the documented decisions above (option (a) for IN-02, and Complete-not-Pending traceability status for FIX-05/06 which is a disk-accurate update rather than a deviation).

### Minor Additions (not deviations — extensions of plan intent)

1. **Added milestone-summary checkbox flip for Phase 21 in ROADMAP.md.** Plan spec mentioned the progress-row update and footer but not the `- [ ] **Phase 21** …` line near the top of the milestone block. Flipping it from `[ ]` to `[x]` was necessary for internal consistency (all other shipped phases have `[x]`). Counts as a housekeeping extension under Rule 3.

---

**Total deviations:** 0 (plan executed as-specified)
**Impact on plan:** N/A

## Issues Encountered

None. Two minor points worth recording:

- **The Grep tool's pattern matched descriptive comments containing the literal string `eslint-disable`.** The acceptance criterion `grep -n "eslint-disable" src/components/editor-tab.tsx` must return 0 matches. Initial draft of the ref-refactor kept descriptive comments using the phrase "eslint-disable" verbatim, which would have failed the grep. Rephrased comments to use "exhaustive-deps suppression" / "react-hooks/exhaustive-deps rule" instead — same meaning, no literal match.

- **`latestContentRef` introduction.** Keeping `initialContentRef = useRef(content)` alone would capture only the mount-time content. Since EditorTab is keyed by `tab.id` at the parent, filePath doesn't actually change per-instance in practice — but the refactor should still be correct for any hypothetical filePath-on-same-instance change. `latestContentRef` + `initialContentRef.current = latestContentRef.current` inside the useEffect handles that edge case without opening a lint suppression.

## User Setup Required

None — internal correctness refactors and doc updates only.

## Next Phase Readiness

- Phase 21 is now complete (4/4 plans). ROADMAP.md reflects this.
- v0.3.0 milestone scope is now accurate: 31 requirements, FIX-02/03/04 Superseded, all remaining requirements mapped to shipped phases.
- Phase 21 code-review debt list is closed: WR-01, WR-02, WR-03, IN-02 all resolved (IN-01 was closed in a prior phase per CONTEXT.md D-02).
- No blockers. Phase 21 can ship / be tagged as part of v0.3.0.

## Verification

- `pnpm exec tsc --noEmit` → clean (0 errors) after each of Tasks 1, 2, 3
- `grep -nE "}, \[items\]\)" src/components/dropdown-menu.tsx` → 1 match (WR-01 new useEffect)
- `grep -nE "}, \[isOpen\]\)" src/components/dropdown-menu.tsx` → 3 matches (original cleanup preserved + focus + click-outside effects)
- `grep -n "closeActiveTabScoped: destroy_pty_session failed" src/components/terminal-tabs.tsx` → 1 match (line 297)
- `grep -n "closeTabScoped: destroy_pty_session failed" src/components/terminal-tabs.tsx` → 1 match (line 328)
- `grep -rn "function projectSessionName" src/` → exactly 1 match in `src/utils/session-name.ts` (WR-03 verified)
- `grep -n "eslint-disable" src/components/editor-tab.tsx` → 0 matches (IN-02 suppression removed)
- `grep -n "handleSaveRef" src/components/editor-tab.tsx` → 4 matches (declaration + assignment + onSave wrapper + registerSaveCallback wrapper)
- `grep -n "initialContentRef" src/components/editor-tab.tsx` → 3 matches
- `grep -n "latestContentRef" src/components/editor-tab.tsx` → 3 matches
- `grep -n "fileNameRef" src/components/editor-tab.tsx` → 4 matches
- `grep -n "handleDirtyChangeRef" src/components/editor-tab.tsx` → 3 matches
- `grep -n "v0.3.0 requirements: 31" .planning/REQUIREMENTS.md` → 1 match (coverage updated)
- `grep -n "FIX-05" .planning/REQUIREMENTS.md` → 2 matches (definition + traceability row)
- `grep -n "FIX-06" .planning/REQUIREMENTS.md` → 2 matches
- `grep -n "Superseded" .planning/REQUIREMENTS.md` → 6 matches (FIX-02/03/04 in definition block + traceability)
- `grep -n "21-04-PLAN.md" .planning/ROADMAP.md` → 1 match
- `grep -n "0/4" .planning/ROADMAP.md` → 0 matches (was the old Phase 21 state; now `4/4`)
- `grep -n "4/4 | Complete" .planning/ROADMAP.md | grep "21\."` → 1 match (Phase 21 row)

## Cross-links

- Plan: `.planning/phases/21-bug-fix-sprint/21-04-PLAN.md`
- Phase context: `.planning/phases/21-bug-fix-sprint/21-CONTEXT.md` (§decisions D-02, D-03, D-13..D-16)
- Sibling plans (all shipped earlier in Phase 21):
  - `.planning/phases/21-bug-fix-sprint/21-01-SUMMARY.md` (FIX-01)
  - `.planning/phases/21-bug-fix-sprint/21-02-SUMMARY.md` (FIX-05)
  - `.planning/phases/21-bug-fix-sprint/21-03-SUMMARY.md` (FIX-06)
- Debt origin: `.planning/phases/20-right-panel-multi-terminal/deferred-items.md` §"Phase 17 Code-Review Debt"

## Self-Check: PASSED

- `src/components/dropdown-menu.tsx` exists and contains the WR-01 useEffect — FOUND
- `src/components/terminal-tabs.tsx` exists and contains WR-02 structured-context warnings — FOUND
- `src/components/editor-tab.tsx` exists, has no `eslint-disable`, uses five IN-02 refs — FOUND
- `.planning/REQUIREMENTS.md` exists with FIX-02/03/04 Superseded + FIX-05/06 added — FOUND
- `.planning/ROADMAP.md` exists with reconciled Phase 21 block + 4/4 Complete row — FOUND
- `.planning/phases/21-bug-fix-sprint/21-04-SUMMARY.md` exists (this file) — FOUND
- Commit `4b51e76` (Task 1 WR-01) — FOUND in `git log`
- Commit `8a11b89` (Task 2 WR-02 + WR-03 verify) — FOUND in `git log`
- Commit `aca242e` (Task 3 IN-02 refactor) — FOUND in `git log`
- Commit `759d99d` (Task 4 REQUIREMENTS + ROADMAP reconciliation) — FOUND in `git log`
- `pnpm exec tsc --noEmit` — clean at each task commit — VERIFIED

---
*Phase: 21-bug-fix-sprint*
*Completed: 2026-04-18*
