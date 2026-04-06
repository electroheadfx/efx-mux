# Stack Research — GSD⚡MUX

**Researched:** 2026-04-06
**Overall confidence:** MEDIUM-HIGH (versions verified via npm/crates.io/GitHub; API details from official docs)

---

## Tauri 2

**Current version:** 2.10.3 (released March 4, 2026)
**Cargo dependency:** `tauri = "2"` (resolves to 2.10.x)

### Key APIs used

**Invoke (JS → Rust):**
```javascript
import { invoke } from '@tauri-apps/api/core';
await invoke('my_command', { arg: 'value' });
```
On Rust: `#[tauri::command]` attribute + `generate_handler![my_command]` in `.setup()`.

**Events (Rust → JS, broadcast):**
```rust
use tauri::Emitter;
app_handle.emit("pty-output", payload).unwrap();
```
```javascript
import { listen } from '@tauri-apps/api/event';
listen('pty-output', (event) => { term.write(event.payload); });
```
Events are globally broadcast, JSON-serialized, async only. Not ideal for high-frequency PTY output.

**Channels (Rust → JS, streaming — preferred for PTY output):**
Channels are ordered, faster than events, designed for streaming (e.g., stdout bytes). Use these for PTY output instead of events.
```rust
#[tauri::command]
async fn stream_pty(channel: tauri::ipc::Channel<Vec<u8>>) {
    // read PTY output in loop, send chunks
    channel.send(chunk).unwrap();
}
```
```javascript
import { invoke, Channel } from '@tauri-apps/api/core';
const ch = new Channel();
ch.onmessage = (data) => term.write(data);
await invoke('stream_pty', { channel: ch });
```

**Window/Webview management:**
Tauri 2 split Window and Webview into separate concepts. A window can host multiple webviews via `Window::add_child`. The JS class is `WebviewWindow`. The multiple-webview API was added but is noted as still maturing (auto-resize needs work).

For GSD⚡MUX's panel layout, all panels should live in a single HTML page with CSS-driven layout rather than multiple native webviews — this avoids the incomplete multi-webview API and is simpler to implement.

**State management across commands:**
Use `tauri::State<T>` with `Arc<Mutex<T>>` for shared mutable state (e.g., PTY handles, tmux session map).

### Core Rust dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-build = { version = "2", build-script = true }   # in build.rs
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

### Gotchas

- The `@tauri-apps/api` JS package version must match the Tauri core version. Pin to `^2.0.0` and let npm resolve the correct minor.
- `invoke` import changed between Tauri 1 and 2: it is now `@tauri-apps/api/core`, not `@tauri-apps/api/tauri`.
- `listen` is now `@tauri-apps/api/event`, same path as v1 but the module restructure means other v1 imports will break.
- Tauri 2 migrated most plugins (shell, fs, store, etc.) out of core into separate `tauri-plugin-*` crates. Each needs explicit `cargo add` and frontend npm package.
- Multiple webview panels (native split via `Window::add_child`) are not production-ready as of 2.10.x. Use a single webview with CSS flexbox panels.

---

## Arrow.js

**Current version:** @arrow-js/core 1.0.6 (released April 1, 2026; npm shows 1.0.1 as "latest" tag — confirm at publish time)
**Package:** `@arrow-js/core`
**Maintainer:** Standard Agents (standardagents/arrow-js on GitHub)

### Core API

Three exports: `reactive`, `html`, `component`.

```javascript
import { reactive, html, component } from '@arrow-js/core'

// Reactive state
const state = reactive({ count: 0, panels: [] })

// Template (tagged literal — reactive expressions are arrow functions)
html`<div>${() => state.count}</div>`(document.body)

// Component
const Counter = component(() => {
  const s = reactive({ n: 0 })
  return html`<button @click="${() => s.n++}">Clicks: ${() => s.n}</button>`
})
html`${Counter()}`(document.body)
```

Static values in templates render once. Arrow functions are tracked and re-render on dependency change. No vDOM — direct DOM updates.

### No-bundler ESM import

```html
<script type="module">
  import { reactive, html, component } from 'https://esm.sh/@arrow-js/core'
</script>
```

Or with a local import map for production (no CDN dependency at runtime):

```html
<script type="importmap">
  { "imports": { "@arrow-js/core": "/vendor/arrow-core.js" } }
</script>
<script type="module" src="/js/app.js"></script>
```

Download the ESM build from esm.sh and vendor it into `src/assets/vendor/`. No bundler, no build step required.

### @arrow-js/skill

```bash
npx @arrow-js/skill@latest
```

Installs Arrow-specific agent context into the project so that coding agents (Claude Code, Codex) receive framework-aware guidance when working with Arrow.js files. Run once at project init.

### Available packages

| Package | Purpose |
|---------|---------|
| `@arrow-js/core` | Reactive state + html template literal rendering |
| `@arrow-js/framework` | Async component runtime with loading boundaries |
| `@arrow-js/ssr` | Server-side rendering (not needed for Tauri) |
| `@arrow-js/hydrate` | Client hydration after SSR (not needed) |
| `@arrow-js/sandbox` | WASM-sandboxed code execution (not needed for MVP) |

Use only `@arrow-js/core` for this project.

### Gotchas

- Arrow.js does not use web components (Custom Elements). `component()` returns a render function, not a custom element class. No `customElements.define` needed.
- There is no virtual DOM diffing — reactivity is at the individual expression level. Entire template subtrees do not re-render; only the tracked arrow function expressions update.
- The framework is deliberately minimal. For complex state shapes (app-wide panel state), use a single top-level `reactive({})` store and pass sub-objects into components.
- Arrow.js is maintained by Standard Agents, not a large OSS foundation. Verify activity on GitHub before each major phase.

---

## xterm.js

**Current version:** @xterm/xterm 6.0.0 (released December 22, 2024)
**Previous stable:** 5.5.0 (April 5, 2024)

### Version recommendation: USE 5.5.0, NOT 6.0.0

xterm.js 6.0.0 has breaking changes (see Gotchas) and was released in December 2024. The VS Code integration changes and viewport restructuring make 6.0 a larger migration risk for a greenfield project where xterm 5.5 is well-understood. However, since this is greenfield, starting with 6.0 avoids a future upgrade. Recommendation: **start with 6.0.0** but be aware of all breaking changes documented below.

### WebGL addon in Tauri (WKWebView on macOS)

**Status: Works, with known caveats.**

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

```javascript
import { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

const term = new Terminal({
  fontFamily: 'FiraCode, monospace',
  fontSize: 14,
  fontWeight: '300',
  theme: {
    background: '#1e2d25',
    foreground: '#c8d4ca',
    cursor: '#26a641',
    // ... full theme object
  },
  allowTransparency: false,  // set true only if needed; false improves WebGL perf
})

const fitAddon = new FitAddon()
term.loadAddon(fitAddon)
term.loadAddon(new WebLinksAddon())
term.open(containerElement)

const webgl = new WebglAddon()
webgl.onContextLoss(() => {
  webgl.dispose()
  // terminal falls back to DOM renderer automatically
})
term.loadAddon(webgl)
fitAddon.fit()
```

### xterm.js 6.0 breaking changes (vs 5.x)

- `@xterm/addon-canvas` no longer exists. Do not import it.
- `ITerminalOptions.overviewRulerWidth` moved to `ITerminalOptions.overviewRuler.width`.
- `windowsMode` and `fastScrollModifier` removed from `ITerminalOptions`.
- Alt key → ctrl+arrow hack removed; must handle custom keybindings explicitly.
- Scrollbar implementation changed (VS Code integration); custom CSS for scrollbar styling may need updating.

---

## portable-pty

**Current version:** 0.9.0 (crates.io)
**Source:** wezterm/wezterm (extracted as separate crate)

### Tauri integration pattern

portable-pty is synchronous/blocking by default. Since Tauri commands can be `async`, spawn PTY I/O in a `tokio::task::spawn_blocking` or a dedicated OS thread, and communicate via `tokio::sync::mpsc` channels. Feed output to the Tauri `Channel` for streaming to the frontend.

```rust
use portable_pty::{native_pty_system, PtySize, CommandBuilder};
use std::sync::{Arc, Mutex};

#[tauri::command]
async fn spawn_terminal(
    cols: u16,
    rows: u16,
    channel: tauri::ipc::Channel<Vec<u8>>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["new-session", "-A", "-s", "main"]);
    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Read PTY output in blocking thread, send to Tauri channel
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => { let _ = channel.send(buf[..n].to_vec()); }
                Err(_) => break,
            }
        }
    });

    Ok(())
}
```

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

---

## tmux integration

**Approach: shell-out via `std::process::Command` (no Rust crate needed)**

The tmux CLI is the simplest and most reliable interface. The `tmux_interface` crate exists but adds complexity without much value for the operations needed.

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

Rather than spawning `tmux attach` in a PTY, the cleaner approach is:

1. On app start: `tmux new-session -A -s gsd-{project} -d` (creates or attaches to existing detached session).
2. Spawn a PTY via portable-pty running `tmux attach-session -t gsd-{project}`.
3. Connect that PTY to the xterm.js terminal in the main panel.

This gives full tmux session persistence: the PTY just runs `tmux attach`, and the underlying processes survive Tauri app close/reopen.

### tmux control mode (alternative for read-only operations)

`tmux -C attach` opens control mode — a machine-readable interface where tmux streams `%output`, `%session-changed`, etc. events to stdout. Useful for the sidebar to list sessions and active panes without requiring a PTY. LOW confidence — verify feasibility before using in Phase 2+.

### Gotchas

- Ensure tmux is in PATH at runtime. Add a startup check: `which tmux` or `Command::new("tmux").arg("-V")`.
- tmux session names must be unique and filesystem-safe. Use project directory basename.
- Do not assume tmux version. Some features (e.g., control mode improvements) require tmux 3.x. Run `tmux -V` and parse at startup.

---

## git2

**Current version:** 0.20.4 (crates.io, updated ~1 month ago)
**Crate:** `git2 = "0.20"`
**Wraps:** libgit2 (C library, compiled as part of the crate)

### Key methods for status/diff

**Open repo:**
```rust
use git2::Repository;
let repo = Repository::open("/path/to/project")?;
```

**Current branch name:**
```rust
let head = repo.head()?;
let branch = head.shorthand().unwrap_or("HEAD");
```

**Working tree status (for sidebar indicator):**
```rust
let mut opts = git2::StatusOptions::new();
opts.include_untracked(true);
let statuses = repo.statuses(Some(&mut opts))?;
let dirty = !statuses.is_empty();
let counts = statuses.iter().fold((0,0,0), |acc, e| {
    let s = e.status();
    (
        acc.0 + if s.contains(git2::Status::INDEX_NEW | git2::Status::INDEX_MODIFIED) { 1 } else { 0 },
        acc.1 + if s.contains(git2::Status::WT_MODIFIED | git2::Status::WT_NEW) { 1 } else { 0 },
        acc.2
    )
});
```

**Diff for diff panel:**
```rust
// Index vs HEAD (staged changes)
let head_commit = repo.head()?.peel_to_commit()?;
let head_tree = head_commit.tree()?;
let diff = repo.diff_tree_to_index(Some(&head_tree), None, None)?;

// Workdir vs index (unstaged changes)
let diff = repo.diff_index_to_workdir(None, None)?;

// Iterate patches
diff.foreach(
    &mut |delta, _| { /* file-level */ true },
    None,
    Some(&mut |_, hunk| { /* hunk-level */ true }),
    Some(&mut |_, _, line| { /* line-level, use line.content() */ true }),
)?;
```

### Gotchas

- git2 compiles libgit2 from source — first build is slow. Ensure `cmake` and a C toolchain are installed (Xcode CLI tools on macOS cover this).
- Run all git2 operations on a Tokio `spawn_blocking` thread — libgit2 is synchronous and will block the async runtime.
- git2 does not pick up system `~/.gitconfig` SSH keys automatically for fetch/push. For read-only status/diff (what this project needs), this is not a problem.
- `Repository::open` scans up the directory tree to find `.git`. Pass the explicit project root, not a subdirectory.

---

## notify (file watching)

**Current version:** 8.2.0 stable; 9.0.0-rc.2 available
**Use:** `notify = "8"` (stable for now; 9.0 RC not yet stable)

Used for: watching PLAN.md / GSD files to trigger right-panel refresh; watching `~/.config/gsd-mux/theme.json` for hot-reload.

```rust
use notify::{Watcher, RecommendedWatcher, RecursiveMode, Config};
use std::sync::mpsc;

let (tx, rx) = mpsc::channel();
let mut watcher = RecommendedWatcher::new(tx, Config::default())?;
watcher.watch(path, RecursiveMode::NonRecursive)?;
```

Emit a Tauri event to the frontend on file change for panel refresh.

---

## marked.js (Markdown renderer)

**Recommendation:** `marked` v14+ from CDN or vendored ESM.
Use `marked.parse(content)` with a custom renderer for checkbox support (write-back on click).

```javascript
import { marked } from 'https://esm.sh/marked@14'
const html = marked.parse(fileContent)
```

Custom renderer to make checkboxes interactive (write-back pattern):
- Override the `checkbox` renderer to emit `<input type="checkbox" data-line="N">`.
- On change event, `invoke('write_checkbox', { path, line, checked })` → Tauri command modifies the .md file at the correct line.

---

## Version Matrix

| Package | Recommended Version | Source | Confidence |
|---------|---------------------|--------|------------|
| tauri (Rust) | 2.10.3 | docs.rs confirmed | HIGH |
| @tauri-apps/api (JS) | ^2.0.0 | matches tauri core | HIGH |
| @arrow-js/core | 1.0.6 (or latest 1.x) | GitHub confirmed | HIGH |
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

---

## Critical Integration Notes

**PTY streaming architecture:**
Do NOT use Tauri events (`emit`) for PTY output — they go through JSON serialization and are not ordered. Use `tauri::ipc::Channel<Vec<u8>>` for all PTY output. This is the pattern used by Tauri's own shell plugin internally.

**WebGL fallback mandatory:**
Always register `webgl.onContextLoss(() => webgl.dispose())`. WKWebView can drop WebGL context on macOS when the window is hidden or memory is constrained. Without the fallback handler, the terminal goes blank with no error.

**xterm.js 6.0 vs 5.5 decision:**
Start with 6.0.0. It is the current release and avoids an in-project upgrade. The breaking changes are well-documented and easily handled at project init.

**Arrow.js vs web components:**
Arrow.js `component()` is NOT a web component. It returns a render function. Do not attempt to use `customElements.define` — this is unnecessary overhead. All panels are Arrow.js components mounted into fixed `<div id="...">` containers.

**Multiple webviews: avoid native split.**
Tauri 2's multi-webview API (`Window::add_child`) is not stable enough for production use. Implement the entire 3-zone layout (sidebar + main terminal + right panels) as a single HTML page with CSS flexbox/grid. The terminal panels are `<div>` elements with xterm.js instances mounted into them.

---

## Sources

- Tauri 2 current version: https://docs.rs/crate/tauri/latest/source/Cargo.toml.orig
- Tauri invoke API: https://v2.tauri.app/develop/calling-rust/
- Tauri emit/listen/Channel API: https://v2.tauri.app/develop/calling-frontend/
- xterm.js releases: https://github.com/xtermjs/xterm.js/releases
- xterm.js 6.0.0 release notes: https://github.com/xtermjs/xterm.js/releases/tag/6.0.0
- @xterm/addon-webgl npm: https://www.npmjs.com/package/@xterm/addon-webgl
- WebGL in WKWebView (Babylon.js forum): https://forum.babylonjs.com/t/performance-between-safari-and-wkwebview-tauri/60811
- Arrow.js GitHub: https://github.com/standardagents/arrow-js
- Arrow.js site: https://arrow-js.com/
- portable-pty docs.rs: https://docs.rs/portable-pty/latest/portable_pty/
- git2 docs.rs: https://docs.rs/git2/latest/git2/
- notify crates.io: https://crates.io/crates/notify
- tauri-plugin-pty: https://github.com/Tnze/tauri-plugin-pty
