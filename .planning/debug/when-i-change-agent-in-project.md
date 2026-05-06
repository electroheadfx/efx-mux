---
status: resolved
trigger: "When I change agent in project setting, the actual window agent in project close and the terminal show exited instead relaunch [Image #1]. Please implement a relaunch and a terminal reload when there is a problem, it was implemented but looks like it doesn't work"
created: 2026-05-06
updated: 2026-05-06
---

# Debug Session: when-i-change-agent-in-project

## Symptoms

DATA_START
- Expected behavior: Existing agent terminal should restart automatically in the same tab after changing the project agent.
- Actual behavior: Terminal previously showed `[exited]` after changing the project agent; on retry it did not reproduce, but save takes time and the flow should be more robust.
- Error messages: No known error besides `[exited]`; user asked to show error if one exists.
- Timeline: Seems to relaunch fine now, but needs verification and hardening for future.
- Reproduction: Project Settings → change agent → save/apply. Also verify project switch and app restart robustness.
- Screenshot: /Users/lmarques/Desktop/change agent - exit terminal.png shows the agent tab with terminal content `[exited]`.
- Requested fix: Add loading/progress during agent test/save if needed, make terminal exit handling robust, provide relaunch button on error, maybe show the error.
DATA_END

## Current Focus

- hypothesis: Active-project agent edits updated persisted project settings and then called `switchProject(entry.name)` even when the project was already active, causing a full project switch/clear/restore cycle instead of a targeted agent tab relaunch. PTY connection/restart failures wrote text into xterm but did not set `exitCode`, so the CrashOverlay relaunch UI could stay hidden. Follow-up found agent relaunch used `forceNew: true`, which killed the tmux session and lost conversation state; project switch/bootstrap also did frontend agent preflight before restoring tabs.
- test: project-modal and terminal-tabs focused regression tests plus changed-file typecheck filter
- expecting: Save shows spinner immediately, same-project agent edit reattaches existing agent tmux sessions with `forceNew: false`, PTY connect/restart/restore failures surface overlay state with relaunch button/error text, and project switch no longer blocks on frontend agent detection.
- next_action: user-run app validation, because project instructions say not to run the server.
- reasoning_checkpoint: Root cause isolated in `ProjectModal.handleSubmit`, `restartTabSession`, PTY connect error handling, `SubScopePane` overlay rendering, and `main.tsx` project-switch/bootstrap agent preflight.
- tdd_checkpoint: Focused tests added/updated for modal save progress and terminal relaunch/error paths.

## Evidence

- timestamp: 2026-05-06
  observation: `src/components/project-modal.tsx` always called `switchProject(entry.name)` after editing, including same active project + agent change.
- timestamp: 2026-05-06
  observation: `restartTabSession`, `createNewTabScoped`, `restoreTabsScoped`, and `initFirstTab` logged PTY errors to terminal text but did not set `exitCode`/overlay error state.
- timestamp: 2026-05-06
  observation: `SubScopePane` did not render `ActiveTabCrashOverlay`, so the existing restart button path was not visible from the pane body.
- timestamp: 2026-05-06
  observation: Follow-up showed settings-change relaunch must reattach the existing tmux session (`forceNew: false`) to preserve conversation state, matching quit/reopen behavior.
- timestamp: 2026-05-06
  observation: `main.tsx` project switch/bootstrap performed frontend `detectAgent` preflight before restoring tabs, which added avoidable latency to project switching.

## Eliminated

- hypothesis: Missing project-switch/app-restart restore path only.
  reason: Existing project switch and bootstrap already call `restoreProjectTabs`; failure was same-project edit triggering the wrong path plus hidden/errorless overlay state.

## Resolution

- root_cause: Same-active-project agent edits used the heavy project switch flow instead of targeted agent relaunch, PTY failure paths did not drive the crash/relaunch overlay, settings relaunch forced a new tmux session, and project switch/bootstrap blocked on frontend agent preflight.
- fix: Added same-project agent relaunch via `restartAgentTabsForActiveProject`, immediate save/loading UI in Project Settings, PTY error state propagation, overlay error copy, overlay rendering inside sub-scope panes, preserve-session reattach for settings-change relaunch, and removed frontend agent preflight from project switch/bootstrap.
- verification: `pnpm vitest run src/components/project-modal.test.tsx src/components/terminal-tabs.test.ts -t "ProjectModal|restartTabSession stores|restartAgentTabsForActiveProject|agent tab passes configured" --reporter=dot` passed (4 tests). `pnpm exec tsc --noEmit --pretty false | grep -E 'src/(components/project-modal|components/terminal-tabs|components/crash-overlay|components/sub-scope-pane|main)\\.tsx' || true` returned no changed-file type errors. Broader existing `terminal-tabs.test.ts` has stale legacy right/main scope expectations unrelated to this fix.
- files_changed: src/components/project-modal.tsx; src/components/terminal-tabs.tsx; src/components/crash-overlay.tsx; src/components/sub-scope-pane.tsx; src/main.tsx; src/components/project-modal.test.tsx; src/components/terminal-tabs.test.ts
