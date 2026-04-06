# Research Summary — GSD⚡MUX

**Project:** GSD⚡MUX
**Domain:** Native macOS desktop terminal multiplexer for AI-assisted development
**Researched:** 2026-04-06
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

GSD⚡MUX is a Tauri 2 native macOS app that wraps xterm.js terminals backed by tmux sessions, adds a GSD Markdown plan viewer with write-back checkboxes, a live git diff panel, and a project-aware sidebar — all in a single resizable 3-zone layout. The right tool choices are confirmed: Tauri 2.10.x + portable-pty for PTY management, `tauri::ipc::Channel<Vec<u8>>` (not events) for PTY streaming, xterm.js 6.0.0 with WebGL addon, Arrow.js 1.0.x for UI components, tmux via CLI shell-out (not a Rust crate), and git2 0.20.x for diff data. No bundler required — all JS is vendored via import maps.

The core technical risk is Phase 2 (Terminal Integration): the PTY→IPC→xterm.js data pipeline must implement watermark-based flow control from day one, and the binary encoding behavior of `Channel<Vec<u8>>` and the Arrow.js `ref` attribute mount pattern both need early verification before the architecture is locked. Every other phase depends on Phase 2 being correct. The multi-webview Tauri API is not production-ready — the entire 3-zone layout must be a single HTML page with CSS flexbox.

macOS App Sandbox must never be enabled (PTY spawning is incompatible with it), ruling out App Store distribution permanently. tmux is not installed by default on macOS and needs a startup probe with a user-friendly install prompt. These two constraints must be locked in Phase 1 before any Rust code is written.

---

## Key Findings

### Confirmed Stack

| Package | Version | Decision |
|---------|---------|----------|
| tauri (Rust) | 2.10.3 | Stable, use `features = ["protocol-asset"]` |
| @tauri-apps/api (JS) | ^2.0.0 | Must match tauri core minor |
| @xterm/xterm | **6.0.0** (not 5.x) | Greenfield — start on current release, handle breaking changes at init |
| @xterm/addon-webgl | 0.19.0 | WebGL2 confirmed working in WKWebView macOS Sonoma |
| @xterm/addon-fit | 0.11.0 | Required for panel resize |
| @xterm/addon-canvas | fallback only | Canvas addon removed from 6.0; use for WebGL context-loss fallback only |
| @arrow-js/core | 1.0.6 | `component()` = render function, NOT web component |
| portable-pty (Rust) | 0.9.0 | Blocking I/O — always wrap reads in `spawn_blocking` |
| git2 (Rust) | 0.20.4 | Compiles libgit2; all calls on `spawn_blocking` |
| notify (Rust) | 8.2.0 | File watching for PLAN.md and theme.json |
| marked (JS) | ^14.0.0 | Markdown render + custom checkbox renderer for write-back |
| tmux (system) | 3.x minimum | Via `std::process::Command` — no Rust crate |

**Spec corrections vs common assumptions:**
- xterm.js is **6.0**, not 5.x. `@xterm/addon-canvas` does not exist in 6.0; do not import it.
- Arrow.js `component()` returns a **render function**, not a Custom Element. `customElements.define` is never used.
- Tauri multiple webviews (`Window::add_child`) are **not stable** — single HTML page with CSS layout only.
- PTY data goes through **`Channel<Vec<u8>>`**, never `emit()`. Events are JSON-only, unordered under load.

### Table Stakes

Must work or the app feels broken:

- **Zero-lag keyboard input** — PTY round-trip chain must be fully async; no blocking locks in hot path
- **Correct ANSI/VT100 rendering** — Claude Code uses cursor positioning, progress bars, color; IPC must not mangle bytes
- **Cmd+C / Cmd+V clipboard** — requires Tauri menu-bar wiring AND tmux OSC 52 config; two separate layers
- **Session persistence across app restart** — close → reopen → reattach to same tmux sessions
- **Resize without corruption** — xterm.js FitAddon → debounced `session_resize` → `pty.resize()` → SIGWINCH
- **Mouse passthrough** — PTY must forward mouse escape sequences unmodified
- **Scrollback ≥10,000 lines** — Claude Code output is voluminous; tmux default (2000) is insufficient

### Differentiators

What makes GSD⚡MUX unique:

- **GSD Markdown panel with write-back checkboxes** — click checkbox in PLAN.md → file updated on disk → Claude Code sees change on next read; no other terminal has this
- **Project-scoped workspace** — switch project → all panels (terminal, diff, plan, sidebar) update atomically
- **AI agent as first-class PTY citizen** — Claude Code / OpenCode spawn as raw PTY processes; no proxy, no interception
- **Live git diff panel** — powered by git2 (no shell-out latency); updates as AI makes changes
- **Collapsible server pane** — Open/Restart/Stop dev server co-located with agent terminal

### Architecture Decisions

**PTY streaming:** `Channel<Vec<u8>>` per session, one `tokio::task::spawn_blocking` reader thread per session, watermark flow control (HIGH: 400KB, LOW: 100KB). `emit()` is explicitly rejected.

**tmux integration:** Shell out via `std::process::Command`. Spawn `tmux attach-session -t <name>` inside a portable-pty PtyPair — the master PTY delivers the full rendered tmux stream to xterm.js. The `tmux_interface` crate is explicitly rejected (self-described experimental, incomplete).

**Session naming:** `gsd-{sha8(abs_path)}-{role}` (e.g., `gsd-a3f2c1b4-main`). Path hash prevents collisions; display name stored separately.

**Layout:** Single HTML page, CSS flexbox 3-zone (sidebar | main | right panels). Arrow.js `reactive()` for split ratios. `ResizeObserver` + 50ms debounce → FitAddon → `session_resize`.

**State:** serde `AppState` with `version: u32` migration, camelCase JSON, `~/.config/gsd-mux/state.json`. All fields `#[serde(default)]`.

### Critical Pitfalls

1. **xterm.js write buffer overflow (50MB cap)** — Claude Code burst output silently discarded. Implement watermark flow control in Phase 2. `term.write(chunk, callback)` drives backpressure; Rust uses `AtomicBool` pause flag.

2. **macOS App Sandbox blocks PTY** — `app-sandbox: true` makes `forkpty()` fail with no workaround. Lock entitlements.plist in Phase 1. App Store is permanently out of scope.

3. **WebGL context exhaustion** — WKWebView cap ~16. Requires `try/catch` + canvas fallback and `addon.dispose()` + `terminal.dispose()` on every panel close.

4. **IPC JSON overhead for binary data** — `emit()` base64-encodes binary, +33-100% overhead. `Channel<Vec<u8>>` sends binary directly. Architecture decision; not fixable late.

5. **Arrow.js cleanup leak** — Tauri `listen()` does NOT auto-stop on Arrow.js unmount. Must manually `unlisten()` → `addon.dispose()` → `terminal.dispose()` in `onCleanup()`. ~17MB GPU leak per orphaned terminal.

6. **tmux race on attach** — `attach-session` races shell init. Poll `tmux has-session` before first write. On reopen, validate session exists; show "Session Lost — Relaunch?" if not.

7. **tmux not in PATH** — Not on macOS by default. Probe at startup; check `/opt/homebrew/bin/tmux` and `/usr/local/bin/tmux`. Show `brew install tmux` hint, not a blank terminal.

---

## Phase 2 Spike Required

Two open questions carry HIGH risk if assumed and wrong — verify at Phase 2 start before any production code:

| Question | Risk if wrong | Verification |
|----------|--------------|--------------|
| Does `Channel<Vec<u8>>` transmit binary as-is or base64-encode? | Entire PTY streaming architecture must be redesigned | 5-line Tauri spike: send `vec![0u8, 255u8]`, log JS receipt |
| Does Arrow.js `ref` attribute call the function with the DOM element on mount? | Terminal component mount pattern fails; need custom element wrapper | Minimal Arrow.js component with `ref`, test in WKWebView |

---

## Implications for Roadmap

### Phase 1: Scaffold + Entitlements
**Rationale:** Project structure, CSP, import maps, and entitlements must be correct before any code. Mistakes here cascade into every phase.
**Delivers:** Tauri 2 project, 3-zone CSS layout (placeholder divs), Arrow.js vendored + import map, split handle drag, sidebar collapse, entitlements locked (no sandbox).
**Avoids:** ESM CORS pitfall (vendor locally), App Sandbox pitfall (lock entitlements now).

### Phase 2: Terminal Integration — CRITICAL PATH
**Rationale:** The PTY→Channel→xterm.js pipeline is the hardest technical problem and a hard dependency for every later phase.
**Delivers:** portable-pty in Rust, `Channel<Vec<u8>>` streaming, `session_create / session_attach / session_write / session_resize` commands, xterm.js 6.0 with WebGL (+ canvas fallback), FitAddon + ResizeObserver + debounced resize, watermark flow control, WebGL context-loss handling, tmux startup probe, session naming convention.
**Spike first:** Verify binary Channel encoding and Arrow.js `ref` mount pattern before writing production code.
**Research flag: Needs `/gsd-research-phase`** — highest unknowns of any phase.

### Phase 3: Theme System
**Rationale:** Isolated and low-risk; parallelizable after Phase 2.
**Delivers:** `theme.json` schema + serde load, `notify` watcher, hot-reload xterm.js theme objects, initial GSD green theme.

### Phase 4: Session Persistence
**Rationale:** Core product promise (Claude Code survives app close) requires state save/restore. Depends on session model from Phase 2.
**Delivers:** Full `AppState` serde schema with migration, `state_save` / `state_load`, on-close detach + on-open reattach, dead session UI.
**Avoids:** Stale session ID pitfall, corrupted state.json pitfall.

### Phase 5: Project System + Sidebar
**Rationale:** Multi-project workflow requires persisted project list (Phase 4) and session infrastructure (Phase 2).
**Delivers:** `ProjectConfig` model, project switcher (all panels update atomically), sidebar Arrow.js component, git2 branch/dirty-status badge.
**Avoids:** Session name collision, deleted project path crash.

### Phase 6: Right Panel Views
**Rationale:** Right panel views are independent of each other; need project paths from Phase 5.
**Delivers:** GSD Markdown viewer (marked.js + checkbox write-back + notify watcher), git diff panel (git2, live), file tree (read-only), right panel tab system.

### Phase 7: Server Pane + Agent Support
**Rationale:** Dev server pane reuses PTY infra from Phase 2; agent binary detection needs project config from Phase 5.
**Delivers:** Collapsible server pane (direct PTY, no tmux), Restart/Stop/Open-in-Browser, `which claude` / `which opencode` resolution with Homebrew PATH fallbacks.

### Phase 8: Polish + Keyboard System
**Rationale:** Keyboard shortcut system needs all panels to exist to verify no conflicts with terminal control sequences.
**Delivers:** No-conflict shortcut set (never intercept Ctrl+C/D/Z/L/R), `attachCustomKeyboardEventHandler` on all xterm.js instances, crash recovery, lazy render (IntersectionObserver), tmux version check + onboarding wizard.

### Phase Ordering Rationale

- Phase 2 is the critical path — nothing else can be validated without a working terminal.
- Phases 3 and 5 have no dependency on each other after Phase 2; either order works.
- Phase 6 right panel views can be prototyped in parallel with Phase 5 as standalone HTML pages.
- Keyboard system is last because shortcut conflicts require all panels to be present.

### Research Flags

**Needs `/gsd-research-phase` before planning:**
- **Phase 2** — binary Channel behavior and Arrow.js `ref` are unverified; wrong assumptions require architectural rewrite.

**Standard patterns, skip research-phase:**
- Phase 1 — Tauri scaffolding is well-documented; import map + CSP config is deterministic.
- Phase 3 — Theme hot-reload via notify + xterm.js theme object is a straightforward pattern.
- Phase 4 — serde state + migration is standard Rust; no novel unknowns.
- Phase 6 — marked.js + checkbox write-back is well-understood; git2 diff API is fully documented.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm/crates.io/GitHub; API patterns from official docs |
| Features | HIGH | Table stakes from xterm.js/Tauri production usage; differentiators from project spec |
| Architecture | MEDIUM-HIGH | Channel + spawn_blocking + tmux CLI verified; Arrow.js `ref` and Channel binary encoding unconfirmed |
| Pitfalls | HIGH | All critical pitfalls backed by confirmed upstream issues/PRs |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **`Channel<Vec<u8>>` binary encoding** — Verify with a spike at Phase 2 start. If base64, restructure with raw IPC approach.
- **Arrow.js `ref` attribute in WKWebView** — Verify against pinned version. Fallback: `<gsd-terminal>` custom element with `connectedCallback`.
- **tmux version on developer machines** — macOS ships tmux 2.9 (Xcode). Homebrew is 3.x. Minimum supported version needs to be documented and checked at startup.
- **FiraCode ligatures** — xterm.js does not support ligatures in any renderer. Accept and document; no workaround attempt.

---

## Sources

### Primary (HIGH confidence)
- https://v2.tauri.app/develop/calling-frontend/ — Channel API, emit/listen distinction
- https://v2.tauri.app/develop/calling-rust/ — invoke + command patterns
- https://github.com/xtermjs/xterm.js/releases/tag/6.0.0 — 6.0 breaking changes
- https://docs.rs/portable-pty/latest/portable_pty/ — PTY API, spawn_blocking pattern
- https://docs.rs/git2/latest/git2/ — status + diff API
- https://arrow-js.com/ — component() is render function, not web component
- https://xtermjs.org/docs/guides/flowcontrol/ — watermark pattern
- https://github.com/microsoft/vscode/pull/279579 — GPU memory leak on terminal dispose

### Secondary (MEDIUM confidence)
- tmux_interface crate docs — confirmed experimental/unstable; CLI approach preferred
- https://forum.babylonjs.com/t/performance-between-safari-and-wkwebview-tauri/60811 — WebGL2 in WKWebView confirmed working

### Tertiary (LOW confidence — verify during implementation)
- tmux control mode (`tmux -C attach`) for sidebar read-only ops — feasibility unverified
- tmux version differences on Xcode-installed vs Homebrew macOS — anecdotal

---

*Research completed: 2026-04-06*
*Ready for roadmap: yes*
