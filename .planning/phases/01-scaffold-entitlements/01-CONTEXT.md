# Phase 1: Scaffold + Entitlements - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Bootstrap a Tauri 2 macOS app with a styled 3-zone layout (sidebar + main + right split), draggable/persistent split handles, collapsible sidebar (Ctrl+B), working Cmd+C/V clipboard, and locked macOS entitlements. No terminal functionality yet — placeholders only. This is the structural and entitlements foundation that every subsequent phase builds on.

</domain>

<decisions>
## Implementation Decisions

### Scaffold structure
- **D-01:** Use `create-tauri-app` with the blank/vanilla template (no framework, no bundler).
- **D-02:** Organize `src/` by feature from day one:
  - `src/index.html` — entry point with inline importmap
  - `src/components/sidebar.js`, `main-panel.js`, `right-panel.js` — Arrow.js component files
  - `src/styles/layout.css`, `theme.css` — separate layout and color concerns
  - `src/vendor/arrow.js` — vendored Arrow.js ESM bundle

### Layout structure
- **D-03:** Three horizontal zones: sidebar (collapsible, 200px full / 40px icon strip) + main panel (~50%) + right panel (~25%+25%).
- **D-04:** Right panel is two vertically stacked sub-panels (each ~25% height).
- **D-05:** Main panel has two sub-zones: `terminal-area` (flex: 1) and `server-pane` (collapsed placeholder, height: 0). Server pane contains no content in Phase 1 — structure only, to avoid layout re-work in Phase 7.

### Drag splits
- **D-06:** Thin vanilla JS drag manager — `mousedown`/`mousemove`/`mouseup` handlers on each split handle divider.
- **D-07:** Ratios stored as CSS custom properties (`--sidebar-w`, `--main-w`, `--right-w`) updated live during drag.
- **D-08:** Ratios persisted to `localStorage` in Phase 1 as a temporary measure. Phase 4 (Session Persistence) migrates this to `state.json`.
- **D-09:** Split handles: one vertical between sidebar/main, one vertical between main/right, one horizontal between the two right sub-panels.

### Arrow.js vendoring
- **D-10:** Download `@arrow-js/core` ESM bundle (pinned to 1.0.6) and commit it to `src/vendor/arrow.js`. No CDN dependency, no build step.
- **D-11:** Import map lives inline in `index.html` as `<script type="importmap">` pointing to `/vendor/arrow.js`. No external importmap JSON file.

### macOS entitlements
- **D-12:** Lock the full entitlements set in Phase 1 to avoid re-signing the binary in later phases:
  - `com.apple.security.app-sandbox = false` (required: PTY spawning incompatible with sandbox)
  - `com.apple.security.network.client = true` (required by Phase 7: Open in Browser, agent network calls)
  - `com.apple.security.files.user-selected.read-write = true` (required by Phase 5/6: project file access)
  - `com.apple.security.files.downloads.read-write = true` (required by Phase 6: file tree operations)
- **D-13:** Entitlements applied to both debug and release profiles in `tauri.conf.json`.

### Theme / styling
- **D-14:** App chrome uses the forest-green dark palette from PROJECT.md from day one:
  - `--bg: #1e2d25`, `--bg-raised: #2d3d32`, `--border: #3a4d3f`
  - `--text: #8e9a90`, `--text-bright: #c8d4ca`, `--accent: #26a641`
  - Font: FiraCode Light 14 in app chrome (no ligatures in terminal panels per REQUIREMENTS.md)
- **D-15:** Colors defined as CSS custom properties in `theme.css`. No hardcoded colors in component files.

### Clipboard
- **D-16:** Cmd+C / Cmd+V wired via Tauri's macOS menu system (`tauri.conf.json` menu section). No custom JS clipboard handling needed in Phase 1.

### Claude's Discretion
- Exact pixel widths for split handle hit targets
- Min/max constraints for panel resize (minimum usable widths)
- Sidebar icon strip content (placeholder icons or empty)
- Collapsed server pane trigger element design

</decisions>

<specifics>
## Specific Ideas

- Main panel sub-zones confirmed: terminal area (takes remaining height) + bottom server pane (collapsible, placeholder only). User mentioned: "start, stop, open in browser" controls and log output — deferred to Phase 7, but the structural divider lives here.
- Layout mock confirmed:
  ```
  ┌──────────┬───────────────────┬──────────────┐
  │ sidebar  ║   main panel      ║  right panel │
  │  200px   ║      ~50%         ║    ~25%+25%  │
  │          ║   terminal-area   ╟──────────────╢
  │          ╟───────────────────╢ [bottom half]│
  │          ║   server-pane     ║              │
  └──────────╨───────────────────╨──────────────┘
  ```

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Layout & requirements
- `.planning/REQUIREMENTS.md` §Layout & Shell — LAYOUT-01 through LAYOUT-05: the exact acceptance criteria this phase must satisfy
- `.planning/ROADMAP.md` §Phase 1 — Success criteria (5 items), requirements list, UI hint

### Project context & stack
- `.planning/PROJECT.md` — Theme spec (color tokens, font), key decisions table, technology stack choices
- `CLAUDE.md` — Technology stack details for Tauri 2, Arrow.js, and critical gotchas (invoke import path, plugin migration, no custom elements)

### Research
- `RESEARCH/` — Original research spec and plan (check for any Tauri 2 entitlements or scaffold details)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No existing components, hooks, or utilities.

### Established Patterns
- None yet. Phase 1 establishes all patterns that subsequent phases follow.

### Integration Points
- `src-tauri/tauri.conf.json` — central config for entitlements, window size, menu, CSP. Phase 2 adds PTY commands here.
- `src/index.html` importmap — Phase 2 adds xterm.js to this map when the terminal is wired.
- `src/components/main-panel.js` — Phase 2 mounts xterm.js terminal inside `terminal-area` div scaffolded here.

</code_context>

<deferred>
## Deferred Ideas

- Server pane controls (start/stop/open in browser, log output) — Phase 7 (AGENT-01, AGENT-02)
- Ctrl+` toggle keybinding for server pane — Phase 8 keyboard system (UX-01)
- Light mode toggle — Phase 3 (THEME-04)
- state.json persistence for split ratios — Phase 4 (PERS-01); Phase 1 uses localStorage as temporary measure

</deferred>

---

*Phase: 01-scaffold-entitlements*
*Context gathered: 2026-04-06*
