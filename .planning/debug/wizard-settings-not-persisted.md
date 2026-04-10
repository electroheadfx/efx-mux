---
status: investigating
trigger: "Wizard project settings not persisted after app restart - goes to /tmp default"
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## Current Focus

hypothesis: Dual state architecture (JS currentState vs Rust ManagedAppState) where save_state overwrites ManagedAppState creates a race where project data can be lost. Additionally, the sidebar's independent zero-projects check opens AddProject modal, causing user confusion (Test 10 related).
test: Trace complete data flow from wizard finishWizard() through app close, verify state.json content
expecting: If race exists, ManagedAppState gets overwritten by stale JS state missing project.projects
next_action: Root cause identified - document findings

## Symptoms

expected: Wizard project settings are persisted and restored after app restart
actual: When quitting the app after wizard setup and re-running, the app goes to /tmp default project instead of the project added in the wizard
errors: None reported
reproduction: Test 11 in UAT - complete wizard with valid project, quit app, relaunch
started: Discovered during Phase 08 UAT

## Eliminated

- hypothesis: addProject/switchProject don't save to disk
  evidence: Both call save_state_sync in Rust which does atomic write (tmp+rename) to state.json. Rust code confirmed correct at project.rs lines 7-62.
  timestamp: 2026-04-10T12:10:00Z

- hypothesis: load_state reads stale data
  evidence: load_state_sync reads from disk. After addProject writes to disk, load_state returns updated data.
  timestamp: 2026-04-10T12:15:00Z

- hypothesis: Rust AppState struct missing projects field
  evidence: ProjectState has both active: Option<String> and projects: Vec<ProjectEntry>, both with serde(default). Confirmed at state.rs lines 110-117.
  timestamp: 2026-04-10T12:20:00Z

- hypothesis: JS currentState loses project.projects after addProject reloads it
  evidence: addProject reloads currentState from disk via invoke('load_state'). The Rust serialization includes all fields. JSON.stringify preserves them.
  timestamp: 2026-04-10T12:25:00Z

## Evidence

- timestamp: 2026-04-10T12:05:00Z
  checked: first-run-wizard.tsx finishWizard()
  found: Function checks if dir && name before calling addProject. If either is empty, addProject is never called. closeWithDefaults sets /tmp and default as fallbacks.
  implication: Normal wizard completion should save correctly

- timestamp: 2026-04-10T12:08:00Z
  checked: state-manager.ts AppState interface
  found: JS AppState type defines project as { active: string | null } with NO projects field. But at runtime the object loaded from Rust DOES have projects. The catch-block default at line 68-76 creates project without projects array.
  implication: The TS type is incomplete but runtime behavior preserves projects from Rust

- timestamp: 2026-04-10T12:12:00Z
  checked: Rust save_state command (state.rs lines 297-315)
  found: save_state deserializes full JSON, OVERWRITES ManagedAppState completely, then writes to disk. Any save_state call with stale JS state would wipe ManagedAppState.
  implication: Dual-write architecture (addProject writes to ManagedAppState directly, save_state overwrites it from JS) is fragile

- timestamp: 2026-04-10T12:18:00Z
  checked: sidebar.tsx useEffect init (lines 228-242)
  found: Sidebar independently calls getProjects() and opens openProjectModal() when projects are empty. This runs concurrently with initProjects() which opens the wizard. On first run, BOTH modals appear.
  implication: Explains Test 10 (AddProject modal after wizard) and creates user confusion

- timestamp: 2026-04-10T12:22:00Z
  checked: bootstrap() initProjects() call
  found: initProjects() is NOT awaited. Sidebar effect updateLayout() is fire-and-forget (not awaited). Multiple concurrent async state writes possible.
  implication: Race conditions between save_state calls and add_project/switch_project

- timestamp: 2026-04-10T12:28:00Z
  checked: Rust close handler (lib.rs lines 133-172)
  found: on_window_event(CloseRequested) and RunEvent::Exit both save from ManagedAppState synchronously. If ManagedAppState was overwritten by a stale save_state, close saves stale data.
  implication: Close handler saves whatever ManagedAppState contains - correct if not overwritten

- timestamp: 2026-04-10T12:32:00Z
  checked: Current state.json on disk
  found: Has 3 projects correctly persisted with all fields. Session data does NOT include terminal-tabs.
  implication: Persistence works in general use; the bug may be specific to first-run timing

## Resolution

root_cause: Two compounding issues cause wizard project settings to not persist:

1. **Dual zero-project initialization race**: Both initProjects() (main.tsx:264-283) and sidebar's useEffect (sidebar.tsx:228-242) independently call getProjects(), find zero projects, and open different modals. initProjects opens the wizard; sidebar opens the AddProject modal. The sidebar's check runs concurrently and does NOT check if the wizard is already active.

2. **save_state overwrites ManagedAppState**: The Rust save_state command (state.rs:297-315) fully replaces ManagedAppState with whatever JS sends. The sidebar effect's updateLayout call (main.tsx:84-89) is fire-and-forget (not awaited), creating a window where save_state could theoretically overwrite project data added by add_project. More critically, the close handler (lib.rs:141-147) saves ManagedAppState to disk -- if any save_state call overwrote it with stale data, the close handler persists that stale data.

The most likely concrete failure path: The sidebar's openProjectModal() appears after the wizard completes (Test 10 confirms this). If the user interaction with the modal triggers any state save (or the user closes the app while confused by the duplicate modal), the state could be in an inconsistent state. Additionally, any updateLayout/updateSession call serializes the entire JS currentState, and if this happens between add_project writing to ManagedAppState and the JS reloading currentState, the serialized JSON overwrites ManagedAppState with pre-project data.

fix: 
verification: 
files_changed: []
