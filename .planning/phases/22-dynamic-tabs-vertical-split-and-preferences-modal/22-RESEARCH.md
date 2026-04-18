# Phase 22: Dynamic tabs, vertical split, and preferences modal - Research

**Researched:** 2026-04-18
**Domain:** Preact UI refactor — scope generalization, cross-scope drag, xterm.js multi-instance, Tauri titlebar
**Confidence:** HIGH

## Summary

Phase 22 is a UI-layer refactor that reuses the existing Phase 17 / 19 / 20 primitives almost verbatim. There are three coordinated changes:

1. **Sticky-to-dynamic tab conversion** — delete one code branch (`renderTab` sticky block at `unified-tab-bar.tsx:1682-1731`, `data-sticky-tab-id`, `getOrderedTabsForScope` prepend at `:1131-1143`, the `onTabMouseDown` sticky reject at `:1191`, and the divider block at `:1581-1603`). File Tree / GSD / Git Changes then render through `computeDynamicTabsForScope` like any other tab, gated by `ownerScope` and an expanded `TerminalScope` union.
2. **Scope ID generalization** — expand `TerminalScope = 'main' | 'right'` to `'main-0' | 'main-1' | 'main-2' | 'right-0' | 'right-1' | 'right-2'`. The scope registry in `terminal-tabs.tsx` already keys a `Map<TerminalScope, ScopeState>` on this string — adding four more entries is additive. Persistence keys shift from `terminal-tabs:<project>` to `terminal-tabs:<project>:<scope-id>`; a one-shot migration on load copies legacy keys to the `:main-0` / `:right-0` variants.
3. **Titlebar Preferences button** — 10-line mirror of `.titlebar-add-btn` in `src/main.tsx:91-98` plus a sibling CSS class in `src/styles/app.css:444-470`. The `togglePreferences()` pipeline already exists.

**Primary recommendation:** Keep PTY session names **stable on drag** per D-12, and solve the only real collision case (dragging tab X from `main-0` to `main-1` when `main-1` already owns a tab with the same sessionName) by introducing a **scope-free, monotonically increasing tab sequence number shared across all scopes for a project**. New tab names become `<project>`, `<project>-2`, `<project>-3`, … — no `-r` prefix, no scope embedded. This eliminates collisions by construction because the number is allocated once at create time and never changes on drag. It also **removes the `-r<N>` vs `-rr<N>` complexity from Phase 20**. The only migration concern is Phase 20's existing `-r<N>` right-scope sessions, which can either be adopted under the new shared counter or killed on first run (see D-12 recommendation below).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab render + drag + persist | Browser (Preact) | — | Pure UI state; scope + order live in `@preact/signals`. |
| Scope registry + per-scope tabs | Browser (Preact module) | — | `terminal-tabs.tsx` `Map<TerminalScope, ScopeState>`. No backend call. |
| PTY session spawn / kill | API / Rust (Tauri) | — | Unchanged — session names are scope-agnostic strings. |
| tmux session registry | System (tmux) | API (Rust) | Unchanged — name-based, agnostic to who owns the tab in the UI. |
| Titlebar Preferences button | Browser (HTML + CSS) | — | Mirror of existing `.titlebar-add-btn`; no native toolbar API. |
| Preferences panel render | Browser (Preact) | — | Existing `PreferencesPanel` component reused unchanged. |
| Cross-scope drag | Browser (mouse events) | — | Mouse-based (not HTML5 DnD — WKWebView hijacks). |
| Intra-zone resize | Browser (DOM handle) | State (state.json) | Reuse `drag-manager.ts` pattern; persist ratios in `AppState.layout`. |
| Singleton enforcement (GSD/Git Changes) | Browser (signal) | — | Single module-global signal per kind; target-scope dims `+` menu item. |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tab Architecture (sticky → dynamic)**

- **D-01:** Remove the sticky tab kind entirely from `UnifiedTabBar`. File Tree, GSD, Git Changes render through the same path as terminal/editor/agent tabs. `data-sticky-tab-id`, `renderStickyTab` branch, and the sticky-segment prepend in `getOrderedTabsForScope` (unified-tab-bar.tsx:1131–1143, 1689–1728) are deleted.
- **D-02:** First-launch defaults: `main-0` auto-spawns `Terminal-1`; `right-0` auto-spawns GSD + File Tree as dynamic tabs. No auto-spawn on `main-1..2`, `right-1..2` when created empty via split.
- **D-03:** Empty scope allowed. Closing the last tab in any scope leaves it with a placeholder ("+ to add tab"). No last-tab protection.
- **D-04:** Singleton global for GSD and Git Changes. Exactly one instance alive across all scopes. `+` menu item is dimmed in every scope when the singleton is already open elsewhere. Generalizes Phase 20 D-07.
- **D-05:** Fixed titles for File Tree, GSD, Git Changes (no double-click rename). Terminal / Agent / Editor tabs keep rename-on-double-click.
- **D-06:** Migration of existing `state.json`: drop sticky `'file-tree'` / `'gsd'` IDs silently from persisted active-tab and tab-order on load. First-launch defaults (D-02) re-create equivalent dynamic tabs.

**Vertical Split Model**

- **D-07:** Cap at 3 sub-panes per zone. `main-0`, `main-1`, `main-2` and `right-0`, `right-1`, `right-2` are the maximum. Split icon disabled when cap reached.
- **D-08:** Split icon in tab bar, right of `+`. New `[⬌]` icon button in every `UnifiedTabBar` instance. Click spawns an empty sibling scope below the current scope.
- **D-09:** Draggable resize handle between vertical split sub-panes. Cursor `ns-resize`. Ratios persisted per zone in `AppState.layout`.
- **D-10:** Scope identifier = hierarchical string. `TerminalScope` extends from `'main' | 'right'` to `'main-0' | 'main-1' | 'main-2' | 'right-0' | 'right-1' | 'right-2'`. Persistence keys: `terminal-tabs:<project>:<scope-id>`. Legacy keys migrate on load.

**Cross-Split Tab Drag**

- **D-11:** All tab types draggable between any scopes. Zero tab types pinned to origin scope.
- **D-12:** PTY session name is stable on scope move. No `tmux rename-session` on drag. Planner must add collision-avoidance (UUID suffix / rename-on-collision / shared counter).
- **D-13:** Singleton move behavior. Dragging GSD / Git Changes relocates the tab: `ownerScope` updates, source's `+` menu re-enables, target's dims.
- **D-14:** Drop affordance. Target tab bar shows accent border + insertion slot. Pane body does NOT tint. Reuses existing mouse-drag ghost.

**Preferences Titlebar Entry**

- **D-15:** HTML button in titlebar overlay zone, right side. Mirrors `.titlebar-add-btn`. Same `-webkit-app-region: no-drag`. Styled via `tokens.ts`.
- **D-16:** Icon: Lucide `Settings` gear, 18px. Planner may swap to `Cog2` if visual review prefers.
- **D-17:** Cmd+, keybind unchanged.
- **D-18:** Keep existing slide-in panel. No redesign to centered modal.

### Claude's Discretion

- Exact Lucide icon names for split (`SplitSquareVertical` vs `Rows2` vs custom) and preferences (`Settings` vs `Cog2`).
- Empty-scope placeholder content — plain text "`+` to add tab" vs subtle illustration.
- UUID length/format for PTY name collision avoidance (D-12). Could be short hash, short UUID slice, or sequential counter in a shared registry.
- Exact CSS for the new split-icon button (size, spacing relative to `+`).
- Whether intra-zone resize handle reuses `drag-manager.ts` primitive or gets its own module.
- Animation / transition on split add/remove (slide-in sibling pane? instant?).
- Rendering split body mounting strategy — always-mount all scopes with `display:none` toggle, or mount-on-activate.
- Whether `File Tree` as a dynamic tab kind gets a `+` menu item on `main` scope. Defaults to "yes, uniformly available."
- Test split between unit (scope-id migration, singleton enforcement, PTY collision) and component render tests (split rendering, drop-affordance, preferences button click).

### Deferred Ideas (OUT OF SCOPE)

- True multi-window support.
- Modal redesign of preferences.
- Keyboard shortcuts for split creation / navigation (Cmd+\, Cmd+Shift+Arrow).
- Tab-bar overflow UI (scroll arrows, overflow dropdown).
- N-unlimited splits (cap at 3).
- GSD / Git Changes multi-instance.
- Horizontal in-zone splits.
- Agent-quit confirm modal during cross-scope drag (planner to verify).
- Tab-drag into titlebar to spawn new window.

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 22 |
|-----------|-------------------|
| Project is `efxmux`, not `gsd-mux`. | Any new session-name prefixes (if we switch away from `-r<N>`) must keep `efx-mux` default fallback in `projectSessionName()`. |
| pnpm, not npm. | If the planner adds a new dep (not expected for this phase), install command is `pnpm add X`. |
| Tailwind 4 `@theme` tokens via `src/tokens.ts`. | All new CSS for split-icon button, prefs button, resize handle uses `colors.*` / `fonts.*` / `radii.*` — no hex. |
| xterm.js 6.0 WebGL addon context-loss. | Each of up to 6 scopes may host multiple xterm instances. WebKit soft-caps WebGL contexts (~8-16). `onContextLoss` fallback to DOM renderer is mandatory — already implemented in `terminal/terminal-manager.ts`. Splits amplify this risk. |
| `@tauri-apps/api` imports: `invoke` from `/core`, `listen` from `/event`. | No changes needed — existing imports correct. |
| Mouse-based drag (not HTML5 DnD) in WKWebView. | Drag generalization must keep `mousedown` → `mousemove` → `mouseup` pattern. Phase 20 Plan 20-05-E already wires this for cross-scope. |
| Tests beside components (`*.test.tsx`) using `@testing-library/preact` + `mockIPC`. | New tests live next to modified components. |
| Services centralize IPC (`file-service.ts`, `git-service.ts`). | No new IPC required for Phase 22 — scope changes are pure UI. |
| `display:none`/`block` toggling for tab bodies owning xterm WebGL. | Split rendering must always-mount and toggle `display`, never unmount on deactivation. |

## Phase Requirements

Phase 22 has no existing REQ-IDs in `REQUIREMENTS.md`. Researcher recommends the planner surface the following:

| ID | Description | Research Support |
|----|-------------|------------------|
| TABS-01 | File Tree, GSD, and Git Changes render as dynamic (closeable, drag-reorderable, add-via-`+`) tabs with fixed titles. | D-01, D-05, D-06 + `unified-tab-bar.tsx` sticky-branch deletion sites. |
| SPLIT-01 | User can split any zone (main / right) vertically into up to 3 stacked sub-panes via a split icon in the tab bar. | D-07, D-08 + Lucide `Rows2` availability verified. |
| SPLIT-02 | Sub-panes within a zone can be resized via a draggable horizontal handle between them; ratios persist across restart. | D-09 + `drag-manager.ts` existing `makeDragH` primitive. |
| SPLIT-03 | All tab kinds (Terminal, Agent, Editor, GSD, Git Changes, File Tree) can be dragged between any two scopes; drop affordance shows accent border + insertion slot. | D-11, D-13, D-14 + Phase 20 Plan 20-05-E cross-scope drag pattern. |
| SPLIT-04 | PTY session names remain stable across scope moves (no `tmux rename-session` on drag); collisions are prevented by shared project-scoped tab counter. | D-12 + recommended shared-counter strategy below. |
| PREF-01 | Preferences button in macOS titlebar (right side) opens the existing slide-in preferences panel; Cmd+, keybind unchanged. | D-15, D-16, D-17, D-18 + `.titlebar-add-btn` template. |

The `Traceability` table in `REQUIREMENTS.md` should be updated to map Phase 22 requirements.

## Standard Stack

All dependencies for this phase are **already in the project**. No new installs required.

### Core (in-project, reused)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `preact` | 10.29.1 [VERIFIED: package.json] | UI framework | Existing project stack. |
| `@preact/signals` | 2.9.0 [VERIFIED: package.json] | Reactive state | Existing pattern across all components. |
| `lucide-preact` | 1.8.0 [VERIFIED: package.json] | Icons | Contains `Settings`, `Rows2`, `Rows3`, `SquareSplitVertical`, `SquareSplitHorizontal` [VERIFIED: grep `node_modules/lucide-preact/dist/lucide-preact.d.ts`]. |
| `@xterm/xterm` | 6.0.0 [VERIFIED: package.json] | Terminal emulator | Existing — each scope hosts its own instances. |
| `@xterm/addon-webgl` | 0.19.0 [VERIFIED: package.json] | GPU renderer | Existing. `onContextLoss` fallback required when multiple scopes compete for WebGL contexts [CITED: xterm.js addon-webgl README]. |
| `@tauri-apps/api` | 2.10.1 [VERIFIED: package.json] | Tauri 2 frontend API | `getCurrentWindow().startDragging()` for titlebar drag already used. |

### Icon Selection

**Split icon — recommend `Rows2`.**

| Icon | Visual | Recommendation |
|------|--------|----------------|
| `Rows2` | Two horizontal rows stacked vertically [CITED: lucide.dev/icons/rows-2] | ✓ **Matches the top/bottom split semantic exactly.** Created in Lucide v0.185.0, stable. |
| `Rows3` | Three horizontal rows | Alternative when 3-pane state — but UI would need to swap icon based on current split count. Reject: visual instability. |
| `SquareSplitVertical` | Square split by vertical line (side-by-side panes) | Reject: visually implies horizontal split (left/right), opposite of phase intent. |
| `SquareSplitHorizontal` | Square split by horizontal line | Visually correct but heavier frame. `Rows2` is cleaner. |
| `SplitSquareVertical` | Does NOT exist in lucide-preact 1.8.0 [VERIFIED: grep] | Reject: CONTEXT.md D-08 mentioned this name — it's a drift. Use `Rows2`. |

**Preferences icon — `Settings`** (18px per D-16). `Cog2` is a visual sibling; either works. Keep `Settings` for simpler name mapping.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared monotonic counter for PTY names | Short UUID slice (`-r${nanoid(6)}`) | Longer names in `tmux ls`; no ordering signal. Counter wins for readability + collision-proof. |
| Always-mount N sub-scopes | Mount-on-activate | Saves WebGL contexts (a real WebKit limit concern) BUT loses xterm scrollback + parse cache state. **Always-mount is established pattern**; stick with it. Mitigate WebGL pressure via `onContextLoss` fallback (already implemented). |
| Intra-zone resize reusing `drag-manager.ts` | New module per scope pair | `drag-manager.ts` is 156 LOC of handle-agnostic mouse plumbing. Reuse wins. |

## Architecture Patterns

### System Architecture Diagram

```
 User Input (click split icon / drag tab / click prefs btn)
           │
           ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ UnifiedTabBar (Preact, scope-parametrized)                   │
 │   • renderTab (sticky branch DELETED)                        │
 │   • onTabMouseDown → reorder state machine                   │
 │   • buildDropdownItems(scope) — dims GSD/GitChanges when     │
 │     singleton already open in another scope                  │
 │   • Split icon [Rows2] → spawns sibling scope                │
 └──────────────┬────────────────────────┬─────────────────────┘
                │                        │
                ▼                        ▼
  ┌─────────────────────────┐  ┌──────────────────────────────┐
  │ handleCrossScopeDrop    │  │ spawnSubScope(zone)          │
  │ (generalized to all     │  │ • allocates next free id:    │
  │  tab kinds; flips       │  │   main-1 / main-2 / right-1…│
  │  ownerScope)            │  │ • mounts empty UnifiedTabBar│
  └─────────────┬───────────┘  │ • triggers re-render of zone│
                │              └──────────────┬───────────────┘
                ▼                             ▼
  ┌───────────────────────────────────────────────────────────┐
  │ scope registry (terminal-tabs.tsx)                         │
  │   Map<TerminalScope, ScopeState>                           │
  │   keys: 'main-0' | 'main-1' | 'main-2'                     │
  │         | 'right-0' | 'right-1' | 'right-2'                │
  │   Each ScopeState holds: tabs signal, activeTabId signal,  │
  │   counter, containerSelector, persistenceKey, cache         │
  └────────────────────────────┬──────────────────────────────┘
                               │
                 ┌─────────────┴──────────────┐
                 ▼                            ▼
  ┌─────────────────────────┐    ┌───────────────────────────┐
  │ PTY session (Rust/tmux) │    │ state.json                 │
  │ name STABLE across      │    │ terminal-tabs:<proj>:<id>  │
  │ scope moves             │    │ layout.{main,right}-ratios │
  └─────────────────────────┘    └───────────────────────────┘

 Titlebar (src/main.tsx:91-98 area)
   [ + ] ← drag-region ─ … ─ drag-region ─ [ ⚙ Settings ]
          left add-btn                       NEW right prefs-btn
                                             → togglePreferences()
                                               (existing signal in preferences-panel.tsx)
```

### Recommended Project Structure

```
src/
├── components/
│   ├── unified-tab-bar.tsx           # Sticky branch DELETED; split icon ADDED
│   ├── main-panel.tsx                # Rewrite: N sub-scope tab bars stacked
│   ├── right-panel.tsx               # Rewrite: N sub-scope tab bars stacked
│   ├── terminal-tabs.tsx             # Scope union expanded; legacy-key migration
│   └── preferences-panel.tsx         # Unchanged
├── state-manager.ts                  # TerminalScope union; split ratios; sticky-ID drop
├── drag-manager.ts                   # Extended to register intra-zone H handles
├── main.tsx                          # Titlebar prefs button insertion
└── styles/app.css                    # .titlebar-prefs-btn, .split-handle-v-intra,
                                      # .tab-bar-split-icon
```

### Pattern 1: Hierarchical Scope String Union Expansion

**What:** Widen the `TerminalScope` type alias and extend the scope registry map; all consumers that already pass `TerminalScope` continue to work without code changes at call sites.

**When to use:** Any time the scope axis expands. The same pattern will apply if a future phase adds horizontal sub-splits.

**Example:**

```typescript
// terminal-tabs.tsx — before
export type TerminalScope = 'main' | 'right';

const scopes = new Map<TerminalScope, ScopeState>([
  ['main', createScopeState('main')],
  ['right', createScopeState('right')],
]);

// terminal-tabs.tsx — after
export type TerminalScope =
  | 'main-0' | 'main-1' | 'main-2'
  | 'right-0' | 'right-1' | 'right-2';

const scopes = new Map<TerminalScope, ScopeState>([
  ['main-0',  createScopeState('main-0')],
  ['main-1',  createScopeState('main-1')],
  ['main-2',  createScopeState('main-2')],
  ['right-0', createScopeState('right-0')],
  ['right-1', createScopeState('right-1')],
  ['right-2', createScopeState('right-2')],
]);

// persistence key change inside createScopeState:
// OLD:  `terminal-tabs:${projectName}` (main only) / `right-terminal-tabs:${projectName}`
// NEW:  `terminal-tabs:${projectName}:${scope}`   (scope is the full hierarchical id)
```

**Follow-up:** The scope-agnostic `pty-exited` listener at `terminal-tabs.tsx:962-978` already iterates all registered scopes — expanding the Map to 6 entries is transparent.

### Pattern 2: Legacy-Key Migration (Template: Phase 20 D-20)

**What:** On `loadAppState`, after parsing the raw JSON, walk `state.session` for legacy keys that match old naming, copy values to the new scope-suffixed keys, then `delete` the legacy keys. Idempotent — running the migration multiple times is a no-op after the first.

**Example:**

```typescript
// state-manager.ts loadAppState — after existing Phase 20 D-20 migration
if (currentState) {
  const session = currentState.session as Record<string, string | undefined>;

  // Phase 22: migrate Phase 17/20 persistence keys to hierarchical scope ids.
  // Legacy:  terminal-tabs:<project>          → terminal-tabs:<project>:main-0
  //          right-terminal-tabs:<project>    → terminal-tabs:<project>:right-0
  for (const key of Object.keys(session)) {
    const mainLegacy = /^terminal-tabs:([^:]+)$/.exec(key);
    if (mainLegacy) {
      const project = mainLegacy[1];
      const target = `terminal-tabs:${project}:main-0`;
      if (session[target] === undefined) session[target] = session[key];
      delete session[key];
      continue;
    }
    const rightLegacy = /^right-terminal-tabs:(.+)$/.exec(key);
    if (rightLegacy) {
      const project = rightLegacy[1];
      const target = `terminal-tabs:${project}:right-0`;
      if (session[target] === undefined) session[target] = session[key];
      delete session[key];
    }
  }

  // D-06: drop sticky IDs from persisted active-tab fields + per-scope tab orders.
  // These must be stripped in-place inside each parsed per-scope blob because
  // the structure is { tabs: [...], activeTabId: string }.
  for (const key of Object.keys(session)) {
    if (!/^terminal-tabs:.+:(main|right)-[0-2]$/.test(key)) continue;
    try {
      const parsed = JSON.parse(session[key] as string);
      if (parsed.activeTabId === 'file-tree' || parsed.activeTabId === 'gsd') {
        parsed.activeTabId = '';  // re-resolve at runtime via D-02 defaults
        session[key] = JSON.stringify(parsed);
      }
    } catch { /* corrupt entry — leave alone, existing fail-soft handles it */ }
  }
}
```

**Reference:** The Phase 20 D-20 implementation in `state-manager.ts:82-89` is the minimal template to extend. [VERIFIED: read state-manager.ts:82-89]

### Pattern 3: Generalized Singleton Ownership

**What:** A singleton tab kind (GSD, Git Changes) is represented by a **single module-global signal** carrying `{ id, owningScope: TerminalScope }`. The `+` menu in each scope reads this signal reactively and dims its item when `owningScope !== null && owningScope !== currentScope`. Drag flips `owningScope`. This is the Phase 20 D-07 pattern generalized from Git Changes to GSD.

**Example:**

```typescript
// unified-tab-bar.tsx — pattern to generalize Phase 20 D-07
export interface GsdTabData extends BaseTab {
  type: 'gsd';
  owningScope: TerminalScope;   // ← new; mirrors GitChangesTabData.owningScope
}
export const gsdTab = signal<GsdTabData | null>(null);

// Inside buildDropdownItems(scope: TerminalScope):
const gsdOwnedElsewhere = gsdTab.value !== null && gsdTab.value.owningScope !== scope;
return [
  // ... Terminal, Agent items
  {
    label: 'GSD',
    icon: ListChecks,
    action: () => openOrMoveGsdToScope(scope),
    disabled: gsdOwnedElsewhere,
  },
  {
    label: 'Git Changes',
    icon: FileDiff,
    action: () => openOrMoveGitChangesToScope(scope),
    disabled: gitChangesTab.value !== null && gitChangesTab.value.owningScope !== scope,
  },
  // File Tree: NOT a singleton — every scope can have its own File Tree tab
  {
    label: 'File Tree',
    icon: FolderOpen,
    action: () => openFileTreeTabInScope(scope),
  },
];
```

**Decision for planner (Claude's Discretion area):** File Tree is **not** a singleton. Every scope can hold its own File Tree tab. This matches the "uniformly available" principle. The File Tree component itself is stateless from a singleton perspective — it reads the project tree from a shared source of truth. Rendering two File Tree bodies side-by-side is fine (both display the same tree; UI state like expand/collapse may diverge).

### Pattern 4: Cross-Scope Drag (Already in Place)

**What:** Phase 20 Plan 20-05-E + 20-05-D already implement `handleCrossScopeDrop` in `unified-tab-bar.tsx:1364-1461`. The function handles terminal, editor, git-changes, and sticky (no-op) tabs. Phase 22 generalizes by:
1. Deleting the sticky no-op branch (`unified-tab-bar.tsx:1371-1372`) — sticky kinds no longer exist.
2. Adding a branch for GSD and File Tree (when File Tree becomes a dynamic tab).
3. Accepting **any** `sourceScope` / `targetScope` from the expanded `TerminalScope` union. The existing function is already parametric on `TerminalScope` — no type changes needed.

**Drop affordance (D-14):** The target tab bar already sets `borderLeft` / `borderRight` on the tab under the cursor [VERIFIED: `unified-tab-bar.tsx` cleanupReorder clears `el.style.borderLeft` / `borderRight`]. For cross-scope drops, the **target tab bar** should also gain a single accent-colored outer border for the duration of the drag. Implementation: toggle a `.drop-target` CSS class on the `[data-tablist-scope]` wrapper in `onTabMouseMove` when the cursor is over a different scope than `reorder.sourceScope`, clear in `cleanupReorder`.

### Pattern 5: Always-Mount with `display:none`

**What:** Established in Phase 17 (terminal containers), Phase 19 (GSDPane), Phase 20 (sticky bodies). Every scope's body is mounted at app init; `display: block | none` toggles visibility based on which tab is active in that scope.

**Why critical for Phase 22:** With up to 6 scopes × multiple xterm instances, **unmounting bodies would destroy WebGL contexts** and discard scrollback. Always-mount preserves all state. The tradeoff is initial memory: 6 scopes × N tabs × WebGL state. On idle scopes (empty placeholders), cost is negligible.

### Anti-Patterns to Avoid

- **HTML5 DnD (`dragstart`/`dragend`):** WKWebView hijacks these and fires `dragend` immediately. Use `mousedown` → `mousemove` → `mouseup`. The Phase 17 + 20 drag implementation already does this correctly.
- **Unmounting tab bodies that own xterm.js WebGL:** Loses scrollback, forces PTY reconnect, breaks user expectation. Always-mount with `display` toggle.
- **Hardcoded hex colors:** Use `src/tokens.ts`. `colors.accent`, `colors.bgBorder`, etc. Tailwind 4 `@theme` tokens.
- **`tmux rename-session` on drag (D-12):** Changes the stable external identity. Downstream tooling (`tmux ls` output users pipe through scripts) breaks. Rename only on collision (and prefer preventing collisions by construction via shared counter — see D-12 recommendation below).
- **`npm install` or `npx` anything:** Project uses `pnpm`. No new deps required for Phase 22; if the planner surfaces one, use `pnpm add`.
- **Mount-on-activate for split bodies:** Tempting for memory savings but loses the xterm WebGL contexts on every scope switch. Reject.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Intra-zone vertical resize | New mouse handler | Reuse `drag-manager.ts` `makeDragH` | Already 156 LOC of tested handle-agnostic plumbing. Add a new `[data-handle="main-intra-0-1"]` element per split boundary and register in `initDragManager()`. |
| Tab drag ghost element | Custom div + JS | Existing Phase 17 ghost in `unified-tab-bar.tsx` | Phase 17 + 20 already implement a WKWebView-safe mouse-based drag with ghost, insertion indicator, cross-scope delegation. No reinventing. |
| Dropdown menu for + button | Custom | `Dropdown` from `dropdown-menu.tsx` | Existing, keyboard-accessible, scope-aware. |
| Titlebar drag behavior | `data-tauri-drag-region` | Existing attribute on `.titlebar-drag-region` | Tauri-native. Preferences button needs `-webkit-app-region: no-drag`. |
| Keyboard shortcut dispatch | New listener | `listen('preferences-requested')` already wired to `togglePreferences()` | Button onClick just calls `togglePreferences()` directly. No duplication. |
| Icon rendering | Custom SVG | `lucide-preact` components | Already in project; `Settings`, `Rows2` available. |
| State persistence | New IPC | `updateSession()` / `updateLayout()` in `state-manager.ts` | Scoped keys are strings; add more, migrate old ones. No Rust changes. |
| PTY lifecycle on drag | New Rust commands | Nothing — PTY stays alive | D-12: only UI metadata (`ownerScope`) changes on drag. No `destroy_pty_session` / `spawn_terminal` calls. |

**Key insight:** Phase 22 should feel like a **three-hour surgical edit**, not a rewrite. Every primitive it needs already exists from Phases 17, 19, 20. The planner's job is to identify the ~8 modification sites and cut the right number of tasks around them, not to design new subsystems.

## Runtime State Inventory

This is a refactor phase touching persisted keys and PTY ownership — runtime state audit applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (1) `state.session['terminal-tabs:<project>']` — legacy main key. (2) `state.session['right-terminal-tabs:<project>']` — legacy right key. (3) Sticky IDs `'file-tree'` / `'gsd'` persisted inside `activeTabId` fields of those blobs. | **Data migration on load**: copy legacy keys to `terminal-tabs:<project>:main-0` and `terminal-tabs:<project>:right-0`, then delete legacy keys. **Sticky ID filter**: when a migrated blob's `activeTabId` is `'file-tree'` or `'gsd'`, reset to `''` so D-02 defaults re-apply at first render. **Code edit**: `createScopeState` computes `persistenceKey` from the hierarchical scope id. |
| Live service config | None. No external services (Datadog, n8n, etc.) store anything related to Efxmux scopes. tmux session names are the only external name, and D-12 keeps them stable. | None. |
| OS-registered state | None. macOS does not register Efxmux tabs at the OS level. The app's `NSToolbar` / `NSMenu` entries are set via Tauri's `lib.rs:220` menu configuration and unaffected by tab identities. | None. |
| Secrets / env vars | None — Phase 22 touches no secrets, env vars, or credentials. | None. |
| Build artifacts | None — no renamed package names, no `pyproject.toml` / `egg-info` equivalents. `package.json` `"name"` is already `efxmux` (though STATE.md IN-01 flags a historical mismatch — unrelated to Phase 22). | None. |

**Special case — Phase 20 `-r<N>` session names:** Existing Phase 20 installs have right-scope PTY sessions named `<project>-r1`, `<project>-r2`, … If the planner adopts the **shared-counter** strategy recommended below (new names are `<project>-2`, `<project>-3`, … with no `-r` prefix), these existing sessions must be either:
1. **Adopted** — on first-launch after upgrade, the restore path reads the `right-terminal-tabs:<project>` legacy key, parses `-r<N>` suffixes, and keeps the original session names verbatim (no rename). New tabs created post-upgrade get names from the shared counter; existing sessions keep their `-r<N>` names indefinitely. Minor inconsistency in `tmux ls`; zero user-visible impact.
2. **Killed-on-migrate** — same as Phase 20 D-19 pattern (`tmux kill-session -t <project>-r<N>` best-effort for each known project at bootstrap). Clean `tmux ls`, but loses scrollback.

**Recommendation:** Option 1 (adopt). Preserves scrollback. The `-r` prefix cosmetic inconsistency is negligible and fades naturally as old sessions get closed.

## Common Pitfalls

### Pitfall 1: WebGL context exhaustion in WKWebView

**What goes wrong:** With 6 scopes × 2-3 xterm instances each = 12-18 WebGL contexts. WebKit has a soft cap [WebSearch, unverified — need to confirm via testing]. When exceeded, the oldest context is lost → `onContextLoss` fires → xterm falls back to DOM renderer.

**Why it happens:** Every xterm instance with the WebGL addon grabs its own WebGL2 context. WKWebView on macOS Sonoma reports WebGL2 but inherits Safari's resource ceiling.

**How to avoid:** The existing `onContextLoss` handler in `terminal/terminal-manager.ts` already handles this by reinitializing with the DOM renderer. Ensure Phase 22's split-body always-mount strategy does NOT bypass this handler.

**Warning signs:** User reports "terminal renders black" or "text looks different in some tabs." Check browser console for WebGL context lost messages.

[ASSUMED] The exact WebKit context cap on macOS Sonoma/Sequoia in 2026 — training data says 8-16; WebSearch did not confirm a current number. Planner / QA should stress-test: spawn 6 scopes × 3 terminals and verify no rendering degradation on target macOS version. If degradation occurs, either cap lower than 3 sub-panes or have empty scopes use placeholder HTML without xterm init.

### Pitfall 2: Stale `activeUnifiedTabId` vs scope-local `activeTabId` drift

**What goes wrong:** The unified signal `activeUnifiedTabId` and each scope's `activeTabId` can diverge. With 6 scopes, the risk compounds.

**Why it happens:** Historically, `activeUnifiedTabId` was main-panel-only. Phase 20 introduced `getTerminalScope(scope).activeTabId` for right scope but kept the unified signal for editor-tab activation. Cross-scope moves need to update both.

**How to avoid:** The existing `handleCrossScopeDrop` already handles this by clearing the source scope's active tab when it matched the moved id. The planner should re-audit every call site that mutates `activeUnifiedTabId` and confirm scope routing. Reference: Phase 21 FIX-06 root cause "openEditorTab wrote only activeUnifiedTabId; RightPanel reads getTerminalScope('right').activeTabId separately." Same class of bug.

**Warning signs:** Tab appears visually selected in one scope but clicking its body does nothing; or a tab's body renders in an unexpected pane.

### Pitfall 3: PTY session name collisions when shared counter allocates duplicates

**What goes wrong:** If two scopes independently increment their counter to 2, both allocate `<project>-2`. First one wins the tmux session; second fails silently or hijacks.

**Why it happens:** Phase 20 prevented this structurally with the `-r<N>` prefix. Phase 22 removes that prefix (per recommendation).

**How to avoid:** Move the counter from per-scope to **per-project, shared across all scopes**. Store in a single signal: `projectTabCounter: Map<string, number>`. `createNewTabScoped` reads + increments atomically:
```typescript
const project = activeProjectName.value;
const currentN = projectTabCounter.value.get(project) ?? 0;
const nextN = currentN + 1;
projectTabCounter.value = new Map(projectTabCounter.value).set(project, nextN);
const sessionSuffix = nextN > 1 ? String(nextN) : undefined;
const sessionName = projectSessionName(project, sessionSuffix);
```
**Persistence:** Store the counter in `state.session['tab-counter:<project>']` so it survives restart. On restore, seed from the max `sessionName` suffix across all scopes' persisted tabs to avoid counter rollback.

**Warning signs:** New tab silently attaches to an existing session; PTY output appears in the wrong tab.

### Pitfall 4: Split bodies race with tab mount / measure

**What goes wrong:** Splitting a zone creates a new empty scope. If the user immediately drags a terminal tab in, xterm's `fitAddon.fit()` reads dimensions before the newly-created container has been laid out, producing 0×0 terminals.

**Why it happens:** DOM layout is async. Phase 17 already handled this for `createNewTabScoped` with `await nextFrame()` before `fit()`. Cross-scope moves must do the same.

**How to avoid:** After moving an xterm container from scope A's `.terminal-containers` to scope B's, call `await nextFrame()` + `fitAddon.fit()` + dispatch a resize event to the PTY. The Phase 20 cross-scope drag already does this for the right-panel case; generalize to all scopes.

**Warning signs:** Terminal appears "shrunken" or blank after a drag until user manually resizes the window.

### Pitfall 5: Split cap not enforced on restore

**What goes wrong:** State.json has legacy data implying 4 sub-scopes per zone (hypothetical future). Load path creates them all, exceeding the 3-cap.

**Why it happens:** The cap is a UI policy, not a storage constraint.

**How to avoid:** On restore, validate `TerminalScope` values against the allowed set; discard unknown scopes and merge their tabs into `main-0` / `right-0`.

**Warning signs:** N/A for v0.3.0 (no legacy data has split scopes yet). Belt-and-suspenders against future refactors.

### Pitfall 6: Preferences button steals titlebar drag

**What goes wrong:** User clicks near the preferences button to drag the window; the click lands on the button, not the drag region.

**Why it happens:** Missing `-webkit-app-region: no-drag` on the button.

**How to avoid:** Mirror `.titlebar-add-btn` CSS exactly — that class already sets `-webkit-app-region: no-drag` [VERIFIED: `app.css:445`].

**Warning signs:** Clicking on button doesn't trigger click; or clicking near button drags window instead of activating button.

### Pitfall 7: Singleton dim signal doesn't update when drag completes

**What goes wrong:** User drags GSD from right-0 to main-1. Right-0's `+` menu still shows GSD as disabled because the signal update was missed.

**Why it happens:** If `gsdTab.value` is mutated via `.owningScope = X` (mutation without assignment), Preact signals won't detect the change.

**How to avoid:** Always assign a new object: `gsdTab.value = { ...gsdTab.value, owningScope: target };`. Pattern already followed for `gitChangesTab` — replicate.

**Warning signs:** Menu item stays dimmed after the singleton has moved; refreshing fixes it.

## Code Examples

### Shared per-project tab counter (D-12 recommendation)

```typescript
// terminal-tabs.tsx — new module-level signal, shared across all scopes
const projectTabCounter = signal<Map<string, number>>(new Map());

function allocateNextSessionName(project: string | null): { name: string; n: number } {
  const key = project ?? '';
  const current = projectTabCounter.value.get(key) ?? 0;
  const n = current + 1;
  projectTabCounter.value = new Map(projectTabCounter.value).set(key, n);
  const suffix = n > 1 ? String(n) : undefined;
  return { name: projectSessionName(project, suffix), n };
}

// Inside createNewTabScoped (replaces scope-specific counter/suffix logic)
const { name: sessionName, n: seq } = allocateNextSessionName(activeProjectName.value);
const id = `tab-${Date.now()}-${seq}`;

// On restore (inside restoreProjectTabsScoped), seed the counter
// from the max numeric suffix found across ALL scopes' persisted tabs.
function seedCounterFromRestoredTabs(project: string): void {
  let max = 0;
  for (const [, state] of scopes) {
    for (const tab of state.tabs.value) {
      const m = /-(\d+)$/.exec(tab.sessionName);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  projectTabCounter.value = new Map(projectTabCounter.value).set(project, max);
}

// Persist counter alongside tabs so it survives app restart.
// In persistTabStateScoped, add once per project (not per scope):
const counter = projectTabCounter.value.get(project) ?? 0;
patch[`tab-counter:${project}`] = String(counter);
```

### Cross-scope drag for a generalized scope union

```typescript
// unified-tab-bar.tsx — handleCrossScopeDrop already handles arbitrary
// TerminalScope values. The only edit Phase 22 needs is deletion of the
// sticky no-op branch (current line :1371-1372) and addition of branches
// for GSD and File Tree tab kinds.

export function handleCrossScopeDrop(
  sourceId: string,
  sourceScope: TerminalScope,
  _targetId: string,
  targetScope: TerminalScope,
  _insertAfter: boolean,
): void {
  // DELETED: sticky tab no-op branch (file-tree / gsd ids are no longer sticky)

  // NEW: GSD singleton branch
  const gsd = gsdTab.value;
  if (gsd && gsd.id === sourceId) {
    if (gsd.owningScope === targetScope) return;  // already there
    gsdTab.value = { ...gsd, owningScope: targetScope };
    setScopedTabOrder(sourceScope, getScopedTabOrder(sourceScope).filter(id => id !== sourceId));
    setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), sourceId]);
    getTerminalScope(targetScope).activeTabId.value = sourceId;
    return;
  }

  // Existing Git Changes singleton branch — update to generalize from 'main'/'right'
  const gc = gitChangesTab.value;
  if (gc && gc.id === sourceId) {
    if (gc.owningScope === targetScope) return;
    gitChangesTab.value = { ...gc, owningScope: targetScope };
    setScopedTabOrder(sourceScope, getScopedTabOrder(sourceScope).filter(id => id !== sourceId));
    setScopedTabOrder(targetScope, [...getScopedTabOrder(targetScope), sourceId]);
    getTerminalScope(targetScope).activeTabId.value = sourceId;
    return;
  }

  // File Tree branch (non-singleton — each scope can hold its own)
  if (sourceId.startsWith('file-tree-')) {
    // flip ownerScope in a scoped file-tree tab registry (new signal, similar to editorTabs)
    // ... similar logic to editor branch below
  }

  // Editor branch — unchanged from Phase 20 Plan 20-05-D
  // Terminal branch — unchanged from Phase 20 Plan 20-05-E
}
```

### Titlebar Preferences button

```tsx
// src/main.tsx — insertion at end of .titlebar-drag-region (around line 98)
import { Settings } from 'lucide-preact';

// Inside the .titlebar-drag-region div, AFTER the existing `+` Add-Project button:
<div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
  <button
    class="titlebar-prefs-btn"
    title="Preferences (Cmd+,)"
    aria-label="Open preferences"
    onClick={() => { togglePreferences(); }}
  >
    <Settings size={14} />
  </button>
</div>
```

```css
/* src/styles/app.css — after .titlebar-add-btn block (line ~470) */
.titlebar-prefs-btn {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background-color: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}

.titlebar-prefs-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.titlebar-prefs-btn:active {
  color: var(--color-text-primary);
}
```

Note: the container must also add `-webkit-app-region: no-drag` on the wrapper div so the `marginLeft: 'auto'` spacer itself doesn't eat pointer events. Alternatively, mark only the button no-drag — the wrapper keeps inheriting the titlebar's `drag` region for window movement.

### Split icon button insertion

```tsx
// unified-tab-bar.tsx — inside the "Sticky right actions" wrapper (around line 1649),
// right of the Dropdown trigger:
import { Rows2 } from 'lucide-preact';

// Compute cap state based on current scope
const zone = scope.startsWith('main') ? 'main' : 'right';
const activeSubScopes = getActiveSubScopesForZone(zone);  // new helper in main/right-panel
const atCap = activeSubScopes.length >= 3;

<button
  class="tab-bar-split-icon"
  aria-label="Split pane vertically"
  title={atCap ? 'Split cap reached (3 max)' : 'Split pane'}
  disabled={atCap}
  onClick={() => spawnSubScopeForZone(zone)}
  style={{
    color: atCap ? colors.textDim : colors.textMuted,
    cursor: atCap ? 'default' : 'pointer',
    opacity: atCap ? 0.4 : 1,
  }}
>
  <Rows2 size={14} />
</button>
```

### Intra-zone resize handle registration

```typescript
// drag-manager.ts — extend initDragManager to register intra-zone handles.
// New handles appear dynamically when splits are created, so we use an
// event-delegated pattern or re-register on zone-split-changed events.

// Simpler: attach once after render via a MutationObserver on .main-panel / .right-panel.
function attachIntraZoneHandles(zone: 'main' | 'right'): void {
  document.querySelectorAll<HTMLElement>(`[data-handle^="${zone}-intra-"]`).forEach(handle => {
    if (handle.dataset.dragInit === 'true') return;
    handle.dataset.dragInit = 'true';
    makeDragH(handle, {
      onDrag(clientY: number) {
        const panel = document.querySelector<HTMLElement>(`.${zone}-panel`);
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const idx = parseInt(handle.dataset.handle!.split('-').pop()!, 10);
        const pct = ((clientY - rect.top) / rect.height) * 100;
        document.documentElement.style.setProperty(
          `--${zone}-split-${idx}-pct`,
          `${Math.max(10, Math.min(90, pct)).toFixed(1)}%`,
        );
      },
      onEnd(clientY: number) {
        const panel = document.querySelector<HTMLElement>(`.${zone}-panel`);
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const idx = parseInt(handle.dataset.handle!.split('-').pop()!, 10);
        const pct = ((clientY - rect.top) / rect.height) * 100;
        const clamped = Math.max(10, Math.min(90, pct));
        updateLayout({ [`${zone}-split-${idx}-pct`]: `${clamped.toFixed(1)}%` });
      },
    });
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sticky tab kind (Phase 20) | Dynamic tabs with fixed titles + singleton marker | Phase 22 | Simpler render path; unified drag/persist pipeline. |
| Scope = 2-string union (`'main' | 'right'`) | Scope = 6-string hierarchical union | Phase 22 | Additive; all consumers already TerminalScope-generic. |
| Per-scope session-name prefix (`-r<N>`) | Shared per-project counter (`<project>-N`) | Phase 22 (recommended) | Eliminates collision from drag. Removes `-rr<N>` restart-suffix hack. |
| `gitChangesTab` signal with `owningScope` | Same pattern generalized to `gsdTab` | Phase 22 | Parallel signals, no shared "singleton registry" abstraction needed. |
| Preferences via Cmd+, only | Cmd+, AND titlebar button | Phase 22 | Cmd+, unchanged; button added. |

**Deprecated/outdated:**
- `-r<N>` session-name suffix convention (Phase 20 D-14) — superseded by shared-counter recommendation for Phase 22. If planner rejects shared counter, Phase 20's convention stays and a 6-way prefix scheme (`-m0`, `-m1`, `-m2`, `-r0`, `-r1`, `-r2`) is the fallback — more visual noise, same collision-proof guarantee.
- Sticky tab branch in `unified-tab-bar.tsx:1682-1731` — delete per D-01.
- `data-sticky-tab-id` attribute — delete (used only for drag hit-test skip).

## Environment Availability

Phase 22 has no new external dependencies. All tools / libraries are already in-project.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / pnpm | Build | ✓ | pnpm (see package.json) | — |
| Rust / cargo | Unchanged — no Rust edits | ✓ | — | — |
| tmux | PTY sessions (unchanged) | ✓ | 3.x per CLAUDE.md | — |
| WKWebView | Runtime (macOS native) | ✓ | macOS Sonoma+ | DOM renderer fallback via `onContextLoss` |
| lucide-preact Settings / Rows2 | Titlebar + split icons | ✓ | 1.8.0 (both icons present) | — |

**Missing dependencies:** None. **Missing dependencies with fallback:** None.

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true`). All phase requirements must have an automated test path.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + @testing-library/preact 3.2.4 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (existing, project root) |
| Quick run command | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx src/components/right-panel.test.tsx src/components/main-panel.test.tsx src/components/terminal-tabs.test.ts src/state-manager.test.ts` |
| Full suite command | `pnpm exec vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TABS-01 | File Tree / GSD / Git Changes render as dynamic tabs with fixed titles and closeable × | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "dynamic sticky-removed tabs"` | ❌ Wave 0 |
| TABS-01 | Double-click rename is blocked for File Tree / GSD / Git Changes | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "fixed titles no-rename"` | ❌ Wave 0 |
| TABS-01 | Migration: sticky IDs `file-tree` / `gsd` silently dropped from persisted activeTabId on load | unit | `pnpm exec vitest run src/state-manager.test.ts -t "sticky id migration"` | ❌ Wave 0 |
| SPLIT-01 | Click split icon in tab bar creates a sibling scope below current zone | component | `pnpm exec vitest run src/components/main-panel.test.tsx -t "split adds sub-scope"` | ❌ Wave 0 (main-panel.test.tsx does not exist yet) |
| SPLIT-01 | Split icon disabled when zone has 3 sub-scopes | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "split cap disables icon"` | ❌ Wave 0 |
| SPLIT-02 | Intra-zone resize handle updates CSS var and persists `<zone>-split-<i>-pct` in state | unit | `pnpm exec vitest run src/drag-manager.test.ts -t "intra-zone handle"` | ❌ Wave 0 (drag-manager.test.ts does not exist) |
| SPLIT-03 | Terminal tab drag main-0 → main-1 updates ownerScope and moves to target bar | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "cross-scope drag terminal"` | ❌ Wave 0 (Phase 20 tests cover main↔right only; need main-0↔main-1) |
| SPLIT-03 | Editor tab drag any → any updates ownerScope | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "cross-scope drag editor"` | ✓ (extend Phase 20-05-D test) |
| SPLIT-03 | GSD singleton drag updates owningScope, source `+` menu re-enables, target dims | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "gsd singleton drag"` | ❌ Wave 0 |
| SPLIT-03 | Git Changes singleton drag (generalized from Phase 20 D-07) | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "git changes singleton drag"` | ✓ (extend Phase 20 test) |
| SPLIT-03 | Drop affordance: accent border + insertion slot on target bar during cross-scope drag | component | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "cross-scope drop affordance"` | ❌ Wave 0 |
| SPLIT-04 | PTY sessionName stable across drag (no invoke `destroy_pty_session` / `spawn_terminal` on move) | unit | `pnpm exec vitest run src/components/terminal-tabs.test.ts -t "sessionName stable on drag"` | ❌ Wave 0 |
| SPLIT-04 | Shared counter allocates unique names across scopes; no duplicates when tabs created in different scopes | unit | `pnpm exec vitest run src/components/terminal-tabs.test.ts -t "shared counter unique names"` | ❌ Wave 0 |
| SPLIT-04 | Legacy `-r<N>` sessions preserved on restore (adoption path) | unit | `pnpm exec vitest run src/components/terminal-tabs.test.ts -t "legacy -rN restore"` | ❌ Wave 0 |
| PREF-01 | Titlebar prefs button click calls togglePreferences() | component | `pnpm exec vitest run src/main.test.tsx -t "prefs button opens panel"` | ❌ Wave 0 (main.test.tsx doesn't exist) |
| PREF-01 | Cmd+, keybind still opens panel (listener preserved) | unit | `pnpm exec vitest run src/main.test.tsx -t "Cmd+, still works"` | ❌ Wave 0 |
| PREF-01 | Button has `-webkit-app-region: no-drag` (CSS class correct) | component | `pnpm exec vitest run src/main.test.tsx -t "prefs button no-drag"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm exec vitest run src/components/unified-tab-bar.test.tsx src/components/terminal-tabs.test.ts src/state-manager.test.ts` (< 10s)
- **Per wave merge:** `pnpm exec vitest run` + `pnpm exec tsc --noEmit` + `cd src-tauri && cargo check`
- **Phase gate:** Full suite green + manual UAT checklist (split creation, drag every tab kind cross-scope, prefs button click + Cmd+, parity, 3-cap dimming)

### Wave 0 Gaps

- [ ] `src/components/main-panel.test.tsx` — file does not exist. Covers SPLIT-01.
- [ ] `src/drag-manager.test.ts` — file does not exist. Covers SPLIT-02 resize.
- [ ] `src/main.test.tsx` — file does not exist. Covers PREF-01.
- [ ] Test helpers for spawning sub-scopes in tests (extend the existing `__resetScopeCountersForTesting` pattern to include split-state reset).
- [ ] `mockIPC` mocks for `save_state` must cover the new `terminal-tabs:<project>:<scope-id>` key shape.
- [ ] No framework install needed — vitest + @testing-library/preact already configured.

## Security Domain

`security_enforcement` not explicitly disabled in `.planning/config.json` — include this section.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface modified. |
| V3 Session Management | No | PTY session names are not auth tokens; tmux handles access via local filesystem permissions. |
| V4 Access Control | No | UI refactor; no privileges added or removed. |
| V5 Input Validation | Yes (marginal) | Persisted `AppState` keys are parsed with `JSON.parse` inside try/catch; malformed entries fail-soft. Migration regex (`/^terminal-tabs:([^:]+)$/`) anchors start-to-end to avoid partial matches. Project names are already sanitized via `projectSessionName()` to `[a-zA-Z0-9_-]`. |
| V6 Cryptography | No | No crypto involved. |

### Known Threat Patterns for Tauri 2 + WKWebView

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| State file tampering (user edits `state.json` to inject garbage scope id) | Tampering | Whitelist `TerminalScope` on restore: discard unknown scope keys; merge orphaned tabs into `main-0` / `right-0`. |
| IPC injection via crafted session name | Tampering | `projectSessionName()` + Rust-side sanitization in `pty.rs` already enforce character allowlist. Phase 22 does not introduce new IPC surface. |
| Titlebar button gesture hijack | Spoofing | Standard WKWebView behavior — `-webkit-app-region: no-drag` is the only mitigation; already used by `.titlebar-add-btn`. |

No new threat surface introduced by Phase 22. Scope generalization is UI-layer only; Rust-side PTY and state commands are unchanged.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WebKit soft-caps WebGL contexts at 8-16 on macOS Sonoma/Sequoia in 2026 | Pitfall 1 | If cap is lower, 6 scopes × 3 terminals (18 contexts) consistently trigger context loss → DOM renderer fallback. Users see slower rendering in some tabs. Mitigation already in place (`onContextLoss`). Risk: cosmetic performance, not functional. Planner / QA should stress-test on target macOS version. |
| A2 | All Phase 20 D-11 backward-compat exports can be made scope-parametric without breaking Phase 17 call sites | Pattern 1 | Low — the current code already routes top-level exports to `getTerminalScope('main')`. Rename the default to `'main-0'` in one place. |
| A3 | Always-mount of 6 scopes has negligible memory cost when most scopes are empty | Pattern 5 | An empty scope renders an empty-state div — basically free. Scopes with xterm incur cost only when populated. Mem usage scales with number of tabs, not number of scopes. Low risk. |
| A4 | No external tooling or user script depends on the `-r<N>` right-scope session name suffix | D-12 recommendation | Low — suffix was introduced Phase 20, users unlikely to have built tooling around it in the 2 days between Phase 20 ship and Phase 22. |
| A5 | lucide-preact `Rows2` renders at 14px without pixel snapping issues in the tab bar | Icon Selection | Very low — same icon family as existing `FolderOpen`, `ListChecks` used in sticky tabs. Proven pattern. |

## Open Questions

1. **Should File Tree be a singleton like GSD / Git Changes?**
   - What we know: D-04 only mentions GSD and Git Changes as singletons. CONTEXT.md's Claude's Discretion notes "Whether `File Tree` as a dynamic tab kind gets a `+` menu item on `main` scope (currently it's a right-scope sticky only). Defaults to 'yes, uniformly available' but planner verifies user intent."
   - What's unclear: Whether two File Tree tabs (one per scope) displaying the same tree is desirable or confusing UX.
   - Recommendation: **Non-singleton.** Each scope gets its own File Tree tab with independent UI state (expanded folders, scroll position). Same underlying tree source. If user reports "confusing," convert to singleton in a follow-up polish phase.

2. **Split creation spawns an empty scope — does "empty" mean zero tabs or one auto-spawned tab?**
   - What we know: D-02 says first-launch auto-spawns `Terminal-1` on `main-0` and GSD+File Tree on `right-0`. "No auto-spawn on `main-1..2`, `right-1..2` when those scopes are created empty via split."
   - What's unclear: UX on the empty state — D-03 says placeholder "+ to add tab." But does the split icon animate to indicate where to click?
   - Recommendation: Plain text placeholder "`+` to add tab" in a subtle color (`colors.textDim`). No animation. Empty state is explicit; user's intent when they hit the split icon is to add tabs next.

3. **When the user drags a tab out of a scope that now has zero tabs, does the empty scope persist or auto-collapse?**
   - What we know: D-03 says "Empty scope allowed."
   - What's unclear: If `main-1` becomes empty via drag, does it still take up 1/3 of the main zone height?
   - Recommendation: **Persist the empty scope.** User explicitly created it via split icon; silently auto-collapsing would feel broken. To remove, user closes the scope via a new "close scope" control (candidate for Claude's Discretion — a small × on the tab bar right edge when the scope has zero tabs). Or hit the split icon in an adjacent scope to re-absorb.
   - Defer the close-scope control to polish; v1 keeps the empty state indefinite.

4. **Cross-scope drag of an Agent tab — does the agent-quit confirm modal trigger?**
   - What we know: Phase 20 agent-quit confirm modal fires on `closeTab`, not on `ownerScope` flip.
   - What's unclear: CONTEXT.md Deferred Ideas flagged "planner should decide."
   - Recommendation: **Do NOT trigger confirm on drag.** PTY stays alive, session doesn't change — nothing to confirm. Only trigger on actual close.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-CONTEXT.md` — the locked decisions D-01..D-18.
- `.planning/phases/20-right-panel-multi-terminal/20-CONTEXT.md` — scope registry, `ownerScope`, Git Changes singleton pattern.
- `.planning/phases/20-right-panel-multi-terminal/20-05-D-SUMMARY.md` — editor cross-scope drag blueprint.
- `.planning/phases/17-main-panel-file-tabs/17-CONTEXT.md` — UnifiedTabBar drag-reorder + per-project tab persistence.
- `.planning/phases/19-gsd-sub-tabs/19-CONTEXT.md` — `display:none` body-toggle pattern, parse cache.
- `/Users/lmarques/Dev/efx-mux/CLAUDE.md` — stack directives (pnpm, Tailwind 4 tokens, xterm 6.0 WebGL, mouse-based drag).
- `/Users/lmarques/Dev/efx-mux/src/components/unified-tab-bar.tsx` — direct read of sticky branch (`:1682-1731`), scope registry consumers, cross-scope drop handler.
- `/Users/lmarques/Dev/efx-mux/src/components/terminal-tabs.tsx` — scope registry Map, persistence keys, PTY lifecycle.
- `/Users/lmarques/Dev/efx-mux/src/state-manager.ts` — D-20 migration template, `AppState` shape.
- `/Users/lmarques/Dev/efx-mux/src/main.tsx:91-98` — titlebar add-button template.
- `/Users/lmarques/Dev/efx-mux/src/styles/app.css:444-470` — `.titlebar-add-btn` CSS to mirror.
- `/Users/lmarques/Dev/efx-mux/src/drag-manager.ts` — `makeDragV` / `makeDragH` primitives to reuse.
- `/Users/lmarques/Dev/efx-mux/node_modules/lucide-preact/dist/lucide-preact.d.ts` — icon availability (`Rows2`, `Settings`, `SquareSplitVertical` confirmed; `SplitSquareVertical` rejected).
- `/Users/lmarques/Dev/efx-mux/package.json` — version verification (preact 10.29.1, @preact/signals 2.9.0, lucide-preact 1.8.0, xterm 6.0.0, @tauri-apps/api 2.10.1).
- `/Users/lmarques/Dev/efx-mux/.planning/config.json` — `nyquist_validation: true` confirmed.

### Secondary (MEDIUM confidence)

- [Lucide icons: Rows2](https://lucide.dev/icons/rows-2) — visual appearance confirmed (horizontal rows stacked vertically).
- [xterm.js addon-webgl README](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-webgl/README.md) — browser support + context-loss handling guidance. Accessed 2026-04-18.

### Tertiary (LOW confidence)

- WebSearch for "xterm.js WebGL multiple instances WKWebView context limit 2026" — returned general addon info but no authoritative number for the concurrent WebGL context cap on Sonoma/Sequoia. Assumption A1 flagged for QA stress-test.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps pinned + verified against node_modules and package.json.
- Architecture: HIGH — every pattern reuses Phase 17/19/20 code paths that were verified via direct file reads.
- Pitfalls: MEDIUM-HIGH — Pitfall 1 (WebGL context cap) is the only one with unverified upper bound; others are mechanically verified from code.

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable frontend stack; no fast-moving libs touched)

---

*Phase: 22-dynamic-tabs-vertical-split-and-preferences-modal*
*Research completed: 2026-04-18*
