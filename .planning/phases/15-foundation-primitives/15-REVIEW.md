---
phase: 15-foundation-primitives
reviewed: 2026-04-14T12:30:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src-tauri/src/file_ops.rs
  - src-tauri/src/git_ops.rs
  - src-tauri/src/lib.rs
  - src/components/context-menu.test.tsx
  - src/components/context-menu.tsx
  - src/components/dropdown-menu.test.tsx
  - src/components/dropdown-menu.tsx
  - src/services/file-service.test.ts
  - src/services/file-service.ts
  - src/services/git-service.test.ts
  - src/services/git-service.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-04-14T12:30:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 15 introduces foundation primitives for file CRUD operations (write, delete, rename, create) and git operations (stage, unstage, commit, push), along with UI components (ContextMenu, Dropdown) and frontend service wrappers.

The code is generally well-structured with proper security mitigations (path traversal checks, atomic writes), appropriate use of `spawn_blocking` for I/O operations, and typed error handling. The UI components have good accessibility attributes and keyboard navigation support.

Key concerns:
1. **Parameter naming mismatch** between Rust backend and TypeScript frontend for git commands could cause runtime failures
2. **Unused function** that adds dead code
3. **Missing hover states** on menu items reduces visual feedback

## Warnings

### WR-01: Parameter Name Mismatch Between Frontend and Backend (git-service.ts / git_ops.rs)

**File:** `src/services/git-service.ts:29`, `src-tauri/src/git_ops.rs:262`
**Issue:** The frontend uses camelCase parameter names (`repoPath`, `filePath`) but the Rust backend expects snake_case (`repo_path`, `file_path`). Tauri's invoke system is case-sensitive on parameter names. This will cause the backend to receive `None`/empty values for these parameters, resulting in runtime errors.

In `git-service.ts`:
```typescript
await invoke('stage_file', { repoPath, filePath });
```

In `git_ops.rs`:
```rust
pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), String>
```

**Fix:** Update the frontend to use snake_case parameter names to match the Rust function signatures:
```typescript
// git-service.ts line 29
await invoke('stage_file', { repo_path: repoPath, file_path: filePath });

// git-service.ts line 42
await invoke('unstage_file', { repo_path: repoPath, file_path: filePath });

// git-service.ts line 56
return await invoke<string>('commit', { repo_path: repoPath, message });

// git-service.ts line 70
await invoke('push', { repo_path: repoPath, remote, branch });
```

---

### WR-02: Unused Function `getSelectableIndex` in Dropdown

**File:** `src/components/dropdown-menu.tsx:44`
**Issue:** The function `getSelectableIndex` is defined but never called anywhere in the component. The mapping logic uses `getActualIndex` to convert selectable indices to actual indices, but the reverse function is unused dead code.

```typescript
const getSelectableIndex = (actualIdx: number) => selectableIndices.indexOf(actualIdx);
```

**Fix:** Either remove the unused function if not needed, or verify if it should be used in the item rendering logic at line 164-165. The current logic at line 164 directly compares `selectableIdx === selectedIndex` which is already correct, so this helper appears unnecessary:
```typescript
// Remove line 44:
// const getSelectableIndex = (actualIdx: number) => selectableIndices.indexOf(actualIdx);
```

---

### WR-03: Inconsistent Empty Commit Detection Timing in git_ops.rs

**File:** `src-tauri/src/git_ops.rs:151-161`
**Issue:** The "nothing to commit" check happens after `write_tree()` is called on the index. While this works correctly, it creates an unnecessary tree object in git's object database even when there's nothing to commit. This is wasteful and could accumulate garbage objects over time.

```rust
let tree_id = index
    .write_tree()
    .map_err(|e| GitError::CommitError(e.to_string()))?;
let tree = repo
    .find_tree(tree_id)
    .map_err(|e| GitError::CommitError(e.to_string()))?;
// ... later ...
if diff.deltas().count() == 0 {
    return Err(GitError::CommitError("Nothing to commit".to_string()));
}
```

**Fix:** Move the diff check before writing the tree:
```rust
// Get parent commit (HEAD) first
let parent = repo
    .head()
    .and_then(|h| h.peel_to_commit())
    .map_err(|e| GitError::CommitError(e.to_string()))?;

let parent_tree = parent
    .tree()
    .map_err(|e| GitError::CommitError(e.to_string()))?;

// Check for changes BEFORE writing tree
let diff = repo
    .diff_tree_to_index(Some(&parent_tree), Some(&index), None)
    .map_err(|e| GitError::CommitError(e.to_string()))?;

if diff.deltas().count() == 0 {
    return Err(GitError::CommitError("Nothing to commit".to_string()));
}

// Only write tree if we have changes
let tree_id = index
    .write_tree()
    .map_err(|e| GitError::CommitError(e.to_string()))?;
```

## Info

### IN-01: Missing Hover State Styling on Menu Items

**File:** `src/components/context-menu.tsx:91-109`, `src/components/dropdown-menu.tsx:181-207`
**Issue:** Menu items lack hover state styling. The Dropdown component highlights the keyboard-selected item with `backgroundColor: isSelected ? colors.accentMuted : 'transparent'`, but neither component provides hover feedback when the mouse moves over items.

**Fix:** Add `:hover` styles via a CSS class or inline style with onMouseEnter/onMouseLeave state for better visual feedback:
```typescript
// For context-menu.tsx, add onMouseEnter/onMouseLeave or use a CSS class
onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.accentMuted}
onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
```

---

### IN-02: Regex Compilation on Every Call in write_checkbox_impl

**File:** `src-tauri/src/file_ops.rs:207`
**Issue:** The checkbox regex is compiled fresh on every call to `write_checkbox_impl`. While regex compilation is fast, this is unnecessary overhead for a pattern that never changes.

```rust
let checkbox_re = regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$")
    .map_err(|e| e.to_string())?;
```

**Fix:** Use `lazy_static!` or `once_cell::sync::Lazy` to compile the regex once:
```rust
use once_cell::sync::Lazy;

static CHECKBOX_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$").expect("Invalid checkbox regex")
});

// In write_checkbox_impl:
if let Some(caps) = CHECKBOX_RE.captures(target) {
```

---

### IN-03: Unused `getActualIndex` Function in Dropdown

**File:** `src/components/dropdown-menu.tsx:43`
**Issue:** Similar to WR-02, the function `getActualIndex` is defined but also never called. Both mapping functions appear to be unused remnants of a different implementation approach.

```typescript
const getActualIndex = (selectableIdx: number) => selectableIndices[selectableIdx] ?? 0;
```

**Fix:** Remove if not needed:
```typescript
// Remove line 43:
// const getActualIndex = (selectableIdx: number) => selectableIndices[selectableIdx] ?? 0;
```

---

### IN-04: Atomic Write Cleanup on Failure

**File:** `src-tauri/src/file_ops.rs:220-229`
**Issue:** The atomic write pattern (write to .tmp, then rename) does not clean up the .tmp file if the rename fails. This could leave orphaned temp files on disk.

```rust
std::fs::write(&tmp_path, &output).map_err(|e| e.to_string())?;
std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
```

**Fix:** Wrap in a scope that attempts cleanup on rename failure:
```rust
std::fs::write(&tmp_path, &output).map_err(|e| e.to_string())?;
if let Err(e) = std::fs::rename(&tmp_path, &path) {
    // Best-effort cleanup
    let _ = std::fs::remove_file(&tmp_path);
    return Err(e.to_string());
}
```

---

_Reviewed: 2026-04-14T12:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
