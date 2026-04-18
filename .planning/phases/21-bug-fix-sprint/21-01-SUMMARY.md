---
phase: 21-bug-fix-sprint
plan: 01
subsystem: file-tree / external-editor integration
tags:
  - fix
  - bug
  - file-watcher
  - notify
  - tauri-event
  - editor-tab
dependency_graph:
  requires:
    - existing src-tauri/src/file_watcher.rs (md + git watchers using notify_debouncer_mini)
    - existing refreshTreePreservingState() helper in file-tree.tsx
    - existing EditorTabData / setEditorDirty machinery in unified-tab-bar.tsx
  provides:
    - project-wide `file-tree-changed` Tauri event with changed path payload
    - incremental file-tree refresh on external edits (state preserved)
    - dirty-aware editor-tab reload with `changedOnDisk` indicator
  affects:
    - src-tauri/src/file_watcher.rs (third watcher: start_file_tree_watcher)
    - src/components/file-tree.tsx (listener → refreshTreePreservingState)
    - src/components/editor-tab.tsx (path-filtered dirty-guarded reload)
    - src/components/unified-tab-bar.tsx (EditorTabData.changedOnDisk + setter + ⟳ badge)
tech_stack:
  added: []
  patterns:
    - "notify_debouncer_mini recursive watch + ignore-list filter + emit-first-surviving-path (mirrors existing md watcher shape)"
    - "closure-captured trusted filePath for readFile; event payload used only for equality gating (threat T-21-01-04)"
    - "dirty-vs-on-disk as INDEPENDENT signals on EditorTabData (both can show simultaneously)"
key_files:
  created:
    - .planning/phases/21-bug-fix-sprint/21-01-SUMMARY.md
  modified:
    - src-tauri/src/file_watcher.rs
    - src/components/file-tree.tsx
    - src/components/editor-tab.tsx
    - src/components/unified-tab-bar.tsx
decisions:
  - "Reuse existing file_watcher.rs infra — no new watcher crate/module (D-04)"
  - "Incremental refresh via refreshTreePreservingState() — full re-init rejected (D-05)"
  - "No activeUnifiedTabId mutations anywhere in the new listeners — focus preservation (D-06)"
  - "changedOnDisk and dirty are independent fields; dirty-branch sets changedOnDisk instead of clobbering content (D-07)"
  - "Pitfall-11 (watcher leak on project switch) deferred — inline TODO(Pitfall-11) in file_watcher.rs per D-04 scope"
  - "UAT deferred to joint phase-21 verification across 21-01 / 21-02 / 21-03 at end of phase"
metrics:
  duration: "~25 min (Tasks 1–3 implementation + commit)"
  completed: 2026-04-18
requirements:
  - FIX-01
---

# Phase 21 Plan 01: File-Tree External-Edit Refresh — Summary

**Project-wide `file-tree-changed` Tauri event wired into file-tree (state-preserving refresh) and editor-tab (dirty-guarded in-place reload with ⟳ changed-on-disk indicator) — three FIX-01 failure modes (app re-init, focus jump, stale content) eliminated.**

## What Was Built

- **New Rust watcher (`src-tauri/src/file_watcher.rs`):** `start_file_tree_watcher(app_handle, project_path)` modeled after `start_md_watcher`. Uses `notify_debouncer_mini` with 300ms debounce (higher than md's 200ms to coalesce editor burst saves), `RecursiveMode::Recursive`, and an ignore-list filter (`.git/`, `.planning/`, `node_modules/`, `target/`, `dist/`, `.DS_Store`, hidden files with allowlist for `.env*` / `.gitignore`). Emits `file-tree-changed` exactly once per debounced batch using the first surviving path. Wired into `set_project_path` alongside the existing md + git watchers. Pitfall-11 (watcher leak on project switch) documented with inline `// TODO(Pitfall-11)` comment; fix intentionally deferred per D-04.
- **File-tree listener (`src/components/file-tree.tsx`):** Sibling `listen<string>('file-tree-changed')` inside the main `useEffect`, right next to the existing `git-status-changed` listener. Calls the existing `refreshTreePreservingState()` helper (NOT `initTree()`) — preserves expand/collapse state and selection per D-05. Cleanup detaches via `unlistenFileTree` in the effect's return. Zero focus mutations (no `activeUnifiedTabId` touched) per D-06. No JS-side debounce — Rust already debounces at 300ms.
- **Editor-tab dirty-aware reload (`src/components/editor-tab.tsx`):** New second `useEffect` listening for `file-tree-changed`. Path filter: only reacts when `event.payload === filePath` (closure-captured trusted path, equality-checked against payload; `readFile` is called with the closure-captured `filePath`, NOT the payload — threat T-21-01-04 mitigation). Compares `diskContent` vs `setupRef.current.getSavedContent()`. If tab is dirty (current doc ≠ savedContent), sets `changedOnDisk = true` — unsaved edits are never clobbered (D-07). If tab is clean, dispatches the new content into the CodeMirror view in place, updates `savedContent`, clears dirty + changedOnDisk, restores scroll via `requestAnimationFrame`. Existing `git-status-changed` listener left intact — this is an addition, not a replacement.
- **Unified-tab-bar indicator (`src/components/unified-tab-bar.tsx`):** `EditorTabData` gains optional `changedOnDisk?: boolean` field. New exported `setEditorChangedOnDisk(tabId, changed)` helper mirrors `setEditorDirty` shape. In the render path, a subtle `⟳` span renders after the filename (before close button) when `tab.type === 'editor' && tab.changedOnDisk === true` — independent of dirty so BOTH indicators can show together when a dirty tab gets an external edit. Hover title: "File changed on disk. Click tab to reload."

## Key Files Touched

| File | Change |
| ---- | ------ |
| `src-tauri/src/file_watcher.rs` | `start_file_tree_watcher()` added; wired into `set_project_path`; ignore-list filter; `TODO(Pitfall-11)` comment documenting deferred leak fix |
| `src/components/file-tree.tsx` | Sibling `file-tree-changed` listener → `refreshTreePreservingState()`; cleanup wired |
| `src/components/editor-tab.tsx` | Second `useEffect` for `file-tree-changed`: path-filter, dirty-guard, in-place CodeMirror dispatch, scroll preservation |
| `src/components/unified-tab-bar.tsx` | `EditorTabData.changedOnDisk` field, `setEditorChangedOnDisk` setter (exported), ⟳ render branch |

## Root Cause + Fix

**Root cause:** The existing Rust watcher emitted only `md-file-changed` (consumed by gsd-pane) and `git-status-changed` (consumed by git/file-tree components). External edits to source files (e.g., `src/main.tsx` touched by Zed) had no corresponding Tauri event, so the file tree never re-read from disk. Worse, some code paths fell back to `initTree()` which re-mounted the tree (lost expand state) or triggered default-tab re-selection (lost focus) — matching the user's three reported failure modes.

**Fix:** Generic project-wide `file-tree-changed` event with the changed path as payload, surgical filter to skip noise directories, and two independent listeners that consume the event without any global state mutation:
1. File-tree listener → `refreshTreePreservingState()` only. No `initTree()`, no tab focus changes.
2. Editor-tab listener → path-filtered per tab. Only the editor whose `filePath` matches reacts; others are silent. Dirty tabs get a visual indicator instead of a destructive reload.

**Security note:** The editor-tab listener uses `event.payload` only as an equality check gate; the subsequent `readFile(filePath)` uses the closure-captured `filePath` baked into the effect when the tab was created. A compromised watcher cannot trick the editor into reading a different file (threat T-21-01-04 mitigated by design).

## Deviations from Plan

### Auto-approved Deviations

1. **[Rule 3 — Continuation] UAT (Task 4) deferred to joint phase-21 verification.** User running dev server on their side; joint UAT across 21-01 / 21-02 / 21-03 at end of phase per operator instruction. Tasks 1–3 all pass acceptance-criteria grep checks + `cargo check` + `pnpm exec tsc --noEmit` clean at commit time.

## Deferred Items

- **Joint UAT (Tests 1–4 from Task 4 of PLAN):** operator will verify tree-refresh-no-reinit, clean-tab-reloads-in-place, dirty-tab-shows-indicator, planning-files-filtered — alongside 21-02 and 21-03 at phase close.
- **Pitfall-11 — watcher leak on project switch:** `start_file_tree_watcher` (like the existing md + git watchers) spawns a thread that is never joined when `set_project_path` is invoked with a new path. Inline `// TODO(Pitfall-11)` comment added in `file_watcher.rs` above the new function. Fix intentionally deferred per D-04 scope ("reuse existing infra; do NOT fix the leak in this plan"). Proper fix needs a shared watcher registry + cancellation channel — its own future plan.

## Verification

- `cd src-tauri && cargo check` → clean (0 errors) at commit `12b106c`
- `pnpm exec tsc --noEmit` → clean (0 errors) at commits `63e3d94` and `bb06aed`
- `grep -n 'file-tree-changed' src-tauri/src/file_watcher.rs` → match in `start_file_tree_watcher` emit site
- `grep -nE "listen.*'file-tree-changed'" src/components/file-tree.tsx` → exactly one match
- `grep -nE "listen.*'file-tree-changed'" src/components/editor-tab.tsx` → exactly one match
- `grep -n 'TODO(Pitfall-11)' src-tauri/src/file_watcher.rs` → match (leak debt documented)
- `grep -n 'changedOnDisk' src/components/unified-tab-bar.tsx` → 4+ matches (field, setter, render check, export)

## Commits

- `12b106c` — `feat(21-01): add file-tree-changed watcher for external edits` (Task 1)
- `63e3d94` — `feat(21-01): wire file-tree listener for file-tree-changed` (Task 2)
- `bb06aed` — `feat(21-01): editor-tab dirty-aware reload on file-tree-changed` (Task 3 — also touched `unified-tab-bar.tsx` for `EditorTabData.changedOnDisk` + setter + render)
- (this commit) — `docs(21-01): summary and tracking update — UAT deferred to joint verification`

## Cross-links

- Plan: `.planning/phases/21-bug-fix-sprint/21-01-PLAN.md`
- Phase context: `.planning/phases/21-bug-fix-sprint/21-CONTEXT.md`
- Related prior debug: `.planning/debug/full-app-rerender-on-file-change.md`
- Pitfall tracker: `.planning/research/PITFALLS.md` §"Pitfall 11" (watcher leak on project switch)
- Related sibling plans: `21-02-SUMMARY.md` (FIX-05), `21-03-SUMMARY.md` (FIX-06)

## Self-Check: PASSED

- `src-tauri/src/file_watcher.rs` exists and contains `start_file_tree_watcher` + `file-tree-changed` emit — FOUND
- `src/components/file-tree.tsx` exists and contains `listen<string>('file-tree-changed'` → `refreshTreePreservingState()` — FOUND
- `src/components/editor-tab.tsx` exists and contains `listen<string>('file-tree-changed'` with path filter + dirty-guard — FOUND
- `src/components/unified-tab-bar.tsx` exists and exports `setEditorChangedOnDisk` + `EditorTabData.changedOnDisk` — FOUND
- Commit `12b106c` (Task 1) — FOUND in `git log`
- Commit `63e3d94` (Task 2) — FOUND in `git log`
- Commit `bb06aed` (Task 3) — FOUND in `git log`
- `cargo check` green at Task 1 commit — VERIFIED
- `pnpm exec tsc --noEmit` green at Task 2 and Task 3 commits — VERIFIED
- UAT deferred to joint phase-21 verification (21-01 / 21-02 / 21-03) — DOCUMENTED above
