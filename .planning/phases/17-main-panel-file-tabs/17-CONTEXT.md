# Phase 17: Main Panel File Tabs - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can edit files in CodeMirror 6 tabs with save/close workflow and add new tab types via dropdown. The main panel tab bar becomes a unified system mixing terminal tabs, editor tabs, and a git changes tab. The existing read-only file viewer overlay is removed — all file viewing goes through editor tabs.

</domain>

<decisions>
## Implementation Decisions

### Tab Architecture
- **D-01:** Unified tab bar — single row mixing terminal tabs, editor tabs, and git changes tab. Replaces current TerminalTabBar.
- **D-02:** Each tab has a type indicator (green dot for active terminal, filename for editors, delta icon for git changes).
- **D-03:** One tab per file policy — clicking an already-open file focuses its existing tab instead of creating a duplicate.
- **D-04:** [+] dropdown menu offers: Terminal Zsh, Agent (claude/opencode), Git Changes. Uses existing Dropdown component (Phase 15).
- **D-05:** Tab drag-and-drop reordering (EDIT-05 requirement).

### CodeMirror 6 Editor
- **D-06:** Extensions: line numbers, active line highlight, bracket matching + auto-close, search (Cmd+F), minimap, code folding.
- **D-07:** Custom CM6 theme built from tokens.ts (colors.bgBase, colors.textPrimary, colors.accent, etc.) — matches Solarized Dark.
- **D-08:** Language support: TS/JS/TSX/JSX, Rust, CSS, HTML, JSON, TOML, YAML, Markdown, Shell. Each via @codemirror/lang-* packages.

### Unsaved Changes
- **D-09:** Unsaved indicator dot in tab title when file buffer differs from disk (EDIT-02).
- **D-10:** Cmd+S saves active editor tab to disk via file-service.ts writeFile (EDIT-03).
- **D-11:** Confirmation modal when closing tab with unsaved changes (EDIT-04).

### Git Changes Panel
- **D-12:** Accordion layout — collapsible file entries with inline diff expansion. Reuses diff rendering logic from diff-viewer.tsx.
- **D-13:** File headers show status badge [M]/[A]/[D], filename, and +/- line counts.
- **D-14:** Auto-refresh on git-status-changed Tauri event (existing event pattern).

### File Opening Flow
- **D-15:** Single-click in file tree opens file in editor tab (replaces read-only overlay).
- **D-16:** Remove existing read-only file viewer overlay from main-panel.tsx. All file viewing goes through editor tabs.
- **D-17:** Editor tabs are editable by default. Binary/large files can be shown as read-only fallback.

### Claude's Discretion
- Exact unsaved confirmation modal design and wording
- Tab overflow behavior when many tabs are open (scroll, compress, or dropdown)
- CodeMirror minimap positioning and sizing
- Tab drag feedback visuals (ghost element, insertion marker)
- Internal signal/state management architecture for unified tab system
- Whether to use native HTML drag-drop or a lightweight library for tab reordering

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Components (to modify/replace)
- `src/components/main-panel.tsx` — Current main panel with read-only file viewer overlay (to be removed) and TerminalTabBar
- `src/components/terminal-tabs.tsx` — Current terminal-only tab system with create/close/cycle/persist/restore. Tab bar pattern to be generalized.
- `src/components/tab-bar.tsx` — Generic reusable TabBar component (pill-style pattern)
- `src/components/diff-viewer.tsx` — GitHub-style diff rendering logic to reuse in Git Changes accordion
- `src/components/dropdown-menu.tsx` — Dropdown component with keyboard navigation (Phase 15)

### Services
- `src/services/file-service.ts` — writeFile, deleteFile, renameFile, createFile IPC wrappers
- `src/services/git-service.ts` — stageFile, unstageFile, commit, push IPC wrappers

### Design Tokens
- `src/tokens.ts` — Colors, fonts, spacing for custom CM6 theme and consistent styling

### Requirements (from REQUIREMENTS.md)
- EDIT-01: Open files in tabs with CodeMirror 6 syntax highlighting
- EDIT-02: Unsaved indicator dot in tab title
- EDIT-03: Save with Cmd+S
- EDIT-04: Confirmation modal on close with unsaved changes
- EDIT-05: Reorder tabs via drag and drop
- MAIN-01: Add new tabs via dropdown (Terminal Zsh, Agent, Git changes)
- MAIN-02: Git changes panel with accordion per-file diffs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TerminalTabBar` in terminal-tabs.tsx — pill-style tab pattern, close buttons, active indicators. Generalize for mixed tab types.
- `renderDiffHtml()` in diff-viewer.tsx — GitHub-style diff rendering with line numbers, hunk headers, colored +/- lines. Reuse for accordion diffs.
- `Dropdown` component — keyboard-navigated dropdown menu, ready for [+] tab menu.
- `file-service.ts` — writeFile() for Cmd+S save, readFile via invoke('read_file_content').
- `toast.tsx` — Toast notifications for save success/error feedback.
- `tokens.ts` — Full color/font/spacing system for building CM6 theme.

### Established Patterns
- Signals for component state (signal from @preact/signals)
- `invoke()` from @tauri-apps/api/core for IPC
- `listen()` from @tauri-apps/api/event for backend events (git-status-changed)
- Custom events on document for cross-component communication (show-file-viewer, open-diff)
- Tab persistence to state.json via updateSession()

### Integration Points
- File tree click handler: currently dispatches show-file-viewer event — change to open editor tab
- git-status-changed event: wire to Git Changes tab auto-refresh
- State persistence: extend tab serialization to include editor tab file paths + scroll positions
- Keyboard handler: add Cmd+S intercept for active editor tab save

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-main-panel-file-tabs*
*Context gathered: 2026-04-15*
