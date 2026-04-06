# Features Research — GSD⚡MUX

**Domain:** Native desktop terminal multiplexer for AI-assisted development
**Researched:** 2026-04-06
**Confidence:** MEDIUM-HIGH (combination of verified xterm.js docs, community issue tracking, and current developer discourse)

---

## Table Stakes (must have or it feels broken)

- [ ] **Real keyboard input with no perceptible lag** — Input lag is the single fastest way to make a terminal feel broken. Users switching from Ghostty/iTerm2/Warp will feel even 20ms delay immediately. xterm.js with WebGL + Tauri's PTY must be benchmarked and tuned. [HIGH confidence — consistent across all terminal benchmarks]

- [ ] **Correct ANSI / VT100 escape code handling** — Claude Code uses rich terminal output (progress bars, color highlights, cursor positioning). Any escape-code regression is a hard blocker. xterm.js covers this well but the integration layer (PTY → IPC → xterm.js) must not drop or mangle bytes. [HIGH confidence — VS Code production reference]

- [ ] **System clipboard: Cmd+C / Cmd+V work as expected** — This is a known pain point in Tauri webviews (GitHub issue #2397: Cmd+C/V do not work by default in Tauri webview on macOS). Must be explicitly wired at the Tauri menu-bar level. tmux adds another layer: OSC 52 or `reattach-to-user-namespace` is required for copy from within tmux copy-mode to reach the macOS pasteboard. Both layers must be solved. [HIGH confidence — confirmed Tauri bug report + tmux macOS clipboard docs]

- [ ] **Mouse support passthrough** — Claude Code and many CLI tools use mouse events (click to position cursor, scroll). The PTY → xterm.js chain must pass mouse escape sequences through without consumption at the Tauri/webview layer. [MEDIUM confidence — known xterm.js requirement, Tauri interaction unverified]

- [ ] **Scrollback that doesn't lose history** — Default tmux scrollback is 2000 lines; Claude Code sessions can produce large output during file operations or long compiles. Needs configuration to 10,000–50,000 lines minimum. Performance impact is virtual-memory paged at this scale; acceptable on modern macOS hardware. [HIGH confidence — widely documented]

- [ ] **Resize without corruption** — When panels are dragged to resize, the PTY must send correct SIGWINCH to the running process and xterm.js must reflow. Claude Code actively uses terminal width for its output formatting. [MEDIUM confidence — standard PTY requirement, well understood]

- [ ] **Persistent sessions across app restart** — The entire value of the tmux backend is that Claude Code keeps running when the app window closes. If reattach on reopen is flaky or shows a corrupted screen, the core promise is broken. [HIGH confidence — core project requirement, tmux session resurrection is well-proven]

- [ ] **Tab/focus navigation without accidental key interception** — Ctrl+B is tmux's prefix, Ctrl+C sends SIGINT, Ctrl+D sends EOF. GSD⚡MUX must not intercept these. Any app-level shortcut must avoid the full set of tmux and shell control sequences. [HIGH confidence — tmux/Tauri keyboard conflict is documented]

- [ ] **Visible cursor with correct shape** — Block/beam/underline cursor based on application mode. Claude Code changes cursor mode during input. A missing or wrong cursor shape degrades UX immediately. [MEDIUM confidence — xterm.js renders cursor shapes correctly; integration layer must not suppress]

- [ ] **Bell handling** — Either visual bell (flash) or audio bell. Claude Code and many CLIs use BEL to signal completion. Silent drops with no indication feel like freezes. [LOW-MEDIUM confidence — quality-of-life but consistently mentioned in terminal emulator reviews]

---

## Differentiators (what makes GSD⚡MUX unique)

- [ ] **GSD Markdown panel with live write-back** — Click a checkbox in the PLAN.md viewer → the file is updated on disk → file watcher triggers → Claude Code sees the change in its next read. This creates a bidirectional loop between the developer's intent (the plan) and the AI agent executing it. No other terminal provides this. Unique to the GSD workflow. [HIGH confidence — novel feature, no competing product has this]

- [ ] **Persistent layout tied to the project, not the shell session** — Every terminal multiplexer gives you pane splits. GSD⚡MUX gives you a named project workspace: open Project A → see PLAN.md for Project A + git diff for Project A + the specific tmux session for Project A. Switching projects is atomic — all panels update together. [HIGH confidence — differentiator vs tmux, iTerm2, Warp]

- [ ] **AI agent launcher with zero wrapping** — Claude Code and OpenCode are spawned directly as PTY processes in tmux. No proxy, no protocol shim, no API key injection. The binary runs as-is, with full color and interactivity. This matters because Warp's AI features are proprietary and intercept the shell; GSD⚡MUX treats the AI agent as a first-class terminal citizen. [HIGH confidence — deliberate architectural constraint from PROJECT.md]

- [ ] **Git diff panel co-located with the agent terminal** — Seeing what the AI changed in real time, without Alt-Tab to a separate diff tool or running `git diff` manually, is a workflow accelerator. Powered by git2 Rust crate (no shelling out = no latency spike, no PATH issues). [MEDIUM confidence — no competing terminal does this natively]

- [ ] **Collapsible server pane with process lifecycle controls** — For web developers running Claude Code on a project with a dev server, having Open/Restart/Stop in the same window as the AI agent terminal removes a constant context switch. The specific bottom-split layout for this is opinionated UX nobody else provides. [MEDIUM confidence — observed pain point in AI coding workflows]

- [ ] **Hot-reloadable theme from `~/.config/gsd-mux/theme.json`** — Change the theme file → the app re-themes live, including the xterm.js color scheme. Useful for matching the terminal to the project's visual identity or time-of-day preferences without restarting. [LOW-MEDIUM confidence — feature, not a killer differentiator, but notable polish]

- [ ] **File tree that doesn't need a separate editor open** — Lightweight read-only file tree in the right panel. Not a replacement for an editor, but useful for navigating Claude Code's output without leaving the workspace. [LOW confidence — exists in many tools, GSD⚡MUX's version is contextual to the active project]

---

## Anti-Features (deliberately NOT building in v1)

- ~~**Built-in text editor**~~ — The entire point of the tool is to work alongside $EDITOR, not replace it. Adding an editor adds 3+ phases of scope and competes with tools that have 10-year head starts. Files open in $EDITOR via xterm.js.

- ~~**Multi-window support**~~ — Multiplies state complexity, breaks the single-workspace mental model, and defers the core loop. Explicitly out of scope in PROJECT.md.

- ~~**AI command suggestions / natural language shell**~~ — Warp does this well; GSD⚡MUX is about running Claude Code, not replacing it with a weaker inline AI. Adding NLP shell features would distract from the markdown write-back and project-switching differentiators.

- ~~**Windows/Linux support**~~ — macOS-first means Metal GPU path, macOS-specific clipboard (pbcopy/pbpaste), and FiraCode rendering assumptions. Cross-platform support before the core is solid adds test surface with zero user benefit.

- ~~**Cloud sync / team sharing**~~ — Warp's biggest feature is team collaboration and link sharing. That's Warp's market. GSD⚡MUX is a solo developer tool. Cloud sync adds auth, backend infrastructure, privacy surface, and ongoing ops cost — all wrong for v1.

- ~~**Tab bar / multiple terminal tabs**~~ — tmux windows handle this. Adding a native tab bar above xterm.js duplicates tmux's job and adds UI complexity. Users who want tabs should use tmux windows within the main terminal pane.

- ~~**Plugin system**~~ — Premature abstraction. Build the core tight. Plugin systems add API design burden before knowing what the stable surface is.

- ~~**SSH session management**~~ — Out of scope. tmux handles remote sessions naturally; GSD⚡MUX does not need to know about SSH.

- ~~**Notification system / webhooks**~~ — Push notifications for AI agent completion are interesting but require daemon processes, permissions, and reliability engineering not appropriate for v1.

---

## User Pain Points (from terminal AI tool users)

**Context loss between Claude Code sessions**
Claude Code loses all accumulated context when a session ends. Context rebuild takes 10-15 minutes. Developers have built ad-hoc CLAUDE.md handoff files, session managers, and "campaign files" as workarounds (GitHub issue #18417, #2954, community posts). GSD⚡MUX addresses this partially: by keeping Claude Code running in tmux across app restarts, the session itself (and its scrollback) survives. The AI context window still resets per session — GSD⚡MUX cannot fix that, but the PLAN.md write-back loop provides a persistent external context anchor that Claude Code reads on resume.

**Context switching tax: terminal → editor → browser → back**
Every switch breaks concentration. Developers using Claude Code bounce between the terminal (where the agent runs), the editor (to review changes), and the browser (to read docs or test). GSD⚡MUX co-locates the terminal, git diff, file tree, and planning doc in one window. It does not fully solve the browser context switch but eliminates the editor-for-diff and editor-for-plan switches.

**No visibility into what the AI agent changed**
Claude Code makes file changes that are hard to track without running `git diff` after every turn. The integrated git diff panel in GSD⚡MUX solves this directly — the diff updates live as changes land.

**PLAN.md lives in the editor, not next to the terminal**
The Manus-style planning workflow (markdown task lists tracked and updated by the AI agent) requires the plan to be visible while the agent runs. Opening it in an editor means it competes for screen real estate. The GSD panel gives the plan its own dedicated space.

**AI agent output is verbose and hard to scan**
Claude Code produces long, richly formatted output. The main terminal pane being 50% of the window width (vs a small split) is the right answer — large AI agent output needs room. Cramming it into a 25% pane would make the tool feel worse than a plain terminal.

**Keyboard shortcut muscle memory conflicts**
Developers switching from iTerm2 (Cmd+D to split, Cmd+W to close) or Warp find new shortcut sets jarring. GSD⚡MUX must document its shortcut set clearly and avoid conflicting with the most common macOS shortcuts. Ctrl+B being the tmux prefix means app-level shortcuts cannot use Ctrl+B.

**Slow xterm.js startup / white-flash on terminal mount**
A visible flash or delay when the terminal first renders (before WebGL context is initialized) makes the app feel cheap. Canvas or DOM fallback rendering while WebGL loads is ugly. The WebGL addon should be loaded eagerly and the terminal should appear fully rendered on first paint.

---

## Rendering Performance Notes

**What makes terminals feel fast**

- **GPU path active at all times**: xterm.js with `@xterm/addon-webgl` uses a Float32Array uploaded to the GPU each frame. This scales well with large viewports and high-frequency output (Claude Code's streaming responses). Without WebGL, heavy output visibly stutters.
- **WriteBuffer + render debouncing**: xterm.js batches writes to avoid per-byte redraws. When Claude Code streams thousands of characters per second, this batching is what keeps the GPU from being thrashed. Must not be disabled.
- **Texture atlas strategy**: xterm.js 5.x uses a multi-row packing strategy for the GPU texture atlas. Exhausting the atlas causes a reset that causes a visible flash. Do not use rare/exotic Unicode glyphs heavily in app chrome — they pollute the atlas.
- **Input echo latency**: The chain is: keypress → Tauri IPC → PTY write → process echoes → PTY read → Tauri IPC → xterm.js write → GPU render. Any synchronous lock in the IPC bridge bloats this. Must use async channels throughout.
- **Terminal width**: Wide terminals (full-screen) with small font sizes stress the atlas more. The 50% width main pane is a sensible default that keeps cell count manageable.

**What makes terminals feel slow**

- **DOM renderer**: xterm.js DOM renderer is correct but slow. One div per cell. Do not use it as a fallback — use Canvas as the fallback, WebGL as primary.
- **Ligature rendering in xterm.js**: Ligatures force CoreText instead of Core Graphics. CoreText is measurably slower. FiraCode Light is the specified font. Decision required: enable ligatures (nicer code output, slower render) or disable (faster, still looks good). Recommendation: disable ligatures in the terminal pane, keep them in the Markdown panel where output is static. [MEDIUM confidence — iTerm2 docs confirm, xterm.js behavior same]
- **Scrollback thrash with very high line counts**: 50,000+ lines in a single pane can cause scrollbar repaints to feel laggy on scroll. Keep default at 10,000; let users increase via config.
- **Blocking IPC**: If Tauri commands are invoked synchronously from the render thread on every PTY byte, the webview will stutter. PTY data must flow through an async event stream, not synchronous invoke/response pairs.
- **Canvas size mismatches**: xterm.js issue #4175 — very wide containers cause poor performance due to canvas size limits. The 50% main pane layout helps here, but resizing to full-screen must be tested.

**xterm.js vs alternatives for this use case**

xterm.js is the correct choice for GSD⚡MUX. It is production-proven in VS Code (tens of millions of users), has an active maintenance team, supports the WebGL addon, and handles all VT/ANSI sequences that Claude Code relies on. The alternative (building a custom terminal renderer or using a native view) would add months of work for marginal gain. Ghostty and Alacritty are faster for raw throughput but are not embeddable in a Tauri webview. [HIGH confidence — xterm.js is the only practical embeddable option with this feature set]

---

## Feature Dependencies

```
tmux session backend
  → session persistence across app restart
  → multi-project session switching
  → process survival (server pane lifecycle)

xterm.js WebGL
  → correct ANSI rendering (Claude Code output)
  → keyboard input passthrough
  → mouse passthrough

macOS clipboard bridge (Tauri menu + OSC52 + tmux config)
  → Cmd+C / Cmd+V in terminal pane
  → copy from tmux copy-mode to pasteboard

file watcher (notify crate)
  → GSD Markdown panel auto-refresh
  → hot-reload theme.json

GSD Markdown panel
  → write-back checkboxes
  → file watcher (auto-refresh)

git2 crate
  → git diff panel (live refresh)
```

---

## MVP Feature Priority

**Must ship in Phase 1 (core terminal loop):**
1. xterm.js with WebGL rendering, PTY wired to tmux
2. Correct Cmd+C / Cmd+V (requires Tauri menu + OSC52 solution)
3. Keyboard input with no noticeable lag (benchmark against iTerm2)
4. Session persistence: close → reopen → reattach

**Must ship before public use:**
5. GSD Markdown panel with write-back checkboxes
6. Git diff panel (live)
7. Project switcher (sidebar)
8. Resize handles with SIGWINCH

**Can defer past initial dogfooding:**
9. File tree panel
10. Hot-reload theme
11. Server pane lifecycle controls (Open/Restart/Stop)
12. Dark/light app chrome toggle

---

## Sources

- xterm.js GitHub + addon-webgl README: https://github.com/xtermjs/xterm.js
- xterm.js performance issue #4175 (wide containers): https://github.com/xtermjs/xterm.js/issues/4175
- xterm.js 60fps issue #1459: https://github.com/xtermjs/xterm.js/issues/1459
- Tauri copy/paste macOS issue #2397: https://github.com/tauri-apps/tauri/issues/2397
- Claude Code context persistence issue #18417: https://github.com/anthropics/claude-code/issues/18417
- Claude Code session memory loss issue #2954: https://github.com/anthropics/claude-code/issues/2954
- tmux clipboard OSC52 + macOS: https://www.freecodecamp.org/news/tmux-in-practice-integration-with-system-clipboard-bcd72c62ff7b/
- iTerm2 ligature performance note: https://iterm2.com/3.4/documentation-preferences-profiles-text.html
- Ghostty performance discussion: https://github.com/ghostty-org/ghostty/discussions/4837
- Warp terminal features 2025: https://www.warp.dev/all-features
- Planning with markdown files pattern: https://github.com/othmanadi/planning-with-files
- tmux scrollback performance: https://tmuxai.dev/tmux-increase-scrollback/
