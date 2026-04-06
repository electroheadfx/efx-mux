# Domain Pitfalls: GSD⚡MUX

**Domain:** Tauri 2 desktop app — xterm.js terminals + tmux sessions + Arrow.js
**Researched:** 2026-04-06
**Stack:** Tauri 2 (Rust) + Arrow.js + xterm.js 5.x + tmux + portable-pty

---

## Critical Pitfalls

Mistakes that cause rewrites, crashes, or permanent data loss.

---

### Pitfall 1: xterm.js Write Buffer Overflow with Fast Producers

**What goes wrong:** Claude Code generates dense streaming output (tool results, file diffs, search output). xterm.js `write()` is non-blocking and buffers all incoming data. At high throughput the internal write buffer exceeds its hardcoded 50MB limit — data is silently discarded. The terminal appears to "freeze" or output stops mid-stream with no error.

**Why it happens:** The PTY stdout pipe produces data at speeds up to several GB/s in burst. xterm.js processes writes on each event loop tick targeting < 16ms per frame, giving a practical throughput ceiling of 5–35 MB/s. No IPC-level backpressure exists between the Tauri Rust event emitter and the JS write queue.

**Consequences:** Lost terminal output, frozen terminal, user can't tell if Claude Code is still running. In extreme cases the Tauri webview process OOMs.

**Prevention:**
- Implement a watermark-based flow control loop on the Rust side: track bytes-in-flight, pause PTY reads when > 400KB is buffered, resume when the xterm.js `write()` callback fires (xterm.js exposes a callback parameter on `write(data, callback)`).
- HIGH watermark: 400KB. LOW watermark: 100KB. Do not pause/resume per chunk — batch at threshold crossings only.
- Emit a Tauri event to the frontend with each chunk; the frontend calls `write(chunk, () => emit_ack())` to signal readiness. Rust side reads the ack before sending the next batch.
- Official xterm.js flow control guide: https://xtermjs.org/docs/guides/flowcontrol/

**Warning signs:**
- Terminal goes silent mid-output during long Claude Code sessions
- Tauri GPU process memory climbing continuously (xterm.js buffering)
- `write` queue depth observable via xterm.js internals growing without bound

**Phase:** Phase 2 (Terminal Integration) — must be solved before any real workload testing.

---

### Pitfall 2: macOS App Sandbox Blocks PTY Spawning (App Store / Notarization Path)

**What goes wrong:** If the app is ever sandboxed (Mac App Store distribution or hardened runtime with `com.apple.security.app-sandbox`), `forkpty()` / `posix_openpt()` calls fail. The child process inherits the sandbox and cannot set its process group on the TTY. zsh prints `can't set tty pgrp: operation not permitted`, then every command inside the shell fails.

**Why it happens:** Apple explicitly states there are no entitlements to allow launching a PTY process outside the sandbox. Sandbox rules propagate to all child processes spawned via fork/exec.

**Consequences:** The entire PTY/tmux session mechanism is non-functional if the sandbox entitlement is present. No workaround without distributing a separate non-sandboxed helper daemon.

**Prevention:**
- Do NOT add `com.apple.security.app-sandbox` to the entitlements file. GSD⚡MUX must be distributed outside the Mac App Store (direct download, Homebrew, or Tauri's built-in updater).
- The required Tauri entitlements are `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, and `com.apple.security.cs.allow-dyld-environment-variables`. These are for WKWebView JIT and are sandboxing-neutral.
- Document explicitly in the project: App Store distribution is out of scope permanently.
- Notarization without sandbox is valid and sufficient for Gatekeeper.

**Warning signs:**
- Adding `com.apple.security.app-sandbox: true` to entitlements.plist
- Any App Store submission requirement showing up in Tauri CI configuration

**Phase:** Phase 1 (Scaffold) — decide and document before writing a line of Rust. Lock the entitlements file early.

---

### Pitfall 3: WebGL Context Exhaustion with Multiple xterm.js Instances

**What goes wrong:** Browsers (WKWebView included) enforce a hard limit on active WebGL contexts per page — typically 8–16. GSD⚡MUX plans up to 4 terminal panels (main, server pane, two right-panel bash terminals). With each running `addon-webgl`, context exhaustion is a real risk, especially if terminals are created and destroyed during tab switching without proper disposal. Lost contexts produce a black/blank terminal with no error message.

**Why it happens:** Each `WebglAddon` instance creates a dedicated WebGL2 rendering context. WKWebView enforces the same limits as Safari. When the limit is hit the browser silently loses older contexts.

**Consequences:** Terminal panels render as black rectangles. No JavaScript error is thrown. Very hard to debug.

**Prevention:**
- Use `try/catch` when loading `WebglAddon`. On failure, fall back to `@xterm/addon-canvas` (2D canvas, no WebGL limit, 80% of WebGL performance). Pattern:
  ```js
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => { webgl.dispose(); loadCanvasFallback(term); });
    term.loadAddon(webgl);
  } catch (e) {
    term.loadAddon(new CanvasAddon());
  }
  ```
- Call `addon.dispose()` then `terminal.dispose()` in the correct order whenever a terminal tab is closed.
- Keep simultaneous active terminals to a minimum. The server pane and right-panel bash terminals can default to `addon-canvas` since performance is less critical there.
- Subscribe to `webglcontextlost` event to detect and recover from mid-session context loss.

**Warning signs:**
- Black terminal panel after opening 4+ terminals
- No render errors in console but terminal appears frozen

**Phase:** Phase 2 (Terminal Integration) — build the fallback path from the start, not as a retrofit.

---

### Pitfall 4: Tauri IPC JSON Serialization Overhead for Binary PTY Data

**What goes wrong:** PTY stdout bytes are binary. Tauri's event system serializes all payloads as JSON by default. Binary PTY output JSON-encoded as a base64 string or escaped byte array adds 33–100% overhead and a synchronous serialization cost on the Rust side for every chunk. At Claude Code throughput this can consume 200ms+ per 3MB, making the terminal visually laggy even at low backpressure levels.

**Why it happens:** Tauri 2.0's event system is documented as "JSON payloads only." The `emit()` call in Rust serializes via `serde_json` before crossing the IPC bridge. The JS event listener deserializes it again.

**Consequences:** Perceived input lag and jerky rendering even when xterm.js buffer is healthy. Rust main thread blocked on serialization during burst output.

**Prevention:**
- Use Tauri 2's Raw IPC / binary channel for PTY output (`tauri::ipc::Channel` with raw bytes). Tauri 2.0 stable added Raw Requests that skip JSON for large data transfer.
- Alternatively, batch small chunks (< 4KB) into a single 16ms-tick event on the Rust side using a channel with a 16ms flush timer, reducing IPC call overhead.
- Use the Tauri `Channel` type (introduced in Tauri 2.0) specifically designed for streaming large data from Rust to frontend, which supports binary payloads directly.
- Reference: https://v2.tauri.app/concept/inter-process-communication/

**Warning signs:**
- Terminal renders in visible "blocks" rather than smooth streaming
- CPU spike on Rust side during fast output despite low memory pressure

**Phase:** Phase 2 (Terminal Integration) — architecture decision, not fixable late without rewriting IPC layer.

---

## Moderate Pitfalls

---

### Pitfall 5: tmux Session Race Condition on Attach

**What goes wrong:** The Rust backend calls `tmux attach-session -t <name>` immediately after `tmux new-session` or immediately on app launch before checking if tmux's server is ready. The attach call races against the tmux server startup, producing `no server running on /tmp/tmux-*/default` or the session pane content is empty because the shell hasn't initialized yet.

**Why it happens:** `tmux new-session` returns before the shell inside the pane has sourced `.zshrc` / `.bashrc`. Sending `session_write` before the shell prompt is ready causes keystrokes to be lost or applied to the wrong state. This is a known and actively-reported issue even in Claude Code's own agent infrastructure (GitHub issue #23513, February 2026).

**Consequences:** First-launch sessions appear broken. After app restart, reattached sessions may have out-of-order input. Developers burning sessions on state corruption spend hours debugging.

**Prevention:**
- After `tmux new-session`, poll with `tmux list-panes -t <session>` until the pane exists before sending writes. A 50ms poll with 2s timeout is sufficient.
- Prefer passing the command directly to `new-session` via `-d -s <name> <cmd>` rather than sending it via `send-keys` after creation. This eliminates the shell-init race entirely for the primary agent command.
- On app reopen, before reattaching, verify the session actually exists with `tmux has-session -t <name>` (exit code 0 = exists). If it doesn't, mark the session as dead in state and recreate.
- For the write channel: buffer early writes locally in Rust and flush only after a `pane_ready` probe succeeds.

**Warning signs:**
- First keystroke after launch goes missing
- `tmux has-session` returns non-zero after app reopen for a session that should have survived

**Phase:** Phase 2 (Terminal Integration) for initial session creation; Phase 4 (Session Persistence) for the reopen/reattach path.

---

### Pitfall 6: xterm.js FitAddon Dimensions Race on Panel Resize

**What goes wrong:** `fitAddon.fit()` is called before the terminal's container `<div>` has been laid out in the DOM (e.g., immediately after panel creation or after a split resize). It calculates zero columns and zero rows and calls `session_resize(0, 0)` on the PTY, which can crash `portable-pty` or corrupt the PTY geometry. Subsequent attempts to `fit()` may produce incorrect values (Issue #4841, #4338).

**Why it happens:** Arrow.js components render synchronously but CSS flex layout is calculated asynchronously. The container may have zero dimensions at the moment `fit()` is called if it runs before the browser's next layout pass.

**Consequences:** PTY dimension is 0×0. Commands that check `stty size` return garbage. TUI apps (vim, htop) corrupt their layout inside tmux.

**Prevention:**
- Always call `fitAddon.fit()` inside a `requestAnimationFrame()` callback or inside a `ResizeObserver` on the terminal container, never synchronously after component mount.
- Validate dimensions before calling `session_resize`: if `cols <= 0 || rows <= 0` skip the resize. Add an assertion in the Rust command handler.
- Debounce `ResizeObserver` callbacks by 50ms to avoid sending resize events for every frame of a drag operation.

**Warning signs:**
- Terminal appears with 0 width/height after creation
- vim/htop layout broken immediately after opening
- `stty size` returns `0 0`

**Phase:** Phase 2 (Terminal Integration).

---

### Pitfall 7: Keyboard Shortcut Swallowing — Ctrl+C in xterm.js vs Tauri Global Shortcuts

**What goes wrong:** Tauri's global shortcut system and the WKWebView keyboard event pipeline conflict. Ctrl+C inside xterm.js must send `\x03` (SIGINT) to the PTY process — but if an app-level `Ctrl+C` handler is registered, Tauri may intercept it before xterm.js sees the keydown event. Conversely, Command+C on macOS is the system copy shortcut, but inside xterm.js with text selected it should copy terminal content — WKWebView may route this to the system clipboard handler instead.

**Why it happens:** Tauri 2 has a `global-shortcut` plugin and also a window-level menu accelerator system. On macOS, the webview keyboard event dispatch order is: native menu accelerator → WKWebView JavaScript → xterm.js handler. Known Tauri issue: Command+C/V don't work in child webviews until parent window has focus (Issue #8676, 2024).

**Consequences:** Ctrl+C fails to interrupt Claude Code processes. Command+C copies nothing. Ctrl+D fails to send EOF to the shell.

**Prevention:**
- Do NOT register app-level Tauri global shortcuts that overlap with terminal control sequences: Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L, Ctrl+R, Ctrl+A, Ctrl+E.
- The project's chosen shortcuts (Ctrl+B, Ctrl+1/2/3, Ctrl+`, Ctrl+T, Ctrl+W, Ctrl+P, Ctrl+Q) are safe because they are Tauri window-level shortcuts, not global OS-level shortcuts.
- Use `attachCustomKeyboardEventHandler` on each xterm.js instance to intercept keydown events and call `preventDefault()` for modifier keys that should stay in the terminal.
- For Ctrl+C: xterm.js handles it natively (sends `\x03`) — do not intercept or duplicate this in the app layer.
- When a terminal panel has focus, disable all non-essential Tauri menu accelerators that could shadow terminal sequences.

**Warning signs:**
- Claude Code process can't be interrupted with Ctrl+C
- Shell doesn't respond to Ctrl+D (EOF)
- Copy from terminal doesn't work on first attempt

**Phase:** Phase 8 (Polish) for full keyboard system — but the no-conflict rule must be established in Phase 2 when the shortcut list is defined.

---

### Pitfall 8: Arrow.js Component Cleanup — xterm.js Terminal Not Disposed on Unmount

**What goes wrong:** When a terminal tab is closed or a panel's content changes, the Arrow.js component unmounts. If the xterm.js `Terminal` instance is not explicitly `dispose()`d before the DOM node is removed, the WebGL addon retains its GPU context, the PTY event listeners leak (each `listen()` call in Tauri JS API accumulates), and the write callback queue continues to fire against a detached DOM node. With multiple tab switches, GPU process memory climbs by ~17MB per orphaned terminal (observed in VS Code, PR #279579, 2025).

**Why it happens:** Arrow.js exposes `onCleanup()` for teardown logic, but it must be called explicitly. The pattern is not automatically enforced. Developers often `dispose()` the `WebglAddon` but forget to `dispose()` the `Terminal` instance itself, or forget to call `unlisten()` on the Tauri event listener.

**Consequences:** GPU memory leak accumulating per closed tab. Tauri event queue fills with orphaned listeners. App slows down after extended use.

**Prevention:**
- In the terminal component's `onCleanup()` block, always execute in this order:
  1. `unlisten()` the Tauri stdout event listener (the function returned by `await listen(...)`)
  2. `addon.dispose()` for each loaded addon (webgl or canvas, fit, web-links, search)
  3. `terminal.dispose()`
- Store all unlisten functions in the component's closure and call them all in cleanup.
- Arrow.js watchers created inside the component auto-stop on unmount — but Tauri `listen()` does NOT auto-stop. It must be manually unlisten'd.

**Warning signs:**
- Tauri GPU helper process memory growing across tab switches
- Console warnings about event listeners on disposed terminals
- Error: "Cannot write to a disposed terminal"

**Phase:** Phase 2 (Terminal Integration) — establish the pattern with the first terminal component. It must be part of the component template.

---

### Pitfall 9: tmux Not Installed — No User-Friendly Error

**What goes wrong:** The app launches, the Rust backend runs `tmux new-session ...`, the process exits with "command not found", and the frontend receives a generic Tauri IPC error. The user sees a blank terminal panel with no explanation. On macOS, tmux is not installed by default — it requires Homebrew. Intel Macs and fresh macOS installs are particularly likely to be missing it.

**Why it happens:** `std::process::Command::new("tmux")` returns `Err(Os { code: 2, kind: NotFound })` which maps to a generic IPC error unless specifically handled.

**Consequences:** App appears broken on first launch for a significant portion of users. The only fix is exiting to the terminal and installing tmux separately.

**Prevention:**
- On startup, before any session creation, probe for tmux: `which tmux` or `tmux -V`. If it fails, emit a Tauri event to the frontend with `{ error: "tmux_not_found", install_hint: "brew install tmux" }`.
- Display a first-run onboarding modal that checks tmux presence and guides installation. Include a "Check again" button that re-runs the probe without restarting the app.
- Also check tmux version: GSD⚡MUX requires tmux >= 2.4 for proper pane control. Versions before 2.4 lack some `-P` flags. Display version mismatch as a warning, not a blocker.
- Detect PATH issues: on macOS, apps launched from Launchpad may not have Homebrew in PATH. Resolve tmux by checking `/usr/local/bin/tmux`, `/opt/homebrew/bin/tmux`, and `~/.nix-profile/bin/tmux` as fallbacks.

**Warning signs:**
- First launch shows empty terminal with no error message
- Rust logs show `Os { code: 2, kind: NotFound }`

**Phase:** Phase 2 (Terminal Integration) and Phase 4 (Session Persistence) — detection in Phase 2, full onboarding wizard in Phase 8.

---

### Pitfall 10: Stale tmux Session IDs in Persisted State

**What goes wrong:** The app saves `sessions[].tmuxName = "gsd-mux-myproject"` in `state.json`. Between closes, the user manually kills the tmux session, renames it, or runs `tmux kill-server`. On reopen, the Rust backend calls `tmux attach-session -t gsd-mux-myproject`, gets a non-zero exit code, and the frontend receives an attach failure. If not handled, the terminal panel is left in a permanently broken state.

**Why it happens:** tmux session lifetime is decoupled from the app. The user may run any tmux commands outside the app.

**Consequences:** App appears to load but all terminal panels are broken. User cannot access existing projects. State is corrupted until manually deleted.

**Prevention:**
- On every app open, for each saved session: run `tmux has-session -t <name>` before attempting attach. If it fails, mark the session as `{ status: "dead" }` and render a "Session Lost — Relaunch?" UI instead of a blank terminal.
- "Relaunch" creates a new tmux session with the same name, re-runs the last command (stored in state), and resumes.
- Implement `state.json` schema versioning (`"version": 1`) from day one so migration logic can be added without breaking existing state files.
- Add a "Reset all sessions" escape hatch accessible from the UI for complete state wipe.

**Warning signs:**
- Terminal panel blank after reopen
- Rust logs: `tmux attach-session` exit code 1

**Phase:** Phase 4 (Session Persistence) — this is the primary edge case that phase is designed to handle.

---

## Minor Pitfalls

---

### Pitfall 11: Arrow.js ESM Import Fails on file:// Protocol

**What goes wrong:** Arrow.js imported via a bare CDN URL (e.g., `from 'https://esm.sh/@arrow-js/core'`) works in development but may be blocked in Tauri's WKWebView under a strict Content Security Policy. Conversely, relative imports work locally but break if Tauri serves assets via `tauri://localhost` (the default custom protocol) rather than `file://`. Multi-file ESM imports (e.g., `import './components/sidebar.js'`) can fail with CORS errors when loaded via the `tauri://` custom protocol if CSP is not correctly configured.

**Prevention:**
- Use import maps in `index.html` to alias `@arrow-js/core` to a locally vendored file in `src/lib/`. This eliminates CDN dependency and avoids CSP issues entirely.
- Set `"devUrl"` in `tauri.conf.json` to use a local Vite dev server during development (`http://localhost:1420`) and bundled assets for production. The http:// origin in dev avoids `tauri://` CSP issues during iteration.
- Ensure `tauri.conf.json` CSP includes `script-src 'self' 'unsafe-inline'` if using template literals with inline scripts in Arrow.js.

**Phase:** Phase 1 (Scaffold) — resolve import strategy before writing any components.

---

### Pitfall 12: Session Naming Conflicts

**What goes wrong:** Two projects named "My App" both get tmux session name `gsd-mux-my-app`. On project switch, `tmux attach-session -t gsd-mux-my-app` attaches to the wrong session.

**Prevention:**
- Derive session names from a stable UUID or hash of the project path, not the display name. Store display name separately. Session name format: `gsd-mux-{crc32(abs_path)}`.

**Phase:** Phase 2 (Terminal Integration) — set the naming convention before any session creation code.

---

### Pitfall 13: Project Directory Moved or Deleted

**What goes wrong:** A project path stored in state (`/Users/laurent/Dev/myproject`) no longer exists. The Rust git2 crate panics or returns an error when attempting to open the repository. File watchers on `notify` emit a stream of delete events filling the event queue.

**Prevention:**
- At project load time, check `std::path::Path::exists()` for the project root. If missing, render a "Project not found" badge in the sidebar and skip git/file-watcher setup for that project.
- Implement a `notify` event rate limiter (debounce all events by 100ms) to prevent delete-event floods from cascading.

**Phase:** Phase 5 (Project System).

---

### Pitfall 14: xterm.js Ligatures and FiraCode

**What goes wrong:** FiraCode is the specified font. Ligatures (e.g., `=>`, `!=`, `->`) require a non-default rendering path. The standard xterm.js DOM and canvas renderers do not support font ligatures. The WebGL renderer also does not support ligatures natively. Users expecting FiraCode ligature rendering will see them rendered as separate characters.

**Prevention:**
- Accept this as a known limitation. xterm.js does not support ligatures in any renderer. FiraCode Light 14 still works correctly — ligatures simply won't render. This matches real-world terminal emulator behavior for most users.
- Do not implement a ligature workaround (it requires a custom text atlas in the WebGL addon and is not worth the complexity). Document the limitation.

**Phase:** Phase 3 (Terminal Theming) — note in config/docs, not a code issue.

---

## Phase-Specific Warning Matrix

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|------------|
| Phase 1 | Arrow.js + Tauri setup | ESM import CORS / CSP failure | Vendor Arrow.js locally; configure CSP early |
| Phase 1 | Entitlements | Accidental sandbox flag | Lock entitlements.plist; no `app-sandbox` |
| Phase 2 | PTY integration | Write buffer overflow with fast output | Implement watermark flow control from the start |
| Phase 2 | Terminal lifecycle | WebGL context leak on tab close | Enforce dispose pattern in terminal component |
| Phase 2 | WebGL | Context exhaustion (4+ terminals) | try/catch + canvas fallback wired in from day 1 |
| Phase 2 | tmux detection | Silent failure if not installed | Probe tmux on startup; show friendly error modal |
| Phase 2 | Resize | fit() called before DOM layout | Use ResizeObserver + RAF, validate cols/rows > 0 |
| Phase 2 | Session naming | Name collision between projects | Use path hash for tmux session name |
| Phase 2 | tmux attach | Race condition on new session | Poll with `has-session` + delay before first write |
| Phase 3 | Theming | Ligatures don't render | Document; don't implement workaround |
| Phase 4 | State restore | Stale session IDs after manual tmux kill | Probe all sessions before attach; show "dead" UI |
| Phase 4 | State restore | Corrupted state.json | Schema version + migration + reset escape hatch |
| Phase 5 | Project load | Moved/deleted project path | Check path exists before watcher/git setup |
| Phase 7 | Agent launch | Claude Code PATH not in Tauri env | Resolve binary via full path; source shell env |
| Phase 8 | Keyboard | Ctrl+C swallowed by Tauri shortcuts | No app-level shortcuts on terminal control sequences |

---

## Sources

- xterm.js flow control: https://xtermjs.org/docs/guides/flowcontrol/
- xterm.js WebGL GPU memory leak (VS Code fix, 2025): https://github.com/microsoft/vscode/pull/279579
- xterm.js WebGL context leak issue: https://github.com/xtermjs/xterm.js/issues/3889
- xterm.js multiple WebGL context limit: https://github.com/xtermjs/xterm.js/issues/4379
- xterm.js FitAddon resize bugs: https://github.com/xtermjs/xterm.js/issues/4841
- tmux race condition — Claude Code issue, 2026: https://github.com/anthropics/claude-code/issues/23513
- macOS PTY sandbox restriction: https://developer.apple.com/forums/thread/685544
- Tauri macOS entitlements (PTY/JIT): https://dev.to/0xmassi/shipping-a-production-macos-app-with-tauri-20-code-signing-notarization-and-homebrew-mc3
- Tauri IPC JSON overhead: https://github.com/tauri-apps/tauri/discussions/5690
- Tauri IPC binary support: https://github.com/tauri-apps/tauri/issues/7127
- Tauri keyboard shortcut conflicts (macOS webview): https://github.com/tauri-apps/tauri/issues/8676
- Arrow.js lifecycle (onCleanup): https://arrow-js.com/api/
- Tauri Webview Versions: https://v2.tauri.app/reference/webview-versions/
- Tauri IPC architecture: https://v2.tauri.app/concept/inter-process-communication/
