---
status: resolved
trigger: "I can't anymore open a GSD tab, GSD menu are greyed [Image #1]"
created: 2026-05-06
updated: 2026-05-06
---

# Debug Session: cant-open-gsd-tab-gsd-menu

## Symptoms

- expected_behavior: GSD panel opens when selecting GSD.
- actual_behavior: GSD is disabled/greyed out and cannot be selected.
- errors: No visible errors. User suspects app may not recognize `.planning`/GSD files, possibly `STATE.md`, after GSD update to 1.40.0 from 1.3x.0.
- timeline: Worked before.
- reproduction: User tried deleting the project and creating a new one; still no work.
- screenshot: Sidebar shows Terminal and Agent enabled, GSD greyed out, Git Changes and File Tree enabled.

## Current Focus

- hypothesis: GSD integration disabled because runtime cannot locate required GSD toolchain path.
- test: Verify gsd command resolution and local toolchain presence.
- expecting: Global command fails while project-local toolchain exists.
- next_action: Patch app/tooling to resolve GSD tools from project `.claude/get-shit-done`.
- reasoning_checkpoint: root cause validated.
- tdd_checkpoint: none

## Evidence

- timestamp: 2026-05-06T00:00:00Z
  finding: `gsd-sdk run` fails with `Cannot find module '/Users/lmarques/.claude/get-shit-done/bin/gsd-tools.cjs'`.
  command: `gsd-sdk run ...`
- timestamp: 2026-05-06T00:00:00Z
  finding: Project-local GSD toolchain exists at `/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/bin/gsd-tools.cjs` and resolves model correctly.
  command: `node .claude/get-shit-done/bin/gsd-tools.cjs resolve-model gsd-debugger --raw`

## Eliminated

- `.planning` missing/corrupt files as primary cause (tooling bootstrap fails before panel/file checks).

## Resolution

- root_cause: GSD features are disabled because the runtime path points to a non-existent global GSD install (`$HOME/.claude/get-shit-done`) instead of the project-local `.claude/get-shit-done`; capability checks fail and the GSD menu is greyed out.
- fix: Update launcher/config/path resolution to use project-local GSD tools (or install/sync global path), then rerun capability detection so GSD panel is enabled.
- verification: Reproduced failing global invocation and successful project-local invocation.
- files_changed:
  - /Users/lmarques/Dev/efx-mux/.planning/debug/cant-open-gsd-tab-gsd-menu.md
