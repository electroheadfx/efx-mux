# Phase 20: Right Panel Multi-Terminal - Research

**Researched:** 2026-04-17
**Domain:** Preact multi-scope tab infrastructure, xterm.js WebGL context management, tmux session migration
**Confidence:** HIGH (codebase-verified against current Phase 17/19 implementations)

## Summary

Phase 20 restructures the right panel from a `[File Tree | GSD]` top + `[Bash]` bottom split into a single full-height pane driven by a unified tab bar. The existing Phase 17 `UnifiedTabBar` and `terminal-tabs.tsx` module must be **parametrized by scope (`'main' | 'right'`)** while preserving all existing main-panel call sites (D-11). File Tree and GSD become first-class "sticky" tab types that render without a close button and cannot be dragged out of leftmost positions.

The work is entirely frontend TypeScript + state-manager plumbing — no Rust changes are needed. The existing `spawn_terminal` / `destroy_pty_session` / `resize_pty` commands handle arbitrary sanitized session names (alphanumeric + hyphen + underscore), so `<project>-r1` / `<project>-r2` naming drops in without modification. The one-time migration (kill legacy `<project>-right` tmux sessions, drop 3 legacy state keys) piggybacks on the existing `cleanup_dead_sessions` bootstrap point in `main.tsx:402`.

The riskiest surface areas, in order: (1) `terminal-tabs.tsx` refactor — it is a 758-line file with 20+ top-level exports and tight coupling to module-global signals; (2) the `gitChangesTab` signal's migration to a scoped ownership model without leaking state across panels; (3) the `-r<N>` / `r<N>` (restart-suffix) naming collision flagged by the user in Claude's Discretion.

**Primary recommendation:** Implement scope parametrization as a **per-scope record held in a module-level `Map<Scope, ScopeState>`** inside `terminal-tabs.tsx`, with all existing top-level exports wrapping `getScope('main')`. This minimizes call-site churn (D-11 compliance) while making the right-scope state trivially addressable as `getScope('right')`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Right-Panel Layout (Option B)**
- D-01: Right panel becomes a single full-height pane driven by one unified tab bar. The current horizontal split (`.split-handle-h[data-handle="right-h"]`), bottom Bash container, and separate `rightBottomTab` tab bar are **removed entirely**.
- D-02: Right-panel tab bar hosts heterogeneous tab set: File Tree + GSD (sticky, leftmost) followed by 0..N Terminal/Agent tabs, followed by optionally the shared Git Changes tab, followed by `+` dropdown trigger.
- D-03: Sticky tabs (File Tree, GSD) are uncloseable, cannot drag-reorder out of leftmost two positions. Terminal/Agent/Git-Changes tabs can reorder among themselves but cannot move left of the sticky pair.

**Tab Bar Component Reuse**
- D-04: Existing `UnifiedTabBar` is refactored to be scope-parametrized. Right-panel instance passes `scope="right"`.
- D-05: `UnifiedTabBar` gains support for sticky tab types (`file-tree`, `gsd`). The sticky-tab kind is specific to `scope="right"` — main never renders sticky tabs.
- D-06: Right-panel `+` dropdown items: Terminal (Zsh), Agent, Git Changes. No File Tree / GSD items.
- D-07: Git Changes shared-tab behavior: if open in the other panel, the tab **moves** to the right panel (no duplication). Implemented by moving the `gitChangesTab` signal's tab ID into the right-panel tab order.

**Feature Parity**
- D-08: Right-panel terminal/agent tabs get close `×`, double-click rename, drag-reorder (within segment), wheel-scroll, crash overlay, agent-quit confirm modal.
- D-09: Tab body mounting for sticky + Git Changes: always mounted, `display: none` when inactive.

**Module Architecture**
- D-10: `terminal-tabs.tsx` refactored to be instance-based, keyed on `'main' | 'right'` scope. Scope governs: tabs signal, active tab ID signal, `.terminal-containers` wrapper selector, persistence key.
- D-11: Backward compatibility at call sites — all existing top-level exports remain and resolve to scope `'main'`. Right-panel call sites use scoped accessors.
- D-12: Shared pipeline (`createTerminal`, `connectPty`, `attachResizeHandler`, `pty-exited` listener, `registerTerminal`, `projectSessionName`) reused as-is.
- D-13: Scope identifier is a string, not boolean.

**Session Naming & Persistence**
- D-14: Right-panel session names use suffix `-r<N>`. Main stays bare `<project>` / `<project>-<N>`.
- D-15: Right-panel tab persistence under key `right-terminal-tabs:<project>` in `AppState.session`. Shape identical to main.
- D-16: Active tab per panel persisted separately. On restore, if persisted ID doesn't resolve, fall back to `file-tree`.

**Initial State & Restore**
- D-17: New-project default: File Tree + GSD only, no terminal tabs. Default active tab = File Tree.
- D-18: On startup / project switch, restore persisted right-panel tab set and active tab per project.

**Migration**
- D-19: Legacy `-right` bash session is killed on first run. Best-effort `tmux kill-session -t <project>-right` for each known project at bootstrap. Non-fatal on failure.
- D-20: Legacy state keys silently dropped: `panels['right-bottom-tab']`, `session['right-tmux-session']`, `layout['right-h-pct']`. Update `AppState` default shape to omit.
- D-21: `switch-bash-session` DOM event removed.

### Claude's Discretion

- Exact API shape of scope parametrization (per-scope internal Map vs per-scope module registry vs class instance) — planner's choice.
- Exact placement of sticky-tab rendering inside `UnifiedTabBar` (branch in `renderTab` vs separate `renderStickyTab` helper) — planner's choice.
- Precise icons for sticky tabs (Lucide picks; candidates `FolderTree` for File Tree, `ListChecks` for GSD).
- Whether to show a subtle visual divider between sticky segment and dynamic segment.
- Animation / transition on tab-bar layout switch when a terminal tab is added or removed.
- Test split between unit tests (scope registry, persistence round-trip) and component render tests.
- Whether restart-session suffix `r<N>` collides with right-scope `-r<N>` — planner must ensure they don't collide (e.g., `-rr<N>` for right-restart).

### Deferred Ideas (OUT OF SCOPE)

- Diff / File preview as a tab type — no component exists.
- File Tree / GSD also openable as main-panel tabs — not requested.
- Per-scope keyboard shortcuts (e.g., Cmd+Shift+1..N cycling right-panel terminals distinct from main).
- Split-pane right panel (stacked tab bars) — defer to future phase.
- Per-tab theme override.
- Legacy `-right` session adoption (preserve scrollback across upgrade) — rejected in favor of clean kill.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIDE-02 | User can add Terminal/Agent sub-TUI via plus menu in sidebar bash pane | **Note: requirement wording is stale pre-Phase-17.** Canonical execution (per CONTEXT.md): `+` menu in the right-panel tab bar spawns Terminal (Zsh) / Agent / Git Changes tabs. Research covers scope-parametrized `UnifiedTabBar` and per-scope `terminal-tabs.tsx` that enable this. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab bar UI (sticky + dynamic segments, drag, rename) | Frontend (Preact/TSX) | — | Pure client-side — no server involvement |
| Tab state signals per scope | Frontend (Preact signals) | — | Module-global reactive state already the pattern (Phase 17/19) |
| PTY session lifecycle (spawn, resize, destroy) | Rust (Tauri + portable-pty) | Frontend (invoke wrappers) | Existing pipeline per CLAUDE.md; no Rust changes needed |
| Persistence (tab metadata, active tab per scope) | Frontend writes → Rust reads/writes `state.json` | — | `state-manager.ts` → `save_state` Tauri command — existing flow |
| Legacy session cleanup (tmux kill `<project>-right`) | Rust (`tmux kill-session` spawn) | Frontend trigger via `invoke` | Reuses `cleanup_dead_sessions` bootstrap timing; spawn_command in Rust |
| WebGL context management (xterm.js addons) | Frontend (xterm WebGL addon) | Browser (WKWebView) | Per-terminal, scope-agnostic — CLAUDE.md `onContextLoss` fallback applies |
| File Tree / GSD / Git Changes body rendering | Frontend (existing components) | — | Components already exist; this phase only relocates/remounts them |

## Standard Stack

### Core (already installed — verified against package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `preact` | 10.29.1 | Component framework | Project baseline since Phase 6.1 |
| `@preact/signals` | 2.9.0 | Reactive state | Used by every component in `src/` |
| `@xterm/xterm` | 6.0.0 | Terminal emulator | Matches CLAUDE.md version matrix |
| `@xterm/addon-webgl` | 0.19.0 | GPU renderer | Per CLAUDE.md |
| `@xterm/addon-fit` | 0.11.0 | Container fitting | Per CLAUDE.md |
| `lucide-preact` | 1.8.0 | Icon library | Already used by `UnifiedTabBar` (`Terminal`, `Bot`, `FileDiff`, `Pin`) |
| `@tauri-apps/api` | 2.10.1 | Tauri bridge | Per CLAUDE.md version matrix |

### Testing

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.4 | Test runner | Unit + component tests (`*.test.tsx`) |
| `@testing-library/preact` | 3.2.4 | DOM-level component assertions | Render tests |
| `@testing-library/jest-dom` | 6.9.1 | `toBeInTheDocument` etc. | Setup in `test-setup.ts` |
| `jsdom` | 29.0.2 | DOM environment | Test environment in `vitest.config.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Scoped `Map<Scope, ScopeState>` inside `terminal-tabs.tsx` | Convert `terminal-tabs.tsx` into a class with instances | Class breaks existing named exports entirely — violates D-11 (zero-change for main-panel callers). Map pattern preserves exports. |
| Scoped `Map<Scope, ScopeState>` | Parallel module `right-terminal-tabs.tsx` (full duplication) | Violates D-12 (shared pipeline). Doubles test surface. Two copies to maintain. |

**Installation:** No new dependencies are introduced by this phase. All packages are already present.

**Version verification:** Versions above verified from `/Users/lmarques/Dev/efx-mux/package.json` read at 2026-04-17. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```
                             ┌──────────────────────────────────────────┐
                             │           User Input (mouse/kbd)         │
                             └──────────────┬───────────────────────────┘
                                            │
                    ┌───────────────────────┴──────────────────────────┐
                    │                                                  │
         ┌──────────▼──────────┐                          ┌────────────▼───────────┐
         │  UnifiedTabBar      │                          │   UnifiedTabBar         │
         │  scope="main"       │                          │   scope="right"         │
         │  (main-panel.tsx)   │                          │   (right-panel.tsx)     │
         └──────────┬──────────┘                          └────────────┬────────────┘
                    │                                                  │
                    │  reads/writes                    reads/writes    │
                    ▼                                                  ▼
         ┌─────────────────────────────────────────────────────────────────────┐
         │           terminal-tabs.tsx  (scope registry)                       │
         │                                                                     │
         │    const scopes: Map<Scope, ScopeState> = new Map([                 │
         │      ['main',  { tabs, activeTabId, counter, containerSel, ... }],  │
         │      ['right', { tabs, activeTabId, counter, containerSel, ... }],  │
         │    ]);                                                              │
         │                                                                     │
         │    export const terminalTabs   = scopes.get('main').tabs;   ◀── D-11│
         │    export const activeTabId    = scopes.get('main').activeTabId;    │
         │    export function createNewTab(opts)                       ◀── D-11│
         │       → createNewTabScoped('main', opts)                            │
         │                                                                     │
         │    export function getTerminalScope(scope)                  ◀── new │
         │       → returns { tabs, activeTabId, createNewTab, ... }            │
         └─────────────┬───────────────────────────────┬───────────────────────┘
                       │                               │
            shared pipeline (D-12)                     │
                       │                               │
         ┌─────────────▼─────────┐           ┌─────────▼──────────────────┐
         │ createTerminal        │           │  pty-exited listener       │
         │ connectPty            │           │  (scope-agnostic: looks up │
         │ attachResizeHandler   │           │   owning scope by session  │
         │ registerTerminal      │           │   across ALL scopes)       │
         │ projectSessionName    │           └────────────────────────────┘
         └─────────────┬─────────┘
                       │ invoke('spawn_terminal', { sessionName, ... })
                       ▼
         ┌────────────────────────────────────────┐
         │  Rust: src-tauri/src/terminal/pty.rs   │
         │  - spawn_terminal(session_name, ...)   │
         │  - destroy_pty_session(session_name)   │
         │  - resize_pty(session_name, cols, rows)│
         │                                        │
         │  Session names are sanitized:          │
         │  alphanumeric + '-' + '_' only.        │
         │  <project>-r1, <project>-r2 are valid  │
         │  and need zero special-casing.         │
         └────────────────────────────────────────┘

PERSISTENCE PATH:

  terminalTabs.value changes
        │
        ▼
  persistTabState(scope)
        │  scope='main'  → updateSession({ 'terminal-tabs':<active>, 'terminal-tabs:<project>':<active> })
        │  scope='right' → updateSession({ 'right-terminal-tabs:<project>':<active> })
        ▼
  state-manager.ts: currentState.session[key] = value; save_state Tauri cmd
        │
        ▼
  Rust writes ~/.config/efxmux/state.json (spawn_blocking)


LAYOUT (right-panel.tsx after rewrite):

  <aside class="right-panel">
    <UnifiedTabBar scope="right" />                  ← sticky [File Tree | GSD] then dynamic tabs then [+]
    <div class="right-panel-content flex-1 relative">
      <div class="sticky-body" style="display:[block|none]">   ← File Tree body, always mounted
        <FileTree />
      </div>
      <div class="sticky-body" style="display:[block|none]">   ← GSD body, always mounted
        <GSDPane />
      </div>
      <div class="sticky-body" style="display:[block|none]">   ← Git Changes, always mounted if owned by right scope
        <GitChangesTab />
      </div>
      <div class="terminal-containers" data-scope="right">      ← all right-scope xterm.js containers
        <!-- per-tab terminal containers, display toggled by switchToTab -->
      </div>
    </div>
  </aside>
```

### Recommended Project Structure

```
src/
├── components/
│   ├── unified-tab-bar.tsx           # Accepts scope prop, branches on sticky vs dynamic tabs
│   ├── right-panel.tsx               # Single-pane rewrite (split + bottom removed)
│   ├── terminal-tabs.tsx             # Scope-parametrized via internal Map<Scope, ScopeState>
│   ├── file-tree.tsx                 # Body of 'file-tree' sticky tab — no changes
│   ├── gsd-pane.tsx                  # Body of 'gsd' sticky tab — no changes
│   └── git-changes-tab.tsx           # Body of 'git-changes' tab — no changes
├── state-manager.ts                  # AppState default updated; 3 legacy keys dropped
├── main.tsx                          # Bootstrap: kill legacy -right sessions; restore both scopes
└── utils/session-name.ts             # Unchanged — projectSessionName already suffix-aware

src-tauri/src/terminal/
└── pty.rs                            # Unchanged — handles arbitrary sanitized names
```

### Pattern 1: Scope Registry via Module-Level Map

**What:** A single `Map<Scope, ScopeState>` inside `terminal-tabs.tsx` holding per-scope signals and counters. Existing top-level exports become thin wrappers over `scopes.get('main')`.

**When to use:** When backward compatibility with N existing call sites is a hard constraint (D-11) and you need a second instance of a module-level-signal-based module.

**Example (sketch, not to be copied verbatim):**

```typescript
// terminal-tabs.tsx

export type TerminalScope = 'main' | 'right';

interface ScopeState {
  tabs: ReturnType<typeof signal<TerminalTab[]>>;
  activeTabId: ReturnType<typeof signal<string>>;
  counter: { n: number };
  containerSelector: string;     // '.terminal-containers' | '.terminal-containers[data-scope="right"]'
  persistenceKey: (projectName: string) => string;
  projectTabCache: Map<string, Array<{ sessionName: string; label: string; isAgent: boolean }>>;
}

const scopes = new Map<TerminalScope, ScopeState>([
  ['main',  createScopeState('main')],
  ['right', createScopeState('right')],
]);

function getScope(scope: TerminalScope): ScopeState { /* ... */ }

// D-11: backward-compat exports wrap 'main' scope
export const terminalTabs = scopes.get('main')!.tabs;
export const activeTabId  = scopes.get('main')!.activeTabId;
export function createNewTab(opts?: CreateTabOptions) {
  return createNewTabScoped('main', opts);
}
// ... same wrapping pattern for closeTab, closeActiveTab, cycleToNextTab,
//     switchToTab, renameTerminalTab, getDefaultTerminalLabel, getActiveTerminal,
//     initFirstTab, restoreTabs, clearAllTabs, saveProjectTabs, restoreProjectTabs,
//     hasProjectTabs, ActiveTabCrashOverlay, restartTabSession.

// New scope-aware accessor for right panel
export function getTerminalScope(scope: TerminalScope) {
  const s = getScope(scope);
  return {
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    createNewTab: (opts?: CreateTabOptions) => createNewTabScoped(scope, opts),
    closeTab: (id: string) => closeTabScoped(scope, id),
    // ... etc.
  };
}
```

Source: pattern derived from current `unified-tab-bar.tsx` per-project Map approach (`_editorTabsByProject`, `_tabOrderByProject`) — the same technique scaled up from "per project" to "per scope". [VERIFIED: `src/components/unified-tab-bar.tsx:57-95`]

### Pattern 2: Scope-Agnostic pty-exited Listener

**What:** The `listen('pty-exited', ...)` subscription at the module bottom must iterate all scopes' tab arrays to find the owning tab by `sessionName`. A tab with `sessionName = '<project>-r2'` that crashes should have its `exitCode` set regardless of scope.

**When to use:** This is the one place where a single event channel must be multiplexed across scopes.

**Example:**

```typescript
listen<{ session: string; code: number }>('pty-exited', (event) => {
  const { session, code } = event.payload;
  for (const [scope, state] of scopes) {
    const tab = state.tabs.value.find(t => t.sessionName === session);
    if (tab) {
      tab.exitCode = code;
      state.tabs.value = [...state.tabs.value]; // trigger re-render
      return; // session names are unique across scopes by D-14 construction
    }
  }
});
```

Source: current implementation at `src/components/terminal-tabs.tsx:734-742`. [VERIFIED: codebase read]

### Pattern 3: Sticky Tabs via Type Discrimination in `allTabs`

**What:** The `allTabs` computed already unions `terminal | editor | git-changes`. For right scope, extend the union with `file-tree` and `gsd` types AND prepend them unconditionally to the ordered list when `scope === 'right'`.

**Example (sketch):**

```typescript
type StickyTab = { type: 'file-tree' } | { type: 'gsd' };

function getOrderedTabs(scope: TerminalScope): UnifiedTab[] {
  const dynamic = getDynamicTabs(scope);          // terminal + editor + git-changes
  if (scope === 'main') return dynamic;            // main panel has no sticky
  const sticky: UnifiedTab[] = [
    { type: 'file-tree', id: 'file-tree' },
    { type: 'gsd',       id: 'gsd' },
  ];
  return [...sticky, ...dynamic];
}
```

The `renderTab` function inside `unified-tab-bar.tsx` must branch on `type === 'file-tree' | 'gsd'` to render **without** a close button and **without** drag handlers — aligning with UI-SPEC sticky tab rendering contract.

### Pattern 4: Drag-Reorder Excluding Sticky Segment

**What:** The mouse-based drag reorder (`onTabMouseDown` / `onDocMouseMove` / `onDocMouseUp`) already has the full drag lifecycle. To exclude sticky tabs:

1. In `onTabMouseDown`: refuse to start a drag when `tab.type === 'file-tree' | 'gsd'`.
2. In `onDocMouseUp` drop-resolution: if `targetId` resolves to a sticky tab, cancel drop (no-op).
3. The `tabOrder` array in the right scope stores **only dynamic tab IDs** — sticky tabs are always rendered first, never in `tabOrder`.

Source: drag-reorder lifecycle at `src/components/unified-tab-bar.tsx:640-815`. The `data-tab-id` attribute-based hit testing means sticky tabs with no `data-tab-id` or a sticky-prefixed id like `sticky-file-tree` can be filtered out at the drop-resolution step. [VERIFIED: codebase read]

### Anti-Patterns to Avoid

- **Creating a parallel copy of `terminal-tabs.tsx` as `right-terminal-tabs.tsx`:** Violates D-12 (shared pipeline). Doubles test surface. Two diverging copies to maintain. The user explicitly chose the scope-parametrization path (D-10).
- **Using a boolean `isRight` flag:** Violates D-13 (scope is a string). A third scope in the future would require another boolean flag and combinatorial edge cases.
- **Persisting sticky tab state under `right-terminal-tabs:<project>`:** The key should hold only dynamic tabs (terminals + agents + optionally git-changes owner). Sticky tabs are structural — re-injected on every render. Their "state" is limited to being the active tab.
- **Unmounting sticky bodies when inactive:** Violates D-09. File Tree scroll position, GSDPane parse cache, and GitChangesTab accordion state all depend on persistent mount — same pattern established in Phase 17 (xterm.js containers) and Phase 19 (GSDPane sub-tabs).
- **Firing `pty-exited` subscribers twice** by instantiating one listener per scope. The existing single subscription at module top must stay single and iterate scopes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag reorder in WKWebView | HTML5 drag-drop API | Reuse the existing mouse-based impl in `unified-tab-bar.tsx:640-815` | HTML5 drag-drop is broken in Tauri WKWebView — `dragstart` fires but `dragover`/`drop` never do. Mouse-based impl is battle-tested. [VERIFIED: `unified-tab-bar.tsx:635-637` comment] |
| Per-project tab cache | New Map + new persistence logic | Reuse `projectTabCache` + `saveProjectTabs` / `restoreProjectTabs` / `hasProjectTabs` pattern from `terminal-tabs.tsx:57` | Pattern already survives app-restart round-trip. Per-scope cache is one more Map keyed by scope. |
| xterm.js lifecycle | Inline `new Terminal` / addons | `createTerminal` from `terminal-manager.ts` | Already wires WebGL addon + FitAddon + theme consistently. Scope-agnostic. |
| Session name derivation | Inline `.replace(/[^a-zA-Z0-9_-]/g, '-')` | `projectSessionName(name, suffix)` from `utils/session-name.ts` | Already suffix-aware; matches Rust-side sanitizer in `pty.rs:62-65`. |
| tmux session kill for migration | New `Command::new("tmux")` in JS via `invoke` | Reuse `cleanup_dead_sessions` bootstrap timing as the hook point; add a sibling `kill_legacy_right_sessions` Rust command OR iterate projects in JS and issue `invoke('destroy_pty_session', ...)` + an explicit shell-out | Existing `cleanup_dead_sessions` is the precedent at the exact bootstrap phase this migration needs. See Pitfall 2. |
| Confirm modal | New modal component | `showConfirmModal` with `saveLabel: 'Quit Agent Only'` — already used by main-panel agent tabs | Zero-change reuse per D-08. [VERIFIED: `unified-tab-bar.tsx:421-446`] |
| Crash overlay | Custom restart UI | `CrashOverlay` + `ActiveTabCrashOverlay` — the component is generic over `TerminalTab` | Scope-agnostic once registry lookup is done. |

**Key insight:** Phase 17's UnifiedTabBar + terminal-tabs.tsx already do 95% of the heavy lifting. Phase 20 is a scope parametrization exercise, NOT a from-scratch rebuild. Treat the existing module as a production-tested framework and add the minimum delta needed for a second scope.

## Runtime State Inventory

This is a layout-refactor + migration phase — runtime state audit is load-bearing.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `AppState.session['right-tmux-session']` (legacy, single string) — set to `<project>-right` form. `AppState.panels['right-bottom-tab']` (legacy, always `'Bash'`). `AppState.layout['right-h-pct']` (legacy split percent). | **Code edit**: drop all three keys from `AppState` default in `state-manager.ts`. On first save after upgrade, these keys are not re-emitted → they disappear silently from state.json (existing load logic ignores unknown keys). **No data migration needed** — these keys have no downstream consumers after D-19/D-20/D-21. |
| **Live service config** | tmux daemon running with sessions like `<project>-right` from the old layout. These sessions persist across app restarts (tmux server stays alive). | **Data migration**: on first run of upgraded build, iterate `projects.value` and issue `tmux kill-session -t <project>-right` for each. Best-effort. Non-fatal on failure. **Hook point: in `main.tsx` immediately after `invoke('cleanup_dead_sessions')` at line 402.** See Pitfall 2 for implementation detail. |
| **OS-registered state** | None — efxmux does not register launchd/cron/Task Scheduler entries for right-panel tabs. Verified by absence of registration code in `src-tauri/` and no PROJECT.md mention of OS-level hooks. | None. |
| **Secrets/env vars** | None — no secret references `right` / `right-bottom` / `right-h-pct` in codebase. Grep confirmed. | None. |
| **Build artifacts / installed packages** | None — no compiled artifact, package, or cached binary ships with right-panel session names embedded. | None. |

**Detecting "first run of upgraded build" without a version stamp:** The migration is idempotent — killing a session that doesn't exist is a no-op (tmux returns exit code 1 silently; the JS-side logic already tolerates failures per D-19). Dropping keys that aren't set is a no-op. So **run the migration on every startup** without a version gate. Cost: a few extra `tmux has-session` checks on each boot for projects that no longer have legacy sessions — negligible (~10ms per project). This matches the existing `cleanup_dead_sessions` pattern which also runs unconditionally at every startup. [VERIFIED: `src/main.tsx:402`]

The canonical question answered: After every file in the repo is updated, runtime systems that still have the old `<project>-right` string cached are **tmux sessions** (live daemon state) and **state.json keys** (user disk state). Both are addressed by D-19 and D-20.

## Common Pitfalls

### Pitfall 1: `-r<N>` / `r<N>` Session Name Collision

**What goes wrong:** Phase 20 assigns right-panel tab sessions the suffix `-r<N>`. The existing `restartTabSession` function at `terminal-tabs.tsx:485` already uses the suffix `r<N>` (note leading `r`, no hyphen) when restarting a crashed tab — it computes `const newSessionSuffix = \`r${tabCounter}\`;` and passes it to `projectSessionName(activeName, suffix)` which joins with a hyphen → final name is `<project>-r<N>`. **This collides structurally** with right-panel naming.

**Why it happens:** Two code paths produce identical name shapes: (a) new right-panel tab #3 → `<project>-r3`; (b) main-panel tab crashes and gets restarted → also `<project>-r3` if the counter happens to match.

**How to avoid:** Change the crash-restart suffix to a different pattern. Two viable options:
1. **Recommended:** Keep the prefix unique per origin. Rename restart to `rr<N>` → final name `<project>-rr3`. Two characters, clearly "restart-restart". The `tabCounter` is module-global and monotonically increasing across both scopes and across restarts, so even a single `r` would be unique per session — but making the prefix visibly distinct from the right-panel prefix preserves debuggability in `tmux ls`.
2. Per-scope restart prefixes: `r<N>` for main-scope restarts, `rr<N>` for right-scope restarts. Harder to reason about.

**Planner's recommendation:** Option 1 — adopt `rr<N>` universally for crash restarts across both scopes. The collision is eliminated by shape (hyphen + `rr`), not by counter coincidence. Flag: update the comment in `restartTabSession` explaining the rename.

**Warning signs:** Two `TerminalTab` objects in different scopes with identical `sessionName`, causing `pty-exited` listener to update the wrong tab.

### Pitfall 2: Legacy Session Kill Blocking UI at Bootstrap

**What goes wrong:** Naively calling `tmux kill-session -t <project>-right` synchronously for every project at startup can block the UI thread if tmux is slow to respond (e.g., daemon starting up, many projects).

**Why it happens:** `invoke('destroy_pty_session', ...)` only removes the PtyManager entry; it does NOT kill the tmux session. There is no existing command that invokes `tmux kill-session`. A new minimal Rust command or a JS-side iteration via `Command` shell-out is needed.

**How to avoid:**

Two implementation options:

**Option A (recommended): One-shot Rust command `kill_legacy_right_sessions(project_names: Vec<String>)`.** Spawns a Tokio blocking task that iterates and issues `tmux kill-session -t <name>-right` for each. Returns `Vec<String>` of killed names for logging. Runs in parallel with UI init because Tauri `invoke` is async. Matches the pattern of `cleanup_dead_sessions` at `pty.rs:540`.

**Option B: JS-side iteration firing multiple invocations.** Use the existing `destroy_pty_session` (which doesn't kill tmux) plus a new thin Rust command that just runs `tmux kill-session -t <name>`. More invocation overhead.

**Recommendation:** Option A. Single invoke, single Rust side-effect, awaitable but non-blocking.

**Hook point:** Immediately after `cleanup_dead_sessions` in `main.tsx:402`. Fire-and-forget with `.catch()` — migration failure should not block startup:

```typescript
// main.tsx after line 402
try {
  const projectNames = projects.value.map(p => p.name);
  await invoke('kill_legacy_right_sessions', { projectNames });
} catch { /* best-effort, never blocks bootstrap */ }
```

**Warning signs:** Bootstrap time regression > 200ms, or user sees a flash of the old layout before the new one renders.

### Pitfall 3: `gitChangesTab` Signal Leaking Across Scopes

**What goes wrong:** Current `gitChangesTab = signal<GitChangesTabData | null>(null)` is module-global with no scope metadata. If a user opens Git Changes from main panel, then opens it from right panel's `+` menu, both panels might try to render it simultaneously, OR the user loses focus state. UI-SPEC D-07 requires "move, not duplicate".

**Why it happens:** The signal has no `scope` field.

**How to avoid:** Extend the signal shape:

```typescript
interface GitChangesTabData extends BaseTab {
  type: 'git-changes';
  owningScope: TerminalScope;  // NEW
}
```

The `UnifiedTabBar` renders the Git Changes tab entry only when `gitChangesTab.value?.owningScope === scope`. The right-panel `+` menu "Git Changes" action logic:

```typescript
function openGitChangesInRight(): void {
  const existing = gitChangesTab.value;
  if (existing?.owningScope === 'right') {
    // already in right — focus
    getScope('right').activeTabId.value = existing.id;
    return;
  }
  if (existing?.owningScope === 'main') {
    // move: update scope, remove from main's tabOrder, append to right's dynamic order
    existing.owningScope = 'right';
    gitChangesTab.value = { ...existing };
    removeFromMainTabOrder(existing.id);
    appendToRightTabOrder(existing.id);
    getScope('right').activeTabId.value = existing.id;
    return;
  }
  // create new owned by right
  gitChangesTab.value = { id: 'git-changes', type: 'git-changes', owningScope: 'right' };
  appendToRightTabOrder('git-changes');
  getScope('right').activeTabId.value = 'git-changes';
}
```

**Warning signs:** Two visible Git Changes tabs, or Git Changes tab disappearing on project switch.

### Pitfall 4: `activeProjectName` Change Race During Dual-Scope Restore

**What goes wrong:** Phase 17's editor-tab restore already wrestled with a race where `activeProjectName` change fires the `editorTabs` computed with empty array before restore runs. Dual-scope restore doubles the surface: both main and right scope restores read `activeProjectName` and write `right-terminal-tabs:<project>` / `terminal-tabs:<project>`.

**Why it happens:** Multiple subscribers on `activeProjectName` + `terminalTabs` + new `rightTerminalTabs` signals fire in undefined order during the project switch sequence.

**How to avoid:**
1. Apply the same `_suppressPersist` guard pattern used by `unified-tab-bar.tsx:373-379` to the right-scope's `persistTabState`.
2. Serialize restore: `restoreProjectTabs('main', ...)` awaited BEFORE `restoreProjectTabs('right', ...)` in main.tsx.
3. The existing `project-pre-switch` event at `main.tsx:506` already saves main-scope tabs via `saveProjectTabs(oldName)`. Extend to also save right-scope: `saveProjectTabs(oldName, 'right')`.

**Warning signs:** On project switch, right-scope tabs from the previous project leak into the new project, or right-scope active tab resets to File Tree unexpectedly.

### Pitfall 5: WebGL Context Pressure with Multiple xterm Instances

**What goes wrong:** Each xterm.js terminal instantiates a WebGL2 context via `@xterm/addon-webgl`. WKWebView / Safari has per-page WebGL context limits (historically ~16 concurrent contexts on desktop macOS; lower on memory-pressured systems). A user with 4 main-panel terminals + 4 right-panel terminals = 8 contexts. Plus any CodeMirror instances using WebGL (they don't — CM6 uses Canvas/DOM by default). Still under limit at realistic usage, but not bulletproof.

**Why it happens:** Multi-scope multiplies terminal count ceiling from N to 2N.

**How to avoid:**
1. **Honor the existing `onContextLoss` handler pattern.** CLAUDE.md mandates it. Search existing `terminal-manager.ts` to confirm the handler wires DOM fallback. Verify in the WebGL addon init path.
2. **Don't multiply test load artificially.** Real users will rarely have >4 terminals per scope. Design for 8 total, tolerate up to 16.
3. **On context loss, don't cascade re-init.** A single context-loss event in one tab should fall back that tab only. The addon's `onContextLoss` is per-instance.

**Verification to perform during execution:** Grep `onContextLoss` in `src/terminal/*.ts` to confirm the fallback is wired. If missing, add it per CLAUDE.md. This is pre-existing scope but worth flagging — phase 20 is the first time this failure mode has real user exposure.

**Warning signs:** Random tabs go blank after memory pressure. Black rectangles where terminal content should be.

### Pitfall 6: Sticky Tab Body Z-Order vs Terminal Container

**What goes wrong:** The right-panel content area must layer:
- Sticky body (FileTree / GSDPane / GitChangesTab) — mounted always, `display: block | none`
- Terminal containers wrapper — mounted always, contains N terminal `<div>`s

If both a sticky body AND a terminal are set to `display: block` (e.g., during tab-switch mid-transition), users see overlapping content. The existing main-panel avoids this because it has ONLY terminal containers — no sticky bodies.

**Why it happens:** Tab switching mutates `activeTabId.value` synchronously, but the DOM-side `display` toggle happens inside `switchToTab` which operates only on terminal containers. Sticky bodies are Preact components whose `display` style is derived from the signal — they re-render on next flush. Brief overlap possible.

**How to avoid:**
1. Make sticky bodies AND terminal containers wrapper mutually exclusive using the same active-tab signal driven style:
   ```tsx
   <div style={{ display: activeTabId.value === 'file-tree' ? 'block' : 'none' }}>
     <FileTree />
   </div>
   <div style={{ display: activeTabId.value === 'gsd' ? 'block' : 'none' }}>
     <GSDPane />
   </div>
   <div style={{ display: ['file-tree','gsd','git-changes'].includes(activeTabId.value) ? 'none' : 'block' }}
        class="terminal-containers" data-scope="right">
     {/* terminal containers — always flex layout inside */}
   </div>
   ```
2. The `switchToTab(tabId)` function inside terminal-tabs.tsx loops containers and toggles their `display` individually. That inner loop is OK when the wrapper itself is also hidden — the inner containers don't leak.

**Warning signs:** Flash of FileTree overlaying a terminal during tab switch, or File Tree visible over an active terminal.

### Pitfall 7: Drag-Reorder Accepts Drop onto Sticky Position

**What goes wrong:** The current drag impl at `unified-tab-bar.tsx:747-775` resolves the drop target by iterating `document.querySelectorAll('[data-tab-id]')`. If sticky tabs also get `data-tab-id`, a drag could reorder a terminal tab to position 0 or 1, pushing File Tree / GSD to the right — violating D-03.

**Why it happens:** Hit-test selector is too broad.

**How to avoid:** Either
1. Give sticky tabs `data-tab-id="sticky-file-tree"` / `"sticky-gsd"` and filter them in the drop-resolver by prefix check.
2. Use a separate attribute `data-sticky-tab` for sticky tabs and `data-dynamic-tab-id` for dynamic tabs. Drop resolver uses only the dynamic selector.

Option 2 is cleaner but requires updating the existing main-panel drag path too. Option 1 is one-line filter addition. **Recommend Option 1**.

**Warning signs:** User drags Terminal 1 left past File Tree, File Tree now at position 2. `tabOrder` persistence now holds `['terminal-1', 'file-tree-id', 'gsd-id']` which breaks the next render.

## Code Examples

### Example 1: Scope-Aware `createNewTab`

```typescript
// Source: derived from src/components/terminal-tabs.tsx:118-223 (current main-only impl)

async function createNewTabScoped(
  scope: TerminalScope,
  options?: CreateTabOptions,
): Promise<TerminalTab | null> {
  const s = getScope(scope);
  const wrapper = document.querySelector(s.containerSelector);
  if (!wrapper) {
    console.error(`[efxmux] container not found for scope ${scope}`);
    return null;
  }

  s.counter.n++;
  const id = `tab-${scope}-${Date.now()}-${s.counter.n}`;

  const activeName = activeProjectName.value;
  // Main: bare <project> for first, <project>-<N> otherwise
  // Right: <project>-r<N> for all (even first, per D-14 examples: -r1, -r2)
  let sessionSuffix: string | undefined;
  if (scope === 'main') {
    sessionSuffix = s.counter.n > 1 ? String(s.counter.n) : undefined;
  } else {
    sessionSuffix = `r${s.counter.n}`;
  }
  const sessionName = projectSessionName(activeName, sessionSuffix);

  // ... rest identical to current createNewTab: resolveAgentBinary, createTerminal,
  //     connectPty, attachResizeHandler, register tab in s.tabs, activate, persist
}
```

### Example 2: Right-Panel Component Skeleton

```tsx
// Source: new src/components/right-panel.tsx (full rewrite replacing current file)

import { colors } from '../tokens';
import { UnifiedTabBar } from './unified-tab-bar';
import { GSDPane } from './gsd-pane';
import { FileTree } from './file-tree';
import { GitChangesTab } from './git-changes-tab';
import { gitChangesTab } from './unified-tab-bar';
import { getTerminalScope } from './terminal-tabs';

export function RightPanel() {
  const { activeTabId } = getTerminalScope('right');
  const activeId = activeTabId.value;
  const gcOwned = gitChangesTab.value?.owningScope === 'right';

  return (
    <aside class="right-panel flex flex-col"
      aria-label="Right panel"
      style={{ backgroundColor: colors.bgBase, borderLeft: `1px solid ${colors.bgBorder}` }}>
      <UnifiedTabBar scope="right" />
      <div class="right-panel-content flex-1 relative overflow-hidden">
        <div style={{ height: '100%', display: activeId === 'file-tree' ? 'block' : 'none' }}>
          <FileTree />
        </div>
        <div style={{ height: '100%', display: activeId === 'gsd' ? 'block' : 'none' }}>
          <GSDPane />
        </div>
        {gcOwned && (
          <div style={{ height: '100%',
            display: activeId === gitChangesTab.value?.id ? 'block' : 'none' }}>
            <GitChangesTab />
          </div>
        )}
        <div class="terminal-containers absolute inset-0" data-scope="right"
             style={{ display: ['file-tree', 'gsd', gitChangesTab.value?.id].includes(activeId) ? 'none' : 'block' }}>
          {/* per-tab containers are appended by createNewTabScoped */}
        </div>
      </div>
    </aside>
  );
}
```

### Example 3: Legacy Migration Bootstrap

```typescript
// Source: new code at main.tsx bootstrap, immediately after cleanup_dead_sessions

try {
  await invoke('cleanup_dead_sessions');
} catch {}

// Phase 20 D-19: kill any legacy <project>-right tmux sessions from prior layout
try {
  const projectNames = projects.value.map(p => p.name);
  if (projectNames.length > 0) {
    await invoke('kill_legacy_right_sessions', { projectNames });
  }
} catch {
  // Non-fatal: migration is best-effort, session may already be gone
}

// Phase 20 D-20: drop legacy state keys on next save (idempotent, silent)
const state = getCurrentState();
if (state) {
  delete state.panels?.['right-bottom-tab'];
  delete state.session?.['right-tmux-session'];
  delete state.layout?.['right-h-pct'];
  // saveAppState will be called later in bootstrap flow — keys won't reappear
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `rightBottomTab` signal + dedicated Bash pane | Unified tab bar with sticky + dynamic segments | Phase 20 (this phase) | Removes split + bottom pane; collapses mental model into one tab bar pattern |
| Single-instance `terminal-tabs.tsx` module (main only) | Scope-parametrized registry (`main` + `right`) | Phase 20 | Two independent tab sets over one shared pipeline |
| `switch-bash-session` DOM event for right-panel project switch | Per-scope tab cache / restore (shared pattern with main) | Phase 20 D-21 | Removes a custom event; fewer moving parts |
| HTML5 drag-drop API | Mouse-based drag (mousedown → move → up) | Phase 17 | Required because WKWebView native drag is broken |

**Deprecated/outdated:**
- `rightBottomTab` signal — removed entirely. Any residual references in code or tests must be cleaned.
- `state.session['right-tmux-session']` default — remove from `state-manager.ts` defaults block.
- `state.layout['right-h-pct']` default — remove from `state-manager.ts` defaults block.
- `state.panels['right-bottom-tab']` default — remove from `state-manager.ts` defaults block.
- `handleSwitchBash` DOM event listener at `right-panel.tsx:80-90` — removed.
- `switch_tmux_session` Tauri command — NOT removed (still used by main panel for project switch). Verify no right-scope caller remains after the refactor.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WKWebView supports 8+ concurrent WebGL2 contexts without degradation under typical RAM budgets | Pitfall 5 | If limit is lower, users with many tabs see blank terminals; mitigated by existing `onContextLoss` fallback (if wired) |
| A2 | Running `tmux kill-session -t <name>` for a non-existent session returns exit code 1 silently without user-visible output | Runtime State Inventory / Pitfall 2 | If tmux outputs to stderr in some versions, users see spurious log lines; low impact |
| A3 | The crash-restart suffix (`r<N>`) with renamed `rr<N>` does not collide with any other downstream consumer | Pitfall 1 | Planner must verify no external tooling greps for `r<N>` in tmux names |

**Claim provenance legend:**
- Most claims in this document are `[VERIFIED]` by direct codebase read (file paths + line numbers cited inline).
- Stack version claims are `[VERIFIED: package.json]`.
- WebGL context limits are training-knowledge approximations — flagged above as [ASSUMED].

## Open Questions

1. **Which icons for sticky tabs?**
   - What we know: UI-SPEC mentions `FolderOpen` and `ListChecks` in the Component Inventory; CONTEXT.md Claude's Discretion mentions `FolderTree` and `ListChecks`.
   - What's unclear: `FolderOpen` vs `FolderTree` — UI-SPEC's rendering contract overrides CONTEXT's suggestion.
   - Recommendation: Follow UI-SPEC (`FolderOpen` for File Tree, `ListChecks` for GSD) since it is the explicit design contract.

2. **Does `@xterm/addon-webgl@0.19.0` have a functional `onContextLoss` hook?**
   - What we know: CLAUDE.md mandates the fallback pattern.
   - What's unclear: Whether the current `terminal-manager.ts` actually wires it. Not part of Phase 20 scope, but relevant to Pitfall 5 if a regression surfaces.
   - Recommendation: Grep `terminal-manager.ts` for `onContextLoss` during planning. If absent, add a non-blocking task to wire it. Do NOT gate Phase 20 on this fix.

3. **Should the visual divider between sticky segment and dynamic segment render on empty-dynamic state?**
   - What we know: UI-SPEC says "renders when at least one dynamic tab exists".
   - What's unclear: If a user closes all terminals, does the divider vanish mid-interaction?
   - Recommendation: Follow UI-SPEC verbatim — conditional render on `dynamicTabs.length > 0`.

4. **How does the right-panel `+` button visual match the main-panel `+`?**
   - What we know: UI-SPEC says "match existing main-panel `+` button style exactly".
   - What's unclear: The main-panel `+` button is the `Dropdown` trigger at `unified-tab-bar.tsx:909-936`, a 28×28 rounded button with hover border. Reusing the same `Dropdown` with same trigger styling satisfies this.
   - Recommendation: Single source of truth — the existing Dropdown trigger. Scope-branch the `items` array only.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + pnpm | Build/test | Assumed ✓ | project uses pnpm (feedback-pnpm.md) | — |
| tmux | Legacy session cleanup | Assumed ✓ | ≥3.x (per CLAUDE.md) | kill-legacy migration is best-effort; non-fatal on failure |
| Tauri 2.10.x + Rust toolchain | PTY commands | Assumed ✓ | 2.10.3 (CLAUDE.md version matrix) | — |
| xterm.js 6.0.0 + WebGL addon 0.19.0 | Terminal rendering | ✓ (package.json) | 6.0.0 / 0.19.0 | DOM renderer (xterm.js built-in) on WebGL context loss |
| vitest + @testing-library/preact | Tests | ✓ (package.json) | 4.1.4 / 3.2.4 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — all deps available.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 + @testing-library/preact 3.2.4 |
| Config file | vitest.config.ts (project root) |
| Quick run command | `pnpm test -- <path-to-test>` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SIDE-02 | User clicks right-panel `+` menu and spawns Terminal tab in right scope | component | `pnpm test -- src/components/right-panel.test.tsx` | ❌ Wave 0 |
| SIDE-02 | Spawned right-panel terminal uses `-r<N>` session naming | unit | `pnpm test -- src/components/terminal-tabs.test.ts` | ❌ Wave 0 |
| D-05 | `UnifiedTabBar scope="right"` renders File Tree + GSD sticky tabs without close button | component | `pnpm test -- src/components/unified-tab-bar.test.tsx` | ❌ Wave 0 |
| D-03 | Dragging a dynamic tab onto sticky position is rejected (no reorder) | component | `pnpm test -- src/components/unified-tab-bar.test.tsx` | ❌ Wave 0 |
| D-07 | Git Changes opened from right `+` moves from main to right (no duplication) | component | `pnpm test -- src/components/unified-tab-bar.test.tsx` | ❌ Wave 0 |
| D-10 / D-11 | `terminal-tabs.tsx` top-level exports still resolve to `'main'` scope (backward compat) | unit | `pnpm test -- src/components/terminal-tabs.test.ts` | ❌ Wave 0 |
| D-10 | `getTerminalScope('right')` returns independent tabs array (no leak from main) | unit | `pnpm test -- src/components/terminal-tabs.test.ts` | ❌ Wave 0 |
| D-15 / D-16 | `right-terminal-tabs:<project>` persistence round-trip preserves dynamic tabs across restart | unit | `pnpm test -- src/components/terminal-tabs.test.ts` | ❌ Wave 0 |
| D-17 | New-project default: right scope has no dynamic tabs, active = 'file-tree' | component | `pnpm test -- src/components/right-panel.test.tsx` | ❌ Wave 0 |
| D-19 | Legacy `kill_legacy_right_sessions` migration invoked at bootstrap | integration | `pnpm test -- src/main.test.ts` | ❌ Wave 0 (may require mockIPC) |
| D-20 | Legacy state keys dropped from `AppState` default | unit | `pnpm test -- src/state-manager.test.ts` | ❌ Wave 0 |
| D-21 | `switch-bash-session` event listener absent after refactor | component | `pnpm test -- src/components/right-panel.test.tsx` | ❌ Wave 0 |
| Pitfall 1 | Crash-restart uses `rr<N>` suffix (no collision with right-scope `-r<N>`) | unit | `pnpm test -- src/components/terminal-tabs.test.ts` | ❌ Wave 0 |
| Pitfall 3 | `gitChangesTab.owningScope` field governs which panel renders the tab | unit | `pnpm test -- src/components/unified-tab-bar.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test -- <specific-test-file>` — ~5 seconds per file
- **Per wave merge:** `pnpm test` — full suite (~30-60 seconds based on current 119-test baseline)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus manual UAT (see Happy Path / Edge Cases below)

### Wave 0 Gaps

All of these are NEW test files — none exist today for the components/modules this phase touches beyond `gsd-pane.test.tsx`:

- [ ] `src/components/unified-tab-bar.test.tsx` — sticky tab rendering, drag-reject on sticky position, scope prop branching, plus-menu item set per scope
- [ ] `src/components/right-panel.test.tsx` — single-pane layout, sticky body mount/display, terminal containers wrapper, absence of `switch-bash-session` listener
- [ ] `src/components/terminal-tabs.test.ts` — scope registry isolation, backward-compat exports, `-r<N>` naming, `rr<N>` crash-restart suffix, persistence round-trip per scope
- [ ] `src/state-manager.test.ts` — `AppState` default shape no longer contains the 3 legacy keys; load/save ignores unknown keys
- [ ] (optional) `src/main.test.ts` — bootstrap invokes `kill_legacy_right_sessions` after `cleanup_dead_sessions`; may be too much integration for unit harness — consider spiking this into a targeted tmux-migration test in Rust side instead

**Framework install:** none needed — vitest + testing-library already present.

### Measurable Validation Axes

**Happy path**
- Launch app with existing project. Right panel shows File Tree + GSD tabs only. Active = File Tree. No split handle. No Bash pane. No horizontal `split-handle-h`.
- Click `+` menu → "Terminal (Zsh)". A new tab labeled "Terminal 1" appears. Session name is `<project>-r1`. Zsh prompt renders.
- Click `+` → "Agent". Agent tab appears. Session `<project>-r2`. Agent binary spawned in that tmux session.
- Double-click terminal tab label → rename input appears. Type "Deploy", Enter. Tab now reads "Deploy". Persisted.
- Close the terminal tab via `×`. Agent tab remains active.
- Close the agent tab via `×`. ConfirmModal appears with "Quit Agent Only / Close Terminal / Cancel". "Close Terminal" destroys PTY.
- Close all dynamic tabs. File Tree + GSD remain. Active tab defaults back to File Tree.
- Restart app. Right-panel tabs restore to their pre-quit state. Main-panel tabs unaffected.

**Edge cases**
- Open Git Changes from main-panel `+`. Then open Git Changes from right-panel `+`. Tab moves from main to right. Main's active tab falls back to adjacent.
- Drag Terminal 1 leftward past File Tree. Reorder rejected — File Tree stays at position 0.
- Drag Terminal 2 onto Terminal 1 position. Reorder succeeds within dynamic segment.
- Switch project. Right-panel tabs from project A save; project B restores its own right-panel tabs (or defaults if first visit).
- State.json from prior version (before upgrade) still contains `right-tmux-session: 'foo-right'`. On first boot of new version, key is dropped silently and `foo-right` tmux session is killed.
- tmux not running at bootstrap. `kill_legacy_right_sessions` silently no-ops. Bootstrap continues without error banner.

**Failure modes**
- PTY exit on right-panel terminal → `CrashOverlay` renders over that tab's body. "Restart" button re-spawns PTY under `rr<N>` session name (NOT `-r<N>+1`, to avoid collision with subsequent new-tab numbering).
- tmux session name collision (e.g., user manually created a tmux session named `<project>-r1`): `spawn_terminal` reattaches to the existing session per pty.rs logic. Edge case — low probability; non-catastrophic.
- WebGL context loss on one tab under memory pressure: that tab falls back to DOM renderer; other tabs unaffected (per xterm.js per-instance context design).

**Observability**
- Console log on legacy migration: `[efxmux] killed legacy right sessions: [...]`
- Console warn on per-scope restore failure: `[efxmux] Failed to restore right-scope tabs:`
- No user-facing toast or banner for migration (silent per D-19).

**Performance**
- Bootstrap time regression budget: +100ms for legacy migration (n ≤ 20 projects × ~5ms each for `tmux has-session` + `kill-session`). If higher, defer the migration to a background task after first render.
- Tab switch latency: identical to main panel (xterm.js `switchToTab` pattern). No regression expected.
- WebGL contexts at worst case: 8 (4 main + 4 right) — well within WKWebView's 16-context ballpark.

## Project Constraints (from CLAUDE.md)

- **xterm.js 6.0 required** — NOT 5.x. `@xterm/addon-canvas` does NOT exist in 6.0.
- **xterm.js WebGL addon must listen to `onContextLoss`** and fall back to DOM renderer gracefully. Multi-terminal scenarios (this phase) increase context pressure.
- **Tauri 2 import paths:** `invoke` from `@tauri-apps/api/core`, `listen` from `@tauri-apps/api/event`. Already compliant in existing code — do not regress.
- **portable-pty `take_writer()` is one-shot** — Phase 20 does not change the pipeline; reuse `connectPty` as-is.
- **pnpm, not npm** — all dependency / test commands use pnpm (per feedback-pnpm.md). Package.json is already set up for pnpm.
- **Solarized Dark / Tailwind 4 `@theme` tokens** — no hardcoded hex. Right-panel rewrite must use `colors.bgBase`, `colors.bgBorder`, etc. UI-SPEC enforces this.
- **Branding: efxmux (lowercase)** — not "GSD MUX". Session name prefix stays `efx-mux` as fallback when no active project. Already compliant in `session-name.ts:6`.
- **French Mac keyboard (AZERTY):** Any keyboard shortcuts must have clickable UI alternatives. This phase defers keyboard shortcuts per CONTEXT.md deferred list — no shortcut work → no new accessibility gaps introduced.
- **GSD workflow enforcement:** This phase is already in a GSD branch (`gsd/phase-20-right-panel-multi-terminal`), so file-changing tools are permitted.

## Security Domain

No new IPC surface, no new user input paths beyond existing UnifiedTabBar interaction model, no new file-system access. Existing PTY sanitization in `pty.rs:62-65` (alphanumeric + `-` + `_` only) already covers the new `-r<N>` naming. No new secrets, no new network surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth surface touched |
| V3 Session Management | no | No web session state |
| V4 Access Control | no | Single-user desktop app |
| V5 Input Validation | yes | Reuse existing pty.rs session-name sanitization (regex filter to `[a-zA-Z0-9_-]`) |
| V6 Cryptography | no | No crypto touched |

### Known Threat Patterns for Tauri + PTY

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via session name | Tampering / Elevation | Already mitigated — `pty.rs:62-65` filters to `[a-zA-Z0-9_-]` before passing to `tmux` |
| Path traversal via project path | Tampering | Out of scope — project path handling unchanged |
| PTY write from untrusted source | Tampering | `invoke('write_pty', ...)` is called only from trusted frontend code; no external surface |

## Sources

### Primary (HIGH confidence)

- `src/components/unified-tab-bar.tsx` (read in full) — drag impl, plus-menu, per-project signals, git-changes signal
- `src/components/terminal-tabs.tsx` (read in full) — scope refactor target; existing API surface
- `src/components/right-panel.tsx` (read in full) — current dual-pane layout to be replaced
- `src/state-manager.ts` (read in full) — AppState shape, persistence flow
- `src/utils/session-name.ts` (read in full) — suffix behavior
- `src/main.tsx` (lines 340-580 read) — bootstrap sequence, project-switch flow, tab cache wiring
- `src-tauri/src/terminal/pty.rs` (sections 1-120, 500-600 read) — session sanitization, destroy behavior, `cleanup_dead_sessions` precedent
- `package.json` (read) — stack versions verified
- `.planning/phases/20-right-panel-multi-terminal/20-CONTEXT.md` — all D-01..D-21 decisions and discretion areas
- `.planning/phases/20-right-panel-multi-terminal/20-UI-SPEC.md` — visual & interaction contract
- `.planning/phases/17-main-panel-file-tabs/17-CONTEXT.md` — prior-art for UnifiedTabBar pattern
- `.planning/phases/19-gsd-sub-tabs/19-CONTEXT.md` — prior-art for GSDPane mounting
- `CLAUDE.md` — stack matrix, xterm WebGL notes, pnpm directive

### Secondary (MEDIUM confidence)

- WKWebView WebGL2 context ceiling (general knowledge, not session-verified) — relevant to Pitfall 5

### Tertiary (LOW confidence)

- None — all critical claims are verified against the codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json
- Architecture (scope registry pattern): HIGH — derived by analogy to the per-project Map already in `unified-tab-bar.tsx`
- Pitfalls: HIGH — #1 (collision) verified from `terminal-tabs.tsx:485`; #2 (migration hook) verified from `main.tsx:402`; #3 (gitChangesTab scope) verified from `unified-tab-bar.tsx:113`; #5 (WebGL contexts) MEDIUM (training-knowledge ceiling)
- Runtime state inventory: HIGH — grep-verified absence of OS/secret/artifact state
- Validation axes: MEDIUM — test files don't yet exist; planner to confirm shape with existing `gsd-pane.test.tsx` pattern

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — stable stack, stable phase boundary; re-verify if CLAUDE.md stack versions change)
