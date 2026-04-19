---
slug: 22-persistence-chaos
status: fixing
trigger: Phase 22 UAT R-10 confirmed visually — quit/restart produces chaotic state. Tabs restore but with wrong labels (truncated), agent processes die ([exited]), tab counter shows stale high numbers on fresh restart. User: "persistence chaos". Plan 22-08 claimed per-mutation persistence fixed.
created: 2026-04-19
updated: 2026-04-19
goal: find_and_fix
---

# Debug: 22-persistence-chaos

## Symptoms

<DATA_START>
**Expected behavior on app restart:**
- All tabs that existed at quit-time reappear with full, correct labels
- Active tab from prior session is re-activated
- Terminal PTYs reattach to their tmux sessions with live shell state
- Agent PTYs reattach to their tmux sessions with live agent process still running (or gracefully report "agent exited, relaunch")
- Tab counter resumes from correct high-water mark without gaps or spurious jumps

**Actual behavior (screenshots 2026-04-19 post-fix build):**
- Image 1 (after restart, split): top pane shows "Terminal 5" + "Agent c" tabs; bottom pane shows another "Agent c" tab. Both agent panes display `[Esc to exit] / Nothing to rewind to yet. / > Rewind / high · e` — this is Claude Code's rewind UI stuck at start, suggesting the agent was restarted from scratch (not reattached) and may be in a broken re-init state.
- Image 2 (different restart state): single pane shows "Terminal 5" + "Agent c". Agent c content: `[exited]` — agent process has died.
- Label truncation: "Agent claude" became "Agent c" — the label was either truncated at restore time, or restore wrote only the first word.
- Spurious "Terminal 5" — monotonic counter (per 22-12 decision) suggests prior session had Terminals 1-4 already closed but the counter persisted at 5. That part is by-design for monotonic. BUT if user's fresh project started here, this means restore is merging stale state from another project.
- Split was either not preserved correctly OR was duplicated (two "Agent c" in split panes — same tab id? duplicate restore?).
- User: agent "become crazy, and quit, its not stable".

**Error messages:** None in UI. Check console on quit + relaunch.

**Timeline:** Plan 22-08 SUMMARY claimed "per-mutation persistence fixed" (commits 8d8f750, f341592). Tests were structural (mock call count). R-10 UAT report: tabs not preserved, active focus lost. Current evidence is worse: tabs restore but wrong, agents die, labels mangled.

**Reproduction:**
1. Launch fresh Efxmux.app
2. Open a project
3. Create an Agent tab (Claude) — claude starts
4. Optionally split, optionally add Terminal
5. Interact briefly (so tab labels stabilize)
6. Quit app (Cmd+Q)
7. Relaunch app, open same project
8. Observe: chaos as in screenshots
<DATA_END>

## Current Focus

- reasoning_checkpoint:
    hypothesis_1_label: "'Agent c' is NOT a truncation of 'Agent claude'. It is correctly derived from project.agent === 'c' at tab-creation time. The user typed 'c' into the project-modal agent input (free-text with a datalist) and submitted without selecting 'claude'. Label writer: agentLabel(projectInfo?.agent) returns literally 'Agent <agent>'."
    confirming_evidence_1:
      - "state.json shows project entries {agent: 'c'} for both efx-mux and efx-motion-editor; no code path anywhere truncates the agent field (exhaustive grep for split/slice/substring/charAt on agent or label came up empty)"
      - "terminal-tabs persistence blobs show label: 'Agent c' (matching agent=c); an older project efx-physic-paint in the same state.json shows label: 'Claude' — so historical data with different agent values is preserved. This confirms labels round-trip verbatim."
      - "agentLabel() at terminal-tabs.tsx:195-197 is the only label producer for agent tabs; it emits `Agent ${agent}` with no sanitization"
    fix_1_rationale: "Hardening the project-modal so that bare single-character agent names surface as a validation warning, or normalize by snapping to the closest datalist option. This is a UX fix, not a label-truncation fix."
    hypothesis_2_agent_death: "Agent restore kills the live tmux session and re-spawns claude from scratch. pty.rs:91-99 branches: if session_exists AND (wants_fresh OR shell_command is non-empty) → kill-session. The restore caller passes shell_command=agentBinary (non-empty), and NO forceNew flag → logic falls into the kill branch. Claude is torn down and re-spawned, losing its state, sometimes crashing immediately (-> [exited])."
    confirming_evidence_2:
      - "pty.rs lines 91-99: kill condition is `wants_fresh || shell_command.as_deref().map(|s| !s.is_empty()).unwrap_or(false)` — ANY shell_command triggers kill, even without force_new"
      - "restoreTabsScoped (terminal-tabs.tsx:715) calls connectPty(terminal, saved.sessionName, projectPath, shellCmd) with NO forceNew param → defaults to false. But the kill branch still fires because shell_command (agentBinary) is non-empty"
      - "createNewTabScoped (line 298) intentionally calls connectPty(..., agentBinary, true /* forceNew */) — a fresh tab WANTS a kill + new session"
      - "Screenshot evidence: claude's rewind UI showing 'Nothing to rewind to yet' on restored agent panes = claude started from scratch"
    fix_2_rationale: "Restore path must not request shell_command when reattaching to an existing session. Two implementation options: (a) pass forceNew=false AND skip shell_command on restore when session already exists; (b) add a 'reattachOnly' mode. Simplest: on restore, pass shellCommand=undefined — pty.rs will take the 'restoration / re-attach' branch, tmux new-session -A reattaches to existing session, claude continues running. If tmux session doesn't exist (tmux server restarted/killed), session_exists=false → new session starts with shell_command anyway (but we lost the cmd). So: pass shell_command always, but only kill when force_new is true. That inverts the pty.rs guard."
    hypothesis_3_cross_bleed: "Bootstrap main-scope tab restore reads the LEGACY flat 'terminal-tabs' key instead of the migrated per-scope 'terminal-tabs:<project>:main-0' key. Additionally, bootstrap calls restoreActiveSubScopes(null) BEFORE activeProjectName is set, so per-project sub-scope lists and split ratios are never applied on restart. Main-1 and main-2 scopes are never restored at bootstrap — only right-scopes loop over active sub-scopes."
    confirming_evidence_3:
      - "main.tsx:450-453: perProjectTabKey = `terminal-tabs:${activeName}` — this is the PRE-Phase-22 key. After the D-10 migration in state-manager.ts:94-104, that key is rewritten to `terminal-tabs:${project}:main-0`, so perProjectTabKey NEVER matches. Fallback is `appState?.session?.['terminal-tabs']` — the global flat key, cross-project bleed"
      - "state.json shows legacy key `\"terminal-tabs\": \"{...tabs...}\"` still present as dead state (no writer writes it anymore, only read)"
      - "main.tsx bootstrap path uses restoreTabs() which only targets main-0. Main-1 / main-2 sub-scopes never restore at bootstrap"
      - "main.tsx:155 restoreActiveSubScopes(activeProjectName.value) runs BEFORE initProjects() sets activeProjectName. At that call site the signal is null → reads non-per-project key `main-active-subscopes` instead of `main-active-subscopes:<project>`"
      - "project-changed event (line 581) correctly calls restoreActiveSubScopes(newProjectName) AND loops over getActiveSubScopesForZone for BOTH right AND main tab restore — but only fires on explicit user switchProject(), never at bootstrap"
    fix_3_rationale: "Three concrete fixes required: (a) remove the legacy flat 'terminal-tabs' fallback and the legacy per-project 'terminal-tabs:<project>' read path — use restoreProjectTabs per sub-scope exactly like right-panel does; (b) move restoreActiveSubScopes(...) call AFTER initProjects() sets activeProjectName, or re-run it inside the Step-8 requestAnimationFrame block; (c) loop bootstrap's main-scope tab restore over getActiveSubScopesForZone('main'), mirroring the right-panel restore loop."
    blind_spots:
      - "The kill-on-reattach fix might break the env-var-injection intent for AGENT tabs that were created in an older build (before CLAUDE_CODE_NO_FLICKER was added). Mitigation: the fix only changes restart path (existing session), not first-launch — when claude was started without the env vars in an old build, the user would have to explicitly kill the tab and re-create to pick them up. This is acceptable"
      - "The legacy global 'terminal-tabs' key may still be referenced by external tooling or tests; removing it may surface stale test expectations"
- next_action: "Apply three-part fix: (1) pty.rs: change kill condition to only fire on force_new; shell_command alone doesn't trigger kill on restore. (2) main.tsx bootstrap: replace legacy restoreTabs() path with per-sub-scope restoreProjectTabs loop for both main and right zones. Also move restoreActiveSubScopes(activeName) call to after projects load. (3) Add behavioral regression tests."
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-19
  checked: src-tauri/src/terminal/pty.rs spawn_terminal kill-vs-reattach branch
  found: Lines 91-99 — `if wants_fresh || shell_command.non_empty() → kill session`. Shell_command alone forces kill, not just force_new.
  implication: Any agent-tab restore kills the tmux session and respawns claude from scratch. This alone causes "agent gets crazy" and `[exited]` symptoms.

- timestamp: 2026-04-19
  checked: src/main.tsx bootstrap tab-restore path (lines 448-463)
  found: Reads `terminal-tabs:<project>` (legacy, never matches post-migration) then falls back to global `terminal-tabs` key. Only restores main-0 via restoreTabs(). Never loops over active main sub-scopes.
  implication: Main-1 / main-2 never restore. Cross-project bleed via global 'terminal-tabs' key. Only right-scope restore uses correct per-scope keys.

- timestamp: 2026-04-19
  checked: src/state-manager.ts loadAppState migration (lines 91-113)
  found: Migrates `terminal-tabs:<project>` → `terminal-tabs:<project>:main-0`. The bootstrap reads the PRE-migration key → always misses.
  implication: main.tsx bootstrap's perProjectTabKey was never updated to match migration output.

- timestamp: 2026-04-19
  checked: src/main.tsx line 155 restoreActiveSubScopes call order
  found: Called with `activeProjectName.value` BEFORE `initProjects()` at line 219 sets it.
  implication: Falls back to non-per-project keys. Per-project sub-scope list + split ratios never applied at bootstrap (only on explicit switchProject).

- timestamp: 2026-04-19
  checked: current on-disk state.json
  found: `project.projects[0..1].agent === "c"` (not "claude"). No code path truncates agent field. User typed "c" in project-modal free-text input.
  implication: "Agent c" label is CORRECT given the stored agent. Not a code bug. Secondary UX concern: modal accepts single-character input that doesn't match datalist options.

- timestamp: 2026-04-19
  checked: terminal-tabs.tsx restoreTabsScoped line 715
  found: Always passes shellCmd (agentBinary when isAgent) to connectPty. Never skips shell_command on restore.
  implication: Combined with pty.rs kill branch, agent tabs are always re-spawned fresh on restore.

## Eliminated

- hypothesis: "Labels are stored with spaces but split on first token somewhere in the round-trip, truncating 'Agent claude' → 'Agent c'"
  evidence: Exhaustive grep for split/slice/substring/charAt on agent or label found NO truncation code. State.json shows `label: "Agent c"` matching `project.agent = "c"`. An older project's persisted tabs show `label: "Claude"` (full string) — labels do round-trip verbatim.
  timestamp: 2026-04-19

- hypothesis: "tab-counter key is space-delimited and collides with multi-word labels"
  evidence: state-manager.ts TAB_COUNTER_PREFIX = 'tab-counter:' followed by project name; labels are never used as keys. Counter stores an integer, not labels.
  timestamp: 2026-04-19

## Resolution

- root_cause: "Three independent bugs compound into the observed chaos:
  (1) pty.rs lines 91-99 kills the existing tmux session whenever `shell_command` is non-empty, regardless of `force_new`. Restoring an agent tab always passes `shellCommand=agentBinary` (non-empty) → always hits the kill branch → claude torn down and re-spawned → unstable or dies.
  (2) main.tsx bootstrap tab-restore reads legacy keys (`terminal-tabs:<project>` which was migrated away, then falling through to the global `terminal-tabs` key) instead of the per-sub-scope key format `terminal-tabs:<project>:<scope>`. Result: main-0 gets cross-project-bled state, main-1 / main-2 never restore at all.
  (3) main.tsx:155 `restoreActiveSubScopes(activeProjectName.value)` fires BEFORE `initProjects()` sets the active project → always uses the non-per-project fallback for sub-scope list + split ratios. Per-project sub-scope layout never restores on bootstrap.
  The 'Agent c' label is NOT truncation — the user typed 'c' in the project-modal free-text agent input. Label derives correctly from `project.agent`."
- fix: "See commits below. Three-part fix:
  (a) pty.rs: narrow the kill branch to `wants_fresh` only. When shell_command is provided without force_new (restore path), take the reattach branch so tmux new-session -A reattaches to the living agent session.
  (b) main.tsx: replace the legacy bootstrap tab-restore block with per-sub-scope loops over both main and right zones, mirroring the existing right-panel restore logic. Drop the global 'terminal-tabs' fallback.
  (c) main.tsx: move/duplicate `restoreActiveSubScopes(activeProjectName.value)` into the Step-8 requestAnimationFrame block so it runs AFTER initProjects() resolves the active project name.
  Plus behavioral regression tests that simulate the full quit/restart cycle."
- verification: "Added 8 behavioral regression tests in src/components/__persistence-chaos.test.ts — all pass. Assertions cover (i) label round-trip verbatim for multi-word and unicode labels, (ii) restore path passes forceNew=false to spawn_terminal while createNewTab passes forceNew=true, (iii) no cross-project bleed when a stale legacy 'terminal-tabs' flat key is present on disk, (iv) all main sub-scopes (main-0/1/2) restore from their own per-scope keys. Full test suite delta: 49 failing tests BEFORE fix (baseline, stashed check) = 49 failing AFTER fix — zero new failures introduced. TypeScript type-check and `cargo check --lib` both clean."
- files_changed:
    - "src-tauri/src/terminal/pty.rs — narrowed kill branch from `wants_fresh || shell_command.non_empty()` to just `wants_fresh`. Agent/restore path now reattaches instead of respawning."
    - "src/main.tsx — (a) bootstrap restoreActiveSubScopes(null) early call clarified with comment; (b) await initProjects() so active project name is resolved before the Step-8 rAF; (c) replaced legacy tab restore block with restoreActiveSubScopes(activeName) + per-sub-scope getTerminalScope(scope).restoreProjectTabs loop for main zone, mirroring right-zone."
    - "src/components/__persistence-chaos.test.ts — new behavioral regression test file (8 tests)."
