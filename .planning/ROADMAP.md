# Roadmap: GSD MUX

## Overview

GSD MUX goes from zero to a fully functional native macOS terminal multiplexer in 8 phases. Phase 1 locks the Tauri scaffold and macOS entitlements (no going back). Phase 2 is the critical path -- the PTY-to-xterm.js pipeline with flow control that every later phase depends on. Phases 3-6 build out theming, persistence, project management, and right-panel views (3 and 6 are parallelizable after Phase 2). Phase 7 adds server pane and agent launchers. Phase 8 wires the keyboard system and polish once all panels exist.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scaffold + Entitlements** - Tauri 2 init, 3-zone CSS layout, Arrow.js import map, macOS entitlements locked, Cmd+C/V clipboard
- [x] **Phase 2: Terminal Integration** - PTY Channel pipeline, xterm.js 6.0 + WebGL/DOM fallback, tmux session, flow control, resize
- [x] **Phase 3: Terminal Theming** - theme.json schema, iTerm2 importer, hot reload, dark/light toggle
- [x] **Phase 4: Session Persistence** - state.json save/restore, tmux reattach, dead session recovery, corrupted state fallback
- [x] **Phase 5: Project System + Sidebar** - Project registration, sidebar with git badge, project switching, Ctrl+P switcher
- [x] **Phase 6: Right Panel Views** - Tab bar, GSD Markdown viewer with checkbox write-back, git diff viewer, file tree, bash terminal
- [x] **Phase 6.1: Migrate Arrow.js to Preact + Vite + TS + Tailwind 4** (INSERTED) - Replace Arrow.js with Preact + Vite + TypeScript + Tailwind 4
- [ ] **Phase 7: Server Pane + Agent Support** - Server pane with controls, Claude Code / OpenCode launchers, auto-detect fallback
- [ ] **Phase 8: Keyboard + Polish** - App-level shortcut system with terminal pass-through, tab management, crash recovery, first-run wizard

## Phase Details

### Phase 1: Scaffold + Entitlements
**Goal**: User launches the app and sees a styled 3-zone layout with draggable splits, collapsible sidebar, and working Cmd+C/V -- all on a correctly entitled macOS binary that will never hit sandbox errors
**Depends on**: Nothing (first phase)
**Requirements**: LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAYOUT-05
**Success Criteria** (what must be TRUE):
  1. User launches the app and sees a 3-zone layout (sidebar + main panel + right split) filling the window
  2. User can drag split handles between zones and the ratios persist after app restart
  3. User can collapse/expand the sidebar with Ctrl+B (toggles between 40px icon strip and 200px full)
  4. User can Cmd+C to copy and Cmd+V to paste text in any panel
  5. App chrome uses the forest-green dark palette with FiraCode Light 14 font throughout
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold + Arrow.js vendor + theme/layout CSS + index.html
- [x] 01-02-PLAN.md — Arrow.js panel components (sidebar, main-panel, right-panel) + main.js mount
- [x] 01-03-PLAN.md — Drag manager (all 3 handles) + localStorage persistence
- [x] 01-04-PLAN.md — Tauri clipboard menu (Rust) + Entitlements.plist + tauri.conf.json + UAT
**UI hint**: yes

### Phase 2: Terminal Integration
**Goal**: User sees a real, responsive terminal in the main panel connected to a live tmux session -- with GPU-accelerated rendering, correct resize behavior, and flow control that prevents buffer overflow during heavy AI output
**Depends on**: Phase 1
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06
**Success Criteria** (what must be TRUE):
  1. User types commands in the main panel terminal and sees real-time output from a PTY process running inside tmux
  2. Terminal renders with WebGL; if WebGL context is lost, it falls back to DOM renderer without user intervention
  3. User closes the app, waits 10 seconds, reopens -- the tmux session is still alive and reattachable
  4. During heavy output (e.g., `cat /dev/urandom | xxd`), terminal remains responsive and no output is silently dropped (flow control pauses PTY reads at 400KB watermark)
  5. User drags the panel split handle and terminal content reflows correctly to the new dimensions without corruption
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md — Rust PTY backend (portable-pty + Tauri commands + flow control + tmux probe)
- [x] 02-02-PLAN.md — Vendor xterm.js 6.0 + terminal-manager.js + pty-bridge.js modules
- [x] 02-03-PLAN.md — Wire terminal into UI (main-panel + resize handler + main.js init) + UAT

### Phase 3: Terminal Theming
**Goal**: User can fully customize terminal appearance via a theme.json file, import their existing iTerm2 theme, and see changes applied instantly without restarting
**Depends on**: Phase 2
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04
**Success Criteria** (what must be TRUE):
  1. User edits `~/.config/efxmux/theme.json` and all xterm.js terminals apply the new colors/font on load
  2. User drops an iTerm2 `.json` export and it is converted to theme.json format automatically
  3. User saves changes to theme.json while the app is running and all terminals hot-reload the new theme within 1 second
  4. User can toggle app chrome between dark (Solarized Dark) and light mode; the preference persists across restarts
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Rust theme module (types, load/save, config dir, file watcher)
- [x] 03-02-PLAN.md — JS theme manager + dark/light CSS + terminal-manager update
- [x] 03-03-PLAN.md — iTerm2 importer + UAT checkpoint
**UI hint**: yes

### Phase 4: Session Persistence
**Goal**: User can close and reopen the app and find their exact workspace restored -- same layout, same tabs, same tmux sessions reattached -- with graceful handling of edge cases
**Depends on**: Phase 2
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04
**Success Criteria** (what must be TRUE):
  1. User closes the app; split ratios, active tabs, session IDs, and active project are saved to `~/.config/gsd-mux/state.json`
  2. User reopens the app; layout is restored exactly and all tmux sessions are reattached with their running processes
  3. If a saved tmux session no longer exists (daemon died), user sees a warning and a fresh session is created automatically
  4. If state.json is missing or corrupted, app starts with default layout and logs a warning (no crash)
**Plans**: 4 plans
Plans:
- [x] 04-01-PLAN.md -- Rust state persistence layer (state.json types, load/save commands, extend theme watcher)
- [x] 04-02-PLAN.md -- JS integration (beforeunload wiring, migrate drag-manager + theme-manager to state.json, session reattach + dead session recovery)
- [x] 04-03-PLAN.md -- Gap closure: fix version default bug (CR-01) + add Rust-side close handler (WR-03)
- [x] 04-04-PLAN.md -- UAT gap closure: fix theme persistence on restart + OS theme listener unblocking

### Phase 5: Project System + Sidebar
**Goal**: User can register multiple project directories and switch between them -- each switch atomically updates the terminal session, sidebar git status, and all panel content
**Depends on**: Phase 2, Phase 4
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, SIDE-01, SIDE-02
**Success Criteria** (what must be TRUE):
  1. User can register a project (path, name, agent, gsd_file, server_cmd) and see it in the sidebar
  2. Sidebar shows the active project highlighted with its current git branch and file change counts (modified/staged/untracked)
  3. User switches project and the tmux session, git status, GSD viewer, and file tree all update to the new project
  4. User presses Ctrl+P, types a project name, and switches to it via fuzzy search
  5. User clicks a changed file in the sidebar git section and its diff opens in the right panel

**Plans**: 2 plans
Plans:
- [x] 06-01-PLAN.md -- Wave 1: PtyManager HashMap refactor, new Rust commands, .md file watcher
- [x] 06-02-PLAN.md -- Wave 2: Tab bars, GSD Viewer, Diff Viewer, File Tree, Bash Terminal wiring

**UI hint**: yes

### Phase 6: Right Panel Views
**Goal**: User has a fully functional right panel with tabbed views for GSD plan tracking, git diffs, file browsing, and an independent bash terminal -- with live file watching and checkbox write-back
**Depends on**: Phase 2, Phase 5
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06, PANEL-07
**Success Criteria** (what must be TRUE):
  1. Right panels have independent tab bars; user can switch between GSD Viewer, Diff Viewer, File Tree, and Bash Terminal per panel
  2. User views PLAN.md in the GSD Viewer with rendered progress bars and checkboxes; checking a checkbox writes the change back to the .md file on disk
  3. When the watched .md file changes on disk (e.g., Claude Code updates it), the GSD Viewer auto-refreshes within 1 second
  4. User can view syntax-highlighted unified diffs from git2 -- full-repo or per-file
  5. User can navigate the project file tree with keyboard (arrows + Enter) and clicking a file opens it as a read-only tab in the main panel
  6. User can open a Bash Terminal tab in the right panel connected to an independent tmux session

**Plans**: 6 plans
Plans:
- [x] 06-01-PLAN.md -- Wave 1: PtyManager HashMap refactor, new Rust commands, .md file watcher
- [x] 06-02-PLAN.md -- Wave 2: Tab bars, GSD Viewer, Diff Viewer, File Tree, Bash Terminal wiring
- [x] 06-03-PLAN.md -- Wave 3: Gap closure: wire md file watcher activation + file-opened handler
- [x] 06-04-PLAN.md -- UAT gap closure: fix Add Project persistence + Bash terminal ref bug
- [x] 06-05-PLAN.md -- UAT gap closure: fix GSD Viewer loading, sidebar git files, file tree root guard, bash resize
- [x] 06-06-PLAN.md -- Gap closure: fix diff-viewer.js Arrow.js ref bug (PANEL-04)

**UI hint**: yes

### Phase 6.1: Migrate Arrow.js to Preact + Vite + TypeScript + Tailwind 4 (INSERTED)
**Goal**: Replace Arrow.js with Preact + Vite + TypeScript + Tailwind 4 to eliminate reactive template bugs and modernize the frontend toolchain
**Depends on**: Phase 6
**Requirements**: All existing UI behavior must be preserved — same layout, same reactivity, same look
**Success Criteria** (what must be TRUE):
  1. All Arrow.js `reactive()` + `html` templates are replaced with Preact components using `htm` tagged templates
  2. No build step required — Preact + htm loaded via ESM import map (same pattern as current Arrow.js vendor)
  3. All sidebar, modal, fuzzy-search, right-panel, and main-panel components render correctly
  4. No `(el) => renderTemplate(template, el)` or similar template leak text anywhere in the UI
  5. Conditional rendering (`{condition && <Component/>}`) works without the `() =>` reactive wrapper footgun
**Plans**: 6 plans
Plans:
- [x] 06.1-01-PLAN.md -- Vite + Preact + Tailwind scaffold (config, app.css, index.html)
- [x] 06.1-02-PLAN.md -- State manager signals + utility module TS conversions
- [x] 06.1-03-PLAN.md -- Simple components (tab-bar, main-panel, diff-viewer, gsd-viewer, file-tree)
- [x] 06.1-04-PLAN.md -- Complex components (sidebar, project-modal, fuzzy-search, right-panel)
- [x] 06.1-05-PLAN.md -- main.tsx wiring + cleanup + UAT
- [x] 06.1-06-PLAN.md -- UAT gap closure: layout CSS, drag resize, modal + tab styling
**UI hint**: yes

### Phase 7: Server Pane + Agent Support
**Goal**: User can manage a dev server from a collapsible pane and launch Claude Code or OpenCode as native PTY processes -- no wrapping, no protocol hacks, just the raw binary in tmux
**Depends on**: Phase 2, Phase 5
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06
**Success Criteria** (what must be TRUE):
  1. Main panel has a collapsible server pane (bottom split, Ctrl+` toggle) showing a running dev server process
  2. User can click Open in Browser to launch the dev server URL in the system default browser
  3. User can Restart or Stop the server process from the pane controls
  4. App detects and launches `claude` or `opencode` binary directly in a tmux PTY (verified: no wrapping or protocol modification)
  5. If neither agent binary is found, app falls back to a plain bash session with a banner explaining the situation

**Plans**: 9 plans
Plans:
- [x] 07-01-PLAN.md -- Rust server process manager + frontend bridge modules
- [x] 07-02-PLAN.md -- Server pane UI component + agent detection + Ctrl+` handler
- [x] 07-03-PLAN.md -- Gap closure: install plugin-opener + agent detection on project switch
- [x] 07-04-PLAN.md -- UAT gap closure: ANSI colors, clean SIGTERM stop, restart toolbar race
- [x] 07-05-PLAN.md -- UAT gap closure: workspace isolation, clear button, project name, waitpid fix
- [x] 07-06-PLAN.md -- UAT gap closure: per-project server HashMap, reliable kill, close-all
- [x] 07-07-PLAN.md -- UAT gap closure: ANSI color visibility, auto-scroll, full project name
- [ ] 07-08-PLAN.md -- UAT gap closure: 2-state toggle, ANSI line buffering, project name truncate
- [x] 07-09-PLAN.md -- UAT gap closure: kill servers on Cmd+Q via RunEvent::ExitRequested
- [ ] 07-08-PLAN.md -- UAT gap closure: 2-state toggle, ANSI line buffering, project name truncate
- [ ] 07-09-PLAN.md -- UAT gap closure: kill servers on Cmd+Q via RunEvent::ExitRequested

**UI hint**: yes

### Phase 8: Keyboard + Polish
**Goal**: User has a complete, conflict-free keyboard shortcut system and a polished first-run experience -- the app handles crashes gracefully and never eats terminal control sequences
**Depends on**: All previous phases
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. App-level shortcuts (Ctrl+B, Ctrl+P, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Q) work without intercepting terminal control sequences (Ctrl+C/D/Z/L/R pass through to PTY when terminal is focused)
  2. User can open a new tab with Ctrl+T, close active tab with Ctrl+W, and cycle tabs with Ctrl+Tab
  3. When a PTY process crashes, user sees a banner with a "Restart Session" option (no blank panel)
  4. First-run wizard prompts user to add their first project and choose a default agent

**Plans**: 2 plans
Plans:
- [x] 06-01-PLAN.md -- Wave 1: PtyManager HashMap refactor, new Rust commands, .md file watcher
- [x] 06-02-PLAN.md -- Wave 2: Tab bars, GSD Viewer, Diff Viewer, File Tree, Bash Terminal wiring

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order. Note: Phases 3 and 6 are parallelizable after Phase 2 completes (no dependency on each other).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold + Entitlements | 4/4 | Complete | 2026-04-06 |
| 2. Terminal Integration | 3/3 | Complete | 2026-04-07 |
| 3. Terminal Theming | 3/3 | Complete | 2026-04-07 |
| 4. Session Persistence | 4/4 | Complete | 2026-04-07 |
| 5. Project System + Sidebar | 2/2 | Complete | 2026-04-07 |
| 6. Right Panel Views | 7/7 | Complete | 2026-04-08 |
| 6.1 Migrate Arrow.js -> Preact | 6/6 | Complete | 2026-04-08 |
| 7. Server Pane + Agent Support | 7/9 | In Progress | - |
| 8. Keyboard + Polish | 0/TBD | Not started | - |

### Phase 9: Rich Dashboard Views — Parse STATE.md and ROADMAP.md as structured data, render as designed Preact dashboard with progress bars, phase cards, status badges, decision logs

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 9 to break down)
