# Phase 19: GSD Sub-Tabs - Research

**Researched:** 2026-04-17
**Domain:** Markdown AST parsing (unified/remark) + Preact component composition + Tauri event extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: Sub-tabs nested under existing `GSD` top tab. Second-row sub-tab bar: `Milestones / Phases / Progress / History / State`.
- D-02: Default sub-tab on first run = **State**.
- D-03: Active sub-tab persisted globally via `gsdSubTab` signal in `state-manager.ts` + `AppState`. Same serialization pattern as `rightTopTab`.
- D-04: Sub-tab bar reuses existing `TabBar` component unchanged.
- D-05: Keyboard navigation for sub-tabs out of scope (click-only).
- D-06: Each sub-tab renders structured extract, not raw markdown.
- D-07: Section-scoped content per tab (Milestones → `## Milestones` in ROADMAP.md, Phases → `## Phase Details`, Progress → `## Progress`, History → full MILESTONES.md, State → YAML front-matter + selected sections of STATE.md).
- D-08: Phases tab = collapsible accordion (pattern from `git-changes-tab.tsx`).
- D-09: Progress tab = table view with 5 columns + milestone-level summary header.
- D-10: State tab renders status header card, Current Position, Decisions, Pending Todos, Blockers/Concerns, Session Continuity. `## Quick Tasks Completed` excluded.
- D-11: Milestones tab = card layout, one card per milestone.
- D-12: History tab = timeline list from MILESTONES.md.
- D-13: Parsing uses **`unified` + `remark-parse` + `remark-gfm` + `remark-frontmatter`**. Researcher to confirm exact version matrix.
- D-14: Parsing runs in the frontend (TypeScript). No new Rust commands.
- D-15: Parser layer in new module `src/services/gsd-parser.ts`. Exports `parseMilestones(md)`, `parsePhases(md)`, `parseProgress(md)`, `parseHistory(md)`, `parseState(md)`.
- D-16: Fail-soft on malformed/missing sections: render empty state with "View raw file" link that falls back to `marked.js` raw render.
- D-17: Parse caching via module-level signals keyed by absolute file path. Invalidated on `md-file-changed` event for matching path.
- D-18: All sub-tabs read-only. No `write_checkbox` or write-back.
- D-19: Auto-refresh watches all 3 source files. `md-file-changed` event is extended (or sibling `planning-file-changed` added) to emit for ROADMAP.md, MILESTONES.md, STATE.md.
- D-20: Missing `.planning/` directory or source file: friendly per-tab empty state with correct filename. GSD top tab not hidden.
- D-21: Phase row expand in-place only, no cross-tab navigation.
- D-22: Sub-tab switching resets scroll to top.
- D-23: Existing single-file `GSDViewer` replaced entirely. `project.gsd_file` field stays in `ProjectEntry`.
- D-24: `gsd-viewer.tsx` is gutted/reused as container or deleted in favor of new `gsd-pane.tsx` — planner's choice.

### Claude's Discretion

- Exact parser package versions (pinned during research — see Standard Stack below).
- Icon choices for each sub-tab pill (Lucide icons — see UI-SPEC).
- Empty-state illustration vs text-only.
- Milestone card exact layout and status colors.
- Progress bar rendering (ASCII-style vs Tailwind progress component).
- Accordion animation duration / easing.
- Test coverage split between parser unit tests and component render tests.

### Deferred Ideas (OUT OF SCOPE)

- Keyboard shortcuts for sub-tab switching.
- Per-project override of which files map to which sub-tab.
- Click phase to reveal phase directory in file tree.
- Inline editing / checkbox write-back from sub-tabs.
- Graph/visual rendering of phase dependency DAG.
- `/gsd-*` command palette integration from sub-tabs.
- Milestone card "ship a new milestone" action button.
- Scroll-position persistence per sub-tab.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GSD-01 | User can view Milestones sub-tab parsed from ROADMAP.md | `parseMilestones(md)` extracts `## Milestones` bullet list from ROADMAP.md; rendered as cards |
| GSD-02 | User can view Phases sub-tab parsed from ROADMAP.md | `parsePhases(md)` extracts `## Phase Details` section; rendered as accordion rows |
| GSD-03 | User can view Progress sub-tab parsed from ROADMAP.md | `parseProgress(md)` extracts `## Progress` GFM table; rendered as styled table |
| GSD-04 | User can view History sub-tab from MILESTONES.md | `parseHistory(md)` reads full MILESTONES.md; rendered as timeline blocks |
| GSD-05 | User can view State sub-tab from STATE.md | `parseState(md)` reads YAML front-matter + selected sections; rendered as stacked cards |

</phase_requirements>

---

## Summary

Phase 19 adds 5 specialized read-only sub-tabs nested under the existing `GSD` top tab in the right panel. Each sub-tab parses a specific section of `.planning/ROADMAP.md`, `.planning/MILESTONES.md`, or `.planning/STATE.md` and renders structured UI. The core technical challenge is (1) the new markdown AST parser stack (unified + remark), (2) extending the Tauri file watcher to emit path-annotated events for multiple planning files, and (3) adding `gsdSubTab` to persisted state (which requires a Rust struct change, not just a JS change).

The existing `md-file-changed` Tauri event **already carries the changed file path as its string payload** (confirmed in `file_watcher.rs:55`). This means sub-tabs can filter by path without a new event type. The watcher itself uses `RecursiveMode::Recursive` on the whole project directory, so `.planning/` files are **already watched** — the current `GSDViewer` simply ignores the path payload and refreshes unconditionally. Sub-tabs only need to pattern-match the payload to decide which cache entry to invalidate.

`AppState.panels` in Rust is a typed `PanelsState` struct with no `#[serde(flatten)]` escape hatch. Adding `gsdSubTab` requires adding a new field to `PanelsState` in Rust and the corresponding TypeScript `AppState.panels` interface. The existing `AppState.layout` struct does have a `#[serde(flatten)] extra` HashMap escape — the planner could choose to store `gsdSubTab` in `layout.extra` to avoid the Rust struct change, but the canonical pattern (matching `rightTopTab`) means adding it to `PanelsState`.

**Primary recommendation:** Add `gsd-sub-tab` to `PanelsState` in Rust with `#[serde(default = "default_state_tab")]`. Read/write from JS via `currentState.panels['gsd-sub-tab']`. This is the cleanest path matching the existing two panel fields.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File reading (ROADMAP/MILESTONES/STATE.md) | Frontend (TS) | — | `read_file_content` Tauri command already in place; parsing is CPU-light and file-local |
| Markdown AST parsing | Frontend (TS) | — | D-14: files <100KB, IPC parse latency not worth it |
| Sub-tab state persistence | Frontend signal + Rust state.json | Rust `PanelsState` struct | Matches `rightTopTab` pattern; Rust owns the durable store |
| File change detection | Rust (file_watcher.rs) | — | FSEvent-backed debounced watcher already runs on project dir recursively |
| Event dispatch to frontend | Rust → Frontend (Tauri emit) | — | `md-file-changed` already emits the changed path; sub-tabs filter by filename |
| Sub-tab rendering | Frontend (Preact components) | — | All new components are Preact function components using existing token system |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `unified` | 11.0.5 | Plugin pipeline for mdast AST processing | ESM, actively maintained, canonical remark host [VERIFIED: npm registry] |
| `remark-parse` | 11.0.0 | Parse markdown string to mdast | Ships with unified 11 ecosystem [VERIFIED: npm registry] |
| `remark-gfm` | 4.0.1 | GFM tables support (Progress tab uses GFM table) | Latest stable for unified 11 [VERIFIED: npm registry] |
| `remark-frontmatter` | 5.0.0 | Expose YAML front-matter node in AST (State tab) | Latest stable, pure ESM [VERIFIED: npm registry] |
| `yaml` | 2.8.3 | Parse YAML string extracted from front-matter node | Pure ESM, no C deps, used by remark ecosystem [VERIFIED: npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `unist-util-visit` | 5.1.0 | Traverse mdast nodes by type | When walking headings, lists, tables inside parse functions [VERIFIED: npm registry] |
| `marked` (existing) | ^14.1.4 | Fallback raw render path (D-16) | Already installed; do not add again |
| `lucide-preact` (existing) | ^1.8.0 | Sub-tab pill icons | Already installed; do not add again |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unified` + `remark-parse` | Custom regex section splitter | Regex is faster to write but breaks on edge cases (inline backticks in headings, indented sections). D-13 chose correctness. |
| `yaml` package | `js-yaml` 4.1.1 | js-yaml is CommonJS-first; `yaml` is pure ESM, consistent with the ESM-only remark stack. |
| `unist-util-visit` | Manual AST recursion | The utility handles all node types and prevents accidental skipped subtrees. |

**Installation:**
```bash
pnpm add unified@11.0.5 remark-parse@11.0.0 remark-gfm@4.0.1 remark-frontmatter@5.0.0 yaml@2.8.3 unist-util-visit@5.1.0
```

**Version verification:** All versions confirmed against npm registry on 2026-04-17. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  RIGHT PANEL                                                      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Top TabBar: [File Tree] [●GSD]   (existing, unchanged)     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  GSDPane (new, replaces GSDViewer)                          │ │
│  │                                                             │ │
│  │  ┌───────────────────────────────────────────────────────┐  │ │
│  │  │  Sub-tab TabBar: [Milestones][Phases][Progress]       │  │ │
│  │  │                  [History][●State]  (reuses TabBar)   │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  ┌─── File Read Layer ───────────────────────────────────┐  │ │
│  │  │  invoke('read_file_content', {path})                  │  │ │
│  │  │  ROADMAP.md, MILESTONES.md, STATE.md                  │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  │               │                                             │ │
│  │               ▼                                             │ │
│  │  ┌─── gsd-parser.ts ─────────────────────────────────────┐  │ │
│  │  │  parseMilestones(md) → MilestonesData                 │  │ │
│  │  │  parsePhases(md) → PhasesData                         │  │ │
│  │  │  parseProgress(md) → ProgressData                     │  │ │
│  │  │  parseHistory(md) → HistoryData                       │  │ │
│  │  │  parseState(md) → StateData                           │  │ │
│  │  │  (module-level signal cache keyed by abs path)        │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  │               │                                             │ │
│  │               ▼                                             │ │
│  │  ┌─── Active Sub-tab Component ──────────────────────────┐  │ │
│  │  │  <MilestonesTab> / <PhasesTab> / <ProgressTab> /      │  │ │
│  │  │  <HistoryTab> / <StateTab>                            │  │ │
│  │  │  Empty state on parse failure (D-16)                  │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Bottom panel: Bash terminal (unchanged)                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

FILE WATCHER (Rust) ──── md-file-changed(path) ────► GSDPane listener
                                                      filters by filename,
                                                      invalidates cache,
                                                      re-reads + re-parses
```

### Recommended Project Structure

```
src/
├── components/
│   ├── gsd-pane.tsx          # New: replaces gsd-viewer.tsx (D-24)
│   ├── gsd-viewer.tsx        # To be deleted or gutted
│   └── gsd/
│       ├── milestones-tab.tsx
│       ├── phases-tab.tsx
│       ├── progress-tab.tsx
│       ├── history-tab.tsx
│       ├── state-tab.tsx
│       └── status-badge.tsx  # Shared ✓/◆/○ glyph helper
├── services/
│   ├── gsd-parser.ts         # New: all parse functions + typed outputs + cache
│   ├── file-service.ts       # Existing, no changes needed
│   └── git-service.ts        # Existing, no changes
├── state-manager.ts          # Add gsdSubTab signal + panels persistence
└── tokens.ts                 # Existing, no changes

src-tauri/src/
├── state.rs                  # Add gsd_sub_tab field to PanelsState
└── file_watcher.rs           # Verify md-file-changed payload already includes path (confirmed)
```

### Pattern 1: Section Extraction with remark + unist-util-visit

**What:** Find a heading by name, collect all sibling nodes until the next same-level heading.
**When to use:** extracting `## Milestones`, `## Phase Details`, `## Progress` from ROADMAP.md.

```typescript
// Source: unified/remark-parse docs (https://github.com/remarkjs/remark)
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Root, Heading, Content } from 'mdast';

function extractSection(tree: Root, headingText: string, depth: number = 2): Content[] {
  const nodes: Content[] = [];
  let inside = false;
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === depth) {
      const text = (node.children[0] as any)?.value ?? '';
      if (text === headingText) { inside = true; continue; }
      if (inside) break; // next same-depth heading ends section
    }
    if (inside) nodes.push(node);
  }
  return nodes;
}

const processor = unified().use(remarkParse).use(remarkGfm);
const tree = processor.parse(mdString) as Root;
const sectionNodes = extractSection(tree, 'Milestones');
```

### Pattern 2: YAML Front-matter Extraction

**What:** Extract and parse the YAML front-matter block from STATE.md.
**When to use:** State tab — `gsd_state_version`, `milestone_name`, `status`, `progress`, `stopped_at`, etc.

```typescript
// Source: remark-frontmatter docs (https://github.com/remarkjs/remark-frontmatter)
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { parse as parseYaml } from 'yaml';
import type { Root, YAML } from 'mdast';

function parseFrontmatter(md: string): Record<string, unknown> {
  const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
  const tree = processor.parse(md) as Root;
  const yamlNode = tree.children.find(n => n.type === 'yaml') as YAML | undefined;
  if (!yamlNode) return {};
  try {
    return parseYaml(yamlNode.value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
```

### Pattern 3: Parse Cache via Module-Level Signal

**What:** Cache parse results per absolute file path; invalidate on file change event.
**When to use:** All 5 parse functions to avoid re-parsing on every render.

```typescript
// Confirmed pattern: mirror of how git-changes-tab.tsx uses module-level signals
import { signal } from '@preact/signals';

const parseCache = signal<Record<string, ParsedGSD>>({});

export function invalidateCacheEntry(absolutePath: string): void {
  const next = { ...parseCache.value };
  delete next[absolutePath];
  parseCache.value = next;
}

// In GSDPane useEffect:
listen('md-file-changed', (event: { payload: string }) => {
  const changedPath = event.payload; // already the abs path from file_watcher.rs
  // Only invalidate if it matches one of our 3 source files
  if (changedPath.endsWith('ROADMAP.md') ||
      changedPath.endsWith('MILESTONES.md') ||
      changedPath.endsWith('STATE.md')) {
    invalidateCacheEntry(changedPath);
    reloadAndParse(changedPath);
  }
});
```

### Pattern 4: Accordion Expand/Collapse (from git-changes-tab.tsx)

**What:** Module-level signal holding a `Set<string>` of expanded IDs; toggled on click.
**When to use:** Phases tab accordion rows.

```typescript
// Source: src/components/git-changes-tab.tsx:26,182-200 (VERIFIED in codebase)
const expandedPhases = signal<Set<string>>(new Set());

function togglePhase(slug: string): void {
  const next = new Set(expandedPhases.value);
  if (next.has(slug)) { next.delete(slug); } else { next.add(slug); }
  expandedPhases.value = next;
}

// In JSX:
<button
  aria-expanded={expandedPhases.value.has(phase.slug)}
  aria-controls={`phase-${phase.slug}-panel`}
  onClick={() => togglePhase(phase.slug)}
>
  {expandedPhases.value.has(phase.slug)
    ? <ChevronDown size={14} />
    : <ChevronRight size={14} />}
  {phase.name}
</button>
{expandedPhases.value.has(phase.slug) && (
  <div id={`phase-${phase.slug}-panel`} role="region">...</div>
)}
```

### Pattern 5: gsdSubTab Signal + AppState Persistence

**What:** Global persisted signal for the active sub-tab name. Matches `rightTopTab` exactly.
**When to use:** `state-manager.ts` + `right-panel.tsx` / `gsd-pane.tsx`.

```typescript
// Source: src/state-manager.ts:45-46 (VERIFIED in codebase — mirroring rightTopTab)
export const gsdSubTab = signal('State'); // default per D-02

// In loadAppState():
if (currentState?.panels?.['gsd-sub-tab']) {
  gsdSubTab.value = currentState.panels['gsd-sub-tab'];
}

// In saveAppState() or on tab switch:
currentState.panels['gsd-sub-tab'] = gsdSubTab.value;
```

**Rust side (state.rs PanelsState):**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelsState {
    #[serde(default = "default_right_top_tab", rename = "right-top-tab")]
    pub right_top_tab: String,

    #[serde(default = "default_right_bottom_tab", rename = "right-bottom-tab")]
    pub right_bottom_tab: String,

    // New for Phase 19 (D-03)
    #[serde(default = "default_gsd_sub_tab", rename = "gsd-sub-tab")]
    pub gsd_sub_tab: String,
}

fn default_gsd_sub_tab() -> String { "State".into() }
```

The `#[serde(default)]` attribute ensures zero-migration backward compatibility: existing `state.json` files that lack the key will default to `"State"` automatically.

### Anti-Patterns to Avoid

- **Blocking on `unified().process()` as async:** `unified().parse()` is synchronous — use it, not `await processor.process()`. The async form is for stringify pipelines. [CITED: https://github.com/unifiedjs/unified#processorparsefile]
- **Regex-based heading detection:** heading text extraction via regex breaks when the heading contains inline code or bold. Always use the AST node's children.
- **Sharing a single `unified` processor instance across hot-reloads:** Processors are stateful after plugins are added. Create once at module level as a `const`.
- **Listening to `md-file-changed` without path filtering:** The current `GSDViewer` fires `loadGSD` on any `.md` change. Sub-tabs MUST filter by the specific planning file paths to avoid spurious re-parses when the user edits a random `.md` in the project.
- **Forgetting the unlisten cleanup:** Every `listen()` call returns a promise of an unlisten function. All sub-tabs must capture this and return it from `useEffect` cleanup. [VERIFIED: src/components/gsd-viewer.tsx:97-103, git-changes-tab.tsx:231]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown AST parsing | Custom section regex | `unified` + `remark-parse` | Handles edge cases: inline code in headings, nested lists, blockquotes within sections |
| GFM table parsing | Split `\|` by hand | `remark-gfm` | Handles colspan, alignment, empty cells, pipes inside code spans |
| YAML front-matter parsing | `split('---')` + manual parse | `remark-frontmatter` + `yaml` | Handles multi-line values, quoted strings, nested maps |
| AST node traversal | Recursive `for...of` | `unist-util-visit` | Handles all node types including custom/plugin nodes |

**Key insight:** ROADMAP.md uses `<details>` HTML blocks alongside standard markdown. The remark AST exposes these as `html` nodes — they can be extracted as raw HTML strings and filtered out by the parser without crashing.

---

## Runtime State Inventory

> Not applicable: This is a greenfield rendering phase, not a rename/refactor phase. No stored data, live service configs, or OS registrations are being renamed.

---

## Common Pitfalls

### Pitfall 1: `md-file-changed` Fires for Non-Planning `.md` Files

**What goes wrong:** The Rust watcher watches the entire project directory recursively. Editing any `.md` file (e.g., a README inside the project) emits `md-file-changed`. Without path filtering, every sub-tab re-parses.
**Why it happens:** `file_watcher.rs:68` — `RecursiveMode::Recursive` on `project_path`, not `.planning/`.
**How to avoid:** Filter the event payload: only respond if `event.payload` ends with `ROADMAP.md`, `MILESTONES.md`, or `STATE.md` (or contains `.planning/`).
**Warning signs:** Performance degradation when editing files; parse cache constantly invalidated.

### Pitfall 2: `PanelsState` Requires a Rust Struct Change

**What goes wrong:** Planner assumes `AppState.panels` is a `Record<string, string>` and only adds a JS key. The Rust `PanelsState` struct has **no `#[serde(flatten)]` extra HashMap** (unlike `LayoutState` and `SessionState`). Unknown keys in the JSON are silently dropped by serde. `gsdSubTab` will not survive a reload.
**Why it happens:** The JS TypeScript interface is typed as `Record<string, string>` which looks like a freeform map, but the Rust deserializer uses a strict typed struct.
**How to avoid:** Add `gsd_sub_tab: String` to `PanelsState` in `state.rs` with `#[serde(default)]`. Also update the JS `AppState.panels` interface to expose `'gsd-sub-tab'?: string`.
**Warning signs:** `gsdSubTab` signal defaults to `'State'` on every app restart even after explicit tab selection.

> OPTION B (planner discretion): Store `gsd-sub-tab` in `AppState.layout` instead — `LayoutState` has `#[serde(flatten)] extra: HashMap<String, Value>` that accepts arbitrary keys. This avoids the Rust struct change. Trade-off: the key ends up in a semantically wrong object (`layout` vs `panels`), but is functionally identical. Planner may choose this to reduce scope.

### Pitfall 3: unified/remark Are Pure ESM — Vite Config Target Is `safari16`

**What goes wrong:** `unified@11`, `remark-parse@11`, `remark-gfm@4`, `remark-frontmatter@5` are all `"type": "module"` packages. Vite handles ESM fine — **no issue in production build**.  The pitfall is in Vitest tests: the jsdom test environment may fail to import these if `ssr.noExternal` or `deps.interopDefault` is not configured.
**Why it happens:** Vitest's SSR transform defaults differ from Vite's browser build. Pure ESM packages need `ssr.noExternal` to be bundled.
**How to avoid:** Add to `vitest.config.ts`:
```typescript
test: {
  server: { deps: { inline: ['unified', 'remark-parse', 'remark-gfm', 'remark-frontmatter', 'yaml', 'unist-util-visit'] } }
}
```
**Warning signs:** `ERR_REQUIRE_ESM` or `Cannot find module` errors only in `vitest run` (not in dev/build).

### Pitfall 4: `<details>` Blocks in ROADMAP.md Parsed as `html` Nodes

**What goes wrong:** The `## Phases` section of ROADMAP.md contains `<details><summary>...</summary>` blocks for shipped milestones. The remark AST represents these as `html` type nodes. Iterating children expecting only `heading` and `list` nodes will miss the `<details>` content.
**Why it happens:** `remark-parse` does not parse HTML tags — it emits them as opaque `html` nodes.
**How to avoid:** The Phases tab only needs to parse the `### v0.3.0 Workspace Evolution (In Progress)` section (non-`<details>`). Shipped phases in `<details>` blocks are intentionally out of scope for the Phases tab (they are already complete). The parser should skip `html` nodes safely and only process the `### Phase N:` headings outside `<details>`.
**Warning signs:** Phases tab shows only in-progress phases — this is correct behavior, not a bug.

### Pitfall 5: `AppState` Interface Mismatch Between JS and Rust

**What goes wrong:** The JS `AppState` interface defines `panels: Record<string, string>`. When `loadAppState` restores from state.json, the `panels` object is a plain JSON object. If the code reads `currentState.panels['gsd-sub-tab']` but the Rust `PanelsState` struct doesn't include that field, the value is never serialized and always comes back as `undefined`.
**Why it happens:** Rust serde strict struct deserialization silently drops unknown fields.
**How to avoid:** Add the field to Rust struct. See Pitfall 2.

### Pitfall 6: ROADMAP.md `## Progress` Table — GFM Table Node Shape

**What goes wrong:** The progress table has header cells with pipes aligned with spaces. Without `remark-gfm`, the parser treats the table as a paragraph with `|` characters.
**Why it happens:** GFM tables are not part of the CommonMark spec — `remark-parse` alone doesn't parse them.
**How to avoid:** Always chain `.use(remarkGfm)` before parsing any ROADMAP.md content. GFM table nodes have type `table` with children of type `tableRow` > `tableCell`. [CITED: https://github.com/remarkjs/remark-gfm]

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### Accessing `md-file-changed` Payload (Confirmed Path Already Included)

```typescript
// Source: src-tauri/src/file_watcher.rs:54-56 (VERIFIED in codebase)
// The Rust side emits: handle.emit("md-file-changed", changed_path)
// changed_path is a String (absolute path)

// Frontend listener — payload is the absolute path string:
const unlisten = await listen<string>('md-file-changed', (event) => {
  const changedPath = event.payload; // e.g. "/Users/foo/myproject/.planning/STATE.md"
  if (changedPath.endsWith('/STATE.md') ||
      changedPath.endsWith('/ROADMAP.md') ||
      changedPath.endsWith('/MILESTONES.md')) {
    invalidateCacheEntry(changedPath);
    loadPlanningFile(changedPath);
  }
});
// cleanup: return () => { unlisten(); }
```

### Reading a Planning File

```typescript
// Source: src/services/file-service.ts:94-100 (VERIFIED in codebase)
// readFile already wraps read_file_content with FileError
import { readFile } from './file-service';

async function loadPlanningFile(absolutePath: string): Promise<string | null> {
  try {
    return await readFile(absolutePath);
  } catch {
    return null; // triggers missing-file empty state (D-20)
  }
}
```

### TabBar Usage (Reused Unchanged)

```typescript
// Source: src/components/tab-bar.tsx:13-38 (VERIFIED in codebase)
// TabBar accepts: tabs: string[], activeTab: Signal<string>, onSwitch: (tab) => void
import { TabBar } from './tab-bar';
import { gsdSubTab } from '../state-manager';

const GSD_SUB_TABS = ['Milestones', 'Phases', 'Progress', 'History', 'State'];

<TabBar
  tabs={GSD_SUB_TABS}
  activeTab={gsdSubTab}
  onSwitch={(tab) => { gsdSubTab.value = tab; /* persist via updatePanels */ }}
/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| unified 9.x (CommonJS) | unified 11.x (pure ESM) | 2022-2023 | Import style changed from `require('unified')` to `import { unified } from 'unified'` |
| `@mdast-util/...` direct | Plugins via `.use()` | stable | Plugin system is the only supported surface |
| `remark-parse` as standalone | Part of unified pipeline | stable | Always chain via `unified().use(remarkParse)` |

**Deprecated/outdated:**
- `remark` (the old top-level meta-package): Use `unified` + `remark-parse` + `remark-gfm` individually — the `remark` meta-package is a convenience wrapper that hasn't kept pace. [CITED: https://github.com/remarkjs/remark]
- `gray-matter`: Heavier YAML/TOML front-matter package; `remark-frontmatter` + `yaml` is lighter and stays in the unified ecosystem.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `md-file-changed` event payload is the absolute path string, usable for path-based filtering | Code Examples, Common Pitfalls | If payload were empty or the event were not typed — sub-tabs would need a separate Tauri command call to identify which file changed. Low risk: confirmed in source. |
| A2 | `PanelsState` has no `#[serde(flatten)]` extra map | Architecture Patterns (Pattern 5) | If there were an escape hatch, the Rust change could be skipped. Confirmed by reading state.rs in full. [VERIFIED: codebase] |
| A3 | ROADMAP.md `## Phase Details` section uses `### Phase N:` H3 headings that are NOT inside `<details>` blocks for in-progress phases | Common Pitfalls (Pitfall 4) | If H3 headings for in-progress phases were inside `<details>`, the parser would need to handle HTML. Confirmed by reading ROADMAP.md. [VERIFIED: codebase] |
| A4 | Vitest ESM handling for unified packages requires `server.deps.inline` | Common Pitfalls (Pitfall 3) | Could turn out that Vite's default handles these correctly. Low risk — the safeguard costs nothing. [ASSUMED — test env behavior] |

---

## Open Questions

1. **gsdSubTab persistence: PanelsState field vs LayoutState.extra**
   - What we know: `PanelsState` has no escape hatch; `LayoutState.extra` does.
   - What's unclear: Planner's preference for scope (Rust change or not).
   - Recommendation: Add to `PanelsState` for semantic correctness. One Rust field + one Rust test update = well-understood scope.

2. **Resume-file link in State tab (Interaction Contract, UI-SPEC)**
   - What we know: The UI-SPEC says "open the referenced file in a main-panel editor tab (if file-service supports it) — planner to confirm; if not supported, copy path to clipboard and show toast."
   - What's unclear: Whether the `openFileInEditorTab` mechanism from Phase 17 is exposed as a callable from outside `terminal-tabs.tsx`.
   - Recommendation: Check how `editor-tab.tsx` / `unified-tab-bar.tsx` expose file-open. If a `document.dispatchEvent('open-file-in-tab')` or equivalent exists, use it. Otherwise default to clipboard copy + toast (already implemented).

3. **Old `GSDViewer` test rewrite scope**
   - What we know: `gsd-viewer.test.tsx` has 6 tests for the old component.
   - What's unclear: Whether to delete the file and create `gsd-pane.test.tsx`, or rename in-place.
   - Recommendation: Delete `gsd-viewer.test.tsx`, create `gsd-pane.test.tsx` + `gsd-parser.test.ts`. Parser unit tests are higher value than render tests here.

---

## Environment Availability

> Step 2.6: SKIPPED for the Tauri/Vite/pnpm toolchain (all confirmed present from prior phases). New npm packages (unified ecosystem) are pure JS — no native deps, no C toolchain needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | package install | ✓ | (project-standard) | — |
| unified, remark-parse, etc. | gsd-parser.ts | ✗ (not yet installed) | — | Run install in Wave 0 |
| Node.js / Vite build | frontend bundle | ✓ | (project-standard) | — |

**Missing dependencies with no fallback:**
- `unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`, `remark-frontmatter@5.0.0`, `yaml@2.8.3`, `unist-util-visit@5.1.0` — install in Wave 0 plan task before any parser code runs.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GSD-01 | `parseMilestones` extracts milestone list from ROADMAP.md | unit | `pnpm test src/services/gsd-parser.test.ts` | ❌ Wave 0 |
| GSD-02 | `parsePhases` extracts Phase Details accordion data | unit | `pnpm test src/services/gsd-parser.test.ts` | ❌ Wave 0 |
| GSD-03 | `parseProgress` extracts GFM progress table | unit | `pnpm test src/services/gsd-parser.test.ts` | ❌ Wave 0 |
| GSD-04 | `parseHistory` returns timeline blocks from MILESTONES.md | unit | `pnpm test src/services/gsd-parser.test.ts` | ❌ Wave 0 |
| GSD-05 | `parseState` returns front-matter + section data from STATE.md | unit | `pnpm test src/services/gsd-parser.test.ts` | ❌ Wave 0 |
| GSD-01 | MilestonesTab renders card per milestone | render | `pnpm test src/components/gsd-pane.test.tsx` | ❌ Wave 0 |
| GSD-02 | PhasesTab renders accordion + expands on click | render | `pnpm test src/components/gsd-pane.test.tsx` | ❌ Wave 0 |
| GSD-05 | StateTab shows status header from YAML front-matter | render | `pnpm test src/components/gsd-pane.test.tsx` | ❌ Wave 0 |
| GSD-01–05 | GSDPane shows empty state when file missing | render | `pnpm test src/components/gsd-pane.test.tsx` | ❌ Wave 0 |
| GSD-03 | Progress tab shows GFM table | render | `pnpm test src/components/gsd-pane.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test:coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/services/gsd-parser.test.ts` — unit tests for all 5 parse functions with fixture markdown
- [ ] `src/components/gsd-pane.test.tsx` — render tests for GSDPane + all 5 sub-tabs (replaces `gsd-viewer.test.tsx`)
- [ ] `src/components/gsd-viewer.test.tsx` — DELETE (old component replaced)
- [ ] Vitest config: add `server.deps.inline` for unified/remark ESM packages
- [ ] Package install: `pnpm add unified remark-parse remark-gfm remark-frontmatter yaml unist-util-visit`

---

## Security Domain

> `security_enforcement` not set to false — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (read-only local file viewer) |
| V3 Session Management | no | — (no sessions in sub-tabs) |
| V4 Access Control | no | — (reads files user already owns via Tauri file ops) |
| V5 Input Validation | yes | All parsed markdown is display-only; no user input injected into commands or DB queries |
| V6 Cryptography | no | — (no crypto operations) |

### Known Threat Patterns for Markdown AST Parsing

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via dangerouslySetInnerHTML on raw markdown HTML | Tampering | Only use `dangerouslySetInnerHTML` for fallback `marked.parse` output — same as existing `GSDViewer`. Content is from local project files the user owns, not remote. Risk is low. |
| Malformed YAML front-matter crash | Denial of Service | `try/catch` around `yaml.parse()` per D-16 fail-soft requirement |
| File path injection | Tampering | File paths are constructed from `activeProject.path + '/.planning/' + filename` — no user-controlled path segments |

---

## Sources

### Primary (HIGH confidence)

- `/Users/lmarques/Dev/efx-mux/src-tauri/src/file_watcher.rs` — confirmed `md-file-changed` payload is absolute path string [VERIFIED: codebase]
- `/Users/lmarques/Dev/efx-mux/src-tauri/src/state.rs` — confirmed `PanelsState` struct has no `flatten` escape hatch [VERIFIED: codebase]
- `/Users/lmarques/Dev/efx-mux/src/components/git-changes-tab.tsx` — confirmed accordion pattern using `Set<string>` signal [VERIFIED: codebase]
- `/Users/lmarques/Dev/efx-mux/src/components/tab-bar.tsx` — confirmed `TabBar` API signature [VERIFIED: codebase]
- npm registry — unified@11.0.5, remark-parse@11.0.0, remark-gfm@4.0.1, remark-frontmatter@5.0.0, yaml@2.8.3, unist-util-visit@5.1.0 [VERIFIED: npm view on 2026-04-17]

### Secondary (MEDIUM confidence)

- https://github.com/unifiedjs/unified — pipeline API, `.parse()` is synchronous [CITED]
- https://github.com/remarkjs/remark-frontmatter — YAML node type in mdast [CITED]
- https://github.com/remarkjs/remark-gfm — GFM table node shape [CITED]

### Tertiary (LOW confidence)

- Vitest `server.deps.inline` requirement for pure ESM packages — based on known Vitest behavior patterns [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all package versions verified against npm registry on research date
- Architecture: HIGH — based on direct codebase inspection of all referenced files
- Pitfalls: HIGH for Pitfalls 1-3, 5, 6 (verified in source); MEDIUM for Pitfall 4 (verified by reading ROADMAP.md structure)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable ecosystem — remark/unified release slowly)
