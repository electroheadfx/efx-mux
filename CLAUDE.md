# Main setup

- **Please find GSD tools from `.Codex/get-shit-done`** and not from `$HOME/.Codex/get-shit-done`
- **Please do not run the server** I do on my side

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Tauri 2
### Key APIs used
#[tauri::command]
### Core Rust dependencies (Cargo.toml)
### Gotchas
- The `@tauri-apps/api` JS package version must match the Tauri core version. Pin to `^2.0.0` and let npm resolve the correct minor.
- `invoke` import changed between Tauri 1 and 2: it is now `@tauri-apps/api/core`, not `@tauri-apps/api/tauri`.
- `listen` is now `@tauri-apps/api/event`, same path as v1 but the module restructure means other v1 imports will break.
- Tauri 2 migrated most plugins (shell, fs, store, etc.) out of core into separate `tauri-plugin-*` crates. Each needs explicit `cargo add` and frontend npm package.
- Multiple webview panels (native split via `Window::add_child`) are not production-ready as of 2.10.x. Use a single webview with CSS flexbox panels.
## xterm.js
### Version recommendation: USE 5.5.0, NOT 6.0.0
### WebGL addon in Tauri (WKWebView on macOS)
- WKWebView uses WebKit, the same engine as Safari. WebGL2 is supported in Safari 15+ / macOS Monterey+. Evidence from Tauri community confirms WebGL2 reports as "WebGL 2.0 / WebKit WebGL" in WKWebView on macOS Sonoma.
- Performance is slightly worse in WKWebView than in Safari browser itself (frame pacing differences), but it works.
- Historical WebGL texture rendering issues in Safari (2021 issue #3357) were fixed via PR #4255 and subsequent xterm.js releases.
- The xterm.js WebGL addon falls back gracefully: if WebGL context is lost (e.g., memory pressure, suspend), listen to `onContextLoss()` and dispose + fall back to DOM renderer.
- The canvas addon (`@xterm/addon-canvas`) was removed in 6.0.0. Do not use it.
### Required addons
| Package | Version | Purpose |
|---------|---------|---------|
| `@xterm/xterm` | 6.0.0 | Core terminal emulator |
| `@xterm/addon-webgl` | 0.19.0 | GPU-accelerated WebGL2 renderer |
| `@xterm/addon-fit` | 0.11.0 | Fit terminal to container element size |
| `@xterm/addon-web-links` | 0.12.0 | Clickable URLs in terminal output |
### Setup pattern
### xterm.js 6.0 breaking changes (vs 5.x)
- `@xterm/addon-canvas` no longer exists. Do not import it.
- `ITerminalOptions.overviewRulerWidth` moved to `ITerminalOptions.overviewRuler.width`.
- `windowsMode` and `fastScrollModifier` removed from `ITerminalOptions`.
- Alt key → ctrl+arrow hack removed; must handle custom keybindings explicitly.
- Scrollbar implementation changed (VS Code integration); custom CSS for scrollbar styling may need updating.
## portable-pty
### Tauri integration pattern
#[tauri::command]
### Key API types
| Type | Purpose |
|------|---------|
| `native_pty_system()` | Returns platform-native PTY system (Unix PTY on macOS) |
| `PtySize { rows, cols, pixel_width, pixel_height }` | Terminal dimensions |
| `PtyPair { master, slave }` | Created by `openpty()` |
| `pair.master.try_clone_reader()` | Returns `Box<dyn Read>` for PTY output |
| `pair.master.take_writer()` | Returns `Box<dyn Write>` for PTY input |
| `pair.slave.spawn_command(cmd)` | Spawns process in PTY, returns `Box<dyn Child>` |
| `MasterPty::resize(PtySize)` | Resize PTY (call when terminal is resized) |
### Gotchas
- `take_writer()` is a one-shot — call once and keep the handle. Store in `Arc<Mutex<Box<dyn Write>>>` for multi-command access.
- The slave must stay open until the child exits. Keep `pair.slave` alive.
- PTY resize must flow both ways: xterm.js `onResize` event → `invoke('resize_pty', { cols, rows })` → `pair.master.resize(PtySize {...})`.
- portable-pty 0.9.0 is considered stable but has not had a release in ~1 year. Wezterm is the upstream consumer and is actively maintained, so the crate is unlikely to be abandoned, but check for maintenance signals before Phase 1.
## tmux integration
### Required tmux operations
| Operation | Command |
|-----------|---------|
| Create/attach session | `tmux new-session -A -s {name} -d` |
| List sessions | `tmux list-sessions -F "#{session_name}"` |
| Attach to existing | Spawn PTY with `tmux attach-session -t {name}` |
| Rename session | `tmux rename-session -t {old} {new}` |
| Kill session | `tmux kill-session -t {name}` |
| Resize window | `tmux resize-window -t {name} -x {cols} -y {rows}` |
### Pattern
### tmux control mode (alternative for read-only operations)
### Gotchas
- Ensure tmux is in PATH at runtime. Add a startup check: `which tmux` or `Command::new("tmux").arg("-V")`.
- tmux session names must be unique and filesystem-safe. Use project directory basename.
- Do not assume tmux version. Some features (e.g., control mode improvements) require tmux 3.x. Run `tmux -V` and parse at startup.
## git2
### Key methods for status/diff
### Gotchas
- git2 compiles libgit2 from source — first build is slow. Ensure `cmake` and a C toolchain are installed (Xcode CLI tools on macOS cover this).
- Run all git2 operations on a Tokio `spawn_blocking` thread — libgit2 is synchronous and will block the async runtime.
- git2 does not pick up system `~/.gitconfig` SSH keys automatically for fetch/push. For read-only status/diff (what this project needs), this is not a problem.
- `Repository::open` scans up the directory tree to find `.git`. Pass the explicit project root, not a subdirectory.
## notify (file watching)
## marked.js (Markdown renderer)
- Override the `checkbox` renderer to emit `<input type="checkbox" data-line="N">`.
- On change event, `invoke('write_checkbox', { path, line, checked })` → Tauri command modifies the .md file at the correct line.
## Version Matrix
| Package | Recommended Version | Source | Confidence |
|---------|---------------------|--------|------------|
| tauri (Rust) | 2.10.3 | docs.rs confirmed | HIGH |
| @tauri-apps/api (JS) | ^2.0.0 | matches tauri core | HIGH |
| @xterm/xterm | 6.0.0 | GitHub releases confirmed | HIGH |
| @xterm/addon-webgl | 0.19.0 | npm confirmed | HIGH |
| @xterm/addon-fit | 0.11.0 | npm confirmed | HIGH |
| @xterm/addon-web-links | 0.12.0 | npm confirmed | HIGH |
| portable-pty (Rust) | 0.9.0 | docs.rs confirmed | HIGH |
| git2 (Rust) | 0.20.4 | docs.rs confirmed | HIGH |
| notify (Rust) | 8.2.0 | crates.io confirmed | HIGH |
| serde / serde_json | 1.x | Tauri internals confirmed | HIGH |
| tokio | 1.x | Tauri internals confirmed | HIGH |
| marked (JS) | ^14.0.0 | — | MEDIUM |
| tmux (system) | 3.x minimum | convention | MEDIUM |
## Critical Integration Notes
## Sources
- Tauri 2 current version: https://docs.rs/crate/tauri/latest/source/Cargo.toml.orig
- Tauri invoke API: https://v2.tauri.app/develop/calling-rust/
- Tauri emit/listen/Channel API: https://v2.tauri.app/develop/calling-frontend/
- xterm.js releases: https://github.com/xtermjs/xterm.js/releases
- xterm.js 6.0.0 release notes: https://github.com/xtermjs/xterm.js/releases/tag/6.0.0
- @xterm/addon-webgl npm: https://www.npmjs.com/package/@xterm/addon-webgl
- WebGL in WKWebView (Babylon.js forum): https://forum.babylonjs.com/t/performance-between-safari-and-wkwebview-tauri/60811
- portable-pty docs.rs: https://docs.rs/portable-pty/latest/portable_pty/
- git2 docs.rs: https://docs.rs/git2/latest/git2/
- notify crates.io: https://crates.io/crates/notify
- tauri-plugin-pty: https://github.com/Tnze/tauri-plugin-pty
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills
Project skills are in `.claude/skills/`
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
