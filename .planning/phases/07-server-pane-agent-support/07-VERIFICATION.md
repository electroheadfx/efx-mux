---
phase: 07-server-pane-agent-support
verified: 2026-04-09T00:00:00Z
status: passed
score: 6/6 truths verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "Agent detection triggers on project switch (detectAgent called in project-changed listener, agentBinary passed to switchTmuxSession -> switch_tmux_session Rust command)"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Server Process Start/Stop/Restart Controls: Configure a project with server_cmd (e.g., `python3 -m http.server 8000`). Click Start. Verify log streams, click Stop, verify process is killed."
    expected: "Log shows '[server] Starting: ...' with streaming output. Stop kills the process. `lsof -i :8000` shows nothing afterward."
    why_human: "Requires a running app with a configured project and network activity."
  - test: "Ctrl+` Pane State Cycle: Press Ctrl+` three times while the terminal has focus. Observe pane transitions."
    expected: "strip (28px) -> expanded -> collapsed -> strip. State persists after app restart."
    why_human: "Requires visual inspection and keyboard interaction in running app. xterm.js focus interaction cannot be automated."
  - test: "Crash Detection Display: Start a server that exits immediately. Observe the log."
    expected: "Log shows 'Process exited (code 0)' and status dot turns red."
    why_human: "Requires running app with a short-lived child process."
  - test: "Agent Binary Launch in tmux PTY: Configure a project with agent='claude' (binary must be installed). Launch app and switch to that project. Observe main terminal."
    expected: "tmux session runs claude binary directly (not bash shell that then runs claude). Verified both at initial launch and on project switch."
    why_human: "Requires visual inspection of tmux session contents and an installed agent binary."
  - test: "Server Pane Drag-Resize: With server pane expanded, drag the horizontal split handle between terminal and server pane. Close and reopen app."
    expected: "Height changes smoothly (min 100px, max 50% panel). Persists in state.json."
    why_human: "Requires mouse drag interaction in running app."
  - test: "Open in Browser: After plugin-opener is installed and TypeScript compiles, configure a project with a server running. Click the Open button."
    expected: "System default browser opens to the server URL."
    why_human: "Requires plugin-opener gap to be fixed first, then requires a running app with a live server."
---

# Phase 7: Server Pane + Agent Support Verification Report (Re-verification)

**Phase Goal:** User can manage a dev server from a collapsible pane and launch Claude Code or OpenCode as native PTY processes -- no wrapping, no protocol hacks, just the raw binary in tmux
**Verified:** 2026-04-09
**Status:** passed
**Re-verification:** Yes -- after Plan 03 gap closure + pnpm install

---

## Re-verification Summary

Plan 03 was executed to close two gaps from the initial verification.

| Gap | Previous Status | Current Status |
|-----|----------------|----------------|
| @tauri-apps/plugin-opener not installed | FAILED | CLOSED -- pnpm install restored node_modules symlink; tsc exits 0 |
| Agent detection missing on project switch | FAILED | CLOSED -- detectAgent called in project-changed listener |

**One gap closed, one gap remains.**

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rust backend can start/stop/restart a child process and stream output via Tauri events | ✓ VERIFIED | server.rs has all 4 commands; cargo build exits 0 in 4.30s |
| 2 | Frontend bridge compiles and exports all command wrappers | ✓ VERIFIED | `pnpm exec tsc --noEmit` exits 0 after `pnpm install` restored plugin-opener symlink in node_modules |
| 3 | Collapsible server pane with 3-state Ctrl+` toggle exists and renders | ✓ VERIFIED | server-pane.tsx exports ServerPane with serverPaneState signal; state-strip/expanded/collapsed CSS classes; Ctrl+` handler in main.tsx uses { capture: true } |
| 4 | Server crash shows "Process exited (code N)" and status transitions to crashed | ✓ VERIFIED | waiter thread emits server-stopped with WEXITSTATUS; server-pane.tsx listenServerStopped sets status='crashed' and appends log message |
| 5 | App detects agent binary and launches it in tmux PTY on initial launch | ✓ VERIFIED | detectAgent called in bootstrap (line 206); agentBinary passed to connectPty; shell_command wired through pty-bridge.ts to spawn_terminal in pty.rs |
| 6 | Agent detection triggers on project switch (not just initial launch) | ✓ VERIFIED | project-changed listener (main.tsx lines 285-299) now calls detectAgent(project.agent); result passed as shellCommand to switchTmuxSession; Rust switch_tmux_session accepts shell_command: Option<String> and passes to tmux new-session when creating sessions |

**Score:** 5/6 truths verified

---

### Roadmap Success Criteria Coverage

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC1 | Main panel has a collapsible server pane (bottom split, Ctrl+` toggle) showing a running dev server process | ✓ VERIFIED | ServerPane component in main-panel.tsx; 3-state CSS classes; Ctrl+` cycle |
| SC2 | User can click Open in Browser to launch the dev server URL in the system default browser | ✓ VERIFIED | openInBrowser() wired in server-pane.tsx; plugin-opener installed; TypeScript compiles cleanly |
| SC3 | User can Restart or Stop the server process from the pane controls | ✓ VERIFIED | Restart and Stop buttons in ServerPane; handlers call restartServer/stopServer via bridge |
| SC4 | App detects and launches `claude` or `opencode` binary directly in a tmux PTY (no wrapping or protocol modification) | ✓ VERIFIED | Works on initial launch AND on project switch (gap 2 closed); shell_command passes agent binary to tmux new-session |
| SC5 | If neither agent binary is found, app falls back to a plain bash session with a banner explaining the situation | ✓ VERIFIED | main.tsx writeln banner: "No agent binary found. Install claude or opencode to enable AI assistance." |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/server.rs` | Server process management | ✓ VERIFIED | Contains all 4 commands; process_group(0), libc::killpg, waiter thread; Rust builds cleanly |
| `src/server/server-bridge.ts` | Frontend bridge | ✓ VERIFIED | File compiles cleanly; all command wrappers exported; plugin-opener resolves |
| `src/server/ansi-html.ts` | ANSI-to-HTML converter | ✓ VERIFIED | Exports ansiToHtml and extractServerUrl; HTML-escape first (XSS mitigation); Solarized Dark color map |
| `src/components/server-pane.tsx` | Server pane UI component | ✓ VERIFIED | export function ServerPane; signals; 3-state cycle; listenServerOutput/Stopped; Process exited; dangerouslySetInnerHTML |
| `src/components/main-panel.tsx` | Updated main panel | ✓ VERIFIED | Imports ServerPane from ./server-pane; no placeholder text present |
| `src/main.tsx` | Ctrl+` handler + agent detection + persistence | ✓ VERIFIED | Ctrl+` with { capture: true }; agent detection at initial launch (line 206) AND project switch (line 289); switchTmuxSession accepts shellCommand |
| `src/drag-manager.ts` | main-h drag handler for server pane resize | ✓ VERIFIED | data-handle="main-h" block with server-pane-height persistence via updateLayout |
| `src/terminal/pty-bridge.ts` | connectPty with shellCommand | ✓ VERIFIED | shellCommand?: string parameter; passed to invoke('spawn_terminal', { shellCommand: shellCommand ?? null }) |
| `src-tauri/src/terminal/pty.rs` | spawn_terminal and switch_tmux_session with shell_command | ✓ VERIFIED | Both commands accept shell_command: Option<String>; appended to tmux new-session args when Some and non-empty |
| `node_modules/@tauri-apps/plugin-opener` | Installed npm package | ✓ VERIFIED | Installed via pnpm install; package.json resolves correctly |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server-bridge.ts | server.rs | invoke('start_server', ...) | ✓ WIRED | Import verified in bridge; command registered in lib.rs |
| server-bridge.ts | @tauri-apps/plugin-opener | openUrl() import | ✓ WIRED | Package installed in node_modules; TypeScript compilation passes |
| server-pane.tsx | server-bridge.ts | import from '../server/server-bridge' | ✓ WIRED | Import present; all button handlers use bridge functions |
| server-pane.tsx | ansi-html.ts | import { ansiToHtml, extractServerUrl } | ✓ WIRED | Import present; used in log rendering and URL extraction |
| main.tsx | server-bridge.ts | detectAgent() -- initial launch | ✓ WIRED | detectAgent imported and called on bootstrap (line 206) |
| main.tsx project-changed | server-bridge.ts | detectAgent() -- project switch | ✓ WIRED | detectAgent called at line 289 in project-changed listener |
| main.tsx project-changed | switchTmuxSession | agentBinary passed as shellCommand | ✓ WIRED | switchTmuxSession(currentSession, newMainSession, project.path, agentBinary ?? undefined) at line 299 |
| switchTmuxSession | pty.rs switch_tmux_session | shell_command: Option<String> | ✓ WIRED | Rust command accepts and uses shell_command; passes to tmux new-session when creating sessions |
| server.rs waiter thread | frontend listenServerStopped | app.emit('server-stopped', exit_code) | ✓ WIRED | WIFEXITED/WEXITSTATUS used; emit confirmed in code |
| drag-manager.ts main-h | state-manager.ts | updateLayout({ 'server-pane-height' }) on drag end | ✓ WIRED | onEnd handler calls updateLayout with server-pane-height |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust backend compiles | cargo build --manifest-path src-tauri/Cargo.toml | Finished dev profile in 4.30s (0 errors) | ✓ PASS |
| TypeScript compiles cleanly | pnpm exec tsc --noEmit | Exit 0, no errors | ✓ PASS |
| agent detection on project switch | grep detectAgent src/main.tsx | Lines 30 (import), 206 (bootstrap), 289 (project-changed) | ✓ PASS |
| switchTmuxSession shellCommand param | Read src/main.tsx lines 53-60 | shellCommand?: string parameter wired to invoke call | ✓ PASS |
| Rust switch_tmux_session shell_command | grep shell_command pty.rs | Lines 87, 89, 223, 256 -- param accepted and used | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AGENT-01 | 07-01, 07-02 | Main panel has a collapsible server pane (bottom split, Ctrl+` toggle) with Open/Restart/Stop | ✓ SATISFIED | Pane exists and Ctrl+` works; Open/Restart/Stop all wired; plugin-opener installed |
| AGENT-02 | 07-01, 07-02 | Open in Browser launches dev server URL in system default browser | ✓ SATISFIED | openUrl() from @tauri-apps/plugin-opener resolves; TypeScript compiles cleanly |
| AGENT-03 | 07-02, 07-03 | App detects `claude` binary and launches it in tmux PTY without wrapping | ✓ SATISFIED | Works on initial launch AND project switch; shell_command passed to tmux new-session |
| AGENT-04 | 07-02, 07-03 | App detects `opencode` binary and launches it in tmux PTY without wrapping | ✓ SATISFIED | Same path as AGENT-03; detect_agent command handles any binary name |
| AGENT-05 | 07-02 | Falls back to plain bash session with banner if no agent found | ✓ SATISFIED | Fallback banner present in main.tsx bootstrap; "No agent binary found." written to terminal |
| AGENT-06 | 07-01 | Per-project config specifies which agent to launch | ✓ SATISFIED | ProjectEntry.agent used in bootstrap and project-changed listener; detectAgent called conditionally on agent !== 'bash' |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | All anti-patterns resolved | -- | -- |

---

### Human Verification Required

#### 1. Server Process Start/Stop/Restart Controls

**Test:** Configure a project with server_cmd (e.g., `python3 -m http.server 8000`). Click Start. Verify log streams, click Stop, verify process is killed.
**Expected:** Log shows "[server] Starting: {cmd}" with streaming output. Stop kills the process. `lsof -i :8000` shows nothing afterward.
**Why human:** Requires a running app with a configured project and network activity.

#### 2. Ctrl+` Pane State Cycle

**Test:** Press Ctrl+` three times while the terminal has focus. Observe pane transitions.
**Expected:** strip (28px) -> expanded -> collapsed -> strip. State persists after app restart.
**Why human:** Requires visual inspection and keyboard interaction in running app; xterm.js focus interaction cannot be automated.

#### 3. Crash Detection Display

**Test:** Start a server that exits immediately. Observe the log.
**Expected:** Log shows "Process exited (code 0)" and status dot turns red.
**Why human:** Requires running app with a short-lived child process.

#### 4. Agent Binary Launch in tmux PTY (Both Paths)

**Test:** Configure a project with agent="claude" (binary must be installed). Launch app and also switch between a bash project and the claude project.
**Expected:** tmux session runs claude binary directly (not typed into bash) on both initial launch and project switch.
**Why human:** Requires visual inspection of tmux session contents and an installed agent binary.

#### 5. Server Pane Drag-Resize

**Test:** With server pane expanded, drag the horizontal split handle between terminal and server pane. Close and reopen app.
**Expected:** Height changes smoothly (min 100px, max 50% panel). Persists in state.json.
**Why human:** Requires mouse drag interaction in running app.

#### 6. Open in Browser (after gap fixed)

**Test:** After plugin-opener is installed and TypeScript compiles, configure a project with a server running. Click the Open button.
**Expected:** System default browser opens to the server URL.
**Why human:** Requires plugin-opener gap to be fixed first, then requires a running app with a live server.

---

## Gaps Summary

**All gaps closed.**

- **Gap 1 (closed by Plan 03):** Agent detection on project switch — `detectAgent` called in `project-changed` listener, `shellCommand` passed to `switchTmuxSession` and Rust `switch_tmux_session`.
- **Gap 2 (closed post-execution):** `@tauri-apps/plugin-opener` — package was installed in worktree but not main tree. `pnpm install` on main tree restored the symlink. `pnpm exec tsc --noEmit` exits 0.

---

_Verified: 2026-04-09_
_Verifier: Claude (gsd-verifier)_
