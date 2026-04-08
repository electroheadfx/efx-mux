---
phase: 06-right-panel-views
reviewed: 2026-04-08T12:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src-tauri/src/project.rs
  - src/components/diff-viewer.js
  - src/components/file-tree.js
  - src/components/gsd-viewer.js
  - src/components/right-panel.js
  - src/state-manager.js
  - src/styles/layout.css
  - src/terminal/pty-bridge.js
  - src/index.html
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-08T12:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the right-panel views (GSD Viewer, Diff Viewer, File Tree), Rust project registry backend, state manager, PTY bridge, layout CSS, and index.html. The codebase is generally well-structured with good separation of concerns, proper HTML escaping in the diff viewer, and correct Arrow.js reactive patterns. One critical XSS vulnerability persists in the bash terminal error path (carried over from prior review). New findings include a duplicate-project bug in the Rust backend, missing error handling on fire-and-forget PTY invocations, and a mutex guard held across async boundaries.

## Critical Issues

### CR-01: XSS via unescaped error in bash terminal innerHTML

**File:** `src/components/right-panel.js:79`
**Issue:** When `connectBashTerminal()` fails, the caught error is interpolated directly into `innerHTML` without escaping: `bashContainerEl.innerHTML = \`...Failed to connect terminal: ${err}...\``. If the error message contains HTML (e.g., from a crafted tmux session name flowing through the Rust backend error response), it will execute as live HTML in the Tauri webview. Other components in this codebase (diff-viewer.js) correctly use `escapeHtml()` for error rendering, but right-panel.js does not.
**Fix:**
```javascript
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Line 79:
bashContainerEl.innerHTML = `<div style="padding: 16px; color: #dc322f; font-size: 13px;">Failed to connect terminal: ${escapeHtml(String(err))}</div>`;
```

## Warnings

### WR-01: Duplicate project entries possible in add_project

**File:** `src-tauri/src/project.rs:13`
**Issue:** `add_project` unconditionally pushes the new entry without checking if a project with the same name or path already exists. This allows duplicate entries which cause ambiguous behavior in `switch_project` (which finds the first match) and `remove_project` (which retains all non-matching entries, so duplicate names would all be removed but duplicate paths with different names would not).
**Fix:**
```rust
let updated = {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.project.projects.iter().any(|p| p.name == entry.name) {
        return Err(format!("Project '{}' already exists", entry.name));
    }
    guard.project.projects.push(entry);
    guard.clone()
};
```

### WR-02: Event listeners accumulate without cleanup

**File:** `src/components/diff-viewer.js:75`, `src/components/gsd-viewer.js:98,106`, `src/components/file-tree.js:94`
**Issue:** Each component adds `document.addEventListener` calls for events like `open-diff`, `md-file-changed`, `project-changed` during component construction, but never removes them. In the current architecture components are created once, so this is not an active bug. However, if any component is ever re-created (e.g., hot reload during development, or future dynamic mounting), listeners will accumulate. The `gsd-viewer.js` correctly stores `unlisten` for the Tauri event (line 103) but never calls it on teardown, and the DOM event listeners on lines 98 and 106 have no cleanup at all.
**Fix:** If components are guaranteed single-instance for the app lifetime, document this assumption with a comment. Otherwise, return a cleanup/dispose function from each component.

### WR-03: File tree backspace navigation can reach filesystem root

**File:** `src/components/file-tree.js:86`
**Issue:** The Backspace handler computes the parent by splitting on `/` and removing the last segment. For paths like `/Users/foo/project/src`, this allows continued navigation upward to `/Users`, `/`, etc., beyond the project root directory. This exposes filesystem structure outside the project directory via the `list_directory` Rust command.
**Fix:** Clamp navigation to the project root:
```javascript
case 'Backspace': {
  e.preventDefault();
  const parent = state.currentPath.split('/').slice(0, -1).join('/');
  const project = activeProject();
  const projectRoot = project?.path || '';
  if (parent && parent.length >= projectRoot.length) {
    loadDir(parent);
  }
  break;
}
```

### WR-04: Missing error handling on fire-and-forget invoke calls in pty-bridge.js

**File:** `src/terminal/pty-bridge.js:28,39,44`
**Issue:** `invoke('ack_bytes', ...)`, `invoke('write_pty', ...)`, and `invoke('resize_pty', ...)` are called without `.catch()`. If these fail (e.g., PTY session disconnected or killed), unhandled promise rejections will surface as uncaught errors in the Tauri webview console and could mask the real problem from the user.
**Fix:**
```javascript
invoke('ack_bytes', { count: bytes.length, sessionName }).catch(err => {
  console.warn('[efxmux] ack_bytes failed:', err);
});

invoke('write_pty', { data, sessionName }).catch(err => {
  console.warn('[efxmux] write_pty failed:', err);
});

invoke('resize_pty', { cols, rows, sessionName }).catch(err => {
  console.warn('[efxmux] resize_pty failed:', err);
});
```

### WR-05: Mutex guard held in async fn without scoping in get_projects / get_active_project

**File:** `src-tauri/src/project.rs:64,72`
**Issue:** In `get_projects` and `get_active_project`, the `std::sync::Mutex` guard lives until end of the function body in an `async fn`. Tauri commands run on the async runtime -- holding a `std::sync::Mutex` guard across an implicit `.await` point (the async return) can block the async executor thread if the mutex is contended. The write commands (`add_project`, `remove_project`, `switch_project`) correctly scope the guard inside a block, but the read commands do not.
**Fix:**
```rust
pub async fn get_projects(
    state: State<'_, ManagedAppState>,
) -> Result<Vec<ProjectEntry>, String> {
    let projects = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.project.projects.clone()
    };
    Ok(projects)
}

pub async fn get_active_project(
    state: State<'_, ManagedAppState>,
) -> Result<Option<String>, String> {
    let active = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.project.active.clone()
    };
    Ok(active)
}
```

## Info

### IN-01: Unused gitFiles function in sidebar.js always returns empty array

**File:** `src/components/sidebar.js:269-275`
**Issue:** The `gitFiles()` function does project lookups but always returns `[]` (line 274). The template at line 406 checks `gitFiles().length > 0` which is always false, making the entire git file list section dead code.
**Fix:** Either implement the function to return actual file data from a Rust command, or remove the dead code block (lines 269-275 and 406-409) to reduce confusion.

### IN-02: index.html title says "GSD MUX" instead of "Efxmux"

**File:** `src/index.html:6`
**Issue:** Per project branding conventions, the app name is "Efxmux" not "GSD MUX".
**Fix:**
```html
<title>Efxmux</title>
```

### IN-03: Hardcoded fallback session name

**File:** `src/components/right-panel.js:65`
**Issue:** The fallback tmux session name `'efx-mux-right'` is a magic string. If the naming convention changes, it must be found and updated manually.
**Fix:** Extract to a shared constant or config module.

---

_Reviewed: 2026-04-08T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
