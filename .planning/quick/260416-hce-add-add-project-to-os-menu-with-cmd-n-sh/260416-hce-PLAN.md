---
phase: quick
plan: 260416-hce
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
  - src/main.tsx
autonomous: true
requirements: ["Add 'Add Project' to OS menu with Cmd+N shortcut"]
must_haves:
  truths:
    - "File > Add Project menu item visible in macOS menu bar"
    - "Cmd+N opens the Add Project modal"
    - "Menu item behavior is identical to the + button in the title bar"
    - "Existing menu items (Efxmux, Edit, Window) are unaffected"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      provides: "File menu with Add Project menu item and Cmd+N accelerator"
      contains: "add-project"
    - path: "src/main.tsx"
      provides: "Event listener wiring add-project-requested to openProjectModal"
      contains: "add-project-requested"
  key_links:
    - from: "src-tauri/src/lib.rs"
      to: "src/main.tsx"
      via: "Tauri emit('add-project-requested') in on_menu_event"
      pattern: "add-project-requested"
    - from: "src/main.tsx"
      to: "src/components/project-modal.tsx"
      via: "listen callback calls openProjectModal()"
      pattern: "openProjectModal"
---

<objective>
Add an "Add Project" item to the macOS menu bar under a new "File" submenu, bound to Cmd+N. Clicking it opens the same Add Project modal as the existing "+" button in the title bar.

Purpose: Standard macOS convention -- Cmd+N creates a new item. Users expect File > New to exist.
Output: File menu with Add Project item, Cmd+N shortcut wired to openProjectModal().
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src-tauri/src/lib.rs (menu setup, on_menu_event handler -- quit pattern to follow)
@src/main.tsx (event listeners, openProjectModal import already present)
@src/components/project-modal.tsx (openProjectModal API)

<interfaces>
<!-- Existing pattern from quit confirmation (lib.rs lines 34, 178-180, main.tsx lines 132-140) -->

Rust menu item creation:
```rust
MenuItem::with_id(app, "quit", "Quit Efxmux", true, Some("CmdOrCtrl+Q"))
```

Rust event emission in on_menu_event:
```rust
.on_menu_event(|app, event| {
    if event.id().as_ref() == "quit" {
        let _ = app.emit("quit-requested", ());
    }
})
```

Frontend listener pattern:
```typescript
listen('quit-requested', () => { /* handler */ });
```

Target function (already imported in main.tsx line 33):
```typescript
export function openProjectModal(opts?: { firstRun?: boolean; project?: ProjectEntry }): void
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add File menu with "Add Project" item to Rust menu bar</name>
  <files>src-tauri/src/lib.rs</files>
  <action>
In lib.rs `run()`, add a "File" submenu between the app_menu and edit_menu. Follow the exact same pattern as the existing "quit" MenuItem:

1. After the `app_menu` builder (line 35) and before the `edit_menu` builder (line 40), create a new File submenu:
```rust
let file_menu = SubmenuBuilder::new(app, "File")
    .item(&MenuItem::with_id(app, "add-project", "Add Project", true, Some("CmdOrCtrl+N"))?)
    .build()?;
```

2. Update the MenuBuilder (line 57) to include file_menu between app_menu and edit_menu:
```rust
let menu = MenuBuilder::new(app)
    .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
    .build()?;
```

3. Extend the `on_menu_event` closure (line 178) to handle the "add-project" menu ID by emitting an "add-project-requested" event:
```rust
.on_menu_event(|app, event| {
    match event.id().as_ref() {
        "quit" => { let _ = app.emit("quit-requested", ()); }
        "add-project" => { let _ = app.emit("add-project-requested", ()); }
        _ => {}
    }
})
```
  </action>
  <verify>cd /Users/lmarques/Dev/efx-mux && cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5</verify>
  <done>Rust compiles cleanly. File menu with "Add Project" (Cmd+N) exists in menu bar between Efxmux and Edit menus.</done>
</task>

<task type="auto">
  <name>Task 2: Wire frontend listener to open Add Project modal on menu event</name>
  <files>src/main.tsx</files>
  <action>
In main.tsx `bootstrap()`, add a listener for the "add-project-requested" event immediately after the existing "quit-requested" listener (line 140). The `openProjectModal` import already exists on line 33.

Add after line 140:
```typescript
// File > Add Project (Cmd+N) menu action (quick-260416-hce)
listen('add-project-requested', () => {
  openProjectModal();
});
```

This is the exact same pattern as the quit-requested listener. No additional imports needed -- both `listen` (line 12) and `openProjectModal` (line 33) are already imported.
  </action>
  <verify>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | tail -5</verify>
  <done>TypeScript compiles cleanly. Listening for "add-project-requested" calls openProjectModal() with no arguments (add mode, not edit mode).</done>
</task>

</tasks>

<verification>
1. `cargo build --manifest-path src-tauri/Cargo.toml` compiles without errors
2. `pnpm exec tsc --noEmit` passes without errors
3. Manual: Launch app, File menu visible in macOS menu bar with "Add Project" item showing Cmd+N shortcut
4. Manual: Press Cmd+N -- Add Project modal opens (same as clicking + button)
5. Manual: Click File > Add Project -- same modal opens
6. Manual: Existing menus (Efxmux, Edit, Window) still work as before
</verification>

<success_criteria>
- File > Add Project menu item appears in macOS menu bar between Efxmux and Edit
- Cmd+N keyboard shortcut opens the Add Project modal
- Menu click opens the Add Project modal
- Both paths open the modal in "add" mode (not edit mode) -- same as the + button
- No regressions to existing menus (Quit confirmation on Cmd+Q, clipboard shortcuts, etc.)
</success_criteria>

<output>
After completion, create `.planning/quick/260416-hce-add-add-project-to-os-menu-with-cmd-n-sh/260416-hce-SUMMARY.md`
</output>
