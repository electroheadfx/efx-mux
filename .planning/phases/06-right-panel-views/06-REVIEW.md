---
phase: 06-right-panel-views
reviewed: 2026-04-08T15:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - package.json
  - src-tauri/src/file_ops.rs
  - src-tauri/src/git_status.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/project.rs
  - src/components/diff-viewer.js
  - src/components/file-tree.js
  - src/components/gsd-viewer.js
  - src/components/right-panel.js
  - src/components/sidebar.js
  - src/index.html
  - src/state-manager.js
  - src/styles/layout.css
  - src/terminal/pty-bridge.js
  - src/vendor/marked.mjs
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-08T15:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Standard-depth review of Phase 6 right-panel views, Rust backend commands, state management, and supporting infrastructure. The codebase shows good practices: `spawn_blocking` for git2 operations, HTML escaping in the diff viewer, path traversal guards on most file commands, and proper Arrow.js reactive patterns. Two critical security issues were found: `get_file_diff` lacks any path validation (present in all sibling commands), and `write_checkbox` validates paths without canonicalization (unlike `list_directory` which correctly canonicalizes). Five warnings cover XSS in error rendering, unsanitized markdown HTML, missing PTY invoke error handling, file-tree navigation escaping the project root, and duplicate event listener registration.

## Critical Issues

### CR-01: Path traversal missing in get_file_diff

**File:** `src-tauri/src/file_ops.rs:29`
**Issue:** The `get_file_diff` command accepts an arbitrary `path` string without calling `is_safe_path()` or performing any project-root containment check. All sibling commands (`list_directory` at line 87, `read_file_content` at line 135, `write_checkbox` at line 179) validate against `..` traversal, but `get_file_diff` does not. A compromised or crafted frontend call could read git diffs for any file on the system that resides in a git repo. Since this command returns file content (diff hunks), it is an information disclosure vector.
**Fix:**
```rust
#[tauri::command]
pub async fn get_file_diff(path: String) -> Result<String, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    // Optionally add project-root canonicalization like list_directory
    // existing code continues...
```

### CR-02: write_checkbox path validation bypass via symlinks (non-canonical comparison)

**File:** `src-tauri/src/file_ops.rs:172-175`
**Issue:** The `write_checkbox` command validates the path against the project root using `Path::starts_with()` on raw (non-canonical) paths. Symlinks within the project directory could point to files outside it, bypassing the check. The `list_directory` command at lines 93-97 correctly canonicalizes both paths before comparison. Since `write_checkbox` is a write operation (modifies files on disk), this inconsistency is high severity. Additionally, `project_root` is derived from `guard.project.active` which stores the project *name*, not the project path -- this means the `starts_with` check compares a file path against a project name string, which will almost never match, effectively disabling the guard entirely.
**Fix:**
```rust
// 1. Look up the actual project path, not the name:
let project_root = {
    let guard = managed.0.lock().map_err(|e| e.to_string())?;
    guard.project.projects.iter()
        .find(|p| Some(&p.name) == guard.project.active.as_ref())
        .map(|p| p.path.clone())
};

// 2. Use canonical paths (matching list_directory pattern):
if let Some(ref root) = project_root {
    let canonical_path = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let canonical_root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Path is outside the active project directory".to_string());
    }
}
```

## Warnings

### WR-01: XSS via unescaped error in bash terminal innerHTML

**File:** `src/components/right-panel.js:84`
**Issue:** When `connectBashTerminal()` fails, the error is interpolated directly into `innerHTML` without escaping: `` `Failed to connect terminal: ${err}` ``. If the error message contains HTML-like content (e.g., angle brackets from a Rust error), it executes as live markup in the Tauri webview. The `diff-viewer.js` component in this same codebase correctly uses `escapeHtml()` for error rendering (line 70).
**Fix:**
```javascript
// Reuse escapeHtml from diff-viewer.js (or extract to a shared util)
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

bashContainerEl.innerHTML = `<div style="padding: 16px; color: #dc322f; font-size: 13px;">Failed to connect terminal: ${escapeHtml(String(err))}</div>`;
```

### WR-02: GSD Viewer renders unsanitized HTML from markdown

**File:** `src/components/gsd-viewer.js:84-88`
**Issue:** The `marked.parse()` output is assigned directly to `innerHTML` at line 87 without sanitization. Markdown files can contain raw HTML (`<script>`, `<img onerror=...>`, etc.) which `marked` passes through by default. In the Tauri webview, injected HTML has full access to `window.__TAURI__` APIs including `invoke`, meaning a malicious markdown file in a cloned repo could execute arbitrary backend commands via the PTY bridge or file operations.
**Fix:** Sanitize the rendered HTML before assigning to innerHTML:
```javascript
// Option A: Strip raw HTML in marked config (simple, may break legitimate HTML in markdown)
marked.use({ renderer: { html(token) { return ''; } } });

// Option B: Use DOMPurify (add to vendor/) for finer control
contentEl.innerHTML = `<div class="gsd-content">${DOMPurify.sanitize(withLines)}</div>`;
```

### WR-03: Missing error handling on fire-and-forget PTY invoke calls

**File:** `src/terminal/pty-bridge.js:28,39,44`
**Issue:** `invoke('ack_bytes', ...)`, `invoke('write_pty', ...)`, and `invoke('resize_pty', ...)` are called without `.catch()` handlers. If the PTY session is disconnected or the backend errors, these produce unhandled promise rejections. This masks real errors (user keystrokes silently lost) and may trigger default rejection handlers in the webview.
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

### WR-04: File tree Backspace navigation can escape project root when no project is active

**File:** `src/components/file-tree.js:84-96`
**Issue:** The Backspace handler navigates to the parent directory. When `rootPath` is set (line 90), it correctly checks `parent.startsWith(rootPath)`. However, when `rootPath` is null (lines 92-95), navigation is completely unrestricted -- a user can navigate up to the filesystem root `/`. The backend `list_directory` only validates against `project_root` when it is provided, so this client-side fallback path has no server-side safety net either.
**Fix:**
```javascript
case 'Backspace': {
  e.preventDefault();
  const project = activeProject();
  const rootPath = project?.path;
  if (!rootPath) break; // No project context -- disable upward navigation
  const parent = state.currentPath.split('/').slice(0, -1).join('/');
  if (parent && parent.startsWith(rootPath)) {
    loadDir(parent);
  }
  break;
}
```

### WR-05: Sidebar initSidebar registers duplicate event listeners on re-invocation

**File:** `src/components/sidebar.js:311`
**Issue:** `initSidebar()` is called inside the `Sidebar` component function body (line 311). Each call registers new `document.addEventListener` handlers for `project-changed` (line 46), `project-added` (line 52), and `open-add-project` (line 62) without removing previous ones. If `Sidebar` is called more than once (e.g., on re-render), handlers accumulate, causing duplicate async operations on each event.
**Fix:** Guard with an initialization flag:
```javascript
let sidebarInitialized = false;
export const Sidebar = ({ collapsed }) => {
    if (!sidebarInitialized) {
        initSidebar();
        sidebarInitialized = true;
    }
    // ...
};
```

## Info

### IN-01: index.html title says "GSD MUX" instead of "Efxmux"

**File:** `src/index.html:6`
**Issue:** Per project branding conventions (memory notes indicate "App is Efxmux not GSD MUX"), the page title should match the canonical product name.
**Fix:**
```html
<title>Efxmux</title>
```

### IN-02: Regex compiled on every write_checkbox invocation

**File:** `src-tauri/src/file_ops.rs:198`
**Issue:** A new `Regex` is compiled inside `spawn_blocking` on every `write_checkbox` call. The pattern is static and valid, so compilation always succeeds, but it allocates and compiles unnecessarily on each invocation.
**Fix:** Use `std::sync::OnceLock` to compile once:
```rust
use std::sync::OnceLock;

fn checkbox_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$").unwrap())
}
```

### IN-03: Magic timeout values for DOM readiness across components

**File:** `src/components/file-tree.js:103,113`, `src/components/gsd-viewer.js:108,115`, `src/components/right-panel.js:91,93`
**Issue:** Several components use `setTimeout` with 0, 50, or 200ms delays to wait for Arrow.js DOM rendering. These values are fragile and undocumented -- a known workaround for Arrow.js lacking lifecycle hooks. The pattern is consistent across components but could break on slower machines.
**Fix:** Document the pattern with a comment explaining why, and consider using `requestAnimationFrame` for the zero-delay cases for more reliable post-render timing.

---

_Reviewed: 2026-04-08T15:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
