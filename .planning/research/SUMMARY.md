# Project Research Summary

**Project:** Efxmux v0.3.0 — Workspace Evolution
**Domain:** Native macOS terminal multiplexer with integrated file editing and git control
**Researched:** 2026-04-14
**Confidence:** HIGH

## Executive Summary

Efxmux v0.3.0 is a workspace evolution of a validated Tauri 2 + Preact + xterm.js 6.0 desktop application. The existing stack (Phases 1-7) provides a solid foundation: PTY management, git status reading, file watching, and a multi-panel UI with working tab bars. This milestone adds three major capability groups — editable file tabs (CodeMirror 6), a git control pane with staging/commit/push, and file tree enhancements (delete, drag/drop, Finder integration). All additions extend existing infrastructure rather than replacing it; no architectural pivots are required.

The recommended approach is additive extension with disciplined separation of concerns. CodeMirror 6 is the clear editor choice over Monaco: ~150KB versus 2MB+ bundle, Vite-native, Preact-compatible, no WebGL conflicts with xterm.js. The existing git2 crate handles staging and commit natively; push should fall back to a PTY shell-out for v0.3.0 due to credential complexity. The sidebar evolves to a 3-tab structure (Projects, File Tree, Git Control) with a new `sidebarActiveTab` signal driving conditional rendering — a clean, low-risk pattern already proven in the right panel.

The highest-risk area is git push authentication. libgit2 does not automatically use the macOS SSH agent or Keychain — a credential callback chain is mandatory, and this must be designed upfront. Commit signing (GPG or SSH) is unsupported by libgit2; commits created in Efxmux will be unsigned and this must be communicated to users before the first commit. File watcher reliability (atomic saves from external editors) and watcher thread accumulation on project switch are existing architectural debts that must be resolved before adding new file editing features — otherwise new features will exhibit the same stale-state bugs that currently affect the MD watcher.

## Key Findings

### Recommended Stack

The existing stack requires minimal additions. CodeMirror 6 (`codemirror@6.0.2` + language packs) is the right editor choice and integrates directly with Preact via DOM ref. The `@tauri-apps/plugin-fs` official plugin handles file delete/copy/move with proper macOS permission scopes, consistent with the existing plugin pattern (`plugin-dialog`, `plugin-opener`). The existing `git2@0.20.4` crate covers all staging and commit operations with no new dependencies; drag/drop uses the HTML5 native API and Tauri's built-in file drop events (zero bundle cost); custom scrollbars are pure CSS targeting webkit selectors that WKWebView on macOS supports fully.

**Core technology additions:**
- `codemirror@6.0.2` + language packs: in-app file editor — lightweight (~150KB), Vite-native, no WebGL conflicts with xterm.js
- `@tauri-apps/plugin-fs@2.2.0` + `tauri-plugin-fs@2` (Rust): file delete/copy/move — official plugin with permission scope handling
- `git2@0.20.4` (extend existing): stage, unstage, commit via `Index::add_path`, `Repository::commit` — no new crate needed
- HTML5 Drag and Drop API (native): file tree reordering — zero bundle, DOM events via Preact `onDragStart`/`onDrop` props
- Tauri built-in drag drop events: Finder-to-tree file drops — `tauri://drag-drop` event listener
- CSS webkit scrollbar selectors: custom terminal and panel scrollbars — WKWebView compatible, zero bundle cost

**What to avoid:**
- Monaco Editor: 2MB+ bundle, React-centric, WebGL conflicts with xterm.js, overkill for basic editing
- Native git2 push for v0.3.0: SSH/HTTPS credential handling is complex; shell out via PTY instead
- SortableJS or dnd-kit: unnecessary weight for a simple file tree; HTML5 native API is sufficient
- JavaScript scrollbar libraries: CSS-only approach works in WKWebView

### Expected Features

Research confirms strong alignment between user expectations (table stakes) and the planned v0.3.0 feature set. Every planned feature maps to an established pattern from VS Code, Zed, or GitHub Desktop.

**Must have for v0.3.0 launch (P1):**
- File editing in tabs with unsaved indicator and Cmd+S save — every IDE has this; double-click to edit is the universal mental model
- Tab close with unsaved changes warning — losing work is catastrophic UX, universal pattern
- Git staging checkboxes per file + Stage All — VS Code, GitKraken, GitHub Desktop all use this model
- Git commit with message input and empty-message validation — cannot commit without a message
- Accordion diff per file (expand/collapse) — GitHub, GitLab, VS Code all use this; users expect it
- File tree delete with confirmation dialog — destructive action requires confirmation
- Open file in external editor — forcing built-in editor for complex work is hostile to power users
- GSD sub-tabs (Milestones, Phases, Progress from ROADMAP.md + STATE.md) — unique Efxmux differentiator
- Sidebar 3-tab structure (Projects, File Tree, Git Control) — prerequisite for git control pane

**Should have — v0.3.x patches (P2):**
- Git push button — add after commit is stable; requires auth testing
- Tab reordering via drag — standard in browsers and VS Code
- Internal drag/drop in file tree — add after delete is reliable

**Defer to v0.4+ (P3):**
- Finder drag-to-tree — complex; add after internal drag is stable
- Per-hunk staging — power feature; Zed took months to build this correctly
- AI-generated commit messages — requires LLM integration beyond current agent spawn
- Interleaved staged/unstaged diff (Zed-style) — complex UI; not essential for v0.3

**Anti-features — do not build:**
- Monaco or full VS Code editor embedding: 50MB+, WebGL conflicts, complexity explosion
- Auto-save: dangerous with code; conflicts with git workflow; explicit Cmd+S only
- Real-time collaborative editing: not applicable to a single-user tool
- Git graph visualization: marginal daily-workflow value; VS Code extensions already exist

### Architecture Approach

v0.3.0 is entirely additive within the existing component structure. The sidebar gains a `sidebarActiveTab` signal and conditional rendering. The main panel adds `fileTabs` and `gitChangesTabs` signal arrays alongside the existing `terminalTabs`, all rendered by a shared TabBar but with distinct lifecycle management. Five new Rust commands land in existing modules (`write_file_content`, `delete_file`, `move_file`, `copy_file`, `create_file` in `file_ops.rs`; `stage_file`, `unstage_file`, `stage_all`, `commit`, `push` in `git_status.rs`). Five new frontend components are created: `git-control.tsx`, `file-tab.tsx`, `git-changes-tab.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`.

**Major components and their v0.3.0 responsibilities:**
1. `sidebar.tsx` (modify) — gains tab switcher, hosts File Tree and Git Control as conditional renders
2. `git-control.tsx` (new) — staging checkboxes, commit message input, push button; all git write operations
3. `file-tab.tsx` (new) — CodeMirror 6 editor wrapper, dirty state tracking, Cmd+S save, mtime conflict detection
4. `git-changes-tab.tsx` (new) — accordion diff viewer, lazy-load diffs on accordion expand
5. `context-menu.tsx` + `dropdown-menu.tsx` (new) — reusable UI primitives consumed by multiple features
6. `file_ops.rs` (extend) — write_file_content, delete_file, move_file, copy_file, create_file
7. `git_status.rs` (extend) — stage_file, unstage_file, stage_all, commit, push

**Key patterns to follow:**
- Separate signal arrays per tab type (terminal, file, git-changes): different lifecycle requires separate state
- Centralize IPC calls in service modules (`git-service.ts`, `file-service.ts`): avoid scattered `invoke()` in components
- Serialize all git2 operations through a single `Arc<Mutex<Repository>>` or semaphore: prevents index lock conflicts
- Use Preact's `onDragStart`/`onDrop` props (not `addEventListener`): compatible with VDOM, avoids cleanup leaks
- Refresh git status reactively after git operations and on file watcher events: never poll with `setInterval`

### Critical Pitfalls

1. **git2 push requires explicit credential callback — SSH agent is not automatic.** libgit2 does not integrate with macOS Keychain or ssh-agent by default. Implement `RemoteCallbacks::credentials()` with a fallback chain: try `Cred::ssh_key_from_agent()` first, then default key paths, then show an actionable error dialog. Alternatively, shell out to `git push` via the existing PTY for v0.3.0 — simpler auth, uses user's git config. This decision must be made at Phase 2 design time.

2. **`dragDropEnabled: true` disables DOM drag-drop — the config flag is backwards.** Setting `dragDropEnabled: true` in `tauri.conf.json` enables Tauri's internal handler, which intercepts events before the DOM. DOM `onDragStart`/`onDrop` handlers never fire. Set `dragDropEnabled: false` to enable HTML5 drag-drop. For Finder drops, use Tauri's `onDragDropEvent` separately. Verify config before writing any drag-drop code.

3. **git2 concurrent access causes index lock failures.** `Repository::statuses()` and `Index::add_path` both acquire locks. If a background status refresh overlaps with a user-triggered stage operation, one will fail with "failed to create locked file". Serialize all git2 calls through a single `Arc<Mutex<Repository>>` or single-permit semaphore — this must be designed from the start, retrofitting is painful.

4. **File watcher misses external editor saves due to atomic write pattern.** VS Code, Zed, and Vim write to temp files then rename to the final path. The current `file_watcher.rs` (filtered by extension on `notify-debouncer-mini`) may miss these rename events or fire for temp files. Migrate to `notify-debouncer-full` for richer event metadata. Add a fallback: poll directory listing on window focus-regain. Fix this before building new file editing features.

5. **git2 commit signing is unsupported — commits will be unsigned.** libgit2 has no native SSH signing support (open issue libgit2#6397). GPG signing requires shelling out. For v0.3.0: detect `commit.gpgsign=true` in user's git config and display a warning before the first commit. Document this limitation in the UI. Users with CI pipelines that require signed commits must use the terminal.

**Additional pitfalls to watch:**
- Watcher threads accumulate on project switch — fix watcher lifecycle before adding more watchers
- Binary file detection required before file editing — `read_to_string` fails on binary; show error, do not attempt to edit
- xterm.js phantom characters on fast scroll — known xterm.js 6.0 synchronized output issue; fix in bug sprint
- Custom scrollbar CSS can break xterm.js scrollbar click targets — test scrollbar interaction after any CSS change
- macOS drag-drop SIGABRT crash with invalid file paths — known Tauri bug #14624; check if fixed in 2.10.3 before implementing drag-drop

## Implications for Roadmap

Based on combined research, the suggested phase structure is seven focused phases following the dependency order identified in ARCHITECTURE.md, with an explicit bug-fix sprint at the end.

### Phase 1: Foundation Primitives
**Rationale:** `context-menu.tsx` and `dropdown-menu.tsx` are consumed by four downstream features. File and git write Rust commands are the dependency gate for Phases 2-4. Building shared primitives once prevents rework and establishes the service-layer pattern (`git-service.ts`, `file-service.ts`) that all later phases follow.
**Delivers:** Reusable context menu component, reusable dropdown component, `write_file_content` Rust command, `stage_file`/`unstage_file`/`stage_all`/`commit` Rust commands, `git-service.ts` and `file-service.ts` service modules.
**Avoids:** Duplication of UI primitive patterns across components; scattered `invoke()` calls in feature components.

### Phase 2: Sidebar Evolution + Git Control Pane
**Rationale:** The sidebar restructure (3-tab layout with `sidebarActiveTab` signal) is the prerequisite for any feature that lives in a sidebar tab. Git Control is the highest-value new panel and exercises the git write commands from Phase 1. The credential strategy for push must be decided here — before any push UI is built.
**Delivers:** `sidebarActiveTab` signal + tab switcher UI, File Tree moved to sidebar File Tree tab, `git-control.tsx` with staging checkboxes and commit message input, push button (PTY shell-out or credential chain depending on decision), unsigned-commit warning dialog.
**Uses:** git2 stage/commit commands (Phase 1), existing `get_git_files` command.
**Avoids:** git2 locking (serialize via mutex from the start), unsigned-commit surprise (check config before first commit).
**Research flag:** Git push credential handling — evaluate `git2-credentials` crate readiness vs. PTY shell-out; decide before building push UI.

### Phase 3: Main Panel File Tabs + Tab Dropdown
**Rationale:** File editing is the highest-value user-facing feature. Depends on `write_file_content` (Phase 1) and the reusable dropdown (Phase 1). Can run in parallel with Phase 2 once Phase 1 is complete — both phases depend only on Phase 1 primitives.
**Delivers:** Tab dropdown (Terminal | Agent | Git Changes | Create File), `file-tab.tsx` with CodeMirror 6 and language detection, dirty state indicator, Cmd+S save with mtime conflict detection, `git-changes-tab.tsx` accordion diff viewer with lazy diff loading.
**Uses:** `codemirror@6.0.2` + language packs, `write_file_content` (Phase 1).
**Avoids:** Binary file corruption (detect binary before loading; show error), external edit data loss (mtime check before write), CodeMirror WebGL conflicts (CM6 is DOM-based, no conflicts with xterm.js WebGL).

### Phase 4: File Tree Enhancements
**Rationale:** Delete and drag/drop depend on the context menu (Phase 1) and assume the file open flow from Phase 3 is stable. Building after file tabs ensures the full file-opening lifecycle is established before adding drag-triggered file operations.
**Delivers:** File delete with confirmation modal, context menu integration (right-click on tree nodes), internal drag/drop reordering, `@tauri-apps/plugin-fs` for delete/move/copy, external editor preference stored in `state.json`.
**Uses:** `context-menu.tsx` (Phase 1), `@tauri-apps/plugin-fs`, HTML5 Drag and Drop API.
**Avoids:** `dragDropEnabled: false` config verified before writing any drag code, path canonicalization against project root, binary file guard for dropped files, macOS drag-drop SIGABRT bug check against Tauri 2.10.3.

### Phase 5: GSD Sub-Tabs
**Rationale:** Self-contained enhancement to `gsd-viewer.tsx`. No cross-phase dependencies beyond file reading, which has existed since Phase 6 of the original roadmap. Can proceed independently after Phase 1. Lower priority than file editing and git control; schedule when core features are stable.
**Delivers:** 5 sub-tabs in GSD viewer (Milestones section, Phases section, Progress section from ROADMAP.md; full MILESTONES.md; STATE.md), `parseRoadmapSection()` helper with graceful degradation, `gsdSubTab` signal.
**Addresses:** Efxmux's primary differentiator — no other terminal tool shows AI planning context inline.
**Research flag:** Standard patterns (section parsing by `## Heading`, tab switching already exists in right panel) — skip phase research.

### Phase 6: Right Panel Multi-Terminal
**Rationale:** Extends existing terminal-tabs.tsx patterns to the right panel bottom pane. Purely additive, lowest risk feature in the milestone. Build last among new features so regressions from other phases don't interfere.
**Delivers:** Multiple terminal/agent sub-tabs in right panel bottom pane, `rightBottomTabs` signal, dropdown menu for tab type selection.
**Uses:** `dropdown-menu.tsx` (Phase 1), existing PTY infrastructure and terminal-tabs patterns.
**Research flag:** Direct extension of proven infrastructure — skip phase research.

### Phase 7: Bug Fix Sprint
**Rationale:** Several known architectural debts (file watcher atomic save, watcher thread accumulation, xterm.js phantom characters, scrollbar click targets) affect multiple new features. Addressing them in a focused sprint after core features are stable is more effective than interleaving — it ensures bugs are fixed systematically with full regression coverage rather than ad-hoc patches.
**Delivers:** `notify-debouncer-full` migration with atomic-save handling, watcher lifecycle cleanup on project switch, xterm.js fast-scroll phantom character mitigation, custom scrollbar CSS with verified click interaction, focus-regain directory poll as fallback, `lsof`-verified watcher handle count.
**Addresses:** All pitfalls flagged as "bug fix phase" in PITFALLS.md.

### Phase Ordering Rationale

- Phase 1 must come first: context menu, dropdown, and Rust write commands are shared by all subsequent phases; building them once prevents rework in four downstream phases.
- Phases 2 and 3 can run in parallel after Phase 1 completes: they are independent (sidebar vs. main panel) and both depend only on Phase 1 outputs.
- Phase 4 follows Phase 3: the file open flow (used in drag-triggered file operations) should be stable before drag-drop is implemented.
- Phases 5 and 6 are independent enhancements; assign based on team availability after the core trio (1, 2, 3) is landed.
- Phase 7 is a dedicated quality sprint at the end: ensures existing bugs are fixed with full test coverage rather than patched piecemeal.

### Research Flags

Phases needing deeper research before or during planning:
- **Phase 2 (git push):** libgit2 credential handling has known failure modes in production. Research whether `git2-credentials` crate is production-ready or whether PTY shell-out is the safer v0.3.0 choice. The PITFALLS.md recommendation leans toward shell-out.
- **Phase 4 (Finder drag-to-tree):** Tauri drag-drop SIGABRT crash bug (#14624) is documented to affect Tauri 2.5.1–2.9.4. Verify whether Tauri 2.10.3 (current) includes the fix before implementing. If unfixed, a defensive workaround must be designed before starting the phase.

Phases with standard patterns — skip phase research:
- **Phase 1:** Context menu, dropdown, and IPC command patterns are established in the existing codebase.
- **Phase 3:** CodeMirror 6 is well-documented with clear Tauri + Vite integration patterns. Binary detection and mtime check are standard Rust/FS operations.
- **Phase 5:** ROADMAP.md parsing is string manipulation on a known format. GSD tab switching already exists in the right panel.
- **Phase 6:** Direct reuse of terminal-tabs.tsx patterns — no new territory.
- **Phase 7:** Each bug has a documented fix in PITFALLS.md with specific library recommendations.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified via npm, docs.rs, and Context7 with exact versions. No speculation. |
| Features | HIGH | Grounded in VS Code, Zed, GitKraken, and GitHub Desktop patterns. Competitor analysis confirmed. |
| Architecture | HIGH | Based on direct codebase analysis of existing components. Integration points are code-level specific, not conceptual. |
| Pitfalls | HIGH | Each pitfall verified against official docs, open GitHub issues, or libgit2 guides. Bug tracker issue numbers cited. |

**Overall confidence: HIGH**

### Gaps to Address

- **Git push credential strategy:** Research identifies the problem clearly but the implementation decision remains open: credential callback chain via `git2-credentials` crate, or PTY shell-out to `git push`. This is a design decision for Phase 2 planning, not a research gap — the team must decide based on acceptable complexity and v0.3.0 scope.

- **Tauri drag-drop bug #14624 fix status:** PITFALLS.md documents the SIGABRT crash affecting Tauri 2.5.1–2.9.4. Must confirm whether 2.10.3 includes the fix before Phase 4 begins. If unfixed, implement defensive path validation and graceful error handling rather than crashing.

- **CodeMirror Solarized Dark theme:** The existing Efxmux theme uses `bg=#282d3a, accent=#258ad1`. CodeMirror's `oneDark` built-in is close but not exact. A custom CodeMirror theme matching the Efxmux palette must be built during Phase 3 — not complex, but not yet designed.

- **GSD ROADMAP.md section format stability:** The `parseRoadmapSection()` helper assumes stable `## Heading` markers. If ROADMAP.md format varies across projects, parsing fails silently. Implement graceful degradation during Phase 5: if a section is not found, display the full file with a notice rather than showing empty content.

## Sources

### Primary (HIGH confidence)
- CodeMirror 6 npm (npmjs.com/package/codemirror) + docs (codemirror.net) — basicSetup, EditorView, language packs, themes
- git2-rs docs.rs 0.20.4 — Index::add_path, Repository::commit, RemoteCallbacks, Cred types
- Tauri v2 plugin-fs docs (v2.tauri.app/plugin/file-system) — remove, copyFile, rename, permission scopes
- git2-rs GitHub (rust-lang/git2-rs) — SSH and HTTPS feature flags
- MDN HTML5 Drag and Drop API — native browser drag events, dataTransfer interface
- MDN CSS Scrollbars Styling — scrollbar-width, ::-webkit-scrollbar
- xterm.js GitHub PR #5096 — VS Code scrollbar infrastructure in xterm.js 6.0

### Secondary (MEDIUM confidence)
- Tauri community discussion #9696 — drag-drop event names (`tauri://drag-drop`); community-verified but not in official docs
- GitHub issue tauri-apps/tauri#14624 — macOS drag-drop SIGABRT crash; fix status in 2.10.x unconfirmed
- GitHub issue tauri-apps/tauri#14373 — dragDropEnabled config confusion; documents the backwards flag behavior
- GitHub issue libgit2/libgit2#6397 — SSH signing not supported in libgit2; open issue
- GitHub issue xtermjs/xterm.js#5198 — selection highlight artifact after scroll
- GitHub issue xtermjs/xterm.js#1284 — fit addon scrollbar width conflict
- libgit2 authentication guide (libgit2.org) — credential callback chain patterns
- Zed git panel architecture (deepwiki) — interleaved diff-of-diffs pattern; useful for v0.4+ planning

### Tertiary (LOW confidence — verify during implementation)
- `notify-debouncer-full` atomic-save handling patterns — oneuptime.com community blog; pattern is sound but Efxmux-specific adaptation unverified
- `git2-credentials` crate production readiness — mentioned as credential-chain helper; maturity needs evaluation before using in Phase 2

---
*Research completed: 2026-04-14*
*Ready for roadmap: yes*
