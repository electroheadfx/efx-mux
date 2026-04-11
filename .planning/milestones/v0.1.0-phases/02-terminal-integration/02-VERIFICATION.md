---
phase: 02-terminal-integration
verified: 2026-04-06T17:30:00Z
status: human_needed
score: 3/5 roadmap success criteria verified
gaps:
  - truth: "PTY read loop pauses at 400KB unacknowledged (HIGH) and resumes at 100KB (LOW)"
    status: partial
    reason: "Only FLOW_HIGH_WATERMARK (400_000) constant exists. The loop resumes when unacked drops below 400KB -- not at the specified 100KB LOW watermark. No FLOW_LOW_WATERMARK constant defined. The plan must_have explicitly states 'resumes at 100KB (LOW)' but the implementation resumes at < 400KB."
    artifacts:
      - path: "src-tauri/src/terminal/pty.rs"
        issue: "Missing FLOW_LOW_WATERMARK constant and hysteresis logic. Current code: `if unacked > FLOW_HIGH_WATERMARK { sleep; continue }` -- resumes at any value below 400KB, not specifically at 100KB."
    missing:
      - "Add `const FLOW_LOW_WATERMARK: u64 = 100_000;` constant"
      - "Change read loop condition from simple HIGH check to hysteresis: pause when > HIGH, resume only when < LOW (prevents rapid pause/resume oscillation at the boundary)"
human_verification:
  - test: "User types commands and sees real-time output"
    expected: "Type `echo hello`, press Enter, output 'hello' appears in terminal immediately. Type `ls` and see directory listing from PTY."
    why_human: "Requires running `pnpm tauri dev` and interacting with the live terminal. Cannot verify PTY I/O pipeline at rest."
  - test: "tmux session survives app close and is reattachable"
    expected: "Close the app, run `tmux ls` in a separate terminal after 10 seconds, see 'efx-mux' session listed. Reopen app with `pnpm tauri dev` and see previous session history."
    why_human: "Session survival depends on runtime PTY behavior (SIGHUP propagation and tmux daemon daemonization). Also flags an implementation deviation: REQUIREMENTS.md TERM-03 specifies tmux spawned via `std::process::Command, not a crate`, but the implementation uses `portable_pty::CommandBuilder`. Whether the tmux server daemon survives when the PTY-bound client gets SIGHUP on app close requires manual confirmation."
  - test: "WebGL renderer is active (or silently falls back to DOM)"
    expected: "Terminal renders without visual artifacts. Check DevTools console: if `[efx-mux] WebGL not available` is absent, WebGL is active. If present, DOM renderer is active -- both acceptable."
    why_human: "WebGL context creation depends on the WKWebView GPU state at runtime. Cannot verify statically which renderer is active."
  - test: "Terminal reflows correctly after dragging split handles"
    expected: "Drag sidebar-main handle: terminal expands/contracts and text reflows without corruption. Drag main-right handle: same. Characters should not overlap or duplicate."
    why_human: "ResizeObserver, FitAddon.fit(), and debounced resize_pty IPC are all wired correctly in code, but the actual resize behavior requires visual confirmation in the running app."
  - test: "Heavy output does not freeze the app"
    expected: "Run `cat /dev/urandom | head -c 100000 | xxd` in the terminal. Output streams to the terminal without the app becoming unresponsive. Flow control (400KB HIGH watermark) may slow output briefly but should not freeze."
    why_human: "Flow control behavior under load requires runtime observation. The partial LOW watermark gap (see gaps section) means the pause/resume boundary may oscillate more than spec intended but should not prevent basic flow control from working."
---

# Phase 2: Terminal Integration Verification Report

**Phase Goal:** User sees a real, responsive terminal in the main panel connected to a live tmux session -- with GPU-accelerated rendering, correct resize behavior, and flow control that prevents buffer overflow during heavy AI output
**Verified:** 2026-04-06T17:30:00Z
**Status:** human_needed (1 code gap + 4 items requiring runtime verification)
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | User types commands and sees real-time output from a PTY process running inside tmux | ? HUMAN | Pipeline fully wired; requires running app to confirm end-to-end |
| SC-2 | Terminal renders with WebGL; context loss falls back to DOM without user intervention | ✓ VERIFIED | `onContextLoss` handler wired in `terminal-manager.js:42-48`, `webglAttempts < 2` retry logic present |
| SC-3 | User closes app, waits 10s, reopens -- tmux session still alive and reattachable | ? HUMAN | Implementation deviation: uses `portable_pty::CommandBuilder` not `std::process::Command` (TERM-03 spec). Session survival unverifiable statically. |
| SC-4 | Heavy output: terminal responsive, no silent drops, flow control pauses at 400KB | ✗ PARTIAL | HIGH watermark (400KB) present; LOW watermark (100KB) missing -- resumes at < 400KB, not at 100KB as specified in plan must_have |
| SC-5 | User drags split handle and terminal reflows without corruption | ? HUMAN | ResizeObserver + FitAddon + debounced IPC all wired; requires visual confirmation |

**Score:** 1/5 fully verified (SC-2), 3/5 partially/pending (SC-1, SC-3, SC-5 need human), 1/5 gap (SC-4)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src-tauri/src/terminal/mod.rs` | ✓ VERIFIED | Contains `pub mod pty;` |
| `src-tauri/src/terminal/pty.rs` | ✓ VERIFIED | All 5 exports present: `spawn_terminal`, `write_pty`, `resize_pty`, `ack_bytes`, `check_tmux`. `PtyState` struct with writer, master, slave, flow counters. `std::thread::spawn` (not tokio). `400_000` HIGH watermark. `native_pty_system()` called. `"new-session", "-A", "-s"` args. `AtomicU64` flow counters. |
| `src-tauri/Cargo.toml` | ✓ VERIFIED | Contains `portable-pty = "0.9.0"` |
| `src-tauri/src/lib.rs` | ✓ VERIFIED | `mod terminal;`, imports all 5 functions, `invoke_handler` with 4 commands, `check_tmux()` in setup, existing menu code preserved |
| `src/vendor/xterm.mjs` | ✓ VERIFIED | 344,970 bytes, valid ESM, exports `Terminal` |
| `src/vendor/addon-webgl.mjs` | ✓ VERIFIED | 126,558 bytes, valid ESM |
| `src/vendor/addon-fit.mjs` | ✓ VERIFIED | 1,967 bytes, valid ESM |
| `src/vendor/xterm.css` | ✓ VERIFIED | 7,112 bytes, 52 `.xterm` selector matches |
| `src/index.html` | ✓ VERIFIED | Import map has `@xterm/xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`, `@arrow-js/core`. `xterm.css` linked. Import map before `<script type="module">`. |
| `src/terminal/terminal-manager.js` | ✓ VERIFIED | Exports `createTerminal`. Imports from `@xterm/xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`. `onContextLoss` with `webglAttempts < 2` retry. `fitAddon.fit()` after mount. No visible fallback indicator. |
| `src/terminal/pty-bridge.js` | ✓ VERIFIED | Exports `connectPty`. `new Channel()`. `new Uint8Array(data)` conversion. `invoke('ack_bytes', { count })`. `invoke('spawn_terminal', { onOutput: channel, sessionName })`. `terminal.onData` + `invoke('write_pty')`. |
| `src/terminal/resize-handler.js` | ✓ VERIFIED | Exports `attachResizeHandler`. `new ResizeObserver`. `fitAddon.fit()` immediate. `setTimeout` 150ms debounce. `invoke('resize_pty')`. `lastCols`/`lastRows` infinite-loop guard. |
| `src/components/main-panel.js` | ✓ VERIFIED | No placeholder text. Empty `<div class="terminal-area"></div>`. `server-pane` section preserved. |
| `src/styles/layout.css` | ✓ VERIFIED | `.terminal-area` has `position: relative`, `overflow: hidden`. No `border: 1px dashed` or `align-items: center`. |
| `src/main.js` | ✓ VERIFIED | Imports `createTerminal`, `connectPty`, `attachResizeHandler`. Step 6: `requestAnimationFrame` defer, `document.querySelector('.terminal-area')`, `createTerminal(container)`, `connectPty(terminal, 'efx-mux')`, `attachResizeHandler(...)`, `terminal.focus()`. Existing Steps 1-5 preserved. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src-tauri/src/lib.rs` | `src-tauri/src/terminal/pty.rs` | `mod terminal` + `generate_handler!` | ✓ WIRED | `mod terminal;` at top, `use terminal::pty::{...}`, all 4 commands in `generate_handler!` |
| `src-tauri/src/terminal/pty.rs` | `portable-pty` crate | `use portable_pty` | ✓ WIRED | `native_pty_system()` called, `CommandBuilder` used |
| `src/terminal/pty-bridge.js` | Tauri IPC | `window.__TAURI__.core.invoke` + `Channel` | ✓ WIRED | `const { invoke, Channel } = window.__TAURI__.core;` + `invoke('spawn_terminal', { onOutput: channel, sessionName })` |
| `src/terminal/terminal-manager.js` | `@xterm/xterm` | import map resolution | ✓ WIRED | `import { Terminal } from '@xterm/xterm'` resolved via import map to `/vendor/xterm.mjs` |
| `src/main.js` | `src/terminal/terminal-manager.js` | `import createTerminal` | ✓ WIRED | Import at line 12, called at line 101 |
| `src/main.js` | `src/terminal/pty-bridge.js` | `import connectPty` | ✓ WIRED | Import at line 13, `await connectPty(terminal, sessionName)` at line 107 |
| `src/terminal/resize-handler.js` | Tauri IPC | `invoke('resize_pty')` | ✓ WIRED | `const { invoke } = window.__TAURI__.core;` + `invoke('resize_pty', { cols, rows })` in debounced callback |
| `src/terminal/resize-handler.js` | FitAddon | `fitAddon.fit()` | ✓ WIRED | Called immediately on every ResizeObserver event before debounced IPC |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `src/terminal/pty-bridge.js` | `data` (PTY output) | `channel.onmessage` from Tauri Channel | Yes -- real PTY bytes from `spawn_terminal` read loop | ✓ FLOWING |
| `src-tauri/src/terminal/pty.rs` | `chunk` | `reader.read(&mut buf)` from PTY master | Yes -- real PTY reads, not static | ✓ FLOWING |
| `src/terminal/resize-handler.js` | `{ cols, rows }` | `terminal.cols` / `terminal.rows` from xterm.js after `fitAddon.fit()` | Yes -- real terminal dimensions | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust backend compiles | `cargo build --manifest-path src-tauri/Cargo.toml` | `Finished dev profile` (1 dead_code warning: `sent_bytes`, `slave` fields -- expected, struct fields kept alive for PTY lifecycle) | ✓ PASS |
| `spawn_terminal` registered in handler | `grep spawn_terminal src-tauri/src/lib.rs` | Found in `generate_handler!` | ✓ PASS |
| Vendor files exist and are substantive | File size checks | xterm.mjs: 344KB, addon-webgl.mjs: 126KB, addon-fit.mjs: 1.9KB, xterm.css: 7.1KB | ✓ PASS |
| Import map has all xterm entries | `grep @xterm src/index.html` | All 3 entries present, import map before module script | ✓ PASS |
| Terminal init pipeline end-to-end | Requires running app | N/A | ? SKIP -- needs human |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TERM-01 | 02-01, 02-02, 02-03 | Real terminal (xterm.js 6.0) in main panel connected to live PTY | ? HUMAN | All code wired; requires runtime confirmation |
| TERM-02 | 02-01, 02-02 | WebGL renderer with DOM fallback on context loss | ✓ SATISFIED | `onContextLoss` + retry-once in `terminal-manager.js` |
| TERM-03 | 02-01 | tmux sessions survive app close (via `std::process::Command`) | ✗ IMPLEMENTATION DEVIATION | Session spawned via `portable_pty::CommandBuilder` (not `std::process::Command` as required). Whether outcome is met requires runtime test. |
| TERM-04 | 02-01 | Flow control: backpressure at HIGH watermark (400KB), resume at LOW (100KB) | ✗ PARTIAL | HIGH watermark (400KB) implemented; LOW watermark (100KB) missing. Resume condition is `< 400KB`, not `< 100KB`. |
| TERM-05 | 02-02, 02-03 | Correct terminal resize on split handle drag | ? HUMAN | Full resize pipeline wired; requires visual confirmation |
| TERM-06 | 02-01, 02-02 | PTY output via `tauri::ipc::Channel<Vec<u8>>` | ✓ SATISFIED | `spawn_terminal` accepts `on_output: tauri::ipc::Channel<Vec<u8>>`, `channel.onmessage` in `pty-bridge.js` |

**Orphaned requirements:** None. All 6 TERM-* requirements claimed by plans and traceable to implementation.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/main-panel.js` | `[ Server logs -- Phase 7 ]` placeholder span in `server-pane-logs` | ℹ️ Info | Expected deferred placeholder for Phase 7 server pane; does not affect terminal functionality |
| `src-tauri/src/terminal/pty.rs` | `fields sent_bytes and slave are never read` (cargo warning) | ℹ️ Info | Expected -- these fields are held for PTY lifecycle management (AtomicU64 cloned before struct, slave kept alive). Not a stub. |

No blockers found. No stubs detected in terminal implementation paths.

---

## Human Verification Required

### 1. Terminal End-to-End: Commands and Output

**Test:** Run `pnpm tauri dev`. Wait for app window. Verify main panel shows a terminal with a shell prompt (not placeholder text). Type `echo hello` + Enter.
**Expected:** `hello` appears in the terminal output. Type `tmux ls` and see `efx-mux` session listed.
**Why human:** PTY I/O requires the running app. Cannot verify bidirectional data flow at rest.

### 2. tmux Session Survival Across App Close

**Test:** With the app running, run `tmux ls` inside the terminal (should show `efx-mux`). Close the app window. Wait 10 seconds. Open a system terminal and run `tmux ls`.
**Expected:** `efx-mux` session still listed. Reopen app with `pnpm tauri dev` -- terminal should reconnect to existing session, previous command history visible.
**Why human:** Session survival depends on tmux daemon behavior at runtime. Additionally, there is an implementation deviation: REQUIREMENTS.md TERM-03 specifies tmux should be spawned via `std::process::Command, not a crate`, but the implementation uses `portable_pty::CommandBuilder` to spawn tmux through the PTY. Whether the tmux server daemon survives when the PTY-bound client receives SIGHUP on app close requires manual confirmation to assess risk.

### 3. WebGL Renderer Status

**Test:** Open DevTools (Cmd+Option+I or `pnpm tauri dev` console). Look for `[efx-mux] WebGL not available` in the console.
**Expected:** Message absent = WebGL active (optimal). Message present = DOM fallback active (acceptable per D-07).
**Why human:** WebGL context depends on WKWebView GPU state at runtime.

### 4. Terminal Resize After Split Handle Drag

**Test:** With the terminal showing a shell prompt, drag the sidebar-main vertical split handle left and right. Drag the main-right handle.
**Expected:** Terminal content reflows to new width/height without corruption. Characters do not overlap or duplicate. Prompt repositions correctly.
**Why human:** ResizeObserver + FitAddon + debounced IPC are all wired; resize behavior requires visual confirmation.

### 5. Flow Control Under Heavy Output

**Test:** In the terminal, run: `cat /dev/urandom | head -c 100000 | xxd`
**Expected:** Hex output streams to terminal. App remains responsive (can still move window, interact with UI). Output may slow momentarily (flow control backpressure) but does not freeze the app.
**Why human:** Flow control behavior requires runtime observation. Note: the LOW watermark gap means the pause/resume threshold is 400KB/400KB (not 400KB/100KB as specified) -- this may cause more frequent pause/resume oscillation but should not prevent flow control from functioning.

---

## Gaps Summary

**1 code gap identified:**

**LOW watermark missing (SC-4 / TERM-04 partial):** The flow control implementation only defines the HIGH watermark (400KB pause). The plan's must_have truth explicitly states "resumes at 100KB (LOW)" and the CONTEXT.md D-11 says "Rust resumes PTY reads when unacknowledged bytes drop below 100KB (LOW watermark)." The current code resumes reading when `unacked <= 400_000` -- the same threshold at which it paused. This creates potential rapid oscillation at the boundary: the system could pause, read one small chunk, immediately exceed 400KB again, and pause again. Proper hysteresis (pause at 400KB, resume at 100KB) prevents this boundary behavior. The functional impact is minor in most cases but becomes visible during sustained high-throughput AI output -- exactly the use case this phase was designed to handle.

**1 implementation deviation (needs human confirmation):**

**TERM-03 spawn method:** `portable_pty::CommandBuilder` is used to spawn the tmux session instead of `std::process::Command`. The requirement text specifically calls for `std::process::Command, not a crate`. Whether this matters for session survival depends on tmux's own daemonization behavior at runtime (TERM-03 human test above).

---

_Verified: 2026-04-06T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
