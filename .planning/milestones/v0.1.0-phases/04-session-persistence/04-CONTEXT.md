# Phase 4: Session Persistence - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

User can close and reopen the app and find their exact workspace restored — same layout, same tabs, same tmux sessions reattached — with graceful handling of edge cases. Phase 4 builds on Phase 2's tmux backend and Phase 3's theme system.

</domain>

<decisions>
## Implementation Decisions

### State scope
- **D-01:** Phase 4 persists: layout (split ratios + sidebar collapsed state), theme mode (dark/light), panel tabs (per right panel), and active project. Phase 3's localStorage for theme mode and split ratios migrates to state.json here.
- **D-02:** Panel tabs and active project are pre-provisioned in state.json even though their full UI (Phase 5/6) doesn't exist yet — schema is ready for those phases.

### Session reattach strategy
- **D-03:** Simple re-spawn approach: PtyState is recreated on restart. JS calls `spawn_terminal` with the saved session name — `tmux new-session -A -s {name}` reattaches if the session exists, creates if it doesn't. Flow control counters reset fresh.
- **D-04:** tmux `new-session -A` gives us create-or-attach in one command. This is the same spawn sequence used in Phase 2 for fresh sessions.

### Dead session recovery
- **D-05:** If an existing tmux session can't be attached (daemon died), log a warning to console and create a fresh session automatically. Non-blocking — the user can continue working without interruption.
- **D-06:** No modal dialog or user prompt for dead sessions — automatic recovery is silent. User sees the fresh session in their terminal; they can debug the daemon separately if needed.

### state.json schema
- **D-07:** Flat key-value map structure at `~/.config/efxmux/state.json`:
  ```json
  {
    "version": 1,
    "layout": {
      "sidebar-w": "200px",
      "right-w": "25.0%",
      "right-h-pct": "50",
      "sidebar-collapsed": false
    },
    "theme": {
      "mode": "dark"
    },
    "session": {
      "main-tmux-session": "efx-mux",
      "right-tmux-session": "efx-mux-right"
    },
    "project": {
      "active": "/path/to/project"
    },
    "panels": {
      "right-top-tab": "gsd",
      "right-bottom-tab": "git"
    }
  }
  ```
- **D-08:** Version field allows future schema migrations. If schema version doesn't match what the app expects, treat as missing/corrupt and use defaults.

### Corrupt/missing state handling
- **D-09:** If state.json is missing or corrupted: log a warning to console and start with default state. The app works normally — no crash, no modal.
- **D-10:** Default state: sidebar full width (200px), right panel at 25%, right-h split at 50%, sidebar expanded, dark mode, no active project, default tmux session names.

### Canonical refs
- **D-11:** State save is NOT in the hot path (user is closing the app). Use blocking file I/O in a `spawn_blocking` thread — no need for async writes or write-ahead logging.
- **D-12:** State save triggers on `window:beforeunload` event (JS) → Tauri invoke → Rust writes state.json synchronously. Rust uses `std::fs` blocking I/O from a `spawn_blocking` thread to avoid blocking the main async runtime.

</decisions>

<specifics>
## Specific Ideas

- Simple re-spawn keeps the architecture identical to Phase 2's fresh-session path — no separate "restore" code path, just reuse the spawn command with the saved session name.
- state.json lives alongside theme.json at `~/.config/efxmux/` (same directory, established in Phase 3).
- Panel tab state is saved even though tabs don't exist yet — the schema anticipates Phase 5/6. Tab indices are saved, not tab contents.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Persistence requirements
- `.planning/REQUIREMENTS.md` §Session Persistence — PERS-01 through PERS-04: exact acceptance criteria for this phase
- `.planning/ROADMAP.md` §Phase 4 — Success criteria (4 items), dependency on Phase 2

### Project context & stack
- `.planning/PROJECT.md` §Key Decisions — tmux as session backend, no AI CLI wrapping
- `CLAUDE.md` §tmux integration — Required operations table, session management pattern
- `CLAUDE.md` §portable-pty — take_writer one-shot gotcha, slave lifetime requirement

### Phase 1 & 2 integration points
- `.planning/phases/01-scaffold-entitlements/01-CONTEXT.md` — D-08: Phase 1 uses localStorage; Phase 4 migrates to state.json
- `.planning/phases/02-terminal-integration/02-CONTEXT.md` — D-02, D-03, D-19: tmux session naming (sanitized basename), spawn sequence `-A -s`, PtyState structure
- `src/drag-manager.js` — D-06 to D-09: current localStorage split-ratio persistence (Phase 4 migrates to state.json via Rust)
- `src/theme/theme-manager.js` — D-13/D-14: current localStorage theme mode persistence (Phase 4 migrates to state.json)

### Phase 3 integration points
- `.planning/phases/03-terminal-theming/03-CONTEXT.md` — D-01: config path `~/.config/efxmux/`, D-09 to D-12: notify watcher pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/terminal/pty.rs` — `check_tmux()` already probes tmux availability. Phase 4 can use a similar pattern to check if a saved session still exists.
- `src/drag-manager.js` — `saveRatios` callback pattern. Phase 4 replaces this with a Rust-side save that writes to state.json.
- `src/theme/theme-manager.js` — `setThemeMode()` + localStorage. Phase 4 replaces this with state.json persistence.
- `notify` crate (Phase 3) — Already watching theme.json. Phase 4 can extend the same watcher or share the watch handle for state.json.

### Established Patterns
- Tauri `invoke` from `window.__TAURI__.core` for JS→Rust calls
- Tauri `spawn_blocking` for blocking file I/O from async Rust context
- Flat key-value map schema in theme.json (Phase 3 D-02) — Phase 4 state.json follows the same pattern
- CSS custom properties for layout values stored as strings

### Integration Points
- `src-tauri/src/lib.rs` — Add state commands: `save_state`, `load_state`, `get_config_dir`
- `src/main.js` — Replace localStorage calls with `invoke('save_state')` and `invoke('load_state')`; wire `window:beforeunload`
- `src/terminal/terminal-manager.js` — Save/load tmux session names; pass session name to `spawn_terminal`
- `src/drag-manager.js` — Replace `saveRatios` localStorage with Rust invoke call
- `src/theme/theme-manager.js` — Replace theme mode localStorage with state.json via Rust

</code_context>

<deferred>
## Deferred Ideas

- Write-ahead logging or async writes for state save — not needed since save is on app close (not hot path)
- State diffing or compression — not needed for personal tool, state.json is small
- Per-project state files — deferred to Phase 5+ project system work

</deferred>

---

*Phase: 04-session-persistence*
*Context gathered: 2026-04-07*
