---
status: awaiting_human_verify
trigger: "Add Project modal: directory picker fails, app blanks after adding project"
created: 2026-04-08T12:00:00Z
updated: 2026-04-08T12:00:00Z
---

## Current Focus

hypothesis: Two separate bugs — (1) bare module specifier not in import map, (2) handleSubmit bypasses switchProject causing state inconsistency + sidebar never refreshes project list
test: Fix both and verify
expecting: Directory picker opens native dialog; adding project works without blanking
next_action: Implement fixes

## Symptoms

expected: Clicking "Select a directory" opens native macOS folder picker. After adding project, app continues working.
actual: Directory picker fails silently. After adding project, app window becomes empty/blank.
errors: "[Warning] [efxmux] Directory picker failed: TypeError: Module name, '@tauri-apps/plugin-dialog' does not resolve to a valid URL."
reproduction: Open app, click add project, try select directory, fill fields manually, click Add.
started: Current state of code.

## Eliminated

(none)

## Evidence

- timestamp: 2026-04-08T12:00:00Z
  checked: index.html import map
  found: "@tauri-apps/plugin-dialog" is NOT in the import map. Only @arrow-js/core, @xterm/*, and marked are mapped.
  implication: Dynamic import('@tauri-apps/plugin-dialog') at project-modal.js:91 fails because browser can't resolve bare specifier.

- timestamp: 2026-04-08T12:01:00Z
  checked: node_modules/@tauri-apps/plugin-dialog/dist-js/index.js
  found: The plugin internally calls invoke('plugin:dialog|open', { options }). This invoke is the same as window.__TAURI__.core.invoke which is already available.
  implication: Can bypass the npm import entirely and call invoke('plugin:dialog|open') directly.

- timestamp: 2026-04-08T12:02:00Z
  checked: handleSubmit in project-modal.js
  found: handleSubmit calls addProject() then dispatches 'project-changed' directly, but NEVER calls switchProject() from state-manager. The Rust active field is never set.
  implication: After adding, getActiveProject() returns null/stale value. Right-panel loadActiveProject() doesn't update. Sidebar state.projects never updated with new project.

- timestamp: 2026-04-08T12:03:00Z
  checked: sidebar.js project-changed listener
  found: Sets state.activeProject but does NOT refresh state.projects. New project not in sidebar list. Also project-added event dispatched by handleSubmit is never listened for.
  implication: Sidebar has stale project list after add. Combined with reactive rendering issues could cause blank screen.

- timestamp: 2026-04-08T12:04:00Z
  checked: Rust add_project command (project.rs)
  found: Only pushes to projects vec, does NOT set active field. No duplicate check.
  implication: Confirms active is never set during add flow.

- timestamp: 2026-04-08T12:05:00Z
  checked: Tauri plugin-dialog setup
  found: Rust has .plugin(tauri_plugin_dialog::init()), capabilities has "dialog:default". Plugin is properly configured on backend.
  implication: Only the JS import is broken, not the backend.

## Resolution

root_cause: Two bugs: (1) handleBrowse uses dynamic import('@tauri-apps/plugin-dialog') which fails because the bare specifier is not in the import map (no-bundler ESM setup). (2) handleSubmit dispatches project-changed directly without calling switchProject(), so Rust active is never set, sidebar project list is never updated, and downstream components get inconsistent state causing blank screen.
fix: (1) Replace dynamic import with direct invoke('plugin:dialog|open') using window.__TAURI__.core. (2) Rewrite handleSubmit to call switchProject() after addProject(), and add project-added listener in sidebar to refresh project list.
verification: pending human verification
files_changed: [src/components/project-modal.js, src/components/sidebar.js]
