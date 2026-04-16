---
phase: 17-main-panel-file-tabs
plan: 03
subsystem: tabs
tags: [git, diff, accordion, editor, unified-tab, codemirror]

dependency_graph:
  requires:
    - phase: 17-main-panel-file-tabs/17-01
      provides: CM6 theme, language extensions, editor setup factory, ConfirmModal
    - phase: 17-main-panel-file-tabs/17-02
      provides: UnifiedTabBar, openEditorTab, EditorTab, tab signals
  provides:
    - src/components/git-changes-tab.tsx: GitChangesTab accordion component
    - src/components/main-panel.tsx: Rewired with UnifiedTabBar + conditional content areas
    - src/main.tsx: File-opened handler creates editor tabs, Cmd+S intercepted
  affects:
    - Phase 17 completion (final integration plan)
tech_stack:
  added:
    - git-changes-tab.tsx: Preact signals + Tauri IPC + inline diff rendering
  patterns:
    - Accordion per-file diff pattern (GitFile interface, expand on click, lazy-load diffs)
    - Inline diff rendering without external lib (parse +/- lines, escapeHtml, color coding)
    - UnifiedTabBar replaces file viewer overlay completely
    - Cmd+S metaKey capture prevents browser Save Page dialog while letting CM6 handle save
key_files:
  created:
    - src/components/git-changes-tab.tsx
  modified:
    - src/components/main-panel.tsx
    - src/main.tsx
decisions:
  - id: D-12
    decision: GitChangesTab accordion with lazy-loaded per-file diffs
    rationale: Auto-refresh on git-status-changed, expand-to-load diff pattern
  - id: D-13
    decision: Status badges use colors from tokens.ts (statusYellowBg, statusGreenBg, diffRedBg)
    rationale: Consistent with UI-SPEC color table
  - id: D-14
    decision: Auto-refresh on git-status-changed event + clear diff cache on refresh
    rationale: Ensures accordion shows fresh data after git operations
  - id: D-15
    decision: File tree click opens editor tab via openEditorTab
    rationale: Replaces show-file-viewer event + read-only overlay
  - id: D-16
    decision: File viewer overlay entirely removed from main-panel.tsx
    rationale: All code removal (highlightCode, KEYWORDS_*, marked, escapeHtml, etc.)
  - id: EDIT-03
    decision: Cmd+S metaKey captured in keyboard handler, preventDefault only (no stopPropagation)
    rationale: Blocks browser Save Page dialog in WKWebView while letting CM6 Mod-s keymap handle save
requirements_completed:
  - MAIN-01
  - MAIN-02
  - EDIT-01
  - EDIT-03

metrics:
  duration: ~10 min
  completed: 2026-04-15
  tasks_completed: 3
  files_created: 1
  files_modified: 2
---

# Phase 17 Plan 03 Summary: Git Changes Tab + Unified Tab Integration

**Git changes accordion tab with per-file diffs, main panel rewired to UnifiedTabBar, file viewer overlay removed, Cmd+S intercepts browser Save dialog.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-15
- **Tasks:** 3 (2 auto-executed + 1 human verification passed)
- **Files created:** 1
- **Files modified:** 2

## Task Commits

1. **Task 1: Create git changes tab with accordion per-file diffs** - `4be4bfa` (feat)
2. **Task 2: Rewire main-panel.tsx and main.tsx for unified tab system** - `eaf1d64` (feat)
3. **Task 3: Human verification** - Passed (checkpoint verified)

## What Was Built

### Task 1: Git Changes Tab (`4be4bfa`)

**Created:** `src/components/git-changes-tab.tsx`

**Accordion pattern:** Each file header shows ChevronDown/ChevronRight, filename (mono font), status badge ([M]/[A]/[D] with correct colors), and +/- line counts. Clicking expands to show inline diff.

**Status badge colors (per UI-SPEC):**
- [M]: statusYellow (#D29922)
- [A]: statusGreen (#3FB950)
- [D]: diffRed (#F85149)

**Diff rendering:** Inline `renderDiffLines()` parsing `@@` hunk headers, `+` additions (green), `-` deletions (red), and context lines (dim). HTML escaped before `dangerouslySetInnerHTML`.

**Auto-refresh:** `listen('git-status-changed', ...)` reloads status and clears diff cache on every git operation.

**Empty state:** "No changes" / "Working tree is clean." centered message when working tree is clean.

### Task 2: Rewire main-panel.tsx + main.tsx (`eaf1d64`)

**main-panel.tsx -- Removed:**
- All file viewer overlay code (~180 lines): `fileViewerVisible`, `fileName`, `filePath`, `fileContent` signals, `closeFileViewer`, `escapeHtml`, `isMarkdownFile`, `getLanguage`, keyword patterns (`KEYWORDS_JS`, `KEYWORDS_RS`, etc.), `highlightCode`, `isInsideString`, `highlightLine`, `tokenizeLine`, `renderFileContent`, `marked` import, and the entire file viewer overlay JSX
- `TerminalTabBar` import and usage

**main-panel.tsx -- Added:**
- `UnifiedTabBar`, `EditorTab`, `GitChangesTab`, `ActiveTabCrashOverlay` imports
- Conditional content areas: terminal area (flex), editor tabs area (each EditorTab manages its own `display:none/flex`), git changes tab (shown when `isGitChangesActive`)

**main.tsx -- Changed:**
- `file-opened` handler now calls `openEditorTab(path, name, content)` instead of dispatching `show-file-viewer`
- `ConfirmModal` mounted in App root after `ToastContainer`
- `Ctrl+S` (ctrlKey) for server pane toggle unchanged; `Cmd+S` (metaKey) intercepts browser Save Page dialog via `preventDefault()` without `stopPropagation()` so CM6 Mod-s keymap can still receive the event

**main.tsx -- Removed:** `show-file-viewer` event dispatch and `showFileViewer` function

### Task 3: Human Verification (Passed)

User verified complete Phase 17 flow:
- Editor tabs open on file tree click with syntax highlighting
- Yellow dot appears on dirty tab, Cmd+S saves and clears dot with toast
- Multiple editor tabs open, existing tab focused on re-click (no duplicate)
- Drag-to-reorder tabs works
- [+] dropdown menu: Terminal (Zsh), Agent, Git Changes
- Git changes accordion shows file list with status badges and +/- counts
- Expanding a file shows inline colored diff
- Close (x) on dirty editor tab shows confirmation modal with Cancel/Discard/Save File
- Terminal tabs still work normally

## Files Created/Modified

- `src/components/git-changes-tab.tsx` - Accordion per-file diff panel with auto-refresh, status badges, and inline diff rendering
- `src/components/main-panel.tsx` - File viewer overlay removed, uses UnifiedTabBar with conditional EditorTab and GitChangesTab rendering
- `src/main.tsx` - File-opened handler creates editor tabs, ConfirmModal mounted, Cmd+S intercepts browser Save dialog

## Decisions Made

- Used lazy-load diff pattern (expand file -> fetch diff via IPC) rather than pre-loading all diffs
- Inline diff rendering without external library (same pattern as diff-viewer.tsx)
- `preventDefault` only (no `stopPropagation`) for Cmd+S so CM6's Mod-s keymap still receives the event
- `metaKey && !ctrlKey` distinguishes Cmd+S (macOS) from Ctrl+S while avoiding double-fire on macOS keyboards where ctrlKey can be set alongside metaKey

## Deviations from Plan

None - plan executed exactly as written.

## Human Verification

**Task 3:** Human verification checkpoint passed.
- User confirmed all Phase 17 features working: editor tabs, syntax highlighting, dirty indicator, Cmd+S save, drag-and-drop reorder, [+] dropdown menu, git changes accordion, confirmation modal, terminal tabs preserved.

## Next Phase Readiness

Phase 17 is complete. All components are integrated: UnifiedTabBar, EditorTab with CM6, GitChangesTab with accordion diffs, ConfirmModal for dirty tab close. The unified tab system is fully wired into main-panel.tsx with the file viewer overlay removed.

---
*Phase: 17-main-panel-file-tabs*
*Completed: 2026-04-15*
