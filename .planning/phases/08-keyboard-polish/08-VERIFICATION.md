---
phase: 08-keyboard-polish
verified: 2026-04-09T17:45:00Z
status: gaps_found
score: 13/15 must-haves verified
re_verification: false
gaps:
  - truth: "Ctrl+T/W/Tab/B/S/P/? fire app actions regardless of focus"
    status: partial
    reason: "Ctrl+P is intercepted by the capture-phase handler (stopPropagation()) but does nothing — the fuzzy-search bubble-phase listener (fuzzy-search.tsx line 118, no capture:true) never fires because stopPropagation() in capture phase blocks all further propagation. Ctrl+P effectively does nothing after Plan 01 consolidation."
    artifacts:
      - path: "src/main.tsx"
        issue: "Ctrl+P case calls e.preventDefault() + e.stopPropagation() but only has a comment; no openSearch() call or CustomEvent dispatch"
      - path: "src/components/fuzzy-search.tsx"
        issue: "Module-scope listener at line 118 registered without {capture:true} — cannot fire after capture-phase stopPropagation"
    missing:
      - "In the Ctrl+P case in main.tsx, call openSearch() (imported from fuzzy-search) OR dispatch a 'open-fuzzy-search' CustomEvent instead of relying on the bubble-phase listener"
      - "Alternative: register the fuzzy-search handler with {capture:true} so it fires before or alongside the consolidated handler"
human_verification:
  - test: "Full UX-01 through UX-04 UAT"
    expected: "All keyboard shortcuts, tab management, crash recovery, and first-run wizard work correctly under real app conditions"
    why_human: "Plan 03 Task 2 (UAT checkpoint:human-verify) was auto-approved without actual human testing. No human has run through the test matrix."
---

# Phase 8: Keyboard + Polish Verification Report

**Phase Goal:** User has a complete, conflict-free keyboard shortcut system and a polished first-run experience -- the app handles crashes gracefully and never eats terminal control sequences
**Verified:** 2026-04-09T17:45:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Ctrl+C/D/Z/L/R always reach the terminal when terminal is focused | VERIFIED | `TERMINAL_PASSTHROUGH = new Set(['c','d','z','l','r'])` in main.tsx line 103; handler returns early for these keys |
| 2 | Ctrl+T/W/Tab/B/S/P/? fire app actions regardless of focus | PARTIAL | Ctrl+P handler calls stopPropagation() then does nothing; fuzzy-search bubble-phase listener is blocked (see Gaps) |
| 3 | Ctrl+? opens a cheatsheet overlay showing all shortcuts | VERIFIED | `toggleCheatsheet()` called at main.tsx lines 146+151; ShortcutCheatsheet renders 9 shortcuts in 3 sections |
| 4 | Cheatsheet dismisses on Escape, click outside, or any shortcut key | VERIFIED | shortcut-cheatsheet.tsx uses backdrop onClick + useEffect Escape listener |
| 5 | Ctrl+Shift+T still toggles theme mode | VERIFIED | `case key === 't' && e.shiftKey` in consolidated handler calls toggleThemeMode() |
| 6 | User can create a new terminal tab with Ctrl+T | VERIFIED | `createNewTab()` called from keyboard handler (main.tsx line 129); terminal-tabs.tsx 500 lines |
| 7 | User can close active tab with Ctrl+W | VERIFIED | `closeActiveTab()` called (main.tsx line 133) |
| 8 | User can cycle tabs with Ctrl+Tab (wraps around) | VERIFIED | `cycleToNextTab()` called (main.tsx line 137); wraps via index modulo in terminal-tabs.tsx |
| 9 | Closing the last tab auto-creates a fresh default session | VERIFIED | terminal-tabs.tsx line 181-183: `if (remaining.length === 0) { await createNewTab(); }` |
| 10 | Each tab is its own tmux session | VERIFIED | createNewTab() derives unique sessionName; connectPty() called per tab |
| 11 | When a PTY session exits, user sees an inline overlay with Restart button | VERIFIED | ActiveTabCrashOverlay rendered in main-panel.tsx line 68; pty-exited event sets tab.exitCode |
| 12 | Normal exit (code 0) shows green dot + 'Session ended' | VERIFIED | crash-overlay.tsx line 22: `bg-[#859900]` + line 25: "Session ended" |
| 13 | Crash exit (non-zero) shows red dot + 'Process crashed' + exit code | VERIFIED | crash-overlay.tsx line 22: `bg-[#dc322f]` + "Process crashed" + "Exit code {tab.exitCode}" |
| 14 | On first launch (no state.json or zero projects), wizard modal opens | VERIFIED | main.tsx line 269: `openWizard()` replaces `openProjectModal({ firstRun: true })` |
| 15 | Wizard has 5 steps: Welcome, Project, Agent, Theme, Server+GSD | VERIFIED | first-run-wizard.tsx line 18: `const STEPS = ['Welcome', 'Project', 'Agent', 'Theme', 'Server & GSD']` |

**Score:** 13/15 truths verified (1 partial = gap, 1 pending human UAT)

Additional truths from roadmap (SC from ROADMAP.md):

| # | Roadmap SC | Status | Evidence |
|---|------------|--------|---------|
| SC-1 | App-level shortcuts work without intercepting Ctrl+C/D/Z/L/R | PARTIAL | Ctrl+P broken (see gap); Ctrl+C/D/Z/L/R passthrough verified |
| SC-2 | Ctrl+T new tab, Ctrl+W close, Ctrl+Tab cycle | VERIFIED | All three wired and tested |
| SC-3 | PTY crash shows banner with Restart Session | VERIFIED | CrashOverlay with Restart Session button |
| SC-4 | First-run wizard prompts for project + agent | VERIFIED | 5-step wizard with project + agent selection |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/shortcut-cheatsheet.tsx` | Cheatsheet overlay (50+ lines) | VERIFIED | 110 lines; exports toggleCheatsheet + ShortcutCheatsheet; 9 shortcuts, z-[100] backdrop |
| `src/main.tsx` | Consolidated capture-phase handler | VERIFIED | Single addEventListener with {capture:true}; TERMINAL_PASSTHROUGH set present |
| `src/terminal/terminal-manager.ts` | xterm.js key blocker | VERIFIED | attachCustomKeyEventHandler blocks ['t','w','b','s','p','k'], Tab, '/', '?', Ctrl+Shift+T |
| `src/components/terminal-tabs.tsx` | Tab management module (100+ lines) | VERIFIED | 500 lines; exports createNewTab, closeActiveTab, cycleToNextTab, TerminalTabBar, initFirstTab, getActiveTerminal |
| `src/components/crash-overlay.tsx` | PTY exit overlay (40+ lines) | VERIFIED | 42 lines; "Session ended" / "Process crashed" / "Exit code" / "Restart Session" |
| `src/components/main-panel.tsx` | Tab bar + terminal containers | VERIFIED | Imports TerminalTabBar + ActiveTabCrashOverlay; terminal-containers div present |
| `src-tauri/src/terminal/pty.rs` | PTY exit event with real exit code | VERIFIED | remain-on-exit set; pane_dead_status queried; kill-session cleanup; app_for_exit.emit("pty-exited") |
| `src/components/first-run-wizard.tsx` | First-run wizard (150+ lines) | VERIFIED | 365 lines; 5 steps; openWizard/FirstRunWizard exports; addProject call; Escape blocked |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/main.tsx | src/components/shortcut-cheatsheet.tsx | toggleCheatsheet() import | WIRED | main.tsx line 19 imports toggleCheatsheet; called at lines 146+151 |
| src/terminal/terminal-manager.ts | src/main.tsx | Both block same key set | WIRED | terminal-manager.ts blocks ['t','w','b','s','p','k']+Tab+?+/; main.tsx handler claims same keys |
| src-tauri/src/terminal/pty.rs | src/components/terminal-tabs.tsx | pty-exited Tauri event | WIRED | pty.rs emits "pty-exited"; terminal-tabs.tsx line 426 listens via listen<> |
| src/main.tsx | src/components/terminal-tabs.tsx | createNewTab/closeActiveTab/cycleToNextTab | WIRED | main.tsx line 23 imports all three; called at lines 129, 133, 137 |
| src/components/terminal-tabs.tsx | src/terminal/pty-bridge.ts | connectPty() for each new tab | WIRED | terminal-tabs.tsx calls connectPty within createNewTab |
| src/main.tsx | src/components/first-run-wizard.tsx | openWizard() call in initProjects() | WIRED | main.tsx line 20 imports openWizard; called at line 269 |
| src/components/first-run-wizard.tsx | src/state-manager.ts | addProject() call on wizard finish | WIRED | first-run-wizard.tsx line 9 imports addProject; called at line 60 |
| **src/main.tsx Ctrl+P** | **src/components/fuzzy-search.tsx** | **openSearch() or CustomEvent** | **NOT WIRED** | **Capture handler stopPropagation() blocks bubble-phase listener; no dispatch or direct call** |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| crash-overlay.tsx | tab.exitCode | pty.rs emit("pty-exited") → listen → tab.exitCode = code | Yes (tmux pane_dead_status query) | FLOWING |
| terminal-tabs.tsx (TerminalTabBar) | terminalTabs signal | createNewTab() → PTY connection | Yes (real PTY sessions) | FLOWING |
| first-run-wizard.tsx | directory, projectName signals | Native dialog picker + addProject() | Yes (real filesystem paths) | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED (cannot run the app per CLAUDE.md instructions; all checks require interactive app execution)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| UX-01 | 08-01 | App-level keyboard shortcuts captured before terminal, no Ctrl+C/D/Z conflicts | PARTIAL | Ctrl+C/D/Z/L/R passthrough verified; Ctrl+P broken (stopPropagation blocks fuzzy-search) |
| UX-02 | 08-02 | Ctrl+T new tab, Ctrl+W close, Ctrl+Tab cycle | SATISFIED | All three keyboard actions wired and functional in code |
| UX-03 | 08-02 | PTY crash shows restart banner | SATISFIED | CrashOverlay component + ActiveTabCrashOverlay wired in main-panel |
| UX-04 | 08-03 | First-run wizard for project + agent selection | SATISFIED | 5-step wizard complete with project registration |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/main.tsx | 141 | `// fuzzy search is handled by its own module-scope listener` — comment documents intention, actual behavior contradicts it | Blocker | Ctrl+P does nothing; fuzzy search cannot open from keyboard after Plan 01 |

### Human Verification Required

The Plan 03 Task 2 UAT checkpoint was marked "Auto-approved (checkpoint:human-verify)" in the SUMMARY.md. This means no human actually ran through the Phase 8 test matrix. The following tests are required:

#### 1. Full Phase 8 UAT

**Test:** Follow the test matrix from 08-03-PLAN.md Task 2:
1. Run `pnpm tauri dev`
2. With terminal focused, press Ctrl+C -- verify SIGINT reaches terminal (not intercepted)
3. Press Ctrl+B -- verify sidebar toggles
4. Press Ctrl+S -- verify server pane toggles
5. Press Ctrl+P -- verify fuzzy search opens (currently suspected broken)
6. Press Ctrl+? (Ctrl+Shift+/) -- verify cheatsheet overlay opens
7. Press Escape or click outside -- verify cheatsheet dismisses
8. Press Ctrl+T -- verify new terminal tab appears
9. Verify new tab has its own tmux session
10. Press Ctrl+Tab -- verify tab cycling
11. Click X on a tab to close it
12. Close all tabs until one remains -- verify last-tab creates fresh default tab
13. In a terminal, run `exit` -- verify "Session ended" overlay with green dot
14. Click "Restart Session" -- verify new session starts
15. Delete ~/.config/efxmux/state.json and relaunch -- verify wizard opens
16. Click through all 5 wizard steps
17. Complete "Finish Setup" -- verify project registered and app loads

**Expected:** All 17 steps pass
**Why human:** App must be running; involves PTY behavior, visual rendering, and interactive flows that cannot be verified statically

### Gaps Summary

**1 gap blocking goal achievement:**

**Ctrl+P broken after keyboard consolidation.** The consolidated capture-phase handler in `src/main.tsx` intercepts Ctrl+P with `e.preventDefault(); e.stopPropagation()` but only contains a comment "fuzzy search is handled by its own module-scope listener." The fuzzy-search module registers its Ctrl+P listener without `{ capture: true }` (bubble phase), but `stopPropagation()` in the capture phase prevents the event from reaching bubble-phase listeners on `document`. The result: Ctrl+P does nothing — it doesn't open fuzzy search and doesn't reach the terminal.

**Fix (two options):**
- Option A (minimal): In the Ctrl+P case, dispatch `document.dispatchEvent(new CustomEvent('open-fuzzy-search'))` after stopPropagation — the CustomEvent listener in fuzzy-search.tsx line 121 will fire.
- Option B (clean): Import `openSearch` from `./components/fuzzy-search` in main.tsx and call it directly from the Ctrl+P case.

**Human UAT also required** before phase can be marked complete (Plan 03 auto-approval bypass does not satisfy the human-gate requirement for UX features).

---

_Verified: 2026-04-09T17:45:00Z_
_Verifier: Claude (gsd-verifier)_
