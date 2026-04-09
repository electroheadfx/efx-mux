// server-pane.tsx -- Server pane Preact component with toolbar, log viewer, and 3-state collapse
// Phase 7: Collapsible server pane with Start/Stop/Restart/Open controls and ANSI log streaming
// D-01: 3-state cycle: strip (28px) -> expanded -> collapsed -> strip
// D-04: HTML toolbar + scrollable log area (not xterm.js)
// D-14: Crash detection shows "Process exited (code N)"
// T-07-06: ansiToHtml HTML-escapes before ANSI processing (XSS-safe)
// T-07-07: MAX_LOG_LINES = 5000 prevents unbounded memory growth

import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  startServer, stopServer, restartServer, openInBrowser,
  listenServerOutput, listenServerStopped,
} from '../server/server-bridge';
import { ansiToHtml, extractServerUrl } from '../server/ansi-html';
import { projects, activeProjectName, updateLayout } from '../state-manager';
import { initDragManager } from '../drag-manager';

// ---------------------------------------------------------------------------
// Module-level signals (exported for main.tsx Ctrl+` handler and state restore)
// ---------------------------------------------------------------------------

export const serverPaneState = signal<'strip' | 'expanded' | 'collapsed'>('strip');
export const serverStatus = signal<'stopped' | 'running' | 'crashed' | 'unconfigured'>('stopped');
const detectedUrl = signal<string | null>(null);
const serverLogs = signal<string[]>([]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LOG_LINES = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveProjectEntry() {
  const name = activeProjectName.value;
  if (!name) return null;
  return projects.value.find(p => p.name === name) ?? null;
}

// ---------------------------------------------------------------------------
// ServerPane component
// ---------------------------------------------------------------------------

export function ServerPane() {
  const logRef = useRef<HTMLDivElement>(null);
  const project = getActiveProjectEntry();

  // Determine unconfigured state
  const isUnconfigured = !project?.server_cmd;
  if (isUnconfigured && serverStatus.value !== 'unconfigured' && serverStatus.value !== 'running') {
    serverStatus.value = 'unconfigured';
  } else if (!isUnconfigured && serverStatus.value === 'unconfigured') {
    serverStatus.value = 'stopped';
  }

  const status = serverStatus.value;
  const paneState = serverPaneState.value;

  // Button enable states per UI-SPEC
  const startEnabled = status === 'stopped' || status === 'crashed';
  const stopEnabled = status === 'running';
  const restartEnabled = status === 'running';
  const openEnabled = status === 'running' && !!detectedUrl.value;

  // Status dot color
  const dotColor =
    status === 'running' ? '#859900' :
    status === 'crashed' ? '#dc322f' :
    'currentColor';
  const dotOpacity = (status === 'stopped' || status === 'unconfigured') ? '0.4' : '1';

  // Auto-scroll on new logs
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // Auto-scroll if user is near the bottom
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [serverLogs.value]);

  // Server output + stopped listeners
  useEffect(() => {
    let unlisten1: (() => void) | null = null;
    let unlisten2: (() => void) | null = null;

    listenServerOutput((text) => {
      // D-09: Auto-detect URL from stdout
      if (!detectedUrl.value) {
        const url = extractServerUrl(text);
        if (url) {
          detectedUrl.value = url;
          serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Detected URL: ${url}\n`)];
        }
      }
      const html = ansiToHtml(text);
      serverLogs.value = [...serverLogs.value, html].slice(-MAX_LOG_LINES);
    }).then(fn => { unlisten1 = fn; });

    listenServerStopped((exitCode: number) => {
      // D-14: exitCode >= 0 = natural exit/crash. -1 = intentional stop (ignore).
      if (exitCode >= 0 && serverStatus.value === 'running') {
        serverStatus.value = 'crashed';
        serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Process exited (code ${exitCode})\n`)];
      }
    }).then(fn => { unlisten2 = fn; });

    return () => {
      unlisten1?.();
      unlisten2?.();
    };
  }, []);

  // Button handlers
  const handleStart = async () => {
    const proj = getActiveProjectEntry();
    if (!proj?.server_cmd) return;
    serverLogs.value = [...serverLogs.value, ansiToHtml('[server] Starting: ' + proj.server_cmd + '\n')];
    serverStatus.value = 'running';
    detectedUrl.value = proj.server_url ?? null;
    try {
      await startServer(proj.server_cmd, proj.path);
    } catch (err) {
      serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Failed to start: ${err}\n`)];
      serverStatus.value = 'crashed';
    }
  };

  const handleStop = async () => {
    serverLogs.value = [...serverLogs.value, ansiToHtml('[server] Stopped\n')];
    serverStatus.value = 'stopped';
    try {
      await stopServer();
    } catch (err) {
      console.warn('[efxmux] Stop failed:', err);
    }
  };

  const handleRestart = async () => {
    const proj = getActiveProjectEntry();
    if (!proj?.server_cmd) return;
    serverLogs.value = [...serverLogs.value, ansiToHtml('[server] --- Restarting ---\n')];
    serverStatus.value = 'running';
    try {
      await restartServer(proj.server_cmd, proj.path);
    } catch (err) {
      serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Restart failed: ${err}\n`)];
      serverStatus.value = 'crashed';
    }
  };

  const handleOpen = async () => {
    const url = detectedUrl.value;
    if (url) await openInBrowser(url);
  };

  const handleToggle = () => {
    const current = serverPaneState.value;
    if (current === 'strip') serverPaneState.value = 'expanded';
    else if (current === 'expanded') serverPaneState.value = 'collapsed';
    else serverPaneState.value = 'strip';
    updateLayout({ 'server-pane-state': serverPaneState.value });
    if (serverPaneState.value === 'expanded') {
      requestAnimationFrame(() => initDragManager());
    }
  };

  // CSS state class
  const stateClass =
    paneState === 'strip' ? 'state-strip' :
    paneState === 'expanded' ? 'state-expanded' :
    'state-collapsed';

  // Build log HTML
  const logHtml = serverLogs.value.join('');

  return (
    <div class={`server-pane ${stateClass}`} aria-label="Server pane">
      {paneState !== 'collapsed' && (
        <div class="server-pane-toolbar">
          <div class="flex items-center gap-2">
            <span
              class="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: dotColor, opacity: dotOpacity }}
              aria-label={`Server status: ${status}`}
            />
            <span class="text-text-bright text-[11px] tracking-wider uppercase">Server</span>
            <button
              class="server-btn"
              title={paneState === 'expanded' ? 'Collapse server pane' : 'Expand server pane'}
              onClick={handleToggle}
            >{paneState === 'expanded' ? '▾' : '▸'}</button>
          </div>
          <div class="flex gap-1.5 items-center">
            <button
              class="server-btn"
              title="Start server"
              disabled={!startEnabled}
              onClick={handleStart}
            >Start</button>
            <button
              class="server-btn"
              title="Stop server"
              disabled={!stopEnabled}
              onClick={handleStop}
            >Stop</button>
            <button
              class="server-btn"
              title="Restart server"
              disabled={!restartEnabled}
              onClick={handleRestart}
            >Restart</button>
            <button
              class="server-btn"
              title="Open in browser"
              disabled={!openEnabled}
              onClick={handleOpen}
            >Open</button>
          </div>
        </div>
      )}

      {paneState === 'expanded' && (
        <div class="server-pane-logs" ref={logRef}>
          {isUnconfigured && serverLogs.value.length === 0 ? (
            <span class="text-text text-[11px] opacity-60">No server command configured. Edit project settings to add one.</span>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: logHtml }} />
          )}
        </div>
      )}
    </div>
  );
}
