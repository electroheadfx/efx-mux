# Phase 18: File Tree Enhancements - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 18-file-tree-enhancements
**Areas discussed:** Delete UX & safety, External editor integration, Drag & drop mechanics, Create-new-file UX

---

## Delete UX & safety

### Delete-key activation

| Option | Description | Selected |
|--------|-------------|----------|
| Only when tree has focus (Recommended) | Handler on tree scroll container (tabIndex=0). Safest. | ✓ |
| Global with active-selection check | Document-level keydown, skip if input/textarea focused. | |
| Cmd+Backspace (macOS convention) | Finder-style shortcut, tree focus still required. | |

**User's choice:** Only when tree has focus

### Folder deletion safety

| Option | Description | Selected |
|--------|-------------|----------|
| Same confirm, count children in message (Recommended) | `ConfirmModal` shows `Delete 'src/components' (12 items)?` | ✓ |
| Two-step: require typing folder name | For folders with many items, type-to-confirm. | |
| Move to macOS Trash instead of hard delete | Recoverable, adds Rust trash crate. | |

**User's choice:** Same confirm, count children in message

### Destructive button label

| Option | Description | Selected |
|--------|-------------|----------|
| "Delete" in red (Recommended) | Reuses `confirmLabel` + `colors.diffRed`. Matches Phase 17 "Discard" styling. | ✓ |
| "Move to Trash" if trash chosen, else "Delete" | Label reflects actual action. | |
| "Delete permanently" (explicit) | Longer, unambiguous. | |

**User's choice:** "Delete" in red

### Multi-select delete

| Option | Description | Selected |
|--------|-------------|----------|
| Single-item only for this phase (Recommended) | Tree has single `selectedIndex`; multi-select is a broader refactor. | ✓ |
| Add multi-select now (Shift/Cmd-click) | Extend selection model + batch delete. Scope creep. | |

**User's choice:** Single-item only for this phase

---

## External editor integration

### Editor list

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect + show only installed (Recommended) | Probe `which zed/code/subl/cursor/idea` at app start. Fallback: Reveal in Finder + open with default. | ✓ |
| Hard-coded Zed + VSCode only | Just two items. Breaks silently if uninstalled. | |
| User-configured list in preferences | `external_editors: [...]` in state.json. Full control, more UI. | |

**User's choice:** Auto-detect + show only installed

### Menu structure

| Option | Description | Selected |
|--------|-------------|----------|
| Submenu "Open In ▸ Zed / VSCode / ..." (Recommended) | Nested menu under one parent item. Requires extending `ContextMenu`. | ✓ |
| Flat: "Open in Zed", "Open in VSCode" | Each editor as its own top-level item. Menu grows with editor count. | |
| Single "Open externally" → picker modal | One menu item opens a picker dialog. Extra click. | |

**User's choice:** Submenu "Open In ▸ Zed / VSCode / ..."

### Launch mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| `open -a "Zed" <path>` (Recommended) | macOS `open -a AppName path` — bundle resolution handles Zed.app, VSCode.app, etc. No shell plugin. | ✓ |
| Direct CLI: `zed <path>`, `code <path>` | Requires CLI tool on PATH. Fails silently if missing. | |
| Hybrid: CLI first, fallback to `open -a` | Most robust, most code. | |

**User's choice:** `open -a "Zed" <path>`

### Folder vs file

| Option | Description | Selected |
|--------|-------------|----------|
| Same menu — opens folder as project (Recommended) | Zed/VSCode accept directory paths as workspace. Consistent. | ✓ |
| Hide external-editor menu on folders | Only for files. Simpler, less useful. | |
| Separate item: "Open folder in ..." only for folders | Distinct wording for folders. | |

**User's choice:** Same menu — opens folder as project

**Notes:** User also wants to open the current root project in an external editor (not just tree items).

### Root-project entry point (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| File Tree header area (Recommended) | Small icon/button in tree header alongside mode toggle. Always accessible. | ✓ |
| Right-click on empty tree area | Context menu on tree background. | |
| Both — header button + empty-area context menu | Dual entry. | |
| Projects sidebar tab: context menu on active project | Project list row context menu. | |

**User's choice:** File Tree header area

---

## Drag & drop mechanics

### Intra-tree drag semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Move to target folder (Recommended) | `rename_file(from, targetFolder+'/'+name)`. Drop on file → parent folder. Empty area → project root. Mouse-event based. | ✓ |
| Move + optional copy-on-Alt | Finder-style modifier. More modes. | |
| Reorder within parent folder (persistent sort) | Save custom order in state.json. Conflicts with FS order. | |

**User's choice:** Move to target folder

### Drop-target visual

| Option | Description | Selected |
|--------|-------------|----------|
| Highlight target folder row with accent border (Recommended) | `borderLeft: 2px solid colors.accent` + bg tint. Matches unified-tab-bar. | ✓ |
| Ghost element follows cursor + row highlight | Clone dragged row as ghost, more effort. | |
| Full-row outline only, no ghost | Minimal, less polished. | |

**User's choice:** Highlight target folder row with accent border

### Finder import: copy vs move

| Option | Description | Selected |
|--------|-------------|----------|
| Copy (Recommended) | Non-destructive on Finder source. Standard editor behavior. Needs new Rust `copy_path` command. | ✓ |
| Move | Dislocates user's source files. Risky. | |
| Default copy, Cmd+drag to move | macOS convention. Most code. | |

**User's choice:** Copy

### Finder import drop target

| Option | Description | Selected |
|--------|-------------|----------|
| On any folder in tree or tree root (Recommended) | Folder → into; file → parent folder; empty area → project root. Needs `dragDropEnabled: true` + `onDragDropEvent`. | ✓ |
| Only project root | All imports to root regardless of position. | |
| Only on folders (not empty area or files) | Stricter rule, empty-area drops rejected. | |

**User's choice:** On any folder in tree or tree root

### Drag mix: intra-mouse vs Tauri native

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri native for Finder only, mouse for intra (Recommended) | If drop paths inside project root → ignore (mouse handled). Outside → Finder import. Clean separation. | ✓ |
| Tauri native for everything | Single dispatch, but WKWebView may not fire events for intra-webview drags. | |
| Skip TREE-05 for now, intra only | Defer Finder import. | |

**User's choice:** Tauri native for Finder only, mouse for intra

### Conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Error toast, abort (Recommended) | `File exists: foo.ts` → user renames and retries manually. | ✓ |
| Auto-rename with suffix (foo-1.ts) | Silent suffix on collision. May surprise user. | |
| ConfirmModal: Replace / Keep Both / Cancel | Finder-style prompt. | |

**User's choice:** Error toast, abort

### Rust move command

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `rename_file(from, to)` (Recommended) | Already exists. `std::fs::rename` handles moves within a filesystem. | ✓ |
| Add `move_path(from, to)` with cross-device fallback | Try rename, on EXDEV copy+delete. More robust. | |

**User's choice:** Reuse `rename_file`

---

## Create-new-file UX

### Input location

| Option | Description | Selected |
|--------|-------------|----------|
| Inline input row in tree (Recommended) | VSCode-style. New row appears under target folder with pre-focused input. Enter commits, Esc cancels. | ✓ |
| Modal prompt with text field | ConfirmModal-style dialog. Reuses infrastructure, less polished. | |
| Rename-after-create | Create `untitled.txt` immediately, enter inline rename. | |

**User's choice:** Inline input row in tree

### Entry points

| Option | Description | Selected |
|--------|-------------|----------|
| Context menu on folder + header button (Recommended) | Right-click folder → "New File"/"New Folder". Also `[+]` in header. Two consistent entry points. | ✓ |
| Context menu only | Only via right-click. Needs a folder to exist. | |
| Header button only | Only `[+]` in header. Hidden from action target. | |

**User's choice:** Context menu on folder + header button

### Target folder resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Context menu → clicked folder; header → selected folder or root (Recommended) | Clear rule per source. Header: selected folder if folder, parent if file, else project root. | ✓ |
| Always project root from header, folder from context menu | Simpler header, fewer conditionals. | |
| Prompt for target path in modal | User types full relative path. Worst UX. | |

**User's choice:** Context menu → clicked folder; header → selected folder or root

### Validation & conflicts

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error below input, block commit (Recommended) | Empty name, `/` or `\0`, or existing path → red error, input stays open. | ✓ |
| Toast error on submit, close input | Loses typed name on error. | |
| Auto-rename with suffix if conflict | Hides deliberate user intent. | |

**User's choice:** Inline error below input, block commit

---

## Claude's Discretion

- Lucide icon choices for context-menu items (Trash, FolderPlus, FilePlus, ExternalLink, Eye, FolderInput)
- Submenu positioning heuristics (flip-side near viewport edge)
- Header icon design for `[+]` create and "Open In" trigger
- Inline input visual styling (border, padding, validation text color)
- Drag ghost styling (shadow, opacity, width)
- Tree refresh mechanism after file ops (event vs explicit reload)
- Folder children count mechanism for D-02 confirm message

## Deferred Ideas

- Multi-select deletion (Shift/Cmd-click range selection)
- Move-to-Trash via `NSFileManager trashItemAtURL:` (Rust trash crate)
- Copy-on-Alt / Cmd-drag-to-move modifiers
- Persistent custom per-folder sort order
- Auto-rename with suffix on conflict
- Cross-device move fallback (EXDEV → copy + delete)
- Replace / Keep Both / Cancel conflict dialog
- Rename inline action (service exists, UX not designed)
- File-watcher-driven live tree refresh (Phase 21 FIX-01)
- Empty-space context menu on tree background
