---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/state.rs
autonomous: true
requirements: []
must_haves:
  truths:
    - "On fresh app launch, the GSD tab is active by default, not File Tree"
  artifacts:
    - path: "src-tauri/src/state.rs"
      contains: "fn default_right_top_tab() -> String { \"GSD\".into() }"
---

<objective>
Fix the right sidebar so the GSD tab is shown by default on app launch instead of the File Tree tab.
</objective>

<context>
@src-tauri/src/state.rs
@src/state-manager.ts
@src/components/right-panel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix default right_top_tab capitalization in Rust state</name>
  <files>src-tauri/src/state.rs</files>
  <action>
In `src-tauri/src/state.rs`, change the `default_right_top_tab()` function to return `"GSD"` instead of `"gsd"`.

Current (line 189-191):
```rust
fn default_right_top_tab() -> String {
    "gsd".into()
}
```

New:
```rust
fn default_right_top_tab() -> String {
    "GSD".into()
}
```

This fixes the case mismatch between the Rust default (lowercase "gsd") and the JS `RIGHT_TOP_TABS` array which uses capitalized "GSD". When the app launches with a fresh state.json, the panels state now correctly defaults to "GSD" matching the JS signal default.
  </action>
  <verify>
<automated>grep -n "default_right_top_tab" src-tauri/src/state.rs | grep "GSD"</automated>
  </verify>
  <done>default_right_top_tab() returns "GSD" (capitalized) instead of "gsd"</done>
</task>

</tasks>

<verification>
The app should launch with the GSD tab active in the right-top panel, not the File Tree tab.
</verification>

<success_criteria>
On fresh launch (no existing state.json), the right-top panel shows the GSD viewer, not the File Tree. The GSD tab button appears active in the TabBar.
</success_criteria>

<output>
After completion, create `.planning/quick/260410-wtw-right-sidebar-filetree-pane-no-open-by-d/260410-wtw-SUMMARY.md`
</output>
