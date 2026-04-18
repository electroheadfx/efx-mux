---
phase: 20
plan: 05-E
subsystem: right-panel / unified-tab-bar UAT
tags: [ui, bugfix, uat, preact, persistence, tabs, agent, scope]
key-files:
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/unified-tab-bar.test.tsx
    - src/components/terminal-tabs.tsx
    - src/components/terminal-tabs.test.ts
    - src/components/state-manager.test.ts
    - src/main.tsx
---

# Phase 20 Plan 05-E: UAT Gap Fixes — Summary

One-liner: Three atomic UAT fixes for right-panel regressions — scope-aware
terminal tab × close, `Agent <name>` label parity for right-scope agent tabs,
and Git Changes tab persistence across restart.

## Commits

| Hash      | Fix | Title                                                          |
| --------- | --- | -------------------------------------------------------------- |
| `89c8c78` | #2  | label right-scope Agent tabs "Agent <name>"                    |
| `555e6fc` | #1  | close right-scope terminal tabs via correct scope handle       |
| `7a8f86b` | #3  | persist Git Changes tab across quit/restart                    |

## Fix #1 — Terminal × close scope-aware (`555e6fc`)

**Problem.** Clicking the × on a right-panel terminal tab did nothing. The
tab stayed in `getTerminalScope('right').tabs` and the UI never updated.

**Root cause.** `closeUnifiedTab`'s terminal branch unconditionally called
the backward-compat `closeTab(tabId)` wrapper, which routes through the
MAIN scope only. Right-scope terminal tabs were never found in that scope
and the close was silently dropped.

**Fix.** Resolve the tab's owning scope first by searching both scope
registries (`main` then `right`), then dispatch close to the matching
`scopeHandle.closeTab(tabId)`. Main-only side effects (`activeUnifiedTabId`
switch, `setProjectTabOrder`) are gated behind `isMain` so they do not
leak into the right-scope close path.

**Files touched.**

- `src/components/unified-tab-bar.tsx`: new scope-aware branch at the top
  of `closeUnifiedTab`; replaces the old main-only terminal handling.
- `src/components/unified-tab-bar.test.tsx`: 2 new tests — right-scope
  close actually removes from `getTerminalScope('right').tabs`;
  main-scope close still works (no regression).

## Fix #2 — Right-scope Agent tab label (`89c8c78`)

**Problem.** UAT reported right-panel plus-menu `Agent` tabs showing
`Terminal N` (or, under partial binary-resolution conditions,
`Agent <name> (no binary)`) instead of the canonical `Agent <name>`
label that main-scope uses.

**Root cause.** `createNewTabScoped` gated the `Agent <name>` label behind
successful agent binary resolution. If `detectAgent` failed (network
timeout, transient PATH issue, etc.) the label fell back to either
`Terminal N` (when `wantAgent === false`) or `Agent <name> (no binary)`
(when resolution returned undefined). `initFirstTab`, used for main scope
bootstrap, labels by project agent name alone — no binary resolution.

**Fix.** Mirror `initFirstTab`'s main-scope policy in `createNewTabScoped`:
when `options.isAgent === true`, always label the tab with
`agentLabel(projectInfo?.agent)` regardless of binary resolution. The PTY
spawn path still uses `agentBinary` — a missing binary becomes a runtime
warning written into the terminal (`\x1b[33mAgent binary "..." not found.
Starting plain shell.\x1b[0m`), not a corrupted tab label.

**Files touched.**

- `src/components/terminal-tabs.tsx`: simplified label logic in
  `createNewTabScoped` — `wantAgent ? agentLabel(...) : "Terminal N"`.
- `src/components/terminal-tabs.test.ts`: 3 new tests (right/main agent
  label parity, plain-terminal regression).

## Fix #3 — Git Changes persistence (`7a8f86b`)

**Problem.** After moving Git Changes into the right panel via the D-07
handoff, quitting and relaunching Efxmux cleared the tab. Users had to
re-open it manually from the plus-menu every session.

**Root cause.** `gitChangesTab` was ephemeral. Only terminal tabs (main
+ right) and editor tabs had `updateSession`-backed persistence. Nothing
round-tripped the `GitChangesTabData` id + `owningScope` through
state.json.

**Fix.** Round-trip Git Changes through a per-project session key
`git-changes-tab:<project>`:

- New `persistGitChangesTab()` serializes `{ id, owningScope }` under the
  active project's key. A `gitChangesTab.subscribe(...)` auto-persists
  on open, close, scope flip, and project switch.
- New `restoreGitChangesTab(projectName)` reads the key back during
  bootstrap, rehydrates the signal, and routes the id into the correct
  scoped tab order (`setScopedTabOrder('right', ...)` or `'main', ...`).
- `closeUnifiedTab` gains an explicit branch for right-owned Git Changes
  — the main-only `allTabs` lookup missed it previously (Pitfall 3:
  right-owned git-changes is excluded from `allTabs`).
- `main.tsx` bootstrap: invoke `restoreGitChangesTab(activeName)` BEFORE
  `getTerminalScope('right').restoreProjectTabs` so `RightPanel` renders
  the restored body when `activeTabId` resolves to the Git Changes id.
- `main.tsx` project-changed handler: reset `gitChangesTab.value = null`
  then `restoreGitChangesTab(newProjectName)` so project switches do not
  leak the prior project's Git Changes state.

**Files touched.**

- `src/components/unified-tab-bar.tsx`: persistence functions +
  subscription + right-owned close branch inside `closeUnifiedTab`.
- `src/main.tsx`: bootstrap invocation + project-switch handler.
- `src/components/unified-tab-bar.test.tsx`: 3 new tests (rehydration,
  unknown-project no-op, close clears marker).
- `src/state-manager.test.ts`: 1 new test (`git-changes-tab:<project>`
  key round-trips `id + owningScope`).

## Verification

**Typecheck.**

```
pnpm exec tsc --noEmit  →  clean (exit 0)
```

**Tests.**

```
pnpm exec vitest run \
  src/components/unified-tab-bar.test.tsx \
  src/components/terminal-tabs.test.ts \
  src/state-manager.test.ts \
  src/components/right-panel.test.tsx
→ 95 passed / 95 (4 files)
```

| Suite                         | Before | After |
| ----------------------------- | ------ | ----- |
| `unified-tab-bar.test.tsx`    | 33     | 38    |
| `terminal-tabs.test.ts`       | 21     | 24    |
| `state-manager.test.ts`       | 17     | 18    |
| `right-panel.test.tsx`        | 14     | 14    |
| **total**                     | 85     | 95    |

Ten new tests across three suites. No regressions on pre-existing tests.

## Scope Compliance

- `--no-verify` used for all commits (worktree execution).
- `pnpm` package manager (per project convention).
- Did not touch `.planning/STATE.md` or `.planning/ROADMAP.md`.
- Did not run the dev server.

## Files Modified

| File                                       | Fix(es)     |
| ------------------------------------------ | ----------- |
| `src/components/unified-tab-bar.tsx`       | 1, 3        |
| `src/components/unified-tab-bar.test.tsx`  | 1, 3        |
| `src/components/terminal-tabs.tsx`         | 2           |
| `src/components/terminal-tabs.test.ts`     | 2           |
| `src/main.tsx`                             | 3           |
| `src/state-manager.test.ts`                | 3           |
