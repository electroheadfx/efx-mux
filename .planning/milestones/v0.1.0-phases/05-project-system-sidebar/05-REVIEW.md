# Phase 05: Code Review Report

**Reviewed:** 2026-04-07T14:30:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed 12 files (6 Rust, 6 JavaScript) covering the Phase 5 project system sidebar implementation. The code is generally well-structured with proper Tauri async patterns, but several issues were found: a memory leak from an unbounded event listener, a dead event dispatch, duplicate state persistence calls, and an unused variable. No critical security vulnerabilities or logic bugs were identified.

---

## Warnings

### WR-01: Memory leak — fuzzy-search keydown listener never removed

**File:** `src/components/fuzzy-search.js:104`
**Issue:** The global `keydown` listener (`handleGlobalKeydown`) is registered on module load but never cleaned up. If the FuzzySearch component unmounts or the module reloads, the listener persists for the lifetime of the page.
**Fix:** Either remove the listener when the search closes, or track a flag to short-circuit when the search is not visible:

```javascript
function handleGlobalKeydown(e) {
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    openSearch();
    return;
  }
  if (!state.visible) return;  // Short-circuit when not visible
  // ... rest of handler
}
```

### WR-02: initSidebar() called on every render, causing duplicate event listeners

**File:** `src/components/sidebar.js:277`
**Issue:** The `Sidebar` component calls `initSidebar()` on every render. This function registers two `document.addEventListener` listeners (`project-changed` and `open-add-project`). After multiple renders, multiple copies of each listener accumulate.
**Fix:** Move event listener registration outside the render path, or add a guard to ensure initialization only runs once:

```javascript
let initialized = false;
export const Sidebar = ({ collapsed }) => {
  if (!initialized) {
    initSidebar();
    initialized = true;
  }
  // ...
};
```

### WR-03: Dead event dispatch — 'project-added' has no listener

**File:** `src/components/project-modal.js:77`
**Issue:** `document.dispatchEvent(new CustomEvent('project-added', ...))` is dispatched but no component listens for it. Only `project-changed` is handled in `sidebar.js:41-44`. The `projects` variable on line 74 is fetched but unused.
**Fix:** Either remove the dead dispatch and unused variable, or wire up a `project-added` listener in the sidebar to handle the project list refresh reactively:

```javascript
// In sidebar.js initSidebar():
document.addEventListener('project-added', async (e) => {
  const projects = await getProjects();
  state.projects = projects;
});
```

### WR-04: Triple redundant state persistence in project operations

**File:** `src/state-manager.js:131-135, 141-145, 152-157`
**Issue:** Each of `addProject`, `removeProject`, and `switchProject` calls `invoke('save_state', ...)` after the Rust command. However, `switchProject` in `project.rs` only updates `guard.project.active` in memory — it does NOT persist to disk. The Rust `save_state` in JS is therefore necessary. But the pattern is fragile: if Rust later persists atomically, the JS-side extra persist becomes redundant. Additionally, `getProjects()` on line 74 of `project-modal.js` is fetched but unused.
**Fix:** Document the intentionality: Rust commands mutate in-memory state; JS persist calls write to disk. Consider consolidating into a single `save_state` call after a batch of operations to reduce I/O.

### WR-05: No duplicate project name validation in add_project

**File:** `src-tauri/src/project.rs:6-15`
**Issue:** `add_project` pushes a new entry to the projects list without checking if a project with the same name already exists. This allows duplicate entries with identical names but different paths.
**Fix:** Add a uniqueness check before pushing:

```rust
#[tauri::command]
pub async fn add_project(
    state: State<'_, ManagedAppState>,
    entry: ProjectEntry,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.project.projects.iter().any(|p| p.name == entry.name) {
        return Err(format!("Project '{}' already exists", entry.name));
    }
    guard.project.projects.push(entry);
    Ok(())
}
```

---

## Info

### IN-01: Unused variable — TNS in project-modal.js

**File:** `src/components/project-modal.js:6`
**Issue:** `const TNS = window.__TAURI__.core;` is declared but never used anywhere in the file.
**Fix:** Remove the line.

### IN-02: Duplicate comment section header in main.js

**File:** `src/main.js:84` and `src/main.js:108`
**Issue:** Both lines are labeled `--- Step 4b: Init project system ---`. Line 84 appears to be an accidental duplicate header.
**Fix:** Remove the duplicate header at line 84.

### IN-03: TODO comment left in production code

**File:** `src/main.js:127`
**Issue:** `// TODO (Phase 6+): update tmux session, GSD viewer path, git panels` documents an incomplete feature. This is acceptable for a phased project but should be tracked in the phase plan.
**Fix:** No immediate action needed — this is intentional technical debt for a later phase.

### IN-04: gitFiles always returns empty array — acknowledged but not enforced

**File:** `src/components/sidebar.js:286-295`
**Issue:** The `gitFiles` function always returns `[]` because `get_git_status` only returns counts, not per-file status. The code correctly notes this is for Phase 6. The conditional rendering on line 430 (`${gitFiles().length > 0 ? ...`) will never show files until Phase 6.
**Fix:** No immediate action — this is acknowledged design debt for Phase 6.

### IN-05: Path basename extraction does not handle Windows paths

**File:** `src/components/project-modal.js:96-99`
**Issue:** When auto-filling the project name from the selected directory, the code splits on `/`. On Windows, paths use `\` as the separator. However, since this is a macOS-only Tauri app, this is not a runtime issue.
**Fix:** Use `path.basename()` from Node.js `path` module or `URL` object for cross-platform correctness.

---

_Reviewed: 2026-04-07T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
