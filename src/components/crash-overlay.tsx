// crash-overlay.tsx -- PTY exit/crash inline overlay (UX-03, D-08, D-09, D-10)
// Renders inside the terminal tab container when a PTY session exits.
// Normal exit (code 0): green dot + "Session ended"
// Crash exit (non-zero): red dot + "Process crashed" + exit code
// Visual rewrite: Phase 10 navy-blue palette

import type { TerminalTab } from './terminal-tabs';
import { colors, fonts } from '../tokens';

interface CrashOverlayProps {
  tab: TerminalTab;
  onRestart: () => void;
}

export function CrashOverlay({ tab, onRestart }: CrashOverlayProps) {
  if (tab.exitCode === undefined || tab.exitCode === null) return null;

  const isNormalExit = tab.exitCode === 0;

  return (
    <div
      class="absolute flex items-center justify-center z-20"
      style={{
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}
      role="alertdialog"
      aria-labelledby="crash-msg"
    >
      <div
        class="text-center"
        style={{
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgBorder}`,
          borderRadius: 8,
          padding: '24px',
          maxWidth: 320,
        }}
      >
        {/* Status dot: green for normal exit, red for crash (D-08) */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: isNormalExit ? colors.statusGreen : colors.diffRed,
            margin: '0 auto 12px',
          }}
        />
        {/* Message: different copy for normal vs crash (D-08) */}
        <p
          id="crash-msg"
          style={{
            color: colors.textPrimary,
            fontSize: 13,
            fontFamily: fonts.sans,
            fontWeight: 500,
            marginBottom: 4,
          }}
        >
          {isNormalExit ? 'Session ended' : 'Process crashed'}
        </p>
        {!isNormalExit && (
          <p
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontFamily: fonts.mono,
              marginBottom: 16,
            }}
          >
            {tab.errorMessage ?? `Terminal session ended (exit code ${tab.exitCode})`}
          </p>
        )}
        {isNormalExit && <div style={{ height: 12 }} />}
        {/* Restart button (D-10) */}
        <button
          onClick={onRestart}
          class="cursor-pointer transition-opacity"
          style={{
            backgroundColor: colors.accent,
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: fonts.sans,
            fontWeight: 500,
            border: 'none',
          }}
          title="Restart terminal session"
        >
          Restart Session
        </button>
      </div>
    </div>
  );
}
