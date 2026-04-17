// gsd-parser.ts -- Markdown AST parser for GSD planning files (Phase 19, D-13..D-17)
// This file is a stub scaffold; Plan 02 replaces each parse function with the real
// unified/remark implementation. The exported interfaces match the final contract
// so that the test file in this plan (gsd-parser.test.ts) can be written against
// the real shape of the work.

import { signal } from '@preact/signals';

export interface MilestoneEntry {
  name: string;
  isInProgress: boolean;
  shipDate?: string;
  phaseRange?: string;
  phaseCount?: number;
}

export interface PhaseEntry {
  slug: string;
  name: string;
  status: 'complete' | 'in-progress' | 'not-started';
  goal?: string;
  dependsOn?: string;
  requirements?: string[];
  planCount: number;
  plans?: { name: string; done: boolean }[];
  successCriteria?: string[];
}

export interface ProgressRow {
  phase: string;
  milestone: string;
  plans: string;
  status: string;
  completed: string;
}

export interface ProgressSummary {
  milestoneName: string;
  completedPhases: number;
  totalPhases: number;
  percent: number;
}

export interface HistoryMilestone {
  title: string;
  shipDate: string;
  phaseCount?: number;
  planCount?: number;
  taskCount?: number;
  accomplishments: string[];
}

export interface StateFrontmatter {
  gsdStateVersion?: string;
  milestone?: string;
  milestoneName?: string;
  status?: string;
  stoppedAt?: string;
  lastActivity?: string;
  progress?: {
    totalPhases?: number;
    completedPhases?: number;
    totalPlans?: number;
    completedPlans?: number;
    percent?: number;
  };
}

export interface MilestonesData {
  milestones: MilestoneEntry[];
  parseError?: string;
}

export interface PhasesData {
  phases: PhaseEntry[];
  parseError?: string;
}

export interface ProgressData {
  summary: ProgressSummary;
  rows: ProgressRow[];
  parseError?: string;
}

export interface HistoryData {
  milestones: HistoryMilestone[];
  parseError?: string;
}

export interface StateData {
  frontmatter: StateFrontmatter;
  currentPosition?: string;
  decisions: string[];
  pendingTodos: string[];
  blockers: string[];
  sessionContinuity?: {
    lastSession?: string;
    stoppedAt?: string;
    resumeFile?: string;
  };
  parseError?: string;
}

// Module-level cache keyed by absolute file path (D-17).
// Plan 02 wires reads here; invalidated by invalidateCacheEntry on md-file-changed.
const parseCache = signal<Record<string, unknown>>({});

export function invalidateCacheEntry(absolutePath: string): void {
  const next = { ...parseCache.value };
  delete next[absolutePath];
  parseCache.value = next;
}

// Stubs -- Plan 02 replaces each body with unified/remark implementation.
// Each returns a typed empty with parseError='Not yet implemented' so the
// Wave 0 failing tests have deterministic, typed expectations to assert against.

export function parseMilestones(_md: string): MilestonesData {
  return { milestones: [], parseError: 'Not yet implemented' };
}

export function parsePhases(_md: string): PhasesData {
  return { phases: [], parseError: 'Not yet implemented' };
}

export function parseProgress(_md: string): ProgressData {
  return {
    summary: { milestoneName: '', completedPhases: 0, totalPhases: 0, percent: 0 },
    rows: [],
    parseError: 'Not yet implemented',
  };
}

export function parseHistory(_md: string): HistoryData {
  return { milestones: [], parseError: 'Not yet implemented' };
}

export function parseState(_md: string): StateData {
  return {
    frontmatter: {},
    decisions: [],
    pendingTodos: [],
    blockers: [],
    parseError: 'Not yet implemented',
  };
}
