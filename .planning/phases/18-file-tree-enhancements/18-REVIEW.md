---
phase: 18-file-tree-enhancements
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src-tauri/src/file_ops.rs
  - src-tauri/src/git_ops.rs
  - src-tauri/src/lib.rs
  - src/components/file-tree.test.tsx
  - src/components/file-tree.tsx
  - src/components/git-control-tab.tsx
  - src/main.tsx
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-04-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Phase 18 gap-closure deltas (plans 18-06 through 18-09) from commit `02fee49` to HEAD. Scope: `create_file` existence guard, status-aware `revert_file` branching, per-file `handleRevertAll` try/catch, macOS title-bar Y offset, 4 x-axis hit-test bounds additions, `refreshTreePreservingState` for tree-state preservation, and the native `CmdOrCtrl+Backspace` MenuItem wiring.

Overall quality is good: fixes are tightly scoped, each change has accompanying tests, comments document root causes and UAT test linkage, and the Rust-side status-aware revert handles the four key WT_ status flags explicitly. However, three user-facing behavior concerns warrant attention before release:

1. The `CmdOrCtrl+Backspace` global menu accelerator hijacks the keystroke from text inputs (notably the commit message textarea), breaking standard macOS "delete word/line" editing and potentially firing a delete-confirm on the tree even when focus is elsewhere.
2. `revert_file_impl` calls `std::fs::remove_file` unconditionally on any WT_NEW entry, which will error on untracked *directories* (reasonable user workflow: new folder → click revert).
3. `refreshTreePreservingState` is re-entrant on repeated `git-status-changed` events — concurrent invocations can interleave and leave the tree in an inconsistent state.

None rise to Critical (no data loss, crashes, or security vulnerabilities). The four Info items are minor: a hardcoded magic number, dead code branches, and tight platform assumptions.

## Warnings

### WR-01: Global Cmd+Backspace accelerator hijacks text editing in inputs

**File:** `src-tauri/src/lib.rs:54-73` (menu registration) + `src/components/file-tree.tsx:821-835` (listener)
**Issue:** The native Tauri menu item `delete-selection` is registered with accelerator `CmdOrCtrl+Backspace` and marked enabled (`true`) unconditionally. On macOS, NSMenu accelerators take priority over focused text controls — so hitting Cmd+Backspace while typing in the `git-control-tab.tsx` commit message `<textarea>` (or any other input) no longer performs the standard "delete to line start" action; it fires `delete-selected-tree-row` instead. The JS listener then runs:

```js
unlistenDelete = await listen('delete-selected-tree-row', () => {
  const project = getActiveProject();
  if (!project?.path) return;                                // only guard
  let entry: FileEntry | undefined;
  if (viewMode.value === 'flat') entry = entries.value[selectedIndex.value];
  else entry = flattenedTree.value[selectedIndex.value]?.entry;
  if (entry) void triggerDeleteConfirm(entry);               // fires confirm modal
});
```

`selectedIndex` defaults to 0 whenever entries are loaded, so `entry` is almost always defined and the delete-confirm modal will appear — even when the user was just trying to delete-word inside the commit box. At best this is a jarring UX interruption; at worst, a distracted user who hits "Delete" in the modal loses a file while editing text.

**Fix:** Gate the event-emit at the frontend on "is the file tree the active panel?" Track a `fileTreeHasFocus` signal (set on `focus`/`blur` of the `tabindex=0` scroll container) and early-return from the listener when false. Alternatively, in the native menu handler, inspect the currently-focused webview element before emitting (not easily done from Rust, so frontend-side gate is simpler):

```js
// file-tree.tsx — add focus tracking to the scroll container
<div
  ref={scrollContainerRef}
  tabIndex={0}
  onFocus={() => { fileTreeHasFocus.value = true; }}
  onBlur={() => { fileTreeHasFocus.value = false; }}
  ...
/>

// In the delete-selected-tree-row listener:
unlistenDelete = await listen('delete-selected-tree-row', () => {
  if (!fileTreeHasFocus.value) return;   // ignore when focus is elsewhere
  const project = getActiveProject();
  if (!project?.path) return;
  // ... rest unchanged
});
```

This preserves the UAT Test 5 fix (Cmd+Backspace works from the tree) while restoring normal text-editing semantics for inputs.

### WR-02: revert_file_impl fails on untracked directories (WT_NEW + is_dir)

**File:** `src-tauri/src/git_ops.rs:501-507`
**Issue:** When a file is `WT_NEW` (untracked), `revert_file_impl` calls `std::fs::remove_file(&abs)`. This is correct for untracked files but returns an error for untracked *directories* — `remove_file` refuses to remove a directory (returns `ErrorKind::Other` / `Is a directory`). A realistic user workflow: create a new folder via the "New Folder" context-menu, realize it shouldn't be there, click the per-file revert undo button on that entry in the GitControlTab. The batch revert path (`handleRevertAll`) will also log this as a failure for every untracked directory in the tree.

The comment on the branch says "Untracked → delete from disk" but silently assumes file-only, and there are no tests covering the directory case.

**Fix:** Check the path type (or use a metadata probe) and dispatch between `remove_file` and `remove_dir_all`:

```rust
if status.contains(git2::Status::WT_NEW) {
    let abs = workdir.join(&rel_path);
    let meta = std::fs::symlink_metadata(&abs)
        .map_err(|e| GitError::RevertError(format!("stat failed: {}", e)))?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&abs)
            .map_err(|e| GitError::RevertError(format!("Failed to delete untracked directory: {}", e)))?;
    } else {
        std::fs::remove_file(&abs)
            .map_err(|e| GitError::RevertError(format!("Failed to delete untracked file: {}", e)))?;
    }
    return Ok(());
}
```

Add a regression test mirroring `revert_file_deletes_untracked` that creates a directory tree and asserts `remove_dir_all` semantics.

### WR-03: refreshTreePreservingState is re-entrant — concurrent invocations can interleave

**File:** `src/components/file-tree.tsx:240-280` (function), `src/components/file-tree.tsx:803-813` (listener)
**Issue:** `refreshTreePreservingState` is called unguarded from the `git-status-changed` listener. If two mutations fire in rapid succession (e.g., the user deletes a file while a git hook is emitting status changes), two invocations will interleave: both read `flattenedTree.value` at the top, both call `await initTree()`, then both attempt to re-expand snapshot paths against the same mutating `treeNodes.value`. Because each call's `sortedExpanded` loop does `flattenedTree.value.find(...)` after every `await toggleTreeNode(node)`, the second invocation's snapshot may include paths that no longer exist in the tree (or the first invocation's re-expansion may clobber the second's pending state). Net effect: transient visual flicker, nodes collapsing that the user explicitly expanded between mutations, or `selectedIndex` anchoring to a stale row.

The existing `capturedGitStatusListener` test only ever fires the listener once per test and waits 200 ms, so this is invisible in tests.

**Fix:** Serialize invocations with a simple in-flight guard + trailing-edge queue, or a mutex-style promise chain:

```js
let refreshInFlight: Promise<void> | null = null;
let refreshPending = false;

async function refreshTreePreservingState(): Promise<void> {
  if (refreshInFlight) {
    refreshPending = true;                    // coalesce trailing calls
    return;
  }
  const run = async () => {
    try {
      // ... existing body ...
    } finally {
      refreshInFlight = null;
      if (refreshPending) {
        refreshPending = false;
        await refreshTreePreservingState();   // run once more to catch final state
      }
    }
  };
  refreshInFlight = run();
  await refreshInFlight;
}
```

This is the standard "debounce via in-flight guard with trailing run" pattern and avoids the interleave window without dropping events.

## Info

### IN-01: MACOS_TITLE_BAR_OFFSET is a hardcoded magic number tied to Sonoma/Sequoia

**File:** `src/main.tsx:55`
**Issue:** `const MACOS_TITLE_BAR_OFFSET = 28;` is a hardcoded value that the comment acknowledges is "stable at 28 CSS px on Sonoma/Sequoia." Future macOS versions with different title-bar heights, or a config change to `titleBarStyle` (currently "Overlay" per the comment), will silently produce drops at the wrong y-coordinate. There is no assertion that the window is actually using Overlay style, and no runtime probe.

**Fix:** Either:
- Probe the offset at runtime via `getCurrentWindow().innerPosition()` minus `outerPosition()` on first drag event, cache the result.
- Add a comment-level TODO referencing the upstream Tauri issue #10744 with a "retire this constant when fixed" note (the current comment references the issue but doesn't commit to removal).
- Read `titleBarStyle` from `tauri.conf.json` at runtime to conditionally apply the offset.

At minimum, move the constant near the handler that consumes it (currently at module-top far from `onDragDropEvent`) so future readers see the coupling.

### IN-02: Dead Cmd+Backspace branches in handleFlatKeydown / handleTreeKeydown

**File:** `src/components/file-tree.tsx:1186-1196` (flat), `src/components/file-tree.tsx:1254-1261` (tree)
**Issue:** After Plan 18-09 added the native MenuItem for `CmdOrCtrl+Backspace`, the accelerator is caught at the NSMenu layer and the keystroke no longer reaches the webview. The `case 'Backspace': if (e.metaKey)` branches in both keydown handlers are therefore unreachable on macOS. They do no harm but are now dead code that could mislead future maintainers into thinking the shortcut flows through here.

**Fix:** Delete the `e.metaKey` sub-branches and simplify to plain-Backspace handling only. Add a brief comment at each delete site: `// Cmd+Backspace handled natively — see lib.rs delete-selection MenuItem`. The `'Delete'` case remains active and unchanged.

### IN-03: Status flag check order mixes WT_NEW with WT_MODIFIED coexistence

**File:** `src-tauri/src/git_ops.rs:501-512`
**Issue:** The branch ordering is `WT_NEW` first, then `WT_MODIFIED | WT_DELETED | WT_TYPECHANGE | WT_RENAMED`. A file that is simultaneously `WT_MODIFIED` *and* has some index-staged pieces is handled by the second branch — correct. However, the combination `INDEX_NEW | WT_MODIFIED` (staged-new file with unstaged workdir edits) is possible: the `WT_NEW` check is bypassed (INDEX_NEW is not WT_NEW), and `WT_MODIFIED` matches the checkout branch — which would invoke `git checkout -- <path>` on a file git considers staged-new, potentially losing staged content. This is probably fine because the UI only exposes per-file revert on unstaged changes, but the defensive default at the bottom (`return Ok(())` for "purely INDEX_*") doesn't document why mixed states fall through.

**Fix:** Add a one-line comment before the `needs_checkout` computation noting that the function is scoped to the working-tree revert button (unstaged rows only) and that mixed INDEX+WT states intentionally checkout the workdir copy because that's what the user sees on the row.

### IN-04: Unused `screen` import in file-tree.test.tsx

**File:** `src/components/file-tree.test.tsx:3`
**Issue:** `screen` is imported from `@testing-library/preact` but never used anywhere in the file (verified via grep: zero `screen.*` matches). This is pre-existing (present in the diff_base commit) — not introduced by Phase 18 — and technically out of v1 review scope for test files. Flagged only because the Phase 18 diff adds substantial new code to this file without removing the unused import.

**Fix:** Remove `screen` from the import statement: `import { render, fireEvent } from '@testing-library/preact';`

---

_Reviewed: 2026-04-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
