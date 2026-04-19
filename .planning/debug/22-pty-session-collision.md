---
slug: 22-pty-session-collision
status: verifying
trigger: Phase 22 post-tab-content-desync fix. Adding a new terminal tab in main bottom split causes the right-top sub-scope's Agent c + Terminal tabs to crash ([exited]). After quit/restart: main-bottom terminal [exited], right-top's Agent c becomes "Terminal 4" while a second Agent c shows [exited], right-bottom is fine.
created: 2026-04-19
updated: 2026-04-19
goal: find_and_fix
---

# Debug: 22-pty-session-collision

## Symptoms

<DATA_START>
**Scenario A — live (same session):**
User has split setup: right sidebar top (Agent c + Terminal 4), right sidebar bottom (Terminal 3 + Agent c), main panel with CLAUDE.md + README.md + Agent c + Terminal 3.
1. User splits main panel → creates a main-bottom sub-scope
2. User clicks `+` in main-bottom → creates a new Terminal
3. Observed: right-sidebar TOP pane's Agent c and Terminal 4 both crash ([exited] shown)
4. Right-sidebar BOTTOM pane's Agent c + Terminal 3 are still alive and running

**Scenario B — after quit/relaunch:**
1. Main panel bottom's terminal shows [exited]
2. Right sidebar top: tab labeled "Agent c" is now actually "Terminal 4" (label or session-type swap) and is alive; another tab labeled "Agent c" shows [exited]
3. Right sidebar bottom: Agent c + Terminal 3 fine

**Observations:**
- Cross-scope damage: spawning in main-bottom killed processes in right-top, but not right-bottom
- Identity swap: after restart, a tab that should have been "Agent c" is now "Terminal 4". Either the session-name key was reused by a new spawn that hijacked its tmux session, or the label was overwritten during save/restore.
- Selective kill: the damage pattern is NOT uniform — right-top dies, right-bottom survives. There's probably a specific shared namespace between main-bottom and right-top (e.g. same counter tier, alternating scope enumeration, or same tmux session name).

**Error messages:** None surfaced in UI. Tmux state unknown.

**Timeline:** Prior fixes:
- e6a0bf5: pty.rs narrowed tmux kill to `wants_fresh` only (was: always killed on restore)
- 65b3165: UnifiedTabBar routed isActive + clicks per-scope (fixed R-11)

Both shipped cleanly. This new symptom is visible only now that persistence + activation work.

**Reproduction:**
1. Rebuild Efxmux.app with HEAD (65b3165+)
2. Open project, create setup: right-top (agent + terminal), right-bottom (agent + terminal), main (multi tabs)
3. Split main panel, click `+` in main-bottom > Terminal
4. Observe right-top collapses to [exited]
5. Optionally quit + relaunch → observe identity swap in right-top
<DATA_END>

## Current Focus

- hypothesis: The shared per-project counter `projectTabCounter` is NEVER seeded from persisted state on app startup or project switch, so after a restart it is `0`. `allocateNextSessionName` therefore returns `<project>` (n=1, no suffix) / `<project>-2` / `<project>-3` ... on successive new-tab clicks — names that collide with the already-attached tmux sessions restored under those same names. `createNewTabScoped` calls `connectPty(..., forceNew=true)` which sends `force_new=true` to `spawn_terminal`, which executes `tmux kill-session -t <name>` on the colliding live session. The pane-death monitor for the killed session emits `pty-exited` to the frontend, which then marks the victim tab as `[exited]`. The new Terminal in main-1 hijacks the victim's session name.
- test: (a) Confirm that `seedCounterFromRestoredTabs` is defined but never called outside test code. (b) Confirm that `loadTabCounter` / `persistTabCounter` (added per 22-08 SUMMARY claim) exist in state-manager but are never called by terminal-tabs or main bootstrap. (c) Confirm `createNewTabScoped` passes `forceNew=true` to `connectPty`. (d) Confirm `spawn_terminal` kills an existing tmux session when `force_new && session_exists`.
- expecting: all four confirmed.
- reasoning_checkpoint:
    hypothesis: "After restart, projectTabCounter starts at 0 because seedCounterFromRestoredTabs is never called. Calls to allocateNextSessionName return already-in-use session names (e.g. <project>-2) which createNewTabScoped then kills via spawn_terminal force_new. That kill emits pty-exited to the victim tab in another scope."
    confirming_evidence:
      - "grep -R seedCounterFromRestoredTabs src/ shows it is only called inside terminal-tabs.test.ts — never from main.tsx or any production code path."
      - "loadTabCounter/persistTabCounter are defined in src/state-manager.ts:163-174 but not referenced anywhere in src/. Counter is never persisted or restored."
      - "src/components/terminal-tabs.tsx:298 — createNewTabScoped passes forceNew=true to connectPty."
      - "src-tauri/src/terminal/pty.rs:92-98 — when force_new && session_exists, spawn_terminal executes 'tmux kill-session -t <name>' on the preexisting live session."
      - "src-tauri/src/terminal/pty.rs:283-366 — the pane-death monitor for the killed session will observe has-session=false or pane_dead=1 and emit 'pty-exited' to the frontend, marking the victim tab [exited] via the listener at terminal-tabs.tsx:990-1006."
      - "The selective-damage pattern (right-0 dies, right-1 survives) matches: main-bottom's new Terminal allocates N=<some value>, which collides with whichever scope created the last tab with that same number. Right-0 tabs are typically created first after restore so their numbers are contiguous with main-0's; right-1 tabs have higher numbers not yet reached by the reset-to-zero counter."
      - "Identity-swap after restart ('Agent c becomes Terminal 4') is a downstream effect: the kill/reuse flow produces TWO tabs with the same sessionName but different labels. On persist+restore, the label-by-sessionName mapping picks up the wrong label, so what was 'Agent c' saved from one scope is restored with 'Terminal 4' label from the colliding scope."
    falsification_test: "If after app restart the counter is properly seeded from persisted tab sessionNames + counter value, the repro (split main → + Terminal) should no longer kill any right-scope tabs, because allocated names will be strictly greater than all existing names."
    fix_rationale: "Seed the counter at project load. Persist the counter so it survives restart. Make spawn_terminal fail fast on name collision with force_new (defense in depth) rather than silently killing the victim. Use the per-project monotonic counter as the single source of truth — never fall back to an in-memory 0 after restore."
    blind_spots: "The label on new Terminal tabs uses `s.counter.n` (per-scope) rather than the shared `seq` returned by allocateNextSessionName. Need to verify labels also match the monotonic name number to avoid user confusion. Also: the claim in 22-08 SUMMARY that persistence is wired is contradicted by code; need to check git log to see if the wiring was ever committed or if the plan was implemented only in design."
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-19
  checked: `grep -R seedCounterFromRestoredTabs src/` and `grep -R loadTabCounter|persistTabCounter src/`
  found: `seedCounterFromRestoredTabs` is only referenced in `src/components/terminal-tabs.test.ts:553,567`. Never called from main.tsx or any production path. `loadTabCounter` and `persistTabCounter` are defined in `src/state-manager.ts:165-174` but have zero call sites in `src/`.
  implication: After every restart / project switch, `projectTabCounter` map is empty. `allocateNextSessionName` will always restart from `current=0 → n=1` for every project.

- timestamp: 2026-04-19
  checked: git log on `src/components/terminal-tabs.tsx` and `git branch --contains f341592`
  found: Commit `f341592 fix(22-08): persist scope-suffixed tab list + counter on every mutation` exists but only on branch `worktree-agent-a28d0388`. It was NEVER merged into `gsd/phase-22-dynamic-tabs-vertical-split-and-preferences-modal`. The 22-08 SUMMARY claims this work is live but the counter-persistence hunks are absent from HEAD.
  implication: Even the frontend-only portion of the counter-restore contract is missing. The 22-08 plan was documented as done but its counter wiring was never in the phase branch.

- timestamp: 2026-04-19
  checked: `src/components/terminal-tabs.tsx:219-251` (createNewTabScoped label + name derivation)
  found: `s.counter.n++` bumps per-scope counter; `allocateNextSessionName(project)` returns monotonic `{name, seq}`; then `s.counter.n = Math.max(s.counter.n, seq)`; label is `Terminal ${s.counter.n}`.
  implication: Even after the counter fix, the label uses per-scope counter (which starts at 0 on every process start because it's not persisted). Two tabs in different scopes could both say "Terminal 3" if the per-scope max happens to be 3 in both. Should use `seq` (the monotonic counter) for the label to match the session-name numbering.

- timestamp: 2026-04-19
  checked: `src/components/terminal-tabs.tsx:298,503,715,828` — all connectPty call sites
  found: createNewTabScoped passes forceNew=true; restartTabSession passes forceNew=true; restoreTabsScoped and initFirstTab both omit the arg → default false. Only new-tab and restart use the kill-and-recreate path.
  implication: The kill path is only exercised by paths that are supposed to mint a unique name. A collision at this layer is always a frontend bug; pty.rs should fail loudly rather than silently clobber.

- timestamp: 2026-04-19
  checked: `src-tauri/src/terminal/pty.rs:86-98`
  found: When `force_new && session_exists`, spawn_terminal unconditionally runs `tmux kill-session -t <name>` then proceeds to create a fresh session. No check against the PtyManager map, no error returned.
  implication: Colliding names silently kill the live victim session. The pane-death monitor thread for the victim then emits `pty-exited` to the frontend, which marks the victim tab `[exited]`. This is the observed cross-scope kill mechanism.

- timestamp: 2026-04-19
  checked: `pnpm exec tsc --noEmit -p tsconfig.build.json` baseline
  found: Clean (0 errors).
  implication: Safe to proceed with fix; can use TS as a regression check.

## Eliminated

(none — hypothesis confirmed on first investigation pass)

## Resolution

- root_cause: |
    The shared per-project tab counter `projectTabCounter` is never seeded from persisted
    state (and never persisted in the first place on the current branch). After every
    restart / project switch it is empty. `allocateNextSessionName` therefore returns
    session names that collide with tabs restored from prior sessions under those same
    names (e.g. main-1's first new tab allocates `<project>-2` or even `<project>` while
    right-0's Agent tab is still attached to `<project>-2`). `createNewTabScoped` then
    calls `connectPty(..., forceNew=true)`, and `spawn_terminal` with `force_new=true`
    on an existing session runs `tmux kill-session -t <name>` — killing the live
    right-0 PTY. The pane-death monitor for the killed session emits `pty-exited` to
    the frontend, which marks the victim tab `[exited]`. The "identity-swap after
    restart" symptom is the same bug replayed once more: main-1's new tab shares a
    sessionName with a right-0 tab, so on restore the two tabs ride the same tmux
    session and the label-by-sessionName mapping produces a crossed-wires result.
- fix: |
    1. (frontend, terminal-tabs.tsx) `allocateNextSessionName` persists the new
       counter value under `tab-counter:<project>` via `updateSession` fire-and-forget.
    2. (frontend, terminal-tabs.tsx) `seedCounterFromRestoredTabs` reads persisted
       `tab-counter:<project>` from getCurrentState() with parseInt + Number.isFinite
       tamper guard (T-22-08-01), and uses max(sessionName-derived, persisted).
    3. (frontend, main.tsx) Call `seedCounterFromRestoredTabs(activeName)` AFTER the
       restoreProjectTabs loops for main AND right sub-scopes on bootstrap, and the
       equivalent point on project-switch. Required so the counter observes all tabs
       across all scopes before the first allocateNextSessionName.
    4. (frontend, terminal-tabs.tsx) Label `Terminal ${seq}` using the monotonic
       counter instead of `s.counter.n`. Matches session-name numbering and avoids
       duplicate "Terminal N" labels across scopes.
    5. (backend defense-in-depth, pty.rs) `spawn_terminal` with `force_new=true`
       refuses to kill if the session name is already registered in PtyManager
       (i.e. an active PTY client is attached). Returns Err — frontend treats as
       spawn failure and writes warning into xterm. Prevents silent cross-scope
       kills when the frontend has a counter bug.
- verification: |
    Post-fix self-verification results:
    - `pnpm exec tsc --noEmit -p tsconfig.build.json` — clean, 0 errors.
    - `cargo check --manifest-path src-tauri/Cargo.toml --lib` — compiles, no warnings from new code.
    - `pnpm exec vitest run src/components/terminal-tabs.test.ts -t "22-pty-session-collision"` — 2/2 new tests pass:
        1. `2 scopes × 2 tabs then allocate in a third scope: no session-name collision, victims still present`
        2. `counter survives restart via persisted tab-counter:<project>`
    - `pnpm exec vitest run src/components/__persistence-chaos.test.ts` — 8/8 pass (forceNew contract unchanged).
    - Pre-existing 12 failures in terminal-tabs.test.ts remain (Phase 22 TerminalScope literal mismatch, per project_notes). Test-count comparison: stash=18/30 pass; HEAD=20/32 pass — only added tests, no regressions.
- files_changed:
    - src/components/terminal-tabs.tsx (allocateNextSessionName persists counter; seedCounterFromRestoredTabs reads persisted counter + uses max-of-three; Terminal label uses monotonic `seq`)
    - src/main.tsx (two `seedCounterFromRestoredTabs(project)` calls added — bootstrap + project-switch, both AFTER main- and right-scope restore loops complete)
    - src-tauri/src/terminal/pty.rs (spawn_terminal refuses to kill a session that PtyManager still has a registered client for; orphan sessions still killable)
    - src/components/terminal-tabs.test.ts (2 new regression tests under "Debug 22-pty-session-collision" describe block)
