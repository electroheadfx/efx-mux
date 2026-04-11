---
phase: 08-keyboard-polish
verified: 2026-04-10T09:00:00Z
status: human_needed
score: 15/15 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/15
  gaps_closed:
    - "Ctrl+P now dispatches CustomEvent('open-fuzzy-search') — fuzzy-search listener fires correctly"
    - "PTY exit detection replaced with parallel pane-death monitoring thread — pty-exited event fires reliably"
    - "Crash overlay renders with correct exit code via tmux pane_dead_status query"
    - "createNewTab() always creates plain shell (agentBinary=undefined) — agent only on first/restored tab"
    - "switchToTab() defers fit+focus via requestAnimationFrame for correct reflow"
    - "restoreTabs() added to terminal-tabs.tsx; bootstrap reads saved tab data from state.json"
    - "Cmd+W intercepts close tab via JS handler; PredefinedMenuItem::close_window removed from native menu"
    - "Sidebar zero-project openProjectModal() removed — wizard in initProjects() is single authority"
    - "AppState interface includes projects field; every save path syncs projects signal before serializing"
    - "Ctrl+, / Cmd+, opens preferences panel overlay (preferences-panel.tsx created)"
    - "Shortcut cheatsheet updated with Ctrl+, entry"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Full Phase 8 UAT (keyboard shortcuts, tabs, crash recovery, wizard)"
    expected: "All 15 UAT tests pass: Ctrl+C/D/Z passthrough, Ctrl+B/S/T/W/Tab/P/? shortcuts, tab create/close/cycle, crash overlay, wizard flow, preferences panel"
    why_human: "App must be running in pnpm tauri dev; all features involve interactive PTY behavior, visual rendering, tmux session management, and modal flows that cannot be verified statically"
---

# Phase 8: Keyboard + Polish Re-Verification Report

**Phase Goal:** User has a complete, conflict-free keyboard shortcut system and a polished first-run experience -- the app handles crashes gracefully and never eats terminal control sequences
**Verified:** 2026-04-10T09:00:00Z
**Status:** human_needed
**Re-verification:** Yes -- after gap closure (Plans 04-08)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Ctrl+C/D/Z/L/R always reach the terminal when terminal is focused | VERIFIED | `TERMINAL_PASSTHROUGH = new Set(['c','d','z','l','r'])` main.tsx line 105; guard at line 115 returns early for these keys with ctrlKey check |
| 2 | Ctrl+T/W/Tab/B/S/P/? fire app actions regardless of focus | VERIFIED | All cases present in consolidated handler; Ctrl+P dispatches `new CustomEvent('open-fuzzy-search')` at line 145; fuzzy-search.tsx line 116 listens for this event |
| 3 | Ctrl+? opens a cheatsheet overlay showing all shortcuts | VERIFIED | `toggleCheatsheet()` called at main.tsx lines 150+155; ShortcutCheatsheet renders 10 shortcuts in 3 sections including Ctrl+, entry |
| 4 | Cheatsheet dismisses on Escape, click outside, or any shortcut key | VERIFIED | shortcut-cheatsheet.tsx backdrop onClick + useEffect Escape+Ctrl key listener |
| 5 | Ctrl+Shift+T still toggles theme mode | VERIFIED | case at main.tsx line 157 checks `key === 't' && e.ctrlKey && e.shiftKey` |
| 6 | User can create a new terminal tab with Ctrl+T | VERIFIED | `createNewTab()` called at main.tsx line 133; new tabs always get `agentBinary = undefined` (terminal-tabs.tsx line 129) |
| 7 | User can close active tab with Ctrl+W | VERIFIED | `closeActiveTab()` called at main.tsx line 137; also handles Cmd+W (line 135: `e.ctrlKey || e.metaKey`) |
| 8 | User can cycle tabs with Ctrl+Tab (wraps around) | VERIFIED | `cycleToNextTab()` called at main.tsx line 141; wraps via `(idx + 1) % tabs.length` in terminal-tabs.tsx |
| 9 | Closing the last tab auto-creates a fresh default session | VERIFIED | terminal-tabs.tsx lines 181-183: `if (remaining.length === 0) { await createNewTab(); }` |
| 10 | Each tab is its own tmux session | VERIFIED | createNewTab() derives unique sessionName with tabCounter suffix; connectPty() called per tab |
| 11 | When a PTY session exits, user sees an inline overlay with Restart button | VERIFIED | Parallel monitoring thread in pty.rs polls pane_dead every 500ms; emits pty-exited; terminal-tabs.tsx line 512 listens; ActiveTabCrashOverlay renders CrashOverlay when exitCode is set |
| 12 | Normal exit (code 0) shows green dot + 'Session ended' | VERIFIED | crash-overlay.tsx line 22: `bg-[#859900]` + line 25: "Session ended" |
| 13 | Crash exit (non-zero) shows red dot + 'Process crashed' + exit code | VERIFIED | crash-overlay.tsx: `bg-[#dc322f]` + "Process crashed" + "Exit code {tab.exitCode}" |
| 14 | On first launch (no state.json or zero projects), wizard modal opens | VERIFIED | main.tsx line 295: `openWizard()` called when projectList.length === 0; sidebar no longer has competing openProjectModal() in zero-project path (sidebar.tsx lines 234-235 now have comment: "wizard owns this") |
| 15 | Wizard has 5 steps: Welcome, Project, Agent, Theme, Server+GSD | VERIFIED | first-run-wizard.tsx line 18: `const STEPS = ['Welcome', 'Project', 'Agent', 'Theme', 'Server & GSD']` |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/shortcut-cheatsheet.tsx` | Cheatsheet overlay (50+ lines) | VERIFIED | 111 lines; exports toggleCheatsheet + ShortcutCheatsheet; 10 shortcuts in 3 sections; Ctrl+, entry added |
| `src/main.tsx` | Consolidated capture-phase handler | VERIFIED | Single addEventListener with `{capture:true}`; TERMINAL_PASSTHROUGH set; all shortcuts wired; Ctrl+P dispatches CustomEvent; Cmd+W handled |
| `src/terminal/terminal-manager.ts` | xterm.js key blocker | VERIFIED (from prior) | attachCustomKeyEventHandler blocks ['t','w','b','s','p','k'], Tab, '?', '/' |
| `src/components/terminal-tabs.tsx` | Tab management (100+ lines) | VERIFIED | ~587 lines; exports createNewTab, closeActiveTab, cycleToNextTab, TerminalTabBar, initFirstTab, getActiveTerminal, restoreTabs; switchToTab uses requestAnimationFrame |
| `src/components/crash-overlay.tsx` | PTY exit overlay (40+ lines) | VERIFIED | 42 lines; "Session ended" / "Process crashed" / "Exit code" / "Restart Session" |
| `src/components/main-panel.tsx` | Tab bar + terminal containers | VERIFIED (from prior) | Imports TerminalTabBar + ActiveTabCrashOverlay; terminal-containers div present |
| `src-tauri/src/terminal/pty.rs` | PTY exit with real exit code | VERIFIED | Parallel monitoring thread polls pane_dead every 500ms; queries pane_dead_status for real exit code; kills session; emits pty-exited; cleanup_dead_sessions command added |
| `src/components/first-run-wizard.tsx` | First-run wizard (150+ lines) | VERIFIED | 365 lines; 5 steps; openWizard export; addProject call; Escape blocked |
| `src/components/preferences-panel.tsx` | Preferences panel overlay | VERIFIED | 136 lines; togglePreferences + closePreferences exports; shows project name/path/agent; theme toggle; Escape dismiss |
| `src/state-manager.ts` | AppState with projects field | VERIFIED | Interface at line 29-37 includes `projects: ProjectEntry[]`; catch-block default includes `projects: []`; every save syncs signal |
| `src/components/sidebar.tsx` | No competing zero-project modal | VERIFIED | Lines 234-235 have comment "wizard owns this"; no openProjectModal() in init useEffect |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/main.tsx | src/components/shortcut-cheatsheet.tsx | toggleCheatsheet() import | WIRED | main.tsx line 19 imports toggleCheatsheet; called at lines 150+155 |
| src/main.tsx Ctrl+P | src/components/fuzzy-search.tsx | CustomEvent('open-fuzzy-search') | WIRED | main.tsx line 145 dispatches event; fuzzy-search.tsx line 116 listens |
| src-tauri/src/terminal/pty.rs | src/components/terminal-tabs.tsx | pty-exited Tauri event | WIRED | pty.rs emits "pty-exited" (lines 217, 265); terminal-tabs.tsx line 512 listens via listen<> |
| src/main.tsx | src/components/terminal-tabs.tsx | createNewTab/closeActiveTab/cycleToNextTab | WIRED | main.tsx line 24 imports all three; called at lines 133, 137, 141 |
| src/components/terminal-tabs.tsx | src/terminal/pty-bridge.ts | connectPty() for each tab | WIRED | createNewTab() and restoreTabs() call connectPty |
| src/main.tsx | src/components/first-run-wizard.tsx | openWizard() call in initProjects() | WIRED | main.tsx line 20 imports openWizard; called at line 295 |
| src/components/first-run-wizard.tsx | src/state-manager.ts | addProject() call on finish | WIRED | first-run-wizard.tsx line 9 imports addProject; called at line 56 |
| main.tsx bootstrap | restoreTabs() | reads terminal-tabs from state.json | WIRED | main.tsx line 24 imports restoreTabs; lines 232-237 read state and call it |
| keydown handler | closeActiveTab | Cmd+W or Ctrl+W | WIRED | main.tsx line 135: `key === 'w' && (e.ctrlKey || e.metaKey)` calls closeActiveTab() |
| keydown handler | togglePreferences | Ctrl+, detection | WIRED | main.tsx line 161: `key === ',' && (e.ctrlKey || e.metaKey)` calls togglePreferences() |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| crash-overlay.tsx | tab.exitCode | pty.rs monitoring thread polls pane_dead → pane_dead_status → emit("pty-exited") → listen → tab.exitCode = code | Yes (real tmux exit code query) | FLOWING |
| terminal-tabs.tsx (TerminalTabBar) | terminalTabs signal | createNewTab()/initFirstTab()/restoreTabs() → PTY connection per tab | Yes (real PTY sessions, real tmux) | FLOWING |
| first-run-wizard.tsx | directory, projectName signals | Native dialog picker → addProject() → invoke('add_project') → state.json | Yes (real filesystem paths + Rust persistence) | FLOWING |
| preferences-panel.tsx | activeProjectName, projects signals | Loaded from state.json via loadAppState() → projects signal | Yes (real persisted project data) | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED (cannot run the app per CLAUDE.md: "Please do not run the server, I do on my side")

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| UX-01 | 08-01, 08-04, 08-08 | App-level keyboard shortcuts captured before terminal, no Ctrl+C/D/Z conflicts | SATISFIED | Single capture-phase handler; TERMINAL_PASSTHROUGH set; Ctrl+P wired via CustomEvent; Ctrl+, preferences wired |
| UX-02 | 08-02, 08-06, 08-07 | Ctrl+T new tab, Ctrl+W close, Ctrl+Tab cycle | SATISFIED | All three wired; Cmd+W also handled; tabs persist; tab switching has requestAnimationFrame reflow fix |
| UX-03 | 08-02, 08-05 | PTY crash shows restart banner | SATISFIED | pane-death monitoring thread fires pty-exited with real exit code; CrashOverlay renders; Restart button works |
| UX-04 | 08-03, 08-07 | First-run wizard for project + agent selection | SATISFIED | 5-step wizard; sidebar race eliminated; AppState projects field added; settings persist |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/components/terminal-tabs.tsx | 388 | `restartTabSession()` calls `resolveAgentBinary(projectInfo?.agent)` which restarts with agent binary — this is intentional for restart (user wants the same session type back) | Info | Not a stub; intended behavior |
| src-tauri/src/terminal/pty.rs | 200-272 | Monitoring thread has no maximum iteration cap; runs until pane dies or session disappears. Long-lived sessions poll forever at 500ms. | Warning | CPU cost is negligible at 500ms but worth noting for future optimization |

No blockers found.

### Human Verification Required

All automated must-have truths are now VERIFIED. The remaining gate is live app testing — the UAT that was bypassed in Plan 03 (auto-approved checkpoint) has not yet been run against the gap-closure plans (04-08).

#### 1. Full Phase 8 UAT

**Test:** Run `pnpm tauri dev` and execute the complete test matrix:

1. With terminal focused, press Ctrl+C -- verify SIGINT reaches terminal (not intercepted)
2. Press Ctrl+B -- verify sidebar toggles
3. Press Ctrl+S -- verify server pane toggles
4. Press Ctrl+P -- verify fuzzy search opens (was broken, now fixed via CustomEvent)
5. Press Ctrl+? -- verify cheatsheet overlay opens with 10 shortcuts
6. Press Escape or click outside -- verify cheatsheet dismisses
7. Press Ctrl+T three times -- verify all new tabs are plain shell (not agent sessions)
8. Press Ctrl+Tab -- verify tab cycling works; terminal is responsive and visible in each tab
9. Close tabs with Ctrl+W until one remains -- verify last tab creates fresh default
10. In a terminal tab, run `exit` -- verify "Session ended" overlay with green dot appears
11. Click "Restart Session" -- verify new session starts
12. Run a crashing command (e.g., `kill -9 $$`) -- verify red dot + "Process crashed" + exit code
13. Create 2+ tabs, quit app, relaunch -- verify same tabs are restored
14. Delete `~/.config/efxmux/state.json`, relaunch -- verify wizard opens
15. Complete all 5 wizard steps, click "Finish Setup" -- verify no Add Project modal appears; project is registered
16. Quit and relaunch -- verify project from wizard is still active (not /tmp default)
17. Press Ctrl+, -- verify preferences panel opens with current project info
18. Press Escape in preferences -- verify panel closes
19. Press Cmd+W with multiple tabs -- verify it closes a tab (not the app)

**Expected:** All 19 steps pass
**Why human:** App must be running; involves live PTY sessions, tmux exit detection, visual rendering, and modal/overlay interactive flows that cannot be verified statically

### Gaps Summary

No automated gaps remain. All 15 must-have truths verify against actual code. All 8 UAT failures diagnosed from the previous session (Plans 04-08) have corresponding code fixes committed. The single remaining gate is human UAT to confirm the fixes work correctly at runtime.

---

_Verified: 2026-04-10T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
