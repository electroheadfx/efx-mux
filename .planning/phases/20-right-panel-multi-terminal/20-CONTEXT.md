# Phase 20: Right Panel Multi-Terminal - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The right-panel layout is restructured from its current split (`[File Tree | GSD]` top + `[Bash]` bottom) into a **single unified tab bar** that hosts File Tree, GSD, and a dynamic set of Terminal/Agent tabs in one row. The horizontal split handle and dedicated bottom Bash pane are removed; the right panel becomes one full-height pane driven by a tab bar.

**In scope:**
- Convert right-panel to a single unified tab bar over full height.
- File Tree and GSD become sticky, uncloseable tabs always-leftmost in the bar.
- Add a `+` dropdown to the right-panel tab bar: Terminal (Zsh), Agent, Git Changes.
- Refactor `terminal-tabs.tsx` to be scope-parametrized (`'main' | 'right'`) so both panels share the infrastructure.
- Session naming `-r<N>` for right-panel terminal tabs; separate persistence key `right-terminal-tabs:<project>`.
- Migration: kill legacy `<project>-right` bash session on first run; drop legacy state keys.
- Reuse `UnifiedTabBar`, `CrashOverlay` / restart flow, agent-quit confirm modal.

**Out of scope:**
- Diff / File preview as a tab type (deferred — no component exists).
- New capabilities in main panel's plus menu (already sufficient per Phase 17).
- Sidebar bash pane (the original ROADMAP text "sidebar bash pane" is stale wording from the pre-Phase-17 layout).

</domain>

<decisions>
## Implementation Decisions

### Right-Panel Layout (Option B)
- **D-01:** Right panel becomes a **single full-height pane** driven by one unified tab bar. The current horizontal split (`.split-handle-h[data-handle="right-h"]`), the bottom Bash container, and the separate `rightBottomTab` tab bar are **removed entirely**. Right panel no longer has a bottom pane.
- **D-02:** The right-panel tab bar hosts a **heterogeneous tab set**: File Tree + GSD (sticky, always present, always leftmost, in that order) followed by 0..N Terminal/Agent tabs, followed by optionally the shared Git Changes tab, followed by the `+` dropdown trigger.
- **D-03:** **Sticky tabs (File Tree, GSD) are uncloseable**: no `×` button renders for them. They cannot be drag-reordered out of the leftmost two positions. Terminal/Agent/Git-Changes tabs can reorder among themselves but cannot move to the left of the sticky pair.

### Tab Bar Component Reuse
- **D-04:** The existing `UnifiedTabBar` component (`src/components/unified-tab-bar.tsx`, Phase 17) is **refactored to be scope-parametrized**. Same component, same visual language, same drag/rename/close/wheel-scroll behavior. Right-panel instance passes `scope="right"`.
- **D-05:** UnifiedTabBar gains support for **sticky tab types** (`file-tree`, `gsd`) that render without `×` and participate only partially in drag-reorder (pinned to leftmost positions). The sticky-tab kind is specific to `scope="right"` — main panel never renders sticky tabs.
- **D-06:** Right-panel `+` dropdown items: **Terminal (Zsh), Agent, Git Changes**. No File Tree / GSD items (they are always present, cannot be re-added). Plus-menu uses the existing `Dropdown` primitive.
- **D-07:** **Git Changes shared-tab behavior**: if Git Changes is already open in the other panel when the user opens it via the right-panel `+` menu, the tab **moves** to the right panel (focus relocates, no duplication). Implemented by moving the `gitChangesTab` signal's tab ID into the right-panel tab order and out of main-panel's.

### Feature Parity with Main Panel
- **D-08:** Right-panel terminal/agent tabs get: **close `×`**, **double-click rename**, **drag-reorder (within their segment)**, **horizontal wheel-scroll**, **crash overlay + restart flow** (reuses `CrashOverlay` + `restartTabSession`), **agent-quit confirm modal** on close (reuses `showConfirmModal` "Quit Agent Only vs Close Terminal" pattern).
- **D-09:** Tab body mounting for sticky tabs (File Tree, GSD) and Git Changes: **always mounted, `display: none` when inactive**. Preserves GSD parse cache, File Tree scroll state, Git Changes viewer state. Matches the existing xterm.js pattern used for terminal tabs.

### Module Architecture
- **D-10:** `terminal-tabs.tsx` is **refactored to be instance-based**, keyed on a `'main' | 'right'` scope string. Scope governs: tabs signal, active tab ID signal, `.terminal-containers` wrapper selector, persistence key. The `pty-exited` event listener becomes scope-agnostic — it looks up the owning scope by `sessionName` across all registered scopes.
- **D-11:** **Backward compatibility at call sites**: existing top-level exports (`terminalTabs`, `activeTabId`, `createNewTab`, `closeTab`, `closeActiveTab`, `cycleToNextTab`, `switchToTab`, `renameTerminalTab`, `getDefaultTerminalLabel`, `getActiveTerminal`, `initFirstTab`, `restoreTabs`, `clearAllTabs`, `saveProjectTabs`, `restoreProjectTabs`, `hasProjectTabs`, `ActiveTabCrashOverlay`, `restartTabSession`) all remain and resolve to **scope `'main'`**. Right-panel call sites import scoped accessors (e.g., `getTerminalScope('right').tabs`, `createNewTab({ scope: 'right' })`). Phase 17 code is untouched by this migration.
- **D-12:** **Shared pipeline**: `createTerminal`, `connectPty`, `attachResizeHandler`, the `pty-exited` `listen()` subscription, `registerTerminal` (theme), and `projectSessionName` are reused as-is across scopes. Only the owning signals + container wrapper differ.
- **D-13:** The scope identifier (`'main' | 'right'`) is a **string**, not a boolean. Chosen so a future third scope (e.g., split-pane) is a one-line addition.

### Session Naming & Persistence
- **D-14:** Right-panel terminal session names use the suffix **`-r<N>`** where `N` is the tab sequence number: `<project>-r1`, `<project>-r2`, etc. Main panel continues to use bare `<project>` for tab 1 and `<project>-<N>` for subsequent tabs. Collision is therefore structural: main never emits `-r<N>`.
- **D-15:** Right-panel tab persistence lives under the key **`right-terminal-tabs:<project>`** in `AppState.session`. Parallel to and independent of the existing `terminal-tabs:<project>` key used by main panel. Shape is identical (`{ tabs: [{ sessionName, label, isAgent }], activeTabId }`).
- **D-16:** **Active tab per panel is persisted separately**: `right-active-tab:<project>` (or equivalent field inside `right-terminal-tabs:<project>`) records the last-active right-panel tab ID (may refer to a sticky tab like `file-tree` / `gsd`). On restore, if the persisted ID no longer resolves (e.g., terminal was closed), fall back to `file-tree`.

### Initial State & Restore Behavior
- **D-17:** **New-project default** (no persisted right-panel tabs): File Tree + GSD only, no terminal tabs. Default active tab = File Tree. No bash or agent is pre-spawned in the right panel.
- **D-18:** **On app startup / project switch**, restore the persisted right-panel tab set and active tab per project. If the persisted active tab ID cannot be resolved (tab no longer exists), default to File Tree. Existing per-project tab cache pattern from `terminal-tabs.tsx` (`projectTabCache`, `saveProjectTabs`, `restoreProjectTabs`) extends to the right scope.

### Migration from Phase 19 Layout
- **D-19:** **Legacy `-right` bash session is killed on first run** of the upgraded build. Best-effort `tmux kill-session -t <project>-right` for each known project at app bootstrap. Non-fatal on failure (session may already be gone).
- **D-20:** **Legacy state keys are silently dropped**: `panels['right-bottom-tab']`, `session['right-tmux-session']`, and `layout['right-h-pct']` are removed from the active state object on first save after upgrade. The `AppState` default shape in `state-manager.ts` is updated to omit these fields. Reading an older state.json ignores them without error.
- **D-21:** The **`switch-bash-session` DOM event** wired in `right-panel.tsx` (used by project-switch to relocate the single bash session's CWD) is **removed**. Project switch relies on the per-scope tab cache / restore mechanism (D-18) instead.

### Claude's Discretion
- Exact API shape of the scope parametrization in `terminal-tabs.tsx` (per-scope internal Map vs per-scope module registry vs class instance) — planner's choice.
- Exact placement of the sticky-tab rendering logic inside `UnifiedTabBar` (branch in `renderTab` vs separate `renderStickyTab` helper) — planner's choice.
- Precise icons for sticky tabs in the right-panel bar (Lucide picks; candidates: `FolderTree` for File Tree, `ListChecks` for GSD).
- Whether to show a subtle visual divider between the sticky segment and the dynamic-tabs segment of the right-panel bar.
- Animation / transition on tab-bar layout switch when a terminal tab is added or removed.
- Test split between unit tests (scope registry, persistence round-trip) and component render tests (right-panel tab bar renders File Tree + GSD sticky + Terminal tabs correctly).
- Whether restart-session suffix `r<N>` (for crash-restart) overlaps with right-scope naming — planner must ensure they don't collide (likely by distinguishing with a different prefix like `-rr<N>` for right-restart).

### Folded Todos
None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary targets for modification
- `src/components/right-panel.tsx` — Current file to be rewritten. Replace the split + dual tab bars with a single full-height pane hosting `UnifiedTabBar` (scope `'right'`) + sticky tab bodies + terminal containers wrapper.
- `src/components/unified-tab-bar.tsx` — Phase 17 tab bar. Refactor to accept `scope` prop; add sticky-tab rendering path; scope-aware plus-menu item set; scope-aware Git Changes ownership handoff.
- `src/components/terminal-tabs.tsx` — Phase 17 terminal infrastructure. Refactor to instance-based module keyed on `'main' | 'right'` scope per D-10/D-11/D-12. Keep existing top-level exports backed by `'main'` scope.

### State & services
- `src/state-manager.ts` — Remove `rightBottomTab` signal; drop `panels['right-bottom-tab']`, `session['right-tmux-session']`, `layout['right-h-pct']` from `AppState` default. Add persistence read/write for `right-terminal-tabs:<project>` and right-scope active tab.
- `src/utils/session-name.ts` — `projectSessionName(name, suffix)` already supports arbitrary suffix strings. Reused as-is with `-r<N>` suffixes for right scope.
- `src/terminal/pty-bridge.ts` / `src/terminal/terminal-manager.ts` / `src/terminal/resize-handler.ts` — No changes expected. Pipeline is scope-agnostic (D-12).
- `src/services/file-service.ts` — No changes.

### Rust / Tauri
- `src-tauri/src/pty.rs` (and any PTY session registry) — No new commands expected. Existing `spawn_terminal`, `destroy_pty_session`, `resize_pty`, `write_pty`, and the `pty-exited` emission are reused. Verify session registry handles the new `-r<N>` naming without special-casing.
- `src-tauri/src/commands.rs` (or wherever tmux helpers live) — `switch_tmux_session` command is no longer called from `right-panel.tsx` (D-21); verify no other caller depends on right-scope usage. Not removed (still used by main panel).

### Supporting components (reused as-is)
- `src/components/file-tree.tsx` — Rendered as the body of the sticky File Tree tab in the right-panel bar.
- `src/components/gsd-pane.tsx` — Rendered as the body of the sticky GSD tab.
- `src/components/git-changes-tab.tsx` — Body of the shared Git Changes tab when hosted by the right panel.
- `src/components/crash-overlay.tsx` + `ActiveTabCrashOverlay` helper — Reused for right-panel terminal tabs (D-08).
- `src/components/confirm-modal.tsx` / `showConfirmModal` — Reused for the agent-quit confirm modal on close (D-08).
- `src/components/dropdown-menu.tsx` — Reused for the right-panel `+` dropdown (D-06).

### Prior phase context (read before planning)
- `.planning/phases/15-foundation-primitives/15-CONTEXT.md` — Dropdown / ContextMenu primitives.
- `.planning/phases/16-sidebar-evolution-git-control/16-CONTEXT.md` — TabBar + sidebar-tab pattern.
- `.planning/phases/17-main-panel-file-tabs/17-CONTEXT.md` — UnifiedTabBar design, drag-reorder approach, agent-quit confirm pattern, per-project tab persistence pattern. Most load-bearing prior context for this phase.
- `.planning/phases/18-file-tree-enhancements/18-CONTEXT.md` — File tree reveal-in-tree, file-service patterns.
- `.planning/phases/19-gsd-sub-tabs/19-CONTEXT.md` — GSDPane mounting pattern (`display: none` vs block), right-top tab persistence.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Sidebar `SIDE-02` — "User can add Terminal/Agent sub-TUI via plus menu". Note: "sidebar bash pane" wording in the requirement is **stale** (predates Phase 17 unified tab bar); this phase interprets the requirement as "plus menu in the right-panel tab bar". Canonical execution: right-panel `+` menu spawns Terminal/Agent tabs.
- `.planning/ROADMAP.md` Phase 20 section — Success criteria #1 references "sidebar bash pane"; same stale wording. Effective criteria after this discussion:
  1. User can add Terminal/Agent sub-TUI via `+` menu in the **right-panel tab bar**.
  2. User can switch between multiple terminal tabs in the right-panel tab bar.
  3. Each terminal tab maintains an independent PTY session.
  4. File Tree + GSD remain always available as sticky tabs in the right-panel bar.
  5. Horizontal split + dedicated bottom Bash pane are removed.

### CLAUDE.md directives
- `/Users/lmarques/Dev/efx-mux/CLAUDE.md` — xterm.js 6.0 / addon version matrix; WebGL addon gotchas; PTY pipeline notes. Relevant because multiple right-panel terminals each spin up a WebGL xterm instance — honor `onContextLoss` fallback pattern already established.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`UnifiedTabBar`** (`src/components/unified-tab-bar.tsx`) — Core tab bar with drag-reorder (mouse-based, WKWebView-safe), rename-on-double-click, close `×`, plus-menu Dropdown, wheel horizontal scroll. Already supports heterogeneous tab types (`'terminal' | 'editor' | 'git-changes'`). Adding `'file-tree' | 'gsd'` sticky kinds + a `scope` prop is the main refactor surface.
- **`terminal-tabs.tsx`** — Full terminal lifecycle: create / switch / close / rename / cycle / restart / restore / persist. All functions operate over a single pair of module-level signals (`terminalTabs`, `activeTabId`) and a single DOM wrapper (`.terminal-containers`). Converting these into per-scope state is the bulk of D-10.
- **`CrashOverlay` + `ActiveTabCrashOverlay`** — Render on a tab when its PTY exits (`pty-exited` listener mutates `tab.exitCode`). Works off a generic `TerminalTab` so it's scope-agnostic once the scope registry is in place.
- **`showConfirmModal`** — Three-button modal (discard / save / cancel) used by main-panel for agent-quit. Direct reuse for right-panel agent tabs.
- **`projectSessionName(name, suffix)`** (`src/utils/session-name.ts`) — Already suffix-aware. `-r<N>` suffixes drop in without modification.
- **Dropdown primitive** (`src/components/dropdown-menu.tsx`) — Reused for the right-panel `+` menu.
- **Per-project tab cache pattern** (`projectTabCache` Map + `saveProjectTabs` + `restoreProjectTabs`) — Generalizes cleanly to a per-scope-per-project cache.

### Established Patterns
- Tailwind 4 `@theme` tokens via `src/tokens.ts` for every color/font/spacing. No hardcoded hex.
- Preact signals (`@preact/signals`) for reactive state; `useEffect` with cleanup for side-effects.
- `listen()` from `@tauri-apps/api/event` returns an unlisten fn — always captured + returned from effect cleanup.
- Tests live beside components (`*.test.tsx`) using `@testing-library/preact` + `mockIPC` for Tauri commands (Phase 11 infra).
- Services centralize IPC: `file-service.ts`, `git-service.ts` wrap `invoke()`. No direct `@tauri-apps/api/core` usage in components.
- Component-per-file, no barrel re-exports in `src/components/`.
- `display: none`/`block` toggling (not unmount) for tab bodies that own xterm.js WebGL contexts or expensive parse caches — established in Phase 17 (terminal tabs) and Phase 19 (GSDPane sub-tabs).

### Integration Points
- `src/components/right-panel.tsx` lines 100–155 — The render surface to be rewritten. Current flex-col with two sub-panels + split handle → becomes single-pane `UnifiedTabBar scope="right"` + sticky bodies + `.terminal-containers[data-scope="right"]` wrapper.
- `src/state-manager.ts` `AppState` interface + `loadAppState` / `saveAppState` + the three ephemeral right-scope keys (D-20) are the migration surface.
- Wherever `restoreTabs` / `initFirstTab` is called in `src/main.tsx` (app bootstrap) — that call site becomes scope-aware. Main panel restore runs with `scope='main'`, and if persisted right-scope tabs exist they restore with `scope='right'`.
- `src-tauri/src/pty.rs` session registry — verify `destroy_pty_session` + `spawn_terminal` + `resize_pty` already handle arbitrary session names (they should — names are strings). No Rust changes expected, but planner must confirm.
- `UnifiedTabBar` internal state (`_editorTabsByProject`, `_tabOrderByProject`, `gitChangesTab`) is currently module-global and implicitly main-panel-only. Right-panel needs its own `tabOrder` (for its terminal/git-changes ordering); editor tabs never appear in right panel; `gitChangesTab` becomes a single signal with an "owning scope" field.

</code_context>

<specifics>
## Specific Ideas

- The user's framing: "Terminal/agent lives in main-panel's tab bar AND in the right-panel tab bar. It's enough." — the bottom-pane-as-dedicated-bash was overkill; the unified tab bar pattern (Phase 17) is the established mental model and should be the only pattern for terminals.
- "Option B" ASCII sketch (accepted): right-panel tab bar = `[File Tree | GSD | Term A | Agent B | +▾]`, no split, no bottom pane.
- Sticky tabs as a first-class concept — the user did not want File Tree / GSD to ever disappear. Closing the last terminal must not blank the pane; File Tree / GSD are always there.
- The user explicitly accepted the migration approach (kill old `-right` session + drop old state keys) as the simplest path. No user-facing migration prompt.
- `-r<N>` suffix chosen over `-right-<N>` for compactness — less visual noise in `tmux ls`.

</specifics>

<deferred>
## Deferred Ideas

- **Diff / File preview as a tab type** — Component does not exist; would require design + build. Candidate for a future phase (post-v0.3.0), likely bundled with a broader "inline file viewer" capability.
- **File Tree / GSD also openable as main-panel tabs** — Not requested; would invert the current mental model.
- **Per-scope keyboard shortcuts** (e.g., Cmd+Shift+1..N to cycle right-panel terminals distinct from main) — deferred; current keyboard handler can be made scope-aware later.
- **Split-pane right panel** (user wants two right-panel tab bars stacked again) — if requested later, the `'main' | 'right'` scope scheme extends naturally by adding a third scope like `'right-bottom'`.
- **Per-tab theme override** (e.g., one terminal in a different palette to mark prod) — out of scope.
- **Legacy `-right` session adoption** (preserve scrollback across upgrade) — rejected in favor of clean kill (D-19). Revisit if users report losing a valuable session.

### Reviewed Todos (not folded)
None — no pending todos were surfaced by `todo match-phase 20`.

</deferred>

---

*Phase: 20-right-panel-multi-terminal*
*Context gathered: 2026-04-17*
