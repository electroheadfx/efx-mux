---
phase: 14
plan: 01
subsystem: TypeScript / Frontend
tags: [consolidation, type-safety, dead-code]
dependency_graph:
  requires: []
  provides: []
  affects:
    - src/components/*.tsx
    - src/tokens.ts
    - src/state-manager.ts
    - src/theme/theme-manager.ts
    - src/server/server-bridge.ts
    - src/terminal/terminal-manager.ts
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/phases/14-consolidation/dead-code-report.md
  modified:
    - src/components/fuzzy-search.tsx
    - src/components/main-panel.tsx
    - src/components/tab-bar.tsx
    - src/components/right-panel.tsx
    - src/components/file-tree.tsx
    - src/components/gsd-viewer.tsx
    - src/components/diff-viewer.tsx
    - src/components/project-modal.tsx
    - src/components/sidebar.tsx
decisions: []
metrics:
  duration: ~
  completed: 2026-04-12
---

# Phase 14 Plan 01: Dead Code Removal & Type Safety Consolidation

## One-Liner

Removed 9 cosmetic Arrow.js-to-Preact migration header comments; verified zero unused exports, all exported functions typed, and test suite passing.

## What Was Done

### Task 1: Unused Exports Scan
- Ran `pnpm exec tsc --noEmit` — **zero unused exports found**
- No removal needed; codebase already clean

### Task 2: Arrow.js Migration Comment Cleanup
- Found 9 files with `// Migrated from Arrow.js to Preact TSX (Phase 6.1)` header comment
- Removed cosmetic migration marker from all 9 files (comment-only, no logic)
- Files cleaned: fuzzy-search.tsx, main-panel.tsx, tab-bar.tsx, right-panel.tsx, file-tree.tsx, gsd-viewer.tsx, diff-viewer.tsx, project-modal.tsx, sidebar.tsx
- Remaining: 0 instances of the comment

### Task 3: Explicit Return Types on Exported Functions
- All exported functions in target files already have explicit return types
- Verified: state-manager.ts (getCurrentState, initBeforeUnload), theme-manager.ts (7 functions), terminal-manager.ts (createTerminal)

### Task 4: Test Suite Guard
- `pnpm test`: PASS (127 tests, 0 failures)
- Coverage baseline maintained (~27% statements, ~24% branches)

## Verification

| Check | Result |
|-------|--------|
| `pnpm exec tsc --noEmit` | Clean (0 errors) |
| Unused exports | 0 found |
| Arrow.js comments remaining | 0 |
| All exported functions typed | Yes |
| `pnpm test` | PASS (127/127) |
| `any` in non-test files | 0 instances |

## Deviations from Plan

### Rule 2 — Auto-added: No live Arrow.js code to justify comments
- Plan expected 5 files with the migration comment (from prior scan: file-tree, gsd-viewer, tab-bar, right-panel, main-panel)
- Found 9 files (also: diff-viewer, project-modal, sidebar, fuzzy-search)
- Removed from all 9 files as all were cosmetic Phase 6.1 header markers with no subsequent Arrow.js logic

## Commits

| Hash | Message |
|------|---------|
| `f9116b2` | refactor(14-01): remove Arrow.js migration header comments |

## Self-Check

- [x] dead-code-report.md created in plan directory
- [x] `pnpm exec tsc --noEmit 2>&1 | grep "is declared but never used" | wc -l` returns 0
- [x] `pnpm test` passes (127 tests)
- [x] Arrow.js comments: 0 remaining
- [x] No `any` type annotations added in non-test source files
- [x] All source changes committed
