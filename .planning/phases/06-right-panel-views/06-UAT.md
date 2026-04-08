---
status: diagnosed
phase: 06-right-panel-views
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md]
started: 2026-04-08T11:00:00Z
updated: 2026-04-08T11:00:00Z
retest: true
prior_session: "2026-04-08T07:00:00Z (4 issues, all diagnosed, fix plans 04-06 executed)"
---

## Current Test

[testing complete]

## Tests

### 1. GSD Viewer Markdown Rendering (retest)
expected: Selecting the GSD tab in the right panel shows rendered markdown content. Headings, lists, and code blocks are formatted — not stuck on "Loading GSD..." or showing raw markdown.
result: pass

### 2. GSD Viewer Checkbox Write-Back (was blocked)
expected: Clicking a checkbox in the GSD Viewer toggles it. The change is written back to the underlying .md file on disk.
result: skipped
reason: "User decision — checkbox write-back not approved for current scope"

### 3. GSD Viewer Auto-Refresh (was blocked)
expected: Edit a .md file externally (e.g., in another editor). The GSD Viewer updates automatically without manual refresh.
result: issue
reported: "GSD Viewer does not auto-refresh when .md file is edited externally"
severity: minor

### 4. Diff Viewer Shows Git Changes (retest)
expected: Sidebar GIT CHANGES section lists individual changed files. Clicking one shows git diff in the Diff tab with green additions, red deletions, and styled hunk headers.
result: pass
notes: |
  Core diff functionality works. Two UX issues noted for future fix:
  1. Clicking a file in sidebar GIT CHANGES should auto-switch to Diff tab (currently requires manual tab click)
  2. GIT CHANGES section has fixed/small height with wasted space below — should use available vertical space

### 5. File Tree Root Boundary (retest)
expected: In the Files tab, pressing Backspace at the project root does NOT navigate above it. You stay within the project directory.
result: pass

### 6. Bash Terminal Resize (retest)
expected: Resize the right panel (drag divider or resize window). The Bash terminal in the bottom-right reflows text to fit the new dimensions.
result: pass

## Summary

total: 6
passed: 4
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "GSD Viewer auto-refreshes when .md files are edited externally"
  status: failed
  reason: "User reported: GSD Viewer does not auto-refresh on external .md file edits"
  severity: minor
  test: 3
  root_cause: "file_watcher.rs uses RecursiveMode::NonRecursive (line 65), so only watches the project root directory. Most .md files (planning docs, etc.) live in subdirectories and are not detected. Should use RecursiveMode::Recursive."
  artifacts:
    - path: "src-tauri/src/file_watcher.rs"
      issue: "NonRecursive watch mode at line 65 misses .md files in subdirectories"
  missing:
    - "Change RecursiveMode::NonRecursive to RecursiveMode::Recursive in file_watcher.rs line 65"

- truth: "Clicking a git-changed file in sidebar auto-opens Diff tab"
  status: enhancement
  reason: "User expects clicking a file in GIT CHANGES to auto-switch to Diff tab in right panel"
  severity: minor
  test: 4
  artifacts:
    - path: "src/components/sidebar.js"
      issue: "File click dispatches open-diff event but right panel doesn't auto-switch tab"
  missing:
    - "Right panel should listen for open-diff event and switch active tab to Diff"

- truth: "GIT CHANGES section uses full available sidebar height"
  status: enhancement
  reason: "GIT CHANGES section has fixed/small height with wasted empty space below the file list"
  severity: minor
  test: 4
  artifacts:
    - path: "src/styles/layout.css"
      issue: "GIT CHANGES section has constrained height instead of flex-growing to fill sidebar"
  missing:
    - "Use flex layout so GIT CHANGES fills remaining sidebar vertical space"
