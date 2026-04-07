---
phase: 06-right-panel-views
reviewed: 2026-04-07T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src-tauri/src/file_ops.rs
  - src-tauri/src/file_watcher.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/terminal/pty.rs
  - src/components/diff-viewer.js
  - src/components/file-tree.js
  - src/components/gsd-viewer.js
  - src/components/right-panel.js
  - src/components/tab-bar.js
  - src/index.html
  - src/styles/layout.css
  - src/terminal/pty-bridge.js
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-07T12:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 6 introduces right-panel views (GSD Viewer, Diff Viewer, File Tree) with tabbed navigation, a secondary bash terminal, file watcher for auto-refresh, and backend file operations (diff, directory listing, file reading, checkbox write-back). The code is generally well-structured with good separation of concerns. However, there are two critical issues: an XSS vulnerability in error rendering and a missing path traversal guard on the git diff command. Additionally, the file watcher leaks threads on repeated calls, and a regex is recompiled on every checkbox write.

## Critical Issues

### CR-01: XSS via unescaped error message in bash terminal fallback

**File:** `src/components/right-panel.js:79`
**Issue:** When the bash terminal connection fails, the error object is interpolated directly into innerHTML without escaping. If the error message contains HTML (e.g., from a crafted tmux session name or backend error), it will be rendered as live HTML, enabling XSS.
**Fix:**
```javascript
// Add escapeHtml utility or import from diff-viewer.js, then:
bashContainerEl.innerHTML = `<div style="padding: 16px; color: #dc322f; font-size: 13px;">Failed to connect terminal: ${escapeHtml(String(err))}</div>`;
```

### CR-02: Missing path traversal check on get_file_diff

**File:** `src-tauri/src/file_ops.rs:29`
**Issue:** The `get_file_diff` command accepts an arbitrary absolute path without calling `is_safe_path()`. While `list_directory` and `read_file_content` both validate against `..` traversal, `get_file_diff` skips this check entirely. An attacker (or compromised frontend) could diff any file on the system that the process can read, including files outside the project directory (e.g., `/etc/passwd`, `~/.ssh/config`).
**Fix:**
```rust
#[tauri::command]
pub async fn get_file_diff(path: String) -> Result<String, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    // ... rest of function
}
```
Note: For defense-in-depth, consider also validating that the path is within the active project directory (as `write_checkbox` does), not just free of `..` components. An absolute path like `/etc/passwd` passes `is_safe_path` since it contains no `..`.

## Warnings

### WR-01: File watcher thread leak on repeated set_project_path calls

**File:** `src-tauri/src/file_watcher.rs:89`
**Issue:** Each call to `set_project_path` spawns a new background thread running `start_md_watcher` without stopping or replacing the previous watcher. If the user switches projects multiple times, orphaned watcher threads accumulate. Each thread sleeps in an infinite loop and holds a file watcher handle, consuming OS resources (file descriptors, threads).
**Fix:** Store the watcher handle (or a shutdown signal) in Tauri managed state. Before spawning a new watcher, signal the old one to stop. For example:
```rust
// In managed state, store a Sender<()> for shutdown
// In the watcher loop, select between shutdown signal and sleep
// In set_project_path, send shutdown before spawning new watcher
```

### WR-02: Regex recompiled on every write_checkbox invocation

**File:** `src-tauri/src/file_ops.rs:188`
**Issue:** `Regex::new(...)` is called inside the `spawn_blocking` closure on every `write_checkbox` call. While not a correctness bug, regex compilation is expensive relative to the operation. Under rapid checkbox toggling this adds unnecessary latency.
**Fix:**
```rust
use once_cell::sync::Lazy; // or std::sync::LazyLock on Rust 1.80+

static CHECKBOX_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$").unwrap()
});
```

### WR-03: GSD Viewer renders marked output via innerHTML without explicit sanitization

**File:** `src/components/gsd-viewer.js:87`
**Issue:** `marked.parse(content)` output is assigned to `contentEl.innerHTML`. While marked v14 has built-in sanitization by default, the `injectLineNumbers` function (line 36) performs regex-based string manipulation on the HTML output, which could inadvertently break sanitization boundaries if the regex matches attacker-controlled content. The current regex pattern `/<input type="checkbox" class="task-checkbox"([^>]*)>/g` captures arbitrary attributes in group 1 and re-emits them, potentially allowing attribute injection.
**Fix:** Validate that the captured `attrs` group in `injectLineNumbers` contains only expected attributes (e.g., ` checked`), or use DOM parsing instead of regex for HTML manipulation:
```javascript
function injectLineNumbers(renderedHtml, lineMap) {
  const container = document.createElement('div');
  container.innerHTML = renderedHtml;
  const checkboxes = container.querySelectorAll('input.task-checkbox');
  checkboxes.forEach((cb, i) => {
    cb.setAttribute('data-line', lineMap[i] !== undefined ? lineMap[i] : -1);
  });
  return container.innerHTML;
}
```

## Info

### IN-01: Console logging in production components

**File:** `src/components/file-tree.js:38`, `src/components/gsd-viewer.js:90`, `src/components/right-panel.js:77`
**Issue:** Multiple `console.error` and `console.warn` calls are present in production component code. While useful during development, these should ideally be behind a debug flag or removed for release builds.
**Fix:** Consider a lightweight logger utility that can be silenced in production builds, or accept as intentional for a desktop Tauri app where console output aids debugging.

### IN-02: Hardcoded fallback session name

**File:** `src/components/right-panel.js:65`
**Issue:** The fallback tmux session name `'efx-mux-right'` is hardcoded as a magic string. If the naming convention changes, this would need to be found and updated manually.
**Fix:** Extract to a shared constant, e.g., `const DEFAULT_RIGHT_SESSION = 'efx-mux-right';`

### IN-03: Non-recursive file watcher misses nested .md files

**File:** `src-tauri/src/file_watcher.rs:65`
**Issue:** The watcher uses `RecursiveMode::NonRecursive`, meaning `.md` files in subdirectories (e.g., `.planning/phases/`) will not trigger auto-refresh events. The comment says this mirrors `theme/watcher.rs` pattern, but theme files live at a known depth while GSD/planning files may be nested.
**Fix:** Consider using `RecursiveMode::Recursive` if the GSD file could be in a subdirectory, or document this as a known limitation.

---

_Reviewed: 2026-04-07T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
