# Phase 2: Terminal Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 02-terminal-integration
**Areas discussed:** PTY ↔ xterm.js pipeline, WebGL/DOM fallback strategy, Flow control behavior, Resize plumbing

---

## PTY ↔ xterm.js pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Startup probe + install prompt | On launch, check `tmux -V`. If missing, show modal with install instructions and block terminal creation | ✓ |
| Auto-install via Homebrew | Automatically run `brew install tmux` in background | |
| Fallback to raw PTY (no tmux) | Spawn shell directly without tmux, lose persistence | |

**User's choice:** Startup probe + install prompt
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Project directory basename | e.g., `efx-mux` — simple, unique per project | ✓ |
| Prefixed name | e.g., `gsd-mux:efx-mux` — namespaced to avoid collision | |
| UUID-based | Random ID stored in state.json — guaranteed unique but opaque | |

**User's choice:** Project directory basename
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| tmux new-session -A | Creates or attaches in one command. Single code path. | ✓ |
| Check + branch | First `tmux has-session`, then attach or new-session based on result | |

**User's choice:** tmux new-session -A
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Inline as first command | Build `spawn_terminal` directly. Production code if Channel works. | ✓ |
| Throwaway spike crate | Separate Rust binary that tests Channel in isolation. Discard after. | |

**User's choice:** Inline as first command
**Notes:** None

---

## WebGL/DOM fallback strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One retry, then DOM | Dispose WebGL, retry once, fall back to DOM permanently if retry fails | ✓ |
| Immediate DOM fallback | Any WebGL context loss immediately switches to DOM | |
| Retry loop with backoff | Up to 3 retries with exponential backoff before DOM fallback | |

**User's choice:** One retry, then DOM
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Silent fallback | No visible indicator. DOM renderer looks identical for most use cases. | ✓ |
| Subtle status badge | Small icon in terminal header showing 'DOM' vs 'WebGL' | |
| One-time toast notification | Brief notification when fallback happens, then dismiss | |

**User's choice:** Silent fallback
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| querySelector after render | `document.querySelector('.terminal-area')` after Arrow.js renders. Eliminates ref spike. | ✓ |
| Arrow.js ref attribute | Use Arrow.js `ref` to capture DOM node reactively. Needs WKWebView spike. | |
| Vanilla container div | Plain `<div id="xterm-container">` in index.html outside Arrow.js | |

**User's choice:** querySelector after render
**Notes:** Eliminates the Arrow.js `ref` WKWebView spike entirely — one fewer risk item.

---

## Flow control behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Transparent pause | PTY read stops, xterm.js renders buffered data, output resumes when drained. No indicator. | ✓ |
| Subtle throttle indicator | Pulsing dot or 'buffering' label during backpressure | |
| Terminal freeze with overlay | Dim terminal with 'Processing heavy output...' overlay | |

**User's choice:** Transparent pause
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Rust side | PTY read loop tracks bytes sent via Channel. Pauses at 400KB. JS sends ACKs. | ✓ |
| JS side | xterm.js tracks buffer size, calls invoke('pause_pty') at threshold | |
| Hybrid | Both Rust and JS can trigger pause | |

**User's choice:** Rust side
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Periodic byte-count ACK | JS calls invoke('ack_bytes', { count }) after processing chunks. Rust resumes at <100KB unacked. | ✓ |
| Simple resume signal | Binary on/off invoke('resume_pty') when JS buffer drops below threshold | |

**User's choice:** Periodic byte-count ACK
**Notes:** None

---

## Resize plumbing

| Option | Description | Selected |
|--------|-------------|----------|
| 150ms trailing debounce | fit() fires instantly, invoke('resize_pty') debounced to reduce IPC | ✓ |
| requestAnimationFrame batching | Queue in rAF, one fit() + invoke() per frame | |
| No debounce | Every resize event immediately calls fit() + invoke() | |

**User's choice:** 150ms trailing debounce
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| PTY only | Resize portable-pty master directly. tmux auto-adapts. | ✓ |
| Both PTY + tmux | Resize PTY AND call `tmux resize-window` | |

**User's choice:** PTY only
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Resize always goes through | Control operation bypasses flow control. Dimensions stay correct regardless. | ✓ |
| Queue until flow resumes | Buffer resize until backpressure clears | |

**User's choice:** Resize always goes through
**Notes:** None

---

## Claude's Discretion

- PTY read loop buffer size
- Channel chunk size / coalescing
- xterm.js Terminal options (scrollback, cursor style)
- tmux default shell and environment
- Error UX for tmux session creation failures

## Deferred Ideas

- tmux session restore on reopen — Phase 4
- Dead tmux session recovery — Phase 4
- Terminal theming — Phase 3
- Multiple terminal instances — Phase 6
