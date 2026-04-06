# Architecture Research — GSD⚡MUX

**Researched:** 2026-04-06
**Confidence:** MEDIUM-HIGH (verified against Tauri 2 docs, xterm.js docs, portable-pty docs, community patterns)

---

## PTY → xterm.js Data Flow

### Recommended Pattern: Tauri Channel (not Events)

**Decision:** Use Tauri 2 `Channel<T>` for PTY stdout streaming, NOT `emit`/Events.

The Tauri docs are explicit: the event system evaluates JavaScript under the hood and serializes to JSON strings — not suited for high-throughput binary-ish data. Channels are designed for ordered streaming (they're used internally for download progress and child process output). The event system is for lifecycle notifications.

**Confidence:** HIGH — from official Tauri 2 docs at v2.tauri.app/develop/calling-frontend/

### The Core Pattern

Each xterm.js instance passes a `Channel` object down into a Tauri command when it "connects" to a session. The Rust backend holds the channel endpoint and pushes PTY bytes through it. The channel is scoped to the invocation — no global event namespace, no session_id routing required at the event layer.

**Rust side:**

```rust
use tauri::ipc::Channel;
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum PtyEvent {
    Data { bytes: Vec<u8> },
    Exit { code: i32 },
}

#[tauri::command]
async fn session_attach(
    session_id: String,
    on_data: Channel<PtyEvent>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&session_id).ok_or("session not found")?;
    let reader = session.pty_master.try_clone_reader()?;

    // Spawn a dedicated blocking reader thread — do NOT use tokio::spawn here.
    // portable-pty reader is blocking (std::io::Read), not async.
    // tokio::task::spawn_blocking keeps it off the async executor.
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        let mut reader = reader;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = on_data.send(PtyEvent::Exit { code: 0 });
                    break;
                }
                Ok(n) => {
                    let _ = on_data.send(PtyEvent::Data {
                        bytes: buf[..n].to_vec(),
                    });
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}
```

**JavaScript side (xterm.js consumer):**

```javascript
import { invoke, Channel } from '@tauri-apps/api/core';

async function attachTerminal(sessionId, term) {
  const channel = new Channel();
  channel.onmessage = (event) => {
    if (event.type === 'data') {
      // event.bytes is a Uint8Array
      term.write(new Uint8Array(event.bytes));
    } else if (event.type === 'exit') {
      term.write('\r\n[Process exited]\r\n');
    }
  };
  await invoke('session_attach', { sessionId, onData: channel });
}
```

### Flow Control (Critical for fast processes)

xterm.js write buffer is 50MB hard cap. Fast PTY output (e.g., `cat largefile`) can overwhelm it. Use the watermark pattern:

```javascript
const HIGH = 100_000;  // bytes
const LOW  = 10_000;

let buffered = 0;
let paused = false;

channel.onmessage = (event) => {
  if (event.type !== 'data') return;
  const chunk = new Uint8Array(event.bytes);
  buffered += chunk.length;

  if (buffered > HIGH && !paused) {
    paused = true;
    invoke('session_pause', { sessionId });  // signal Rust to stop reading
  }

  term.write(chunk, () => {
    buffered -= chunk.length;
    if (paused && buffered < LOW) {
      paused = false;
      invoke('session_resume', { sessionId });
    }
  });
};
```

The Rust side needs a `paused: Arc<AtomicBool>` flag checked in the reader loop. This prevents the 50MB buffer overflow when Claude Code dumps large diffs.

### Why Not Events?

- Events are broadcast (global namespace) — requires session_id routing logic in every listener
- JSON serialization overhead on every byte chunk
- No ordering guarantees under concurrent load
- Tauri docs explicitly call out events as not suitable for large data

---

## tmux Session Management from Rust

### Recommended Pattern: CLI subprocess (not Rust crates)

**Decision:** Use `std::process::Command` to invoke tmux CLI directly. Do NOT use `tmux_interface` crate.

Research found that the `tmux_interface` crate is self-described as "experimental/unstable" with versions below 1.0 for development only. A Rust article from a tmux-native agent supervisor explicitly states: "There are Rust crates for tmux interaction. I tried them. They were incomplete, unmaintained, or abstracted away the things I needed most."

tmux CLI commands complete in 1-5ms. CLI subprocess overhead is negligible at session management frequency (launch, attach, detach — not called in hot loops).

**Confidence:** MEDIUM — verified against tmux_interface crate docs and DEV community article; CLI approach confirmed as recommended pattern.

### Key tmux Operations

```rust
use std::process::Command;

pub struct TmuxSession {
    pub name: String,
    pub socket_path: Option<String>,  // for named socket isolation
}

impl TmuxSession {
    /// Create new detached session with specific command
    pub fn create(name: &str, cmd: &str, cwd: &str) -> Result<(), String> {
        let status = Command::new("tmux")
            .args(["new-session", "-d", "-s", name, "-c", cwd, cmd])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("tmux new-session failed"));
        }
        Ok(())
    }

    /// Check if a named session exists
    pub fn exists(name: &str) -> bool {
        Command::new("tmux")
            .args(["has-session", "-t", name])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Detach all clients from session (keeps process alive)
    pub fn detach_clients(name: &str) -> Result<(), String> {
        Command::new("tmux")
            .args(["detach-client", "-s", name])
            .status()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Kill session and its processes
    pub fn kill(name: &str) -> Result<(), String> {
        Command::new("tmux")
            .args(["kill-session", "-t", name])
            .status()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// List active sessions (for state validation on reopen)
    pub fn list_sessions() -> Vec<String> {
        let output = Command::new("tmux")
            .args(["list-sessions", "-F", "#{session_name}"])
            .output()
            .unwrap_or_default();
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(String::from)
            .collect()
    }
}
```

### The Architecture: tmux + PTY Attachment

The critical insight is that GSD⚡MUX does NOT attach the Tauri process itself as a tmux client. Instead:

1. tmux sessions run independently — `tmux new-session -d -s gsd-main -c /project claude`
2. GSD⚡MUX attaches to the tmux session's PTY via `portable-pty` by attaching to the session's master PTY file descriptor
3. OR (simpler): spawn `tmux attach-session -t gsd-main` inside a `portable-pty` PTY that GSD⚡MUX controls

**Option A — Direct PTY attach (recommended):**

Spawn `tmux attach-session -t SESSION_NAME` in a `portable-pty` PtyPair. The master side gives you the raw terminal stream including the full tmux rendering (status bar, panes). This is what iTerm2 / WezTerm do. xterm.js renders the complete tmux output faithfully.

```rust
use portable_pty::{CommandBuilder, native_pty_system, PtySize};

pub fn attach_to_tmux_session(
    name: &str,
    cols: u16,
    rows: u16,
) -> Result<(Box<dyn MasterPty>, Box<dyn Child>), Box<dyn std::error::Error>> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["attach-session", "-t", name]);

    let child = pair.slave.spawn_command(cmd)?;
    Ok((pair.master, child))
}
```

**Option B — tmux new-session with direct process (recommended for simple panels):**

For the server pane or bash panel, skip tmux entirely and spawn the process directly in portable-pty. Only the main Claude Code / OpenCode session needs tmux persistence.

### Session Naming Convention

Use a stable naming scheme so reattach is deterministic:

```
gsd-{project_id}-main     # primary agent terminal
gsd-{project_id}-server   # dev server pane
gsd-{project_id}-bash     # auxiliary bash panel
```

Project ID derived from SHA-8 of absolute path, e.g. `gsd-a3f2c1b4-main`.

### Socket Isolation (optional but useful)

For multi-project isolation, each project can use a private tmux socket:

```
tmux -S /tmp/gsd-{project_id}.sock new-session -d -s main
```

This prevents `tmux kill-server` from nuking all GSD sessions. Keep a map of `project_id → socket_path` in state.json.

---

## Multi-Terminal Architecture

### Managing N Concurrent PTY Streams

GSD⚡MUX has up to 4-5 simultaneous terminal streams:
- Main panel: Claude Code / OpenCode session (always tmux-backed)
- Server pane: dev server (may be direct PTY, no tmux needed)
- Right panel bash: ad-hoc terminal
- Any additional tabs

**State map in Rust (AppState):**

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use portable_pty::MasterPty;

pub struct SessionState {
    pub master: Box<dyn MasterPty + Send>,
    pub tmux_name: Option<String>,  // None for direct PTY sessions
    pub paused: Arc<std::sync::atomic::AtomicBool>,
}

pub struct AppState {
    pub sessions: Mutex<HashMap<String, SessionState>>,
}
```

Each session has its own `MasterPty` and its own `Channel` endpoint (provided by the frontend at attach time). Sessions are fully isolated — one session's reader thread crashing does not affect others.

**Reader thread per session:**

One `tokio::task::spawn_blocking` per active session. These are independent — they don't share threads or channels. The Tokio blocking thread pool handles them efficiently (default pool size = available CPUs * 2).

```rust
// In AppState, one per active session:
let sessions: HashMap<String, SessionHandle> = HashMap::new();

struct SessionHandle {
    pty_master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,  // for stdin
    tmux_name: Option<String>,
    reader_task: tokio::task::JoinHandle<()>,
}
```

**WebGL context budget:**

Browsers cap WebGL contexts at ~8-16 (Chrome: 16, Firefox: 8). With 4-5 xterm.js instances using WebGL addon, this is fine. But if users add more tabs, context loss can occur silently. Implement WebGL context loss detection with canvas2d fallback:

```javascript
function createTerminal(container) {
  const term = new Terminal({ /* options */ });
  term.open(container);

  // Try WebGL first, fall back to canvas
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
      term.loadAddon(new CanvasAddon());
    });
    term.loadAddon(webgl);
  } catch (e) {
    term.loadAddon(new CanvasAddon());
  }
  return term;
}
```

**Stdin (xterm.js → Rust):**

```javascript
term.onData((data) => {
  invoke('session_write', {
    sessionId,
    data: Array.from(new TextEncoder().encode(data))
  });
});
```

Rust handler writes bytes directly to `session.writer` (the PTY slave write end):

```rust
#[tauri::command]
fn session_write(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&session_id).ok_or("not found")?;
    session.writer.write_all(&data).map_err(|e| e.to_string())
}
```

---

## Terminal Resize Flow

### xterm.js FitAddon → Rust → PTY

The correct flow has three steps that must happen in the right order:

1. **Container resize detected** (ResizeObserver watching the panel div)
2. **FitAddon.fit()** called → calculates new cols/rows based on font metrics → calls `term.resize(cols, rows)`
3. **Frontend invokes `session_resize`** with the new dimensions → Rust resizes the PTY master

```javascript
// In terminal.js component
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const observer = new ResizeObserver(() => {
  // Debounce to avoid resize storms during drag
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    fitAddon.fit();
    const { cols, rows } = term;
    invoke('session_resize', { sessionId, cols, rows });
  }, 50);
});
observer.observe(containerElement);
```

**Rust side:**

```rust
#[tauri::command]
fn session_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&session_id).ok_or("not found")?;
    session.pty_master
        .resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}
```

`portable_pty::MasterPty::resize()` sends SIGWINCH to the process group. This is the correct OS-level mechanism — the child process (tmux / Claude Code) then reads the new size via `ioctl(TIOCGWINSZ)`.

### Known tmux Resize Quirk

When attaching to an existing tmux session that has clients with different sizes, tmux defaults to the smallest client's dimensions. Solution: always call `session_resize` immediately after `session_attach`, before any rendering happens. Also pass `-x` and `-y` flags to `tmux attach-session` to force dimensions:

```rust
cmd.args(["attach-session", "-t", name, "-x", &cols.to_string(), "-y", &rows.to_string()]);
```

### Debounce is Required

FitAddon recalculates on every pixel change. Drag-resizing a split handle fires ResizeObserver continuously. Without debouncing, you get hundreds of `session_resize` invocations per second. 50ms debounce is the standard pattern — fast enough to feel responsive, slow enough not to flood Rust with syscalls.

---

## Arrow.js Component Structure

### No-Bundler Pattern for GSD⚡MUX

Arrow.js 2.x works with a direct CDN import. No bundler required. The official recommended import:

```javascript
import { reactive, html, watch } from 'https://esm.sh/@arrow-js/core';
```

For production, vendor the file locally to avoid CDN dependency:

```
src/vendor/arrow-core.js  (downloaded from esm.sh/@arrow-js/core)
```

**Confidence:** HIGH — from arrow-js.com official docs.

### Component Pattern for Resizable Layout

Arrow.js does not use `customElements.define` (not native Web Components). It uses a factory function pattern — `component()` wraps a function that returns an `html` template. Components mount once and reactively update via `reactive()` state.

**Layout component example:**

```javascript
// src/components/layout.js
import { reactive, html, component } from '../vendor/arrow-core.js';

export const appLayout = component((props) => {
  const layout = reactive({
    sidebarCollapsed: false,
    mainRatio: 0.5,     // sidebar | main+right
    rightRatio: 0.5,    // right-top | right-bottom
    serverPaneRatio: 0, // 0 = collapsed
  });

  function toggleSidebar() {
    layout.sidebarCollapsed = !layout.sidebarCollapsed;
  }

  return html`
    <div class="app-shell ${() => layout.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <div class="sidebar">
        ${props.sidebar}
      </div>
      <div class="main-panel" style="${() => `flex: ${layout.mainRatio}`}">
        ${props.mainTerminal}
      </div>
      <div class="right-panels" style="${() => `flex: ${1 - layout.mainRatio}`}">
        ${props.rightTop}
        ${props.rightBottom}
      </div>
    </div>
  `;
});
```

**State flows down, events flow up — Arrow.js enforces this naturally** because `reactive()` objects passed as props are observed lazily inside the component.

### Resizable Split Handle Pattern

```javascript
// src/components/split-handle.js
import { html, component } from '../vendor/arrow-core.js';

export const SplitHandle = component(({ axis, onResize }) => {
  let dragging = false;
  let startPos = 0;

  function onMousedown(e) {
    dragging = true;
    startPos = axis === 'horizontal' ? e.clientX : e.clientY;
    document.addEventListener('mousemove', onMousemove);
    document.addEventListener('mouseup', onMouseup);
    e.preventDefault();
  }

  function onMousemove(e) {
    if (!dragging) return;
    const pos = axis === 'horizontal' ? e.clientX : e.clientY;
    onResize(pos - startPos);
    startPos = pos;
  }

  function onMouseup() {
    dragging = false;
    document.removeEventListener('mousemove', onMousemove);
    document.removeEventListener('mouseup', onMouseup);
    invoke('state_save'); // persist split ratios after drag ends
  }

  return html`
    <div
      class="split-handle split-handle--${axis}"
      @mousedown="${onMousedown}"
    ></div>
  `;
});
```

### Terminal Component (xterm.js wrapper)

Arrow.js `html` templates are not the right place to initialize xterm.js. xterm.js needs a real DOM node. Use `component()` with an `onMount`-equivalent pattern via a `ref` callback:

```javascript
// src/components/terminal.js
import { html, component, reactive } from '../vendor/arrow-core.js';

export const TerminalPanel = component(({ sessionId }) => {
  const state = reactive({ connected: false, title: 'Terminal' });
  let term = null;

  // Arrow.js ref pattern: use a custom element or direct DOM ref
  function mountTerminal(el) {
    if (!el || term) return;
    term = new Terminal({
      fontFamily: 'FiraCode, monospace',
      fontSize: 14,
      fontWeight: '300',
      theme: window.__gsdTheme,  // set by theme.js on load
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    fitAddon.fit();
    attachTerminal(sessionId, term).then(() => {
      state.connected = true;
    });
  }

  return html`
    <div class="terminal-panel">
      <div class="terminal-title">${() => state.title}</div>
      <div
        class="terminal-container"
        ref="${mountTerminal}"
      ></div>
    </div>
  `;
});
```

Note: Arrow.js `ref` attribute calls the function with the DOM element when it mounts. Verify this works in the version you pin — the framework is being actively developed. Alternative: use a custom element wrapper (`<gsd-terminal>`) with standard `connectedCallback`.

### Import Map (No Bundler)

Use an import map in `index.html` to alias module names:

```html
<script type="importmap">
{
  "imports": {
    "@arrow-js/core": "/vendor/arrow-core.js",
    "@tauri-apps/api/core": "/vendor/tauri-api.js",
    "xterm": "/vendor/xterm.js",
    "@xterm/addon-fit": "/vendor/xterm-addon-fit.js",
    "@xterm/addon-webgl": "/vendor/xterm-addon-webgl.js"
  }
}
</script>
<script type="module" src="/app.js"></script>
```

This lets you write `import { html } from '@arrow-js/core'` in every component file without a bundler.

---

## State Serialization

### serde Pattern for App State

The state schema from the spec maps cleanly to serde. Key decisions:

1. Use `#[serde(rename_all = "camelCase")]` everywhere — state.json will be read by JS too
2. Use `#[serde(default)]` on all fields — forward-compatible with schema migrations
3. Use `Option<T>` for anything that may be absent after migration
4. Keep `version: u32` and implement a migration function

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AppState {
    pub version: u32,
    pub window: WindowState,
    pub sidebar: SidebarState,
    pub splits: SplitState,
    pub panels: PanelState,
    pub sessions: Vec<SessionConfig>,
    pub projects: Vec<ProjectConfig>,
    pub active_project: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SplitState {
    pub main: f64,           // sidebar | main+right ratio
    pub right: f64,          // right-top | right-bottom ratio
    pub server_pane: f64,    // 0.0 = collapsed
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionConfig {
    pub id: String,
    pub tmux_name: String,
    pub cmd: String,
    pub cwd: String,
    pub project_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", tag = "agentType")]
pub enum AgentConfig {
    ClaudeCode { cmd_override: Option<String> },
    OpenCode { cmd_override: Option<String> },
    Custom { cmd: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectConfig {
    pub id: String,           // SHA-8 of path
    pub name: String,
    pub path: String,
    pub agent: AgentConfig,
    pub gsd_file: String,    // default: "PLAN.md"
    pub server_cmd: Option<String>,
    pub tmux_socket: Option<String>,
}
```

**Migration pattern:**

```rust
const CURRENT_VERSION: u32 = 1;

pub fn load_state(path: &Path) -> AppState {
    let raw = std::fs::read_to_string(path).unwrap_or_default();
    let mut state: AppState = serde_json::from_str(&raw).unwrap_or_default();
    state = migrate(state);
    state
}

fn migrate(mut state: AppState) -> AppState {
    if state.version < 1 {
        // v0 → v1: add project id field
        for project in &mut state.projects {
            if project.id.is_empty() {
                project.id = sha8_of_path(&project.path);
            }
        }
        state.version = 1;
    }
    state
}
```

**State file location:**

```rust
fn state_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("~/.config"))
        .join("gsd-mux")
        .join("state.json")
}
```

Use the `dirs` crate (already a tauri transitive dependency) for `~/.config/gsd-mux/`.

### Enum Tagging for Panel Tab Types

Panels can show different views. Use internally-tagged enums — they serialize cleanly to JSON and are human-readable in state.json:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PanelTab {
    Terminal { session_id: String },
    GsdViewer { file_path: String },
    DiffViewer { repo_path: String, file: Option<String> },
    FileTree { root_path: String },
}
```

Serializes to:
```json
{ "type": "gsdViewer", "filePath": "/projects/foo/PLAN.md" }
{ "type": "terminal", "sessionId": "gsd-a3f2c1b4-main" }
```

---

## Build Order Implications

The components have hard dependencies that dictate phase ordering. Attempting to build them out of order creates unresolvable blockers.

```
Phase 1: Scaffold
  - Tauri 2 project structure
  - Arrow.js import map setup (vendor files, no CDN dependency)
  - 3-zone CSS layout with placeholder divs
  - Split handle dragging (CSS flex + ResizeObserver)
  - Sidebar collapse/expand
  PREREQUISITE FOR: everything

Phase 2: Terminal Integration  [HARDEST PHASE — most unknowns]
  - portable-pty integration in Rust
  - AppState with sessions HashMap (Mutex<HashMap>)
  - session_create / session_attach / session_write / session_resize commands
  - Channel-based PTY streaming (not Events)
  - xterm.js vendor + import map
  - TerminalPanel Arrow.js component (ref mount pattern)
  - FitAddon + ResizeObserver + debounced resize
  - Flow control (HIGH/LOW watermarks)
  - WebGL addon with canvas fallback
  REQUIRES: Phase 1

Phase 3: Terminal Theming
  - theme.json schema + serde loading
  - notify watcher on theme.json
  - xterm.js theme object construction
  - Hot reload: emit theme-change event → all terminals re-apply
  REQUIRES: Phase 2 (terminals must exist to theme)

Phase 4: Session Persistence
  - Full AppState serde schema
  - state_save / state_load Tauri commands
  - on_window_close event → save state → detach tmux sessions
  - on_startup → load state → session_attach for each saved session
  - Migration function (version field)
  REQUIRES: Phase 2 (session model must be defined)

Phase 5: Project System & Sidebar
  - ProjectConfig serde model
  - Project switching: tmux session swap + panel refresh
  - Sidebar Arrow.js component (projects list, sessions list)
  - git2 integration for git changes sidebar section
  REQUIRES: Phase 4 (state must persist project list)

Phase 6: Right Panel Views
  - GSD Markdown viewer (marked.js + checkbox write-back)
  - notify watcher on PLAN.md
  - Diff viewer (git2 diff output → syntax highlight)
  - File tree (fs_tree command + keyboard nav)
  - Right panel tab system (reuses tab bar component from Phase 2)
  REQUIRES: Phase 1 layout, Phase 5 project paths

Phase 7: Server Pane & Agent Support
  - Server pane as collapsable split inside main panel
  - Direct PTY spawn (no tmux) for dev server
  - action buttons: Restart / Stop / Open in Browser
  - Agent binary detection (which claude, which opencode)
  REQUIRES: Phase 2 (PTY infrastructure), Phase 5 (project config)

Phase 8: Polish
  - Global keyboard shortcut capture (Tauri global shortcut + focus routing)
  - Error recovery for crashed terminals
  - Lazy render (IntersectionObserver on offscreen panels)
  - Debounced file watcher events
  REQUIRES: all prior phases
```

**Critical path:** Phase 2 (Terminal Integration) is the highest-risk phase. All PTY mechanics, Channel streaming, and the Tauri IPC pattern must be proven here. If Channel throughput is insufficient for terminal data rates, the entire data flow architecture changes. Plan for a spike/prototype at Phase 2 start.

**Parallelizable after Phase 2:** Phases 3 and 5 have no dependency on each other. Phase 6 views (GSD viewer, diff viewer, file tree) are independent of terminal work and could be built as a standalone prototype.

---

## Architecture Diagram

```
Frontend (Webview)                    Rust Backend
─────────────────                    ─────────────
Arrow.js components
  TerminalPanel                       AppState
    xterm.js instance     ←Channel─   └─sessions: HashMap<id, SessionHandle>
    FitAddon                               └─ pty_master: MasterPty
    term.onData(data)                          reader_task (spawn_blocking)
       └─invoke('session_write')  ──►         writer: Box<dyn Write>
                                              tmux_name: Option<String>
  SidebarPanel
    project list          ←Event──    git2 watcher (notify crate)
    git changes           ←Event──    fs::notify on .git/

  GsdViewer              ←Event──    notify watcher on PLAN.md
    marked.js render
    checkbox click         ──►invoke('fs_write')

  SplitHandle
    ResizeObserver         ──►invoke('session_resize') ──► pty.resize()
    drag end               ──►invoke('state_save')

tmux (external process)
  sessions: gsd-{id}-main
            gsd-{id}-server
            gsd-{id}-bash
     ↑
     attached via: spawn 'tmux attach-session -t name' in portable-pty
```

---

## Open Questions & Risks

| Question | Risk | Mitigation |
|----------|------|------------|
| Does Tauri 2 `Channel<Vec<u8>>` binary payload work or does it base64 encode? | HIGH — affects latency | Test in Phase 2 spike; may need to keep bytes as `Vec<u8>` in serde |
| Arrow.js `ref` attribute behavior — is it stable in current version? | MEDIUM | Verify against pinned version; fallback is custom element wrapper |
| portable-pty `try_clone_reader()` thread safety with Tauri's AppState Mutex | MEDIUM | Ensure reader is extracted before locking; store JoinHandle not reader |
| tmux version on user machines — macOS ships old tmux (2.9 via Xcode) | LOW | Check version on startup; document minimum (3.0+); homebrew tmux recommended |
| WebGL context exhaustion beyond 4-5 terminals | LOW for MVP | Canvas fallback handles it; document as known limitation |
