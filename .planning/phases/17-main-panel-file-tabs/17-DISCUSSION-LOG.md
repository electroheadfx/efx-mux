# Phase 17: Main Panel File Tabs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 17-main-panel-file-tabs
**Areas discussed:** Tab architecture, Editor scope, Git changes panel, File opening flow

---

## Tab Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Unified tab bar | Single tab row mixing terminal + editor + git tabs. Type icon per tab. | ✓ |
| Separate rows | Terminal tabs top row, editor/content tabs second row. |  |
| You decide | Claude picks based on codebase patterns. |  |

**User's choice:** Unified tab bar
**Notes:** Matches existing TerminalTabBar pill-style pattern. Maximizes vertical space.

### Tab policy

| Option | Description | Selected |
|--------|-------------|----------|
| One tab per file | Clicking already-open file focuses existing tab. | ✓ |
| Allow duplicates | Each open action creates a new tab. |  |

**User's choice:** One tab per file

### Add tab menu

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal Zsh / Agent / Git Changes | Matches MAIN-01 requirements exactly. | ✓ |
| Terminal / Git Changes only | Skip agent option. |  |

**User's choice:** Terminal Zsh / Agent / Git Changes

---

## Editor Scope

### CM6 Extensions (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Line numbers + active line highlight | Standard editor basics. | ✓ |
| Bracket matching + auto-close | Matching brackets, auto-close on type. | ✓ |
| Search (Cmd+F) | In-file search and replace. | ✓ |
| Minimap / code folding | VS Code-style minimap and fold regions. | ✓ |

**User's choice:** All 4 features selected.

### Theme

| Option | Description | Selected |
|--------|-------------|----------|
| Custom CM6 theme from tokens.ts | Build theme using existing color tokens. | ✓ |
| @codemirror/theme-one-dark | Pre-built dark theme. |  |

**User's choice:** Custom CM6 theme from tokens.ts

### Languages

| Option | Description | Selected |
|--------|-------------|----------|
| Core web + Rust | TS/JS/TSX/JSX, Rust, CSS, HTML, JSON, TOML, YAML, Markdown, Shell. | ✓ |
| Minimal (TS/JS + Rust only) | Just two main languages. |  |
| Everything available | All @codemirror/lang-* packages. |  |

**User's choice:** Core web + Rust

---

## Git Changes Panel

### Diff layout

| Option | Description | Selected |
|--------|-------------|----------|
| Accordion list | Collapsible file entries with inline diff expansion. | ✓ |
| Side-by-side split | Two-column diff view per file. |  |

**User's choice:** Accordion list

### Refresh behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-refresh on git events | Listen to git-status-changed Tauri event. | ✓ |
| Manual refresh button | User clicks refresh. |  |

**User's choice:** Auto-refresh on git events

---

## File Opening Flow

### Click behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Single-click = editor tab | Replace overlay. Single click opens editor tab. | ✓ |
| Single-click = preview, double-click = editor tab | VS Code pattern. |  |

**User's choice:** Single-click = editor tab

### Read-only overlay

| Option | Description | Selected |
|--------|-------------|----------|
| Remove it, editor tabs replace it | No more overlay. All viewing through editor tabs. | ✓ |
| Keep as preview, editor tabs are separate | Overlay for peeks, editor for editing. |  |

**User's choice:** Remove it, editor tabs replace it

---

## Claude's Discretion

- Unsaved confirmation modal design
- Tab overflow behavior
- Minimap positioning
- Tab drag feedback visuals
- Internal state management architecture
- Drag-drop implementation approach

## Deferred Ideas

None — discussion stayed within phase scope.
