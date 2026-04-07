---
phase: 03-terminal-theming
verified: 2026-04-07T00:00:00Z
status: gaps_found
score: 3/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "On startup, JS loads theme from Rust backend and applies to CSS custom properties and xterm.js"
    status: failed
    reason: "Working tree src/main.js does NOT import initTheme or call it. The import line and await initTheme() block are absent — removed by post-Phase-3 quick-fix commits (62c653c). Git HEAD has the wiring but the working tree diverges."
    artifacts:
      - path: "src/main.js"
        issue: "Missing: import { initTheme, registerTerminal } from './theme/theme-manager.js' and loadedTheme = await initTheme() before createTerminal"
    missing:
      - "Re-add import { initTheme, registerTerminal } from './theme/theme-manager.js' to src/main.js"
      - "Re-add const loadedTheme = await initTheme() as first line inside requestAnimationFrame async block"
      - "Pass loadedTheme?.terminal, loadedTheme?.chrome?.font, loadedTheme?.chrome?.fontSize to createTerminal"
      - "Re-add registerTerminal(terminal, fitAddon) after createTerminal call"

  - truth: "When theme-changed Tauri event fires, all CSS custom properties update and all xterm.js terminals re-theme"
    status: failed
    reason: "registerTerminal is never called from working-tree main.js — the terminal registry is empty. Even though theme-manager.js has a correct listen('theme-changed') handler, no terminal is registered so applyTheme() iterates over an empty array. Hot-reload is structurally inert."
    artifacts:
      - path: "src/main.js"
        issue: "registerTerminal(terminal, fitAddon) call is absent from bootstrap sequence"
    missing:
      - "registerTerminal(terminal, fitAddon) must be called after createTerminal in main.js"

  - truth: "After font size change in theme.json, terminals call fitAddon.fit() to reflow"
    status: failed
    reason: "Depends on registerTerminal being called (see above). No terminals are registered in working tree, so fitAddon.fit() is never called by applyTheme. Root cause is the same as the previous gap."
    artifacts:
      - path: "src/main.js"
        issue: "Terminal never registered; fitAddon.fit() in applyTheme is dead code"
    missing:
      - "Fix registerTerminal wiring (same fix as above resolves this gap)"

  - truth: "User can toggle dark/light chrome mode and the preference persists in localStorage"
    status: failed
    reason: "Light mode CSS block (:root[data-theme=light]) is absent from working-tree src/styles/theme.css — removed by the same post-Phase-3 quick-fix. The toggleThemeMode() function exists in theme-manager.js and is correct, but the CSS variables it depends on are not defined."
    artifacts:
      - path: "src/styles/theme.css"
        issue: "Missing :root[data-theme=\"light\"] block with Solarized Light variables (--bg:#fdf6e3, --bg-raised:#eee8d5, --border:#d3cfc2, --text:#657b83, --text-bright:#586e75, --accent:#268bd2)"
    missing:
      - "Re-add :root[data-theme=\"light\"] CSS block to src/styles/theme.css with Solarized Light values from D-16"
      - "Update file comment from 'Forest-green dark palette' to 'Solarized Dark palette' (stale comment)"

  - truth: "terminal-manager.js accepts theme parameter instead of hardcoding colors"
    status: failed
    reason: "Working-tree terminal-manager.js has createTerminal(container) with hardcoded theme, fontSize 14, and fontFamily. The options parameter (theme, font, fontSize) was added in commit f07dfac but reverted in the working tree by 62c653c quick-fix."
    artifacts:
      - path: "src/terminal/terminal-manager.js"
        issue: "createTerminal signature reverted to single-argument form. No options.theme, options.fontSize, or options.font handling. Hardcoded: theme: { background: '#282d3a', ... }, fontSize: 14."
    missing:
      - "Restore createTerminal(container, options = {}) signature"
      - "Restore options.theme, options.fontSize, options.font consumption with Solarized Dark fallbacks"
---

# Phase 3: Terminal Theming Verification Report

**Phase Goal:** User can fully customize terminal appearance via a theme.json file, import their existing iTerm2 theme, and see changes applied instantly without restarting
**Verified:** 2026-04-07
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Root Cause Finding

**Critical context:** The working tree diverges from git HEAD across 7 JS/CSS files. The quick-fix commits `62c653c` (terminal UX polish) and `2c859bd` (Phase 2 issue fixes), which were tagged as Phase 2 fixes, partially overwrote Phase 3 work in `src/main.js`, `src/styles/theme.css`, and `src/terminal/terminal-manager.js`. The Rust backend (all of `src-tauri/src/theme/`) is fully committed and unmodified.

**Evidence:** `git show HEAD:src/main.js` contains `initTheme`, `registerTerminal`, and `loadedTheme`. The working tree file does not. `git diff` confirms the working tree removed the theme import, the initTheme call, and all loadedTheme usage — reverting to the pre-Phase-3 bootstrap.

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User edits theme.json and all xterm.js terminals apply colors/font on load (THEME-01) | FAILED | initTheme() never called in working-tree main.js; load_theme Rust command exists but is never invoked on startup |
| 2 | User drops iTerm2 .json export and it is converted to theme.json format (THEME-02) | VERIFIED | iterm2.rs exists, compiles, all 20 color keys mapped, backup logic present, registered in lib.rs invoke_handler |
| 3 | User saves theme.json while app is running and terminals hot-reload within 1s (THEME-03) | FAILED | File watcher emits theme-changed correctly (Rust side OK), but JS listener never fires usefully because no terminal is registered via registerTerminal (working tree); hot-reload events land in an empty terminal registry |
| 4 | User can toggle dark/light chrome; preference persists (THEME-04) | FAILED | toggleThemeMode() exists in theme-manager.js and is correct, but :root[data-theme="light"] CSS block was removed from working-tree theme.css — toggling the attribute changes nothing |
| 5 | Rust compiles with theme module, notify crate, and all Tauri commands registered | VERIFIED | lib.rs confirmed: mod theme, load_theme + import_iterm2_theme in invoke_handler, ensure_config_dir + start_theme_watcher in setup |
| 6 | Config directory ~/.config/efxmux/ is created on startup; theme.json written on first launch | VERIFIED | load_or_create_theme() in types.rs: create_dir_all + serde_json write on first launch. Called from load_theme command and ensure_config_dir in setup hook |
| 7 | File watcher emits theme-changed Tauri event when theme.json is modified | VERIFIED | watcher.rs: NonRecursive on config_dir(), 200ms debounce, path filtering for theme.json, emits theme-changed with serde_json::Value payload. Invalid JSON logs warning, does not emit |

**Score:** 3/7 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src-tauri/src/theme/mod.rs` | VERIFIED | Declares pub mod types, watcher, iterm2 |
| `src-tauri/src/theme/types.rs` | VERIFIED | ThemeConfig, ChromeTheme, TerminalTheme with Solarized Dark defaults, #282d3a bg, #258ad1 accent, load_theme command, .config/efxmux path |
| `src-tauri/src/theme/watcher.rs` | VERIFIED | start_theme_watcher, new_debouncer, Duration::from_millis(200), "theme-changed", NonRecursive, eprintln on invalid JSON |
| `src-tauri/src/theme/iterm2.rs` | VERIFIED | import_iterm2_theme command, iterm2_color_to_hex, ITERM2_TO_TERMINAL constant with all 20 keys including "Ansi 15 Color", json.bak backup, types::ThemeConfig usage |
| `src-tauri/src/lib.rs` | VERIFIED | mod theme, load_theme + import_iterm2_theme registered, ensure_config_dir + start_theme_watcher in setup |
| `src/theme/theme-manager.js` | VERIFIED (file) / ORPHANED (runtime) | File is substantive (>60 lines, all exports present: applyTheme, initTheme, registerTerminal, unregisterTerminal, toggleThemeMode, getTerminalTheme, listen('theme-changed'), invoke('load_theme'), efxmux:theme-mode, data-theme). However, never imported by any active caller in working-tree main.js |
| `src/styles/theme.css` | STUB | Missing :root[data-theme="light"] block. File has Solarized Dark :root values (correct) but no light mode variant. Comment still says "Forest-green dark palette". |
| `src/terminal/terminal-manager.js` | STUB | createTerminal(container) with hardcoded theme — options parameter reverted. No options.theme, options.fontSize, options.font |
| `src/main.js` | FAILED | No import of initTheme/registerTerminal. No loadedTheme = await initTheme(). No registerTerminal call. Theme pipeline never started. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src-tauri/src/theme/watcher.rs | Tauri event system | app_handle.emit("theme-changed", ...) | WIRED | Pattern confirmed in watcher.rs line 44 |
| src-tauri/src/lib.rs | src-tauri/src/theme/watcher.rs | start_theme_watcher in setup() | WIRED | lib.rs line 52 confirmed |
| src/theme/theme-manager.js | Tauri event system | listen('theme-changed', ...) | EXISTS but NOT WIRED at runtime | listen call present in initTheme() but initTheme() is never called from working-tree main.js |
| src/theme/theme-manager.js | src/terminal/terminal-manager.js | terminal registry for hot-reload | NOT WIRED | registerTerminal never called; terminals array is always empty at runtime |
| src/main.js | src/theme/theme-manager.js | import and call initTheme() | NOT WIRED | import statement absent from working-tree main.js |

---

### Requirements Coverage

| Requirement ID | Plans | REQUIREMENTS.md Description | Status | Evidence |
|----------------|-------|---------------------------|--------|----------|
| THEME-01 | 03-01, 03-02 | User defines terminal colors/font in ~/.config/efxmux/theme.json; all xterm.js instances apply on load | BLOCKED | Rust load_theme exists and is correct. JS initTheme() not called on startup in working tree. |
| THEME-02 | 03-03 | User imports iTerm2 .json export; auto-converted to theme.json | SATISFIED | import_iterm2_theme command fully implemented and registered |
| THEME-03 | 03-01, 03-02 | Hot-reload: saving theme.json updates all terminals without restart | BLOCKED | Watcher emits event correctly. JS applyTheme operates on empty terminal registry (no registerTerminal call). |
| THEME-04 | 03-02 | Dark/light chrome toggle persists in state.json (note: plan implemented with localStorage as Phase 3 interim) | BLOCKED | toggleThemeMode() function correct. :root[data-theme="light"] CSS block removed from working tree. |

**Note on REQUIREMENTS.md discrepancy:** REQUIREMENTS.md THEME-01 references `~/.config/gsd-mux/theme.json` (old branding). Implementation correctly uses `~/.config/efxmux/` per D-01 and project memory. This is a stale requirements wording issue, not an implementation gap.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/styles/theme.css | 1 | Comment says "Forest-green dark palette" | Warning | Stale comment contradicts actual Solarized Dark implementation |
| src/terminal/terminal-manager.js | 22-27 | Hardcoded theme object (no options.theme) | Blocker | Theme from theme.json never applied on first terminal creation |
| src/main.js | 95-123 | requestAnimationFrame block has no initTheme | Blocker | Entire JS-side theme pipeline (THEME-01, THEME-03, THEME-04) is inert |
| src-tauri/src/lib.rs | 15 | SubmenuBuilder::new(app, "GSD MUX") | Info | Wrong branding; should be "Efxmux" per IN-03 in code review |
| src-tauri/src/theme/types.rs | 195 | unwrap_or_default() on HOME env var | Warning | Silent relative path if HOME is unset; WR-02 from code review |

---

### Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| load_theme Rust command exists | grep "load_theme" src-tauri/src/lib.rs | PASS |
| import_iterm2_theme registered | grep "import_iterm2_theme" src-tauri/src/lib.rs | PASS |
| theme-changed emitted in watcher | grep "theme-changed" src-tauri/src/theme/watcher.rs | PASS |
| initTheme called in main.js | grep "initTheme" src/main.js (working tree) | FAIL — not found |
| Light mode CSS exists in theme.css | grep "data-theme" src/styles/theme.css (working tree) | FAIL — not found |
| terminal-manager.js accepts options | grep "options.theme" src/terminal/terminal-manager.js | FAIL — not found |

---

### Human Verification Required

None required for this verification. All gaps are code-verifiable and confirmed by git diff.

---

## Gaps Summary

**5 gaps blocking goal achievement.** All 5 are concentrated in 3 working-tree JS/CSS files (`src/main.js`, `src/styles/theme.css`, `src/terminal/terminal-manager.js`) that were partially overwritten by post-Phase-3 quick-fix commits targeting Phase 2 UX issues.

**Root cause:** The Phase 2 UX quick-fix (`62c653c`, `2c859bd`) was executed in a worktree or branch that had Phase 3 commits, and the fix was applied on top of a pre-Phase-3 version of those files. The result is that the terminal-manager.js lost its `options` parameter, main.js lost its `initTheme` wiring, and theme.css lost its light mode block.

**Rust backend is fully intact.** All Rust theme code (`src-tauri/src/theme/`) compiles correctly with all commands registered. The entire gap is in the JS/CSS layer.

**Minimal fix:** The three files need to be restored to their committed state (git checkout from the Phase 3 commits) while preserving the Phase 2 UX polish additions (cursor bar style, overviewRuler, key navigation handlers, scrollbar styling, padding). These are additive changes that can coexist with the theme wiring.

---

_Verified: 2026-04-07_
_Verifier: Claude (gsd-verifier)_
