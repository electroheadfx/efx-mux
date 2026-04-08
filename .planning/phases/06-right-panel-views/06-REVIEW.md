---
phase: 06-right-panel-views
reviewed: 2026-04-08T14:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src-tauri/src/file_ops.rs
  - src-tauri/src/file_watcher.rs
  - src-tauri/src/git_status.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/project.rs
  - src/components/diff-viewer.js
  - src/components/file-tree.js
  - src/components/gsd-viewer.js
  - src/components/right-panel.js
  - src/components/sidebar.js
  - src/state-manager.js
  - src/terminal/pty-bridge.js
  - src/index.html
  - src/styles/layout.css
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-08T14:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Full standard-depth review of Phase 6 right-panel views, Rust backend commands, state management, and supporting infrastructure. The codebase demonstrates good practices: spawn_blocking for git2 operations, HTML escaping in diff output, path traversal guards on most file commands, and proper Arrow.js reactive patterns. Two critical security issues were found: `get_file_diff` lacks path traversal validation (present in all sibling commands), and `write_checkbox` validates paths without canonicalization (unlike `list_directory` which does canonicalize). Five warnings cover watcher thread leaks on project switch, XSS in error rendering, unescaped markdown HTML, missing PTY invoke error handling, and file-tree navigation escaping the project root.

## Critical Issues

### CR-01: Path traversal missing in get_file_diff

**File:** `src-tauri/src/file_ops.rs:29`
**Issue:** The `get_file_diff` command accepts an arbitrary `path` string without calling `is_safe_path()`. All sibling commands (`list_directory` at line 87, `read_file_content` at line 135, `write_checkbox` at line 179) validate against `..` traversal, but `get_file_diff` does not. A compromised or crafted frontend call could read git diffs for files outside the intended project scope. Additionally, there is no project-root containment check (unlike `list_directory` which accepts `project_root` and canonicalizes).
**Fix:**
```rust
#[tauri::command]
pub async fn get_file_diff(path: String) -> Result<String, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    // existing code continues...
```

### CR-02: write_checkbox path validation bypass via symlinks (non-canonical comparison)

**File:** `src-tauri/src/file_ops.rs:173-175`
**Issue:** The `write_checkbox` command validates the path against the project root using `Path::starts_with()` on raw (non-canonical) paths. Symlinks within the project directory could point to files outside it, bypassing the check. The `list_directory` command at lines 93-97 correctly canonicalizes both paths before comparison. Since `write_checkbox` modifies files on disk, this inconsistency is high severity.
**Fix:**
```rust
if let Some(ref root) = project_root {
    let canonical_path = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let canonical_root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Path is outside the active project directory".to_string());
    }
}
```

## Warnings

### WR-01: File watcher threads accumulate on project switch

**File:** `src-tauri/src/file_watcher.rs:89-99`
**Issue:** Each call to `set_project_path` spawns a new watcher thread via `start_md_watcher` without stopping the previous one. When users switch projects, old watcher threads continue running indefinitely (blocked on `sleep(3600)` at line 82), holding debouncer handles that watch now-irrelevant directories and emit stale `md-file-changed` events. Over a session with many project switches, this leaks threads and file descriptors.
**Fix:** Store a shutdown signal (e.g., `Arc<AtomicBool>`) or the debouncer handle in Tauri managed state. Before starting a new watcher, signal the old thread to exit or drop the old debouncer. The sleep loop at line 82 should check the shutdown flag:
```rust
// In the watcher thread loop:
loop {
    if shutdown_flag.load(Ordering::Relaxed) { break; }
    std::thread::sleep(Duration::from_secs(1));
}
```

### WR-02: XSS via unescaped error in bash terminal innerHTML

**File:** `src/components/right-panel.js:84`
**Issue:** When `connectBashTerminal()` fails, the error is interpolated directly into `innerHTML` without escaping: `` `Failed to connect terminal: ${err}` ``. If the error contains HTML-like content (e.g., from a crafted tmux session name in the Rust backend error), it executes as live markup in the Tauri webview. The `diff-viewer.js` component in this same codebase correctly uses `escapeHtml()` for error rendering.
**Fix:**
```javascript
// Import or inline the escapeHtml helper (already exists in diff-viewer.js)
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Line 84:
bashContainerEl.innerHTML = `<div style="padding: 16px; color: #dc322f; font-size: 13px;">Failed to connect terminal: ${escapeHtml(String(err))}</div>`;
```

### WR-03: GSD Viewer renders unsanitized HTML from markdown

**File:** `src/components/gsd-viewer.js:84-88`
**Issue:** The `marked.parse()` output is assigned directly to `innerHTML` at line 87 without sanitization. Markdown files can contain raw HTML (`<script>`, `<img onerror=...>`, etc.) which `marked` passes through by default. In the Tauri webview, this HTML has full access to `window.__TAURI__` APIs including `invoke`. While the source is local project files (not remote user input), a malicious or compromised markdown file could execute arbitrary commands via the PTY bridge.
**Fix:** Sanitize the rendered HTML before assigning to innerHTML. Either use DOMPurify or configure marked to strip raw HTML:
```javascript
// Option A: Strip HTML in marked config
marked.use({ renderer: { html(token) { return ''; } } });

// Option B: Use DOMPurify (add to vendor/)
contentEl.innerHTML = `<div class="gsd-content">${DOMPurify.sanitize(withLines)}</div>`;
```

### WR-04: Missing error handling on fire-and-forget PTY invoke calls

**File:** `src/terminal/pty-bridge.js:28,39,44`
**Issue:** `invoke('ack_bytes', ...)`, `invoke('write_pty', ...)`, and `invoke('resize_pty', ...)` are called without `.catch()`. If the PTY session is disconnected or the backend errors, these produce unhandled promise rejections in the webview. This masks real errors and could trigger the default unhandled rejection handler.
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

### WR-05: File tree Backspace navigation can escape project root

**File:** `src/components/file-tree.js:84-96`
**Issue:** The Backspace handler navigates to the parent directory. When `rootPath` is set (line 90), it checks `parent.startsWith(rootPath)` which is correct. However, when `rootPath` is null (lines 92-95), navigation is unrestricted -- a user can navigate up to the filesystem root. The backend `list_directory` only validates against `project_root` when it is provided, so this client-side fallback path has no boundary.
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

## Info

### IN-01: index.html title says "GSD MUX" instead of "Efxmux"

**File:** `src/index.html:6`
**Issue:** Per project branding conventions (CLAUDE.md feedback), the app name is "Efxmux" not "GSD MUX".
**Fix:**
```html
<title>Efxmux</title>
```

### IN-02: Regex compiled on every write_checkbox invocation

**File:** `src-tauri/src/file_ops.rs:198`
**Issue:** A new `Regex` is compiled inside `spawn_blocking` on every `write_checkbox` call. The pattern is static and valid, so compilation always succeeds, but it is unnecessary repeated work.
**Fix:** Use `std::sync::OnceLock` to compile once:
```rust
use std::sync::OnceLock;

fn checkbox_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$").unwrap())
}
```

### IN-03: Magic timeout values for DOM readiness across components

**File:** `src/components/file-tree.js:103-106`, `src/components/gsd-viewer.js:115-121`, `src/components/right-panel.js:90-95`
**Issue:** Several components use `setTimeout` with 0, 50, or 200ms delays to wait for Arrow.js DOM rendering. These values are fragile and undocumented. This is a known workaround for Arrow.js lacking lifecycle hooks.
**Fix:** Document the pattern with a comment explaining why, and consider using `requestAnimationFrame` for the zero-delay cases for more reliable post-render timing.

---

_Reviewed: 2026-04-08T14:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
