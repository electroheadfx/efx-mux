# Phase 22: Dynamic tabs, vertical split, and preferences modal - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Three coordinated changes to the workspace shell:

1. **Uniform dynamic tabs** — File Tree, GSD, and Git Changes stop being sticky/special tabs. All tab types behave identically: closeable `×`, drag-reorderable, addable via `+` menu, persisted per scope. File Tree / GSD / Git Changes keep **fixed titles** (no double-click rename).
2. **Vertical split per zone** — the main and right zones each support up to 3 stacked sub-panes. Each sub-pane has its own `UnifiedTabBar` with independent `+` menu. Sub-panes created via a new split icon in the tab bar. Tabs drag freely between any sub-panes (main↔right, top↔bottom).
3. **Preferences entry point** — a Preferences button in the macOS titlebar overlay zone (right side) that opens the existing slide-in preferences panel. Cmd+, keybind unchanged.

**In scope:** tab-kind generalization, sticky-branch removal, split icon + empty-scope spawn, per-scope persistence, intra-zone resize handles, hierarchical scope identifiers, cross-scope tab drag for every tab type, PTY ownership decoupling from session name, titlebar Preferences button.

**Out of scope:** true multi-window support (user's "each window stores..." phrasing reinterpreted as "each scope/split"; multi-window remains in PROJECT.md §Out of Scope), redesigning preferences as a centered modal, keyboard shortcuts for split creation/nav.

</domain>

<decisions>
## Implementation Decisions

### Tab Architecture (sticky → dynamic)
- **D-01:** **Remove the sticky tab kind entirely** from `UnifiedTabBar`. File Tree, GSD, and Git Changes render through the same path as terminal/editor/agent tabs. `data-sticky-tab-id`, `renderStickyTab` branch, and the "sticky segment" prepend in `getOrderedTabsForScope` (unified-tab-bar.tsx:1131–1143, 1689–1728) are deleted.
- **D-02:** **First-launch defaults** (new project, no persisted state): `main-0` auto-spawns `Terminal-1` (current main-panel behavior preserved). `right-0` auto-spawns GSD + File Tree as dynamic tabs (preserves current visual feel post-migration). No auto-spawn on `main-1..2`, `right-1..2` when those scopes are created empty via split.
- **D-03:** **Empty scope allowed.** Closing the last tab in any scope leaves it with a placeholder ("+ to add tab"). No last-tab protection. Uniform-dynamic principle overrides "always have a tab" UX.
- **D-04:** **Singleton global** for GSD and Git Changes. Exactly one instance alive across all scopes at any time. `+` menu item is dimmed/disabled in every scope when the singleton is already open elsewhere. Generalizes Phase 20 D-07 (Git Changes handoff) to GSD.
- **D-05:** **Fixed titles** for File Tree, GSD, Git Changes (no double-click rename). Terminal / Agent / Editor tabs keep the rename-on-double-click behavior from Phase 17 D-03.
- **D-06:** **Migration** of existing `state.json`: drop sticky `'file-tree'` / `'gsd'` IDs silently from persisted active-tab and tab-order fields on load. First-launch defaults (D-02) re-create equivalent dynamic tabs on first render. Matches Phase 20 D-20 precedent for clean legacy-key drop.

### Vertical Split Model
- **D-07:** **Cap at 3 sub-panes per zone.** `main-0`, `main-1`, `main-2` and `right-0`, `right-1`, `right-2` are the maximum. Split icon is disabled (grayed) when the cap is reached in the current zone.
- **D-08:** **Split icon in tab bar, right of `+`.** New `[⬌]` icon button in every `UnifiedTabBar` instance, positioned immediately after the `+` menu trigger. Click spawns an empty sibling scope below the current scope. Icon: Lucide `SplitSquareVertical` (or equivalent — planner's choice if that name drifts).
- **D-09:** **Draggable resize handle** between vertical split sub-panes. Cursor `ns-resize`. Ratios persisted per zone in `AppState.layout` (parallel to existing `sidebar-main` / `main-right` horizontal ratios). Matches the existing `.split-handle-v` pattern in `src/main.tsx:102,104` and `src/drag-manager.ts`.
- **D-10:** **Scope identifier = hierarchical string.** `TerminalScope` union extends from `'main' | 'right'` to `'main-0' | 'main-1' | 'main-2' | 'right-0' | 'right-1' | 'right-2'`. Persistence keys: `terminal-tabs:<project>:<scope-id>`. Phase 20 scope registry (`getTerminalScope(scope)`) gains the hierarchical scope keys. Backward-compat: on load, legacy keys `terminal-tabs:<project>` and `right-terminal-tabs:<project>` migrate to `terminal-tabs:<project>:main-0` and `terminal-tabs:<project>:right-0` respectively.

### Cross-Split Tab Drag
- **D-11:** **All tab types draggable between any scopes.** Terminal, agent, editor, GSD, Git Changes, File Tree — zero tab types pinned to origin scope. Generalizes Phase 20 Plan 20-05-D `ownerScope` field from editor-only to every `UnifiedTab` kind.
- **D-12:** **PTY session name is stable on scope move.** No `tmux rename-session` on drag. Only the `ownerScope` metadata field changes. Session names remain `<project>`, `<project>-1`, `<project>-r1`, etc. **Planner must add collision-avoidance** for the case where the target scope already owns a session with the same name — either a UUID suffix under the hood or a rename-on-collision policy. Planner's choice.
- **D-13:** **Singleton move behavior.** Dragging GSD or Git Changes to another scope relocates the tab: `ownerScope` is updated, the `+` menu in the source scope re-enables the item, the `+` menu in the target scope dims it. Extends Phase 20 D-07 Git Changes handoff to the full general drag pipeline.
- **D-14:** **Drop affordance.** During a cross-scope drag, the target tab bar shows an accent-colored border + insertion-slot line at the drop position. Pane body does NOT tint. Reuses the existing mouse-drag ghost from `unified-tab-bar.tsx` (Phase 17 drag-reorder + Phase 20 cross-scope extension). Scope crossing is already partially supported; this phase polishes the visual affordance and generalizes target acceptance.

### Preferences Titlebar Entry
- **D-15:** **HTML button in titlebar overlay zone, right side.** Mirrors existing `.titlebar-add-btn` (left-side `+` button in `src/main.tsx:92` + `src/styles/app.css:444`). Same `-webkit-app-region: no-drag` treatment. Styled via `tokens.ts`. No native `NSToolbar` item.
- **D-16:** **Icon: Lucide `Settings` gear, 18px.** Hover: subtle bg tint matching `.titlebar-add-btn:hover`. Planner may swap to `Cog2` if visual review prefers.
- **D-17:** **Cmd+, keybind unchanged.** Existing wiring stays: native macOS menu `Efxmux > Preferences...` emits `preferences-requested` Tauri event → frontend listener at `src/main.tsx:179` → `togglePreferences()`. New button click triggers the same handler directly.
- **D-18:** **Keep existing slide-in panel** (`src/components/preferences-panel.tsx`). No redesign to centered modal despite roadmap wording "Preferences modal". Slide-in is functionally modal (blocks focus, escape-to-close) and already styled. Modal redesign is deferred.

### Claude's Discretion
- Exact Lucide icon names for split (`SplitSquareVertical` vs `Rows2` vs custom) and preferences (`Settings` vs `Cog2`).
- Empty-scope placeholder content — plain text "`+` to add tab" vs subtle illustration.
- UUID length/format for PTY name collision avoidance (D-12). Could be short hash, short UUID slice, or sequential counter in a shared registry.
- Exact CSS for the new split-icon button (size, spacing relative to `+`).
- Whether intra-zone resize handle reuses `drag-manager.ts` primitive or gets its own module.
- Animation / transition on split add/remove (slide-in sibling pane? instant?).
- Rendering split body mounting strategy — always-mount all scopes with `display:none` toggle, or mount-on-activate. (Existing pattern in `right-panel.tsx` for sticky bodies is always-mount.)
- Whether `File Tree` as a dynamic tab kind gets a `+` menu item on `main` scope (currently it's a right-scope sticky only). Defaults to "yes, uniformly available" but planner verifies user intent.
- Test split between unit (scope-id migration, singleton enforcement, PTY collision avoidance) and component render tests (split rendering, drop-affordance, preferences button click).

### Folded Todos
None — no pending todos matched Phase 22 (todo match-phase 22 returned zero).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary targets for modification
- `src/components/unified-tab-bar.tsx` — Remove sticky branch (lines 1131–1143, 1689–1728, 184, 321, 334, 404, 1100, 1362, 1422, 1488, 1589–1590); add split-icon button next to `+`; generalize `ownerScope` to all tab kinds; enforce singleton dimming in `+` menu for GSD + Git Changes.
- `src/components/right-panel.tsx` — Remove hardcoded sticky File Tree + GSD body mounts; rewrite to render N sub-scope tab bars stacked vertically with resize handles.
- `src/components/main-panel.tsx` — Rewrite to support N sub-scope tab bars stacked vertically (currently single-scope `main`).
- `src/components/terminal-tabs.tsx` — Extend scope registry from `'main' | 'right'` to hierarchical `'main-0'..'main-2'`, `'right-0'..'right-2'`. Legacy-key migration on load.
- `src/state-manager.ts` — Extend `TerminalScope` union; migrate legacy `terminal-tabs:<project>` and `right-terminal-tabs:<project>` keys to `<scope-id>`-suffixed variants on load; drop sticky IDs from persisted active-tab / tab-order; persist per-zone split ratios.
- `src/main.tsx` — Add HTML Preferences button (right side of `.titlebar-drag-region`, mirrors `.titlebar-add-btn` at line 92); click → `togglePreferences()`.
- `src/styles/app.css` — Add `.titlebar-prefs-btn` class mirroring `.titlebar-add-btn` (line 444); add `.split-handle-v-intra` (or similar) for intra-zone resize; add `.tab-bar-split-icon` styling.
- `src/drag-manager.ts` — May need extension for intra-zone resize handles (planner decides: reuse vs new module).

### Preserved / reused as-is
- `src/components/preferences-panel.tsx` — Slide-in panel reused unchanged (D-18). `togglePreferences()` + `visible` signal + `listen('preferences-requested')` pipeline kept.
- `src/components/gsd-pane.tsx` — Body reused; rendered now as dynamic tab body instead of sticky.
- `src/components/file-tree.tsx` — Body reused; rendered as dynamic tab body.
- `src/components/git-changes-tab.tsx` — Body reused; `ownerScope` already generalized in Phase 20.
- `src/components/dropdown-menu.tsx` — Reused for + menu and any new split-icon dropdown.
- `src/components/editor-tab.tsx` — Editor tab; its `ownerScope` persistence (Phase 20 Plan 20-05-D) becomes the pattern for all tab types.
- `src/components/crash-overlay.tsx` — Reused per scope.
- `src/components/confirm-modal.tsx` — Reused for agent-quit-on-close.
- `src/utils/session-name.ts` — `projectSessionName(name, suffix)` still used; scope is no longer encoded in the suffix (D-12).
- `src-tauri/src/pty.rs` — No new commands. Session registry already handles arbitrary names.
- `src-tauri/src/lib.rs:220` — `"preferences"` menu handler emitting `preferences-requested` is kept (D-17).

### Prior phase context (read before planning)
- `.planning/phases/17-main-panel-file-tabs/17-CONTEXT.md` — UnifiedTabBar origin, drag-reorder pattern, confirm-modal-on-close, per-project tab persistence, dropdown menu.
- `.planning/phases/19-gsd-sub-tabs/19-CONTEXT.md` — GSDPane parse cache, `display:none`-vs-unmount mounting pattern for heavy tab bodies.
- `.planning/phases/20-right-panel-multi-terminal/20-CONTEXT.md` — **Most load-bearing prior context.** `TerminalScope` string scheme (D-13), scope registry in `terminal-tabs.tsx` (D-10/D-11/D-12), sticky tab concept (D-03/D-05 — now being REMOVED by D-01 above), Git Changes ownerScope handoff (D-07 — generalized by D-13 above), `-r<N>` naming (D-14 — superseded by D-12 above, PTY names are now stable across scope moves), legacy-key migration pattern (D-20 — the template for D-06 and the scope-id migration).
- `.planning/phases/20-right-panel-multi-terminal/20-05-D-SUMMARY.md` — Editor tab `ownerScope` implementation, cross-scope drag drop handling.

### Requirements & Roadmap
- `.planning/ROADMAP.md` §"Phase 22: Dynamic tabs, vertical split, and preferences modal" (lines 213–227) — canonical scope description. Note: "Preferences modal" wording is interpreted as "slide-in preferences panel" per D-18; "each window stores..." is interpreted as "each scope/split" per the Phase Boundary note.
- `.planning/REQUIREMENTS.md` — No Phase 22 requirements exist yet. Planner should surface new entries (suggested: `TABS-01` uniform dynamic tabs, `SPLIT-01..03` vertical split / intra-zone resize / cross-scope drag, `PREF-01` titlebar button) and update the Traceability table.

### CLAUDE.md directives
- `/Users/lmarques/Dev/efx-mux/CLAUDE.md` — xterm.js 6.0 WebGL addon context-loss handling still applies (multiple splits = multiple xterm instances); PTY pipeline gotchas (scope-agnostic); Tauri 2 invoke/listen API paths.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`UnifiedTabBar`** (`src/components/unified-tab-bar.tsx`) — Already scope-parametrized after Phase 20. Drag-reorder (mouse-based, WKWebView-safe), rename-on-double-click, close-`×`, plus-menu dropdown, wheel-scroll. Sticky-tab branch to DELETE; split-icon button to ADD; `ownerScope` to GENERALIZE to all tab kinds.
- **Scope registry in `terminal-tabs.tsx`** (`getTerminalScope(scope)`, scoped signals, scoped DOM wrappers, scope-agnostic `pty-exited` listener) — Already a Map keyed on scope string. Extending the key set from 2 strings to 6 is mechanically straightforward.
- **`ownerScope` field on editor tabs** (Phase 20 Plan 20-05-D) — The pattern to generalize: every tab kind gets an `ownerScope: TerminalScope` field; persistence keys include scope; drag updates the field; render filters by `ownerScope === scope`.
- **`gitChangesTab` signal with `owningScope`** (Phase 20 D-07) — The template for GSD singleton + scope ownership. Generalize into a broader "singleton tab" concept or keep two parallel signals (`gsdTab`, `gitChangesTab`) — planner's call.
- **`.titlebar-drag-region` + `.titlebar-add-btn`** (`src/main.tsx:75,92` + `src/styles/app.css:440–467`) — The existing pattern to mirror for the new Preferences button on the right side.
- **`togglePreferences()` + `listen('preferences-requested')`** (`src/components/preferences-panel.tsx:19` + `src/main.tsx:179`) — The entire Preferences activation pipeline already exists. New titlebar button just calls `togglePreferences()` directly.
- **`.split-handle-v`** (`src/main.tsx:102,104` + `src/drag-manager.ts`) — Existing zone-level resize handle pattern. Intra-zone vertical split resize either reuses this or gets its own sibling.
- **Per-scope-per-project tab cache** (`projectTabCache` Map + `saveProjectTabs` + `restoreProjectTabs` in `terminal-tabs.tsx`) — Already scoped; extending the scope axis from 2 to 6 keys is purely additive.

### Established Patterns
- **Tailwind 4 `@theme` tokens** via `src/tokens.ts` for every color/font/spacing. No hardcoded hex.
- **Preact signals** (`@preact/signals`) for reactive state; `useEffect` with cleanup for side-effects.
- **`listen()` from `@tauri-apps/api/event`** returns an unlisten fn — always captured + returned from effect cleanup.
- **Tests live beside components** (`*.test.tsx`) using `@testing-library/preact` + `mockIPC` (Phase 11 infra).
- **Services centralize IPC**: `file-service.ts`, `git-service.ts` wrap `invoke()`. No direct `@tauri-apps/api/core` in components.
- **`display:none`/`block` body toggling** (not unmount) for tab bodies that own xterm.js WebGL contexts or expensive parse caches — established in Phase 17 (terminal) + Phase 19 (GSD) + Phase 20 (sticky bodies).
- **Mouse-based drag** (not HTML5 DnD) throughout the tab bar — WKWebView hijacks `dragstart`/`dragend` on macOS. Use `mousedown` → `mousemove` → `mouseup`.

### Integration Points
- **`src/main.tsx`** lines 95–110 (titlebar drag region + add button + split handles) — insertion point for the new right-side Preferences button.
- **`src/main.tsx`** lines 100–110 (main zone + right zone render) — rewrite to render N sub-scopes stacked vertically with intra-zone resize handles per zone.
- **`src/components/unified-tab-bar.tsx`** — sticky branch removal (multiple sites); split-icon button addition next to `+` (around the plus-menu render); generalized `ownerScope` filtering in `computeDynamicTabsForScope` and `getOrderedTabsForScope`.
- **`src/components/right-panel.tsx`** — full rewrite: render N sub-scope tab bars stacked instead of single sticky-aware pane.
- **`src/components/main-panel.tsx`** — full rewrite for symmetry: render N sub-scope tab bars stacked.
- **`src/state-manager.ts`** — `TerminalScope` union extension, legacy-key migration routine on load, sticky-ID filter on load, per-zone split ratio persistence.
- **`src/components/preferences-panel.tsx`** — untouched.
- **`src-tauri/`** — no Rust changes expected. PTY session registry is name-based and scope-agnostic.

</code_context>

<specifics>
## Specific Ideas

- The user chose ASCII-schema preview mode during the split-model discussion and accepted all preview images as-designed. The mockups in the DISCUSSION-LOG should be treated as rough visual contracts for the UI.
- User specifically referenced existing left-side `[+]` button (`.titlebar-add-btn` in `src/main.tsx:92` + `app.css:444`) as the visual + CSS template for the new right-side Preferences button. "It exist already a Button at Left (+), you can base your work on it."
- "Uniform dynamic tabs" means all tab types go through the same render/drag/persist pipeline. No special cases for File Tree / GSD / Git Changes beyond fixed titles and singleton enforcement.
- User picked `3 max` for split count (not binary, not unlimited) — cap is a deliberate UX constraint, not a technical limit.
- User wants the current visual feel preserved on first launch: main gets a terminal, right gets GSD + File Tree. Just now those right-side tabs are dynamic (closeable) rather than sticky.
- "Each window stores..." in the roadmap was clarified implicitly as "each scope/split" — multi-window is still out of scope per PROJECT.md.

</specifics>

<deferred>
## Deferred Ideas

- **True multi-window support** — PROJECT.md §Out of Scope keeps this deferred indefinitely. Roadmap wording "each window" is reinterpreted as per-scope persistence.
- **Modal redesign of preferences** — roadmap says "Preferences modal" but D-18 keeps the existing slide-in. Centered-modal redesign deferred.
- **Keyboard shortcuts for split creation / navigation** (Cmd+\, Cmd+Shift+Arrow to move between scopes) — not discussed this phase; candidate for a later polish phase.
- **Tab-bar overflow UI** (scroll arrows, overflow dropdown) when many tabs or narrow split sub-pane — not discussed; existing wheel-scroll may suffice for now.
- **N-unlimited splits** — chose 3-max cap (D-07). Revisit if users hit the cap regularly.
- **GSD / Git Changes multi-instance** — chose singleton global (D-04). Revisit if users want side-by-side GSD views.
- **Horizontal in-zone splits** (left/right instead of top/bottom within a zone) — not requested; would require another scope axis.
- **Agent-quit confirm modal during cross-scope drag** — planner should decide whether dragging an Agent tab triggers the quit confirm (it shouldn't, since the PTY stays alive and just changes owner) but the path should be verified.
- **Tab-drag into titlebar to spawn new window** — only meaningful if multi-window is ever built.

### Reviewed Todos (not folded)
None — no pending todos were surfaced by `todo match-phase 22`.

</deferred>

---

*Phase: 22-dynamic-tabs-vertical-split-and-preferences-modal*
*Context gathered: 2026-04-18*
