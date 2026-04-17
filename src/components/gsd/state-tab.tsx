// state-tab.tsx -- STATE.md stacked section cards (Phase 19 Plan 03, D-10)
// Section order (D-10, exact): status header → Current Position → Decisions →
// Pending Todos → Blockers/Concerns → Session Continuity.
// Per D-10 the last STATE.md section is deliberately NOT rendered here.

import type { ComponentChildren } from 'preact';
import type { StateData } from '../../services/gsd-parser';
import { colors, fonts, fontSizes, spacing, radii } from '../../tokens';
import { EmptyState } from './status-badge';

export interface StateTabProps {
  data: StateData | null;
  onViewRaw: () => void;
  fileMissing?: boolean;
  onOpenResumeFile?: (path: string) => void;
}

function SectionCard({ title, children }: { title: string; children: ComponentChildren }) {
  return (
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
          marginBottom: spacing.md,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: fontSizes.lg,
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span style={{ color: colors.textMuted }}>None.</span>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: spacing['4xl'] }}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function StateTab({ data, onViewRaw, fileMissing, onOpenResumeFile }: StateTabProps) {
  // Missing-file branch (D-20) -- no "View raw" link
  if (fileMissing) {
    return (
      <EmptyState
        heading="No .planning/STATE.md found"
        body="Run /gsd-new-project in a terminal to initialize the planning directory."
      />
    );
  }

  // Missing / parse error branch (D-16)
  if (data === null || data.parseError) {
    return (
      <EmptyState
        heading="State file not found"
        body="Expected .planning/STATE.md. Run /gsd-new-project in a terminal to initialize."
        actionLabel="View raw STATE.md"
        onAction={onViewRaw}
      />
    );
  }

  const fm = data.frontmatter;
  const milestoneTitle = fm.milestoneName ?? fm.milestone ?? 'Unknown milestone';
  const percent = fm.progress?.percent;
  const percentColor =
    typeof percent === 'number' && percent === 100 ? colors.statusGreen : colors.statusYellow;

  return (
    <div>
      {/* Section 1: Status header card -- milestone name at 20px/600 (D-10) */}
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
            fontSize: fontSizes['2xl'],
            fontWeight: 600,
            color: colors.textPrimary,
            marginBottom: spacing.md,
          }}
        >
          {milestoneTitle}
        </div>
        <div
          style={{
            display: 'flex',
            gap: spacing.xl,
            fontFamily: fonts.sans,
            fontSize: fontSizes.base,
            flexWrap: 'wrap',
          }}
        >
          {fm.status && <span style={{ color: colors.textSecondary }}>{fm.status}</span>}
          {typeof percent === 'number' && (
            <span style={{ color: percentColor }}>{percent}%</span>
          )}
          {fm.lastActivity && (
            <span style={{ color: colors.textMuted }}>{fm.lastActivity}</span>
          )}
        </div>
      </div>

      {/* Section 2: Current Position */}
      {data.currentPosition && (
        <SectionCard title="Current Position">
          <pre
            style={{
              margin: 0,
              fontFamily: fonts.mono,
              fontSize: fontSizes.base,
              color: colors.textSecondary,
              whiteSpace: 'pre-wrap',
            }}
          >
            {data.currentPosition}
          </pre>
        </SectionCard>
      )}

      {/* Section 3: Decisions */}
      <SectionCard title="Decisions">
        <BulletList items={data.decisions} />
      </SectionCard>

      {/* Section 4: Pending Todos */}
      <SectionCard title="Pending Todos">
        <BulletList items={data.pendingTodos} />
      </SectionCard>

      {/* Section 5: Blockers / Concerns */}
      <SectionCard title="Blockers / Concerns">
        <BulletList items={data.blockers} />
      </SectionCard>

      {/* Section 6: Session Continuity -- with resume-file accent link */}
      {data.sessionContinuity && (
        <SectionCard title="Session Continuity">
          {data.sessionContinuity.lastSession && (
            <div style={{ marginBottom: spacing.md }}>
              Last session:{' '}
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fontSizes.base,
                  color: colors.textSecondary,
                }}
              >
                {data.sessionContinuity.lastSession}
              </span>
            </div>
          )}
          {data.sessionContinuity.stoppedAt && (
            <div style={{ marginBottom: spacing.md }}>
              Stopped at: {data.sessionContinuity.stoppedAt}
            </div>
          )}
          {data.sessionContinuity.resumeFile && (
            <div>
              Resume file:{' '}
              <button
                type="button"
                onClick={() =>
                  onOpenResumeFile?.(data.sessionContinuity!.resumeFile!)
                }
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: fonts.mono,
                  fontSize: fontSizes.base,
                  color: colors.accent,
                  textDecoration: 'underline',
                }}
              >
                {data.sessionContinuity.resumeFile}
              </button>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
