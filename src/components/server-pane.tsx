// server-pane.tsx -- Server pane Preact component with toolbar, log viewer, and 2-state toggle
// Phase 7: Collapsible server pane with Start/Stop/Restart/Open controls and ANSI log streaming
// D-01: 2-state toggle: strip (28px) <-> expanded
// D-04: HTML toolbar + scrollable log area (not xterm.js)
// D-14: Crash detection shows "Process exited (code N)"
// T-07-06: ansiToHtml HTML-escapes before ANSI processing (XSS-safe)
// T-07-07: MAX_LOG_LINES = 5000 prevents unbounded memory growth
// 07-06: Per-project server state cache -- servers keep running across project switches

import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  startServer, stopServer, restartServer, openInBrowser,
  listenServerOutput, listenServerStopped,
} from '../server/server-bridge';
import { ansiToHtml, extractServerUrl } from '../server/ansi-html';
import { projects, activeProjectName, updateLayout } from '../state-manager';
import { initDragManager } from '../drag-manager';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level signals (exported for main.tsx Ctrl+S handler and state restore)
// ---------------------------------------------------------------------------

export const serverPaneState = signal<'strip' | 'expanded'>('strip');
export const serverStatus = signal<'stopped' | 'running' | 'crashed' | 'unconfigured'>('stopped');
const detectedUrl = signal<string | null>(null);
const serverLogs = signal<string[]>([]);

// ---------------------------------------------------------------------------
// Per-project server state cache (07-06)
// ---------------------------------------------------------------------------

interface ProjectServerState {
  logs: string[];
  status: 'stopped' | 'running' | 'crashed' | 'unconfigured';
  url: string | null;
}

const projectServerCache = new Map<string, ProjectServerState>();

/** Save current project's server state to the cache before switching. */
export function saveCurrentProjectState(projectName: string) {
  projectServerCache.set(projectName, {
    logs: serverLogs.value,
    status: serverStatus.value,
    url: detectedUrl.value,
  });
}

/** Restore a project's cached server state (or reset to defaults if no cache). */
export function restoreProjectState(projectName: string) {
  const cached = projectServerCache.get(projectName);
  if (cached) {
    serverLogs.value = cached.logs;
    serverStatus.value = cached.status;
    detectedUrl.value = cached.url;
  } else {
    serverLogs.value = [];
    serverStatus.value = 'stopped';
    detectedUrl.value = null;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LOG_LINES = 5000;

// 07-04: Guard flag for restart race condition (not a signal -- no re-render needed)
let isRestarting = false;

// 07-05: Timestamp of last server start (for grace period on multi-stage commands)
let serverStartedAt = 0;

// ---------------------------------------------------------------------------
// Public API for workspace isolation (07-05, gap 11)
// ---------------------------------------------------------------------------

/** Reset all server pane signals to defaults. Called on project switch. */
export function resetServerPane() {
  serverStatus.value = 'stopped';
  serverLogs.value = [];
  detectedUrl.value = null;
}

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

  // Status dot color (D-08: navy-blue palette)
  const dotColor =
    status === 'running' ? colors.statusGreen :
    status === 'crashed' ? colors.diffRed :
    'transparent';
  const dotOpacity = (status === 'stopped' || status === 'unconfigured') ? '0.4' : '1';

  // Auto-scroll on new logs (07-07: unconditional + requestAnimationFrame for correct timing)
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, [serverLogs.value]);

  // Server output + stopped listeners (07-06: filter by active project)
  useEffect(() => {
    let unlisten1: (() => void) | null = null;
    let unlisten2: (() => void) | null = null;

    listenServerOutput((project, text) => {
      // 07-04: Filter npm ELIFECYCLE noise after intentional stop
      if (text.includes('ELIFECYCLE') && serverStatus.value !== 'running') return;

      // D-09: Auto-detect URL from stdout
      const url = extractServerUrl(text);
      const html = ansiToHtml(text);

      if (project === activeProjectName.value) {
        // Active project -- update signals directly
        if (!detectedUrl.value && url) {
          detectedUrl.value = url;
          serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Detected URL: ${url}\n`)];
        }
        serverLogs.value = [...serverLogs.value, html].slice(-MAX_LOG_LINES);
      }

      // Always update the cache for the correct project (create entry if missing)
      let cached = projectServerCache.get(project);
      if (!cached) {
        cached = { logs: [], status: 'running', url: null };
        projectServerCache.set(project, cached);
      }
      if (!cached.url && url) {
        cached.url = url;
        cached.logs = [...cached.logs, ansiToHtml(`[server] Detected URL: ${url}\n`)];
      }
      cached.logs = [...cached.logs, html].slice(-MAX_LOG_LINES);
    }).then(fn => { unlisten1 = fn; });

    listenServerStopped((project, exitCode) => {
      // 07-04: Skip stale stopped events during restart
      if (isRestarting && project === activeProjectName.value) return;

      // 07-04: Exit 143 (SIGTERM) and 137 (SIGKILL) are clean stops, not crashes
      if (exitCode === 143 || exitCode === 137) {
        if (project === activeProjectName.value && serverStatus.value === 'running') {
          serverStatus.value = 'stopped';
        }
        // Update cache (create entry if missing)
        let cached = projectServerCache.get(project);
        if (!cached) {
          cached = { logs: [], status: 'stopped', url: null };
          projectServerCache.set(project, cached);
        }
        if (cached.status === 'running') cached.status = 'stopped';
        return;
      }

      // 07-05: Grace period -- ignore exit code 0 within 3s of start
      if (exitCode === 0 && Date.now() - serverStartedAt < 3000) {
        return;
      }

      // D-14: exitCode >= 0 = natural exit/crash
      if (exitCode >= 0) {
        const crashMsg = ansiToHtml(`[server] Process exited (code ${exitCode})\n`);
        if (project === activeProjectName.value && serverStatus.value === 'running') {
          serverStatus.value = 'crashed';
          serverLogs.value = [...serverLogs.value, crashMsg];
        }
        // Update cache (create entry if missing)
        let cached = projectServerCache.get(project);
        if (!cached) {
          cached = { logs: [], status: 'crashed', url: null };
          projectServerCache.set(project, cached);
        }
        if (cached.status === 'running') {
          cached.status = 'crashed';
          cached.logs = [...cached.logs, crashMsg];
        }
      }
    }).then(fn => { unlisten2 = fn; });

    return () => {
      unlisten1?.();
      unlisten2?.();
    };
  }, []);

  // Button handlers (07-06: pass activeProjectName.value as projectId)
  const handleStart = async () => {
    const proj = getActiveProjectEntry();
    if (!proj?.server_cmd) return;
    const projectId = activeProjectName.value;
    if (!projectId) return;
    serverLogs.value = [...serverLogs.value, ansiToHtml('[server] Starting: ' + proj.server_cmd + '\n')];
    serverStatus.value = 'running';
    serverStartedAt = Date.now(); // 07-05: record for grace period
    detectedUrl.value = proj.server_url ?? null;
    // Initialize cache entry for this project
    projectServerCache.set(projectId, {
      logs: serverLogs.value,
      status: 'running',
      url: detectedUrl.value,
    });
    try {
      await startServer(proj.server_cmd, proj.path, projectId);
    } catch (err) {
      serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Failed to start: ${err}\n`)];
      serverStatus.value = 'crashed';
    }
  };

  const handleStop = async () => {
    const projectId = activeProjectName.value;
    if (!projectId) return;
    isRestarting = false; // 07-04: Cancel any active restart guard
    serverLogs.value = [...serverLogs.value, ansiToHtml('[server] Stopped\n')];
    serverStatus.value = 'stopped';
    try {
      await stopServer(projectId);
    } catch (err) {
      console.warn('[efxmux] Stop failed:', err);
    }
  };

  const handleRestart = async () => {
    const proj = getActiveProjectEntry();
    if (!proj?.server_cmd) return;
    const projectId = activeProjectName.value;
    if (!projectId) return;
    isRestarting = true; // 07-04: Suppress stale server-stopped events during restart
    serverLogs.value = [...serverLogs.value, ansiToHtml('[server] --- Restarting ---\n')];
    serverStatus.value = 'running';
    try {
      await restartServer(proj.server_cmd, proj.path, projectId);
    } catch (err) {
      serverLogs.value = [...serverLogs.value, ansiToHtml(`[server] Restart failed: ${err}\n`)];
      serverStatus.value = 'crashed';
    } finally {
      setTimeout(() => { isRestarting = false; }, 2000);
    }
  };

  const handleOpen = async () => {
    const url = detectedUrl.value;
    if (url) await openInBrowser(url);
  };

  const handleToggle = () => {
    serverPaneState.value = serverPaneState.value === 'strip' ? 'expanded' : 'strip';
    updateLayout({ 'server-pane-state': serverPaneState.value });
    if (serverPaneState.value === 'expanded') {
      requestAnimationFrame(() => initDragManager());
    }
  };

  // CSS state class
  const stateClass = paneState === 'expanded' ? 'state-expanded' : 'state-strip';

  // Build log HTML
  const logHtml = serverLogs.value.join('');

  return (
    <div class={`server-pane ${stateClass}`} aria-label="Server pane">
        <div class="server-pane-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1, backgroundColor: colors.bgBase, padding: '4px 12px', borderTop: `1px solid ${colors.bgBorder}` }}>
            <span
              class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor, opacity: dotOpacity }}
              aria-label={`Server status: ${status}`}
            />
            <span style={{ color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11 }} class="truncate">{activeProjectName.value ?? 'Server'}</span>
            <button
              style={{ borderRadius: 4, border: `1px solid ${colors.bgBorder}`, padding: '2px 8px', fontSize: 10, fontFamily: fonts.mono, color: colors.textMuted, backgroundColor: 'transparent' }}
              title={paneState === 'expanded' ? 'Collapse server pane' : 'Expand server pane'}
              onClick={handleToggle}
            >{paneState === 'expanded' ? '▾' : '▸'}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 12px', borderTop: `1px solid ${colors.bgBorder}`, backgroundColor: colors.bgBase }}>
            <button
              style={{ borderRadius: 4, border: `1px solid ${colors.bgBorder}`, padding: '2px 8px', fontSize: 10, fontFamily: fonts.mono, color: colors.textMuted, backgroundColor: 'transparent' }}
              title="Clear server log"
              onClick={() => { serverLogs.value = []; }}
            >Clear</button>
            <button
              style={{ borderRadius: 4, backgroundColor: colors.accentMuted, border: 'none', padding: '2px 8px', fontSize: 10, fontFamily: fonts.mono, color: colors.accent, cursor: 'pointer' }}
              title="Start server"
              disabled={!startEnabled}
              onClick={handleStart}
            >Start</button>
            <button
              style={{ borderRadius: 4, backgroundColor: colors.accentMuted, border: 'none', padding: '2px 8px', fontSize: 10, fontFamily: fonts.mono, color: colors.accent, cursor: 'pointer' }}
              title="Stop server"
              disabled={!stopEnabled}
              onClick={handleStop}
            >Stop</button>
            <button
              style={{ borderRadius: 4, backgroundColor: colors.accentMuted, border: 'none', padding: '2px 8px', fontSize: 10, fontFamily: fonts.mono, color: colors.accent, cursor: 'pointer' }}
              title="Restart server"
              disabled={!restartEnabled}
              onClick={handleRestart}
            >Restart</button>
            <button
              style={{ borderRadius: 4, backgroundColor: colors.accentMuted, border: 'none', padding: '2px 8px', fontSize: 10, fontFamily: fonts.mono, color: colors.accent, cursor: 'pointer' }}
              title="Open in browser"
              disabled={!openEnabled}
              onClick={handleOpen}
            >Open</button>
          </div>
        </div>

      {paneState === 'expanded' && (
        <div class="server-pane-logs" ref={logRef}>
          {isUnconfigured && serverLogs.value.length === 0 ? (
            <span style={{ color: colors.textMuted, fontSize: 11, opacity: 0.6 }}>No server command configured. Edit project settings to add one.</span>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: logHtml }} />
          )}
        </div>
      )}
    </div>
  );
}
