---
phase: 07-server-pane-agent-support
verified: 2026-04-09T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "Main panel has a collapsible server pane (bottom split, Ctrl+` toggle) showing a running dev server process"
    reason: "Ctrl+` was replaced with Ctrl+S to accommodate French AZERTY keyboards where Ctrl+` is non-functional. A clickable toggle button (▸/▾) in the toolbar provides an equivalent UI alternative. The pane is fully collapsible with the same 3-state cycle."
    accepted_by: "pending-developer"
    accepted_at: "2026-04-09T12:00:00Z"
re_verification:
  previous_status: passed
  previous_score: 6/6
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  note: "Previous verification was conducted after Plan 03. Plans 04-07 made substantial changes. This is a full re-verification covering the final state after all 7 plans."
gaps: []
human_verification:
  - test: "Server Process Start/Stop/Restart Controls"
    expected: "Configure project with server_cmd (e.g. `python3 -m http.server 8000`). Click Start -- log streams output, status dot turns green. Click Stop -- log shows '[server] Stopped', lsof -i :8000 shows nothing. Click Restart -- log shows '--- Restarting ---', server restarts."
    why_human: "Requires running app with configured project. Process kill must be verified at OS level."
  - test: "Ctrl+S / Clickable Toggle -- 3-State Pane Cycle"
    expected: "Pressing Ctrl+S cycles strip (28px) -> expanded -> collapsed -> strip. Clicking the ▸/▾ button does the same. State persists across app restarts."
    why_human: "Requires keyboard interaction in running app. Note: Ctrl+` was replaced with Ctrl+S per AZERTY keyboard accommodation."
  - test: "ANSI Color Rendering in Server Logs"
    expected: "Start a server with colored output (e.g., `pnpm dev`). Log area shows colored text matching Solarized Dark palette. 256-color and truecolor sequences both render visibly (not monochrome)."
    why_human: "Requires running server with ANSI output. Visual inspection needed."
  - test: "Crash Detection Display (D-14)"
    expected: "Start a server that exits immediately (e.g., `python3 -c 'print(1)'`). Log shows 'Process exited (code 0)' and status dot turns red after 3-second grace period."
    why_human: "Requires running app with short-lived child process. Grace period behavior cannot be automated."
  - test: "Agent Binary Launch in tmux PTY (Both Paths)"
    expected: "Configure project with agent='claude' (binary installed). Launch app -- main terminal runs claude in tmux session (not typed into bash). Switch between bash project and claude project -- agent launches on switch too."
    why_human: "Requires visual inspection of tmux session contents and installed agent binary."
  - test: "Bash Fallback Banner (AGENT-05)"
    expected: "Configure project with agent='nonexistent_binary'. Main terminal shows yellow warning: 'No agent binary found. Install claude or opencode to enable AI assistance. Starting plain bash session...'"
    why_human: "Requires running app with misconfigured agent name."
  - test: "Open in Browser (AGENT-02)"
    expected: "With server running and URL detected, click Open button. System default browser opens to server URL."
    why_human: "Requires running server with URL in stdout, then visual browser launch verification."
  - test: "Server Pane Drag-Resize"
    expected: "With pane expanded, drag horizontal split handle. Height changes between 100px min and 50% max. Persists after app restart."
    why_human: "Requires mouse drag in running app."
  - test: "Per-Project Server State Isolation"
    expected: "Start server on Project A. Switch to Project B -- pane shows clean state. Switch back to Project A -- logs and status preserved. Both servers can run simultaneously."
    why_human: "Requires multiple configured projects and running servers."
  - test: "App Close Kills All Servers"
    expected: "Start servers on 2+ projects. Quit app. No zombie processes remain -- all ports freed."
    why_human: "Requires multiple running servers and OS-level process verification."
  - test: "Auto-Scroll to Latest Log Output"
    expected: "Watch logs grow during server startup. Pane auto-scrolls to bottom as new output arrives."
    why_human: "Requires running server with live output. Visual inspection needed."
---

# Phase 7: Server Pane + Agent Support Verification Report (Full Re-verification)

**Phase Goal:** User can manage a dev server from a collapsible pane and launch Claude Code or OpenCode as native PTY processes -- no wrapping, no protocol hacks, just the raw binary in tmux
**Verified:** 2026-04-09T12:00:00Z
**Status:** human_needed
**Re-verification:** Yes -- full verification after Plans 04-07 (previous verification covered only Plans 01-03)

---

## Re-verification Context

The previous VERIFICATION.md was written after Plan 03. Plans 04 through 07 subsequently made substantial changes to server.rs, server-bridge.ts, server-pane.tsx, ansi-html.ts, and app.css. This is a full re-verification of the final codebase state.

| Plan | Change Scope |
|------|-------------|
| 07-04 | ANSI 256-color/truecolor support; exit 143/137 clean stop; isRestarting guard |
| 07-05 | resetServerPane(); Clear button; project name header; EOF-based process monitoring |
| 07-06 | Per-project ServerProcesses HashMap in Rust; per-project frontend cache; kill_all_servers |
| 07-07 | CSS ANSI color visibility fix; requestAnimationFrame auto-scroll; full project name display |

---

## Requirement ID Mismatch Note

The verification prompt listed requirement IDs: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06, PANEL-07. However, REQUIREMENTS.md maps ALL PANEL-0x requirements to **Phase 6**, not Phase 7. No Phase 7 plan claims any PANEL-0x requirement. These IDs were likely included in error -- they are NOT orphaned from Phase 7's perspective. Phase 7 requirements are AGENT-01 through AGENT-06.

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Main panel has a collapsible server pane (bottom split, Ctrl+\` toggle) showing a running dev server process | PASSED (override) | ServerPane component in main-panel.tsx; state-strip/expanded/collapsed CSS classes; keyboard handler uses Ctrl+S (AZERTY accommodation); clickable ▸/▾ toggle button in toolbar |
| 2 | User can click Open in Browser to launch the dev server URL in system default browser | ✓ VERIFIED | openInBrowser() wired via @tauri-apps/plugin-opener; TypeScript compiles; openEnabled gate checks running+URL |
| 3 | User can Restart or Stop the server process from the pane controls | ✓ VERIFIED | Restart/Stop buttons in ServerPane; handleRestart/handleStop pass projectId to restartServer/stopServer; Rust commands wired |
| 4 | App detects and launches claude or opencode binary directly in tmux PTY (no wrapping or protocol modification) | ✓ VERIFIED | detectAgent() called on initial launch (main.tsx:207) and project switch (main.tsx:297); agentBinary passed to connectPty/switchTmuxSession; shell_command wired to pty.rs spawn_terminal and switch_tmux_session |
| 5 | If neither agent binary is found, app falls back to plain bash session with banner | ✓ VERIFIED | main.tsx:224-233 writes yellow banner "No agent binary found. Install claude or opencode to enable AI assistance. Starting plain bash session..." |

**Score:** 5/5 truths verified (1 PASSED via override for Ctrl+S substitution)

---

### Ctrl+\` Override Explanation

The roadmap success criterion and AGENT-01 requirement specify "Ctrl+\` toggle". The implementation uses Ctrl+S instead, per explicit user feedback that Ctrl+\` is non-functional on French AZERTY keyboards. The deviation is:

1. Intentional and documented in code comments (main.tsx:126)
2. Covered by user memory: "French Mac keyboard: Ctrl+\` broken on AZERTY; always provide clickable UI alternatives for shortcuts"
3. Equivalent function provided via clickable ▸/▾ toggle in toolbar

The override is flagged for developer acceptance in the frontmatter. A developer should confirm this substitution is acceptable before marking phase fully passed.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/server.rs` | Per-project server management | ✓ VERIFIED | ServerProcesses HashMap; start/stop/restart/detect_agent; process_group(0); killpg; EOF-based reader threads with AtomicU8 counter; kill_all_servers; Rust builds in 5.84s |
| `src-tauri/src/lib.rs` | ServerProcesses managed; close handler kills all | ✓ VERIFIED | app.manage(ServerProcesses(Mutex::new(HashMap::new()))); kill_all_servers in CloseRequested handler; plugin opener initialized |
| `src/server/server-bridge.ts` | Frontend bridge with projectId params | ✓ VERIFIED | startServer/stopServer/restartServer accept projectId; event listeners handle JSON payload; openUrl from plugin-opener; tsc exits 0 |
| `src/server/ansi-html.ts` | ANSI-to-HTML with 256-color/truecolor | ✓ VERIFIED | color256() helper; 38;5;N and 38;2;R;G;B sequence handling; HTML-escape before ANSI (T-07-03); extractServerUrl |
| `src/components/server-pane.tsx` | Full server pane component | ✓ VERIFIED | ServerPane export; serverPaneState/serverStatus signals; per-project cache; isRestarting guard; serverStartedAt grace period; resetServerPane/saveCurrentProjectState/restoreProjectState exports; Clear button; project name display; requestAnimationFrame auto-scroll; dangerouslySetInnerHTML for logs |
| `src/components/main-panel.tsx` | Integrates ServerPane | ✓ VERIFIED | import { ServerPane, serverPaneState } from './server-pane'; conditional main-h handle; no placeholder text |
| `src/main.tsx` | Agent detection + server pane wiring | ✓ VERIFIED | Ctrl+S handler with capture:true; detectAgent on initial launch and project-changed; agentBinary passed to connectPty and switchTmuxSession; resetServerPane/saveCurrentProjectState/restoreProjectState wired; server pane state persisted |
| `src/drag-manager.ts` | main-h drag handler | ✓ VERIFIED | data-handle="main-h" block with dragInit guard; updateLayout with server-pane-height on drag end |
| `src/terminal/pty-bridge.ts` | connectPty with shellCommand | ✓ VERIFIED | shellCommand?: string param; passed to invoke('spawn_terminal') |
| `src-tauri/src/terminal/pty.rs` | spawn_terminal + switch_tmux_session with shell_command | ✓ VERIFIED | both commands accept shell_command: Option<String>; agent wrapping pattern: `shell -c 'agent; exec shell'` |
| `src-tauri/src/state.rs` | server_url + layout fields | ✓ VERIFIED | server_url in ProjectEntry; server_pane_height + server_pane_state in LayoutState |
| `src/state-manager.ts` | server_url in ProjectEntry | ✓ VERIFIED | server_url?: string present |
| `src/styles/app.css` | Server pane CSS classes | ✓ VERIFIED | .server-pane.state-strip/.state-expanded/.state-collapsed; .server-pane-toolbar; .server-pane-logs with color: var(--color-text); .server-btn |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server-bridge.ts | server.rs | invoke('start_server', { cmd, cwd, projectId }) | ✓ WIRED | projectId param threaded through |
| server-bridge.ts | @tauri-apps/plugin-opener | openUrl() | ✓ WIRED | TypeScript resolves; tsc exits 0 |
| server-pane.tsx | server-bridge.ts | import from '../server/server-bridge' | ✓ WIRED | All 6 bridge functions used |
| server-pane.tsx | ansi-html.ts | ansiToHtml + extractServerUrl | ✓ WIRED | Used in log rendering and URL extraction |
| server-pane.tsx listenServerOutput | server.rs reader threads | JSON payload { project, text } | ✓ WIRED | Filter by project === activeProjectName.value |
| server-pane.tsx listenServerStopped | server.rs EOF detection | JSON payload { project, code } | ✓ WIRED | isRestarting guard + 143/137 clean stop + grace period |
| main.tsx bootstrap | server-bridge.ts detectAgent | detectAgent(activeProject.agent) | ✓ WIRED | main.tsx:207 |
| main.tsx project-changed | server-bridge.ts detectAgent | detectAgent(project.agent) | ✓ WIRED | main.tsx:297 |
| main.tsx | pty-bridge.ts connectPty | agentBinary passed as shellCommand | ✓ WIRED | main.tsx:215 |
| main.tsx | switchTmuxSession | agentBinary passed as shellCommand | ✓ WIRED | main.tsx:307 |
| drag-manager.ts main-h | state-manager.ts | updateLayout({ 'server-pane-height' }) | ✓ WIRED | onEnd calls updateLayout; dragInit guard prevents duplicates |
| lib.rs CloseRequested | server.rs | kill_all_servers(&window.app_handle()) | ✓ WIRED | lib.rs:136 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| server-pane.tsx log area | serverLogs.value | listenServerOutput callback from Rust server-output events | Server stdout/stderr piped to frontend via Tauri events | ✓ FLOWING |
| server-pane.tsx status dot | serverStatus.value | listenServerStopped callback; handleStart/Stop/Restart | Real process lifecycle events | ✓ FLOWING |
| server-pane.tsx Open button | detectedUrl.value | extractServerUrl() from live server output, or proj.server_url config | Real URL from stdout or project config | ✓ FLOWING |
| main.tsx agent launch | agentBinary | detectAgent() Rust `which` check | Returns binary name or throws | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust backend compiles | cargo build --manifest-path src-tauri/Cargo.toml | Finished dev in 5.84s, 0 errors | ✓ PASS |
| TypeScript compiles cleanly | pnpm exec tsc --noEmit | Exit 0, no errors | ✓ PASS |
| Server pane component exports | grep "export.*ServerPane\|export.*serverPaneState\|export.*resetServerPane" server-pane.tsx | Lines 24, 25, 81, 101, 42, 51 | ✓ PASS |
| Per-project cache in Rust | grep "ServerProcesses\|HashMap" src-tauri/src/server.rs | Lines 1, 17 -- HashMap<String, ServerEntry> | ✓ PASS |
| Agent detection on project switch | grep detectAgent src/main.tsx | Lines 30 (import), 207 (bootstrap), 297 (project-changed) | ✓ PASS |
| Capture-phase keyboard handler | grep "capture: true" src/main.tsx | Line 141 -- capture:true present | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| AGENT-01 | 07-01, 07-02, 07-04, 07-07 | Main panel collapsible server pane (bottom split, Ctrl+\` toggle) with Open/Restart/Stop | SATISFIED (override) | Pane exists; Ctrl+S replaces Ctrl+\` for AZERTY; clickable toggle in toolbar; all 3 controls wired |
| AGENT-02 | 07-01, 07-02, 07-03 | Open in Browser launches dev server URL in system default browser | ✓ SATISFIED | openUrl() from plugin-opener; openEnabled gated on running+URL; TypeScript compiles |
| AGENT-03 | 07-02, 07-03, 07-04, 07-05, 07-06 | App detects claude binary and launches it in tmux PTY without wrapping | ✓ SATISFIED | detectAgent + shell_command on both initial launch and project switch; agent wraps as `shell -c 'agent; exec shell'` |
| AGENT-04 | 07-02, 07-03 | App detects opencode binary and launches it in tmux PTY without wrapping | ✓ SATISFIED | Same detect_agent command handles any binary name; same shell_command path |
| AGENT-05 | 07-02 | Falls back to plain bash with banner if no agent found | ✓ SATISFIED | main.tsx:224-233 -- 3-line yellow banner written to terminal when agentBinary is null |
| AGENT-06 | 07-01, 07-05, 07-06 | Per-project config specifies which agent to launch | ✓ SATISFIED | ProjectEntry.agent field; detectAgent called conditionally (agent !== 'bash'); per-project server state cache |
| PANEL-01 through PANEL-07 | NONE | Not claimed by Phase 7 -- assigned to Phase 6 in REQUIREMENTS.md | ORPHANED (wrong phase) | These IDs were listed in the verification prompt in error. Phase 7 plans do not claim them. Phase 6 is the responsible phase. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/main.tsx | 127 | Ctrl+S hardcoded as server pane toggle (was Ctrl+\` per AGENT-01) | Warning | Deviates from documented requirement; Ctrl+S may conflict with system "Save" in some contexts |

No stubs, empty implementations, or disconnected wiring found.

---

### Human Verification Required

#### 1. Server Process Start/Stop/Restart Controls

**Test:** Configure a project with server_cmd (e.g., `python3 -m http.server 8000`). Click Start. Observe log streaming. Click Stop. Run `lsof -i :8000` to verify port freed. Click Restart and observe restart banner.
**Expected:** Log shows "[server] Starting: {cmd}" with colored streaming output. Stop kills the process within 3 seconds. Restart shows "--- Restarting ---" and server comes back.
**Why human:** Requires a running app with a configured project and OS-level process verification.

#### 2. Ctrl+S Pane State Cycle (Note: Ctrl+` per spec was changed to Ctrl+S)

**Test:** Press Ctrl+S three times while terminal has focus. Also click the ▸/▾ toolbar button. Restart the app.
**Expected:** strip (28px) -> expanded -> collapsed -> strip each press. State persists after restart.
**Why human:** Requires keyboard interaction in running app. Developer should also confirm Ctrl+S substitution for Ctrl+\` is acceptable.

#### 3. ANSI Color Rendering in Server Logs

**Test:** Start a Vite/Next.js/similar server that produces colored output. Observe the server pane log area.
**Expected:** Colored text renders with visible colors (not monochrome). Both basic ANSI (30-37) and 256-color/truecolor sequences should display correctly.
**Why human:** Requires running server with ANSI output; visual inspection needed.

#### 4. Crash Detection Display (D-14)

**Test:** Start a server that exits immediately (e.g., `python3 -c "print('hello')"`) and wait 3 seconds.
**Expected:** After 3-second grace period, log shows "Process exited (code 0)" and status dot turns red.
**Why human:** Requires running app with short-lived child process; grace period timing cannot be automated.

#### 5. Agent Binary Launch in tmux PTY -- Both Paths

**Test:** Configure project with agent='claude' (binary must be installed). Launch app -- verify main terminal runs claude in tmux. Switch between projects -- claude should launch on switch too.
**Expected:** tmux session runs claude binary directly on both initial launch and project switch. The shell wrapping pattern (`zsh -c 'claude; exec zsh'`) means claude is the initial process.
**Why human:** Requires installed agent binary and visual tmux session inspection.

#### 6. Bash Fallback Banner (AGENT-05)

**Test:** Configure project with agent='nonexistent_binary'. Observe main terminal on startup.
**Expected:** Three blank lines, then: "No agent binary found." / "Install claude or opencode to enable AI assistance." / "Starting plain bash session..." (all in yellow).
**Why human:** Requires running app with misconfigured agent name.

#### 7. Open in Browser (AGENT-02)

**Test:** Start a server that outputs a localhost URL. Once URL appears in logs, click the Open button.
**Expected:** System default browser opens to the detected URL.
**Why human:** Requires running server with URL in stdout, then browser launch verification.

#### 8. Server Pane Drag-Resize

**Test:** With pane expanded, drag horizontal split handle. Restart app.
**Expected:** Height changes smoothly (min 100px, max 50% panel height). Persists in state.json after restart.
**Why human:** Requires mouse drag interaction in running app.

#### 9. Per-Project Server State Isolation

**Test:** Start server on Project A. Switch to Project B. Observe pane (should be clean). Switch back to A. Observe logs/status.
**Expected:** Project B shows clean state (no A's logs). Switching back to A restores A's logs and running status. Server A stays running throughout.
**Why human:** Requires multiple configured projects and running servers.

#### 10. App Close Kills All Servers

**Test:** Start servers on 2+ projects. Quit app via menu or Cmd+Q. Check ports.
**Expected:** All ports freed within a few seconds. No zombie processes.
**Why human:** Requires multiple running servers and OS-level process verification.

#### 11. Auto-Scroll to Latest Log Output

**Test:** Start a verbose server. Watch log area as output streams in.
**Expected:** Pane auto-scrolls unconditionally to bottom as new output arrives.
**Why human:** Requires running server with live output; visual inspection needed.

---

## Gaps Summary

No automated verification gaps were found. All code artifacts exist, are substantive, and are wired correctly. TypeScript and Rust compile cleanly.

**Key finding:** The Ctrl+\` toggle specified in AGENT-01 and the roadmap success criteria was replaced with Ctrl+S to accommodate French AZERTY keyboards. This is an intentional deviation documented in code. Developer acknowledgment is needed to formally accept this change (see override in frontmatter).

**PANEL-01 through PANEL-07 requirement IDs** listed in the verification prompt are Phase 6 requirements, not Phase 7. No action required from Phase 7.

**11 human verification items** require manual testing in the running app to complete acceptance.

---

_Verified: 2026-04-09T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
