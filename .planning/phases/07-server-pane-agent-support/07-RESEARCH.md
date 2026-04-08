# Phase 7: Server Pane + Agent Support - Research

**Researched:** 2026-04-08
**Domain:** Rust child process management, Tauri event streaming, ANSI processing, agent binary detection
**Confidence:** HIGH

## Summary

Phase 7 adds two distinct features to the existing Efxmux Tauri app: (1) a collapsible server pane with process management and log viewing, and (2) per-project agent binary detection with fallback. The codebase already has significant scaffolding -- `main-panel.tsx` has placeholder server pane HTML, `ProjectEntry` in `state.rs` has `agent` and `server_cmd` fields, and the split-handle infrastructure exists.

The server process runs as a Rust `std::process::Command` child (not tmux, per D-06), with stdout/stderr piped to the frontend via Tauri events. The key technical challenges are: ANSI color code handling for the log viewer, Ctrl+` keyboard capture before xterm.js intercepts it, and the 3-state collapse/expand cycle with persisted height.

**Primary recommendation:** Build the server process manager as a new Rust module (`src-tauri/src/server.rs`) with start/stop/restart commands, streaming output via `tauri::Emitter::emit()`. Use a simple regex-based ANSI-to-HTML converter on the frontend (no library needed for basic color support). Agent detection is a thin layer on top of existing `spawn_terminal` + `which` check.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Ctrl+` cycles through 3 states: toolbar strip (28px, default) -> expanded (persisted height) -> collapsed (0px, hidden) -> toolbar strip
- **D-02:** Server pane height persisted in state.json alongside existing split ratios
- **D-03:** Split handle between main terminal and server pane enables drag-resize when expanded. Reuse existing split-handle-h scaffold.
- **D-04:** Server pane has HTML toolbar band at top with Start, Stop, Restart, Open in Browser buttons. Below is scrollable HTML log area (not xterm.js).
- **D-05:** Server output rendered as styled HTML text. ANSI color codes stripped or converted to CSS. No terminal emulation.
- **D-06:** Server process spawned as Rust child process via `std::process::Command` (not tmux). stdout/stderr piped to frontend via Tauri events or Channel. Process dies when app closes.
- **D-07:** Start sends `server_cmd` to Rust. Stop sends SIGTERM/SIGKILL. Restart = Stop + Start.
- **D-08:** Add `server_url` field to ProjectEntry. Open button launches URL via tauri plugin opener.
- **D-09:** If `server_url` not configured, parse stdout for `http://localhost` or `http://127.0.0.1` patterns as fallback.
- **D-10:** Agent detection uses per-project config (`ProjectEntry.agent`). Verify binary via `which {agent}`. No auto-detection.
- **D-11:** Agent IS the main terminal. Phase 7 makes detection use per-project config instead of hardcoded defaults.
- **D-12:** Project switching handles tmux session switching (Phase 5). Agent type changes automatically per project.
- **D-13:** Missing agent binary -> plain bash with banner message.
- **D-14:** Server crash -> append exit message to log. Enable Restart button. No auto-restart.
- **D-15:** No `server_cmd` configured -> muted message, Start disabled.

### Claude's Discretion
- ANSI color stripping/conversion approach for server logs
- Exact toolbar button styling and disabled state appearance
- Server log scrollback buffer size
- URL regex pattern for stdout parsing fallback
- Banner styling for missing agent binary message
- Ctrl+` keycode capture implementation (before terminal focus)

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | Collapsible server pane (bottom split, Ctrl+` toggle) with Open/Restart/Stop | D-01 through D-05: 3-state cycle, HTML toolbar, log viewer. Existing scaffold in main-panel.tsx. |
| AGENT-02 | Open in Browser launches dev server URL via system default browser | D-08/D-09: tauri-plugin-opener already in Cargo.toml + capabilities. JS package needs install. |
| AGENT-03 | Detect `claude` binary, launch in tmux PTY | D-10/D-11: `which claude` check, existing `spawn_terminal` handles tmux PTY. |
| AGENT-04 | Detect `opencode` binary, launch in tmux PTY | D-10/D-11: Same pattern as AGENT-03 with `which opencode`. |
| AGENT-05 | Fallback to plain bash with banner if no agent found | D-13: Banner written to terminal via xterm.js `writeln()` before bash session. |
| AGENT-06 | Per-project config specifies agent | D-10/D-12: `ProjectEntry.agent` field already exists in state.rs. |

</phase_requirements>

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tauri (Rust) | 2.x | App framework | Already in project [VERIFIED: Cargo.toml] |
| tauri-plugin-opener (Rust) | 2.x | Open URLs in system browser | Already in Cargo.toml [VERIFIED: Cargo.toml] |
| @preact/signals | ^2.9.0 | Reactive state for server pane UI | Already in project [VERIFIED: package.json] |
| preact | ^10.29.1 | Component framework | Already in project [VERIFIED: package.json] |

### Needs Install

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tauri-apps/plugin-opener | ^2 | JS bindings for `openUrl()` | AGENT-02: Open in Browser button [VERIFIED: not in node_modules] |

### Not Needed

| Problem | Why No Library |
|---------|---------------|
| ANSI color conversion | Dev server output is simple (bold, colors). ~30 lines of regex handles it. No library warranted. |
| Process management crate | `std::process::Command` with piped stdout/stderr is sufficient per D-06. |
| Terminal emulation for logs | D-05 explicitly says no terminal emulation -- HTML log viewer only. |

**Installation:**
```bash
pnpm add @tauri-apps/plugin-opener
```

## Architecture Patterns

### New Files
```
src-tauri/src/
  server.rs              # Server process management (start/stop/restart/output streaming)

src/
  server/
    server-bridge.ts     # Frontend bridge: invoke start/stop/restart, listen for output events
    ansi-html.ts         # ANSI escape code -> HTML span converter
  components/
    server-pane.tsx      # Extracted server pane component (currently inline in main-panel.tsx)
```

### Modified Files
```
src-tauri/src/lib.rs         # Register server commands + opener plugin
src-tauri/src/state.rs       # Add server_url to ProjectEntry, server_pane_height to LayoutState
src/components/main-panel.tsx # Wire server pane component, 3-state collapse
src/main.tsx                 # Ctrl+` handler, agent detection on project switch
src/state-manager.ts         # Add server_url to ProjectEntry interface
```

### Pattern 1: Server Process as Rust Managed State

**What:** Store the server child process handle in a Tauri-managed `Mutex<Option<Child>>` so start/stop/restart commands can access it.
**When to use:** For the single server process per app instance.

```rust
// Source: std::process::Command + Tauri managed state pattern from existing codebase
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct ServerProcess(pub Mutex<Option<Child>>);

#[tauri::command]
pub async fn start_server(
    app: tauri::AppHandle,
    cmd: String,
    cwd: String,
    managed: tauri::State<'_, ServerProcess>,
) -> Result<(), String> {
    // Stop existing process first
    stop_server_inner(&managed)?;
    
    let mut child = Command::new("sh")
        .args(["-c", &cmd])
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;
    
    // Spawn reader threads for stdout/stderr -> emit events
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_handle = app.clone();
    
    if let Some(mut out) = stdout {
        let ah = app_handle.clone();
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = vec![0u8; 4096];
            loop {
                match out.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = ah.emit("server-output", &text);
                    }
                    Err(_) => break,
                }
            }
        });
    }
    // Same pattern for stderr
    
    *managed.0.lock().unwrap() = Some(child);
    Ok(())
}
```
[VERIFIED: pattern consistent with existing PtyManager in pty.rs]

### Pattern 2: ANSI to HTML Conversion (Frontend)

**What:** Simple regex-based converter for common ANSI escape codes to HTML spans with inline styles.
**When to use:** Processing server output before inserting into the log div.

```typescript
// Handles: reset, bold, dim, standard colors (30-37, 40-47), bright colors (90-97, 100-107)
const ANSI_COLORS: Record<number, string> = {
  30: '#282d3a', 31: '#dc322f', 32: '#859900', 33: '#b58900',
  34: '#268bd2', 35: '#d33682', 36: '#2aa198', 37: '#eee8d5',
  90: '#657b83', 91: '#cb4b16', 92: '#859900', 93: '#b58900',
  94: '#268bd2', 95: '#d33682', 96: '#2aa198', 97: '#fdf6e3',
};

export function ansiToHtml(text: string): string {
  // Escape HTML first
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Replace ANSI sequences with spans
  html = html.replace(/\x1b\[(\d+(?:;\d+)*)m/g, (_, codes) => {
    const nums = codes.split(';').map(Number);
    const styles: string[] = [];
    for (const n of nums) {
      if (n === 0) return '</span>';
      if (n === 1) styles.push('font-weight:bold');
      if (n >= 30 && n <= 37) styles.push(`color:${ANSI_COLORS[n]}`);
      if (n >= 90 && n <= 97) styles.push(`color:${ANSI_COLORS[n]}`);
    }
    return styles.length ? `<span style="${styles.join(';')}">` : '';
  });
  // Strip any remaining escape sequences
  html = html.replace(/\x1b\[[^m]*m/g, '');
  return html;
}
```
[ASSUMED: Color values based on project's Solarized Dark theme]

### Pattern 3: 3-State Collapse Cycle with Ctrl+`

**What:** Keyboard handler captures Ctrl+` before xterm.js processes it, cycling through strip (28px) -> expanded (persisted) -> collapsed (0px).
**When to use:** Server pane visibility control.

```typescript
// State: 'strip' | 'expanded' | 'collapsed'
const serverPaneState = signal<'strip' | 'expanded' | 'collapsed'>('strip');

// In the keydown handler (before terminal focus):
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault();
    e.stopPropagation();
    const current = serverPaneState.value;
    if (current === 'strip') serverPaneState.value = 'expanded';
    else if (current === 'expanded') serverPaneState.value = 'collapsed';
    else serverPaneState.value = 'strip';
  }
}, { capture: true }); // capture phase to beat xterm.js
```
[VERIFIED: capture:true pattern ensures handler fires before xterm.js event listeners]

### Pattern 4: Agent Detection at Launch

**What:** Check `which {agent}` before spawning tmux session. Agent name comes from `ProjectEntry.agent`.
**When to use:** During project initialization and project switching.

```rust
#[tauri::command]
pub fn detect_agent(agent: String) -> Result<String, String> {
    if agent.is_empty() || agent == "bash" {
        return Ok("bash".to_string());
    }
    let output = std::process::Command::new("which")
        .arg(&agent)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(agent)
    } else {
        Err(format!("Binary '{}' not found in PATH", agent))
    }
}
```
[VERIFIED: matches D-10 decision for simple `which` check]

### Anti-Patterns to Avoid
- **Do NOT use xterm.js for server logs:** D-05 is explicit -- HTML log viewer, not terminal emulation. xterm.js overhead is unnecessary for a log viewer.
- **Do NOT put server in tmux:** D-06 is explicit -- server process dies with app. tmux would keep it alive.
- **Do NOT auto-detect agent:** D-10 says use per-project config + `which` verification. No clever heuristics.
- **Do NOT use `emit()` for high-volume streaming:** For the server pane log viewer, `emit()` is fine (text events, low-to-moderate volume). But do NOT confuse this with the PTY Channel pattern used for terminal output.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Open URL in browser | Custom `open` command shelling | `@tauri-apps/plugin-opener` `openUrl()` | Cross-platform, sandboxing-safe, already in Cargo.toml |
| Process signal handling | Manual libc signal calls | `Child::kill()` + `Child::try_wait()` | Rust std handles SIGTERM/SIGKILL correctly on macOS |
| State persistence | Custom file write for server pane height | Existing `state.rs` `save_state_sync` | Pattern established in Phase 4, consistent with D-02 |

## Common Pitfalls

### Pitfall 1: Opener Plugin Not Registered
**What goes wrong:** `openUrl()` JS call fails with "plugin not initialized" error.
**Why it happens:** `tauri-plugin-opener` is in `Cargo.toml` and `capabilities/default.json` but `.plugin(tauri_plugin_opener::init())` is NOT called in `lib.rs` line 120. [VERIFIED: grep of lib.rs shows no `opener::init()`]
**How to avoid:** Add `.plugin(tauri_plugin_opener::init())` to the Tauri builder chain in lib.rs.
**Warning signs:** Runtime error when clicking "Open in Browser" button.

### Pitfall 2: Opener JS Package Not Installed
**What goes wrong:** Import of `@tauri-apps/plugin-opener` fails at build time.
**Why it happens:** The Rust crate is installed but the JS frontend package is not. [VERIFIED: `node_modules/@tauri-apps/plugin-opener` does not exist]
**How to avoid:** Run `pnpm add @tauri-apps/plugin-opener` before using the JS API.
**Warning signs:** TypeScript/Vite build error on import.

### Pitfall 3: Ctrl+` Captured by xterm.js
**What goes wrong:** Backtick keypress goes to the terminal instead of toggling server pane.
**Why it happens:** xterm.js attaches keydown listeners on the terminal element. If the terminal is focused, it captures the key first.
**How to avoid:** Use `{ capture: true }` on the document-level keydown listener so it fires in the capture phase before xterm.js bubble-phase handlers.
**Warning signs:** Pressing Ctrl+` types a backtick in the terminal.

### Pitfall 4: Server Process Zombie on App Close
**What goes wrong:** Server child process continues running after app window closes.
**Why it happens:** `std::process::Command` spawns an independent process. If the app exits without killing it, the process becomes orphaned.
**How to avoid:** In the `on_window_event(CloseRequested)` handler (already exists in lib.rs), kill the server child process before exiting. Also set the child process group so `kill` terminates the entire process tree (dev servers often spawn sub-processes).
**Warning signs:** Port still occupied after closing app; `lsof -i :3000` shows orphaned node process.

### Pitfall 5: Process Group for Dev Server Kill
**What goes wrong:** `child.kill()` kills the shell but not the actual dev server (e.g., `vite` or `next dev`) which was spawned as a child of `sh -c`.
**Why it happens:** `Command::new("sh").args(["-c", cmd])` creates a process tree. `kill()` only kills `sh`, not its children.
**How to avoid:** On macOS/Unix, use `libc::killpg()` with the child's PID as the process group ID, or use `Command::new("sh").args(["-c", cmd]).process_group(0)` (stabilized in Rust 1.64+) to create a new process group, then kill the entire group.
**Warning signs:** Server port remains occupied after "Stop" button click.

### Pitfall 6: Server Output Encoding
**What goes wrong:** Non-UTF8 bytes in server output cause `String::from_utf8` to fail.
**Why it happens:** Some dev tools emit raw bytes (progress bars, binary output).
**How to avoid:** Use `String::from_utf8_lossy()` which replaces invalid bytes with the Unicode replacement character.
**Warning signs:** Server log stops updating mid-stream.

## Code Examples

### Opening URL with tauri-plugin-opener (JS)

```typescript
// Source: https://v2.tauri.app/plugin/opener/
import { openUrl } from '@tauri-apps/plugin-opener';

async function openInBrowser(url: string): Promise<void> {
  await openUrl(url);
}
```
[CITED: https://v2.tauri.app/plugin/opener/]

### Registering Opener Plugin (Rust)

```rust
// In lib.rs, add to the builder chain:
.plugin(tauri_plugin_opener::init())
```
[CITED: https://v2.tauri.app/plugin/opener/]

### URL Detection Regex for Server Output

```typescript
// Match http://localhost:NNNN or http://127.0.0.1:NNNN patterns
const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/\S*)?/;

function extractServerUrl(line: string): string | null {
  const match = line.match(URL_PATTERN);
  return match ? match[0] : null;
}
```
[ASSUMED: regex pattern covers common dev server output formats]

### Process Group Kill on macOS

```rust
use std::os::unix::process::CommandExt;

// When spawning:
let child = Command::new("sh")
    .args(["-c", &cmd])
    .current_dir(&cwd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .process_group(0)  // Create new process group
    .spawn()?;

// When killing:
unsafe {
    libc::killpg(child.id() as i32, libc::SIGTERM);
}
```
[VERIFIED: `process_group(0)` stabilized in Rust 1.64, project uses edition 2021]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tauri::shell::open` (Tauri 1) | `tauri-plugin-opener` (Tauri 2) | Tauri 2.0 | Shell module moved to separate plugin |
| `Command::pre_exec` for process groups | `Command::process_group(0)` | Rust 1.64 | Safe API, no unsafe needed for group creation |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ANSI color map uses Solarized Dark hex values from project theme | Architecture Pattern 2 | Colors won't match theme -- easy fix, swap values |
| A2 | URL regex covers common dev server output formats (Vite, Next.js, etc.) | Code Examples | Some servers may use different URL formats -- fallback to configured `server_url` |
| A3 | Server log scrollback of ~5000 lines is sufficient | Not specified | Memory usage for very verbose servers -- can be tuned |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | 3-state pane cycle | unit | `pnpm vitest run src/server/server-pane.test.ts` | No -- Wave 0 |
| AGENT-02 | Open URL invokes opener plugin | unit (mock) | `pnpm vitest run src/server/server-bridge.test.ts` | No -- Wave 0 |
| AGENT-03 | Claude binary detection | manual | Manual: verify `which claude` integration | N/A |
| AGENT-04 | OpenCode binary detection | manual | Manual: verify `which opencode` integration | N/A |
| AGENT-05 | Fallback bash with banner | manual | Manual: verify banner appears when no agent | N/A |
| AGENT-06 | Per-project agent config | unit | `pnpm vitest run src/server/agent-detect.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green + manual verification of AGENT-03/04/05

### Wave 0 Gaps
- [ ] `src/server/ansi-html.test.ts` -- ANSI conversion correctness
- [ ] `src/server/server-pane.test.ts` -- 3-state cycle logic
- [ ] `src/server/server-bridge.test.ts` -- URL extraction regex

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | Sanitize session names (already in pty.rs), validate server_cmd is not empty before spawn |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via server_cmd | Tampering | server_cmd comes from user's own state.json config, not external input. Run via `sh -c` which is intentional. User configures their own commands. |
| Path traversal via cwd | Tampering | Validate cwd exists and is a directory before `Command::current_dir()` |
| Session name injection | Tampering | Already mitigated: pty.rs sanitizes to alphanumeric + hyphen + underscore |

## Open Questions

1. **Process group kill on macOS**
   - What we know: `process_group(0)` creates new group, `killpg` kills entire group
   - What's unclear: Whether `libc` crate is already a dependency or needs adding
   - Recommendation: Check Cargo.lock for libc (likely transitive via portable-pty). If not, `cargo add libc`.

2. **Server pane height default**
   - What we know: D-01 says toolbar strip is 28px default
   - What's unclear: What the default expanded height should be
   - Recommendation: Use 200px as default expanded height (roughly 8-10 log lines), persisted in state.json

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| tauri-plugin-opener (Rust) | AGENT-02 | Yes (in Cargo.toml) | 2.x | -- |
| @tauri-apps/plugin-opener (JS) | AGENT-02 | No (not installed) | -- | Must install: `pnpm add @tauri-apps/plugin-opener` |
| libc (Rust) | Process group kill | Likely transitive | -- | Check Cargo.lock, add if missing |

**Missing dependencies with no fallback:**
- `@tauri-apps/plugin-opener` JS package -- must be installed

**Missing dependencies with fallback:**
- None

## Sources

### Primary (HIGH confidence)
- Codebase inspection: state.rs, pty.rs, lib.rs, main-panel.tsx, main.tsx, state-manager.ts, project.rs, package.json, Cargo.toml
- [Tauri Opener Plugin docs](https://v2.tauri.app/plugin/opener/) -- JS API, registration pattern

### Secondary (MEDIUM confidence)
- [tauri-plugin-opener crates.io](https://crates.io/crates/tauri-plugin-opener) -- version verification
- [Rust std::process::Command docs](https://doc.rust-lang.org/std/process/struct.Command.html) -- process_group API

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, only JS opener package missing
- Architecture: HIGH -- patterns follow established codebase conventions (PtyManager, state.rs, main.tsx)
- Pitfalls: HIGH -- identified from direct codebase inspection (opener not registered, JS package missing)

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, no fast-moving dependencies)
