// gsd-parser.test.ts -- Unit tests for GSD markdown parser (Phase 19, D-15)
// These tests are FAILING scaffolds (Wave 0). Plan 02 implements the real parse
// functions and these tests then turn green. See 19-RESEARCH.md "Phase Requirements
// -> Test Map" for the GSD-01..GSD-05 traceability.
import { describe, it, expect } from 'vitest';
import {
  parseMilestones,
  parsePhases,
  parseProgress,
  parseHistory,
  parseState,
  invalidateCacheEntry,
} from './gsd-parser';

// Fixture strings: minimal excerpts shaped like real .planning/ROADMAP.md,
// .planning/STATE.md, .planning/MILESTONES.md content.
const ROADMAP_FIXTURE = `# Roadmap

## Milestones

- ✅ **v0.1.0 MVP** — Phases 1-10 + 6.1 (shipped 2026-04-11)
- 🚧 **v0.3.0 Workspace Evolution** — Phases 15-21 (in progress)

### v0.3.0 Workspace Evolution (In Progress)

- [ ] **Phase 19: GSD Sub-Tabs** -- 5 sub-tabs for Milestones, Phases, Progress, History, State

## Phase Details

### Phase 19: GSD Sub-Tabs
**Goal**: Users can view GSD planning context across 5 specialized sub-tabs
**Depends on**: Phase 15
**Requirements**: GSD-01, GSD-02, GSD-03, GSD-04, GSD-05
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold | v0.1.0 | 4/4 | Complete | 2026-04-06 |
| 19. GSD Sub-Tabs | v0.3.0 | 0/? | Not started | - |
`;

const STATE_FIXTURE = `---
gsd_state_version: 1.0
milestone: v0.3.0
milestone_name: Workspace Evolution
status: executing
stopped_at: Phase 19 UI-SPEC approved
progress:
  total_phases: 7
  completed_phases: 4
  percent: 100
---

# Project State

## Current Position

Phase: 19
Plan: Not started

## Accumulated Context

### Decisions

- v0.2.0: Test infrastructure first
- v0.1.0: tmux session backend for persistence

### Pending Todos

None.

### Blockers/Concerns

- Phase 17 code review fixes pending

## Session Continuity

Last session: 2026-04-17T12:40:32.215Z
Stopped at: Phase 19 UI-SPEC approved
Resume file: .planning/phases/19-gsd-sub-tabs/19-UI-SPEC.md
`;

const MILESTONES_FIXTURE = `# Milestones

## v0.1.0 MVP (shipped 2026-04-11)

- 11 phases, 63 plans
- Terminal integration complete

## v0.2.0 Testing & Consolidation (shipped 2026-04-12)

- 4 phases, 8 plans
- 119 tests
`;

describe('parseMilestones', () => {
  it('extracts milestones from ## Milestones section', () => {
    const result = parseMilestones(ROADMAP_FIXTURE);
    expect(result.milestones.length).toBeGreaterThanOrEqual(1);
    expect(result.parseError).toBeUndefined();
  });
  it('returns parseError when section absent', () => {
    const result = parseMilestones('# No milestones here');
    expect(result.milestones).toEqual([]);
    expect(result.parseError).toBeDefined();
  });
  it('does not throw on empty input', () => {
    expect(() => parseMilestones('')).not.toThrow();
  });
});

describe('parsePhases', () => {
  it('returns a phase with slug "19" and in-progress status', () => {
    const result = parsePhases(ROADMAP_FIXTURE);
    const phase19 = result.phases.find(p => p.slug === '19');
    expect(phase19).toBeDefined();
    expect(phase19?.status).toBe('in-progress');
  });
  it('returns parseError when ## Phase Details absent', () => {
    const result = parsePhases('# No phase details');
    expect(result.phases).toEqual([]);
    expect(result.parseError).toBeDefined();
  });
});

describe('parseProgress', () => {
  it('extracts rows from GFM table', () => {
    const result = parseProgress(ROADMAP_FIXTURE);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.parseError).toBeUndefined();
  });
  it('returns parseError when ## Progress table absent', () => {
    const result = parseProgress('# No progress table');
    expect(result.rows).toEqual([]);
    expect(result.parseError).toBeDefined();
  });
});

describe('parseHistory', () => {
  it('extracts milestone entries from MILESTONES.md content', () => {
    const result = parseHistory(MILESTONES_FIXTURE);
    expect(result.milestones.length).toBeGreaterThanOrEqual(1);
  });
  it('returns empty array without throwing on empty input', () => {
    const result = parseHistory('');
    expect(result.milestones).toEqual([]);
  });
});

describe('parseState', () => {
  it('parses YAML frontmatter fields', () => {
    const result = parseState(STATE_FIXTURE);
    expect(result.frontmatter.milestone).toBe('v0.3.0');
    expect(result.frontmatter.milestoneName).toBe('Workspace Evolution');
  });
  it('extracts Decisions bullet list', () => {
    const result = parseState(STATE_FIXTURE);
    expect(result.decisions.length).toBeGreaterThanOrEqual(1);
  });
  it('does not throw on malformed YAML', () => {
    const malformed = `---
invalid: : : yaml
---

# Content`;
    expect(() => parseState(malformed)).not.toThrow();
  });
});

describe('invalidateCacheEntry', () => {
  it('is exported and callable without throwing', () => {
    expect(() => invalidateCacheEntry('/tmp/fake.md')).not.toThrow();
  });
});
