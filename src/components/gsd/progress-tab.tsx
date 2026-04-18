// progress-tab.tsx -- Progress GFM-style table + milestone summary header (Phase 19 Plan 03, D-09)
// Pure presentational -- consumes ProgressData from gsd-parser.ts.

import type { ProgressData } from '../../services/gsd-parser';
import { colors, fonts, fontSizes, spacing, radii } from '../../tokens';
import { EmptyState } from './status-badge';

export interface ProgressTabProps {
  data: ProgressData | null;
  onViewRaw: () => void;
  fileMissing?: boolean;
}

export function ProgressTab({ data, onViewRaw, fileMissing }: ProgressTabProps) {
  // Missing-file branch (D-20)
  if (fileMissing) {
    return (
      <EmptyState
        heading="No .planning/ROADMAP.md found"
        body="Run /gsd-new-project in a terminal to initialize the planning directory."
      />
    );
  }

  // Missing section / parse error / empty branch (D-16)
  if (!data || data.parseError || data.rows.length === 0) {
    return (
      <EmptyState
        heading="Progress table not found"
        body="Expected ## Progress in .planning/ROADMAP.md."
        actionLabel="View raw ROADMAP.md"
        onAction={onViewRaw}
      />
    );
  }

  const headers = ['Phase', 'Milestone', 'Plans', 'Status', 'Completed'];

  return (
    <div>
      {/* Summary header card */}
      <div
        style={{
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgBorder}`,
          borderRadius: radii.lg,
          padding: spacing['4xl'],
          marginBottom: spacing['5xl'],
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSizes.xl,
            fontWeight: 600,
            color: colors.textPrimary,
          }}
        >
          {data.summary.milestoneName} · {data.summary.completedPhases}/
          {data.summary.totalPhases} phases · {data.summary.percent}%
        </div>
      </div>

      {/* 5-column GFM-style table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: colors.bgElevated }}>
            {headers.map(col => (
              <th
                key={col}
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSizes.base,
                  fontWeight: 600,
                  color: colors.textSecondary,
                  padding: `${spacing.md}px ${spacing.lg}px`,
                  textAlign: 'left',
                  borderBottom: `1px solid ${colors.bgBorder}`,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => {
            const statusColor = /complete/i.test(row.status)
              ? colors.statusGreen
              : /progress/i.test(row.status)
                ? colors.statusYellow
                : colors.textMuted;
            const rowBg = i % 2 === 0 ? colors.bgBase : colors.bgElevated;
            return (
              <tr
                key={`${row.phase}-${i}`}
                style={{
                  backgroundColor: rowBg,
                  borderBottom: `1px solid ${colors.bgBorder}`,
                }}
              >
                <td
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: colors.textPrimary,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                  }}
                >
                  {row.phase}
                </td>
                <td
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: colors.textSecondary,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                  }}
                >
                  {row.milestone}
                </td>
                <td
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: colors.textSecondary,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                  }}
                >
                  {row.plans}
                </td>
                <td
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: statusColor,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                  }}
                >
                  {row.status}
                </td>
                <td
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSizes.base,
                    color: colors.textMuted,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                  }}
                >
                  {row.completed}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
