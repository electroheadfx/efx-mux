---
gsd_state_version: 1.0
milestone: v0.3.0
milestone_name: Workspace Evolution
status: executing
stopped_at: Completed 22-12-PLAN.md
last_updated: "2026-04-19T06:21:29.675Z"
last_activity: 2026-04-19
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 49
  completed_plans: 49
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** A single native macOS window that co-locates AI agent terminals alongside live GSD progress, git diff, and file tree -- all persisted across restarts via tmux.
**Current focus:** Phase 22 — dynamic-tabs-vertical-split-and-preferences-modal

## Current Position

Phase: 22 (dynamic-tabs-vertical-split-and-preferences-modal) — EXECUTING
Plan: 4 of 14
Status: Ready to execute
Last activity: 2026-04-19

**Code review fixes pending (non-blocking):**

- WR-01: `dropdown-menu.tsx:87-94` — typeaheadTimeout not cleared when items change
- WR-02: `terminal-tabs.tsx:212,246` — Silent error swallowing in PTY cleanup
- WR-03: `main.tsx` + `terminal-tabs.tsx` — Duplicate `projectSessionName` function
- IN-01: `package.json:3` — package name "gsd-mux" should be "efxmux"
- IN-02: `editor-tab.tsx:75-76` — eslint-disable masks potential stale-closure bug in useEffect dependency array

Progress: [██████████] 100% (Phase 17)

## Performance Metrics

**v0.2.0 velocity:**

- 4 phases, 8 plans completed in 1 day
- 119 tests (89 TS + 30 component + 19 Rust)

**v0.1.0 velocity:**

- 11 phases (incl. 6.1), 63 plans in 6 days
- Average: ~10 plans/day

## Accumulated Context

### Decisions

- v0.2.0: Test infrastructure first (Phase 11 prerequisite for 12 and 13)
- v0.2.0: Sync inner functions for Rust testability of async Tauri commands
- v0.1.0: Arrow.js -> Preact migration (Phase 6.1)
- v0.1.0: tmux session backend for persistence
- [Phase 19]: Phase 19 Plan 01: Added gsd_sub_tab to Rust PanelsState (not LayoutState.extra) for semantic correctness; parser stubs return typed empties with parseError='Not yet implemented' to give Plan 02 a deterministic RED state
- [Phase 19]: Phase 19 Plan 02: Added @types/mdast@4.0.4 devDependency -- pnpm strict layout doesn't hoist transitive types, so mdast Root/Heading/List imports need the types package as a direct dep. Chose this over inline type definitions for canonical AST contract.
- [Phase 19]: Phase 19 Plan 03: Co-located EmptyState helper with StatusBadge in status-badge.tsx (one shared-primitives file, imported by all 5 sub-tabs). Kept PhasesTab accordion state module-level per git-changes-tab.tsx precedent -- ephemeral across sub-tab switches by design.
- [Phase 21-bug-fix-sprint]: FIX-06 root cause: openEditorTab wrote only activeUnifiedTabId; RightPanel reads getTerminalScope('right').activeTabId separately. Introduced _activateEditorTab helper to route activation by ownerScope.
- [Phase 21]: Plan 21-04 IN-02: approach (a) useRef refactor over approach (b) targeted disable — eliminates react-hooks/exhaustive-deps suppression in editor-tab.tsx entirely
- [Phase 22]: Phase 22 Plan 03: StickyTabData removed — file-tree/gsd render as dynamic tabs with data-tab-id; gsdTab singleton signal + fileTreeTabs per-scope array; handleCrossScopeDrop routes all 5 tab kinds; split icon button with 3-pane cap stub
- [Phase 22]: Zone type ('main' | 'right') separate from TerminalScope for split-group management
- [Phase 22]: Shared sub-scope state in sub-scope-pane.tsx to avoid circular imports between main-panel and right-panel
- [Phase 22]: SubScopePane: always-mount bodies with display:none toggle preserves xterm WebGL + CodeMirror state
- [Phase 22]: unified-tab-bar uses local type-adapter wrappers (main-0→main mapping) rather than changing its existing zone type contract
- [Phase 22]: Plan 22-10: Fill-gap-at-end convention for closeSubScope — scope ids monotonic + tabs always migrate to scope-0, so current.slice(0,-1) is correct regardless of which index was clicked (no renumbering needed)
- [Phase 22]: Plan 22-10: _activateEditorTab writes scope.activeTabId for BOTH main and right scopes — SubScopePane reads scope-local activeTabId, so main-scope path previously left new tabs active-but-invisible (UAT test 18a fix)
- [Phase 22]: Plan 22-11: Belt-and-braces intra-zone drag — CSS var (persistence) + direct pane.style mutation (immediate visual). Drop extra flex-1 wrapper div in main/right-panel so SubScopePane is the flex item and its inline height is respected.
- [Phase 22]: Plan 22-11: [data-tablist-scope] is the canonical tab-bar wrapper selector; no literal .tab-bar class exists in the codebase. CSS adds border-top via [data-tablist-scope] (matches existing .drop-target pattern).
- [Phase 22-12]: counter behavior = monotonic; preserves PTY-safety and D-12 stable-name invariant (deleting Terminal-N does not reuse slot N; next slot is max+1). Rationale: orphan tmux sessions may survive slot deletion → reuse would re-attach stale content; matches D-12 "PTY session name is stable on scope move"; simpler (one integer counter) vs. gap-fill (scan all 6 scopes per allocation).

### Roadmap Evolution

- Phase 22 added: Dynamic tabs, vertical split, and preferences modal (2026-04-18)

### Pending Todos

None.

### Blockers/Concerns

- Phase 17 code review fixes: WR-01, WR-02, WR-03, IN-01, IN-02 pending (non-blocking, advisory)
- Git push credential handling: Must decide PTY shell-out vs git2-credentials crate (Phase 16)
- Tauri drag-drop bug #14624: Verify fix in 2.10.3 before Phase 18
- Next: Phase 15 planning/execution

## Quick Tasks Completed

| ID | Description | Date |
|----|-------------|------|
| 260413-q8l | Add version to EFXMUX sidebar title | 2026-04-13 |
| 260414-kil | Enhance TUI tab and preview bar UX (bigger hit targets) | 2026-04-14 |
| 260415-fv4 | Redesign git-control-tab to Zed editor layout | 2026-04-15 |
| 260415-gkz | Redesign git-control-tab to Zed panel layout: gray checkboxes, diff stats, click-to-diff | 2026-04-15 |
| 260415-h39 | Add git history accordion section with commit log above branch bar | 2026-04-15 |
| 260415-he6 | Add per-file revert button and replace ellipsis with Revert All in Git tab | 2026-04-15 |
| 260415-i4n | Move sidebar header title to OS title bar | 2026-04-15 |
| 260416-dgx | Fix EDIT-04: wire Cmd+W for editor tabs | 2026-04-16 |
| 260416-fiw | Add agent name to agent tabs - show 'Agent {name}' format | 2026-04-16 |
| 260416-fr0 | Remove text selectability from git sidebar interactive elements | 2026-04-16 |
| 260416-g36 | Remove commit names from git history sidebar, show in tooltip instead | 2026-04-16 |
| 260416-gah | Click commit history row to copy commit hash with toast notification | 2026-04-16 |
| 260416-gma | Add quit confirmation modal on Cmd+Q | 2026-04-16 |
| 260416-h3i | Add agent quit modal when closing agent tabs | 2026-04-16 |
| 260416-hce | Add "Add Project" to OS menu with Cmd+N shortcut | 2026-04-16 |
| 260416-hk9 | Add Preferences menu entry after About Efxmux with Ctrl+, shortcut | 2026-04-16 |
| 260416-hsi | Make file minimap viewer in file tab a bit more smaller | 2026-04-16 |
| 260416-idw | Restyle main window tabs to bottom blue underline like sidebar | 2026-04-16 |
| 260416-imb | Fix tab bar selection not updating on tab close | 2026-04-16 |
| 260416-j71 | File tab pinning: single replaceable pane by default, pinned tabs stay independent, double-click to pin | 2026-04-16 |
| 260416-jjb | Add clickable pin icon on all editor tabs with toggle behavior | 2026-04-16 |
| 260416-jvl | Minimap UX: disable text selection, add hide/show toggle icon to tab bar | 2026-04-16 |
| 260416-k7j | Sticky right tab actions, minimap overlay colors, full selection disable | 2026-04-16 |
| 260416-l12 | Lock minimap drag to vertical only — prevent horizontal drag | 2026-04-16 |
| 260416-lgy | Fix right sidebar terminal tab not selected by default + add separator | 2026-04-16 |
| 260416-m38 | Persist pinned files in Files tab across app restarts per project | 2026-04-16 |
| 260416-n7h | Add tab rename functionality | 2026-04-16 |
| 260416-nmw | Click editor tab label reveals file in file tree with smart sidebar routing | 2026-04-16 |
| 260416-o1k | Fix revealFileInTree timing when tree not loaded + terminal tab rename focus theft | 2026-04-16 |
| 260416-uig | Fix 3 file-tree polish bugs: dropdown hover state, disable text selection on right-click, decouple hover from click-selected | 2026-04-16 |
| 260417-f6e | FileTree tab respects active tab context on app startup (no auto-select when terminal/git active, reveals editor file when editor active) | 2026-04-17 |
| 260417-hgw | Auto-open new file in tab + expand parent folder on create | 2026-04-17 |
| 260417-i0z | Save only active tab's file on Cmd+S (not all open editor tabs) | 2026-04-17 |
| 260417-iat | Add keyboard shortcut to delete folder in file tree | 2026-04-17 |
| 260417-je3 | Add HMR-wipe guard to save_state Tauri command (refuse overwriting non-empty projects with empty list) | 2026-04-17 |
| 260418-b1a | Fix `[exited]` dead terminal: right-panel overlay mount + restore-loop TOCTOU race + monitor thread delay | 2026-04-18 |
| 260418-bpm | Fix main-window new-tab focus: creating new agent/terminal from non-agent tab now focuses the new tab | 2026-04-18 |
| Phase 19 P01 | 8min | 3 tasks | 10 files |
| Phase 19 P02 | 3min 43s | 2 tasks | 3 files |
| Phase 19 P03 | 8min 40s | 3 tasks | 6 files |
| Phase 21-bug-fix-sprint P03 | 7min | 2 tasks | 3 files |
| Phase 21 P04 | 4m21s | 4 tasks | 5 files |
| Phase 22 P02 | 112 | 2 tasks | 3 files |
| Phase 22 P01 | 538 | 3 tasks | 3 files |
| Phase 22 P03 | 35 | 3 tasks | 3 files |
| Phase 22 P10 | ~12min | 2 tasks | 5 files |
| Phase 22 P11 | ~4m30s | 2 tasks | 6 files |
| Phase 22 P12 | ~10min | 3 tasks | 4 files |

## Session Continuity

Last session: 2026-04-19T06:21:29.672Z
Stopped at: Completed 22-12-PLAN.md
Resume file: None

Next: `/gsd-execute-phase 15` or `/gsd-code-review-fix 17` to fix remaining warnings
