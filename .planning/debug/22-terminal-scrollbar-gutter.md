---
slug: 22-terminal-scrollbar-gutter
status: resolved
trigger: "Vertical bar on right of terminal - scrollbar-like gutter (not thin line)"
created: 2026-04-19
updated: 2026-04-19
phase: 22
---

# Debug Session: Terminal Right-Edge Scrollbar Gutter

## Symptoms

- Expected: Terminal content fills to right edge of pane cleanly (maybe thin 1px scrollbar only)
- Actual: Wide scrollbar-like gutter reserved on right side of terminal
- Error messages: None
- Timeline: Worked earlier in Phase 22, broke mid-phase
- Reproduction: Open any terminal tab, observe right edge

## Context

Phase 22 work on xterm layout + vertical splits. History:
- a1d5b41 "kill xterm-viewport horizontal scrollbar reservation" — prior fix for horizontal case
- xterm.js 6.0.0 changed scrollbar implementation (VS Code integration, per CLAUDE.md)
- 735e3a3 reverted app.css (scrollbar CSS likely there)
- b015381 layout revert

Suspects:
- xterm-viewport vertical scrollbar reservation (parallel of a1d5b41 for horizontal)
- WebGL addon rendering not spanning full width
- .xterm div width vs parent width mismatch
- Scrollbar styling CSS lost in revert

## Current Focus

hypothesis: CONFIRMED — dual cause: dead CSS selectors + xterm 6 overviewRuler→verticalScrollbarSize mapping
test: read FitAddon source + xterm.mjs to trace gutter source
expecting: CSS selector mismatch + width reservation
next_action: RESOLVED — fix applied

## Evidence

- timestamp: 2026-04-19T14:xx
  finding: ".terminal-area" class not present in DOM after Phase 22 sub-scope-pane restructuring
  detail: All `.terminal-area .xterm-*` rules are dead CSS — do not apply to live terminals
  file: src/styles/app.css lines 169-191
  impact: viewport background, overflow-x, scrollable-element background fixes all inactive

- timestamp: 2026-04-19T14:xx
  finding: xterm 6.0 FitAddon maps overviewRuler.width to verticalScrollbarSize
  detail: FitAddon source: `let s = scrollback===0 ? 0 : overviewRuler?.width || 14`
  file: node_modules/@xterm/addon-fit/lib/addon-fit.mjs
  impact: FitAddon subtracts overviewRuler.width (10px) from available width — canvas is 10px narrower

- timestamp: 2026-04-19T14:xx
  finding: xterm 6.0 _getChangeOptions() maps overviewRuler.width → VS Code scrollable widget verticalScrollbarSize
  detail: `verticalScrollbarSize: this._optionsService.rawOptions.overviewRuler?.width || 14`
  file: node_modules/@xterm/xterm/lib/xterm.mjs
  impact: VS Code scrollbar widget is 10px wide, positioned at right edge of .xterm-scrollable-element

- timestamp: 2026-04-19T14:xx
  finding: webkit scrollbar on .xterm-viewport adds 8px additional right-side gutter
  detail: .xterm-viewport has overflow-y:scroll (xterm.css). Our rule width:8px makes native scrollbar always visible
  file: src/styles/app.css line 286
  impact: 8px webkit scrollbar thumb visible at right edge, overlapping the 10px FitAddon zone

## Eliminated

- WebGL canvas width mismatch: not the cause; canvas width is determined by FitAddon col calculation
- Revert losing CSS: CSS was identical between 768be19 and HEAD; scrollbar rules persisted
- overviewRuler introduction: present since Phase 6.1; not a new regression by itself

## Resolution

root_cause: |
  TWO compounding causes:
  1. All `.terminal-area .xterm-*` CSS selectors are DEAD (`.terminal-area` not in DOM after
     Phase 22 sub-scope restructuring) — viewport background, overflow-x:hidden, and
     scrollable-element background fixes were all silently inactive.
  2. xterm 6.0 maps `overviewRuler.width` (10px) to both FitAddon's reserved gutter and
     the VS Code scrollable widget's `verticalScrollbarSize`. This creates: (a) a 10px
     canvas shortfall on the right, and (b) a 10px VS Code scrollbar widget at the right edge.
     The `webkit-scrollbar width: 8px` on .xterm-viewport adds a visible 8px native scrollbar
     on top of the 10px zone.

fix: |
  app.css changes:
  1. Replaced all `.terminal-area .xterm-*` selectors with `.terminal-containers .xterm-*`
     (the actual DOM ancestor used since Phase 22 sub-scope-pane restructuring).
  2. Zeroed webkit scrollbar width on .xterm-viewport: `width: 0; height: 0` — the VS Code
     scrollable element handles all xterm 6 scroll interaction; the native webkit scrollbar
     is redundant and produces a visible right-side gutter.
  3. Added `.xterm .xterm-scrollable-element > .scrollbar.vertical { display: none !important }`
     to hide the VS Code scrollbar widget. The 10px FitAddon-reserved zone now shows the
     terminal background color (set on .xterm-scrollable-element). Mouse-wheel scrolling
     continues via the scrollable element container.
  Note: overviewRuler.width cannot be set to 0 in terminal-manager.ts because FitAddon's
  `0 || 14` fallback would give a 14px gutter (worse). The 10px zone is now invisible
  (terminal background color) rather than showing a visible scrollbar widget.
