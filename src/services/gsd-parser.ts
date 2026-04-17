// gsd-parser.ts -- Markdown AST parser for GSD planning files (Phase 19, D-13..D-17)
// Uses unified + remark-parse + remark-gfm + remark-frontmatter + unist-util-visit.
// All functions are synchronous -- never await processor.process(). (RESEARCH.md Anti-Patterns)
import { signal } from '@preact/signals';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { parse as parseYaml } from 'yaml';
import type { Root, Heading, List, Table, TableRow, Content } from 'mdast';

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
// Plan 03 wires reads here; invalidated by invalidateCacheEntry on md-file-changed.
const parseCache = signal<Record<string, unknown>>({});

export function invalidateCacheEntry(absolutePath: string): void {
  const next = { ...parseCache.value };
  delete next[absolutePath];
  parseCache.value = next;
}

// ---------------------------------------------------------------------------
// Shared AST helpers
// ---------------------------------------------------------------------------

function inlineText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { value?: unknown; children?: unknown[] };
  if (typeof n.value === 'string') return n.value;
  if (Array.isArray(n.children)) return n.children.map(inlineText).join('');
  return '';
}

function extractSection(tree: Root, headingText: string, depth: number): Content[] {
  const nodes: Content[] = [];
  let inside = false;
  for (const node of tree.children) {
    if (node.type === 'heading' && (node as Heading).depth === depth) {
      const text = inlineText(node).trim();
      if (text === headingText) {
        inside = true;
        continue;
      }
      if (inside) break;
    }
    if (inside) nodes.push(node as Content);
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// parseMilestones -- GSD-01 (ROADMAP.md ## Milestones)
// ---------------------------------------------------------------------------

export function parseMilestones(md: string): MilestonesData {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(md) as Root;
    const sectionNodes = extractSection(tree, 'Milestones', 2);
    if (sectionNodes.length === 0) {
      return { milestones: [], parseError: 'Milestones section not found in ROADMAP.md' };
    }
    const milestones: MilestoneEntry[] = [];
    for (const node of sectionNodes) {
      if (node.type !== 'list') continue;
      for (const item of (node as List).children) {
        const text = inlineText(item).trim();
        if (!text) continue;
        const isInProgress = text.startsWith('🚧');
        // Strip the leading emoji + spaces
        const body = text.replace(/^(✅|🚧)\s*/, '');
        // Parse "v0.1.0 MVP -- Phases 1-10 + 6.1 (shipped 2026-04-11)" or with em-dash/en-dash
        const nameMatch = body.match(/^([^-—–]+?)(?:\s+[-—–]+\s+(.+))?$/);
        const name = nameMatch ? nameMatch[1].trim() : body.trim();
        const trailing = nameMatch && nameMatch[2] ? nameMatch[2] : '';
        const phaseRangeMatch = trailing.match(/Phases?\s+([\d.\-+\s]+?)(?:\s*\(|\s*$)/i);
        const shipDateMatch = trailing.match(/shipped\s+([\d-]+)/i);
        const phaseRange = phaseRangeMatch ? phaseRangeMatch[1].trim() : undefined;
        const shipDate = shipDateMatch ? shipDateMatch[1].trim() : undefined;
        milestones.push({ name, isInProgress, shipDate, phaseRange });
      }
    }
    return { milestones };
  } catch (err) {
    console.warn('[efxmux] parseMilestones failed:', err);
    return { milestones: [], parseError: 'Parse failed' };
  }
}

// ---------------------------------------------------------------------------
// parsePhases -- GSD-02 (ROADMAP.md ## Phase Details)
// ---------------------------------------------------------------------------

export function parsePhases(md: string): PhasesData {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(md) as Root;
    const sectionNodes = extractSection(tree, 'Phase Details', 2);
    if (sectionNodes.length === 0) {
      return { phases: [], parseError: 'Phase details not found in ROADMAP.md' };
    }
    const phases: PhaseEntry[] = [];
    // Iterate H3 "Phase NN: Name" -- these are OUTSIDE <details> blocks
    // (in-progress phases only per Pitfall 4). HTML nodes (<details>) are
    // skipped automatically because we scan for heading type nodes only.
    for (let i = 0; i < sectionNodes.length; i++) {
      const node = sectionNodes[i];
      if (node.type !== 'heading' || (node as Heading).depth !== 3) continue;
      const headingText = inlineText(node).trim();
      const m = headingText.match(/^Phase\s+([\d.]+):\s*(.+)$/);
      if (!m) continue;
      const slug = m[1];
      const name = m[2].trim();
      // Collect body nodes until next H3 or H2
      const body: Content[] = [];
      for (let j = i + 1; j < sectionNodes.length; j++) {
        const n = sectionNodes[j];
        if (n.type === 'heading' && ((n as Heading).depth === 3 || (n as Heading).depth === 2)) break;
        body.push(n);
      }
      // Extract strong-prefixed paragraphs: **Goal**:, **Depends on**:, **Requirements**:, **Plans**:, **Success Criteria**:
      let goal: string | undefined;
      let dependsOn: string | undefined;
      let requirements: string[] = [];
      const successCriteria: string[] = [];
      const plans: { name: string; done: boolean }[] = [];
      for (const b of body) {
        if (b.type === 'paragraph') {
          const text = inlineText(b).trim();
          if (/^Goal\s*:/i.test(text)) {
            goal = text.replace(/^Goal\s*:\s*/i, '').trim();
          } else if (/^Depends on\s*:/i.test(text)) {
            dependsOn = text.replace(/^Depends on\s*:\s*/i, '').trim();
          } else if (/^Requirements\s*:/i.test(text)) {
            const reqText = text.replace(/^Requirements\s*:\s*/i, '').trim();
            requirements = reqText.split(',').map(r => r.trim()).filter(Boolean);
          }
        } else if (b.type === 'list') {
          for (const item of (b as List).children) {
            const itemText = inlineText(item).trim();
            if (!itemText) continue;
            // Task list items (plans): "- [x] 17-01-PLAN.md -- …"
            // remark-gfm sets item.checked to boolean|null
            const checked = (item as { checked?: boolean | null }).checked;
            if (typeof checked === 'boolean') {
              plans.push({ name: itemText, done: checked });
            } else {
              successCriteria.push(itemText);
            }
          }
        }
      }
      // Determine status
      const total = plans.length;
      const done = plans.filter(p => p.done).length;
      let status: PhaseEntry['status'];
      if (total > 0 && done === total) status = 'complete';
      else if (done > 0 || (goal && goal.length > 0)) status = 'in-progress';
      else status = 'not-started';
      // If body mentions "completed YYYY-MM-DD", force complete
      const bodyBlob = body.map(inlineText).join(' ');
      if (/completed\s+\d{4}-\d{2}-\d{2}/.test(bodyBlob)) status = 'complete';
      phases.push({
        slug,
        name,
        status,
        goal,
        dependsOn,
        requirements,
        planCount: total,
        plans,
        successCriteria,
      });
    }
    if (phases.length === 0) {
      return { phases: [], parseError: 'No phases found in Phase Details section' };
    }
    return { phases };
  } catch (err) {
    console.warn('[efxmux] parsePhases failed:', err);
    return { phases: [], parseError: 'Parse failed' };
  }
}

// ---------------------------------------------------------------------------
// parseProgress -- GSD-03 (ROADMAP.md ## Progress GFM table)
// ---------------------------------------------------------------------------

export function parseProgress(md: string): ProgressData {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(md) as Root;
    const sectionNodes = extractSection(tree, 'Progress', 2);
    if (sectionNodes.length === 0) {
      return {
        summary: { milestoneName: '', completedPhases: 0, totalPhases: 0, percent: 0 },
        rows: [],
        parseError: 'Progress table not found in ROADMAP.md',
      };
    }
    const tableNode = sectionNodes.find(n => n.type === 'table') as Table | undefined;
    if (!tableNode) {
      return {
        summary: { milestoneName: '', completedPhases: 0, totalPhases: 0, percent: 0 },
        rows: [],
        parseError: 'GFM table not found in Progress section',
      };
    }
    // First row is the header; skip.
    const rows: ProgressRow[] = [];
    for (let i = 1; i < tableNode.children.length; i++) {
      const row = tableNode.children[i] as TableRow;
      const cells = row.children.map(inlineText).map((s: string) => s.trim());
      if (cells.length < 5) continue;
      rows.push({
        phase: cells[0],
        milestone: cells[1],
        plans: cells[2],
        status: cells[3],
        completed: cells[4],
      });
    }
    const totalPhases = rows.length;
    const completedPhases = rows.filter(r => /complete/i.test(r.status)).length;
    const percent = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;
    // Milestone name: prefer the most recent non-complete row's milestone; fallback to last row
    const inProgressRow = rows.find(r => !/complete/i.test(r.status));
    const milestoneName = inProgressRow?.milestone ?? (rows[rows.length - 1]?.milestone ?? '');
    return { summary: { milestoneName, completedPhases, totalPhases, percent }, rows };
  } catch (err) {
    console.warn('[efxmux] parseProgress failed:', err);
    return {
      summary: { milestoneName: '', completedPhases: 0, totalPhases: 0, percent: 0 },
      rows: [],
      parseError: 'Parse failed',
    };
  }
}

// ---------------------------------------------------------------------------
// parseHistory + parseState -- stubs, implemented in Task 2
// ---------------------------------------------------------------------------

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
