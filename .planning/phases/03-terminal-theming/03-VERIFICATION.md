---
phase: 03-terminal-theming
verified: 2026-04-07T13:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/7
  gaps_closed:
    - "src/main.js now imports initTheme, registerTerminal, toggleThemeMode and calls them correctly"
    - "registerTerminal(terminal, fitAddon) called after createTerminal in main.js"
    - "fitAddon.fit() is now reachable via registered terminal registry"
    - "src/styles/theme.css has :root[data-theme='light'] Solarized Light block restored"
    - "terminal-manager.js createTerminal accepts options={theme,font,fontSize} with Solarized Dark fallbacks"
    - "THEME-04: initOsThemeListener() wired in initTheme(), Ctrl+Shift+T keyboard shortcut in main.js"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Verify dark/light mode toggle works after Plan 04 gap closure"
    expected: "Press Ctrl+Shift+T while app is running — app chrome switches between Solarized Dark and Solarized Light. Change macOS Appearance to Light — app follows within ~1 second. Reload page — last preference restored."
    why_human: "CSS specificity fix (setThemeMode clearing inline vars) and xterm key passthrough can only be confirmed by observing visual output and keyboard behavior at runtime. The commits (195ec6e, 11f70d9) were applied and UAT was conducted during Plan 04 execution, but this re-verification cannot confirm the fix held without a fresh runtime check."
---

# Phase 3: Terminal Theming Verification Report

**Phase Goal:** User can fully customize terminal appearance via a theme.json file, import their existing iTerm2 theme, and see changes applied instantly without restarting
**Verified:** 2026-04-07T13:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plans 03-02 re-fixes + Plan 03-04 gap closure)

---

## Re-verification Summary

Previous verification (2026-04-07) found 5 gaps — all concentrated in 3 JS/CSS files overwritten by post-Phase-3 quick-fix commits. All 5 gaps are now closed:

| Previous Gap | Resolution | Evidence |
|---|---|---|
| `initTheme()` not called in main.js | Plan 04 gap closure | main.js line 15 imports it; line 103 calls `await initTheme()` |
| `registerTerminal` never called | Fixed with initTheme wiring | main.js line 124: `registerTerminal(terminal, fitAddon)` |
| `fitAddon.fit()` dead code | Follows from registerTerminal fix | applyTheme() iterates registered terminals, calls fitAddon.fit() |
| `:root[data-theme="light"]` missing | Restored | theme.css lines 29-36 confirmed |
| `terminal-manager.js` hardcoded theme | Restored | createTerminal(container, options={}) confirmed, options.theme/fontSize/font consumed |

Additionally, the UAT gap (THEME-04: no toggle wired) was closed by Plan 04, which added `initOsThemeListener()` (matchMedia) and `Ctrl+Shift+T` keyboard shortcut.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | User edits theme.json and all xterm.js terminals apply colors/font on load (THEME-01) | VERIFIED | main.js calls `await initTheme()` → `invoke('load_theme')` → `applyTheme(theme)` → CSS props set + terminal.options.theme applied. loadedTheme?.terminal passed to createTerminal. |
| 2 | User drops iTerm2 .json export and it is converted to theme.json format (THEME-02) | VERIFIED | iterm2.rs: all 20 ITERM2_TO_TERMINAL keys mapped, float RGB → hex via iterm2_color_to_hex(), theme.json.bak backup, writes to theme_path(). Registered in invoke_handler. |
| 3 | User saves theme.json while app is running and terminals hot-reload within 1s (THEME-03) | VERIFIED | watcher.rs: NonRecursive on config_dir(), 200ms debounce, path-filtered for theme.json, emits "theme-changed" with serde_json::Value. JS: listen('theme-changed') in initTheme() → applyTheme() → iterates terminals array (now populated via registerTerminal). |
| 4 | User can toggle dark/light chrome; preference persists (THEME-04) | VERIFIED (code) | setThemeMode() clears inline CSS vars for light mode (specificity fix). toggleThemeMode() wired to Ctrl+Shift+T in main.js. initOsThemeListener() uses matchMedia('prefers-color-scheme: dark'). :root[data-theme="light"] CSS block present. localStorage persistence confirmed. |
| 5 | Rust compiles with theme module, notify crate, and all Tauri commands registered | VERIFIED | lib.rs: mod theme; load_theme + import_iterm2_theme in invoke_handler; ensure_config_dir + start_theme_watcher in setup(). |
| 6 | Config directory ~/.config/efxmux/ created on startup; theme.json written on first launch | VERIFIED | types.rs: ensure_config_dir() via create_dir_all, load_or_create_theme() writes defaults on missing file. Called from setup() before watcher. |
| 7 | File watcher emits theme-changed Tauri event; invalid JSON handled gracefully | VERIFIED | watcher.rs: emits handle.emit("theme-changed", theme_value) on valid JSON. Invalid JSON path: eprintln! warning, no emit. Debounce at 200ms. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `src-tauri/src/theme/mod.rs` | VERIFIED | Declares `pub mod iterm2; pub mod types; pub mod watcher;` |
| `src-tauri/src/theme/types.rs` | VERIFIED | ThemeConfig, ChromeTheme, TerminalTheme with Solarized Dark defaults (#282d3a bg, #258ad1 accent, full 16-color ANSI palette). load_theme Tauri command. .config/efxmux path helpers. |
| `src-tauri/src/theme/watcher.rs` | VERIFIED | start_theme_watcher, new_debouncer(200ms), "theme-changed" emit, NonRecursive on config_dir(), eprintln on invalid JSON. |
| `src-tauri/src/theme/iterm2.rs` | VERIFIED | import_iterm2_theme command, iterm2_color_to_hex, ITERM2_TO_TERMINAL with all 20 keys (Ansi 0-15 + fg/bg/cursor/selection), json.bak backup, types::ThemeConfig import. |
| `src-tauri/src/lib.rs` | VERIFIED | mod theme; load_theme + import_iterm2_theme registered; ensure_config_dir + start_theme_watcher in setup(). Menu correctly shows "Efxmux" (no longer "GSD MUX"). |
| `src/theme/theme-manager.js` | VERIFIED | All exports present: applyTheme (caches currentTheme, sets CSS props, iterates terminals), initTheme (invoke + listen + initOsThemeListener), registerTerminal/unregisterTerminal, toggleThemeMode, setThemeMode (with inline var clearing for light mode), getTerminalTheme, initOsThemeListener (matchMedia). listen('theme-changed') and invoke('load_theme') wired. >160 lines, substantive. |
| `src/styles/theme.css` | VERIFIED | :root Solarized Dark values present. :root[data-theme="light"] block with all 6 Solarized Light vars (#fdf6e3, #eee8d5, #d3cfc2, #657b83, #586e75, #268bd2). No forest-green colors. Comment updated to "Solarized Dark palette (D-14, D-15) with light mode variant". |
| `src/terminal/terminal-manager.js` | VERIFIED | createTerminal(container, options={}) signature. options.theme, options.fontSize, options.font consumed with Solarized Dark fallbacks. Ctrl+Shift+T and Ctrl+B passthrough in attachCustomKeyEventHandler. |
| `src/main.js` | VERIFIED | Imports initTheme, registerTerminal, toggleThemeMode from theme-manager. Calls await initTheme() before createTerminal. Passes loadedTheme?.terminal, loadedTheme?.chrome?.font, loadedTheme?.chrome?.fontSize to createTerminal. Calls registerTerminal(terminal, fitAddon). Ctrl+Shift+T wired to toggleThemeMode(). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| src-tauri/src/theme/watcher.rs | Tauri event system | handle.emit("theme-changed", theme_value) | WIRED | watcher.rs line 44 confirmed |
| src-tauri/src/lib.rs | src-tauri/src/theme/watcher.rs | start_theme_watcher in setup() | WIRED | lib.rs line 52 confirmed |
| src/theme/theme-manager.js | Tauri event system | listen('theme-changed', (event) => applyTheme(event.payload)) | WIRED | theme-manager.js line 154, called from initTheme() which is called in main.js |
| src/theme/theme-manager.js | src/terminal/terminal-manager.js | terminal registry for hot-reload | WIRED | registerTerminal called from main.js line 124; applyTheme iterates terminals array |
| src/main.js | src/theme/theme-manager.js | import initTheme, registerTerminal, toggleThemeMode | WIRED | main.js line 15 import confirmed; initTheme called line 103, registerTerminal line 124, toggleThemeMode line 92 |
| src/theme/theme-manager.js | window.matchMedia | initOsThemeListener() via prefers-color-scheme | WIRED | theme-manager.js line 126; called at end of initTheme() |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| src/main.js terminal | loadedTheme | invoke('load_theme') → Rust load_or_create_theme() → reads/writes ~/.config/efxmux/theme.json | Yes — reads actual file, writes Solarized Dark defaults on first launch | FLOWING |
| src/theme/theme-manager.js | currentTheme (hot-reload) | listen('theme-changed') → Rust watcher reads theme.json on modification | Yes — real file read triggered by actual file system changes | FLOWING |
| src/styles/theme.css | :root[data-theme="light"] vars | CSS selector active when data-theme="light" attribute set | Yes — CSS selector, always active when mode matches | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Status |
|---|---|---|
| load_theme Rust command registered | grep "load_theme" src-tauri/src/lib.rs | PASS — line 68 |
| import_iterm2_theme registered | grep "import_iterm2_theme" src-tauri/src/lib.rs | PASS — line 69 |
| theme-changed emitted in watcher | grep "theme-changed" src-tauri/src/theme/watcher.rs | PASS — line 44 |
| initTheme called in main.js | grep "initTheme" src/main.js | PASS — line 15 (import), line 103 (call) |
| registerTerminal called in main.js | grep "registerTerminal" src/main.js | PASS — line 15 (import), line 124 (call) |
| Light mode CSS exists in theme.css | grep "data-theme" src/styles/theme.css | PASS — line 29 |
| terminal-manager.js accepts options | grep "options.theme" src/terminal/terminal-manager.js | PASS — line 23 |
| prefers-color-scheme listener | grep "prefers-color-scheme" src/theme/theme-manager.js | PASS — line 126 |
| Ctrl+Shift+T wired | grep "Shift+T\|shiftKey.*key.*T" src/main.js | PASS — line 90-93 |
| No forest-green colors | grep "#1e2d25\|#26a641" src/ | PASS — not found |
| CSS specificity fix (inline var clearing) | setThemeMode removes CHROME_PROPS in light mode | PASS — theme-manager.js lines 94-97 |

---

### Requirements Coverage

| Requirement | Plans | REQUIREMENTS.md Description | Status | Evidence |
|---|---|---|---|---|
| THEME-01 | 03-01, 03-02 | User defines terminal colors/font in ~/.config/efxmux/theme.json; all xterm.js instances apply on load | SATISFIED | Full pipeline: Rust load_theme → JS initTheme → applyTheme → CSS props + terminal.options.theme. createTerminal receives theme/font/fontSize from loaded theme. |
| THEME-02 | 03-03 | User imports iTerm2 .json export; auto-converted to theme.json | SATISFIED | import_iterm2_theme command: all 20 color keys, float-RGB to hex, backup, writes theme.json that watcher picks up. No UI (intentional per D-08; Phase 8 will add file picker). |
| THEME-03 | 03-01, 03-02 | Hot-reload: saving theme.json updates all terminals without restart | SATISFIED | Watcher emits theme-changed. JS listener applies to all registered terminals (registerTerminal now called). |
| THEME-04 | 03-02, 03-04 | Dark/light chrome toggle persists | SATISFIED (code) / NEEDS HUMAN (runtime) | toggleThemeMode() → setThemeMode(). OS auto-follow via matchMedia. Ctrl+Shift+T keyboard shortcut. localStorage persistence. CSS specificity fix applied (inline vars cleared for light mode). Runtime behavior needs human confirmation. |

**Note:** REQUIREMENTS.md THEME-01 references `~/.config/gsd-mux/theme.json` (old branding). Implementation correctly uses `~/.config/efxmux/` per D-01 and project memory. This is a stale requirement wording issue, not an implementation gap. REQUIREMENTS.md should be updated to reflect "efxmux" branding.

**Note on THEME-04 persistence:** REQUIREMENTS.md says "persists in state.json". Plan 03-02 implemented persistence via localStorage as an explicit Phase 3 interim measure (documented in SUMMARY and plan). Phase 4 Session Persistence will migrate to state.json. This is not a gap.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| src-tauri/src/theme/types.rs | 195 | `unwrap_or_default()` on HOME env var — returns empty string if HOME unset | Warning | Silent relative path `.config/efxmux` if HOME is unset. macOS always sets HOME so risk is very low. Flagged for awareness. |
| .planning/REQUIREMENTS.md | 29 | THEME-01 references `~/.config/gsd-mux/` (old branding) | Info | Stale wording only; implementation uses correct `~/.config/efxmux/`. Should be updated in a doc cleanup pass. |

---

### Human Verification Required

### 1. Dark/Light Mode Toggle Runtime Behavior

**Test:** Launch the app (`cargo tauri dev`). Press Ctrl+Shift+T. Observe that the app chrome (sidebar, panel backgrounds, borders) switches from Solarized Dark (#282d3a) to Solarized Light (#fdf6e3). Press Ctrl+Shift+T again — should switch back. Reload the page — the last mode should be restored. Then change macOS Appearance from Dark to Light in System Settings > Appearance — the app chrome should follow within ~1 second without a page reload.

**Expected:** Chrome colors change visually. Terminal colors remain from theme.json (unchanged). Preference survives reload. OS theme changes propagate mid-session.

**Why human:** The Plan 04 gap closure applied two non-trivial fixes: (1) CSS specificity fix — setThemeMode() removes inline CSS vars when switching to light mode so the :root[data-theme="light"] CSS selector wins over inline styles set by applyTheme(); (2) xterm.js key passthrough — Ctrl+Shift+T must be exempted from xterm capture. Both fixes are present in code but their correctness depends on CSS cascade behavior and xterm key event ordering that cannot be confirmed by static analysis. The UAT run during Plan 04 confirmed them, but this re-verification is a static check only.

---

## Gaps Summary

No blocking code gaps remain. All 5 previously identified gaps are closed.

The one human_needed item (dark/light toggle runtime behavior) is not a suspected failure — the code is correct and was verified by the developer during Plan 04 UAT. This verification requires human confirmation because static analysis cannot observe CSS cascade and keyboard event ordering at runtime.

---

_Verified: 2026-04-07T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
