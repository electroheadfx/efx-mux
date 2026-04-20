---
status: complete
phase: quick-260418-bpm
plan: 01
subsystem: unified-tab-bar
tags: [ui, keyboard-shortcuts, focus-management, main-panel]
requires:
  - src/components/unified-tab-bar.tsx (activeUnifiedTabId, createAndFocusMainTerminalTab helper)
  - src/components/terminal-tabs.tsx (createNewTab + TerminalScope)
provides:
  - Shared helper createAndFocusMainTerminalTab() used by dropdown + Ctrl+T
  - Explicit focus of newly-created main-scope terminal/agent tabs
affects:
  - src/components/unified-tab-bar.tsx
  - src/main.tsx
  - src/components/unified-tab-bar.test.tsx
tech-stack:
  added: []
  patterns:
    - "Dependency-injected creator arg for unit-testing async factory helpers without mocking deep PTY wiring"
key-files:
  created: []
  modified:
    - src/components/unified-tab-bar.tsx
    - src/main.tsx
    - src/components/unified-tab-bar.test.tsx
decisions:
  - "Added optional `creator` parameter to `createAndFocusMainTerminalTab` for test injection — avoids having to mock the full terminal-tabs module (which would require stubbing DOM container + PTY + tmux). Production callers omit it and get the real top-level `createNewTab`."
  - "Helper's null-safety guard (`if (tab) activeUnifiedTabId.value = tab.id`) preserves editor focus when createNewTab returns null (wrapper element missing during transient layout state) — prevents focus landing on an empty id."
  - "Right-scope dropdown actions left untouched (plan §Step 1 note): right panel visibility is driven by `getTerminalScope('right').activeTabId` which `createNewTabScoped` already writes, so no change needed and diff stays minimal."
metrics:
  duration: "~6 minutes"
  completed: "2026-04-18T06:36:03Z"
  tasks_completed: 1
  tasks_total: 2  # Task 2 is a human-verify checkpoint executed by the user
  files_modified: 3
---

# Quick Task 260418-bpm: Main-Scope Tab Focus Fix Summary

Focus newly-created main-panel terminal/agent tabs on user creation via dropdown or Ctrl+T, bypassing the subscribe-guard only for explicit user intent.

## Problem

When the main panel had a non-terminal tab active (editor, git-changes, sticky), clicking the `+` dropdown's "Terminal (Zsh)" / "Agent" items — or pressing Ctrl+T — created a new tab but did NOT switch visible content to it. The user saw no feedback that anything happened and had to hunt for the new tab in the tab bar.

**Root cause** (per plan's `<root_cause>` analysis):
`createNewTabScoped` in `terminal-tabs.tsx:248` sets `s.activeTabId.value = id` for the newly-created tab, which fires the `activeTabId.subscribe(...)` listener in `unified-tab-bar.tsx:230-240`. That listener intentionally blocks the sync when `activeUnifiedTabId` points to a non-terminal (editor/git-changes) tab — a correctness guard against passive signal cascades (terminal restart, tab-list reactivity) hijacking editor focus.

The guard is right for passive cascades but wrong for user-initiated creation. Right panel was unaffected because `right-panel.tsx` reads `rightScope.activeTabId.value` directly, not `activeUnifiedTabId`.

## Solution

Added a single shared helper `createAndFocusMainTerminalTab` in `unified-tab-bar.tsx` that wraps `createNewTab` and explicitly writes `activeUnifiedTabId.value = tab.id` after awaiting the result — bypassing the subscribe-guard for the one case where focus stealing IS desired.

Three call sites now funnel through the helper:
1. Dropdown main-scope "Terminal (Zsh)" action.
2. Dropdown main-scope "Agent" action.
3. Ctrl+T keyboard handler in `src/main.tsx`.

The subscribe guard at `unified-tab-bar.tsx:230-240` is **untouched**. Passive signal cascades still cannot hijack editor focus.

## Changes

### src/components/unified-tab-bar.tsx

- New exported helper `createAndFocusMainTerminalTab(options?, creator?)`:
  - Awaits creator (defaults to top-level `createNewTab`).
  - If the creator returns a tab, sets `activeUnifiedTabId.value = tab.id`.
  - Null-safe: does not write focus if creator returns null (wrapper missing).
  - `creator` parameter exists for test injection; production callers omit it.
- Updated `buildDropdownItems('main')` — "Terminal (Zsh)" and "Agent" actions route through the helper.

### src/main.tsx

- Added `createAndFocusMainTerminalTab` to the existing import from `./components/unified-tab-bar`.
- Ctrl+T handler calls the helper instead of raw `createNewTab()`.

### src/components/unified-tab-bar.test.tsx

- New describe block `quick-260418-bpm main-scope creation explicitly focuses new tab` with 4 tests:
  - Test 1: editor-active → Terminal (Zsh) creation focuses the new tab.
  - Test 2: git-changes-active → Agent creation focuses the new tab.
  - Test 3: guard preserved — bare `activeTabId` emission does NOT hijack focus.
  - Test 4: null-safe — helper does not write focus if creator returns null.

## Verification

**Automated:**
- `npx vitest run src/components/unified-tab-bar.test.tsx` — 42 pass (38 baseline + 4 new), 0 fail.
- `npx vitest run src/components/right-panel.test.tsx` — 15 pass, 0 fail (no regression).
- `npx tsc --noEmit` — clean type-check.

**TDD gate compliance:**
- RED commit: `15d79e3` — tests added and failing (3 of 4 new tests failed on missing `createAndFocusMainTerminalTab` export; Test 3 passed because the guard already exists).
- GREEN commit: `a07deb0` — helper implemented and wired into dropdown + Ctrl+T, all tests pass.
- REFACTOR: not needed — plan's DRY helper is already the final form.

**Human verification (Task 2 checkpoint) — pending user action:**
1. Open any project with ≥1 editor tab, click editor so it's active in main panel.
2. `+` dropdown → "Terminal (Zsh)" → expect: new terminal tab visible + focused.
3. Same with "Agent".
4. With editor active, press Ctrl+T → expect: new terminal focused.
5. Right-panel `+` dropdown → Terminal + Agent → expect: new right tabs focus (no regression).
6. Regression check: with editor active in main, cause an unrelated terminal signal (e.g., close a right-panel terminal). Main editor MUST stay focused.

## Deviations from Plan

None — the plan's option (b) shared-helper design (`createAndFocusMainTerminalTab`) was implemented verbatim, with one minor enhancement: the helper accepts an optional `creator` parameter for test injection. The plan's implementation example did not include this, but it was necessary because `createNewTabScoped` runs deep side effects (DOM container creation, PTY spawn via Tauri invoke, tmux session wiring) that cannot be exercised in a unit test environment. The injected creator is opt-in; production callers pass `undefined` and get the real `createNewTab`.

## Commits

| Hash       | Type | Description                                                           |
|------------|------|-----------------------------------------------------------------------|
| `15d79e3`  | test | Failing tests for main-scope creation focus                           |
| `a07deb0`  | feat | Helper + dropdown + Ctrl+T wiring                                     |

## Self-Check: PASSED

- Files exist: `src/components/unified-tab-bar.tsx` (modified), `src/main.tsx` (modified), `src/components/unified-tab-bar.test.tsx` (modified)
- Commit `15d79e3` present in git log (RED).
- Commit `a07deb0` present in git log (GREEN).
- 42/42 unified-tab-bar tests pass.
- 15/15 right-panel tests pass.
- TypeScript clean.
