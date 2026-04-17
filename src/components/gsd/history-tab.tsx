// history-tab.tsx -- Shipped-milestone timeline list (Phase 19 Plan 03, D-12)
// Pure presentational -- consumes HistoryData from gsd-parser.ts.

import type { HistoryData } from '../../services/gsd-parser';
import { colors, fonts, fontSizes, spacing } from '../../tokens';
import { EmptyState } from './status-badge';

export interface HistoryTabProps {
  data: HistoryData | null;
  onViewRaw: () => void;
  fileMissing?: boolean;
}

export function HistoryTab({ data, onViewRaw, fileMissing }: HistoryTabProps) {
  // Missing-file branch (D-20): whole file absent -- no "View raw" link
  if (fileMissing) {
    return (
      <EmptyState
        heading="No .planning/MILESTONES.md found"
        body="History populates automatically when /gsd-complete-milestone ships a milestone."
      />
    );
  }

  // Missing / empty / parse error branch (D-16)
  if (!data || data.parseError || data.milestones.length === 0) {
    return (
      <EmptyState
        heading="No shipped milestones yet"
        body=".planning/MILESTONES.md is empty or missing. History populates when /gsd-complete-milestone runs."
        actionLabel="View raw MILESTONES.md"
        onAction={onViewRaw}
      />
    );
  }

  return (
    <div>
      {data.milestones.map((entry, idx) => {
        const counts: string[] = [];
        if (typeof entry.phaseCount === 'number') counts.push(`${entry.phaseCount} phases`);
        if (typeof entry.planCount === 'number') counts.push(`${entry.planCount} plans`);
        if (typeof entry.taskCount === 'number') counts.push(`${entry.taskCount} tasks`);
        return (
          <div key={`${entry.title}-${idx}`} style={{ marginBottom: spacing['5xl'] }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <span aria-label="Shipped" title="Shipped">
                ✅
              </span>
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.xl,
                  fontWeight: 600,
                  color: colors.textPrimary,
                }}
              >
                {entry.title}
              </span>
              {entry.shipDate && (
                <span
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: colors.textMuted,
                    marginLeft: 'auto',
                  }}
                >
                  {entry.shipDate}
                </span>
              )}
            </div>
            {counts.length > 0 && (
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.base,
                  color: colors.textMuted,
                  marginBottom: spacing.md,
                }}
              >
                {counts.join(' · ')}
              </div>
            )}
            {entry.accomplishments.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: spacing['4xl'] }}>
                {entry.accomplishments.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: fontSizes.lg,
                      color: colors.textSecondary,
                      lineHeight: 1.5,
                    }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
