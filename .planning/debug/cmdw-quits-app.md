---
status: diagnosed
trigger: "Cmd+W quits app instead of closing tab"
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: Cmd+W is handled by the native macOS Window menu (PredefinedMenuItem::close_window) which closes the window and quits the app, bypassing the JS Ctrl+W handler since Cmd uses metaKey not ctrlKey
test: Check if the JS keydown handler filters out metaKey events, and check if Tauri menu has close_window accelerator
expecting: JS handler line 106 returns early when metaKey is true; Tauri menu has close_window with Cmd+W accelerator
next_action: Analyze the keydown handler and Tauri menu setup

## Symptoms

expected: Cmd+W should close the active tab when multiple tabs are open, not quit the entire app
actual: Cmd+W closes the app without warning instead of closing the active tab
errors: None
reproduction: Open multiple tabs, press Cmd+W
started: Discovered during UAT

## Eliminated

## Evidence

- timestamp: 2026-04-10T00:01:00Z
  checked: src/main.tsx line 106 - keydown handler guard clause
  found: "if (!e.ctrlKey || e.metaKey) return;" -- handler ignores ALL events with metaKey (Cmd). Cmd+W never reaches the closeActiveTab() call on line 133.
  implication: JS-level tab close logic is unreachable via Cmd+W

- timestamp: 2026-04-10T00:01:00Z
  checked: src-tauri/src/lib.rs lines 46-49 - Window menu construction
  found: PredefinedMenuItem::close_window(app, None) is registered in the Window menu, which binds to Cmd+W natively on macOS
  implication: Native Cmd+W closes the Tauri window (and thus quits the single-window app)

## Resolution

root_cause: Two independent issues combine. (1) The JS keydown handler in src/main.tsx line 106 guards with "if (!e.ctrlKey || e.metaKey) return;" which means Cmd+W (metaKey=true, ctrlKey=false) is ignored by JS entirely. (2) The Tauri Window menu in src-tauri/src/lib.rs line 48 registers PredefinedMenuItem::close_window which binds native Cmd+W to close the window, quitting the single-window app.
fix:
verification:
files_changed: []
