---
phase: 03-terminal-theming
reviewed: 2026-04-07T18:42:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/src/theme/mod.rs
  - src-tauri/src/theme/types.rs
  - src-tauri/src/theme/watcher.rs
  - src/main.js
  - src/terminal/terminal-manager.js
  - src/theme/theme-manager.js
  - src/styles/theme.css
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-07T18:42:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

The theme subsystem is well-structured. The Rust backend provides clean type-safe theme definitions with serde defaults, a file watcher with proper directory-level monitoring and debouncing, and an iTerm2 color profile importer. The JS side has a clean theme lifecycle (load, apply, hot-reload, dark/light toggle) with proper xterm.js integration. The main bootstrap sequence correctly wires theme initialization before terminal creation and registers terminals for hot-reload.

The primary concerns are: (1) the `import_iterm2_theme` Tauri command accepts an unsanitized file path from the frontend, creating a path traversal risk; (2) `config_dir()` silently falls back to a root-relative path if `HOME` is unset; and (3) the Cmd+Left/Right key mappings in terminal-manager.js send incorrect escape sequences for shell line navigation.

---

## Critical Issues

### CR-01: `import_iterm2_theme` accepts unsanitized file path from frontend

**File:** `src-tauri/src/theme/iterm2.rs:51-54`

**Issue:** The `path: String` argument is a Tauri command parameter supplied by the JS frontend. It is passed directly to `fs::read_to_string(&path)` with no validation. An attacker controlling the frontend (e.g., via XSS in rendered markdown content in a future phase) could read any file readable by the app process by supplying an arbitrary path (e.g., `~/.ssh/id_rsa`, `/etc/passwd`). While Tauri's CSP reduces this risk, the principle of defense-in-depth requires validating the path. The file contents are parsed as JSON and errors are returned to the caller, but a valid JSON file at a sensitive path could still be exfiltrated via the return value.

**Fix:**

```rust
#[tauri::command]
pub fn import_iterm2_theme(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);

    // 1. Must be an absolute path
    if !p.is_absolute() {
        return Err("Path must be absolute".into());
    }

    // 2. Must have an expected extension
    match p.extension().and_then(|e| e.to_str()) {
        Some("json") | Some("itermcolors") => {}
        _ => return Err("File must be a .json or .itermcolors file".into()),
    }

    // 3. Resolve symlinks to prevent traversal
    let canonical = p.canonicalize()
        .map_err(|e| format!("Cannot resolve path: {}", e))?;

    let content = fs::read_to_string(&canonical)
        .map_err(|e| format!("Failed to read iTerm2 file: {}", e))?;
    // ... rest unchanged
}
```

---

## Warnings

### WR-01: `config_dir()` silently uses empty string when HOME is unset

**File:** `src-tauri/src/theme/types.rs:195`

**Issue:** `std::env::var("HOME").unwrap_or_default()` produces an empty string if `HOME` is unset. This makes `config_dir()` return `.config/efxmux` (a relative path), causing `ensure_config_dir()` and `theme_path()` to operate relative to the process working directory rather than the user's home. On macOS this is unlikely but possible in sandboxed or CI environments, and would silently write config files to unexpected locations.

**Fix:**

```rust
pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| {
            eprintln!("[efxmux] WARNING: HOME not set; using /tmp/efxmux-fallback for config");
            "/tmp/efxmux-fallback".to_string()
        });
    PathBuf::from(home).join(".config/efxmux")
}
```

### WR-02: Cmd+Left/Right sends wrong escape sequences for shell line navigation

**File:** `src/terminal/terminal-manager.js:39-48`

**Issue:** Cmd+Left sends `\x1b[H` (CSI H = Cursor Position, moves cursor to row 1, column 1 of the screen) and Cmd+Right sends `\x1b[F` (CSI F = Cursor Previous Line). These are screen-level cursor movement codes, not shell line-editing codes. In a shell (bash/zsh), "go to start of line" is `\x01` (Ctrl+A) and "go to end of line" is `\x05` (Ctrl+E). The current sequences will behave incorrectly in most interactive shell contexts -- Cmd+Left would jump the cursor to the top-left of the terminal screen rather than the beginning of the current command line.

**Fix:**

```js
// Cmd+Left -> beginning of line (Ctrl+A)
if (ev.metaKey && ev.key === 'ArrowLeft') {
  ev.preventDefault();
  terminal.write('\x01'); // Ctrl+A - beginning of line
  return false;
}
// Cmd+Right -> end of line (Ctrl+E)
if (ev.metaKey && ev.key === 'ArrowRight') {
  ev.preventDefault();
  terminal.write('\x05'); // Ctrl+E - end of line
  return false;
}
```

### WR-03: OS theme change listener unconditionally overrides user's manual mode choice

**File:** `src/theme/theme-manager.js:134-136`

**Issue:** The `matchMedia` change listener at line 134 calls `setThemeMode()` whenever the OS dark/light preference changes, regardless of whether the user has manually toggled the mode via Ctrl+Shift+T. This means: user manually selects light mode -> OS switches to dark -> user's manual choice is overridden. The comment says this is "standard macOS behavior," but most macOS apps (e.g., Slack, VS Code) respect a manual override and only follow OS when set to "System" mode. This creates a confusing UX where the Ctrl+Shift+T toggle appears broken.

**Fix:** Track whether the user has manually toggled, and only follow OS changes when no manual preference exists.

```js
function initOsThemeListener() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');

  // On first launch, follow OS if no manual preference stored
  if (localStorage.getItem('efxmux:theme-mode') === null) {
    setThemeMode(mq.matches ? 'dark' : 'light');
  }

  // Only follow OS changes if user hasn't manually toggled
  mq.addEventListener('change', (e) => {
    // Use a separate key to track manual override
    if (localStorage.getItem('efxmux:theme-manual') !== 'true') {
      setThemeMode(e.matches ? 'dark' : 'light');
    }
  });
}

// In toggleThemeMode(), mark as manually set:
export function toggleThemeMode() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  localStorage.setItem('efxmux:theme-manual', 'true');
  setThemeMode(current === 'dark' ? 'light' : 'dark');
}
```

---

## Info

### IN-01: `console.warn` in main.js bootstrap

**File:** `src/main.js:105`

**Issue:** `console.warn('[efx-mux] Theme init failed, using defaults:', err)` is a debug-level log. Acceptable for development but should be removed or gated behind a debug flag before release.

**Fix:** Consider using a structured logging utility or removing before production builds.

### IN-02: `unregisterTerminal` exported but never called

**File:** `src/theme/theme-manager.js:30-33`

**Issue:** `unregisterTerminal()` is exported but no call site exists in the reviewed files. The `terminals` array will grow if terminals are created and disposed without unregistering, though in the current single-terminal architecture this is not a practical concern.

**Fix:** Wire `unregisterTerminal` into the terminal dispose path, or add a comment noting it is reserved for multi-terminal support in a future phase.

---

_Reviewed: 2026-04-07T18:42:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
