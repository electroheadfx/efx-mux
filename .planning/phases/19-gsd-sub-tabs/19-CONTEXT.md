# Phase 19: GSD Sub-Tabs - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The current right-panel "GSD" tab (single markdown viewer over `project.gsd_file`, default `PLAN.md`) is extended into a 5-sub-tab view sourced from the project's `.planning/` directory:

1. **Milestones** — from `.planning/ROADMAP.md` `## Milestones` section
2. **Phases** — from `.planning/ROADMAP.md` `## Phase Details` section
3. **Progress** — from `.planning/ROADMAP.md` `## Progress` section
4. **History** — from `.planning/MILESTONES.md`
5. **State** — from `.planning/STATE.md` (YAML front-matter + Current Position / Decisions / Pending Todos / Blockers / Session Continuity)

In-scope: sub-tab UI, structured parsing + rendering per tab, auto-refresh on file change, missing-file fallback, phase-row expand/collapse. Out-of-scope: writing back to any of these files, graph visualizations, integration with `/gsd-*` CLI from inside the app, per-project overrides of which file maps to which tab.

</domain>

<decisions>
## Implementation Decisions

### Sub-Tab Placement & Hierarchy
- **D-01:** Sub-tabs are **nested under the existing `GSD` top tab**. Right-top tab bar stays `[File Tree, GSD]`. When `GSD` is active, a 2nd-row sub-tab bar renders above the content area with 5 pills: `Milestones / Phases / Progress / History / State`.
- **D-02:** Default sub-tab on first run = **State**. State is the most actionable view ("where am I?") and matches current-session intent.
- **D-03:** Active sub-tab is **persisted globally** (not per-project). Add a `gsdSubTab` signal to `state-manager.ts` alongside `rightTopTab`/`rightBottomTab`, serialize in `AppState`. Same persistence pattern as existing right-top tab.
- **D-04:** Sub-tab bar uses the **existing `TabBar` component** (`src/components/tab-bar.tsx`) — same blue-underline active state as the right-top bar. No new visual variant. Consistency.
- **D-05:** Sub-tab keyboard navigation — out of scope for this phase. Click-only selection. Keyboard shortcuts deferred to future polish.

### Rendering Strategy
- **D-06:** Each sub-tab renders a **per-tab structured extract**, not raw markdown. Every sub-tab parses the relevant section(s) from its source file and renders custom UI. Scan-friendly, matches the "live GSD progress" project value prop.
- **D-07:** Content is **section-scoped** per tab, not whole-file:
  - Milestones tab → only `## Milestones` section of `ROADMAP.md`
  - Phases tab → only `## Phase Details` section of `ROADMAP.md`
  - Progress tab → only `## Progress` section of `ROADMAP.md`
  - History tab → full `MILESTONES.md` (file is milestone-archive by nature)
  - State tab → YAML front-matter + selected sections of `STATE.md` (see D-10)
- **D-08:** **Phases tab = collapsible accordion.** Each phase is a row showing name + status badge (`✓` / `◆` / `○`) + plan count. Click row → accordion expands to reveal goal, depends-on, requirements list, plans list, success criteria. Same pattern as `git-changes-tab.tsx` accordion.
- **D-09:** **Progress tab = table view** (matches the existing `ROADMAP.md ## Progress` table): columns `Phase | Milestone | Plans | Status | Completed`. Plus a milestone-level summary header with overall completion % (parsed from the STATE.md progress block).
- **D-10:** **State tab** surfaces (in this order):
  1. Status header card: milestone name, status, progress %, last-activity string (from YAML front-matter)
  2. Current Position section (phase, plan, status, last-activity)
  3. Accumulated Context → Decisions (full list)
  4. Pending Todos
  5. Blockers/Concerns
  6. Session Continuity (last session timestamp, stopped-at, resume file)
  The long `## Quick Tasks Completed` table is **excluded** from the State tab (too noisy for "where am I").
- **D-11:** **Milestones tab** = card layout, one card per milestone (✅ shipped vs 🚧 in-progress), with title, phase count, ship date, phase range. Parses the bullet-list under `## Milestones` plus the `<details>` blocks.
- **D-12:** **History tab** = timeline list per shipped milestone from `MILESTONES.md`. Each entry shows title, ship date, phase/plan/task counts, key-accomplishments list (bulleted). Use `remark` output for inline markdown (`**bold**`, `--` em-dashes) inside each entry.

### Parsing Approach
- **D-13:** Parsing uses **`remark` + `unified`** (full markdown AST parser). New deps: `unified`, `remark-parse`, `remark-gfm` (GFM tables in ROADMAP Progress), `remark-frontmatter` (STATE.md YAML). User preference: robust parsing over regex fragility. Researcher to confirm exact version matrix.
- **D-14:** Parsing runs **in the frontend (TypeScript)**. No new Rust commands for parsing. Files are small (<100KB) — IPC parse-to-JSON would add latency without benefit. Consistent with existing `gsd-viewer.tsx` approach of reading via `read_file_content` and processing client-side.
- **D-15:** Parser layer lives in a new module: `src/services/gsd-parser.ts`. Exports typed parse functions per sub-tab: `parseMilestones(md)`, `parsePhases(md)`, `parseProgress(md)`, `parseHistory(md)`, `parseState(md)`. Each returns a typed structured object consumed by the corresponding sub-tab component.
- **D-16:** **Fail-soft** on malformed / missing sections: if the expected section is absent or the parser can't locate required tokens, the sub-tab renders an empty state with the message `"<Section> not found in <file>"` plus a "View raw file" link that falls back to `marked.js` rendering of the whole source file (reuses existing GSDViewer raw-render path). Never throws, never blanks the pane.
- **D-17:** **Parse caching** via module-level signals keyed by absolute file path. Parse once per file read; re-parse only when the `md-file-changed` event fires for that path (see D-19). Cache invalidation: drop entry on file-watcher event for its path.

### Interactivity & Refresh
- **D-18:** All 5 sub-tabs are **read-only**. No checkbox write-back, no inline editing, no state mutation from inside the sub-tabs. The existing `write_checkbox` Rust command is **not called from any sub-tab**. Users edit STATE/ROADMAP/MILESTONES through external editor tabs, the file tree, or `/gsd-*` CLI commands in a terminal. Safer — protects the integrity of planning artifacts.
- **D-19:** **Auto-refresh watches all 3 source files** in `.planning/` (`ROADMAP.md`, `MILESTONES.md`, `STATE.md`). The existing `md-file-changed` event channel is extended (or a sibling `planning-file-changed` channel is added) to emit for any of the three files. Sub-tabs subscribe once on mount and re-parse on event. Researcher to confirm whether the current Tauri file watcher handles multiple paths or needs a registration extension.
- **D-20:** Missing `.planning/` directory or missing individual source file: sub-tabs remain visible with a friendly per-tab empty state: `"No .planning/ROADMAP.md found. Run /gsd-new-project in a terminal to initialize."` Consistent tone across all 5 sub-tabs with the correct filename per tab. No hiding of the GSD top tab — preserves layout stability when switching projects.
- **D-21:** **Phase row expand** — clicking a phase in the Phases tab expands the accordion **in place only**. No cross-tab navigation, no file-tree reveal, no jump to phase directory. Keeps the GSD pane self-contained. Opening phase artifacts is a separate future enhancement.
- **D-22:** Sub-tab switching resets scroll to top of the new sub-tab. Per-tab scroll state is not persisted across switches.

### Existing Behavior Compatibility
- **D-23:** The current single-file GSD viewer (`src/components/gsd-viewer.tsx`, markdown of `project.gsd_file` with checkbox write-back) is **replaced entirely** by the 5-sub-tab composition. `project.gsd_file` field stays in `ProjectEntry` for now (used elsewhere / backward-compat) but is no longer read by the new GSD pane. Researcher to confirm if any other callers of `gsd_file` exist and flag them.
- **D-24:** `gsd-viewer.tsx` file is either gutted and re-used as the 5-sub-tab container, or deleted in favor of a new `gsd-pane.tsx` — planner's choice during task breakdown. Existing test `gsd-viewer.test.tsx` will be rewritten for the new pane.

### Claude's Discretion
- Exact parser package versions (pin during research).
- Icon choices for each sub-tab pill (Lucide icons).
- Empty-state illustration vs text-only.
- Milestone card exact layout and status colors.
- Progress bar rendering (ASCII-style like ROADMAP.md vs Tailwind progress component).
- Accordion animation duration / easing.
- Test coverage split between parser unit tests and component render tests.

### Folded Todos
None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source files to parse (content contract)
- `.planning/ROADMAP.md` — Defines sections `## Milestones`, `## Phases`, `## Phase Details`, `## Progress`. Parser reads these. Current shape determines parser expectations.
- `.planning/MILESTONES.md` — Defines shipped-milestone blocks with title + metadata + key accomplishments lists. Source for History tab.
- `.planning/STATE.md` — YAML front-matter (gsd_state_version, milestone, milestone_name, status, progress, stopped_at, etc.) plus sections `## Current Position`, `## Accumulated Context`, `## Session Continuity`, `## Quick Tasks Completed`. Source for State tab.
- `.planning/REQUIREMENTS.md` §v0.3.0 Requirements — defines the GSD-01…GSD-05 requirements driving this phase's success criteria.

### Existing components (target for modification / reuse)
- `src/components/gsd-viewer.tsx` — Current single-file GSD viewer. Replaced by the new 5-sub-tab container (see D-23, D-24).
- `src/components/gsd-viewer.test.tsx` — Existing render test. Rewrite for new pane.
- `src/components/right-panel.tsx` — Hosts right-top tab bar `[File Tree, GSD]` and renders `<GSDViewer />`. Swap to new pane and keep the top-tab layout.
- `src/components/tab-bar.tsx` — Reused as-is for the 2nd-row sub-tab bar (D-04).
- `src/components/git-changes-tab.tsx` — Reference pattern for accordion rows (D-08). Copy the expand/collapse approach.

### State & services
- `src/state-manager.ts` — Add `gsdSubTab` signal and serialize field in `AppState` (D-03). Existing `ProjectEntry.gsd_file` stays (D-23).
- `src/services/file-service.ts` — `readFile` / `read_file_content` already in place. Extend with specialized readers only if needed.
- `src/services/gsd-parser.ts` — **New module** (D-15). Exports typed parse functions per sub-tab.

### Tauri / Rust
- `src-tauri/src/` (file watcher + `md-file-changed` emitter) — Extend to watch the 3 `.planning/*.md` files (D-19). Confirm current watcher implementation and registration surface during research.
- `read_file_content` Tauri command — already present and used by GSDViewer. No new Rust command required for parsing (D-14).

### Design tokens
- `src/tokens.ts` — Navy-blue palette, `colors.accent`, `colors.textMuted`, spacing scale. Reused for all sub-tab UI.
- Existing TabBar active-underline style — reused per D-04.

### Prior phase context (read before planning)
- `.planning/phases/15-foundation-primitives/15-CONTEXT.md` — Context Menu + Dropdown primitives (not used by this phase but establishes reuse principle).
- `.planning/phases/16-sidebar-evolution-git-control/16-CONTEXT.md` — TabBar usage pattern.
- `.planning/phases/17-main-panel-file-tabs/17-CONTEXT.md` — Unified tab bar pattern (not directly reused but clarifies top-tab vs sub-tab split).
- `.planning/phases/18-file-tree-enhancements/18-CONTEXT.md` — Latest prior phase; file-service + watcher patterns.

### CLAUDE.md directives
- `/Users/lmarques/Dev/efx-mux/CLAUDE.md` — Stack notes (xterm 6.0, marked ^14, Tauri 2.10.3). Confirm `remark` + `unified` versions slot cleanly with existing deps during research.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TabBar` component (`src/components/tab-bar.tsx`): direct reuse for the sub-tab bar. Supports active-tab signal + click handler.
- `GSDViewer` file-change listener pattern (`gsd-viewer.tsx:97-103`): `listen('md-file-changed', ...)` + `getActiveProject()` re-read. Extend this pattern for 3-file watching.
- `read_file_content` Tauri command: existing, used by `gsd-viewer.tsx`, `editor-tab.tsx`, `main.tsx`. No new IPC surface needed.
- `git-changes-tab.tsx` accordion behavior: pattern to replicate for Phases-tab phase rows.
- State-manager signal + `AppState` serialization: pattern for persisting the active sub-tab (mirrors `rightTopTab`).
- `marked.js ^14` is already wired via `gsd-viewer.tsx` — retained for the fallback raw-render path on parse failure (D-16).

### Established Patterns
- Tailwind 4 `@theme` tokens from `tokens.ts` — all colors, fonts, spacing come from this module, never hardcoded.
- Preact signals for state (`@preact/signals`), `useEffect` in function components for side effects.
- `listen()` returns an unlisten fn — always captured + returned from effect cleanup.
- Tests live next to components (`*.test.tsx`), use `@testing-library/preact` + `mockIPC` for Tauri commands (per Phase 11 infra).
- File-service wrappers (`src/services/file-service.ts`) centralize IPC; services import from `@tauri-apps/api/core`.
- Component-per-file, no barrel re-exports in `src/components/`.

### Integration Points
- `right-panel.tsx` line 110-112 is the swap point for the current `<GSDViewer />` render. Replace with the new sub-tab pane.
- `state-manager.ts` `AppState` interface + load/save functions — add `gsdSubTab` field, migrate older persisted state (default on missing key).
- Tauri file watcher in `src-tauri/` currently emits `md-file-changed` for the active project's gsd file. Extend emitter logic to also watch `.planning/ROADMAP.md`, `.planning/MILESTONES.md`, `.planning/STATE.md` per active project.
- Event payload: if the current `md-file-changed` event carries a path, sub-tabs can filter by path. If not, researcher must confirm the watcher payload shape and recommend whether to add a new `planning-file-changed` event.

</code_context>

<specifics>
## Specific Ideas

- Sub-tab bar should feel like a secondary navigation layer — same blue-underline active state as the main tab bar, no new visual vocabulary. User explicitly chose "Match existing TabBar" over pill / segmented control.
- State tab is the default view because the user's framing of the app is "where am I, what's next" — the phrase used across PROJECT.md and STATE.md.
- The user accepted `remark`/`unified` despite being flagged as heavier than regex — correctness over weight for planning artifacts that are hand-edited and may drift in shape.
- Accordion-per-phase in Phases tab is chosen to match the existing `git-changes-tab.tsx` interaction model rather than inventing a new one.
- `## Quick Tasks Completed` in STATE.md is deliberately excluded from the State sub-tab — too dense, bleeds signal.

</specifics>

<deferred>
## Deferred Ideas

- Keyboard shortcuts for sub-tab switching (e.g., `Cmd+1..5` while GSD pane focused) — polish phase.
- Per-project override of which files map to which sub-tab — not needed; `.planning/` is a GSD convention.
- Clicking a phase to reveal its phase directory in the file tree — explicitly rejected in favor of in-place expand (D-21); revisit if user asks for it later.
- Inline editing / checkbox write-back from sub-tabs — rejected per D-18.
- Graph/visual rendering of phase dependency DAG — outside scope of planning-viewer.
- `/gsd-*` command palette integration from the sub-tabs — separate phase.
- Milestone card "ship a new milestone" action button — belongs with `/gsd-complete-milestone` UI, future phase.
- Scroll-position persistence per sub-tab — deferred (D-22).

### Reviewed Todos (not folded)
None — no pending todos were surfaced by `todo match-phase 19`.

</deferred>

---

*Phase: 19-gsd-sub-tabs*
*Context gathered: 2026-04-17*
