# Phase 3: Terminal Theming - Context

**Gathered:** 2026-04-07 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

User can fully customize terminal appearance via a theme.json config file, import their existing iTerm2 theme, and see changes applied instantly without restarting. App chrome supports dark/light mode toggle. This phase builds on the CSS custom property system from Phase 1 and the xterm.js terminal from Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Theme file schema
- **D-01:** Theme file lives at `~/.config/efxmux/theme.json` (not `gsd-mux` -- app is branded Efxmux per memory).
- **D-02:** Flat token map structure with two top-level sections: `chrome` (CSS custom properties for app UI) and `terminal` (xterm.js theme object). This avoids nested complexity while cleanly separating concerns.
- **D-03:** Schema example:
  ```json
  {
    "chrome": {
      "bg": "#282d3a",
      "bgRaised": "#363b3d",
      "border": "#3e454a",
      "text": "#8d999a",
      "textBright": "#92a0a0",
      "accent": "#258ad1",
      "font": "FiraCode Light",
      "fontSize": 14
    },
    "terminal": {
      "background": "#282d3a",
      "foreground": "#92a0a0",
      "cursor": "#258ad1",
      "selectionBackground": "#3e454a",
      "black": "#073642",
      "red": "#dc322f",
      "green": "#859900",
      "yellow": "#b58900",
      "blue": "#268bd2",
      "magenta": "#d33682",
      "cyan": "#2aa198",
      "white": "#eee8d5",
      "brightBlack": "#002b36",
      "brightRed": "#cb4b16",
      "brightGreen": "#586e75",
      "brightYellow": "#657b83",
      "brightBlue": "#839496",
      "brightMagenta": "#6c71c4",
      "brightCyan": "#93a1a1",
      "brightWhite": "#fdf6e3"
    }
  }
  ```
- **D-04:** Default theme uses the user's current Solarized Dark values (already in theme.css and terminal-manager.js). First launch creates theme.json from these defaults if it doesn't exist.

### iTerm2 import mechanism
- **D-05:** Tauri command `import_iterm2_theme` accepts a file path, reads the iTerm2 JSON profile export, maps ANSI color keys (Ansi 0 Color through Ansi 15 Color, Background Color, Foreground Color, Cursor Color, Selection Color) to the theme.json schema.
- **D-06:** iTerm2 colors are stored as `{"Red Component": float, "Green Component": float, "Blue Component": float}` objects. The importer converts to hex `#RRGGBB` strings.
- **D-07:** Import overwrites the existing theme.json (after creating a `.bak` backup). The hot-reload pipeline picks up the new file automatically.
- **D-08:** No UI for import in this phase -- invoked via a Tauri command. Phase 8 or later can add a menu item / drag-drop. The command is callable from the terminal or dev tools.

### Hot-reload pipeline
- **D-09:** Rust `notify` crate watches `~/.config/efxmux/theme.json` for modifications. On change, reads the file, validates JSON, and emits a `theme-changed` Tauri event with the full theme payload.
- **D-10:** JS listens for `theme-changed` event. On receipt: (a) updates CSS custom properties on `:root` for chrome colors, (b) calls `terminal.options.theme = newTheme` on all active xterm.js instances for terminal colors.
- **D-11:** Debounce file watcher events by 200ms to handle rapid saves (editor auto-save, format-on-save).
- **D-12:** If theme.json is invalid JSON, log a warning and keep the current theme. No crash, no blank screen.

### Dark/light mode strategy
- **D-13:** theme.json has a single palette -- it IS the active theme. Dark/light is not a toggle between two embedded presets. Instead, the user swaps theme.json content (or we provide two starter files).
- **D-14:** THEME-04 (dark/light toggle) is implemented as: app chrome has a `data-theme` attribute. CSS provides both dark and light variable sets. Toggle switches the attribute and persists preference to localStorage (migrates to state.json in Phase 4).
- **D-15:** Light mode only affects app chrome (sidebar, panel headers, borders). Terminal colors always come from theme.json -- the terminal is the user's chosen palette regardless of chrome mode.
- **D-16:** Default light chrome palette: `--bg: #fdf6e3`, `--bg-raised: #eee8d5`, `--border: #d3cfc2`, `--text: #657b83`, `--text-bright: #586e75`, `--accent: #268bd2` (Solarized Light complement).

### Claude's Discretion
- Exact notify watcher configuration (polling interval, recursive vs flat)
- Theme validation strictness (require all keys, or allow partial with fallbacks)
- Whether to ship a second starter theme file alongside the default
- Error UX for malformed theme.json beyond console warning
- Config directory creation strategy (`~/.config/efxmux/` -- create on first launch or on theme access)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theming requirements
- `.planning/REQUIREMENTS.md` SS Theming -- THEME-01 through THEME-04: exact acceptance criteria for this phase
- `.planning/ROADMAP.md` SS Phase 3 -- Success criteria (4 items), dependency on Phase 2

### Project context & stack
- `.planning/PROJECT.md` SS Theme Spec -- Original color token table (NOTE: values are outdated forest-green; use Solarized Dark values from D-03 above)
- `CLAUDE.md` SS xterm.js -- Theme object structure, version 6.0 breaking changes
- `CLAUDE.md` SS notify -- File watching crate API and usage patterns

### Phase 1 & 2 integration points
- `.planning/phases/01-scaffold-entitlements/01-CONTEXT.md` -- D-14/D-15: CSS custom properties in theme.css, no hardcoded colors
- `.planning/phases/02-terminal-integration/02-CONTEXT.md` -- D-06/D-07: WebGL/DOM fallback (theme must work with both renderers)
- `src/styles/theme.css` -- Current CSS custom property definitions (Solarized Dark values)
- `src/terminal/terminal-manager.js` -- Current hardcoded xterm.js theme object (lines 22-27, must be replaced with theme.json values)

### Memory corrections
- User's theme is Solarized Dark (`#282d3a` bg, `#258ad1` accent), NOT forest-green. Never use `#1e2d25`/`#26a641`.
- App is branded "Efxmux" -- config path is `~/.config/efxmux/`, not `~/.config/gsd-mux/`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/styles/theme.css` -- Already defines CSS custom properties for Solarized Dark palette. Phase 3 makes these dynamic (loaded from theme.json instead of static).
- `src/terminal/terminal-manager.js:22-27` -- Hardcoded xterm.js theme object. Phase 3 replaces this with values from theme.json and adds runtime update capability.
- `src-tauri/Cargo.toml` -- Already has `portable-pty`. Add `notify = "8.2.0"` for file watching.

### Established Patterns
- CSS custom properties on `:root` for all colors (Phase 1 D-15)
- Tauri `invoke` from `window.__TAURI__.core` for Rust commands
- Tauri events via `listen` from `@tauri-apps/api/event` for Rust-to-JS push
- Import map vendoring for JS dependencies (no bundler)

### Integration Points
- `src-tauri/src/lib.rs` -- Add theme-related commands: `load_theme`, `import_iterm2_theme`, `get_config_dir`
- `src-tauri/Cargo.toml` -- Add `notify = "8.2.0"` and `serde_json` (already present via Tauri)
- `src/terminal/terminal-manager.js` -- Expose method to update theme at runtime (currently hardcoded)
- `src/styles/theme.css` -- Becomes the fallback/default; runtime values override via JS setting custom properties
- `src/main.js` -- Add theme initialization on startup (load theme.json, apply to CSS + xterm.js)

</code_context>

<specifics>
## Specific Ideas

- The hardcoded theme in `terminal-manager.js:22-27` is a known debt from Phase 2. This phase replaces it with dynamic loading.
- iTerm2 import is intentionally headless (Tauri command only) to keep Phase 3 scope tight. A menu item or drag-drop UI can come later.
- Light mode only touches app chrome, never terminal colors -- the terminal is the user's sacred space.
- Config directory `~/.config/efxmux/` will also be used by Phase 4 (state.json) -- establish the directory creation pattern here.

</specifics>

<deferred>
## Deferred Ideas

- Ghostty config importer -- v2 requirement (ETHM-01), not in v1 scope
- Per-project theme override -- v2 requirement (ETHM-02)
- Menu item or drag-drop for iTerm2 import -- Phase 8 polish or later
- Theme preview before applying -- not scoped
- Theme marketplace or community themes -- not scoped

None -- analysis stayed within phase scope

</deferred>

---

*Phase: 03-terminal-theming*
*Context gathered: 2026-04-07*
