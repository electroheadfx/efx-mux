# Phase 3: Terminal Theming - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 03-terminal-theming
**Mode:** auto (all decisions auto-resolved with recommended defaults)
**Areas discussed:** Theme file schema, iTerm2 import mechanism, Hot-reload pipeline, Dark/light mode strategy

---

## Theme file schema

| Option | Description | Selected |
|--------|-------------|----------|
| Flat token map (chrome + terminal sections) | Clean separation, maps directly to CSS vars and xterm.js theme | ✓ |
| Nested hierarchical config | More structure but harder to edit by hand | |
| Single flat list of all tokens | Simple but mixes UI and terminal concerns | |

**User's choice:** [auto] Flat token map with `chrome` and `terminal` sections
**Notes:** Matches existing CSS custom property pattern from Phase 1. Terminal section maps 1:1 to xterm.js `ITheme` interface.

---

## iTerm2 import mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri command (headless) | Rust reads iTerm2 JSON, converts, writes theme.json | ✓ |
| JS-side import with file picker | Frontend handles conversion, more UI but scope creep | |
| CLI tool separate from app | External utility, unnecessary complexity | |

**User's choice:** [auto] Tauri command -- headless, no UI in this phase
**Notes:** iTerm2 stores colors as RGB float components. Importer converts to hex strings. Creates .bak backup before overwrite.

---

## Hot-reload pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Rust notify crate -> Tauri event -> JS applies | Leverages existing Tauri event system, clean separation | ✓ |
| JS polling (setInterval reads file) | Simple but wasteful, requires Tauri FS plugin | |
| Manual reload button | Defeats the purpose of hot-reload | |

**User's choice:** [auto] Rust `notify` crate file watcher emitting Tauri events
**Notes:** 200ms debounce on file changes. Invalid JSON keeps current theme (no crash). `notify` crate already in CLAUDE.md version matrix at 8.2.0.

---

## Dark/light mode strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Chrome-only toggle + terminal stays user palette | Clean separation -- terminal is sacred | ✓ |
| Full theme swap (chrome + terminal) | More dramatic but overrides user's terminal colors | |
| Two separate theme.json files (dark.json, light.json) | Flexible but doubles config maintenance | |

**User's choice:** [auto] Chrome-only toggle via `data-theme` attribute; terminal colors always from theme.json
**Notes:** Light chrome uses Solarized Light complement colors. Preference persisted to localStorage (Phase 4 migrates to state.json).

---

## Claude's Discretion

- notify watcher configuration details
- Theme validation strictness
- Starter theme file shipping
- Config directory creation timing

## Deferred Ideas

- Ghostty importer (v2 ETHM-01)
- Per-project theme override (v2 ETHM-02)
- Import UI (menu/drag-drop) -- future phase
