# Phase 21: Bug Fix Sprint - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 21-bug-fix-sprint
**Areas discussed:** Scope (code-review debt), FIX-01 approach, FIX-05/06 new bugs, Plan structure

---

## Scope — Code-Review Debt

| Option | Description | Selected |
|--------|-------------|----------|
| Fold all in (Recommended) | WR-01, WR-02, WR-03, IN-02 bundled into Phase 21 | ✓ |
| Fold WR-01, WR-02 only | Real bugs only; defer WR-03 + IN-02 | |
| FIX only, defer all debt | Strict FIX scope; run separate code-review-fix pass | |

**User's choice:** Fold all in.
**Notes:** User's instruction was "does all your code reviews" — interpreted as include all four (WR-01, WR-02, WR-03, IN-02).

---

## FIX Scope Redefinition

| Original | Status | Replacement |
|----------|--------|-------------|
| FIX-01 (file watcher) | **Refined** | Keep + 3 nuances: no app re-init, no default-tab focus loss, content must actually update |
| FIX-02 (phantom chars) | **Dropped** | Not reproducible anymore |
| FIX-03 (thin scrollbar) | **Dropped** | Acceptable as-is |
| FIX-04 (sidebar bottom TUI) | **Dropped** | Bottom TUI removed during Phase 20 |
| FIX-05 **NEW** | Added | Open-in-external-editor broken (header + file-context) |
| FIX-06 **NEW** | Added | CLAUDE.md fails to open in file tab |

**Notes:** User drove this refinement live during discuss phase. REQUIREMENTS.md and ROADMAP.md will be updated during plan phase.

---

## FIX-01 Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Incremental tree refresh + re-read open tabs (Recommended) | Only changed nodes refresh; open tabs re-read content; no re-init, no focus change | ✓ |
| Incremental tree refresh only | Update tree but don't touch editor tabs | |
| Incremental + dirty indicator on open tabs | Tree refreshes; open tabs show "changed externally" badge | |

**User's choice:** Incremental + re-read.
**Notes:** Captured D-07 anyway — re-read must not clobber dirty tabs. Planner will reconcile.

---

## FIX-05 Research Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Research-first (Recommended) | Read prior debug doc + trace both invocation paths | ✓ |
| Treat as fresh bug | Skip prior debug, reproduce from scratch | |

**User's choice:** Research-first.
**Notes:** Prior debug at `.planning/debug/resolved/open-project-external-editor.md` (commit 02abef6) resolved the header-button-no-project case, not this new regression.

---

## FIX-06 Root Cause Hypothesis

| Option | Description | Selected |
|--------|-------------|----------|
| @-import parsing in file read path (Recommended) | CLAUDE.md `@` imports failing silently | |
| File-size / encoding issue | JSON parse attempt on non-JSON | |
| Investigate broadly — no hypothesis | Reproduce + trace tab-open flow | ✓ (after clarification) |

**User's choice:** Investigate broadly — user clarified that the project `./CLAUDE.md` contains no `@RTK.md` or any `@` imports, so the first hypothesis is invalid. Fresh investigation needed.
**Notes:** Planner should log at every step of file-tree click → editor-tab creation → content load.

---

## Plan Structure + Test Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| One plan per bug + debt bundle, manual UAT (Recommended) | 4 plans (FIX-01, FIX-05, FIX-06, debt), manual UAT each | ✓ |
| One plan per bug + regression tests | Same 4 plans + regression tests | |
| Bundle all bugs into one plan | Single plan | |

**User's choice:** 4 plans + manual UAT.
**Notes:** Matches Phase 20 pattern. Test infra has known pre-existing failures; regression-test cleanup deferred.

---

## Deferred Ideas (User Proposed, Out of Scope)

1. **Tab model refactor** — Make GSD and Git Changes tabs behave like other tabs: closed on first open, reorderable, addable via `+`, deletable, persisted on quit (active tab, order, titles per window). Titles fixed (not user-renamable) for GSD/Git Changes.
2. **Vertical split + inter-split tab movement** — Split icon on main + right panel; each split has its own tab bar. Tabs moveable across splits and across windows.

**Rationale for deferral:** Both are new capabilities (architectural refactors), not bug fixes. Phase 21 = Bug Fix Sprint. Recorded as candidates for future phases / backlog.

---

## Claude's Discretion (Left to Planner)

- UI treatment for "changed on disk" indicator in FIX-01 D-07
- Logging verbosity for FIX-05 / FIX-06 debug instrumentation
- Utility file location/shape for WR-03 `projectSessionName` extraction
- Order of plan execution across 21-01..21-04 (no dependencies between them)
