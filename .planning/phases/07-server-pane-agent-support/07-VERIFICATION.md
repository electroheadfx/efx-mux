---
phase: 07-server-pane-agent-support
verified: 2026-04-08T00:00:00Z
status: gaps_found
score: 4/6 truths verified
overrides_applied: 0
gaps:
  - truth: "Rust backend can start a child process and stream output to frontend via Tauri events (and frontend bridge compiles)"
    status: failed
    reason: "@tauri-apps/plugin-opener is declared in package.json but NOT installed in node_modules. pnpm exec tsc --noEmit fails: 'Cannot find module @tauri-apps/plugin-opener or its corresponding type declarations'. The server-bridge.ts imports openUrl from this missing package, which means the entire frontend bridge module is unresolvable at build time."
    artifacts:
      - path: "src/server/server-bridge.ts"
        issue: "Imports '@tauri-apps/plugin-opener' which is not installed. TypeScript compilation fails."
      - path: "node_modules/@tauri-apps/plugin-opener"
        issue: "Package declared in package.json (^2.5.3) but absent from node_modules and pnpm store"
    missing:
      - "Run pnpm install to restore missing plugin-opener dependency"
  - truth: "When agent binary IS found, it is passed as the shell command to spawn_terminal so the agent launches in the tmux PTY (on project switch as well as initial launch)"
    status: partial
    reason: "Agent detection on initial app launch correctly passes agentBinary to connectPty. However, the project-changed listener does NOT re-run agent detection when switching projects. It calls switchTmuxSession silently but never calls detectAgent for the new project's agent, so switching to a project configured for 'claude' will not launch claude in the new tmux session. The plan explicitly required agent detection on project switch (plan 02, task 1, action block 'Agent detection on project switch')."
    artifacts:
      - path: "src/main.tsx"
        issue: "project-changed listener (lines 276-307) switches tmux sessions silently but skips detectAgent call and connectPty with agent for the new project"
    missing:
      - "In the project-changed listener, call detectAgent(project.agent) for the new project and pass the result when spawning/switching to the new session"
---

# Phase 7: Server Pane + Agent Support Verification Report

**Phase Goal:** User can manage a dev server from a collapsible pane and launch Claude Code or OpenCode as native PTY processes -- no wrapping, no protocol hacks, just the raw binary in tmux
**Verified:** 2026-04-08
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rust backend can start/stop/restart a child process and stream output via Tauri events | ✓ VERIFIED | server.rs fully implemented with process_group(0), libc::killpg, stdout/stderr reader threads, waiter thread emitting server-stopped |
| 2 | Frontend bridge compiles and exports all command wrappers | ✗ FAILED | pnpm exec tsc --noEmit fails: `Cannot find module '@tauri-apps/plugin-opener'` — package missing from node_modules |
| 3 | Collapsible server pane with 3-state Ctrl+` toggle exists and renders | ✓ VERIFIED | server-pane.tsx exports ServerPane with serverPaneState signal, state-strip/expanded/collapsed CSS classes, Ctrl+` handler in main.tsx uses { capture: true } |
| 4 | Server crash shows "Process exited (code N)" and status transitions to crashed | ✓ VERIFIED | waiter thread emits server-stopped with WEXITSTATUS; server-pane.tsx listenServerStopped sets status='crashed' and appends log message |
| 5 | App detects agent binary and launches it in tmux PTY on initial launch | ✓ VERIFIED | detectAgent called in bootstrap; agentBinary passed to connectPty; shell_command wired through pty-bridge.ts to spawn_terminal; pty.rs appends shell_cmd to tmux new-session args |
| 6 | Agent detection triggers on project switch (not just initial launch) | ✗ FAILED | project-changed listener (main.tsx:276-307) switches sessions silently but never calls detectAgent for the new project; agent launch is initial-launch-only |

**Score:** 4/6 truths verified

---

### Roadmap Success Criteria Coverage

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC1 | Main panel has a collapsible server pane (bottom split, Ctrl+` toggle) showing a running dev server process | ✓ VERIFIED | ServerPane component in main-panel.tsx, 3-state CSS classes, Ctrl+` cycle |
| SC2 | User can click Open in Browser to launch the dev server URL in the system default browser | ✗ BLOCKED | openInBrowser() wired in server-pane.tsx but plugin-opener not installed; TypeScript fails to compile |
| SC3 | User can Restart or Stop the server process from the pane controls | ✓ VERIFIED | Restart and Stop buttons in ServerPane, handlers call restartServer/stopServer via bridge |
| SC4 | App detects and launches `claude` or `opencode` binary directly in a tmux PTY (no wrapping or protocol modification) | ~ PARTIAL | Works on initial launch. Missing on project switch. |
| SC5 | If neither agent binary is found, app falls back to a plain bash session with a banner explaining the situation | ✓ VERIFIED | main.tsx writeln banner: "No agent binary found. Install claude or opencode to enable AI assistance." |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/server.rs` | Server process management | ✓ VERIFIED | Contains start_server, stop_server, restart_server, detect_agent; process_group(0), libc::killpg, waiter thread |
| `src/server/server-bridge.ts` | Frontend bridge | ✗ STUB (compile fail) | File exists and is substantive, but imports unresolvable @tauri-apps/plugin-opener; tsc fails |
| `src/server/ansi-html.ts` | ANSI-to-HTML converter | ✓ VERIFIED | exports ansiToHtml and extractServerUrl; HTML-escape first (XSS mitigation); Solarized Dark color map |
| `src/components/server-pane.tsx` | Server pane UI component | ✓ VERIFIED | export function ServerPane, signals, 3-state cycle, listenServerOutput/Stopped, Process exited, dangerouslySetInnerHTML |
| `src/components/main-panel.tsx` | Updated main panel | ✓ VERIFIED | Imports ServerPane from ./server-pane; no placeholder text present |
| `src/main.tsx` | Ctrl+` handler + agent detection + persistence | ~ PARTIAL | Ctrl+` with { capture: true } verified; agent detection at initial launch correct; agent detection on project switch absent |
| `src/drag-manager.ts` | main-h drag handler for server pane resize | ✓ VERIFIED | data-handle="main-h" block with server-pane-height persistence via updateLayout |
| `src/terminal/pty-bridge.ts` | connectPty with shellCommand | ✓ VERIFIED | shellCommand?: string parameter; passed to invoke('spawn_terminal', { shellCommand: shellCommand ?? null }) |
| `src-tauri/src/terminal/pty.rs` | spawn_terminal with shell_command | ✓ VERIFIED | shell_command: Option<String> param; appended to tmux new-session args when Some and non-empty |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server-bridge.ts | server.rs | invoke('start_server', ...) | ✓ WIRED | Import verified in bridge; command registered in lib.rs |
| server-bridge.ts | @tauri-apps/plugin-opener | openUrl() import | ✗ NOT_WIRED | Package not installed; TypeScript compilation fails at this import |
| server-pane.tsx | server-bridge.ts | import from '../server/server-bridge' | ✓ WIRED | Import present; all button handlers use bridge functions |
| server-pane.tsx | ansi-html.ts | import { ansiToHtml, extractServerUrl } | ✓ WIRED | Import present; used in log rendering and URL extraction |
| main.tsx | server-bridge.ts | detectAgent() for agent binary check | ✓ WIRED (initial only) | detectAgent imported and called on bootstrap; missing on project-changed |
| main.tsx connectPty | pty-bridge.ts | detected agent binary passed as shellCommand | ✓ WIRED | connectPty(terminal, sessionName, path, agentBinary ?? undefined) |
| server.rs waiter thread | frontend listenServerStopped | app.emit('server-stopped', exit_code) | ✓ WIRED | WIFEXITED/WEXITSTATUS used; emit confirmed in code |
| drag-manager.ts main-h | state-manager.ts | updateLayout({ 'server-pane-height' }) on drag end | ✓ WIRED | onEnd handler calls updateLayout with server-pane-height |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| server-pane.tsx | serverLogs | listenServerOutput from Tauri event; Rust reader threads pipe stdout/stderr | Yes — OS pipe from child process | ✓ FLOWING |
| server-pane.tsx | serverStatus | Set by button handlers + listenServerStopped | Yes — driven by actual process lifecycle | ✓ FLOWING |
| server-pane.tsx | detectedUrl | extractServerUrl from live server stdout | Yes — parsed from real process output | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust backend compiles with all 4 new commands | cargo build --manifest-path src-tauri/Cargo.toml | Finished dev profile in 8.28s (0 errors) | ✓ PASS |
| TypeScript compiles cleanly | pnpm exec tsc --noEmit | Cannot find module '@tauri-apps/plugin-opener' | ✗ FAIL |
| server-bridge.ts exports all 7 functions | File read | All 7 functions present and typed correctly | ✓ PASS |
| server-pane.tsx has Process exited (code N) | Grep | Line 108: ansiToHtml(`[server] Process exited (code ${exitCode})\n`) | ✓ PASS |
| Ctrl+` handler uses capture phase | File read line 139 | }, { capture: true }); | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AGENT-01 | 07-01, 07-02 | Main panel has a collapsible server pane (bottom split, Ctrl+` toggle) with Open/Restart/Stop | ~ PARTIAL | Pane exists and Ctrl+` works; Open button calls openInBrowser but bridge fails to compile due to missing plugin-opener |
| AGENT-02 | 07-01, 07-02 | Open in Browser launches dev server URL in system default browser | ✗ BLOCKED | openUrl() from @tauri-apps/plugin-opener not resolvable; TypeScript build fails |
| AGENT-03 | 07-02 | App detects `claude` binary and launches it in tmux PTY without wrapping | ~ PARTIAL | Works on initial app launch; absent on project switch |
| AGENT-04 | 07-02 | App detects `opencode` binary and launches it in tmux PTY without wrapping | ~ PARTIAL | Works on initial app launch; absent on project switch |
| AGENT-05 | 07-02 | Falls back to plain bash session with banner if no agent found | ✓ SATISFIED | Fallback banner present in main.tsx bootstrap; "No agent binary found." message written to terminal |
| AGENT-06 | 07-01 | Per-project config specifies which agent to launch | ✓ SATISFIED | ProjectEntry.agent used in bootstrap; detectAgent called conditionally on agent !== 'bash' |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| node_modules/@tauri-apps/plugin-opener | — | Package absent despite being in package.json and imported in server-bridge.ts | Blocker | TypeScript compilation fails; frontend cannot build; Open in Browser feature non-functional |

---

### Human Verification Required

#### 1. Server Process Start/Stop/Restart Controls

**Test:** Configure a project with server_cmd (e.g., `python3 -m http.server 8000`). Click Start. Verify log streams, click Stop, verify process is killed.
**Expected:** Log shows "[server] Starting: ..." with streaming output; Stop kills the process; `lsof -i :8000` shows nothing afterward.
**Why human:** Requires a running app with a configured project and network activity.

#### 2. Ctrl+` Pane State Cycle

**Test:** Press Ctrl+` three times while the terminal has focus. Observe pane transitions.
**Expected:** strip (28px) → expanded → collapsed → strip; state persists after app restart.
**Why human:** Requires visual inspection and keyboard interaction in running app; xterm.js focus interaction cannot be automated.

#### 3. Crash Detection Display

**Test:** Start a server that exits immediately. Observe the log.
**Expected:** Log shows "Process exited (code 0)" and status dot turns red.
**Why human:** Requires running app with a short-lived child process.

#### 4. Agent Binary Launch in tmux PTY

**Test:** Configure a project with agent="claude" (binary must be installed). Launch app. Observe main terminal.
**Expected:** tmux session runs claude binary directly (not bash shell that then runs claude).
**Why human:** Requires visual inspection of tmux session contents and an installed agent binary.

#### 5. Server Pane Drag-Resize

**Test:** With server pane expanded, drag the horizontal split handle between terminal and server pane. Close and reopen app.
**Expected:** Height changes smoothly (min 100px, max 50% panel); persists in state.json.
**Why human:** Requires mouse drag interaction in running app.

---

## Gaps Summary

Two gaps block full goal achievement:

**Gap 1 (Blocker): Missing npm dependency.** `@tauri-apps/plugin-opener` is declared in `package.json` as `^2.5.3` but is absent from the pnpm store and `node_modules`. Every other installed `@tauri-apps/*` package is present (api, cli, plugin-dialog), but plugin-opener is missing. The `pnpm install` that the SUMMARY claims was run either failed silently or ran in a different worktree. This causes `pnpm exec tsc --noEmit` to fail with a module-not-found error, blocking the TypeScript build and meaning the frontend cannot be compiled. The `Open in Browser` feature (AGENT-02, SC2) is completely non-functional until this is resolved. Fix: run `pnpm install` or `pnpm add @tauri-apps/plugin-opener` in the project root.

**Gap 2 (Partial): Agent detection missing on project switch.** The plan explicitly specified that when the user switches projects via the sidebar (project-changed event), the new project's agent should be detected and passed to the terminal connection. The implementation only detects the agent at initial app bootstrap (lines 201-210 in main.tsx). The `project-changed` listener (lines 276-307) switches sessions silently via `switchTmuxSession` but never calls `detectAgent` for the new project's configured agent. AGENT-03 and AGENT-04 requirements state the app "detects and launches" — this is only satisfied at startup, not on project switch. This is a meaningful gap for a developer switching between a "bash" project and a "claude" project mid-session.

---

_Verified: 2026-04-08_
_Verifier: Claude (gsd-verifier)_
