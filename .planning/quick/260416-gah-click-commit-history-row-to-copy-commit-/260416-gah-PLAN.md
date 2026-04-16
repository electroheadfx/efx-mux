---
phase: quick
plan: 260416-gah
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/git-control-tab.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Clicking a commit history row copies the full commit hash to clipboard"
    - "A success toast appears confirming the copy with the short hash"
    - "Row hover still shows the existing hover background effect"
  artifacts:
    - path: "src/components/git-control-tab.tsx"
      provides: "Click handler on HistoryEntry rows"
      contains: "navigator.clipboard.writeText"
  key_links:
    - from: "HistoryEntry onClick"
      to: "navigator.clipboard.writeText"
      via: "entry.hash passed to clipboard API"
    - from: "HistoryEntry onClick"
      to: "showToast"
      via: "success toast with short_hash"
---

<objective>
Add click-to-copy behavior on commit history rows in the git sidebar. Clicking a row
copies the full commit hash to the clipboard and shows a success toast with the short hash.

Purpose: Quick access to commit hashes without manual selection or terminal commands.
Output: Modified HistoryEntry component with onClick handler.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/git-control-tab.tsx
@src/components/toast.tsx

<interfaces>
From src/services/git-service.ts:
```typescript
export interface GitCommitEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;  // Unix epoch seconds
  refs: string[];
}
```

From src/components/toast.tsx:
```typescript
export function showToast(toast: { type: 'success' | 'error'; message: string; hint?: string }): void;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add click-to-copy handler on HistoryEntry rows</name>
  <files>src/components/git-control-tab.tsx</files>
  <action>
Modify the `HistoryEntry` component (around line 536) to add an `onClick` handler on
the outer div that:

1. Calls `navigator.clipboard.writeText(entry.hash)` (the full 40-char hash).
2. On success, calls `showToast({ type: 'success', message: 'Copied ' + entry.short_hash })`.
3. On failure (clipboard API rejected), calls `showToast({ type: 'error', message: 'Failed to copy hash' })`.
4. Add `cursor: 'pointer'` to the outer div's style object (it currently has no cursor set).

The `showToast` import already exists at line 21. The `entry.hash` (full) and
`entry.short_hash` (7-char) fields are both available on `GitCommitEntry`.

Use `navigator.clipboard.writeText` -- no Tauri clipboard plugin is installed, and the
Web Clipboard API works in WKWebView on macOS Monterey+. Wrap in async/await with
try/catch since clipboard access can fail if the webview loses focus.

Do NOT change the existing `title` tooltip, `onMouseEnter`/`onMouseLeave` hover effects,
or any other behavior on the row -- only add the onClick and cursor style.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Clicking a commit history row copies the full hash to clipboard
    - A success toast showing "Copied {short_hash}" appears after clicking
    - A clipboard error shows an error toast instead
    - Row cursor is pointer to indicate clickability
    - Existing hover effect and tooltip behavior unchanged
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors: `npx tsc --noEmit`
- Visual check: history rows show pointer cursor on hover
- Functional check: clicking a row triggers the toast
</verification>

<success_criteria>
Commit history rows in the git sidebar are clickable. Clicking copies the full commit
hash to clipboard and confirms with a toast showing the abbreviated hash.
</success_criteria>

<output>
After completion, create `.planning/quick/260416-gah-click-commit-history-row-to-copy-commit-/260416-gah-SUMMARY.md`
</output>
