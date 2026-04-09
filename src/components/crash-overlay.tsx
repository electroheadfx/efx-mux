// crash-overlay.tsx -- PTY exit/crash inline overlay (UX-03, D-08, D-09, D-10)
// Renders inside the terminal tab container when a PTY session exits.
// Normal exit (code 0): green dot + "Session ended"
// Crash exit (non-zero): red dot + "Process crashed" + exit code

import type { TerminalTab } from './terminal-tabs';

interface CrashOverlayProps {
  tab: TerminalTab;
  onRestart: () => void;
}

export function CrashOverlay({ tab, onRestart }: CrashOverlayProps) {
  if (tab.exitCode === undefined || tab.exitCode === null) return null;

  const isNormalExit = tab.exitCode === 0;

  return (
    <div class="absolute inset-0 bg-black/50 flex items-center justify-center z-20" role="alertdialog" aria-labelledby="crash-msg">
      <div class="bg-bg-raised border border-border rounded-lg p-6 text-center max-w-[320px]">
        {/* Status dot: green for normal exit, red for crash (D-08) */}
        <div class={`w-2.5 h-2.5 rounded-full mx-auto mb-3 ${isNormalExit ? 'bg-[#859900]' : 'bg-[#dc322f]'}`} />
        {/* Message: different copy for normal vs crash (D-08) */}
        <p id="crash-msg" class="text-text-bright text-sm mb-1">
          {isNormalExit ? 'Session ended' : 'Process crashed'}
        </p>
        {!isNormalExit && (
          <p class="text-text text-xs mb-4">Exit code {tab.exitCode}</p>
        )}
        {isNormalExit && <div class="mb-3" />}
        {/* Restart button (D-10) */}
        <button
          onClick={onRestart}
          class="bg-accent text-white px-4 py-2 rounded-sm text-sm cursor-pointer hover:opacity-90 transition-opacity"
          title="Restart terminal session"
        >
          Restart Session
        </button>
      </div>
    </div>
  );
}
