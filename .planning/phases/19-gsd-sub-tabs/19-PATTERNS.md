# Phase 19: GSD Sub-Tabs - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 12 new/modified files
**Analogs found:** 11 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/gsd-pane.tsx` | component (container) | event-driven | `src/components/gsd-viewer.tsx` | exact |
| `src/components/gsd/milestones-tab.tsx` | component | transform | `src/components/git-changes-tab.tsx` (card rows pattern) | role-match |
| `src/components/gsd/phases-tab.tsx` | component | transform | `src/components/git-changes-tab.tsx` (accordion) | exact |
| `src/components/gsd/progress-tab.tsx` | component | transform | `src/components/git-changes-tab.tsx` (empty state + table rows) | role-match |
| `src/components/gsd/history-tab.tsx` | component | transform | `src/components/git-changes-tab.tsx` (list items) | role-match |
| `src/components/gsd/state-tab.tsx` | component | transform | `src/components/gsd-viewer.tsx` (read file + display) | role-match |
| `src/components/gsd/status-badge.tsx` | utility component | — | `src/components/git-changes-tab.tsx` lines 115-153 (statusBadge fn) | exact |
| `src/services/gsd-parser.ts` | service (pure) | transform | `src/services/file-service.ts` (typed-error service module) | role-match |
| `src/services/gsd-parser.test.ts` | test | — | `src/services/file-service.test.ts` (unit test, mockIPC) | exact |
| `src/components/gsd-pane.test.tsx` | test | — | `src/components/gsd-viewer.test.tsx` (render test pattern) | exact |
| `src/state-manager.ts` (modified) | state | — | `src/state-manager.ts` lines 45-46 + 83-84 (signal + panel restore) | self |
| `src-tauri/src/state.rs` (modified) | config | — | `src-tauri/src/state.rs` lines 171-186 (PanelsState struct) | self |

---

## Pattern Assignments

### `src/components/gsd-pane.tsx` (component container, event-driven)

**Analog:** `src/components/gsd-viewer.tsx`

**Imports pattern** (lines 6-12):
```typescript
import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { colors } from '../tokens';
```

**Additional imports for GSDPane** (new deps):
```typescript
import { signal } from '@preact/signals';
import { TabBar } from './tab-bar';
import { gsdSubTab, getCurrentState, saveAppState } from '../state-manager';
import { MilestonesTab } from './gsd/milestones-tab';
import { PhasesTab } from './gsd/phases-tab';
import { ProgressTab } from './gsd/progress-tab';
import { HistoryTab } from './gsd/history-tab';
import { StateTab } from './gsd/state-tab';
```

**File read + md-file-changed event listener pattern** (lines 70-122 of `gsd-viewer.tsx`):
```typescript
// In useEffect:
let unlistenFn: (() => void) | null = null;
listen('md-file-changed', (event: { payload: string }) => {
  // GSDViewer listens unconditionally — GSDPane must filter by path:
  const changedPath = event.payload;
  if (changedPath.endsWith('/ROADMAP.md') ||
      changedPath.endsWith('/MILESTONES.md') ||
      changedPath.endsWith('/STATE.md')) {
    invalidateCacheEntry(changedPath);
    reloadPlanningFile(changedPath);
  }
}).then(fn => { unlistenFn = fn; });

// project-changed DOM event (same pattern as gsd-viewer.tsx line 106-112):
function handleProjectChanged() {
  setTimeout(() => {
    const project = getActiveProject();
    if (project) loadAllPlanningFiles(project);
  }, 50);
}
document.addEventListener('project-changed', handleProjectChanged);

// Cleanup (line 118-121 of gsd-viewer.tsx):
return () => {
  if (unlistenFn) unlistenFn();
  document.removeEventListener('project-changed', handleProjectChanged);
};
```

**Error handling pattern** (lines 87-93 of `gsd-viewer.tsx`):
```typescript
try {
  const content = await invoke<string>('read_file_content', { path });
  // ... parse
} catch (err) {
  console.warn('[efxmux] Failed to load planning file:', err);
  // render missing-file empty state (D-20)
}
```

**Active project resolver** (lines 66-68 of `gsd-viewer.tsx`):
```typescript
function getActiveProject(): ProjectEntry | undefined {
  return projects.value.find(p => p.name === activeProjectName.value);
}
```

**TabBar integration for sub-tabs** (confirmed from `tab-bar.tsx` lines 7-10 + `right-panel.tsx` lines 104-108):
```typescript
const GSD_SUB_TABS = ['Milestones', 'Phases', 'Progress', 'History', 'State'];

<TabBar
  tabs={GSD_SUB_TABS}
  activeTab={gsdSubTab}
  onSwitch={(tab) => {
    gsdSubTab.value = tab;
    const state = getCurrentState();
    if (state) {
      state.panels['gsd-sub-tab'] = tab;
      saveAppState(state);
    }
  }}
/>
```

**Sub-tab content area layout** (mirrors `right-panel.tsx` lines 109-116):
```typescript
<div style={{ padding: spacing['4xl'], overflowY: 'auto', flex: 1 }}>
  {gsdSubTab.value === 'Milestones' && <MilestonesTab data={milestonesData} />}
  {gsdSubTab.value === 'Phases' && <PhasesTab data={phasesData} />}
  {gsdSubTab.value === 'Progress' && <ProgressTab data={progressData} />}
  {gsdSubTab.value === 'History' && <HistoryTab data={historyData} />}
  {gsdSubTab.value === 'State' && <StateTab data={stateData} />}
</div>
```

---

### `src/components/gsd/phases-tab.tsx` (component, transform, accordion)

**Analog:** `src/components/git-changes-tab.tsx`

**Module-level accordion signal** (lines 26-28 of `git-changes-tab.tsx`):
```typescript
import { signal } from '@preact/signals';

const expandedPhases = signal<Set<string>>(new Set());
```

**Toggle function** (lines 182-201 of `git-changes-tab.tsx`, adapted):
```typescript
function togglePhase(slug: string): void {
  const next = new Set(expandedPhases.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  expandedPhases.value = next;
}
```

**Accordion header row** (lines 293-350 of `git-changes-tab.tsx`, adapted):
```typescript
<div
  onClick={() => togglePhase(phase.slug)}
  style={{
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.lg}px ${spacing['3xl']}px`,
    minHeight: 32,
    backgroundColor: colors.bgBase,
    borderBottom: `1px solid ${colors.bgBorder}`,
    cursor: 'pointer',
    gap: spacing.md,
    // Current-phase accent: 2px left border when phase matches STATE.md position
    borderLeft: isCurrentPhase ? `2px solid ${colors.accent}` : '2px solid transparent',
  }}
  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.accentMuted; }}
  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.bgBase; }}
>
  {isExpanded
    ? <ChevronDown size={14} style={{ color: colors.accent, flexShrink: 0 }} />
    : <ChevronRight size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />}
  <StatusBadge status={phase.status} />
  <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, color: colors.textPrimary, flex: 1 }}>
    {phase.name}
  </span>
  <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, color: colors.textMuted }}>
    {phase.planCount} plans
  </span>
</div>
```

**Accordion content panel** (lines 351-357 of `git-changes-tab.tsx`, adapted):
```typescript
{isExpanded && (
  <div
    id={`phase-${phase.slug}-panel`}
    role="region"
    aria-label={phase.name}
    style={{
      backgroundColor: colors.bgElevated,
      padding: spacing['4xl'],
      borderBottom: `1px solid ${colors.bgBorder}`,
    }}
  >
    {/* goal, depends-on, requirements, plans, success criteria */}
  </div>
)}
```

**Accessible button for expand** (from `git-changes-tab.tsx` row, adapted to use `<button>` per UI-SPEC accessibility):
```typescript
<button
  aria-expanded={expandedPhases.value.has(phase.slug)}
  aria-controls={`phase-${phase.slug}-panel`}
  onClick={() => togglePhase(phase.slug)}
  style={{ /* inherit row styles */ }}
>
```

**Empty state** (lines 252-272 of `git-changes-tab.tsx`, adapted):
```typescript
if (!data || data.phases.length === 0) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '100%', gap: spacing['3xl'] }}>
      <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.xl, fontWeight: 600,
                     color: colors.textMuted }}>
        Phase details not found
      </span>
      <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.lg, color: colors.textDim }}>
        Expected ## Phase Details in .planning/ROADMAP.md.
      </span>
    </div>
  );
}
```

---

### `src/components/gsd/status-badge.tsx` (utility component)

**Analog:** `src/components/git-changes-tab.tsx` lines 115-153 (`statusBadge` function)

**Pattern to copy** (lines 115-153 of `git-changes-tab.tsx`, adapted for GSD status glyphs):
```typescript
import { colors, fonts, spacing, radii, fontSizes } from '../../tokens';

interface StatusBadgeProps {
  status: 'complete' | 'in-progress' | 'not-started';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const glyph = status === 'complete' ? '✓' : status === 'in-progress' ? '◆' : '○';
  const color = status === 'complete'
    ? colors.statusGreen
    : status === 'in-progress'
      ? colors.statusYellow
      : colors.textMuted;
  const label = status === 'complete' ? 'Complete'
    : status === 'in-progress' ? 'In progress' : 'Not started';

  return (
    <span
      aria-label={label}
      title={label}
      style={{
        fontFamily: fonts.sans,
        fontSize: fontSizes.base,
        color,
        flexShrink: 0,
      }}
    >
      {glyph}
    </span>
  );
}
```

---

### `src/components/gsd/milestones-tab.tsx` (component, transform, card layout)

**Analog:** `src/components/git-changes-tab.tsx` (container + empty state pattern)

**Card layout pattern** (no direct analog — use tokens from git-changes-tab.tsx statusBadge + git-control-tab card layout):
```typescript
// One card per milestone — bgElevated, bgBorder, radii.lg, spacing['4xl'] padding
<div
  style={{
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.bgBorder}`,
    borderLeft: milestone.isInProgress ? `2px solid ${colors.accent}` : `1px solid ${colors.bgBorder}`,
    borderRadius: radii.lg,
    padding: spacing['4xl'],
    marginBottom: spacing['5xl'],
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
    <span aria-label={milestone.isInProgress ? 'In progress' : 'Shipped'}>
      {milestone.isInProgress ? '🚧' : '✅'}
    </span>
    <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.xl, fontWeight: 600,
                   color: colors.textPrimary }}>
      {milestone.name}
    </span>
    <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, color: colors.textMuted,
                   marginLeft: 'auto' }}>
      {milestone.phaseRange}
    </span>
  </div>
  <div style={{ marginTop: spacing.md, fontFamily: fonts.sans, fontSize: fontSizes.base,
                color: colors.textMuted }}>
    Ship date: {milestone.shipDate} · {milestone.phaseCount} phases
  </div>
</div>
```

---

### `src/components/gsd/progress-tab.tsx` (component, transform, table view)

**Analog:** `src/components/git-changes-tab.tsx` (container + empty state)

**Table pattern** (new — no direct analog; use tokens from git-changes-tab.tsx):
```typescript
// Summary header card (bgElevated, 16px padding)
<div style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}`,
              borderRadius: radii.lg, padding: spacing['4xl'], marginBottom: spacing['5xl'] }}>
  <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.xl, fontWeight: 600,
                 color: colors.textPrimary }}>
    {data.milestoneName} · {data.completedPhases}/{data.totalPhases} phases · {data.percent}%
  </span>
</div>

// Table: 5 columns, alternating row backgrounds
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
  <thead>
    <tr style={{ backgroundColor: colors.bgElevated }}>
      {['Phase', 'Milestone', 'Plans', 'Status', 'Completed'].map(col => (
        <th key={col} style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, fontWeight: 600,
                               color: colors.textSecondary, padding: `${spacing.md}px ${spacing.lg}px`,
                               textAlign: 'left' }}>
          {col}
        </th>
      ))}
    </tr>
  </thead>
  <tbody>
    {data.rows.map((row, i) => (
      <tr key={row.phase} style={{ backgroundColor: i % 2 === 0 ? colors.bgBase : colors.bgElevated,
                                   borderBottom: `1px solid ${colors.bgBorder}` }}>
        <td style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, color: colors.textPrimary,
                     padding: `${spacing.md}px ${spacing.lg}px` }}>
          {row.phase}
        </td>
        {/* ... other cells ... */}
      </tr>
    ))}
  </tbody>
</table>
```

---

### `src/components/gsd/history-tab.tsx` (component, transform, timeline list)

**Analog:** `src/components/git-changes-tab.tsx` (list of items with header + body pattern)

**Timeline block pattern** (adapted from git-changes-tab accordion item structure):
```typescript
// One block per shipped milestone
{data.milestones.map(entry => (
  <div key={entry.title} style={{ marginBottom: spacing['5xl'] }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md,
                  marginBottom: spacing.md }}>
      <span aria-label="Shipped">✅</span>
      <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.xl, fontWeight: 600,
                     color: colors.textPrimary }}>
        {entry.title}
      </span>
      <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, color: colors.textMuted,
                     marginLeft: 'auto' }}>
        {entry.shipDate}
      </span>
    </div>
    <div style={{ color: colors.textMuted, fontFamily: fonts.sans, fontSize: fontSizes.base,
                  marginBottom: spacing.md }}>
      {entry.phaseCount} phases · {entry.planCount} plans
    </div>
    <ul style={{ margin: 0, paddingLeft: spacing['4xl'] }}>
      {entry.accomplishments.map((item, i) => (
        <li key={i} style={{ fontFamily: fonts.sans, fontSize: fontSizes.lg,
                             color: colors.textSecondary, lineHeight: 1.5 }}>
          {item}
        </li>
      ))}
    </ul>
  </div>
))}
```

---

### `src/components/gsd/state-tab.tsx` (component, transform, stacked cards)

**Analog:** `src/components/gsd-viewer.tsx` (reads file, displays content) + `git-changes-tab.tsx` (card pattern)

**Status header card** (new composition from tokens):
```typescript
// Section 1: status header card (bgElevated, 16px padding, 20px gap below)
<div style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}`,
              borderRadius: radii.lg, padding: spacing['4xl'], marginBottom: spacing['5xl'] }}>
  <div style={{ fontFamily: fonts.sans, fontSize: fontSizes['2xl'], fontWeight: 600,
                color: colors.textPrimary, marginBottom: spacing.md }}>
    {data.milestoneName}
  </div>
  <div style={{ display: 'flex', gap: spacing.xl, fontFamily: fonts.sans,
                fontSize: fontSizes.base }}>
    <span style={{ color: colors.textSecondary }}>{data.status}</span>
    <span style={{ color: data.progress === 100 ? colors.statusGreen : colors.statusYellow }}>
      {data.progress}%
    </span>
    <span style={{ color: colors.textMuted }}>{data.lastActivity}</span>
  </div>
</div>
```

**Section card pattern** (repeated for Current Position, Decisions, Pending Todos, Blockers, Session Continuity):
```typescript
<div style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}`,
              borderRadius: radii.lg, padding: spacing['4xl'], marginBottom: spacing['5xl'] }}>
  <div style={{ fontFamily: fonts.sans, fontSize: fontSizes.xl, fontWeight: 600,
                color: colors.textPrimary, marginBottom: spacing.md }}>
    {sectionTitle}
  </div>
  <div style={{ fontFamily: fonts.sans, fontSize: fontSizes.lg, color: colors.textSecondary,
                lineHeight: 1.5 }}>
    {/* section content */}
  </div>
</div>
```

**Session Continuity resume-file link** (accent underline on hover, button semantics):
```typescript
<button
  onClick={() => handleResumeFile(data.sessionContinuity.resumeFile)}
  style={{ background: 'none', border: 'none', cursor: 'pointer',
           fontFamily: fonts.mono, fontSize: fontSizes.base,
           color: colors.accent, textDecoration: 'underline', padding: 0 }}
>
  {data.sessionContinuity.resumeFile}
</button>
```

---

### `src/services/gsd-parser.ts` (service, transform, new module)

**Analog:** `src/services/file-service.ts` (module structure, typed errors, export pattern)

**Module structure** (lines 1-25 of `file-service.ts`, adapted for pure transform — no IPC):
```typescript
// gsd-parser.ts -- Markdown AST parser for GSD planning files (Phase 19, D-13..D-17)
// Uses unified + remark-parse + remark-gfm + remark-frontmatter + unist-util-visit.
// All functions are synchronous (unified.parse() is sync — never await processor.process()).

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import type { Root, Heading, List, Table, YAML } from 'mdast';
```

**Typed result types** (mirrors `FileError` typed pattern from `file-service.ts` lines 13-21):
```typescript
// One interface per parse function output — typed, never `any`
export interface MilestonesData {
  milestones: MilestoneEntry[];
  parseError?: string; // present if section absent or malformed
}

export interface PhasesData {
  phases: PhaseEntry[];
  parseError?: string;
}

// ... ProgressData, HistoryData, StateData
```

**Parse cache via module-level signal** (mirrors module-level signals in `git-changes-tab.tsx` lines 26-29):
```typescript
import { signal } from '@preact/signals';

// Keyed by absolute file path — invalidated on md-file-changed event
const parseCache = signal<Record<string, MilestonesData | PhasesData | ProgressData | HistoryData | StateData>>({});

export function invalidateCacheEntry(absolutePath: string): void {
  const next = { ...parseCache.value };
  delete next[absolutePath];
  parseCache.value = next;
}
```

**Parse function signature pattern** (D-15, all 5 export the same shape):
```typescript
export function parseMilestones(md: string): MilestonesData {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(md) as Root;
    // ... extract ## Milestones section nodes
    return { milestones: [...] };
  } catch {
    return { milestones: [], parseError: 'Parse failed' };
  }
}
```

**Section extraction helper** (from RESEARCH.md Pattern 1):
```typescript
function extractSection(tree: Root, headingText: string, depth: number = 2) {
  const nodes: any[] = [];
  let inside = false;
  for (const node of tree.children) {
    if (node.type === 'heading' && (node as Heading).depth === depth) {
      const text = ((node as Heading).children[0] as any)?.value ?? '';
      if (text === headingText) { inside = true; continue; }
      if (inside) break;
    }
    if (inside) nodes.push(node);
  }
  return nodes;
}
```

**YAML frontmatter extraction** (from RESEARCH.md Pattern 2):
```typescript
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

**Error handling — fail-soft (D-16)**:
```typescript
// Never throw. Every parse function wraps its body in try/catch.
// On error, return typed empty with parseError set:
return { milestones: [], parseError: 'Milestones section not found in ROADMAP.md' };
```

---

### `src/state-manager.ts` (modified)

**Analog:** `src/state-manager.ts` lines 45-46 and 83-84 (existing signal + restore pattern)

**New signal** (after line 46, matching `rightTopTab` / `rightBottomTab` pattern):
```typescript
// Existing (lines 45-46):
export const rightTopTab = signal('File Tree');
export const rightBottomTab = signal('Bash');

// Add for Phase 19 (D-03):
export const gsdSubTab = signal('State'); // Default per D-02
```

**Signal restore in `loadAppState`** (after line 84, matching existing restore pattern):
```typescript
// Existing (lines 83-84):
if (currentState?.panels?.['right-top-tab'] && currentState.panels['right-top-tab'] !== 'gsd') rightTopTab.value = currentState.panels['right-top-tab'];
if (currentState?.panels?.['right-bottom-tab']) rightBottomTab.value = currentState.panels['right-bottom-tab'];

// Add for Phase 19:
if (currentState?.panels?.['gsd-sub-tab']) gsdSubTab.value = currentState.panels['gsd-sub-tab'];
```

**Default state in `loadAppState` fallback** (line 77-78, extend the panels default):
```typescript
// Existing:
panels: { 'right-top-tab': 'File Tree', 'right-bottom-tab': 'Bash' },

// Updated:
panels: { 'right-top-tab': 'File Tree', 'right-bottom-tab': 'Bash', 'gsd-sub-tab': 'State' },
```

---

### `src-tauri/src/state.rs` (modified — PanelsState)

**Analog:** `src-tauri/src/state.rs` lines 171-215 (existing `PanelsState` struct + default fns)

**Current struct** (lines 171-186 of `state.rs`):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelsState {
    #[serde(default = "default_right_top_tab", rename = "right-top-tab")]
    pub right_top_tab: String,

    #[serde(default = "default_right_bottom_tab", rename = "right-bottom-tab")]
    pub right_bottom_tab: String,
}

impl Default for PanelsState {
    fn default() -> Self {
        Self {
            right_top_tab: default_right_top_tab(),
            right_bottom_tab: default_right_bottom_tab(),
        }
    }
}
```

**Add new field** (same serde pattern as existing two fields):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelsState {
    #[serde(default = "default_right_top_tab", rename = "right-top-tab")]
    pub right_top_tab: String,

    #[serde(default = "default_right_bottom_tab", rename = "right-bottom-tab")]
    pub right_bottom_tab: String,

    // Phase 19 (D-03): persisted GSD sub-tab selection
    #[serde(default = "default_gsd_sub_tab", rename = "gsd-sub-tab")]
    pub gsd_sub_tab: String,
}

impl Default for PanelsState {
    fn default() -> Self {
        Self {
            right_top_tab: default_right_top_tab(),
            right_bottom_tab: default_right_bottom_tab(),
            gsd_sub_tab: default_gsd_sub_tab(),
        }
    }
}

// New default fn (same pattern as default_right_top_tab at line 207):
fn default_gsd_sub_tab() -> String { "State".into() }
```

**Existing test to extend** (lines 478-486 of `state.rs`, `panels_state_roundtrip`):
```rust
#[test]
fn panels_state_roundtrip() {
    let panels = PanelsState {
        right_top_tab: "GSD".into(),
        right_bottom_tab: "Files".into(),
        gsd_sub_tab: "Phases".into(), // add this field
    };
    let json = serde_json::to_string(&panels).unwrap();
    let restored: PanelsState = serde_json::from_str(&json).unwrap();
    assert_eq!(panels.right_top_tab, restored.right_top_tab);
    assert_eq!(panels.gsd_sub_tab, restored.gsd_sub_tab); // add this assertion
}
```

---

### `src/components/gsd-pane.test.tsx` (test, render)

**Analog:** `src/components/gsd-viewer.test.tsx` (full pattern to copy)

**Test module setup** (lines 1-30 of `gsd-viewer.test.tsx`):
```typescript
// gsd-pane.test.tsx — Render tests for GSDPane component (Phase 19)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { GSDPane } from './gsd-pane';
import { projects, activeProjectName } from '../state-manager';

const MOCK_PROJECT = {
  path: '/tmp/proj',
  name: 'testproj',
  agent: 'claude',
};

describe('GSDPane', () => {
  beforeEach(() => {
    projects.value = [MOCK_PROJECT];
    activeProjectName.value = 'testproj';

    // Mock Tauri modules (same approach as git-control-tab.test.tsx lines 6-8)
    vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
    vi.mock('@tauri-apps/api/event', () => ({
      listen: vi.fn(() => Promise.resolve(() => {})),
    }));
  });
  // ... test cases
});
```

**Missing-file empty state test pattern** (line 62-70 of `gsd-viewer.test.tsx`):
```typescript
it('shows missing-file empty state when invoke throws', async () => {
  vi.spyOn(console, 'warn').mockReturnValue();
  // mock invoke to throw for read_file_content
  // verify "not found" text from UI-SPEC copywriting appears
});
```

---

### `src/services/gsd-parser.test.ts` (test, unit)

**Analog:** `src/services/file-service.test.ts` (unit test structure, describe/it/expect)

**Test structure** (lines 1-18 of `file-service.test.ts`, adapted for pure function tests — no IPC):
```typescript
// gsd-parser.test.ts -- Unit tests for GSD markdown parser (Phase 19, D-15)
import { describe, it, expect } from 'vitest';
import { parseMilestones, parsePhases, parseProgress, parseHistory, parseState } from './gsd-parser';

// Fixture markdown strings inline (no IPC needed — pure functions)
const ROADMAP_FIXTURE = `
# Roadmap

## Milestones

- **v0.1.0** — Foundation
  - Phase range: 1-5
  - Ship date: 2025-01

## Phase Details

### Phase 1: Terminal Core
...

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 01 | v0.1.0 | 5 | Complete | 2025-01 |
`;

describe('parseMilestones', () => {
  it('returns milestone list from ## Milestones section', () => {
    const result = parseMilestones(ROADMAP_FIXTURE);
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].name).toContain('v0.1.0');
  });

  it('returns parseError when section absent', () => {
    const result = parseMilestones('# No milestones here');
    expect(result.milestones).toHaveLength(0);
    expect(result.parseError).toBeDefined();
  });
});
```

---

### `vitest.config.ts` (modified)

**Analog:** `vitest.config.ts` (existing file — add `server.deps.inline` per RESEARCH.md Pitfall 3)

**Addition to existing config** (after line 9 `globals: true`):
```typescript
// Current test block (lines 6-26 of vitest.config.ts):
test: {
  environment: 'jsdom',
  include: ['src/**/*.test.{ts,tsx}'],
  setupFiles: ['./vitest.setup.ts'],
  globals: true,
  // Add for Phase 19 (RESEARCH.md Pitfall 3 — unified/remark are pure ESM):
  server: {
    deps: {
      inline: [
        'unified',
        'remark-parse',
        'remark-gfm',
        'remark-frontmatter',
        'yaml',
        'unist-util-visit',
      ],
    },
  },
  // ... existing coverage block unchanged
}
```

---

### `src/components/right-panel.tsx` (modified — swap GSDViewer for GSDPane)

**Analog:** `src/components/right-panel.tsx` lines 110-112 (the swap point)

**Import swap** (line 13 of `right-panel.tsx`):
```typescript
// Remove:
import { GSDViewer } from './gsd-viewer';
// Add:
import { GSDPane } from './gsd-pane';
```

**Component swap** (line 111 of `right-panel.tsx`):
```typescript
// Remove:
<GSDViewer />
// Add:
<GSDPane />
```

No other changes to `right-panel.tsx`.

---

## Shared Patterns

### Token Import
**Source:** `src/tokens.ts`
**Apply to:** All new component files in `src/components/gsd/`
```typescript
import { colors, fonts, fontSizes, spacing, radii } from '../../tokens';
```

For `gsd-pane.tsx` (one level up from `gsd/`):
```typescript
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
```

### Event Listener Cleanup
**Source:** `src/components/gsd-viewer.tsx` lines 97-103 + 118-121
**Apply to:** `gsd-pane.tsx` (the only component that listens to Tauri events)
```typescript
// Capture unlisten promise
let unlistenFn: (() => void) | null = null;
listen('md-file-changed', handler).then(fn => { unlistenFn = fn; });

// Always clean up in useEffect return:
return () => {
  if (unlistenFn) unlistenFn();
  document.removeEventListener('project-changed', handleProjectChanged);
};
```

### File Read via file-service.readFile
**Source:** `src/services/file-service.ts` lines 94-100
**Apply to:** `gsd-pane.tsx` (loading all three planning files)
```typescript
import { readFile } from '../services/file-service';

async function loadPlanningFile(absolutePath: string): Promise<string | null> {
  try {
    return await readFile(absolutePath);
  } catch {
    return null; // triggers missing-file empty state (D-20)
  }
}
```

### Project Path Construction
**Source:** `src/components/gsd-viewer.tsx` lines 76-78
**Apply to:** `gsd-pane.tsx` (building planning file paths)
```typescript
// gsd-viewer.tsx pattern:
const gsdFile = project.gsd_file || 'PLAN.md';
const path = project.path + '/' + gsdFile;

// GSDPane adaptation:
const planningBase = project.path + '/.planning';
const roadmapPath = planningBase + '/ROADMAP.md';
const milestonesPath = planningBase + '/MILESTONES.md';
const statePath = planningBase + '/STATE.md';
```

### Empty State Layout
**Source:** `src/components/git-changes-tab.tsx` lines 252-272
**Apply to:** All 5 sub-tab components (when `data.parseError` is set or data is missing)
```typescript
<div style={{
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: '100%', gap: spacing['3xl'],
}}>
  <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.xl, fontWeight: 600,
                 color: colors.textMuted }}>
    {headingText}
  </span>
  <span style={{ fontFamily: fonts.sans, fontSize: fontSizes.lg, color: colors.textDim }}>
    {bodyText}
  </span>
  {/* "View raw" button only when file exists but section missing */}
  {showRawLink && (
    <button
      onClick={onViewRaw}
      style={{ fontFamily: fonts.sans, fontSize: fontSizes.base, color: colors.accent,
               background: 'none', border: 'none', cursor: 'pointer',
               textDecoration: 'underline' }}
    >
      View raw {filename}
    </button>
  )}
</div>
```

### Hover State via onMouseEnter/onMouseLeave
**Source:** `src/components/git-changes-tab.tsx` lines 306-311
**Apply to:** Phases tab accordion rows, Milestones tab card hover
```typescript
onMouseEnter={e => {
  (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.accentMuted;
}}
onMouseLeave={e => {
  (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.bgBase;
}}
```

### Console Warning Pattern
**Source:** `src/components/gsd-viewer.tsx` line 89
**Apply to:** All error paths in `gsd-pane.tsx` and `gsd-parser.ts`
```typescript
console.warn('[efxmux] Failed to load planning file:', err);
// Never log technical error details to UI (per project tone — see gsd-viewer.tsx)
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/gsd/progress-tab.tsx` (table portion) | component | transform | No existing GFM table renderer in codebase — table CSS must be hand-rolled from tokens following the token-only convention. The diff line rendering in `git-changes-tab.tsx` (HTML string approach) is explicitly NOT the pattern here: use JSX elements, not `dangerouslySetInnerHTML`. |

The `dangerouslySetInnerHTML` approach from `gsd-viewer.tsx` (marked.js rendered HTML) is retained ONLY for the fallback raw-render path triggered from the "View raw" empty-state link. All structured sub-tab content uses JSX elements, not innerHTML.

---

## Key Source File Findings

### `file_watcher.rs` — watcher already covers `.planning/`
- Line 68-72: `RecursiveMode::Recursive` on `project_path` — already watches the entire project directory tree including `.planning/`.
- Line 54-55: `handle.emit("md-file-changed", changed_path)` — payload is already the absolute path string.
- **No Rust changes needed to the watcher itself.** GSDPane sub-tabs filter the payload on the frontend side.

### `state.rs` — PanelsState has NO escape hatch
- Lines 171-186: `PanelsState` struct has exactly two `String` fields and no `#[serde(flatten)] extra` HashMap.
- Confirmed: `LayoutState` (line 75) and `SessionState` (line 121) have the flatten escape; `PanelsState` does not.
- Adding `gsd_sub_tab` to the Rust struct is mandatory. Using `LayoutState.extra` would work functionally but is semantically wrong.

### `state-manager.ts` — `AppState.panels` is `Record<string, string>`
- Line 35: `panels: Record<string, string>` — the TypeScript type is already permissive.
- The JS side can write `panels['gsd-sub-tab']` without any TypeScript change.
- The Rust struct change (above) is what makes the value survive serialization.

### `gsd-viewer.tsx` — to be replaced, not extended
- The file is self-contained (no exports used by other components except `GSDViewer` in `right-panel.tsx` line 13+111).
- Confirmed no other callers of `gsd-viewer.tsx` exports — safe to delete.
- `gsd-viewer.test.tsx` must be deleted and replaced with `gsd-pane.test.tsx`.

---

## Metadata

**Analog search scope:** `src/components/`, `src/services/`, `src/state-manager.ts`, `src-tauri/src/state.rs`, `src-tauri/src/file_watcher.rs`, `src/tokens.ts`, `vitest.config.ts`
**Files read:** 14
**Analogs confirmed in codebase:** 11 / 12 (progress tab table portion has no direct analog)
**Pattern extraction date:** 2026-04-17
