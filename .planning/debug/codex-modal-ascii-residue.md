---
status: investigating
trigger: "Inside claude code agent, I had a codex modal message appeared, the message was remanent when the terminal updated and some ascii text was fixed on the screen, I dont know if you can fix, its rare bug but sometimes its happen, in the past I had that something, you can look at snapshot the result [Image #1]\nTell me if we need to ignore or its possible to fix, be careful to no break something with the fixs."
created: 2026-05-07
updated: 2026-05-07T07:27:00Z
---

# Debug Session: codex-modal-ascii-residue

## Symptoms

- Expected behavior: Screen clears cleanly. No modal border or ASCII residue remains after terminal redraw.
- Actual behavior: Part of the ASCII is removed by redraw, but some ASCII persists in zones not redrawn; the modal disappears only where redraw happens.
- Error messages: No visible logs/errors reported; visual artifact only.
- Timeline: Happened before; no new regression window known.
- Reproduction: Unknown rare issue. User is skeptical of fixes that force clear/resize because a clear can remove working context and may create new bugs.

## Current Focus

- hypothesis: Residual ASCII is caused by xterm repaint invalidation gap: app calls `fitAddon.fit()` on layout/visibility changes but never issues a full viewport repaint (`terminal.refresh(0, rows-1)`), so stale cells persist until overwritten by new output.
- test: Map every terminal resize/activation path in `terminal-tabs.tsx`, `resize-handler.ts`, `terminal-manager.ts`, `theme-manager.ts`, and `main.tsx`, then verify `fit()` is present while explicit full refresh is absent.
- expecting: Multiple `fit()` triggers across lifecycle, zero full-refresh call on those paths, matching symptom where only redrawn regions clear artifacts.
- next_action: Read terminal lifecycle files completely and collect concrete call paths for fit/resize versus refresh.
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-05-07T06:56:43Z
  checked: .planning/debug/knowledge-base.md
  found: Keyword overlap found with prior terminal rendering issues (`xterm`, `terminal`, redraw-like artifacts). Closest matches are `paste-truncation` and `claude-tui-fullscreen`, both involving timing/layout and redraw state mismatches.
  implication: Known-pattern candidate exists in terminal render pipeline; investigate xterm fit/resize/redraw and tab visibility interactions first.

- timestamp: 2026-05-07T06:56:43Z
  checked: .claude/get-shit-done/references/common-bug-patterns.md
  found: Best symptom-category match is Async/Timing + State Management (`stale render`, `initialization order`) for intermittent visual residue without explicit errors.
  implication: Form hypotheses around missed repaint invalidation after asynchronous UI state changes, not null/type/module issues.

- timestamp: 2026-05-07T07:04:00Z
  checked: src/terminal/pty-bridge.ts
  found: PTY pipeline is pass-through `number[] -> Uint8Array -> terminal.write(bytes)` with no parsing, mutation, filtering, or truncation logic; ACK side-effect does not alter payload.
  implication: PTY stream corruption hypothesis is not supported by code; residue is more likely frontend repaint invalidation than malformed output data.

- timestamp: 2026-05-07T07:34:00Z
  checked: src/terminal/terminal-manager.ts, src/terminal/resize-handler.ts, src/components/terminal-tabs.tsx, src/components/project-modal.tsx, src/components/confirm-modal.tsx, src/main.tsx, src/styles/app.css
  found: Terminal lifecycle has many `fitAddon.fit()` calls around create/activate/restore/restart/layout changes, fixed full-screen modal overlays exist, but no `terminal.refresh(...)` calls or modal-close repaint hooks were found.
  implication: A missed xterm/WebGL repaint invalidation after overlay/modal disappearance is plausible, but not proven. A blind workaround would be speculative.

## Eliminated

- hypothesis: PTY stream corruption or malformed output data leaves stale ASCII.
  reason: `src/terminal/pty-bridge.ts` only passes bytes through to `terminal.write(bytes)` and has no mutation/filtering path matching fixed screen residue.

## Resolution

- root_cause: Not proven. Best current diagnosis is a rare frontend repaint invalidation gap after modal/overlay disappearance in xterm/WebGL, where only newly touched cells repaint and stale glyphs remain elsewhere.
- fix: No code fix applied. Recommendation is to ignore/observe until reliable repro, or later add a narrow active-terminal repaint hook only on modal close if the bug becomes frequent.
- verification: Static inspection only; no reliable repro available and user requested caution.
- files_changed: .planning/debug/codex-modal-ascii-residue.md
