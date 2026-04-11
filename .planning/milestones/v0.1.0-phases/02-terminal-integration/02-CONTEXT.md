# Phase 2: Terminal Integration - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire a real PTY-backed terminal into the main panel — xterm.js 6.0 rendering with WebGL GPU acceleration (DOM fallback), tmux session backend for process persistence, bidirectional resize plumbing, and flow control that prevents buffer overflow during heavy AI output. This phase replaces the Phase 1 placeholder in `terminal-area` with a fully functional terminal.

</domain>

<decisions>
## Implementation Decisions

### PTY ↔ xterm.js pipeline
- **D-01:** On launch, probe for tmux via `tmux -V`. If missing, show a modal with install instructions (`brew install tmux`) and block terminal creation until resolved.
- **D-02:** tmux session names use the project directory basename (e.g., `efx-mux`). Simple, unique per project, matches tmux user expectations.
- **D-03:** Spawn sequence uses `tmux new-session -A -s {name}` — creates or attaches in one command. Single code path for fresh launch and restore.
- **D-04:** The `Channel<Vec<u8>>` spike is built inline as the first Tauri command (`spawn_terminal`). If Channel works as expected, it's production code. If encoding doesn't work, refactor in place.
- **D-05:** PTY output streams via `tauri::ipc::Channel<Vec<u8>>` (per TERM-06). Binary encoding, ordered delivery, low-latency. Not JSON emit events.

### WebGL/DOM fallback strategy
- **D-06:** On `onContextLoss`, dispose WebGL addon and attempt to re-create it once. If second attempt fails, fall back to DOM renderer permanently for that session.
- **D-07:** Silent fallback — no visible indicator when running in DOM mode. User doesn't need to know or care.
- **D-08:** xterm.js mounts via `document.querySelector('.terminal-area')` after Arrow.js renders the template. No Arrow.js `ref` attribute needed — this eliminates the WKWebView `ref` spike entirely.

### Flow control behavior
- **D-09:** Transparent pause on backpressure. PTY read thread stops reading when unacknowledged bytes exceed 400KB (HIGH watermark). User sees output slow/stop momentarily, then resume when buffer drains. No visible indicator.
- **D-10:** Watermark logic lives on the Rust side. PTY read loop tracks cumulative bytes sent via Channel. Pauses reading from PTY master when threshold exceeded.
- **D-11:** JS sends periodic byte-count ACKs via `invoke('ack_bytes', { count })` after xterm.js processes each chunk. Rust resumes PTY reads when unacknowledged bytes drop below 100KB (LOW watermark).

### Resize plumbing
- **D-12:** 150ms trailing debounce on resize. FitAddon.fit() fires on every ResizeObserver event (instant visual reflow), but `invoke('resize_pty', { cols, rows })` is debounced to reduce IPC chatter.
- **D-13:** Resize goes to PTY only via `PtyMaster::resize(PtySize { ... })`. tmux auto-adapts to the attached client's PTY dimensions — no explicit `tmux resize-window` needed.
- **D-14:** Resize is a control operation that always goes through, even during backpressure. Terminal dimensions must stay correct regardless of flow control state.

### Claude's Discretion
- PTY read loop buffer size (how many bytes to read per syscall)
- Channel chunk size (whether to coalesce small reads before sending)
- xterm.js Terminal options (scrollback size, cursor style, etc.)
- tmux default shell and environment setup
- Error UX for tmux session creation failures (beyond the missing-tmux modal)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Terminal requirements
- `.planning/REQUIREMENTS.md` §Terminal — TERM-01 through TERM-06: exact acceptance criteria for this phase
- `.planning/ROADMAP.md` §Phase 2 — Success criteria (5 items), dependency on Phase 1

### Project context & stack
- `.planning/PROJECT.md` — Technology stack table, key decisions (Channel not emit, tmux via Command)
- `CLAUDE.md` §xterm.js — Version 6.0 breaking changes, WebGL addon setup, required addons table
- `CLAUDE.md` §portable-pty — Tauri integration pattern, key API types, gotchas (take_writer one-shot, slave lifetime)
- `CLAUDE.md` §tmux integration — Required operations table, session management pattern, gotchas

### Phase 1 integration points
- `.planning/phases/01-scaffold-entitlements/01-CONTEXT.md` — Layout structure (D-03 through D-05), import map (D-11), Arrow.js pattern (D-10)
- `src/components/main-panel.js` — `terminal-area` div where xterm.js mounts
- `src/index.html` — Import map to extend with xterm.js packages
- `src-tauri/tauri.conf.json` — Tauri commands registered here
- `src-tauri/Cargo.toml` — Add portable-pty dependency here

### Arrow.js reference
- `.arrow-js/skill/getting-started.md` — Arrow.js patterns for component rendering
- `.arrow-js/skill/api.md` — API reference for `html`, `reactive()`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/main-panel.js` — Arrow.js component with `terminal-area` div and `server-pane` placeholder. xterm.js mounts inside `terminal-area`.
- `src/drag-manager.js` — Drag/resize system for split handles. Phase 2 resize events will integrate with this (ResizeObserver on terminal-area triggers FitAddon).
- `src/styles/theme.css` — CSS custom properties for colors. Terminal theme can reference these.

### Established Patterns
- Arrow.js `html` tagged templates for all UI (no custom elements, no vDOM)
- Tauri `invoke` from `window.__TAURI__.core` (withGlobalTauri: true)
- CSS custom properties for theming (`--bg`, `--text`, `--accent`, etc.)
- Import map in `index.html` for vendored ESM packages

### Integration Points
- `src-tauri/src/lib.rs` — Add `#[tauri::command]` functions: `spawn_terminal`, `write_pty`, `resize_pty`, `ack_bytes`
- `src/index.html` importmap — Add `@xterm/xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`
- `src/components/main-panel.js` — Replace placeholder text with xterm.js Terminal instance
- `src-tauri/Cargo.toml` — Add `portable-pty = "0.9.0"` dependency

</code_context>

<specifics>
## Specific Ideas

- querySelector mount approach eliminates the Arrow.js `ref` WKWebView spike — one fewer risk item.
- The `Channel<Vec<u8>>` spike is the remaining critical unknown. Build it as the real `spawn_terminal` command so the spike is production code if it works.
- tmux `new-session -A` gives us create-or-attach in one command — simplifies both fresh launch and session restoration (Phase 4 reuses this).
- Flow control ACK mechanism: JS tells Rust "I consumed N bytes" after each xterm.js write. This gives Rust precise knowledge of the pipeline state.

</specifics>

<deferred>
## Deferred Ideas

- tmux session restore on app reopen — Phase 4 (Session Persistence, PERS-02)
- Dead tmux session detection and recovery — Phase 4 (PERS-03)
- Terminal theming via theme.json — Phase 3 (THEME-01)
- WebGL vs DOM performance monitoring/metrics — not currently scoped
- Multiple terminal instances (right panel bash terminal) — Phase 6 (PANEL-07)

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-terminal-integration*
*Context gathered: 2026-04-06*
