// phases-tab.tsx -- Phases accordion list (Phase 19 Plan 03, D-08, D-21)
// Pattern: git-changes-tab.tsx module-level accordion signal + Chevron icons.
// Accessibility: <button aria-expanded aria-controls> + panel role=region.

import { signal } from '@preact/signals';
import { ChevronRight, ChevronDown } from 'lucide-preact';
import type { PhasesData } from '../../services/gsd-parser';
import { colors, fonts, fontSizes, spacing } from '../../tokens';
import { StatusBadge, EmptyState } from './status-badge';

export interface PhasesTabProps {
  data: PhasesData | null;
  onViewRaw: () => void;
  fileMissing?: boolean;
  currentPhaseSlug?: string;
}

// Module-level accordion state (per RESEARCH Pattern 4 + git-changes-tab.tsx convention).
// Ephemeral across sub-tab switches by design (per UI-SPEC State Machine spirit).
const expandedPhases = signal<Set<string>>(new Set());

function togglePhase(slug: string): void {
  const next = new Set(expandedPhases.value);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  expandedPhases.value = next;
}

export function PhasesTab({ data, onViewRaw, fileMissing, currentPhaseSlug }: PhasesTabProps) {
  // Missing-file branch (D-20)
  if (fileMissing) {
    return (
      <EmptyState
        heading="No .planning/ROADMAP.md found"
        body="Run /gsd-new-project in a terminal to initialize the planning directory."
      />
    );
  }

  // Missing section / parse error branch (D-16)
  if (!data || data.parseError || data.phases.length === 0) {
    return (
      <EmptyState
        heading="Phase details not found"
        body="Expected ## Phase Details in .planning/ROADMAP.md. View the raw file to inspect current shape."
        actionLabel="View raw ROADMAP.md"
        onAction={onViewRaw}
      />
    );
  }

  return (
    <div>
      {data.phases.map(phase => {
        const isExpanded = expandedPhases.value.has(phase.slug);
        const isCurrent = phase.slug === currentPhaseSlug;
        return (
          <div key={phase.slug}>
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-controls={`phase-${phase.slug}-panel`}
              onClick={() => togglePhase(phase.slug)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                padding: `${spacing.lg}px ${spacing['3xl']}px`,
                minHeight: 32,
                backgroundColor: colors.bgBase,
                borderBottom: `1px solid ${colors.bgBorder}`,
                borderLeft: isCurrent
                  ? `2px solid ${colors.accent}`
                  : '2px solid transparent',
                cursor: 'pointer',
                gap: spacing.md,
                border: 'none',
                textAlign: 'left',
                color: colors.textPrimary,
              }}
            >
              {isExpanded ? (
                <ChevronDown size={14} style={{ color: colors.accent, flexShrink: 0 }} />
              ) : (
                <ChevronRight size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
              )}
              <StatusBadge status={phase.status} />
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.base,
                  flex: 1,
                }}
              >
                Phase {phase.slug}: {phase.name}
              </span>
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.base,
                  color: colors.textMuted,
                }}
              >
                {phase.planCount} {phase.planCount === 1 ? 'plan' : 'plans'}
              </span>
            </button>
            {isExpanded && (
              <div
                id={`phase-${phase.slug}-panel`}
                role="region"
                aria-label={`Phase ${phase.slug} details`}
                style={{
                  backgroundColor: colors.bgElevated,
                  padding: spacing['4xl'],
                  borderBottom: `1px solid ${colors.bgBorder}`,
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.lg,
                  color: colors.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                {phase.goal && (
                  <div style={{ marginBottom: spacing.md }}>
                    <strong style={{ color: colors.textPrimary }}>Goal:</strong> {phase.goal}
                  </div>
                )}
                {phase.dependsOn && (
                  <div style={{ marginBottom: spacing.md, color: colors.textMuted }}>
                    <strong>Depends on:</strong> {phase.dependsOn}
                  </div>
                )}
                {phase.requirements && phase.requirements.length > 0 && (
                  <div style={{ marginBottom: spacing.md }}>
                    <strong style={{ color: colors.textPrimary }}>Requirements:</strong>{' '}
                    {phase.requirements.join(', ')}
                  </div>
                )}
                {phase.plans && phase.plans.length > 0 && (
                  <div style={{ marginBottom: spacing.md }}>
                    <strong style={{ color: colors.textPrimary }}>Plans:</strong>
                    <ul style={{ margin: 0, paddingLeft: spacing['4xl'] }}>
                      {phase.plans.map((p, i) => (
                        <li
                          key={i}
                          style={{
                            color: p.done ? colors.statusGreen : colors.textSecondary,
                          }}
                        >
                          {p.done ? '✓ ' : '○ '}
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {phase.successCriteria && phase.successCriteria.length > 0 && (
                  <div>
                    <strong style={{ color: colors.textPrimary }}>Success Criteria:</strong>
                    <ol style={{ margin: 0, paddingLeft: spacing['4xl'] }}>
                      {phase.successCriteria.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
