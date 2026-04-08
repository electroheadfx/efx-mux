---
phase: 07-server-pane-agent-support
reviewed: 2026-04-08T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/src/server.rs
  - src-tauri/src/state.rs
  - src-tauri/src/terminal/pty.rs
  - src/components/main-panel.tsx
  - src/components/server-pane.tsx
  - src/drag-manager.ts
  - src/main.tsx
  - src/server/ansi-html.ts
  - src/server/server-bridge.ts
  - src/state-manager.ts
  - src/styles/app.css
  - src/terminal/pty-bridge.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-08
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 7 adds a server pane with start/stop/restart controls, ANSI log streaming, crash detection, and 3-state collapse — all backed by a new `server.rs` Rust module. The implementation is generally sound: XSS is avoided by HTML-escaping before ANSI processing, the process group approach correctly propagates signals to child processes, and the waitpid-based crash detection is the right mechanism. One critical security issue was found (shell injection via `sh -c` with unsanitized input), plus several logic bugs and edge cases across the Rust and TypeScript layers.

---

## Critical Issues

### CR-01: Shell injection via `start_server` / `restart_server` `cmd` parameter

**File:** `src-tauri/src/server.rs:28-35`

**Issue:** The `cmd` parameter is passed directly to `sh -c "{cmd}"` without any sanitization. A project `server_cmd` field containing shell metacharacters (e.g., `npm run dev; rm -rf ~/`) will be executed verbatim. Although the value originates from the user's own project config, it is stored in state.json and could be modified by a malicious project file or a future config-import feature. More immediately, there is no length or character-class check at all — the field is accepted from the Tauri IPC surface as a plain `String`, making this an IPC-level injection vector if any future code populates it from an untrusted source (e.g., opening a project from a URL or shared config).

```rust
// Current (vulnerable):
let mut child = Command::new("sh")
    .args(["-c", &cmd])   // cmd is unsanitized
    ...

// Recommended: validate cmd does not contain shell metacharacters,
// OR reject commands that can't be parsed as a whitespace-split argv
// and spawn directly without sh -c:
let parts: Vec<&str> = cmd.split_whitespace().collect();
if parts.is_empty() {
    return Err("Empty server command".to_string());
}
let mut child = Command::new(parts[0])
    .args(&parts[1..])
    .current_dir(&cwd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .process_group(0)
    .spawn()
    .map_err(|e| format!("Failed to start server: {}", e))?;
```

If shell features (pipes, `&&`, env var expansion) are intentionally needed, add an allowlist check or require explicit opt-in with a separate `use_shell` flag.

---

## Warnings

### WR-01: Race condition — `waitpid` thread races with `stop_server_inner` clearing the child

**File:** `src-tauri/src/server.rs:88-102`

**Issue:** The waiter thread calls `libc::waitpid(pid, ...)` using the `pid` captured before the child is stored. When `stop_server_inner` is called (e.g., on restart or window close), it sets `*guard = None` without waiting for the waiter thread to finish. The waiter thread will then emit `server-stopped` with whatever exit code waitpid returns, and clear `*guard = None` a second time — which is harmless, but the `server-stopped` event fires even for intentional stops. The comment in `server-pane.tsx:106` notes that `exitCode = -1` means intentional stop, but the Rust side actually passes the real WEXITSTATUS (e.g., 143 for SIGTERM), not -1. So the crash-detection filter `if (exitCode >= 0 && serverStatus.value === 'running')` will incorrectly show a "Process exited" crash banner when the server is stopped intentionally.

```rust
// In stop_server_inner, emit a sentinel event before clearing the child:
let _ = app.emit("server-stopped", -1i32);  // Signal intentional stop
*guard = None;
```

Then in the waiter thread, only emit if the child is still tracked (or check that -1 sentinel was not already sent). Alternatively, set a shared `AtomicBool` flag before killing the process so the waiter thread knows to suppress its exit event.

### WR-02: `stop_server_inner` sets `*guard = None` before the SIGKILL fallback thread fires

**File:** `src-tauri/src/server.rs:143-163`

**Issue:** After sending SIGTERM, `stop_server_inner` immediately sets `*guard = None` and returns. Three seconds later, the fallback thread fires `killpg(pid, SIGKILL)`. If `start_server` was called in that 3-second window (e.g., on restart), a new child is stored in `*guard`. The SIGKILL will kill the new process by PID, not the old one. PIDs can also be recycled by the OS within that 3-second window on a busy system, potentially killing an unrelated process.

```rust
// Fix: capture the pid before spawning the fallback thread and do
// not kill if the pid has already been reaped:
let pid_i32 = child.id() as i32;
std::thread::spawn(move || {
    std::thread::sleep(std::time::Duration::from_secs(3));
    // Only kill if the process still exists (kill(pid, 0) check)
    let alive = unsafe { libc::kill(pid_i32, 0) == 0 };
    if alive {
        unsafe { libc::killpg(pid_i32, libc::SIGKILL); }
    }
});
```

### WR-03: `serverStatus` set to `'running'` before the Rust `start_server` call succeeds

**File:** `src/components/server-pane.tsx:123-130`

**Issue:** `handleStart` sets `serverStatus.value = 'running'` optimistically, then calls `await startServer(...)`. If `startServer` throws (e.g., bad `cwd`, failed spawn), the catch block sets `serverStatus.value = 'crashed'`. However, the `listenServerStopped` listener filters `if (exitCode >= 0 && serverStatus.value === 'running')`, so a start failure followed by an immediate exit event could double-trigger the status change to `'crashed'`. More importantly, if the Rust-side spawn fails, the `server-stopped` event will never fire (no process was started), so the catch block is the only recovery path — but the status will read `'crashed'` rather than `'stopped'`, leaving the Start button enabled (correct) but the status dot red (confusing). The status should be set to `'stopped'` on spawn failure, not `'crashed'`.

```tsx
} catch (err) {
  serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Failed to start: ${err}\n`)];
  // 'crashed' implies the process ran and died; 'stopped' is more accurate for a spawn failure
  serverStatus.value = 'stopped';
}
```

### WR-04: `ansiToHtml` — `openSpans` counter is not reset between accumulation steps for multi-code sequences

**File:** `src/server/ansi-html.ts:25-51`

**Issue:** The `openSpans` variable is declared outside the `.replace()` callback and accumulates across all regex matches in a single call. This is intentional for tracking unclosed spans. However, the `styles` array accumulates multiple style properties (bold + color) into a **single** `<span>`, but opens only **one** span (`openSpans++`) regardless of how many style codes are in the sequence. When code `0` (reset) fires, it closes `openSpans` spans with `</span>`.repeat(openSpans)`. If a sequence like `\x1b[1;32m` (bold + green) is processed, `styles` gets two entries but only one span is opened — correct. But if a reset mid-sequence closes prematurely and a subsequent bold+color sequence is processed, the span-close count may drift out of sync with the actual DOM nesting. In practice for typical server output this is unlikely to cause a security issue (HTML-escaping prevents XSS), but it can produce malformed HTML with unclosed/extra `</span>` tags that corrupt log rendering.

A simpler fix is to always emit a reset before opening a new span:

```typescript
if (styles.length > 0) {
  // Close any open span first to avoid nesting confusion
  if (openSpans > 0) {
    result += '</span>'.repeat(openSpans);
    openSpans = 0;
  }
  openSpans++;
  result += `<span style="${styles.join(';')}">`;
}
```

### WR-05: `initDragManager` for the `main-h` handle uses `dataset.dragInit` guard, but vertical handles do not — multiple calls re-attach listeners

**File:** `src/drag-manager.ts:66-88`

**Issue:** `initDragManager()` is called on startup and again every time the server pane is expanded (via `requestAnimationFrame(() => initDragManager())` in `main.tsx:136`). The `main-h` handle is guarded with `dataset.dragInit = 'true'` to prevent duplicate listener attachment. However, the `sidebar-main` and `main-right` vertical handles have no such guard. Each time the pane is expanded, a new `mousedown` listener is added to those handles. After N expand/collapse cycles, N duplicate drag handlers fire simultaneously, causing erratic drag behavior (the panel jumps N times per pixel of mouse movement on each subsequent drag).

```typescript
// Apply the same guard pattern to all handles:
if (sidebarHandle && !sidebarHandle.dataset.dragInit) {
  sidebarHandle.dataset.dragInit = 'true';
  makeDragV(sidebarHandle, { ... });
}
if (mainRightHandle && !mainRightHandle.dataset.dragInit) {
  mainRightHandle.dataset.dragInit = 'true';
  makeDragV(mainRightHandle, { ... });
}
```

---

## Info

### IN-01: `main-panel.tsx` — `dangerouslySetInnerHTML` used with `escapeHtml` output on a `<pre>` block

**File:** `src/components/main-panel.tsx:79-81`

**Issue:** `fileContent.value` is HTML-escaped and rendered via `dangerouslySetInnerHTML`. The escaping is correct and prevents XSS. However, using `dangerouslySetInnerHTML` for this case is unnecessary — since the content is fully escaped, it renders as literal text. A simpler and safer pattern would be to use Preact's text children inside `<pre>` directly (no `dangerouslySetInnerHTML` needed):

```tsx
<pre ...>{fileContent.value}</pre>
```

This also avoids the subtle risk of a future developer removing the `escapeHtml` call while the `dangerouslySetInnerHTML` pattern remains.

### IN-02: `server.rs` — stdout and stderr share the same `server-output` event

**File:** `src-tauri/src/server.rs:57-83`

**Issue:** Both stdout and stderr reader threads emit `"server-output"`. This is functionally correct and matches the frontend listener, but means the frontend cannot distinguish stderr from stdout (e.g., to color errors red). No action required unless per-stream styling is desired in a future iteration — document this as a known limitation.

### IN-03: `state.rs` — `config_dir()` panics if `HOME` is empty

**File:** `src-tauri/src/state.rs:206-211`

**Issue:** The `.expect(...)` on line 210 will panic the Tauri process if `HOME` is unset or empty. On macOS this is extremely rare, but `HOME` can be empty in sandboxed/test environments. A non-panicking fallback (e.g., use `dirs::home_dir()` or return `Err`) would be more robust. This is a minor robustness concern, not a crash under normal operation.

### IN-04: `main.tsx` — `setTimeout(() => fitAddon.fit(), 100)` magic number

**File:** `src/main.tsx:234`

**Issue:** The 100ms delay before calling `fitAddon.fit()` is a magic number workaround for DOM layout settling. This is a common xterm.js pattern but should be documented inline. A `ResizeObserver` on the `.terminal-area` element would be more reliable and eliminate the timing dependency.

---

_Reviewed: 2026-04-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
