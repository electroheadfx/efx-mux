---
phase: 01-scaffold-entitlements
plan: 01
subsystem: ui
tags: [tauri-2, arrow-js, css-custom-properties, firacode, esm-importmap]

# Dependency graph
requires: []
provides:
  - "Tauri 2 project scaffold with cargo build passing"
  - "Arrow.js 1.0.6 vendored ESM bundle with importmap"
  - "Forest-green CSS theme with 6 color tokens"
  - "3-zone flexbox layout (sidebar + main + right)"
  - "FiraCode Light woff2 font"
affects: [01-scaffold-entitlements, 02-terminal-pty]

# Tech tracking
tech-stack:
  added: [tauri-2.10.3, arrow-js-1.0.6, firacode-6.2, tauri-plugin-opener-2]
  patterns: [vendored-esm-importmap, css-custom-properties-theming, flexbox-3-zone-layout]

key-files:
  created:
    - src/vendor/arrow.js
    - src/vendor/chunks/internal-DchK7S7v.mjs
    - src/styles/theme.css
    - src/styles/layout.css
    - src/fonts/FiraCode-Light.woff2
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    - src-tauri/src/lib.rs
    - src-tauri/src/main.rs
  modified:
    - package.json
    - .gitignore
    - src/index.html
    - src/main.js

key-decisions:
  - "Renamed scaffold from _scaffold to gsd-mux across Cargo.toml, tauri.conf.json, package.json"
  - "Removed greet command boilerplate from lib.rs — clean slate for Phase 2 commands"
  - "Window dimensions set to 1280x800 for multi-panel workspace"

patterns-established:
  - "Vendored ESM: Arrow.js served from src/vendor/ via importmap, no bundler needed"
  - "CSS tokens: All colors via --bg, --bg-raised, --border, --text, --text-bright, --accent"
  - "Layout structure: #app > sidebar + split-handle-v + main-panel + split-handle-v + right-panel"

requirements-completed: [LAYOUT-01, LAYOUT-05]

# Metrics
duration: 5min
completed: 2026-04-06
---

# Phase 01 Plan 01: Scaffold + Theme + Layout Summary

**Tauri 2 vanilla scaffold with vendored Arrow.js 1.0.6 importmap, forest-green theme (6 CSS tokens + FiraCode), and static 3-zone flexbox layout**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-06T12:54:13Z
- **Completed:** 2026-04-06T12:59:18Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- Tauri 2.10.3 project scaffolded and builds clean with `cargo build`
- Arrow.js 1.0.6 ESM vendored via `npm pack` with importmap in index.html
- Forest-green dark theme with all 6 color tokens and FiraCode Light woff2
- 3-zone layout: sidebar (200px) + main (flex-1) + right (25%) with split handles

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold and restructure project** - `3eb2b58` (feat)
2. **Task 2: Vendor Arrow.js 1.0.6 ESM bundle** - `a228be8` (feat)
3. **Task 3: Write theme.css, layout.css, and index.html** - `961a15e` (feat)
4. **Cleanup: Remove scaffold boilerplate** - `c70534a` (chore)

## Files Created/Modified
- `src-tauri/Cargo.toml` - Tauri 2 Rust project config (gsd-mux)
- `src-tauri/tauri.conf.json` - Tauri config with frontendDist: "../src"
- `src-tauri/src/lib.rs` - Tauri app entry (clean, no greet boilerplate)
- `src-tauri/src/main.rs` - Binary entry calling gsd_mux_lib::run()
- `src/vendor/arrow.js` - Arrow.js 1.0.6 ESM entry point
- `src/vendor/chunks/internal-DchK7S7v.mjs` - Arrow.js code-split chunk
- `src/styles/theme.css` - Forest-green palette, FiraCode @font-face, reset
- `src/styles/layout.css` - 3-zone flexbox with split handles
- `src/fonts/FiraCode-Light.woff2` - FiraCode Light 300 weight font
- `src/index.html` - Entry with importmap before module scripts
- `src/main.js` - Arrow.js reactive 3-zone layout skeleton
- `package.json` - npm config with @tauri-apps/cli devDep

## Decisions Made
- Renamed all scaffold identifiers from `_scaffold` to `gsd-mux` for consistency
- Removed the template's `greet` Tauri command from lib.rs to start clean
- Set window dimensions to 1280x800 (wider than scaffold's 800x600) for multi-panel layout
- Kept `tauri-plugin-opener` from scaffold template (useful for URL opening later)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tauri project compiles clean, ready for PTY and terminal integration
- Arrow.js importmap wired and tested via main.js reactive render
- CSS layout provides the visual skeleton for all subsequent panels
- Split handles are styled but drag behavior deferred to Plan 02

## Self-Check: PASSED

All 11 key files verified present. All 4 commits verified in git log.

---
*Phase: 01-scaffold-entitlements*
*Completed: 2026-04-06*
