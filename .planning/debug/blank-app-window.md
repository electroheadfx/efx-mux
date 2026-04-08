---
status: diagnosed
trigger: "The Efxmux Tauri 2 app opens but shows a completely blank window"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:01:00Z
---

## Current Focus

hypothesis: Phase 6 introduced new static imports (gsd-viewer, diff-viewer, file-tree, tab-bar) in right-panel.js, and one of them causes a runtime error during module evaluation that silently kills the entire JS module tree. Most likely candidate: gsd-viewer.js imports marked and calls marked.use() at module scope, or an Arrow.js template rendering error in the new components.
test: Need to check browser console (WKWebView dev tools) for JS errors, or bisect by reverting Phase 6 imports
expecting: JS error visible in console, or app renders after removing Phase 6 imports
next_action: User needs to check WebView dev console for errors, OR try reverting right-panel.js to Phase 5 placeholder to confirm Phase 6 is the regression source

## Symptoms

expected: App should show full UI - sidebar, terminal panel, right panels with tabs, bottom bash terminal
actual: Completely blank dark window (#282d3a background), only title bar shows "Efxmux"
errors: Unknown - need to check WebView dev console
reproduction: Launch app with cargo tauri dev
started: During Phase 6 development. Phases 1-5 were completed successfully.

## Eliminated

- hypothesis: Missing vendor files (arrow.js, xterm.mjs, addon-webgl.mjs, addon-fit.mjs, marked.mjs)
  evidence: All files present in src/vendor/ with correct exports
  timestamp: 2026-04-07T00:00:30Z

- hypothesis: Rust backend compilation failure
  evidence: cargo check passes cleanly
  timestamp: 2026-04-07T00:00:30Z

- hypothesis: JavaScript syntax errors in any source file
  evidence: node --check passes for all 16 JS files
  timestamp: 2026-04-07T00:00:40Z

- hypothesis: Circular dependencies in import chain
  evidence: Full import graph analysis shows no cycles
  timestamp: 2026-04-07T00:00:45Z

- hypothesis: Missing Tauri commands in invoke_handler registration
  evidence: All Phase 6 commands (get_file_diff, list_directory, read_file_content, read_file, write_checkbox, set_project_path) are registered in lib.rs
  timestamp: 2026-04-07T00:00:50Z

- hypothesis: Import map misconfiguration
  evidence: All 4 import map entries (arrow, xterm, addon-webgl, addon-fit, marked) point to existing files with correct named exports
  timestamp: 2026-04-07T00:00:50Z

- hypothesis: Missing font file
  evidence: FiraCode-Light.woff2 exists in src/fonts/
  timestamp: 2026-04-07T00:00:50Z

## Evidence

- timestamp: 2026-04-07T00:00:20Z
  checked: Git history for Phase 6 changes
  found: Phase 6 completely rewrote right-panel.js from simple placeholder to complex component importing 6 new modules (tab-bar, gsd-viewer, diff-viewer, file-tree, pty-bridge, state-manager). Also added file-viewer overlay to main-panel.js and new event handlers to main.js.
  implication: Phase 6 is the regression source. Before Phase 6 (commit 1433252), right-panel.js was a simple html template with no dynamic imports.

- timestamp: 2026-04-07T00:00:25Z
  checked: CSS and HTML structure
  found: CSS loads correctly (background #282d3a is var(--bg) from theme.css). HTML has #app div that is empty. This means main.js module tree fails to evaluate.
  implication: An ES module that fails to evaluate prevents all dependent modules from executing. Since main.js uses static imports, ANY failure in the import tree kills everything.

- timestamp: 2026-04-07T00:00:35Z
  checked: Module evaluation side effects in new Phase 6 files
  found: gsd-viewer.js calls marked.use() at module scope (line 50-56). diff-viewer.js and file-tree.js and tab-bar.js have minimal module-scope code. right-panel.js only imports and exports. All files destructure window.__TAURI__.core at module scope.
  implication: If marked.use() throws, or if window.__TAURI__ is not ready when modules evaluate, the entire tree fails.

- timestamp: 2026-04-07T00:00:55Z
  checked: Arrow.js ref attribute usage in Phase 6 components
  found: 4 components use ref="${(el) => ...}" pattern (gsd-viewer, diff-viewer, file-tree, right-panel). Arrow.js does NOT have special ref handling -- it treats these as reactive attribute expressions, not DOM ref callbacks. The callbacks are never invoked with the DOM element.
  implication: ref callbacks don't fire (bashContainerEl, contentEl remain null), but this alone shouldn't cause blank screen -- it would just mean those features don't work. However, if Arrow.js's internal attribute handling throws on these, it could crash rendering.

## Resolution

root_cause: Phase 6 changes introduced new static module imports that are evaluated before main.js renders. The most probable causes (in order of likelihood): (1) A runtime error in one of the new modules during evaluation that silently kills the module tree -- most likely in gsd-viewer.js marked.use() call or an Arrow.js template rendering issue with the ref pattern; (2) The new components use ref="${fn}" which Arrow.js treats as reactive expressions, not DOM refs -- this could cause unexpected behavior in the template rendering pipeline; (3) A Tauri CSP or IPC timing issue where window.__TAURI__ is not fully initialized when the expanded module tree evaluates.
fix:
verification:
files_changed: []
