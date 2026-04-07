# Phase 3: Terminal Theming - Research

**Researched:** 2026-04-07
**Domain:** Theme configuration, file watching, iTerm2 color import, CSS custom properties
**Confidence:** HIGH

## Summary

Phase 3 adds user-customizable theming to Efxmux via a `theme.json` file at `~/.config/efxmux/theme.json`. The phase has three main technical challenges: (1) a Rust file watcher that detects theme.json changes and emits events to JS, (2) an iTerm2 JSON profile color importer that converts float RGB components to hex, and (3) a JS-side theme applicator that updates both CSS custom properties and xterm.js terminal themes at runtime.

The technology is well-understood and all pieces are available in the existing stack. The `notify` crate 8.2.0 handles file watching, Tauri 2's `Emitter::emit()` pushes theme payloads to the frontend, and xterm.js 6.0's `terminal.options.theme` setter triggers an immediate re-render. The iTerm2 import is straightforward float-to-hex conversion with well-documented key names.

**Primary recommendation:** Use `notify-debouncer-mini` 0.7.0 (wraps `notify` 8.x) for 200ms debounced file watching, emit full theme JSON via Tauri event, and apply to both CSS vars and xterm.js in a single JS handler.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Theme file lives at `~/.config/efxmux/theme.json`
- **D-02:** Flat token map with `chrome` and `terminal` top-level sections
- **D-03:** Schema uses Solarized Dark values as defaults (see CONTEXT.md for full schema)
- **D-04:** First launch creates theme.json from defaults if missing
- **D-05:** Tauri command `import_iterm2_theme` accepts file path, maps iTerm2 color keys
- **D-06:** iTerm2 colors are `{"Red Component": float, ...}` objects, convert to `#RRGGBB`
- **D-07:** Import overwrites theme.json after `.bak` backup; hot-reload picks up change
- **D-08:** No UI for import -- Tauri command only, callable from terminal/devtools
- **D-09:** Rust `notify` watches theme.json; on change, validates JSON, emits `theme-changed` Tauri event
- **D-10:** JS listens for `theme-changed`; updates CSS custom properties + `terminal.options.theme` on all instances
- **D-11:** Debounce file watcher events by 200ms
- **D-12:** Invalid JSON logs warning, keeps current theme (no crash)
- **D-13:** Single palette in theme.json (no dual dark/light presets embedded)
- **D-14:** Dark/light toggle via `data-theme` attribute on `:root`, CSS provides both variable sets
- **D-15:** Light mode only affects chrome; terminal always uses theme.json colors
- **D-16:** Light chrome palette: Solarized Light complement values (see CONTEXT.md)

### Claude's Discretion
- Exact notify watcher configuration (polling interval, recursive vs flat)
- Theme validation strictness (require all keys, or allow partial with fallbacks)
- Whether to ship a second starter theme file alongside the default
- Error UX for malformed theme.json beyond console warning
- Config directory creation strategy

### Deferred Ideas (OUT OF SCOPE)
- Ghostty config importer (v2 ETHM-01)
- Per-project theme override (v2 ETHM-02)
- Menu item or drag-drop for iTerm2 import
- Theme preview before applying
- Theme marketplace or community themes
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THEME-01 | User can define terminal colors/font in `~/.config/efxmux/theme.json`; all xterm.js instances apply on load | Rust `load_theme` command + JS startup init; xterm.js `terminal.options.theme` setter |
| THEME-02 | User can import iTerm2 `.json` export, auto-converted to theme.json | Rust `import_iterm2_theme` command; iTerm2 color key mapping documented below |
| THEME-03 | Hot-reload: saving theme.json updates all terminals without restart | `notify-debouncer-mini` 0.7.0 + Tauri `emit()` + JS `listen()` pipeline |
| THEME-04 | Dark/light chrome toggle persists across restarts | `data-theme` attribute + CSS variable sets + localStorage persistence |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| notify | 8.2.0 | Cross-platform file system event watching | De facto Rust fs watcher; used by cargo-watch, mdBook, etc. [VERIFIED: crates.io search] |
| notify-debouncer-mini | 0.7.0 | Debounced wrapper around notify | Official companion crate; handles 200ms debounce without custom timers [VERIFIED: crates.io search] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| serde / serde_json | 1.x | Theme JSON parsing and serialization | Already in Cargo.toml [VERIFIED: existing Cargo.toml] |
| dirs | 5.x or 6.x | Resolve `~/.config` cross-platform | Optional -- can hardcode `$HOME/.config/efxmux` for macOS-only app [ASSUMED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| notify-debouncer-mini | Manual timer + raw notify | More code, same result; debouncer-mini is 0 extra deps beyond notify |
| dirs crate | `std::env::var("HOME")` | dirs is more correct (handles edge cases), but HOME is fine for macOS-only |

**Discretion recommendation:** Skip the `dirs` crate. Use `std::env::var("HOME")` + `/.config/efxmux/` since this is macOS-only. One fewer dependency.

**Installation (Cargo.toml additions):**
```toml
notify = { version = "8.2", features = ["serde"] }
notify-debouncer-mini = "0.7"
```

## Architecture Patterns

### Recommended Module Structure
```
src-tauri/src/
  theme/
    mod.rs          # pub mod watcher; pub mod iterm2; pub mod types;
    types.rs        # ThemeConfig struct (chrome + terminal sections), default values
    watcher.rs      # File watcher setup, debounce, emit Tauri event
    iterm2.rs       # iTerm2 JSON profile parser and converter
  terminal/
    pty.rs          # (existing)
  lib.rs            # Register theme commands + start watcher in setup()

src/
  theme/
    theme-manager.js  # Load theme on startup, listen for changes, apply to CSS + xterm.js
  terminal/
    terminal-manager.js  # (existing, modified to accept theme parameter)
```

### Pattern 1: File Watcher with Tauri Event Emission
**What:** Rust background thread watches theme.json, debounces, emits Tauri event on change
**When to use:** Any time Rust detects a file change that needs to update the frontend
**Example:**
```rust
// Source: notify-debouncer-mini docs + Tauri Emitter trait docs
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::time::Duration;
use std::path::Path;
use tauri::Emitter; // Tauri 2: emit() is on the Emitter trait

pub fn start_theme_watcher(app_handle: tauri::AppHandle, theme_path: &Path) {
    let path = theme_path.to_path_buf();
    let handle = app_handle.clone();

    std::thread::spawn(move || {
        let tx_handle = handle.clone();
        let tx_path = path.clone();

        let mut debouncer = new_debouncer(
            Duration::from_millis(200),
            move |res: DebounceEventResult| {
                if let Ok(events) = res {
                    // Only react if our file was modified
                    let dominated = events.iter().any(|e| e.path == tx_path);
                    if dominated {
                        match std::fs::read_to_string(&tx_path) {
                            Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
                                Ok(theme) => {
                                    let _ = tx_handle.emit("theme-changed", theme);
                                }
                                Err(e) => eprintln!("[efxmux] Invalid theme.json: {}", e),
                            },
                            Err(e) => eprintln!("[efxmux] Failed to read theme.json: {}", e),
                        }
                    }
                }
            },
        ).expect("Failed to create file watcher");

        // Watch the parent directory (not the file itself -- some editors delete+recreate)
        debouncer.watcher()
            .watch(path.parent().unwrap(), notify::RecursiveMode::NonRecursive)
            .expect("Failed to watch config directory");

        // Keep thread alive -- debouncer drops on scope exit
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}
```

### Pattern 2: JS Theme Applicator
**What:** Single function that takes a theme payload and updates both CSS custom properties and all xterm.js terminals
**When to use:** On startup (initial load) and on each `theme-changed` event
**Example:**
```javascript
// Source: xterm.js ITheme docs (xtermjs.org) + Tauri event API
// listen is available on window.__TAURI__.event in no-bundler setup

function applyTheme(theme, terminals) {
  // 1. Apply chrome colors to CSS custom properties
  if (theme.chrome) {
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.chrome.bg);
    root.style.setProperty('--bg-raised', theme.chrome.bgRaised);
    root.style.setProperty('--border', theme.chrome.border);
    root.style.setProperty('--text', theme.chrome.text);
    root.style.setProperty('--text-bright', theme.chrome.textBright);
    root.style.setProperty('--accent', theme.chrome.accent);
    if (theme.chrome.font) {
      root.style.setProperty('--font', `'${theme.chrome.font}', monospace`);
    }
    if (theme.chrome.fontSize) {
      root.style.setProperty('--font-size', `${theme.chrome.fontSize}px`);
    }
  }

  // 2. Apply terminal colors to all xterm.js instances
  if (theme.terminal) {
    for (const term of terminals) {
      term.options.theme = theme.terminal;
      // Font properties require separate setter
      if (theme.chrome?.font) {
        term.options.fontFamily = `'${theme.chrome.font}', monospace`;
      }
      if (theme.chrome?.fontSize) {
        term.options.fontSize = theme.chrome.fontSize;
      }
    }
  }
}
```

### Pattern 3: iTerm2 Color Conversion
**What:** Convert iTerm2 float RGB components to hex strings
**Example:**
```rust
// Source: iTerm2 profile JSON format (verified via GitHub profile examples)
fn iterm2_color_to_hex(color: &serde_json::Value) -> Option<String> {
    let r = (color.get("Red Component")?.as_f64()? * 255.0).round() as u8;
    let g = (color.get("Green Component")?.as_f64()? * 255.0).round() as u8;
    let b = (color.get("Blue Component")?.as_f64()? * 255.0).round() as u8;
    Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
}
```

### Anti-Patterns to Avoid
- **Watching the file directly instead of the parent directory:** Many editors (vim, VS Code) use atomic save (write temp file, rename). This deletes the original inode, breaking a file-level watch. Always watch the parent directory and filter by filename. [CITED: notify-rs/notify GitHub README]
- **Emitting partial theme objects:** xterm.js `terminal.options.theme` does a full replacement, not a merge. Always send the complete theme object to avoid losing colors.
- **Using `emit_all` (Tauri 1 API):** In Tauri 2, the method is `emit()` on the `Emitter` trait. `emit_all` does not exist. [VERIFIED: docs.rs/tauri/2.0.0 Emitter trait]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File watch debouncing | Manual timer + event dedup | `notify-debouncer-mini` | Handles edge cases: rapid saves, atomic renames, editor temp files |
| Config directory path | String concatenation | `std::env::var("HOME")` + PathBuf join | Path separators, missing HOME |
| Color format conversion | Regex on hex strings | `serde_json` float parsing + format! | iTerm2 uses floats 0-1, not hex; parsing is trivial with serde |

## Common Pitfalls

### Pitfall 1: Editor Atomic Save Breaks File Watch
**What goes wrong:** vim, VS Code, and others use write-to-temp-then-rename. The original file's inode is deleted, so a watch on the file path stops receiving events.
**Why it happens:** `notify` watches inodes by default on macOS (kqueue). When the file is replaced, the old inode is gone.
**How to avoid:** Watch the parent directory (`~/.config/efxmux/`) with `NonRecursive` mode. Filter events by checking if the event path matches `theme.json`.
**Warning signs:** Hot-reload works on first save but stops after the second save.

### Pitfall 2: xterm.js Theme Setter Does Full Replace
**What goes wrong:** Setting `terminal.options.theme = { background: '#fff' }` wipes all other theme colors (foreground, ANSI colors revert to defaults).
**Why it happens:** xterm.js does not merge the new theme with the old one -- it replaces the entire theme object.
**How to avoid:** Always pass the complete theme object from theme.json. The `terminal` section in theme.json should contain all 16 ANSI colors + foreground/background/cursor/selection.
**Warning signs:** Terminal colors look partially broken after a theme update.

### Pitfall 3: Race Condition on Startup
**What goes wrong:** Watcher starts before theme.json exists (first launch). Watcher errors or misses the file creation.
**Why it happens:** App startup creates theme.json (D-04), but the watcher might already be watching the directory.
**How to avoid:** (1) Create config dir + theme.json before starting the watcher. (2) Load theme synchronously on startup via `invoke('load_theme')`, don't rely on the watcher for initial load.
**Warning signs:** Theme not applied on first launch; works after manual save.

### Pitfall 4: Theme Font Change Without Fit
**What goes wrong:** Changing `fontSize` in theme.json changes the terminal font size but the terminal doesn't resize to fit the container.
**Why it happens:** xterm.js doesn't auto-call `fit()` when font metrics change.
**How to avoid:** After applying terminal theme/font changes, call `fitAddon.fit()` on all terminals.
**Warning signs:** Terminal text overflows or has excessive whitespace after font size change.

### Pitfall 5: Tauri Event Payload Serialization
**What goes wrong:** Emitting a Rust struct that doesn't derive `Serialize` + `Clone` causes a compile error.
**Why it happens:** Tauri 2's `emit()` requires `S: Serialize + Clone`.
**How to avoid:** Use `serde_json::Value` as the payload type (already serializable), or define a `#[derive(Clone, Serialize)]` struct.
**Warning signs:** Compile errors mentioning `Serialize` bounds on `emit()`.

## Code Examples

### iTerm2 Color Key Mapping (Complete)
```rust
// Source: Verified from actual iTerm2 profile JSON exports on GitHub
// https://github.com/joshjohanning/dotfiles/blob/main/iterm2-profile.json

/// Maps iTerm2 profile color keys to theme.json terminal keys.
const ITERM2_TO_THEME: &[(&str, &str)] = &[
    ("Foreground Color", "foreground"),
    ("Background Color", "background"),
    ("Cursor Color", "cursor"),
    ("Selection Color", "selectionBackground"),
    ("Ansi 0 Color", "black"),
    ("Ansi 1 Color", "red"),
    ("Ansi 2 Color", "green"),
    ("Ansi 3 Color", "yellow"),
    ("Ansi 4 Color", "blue"),
    ("Ansi 5 Color", "magenta"),
    ("Ansi 6 Color", "cyan"),
    ("Ansi 7 Color", "white"),
    ("Ansi 8 Color", "brightBlack"),
    ("Ansi 9 Color", "brightRed"),
    ("Ansi 10 Color", "brightGreen"),
    ("Ansi 11 Color", "brightYellow"),
    ("Ansi 12 Color", "brightBlue"),
    ("Ansi 13 Color", "brightMagenta"),
    ("Ansi 14 Color", "brightCyan"),
    ("Ansi 15 Color", "brightWhite"),
];
```
[VERIFIED: GitHub profile export showing exact key names]

### xterm.js ITheme Interface (Complete Property List)
```typescript
// Source: https://xtermjs.org/docs/api/terminal/interfaces/itheme/
// All properties are optional (string | undefined)
interface ITheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  // Selection
  selectionBackground?: string;
  selectionForeground?: string;
  selectionInactiveBackground?: string;
  // ANSI colors
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
  // Extended
  extendedAnsi?: string[];
  // Scrollbar
  scrollbarSliderBackground?: string;
  scrollbarSliderHoverBackground?: string;
  scrollbarSliderActiveBackground?: string;
  // Overview ruler
  overviewRulerBorder?: string;
}
```
[VERIFIED: xtermjs.org official docs]

### Tauri 2 Event Listening (No-Bundler Pattern)
```javascript
// Source: Tauri 2 event API + existing pty-bridge.js pattern
// In no-bundler setup, Tauri APIs are on window.__TAURI__
const { listen } = window.__TAURI__.event;

const unlisten = await listen('theme-changed', (event) => {
  const theme = event.payload;
  applyTheme(theme, getAllTerminals());
});
```
[VERIFIED: Tauri 2 docs - v2.tauri.app/develop/calling-frontend/]

### Dark/Light CSS Toggle Pattern
```css
/* Light mode chrome variables -- terminal colors are NOT affected (D-15) */
:root[data-theme="light"] {
  --bg:          #fdf6e3;
  --bg-raised:   #eee8d5;
  --border:      #d3cfc2;
  --text:        #657b83;
  --text-bright: #586e75;
  --accent:      #268bd2;
}
```
```javascript
// Toggle and persist
function toggleThemeMode() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('efxmux:theme-mode', next);
}

// Restore on startup
const savedMode = localStorage.getItem('efxmux:theme-mode') || 'dark';
document.documentElement.setAttribute('data-theme', savedMode);
```
[ASSUMED: Standard CSS data-attribute pattern; localStorage per Phase 1 convention]

## Discretion Recommendations

Based on research, here are recommendations for areas left to Claude's discretion:

1. **Watcher configuration:** Use `NonRecursive` mode on the parent directory (`~/.config/efxmux/`). No polling needed -- kqueue (macOS native) is event-driven. Recommendation: flat watch, no recursion.

2. **Theme validation:** Allow partial themes with fallbacks. Merge user's theme.json over the default Solarized Dark values. This way, users can override just the colors they care about. Use `serde_json::Value` merging (not struct deserialization) so missing keys don't fail.

3. **Second starter theme:** Do not ship a second starter file. One default (Solarized Dark) is enough. Users who want light can import their own iTerm2 theme or edit theme.json.

4. **Error UX:** Console warning is sufficient for Phase 3. A subtle non-blocking toast could be added in Phase 8 polish.

5. **Config directory creation:** Create `~/.config/efxmux/` in `setup()` hook (Tauri app initialization), before the file watcher starts. This establishes the directory for Phase 4's state.json too.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri 1 `emit_all()` | Tauri 2 `emit()` on `Emitter` trait | Tauri 2.0 (2024) | Must `use tauri::Emitter;` and call `.emit()` not `.emit_all()` |
| notify 6.x `Watcher::new()` | notify 8.x `RecommendedWatcher::new(handler, Config)` | notify 8.0 (2024) | Two-arg constructor; Config is required |
| xterm.js 5.x `ITerminalOptions.theme` | xterm.js 6.0 same API | xterm.js 6.0 (2025) | Theme API unchanged; no migration needed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dirs` crate not needed; `std::env::var("HOME")` sufficient for macOS-only | Standard Stack | LOW -- HOME is always set on macOS |
| A2 | `notify-debouncer-mini` 0.7.0 is compatible with `notify` 8.2.0 | Standard Stack | MEDIUM -- version mismatch would require using raw notify with manual debounce |
| A3 | Dark/light toggle via `data-theme` CSS attribute is standard pattern | Code Examples | LOW -- well-established CSS pattern |
| A4 | xterm.js `terminal.options.theme` setter triggers immediate re-render | Architecture | LOW -- documented behavior, widely used |

## Open Questions

1. **notify-debouncer-mini + notify 8.2 version compatibility**
   - What we know: debouncer-mini 0.7.0 lists notify as a dependency; cargo should resolve
   - What's unclear: Whether 0.7.0 pins to notify 8.x specifically or also supports 9.x-rc
   - Recommendation: Add both to Cargo.toml and let cargo resolve. If version conflict, use raw notify with a manual 200ms timer.

2. **Terminal registry for hot-reload**
   - What we know: Phase 2 has a single terminal instance. Future phases may add more.
   - What's unclear: How to collect all terminal instances for theme updates.
   - Recommendation: Create a simple `terminals` array in theme-manager.js. Export `registerTerminal(term)` / `unregisterTerminal(term)`. Each terminal creation calls register.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual UAT (no automated test framework yet) |
| Config file | none |
| Quick run command | Manual: edit theme.json, observe terminal |
| Full suite command | Manual UAT checklist |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | theme.json loads on startup, applies to xterm.js | manual/smoke | Launch app, verify colors match theme.json | N/A |
| THEME-02 | iTerm2 import converts colors correctly | manual | `invoke('import_iterm2_theme', { path: '...' })` from devtools | N/A |
| THEME-03 | Hot-reload within 1 second | manual/smoke | Edit theme.json while app running, observe update | N/A |
| THEME-04 | Dark/light toggle persists | manual | Toggle, restart app, verify mode restored | N/A |

### Wave 0 Gaps
- No automated test infrastructure exists for this project yet. All validation is manual UAT.

## Security Domain

Security is minimal for this phase -- it reads a local user-owned config file.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A -- file is user-owned |
| V5 Input Validation | yes | serde_json parsing; reject invalid JSON gracefully |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed JSON in theme.json | Denial of Service | serde_json parse error handling; keep current theme on failure (D-12) |
| Symlink theme.json to sensitive file | Information Disclosure | Not a real risk -- app only reads, never exposes file contents to network |

## Sources

### Primary (HIGH confidence)
- [xterm.js ITheme interface](https://xtermjs.org/docs/api/terminal/interfaces/itheme/) - Complete property list verified
- [Tauri 2 Emitter trait](https://docs.rs/tauri/2.0.0/tauri/trait.Emitter.html) - `emit()` method signature confirmed
- [Tauri 2 calling frontend](https://v2.tauri.app/develop/calling-frontend/) - Event system documentation
- [notify crate 8.2.0](https://docs.rs/notify/latest/notify/) - Latest version and API confirmed
- [notify-debouncer-mini 0.7.0](https://docs.rs/notify-debouncer-mini/latest/notify_debouncer_mini/) - Debounce API confirmed
- [iTerm2 profile JSON](https://github.com/joshjohanning/dotfiles/blob/main/iterm2-profile.json) - Color key names verified

### Secondary (MEDIUM confidence)
- [iTerm2 colors documentation](https://iterm2.com/documentation-preferences-profiles-colors.html) - Color preferences reference
- [notify-rs GitHub](https://github.com/notify-rs/notify) - Atomic save gotcha documented in README

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all crates verified on crates.io, APIs confirmed via docs.rs
- Architecture: HIGH - patterns follow established Tauri 2 + notify conventions, xterm.js theme API verified
- Pitfalls: HIGH - atomic save issue is well-documented; xterm.js theme replacement behavior confirmed
- iTerm2 import: HIGH - color format and key names verified from real profile exports

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable domain, no fast-moving dependencies)
