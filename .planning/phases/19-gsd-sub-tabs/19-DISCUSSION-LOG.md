# Phase 19: GSD Sub-Tabs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 19-gsd-sub-tabs
**Areas discussed:** Tab UI & placement, Rendering strategy, Parsing approach, Interactivity & refresh

---

## Tab UI & Placement

### Q1: Where do the 5 sub-tabs live?

| Option | Description | Selected |
|--------|-------------|----------|
| Nested under GSD | 2nd-row sub-tab bar when GSD top-tab active | ✓ |
| Flat — replace GSD with 5 tabs | Right-top bar becomes 6 tabs total | |
| GSD tab with dropdown picker | Header dropdown selector | |

**User's choice:** Nested under GSD (recommended)

### Q2: Default sub-tab on first open?

| Option | Description | Selected |
|--------|-------------|----------|
| State | Current position + next steps | ✓ |
| Progress | Overall completion bar/status table | |
| Phases | Full phase list | |

**User's choice:** State (recommended)

### Q3: Persist active sub-tab across restarts?

| Option | Description | Selected |
|--------|-------------|----------|
| Persist globally | `gsdSubTab` signal in state-manager, AppState field | ✓ |
| Persist per-project | Keyed by project name | |
| No persistence | Reset on restart | |

**User's choice:** Persist globally (recommended)

### Q4: Sub-tab bar visual style?

| Option | Description | Selected |
|--------|-------------|----------|
| Match existing TabBar | Reuse `tab-bar.tsx`, blue-underline active state | ✓ |
| Compact pill style | Smaller rounded pills | |
| Segmented control | macOS-style grouped buttons | |

**User's choice:** Match existing TabBar (recommended)

---

## Rendering Strategy

### Q5: Raw markdown or structured extract per tab?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-tab structured extract | Custom UI per sub-tab — tables, cards, accordion | ✓ |
| Raw marked.js render | Each sub-tab scrolls a filtered source slice | |
| Hybrid | Structured for structured data, raw for prose | |

**User's choice:** Per-tab structured extract (recommended)

### Q6: How much of source file per tab?

| Option | Description | Selected |
|--------|-------------|----------|
| Section-scoped | Milestones → `## Milestones`, Phases → `## Phase Details`, etc. | ✓ |
| Full file per tab | Whole source file, user scrolls | |
| Top-level summary with drill-in | Summary cards, click to expand | |

**User's choice:** Section-scoped (recommended)

### Q7: Phases sub-tab presentation?

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible accordion | Row → expand to show goal/plans/status | ✓ |
| Flat list with status badges | All phases visible, status pill per row | |
| Table view | Columns: phase/status/plans/date | |

**User's choice:** Collapsible accordion (recommended)

### Q8: State sub-tab contents?

| Option | Description | Selected |
|--------|-------------|----------|
| Current position + decisions + next | Status header + position + decisions + todos + blockers + session | ✓ |
| Full STATE.md rendered | Whole file (incl. Quick Tasks history) | |
| Compact header + sections picker | Top card + expand per section | |

**User's choice:** Current position + decisions + next (recommended) — excludes Quick Tasks section for signal-to-noise

---

## Parsing Approach

### Q9: Parser strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Regex section-split | Custom per-tab regex, no new deps | |
| marked.js AST walker | Use `marked.lexer()` on existing dep | |
| Full markdown parser (unified/remark) | New deps for full AST robustness | ✓ |

**User's choice:** Full markdown parser (unified/remark) — user explicitly chose robustness over dependency weight. Note: flagged as heavier than alternatives in the recommendation; user overrode the default pick.

### Q10: Parser runtime location?

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend TypeScript | Each sub-tab parses client-side, no new Rust cmds | ✓ |
| Rust backend parse | New commands return typed JSON | |
| Mixed | Prose raw, structured Rust-parsed | |

**User's choice:** Frontend TypeScript (recommended)

### Q11: Malformed / missing section handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail soft + raw view link | Empty state + "View raw" button falling back to marked.js | ✓ |
| Fail hard | Explicit error, no fallback | |
| Best-effort partial parse | Render what was found + warning toast | |

**User's choice:** Fail soft (recommended)

### Q12: Parse caching?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-parse on file change only | Module-level cache keyed by path, invalidate on `md-file-changed` | ✓ |
| Re-parse on every tab activation | Simpler, no cache invalidation bugs | |
| Web Worker parse | Over-engineered for <100KB files | |

**User's choice:** Re-parse on file change only (recommended)

---

## Interactivity & Refresh

### Q13: Interactivity level?

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only | No writes from any sub-tab | ✓ |
| Keep checkbox write-back everywhere | All tabs allow toggle via `write_checkbox` | |
| Read-only except Progress | Progress allows phase checkbox toggle only | |

**User's choice:** Read-only (recommended) — protects planning artifacts from accidental writes via UI

### Q14: Auto-refresh scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Watch all 3 source files | ROADMAP + MILESTONES + STATE | ✓ |
| Watch only active sub-tab's source | Subscribe/unsubscribe on switch | |
| Poll on tab activation only | Re-read on switch, no watcher | |

**User's choice:** Watch all 3 source files (recommended)

### Q15: Missing source file behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-tab empty state with help msg | Sub-tabs stay visible, friendly message per tab | ✓ |
| Hide GSD top tab entirely | Remove GSD pane when no `.planning/` | |
| Fall back to current GSDViewer | Read `project.gsd_file` PLAN.md | |

**User's choice:** Per-tab empty state (recommended)

### Q16: Clicking a phase in Phases tab?

| Option | Description | Selected |
|--------|-------------|----------|
| Expand accordion in-place | Row → expand, stay in pane | ✓ |
| Open phase dir in file tree | Reveal phase artifacts directory | |
| Both — expand + "Open artifacts" link | Expand reveals info + jump-to-tree button | |

**User's choice:** Expand accordion in-place (recommended)

---

## Claude's Discretion

- Parser package versions (pin during research)
- Lucide icon choices per sub-tab pill
- Empty-state illustration vs text-only
- Milestone card exact layout and status colors
- Progress bar rendering style (ASCII vs Tailwind progress)
- Accordion animation duration / easing
- Test coverage split (parser unit vs component render tests)

## Deferred Ideas

- Keyboard shortcuts for sub-tab switching (Cmd+1..5)
- Per-project override of file-to-tab mapping
- Click phase → reveal in file tree (rejected per D-21)
- Inline editing from sub-tabs (rejected per D-18)
- Phase dependency DAG visualization
- Command palette for `/gsd-*` actions from sub-tabs
- Milestone "ship" action button
- Per-sub-tab scroll state persistence
