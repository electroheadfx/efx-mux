---
slug: 22-terminal-row-remainder-band
status: resolved
trigger: "Bottom band on terminal pane - responsive size varies per terminal, not HTML element, possible tmux row approximation gap"
created: 2026-04-19
updated: 2026-04-19
phase: 22
---

# Debug Session: Terminal Bottom Row-Remainder Band

## Symptoms

- Expected: Terminal bottom aligns with pane floor cleanly
- Actual: Variable-height band at bottom; size differs across terminals/panes; user suspects non-HTML (tmux/xterm row quantization remainder)
- Error messages: None
- Timeline: Worked earlier in Phase 22, broke mid-phase
- Reproduction: Open terminal, observe bottom. Size varies per pane.

## Context

User hypothesis: responsive band, not an HTML element — possibly tmux row approximation or xterm integer-row remainder (pane height not a multiple of cell height).

Phase 22 history highly relevant:
- 64ed2e3 "scrollable-element remainder painted tmux green (diagnosed culprit)"
- 7325e07 "DIAGNOSTIC paint each xterm layer a unique color to find band source"
- 7d99ab6 "paint xterm-viewport with tmux green so remainder looks intentional"
- baf72d4 "paint all xterm ancestors + sub-scope-body with terminal bg"
- 6373e99 "keep tmux status bar on + sync chrome bg to xterm theme bg"
- 429e538 "flip tmux status off → on to confirm bottom-band hypothesis"
- b39564c "force xterm-viewport + scrollable-element to fill parent"
- ea798dd "defer initial fit to double-RAF so xterm measures post-layout"
- 735e3a3 REVERT app.css + terminal-manager + theme-manager
- b015381 REVERT layout files

Previous diagnosis: scrollable-element remainder. Previous fix attempts reverted — so the problem is BACK.

Suspects:
- Row-remainder: pane height mod cellHeight > 0 leaves unpainted strip
- fit addon called before layout settled
- scrollable-element background not matching terminal bg
- tmux status bar positioning offset

## Current Focus

hypothesis: CONFIRMED. Two separate causes found (see Evidence).
next_action: FIXED — apply commit

## Evidence

- timestamp: 2026-04-19T13:45:00
  type: git-analysis
  finding: >
    git show 64ed2e3 revealed the prior fix: painted `.xterm-scrollable-element`
    with `--color-tmux-status` (green). Revert at 735e3a3 removed all of it.
    The revert restored to 75a4dd1 which predates ALL xterm-band fixes.

- timestamp: 2026-04-19T13:46:00
  type: xterm-css-analysis
  finding: >
    xterm's own xterm.css defines `.xterm .xterm-viewport { background-color: #000;
    position: absolute; right:0; left:0; top:0; bottom:0; }`. The viewport
    fills the .xterm container. xterm-scrollable-element is inside viewport
    and has height = rows * cellHeight. The strip below xterm-screen = viewport
    bg (#000) showing through. Our CSS only painted `.terminal-area .xterm-viewport`
    and `.terminal-area .xterm-screen` — MISSING: `.xterm-scrollable-element`.

- timestamp: 2026-04-19T13:47:00
  type: css-analysis
  finding: >
    Global rule `*::-webkit-scrollbar { height: 8px }` applies to .xterm-viewport
    too. Our override `.xterm-viewport::-webkit-scrollbar { width: 8px }` only
    set width, NOT height: 0. So the 8px horizontal scrollbar reservation remained,
    adding a second dark band (diagnosed in a1d5b41, lost in 735e3a3 revert).

- timestamp: 2026-04-19T13:48:00
  type: js-analysis
  finding: >
    terminal-manager.ts line 152 called `fitAddon.fit()` synchronously after
    `terminal.open(container)`. At that point the flex container may not have
    settled its final height, so FitAddon measures wrong dimensions and computes
    fewer rows than the real space, leaving a larger remainder. Fix: double-RAF
    defer (as diagnosed in ea798dd, also lost in 735e3a3 revert).

- timestamp: 2026-04-19T13:49:00
  type: prior-attempt-analysis
  finding: >
    b39564c added `min-height: 100%` on `.xterm-viewport` and `.xterm-scrollable-element`
    which stretched the scrollable-element to full container height — breaking the
    vertical scrollbar track (it showed as a solid colored column). 15b1181 correctly
    reverted this. The safe fix is painting only (no stretching).

## Eliminated

- tmux status bar as cause: the band exists independent of tmux status state
- `min-height: 100%` on xterm internals: breaks scrollbar (confirmed b39564c)
- Anything inside the tmux cell-rendering path: purely CSS/JS rendering issue

## Resolution

root_cause: >
  Two compounding issues both reintroduced by the 735e3a3 revert:
  (1) `.xterm-scrollable-element` lacked a background-color override so its default
  transparent/black bg showed below `.xterm-screen` (rows * cellHeight < container
  height), producing a variable-width dark strip at pane bottom.
  (2) `.xterm-viewport::-webkit-scrollbar` was missing `height: 0`, letting the
  global `*::-webkit-scrollbar { height: 8px }` reserve 8px of horizontal scrollbar
  space inside the viewport — a second dark strip.

fix: >
  app.css: Added `.terminal-area .xterm-scrollable-element { background-color:
  var(--color-bg-terminal) !important }` (no height changes — those break scrollbar
  track). Added `overflow-x: hidden !important` on `.terminal-area .xterm-viewport`.
  Fixed `.xterm-viewport::-webkit-scrollbar` to include `height: 0` and added
  `:horizontal { display: none }` pseudo-selector. Added belt-and-suspenders bg on
  `.terminal-containers` and `.sub-scope-body`.
  terminal-manager.ts: Deferred `fitAddon.fit()` to double-RAF so FitAddon measures
  container after flex layout has settled (fixes wrong initial row count).

files_changed:
  - src/styles/app.css
  - src/terminal/terminal-manager.ts
