// milestones-tab.tsx -- Milestones card grid (Phase 19 Plan 03, D-11)
// Pure presentational -- consumes MilestonesData from gsd-parser.ts.

import type { MilestonesData } from '../../services/gsd-parser';
import { colors, fonts, fontSizes, spacing, radii } from '../../tokens';
import { EmptyState } from './status-badge';

export interface MilestonesTabProps {
  data: MilestonesData | null;
  onViewRaw: () => void;
  fileMissing?: boolean;
}

export function MilestonesTab({ data, onViewRaw, fileMissing }: MilestonesTabProps) {
  // Missing-file branch (D-20) -- no "View raw" link, file doesn't exist
  if (fileMissing) {
    return (
      <EmptyState
        heading="No .planning/ROADMAP.md found"
        body="Run /gsd-new-project in a terminal to initialize the planning directory."
      />
    );
  }

  // Missing section / parse error branch (D-16)
  if (!data || data.parseError || data.milestones.length === 0) {
    return (
      <EmptyState
        heading="Milestones section not found"
        body="Expected ## Milestones in .planning/ROADMAP.md. View the raw file or run /gsd-new-project in a terminal to initialize."
        actionLabel="View raw ROADMAP.md"
        onAction={onViewRaw}
      />
    );
  }

  return (
    <div>
      {data.milestones.map((milestone, idx) => {
        const emoji = milestone.isInProgress ? '🚧' : '✅';
        const emojiLabel = milestone.isInProgress ? 'In progress' : 'Shipped';
        const shipLabel = milestone.shipDate ? `Ship date: ${milestone.shipDate}` : null;
        const phaseLabel =
          typeof milestone.phaseCount === 'number'
            ? `${milestone.phaseCount} phases`
            : milestone.phaseRange
              ? `Phases ${milestone.phaseRange}`
              : null;
        return (
          <div
            key={`${milestone.name}-${idx}`}
            style={{
              backgroundColor: colors.bgElevated,
              border: `1px solid ${colors.bgBorder}`,
              borderLeft: milestone.isInProgress
                ? `2px solid ${colors.accent}`
                : `1px solid ${colors.bgBorder}`,
              borderRadius: radii.lg,
              padding: spacing['4xl'],
              marginBottom: spacing['5xl'],
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
              <span aria-label={emojiLabel} title={emojiLabel}>
                {emoji}
              </span>
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.xl,
                  fontWeight: 600,
                  color: colors.textPrimary,
                }}
              >
                {milestone.name}
              </span>
              {milestone.phaseRange && (
                <span
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: colors.textMuted,
                    marginLeft: 'auto',
                  }}
                >
                  Phases {milestone.phaseRange}
                </span>
              )}
            </div>
            {(shipLabel || phaseLabel) && (
              <div
                style={{
                  marginTop: spacing.md,
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.base,
                  color: colors.textMuted,
                }}
              >
                {[shipLabel, phaseLabel].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
