# Phase 2: Terminal Integration - Research

**Researched:** 2026-04-06
**Domain:** PTY-backed terminal rendering (xterm.js + portable-pty + tmux + Tauri IPC)
**Confidence:** HIGH

## Summary

Phase 2 wires a real PTY-backed terminal into the main panel. The pipeline is: tmux session (spawned via `std::process::Command`) -> portable-pty master/slave -> Rust read loop -> `tauri::ipc::Channel<Vec<u8>>` -> JavaScript `Channel.onmessage` -> `xterm.js Terminal.write()`. The reverse path for input is: `xterm.js onData` -> `invoke('write_pty', { data })` -> Rust writer -> PTY master.

All major libraries and APIs have been verified against current documentation. The primary technical risk is Channel binary encoding overhead -- `Vec<u8>` serializes as a JSON number array (not Uint8Array), requiring conversion on the JS side. For typical terminal output volumes (< 100KB/s sustained), this is acceptable. The flow control mechanism (400KB HIGH / 100KB LOW watermarks) prevents buffer overflow during heavy output like `cat /dev/urandom | xxd`.

**Primary recommendation:** Build the `spawn_terminal` Tauri command as the first deliverable -- it exercises Channel, portable-pty, and tmux in one integration point. If Channel encoding works (expected), it becomes production code. Resize and flow control layer on top.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** On launch, probe for tmux via `tmux -V`. If missing, show a modal with install instructions (`brew install tmux`) and block terminal creation until resolved.
- **D-02:** tmux session names use the project directory basename (e.g., `efx-mux`). Simple, unique per project, matches tmux user expectations.
- **D-03:** Spawn sequence uses `tmux new-session -A -s {name}` -- creates or attaches in one command. Single code path for fresh launch and restore.
- **D-04:** The `Channel<Vec<u8>>` spike is built inline as the first Tauri command (`spawn_terminal`). If Channel works as expected, it's production code. If encoding doesn't work, refactor in place.
- **D-05:** PTY output streams via `tauri::ipc::Channel<Vec<u8>>` (per TERM-06). Binary encoding, ordered delivery, low-latency. Not JSON emit events.
- **D-06:** On `onContextLoss`, dispose WebGL addon and attempt to re-create it once. If second attempt fails, fall back to DOM renderer permanently for that session.
- **D-07:** Silent fallback -- no visible indicator when running in DOM mode. User doesn't need to know or care.
- **D-08:** xterm.js mounts via `document.querySelector('.terminal-area')` after Arrow.js renders the template. No Arrow.js `ref` attribute needed.
- **D-09:** Transparent pause on backpressure. PTY read thread stops reading when unacknowledged bytes exceed 400KB. No visible indicator.
- **D-10:** Watermark logic lives on the Rust side. PTY read loop tracks cumulative bytes sent via Channel.
- **D-11:** JS sends periodic byte-count ACKs via `invoke('ack_bytes', { count })` after xterm.js processes each chunk.
- **D-12:** 150ms trailing debounce on resize. FitAddon.fit() fires instantly, but `invoke('resize_pty', { cols, rows })` is debounced.
- **D-13:** Resize goes to PTY only via `PtyMaster::resize(PtySize { ... })`. tmux auto-adapts -- no explicit `tmux resize-window` needed.
- **D-14:** Resize is a control operation that always goes through, even during backpressure.

### Claude's Discretion
- PTY read loop buffer size (how many bytes to read per syscall)
- Channel chunk size (whether to coalesce small reads before sending)
- xterm.js Terminal options (scrollback size, cursor style, etc.)
- tmux default shell and environment setup
- Error UX for tmux session creation failures (beyond the missing-tmux modal)

### Deferred Ideas (OUT OF SCOPE)
- tmux session restore on app reopen -- Phase 4 (PERS-02)
- Dead tmux session detection and recovery -- Phase 4 (PERS-03)
- Terminal theming via theme.json -- Phase 3 (THEME-01)
- WebGL vs DOM performance monitoring/metrics -- not scoped
- Multiple terminal instances (right panel bash terminal) -- Phase 6 (PANEL-07)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TERM-01 | Real terminal (xterm.js 6.0) in main panel connected to live PTY | xterm.js 6.0 ESM verified, portable-pty 0.9.0 API verified, mount via querySelector on .terminal-area |
| TERM-02 | WebGL renderer with automatic DOM fallback on context loss | WebGL addon 0.19.0 `onContextLoss` event verified, retry-once-then-DOM pattern documented |
| TERM-03 | Terminal processes survive app close -- tmux sessions keep running | tmux 3.6a available, `new-session -A -s {name}` creates/attaches, tmux daemon persists after app exit |
| TERM-04 | Flow control -- backpressure at 400KB HIGH, resume at 100KB LOW | Rust-side watermark tracking in PTY read loop, JS ACK via invoke, pause/resume PTY reads |
| TERM-05 | Terminal resizes correctly when panel split handle dragged | FitAddon + ResizeObserver -> debounced invoke -> PtyMaster::resize(PtySize), tmux auto-adapts |
| TERM-06 | PTY stdout via `tauri::ipc::Channel<Vec<u8>>` (not JSON emit) | Channel API verified: send() requires IpcResponse (Serialize), Vec<u8> serializes as JSON number[], JS converts to Uint8Array |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No bundler:** Import map in `index.html`, vendored ESM files in `src/vendor/`
- **Arrow.js patterns:** `reactive()`, `html` tagged templates, `component()` -- no Custom Elements
- **Tauri invoke:** Via `window.__TAURI__.core` (withGlobalTauri: true)
- **xterm.js 6.0 only:** No canvas addon (removed in 6.0), WebGL + DOM fallback only
- **portable-pty 0.9.0:** One-shot `take_writer()`, keep slave alive until child exits
- **tmux via Command:** `std::process::Command`, not a Rust crate

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xterm/xterm | 6.0.0 | Terminal emulator UI | Only production-grade terminal for web; v6 has ESM support [VERIFIED: npm registry] |
| @xterm/addon-webgl | 0.19.0 | GPU-accelerated WebGL2 renderer | Required for smooth rendering at high throughput [VERIFIED: npm registry] |
| @xterm/addon-fit | 0.11.0 | Auto-fit terminal to container | Standard addon for responsive terminal sizing [VERIFIED: npm registry] |
| portable-pty | 0.9.0 | Cross-platform PTY abstraction | Used by WezTerm; stable API for PTY master/slave lifecycle [VERIFIED: docs.rs] |
| tauri::ipc::Channel | 2.10.x | Streaming IPC from Rust to JS | Ordered delivery, designed for child process output streaming [VERIFIED: v2.tauri.app docs] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokio (via tauri) | 1.x | Async runtime for spawn_blocking | PTY read loop runs on blocking thread; already bundled with Tauri [ASSUMED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| portable-pty | tauri-plugin-pty | Plugin is pre-release (0 published releases), less control over PTY lifecycle |
| Channel<Vec<u8>> | emit() events | emit() is fire-and-forget with no ordering guarantee; Channel is ordered and faster |
| Channel<Vec<u8>> | Custom URI scheme | More complex setup; Channel is the documented streaming pattern |

**Vendoring (no bundler):**

xterm.js packages provide ESM entry points (`.mjs` files). Vendor pattern matches Arrow.js:

```bash
# Install to node_modules, then copy ESM files to src/vendor/
pnpm add @xterm/xterm@6.0.0 @xterm/addon-webgl@0.19.0 @xterm/addon-fit@0.11.0
# Copy .mjs files and xterm.css to src/vendor/
```

Import map additions in `index.html`:
```json
{
  "imports": {
    "@arrow-js/core": "/vendor/arrow.js",
    "@xterm/xterm": "/vendor/xterm.mjs",
    "@xterm/addon-webgl": "/vendor/addon-webgl.mjs",
    "@xterm/addon-fit": "/vendor/addon-fit.mjs"
  }
}
```

CSS link addition:
```html
<link rel="stylesheet" href="/vendor/xterm.css" />
```

[VERIFIED: npm pack --dry-run confirms lib/xterm.mjs, lib/addon-webgl.mjs, lib/addon-fit.mjs, css/xterm.css]

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    main-panel.js        # Updated: mounts xterm.js Terminal
  terminal/
    terminal-manager.js  # xterm.js lifecycle: create, mount, WebGL/DOM fallback
    pty-bridge.js        # Channel setup, write-to-pty, ack-bytes, flow control
    resize-handler.js    # ResizeObserver + FitAddon + debounced invoke
  vendor/
    xterm.mjs            # Vendored @xterm/xterm ESM
    addon-webgl.mjs      # Vendored @xterm/addon-webgl ESM
    addon-fit.mjs        # Vendored @xterm/addon-fit ESM
    xterm.css            # Vendored xterm.js base CSS
src-tauri/src/
  lib.rs                 # Updated: register spawn_terminal, write_pty, resize_pty, ack_bytes
  terminal/
    mod.rs               # PTY state management, command implementations
    pty.rs               # portable-pty wrapper, read loop, flow control
```

### Pattern 1: Tauri Channel for PTY Streaming (Rust side)

**What:** Spawn PTY in tmux, stream output via Channel, accept input via invoke
**When to use:** Always -- this is the core data pipeline

```rust
// Source: https://v2.tauri.app/develop/calling-rust/ (Channels section)
use portable_pty::{native_pty_system, PtySize, CommandBuilder};
use std::sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}};
use std::io::Read;

struct PtyState {
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    sent_bytes: Arc<AtomicU64>,
    acked_bytes: Arc<AtomicU64>,
}

#[tauri::command]
async fn spawn_terminal(
    app: tauri::AppHandle,
    on_output: tauri::ipc::Channel<Vec<u8>>,
    session_name: String,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24, cols: 80,
        pixel_width: 0, pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["new-session", "-A", "-s", &session_name]);

    let _child = pair.slave.spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer()
        .map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| e.to_string())?;

    let sent_bytes = Arc::new(AtomicU64::new(0));
    let acked_bytes = Arc::new(AtomicU64::new(0));

    // Store state for write_pty/resize_pty/ack_bytes commands
    // (use app.manage() or a global Mutex<Option<PtyState>>)

    let sent = sent_bytes.clone();
    let acked = acked_bytes.clone();

    // PTY read loop on blocking thread
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        loop {
            // Flow control: pause if too far ahead
            let unacked = sent.load(Ordering::Relaxed)
                - acked.load(Ordering::Relaxed);
            if unacked > 400_000 {
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }

            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    sent.fetch_add(n as u64, Ordering::Relaxed);
                    if on_output.send(chunk).is_err() {
                        break; // Channel closed
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}
```

### Pattern 2: Channel + xterm.js (JavaScript side)

**What:** Create Channel, pass to invoke, write received data to xterm.js Terminal
**When to use:** When mounting the terminal and starting the PTY connection

```javascript
// Source: https://v2.tauri.app/develop/calling-frontend/ (Channels section)
const { invoke, Channel } = window.__TAURI__.core;

const channel = new Channel();
channel.onmessage = (data) => {
    // data arrives as number[] (JSON-serialized Vec<u8>)
    // xterm.js write() accepts Uint8Array
    const bytes = new Uint8Array(data);
    terminal.write(bytes);
    // ACK bytes for flow control
    invoke('ack_bytes', { count: bytes.length });
};

await invoke('spawn_terminal', {
    onOutput: channel,
    sessionName: 'efx-mux',
});
```

### Pattern 3: WebGL Fallback Strategy

**What:** Try WebGL, handle context loss, fall back to DOM
**When to use:** On terminal creation

```javascript
// Source: xterm.js addon-webgl README
import { WebglAddon } from '@xterm/addon-webgl';

function attachRenderer(terminal) {
    let attempts = 0;
    function tryWebGL() {
        try {
            const webgl = new WebglAddon();
            webgl.onContextLoss(() => {
                webgl.dispose();
                attempts++;
                if (attempts < 2) {
                    tryWebGL(); // Retry once
                }
                // If second attempt also fails, DOM renderer is already active
            });
            terminal.loadAddon(webgl);
        } catch (e) {
            // WebGL2 not available -- DOM renderer is the default
        }
    }
    tryWebGL();
}
```

### Pattern 4: Resize Pipeline

**What:** ResizeObserver -> FitAddon -> debounced IPC -> PTY resize
**When to use:** After terminal mounts, and when panel split handles are dragged

```javascript
import { FitAddon } from '@xterm/addon-fit';

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

let resizeTimer = null;
const observer = new ResizeObserver(() => {
    fitAddon.fit(); // Instant visual reflow
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const { cols, rows } = terminal;
        invoke('resize_pty', { cols, rows });
    }, 150); // D-12: 150ms trailing debounce
});
observer.observe(document.querySelector('.terminal-area'));
```

### Anti-Patterns to Avoid
- **Calling take_writer() twice:** It is a one-shot method. Store the writer in `Arc<Mutex<>>` and reuse. [CITED: CLAUDE.md portable-pty gotchas]
- **Dropping the slave early:** The PTY slave must stay alive until the child process exits. Keep `pair.slave` in the PtyState struct. [CITED: CLAUDE.md portable-pty gotchas]
- **Using emit() for PTY output:** emit() has no ordering guarantee and serializes everything as JSON strings. Channel is ordered and designed for streaming. [CITED: v2.tauri.app/develop/calling-rust/]
- **Arrow.js ref for terminal mount:** The `ref` attribute in WKWebView was an unknown. Decision D-08 eliminates this -- use `querySelector('.terminal-area')` after Arrow.js renders. [CITED: 02-CONTEXT.md D-08]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal emulation | Custom ANSI parser | @xterm/xterm 6.0 | Thousands of escape sequences, Unicode width tables, reflow |
| GPU rendering | Custom WebGL shader | @xterm/addon-webgl | WebGL2 text atlas, glyph caching, context loss recovery |
| Terminal sizing | Manual cols/rows calc | @xterm/addon-fit | Character metrics, padding, DPI awareness |
| PTY abstraction | Raw libc forkpty | portable-pty 0.9.0 | Cross-platform, proper signal handling, resize |
| IPC streaming | WebSocket bridge | tauri::ipc::Channel | Integrated with Tauri lifecycle, ordered delivery |
| Flow control | None (hope for best) | Watermark-based pause/resume | Heavy AI output will overflow buffers without backpressure |

**Key insight:** The terminal stack is deceptively complex. Even "just rendering" text requires handling thousands of VT sequences, Unicode grapheme clusters, wide characters, and reflow on resize. xterm.js handles all of this.

## Common Pitfalls

### Pitfall 1: Channel Vec<u8> Arrives as JSON number[]
**What goes wrong:** Developer expects Uint8Array on JS side, gets a plain JavaScript Array of numbers
**Why it happens:** Tauri Channel serializes via serde JSON. `Vec<u8>` becomes `[104, 101, 108, 108, 111]` not a binary ArrayBuffer. [VERIFIED: github.com/tauri-apps/tauri/discussions/6286]
**How to avoid:** Wrap in `new Uint8Array(data)` before passing to `terminal.write()`. This conversion is O(n) but fast for typical terminal chunks (< 4KB).
**Warning signs:** Terminal shows nothing or garbled output; `typeof data` in onmessage is "object" (Array), not Uint8Array

### Pitfall 2: Import Map Must Precede Module Scripts
**What goes wrong:** `Bare specifier '@xterm/xterm' not in import map` error at runtime
**Why it happens:** Browser processes `<script type="importmap">` only if it appears before any `<script type="module">` tags
**How to avoid:** Import map is already first in index.html (Phase 1 established this pattern). Just add xterm entries to existing map.
**Warning signs:** Console error on page load about bare specifiers

### Pitfall 3: xterm.js CSS Not Loaded
**What goes wrong:** Terminal renders with wrong dimensions, text overlaps, cursor misaligned
**Why it happens:** xterm.js requires its base CSS (`xterm.css`) for correct layout. Without it, the terminal container has no proper sizing.
**How to avoid:** Vendor `css/xterm.css` alongside the JS files and add `<link rel="stylesheet" href="/vendor/xterm.css" />` to index.html
**Warning signs:** Terminal visible but visually broken, characters overlapping

### Pitfall 4: ResizeObserver Infinite Loop
**What goes wrong:** FitAddon.fit() changes terminal dimensions, which triggers ResizeObserver, which calls fit() again
**Why it happens:** fit() may change the terminal element's size, re-triggering the observer
**How to avoid:** Track last known cols/rows; only invoke resize_pty if dimensions actually changed. FitAddon.fit() itself is safe to call repeatedly (it's a no-op if dimensions haven't changed).
**Warning signs:** High CPU, rapid IPC calls, terminal flickering

### Pitfall 5: PTY Read Loop Blocks Tokio Runtime
**What goes wrong:** Terminal output stalls, app becomes unresponsive
**Why it happens:** portable-pty reader is synchronous (`impl Read`). Running it on a Tokio async task starves the runtime.
**How to avoid:** Use `std::thread::spawn` (not `tokio::spawn`) for the PTY read loop. It's a dedicated OS thread that blocks on `read()`. [CITED: CLAUDE.md git2 gotchas -- same pattern applies]
**Warning signs:** Terminal works briefly then freezes; other Tauri commands stop responding

### Pitfall 6: tmux Session Name Collision
**What goes wrong:** Two projects with same directory basename collide on tmux session
**Why it happens:** D-02 uses basename only. If user has `~/projects/efx-mux` and `~/work/efx-mux`, both get session name "efx-mux"
**How to avoid:** For Phase 2, this is acceptable (single-project MVP). Phase 5 project system will need a disambiguation strategy.
**Warning signs:** Opening second project attaches to first project's tmux session

### Pitfall 7: xterm.js Vendored ESM Internal Imports
**What goes wrong:** Vendored `.mjs` files may import from relative paths or other package files that aren't in the vendor directory
**Why it happens:** xterm.js addon-webgl may import from @xterm/xterm internals
**How to avoid:** After vendoring, check each .mjs file for import statements. Ensure all referenced files are also vendored. May need to adjust import paths.
**Warning signs:** 404 errors in devtools Network tab for missing .mjs files

## Code Examples

### Tauri Command Registration

```rust
// Source: existing lib.rs pattern + Tauri docs
// In lib.rs, add commands to the builder:
tauri::Builder::default()
    .setup(|app| { /* existing menu setup */ Ok(()) })
    .invoke_handler(tauri::generate_handler![
        spawn_terminal,
        write_pty,
        resize_pty,
        ack_bytes,
    ])
    .run(tauri::generate_context!())
```

### write_pty Command

```rust
#[tauri::command]
fn write_pty(data: String, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    let mut writer = state.writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}
```

### resize_pty Command

```rust
use portable_pty::PtySize;

#[tauri::command]
fn resize_pty(cols: u16, rows: u16, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    state.master.resize(PtySize {
        rows, cols,
        pixel_width: 0, pixel_height: 0,
    }).map_err(|e| e.to_string())
}
```

### xterm.js onData for Input

```javascript
// Source: xterm.js Terminal API
terminal.onData((data) => {
    // data is a string of characters the user typed
    invoke('write_pty', { data });
});
```

### tmux Probe on Startup

```rust
use std::process::Command;

fn check_tmux() -> Result<String, String> {
    let output = Command::new("tmux")
        .arg("-V")
        .output()
        .map_err(|_| "tmux not found. Install with: brew install tmux".to_string())?;
    if !output.status.success() {
        return Err("tmux not found".to_string());
    }
    String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())
        .map(|s| s.trim().to_string())
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| xterm.js 5.x + canvas addon | xterm.js 6.0 WebGL-only (no canvas) | 2025 | canvas addon removed; WebGL + DOM only |
| Tauri emit() for streaming | tauri::ipc::Channel | Tauri 2.0 (2024) | Ordered delivery, designed for streaming |
| JSON string IPC | Channel with binary support | Tauri 2.0 | Vec<u8> still JSON-serialized but Channel is faster than emit |
| @xterm/xterm (scoped) | Same | 5.x -> 6.0 | Package scope unchanged; breaking API changes in options |

**Deprecated/outdated:**
- `@xterm/addon-canvas`: Removed in 6.0. Do not import. [CITED: CLAUDE.md xterm.js section]
- `overviewRulerWidth` option: Moved to `overviewRuler.width` in xterm.js 6.0 [CITED: CLAUDE.md xterm.js breaking changes]
- `windowsMode` and `fastScrollModifier` options: Removed in 6.0 [CITED: CLAUDE.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | tokio is bundled with Tauri 2 and available for spawn_blocking | Standard Stack | LOW -- Tauri uses tokio internally; if not re-exported, use std::thread directly (which is the PTY read loop pattern anyway) |
| A2 | xterm.js addon-webgl .mjs can be vendored standalone without bundler | Architecture Patterns | MEDIUM -- if addons import from @xterm/xterm internals, import map must resolve those paths |
| A3 | Channel<Vec<u8>>.send() performance is adequate for terminal output (< 100KB/s typical) | Architecture Patterns | LOW -- official docs recommend Channel for child process output; flow control handles burst scenarios |
| A4 | portable-pty MasterPty can be stored across threads via Arc | Code Examples | LOW -- docs.rs shows Send bound; PtyState pattern requires Send + 'static for Tauri managed state |

## Open Questions

1. **xterm.js addon ESM vendoring dependencies**
   - What we know: Each addon has a `.mjs` file. Addons depend on @xterm/xterm core.
   - What's unclear: Whether addon `.mjs` files import from `@xterm/xterm` bare specifier (resolved by import map) or from relative paths that need manual adjustment.
   - Recommendation: Install packages, inspect .mjs import statements before vendoring. Import map should handle bare specifier imports.

2. **Channel<Vec<u8>> serialization overhead at scale**
   - What we know: Vec<u8> serializes as JSON number[]. For 4KB chunks, this means ~16KB of JSON text (each byte becomes 1-3 digits + comma).
   - What's unclear: Exact throughput ceiling before Channel becomes a bottleneck.
   - Recommendation: Flow control at 400KB watermark mitigates this. If profiling shows overhead, can switch to Channel<String> with base64 (smaller JSON) or custom protocol. Unlikely to matter for terminal use case.

3. **Tauri managed state for PtyState**
   - What we know: Tauri's `app.manage()` stores state accessible via `State<'_, T>` in commands.
   - What's unclear: Whether MasterPty (from portable-pty) satisfies `Send + Sync + 'static` required by Tauri managed state. The writer is wrapped in `Arc<Mutex<>>` which provides Sync. MasterPty itself needs verification.
   - Recommendation: If MasterPty is not Send, wrap the entire PtyState creation and access in a dedicated thread with message passing. Alternatively, use a global `static Mutex<Option<PtyState>>`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| tmux | TERM-03 (session persistence) | Yes | 3.6a | None -- D-01 requires blocking modal if missing |
| portable-pty | TERM-01 (PTY spawning) | N/A (Rust crate) | 0.9.0 | None -- core dependency |
| @xterm/xterm | TERM-01 (terminal rendering) | N/A (npm) | 6.0.0 | None -- core dependency |
| pnpm | Package installation | Yes | (installed) | npm as fallback |

[VERIFIED: tmux 3.6a at /opt/homebrew/bin/tmux]

**Missing dependencies with no fallback:** None -- all dependencies available or installable via package manager.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual UAT (no automated test framework established yet) |
| Config file | none |
| Quick run command | `cargo build --manifest-path src-tauri/Cargo.toml` (compile check) |
| Full suite command | `cargo tauri dev` + manual terminal interaction |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TERM-01 | Terminal renders and accepts input | manual | `cargo tauri dev` -> type commands | N/A |
| TERM-02 | WebGL fallback on context loss | manual | Force context loss via devtools | N/A |
| TERM-03 | tmux survives app close | manual | Close app, `tmux ls`, reopen | N/A |
| TERM-04 | Flow control under heavy output | manual | `cat /dev/urandom \| xxd` -> check responsiveness | N/A |
| TERM-05 | Resize reflows correctly | manual | Drag split handle, verify no corruption | N/A |
| TERM-06 | Channel streaming (not emit) | code review | Verify Channel usage in spawn_terminal | N/A |

### Sampling Rate
- **Per task commit:** `cargo build --manifest-path src-tauri/Cargo.toml` (Rust compiles)
- **Per wave merge:** `cargo tauri dev` + manual smoke test (type a command, see output)
- **Phase gate:** All 5 success criteria verified manually

### Wave 0 Gaps
- None -- this phase is primarily integration work tested via manual UAT. Automated testing for terminal behavior is impractical (requires real PTY + tmux).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- local desktop app |
| V3 Session Management | No | N/A -- tmux sessions are local |
| V4 Access Control | No | N/A -- single user |
| V5 Input Validation | Yes | Sanitize tmux session name (D-02: basename only, no shell metacharacters) |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for PTY/Terminal Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via session name | Tampering | Sanitize session name: alphanumeric + hyphen only, reject shell metacharacters |
| PTY escape sequences (terminal injection) | Tampering | xterm.js handles parsing; no raw terminal output displayed outside xterm |
| Unbounded memory from PTY output | Denial of Service | Flow control watermarks (D-09 through D-11) cap unprocessed data at 400KB |

## Sources

### Primary (HIGH confidence)
- [Tauri 2 Channel API](https://docs.rs/tauri/2.10.2/tauri/ipc/struct.Channel.html) - Channel struct, send() method, IpcResponse trait bounds
- [Tauri 2 Calling Rust](https://v2.tauri.app/develop/calling-rust/) - Channel usage pattern for streaming, load_image example with `Channel<&[u8]>`
- [Tauri 2 Calling Frontend](https://v2.tauri.app/develop/calling-frontend/) - JS Channel class, onmessage pattern, complete download example
- [portable-pty docs.rs](https://docs.rs/portable-pty/0.9.0/portable_pty/) - PtySystem, MasterPty, SlavePty, CommandBuilder APIs
- [npm @xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) - Version 6.0.0 confirmed, ESM entry point lib/xterm.mjs
- [npm @xterm/addon-webgl](https://www.npmjs.com/package/@xterm/addon-webgl) - Version 0.19.0, onContextLoss event
- [xterm.js Terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/) - write() accepts string | Uint8Array

### Secondary (MEDIUM confidence)
- [Tauri Vec<u8> Discussion](https://github.com/tauri-apps/tauri/discussions/6286) - Confirms Vec<u8> serializes as number[] in JS, not Uint8Array
- [Tauri binary data issue](https://github.com/tauri-apps/tauri/issues/13405) - Channel supports binary but via JSON serialization
- [Tauri core JS API](https://v2.tauri.app/reference/javascript/api/namespacecore/) - Channel class constructor, onmessage accessor

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified against npm/docs.rs, APIs confirmed
- Architecture: HIGH - Patterns sourced from official docs, aligned with CONTEXT.md decisions
- Pitfalls: HIGH - Channel serialization behavior verified via GitHub discussions, xterm.js behaviors from docs

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable libraries, slow-moving ecosystem)
