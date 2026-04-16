---
status: complete
---

# Quick Task 260416-hce: Add "Add Project" to OS menu with Cmd+N shortcut

## What was done

1. **Rust (src-tauri/src/lib.rs):** Added a "File" submenu to the macOS menu bar (between Efxmux and Edit menus) with an "Add Project" item bound to `CmdOrCtrl+N`. Refactored `on_menu_event` from if-statement to match block, added arm emitting `add-project-requested` event.

2. **Frontend (src/main.tsx):** Wired `listen('add-project-requested', ...)` handler that calls `openProjectModal()` with no arguments (add mode), matching the existing + button behavior.

## Commits

- `e9ec9dd` feat(quick-260416-hce): add File menu with Add Project item and Cmd+N accelerator
- `6de8f7b` feat(quick-260416-hce): wire frontend listener for add-project-requested event

## Verification

- `cargo build` passes
- `tsc --noEmit` passes
