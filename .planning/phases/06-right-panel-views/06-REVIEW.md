---
phase: 06-right-panel-views
reviewed: 2026-04-07T18:30:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/components/diff-viewer.js
  - src/components/file-tree.js
  - src/components/gsd-viewer.js
  - src/components/main-panel.js
  - src/components/right-panel.js
  - src/index.html
  - src/main.js
  - src/styles/layout.css
  - src/terminal/pty-bridge.js
  - package.json
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-07T18:30:00Z
**Depth:** standard
**Files Reviewed:** 10 (vendor/marked.mjs excluded as vendored library)
**Status:** issues_found

## Summary

The frontend source files for Phase 6 implement right-panel tabbed views (GSD Viewer, Diff Viewer, File Tree), a secondary Bash terminal, file viewer overlay, and associated wiring in main.js. Code is generally well-structured with good separation of concerns and consistent error handling patterns. One critical XSS vulnerability was found in the right-panel error path, along with four warnings covering a second XSS-adjacent concern in GSD markdown rendering, dead code from a pre-mount DOM query, event listener accumulation, and an unguarded path traversal in file-tree navigation. Three informational items round out the findings.

## Critical Issues

### CR-01: XSS via unescaped error in bash terminal innerHTML

**File:** `src/components/right-panel.js:79`
**Issue:** When `connectBashTerminal()` fails, the caught error is interpolated directly into `innerHTML` without escaping: `bashContainerEl.innerHTML = \`...Failed to connect terminal: ${err}...\``. If the error message contains HTML (e.g., from a crafted tmux session name flowing through the Rust backend error response), it will execute as live HTML in the Tauri webview. Other components in this codebase (diff-viewer.js, main-panel.js) correctly use `escapeHtml()` for error rendering, but right-panel.js does not.
**Fix:**
```javascript
// Import or inline the same escapeHtml used in diff-viewer.js and main-panel.js
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Line 79:
bashContainerEl.innerHTML = `<div style="padding: 16px; color: #dc322f; font-size: 13px;">Failed to connect terminal: ${escapeHtml(String(err))}</div>`;
```

## Warnings

### WR-01: GSD Viewer renders marked HTML via innerHTML with regex-based post-processing

**File:** `src/components/gsd-viewer.js:87`
**Issue:** `marked.parse(content)` output is assigned to `contentEl.innerHTML` after passing through `injectLineNumbers()`, which uses a regex to capture and re-emit arbitrary attribute content from checkbox `<input>` elements (line 40: `([^>]*)` capture group). While marked v14 sanitizes by default, the regex post-processing re-emits captured attributes verbatim, which could allow attribute injection if an attacker crafts markdown that produces input elements with unexpected attributes. The `gsdFile` variable (line 92) is also interpolated into innerHTML without escaping, though its value comes from project config.
**Fix:** Use DOM parsing instead of regex for safer HTML manipulation:
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
Also escape `gsdFile` in the error path on line 92.

### WR-02: Dead code -- pre-mount DOM query for right-panel layout restoration

**File:** `src/main.js:37-48`
**Issue:** Lines 37-48 attempt `document.querySelector('.right-panel')` to restore the `right-h-pct` layout property. This code runs at top-level module scope before the Arrow.js template is mounted at line 80. At this point `.right-panel` does not exist in the DOM, so `querySelector` always returns null and the entire block is dead code. The same logic is correctly duplicated inside `requestAnimationFrame` at lines 219-230 where the DOM elements exist.
**Fix:** Remove lines 37-48 entirely. The `requestAnimationFrame` block at lines 219-230 already handles this case correctly after DOM mount. The CSS custom property assignments on lines 35-36 (`--sidebar-w`, `--right-w`) are fine since they target `:root`.

### WR-03: Event listeners accumulate without cleanup

**File:** `src/components/diff-viewer.js:75`, `src/components/gsd-viewer.js:98,106`, `src/components/file-tree.js:94`
**Issue:** Each component adds `document.addEventListener` calls for events like `open-diff`, `md-file-changed`, `project-changed` during component construction, but never removes them. In the current architecture components are created once, so this is not an active bug. However, if any component is ever re-created (e.g., hot reload during development, or future dynamic mounting), listeners will accumulate. The `gsd-viewer.js` correctly stores `unlisten` for the Tauri event (line 103) but never calls it on teardown, and the DOM event listeners on lines 98 and 106 have no cleanup at all.
**Fix:** If components are guaranteed single-instance for the app lifetime, document this assumption with a comment. Otherwise, return a cleanup/dispose function from each component and wire it to component teardown.

### WR-04: File tree backspace navigation can reach filesystem root

**File:** `src/components/file-tree.js:86`
**Issue:** The Backspace handler computes the parent by splitting on `/` and removing the last segment: `state.currentPath.split('/').slice(0, -1).join('/')`. If the current path is a top-level directory like `/Users`, slicing produces `/` (empty string joined becomes empty, but `/Users`.split('/') is `['', 'Users']`, slice(0,-1) is `['']`, join is `''`). The `if (parent)` guard catches the empty string case, but for paths like `/Users/foo`, the parent becomes `/Users`, allowing continued navigation upward beyond the project root. This could expose filesystem structure outside the project directory.
**Fix:** Clamp navigation to the project root:
```javascript
case 'Backspace': {
  e.preventDefault();
  const parent = state.currentPath.split('/').slice(0, -1).join('/');
  const project = activeProject();
  const projectRoot = project?.path || '';
  // Don't navigate above project root
  if (parent && parent.length >= projectRoot.length) {
    loadDir(parent);
  }
  break;
}
```

## Info

### IN-01: Duplicate escapeHtml implementations across components

**File:** `src/components/diff-viewer.js:13`, `src/components/main-panel.js:40`
**Issue:** Two identical `escapeHtml` functions exist in separate files, and right-panel.js needs a third copy. This is a minor DRY violation.
**Fix:** Extract to a shared utility module, e.g., `src/utils/escape-html.js`, and import from all three components.

### IN-02: Hardcoded fallback session name

**File:** `src/components/right-panel.js:65`
**Issue:** The fallback tmux session name `'efx-mux-right'` is a magic string. If the naming convention changes, it must be found and updated manually.
**Fix:** Extract to a shared constant or config module.

### IN-03: main.js Ctrl+P handler is redundant

**File:** `src/main.js:103-107`
**Issue:** The comment on line 104 acknowledges that `fuzzy-search.js` already captures Ctrl+P at document level, then dispatches the same `open-fuzzy-search` event anyway. This is dead code that adds confusion about which listener is authoritative.
**Fix:** Remove the Ctrl+P branch from main.js (lines 103-107) if fuzzy-search.js handles it independently, or consolidate all keyboard shortcuts in one location.

---

_Reviewed: 2026-04-07T18:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
