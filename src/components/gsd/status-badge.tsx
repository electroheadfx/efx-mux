// status-badge.tsx -- Shared presentational helpers for GSD sub-tabs (Phase 19 Plan 03)
// Exports:
//   - StatusBadge: ✓ / ◆ / ○ glyph with aria-label + status color
//   - EmptyState: shared empty/missing-file layout (UI-SPEC copywriting contract)

import { colors, fonts, fontSizes, spacing } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  status: 'complete' | 'in-progress' | 'not-started';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const glyph = status === 'complete' ? '✓' : status === 'in-progress' ? '◆' : '○';
  const color =
    status === 'complete'
      ? colors.statusGreen
      : status === 'in-progress'
        ? colors.statusYellow
        : colors.textMuted;
  const label =
    status === 'complete' ? 'Complete' : status === 'in-progress' ? 'In progress' : 'Not started';
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

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState -- shared across all 5 sub-tabs (UI-SPEC Copywriting Contract)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  heading: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ heading, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: spacing['3xl'],
        padding: spacing['4xl'],
      }}
    >
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: fontSizes.xl,
          fontWeight: 600,
          color: colors.textMuted,
        }}
      >
        {heading}
      </span>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: fontSizes.lg,
          color: colors.textDim,
          textAlign: 'center',
        }}
      >
        {body}
      </span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: fonts.sans,
            fontSize: fontSizes.base,
            color: colors.accent,
            textDecoration: 'underline',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
