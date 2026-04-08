---
status: diagnosed
phase: 06-right-panel-views
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md]
started: 2026-04-08T07:00:00Z
updated: 2026-04-08T07:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Right Panel Tab Bar
expected: The right panel has a tab bar at the top with tabs for GSD Viewer, Diff Viewer, and File Tree. Clicking each tab switches the visible view below. The active tab is visually highlighted.
result: pass

### 2. GSD Viewer Markdown Rendering
expected: Selecting the GSD Viewer tab shows rendered markdown content from the project's planning files. Headings, lists, and code blocks render with proper formatting.
result: issue
reported: "GSD Viewer stuck on 'Loading GSD...' forever — never loads content. File viewer overlay shows raw markdown text (** markers visible, &amp; entities, no rendering). No line wrapping, ugly OS scrollbar."
severity: blocker

### 3. GSD Viewer Checkbox Write-Back
expected: Clicking a checkbox in the GSD Viewer toggles it and writes the change back to the .md file on disk. The checkbox state persists after switching tabs and returning.
result: blocked
blocked_by: other
reason: "GSD Viewer stuck on Loading GSD — can't test checkboxes"

### 4. GSD Viewer Auto-Refresh
expected: When an .md file is modified externally, the GSD Viewer updates its content automatically without needing a manual refresh.
result: blocked
blocked_by: other
reason: "GSD Viewer stuck on Loading GSD — can't test auto-refresh"

### 5. Diff Viewer
expected: Selecting the Diff Viewer tab shows git diff output with syntax highlighting — green for additions, red for deletions, and accent-colored hunk headers.
result: issue
reported: "Diff Viewer says 'Click a file in the sidebar to view its diff'. Sidebar GIT CHANGES section says 'No changes' despite git status showing 8 modified files. Diff viewer can't show anything without sidebar entries."
severity: major

### 6. File Tree Navigation
expected: The File Tree tab shows the project directory structure. Arrow keys navigate up/down, Enter opens a directory or file, Backspace navigates to the parent directory.
result: issue
reported: "Navigation works but user can escape the project root directory and browse the entire filesystem"
severity: minor

### 7. File Viewer Overlay
expected: Clicking a file in the File Tree opens a read-only overlay showing the file content with a filename header, READ-ONLY badge, and Close button. Pressing Escape dismisses it.
result: pass

### 8. Bash Terminal in Right Panel
expected: The right-bottom panel contains a working Bash terminal (xterm.js). It accepts input, displays output, and responds to commands.
result: issue
reported: "Terminal works but doesn't support responsive height/width — doesn't resize with container"
severity: minor

### 9. Add Project Persistence
expected: Adding a new project via the project modal persists it. After quitting and relaunching the app, the added project still appears in the sidebar.
result: pass

### 10. Multi-Session PTY
expected: The main terminal and the right-panel Bash terminal run as separate PTY sessions. Commands in one do not appear in the other.
result: pass

## Summary

total: 10
passed: 4
issues: 4
pending: 0
skipped: 0
blocked: 2

## Gaps

- truth: "GSD Viewer renders markdown content with proper formatting"
  status: failed
  reason: "User reported: GSD Viewer stuck on 'Loading GSD...' forever — never loads content."
  severity: blocker
  test: 2
  root_cause: "Arrow.js does not support ref callbacks — ref=\"${(el) => ...}\" in gsd-viewer.js:138-144 is serialized as a string attribute, so contentEl is never assigned and loadGSD() never fires. Same bug previously fixed in right-panel.js (commit ade65d4)."
  artifacts:
    - path: "src/components/gsd-viewer.js"
      issue: "Broken Arrow.js ref callback at line 138-144, contentEl permanently null"
  missing:
    - "Replace ref callback with id attribute + setTimeout getElementById pattern (same fix as right-panel.js)"
  debug_session: ""

- truth: "Diff Viewer shows git diff with syntax highlighting for changed files"
  status: failed
  reason: "User reported: Sidebar GIT CHANGES section says 'No changes' despite git status showing 8 modified files."
  severity: major
  test: 5
  root_cause: "Arrow.js reactivity issue. state.gitData is a plain {} inside reactive(). Mutating via state.gitData[name] = git (line 76) modifies nested object in place without triggering reactive proxy setter. Template never re-evaluates. Secondary: gitFiles() at line 299 hardcodes return []."
  artifacts:
    - path: "src/components/sidebar.js"
      issue: "In-place mutation of state.gitData bypasses Arrow.js reactivity (line 75-77)"
    - path: "src/components/sidebar.js"
      issue: "gitFiles() hardcodes return [] at line 299"
  missing:
    - "Replace in-place mutation with full reassignment: state.gitData = { ...state.gitData, [name]: git }"
    - "Implement actual file enumeration in gitFiles() (requires Rust backend to return file-level details)"
  debug_session: ""

- truth: "File Tree restricts navigation to project directory"
  status: failed
  reason: "User reported: Navigation works but user can escape the project root directory and browse the entire filesystem"
  severity: minor
  test: 6
  root_cause: "No project-root boundary check. JS Backspace handler (file-tree.js:86-87) computes parent with no lower bound. Rust list_directory (file_ops.rs:85-88) only checks is_safe_path but not project root containment."
  artifacts:
    - path: "src/components/file-tree.js"
      issue: "Backspace handler has no project root boundary guard (line 83-88)"
    - path: "src-tauri/src/file_ops.rs"
      issue: "list_directory lacks project-root validation (line 85-88)"
  missing:
    - "Add root boundary guard in JS Backspace handler"
    - "Add project-root path validation in Rust list_directory (mirror write_checkbox pattern)"
  debug_session: ""

- truth: "Bash terminal resizes responsively with its container"
  status: failed
  reason: "User reported: Terminal works but doesn't support responsive height/width — doesn't resize with container"
  severity: minor
  test: 8
  root_cause: "right-panel.js line 67-75 creates bash terminal but never calls attachResizeHandler(). Main terminal in main.js line 216 calls it to set up ResizeObserver. Bash terminal only fits once at creation."
  artifacts:
    - path: "src/components/right-panel.js"
      issue: "Missing attachResizeHandler() call after terminal creation (line 57-82)"
  missing:
    - "Import attachResizeHandler from resize-handler.js and call it after connectPty() succeeds"
  debug_session: ""
