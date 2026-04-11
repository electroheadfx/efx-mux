---
phase: 02-terminal-integration
plan: 02
subsystem: terminal
tags: [xterm.js, webgl, pty, tauri-channel, esm, vendoring]

# Dependency graph
requires:
  - phase: 01-scaffold-entitlements
    provides: "Import map pattern, vendor/ directory, index.html structure"
  - phase: 02-terminal-integration/plan-01
    provides: "Rust PTY commands (spawn_terminal, write_pty, resize_pty, ack_bytes)"
provides:
  - "Vendored xterm.js 6.0, addon-webgl 0.19.0, addon-fit 0.11.0 in src/vendor/"
  - "Import map entries for @xterm/* bare specifiers"
  - "terminal-manager.js: xterm lifecycle with WebGL retry-once fallback"
  - "pty-bridge.js: Channel streaming with Uint8Array conversion and flow control ACK"
affects: [02-terminal-integration/plan-03, 03-theming]

# Tech tracking
tech-stack:
  added: ["@xterm/xterm 6.0.0", "@xterm/addon-webgl 0.19.0", "@xterm/addon-fit 0.11.0"]
  patterns: ["Vendor ESM + import map for xterm packages", "WebGL retry-once then DOM fallback", "Channel onmessage -> Uint8Array -> terminal.write -> ack_bytes"]

key-files:
  created:
    - src/vendor/xterm.mjs
    - src/vendor/addon-webgl.mjs
    - src/vendor/addon-fit.mjs
    - src/vendor/xterm.css
    - src/terminal/terminal-manager.js
    - src/terminal/pty-bridge.js
  modified:
    - src/index.html

key-decisions:
  - "xterm addons are self-contained ESM (no cross-imports to @xterm/xterm), simplifying vendoring"

patterns-established:
  - "WebGL fallback: tryWebGL() with onContextLoss retry counter, silent DOM fallback on failure"
  - "PTY bridge: Channel.onmessage -> new Uint8Array(data) -> terminal.write(bytes) -> invoke('ack_bytes', { count })"

requirements-completed: [TERM-01, TERM-02, TERM-06]

# Metrics
duration: 3min
completed: 2026-04-06
---

# Phase 2 Plan 02: xterm.js Vendoring + Terminal Modules Summary

**Vendored xterm.js 6.0 with WebGL/fit addons via import map, created terminal-manager.js (WebGL retry-once fallback) and pty-bridge.js (Channel streaming with Uint8Array conversion and flow control ACK)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-06T15:09:22Z
- **Completed:** 2026-04-06T15:12:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Vendored xterm.js 6.0.0, addon-webgl 0.19.0, addon-fit 0.11.0 to src/vendor/ with CSS
- Extended import map in index.html with @xterm/* entries alongside existing @arrow-js/core
- Created terminal-manager.js with full xterm lifecycle including WebGL context loss retry-once pattern
- Created pty-bridge.js with Channel-based PTY streaming, Uint8Array conversion, and ack_bytes flow control

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor xterm.js 6.0 packages and update index.html import map + CSS** - `f676dc0` (feat)
2. **Task 2: Create terminal-manager.js and pty-bridge.js modules** - `ebd1958` (feat)

## Files Created/Modified
- `src/vendor/xterm.mjs` - Vendored xterm.js 6.0 ESM entry
- `src/vendor/addon-webgl.mjs` - Vendored WebGL addon ESM
- `src/vendor/addon-fit.mjs` - Vendored FitAddon ESM
- `src/vendor/xterm.css` - xterm.js base CSS for correct layout
- `src/index.html` - Import map extended with @xterm/* entries, xterm.css link added
- `src/terminal/terminal-manager.js` - xterm lifecycle: create, mount, WebGL/DOM fallback
- `src/terminal/pty-bridge.js` - Channel setup, write-to-pty, ack-bytes flow control

## Decisions Made
- xterm addon ESM files are self-contained (no bare specifier imports to @xterm/xterm), so no additional internal files needed in import map

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- terminal-manager.js and pty-bridge.js ready for Plan 03 to wire into the UI layout
- Import map and CSS in place -- any module can now `import { Terminal } from '@xterm/xterm'`

---
*Phase: 02-terminal-integration*
*Completed: 2026-04-06*
