# Phase 21: Bug Fix Sprint - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve 3 bugs and 4 code-review debt items before v0.3.0 ship. Scope is bounded:
FIX-01 (file watcher refresh), FIX-05 (Open-in-external-editor regression), FIX-06
(CLAUDE.md file-tab open failure), and debt bundle (WR-01, WR-02, WR-03, IN-02).

Originally-scoped FIX-02, FIX-03, FIX-04 are **dropped** — FIX-02 no longer reproducible,
FIX-03 obsolete (scrollbar acceptable as-is), FIX-04 obsolete (sidebar bottom TUI removed
during Phase 20). REQUIREMENTS.md and ROADMAP.md will be updated accordingly at plan time.

No new capabilities. Tab model changes and layout splits are explicitly out of scope.
</domain>

<decisions>
## Implementation Decisions

### Scope (bugs to fix)
- **D-01:** Fix FIX-01, FIX-05, FIX-06 only. Drop FIX-02/03/04 (no longer reproducible or obsolete).
- **D-02:** Fold code-review debt into this phase: WR-01, WR-02, WR-03, IN-02. IN-01 already resolved.
- **D-03:** Update REQUIREMENTS.md during plan phase: mark FIX-02/03/04 as "Superseded",
  add FIX-05 and FIX-06 entries with Phase 21 traceability.

### FIX-01 — File tree refresh on external changes
- **D-04:** Reuse existing `src-tauri/src/file_watcher.rs` (already uses `notify_debouncer_mini`).
  No new watcher infra.
- **D-05:** On FS event, emit Tauri event → `file-tree.tsx` listens and does **incremental** node
  refresh (only affected paths). Full-tree refresh is rejected.
- **D-06:** If changed file is open in an editor tab, **re-read its content** into that tab
  without closing/reopening. Preserve tab focus and the default-tab selection — no app re-init,
  no focus jump to the affected tab.
- **D-07:** Editor-tab content reload must not clobber unsaved edits. If tab is dirty, show a
  non-intrusive "changed on disk" indicator and defer reload until user acts. (Implementation
  detail left to planner — could be a badge, a toast, or a subtle icon on the tab.)

### FIX-05 — Open-in-external-editor regression
- **D-08:** Research-first: read `.planning/debug/resolved/open-project-external-editor.md`
  (from commit 02abef6) to understand recent fix scope. The header-button-only fix from
  commit 28ccf0c hid the button when no active project but did not address the new
  regression the user is reporting (broken for both header button AND file-context menu
  even when a project is active).
- **D-09:** Trace both invocation paths: header button (`open-project-external-editor`
  command) and file-context-menu ("Open in ..." action). Confirm which are broken and
  at what layer (Tauri command, spawn, entitlement, event wiring).

### FIX-06 — CLAUDE.md fails to open in file tab
- **D-10:** Fresh investigation — root cause is NOT `@`-import parsing. The project
  `./CLAUDE.md` contains no `@` imports. Symptom (per user screenshot): clicking CLAUDE.md
  in file-tree creates no tab, no content loads, default server tab remains full-height.
- **D-11:** Reproduction path: instrument `file-tree.tsx` tab-open click handler →
  `editor-tab.tsx` creation → file content load (Tauri command). Log at every step.
  Confirm whether the failure is silent (swallowed error) or never reaches tab creation.
- **D-12:** Check if CLAUDE.md-specific: is the filename, extension, or path shape being
  matched against a non-editor handler (e.g., treated as GSD artifact, markdown-viewer
  route, or protected-path rule)?

### Code-review debt (fold-in)
- **D-13:** **WR-01** (`dropdown-menu.tsx:87-94`) — Clear `typeaheadTimeout` when items prop
  changes (useEffect cleanup).
- **D-14:** **WR-02** (`terminal-tabs.tsx:291,317` post-Phase-20 line numbers) — Replace
  silent `.catch()` swallowing in PTY cleanup with structured logging (console.warn with
  context tag). Do not throw — cleanup must stay best-effort.
- **D-15:** **WR-03** (`main.tsx` + `terminal-tabs.tsx`) — Extract duplicated
  `projectSessionName` into a shared util (e.g., `src/utils/session-naming.ts`).
  Update both call sites.
- **D-16:** **IN-02** (`editor-tab.tsx:75-76`) — Remove `eslint-disable` on the useEffect
  dependency array by refactoring to use proper deps or `useRef` for the stale-closure.
  Must not introduce new bugs — verify with manual UAT.

### Plan structure
- **D-17:** Four plans, one per concern, atomic commits:
  - `21-01-PLAN.md` — FIX-01 (file watcher + incremental refresh + editor tab reload)
  - `21-02-PLAN.md` — FIX-05 (Open-in-external-editor)
  - `21-03-PLAN.md` — FIX-06 (CLAUDE.md file-tab open)
  - `21-04-PLAN.md` — code-review debt bundle (WR-01, WR-02, WR-03, IN-02)
- **D-18:** Manual UAT per plan (matches Phase 20 pattern). No regression tests added in
  this phase — test infra has known pre-existing failures (sidebar, git-control-tab,
  file-tree worker) documented in `20-right-panel-multi-terminal/deferred-items.md`.
  Regression-test infrastructure cleanup is its own future phase.

### Claude's Discretion
- Exact UI treatment for "changed on disk" indicator in FIX-01 (D-07)
- Logging format and verbosity for FIX-05 / FIX-06 investigation
- Utility file location/shape for WR-03 extraction
- Order of plan execution (all 4 can ship in any order; no dependencies)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug + debt tracking
- `.planning/REQUIREMENTS.md` §"Bug Fixes (FIX)" lines 53-58 — original FIX definitions (to be updated)
- `.planning/ROADMAP.md` §"Phase 21: Bug Fix Sprint" lines 166-175 — current goal + success criteria (to be updated)
- `.planning/phases/20-right-panel-multi-terminal/deferred-items.md` §"Phase 17 Code-Review Debt" lines 63-74 — WR-01..WR-03, IN-01, IN-02 origins
- `.planning/STATE.md` §"Code review fixes pending" — same list, for traceability

### FIX-05 prior debug
- `.planning/debug/resolved/open-project-external-editor.md` — Open-In silent-failure root cause + resolution from commit 02abef6 (header-button-only fix, not the new regression)

### Component targets
- `src-tauri/src/file_watcher.rs` — existing Rust file watcher (reuse for FIX-01)
- `src-tauri/src/theme/watcher.rs` — reference implementation pattern for notify_debouncer_mini
- `src/components/file-tree.tsx` — tab-open click handler (FIX-06), tree refresh entry (FIX-01)
- `src/components/editor-tab.tsx` — file content load + useEffect deps (FIX-06, IN-02)
- `src/components/dropdown-menu.tsx` lines 87-94 — WR-01 target
- `src/components/terminal-tabs.tsx` lines 291, 317 — WR-02 target
- `src/main.tsx` + `src/components/terminal-tabs.tsx` — WR-03 `projectSessionName` dedup targets

### Tauri + xterm.js reference
- `/Users/lmarques/Dev/efx-mux/CLAUDE.md` — Tauri 2 API notes, portable-pty patterns, marked.js checkbox override

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`file_watcher.rs`** (Rust, `notify_debouncer_mini`) — Already emits debounced events.
  Has `set_project_path` command (wired in `lib.rs:189`). Check what event it emits
  today and whether the frontend listens; FIX-01 may be pure wiring or needs event-shape
  refinement.
- **`theme/watcher.rs`** — Second notify-based watcher; use as reference for event pattern
  consistency.
- **Existing debug resolution pattern** — `.planning/debug/resolved/` holds root-cause
  write-ups (see `open-project-external-editor.md`). FIX-05/06 investigations should
  write resolutions here if they use `/gsd-debug`.

### Established Patterns
- **Silent error swallowing via `.catch()` on module-level Tauri listeners** — introduced
  in Phase 20 Plan 01 to quiet jsdom unmocked rejections (see 20-deferred-items.md).
  WR-02 wants this replaced with structured logging, not rethrown. Preserve the
  listener-is-best-effort property.
- **Atomic commit per plan** — Phase 20 established the 1-plan-1-commit pattern; plans
  also commit their own SUMMARY.md.
- **File-tree uses Preact signals** (`file-tree.tsx`, `state-manager.ts`). FIX-01
  incremental refresh should update signals directly, not force full re-mount.

### Integration Points
- **file_watcher.rs → Tauri event → file-tree.tsx listener** — FIX-01 lives here.
- **editor-tab.tsx file-load command → file-tree.tsx click handler** — FIX-06 lives here.
- **open-project-external-editor Tauri command → header button + file-context menu** —
  FIX-05 lives here.

</code_context>

<specifics>
## Specific Ideas

- FIX-01 user note: "it re-render the app (init), lost focus on default tab, the changed
  file content is not updated" — three distinct failure modes in the current behavior that
  must all be eliminated. The plan should explicitly verify each in UAT.
- FIX-06 user screenshot evidence: file-tree has CLAUDE.md highlighted, tabs bar shows
  `package-lock.json`, `Agent c`, `Terminal 3` — no new tab created. Content area shows
  default server tab at full height. This is a hard failure, not a visual glitch.
- FIX-05 user note: "it worked previously" — regression, so `git log` on the relevant
  command + component may reveal the breaking commit.

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion but are new capabilities, not bug fixes. Do not include
in Phase 21. Candidates for future phases (or backlog via `/gsd-add-backlog`).

### Tab model refactor — GSD + Git Changes as first-class tabs
- Make GSD panel and Git Changes tabs behave like file/terminal tabs: closed on first
  open, reorderable via drag, addable from `+` button, deletable.
- Titles for Git Changes and GSD tabs cannot be user-renamed (kind is fixed).
- Persist per-window state on quit: active tab, tab order, tab titles; restore on launch.
- **Why not in Phase 21:** This is a tab-model architectural refactor (data shape,
  persistence, DnD wiring). Each bullet is its own plan's worth of work.
- **Suggested future phase:** "Tab Model Unification" (v0.3.x or v0.4.0).

### Vertical split for main + right panel
- Add split icon to main panel and right panel; each split has its own tab bar + `+`
  button + independent tab set.
- Tabs moveable across splits and across windows.
- **Why not in Phase 21:** Layout engine rewrite — touches panel layout, drag-between-
  containers, probably multi-window IPC.
- **Suggested future phase:** "Split Layouts" (v0.4.0+).

</deferred>

---

*Phase: 21-bug-fix-sprint*
*Context gathered: 2026-04-18*
