# Files

## File: src/components/agent-header.tsx
````typescript
// agent-header.tsx -- Agent header card with version detection and status pill (D-01)
// Shows agent type (Claude Code / OpenCode / Bash), version string, and PTY running status.
// Sits inside the terminal area as a floating card.
// Visual rewrite: Phase 10 reference pattern (MainPanel AgentHeader reference)

import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { activeProjectName, projects } from '../state-manager';
import { terminalTabs, activeTabId } from './terminal-tabs';
import { colors, fonts, fontSizes } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level signals
// ---------------------------------------------------------------------------

const agentVersion = signal<string | null>(null);
const agentName = signal<string>('bash');

// Derived: is the active tab's PTY running?
const isRunning = computed(() => {
  const tab = terminalTabs.value.find(t => t.id === activeTabId.value);
  if (!tab) return false;
  // exitCode undefined = running, null or number = exited
  return tab.exitCode === undefined;
});

// Derived: display name for the agent
const displayName = computed(() => {
  const name = agentName.value;
  if (name === 'claude') return 'Claude Code';
  if (name === 'opencode') return 'OpenCode';
  return name.charAt(0).toUpperCase() + name.slice(1);
});

// ---------------------------------------------------------------------------
// Version fetching
// ---------------------------------------------------------------------------

async function fetchVersion(agent: string) {
  if (agent === 'bash' || agent === '') {
    agentVersion.value = null;
    return;
  }
  try {
    const version = await invoke<string>('get_agent_version', { agent });
    agentVersion.value = version;
  } catch {
    agentVersion.value = null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentHeader() {
  // Fetch version when active project or agent changes
  useEffect(() => {
    const project = projects.value.find(p => p.name === activeProjectName.value);
    const agent = project?.agent || 'bash';
    agentName.value = agent;
    fetchVersion(agent);

    function handleProjectChanged() {
      const p = projects.value.find(pr => pr.name === activeProjectName.value);
      const a = p?.agent || 'bash';
      agentName.value = a;
      fetchVersion(a);
    }

    document.addEventListener('project-changed', handleProjectChanged);
    return () => document.removeEventListener('project-changed', handleProjectChanged);
  }, []);

  return (
    <div
      class="flex items-center w-full"
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        backgroundColor: colors.bgElevated,
        borderRadius: 8,
        padding: '8px 12px',
        gap: 10,
      }}
    >
      {/* Gradient diamond icon - 28x28, rounded-md, inline gradient */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `linear-gradient(180deg, ${colors.agentGradientStart} 0%, ${colors.agentGradientEnd} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSizes.sm,
            color: '#ffffff',
            lineHeight: 1,
          }}
        >
          &#x25C6;
        </span>
      </div>

      {/* Info column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSizes.sm,
            fontWeight: 500,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}
        >
          {displayName.value} {agentVersion.value}
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSizes.xs,
            color: colors.textDim,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {agentName.value === 'claude' ? 'Opus 4' : agentName.value === 'opencode' ? 'OpenCode' : 'Bash'} · {activeProjectName.value || 'No project'}
        </span>
      </div>

      {/* Status pill - using tokens.ts statusGreenBg/diffRedBg */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          backgroundColor: isRunning.value ? colors.statusGreenBg : colors.diffRedBg,
          borderRadius: 4,
          padding: '3px 8px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: isRunning.value ? colors.statusGreen : colors.diffRed,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSizes.xs,
            fontWeight: 500,
            color: isRunning.value ? colors.statusGreen : colors.diffRed,
            lineHeight: 1,
          }}
        >
          {isRunning.value ? 'Ready' : 'Stopped'}
        </span>
      </div>
    </div>
  );
}
````

## File: src/components/crash-overlay.tsx
````typescript
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
            Terminal session ended (exit code {tab.exitCode})
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
````

## File: src/components/first-run-wizard.tsx
````typescript
// first-run-wizard.tsx -- Multi-step first-run wizard modal (UX-04)
// Replaces openProjectModal({ firstRun: true }) in main.tsx initProjects()
// 5 steps: Welcome, Project, Agent, Theme, Server & GSD

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { addProject, switchProject } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level signals
// ---------------------------------------------------------------------------

const visible = signal(false);
const step = signal(0);
const STEPS = ['Welcome', 'Project', 'Agent', 'Theme', 'Server & GSD'];

// Form data signals
const directory = signal('');
const projectName = signal('');
const agent = signal('bash'); // Default: bash (D-12)
const serverCmd = signal('');
const gsdFile = signal('');
const themeImported = signal(false);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function openWizard() {
  visible.value = true;
  step.value = 0;
  directory.value = '';
  projectName.value = '';
  agent.value = 'bash';
  serverCmd.value = '';
  gsdFile.value = '';
  themeImported.value = false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function finishWizard() {
  const dir = directory.value.trim();
  const name = projectName.value.trim();

  if (dir && name) {
    try {
      const entry: ProjectEntry = {
        path: dir,
        name: name,
        agent: agent.value.trim() || 'bash',
        server_cmd: serverCmd.value.trim() || undefined,
        gsd_file: gsdFile.value.trim() || undefined,
      };
      await addProject(entry);
      document.dispatchEvent(new CustomEvent('project-added', { detail: { entry } }));
      await switchProject(entry.name);
    } catch (err) {
      console.error('[efxmux] Wizard finish failed:', err);
    }
  }

  visible.value = false;
}

function closeWithDefaults() {
  // Apply defaults for any missing data, then finish
  if (!directory.value.trim()) {
    directory.value = '/tmp';
  }
  if (!projectName.value.trim()) {
    projectName.value = 'default';
  }
  finishWizard();
}

async function handleBrowse() {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      directory.value = selected as string;
      const parts = (selected as string).split('/');
      projectName.value = parts[parts.length - 1] || 'project';
      // Auto-detect GSD planning directory
      try {
        const entries = await invoke<Array<{ name: string; is_dir: boolean }>>('list_directory', { path: selected });
        const hasPlanningDir = entries.some(e => e.is_dir && e.name === '.planning');
        if (hasPlanningDir) {
          const planningEntries = await invoke<Array<{ name: string; is_dir: boolean }>>('list_directory', { path: selected + '/.planning' });
          const planFile = planningEntries.find(e => !e.is_dir && /^(ROADMAP|PLAN)\.md$/i.test(e.name));
          if (planFile) {
            gsdFile.value = '.planning/' + planFile.name;
          }
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn('[efxmux] Directory picker failed:', err);
  }
}

async function handleImportTheme() {
  const selected = await open({
    filters: [{ name: 'Theme', extensions: ['json', 'itermcolors'] }],
  });
  if (selected) {
    try {
      await invoke('import_iterm2_theme', { path: selected as string });
      themeImported.value = true;
    } catch (err) {
      console.error('[efxmux] Theme import failed:', err);
    }
  }
}

function handlePrimary() {
  if (step.value === STEPS.length - 1) {
    finishWizard();
  } else {
    step.value++;
  }
}

function handleSkip() {
  if (step.value === 1) {
    // Skip project: set defaults
    directory.value = '';
    projectName.value = 'default';
  }
  // Step 2 skip: agent stays 'bash' (already default)
  // Step 3 skip: no theme import
  // Step 4 skip: same as finish with no server/gsd data
  if (step.value === STEPS.length - 1) {
    finishWizard();
  } else {
    step.value++;
  }
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepWelcome() {
  return (
    <div class="text-center py-6">
      <h2 class="text-xl font-semibold mb-4" style={{ fontFamily: fonts.sans, color: colors.textPrimary }}>
        Welcome to Efxmux
      </h2>
      <p class="text-sm leading-relaxed max-w-[360px] mx-auto" style={{ color: colors.textMuted }}>
        A terminal workspace for AI-assisted development. Let's set up your first project.
      </p>
    </div>
  );
}

function StepProject() {
  return (
    <div>
      {/* Directory */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>Directory</label>
        <div class="flex">
          <input
            type="text"
            placeholder="/path/to/project"
            class="flex-1 h-8 px-2 text-sm rounded-l-sm outline-none transition-colors"
            style={{ backgroundColor: colors.bgDeep, border: `1px solid ${colors.bgBorder}`, color: colors.textPrimary }}
            value={directory.value}
            onInput={(e) => { directory.value = (e.target as HTMLInputElement).value; }}
          />
          <button
            type="button"
            class="w-8 h-8 border-l-0 rounded-r-sm text-sm shrink-0 cursor-pointer"
            style={{ backgroundColor: colors.bgDeep, border: `1px solid ${colors.bgBorder}`, color: colors.textMuted }}
            title="Browse"
            onClick={handleBrowse}
          >[...]</button>
        </div>
      </div>

      {/* Name */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>Name</label>
        <input
          type="text"
          placeholder="project-name"
          class="w-full h-8 px-2 text-sm rounded-sm outline-none box-border transition-colors"
          style={{ backgroundColor: colors.bgDeep, border: `1px solid ${colors.bgBorder}`, color: colors.textPrimary }}
          value={projectName.value}
          onInput={(e) => { projectName.value = (e.target as HTMLInputElement).value; }}
        />
      </div>
    </div>
  );
}

function StepAgent() {
  const agents = [
    { id: 'claude', label: 'Claude Code', desc: "Anthropic's AI agent" },
    { id: 'opencode', label: 'OpenCode', desc: 'Open-source alternative' },
    { id: 'bash', label: 'Plain Shell', desc: 'No AI agent' },
  ];

  return (
    <div>
      <p class="text-sm mb-4" style={{ color: colors.textMuted }}>Which AI coding agent do you use?</p>
      <div class="flex gap-3">
        {agents.map((a) => (
          <div
            key={a.id}
            class="flex-1 p-4 rounded cursor-pointer text-center transition-all duration-150"
            style={{
              border: `1px solid ${agent.value === a.id ? colors.accent : colors.bgBorder}`,
              backgroundColor: agent.value === a.id ? colors.accentMuted : 'transparent',
              color: agent.value === a.id ? colors.textPrimary : colors.textMuted,
            }}
            onClick={() => { agent.value = a.id; }}
          >
            <div class="text-sm font-semibold mb-1" style={{ fontFamily: fonts.sans }}>{a.label}</div>
            <div class="text-[11px]" style={{ color: colors.textMuted }}>{a.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTheme() {
  return (
    <div>
      <p class="text-sm mb-4" style={{ color: colors.textMuted }}>Import your iTerm2 color profile for a familiar look.</p>
      <button
        type="button"
        class="px-4 py-2 rounded-sm text-sm cursor-pointer transition-colors"
        style={{ backgroundColor: colors.bgDeep, border: `1px solid ${colors.bgBorder}`, color: colors.textPrimary }}
        onClick={handleImportTheme}
      >
        Choose iTerm2 Profile...
      </button>
      {themeImported.value && (
        <p class="text-sm mt-3" style={{ color: colors.statusGreen }}>Theme imported!</p>
      )}
    </div>
  );
}

function StepServer() {
  return (
    <div>
      {/* Server Command */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>Server Command</label>
        <input
          type="text"
          placeholder="Optional, e.g. npm run dev"
          class="w-full h-8 px-2 text-sm rounded-sm outline-none box-border transition-colors"
          style={{ backgroundColor: colors.bgDeep, border: `1px solid ${colors.bgBorder}`, color: colors.textPrimary }}
          value={serverCmd.value}
          onInput={(e) => { serverCmd.value = (e.target as HTMLInputElement).value; }}
        />
      </div>

      {/* GSD File */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>GSD File</label>
        <input
          type="text"
          placeholder="Optional .md path"
          class="w-full h-8 px-2 text-sm rounded-sm outline-none box-border transition-colors"
          style={{ backgroundColor: colors.bgDeep, border: `1px solid ${colors.bgBorder}`, color: colors.textPrimary }}
          value={gsdFile.value}
          onInput={(e) => { gsdFile.value = (e.target as HTMLInputElement).value; }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FirstRunWizard() {
  if (!visible.value) return null;

  // Block Escape from closing wizard (D-11)
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
      // Enter triggers primary CTA
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePrimary();
      }
    }
    document.addEventListener('keydown', handleKeydown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeydown, { capture: true });
  }, []);

  return (
    <div class="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div class="w-[520px] rounded-lg shadow-2xl" style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}` }}>
        {/* Header */}
        <div class="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.bgBorder}` }}>
          <span class="text-base" style={{ color: colors.textPrimary }}>{STEPS[step.value]}</span>
          <button
            onClick={closeWithDefaults}
            class="w-7 h-7 flex items-center justify-center text-base cursor-pointer rounded transition-colors"
            style={{ color: colors.textMuted }}
            onMouseEnter={(e) => { const t = e.target as HTMLElement; t.style.color = colors.textPrimary; t.style.backgroundColor = colors.bgBase; }}
            onMouseLeave={(e) => { const t = e.target as HTMLElement; t.style.color = colors.textMuted; t.style.backgroundColor = 'transparent'; }}
            title="Close wizard"
          >{'\u2715'}</button>
        </div>

        {/* Step dots */}
        <div class="flex gap-2 justify-center py-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: i === step.value ? colors.accent : i < step.value ? colors.accent : colors.bgBorder,
                opacity: i < step.value ? 0.5 : 1,
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div class="px-6 py-4">
          {step.value === 0 && <StepWelcome />}
          {step.value === 1 && <StepProject />}
          {step.value === 2 && <StepAgent />}
          {step.value === 3 && <StepTheme />}
          {step.value === 4 && <StepServer />}
        </div>

        {/* Footer */}
        <div class="px-6 py-4 flex justify-between items-center" style={{ borderTop: `1px solid ${colors.bgBorder}` }}>
          <div>
            {step.value > 0 && step.value < STEPS.length && (
              <span onClick={handleSkip} class="text-sm cursor-pointer" style={{ color: colors.textMuted }}>Skip</span>
            )}
          </div>
          <div class="flex gap-2">
            {step.value > 0 && (
              <button
                onClick={() => { step.value--; }}
                class="px-4 py-2 rounded-sm text-sm cursor-pointer transition-colors"
                style={{ backgroundColor: 'transparent', border: `1px solid ${colors.bgBorder}`, color: colors.textMuted }}
                onMouseEnter={(e) => { const t = e.target as HTMLElement; t.style.backgroundColor = colors.bgBase; t.style.color = colors.textPrimary; }}
                onMouseLeave={(e) => { const t = e.target as HTMLElement; t.style.backgroundColor = 'transparent'; t.style.color = colors.textMuted; }}
              >
                Back
              </button>
            )}
            <button
              onClick={handlePrimary}
              class="px-4 py-2 rounded-sm text-sm cursor-pointer transition-opacity"
              style={{ backgroundColor: colors.accent, color: '#fff' }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
            >
              {step.value === 0 ? 'Get Started' : step.value === STEPS.length - 1 ? 'Finish Setup' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
````

## File: src/components/server-pane.tsx
````typescript
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
````

## File: src/components/shortcut-cheatsheet.tsx
````typescript
// shortcut-cheatsheet.tsx -- Ctrl+? shortcut cheatsheet overlay
// UX-01, D-03: Dismisses on Escape, click outside, or any shortcut key press

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const visible = signal(false);

export function toggleCheatsheet() {
  visible.value = !visible.value;
}

function closeCheatsheet() {
  visible.value = false;
}

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

const TERMINAL_PASSTHROUGH = new Set(['c', 'd', 'z', 'l', 'r']);

const SHORTCUTS = [
  { section: 'Terminal', items: [
    { key: 'Ctrl+T', action: 'New terminal tab' },
    { key: 'Ctrl+W', action: 'Close active tab' },
    { key: 'Ctrl+Tab', action: 'Next tab' },
  ]},
  { section: 'Navigation', items: [
    { key: 'Ctrl+P', action: 'Switch project' },
    { key: 'Ctrl+B', action: 'Toggle sidebar' },
    { key: 'Ctrl+S', action: 'Toggle server pane' },
  ]},
  { section: 'App', items: [
    { key: 'Ctrl+Shift+T', action: 'Toggle dark/light theme' },
    { key: 'Ctrl+,', action: 'Preferences' },
    { key: 'Ctrl+?', action: 'This cheatsheet' },
    { key: 'Cmd+K', action: 'Clear terminal' },
  ]},
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShortcutCheatsheet() {
  useEffect(() => {
    if (!visible.value) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCheatsheet();
        return;
      }
      // Close on any Ctrl+key that is NOT terminal passthrough
      if (e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (!TERMINAL_PASSTHROUGH.has(k) || e.shiftKey) {
          closeCheatsheet();
        }
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [visible.value]);

  if (!visible.value) return null;

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={closeCheatsheet}
    >
      <div
        class="w-[420px] max-h-[70vh] rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-y-auto"
        style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="px-6 py-4" style={{ borderBottom: `1px solid ${colors.bgBorder}` }}>
          <span class="text-base" style={{ color: colors.textPrimary }}>Keyboard Shortcuts</span>
        </div>

        {/* Shortcut sections */}
        {SHORTCUTS.map((section) => (
          <div key={section.section}>
            <div class="px-6 py-2 text-[11px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
              {section.section}
            </div>
            {section.items.map((item) => (
              <div
                key={item.key}
                class="flex items-center justify-between px-6 py-2"
                style={{ borderBottom: `1px solid ${colors.bgBorder}` }}
              >
                <span class="text-sm" style={{ color: colors.textPrimary }}>{item.action}</span>
                <span
                  class="inline-flex items-center px-2 py-0.5 text-xs rounded"
                  style={{
                    backgroundColor: colors.bgDeep,
                    border: `1px solid ${colors.bgBorder}`,
                    color: colors.accent,
                    fontFamily: fonts.mono,
                  }}
                >
                  {item.key}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
````

## File: src/server/ansi-html.ts
````typescript
// ansi-html.ts -- Convert ANSI escape codes to styled HTML (Phase 7)
// T-07-03 mitigation: HTML-escape BEFORE processing ANSI codes to prevent XSS
// 07-04: Extended to handle 256-color (38;5;N) and truecolor (38;2;R;G;B) sequences

/** Solarized Dark ANSI color map */
const ANSI_COLORS: Record<number, string> = {
  30: '#282d3a', 31: '#dc322f', 32: '#859900', 33: '#b58900',
  34: '#268bd2', 35: '#d33682', 36: '#2aa198', 37: '#eee8d5',
  90: '#657b83', 91: '#cb4b16', 92: '#859900', 93: '#b58900',
  94: '#268bd2', 95: '#d33682', 96: '#2aa198', 97: '#fdf6e3',
};

/** Background color ANSI map (40-47, 100-107) */
const ANSI_BG_COLORS: Record<number, string> = {
  40: '#282d3a', 41: '#dc322f', 42: '#859900', 43: '#b58900',
  44: '#268bd2', 45: '#d33682', 46: '#2aa198', 47: '#eee8d5',
  100: '#657b83', 101: '#cb4b16', 102: '#859900', 103: '#b58900',
  104: '#268bd2', 105: '#d33682', 106: '#2aa198', 107: '#fdf6e3',
};

/**
 * Convert xterm-256color palette index to hex color string.
 * Colors 0-7: standard (map to ANSI 30+n), 8-15: bright (map to ANSI 90+(n-8)),
 * 16-231: 6x6x6 RGB cube, 232-255: grayscale ramp.
 */
function color256(n: number): string {
  if (n < 0 || n > 255) return '#8d999a'; // fallback to text color
  if (n < 8) return ANSI_COLORS[30 + n] ?? '#8d999a';
  if (n < 16) return ANSI_COLORS[90 + (n - 8)] ?? '#8d999a';
  if (n < 232) {
    // 6x6x6 RGB cube (colors 16-231)
    const idx = n - 16;
    const ri = Math.floor(idx / 36);
    const gi = Math.floor((idx % 36) / 6);
    const bi = idx % 6;
    const levels = [0, 95, 135, 175, 215, 255];
    const r = levels[ri], g = levels[gi], b = levels[bi];
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  // Grayscale ramp (colors 232-255)
  const v = 8 + (n - 232) * 10;
  return `#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`;
}

/**
 * Convert ANSI-escaped text to styled HTML.
 * HTML-escapes input first (T-07-03), then processes ANSI sequences.
 * Handles basic colors, 256-color (38;5;N / 48;5;N), and truecolor (38;2;R;G;B / 48;2;R;G;B).
 */
export function ansiToHtml(text: string): string {
  // Step 1: HTML-escape (T-07-03: prevents XSS from crafted server output)
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Step 2: Replace ANSI escape sequences with HTML spans
  let openSpans = 0;
  escaped = escaped.replace(/\x1b\[(\d+(?:;\d+)*)m/g, (_match, codes: string) => {
    const parts = codes.split(';').map(Number);
    const styles: string[] = [];
    let result = '';

    for (let i = 0; i < parts.length; i++) {
      const code = parts[i];

      if (code === 0) {
        // Reset: close all open spans
        result += '</span>'.repeat(openSpans);
        openSpans = 0;
        continue;
      }

      // 256-color foreground: 38;5;N
      if (code === 38 && parts[i + 1] === 5 && i + 2 < parts.length) {
        styles.push(`color:${color256(parts[i + 2])}`);
        i += 2;
        continue;
      }

      // Truecolor foreground: 38;2;R;G;B
      if (code === 38 && parts[i + 1] === 2 && i + 4 < parts.length) {
        const r = parts[i + 2], g = parts[i + 3], b = parts[i + 4];
        styles.push(`color:#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        i += 4;
        continue;
      }

      // 256-color background: 48;5;N
      if (code === 48 && parts[i + 1] === 5 && i + 2 < parts.length) {
        styles.push(`background-color:${color256(parts[i + 2])}`);
        i += 2;
        continue;
      }

      // Truecolor background: 48;2;R;G;B
      if (code === 48 && parts[i + 1] === 2 && i + 4 < parts.length) {
        const r = parts[i + 2], g = parts[i + 3], b = parts[i + 4];
        styles.push(`background-color:#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        i += 4;
        continue;
      }

      // Bold
      if (code === 1) {
        styles.push('font-weight:bold');
      }

      // Basic foreground colors (30-37, 90-97)
      if (ANSI_COLORS[code]) {
        styles.push(`color:${ANSI_COLORS[code]}`);
      }

      // Basic background colors (40-47, 100-107)
      if (ANSI_BG_COLORS[code]) {
        styles.push(`background-color:${ANSI_BG_COLORS[code]}`);
      }
    }

    if (styles.length > 0) {
      openSpans++;
      result += `<span style="${styles.join(';')}">`;
    }

    return result;
  });

  // Step 3: Strip any remaining unhandled ANSI sequences
  escaped = escaped.replace(/\x1b\[[^m]*m/g, '');

  // Step 4: Close any remaining open spans
  escaped += '</span>'.repeat(openSpans);

  // Step 5: Convert newlines to <br> for HTML rendering
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

/**
 * Extract a localhost URL from server output text.
 * Returns the first match or null.
 */
export function extractServerUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/\S*)?/);
  return match ? match[0] : null;
}
````

## File: src/server/server-bridge.ts
````typescript
// server-bridge.ts -- Frontend bridge for server management commands (Phase 7)
// Wraps Rust invoke commands and Tauri event listeners for the server pane
// 07-06: All commands now accept projectId for per-project server management

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Start a server process with the given command in the specified working directory.
 * @param projectId - Project name used as key in Rust ServerProcesses HashMap
 */
export async function startServer(cmd: string, cwd: string, projectId: string): Promise<void> {
  await invoke('start_server', { cmd, cwd, projectId });
}

/**
 * Stop the running server process for a specific project.
 * @param projectId - Project name identifying which server to stop
 */
export async function stopServer(projectId: string): Promise<void> {
  await invoke('stop_server', { projectId });
}

/**
 * Restart the server for a specific project: stops existing process, then starts with new command.
 * @param projectId - Project name identifying which server to restart
 */
export async function restartServer(cmd: string, cwd: string, projectId: string): Promise<void> {
  await invoke('restart_server', { cmd, cwd, projectId });
}

/**
 * Detect whether an agent binary exists in PATH.
 * Returns the agent name if found, throws if not found.
 */
export async function detectAgent(agent: string): Promise<string> {
  return await invoke<string>('detect_agent', { agent });
}

/**
 * Listen for server stdout/stderr output events.
 * 07-06: Payload now includes project identifier for per-project filtering.
 * Returns an unlisten function to stop listening.
 */
export async function listenServerOutput(callback: (project: string, text: string) => void): Promise<() => void> {
  return await listen<{ project: string; text: string }>('server-output', (event) =>
    callback(event.payload.project, event.payload.text)
  );
}

/**
 * Listen for server process exit events.
 * 07-06: Payload now includes project identifier for per-project filtering.
 * Callback receives exit code: >= 0 = natural exit/crash (D-14).
 * Returns an unlisten function to stop listening.
 */
export async function listenServerStopped(callback: (project: string, exitCode: number) => void): Promise<() => void> {
  return await listen<{ project: string; code: number }>('server-stopped', (event) =>
    callback(event.payload.project, event.payload.code)
  );
}

/**
 * Open a URL in the system default browser.
 */
export async function openInBrowser(url: string): Promise<void> {
  await openUrl(url);
}
````

## File: src/drag-manager.ts
````typescript
// drag-manager.ts -- Vanilla DOM drag manager for all split handles (per D-06 to D-09)
// No framework dependencies. Attaches to DOM handles identified by [data-handle].
// Ratios persisted via state-manager.ts (Phase 4: state.json via Rust backend).
// Migrated to TypeScript (Phase 6.1)

import { updateLayout } from './state-manager';

interface DragCallbacksV {
  onDrag: (clientX: number) => void;
  onEnd: (clientX: number) => void;
}

interface DragCallbacksH {
  onDrag: (clientY: number) => void;
  onEnd: (clientY: number) => void;
}

/**
 * Initialize drag behavior for all split handles.
 */
export function initDragManager(): void {
  const app = document.getElementById('app');
  if (!app) return;

  // -- Sidebar <-> Main vertical handle ----------------------------------------
  const sidebarHandle = document.querySelector<HTMLElement>('[data-handle="sidebar-main"]');
  if (sidebarHandle) {
    makeDragV(sidebarHandle, {
      onDrag(clientX: number) {
        // clientX is the new sidebar right edge.
        // Clamp: min 40px (icon strip), max 400px.
        const w = Math.min(400, Math.max(40, clientX));
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
      },
      onEnd(clientX: number) {
        const w = Math.min(400, Math.max(40, clientX));
        updateLayout({ 'sidebar-w': `${w}px` });
      },
    });
  }

  // -- Main <-> Right vertical handle ------------------------------------------
  const mainRightHandle = document.querySelector<HTMLElement>('[data-handle="main-right"]');
  if (mainRightHandle) {
    makeDragV(mainRightHandle, {
      onDrag(clientX: number) {
        // clientX is the left edge of the right panel.
        // Convert to a % of total window width for responsive behavior.
        const totalW = window.innerWidth;
        const rawPct = ((totalW - clientX) / totalW) * 100;
        // Clamp: min 10%, max 50%
        const pct = Math.min(50, Math.max(10, rawPct));
        document.documentElement.style.setProperty('--right-w', `${pct.toFixed(1)}%`);
      },
      onEnd(clientX: number) {
        const totalW = window.innerWidth;
        const rawPct = ((totalW - clientX) / totalW) * 100;
        const pct = Math.min(50, Math.max(10, rawPct));
        updateLayout({ 'right-w': `${pct.toFixed(1)}%` });
      },
    });
  }

  // -- Main terminal <-> Server pane horizontal handle (D-03) ------------------
  const mainHHandle = document.querySelector<HTMLElement>('[data-handle="main-h"]');
  if (mainHHandle && !mainHHandle.dataset.dragInit) {
    mainHHandle.dataset.dragInit = 'true';
    makeDragH(mainHHandle, {
      onDrag(clientY: number) {
        // Server pane is at the bottom of .main-panel. Its height = container bottom - clientY.
        const mainPanel = document.querySelector<HTMLElement>('.main-panel');
        if (!mainPanel) return;
        const rect = mainPanel.getBoundingClientRect();
        const newHeight = rect.bottom - clientY;
        // Clamp: min 100px, max 50% of main panel height
        const clamped = Math.min(rect.height * 0.5, Math.max(100, newHeight));
        document.documentElement.style.setProperty('--server-pane-h', `${Math.round(clamped)}px`);
      },
      onEnd(clientY: number) {
        const mainPanel = document.querySelector<HTMLElement>('.main-panel');
        if (!mainPanel) return;
        const rect = mainPanel.getBoundingClientRect();
        const newHeight = rect.bottom - clientY;
        const clamped = Math.min(rect.height * 0.5, Math.max(100, newHeight));
        updateLayout({ 'server-pane-height': `${Math.round(clamped)}px` });
      },
    });
  }

  // -- Right top <-> Right bottom horizontal handle ----------------------------
  const rightHHandle = document.querySelector<HTMLElement>('[data-handle="right-h"]');
  if (rightHHandle) {
    makeDragH(rightHHandle, {
      onDrag(clientY: number) {
        // clientY is the Y position within the right panel.
        // We want to set the top sub-panel's flex-basis.
        const rightPanel = document.querySelector<HTMLElement>('.right-panel');
        if (!rightPanel) return;
        const rect = rightPanel.getBoundingClientRect();
        const rawPct = ((clientY - rect.top) / rect.height) * 100;
        // Clamp: top panel min 15%, max 85%
        const pct = Math.min(85, Math.max(15, rawPct));
        // Apply as flex-basis on .right-top and .right-bottom
        const rightTop = rightPanel.querySelector<HTMLElement>('.right-top');
        const rightBottom = rightPanel.querySelector<HTMLElement>('.right-bottom');
        if (rightTop)    rightTop.style.flex    = `0 0 ${pct.toFixed(1)}%`;
        if (rightBottom) rightBottom.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
        // Store as a data attribute for persistence
        rightPanel.dataset.splitPct = pct.toFixed(1);
      },
      onEnd(_clientY: number) {
        const rightPanel = document.querySelector<HTMLElement>('.right-panel');
        if (!rightPanel) return;
        const pct = parseFloat(rightPanel.dataset.splitPct || '50');
        updateLayout({ 'right-h-pct': `${pct.toFixed(1)}` });
      },
    });
  }
}

// --- Vertical drag helper ----------------------------------------------------
/**
 * Attach vertical (column-resize) drag to a handle element.
 */
function makeDragV(handle: HTMLElement, { onDrag, onEnd }: DragCallbacksV): void {
  const app = document.getElementById('app');

  handle.addEventListener('mousedown', (startEvent: MouseEvent) => {
    startEvent.preventDefault();

    // Disable pointer events on panels to prevent mousemove event loss (Pitfall 3)
    app?.classList.add('app-dragging');
    handle.classList.add('dragging');

    function onMove(e: MouseEvent): void {
      onDrag(e.clientX);
    }

    function onUp(e: MouseEvent): void {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      app?.classList.remove('app-dragging');
      handle.classList.remove('dragging');
      onEnd(e.clientX);
    }

    // Attach to document so events continue even when cursor leaves the handle
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// --- Horizontal drag helper --------------------------------------------------
/**
 * Attach horizontal (row-resize) drag to a handle element.
 */
function makeDragH(handle: HTMLElement, { onDrag, onEnd }: DragCallbacksH): void {
  const app = document.getElementById('app');

  handle.addEventListener('mousedown', (startEvent: MouseEvent) => {
    startEvent.preventDefault();
    app?.classList.add('app-dragging');
    handle.classList.add('dragging');

    function onMove(e: MouseEvent): void {
      onDrag(e.clientY);
    }

    function onUp(e: MouseEvent): void {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      app?.classList.remove('app-dragging');
      handle.classList.remove('dragging');
      onEnd(e.clientY);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
````

## File: src/state-manager.ts
````typescript
// state-manager.ts -- Bridge between JS state and Rust state.json (Phase 4)
// Per D-11: beforeunload triggers save_state via invoke
// Per D-12: Rust uses spawn_blocking for synchronous file I/O
// Migrated to TypeScript with @preact/signals (Phase 6.1)

import { invoke } from '@tauri-apps/api/core';
import { signal } from '@preact/signals';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface ProjectEntry {
  path: string;
  name: string;
  agent: string;
  gsd_file?: string;
  server_cmd?: string;
  server_url?: string;
}

export interface GitData {
  branch: string;
  modified: number;
  staged: number;
  untracked: number;
}

export interface AppState {
  version: number;
  layout: Record<string, string | boolean>;
  theme: { mode: string };
  session: Record<string, string>;
  project: { active: string | null; projects: ProjectEntry[] };
  panels: Record<string, string>;
}

// ---------------------------------------------------------------------------
// App-wide signals that components can import and subscribe to
// ---------------------------------------------------------------------------

export const projects = signal<ProjectEntry[]>([]);
export const activeProjectName = signal<string | null>(null);
export const sidebarCollapsed = signal(false);
export const rightTopTab = signal('File Tree');
export const rightBottomTab = signal('Bash');

// ---------------------------------------------------------------------------
// Internal state (raw Rust state blob, not UI-reactive)
// ---------------------------------------------------------------------------

let currentState: AppState | null = null;

// ---------------------------------------------------------------------------
// State persistence functions
// ---------------------------------------------------------------------------

/**
 * Load app state from Rust backend (reads ~/.config/efxmux/state.json).
 * Returns defaults if missing or corrupt (D-09, D-10).
 */
export async function loadAppState(): Promise<AppState> {
  try {
    currentState = await invoke<AppState>('load_state');
    // Ensure project.projects exists even if loaded from older state.json (T-08-07-02)
    if (!currentState.project) currentState.project = { active: null, projects: [] };
    if (!currentState.project.projects) currentState.project.projects = [];
  } catch (err) {
    console.warn('[efxmux] Failed to load state, using defaults:', err);
    // Return a minimal default state matching Rust defaults
    currentState = {
      version: 1,
      layout: { 'sidebar-w': '200px', 'right-w': '25%', 'right-h-pct': '50', 'sidebar-collapsed': false },
      theme: { mode: 'dark' },
      session: { 'main-tmux-session': 'efx-mux', 'right-tmux-session': 'efx-mux-right' },
      project: { active: null, projects: [] },
      panels: { 'right-top-tab': 'File Tree', 'right-bottom-tab': 'Bash' },
    };
  }

  // Set signals from loaded state
  sidebarCollapsed.value = currentState?.layout?.['sidebar-collapsed'] === true || currentState?.layout?.['sidebar-collapsed'] === 'true';
  if (currentState?.panels?.['right-top-tab'] && currentState.panels['right-top-tab'] !== 'gsd') rightTopTab.value = currentState.panels['right-top-tab'];
  if (currentState?.panels?.['right-bottom-tab']) rightBottomTab.value = currentState.panels['right-bottom-tab'];

  // Restore projects and active project from persisted state (T-08-07-02)
  if (currentState?.project?.projects?.length) {
    projects.value = currentState.project.projects;
  }
  if (currentState?.project?.active) {
    activeProjectName.value = currentState.project.active;
  }

  return currentState!;
}

/**
 * Save app state to Rust backend (writes ~/.config/efxmux/state.json).
 */
export async function saveAppState(state: AppState): Promise<void> {
  try {
    // Sync project data from signals before every save (T-08-07-02)
    if (!state.project) state.project = { active: null, projects: [] };
    state.project.active = activeProjectName.value;
    state.project.projects = projects.value;
    const stateJson = JSON.stringify(state);
    await invoke('save_state', { stateJson });
  } catch (err) {
    console.warn('[efxmux] Failed to save state:', err);
  }
}

/**
 * Get the current state (loaded or default).
 */
export function getCurrentState(): AppState | null {
  return currentState;
}

/**
 * Update layout fields in current state and persist.
 */
export async function updateLayout(patch: Record<string, string | boolean>): Promise<void> {
  if (!currentState) return;
  if (!currentState.layout) currentState.layout = {};
  for (const [key, value] of Object.entries(patch)) {
    currentState.layout[key] = value;
  }
  await saveAppState(currentState);
}

/**
 * Update theme mode in current state and persist.
 */
export async function updateThemeMode(mode: 'dark' | 'light'): Promise<void> {
  if (!currentState) return;
  if (!currentState.theme) currentState.theme = { mode: 'dark' };
  currentState.theme.mode = mode;
  await saveAppState(currentState);
}

/**
 * Update tmux session names in current state and persist.
 */
export async function updateSession(patch: Record<string, string>): Promise<void> {
  if (!currentState) return;
  if (!currentState.session) currentState.session = {};
  for (const [key, value] of Object.entries(patch)) {
    currentState.session[key] = value;
  }
  await saveAppState(currentState);
}

/**
 * Wire window:beforeunload to save state before app closes (D-11).
 * Call this once during app init.
 */
export function initBeforeUnload(): void {
  window.addEventListener('beforeunload', () => {
    if (currentState) {
      // Sync project data from signals into state before saving (T-08-07-02)
      if (!currentState.project) currentState.project = { active: null, projects: [] };
      currentState.project.active = activeProjectName.value;
      currentState.project.projects = projects.value;
      // Invoke save_state -- the spawn_blocking on Rust side ensures the write
      // completes before the process exits (Tauri waits for pending commands).
      invoke('save_state', { stateJson: JSON.stringify(currentState) }).catch(() => {});
    }
  });
}

// ============================================================================
// Project registry helpers (Phase 5: project system sidebar)
// ============================================================================

/**
 * Get all registered projects from Rust state.
 */
export async function getProjects(): Promise<ProjectEntry[]> {
  return await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Get the currently active project name.
 */
export async function getActiveProject(): Promise<string | null> {
  return await invoke<string | null>('get_active_project');
}

/**
 * Add a new project to the registry.
 */
export async function addProject(entry: ProjectEntry): Promise<void> {
  await invoke('add_project', { entry });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  projects.value = await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Update an existing project in the registry.
 */
export async function updateProject(name: string, entry: ProjectEntry): Promise<void> {
  await invoke('update_project', { name, entry });
  currentState = await invoke<AppState>('load_state');
  projects.value = await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Remove a project from the registry.
 */
export async function removeProject(name: string): Promise<void> {
  await invoke('remove_project', { name });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  projects.value = await invoke<ProjectEntry[]>('get_projects');
}

/**
 * Switch to a different project (updates state.json active field).
 * Updates activeProjectName signal and emits 'project-changed' custom event for backward compat.
 */
export async function switchProject(name: string): Promise<void> {
  await invoke('switch_project', { name });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  // Emit pre-switch event so listeners can save state under the OLD project name
  // BEFORE activeProjectName changes (fixes per-project server pane isolation)
  document.dispatchEvent(new CustomEvent('project-pre-switch', { detail: { oldName: activeProjectName.value, newName: name } }));
  activeProjectName.value = name;
  // Backward compat: main.js project-changed listener (will be removed in Plan 05)
  document.dispatchEvent(new CustomEvent('project-changed', { detail: { name } }));
}

/**
 * Get git status for a project directory.
 */
export async function getGitStatus(path: string): Promise<GitData> {
  return await invoke<GitData>('get_git_status', { path });
}
````

## File: src/tokens.ts
````typescript
/**
 * Design tokens for Phase 10 pixel-perfect rewrite
 * Source: RESEARCH/theme/tokens.ts
 *
 * This file is the canonical source of programmatic token values
 * consumed by components via inline style={{}} props.
 */

// ── Color Palette ──────────────────────────────────────────────
export const colors = {
  bgDeep: '#0B1120',
  bgBase: '#111927',
  bgElevated: '#19243A',
  bgBorder: '#243352',
  bgSurface: '#324568',
  accent: '#258AD1',
  accentMuted: '#258AD120',
  textPrimary: '#E6EDF3',
  textSecondary: '#C9D1D9',
  textMuted: '#8B949E',
  textDim: '#556A85',
  statusGreen: '#3FB950',
  statusGreenBg: '#3FB95020',
  statusGreenCheck: '#3FB95030',
  statusYellow: '#D29922',
  statusYellowBg: '#D2992220',
  statusMutedBg: '#8B949E20',
  diffRed: '#F85149',
  diffRedBg: '#F8514915',
  diffRedLineno: '#F8514980',
  diffGreenBg: '#3FB95015',
  diffGreenLineno: '#3FB95080',
  diffHunkBg: '#258AD108',
  agentGradientStart: '#A855F7',
  agentGradientEnd: '#6366F1',
} as const;

// ── Typography ─────────────────────────────────────────────────
export const fonts = {
  sans: 'Geist',
  // NOTE: 'GeistMono' (no space) matches @font-face name in app.css
  // The reference RESEARCH/theme/tokens.ts uses 'Geist Mono' (with space)
  // which would break fonts in the production app.
  mono: 'GeistMono',
} as const;

export const fontSizes = {
  xs: 9,
  sm: 10,
  md: 11,
  base: 12,
  lg: 13,
  xl: 15,
  '2xl': 20,
} as const;

// ── Spacing ────────────────────────────────────────────────────
export const spacing = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  '2xl': 10,
  '3xl': 12,
  '4xl': 16,
  '5xl': 20,
  '6xl': 28,
} as const;

// ── Radii ──────────────────────────────────────────────────────
export const radii = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
} as const;
````

## File: src/vite-env.d.ts
````typescript
/// <reference types="vite/client" />
````

## File: src-tauri/capabilities/default.json
````json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default"
  ]
}
````

## File: src-tauri/src/terminal/mod.rs
````rust
pub mod pty;
````

## File: src-tauri/src/theme/iterm2.rs
````rust
use serde_json::Value;
use std::fs;

use super::types::{ensure_config_dir, theme_path, ThemeConfig};

// ── iTerm2 color key -> theme.json terminal key mapping ─────────────────────

const ITERM2_TO_TERMINAL: &[(&str, &str)] = &[
    ("Foreground Color", "foreground"),
    ("Background Color", "background"),
    ("Cursor Color", "cursor"),
    ("Selection Color", "selectionBackground"),
    ("Ansi 0 Color", "black"),
    ("Ansi 1 Color", "red"),
    ("Ansi 2 Color", "green"),
    ("Ansi 3 Color", "yellow"),
    ("Ansi 4 Color", "blue"),
    ("Ansi 5 Color", "magenta"),
    ("Ansi 6 Color", "cyan"),
    ("Ansi 7 Color", "white"),
    ("Ansi 8 Color", "brightBlack"),
    ("Ansi 9 Color", "brightRed"),
    ("Ansi 10 Color", "brightGreen"),
    ("Ansi 11 Color", "brightYellow"),
    ("Ansi 12 Color", "brightBlue"),
    ("Ansi 13 Color", "brightMagenta"),
    ("Ansi 14 Color", "brightCyan"),
    ("Ansi 15 Color", "brightWhite"),
];

// ── Color conversion ────────────────────────────────────────────────────────

/// Convert an iTerm2 color object (float RGB 0.0-1.0) to a hex color string.
fn iterm2_color_to_hex(color: &Value) -> Option<String> {
    let r = (color.get("Red Component")?.as_f64()? * 255.0).round() as u8;
    let g = (color.get("Green Component")?.as_f64()? * 255.0).round() as u8;
    let b = (color.get("Blue Component")?.as_f64()? * 255.0).round() as u8;
    Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
}

// ── Tauri command ───────────────────────────────────────────────────────────

/// Import an iTerm2 JSON profile and convert its colors to theme.json format.
///
/// - Reads the iTerm2 profile JSON at the given path
/// - Maps all 16 ANSI colors + foreground/background/cursor/selection to theme fields
/// - Derives chrome colors from terminal colors (bg, accent, text, border)
/// - Backs up existing theme.json to theme.json.bak before overwriting
/// - Writes the new theme.json (hot-reload watcher picks it up automatically)
#[tauri::command]
pub fn import_iterm2_theme(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);

    // 1. Must be an absolute path
    if !p.is_absolute() {
        return Err("Path must be absolute".into());
    }

    // 2. Must have an expected extension
    match p.extension().and_then(|e| e.to_str()) {
        Some("json") | Some("itermcolors") => {}
        _ => return Err("File must be a .json or .itermcolors file".into()),
    }

    // 3. Resolve symlinks to prevent traversal
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Cannot resolve path: {}", e))?;

    // 4. Read and parse the iTerm2 profile JSON
    let content =
        fs::read_to_string(&canonical).map_err(|e| format!("Failed to read iTerm2 file: {}", e))?;
    let profile: Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid iTerm2 JSON: {}", e))?;

    // 2. Start with default theme (chrome + unmapped terminal colors get defaults)
    let mut theme = ThemeConfig::default();

    // 3. Convert each iTerm2 color key to the terminal theme field
    //    Serialize current terminal section to a mutable JSON value, patch it, deserialize back
    let mut terminal_map =
        serde_json::to_value(&theme.terminal).map_err(|e| format!("Serialization error: {}", e))?;

    for (iterm_key, theme_key) in ITERM2_TO_TERMINAL {
        if let Some(color_obj) = profile.get(iterm_key) {
            if let Some(hex) = iterm2_color_to_hex(color_obj) {
                terminal_map[theme_key] = Value::String(hex);
            }
        }
    }

    // Derive chrome colors from imported terminal colors
    if let Some(bg) = terminal_map.get("background").and_then(|v| v.as_str()) {
        theme.chrome.bg = bg.to_string();
    }
    if let Some(cursor) = terminal_map.get("cursor").and_then(|v| v.as_str()) {
        theme.chrome.accent = cursor.to_string();
    }
    if let Some(fg) = terminal_map.get("foreground").and_then(|v| v.as_str()) {
        theme.chrome.text_bright = fg.to_string();
    }
    if let Some(sel) = terminal_map
        .get("selectionBackground")
        .and_then(|v| v.as_str())
    {
        theme.chrome.border = sel.to_string();
    }

    // Deserialize the modified terminal map back into the struct
    theme.terminal = serde_json::from_value(terminal_map)
        .map_err(|e| format!("Terminal theme conversion error: {}", e))?;

    // 4. Backup existing theme.json before overwrite (T-03-07 mitigation)
    ensure_config_dir();
    let target = theme_path();
    if target.exists() {
        let backup = target.with_extension("json.bak");
        fs::copy(&target, &backup).map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // 5. Write new theme.json (hot-reload watcher picks it up automatically)
    let json =
        serde_json::to_string_pretty(&theme).map_err(|e| format!("Serialization error: {}", e))?;
    fs::write(&target, &json).map_err(|e| format!("Failed to write theme.json: {}", e))?;

    println!(
        "[efxmux] Imported iTerm2 theme from {}. Backup saved to theme.json.bak",
        path
    );
    Ok(format!("Theme imported from {}", path))
}
````

## File: src-tauri/src/theme/mod.rs
````rust
pub mod iterm2;
pub mod types;
pub mod watcher;
````

## File: src-tauri/src/theme/types.rs
````rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Chrome (app UI) theme ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromeTheme {
    #[serde(default = "default_chrome_bg")]
    pub bg: String,

    #[serde(default = "default_chrome_bg_raised", rename = "bgRaised")]
    pub bg_raised: String,

    #[serde(default = "default_chrome_border")]
    pub border: String,

    #[serde(default = "default_chrome_text")]
    pub text: String,

    #[serde(default = "default_chrome_text_bright", rename = "textBright")]
    pub text_bright: String,

    #[serde(default = "default_chrome_accent")]
    pub accent: String,

    #[serde(default = "default_chrome_font")]
    pub font: String,

    #[serde(default = "default_chrome_font_size", rename = "fontSize")]
    pub font_size: u32,

    #[serde(default = "default_chrome_file_tree_bg", rename = "fileTreeBg")]
    pub file_tree_bg: String,

    #[serde(default = "default_chrome_file_tree_font", rename = "fileTreeFont")]
    pub file_tree_font: String,

    #[serde(default = "default_chrome_file_tree_font_size", rename = "fileTreeFontSize")]
    pub file_tree_font_size: u32,

    #[serde(default = "default_chrome_file_tree_line_height", rename = "fileTreeLineHeight")]
    pub file_tree_line_height: u32,

    #[serde(default = "default_chrome_bg_terminal", rename = "bgTerminal")]
    pub bg_terminal: String,
}

// Chrome defaults (Solarized Dark)
fn default_chrome_bg() -> String { "#282d3a".into() }
fn default_chrome_bg_raised() -> String { "#19243A".into() }
fn default_chrome_border() -> String { "#3e454a".into() }
fn default_chrome_text() -> String { "#8d999a".into() }
fn default_chrome_text_bright() -> String { "#92a0a0".into() }
fn default_chrome_accent() -> String { "#258ad1".into() }
fn default_chrome_font() -> String { "FiraCode Light".into() }
fn default_chrome_font_size() -> u32 { 14 }
fn default_chrome_file_tree_bg() -> String { "#0B1120".into() }
fn default_chrome_file_tree_font() -> String { "Geist".into() }
fn default_chrome_file_tree_font_size() -> u32 { 13 }
fn default_chrome_file_tree_line_height() -> u32 { 5 }
fn default_chrome_bg_terminal() -> String { "#111927".into() }

impl Default for ChromeTheme {
    fn default() -> Self {
        Self {
            bg: default_chrome_bg(),
            bg_raised: default_chrome_bg_raised(),
            border: default_chrome_border(),
            text: default_chrome_text(),
            text_bright: default_chrome_text_bright(),
            accent: default_chrome_accent(),
            font: default_chrome_font(),
            font_size: default_chrome_font_size(),
            file_tree_bg: default_chrome_file_tree_bg(),
            file_tree_font: default_chrome_file_tree_font(),
            file_tree_font_size: default_chrome_file_tree_font_size(),
            file_tree_line_height: default_chrome_file_tree_line_height(),
            bg_terminal: default_chrome_bg_terminal(),
        }
    }
}

// ── Terminal theme (xterm.js ANSI colors) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalTheme {
    #[serde(default = "default_term_background")]
    pub background: String,

    #[serde(default = "default_term_foreground")]
    pub foreground: String,

    #[serde(default = "default_term_cursor")]
    pub cursor: String,

    #[serde(default = "default_term_selection_background", rename = "selectionBackground")]
    pub selection_background: String,

    #[serde(default = "default_term_black")]
    pub black: String,

    #[serde(default = "default_term_red")]
    pub red: String,

    #[serde(default = "default_term_green")]
    pub green: String,

    #[serde(default = "default_term_yellow")]
    pub yellow: String,

    #[serde(default = "default_term_blue")]
    pub blue: String,

    #[serde(default = "default_term_magenta")]
    pub magenta: String,

    #[serde(default = "default_term_cyan")]
    pub cyan: String,

    #[serde(default = "default_term_white")]
    pub white: String,

    #[serde(default = "default_term_bright_black", rename = "brightBlack")]
    pub bright_black: String,

    #[serde(default = "default_term_bright_red", rename = "brightRed")]
    pub bright_red: String,

    #[serde(default = "default_term_bright_green", rename = "brightGreen")]
    pub bright_green: String,

    #[serde(default = "default_term_bright_yellow", rename = "brightYellow")]
    pub bright_yellow: String,

    #[serde(default = "default_term_bright_blue", rename = "brightBlue")]
    pub bright_blue: String,

    #[serde(default = "default_term_bright_magenta", rename = "brightMagenta")]
    pub bright_magenta: String,

    #[serde(default = "default_term_bright_cyan", rename = "brightCyan")]
    pub bright_cyan: String,

    #[serde(default = "default_term_bright_white", rename = "brightWhite")]
    pub bright_white: String,
}

// Terminal defaults (Solarized Dark ANSI)
fn default_term_background() -> String { "#282d3a".into() }
fn default_term_foreground() -> String { "#92a0a0".into() }
fn default_term_cursor() -> String { "#258ad1".into() }
fn default_term_selection_background() -> String { "#3e454a".into() }
fn default_term_black() -> String { "#073642".into() }
fn default_term_red() -> String { "#dc322f".into() }
fn default_term_green() -> String { "#859900".into() }
fn default_term_yellow() -> String { "#b58900".into() }
fn default_term_blue() -> String { "#268bd2".into() }
fn default_term_magenta() -> String { "#d33682".into() }
fn default_term_cyan() -> String { "#2aa198".into() }
fn default_term_white() -> String { "#eee8d5".into() }
fn default_term_bright_black() -> String { "#002b36".into() }
fn default_term_bright_red() -> String { "#cb4b16".into() }
fn default_term_bright_green() -> String { "#586e75".into() }
fn default_term_bright_yellow() -> String { "#657b83".into() }
fn default_term_bright_blue() -> String { "#839496".into() }
fn default_term_bright_magenta() -> String { "#6c71c4".into() }
fn default_term_bright_cyan() -> String { "#93a1a1".into() }
fn default_term_bright_white() -> String { "#fdf6e3".into() }

impl Default for TerminalTheme {
    fn default() -> Self {
        Self {
            background: default_term_background(),
            foreground: default_term_foreground(),
            cursor: default_term_cursor(),
            selection_background: default_term_selection_background(),
            black: default_term_black(),
            red: default_term_red(),
            green: default_term_green(),
            yellow: default_term_yellow(),
            blue: default_term_blue(),
            magenta: default_term_magenta(),
            cyan: default_term_cyan(),
            white: default_term_white(),
            bright_black: default_term_bright_black(),
            bright_red: default_term_bright_red(),
            bright_green: default_term_bright_green(),
            bright_yellow: default_term_bright_yellow(),
            bright_blue: default_term_bright_blue(),
            bright_magenta: default_term_bright_magenta(),
            bright_cyan: default_term_bright_cyan(),
            bright_white: default_term_bright_white(),
        }
    }
}

// ── Top-level theme config ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    #[serde(default)]
    pub chrome: ChromeTheme,

    #[serde(default)]
    pub terminal: TerminalTheme,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            chrome: ChromeTheme::default(),
            terminal: TerminalTheme::default(),
        }
    }
}

// ── Path helpers ─────────────────────────────────────────────────────────────

pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| {
            eprintln!("[efxmux] WARNING: HOME not set; using /tmp/efx-mux-fallback for config");
            "/tmp/efx-mux-fallback".to_string()
        });
    PathBuf::from(home).join(".config/efx-mux")
}

pub fn theme_path() -> PathBuf {
    config_dir().join("theme.json")
}

pub fn ensure_config_dir() {
    let dir = config_dir();
    if !dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("[efxmux] Failed to create config dir {:?}: {}", dir, e);
        }
    }
}

// ── Load / create ────────────────────────────────────────────────────────────

pub fn load_or_create_theme() -> ThemeConfig {
    ensure_config_dir();

    let path = theme_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<ThemeConfig>(&content) {
                Ok(theme) => return theme,
                Err(err) => {
                    eprintln!(
                        "[efxmux] Invalid theme.json: {}. Using defaults.",
                        err
                    );
                }
            },
            Err(err) => {
                eprintln!("[efxmux] Failed to read theme.json: {}. Using defaults.", err);
            }
        }
    } else {
        // First launch: write defaults
        let defaults = ThemeConfig::default();
        match serde_json::to_string_pretty(&defaults) {
            Ok(json) => {
                if let Err(e) = std::fs::write(&path, &json) {
                    eprintln!("[efxmux] Failed to write default theme.json: {}", e);
                }
            }
            Err(e) => {
                eprintln!("[efxmux] Failed to serialize default theme: {}", e);
            }
        }
    }

    ThemeConfig::default()
}

// ── Tauri command ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn load_theme() -> ThemeConfig {
    load_or_create_theme()
}
````

## File: src-tauri/src/main.rs
````rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gsd_mux_lib::run()
}
````

## File: src-tauri/src/project.rs
````rust
//! Project registry commands

use crate::state::{save_state_sync, ManagedAppState, ProjectEntry};
use tauri::State;

#[tauri::command]
pub async fn add_project(
    state: State<'_, ManagedAppState>,
    entry: ProjectEntry,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        // Prevent duplicate project names
        if guard.project.projects.iter().any(|p| p.name == entry.name) {
            return Err(format!("Project '{}' already exists", entry.name));
        }
        guard.project.projects.push(entry);
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn remove_project(
    state: State<'_, ManagedAppState>,
    name: String,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.project.projects.retain(|p| p.name != name);
        if guard.project.active.as_ref() == Some(&name) {
            guard.project.active = None;
        }
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn switch_project(
    state: State<'_, ManagedAppState>,
    name: String,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if !guard.project.projects.iter().any(|p| p.name == name) {
            return Err(format!("Project '{}' not found", name));
        }
        guard.project.active = Some(name);
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, ManagedAppState>,
    name: String,
    entry: ProjectEntry,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        let new_name = entry.name.clone();
        if let Some(existing) = guard.project.projects.iter_mut().find(|p| p.name == name) {
            existing.path = entry.path;
            existing.name = entry.name;
            existing.agent = entry.agent;
            existing.gsd_file = entry.gsd_file;
            existing.server_cmd = entry.server_cmd;
            existing.server_url = entry.server_url;
        } else {
            return Err(format!("Project '{}' not found", name));
        }
        // Update active name if it was renamed
        if guard.project.active.as_ref() == Some(&name) && name != new_name {
            guard.project.active = Some(new_name);
        }
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn get_projects(
    state: State<'_, ManagedAppState>,
) -> Result<Vec<ProjectEntry>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.project.projects.clone())
}

#[tauri::command]
pub async fn get_active_project(
    state: State<'_, ManagedAppState>,
) -> Result<Option<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.project.active.clone())
}
````

## File: src-tauri/src/server.rs
````rust
use std::collections::HashMap;
use std::io::BufRead;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// Per-project server entry storing the child process and its PID.
pub struct ServerEntry {
    pub child: std::process::Child,
    pub pid: u32,
}

/// Tauri-managed wrapper for per-project server processes.
/// Key = project name (String), Value = ServerEntry.
pub struct ServerProcesses(pub Mutex<HashMap<String, ServerEntry>>);

/// Start a server process for a specific project, streaming stdout/stderr to the frontend via events.
/// Kills any existing server process for that project first.
#[tauri::command]
pub async fn start_server(
    cmd: String,
    cwd: String,
    project_id: String,
    app: AppHandle,
) -> Result<(), String> {
    // Validate cwd exists and is a directory (T-07-02 mitigation)
    let cwd_path = std::path::Path::new(&cwd);
    if !cwd_path.exists() || !cwd_path.is_dir() {
        return Err(format!("Working directory '{}' does not exist or is not a directory", cwd));
    }

    // Kill existing server process for this project first
    stop_server_for_project(&app, &project_id)?;

    // Spawn the server process in its own process group
    // FORCE_COLOR=1: piped stdout is not a TTY, so most tools (Node/chalk/npm)
    // disable ANSI colors. This env var re-enables them.
    let mut child = Command::new("sh")
        .args(["-c", &cmd])
        .current_dir(&cwd)
        .env("FORCE_COLOR", "1")
        .env("CLICOLOR_FORCE", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    // Take stdout and stderr before storing child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();

    // Store child in managed state under project_id
    {
        let sp = app.state::<ServerProcesses>();
        let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
        guard.insert(project_id.clone(), ServerEntry { child, pid });
    }

    // 07-05: EOF-based process exit detection instead of premature waitpid.
    let reader_count = Arc::new(AtomicU8::new(
        (stdout.is_some() as u8) + (stderr.is_some() as u8),
    ));

    // Guard: if no readers at all, emit stopped immediately
    if reader_count.load(Ordering::SeqCst) == 0 {
        let payload = serde_json::json!({ "project": project_id, "code": 0 });
        let _ = app.emit("server-stopped", payload);
        return Ok(());
    }

    // Spawn stdout reader thread (line-buffered to preserve ANSI sequences)
    if let Some(stdout) = stdout {
        let app_clone = app.clone();
        let count = reader_count.clone();
        let pid_for_wait = pid;
        let project_id_clone = project_id.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let text = text + "\n"; // Restore newline stripped by lines()
                        let payload = serde_json::json!({ "project": project_id_clone, "text": text });
                        let _ = app_clone.emit("server-output", payload);
                    }
                    Err(_) => break,
                }
            }
            // Last reader to finish emits server-stopped
            if count.fetch_sub(1, Ordering::SeqCst) == 1 {
                let mut status: libc::c_int = 0;
                let result =
                    unsafe { libc::waitpid(pid_for_wait as i32, &mut status, libc::WNOHANG) };
                let exit_code = if result > 0 && libc::WIFEXITED(status) {
                    libc::WEXITSTATUS(status)
                } else {
                    0 // Pipes closed, process exited normally
                };
                let payload = serde_json::json!({ "project": project_id_clone, "code": exit_code });
                let _ = app_clone.emit("server-stopped", payload);
                // Only remove entry if PID matches — prevents restart from orphaning the new process
                if let Ok(mut guard) = app_clone.state::<ServerProcesses>().0.lock() {
                    if let Some(entry) = guard.get(&project_id_clone) {
                        if entry.pid == pid_for_wait as u32 {
                            guard.remove(&project_id_clone);
                        }
                    }
                }
            }
        });
    }

    // Spawn stderr reader thread (line-buffered, same EOF pattern)
    if let Some(stderr) = stderr {
        let app_clone = app.clone();
        let count = reader_count.clone();
        let pid_for_wait = pid;
        let project_id_clone = project_id.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let text = text + "\n"; // Restore newline stripped by lines()
                        let payload = serde_json::json!({ "project": project_id_clone, "text": text });
                        let _ = app_clone.emit("server-output", payload);
                    }
                    Err(_) => break,
                }
            }
            if count.fetch_sub(1, Ordering::SeqCst) == 1 {
                let mut status: libc::c_int = 0;
                let result =
                    unsafe { libc::waitpid(pid_for_wait as i32, &mut status, libc::WNOHANG) };
                let exit_code = if result > 0 && libc::WIFEXITED(status) {
                    libc::WEXITSTATUS(status)
                } else {
                    0
                };
                let payload = serde_json::json!({ "project": project_id_clone, "code": exit_code });
                let _ = app_clone.emit("server-stopped", payload);
                // Only remove entry if PID matches — prevents restart from orphaning the new process
                if let Ok(mut guard) = app_clone.state::<ServerProcesses>().0.lock() {
                    if let Some(entry) = guard.get(&project_id_clone) {
                        if entry.pid == pid_for_wait as u32 {
                            guard.remove(&project_id_clone);
                        }
                    }
                }
            }
        });
    }

    Ok(())
}

/// Stop the running server process for a specific project.
#[tauri::command]
pub async fn stop_server(project_id: String, app: AppHandle) -> Result<(), String> {
    stop_server_for_project(&app, &project_id)
}

/// Restart the server for a specific project: stop existing, emit restart marker, start new.
#[tauri::command]
pub async fn restart_server(
    cmd: String,
    cwd: String,
    project_id: String,
    app: AppHandle,
) -> Result<(), String> {
    stop_server_for_project(&app, &project_id)?;
    let payload = serde_json::json!({ "project": project_id, "text": "[server] --- Restarting ---\n" });
    let _ = app.emit("server-output", payload);
    start_server(cmd, cwd, project_id, app).await
}

/// Detect whether an agent binary exists in PATH.
#[tauri::command]
pub fn detect_agent(agent: String) -> Result<String, String> {
    if agent.is_empty() || agent == "bash" {
        return Ok("bash".to_string());
    }
    let output = Command::new("which")
        .arg(&agent)
        .output()
        .map_err(|e| format!("Failed to run which: {}", e))?;
    if output.status.success() {
        Ok(agent)
    } else {
        Err(format!("Binary '{}' not found in PATH", agent))
    }
}

/// Kill the server process for a specific project (SIGTERM + SIGKILL fallback).
fn stop_server_for_project(app: &AppHandle, project_id: &str) -> Result<(), String> {
    let sp = app.state::<ServerProcesses>();
    let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
    if let Some(entry) = guard.remove(project_id) {
        let pid = entry.pid as i32;
        // Send SIGTERM to the entire process group
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }
        // Reap the process in a background thread to prevent zombies
        std::thread::spawn(move || {
            let mut status: libc::c_int = 0;
            // Wait up to 3 seconds for graceful shutdown
            for _ in 0..30 {
                let result = unsafe { libc::waitpid(pid, &mut status, libc::WNOHANG) };
                if result != 0 {
                    return; // Process reaped (either exited or error)
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            // SIGKILL if still alive after 3 seconds
            unsafe {
                libc::killpg(pid, libc::SIGKILL);
            }
            // Final waitpid to reap after SIGKILL
            unsafe {
                libc::waitpid(pid, &mut status, 0);
            }
        });
    }
    Ok(())
}

/// Kill ALL running server processes across all projects.
/// Used by close handler — must be synchronous since the app exits immediately after.
/// Sends SIGTERM then SIGKILL to each process group without spawning background threads.
pub fn kill_all_servers(app: &AppHandle) {
    let pids: Vec<u32> = {
        let sp = app.state::<ServerProcesses>();
        let Ok(mut guard) = sp.0.lock() else { return };
        guard.drain().map(|(_, entry)| entry.pid).collect()
    };
    for &pid in &pids {
        let pid = pid as i32;
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }
    }
    // Brief pause to let processes handle SIGTERM
    std::thread::sleep(std::time::Duration::from_millis(200));
    // SIGKILL anything still alive — synchronous, no background threads
    for &pid in &pids {
        let pid = pid as i32;
        let mut status: libc::c_int = 0;
        let result = unsafe { libc::waitpid(pid, &mut status, libc::WNOHANG) };
        if result == 0 {
            // Still alive — force kill
            unsafe {
                libc::killpg(pid, libc::SIGKILL);
                libc::waitpid(pid, &mut status, 0);
            }
        }
    }
}
````

## File: src-tauri/.gitignore
````
# Generated by Cargo
# will have compiled files and executables
/target/

# Generated by Tauri
# will have schema files for capabilities auto-completion
/gen/schemas
````

## File: src-tauri/build.rs
````rust
fn main() {
    tauri_build::build()
}
````

## File: src-tauri/Entitlements.plist
````
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- sandbox=false: PTY spawning (Phase 2) is incompatible with App Sandbox.
       This intentionally prevents Mac App Store distribution (see REQUIREMENTS.md). -->
  <key>com.apple.security.app-sandbox</key>
  <false/>

  <!-- network.client: required for Phase 7 agent network calls and open-in-browser -->
  <key>com.apple.security.network.client</key>
  <true/>

  <!-- files.user-selected.read-write: required for Phase 5/6 project file access -->
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>

  <!-- files.downloads.read-write: required for Phase 6 file tree operations -->
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
</dict>
</plist>
````

## File: CLAUDE.md
````markdown
Please find GSD tools from `.claude/get-shit-done` and not from `$HOME/.claude/get-shit-done`
Please do not run the server, I do on my side

<!-- GSD:project-start source:PROJECT.md -->
## Project

**GSD⚡MUX**

A native macOS desktop application that wraps Claude Code and OpenCode terminal sessions in a structured, multi-panel workspace. The goal is to give AI-assisted developers a single window that co-locates: the AI agent terminal, a live GSD progress viewer (Markdown with write-back), git diff, and a file tree — all around a real terminal that runs the original CLI binaries without any modification or hacking.

**Core Value:** Developers using Claude Code or OpenCode lose context switching between the terminal, their editor, and their planning docs. GSD⚡MUX collapses all of that into one native window with a terminal-first aesthetic — dark, fast, keyboard-driven.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Tauri 2
### Key APIs used
#[tauri::command]
### Core Rust dependencies (Cargo.toml)
### Gotchas
- The `@tauri-apps/api` JS package version must match the Tauri core version. Pin to `^2.0.0` and let npm resolve the correct minor.
- `invoke` import changed between Tauri 1 and 2: it is now `@tauri-apps/api/core`, not `@tauri-apps/api/tauri`.
- `listen` is now `@tauri-apps/api/event`, same path as v1 but the module restructure means other v1 imports will break.
- Tauri 2 migrated most plugins (shell, fs, store, etc.) out of core into separate `tauri-plugin-*` crates. Each needs explicit `cargo add` and frontend npm package.
- Multiple webview panels (native split via `Window::add_child`) are not production-ready as of 2.10.x. Use a single webview with CSS flexbox panels.
## xterm.js
### Version recommendation: USE 5.5.0, NOT 6.0.0
### WebGL addon in Tauri (WKWebView on macOS)
- WKWebView uses WebKit, the same engine as Safari. WebGL2 is supported in Safari 15+ / macOS Monterey+. Evidence from Tauri community confirms WebGL2 reports as "WebGL 2.0 / WebKit WebGL" in WKWebView on macOS Sonoma.
- Performance is slightly worse in WKWebView than in Safari browser itself (frame pacing differences), but it works.
- Historical WebGL texture rendering issues in Safari (2021 issue #3357) were fixed via PR #4255 and subsequent xterm.js releases.
- The xterm.js WebGL addon falls back gracefully: if WebGL context is lost (e.g., memory pressure, suspend), listen to `onContextLoss()` and dispose + fall back to DOM renderer.
- The canvas addon (`@xterm/addon-canvas`) was removed in 6.0.0. Do not use it.
### Required addons
| Package | Version | Purpose |
|---------|---------|---------|
| `@xterm/xterm` | 6.0.0 | Core terminal emulator |
| `@xterm/addon-webgl` | 0.19.0 | GPU-accelerated WebGL2 renderer |
| `@xterm/addon-fit` | 0.11.0 | Fit terminal to container element size |
| `@xterm/addon-web-links` | 0.12.0 | Clickable URLs in terminal output |
### Setup pattern
### xterm.js 6.0 breaking changes (vs 5.x)
- `@xterm/addon-canvas` no longer exists. Do not import it.
- `ITerminalOptions.overviewRulerWidth` moved to `ITerminalOptions.overviewRuler.width`.
- `windowsMode` and `fastScrollModifier` removed from `ITerminalOptions`.
- Alt key → ctrl+arrow hack removed; must handle custom keybindings explicitly.
- Scrollbar implementation changed (VS Code integration); custom CSS for scrollbar styling may need updating.
## portable-pty
### Tauri integration pattern
#[tauri::command]
### Key API types
| Type | Purpose |
|------|---------|
| `native_pty_system()` | Returns platform-native PTY system (Unix PTY on macOS) |
| `PtySize { rows, cols, pixel_width, pixel_height }` | Terminal dimensions |
| `PtyPair { master, slave }` | Created by `openpty()` |
| `pair.master.try_clone_reader()` | Returns `Box<dyn Read>` for PTY output |
| `pair.master.take_writer()` | Returns `Box<dyn Write>` for PTY input |
| `pair.slave.spawn_command(cmd)` | Spawns process in PTY, returns `Box<dyn Child>` |
| `MasterPty::resize(PtySize)` | Resize PTY (call when terminal is resized) |
### Gotchas
- `take_writer()` is a one-shot — call once and keep the handle. Store in `Arc<Mutex<Box<dyn Write>>>` for multi-command access.
- The slave must stay open until the child exits. Keep `pair.slave` alive.
- PTY resize must flow both ways: xterm.js `onResize` event → `invoke('resize_pty', { cols, rows })` → `pair.master.resize(PtySize {...})`.
- portable-pty 0.9.0 is considered stable but has not had a release in ~1 year. Wezterm is the upstream consumer and is actively maintained, so the crate is unlikely to be abandoned, but check for maintenance signals before Phase 1.
## tmux integration
### Required tmux operations
| Operation | Command |
|-----------|---------|
| Create/attach session | `tmux new-session -A -s {name} -d` |
| List sessions | `tmux list-sessions -F "#{session_name}"` |
| Attach to existing | Spawn PTY with `tmux attach-session -t {name}` |
| Rename session | `tmux rename-session -t {old} {new}` |
| Kill session | `tmux kill-session -t {name}` |
| Resize window | `tmux resize-window -t {name} -x {cols} -y {rows}` |
### Pattern
### tmux control mode (alternative for read-only operations)
### Gotchas
- Ensure tmux is in PATH at runtime. Add a startup check: `which tmux` or `Command::new("tmux").arg("-V")`.
- tmux session names must be unique and filesystem-safe. Use project directory basename.
- Do not assume tmux version. Some features (e.g., control mode improvements) require tmux 3.x. Run `tmux -V` and parse at startup.
## git2
### Key methods for status/diff
### Gotchas
- git2 compiles libgit2 from source — first build is slow. Ensure `cmake` and a C toolchain are installed (Xcode CLI tools on macOS cover this).
- Run all git2 operations on a Tokio `spawn_blocking` thread — libgit2 is synchronous and will block the async runtime.
- git2 does not pick up system `~/.gitconfig` SSH keys automatically for fetch/push. For read-only status/diff (what this project needs), this is not a problem.
- `Repository::open` scans up the directory tree to find `.git`. Pass the explicit project root, not a subdirectory.
## notify (file watching)
## marked.js (Markdown renderer)
- Override the `checkbox` renderer to emit `<input type="checkbox" data-line="N">`.
- On change event, `invoke('write_checkbox', { path, line, checked })` → Tauri command modifies the .md file at the correct line.
## Version Matrix
| Package | Recommended Version | Source | Confidence |
|---------|---------------------|--------|------------|
| tauri (Rust) | 2.10.3 | docs.rs confirmed | HIGH |
| @tauri-apps/api (JS) | ^2.0.0 | matches tauri core | HIGH |
| @xterm/xterm | 6.0.0 | GitHub releases confirmed | HIGH |
| @xterm/addon-webgl | 0.19.0 | npm confirmed | HIGH |
| @xterm/addon-fit | 0.11.0 | npm confirmed | HIGH |
| @xterm/addon-web-links | 0.12.0 | npm confirmed | HIGH |
| portable-pty (Rust) | 0.9.0 | docs.rs confirmed | HIGH |
| git2 (Rust) | 0.20.4 | docs.rs confirmed | HIGH |
| notify (Rust) | 8.2.0 | crates.io confirmed | HIGH |
| serde / serde_json | 1.x | Tauri internals confirmed | HIGH |
| tokio | 1.x | Tauri internals confirmed | HIGH |
| marked (JS) | ^14.0.0 | — | MEDIUM |
| tmux (system) | 3.x minimum | convention | MEDIUM |
## Critical Integration Notes
## Sources
- Tauri 2 current version: https://docs.rs/crate/tauri/latest/source/Cargo.toml.orig
- Tauri invoke API: https://v2.tauri.app/develop/calling-rust/
- Tauri emit/listen/Channel API: https://v2.tauri.app/develop/calling-frontend/
- xterm.js releases: https://github.com/xtermjs/xterm.js/releases
- xterm.js 6.0.0 release notes: https://github.com/xtermjs/xterm.js/releases/tag/6.0.0
- @xterm/addon-webgl npm: https://www.npmjs.com/package/@xterm/addon-webgl
- WebGL in WKWebView (Babylon.js forum): https://forum.babylonjs.com/t/performance-between-safari-and-wkwebview-tauri/60811
- portable-pty docs.rs: https://docs.rs/portable-pty/latest/portable_pty/
- git2 docs.rs: https://docs.rs/git2/latest/git2/
- notify crates.io: https://crates.io/crates/notify
- tauri-plugin-pty: https://github.com/Tnze/tauri-plugin-pty
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
````

## File: index.html
````html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Efxmux</title>
</head>
<body style="background-color: #282d3a; color: #92a0a0;">
  <div id="app"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
````

## File: pnpm-workspace.yaml
````yaml
approveBuildsForPackages: esbuild

onlyBuiltDependencies: esbuild
````

## File: vite.config.ts
````typescript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'safari16',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
````

## File: src/components/diff-viewer.tsx
````typescript
// diff-viewer.tsx -- GitHub-style git diff viewer (D-04, D-05, D-11)
// Listens for open-diff CustomEvent from sidebar and renders per-file diffs.
// Restyled to GitHub-style with file headers, line numbers, colored accents (Phase 9)
// Rewritten with tokens.ts colors (Phase 10)

import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';

/**
 * Escape HTML special characters to prevent XSS in diff output.
 */
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extract the filename from a file path.
 */
function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Render a unified diff string into GitHub-style HTML with file headers,
 * line numbers, colored borders, and hunk separators.
 */
function renderDiffHtml(diff: string, filePath?: string): string {
  if (!diff || !diff.trim()) {
    return `<div style="color: ${colors.textMuted}; padding: 16px;">No changes detected</div>`;
  }

  const lines = diff.split('\n');
  let addCount = 0;
  let delCount = 0;
  let oldLineNo = 0;
  let newLineNo = 0;
  const bodyLines: string[] = [];

  for (const line of lines) {
    // Skip empty trailing line from split
    if (line === '' && bodyLines.length > 0) continue;

    if (line.startsWith('@@')) {
      // Parse hunk header for line numbers: @@ -old,count +new,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNo = parseInt(match[1], 10);
        newLineNo = parseInt(match[2], 10);
      }
      const escaped = escapeHtml(line);
      bodyLines.push(
        `<div style="background-color: ${colors.diffHunkBg}; padding: 1px 7px 4px;">
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.accent};">${escaped}</span>
        </div>`
      );
    } else if (line.startsWith('+')) {
      addCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="background-color: ${colors.diffGreenBg}; border-left: 3px solid ${colors.statusGreen}; padding: 4px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.diffGreenLineno}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${newLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.statusGreen}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      newLineNo++;
    } else if (line.startsWith('-')) {
      delCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="background-color: ${colors.diffRedBg}; border-left: 3px solid ${colors.diffRed}; padding: 4px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.diffRedLineno}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${oldLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.diffRed}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      oldLineNo++;
    } else if (line.startsWith(' ')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="padding: 4px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.textDim}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${newLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.textMuted}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      oldLineNo++;
      newLineNo++;
    }
    // Skip any other lines (diff --git, index, ---, +++ headers are not sent by backend)
  }

  // File header bar
  const fileName = filePath ? basename(filePath) : 'unknown';
  const header = `<div style="background-color: ${colors.bgBase}; padding: 1px 7px 4px; gap: 8px; border-bottom: 1px solid ${colors.bgBorder}; display: flex; align-items: center;">
    <span style="width: 16px; height: 16px; border-radius: 3px; background-color: ${colors.statusYellowBg}; display: flex; align-items: center; justify-content: center;">
      <span style="font-family: ${fonts.mono}; font-size: 9px; font-weight: 600; color: ${colors.statusYellow};">M</span>
    </span>
    <span style="font-family: ${fonts.mono}; font-size: 14px; font-weight: 500; color: ${colors.textPrimary}; flex: 1;">${escapeHtml(fileName)}</span>
    <span style="font-family: ${fonts.mono}; font-size: 12px; font-weight: 600; color: ${colors.statusGreen};">+${addCount}</span>
    <span style="gap: 8px;"></span>
    <span style="font-family: ${fonts.mono}; font-size: 12px; font-weight: 600; color: ${colors.diffRed};">-${delCount}</span>
  </div>`;

  // Diff body container
  const body = `<div style="padding: 8px 0; font-family: ${fonts.mono}; font-size: 14px;">${bodyLines.join('')}</div>`;

  return header + body;
}

/**
 * DiffViewer component.
 * Renders git diff output with GitHub-style syntax highlighting.
 * Listens for open-diff CustomEvent dispatched by sidebar when a file is clicked.
 */
export function DiffViewer() {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDiff(filePath: string) {
      const el = contentRef.current;
      if (!el) return;
      el.innerHTML = `<div style="color: ${colors.textMuted}; padding: 16px;">Loading diff...</div>`;

      try {
        const diff = await invoke<string>('get_file_diff', { path: filePath });
        el.innerHTML = renderDiffHtml(diff, filePath);
      } catch (err) {
        el.innerHTML = `<div style="color: ${colors.diffRed}; padding: 16px;">Error loading diff: ${escapeHtml(String(err))}</div>`;
      }
    }

    function handleOpenDiff(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.path) {
        loadDiff(detail.path);
      }
    }

    document.addEventListener('open-diff', handleOpenDiff);
    return () => {
      document.removeEventListener('open-diff', handleOpenDiff);
    };
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 2px', fontFamily: fonts.mono, fontSize: 14, lineHeight: 1.5 }}>
      <div ref={contentRef}>
        <div style={{ color: colors.textMuted }}>Click a file in the sidebar to view its diff</div>
      </div>
    </div>
  );
}
````

## File: src/components/fuzzy-search.tsx
````typescript
// fuzzy-search.tsx -- Ctrl+P fuzzy project search overlay

import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { getProjects, switchProject, getGitStatus } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level signals
// ---------------------------------------------------------------------------

const visible = signal(false);
const query = signal('');
const selectedIndex = signal(0);
const fuzzyProjects = signal<ProjectEntry[]>([]);
const gitBranches = signal<Record<string, string>>({});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fuzzy match: case-insensitive substring search */
function fuzzyMatch(projects: ProjectEntry[], q: string): ProjectEntry[] {
  if (!q.trim()) return projects;
  const lower = q.toLowerCase();
  return projects.filter(p => p.name.toLowerCase().includes(lower));
}

function openSearch() {
  visible.value = true;
  query.value = '';
  selectedIndex.value = 0;
  loadProjects();
}

function closeSearch() {
  visible.value = false;
  query.value = '';
  selectedIndex.value = 0;
}

async function loadProjects() {
  try {
    const projects = await getProjects();
    fuzzyProjects.value = projects;
    // Fetch git branches in parallel
    const branches = await Promise.allSettled(
      projects.map(async (p) => {
        try {
          const status = await getGitStatus(p.path);
          return { name: p.name, branch: status.branch };
        } catch {
          return { name: p.name, branch: '' };
        }
      })
    );
    const newBranches: Record<string, string> = {};
    for (const r of branches) {
      if (r.status === 'fulfilled') {
        newBranches[r.value.name] = r.value.branch;
      }
    }
    gitBranches.value = newBranches;
  } catch (err) {
    console.warn('[efxmux] Fuzzy search: failed to load projects:', err);
  }
}

async function selectCurrent() {
  const results = fuzzyMatch(fuzzyProjects.value, query.value);
  if (results.length === 0) return;
  const project = results[selectedIndex.value];
  if (!project) return;
  try {
    await switchProject(project.name);
  } catch (err) {
    console.warn('[efxmux] Fuzzy search: failed to switch project:', err);
  }
  closeSearch();
}

// ---------------------------------------------------------------------------
// Global Ctrl+P handler (module-scope -- always active)
// ---------------------------------------------------------------------------

function handleGlobalKeydown(e: KeyboardEvent) {
  if (!visible.value) return;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeSearch();
      break;
    case 'ArrowDown':
      e.preventDefault();
      {
        const results = fuzzyMatch(fuzzyProjects.value, query.value);
        selectedIndex.value = Math.min(selectedIndex.value + 1, results.length - 1);
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      break;
    case 'Enter':
      e.preventDefault();
      selectCurrent();
      break;
  }
}

document.addEventListener('keydown', handleGlobalKeydown);

// Also listen for open-fuzzy-search events from main.js
document.addEventListener('open-fuzzy-search', openSearch);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SearchResult({ project, index }: { project: ProjectEntry; index: number }) {
  const isSelected = selectedIndex.value === index;
  const branch = gitBranches.value[project.name] || '';

  return (
    <div
      class="flex items-center px-4 py-2 text-sm cursor-pointer min-h-[36px]"
      style={{
        color: colors.textPrimary,
        backgroundColor: isSelected ? colors.accentMuted : 'transparent',
      }}
      data-index={index}
      onClick={() => {
        selectedIndex.value = index;
        selectCurrent();
      }}
      onMouseEnter={() => { selectedIndex.value = index; }}
    >
      <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {project.name}
      </span>
      {branch && (
        <span class="text-[11px] ml-4 shrink-0" style={{ color: colors.accent }}>
          {branch}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FuzzySearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when visible
  useEffect(() => {
    if (visible.value && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible.value]);

  if (!visible.value) return null;

  const results = fuzzyMatch(fuzzyProjects.value, query.value);

  return (
    <div
      class="fixed inset-0 z-[100] flex flex-col items-center pt-[20vh] animate-[fadeInSearch_100ms_ease-out]"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={closeSearch}
    >
      <div
        class="w-[480px] max-h-[60vh] rounded shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[101] overflow-hidden flex flex-col animate-[fadeInSearch_100ms_ease-out]"
        style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}` }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Search input */}
        <div class="flex items-center px-4 py-3" style={{ borderBottom: `1px solid ${colors.bgBorder}` }}>
          <span class="mr-2 text-base" style={{ color: colors.accent }}>{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Switch to project..."
            class="flex-1 border-none outline-none text-base"
            style={{ backgroundColor: 'transparent', color: colors.textPrimary, caretColor: colors.accent }}
            value={query.value}
            onInput={(e) => {
              query.value = (e.target as HTMLInputElement).value;
              selectedIndex.value = 0;
            }}
          />
        </div>

        {/* Results */}
        <div class="overflow-y-auto max-h-[360px]">
          {results.length === 0 ? (
            <div class="p-4 text-sm text-center" style={{ color: colors.textMuted }}>
              No matching projects
            </div>
          ) : (
            results.map((p, i) => (
              <SearchResult project={p} index={i} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
````

## File: src/components/preferences-panel.tsx
````typescript
// preferences-panel.tsx -- Ctrl+, preferences panel overlay (UX-01)
// Restyled to navy-blue palette with reference PreferencesPanel pattern (Phase 10)

import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { signal } from '@preact/signals';
import { activeProjectName, projects, updateLayout } from '../state-manager';
import { openProjectModal } from './project-modal';
import { fileTreeFontSize, fileTreeLineHeight, fileTreeBgColor } from './file-tree';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const visible = signal(false);

export function togglePreferences() {
  visible.value = !visible.value;
}

export function closePreferences() {
  visible.value = false;
}

// ---------------------------------------------------------------------------
// Visual primitives (matching reference PreferencesPanel)
// ---------------------------------------------------------------------------

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: '16px 24px 4px 24px' }}>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          color: colors.textDim,
          letterSpacing: '1.5px',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SettingRow({
  label,
  children,
  border = true,
}: {
  label: string;
  children: ComponentChildren;
  border?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        borderBottom: border ? '1px solid #1B202880' : 'none',
      }}
    >
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: colors.textMuted,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function KbdKey({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.textMuted,
        backgroundColor: colors.bgBase,
        border: `1px solid ${colors.bgSurface}`,
        borderRadius: 4,
        padding: '3px 8px',
      }}
    >
      {label}
    </span>
  );
}

function AgentBadge({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: 'linear-gradient(180deg, #A855F7 0%, #6366F1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.sans,
            color: 'white',
            fontSize: 7,
          }}
        >
          {'\u25C6'}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: 500,
          color: colors.textPrimary,
        }}
      >
        {name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreferencesPanel() {
  useEffect(() => {
    if (!visible.value) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePreferences();
      }
    }

    document.addEventListener('keydown', handleKeydown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeydown, { capture: true });
  }, [visible.value]);

  if (!visible.value) return null;

  const name = activeProjectName.value;
  const activeProject = name ? projects.value.find(p => p.name === name) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={closePreferences}
    >
      <div
        style={{
          width: 520,
          maxHeight: '70vh',
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgSurface}`,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px 24px',
            borderBottom: `1px solid ${colors.bgBorder}`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: 16,
              fontWeight: 600,
              color: colors.textPrimary,
            }}
          >
            Preferences
          </span>
          <button
            onClick={closePreferences}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${colors.bgSurface}`,
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Close preferences"
          >
            <span
              style={{
                fontFamily: fonts.sans,
                color: colors.textMuted,
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              {'\u2715'}
            </span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 0' }}>
          {/* Current Project */}
          <SectionLabel label="CURRENT PROJECT" />
          <SettingRow label="Name">
            <span
              style={{
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 500,
                color: colors.textPrimary,
              }}
            >
              {name ?? 'None'}
            </span>
          </SettingRow>
          <SettingRow label="Path">
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: colors.textMuted,
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={activeProject?.path ?? ''}
            >
              {activeProject?.path ?? 'N/A'}
            </span>
          </SettingRow>
          <SettingRow label="Agent">
            <AgentBadge name="Claude Code" />
          </SettingRow>

          {/* File Tree Controls */}
          <SectionLabel label="FILE TREE" />
          <SettingRow label="Font size">
            <input
              type="range"
              min="10"
              max="20"
              value={fileTreeFontSize.value}
              onInput={(e) => {
                fileTreeFontSize.value = parseInt((e.target as HTMLInputElement).value);
                updateLayout({ 'file-tree-font-size': String(fileTreeFontSize.value) });
              }}
              style={{ width: 80, accentColor: colors.accent }}
            />
          </SettingRow>
          <SettingRow label="Line height">
            <input
              type="range"
              min="2"
              max="12"
              value={fileTreeLineHeight.value}
              onInput={(e) => {
                fileTreeLineHeight.value = parseInt((e.target as HTMLInputElement).value);
                updateLayout({ 'file-tree-line-height': String(fileTreeLineHeight.value) });
              }}
              style={{ width: 80, accentColor: colors.accent }}
            />
          </SettingRow>
          <SettingRow label="BG color">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={fileTreeBgColor.value || colors.bgDeep}
                onInput={(e) => {
                  fileTreeBgColor.value = (e.target as HTMLInputElement).value;
                  updateLayout({ 'file-tree-bg-color': fileTreeBgColor.value });
                }}
                style={{ width: 28, height: 28, border: `1px solid ${colors.bgSurface}`, borderRadius: 4, padding: 0, cursor: 'pointer', backgroundColor: 'transparent' }}
              />
              {fileTreeBgColor.value && (
                <button
                  onClick={() => { fileTreeBgColor.value = ''; updateLayout({ 'file-tree-bg-color': '' }); }}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    color: colors.textMuted,
                    backgroundColor: 'transparent',
                    border: `1px solid ${colors.bgSurface}`,
                    borderRadius: 4,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </SettingRow>

          {/* Shortcuts */}
          <SectionLabel label="SHORTCUTS" />
          <SettingRow label="Toggle sidebar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <KbdKey label="Ctrl" />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.textDim,
                }}
              >
                +
              </span>
              <KbdKey label="B" />
            </div>
          </SettingRow>
          <SettingRow label="Quick switch">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <KbdKey label="Ctrl" />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.textDim,
                }}
              >
                +
              </span>
              <KbdKey label="P" />
            </div>
          </SettingRow>
          <SettingRow label="New tab">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <KbdKey label="Ctrl" />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.textDim,
                }}
              >
                +
              </span>
              <KbdKey label="T" />
            </div>
          </SettingRow>
          <SettingRow label="Close tab">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <KbdKey label="\u2318" />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.textDim,
                }}
              >
                +
              </span>
              <KbdKey label="W" />
            </div>
          </SettingRow>

          {/* Actions */}
          <SectionLabel label="ACTIONS" />
          <div style={{ padding: '12px 24px' }}>
            <button
              onClick={() => {
                closePreferences();
                openProjectModal({ project: activeProject ?? undefined });
              }}
              style={{
                borderRadius: 8,
                backgroundColor: colors.accent,
                border: 'none',
                padding: '8px 16px',
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Edit Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
````

## File: src/components/project-modal.tsx
````typescript
// project-modal.tsx -- Add Project modal with form, directory browser, validation
// Restyled to navy-blue palette with reference AddProjectModal pattern (Phase 10)

import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { addProject, updateProject, switchProject } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { colors, fonts, fontSizes } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level signals for modal state
// ---------------------------------------------------------------------------

const visible = signal(false);
const directory = signal('');
const name = signal('');
const agent = signal('claude');
const gsdFile = signal('');
const serverCmd = signal('');
const error = signal<string | null>(null);
const isFirstRun = signal(false);
const editingName = signal<string | null>(null); // non-null = edit mode

const isValid = computed(() => directory.value.trim().length > 0 && name.value.trim().length > 0);

// ---------------------------------------------------------------------------
// Public API (same as Arrow.js version)
// ---------------------------------------------------------------------------

/**
 * Open the modal. Pass `project` to enter edit mode with pre-filled fields.
 */
export function openProjectModal(opts: { firstRun?: boolean; project?: ProjectEntry } = {}) {
  visible.value = true;
  isFirstRun.value = !!opts.firstRun;
  if (opts.project) {
    editingName.value = opts.project.name;
    directory.value = opts.project.path;
    name.value = opts.project.name;
    agent.value = opts.project.agent || 'claude';
    gsdFile.value = opts.project.gsd_file || '';
    serverCmd.value = opts.project.server_cmd || '';
  } else {
    editingName.value = null;
    directory.value = '';
    name.value = '';
    agent.value = 'claude';
    gsdFile.value = '';
    serverCmd.value = '';
  }
  error.value = null;
}

export function closeProjectModal() {
  if (isFirstRun.value) return; // First-run: only close via X button
  visible.value = false;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSubmit() {
  if (!isValid.value) return;
  error.value = null;
  try {
    const entry: ProjectEntry = {
      path: directory.value.trim(),
      name: name.value.trim(),
      agent: agent.value.trim() || 'bash',
      gsd_file: gsdFile.value.trim() || undefined,
      server_cmd: serverCmd.value.trim() || undefined,
    };

    if (editingName.value) {
      // Edit mode: update existing project
      await updateProject(editingName.value, entry);
      document.dispatchEvent(new CustomEvent('project-added', { detail: { entry } }));
      await switchProject(entry.name);
    } else {
      // Add mode: create new project
      await addProject(entry);
      document.dispatchEvent(new CustomEvent('project-added', { detail: { entry } }));
      await switchProject(entry.name);
    }

    visible.value = false;
  } catch (err) {
    error.value = err?.toString() || 'Failed to save project';
  }
}

async function handleBrowse() {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      directory.value = selected as string;
      // Auto-fill name from directory basename if empty
      if (!name.value) {
        const parts = (selected as string).split('/');
        name.value = parts[parts.length - 1] || '';
      }
      // Auto-detect GSD planning directory
      try {
        const entries = await invoke<Array<{ name: string; is_dir: boolean }>>('list_directory', { path: selected });
        const hasPlanningDir = entries.some(e => e.is_dir && e.name === '.planning');
        if (hasPlanningDir) {
          const planningEntries = await invoke<Array<{ name: string; is_dir: boolean }>>('list_directory', { path: selected + '/.planning' });
          const roadmap = planningEntries.find(e => !e.is_dir && /^(ROADMAP|PLAN)\.md$/i.test(e.name));
          if (roadmap) {
            gsdFile.value = '.planning/' + roadmap.name;
          }
        }
      } catch {
        // Silently ignore -- GSD detection is optional
      }
    }
  } catch (err) {
    console.warn('[efxmux] Directory picker failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Visual primitives (matching reference AddProjectModal)
// ---------------------------------------------------------------------------

function FieldLabel({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: fontSizes.sm,
        color: colors.textDim,
        letterSpacing: '1.2px',
        display: 'block',
        marginBottom: 6,
      }}
    >
      {label}
    </span>
  );
}

function InputShell({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        backgroundColor: colors.bgBase,
        border: `1px solid ${colors.bgSurface}`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectModal() {
  const formRef = useRef<HTMLFormElement>(null);

  // Escape key and cleanup
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && visible.value) {
        e.preventDefault();
        closeProjectModal();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  if (!visible.value) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => {
        if (!isFirstRun.value) closeProjectModal();
      }}
    >
      <div
        style={{
          width: 520,
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgSurface}`,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 101,
        }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px 24px',
          }}
        >
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: 16,
              fontWeight: 600,
              color: colors.textPrimary,
            }}
          >
            {editingName.value ? 'Edit Project' : 'Add Project'}
          </span>
          <button
            onClick={() => { visible.value = false; }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${colors.bgSurface}`,
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Close"
          >
            <span
              style={{
                fontFamily: fonts.sans,
                color: colors.textMuted,
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              {'\u2715'}
            </span>
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            backgroundColor: colors.bgBorder,
            width: '100%',
          }}
        />

        {/* Form */}
        <form
          ref={formRef}
          style={{
            padding: '20px 24px',
            gap: 16,
            display: 'flex',
            flexDirection: 'column',
          }}
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        >
          {/* Directory */}
          <div>
            <FieldLabel label="DIRECTORY" />
            <div style={{ display: 'flex' }}>
              <InputShell>
                <input
                  type="text"
                  placeholder="/path/to/project"
                  style={{
                    flex: 1,
                    fontFamily: fonts.sans,
                    fontSize: 13,
                    color: directory.value ? colors.textPrimary : colors.textDim,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                  }}
                  value={directory.value}
                  onInput={(e) => { directory.value = (e.target as HTMLInputElement).value; }}
                />
              </InputShell>
              <button
                type="button"
                style={{
                  backgroundColor: colors.accentMuted,
                  border: `1px solid ${colors.bgSurface}`,
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.accent,
                  marginLeft: 8,
                  cursor: 'pointer',
                }}
                title="Browse"
                onClick={handleBrowse}
              >
                Browse
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <FieldLabel label="NAME" />
            <InputShell>
              <input
                type="text"
                placeholder="project-name"
                style={{
                  width: '100%',
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: name.value ? colors.textPrimary : colors.textDim,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
                value={name.value}
                onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
              />
            </InputShell>
          </div>

          {/* Agent */}
          <div>
            <FieldLabel label="AGENT" />
            <InputShell>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: 'linear-gradient(180deg, #A855F7 0%, #6366F1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.sans,
                    color: 'white',
                    fontSize: 8,
                  }}
                >
                  {'\u25C6'}
                </span>
              </div>
              <input
                type="text"
                list="agent-suggestions"
                placeholder="claude"
                style={{
                  flex: 1,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: agent.value ? colors.textPrimary : colors.textDim,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
                value={agent.value}
                onInput={(e) => { agent.value = (e.target as HTMLInputElement).value; }}
              />
              <datalist id="agent-suggestions">
                <option value="claude" />
                <option value="opencode" />
                <option value="bash" />
              </datalist>
            </InputShell>
          </div>

          {/* GSD File */}
          <div>
            <FieldLabel label="GSD FILE" />
            <InputShell>
              <input
                type="text"
                placeholder="Optional .md path"
                style={{
                  width: '100%',
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: gsdFile.value ? colors.textPrimary : colors.textDim,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
                value={gsdFile.value}
                onInput={(e) => { gsdFile.value = (e.target as HTMLInputElement).value; }}
              />
            </InputShell>
          </div>

          {/* Server Command */}
          <div>
            <FieldLabel label="SERVER COMMAND" />
            <InputShell>
              <input
                type="text"
                placeholder="Optional, e.g. pnpm dev"
                style={{
                  width: '100%',
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: serverCmd.value ? colors.textPrimary : colors.textDim,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
                value={serverCmd.value}
                onInput={(e) => { serverCmd.value = (e.target as HTMLInputElement).value; }}
              />
            </InputShell>
          </div>

          {/* Error */}
          {error.value && (
            <div
              style={{
                color: colors.diffRed,
                fontSize: 12,
                fontFamily: fonts.sans,
              }}
            >
              {error.value}
            </div>
          )}

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              padding: '16px 24px 0 0',
            }}
          >
            {!isFirstRun.value && (
              <button
                type="button"
                style={{
                  borderRadius: 8,
                  border: `1px solid ${colors.bgSurface}`,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontFamily: fonts.sans,
                  color: colors.textMuted,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => { closeProjectModal(); }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!isValid.value}
              style={{
                borderRadius: 8,
                backgroundColor: isValid.value ? colors.accent : `${colors.accent}40`,
                border: 'none',
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: fonts.sans,
                color: 'white',
                cursor: isValid.value ? 'pointer' : 'not-allowed',
              }}
            >
              {editingName.value ? 'Save Changes' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
````

## File: src/terminal/pty-bridge.ts
````typescript
// pty-bridge.ts -- Channel setup, PTY I/O, flow control ACK
// Per D-05: Channel<Vec<u8>> streaming (not emit events)
// Per D-11: JS sends ack_bytes after each chunk processed
// Per Research Pitfall 1: Vec<u8> arrives as number[], convert to Uint8Array
// Per D-10: All PTY commands are session-aware (sessionName parameter)
// Migrated to TypeScript with @tauri-apps/api imports (Phase 6.1)

import { invoke, Channel } from '@tauri-apps/api/core';
import type { Terminal } from '@xterm/xterm';

/**
 * Connect an xterm.js Terminal to a PTY backend via Tauri Channel.
 */
export async function connectPty(terminal: Terminal, sessionName: string, startDir?: string, shellCommand?: string): Promise<{ disconnect: () => void }> {
  // Create Channel for PTY output streaming (D-05, TERM-06)
  const channel = new Channel<number[]>();

  channel.onmessage = (data: number[]): void => {
    // data arrives as number[] (JSON-serialized Vec<u8>) -- Pitfall 1
    // xterm.js Terminal.write() accepts Uint8Array
    const bytes = new Uint8Array(data);
    terminal.write(bytes);

    // ACK bytes for flow control (D-11)
    // Tells Rust side how many bytes JS has consumed
    invoke('ack_bytes', { count: bytes.length, sessionName }).catch(() => {});
  };

  // Spawn PTY with tmux session (D-03, D-04)
  // Pass actual terminal dimensions to avoid initial 80x24 mismatch with tmux
  await invoke('spawn_terminal', {
    onOutput: channel,
    sessionName,
    startDir: startDir ?? null,
    shellCommand: shellCommand ?? null,
    cols: terminal.cols,
    rows: terminal.rows,
  });

  // Wire terminal input -> PTY write (D-10: pass sessionName)
  const onDataDisposable = terminal.onData((data: string) => {
    // data is a string of characters typed by user
    invoke('write_pty', { data, sessionName }).catch(() => {});
  });

  // Wire terminal resize -> PTY resize (D-10: pass sessionName)
  const onResizeDisposable = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    invoke('resize_pty', { cols, rows, sessionName }).catch(() => {});
  });

  return {
    disconnect(): void {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
    },
  };
}
````

## File: src/theme/theme-manager.ts
````typescript
// theme-manager.ts -- Theme lifecycle: load, apply, hot-reload, dark/light toggle
// Per D-10: loads theme from Rust backend on startup
// Per D-13: hot-reload via Tauri 'theme-changed' event
// Per D-14: dark/light chrome toggle with state.json persistence (Phase 4)
// Per D-15: light mode only affects app chrome; terminal colors always from theme.json
// Per T-03-05: guard with null checks before property access
// Migrated to TypeScript with @tauri-apps/api imports (Phase 6.1)

import { updateThemeMode as persistThemeMode, getCurrentState } from '../state-manager';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';


// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface ChromeTheme {
  bg?: string;
  bgRaised?: string;
  bgTerminal?: string;
  border?: string;
  borderInteractive?: string;
  text?: string;
  textBright?: string;
  accent?: string;
  success?: string;
  warning?: string;
  danger?: string;
  font?: string;
  fontSize?: number;
  fileTreeBg?: string;
  fileTreeFont?: string;
  fileTreeFontSize?: number;
  fileTreeLineHeight?: number;
}

export interface ThemeData {
  chrome?: ChromeTheme;
  terminal?: Record<string, string>;
}

interface TerminalRegistration {
  terminal: Terminal;
  fitAddon: FitAddon;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let currentTheme: ThemeData | null = null;

/** Session-scoped flag: true after user manually toggles theme mode (resets on app restart) */
let manualToggle = false;

/** Terminal registry for hot-reload updates */
const terminals: TerminalRegistration[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a terminal instance for hot-reload theme updates.
 */
export function registerTerminal(terminal: Terminal, fitAddon: FitAddon): void {
  terminals.push({ terminal, fitAddon });
}

/**
 * Unregister a terminal (e.g., on dispose).
 */
export function unregisterTerminal(terminal: Terminal): void {
  const idx = terminals.findIndex(t => t.terminal === terminal);
  if (idx !== -1) terminals.splice(idx, 1);
}

/**
 * Apply a full theme object to CSS custom properties and all registered xterm.js terminals.
 * Caches theme in currentTheme for getTerminalTheme().
 */
export function applyTheme(theme: ThemeData): void {
  currentTheme = theme;

  if (theme.chrome) {
    const style = document.documentElement.style;
    if (theme.chrome.bg) style.setProperty('--color-bg', theme.chrome.bg);
    if (theme.chrome.bgRaised) style.setProperty('--color-bg-raised', theme.chrome.bgRaised);
    if (theme.chrome.bgTerminal) style.setProperty('--color-bg-terminal', theme.chrome.bgTerminal);
    if (theme.chrome.border) style.setProperty('--color-border', theme.chrome.border);
    if (theme.chrome.borderInteractive) style.setProperty('--color-border-interactive', theme.chrome.borderInteractive);
    if (theme.chrome.text) style.setProperty('--color-text', theme.chrome.text);
    if (theme.chrome.textBright) style.setProperty('--color-text-bright', theme.chrome.textBright);
    if (theme.chrome.accent) style.setProperty('--color-accent', theme.chrome.accent);
    if (theme.chrome.success) style.setProperty('--color-success', theme.chrome.success);
    if (theme.chrome.warning) style.setProperty('--color-warning', theme.chrome.warning);
    if (theme.chrome.danger) style.setProperty('--color-danger', theme.chrome.danger);
    if (theme.chrome.font) style.setProperty('--font-family-sans', `'${theme.chrome.font}', system-ui, sans-serif`);
    if (theme.chrome.fontSize) style.setProperty('--font-size', `${theme.chrome.fontSize}px`);
    // File tree: theme sets CSS custom properties only.
    // Signal values (fontSize, lineHeight, bgColor) are owned by user preferences
    // in state.json — theme must not overwrite them (they're restored in bootstrap).
    if (theme.chrome.fileTreeFont) style.setProperty('--file-tree-font', theme.chrome.fileTreeFont);
  }

  if (theme.terminal) {
    for (const reg of terminals) {
      reg.terminal.options.theme = theme.terminal;
      if (theme.chrome?.font) {
        reg.terminal.options.fontFamily = `'${theme.chrome.font}', monospace`;
      }
      if (theme.chrome?.fontSize) {
        reg.terminal.options.fontSize = theme.chrome.fontSize;
      }
      reg.fitAddon.fit();
    }
  }
}

/**
 * Get the cached terminal theme section from the last applyTheme() call.
 * Used by terminal-manager.ts for initial Terminal creation.
 */
export function getTerminalTheme(): Record<string, string> | null {
  return currentTheme?.terminal ?? null;
}

/**
 * Get the full cached theme data (terminal + chrome).
 * Used by components that need both terminal colors and chrome font/fontSize.
 */
export function getTheme(): ThemeData | null {
  return currentTheme;
}

/** Chrome CSS properties set by applyTheme() -- must be cleared for light mode CSS to take effect */
const CHROME_PROPS = ['--color-bg', '--color-bg-raised', '--color-bg-terminal', '--color-border', '--color-border-interactive', '--color-text', '--color-text-bright', '--color-accent', '--color-success', '--color-warning', '--color-danger'];

/**
 * Set dark/light chrome mode and persist to state.json via Rust backend.
 * When switching to light: clears inline chrome CSS vars so :root[data-theme="light"] in
 * theme.css takes effect (inline styles have higher specificity than CSS selectors).
 * When switching to dark: re-applies chrome vars from cached theme.
 */
export function setThemeMode(mode: 'dark' | 'light'): void {
  const style = document.documentElement.style;
  document.documentElement.setAttribute('data-theme', mode);
  // Persist to state.json via Rust backend (Phase 4)
  persistThemeMode(mode);

  if (mode === 'light') {
    // Remove inline chrome vars so CSS :root[data-theme="light"] wins
    for (const prop of CHROME_PROPS) {
      style.removeProperty(prop);
    }
  } else if (currentTheme?.chrome) {
    // Re-apply dark theme chrome vars from cached theme
    const c = currentTheme.chrome;
    if (c.bg) style.setProperty('--color-bg', c.bg);
    if (c.bgRaised) style.setProperty('--color-bg-raised', c.bgRaised);
    if (c.bgTerminal) style.setProperty('--color-bg-terminal', c.bgTerminal);
    if (c.border) style.setProperty('--color-border', c.border);
    if (c.borderInteractive) style.setProperty('--color-border-interactive', c.borderInteractive);
    if (c.text) style.setProperty('--color-text', c.text);
    if (c.textBright) style.setProperty('--color-text-bright', c.textBright);
    if (c.accent) style.setProperty('--color-accent', c.accent);
    if (c.success) style.setProperty('--color-success', c.success);
    if (c.warning) style.setProperty('--color-warning', c.warning);
    if (c.danger) style.setProperty('--color-danger', c.danger);
  }
}

/**
 * Toggle dark/light chrome mode and persist to state.json.
 * Light mode only affects CSS custom properties (D-14, D-15).
 * Terminal colors remain from theme.json.
 */
export function toggleThemeMode(): void {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  // Mark as manually toggled for this session (resets on app restart)
  manualToggle = true;
  setThemeMode(current === 'dark' ? 'light' : 'dark');
}

/**
 * Follow OS dark/light preference via matchMedia.
 * On first launch (no stored preference), adopts OS setting.
 * On OS change mid-session, always follows OS (standard macOS behavior).
 */
function initOsThemeListener(): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');

  // On first launch, follow OS if no preference stored in state.json
  const currentMode = getCurrentState()?.theme?.mode;
  if (currentMode === undefined || currentMode === null) {
    setThemeMode(mq.matches ? 'dark' : 'light');
  }

  // Only follow OS changes if user hasn't manually toggled
  mq.addEventListener('change', (e: MediaQueryListEvent) => {
    if (!manualToggle) {
      setThemeMode(e.matches ? 'dark' : 'light');
    }
  });
}

/**
 * Initialize theme on startup:
 * 1. Restore dark/light mode from state.json (before paint, with localStorage fallback)
 * 2. Load theme from Rust backend
 * 3. Apply theme to CSS + xterm.js terminals
 * 4. Set up hot-reload listener
 */
export async function initTheme(): Promise<ThemeData | null> {
  // Use theme mode from already-loaded state (Phase 4: state.json, not localStorage)
  // Falls back to localStorage for upgrade users (Phase 3 -> Phase 4 transition)
  const savedMode = (getCurrentState()?.theme?.mode
    ?? localStorage.getItem('efxmux:theme-mode')
    ?? 'dark') as 'dark' | 'light';
  document.documentElement.setAttribute('data-theme', savedMode);

  const theme = await invoke<ThemeData>('load_theme');
  applyTheme(theme);
  // Apply saved mode after applyTheme() -- clears inline CSS vars for light mode (Fix 1: UAT Test 4)
  setThemeMode(savedMode);

  await listen<ThemeData>('theme-changed', (event) => {
    applyTheme(event.payload);
  });

  initOsThemeListener();

  return theme;
}
````

## File: src/main.tsx
````typescript
// main.tsx -- Preact entry point for Efxmux
// Execution order matters:
//   1. Load persisted state from Rust backend (prevents layout flash)
//   2. Create sidebar collapsed signal effect
//   3. Mount Preact app
//   4. Wire drag handles, project system, keyboard handlers
//   5. Init theme + terminal (after DOM is ready)

import { render } from 'preact';
import { effect } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import './styles/app.css';

import { Sidebar } from './components/sidebar';
import { MainPanel } from './components/main-panel';
import { RightPanel } from './components/right-panel';
import { ProjectModal } from './components/project-modal';
import { FuzzySearch } from './components/fuzzy-search';
import { ShortcutCheatsheet, toggleCheatsheet } from './components/shortcut-cheatsheet';
import { FirstRunWizard, openWizard } from './components/first-run-wizard';
import { PreferencesPanel, togglePreferences } from './components/preferences-panel';
import { initDragManager } from './drag-manager';
import { initTheme, registerTerminal, toggleThemeMode } from './theme/theme-manager';
import { createNewTab, closeActiveTab, cycleToNextTab, initFirstTab, clearAllTabs, restoreTabs, saveProjectTabs, hasProjectTabs, restoreProjectTabs } from './components/terminal-tabs';
import {
  loadAppState, initBeforeUnload, sidebarCollapsed, updateLayout, updateSession,
  getProjects, getActiveProject, projects, activeProjectName
} from './state-manager';
import { openProjectModal } from './components/project-modal';
import { serverPaneState, saveCurrentProjectState, restoreProjectState } from './components/server-pane';
import { fileTreeFontSize, fileTreeLineHeight, fileTreeBgColor } from './components/file-tree';
import { detectAgent } from './server/server-bridge';

/**
 * Derive a tmux session name from a project name.
 * Sanitizes to alphanumeric + hyphen + underscore (matching pty.rs sanitization).
 */
function projectSessionName(projectName: string, suffix?: string): string {
  const base = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

// Module-level state for terminal session tracking
// *PtyKey = original PTY spawn session (for write_pty)
// *CurrentSession = which tmux session the client currently shows (for switch-client)
let mainPtyKey = '';
let mainCurrentSession = '';
let rightCurrentSession = '';

function App() {
  return (
    <div id="app-root" class="flex w-screen h-screen overflow-hidden bg-bg text-text-bright font-mono text-sm font-light antialiased">
      <Sidebar />
      <div class="split-handle-v" data-handle="sidebar-main" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" />
      <MainPanel />
      <div class="split-handle-v" data-handle="main-right" role="separator" aria-orientation="vertical" aria-label="Resize main panel" />
      <RightPanel />
      <ProjectModal />
      <FuzzySearch />
      <ShortcutCheatsheet />
      <FirstRunWizard />
      <PreferencesPanel />
    </div>
  );
}

async function bootstrap() {
  // Step 1: Load persisted state (prevents layout flash)
  let appState = null;
  try {
    appState = await loadAppState();
  } catch (err) {
    console.warn('[efxmux] State load failed, using defaults:', err);
  }

  // Apply loaded layout to CSS custom properties immediately
  if (appState?.layout) {
    const { layout } = appState;
    if (layout['sidebar-w']) document.documentElement.style.setProperty('--sidebar-w', String(layout['sidebar-w']));
    if (layout['right-w']) document.documentElement.style.setProperty('--right-w', String(layout['right-w']));
    // Restore file tree preferences (always present as typed fields in Rust LayoutState)
    fileTreeFontSize.value = parseInt(String(layout['file-tree-font-size'])) || 13;
    fileTreeLineHeight.value = parseInt(String(layout['file-tree-line-height'])) || 2;
    fileTreeBgColor.value = String(layout['file-tree-bg-color'] ?? '');
  }

  // Wire beforeunload
  initBeforeUnload();

  // Step 2: Sidebar collapsed signal effect (replaces Arrow.js watch())
  effect(() => {
    const collapsed = sidebarCollapsed.value;
    const w = collapsed ? '40px' : '200px';
    document.documentElement.style.setProperty('--sidebar-w', w);
    updateLayout({ 'sidebar-w': w, 'sidebar-collapsed': collapsed });
  });

  // Step 3: Mount Preact app
  render(<App />, document.getElementById('app')!);

  // Step 4: Wire drag handles (must be after render so [data-handle] elements exist)
  requestAnimationFrame(() => initDragManager());

  // Step 5: Init project system
  initProjects();

  // Step 6: Consolidated keyboard handler (D-01, D-02, UX-01)
  // Single capture-phase listener fires before xterm.js
  // Terminal passthrough set (D-02): c, d, z, l, r always reach terminal
  const TERMINAL_PASSTHROUGH = new Set(['c', 'd', 'z', 'l', 'r']);

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Allow both Ctrl+key and Cmd+key through (Cmd+W closes tab on macOS)
    if (!e.ctrlKey && !e.metaKey) return;

    const key = e.key.toLowerCase();

    // Terminal passthrough: never intercept Ctrl+C/D/Z/L/R (D-02)
    // Only applies to Ctrl -- Cmd variants are not terminal signals
    if (e.ctrlKey && TERMINAL_PASSTHROUGH.has(key) && !e.shiftKey && !e.altKey) return;

    // App shortcuts
    switch (true) {
      case key === 'b' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        sidebarCollapsed.value = !sidebarCollapsed.value;
        break;
      case key === 's' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        serverPaneState.value = serverPaneState.value === 'strip' ? 'expanded' : 'strip';
        updateLayout({ 'server-pane-state': serverPaneState.value });
        if (serverPaneState.value === 'expanded') {
          requestAnimationFrame(() => initDragManager());
        }
        break;
      case key === 't' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        createNewTab();
        break;
      case key === 'w' && !e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey):
        e.preventDefault(); e.stopPropagation();
        closeActiveTab();
        break;
      case e.key === 'Tab' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        cycleToNextTab();
        break;
      case key === 'p' && e.ctrlKey && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        document.dispatchEvent(new CustomEvent('open-fuzzy-search'));
        break;
      case (key === '/' && e.ctrlKey && e.shiftKey) || (e.key === '?' && e.ctrlKey && !e.altKey):
        // Ctrl+? = Ctrl+Shift+/ on US layout, also handle e.key === '?' for AZERTY (D-03)
        e.preventDefault(); e.stopPropagation();
        toggleCheatsheet();
        break;
      case key === '/' && e.ctrlKey && !e.shiftKey && !e.altKey:
        // Ctrl+/ as AZERTY fallback for cheatsheet (UI-SPEC)
        e.preventDefault(); e.stopPropagation();
        toggleCheatsheet();
        break;
      case key === 't' && e.ctrlKey && e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        toggleThemeMode();
        break;
      case key === ',' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey:
        e.preventDefault(); e.stopPropagation();
        togglePreferences();
        break;
    }
  }, { capture: true });

  // Restore server pane state from persisted state (map legacy 'collapsed' to 'strip')
  if (appState?.layout?.['server-pane-state']) {
    const saved = appState.layout['server-pane-state'] as string;
    if (saved === 'expanded') {
      serverPaneState.value = 'expanded';
    } else {
      serverPaneState.value = 'strip';
    }
  }
  if (appState?.layout?.['server-pane-height']) {
    document.documentElement.style.setProperty('--server-pane-h', String(appState.layout['server-pane-height']));
  }

  // Step 7: file-opened handler (PANEL-06)
  document.addEventListener('file-opened', async (e: Event) => {
    const { path, name } = (e as CustomEvent).detail;
    try {
      const content = await invoke('read_file_content', { path });
      document.dispatchEvent(new CustomEvent('show-file-viewer', {
        detail: { path, name, content }
      }));
    } catch (err) {
      console.error('[efxmux] Failed to read file:', err);
    }
  });

  // Step 8: Init theme + terminal (after DOM is ready)
  requestAnimationFrame(async () => {
    let loadedTheme = null;
    try {
      loadedTheme = await initTheme();
    } catch (err) {
      console.warn('[efxmux] Theme init failed, using defaults:', err);
    }

    // Use project-specific tmux session name (or fallback)
    const activeName = activeProjectName.value;
    const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
    const sessionName = activeName
      ? projectSessionName(activeName)
      : (appState?.session?.['main-tmux-session'] ?? 'efx-mux');
    mainPtyKey = sessionName; // Store PTY key (never changes)
    mainCurrentSession = sessionName;
    // Right panel uses same project but with -right suffix
    rightCurrentSession = activeName
      ? projectSessionName(activeName, 'right')
      : (appState?.session?.['right-tmux-session'] ?? 'efx-mux-right');

    // Clean up dead tmux sessions from previous runs (Plan 05)
    try { await invoke('cleanup_dead_sessions'); } catch {}

    // Agent detection (D-10, D-11, AGENT-03/04/05)
    let agentBinary: string | null = null;
    if (activeProject?.agent && activeProject.agent !== 'bash') {
      try {
        agentBinary = await detectAgent(activeProject.agent);
      } catch {
        // Agent binary not found -- will show banner (D-13, AGENT-05)
        agentBinary = null;
      }
    }

    // Try to restore tabs from persisted state (per-project key first, then legacy flat key)
    let tabsRestored = false;
    const perProjectTabKey = activeName ? `terminal-tabs:${activeName}` : null;
    const tabDataRaw = (perProjectTabKey && appState?.session?.[perProjectTabKey])
      || appState?.session?.['terminal-tabs']
      || null;
    if (tabDataRaw) {
      try {
        const parsedData = JSON.parse(tabDataRaw);
        if (parsedData?.tabs?.length > 0) {
          tabsRestored = await restoreTabs(parsedData, activeProject?.path, agentBinary ?? undefined);
        }
      } catch (err) {
        console.warn('[efxmux] Failed to restore tabs, will create fresh:', err);
      }
    }

    // Fall through to fresh first tab if restore failed or no saved data
    if (!tabsRestored) {
      const themeOptions = {
        theme: loadedTheme?.terminal,
        font: loadedTheme?.chrome?.font,
        fontSize: loadedTheme?.chrome?.fontSize,
      };
      const firstTab = await initFirstTab(themeOptions, sessionName, activeProject?.path, agentBinary ?? undefined);

      if (firstTab) {
        const { terminal, fitAddon } = firstTab;
        registerTerminal(terminal, fitAddon);
        updateSession({ 'main-tmux-session': sessionName });

        // Agent fallback banner (D-13, AGENT-05, per UI-SPEC copywriting)
        if (activeProject?.agent && activeProject.agent !== 'bash' && !agentBinary) {
          terminal.writeln('');
          terminal.writeln('\x1b[33mNo agent binary found. Install claude or opencode to enable AI assistance.\x1b[0m');
          terminal.writeln('\x1b[33mStarting plain bash session...\x1b[0m');
        }

        setTimeout(() => fitAddon.fit(), 100);
        terminal.focus();
      }
    }

    // Apply right-h-pct after DOM is ready
    if (appState?.layout?.['right-h-pct']) {
      const pct = parseFloat(String(appState.layout['right-h-pct']));
      if (!isNaN(pct)) {
        const rightPanel = document.querySelector('.right-panel') as HTMLElement;
        if (rightPanel) {
          const rt = rightPanel.querySelector('.right-top') as HTMLElement;
          const rb = rightPanel.querySelector('.right-bottom') as HTMLElement;
          if (rt) rt.style.flex = `0 0 ${pct.toFixed(1)}%`;
          if (rb) rb.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
        }
      }
    }
  });
}

async function initProjects() {
  try {
    const projectList = await getProjects();
    projects.value = projectList;
    if (projectList.length === 0) {
      openWizard();
      return;
    }
    const activeName = await getActiveProject();
    if (activeName) {
      activeProjectName.value = activeName;
      const project = projectList.find(p => p.name === activeName);
      if (project?.path) {
        invoke('set_project_path', { path: project.path });
      }
    }
  } catch (err) {
    console.warn('[efxmux] Failed to load projects:', err);
  }
}

// Save server pane state and terminal tabs BEFORE activeProjectName changes (fixes per-project isolation)
document.addEventListener('project-pre-switch', (e: Event) => {
  const { oldName } = (e as CustomEvent).detail;
  if (oldName) {
    saveCurrentProjectState(oldName);
    saveProjectTabs(oldName);
  }
});

// project-changed listener: switch tmux sessions + update file watcher + agent detection
// 07-06: Servers keep running across project switches; only UI state swaps via cache
// 08-02: Clear all tabs and create new first tab for new project
document.addEventListener('project-changed', async (e: Event) => {
  const newProjectName = (e as CustomEvent).detail.name;
  try {
    const projectList = await getProjects();
    const project = projectList.find(p => p.name === newProjectName);
    if (project?.path) {
      await invoke('set_project_path', { path: project.path });

      // Clear all main panel tabs (PTY clients disconnect but tmux sessions stay alive)
      await clearAllTabs();

      const newMainSession = projectSessionName(newProjectName);
      mainPtyKey = newMainSession;
      mainCurrentSession = newMainSession;

      // Detect agent for the new project (AGENT-03, AGENT-04)
      let agentBinary: string | null = null;
      if (project.agent && project.agent !== 'bash') {
        try {
          agentBinary = await detectAgent(project.agent);
        } catch {
          agentBinary = null;
        }
      }

      // Try restoring cached tabs from a previous visit to this project.
      // spawn_terminal in pty.rs clears tmux history before re-attach to prevent
      // stale screen content from appearing as extra newlines.
      const restored = await restoreProjectTabs(newProjectName, project.path, agentBinary ?? undefined);

      if (!restored) {
        // First visit to this project (no cached tabs) -- create fresh first tab
        const themeOptions = {
          theme: undefined, // Will use current theme from getTheme() inside initFirstTab
        };
        await initFirstTab(themeOptions, newMainSession, project.path, agentBinary ?? undefined);
      }

      // Switch right panel bash terminal (silent via Rust)
      const newRightSession = projectSessionName(newProjectName, 'right');
      document.dispatchEvent(new CustomEvent('switch-bash-session', {
        detail: { currentSession: rightCurrentSession, targetSession: newRightSession, startDir: project.path }
      }));
      rightCurrentSession = newRightSession;

      // 07-06: Restore new project's server state (or defaults if never started)
      // Servers keep running in background -- only UI state switches
      restoreProjectState(newProjectName);
    }
  } catch (err) {
    console.warn('[efxmux] Failed to switch project:', err);
  }
});

bootstrap();
````

## File: src-tauri/src/theme/watcher.rs
````rust
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;

use super::types::{config_dir, theme_path};
use crate::state::state_path;

/// Start a background thread that watches ~/.config/efx-mux/ for theme.json changes.
///
/// Watches the parent directory (not the file) because editors perform atomic saves
/// via delete + rename, which would remove the watch on the file itself.
/// Debounces at 200ms (D-11) to handle rapid editor auto-save.
pub fn start_theme_watcher(app_handle: tauri::AppHandle) {
    let target_path: PathBuf = theme_path();
    let watch_dir: PathBuf = config_dir();

    let state_file_path: PathBuf = state_path();

    std::thread::spawn(move || {
        let target = target_path.clone();
        let state_target = state_file_path.clone();
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(200),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] File watcher error: {:?}", e);
                        return;
                    }
                };

                // Check if any event path matches theme.json specifically
                let is_theme_event = events.iter().any(|e| e.path == target);
                if is_theme_event {
                    // Read and validate theme.json before emitting
                    match std::fs::read_to_string(&target) {
                        Ok(content) => {
                            match serde_json::from_str::<serde_json::Value>(&content) {
                                Ok(theme_value) => {
                                    if let Err(e) = handle.emit("theme-changed", theme_value) {
                                        eprintln!("[efxmux] Failed to emit theme-changed event: {}", e);
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "[efxmux] Invalid theme.json: {}. Keeping current theme.",
                                        e
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[efxmux] Failed to read theme.json: {}", e);
                        }
                    }
                }

                // Check if any event path matches state.json
                let is_state_event = events.iter().any(|e| e.path == state_target);
                if is_state_event {
                    match std::fs::read_to_string(&state_target) {
                        Ok(content) => {
                            match serde_json::from_str::<serde_json::Value>(&content) {
                                Ok(state_value) => {
                                    if let Err(e) = handle.emit("state-changed", state_value) {
                                        eprintln!("[efxmux] Failed to emit state-changed event: {}", e);
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "[efxmux] Invalid state.json: {}. Keeping current state.",
                                        e
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[efxmux] Failed to read state.json: {}", e);
                        }
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create theme file watcher: {:?}", e);
                return;
            }
        };

        // Watch the config directory (NonRecursive) -- not the file itself
        if let Err(e) = debouncer.watcher().watch(&watch_dir, RecursiveMode::NonRecursive) {
            eprintln!(
                "[efxmux] Failed to watch config dir {:?}: {:?}",
                watch_dir, e
            );
            return;
        }

        println!("[efxmux] Theme watcher active on {:?}", watch_dir);

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}
````

## File: src-tauri/src/file_ops.rs
````rust
//! File operations for right panel views (D-04, D-06, D-01)
//!
//! Provides git diff, directory listing, file reading, and checkbox write-back
//! commands consumed by the frontend via Tauri invoke.

use git2::{DiffOptions, Repository};
use std::path::Path;
use tauri::async_runtime::spawn_blocking;

use crate::state::ManagedAppState;

/// Entry returned by list_directory.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// Validate that a path does not contain traversal components.
fn is_safe_path(path: &str) -> bool {
    let p = Path::new(path);
    !p.components().any(|c| c.as_os_str() == "..")
}

/// Get unified diff for a file relative to its git repo (D-04).
/// Opens the git repo at the file's parent directory, generates a patch diff.
#[tauri::command]
pub async fn get_file_diff(path: String) -> Result<String, String> {
    spawn_blocking(move || get_file_diff_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Synchronous inner implementation of get_file_diff for testing.
pub fn get_file_diff_impl(path: &str) -> Result<String, String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Guard file size > 1MB
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > 1_048_576 {
        return Err("File too large for diff viewing".to_string());
    }

    // Find git repo by walking up from file's directory
    let repo = Repository::discover(file_path.parent().unwrap_or(file_path))
        .map_err(|e| format!("Not a git repository: {}", e))?;

    let workdir = repo
        .workdir()
        .ok_or_else(|| "Bare repository not supported".to_string())?;

    // Make path relative to repo workdir
    let rel_path = file_path
        .strip_prefix(workdir)
        .map_err(|_| "File is not inside the git repository".to_string())?;

    let mut opts = DiffOptions::new();
    opts.pathspec(rel_path.to_string_lossy().as_ref());
    opts.include_untracked(true);

    // Diff between index (HEAD) and workdir
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.to_string())?;

    let mut output = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        match origin {
            '+' | '-' | ' ' => {
                output.push(origin);
                if let Ok(content) = std::str::from_utf8(line.content()) {
                    output.push_str(content);
                }
            }
            'H' => {
                // Hunk header line (@@...@@)
                if let Ok(content) = std::str::from_utf8(line.content()) {
                    output.push_str(content);
                }
            }
            _ => {}
        }
        true
    })
    .map_err(|e| e.to_string())?;

    // If diff is empty, file might be untracked — show full content as new file
    if output.trim().is_empty() {
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut new_file_output = String::from("@@ New file @@\n");
        for line in content.lines() {
            new_file_output.push('+');
            new_file_output.push_str(line);
            new_file_output.push('\n');
        }
        return Ok(new_file_output);
    }

    Ok(output)
}

/// List directory contents sorted: directories first, then files, alphabetically (D-06).
/// Optionally validates that path is within project_root (T-06-05-01 mitigation).
#[tauri::command]
pub async fn list_directory(path: String, project_root: Option<String>) -> Result<Vec<FileEntry>, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    // Validate path is within project root if provided (T-06-05-01)
    if let Some(ref root) = project_root {
        let canonical_path = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
        let canonical_root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err("Path is outside project root".to_string());
        }
    }

    spawn_blocking(move || {
        let dir = Path::new(&path);
        if !dir.is_dir() {
            return Err(format!("Not a directory: {}", path));
        }

        let mut entries: Vec<FileEntry> = std::fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let metadata = entry.metadata().ok()?;
                let is_dir = metadata.is_dir();
                Some(FileEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir,
                    size: if is_dir { None } else { Some(metadata.len()) },
                })
            })
            .collect();

        // Sort: dirs first, then files, alphabetically within each group
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read file content as string (D-06). Guards against files > 1MB.
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    spawn_blocking(move || {
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if metadata.len() > 1_048_576 {
            return Err("File too large (> 1MB)".to_string());
        }
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Alias for read_file_content (D-06).
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    read_file_content(path).await
}

/// Synchronous inner implementation of write_checkbox for testing.
pub fn write_checkbox_impl(
    path: &str,
    line: u32,
    checked: bool,
) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    let idx = line as usize;
    if idx >= lines.len() {
        return Err(format!(
            "Line {} out of range (file has {} lines)",
            line,
            lines.len()
        ));
    }

    let target = &lines[idx];
    // Validate: must be a task list item (- [ ] or - [x] or * [ ] or * [x])
    let checkbox_re = regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$")
        .map_err(|e| e.to_string())?;

    if let Some(caps) = checkbox_re.captures(target) {
        let prefix = &caps[1];
        let suffix = &caps[2];
        let mark = if checked { "x" } else { " " };
        lines[idx] = format!("{}{}{}", prefix, mark, suffix);
    } else {
        return Err(format!("Line {} is not a checkbox task item", line));
    }

    // Atomic write: tmp + rename
    let tmp_path = format!("{}.tmp", path);
    let output = lines.join("\n");
    // Preserve trailing newline if original had one
    let output = if content.ends_with('\n') {
        format!("{}\n", output)
    } else {
        output
    };
    std::fs::write(&tmp_path, &output).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;

    Ok(())
}

/// Write checkbox state back to a .md file (D-01).
/// Finds the specified line, validates it contains a task list checkbox,
/// and toggles it. Uses atomic write (tmp + rename) for safety.
#[tauri::command]
pub async fn write_checkbox(
    path: String,
    line: u32,
    checked: bool,
    managed: tauri::State<'_, ManagedAppState>,
) -> Result<(), String> {
    // Derive project root from active project for path validation
    let project_root = {
        let guard = managed.0.lock().map_err(|e| e.to_string())?;
        guard.project.active.clone()
    };

    if let Some(ref root) = project_root {
        let full = Path::new(&path);
        if !full.starts_with(root) {
            return Err("Path is outside the active project directory".to_string());
        }
    }

    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    spawn_blocking(move || write_checkbox_impl(&path, line, checked))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn is_safe_path_accepts_relative_paths() {
        assert!(is_safe_path("src/foo.ts"));
        assert!(is_safe_path("src/nested/deep/file.rs"));
        assert!(is_safe_path("foo"));
        assert!(is_safe_path("a/b/c/d/e/f/g.txt"));
    }

    #[test]
    fn is_safe_path_rejects_traversal() {
        assert!(!is_safe_path("../foo"));
        assert!(!is_safe_path("src/../../../etc/passwd"));
        assert!(!is_safe_path("foo/../../bar"));
    }

    #[test]
    fn is_safe_path_accepts_absolute_paths_on_unix() {
        // On Unix, absolute paths like /etc/passwd don't contain ".." components,
        // so is_safe_path (which only checks for "..") allows them.
        // This is acceptable since the function's purpose is traversal prevention.
        #[cfg(unix)]
        {
            assert!(is_safe_path("/etc/passwd"));
        }
        // On Windows, absolute paths contain root components that are not ".."
        #[cfg(windows)]
        {
            assert!(!is_safe_path("C:\\Users\\foo"));
        }
    }

    #[test]
    fn file_too_large_rejected() {
        let dir = TempDir::new().unwrap();
        let big_file = dir.path().join("big.txt");
        // Write ~1.1MB (1,157,000 bytes)
        let content = "x".repeat(1_157_000);
        std::fs::write(&big_file, content).unwrap();
        let path = big_file.to_str().unwrap().to_string();

        // Initialize git repo so get_file_diff can discover it
        let _ = std::process::Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.email", "t@t.com"])
            .current_dir(dir.path())
            .output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.name", "T"])
            .current_dir(dir.path())
            .output();

        let result = get_file_diff_impl(&path);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("too large"), "Expected 'too large' error, got: {}", err);
    }

    #[test]
    fn write_checkbox_toggles_checkbox_state() {
        let dir = TempDir::new().unwrap();
        let md_file = dir.path().join("tasks.md");
        std::fs::write(&md_file, "- [ ] Task 1\n- [x] Task 2\n").unwrap();
        let path = md_file.to_str().unwrap().to_string();

        // Toggle first line: - [ ] -> - [x]
        let result = write_checkbox_impl(&path, 0, true);
        assert!(result.is_ok(), "write_checkbox_impl failed: {:?}", result);

        let content = std::fs::read_to_string(&md_file).unwrap();
        assert!(content.contains("- [x] Task 1"), "First line should be checked: {}", content);
        assert!(content.contains("- [x] Task 2"), "Second line should still be checked: {}", content);
    }

    #[test]
    fn write_checkbox_rejects_non_checkbox_line() {
        let dir = TempDir::new().unwrap();
        let md_file = dir.path().join("notes.md");
        std::fs::write(&md_file, "This is not a checkbox\n").unwrap();
        let path = md_file.to_str().unwrap().to_string();

        let result = write_checkbox_impl(&path, 0, true);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("not a checkbox"), "Expected 'not a checkbox' error, got: {}", err);
    }
}
````

## File: src-tauri/src/file_watcher.rs
````rust
//! File watchers for auto-refresh functionality.
//!
//! 1. .md file watcher for GSD Viewer auto-refresh (D-02, PANEL-03).
//!    Watches a project directory for changes to .md files and emits
//!    `md-file-changed` Tauri events to trigger frontend refresh.
//!
//! 2. Git status watcher for sidebar Git Changes pane auto-refresh.
//!    Watches .git/ directory for index changes and emits `git-status-changed`
//!    events to trigger sidebar refresh.
//!
//! Pattern mirrors theme/watcher.rs: watch directory (not file) because
//! editors do atomic saves (delete + rename).

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;

/// Start a background thread that watches `project_path` for .md file changes.
///
/// Emits `md-file-changed` event with the changed file path as payload.
/// Uses 200ms debounce to handle rapid editor auto-save.
pub fn start_md_watcher(app_handle: tauri::AppHandle, project_path: PathBuf) {
    let watch_dir = project_path.clone();

    std::thread::spawn(move || {
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(200),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] MD file watcher error: {:?}", e);
                        return;
                    }
                };

                // Check if any event path is a .md file
                let md_events: Vec<_> = events
                    .iter()
                    .filter(|e| {
                        e.path
                            .extension()
                            .map(|ext| ext == "md")
                            .unwrap_or(false)
                    })
                    .collect();

                if !md_events.is_empty() {
                    // Emit with the first changed .md file path
                    let changed_path = md_events[0].path.to_string_lossy().to_string();
                    if let Err(e) = handle.emit("md-file-changed", changed_path) {
                        eprintln!("[efxmux] Failed to emit md-file-changed event: {}", e);
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create MD file watcher: {:?}", e);
                return;
            }
        };

        // Watch the project directory (NonRecursive to match theme/watcher.rs pattern)
        if let Err(e) = debouncer
            .watcher()
            .watch(&watch_dir, RecursiveMode::Recursive)
        {
            eprintln!(
                "[efxmux] Failed to watch project dir {:?}: {:?}",
                watch_dir, e
            );
            return;
        }

        println!(
            "[efxmux] MD file watcher active on {:?}",
            watch_dir
        );

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}

/// Frontend command to set project path and (re)start the .md file watcher.
/// Called when the active project changes.
#[tauri::command]
pub fn set_project_path(path: String, app: tauri::AppHandle) {
    let project_path = PathBuf::from(&path);
    if project_path.is_dir() {
        start_md_watcher(app.clone(), project_path.clone());
        start_git_watcher(app, project_path);
    } else {
        eprintln!(
            "[efxmux] set_project_path: not a directory: {}",
            path
        );
    }
}

/// Start a background thread that watches `.git/` directory for changes.
///
/// Emits `git-status-changed` event when git index or refs change.
/// Uses 300ms debounce to handle rapid git operations.
pub fn start_git_watcher(app_handle: tauri::AppHandle, project_path: PathBuf) {
    let git_dir = project_path.join(".git");

    // Only start watcher if .git directory exists (is a git repo)
    if !git_dir.is_dir() {
        println!(
            "[efxmux] No .git directory found at {:?}, skipping git watcher",
            project_path
        );
        return;
    }

    std::thread::spawn(move || {
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(300),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] Git watcher error: {:?}", e);
                        return;
                    }
                };

                // Check if any event is relevant to git status:
                // - index file (staging area)
                // - HEAD, refs/* (branch changes, commits)
                // - COMMIT_EDITMSG (commit in progress)
                let relevant_events: Vec<_> = events
                    .iter()
                    .filter(|e| {
                        let path_str = e.path.to_string_lossy();
                        path_str.contains(".git/index")
                            || path_str.contains(".git/HEAD")
                            || path_str.contains(".git/refs")
                            || path_str.contains(".git/COMMIT_EDITMSG")
                            || path_str.contains(".git/MERGE_HEAD")
                            || path_str.contains(".git/REBASE_HEAD")
                    })
                    .collect();

                if !relevant_events.is_empty() {
                    if let Err(e) = handle.emit("git-status-changed", ()) {
                        eprintln!("[efxmux] Failed to emit git-status-changed event: {}", e);
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create git watcher: {:?}", e);
                return;
            }
        };

        // Watch the .git directory recursively to catch index, HEAD, and refs changes
        if let Err(e) = debouncer
            .watcher()
            .watch(&git_dir, RecursiveMode::Recursive)
        {
            eprintln!(
                "[efxmux] Failed to watch .git dir {:?}: {:?}",
                git_dir, e
            );
            return;
        }

        println!(
            "[efxmux] Git status watcher active on {:?}",
            git_dir
        );

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vitest/globals", "@testing-library/jest-dom/vitest"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "src-tauri"]
}
````

## File: src/components/tab-bar.tsx
````typescript
// tab-bar.tsx -- Reusable tab bar component for right panel views (D-11, PANEL-01)
// Visual rewrite: Phase 10 pill-style pattern (RightPanel TabButton reference)

import type { Signal } from '@preact/signals';
import { colors, fonts } from '../tokens';

interface TabBarProps {
  tabs: string[];
  activeTab: Signal<string>;
  onSwitch: (tab: string) => void;
}

export function TabBar({ tabs, activeTab, onSwitch }: TabBarProps) {
  return (
    <div class="flex gap-1 px-2 py-2 border-b shrink-0 items-center" style={{ backgroundColor: colors.bgBase, borderColor: colors.bgBorder }}>
      {tabs.map(tab => {
        const active = activeTab.value === tab;
        return (
          <button
            class="cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: active ? colors.bgElevated : 'transparent',
              border: active ? `1px solid ${colors.bgSurface}` : '1px solid transparent',
              borderRadius: 6,
              padding: '9px 16px',
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? colors.textPrimary : colors.textDim,
            }}
            onClick={() => onSwitch(tab)}
          >{tab}</button>
        );
      })}
    </div>
  );
}
````

## File: src/styles/app.css
````css
@import "tailwindcss";
@import "@xterm/xterm/css/xterm.css";

@theme {
  --color-bg: #111927;           /* bgBase */
  --color-bg-raised: #19243A;    /* bgElevated */
  --color-bg-terminal: #111927;  /* bgDeep — harmonized with bgBase per user preference */
  --color-border: #243352;       /* bgBorder */
  --color-border-interactive: #324568; /* bgSurface */
  --color-text: #8B949E;         /* textMuted */
  --color-text-bright: #E6EDF3;  /* textPrimary */
  --color-text-secondary: #C9D1D9; /* textSecondary (NEW — for GSD content subheadings) */
  --color-text-muted: #556A85;   /* textDim */
  --color-accent: #258AD1;       /* unchanged from Phase 9 */
  --color-success: #3FB950;
  --color-warning: #D29922;
  --color-danger: #F85149;

  /* Light mode values — harmonized per D-14 */
  --color-bg-light: #FFFFFF;
  --color-bg-raised-light: #FFFFFF;
  --color-bg-terminal-light: #FFFFFF;
  --color-border-light: #D0D7DE;
  --color-border-interactive-light: #D0D7DE;
  --color-text-light: #656D76;
  --color-text-bright-light: #1F2328;
  --color-accent-light: #0969DA;
  --color-success-light: #1A7F37;
  --color-warning-light: #9A6700;
  --color-danger-light: #CF222E;

  --font-family-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  --font-family-mono: 'GeistMono', 'FiraCode', 'SF Mono', 'Monaco', 'Menlo', monospace;
}

@font-face {
  font-family: 'FiraCode';
  src: url('/fonts/FiraCode-Light.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'Geist';
  src: url('/fonts/Geist-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'GeistMono';
  src: url('/fonts/GeistMono-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}

/* Light mode override (data-theme attribute on :root) */
[data-theme="light"] {
  --color-bg: var(--color-bg-light);
  --color-bg-raised: var(--color-bg-raised-light);
  --color-bg-terminal: var(--color-bg-terminal-light);
  --color-border: var(--color-border-light);
  --color-border-interactive: var(--color-border-interactive-light);
  --color-text: var(--color-text-light);
  --color-text-bright: var(--color-text-bright-light);
  --color-accent: var(--color-accent-light);
  --color-success: var(--color-success-light);
  --color-warning: var(--color-warning-light);
  --color-danger: var(--color-danger-light);
}

/* Section label utility (D-08): uppercase Geist Mono section headers */
.section-label {
  font-family: 'GeistMono', monospace;
  font-weight: 500;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--color-text-muted);
}

/* Dynamic layout properties (set by JS drag-manager) */
:root {
  --sidebar-w: 200px;
  --right-w: 25%;
  --handle-size: 1px;
  --handle-hit: 8px;
}

/* ─── Panel layout (consumed by drag-manager CSS vars) ─── */
.sidebar {
  width: var(--sidebar-w);
  min-width: 40px;
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-right: 1px solid var(--color-border);
}

.sidebar.collapsed {
  width: 40px;
  min-width: 40px;
}

.sidebar-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.main-panel {
  flex: 1;
  min-width: 200px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-panel {
  width: var(--right-w);
  min-width: 180px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--color-border);
}

.right-top {
  flex: 1 1 60%;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-bottom {
  flex: 1 1 40%;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-top-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
}

.right-bottom-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.terminal-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-terminal);
  position: relative;
}

.terminal-area .xterm {
  height: 100%;
}

.terminal-area .xterm-viewport {
  background-color: var(--color-bg-terminal) !important;
}

.terminal-area .xterm-screen {
  background-color: var(--color-bg-terminal);
}

.server-pane {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  transition: height 0.15s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.server-pane.state-strip {
  height: 28px;
  overflow: hidden;
}

.server-pane.state-expanded {
  height: var(--server-pane-h, 200px);
}

.server-pane-toolbar {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: var(--color-bg-raised);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.server-pane-logs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px;
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--color-bg-raised);
}

.server-btn {
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 4px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-family-sans);
  cursor: pointer;
  transition: all 0.15s ease;
}

.server-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-text-bright);
}

.server-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Global reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ─── xterm.js scrollbar overrides (cannot be Tailwind-ized) ─── */
.xterm-viewport::-webkit-scrollbar { width: 8px; }
.xterm-viewport::-webkit-scrollbar-track { background: var(--color-bg); }
.xterm-viewport::-webkit-scrollbar-thumb { background: var(--color-border-interactive); border-radius: 4px; }
.xterm-viewport::-webkit-scrollbar-thumb:hover { background: var(--color-text); }

/* ─── Global custom scrollbars (match xterm style) ─── */
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: var(--color-border-interactive); border-radius: 4px; }
*::-webkit-scrollbar-thumb:hover { background: var(--color-text); }

/* ─── Drag state overlay (applied by drag-manager) ─── */
.app-dragging .sidebar,
.app-dragging .main-panel,
.app-dragging .right-panel {
  pointer-events: none;
  user-select: none;
}

/* ─── GSD Viewer uses .file-viewer-markdown (shared with file preview) ─── */

/* ─── Diff Viewer color classes ─── */
.diff-add { border-left: 3px solid var(--color-success); }
.diff-del { border-left: 3px solid var(--color-danger); }

/* ─── File Tree focus ─── */
.file-tree:focus { outline: 1px solid var(--color-accent); outline-offset: -1px; }

/* ─── Vertical split handle (sidebar<->main, main<->right) ─── */
.split-handle-v {
  width: var(--handle-size);
  min-width: var(--handle-size);
  height: 100%;
  cursor: col-resize;
  background: var(--color-border);
  background-clip: content-box;
  flex-shrink: 0;
  /* Widen hit target with negative margin + transparent padding trick */
  margin: 0 calc((var(--handle-hit) - var(--handle-size)) / -2);
  padding: 0 calc((var(--handle-hit) - var(--handle-size)) / 2);
  z-index: 10;
  transition: background 0.1s ease;
}

.split-handle-v:hover,
.split-handle-v.dragging {
  background: var(--color-accent);
  background-clip: content-box;
}

/* ─── Horizontal split handle between right sub-panels ─── */
.split-handle-h {
  width: 100%;
  height: var(--handle-size);
  min-height: var(--handle-size);
  cursor: row-resize;
  background: var(--color-border);
  background-clip: content-box;
  flex-shrink: 0;
  /* Widen vertical hit target */
  margin: calc((var(--handle-hit) - var(--handle-size)) / -2) 0;
  padding: calc((var(--handle-hit) - var(--handle-size)) / 2) 0;
  z-index: 10;
  transition: background 0.1s ease;
}

.split-handle-h:hover,
.split-handle-h.dragging {
  background: var(--color-accent);
  background-clip: content-box;
}

/* ─── Project row hover actions ─── */
.group:hover .project-row-actions {
  opacity: 1 !important;
}

/* Agent icon gradient utility (D-17: replaces inline style={{ background: 'linear-gradient(180deg, #A855F7, #6366F1)' }}) */
.agent-icon-gradient {
  background: linear-gradient(180deg, #A855F7, #6366F1);
}

/* ─── Syntax highlighting tokens (file viewer) ─── */
.syn-kw { color: #c792ea; }           /* keywords: purple */
.syn-str { color: #c3e88d; }          /* strings: green */
.syn-cm { color: #546e7a; }           /* comments: dim gray */
.syn-num { color: #f78c6c; }          /* numbers: orange */
.syn-fn { color: #82aaff; }           /* functions: blue */
.syn-op { color: #89ddff; }           /* operators: cyan */
.syn-type { color: #ffcb6b; }         /* types/classes: yellow */

/* ─── File viewer markdown rendering ─── */
.file-viewer-markdown h1,
.file-viewer-markdown h2,
.file-viewer-markdown h3,
.file-viewer-markdown h4 {
  color: var(--color-text-bright);
  margin: 20px 0 10px;
  font-weight: 600;
}
.file-viewer-markdown h1 { font-size: 24px; border-bottom: 1px solid var(--color-border); padding-bottom: 8px; }
.file-viewer-markdown h2 { font-size: 20px; border-bottom: 1px solid var(--color-border); padding-bottom: 6px; }
.file-viewer-markdown h3 { font-size: 16px; }
.file-viewer-markdown h4 { font-size: 14px; }
.file-viewer-markdown p { margin: 10px 0; line-height: 1.7; }
.file-viewer-markdown a { color: var(--color-accent); text-decoration: underline; }
.file-viewer-markdown code {
  background: var(--color-bg-raised);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: var(--font-family-mono);
}
.file-viewer-markdown pre {
  background: var(--color-bg-raised);
  padding: 14px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 12px 0;
}
.file-viewer-markdown pre code { background: none; padding: 0; }
.file-viewer-markdown ul, .file-viewer-markdown ol { padding-left: 24px; margin: 8px 0; }
.file-viewer-markdown li { margin: 4px 0; line-height: 1.6; }
.file-viewer-markdown blockquote {
  border-left: 3px solid var(--color-accent);
  padding: 4px 16px;
  margin: 12px 0;
  color: var(--color-text);
  background: var(--color-bg-raised);
  border-radius: 0 4px 4px 0;
}
.file-viewer-markdown hr { border: none; border-top: 1px solid var(--color-border); margin: 20px 0; }
.file-viewer-markdown table { border-collapse: collapse; margin: 12px 0; width: 100%; }
.file-viewer-markdown th, .file-viewer-markdown td {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  text-align: left;
  font-size: 13px;
}
.file-viewer-markdown th { background: var(--color-bg-raised); font-weight: 600; color: var(--color-text-bright); }
.file-viewer-markdown img { max-width: 100%; border-radius: 4px; }
.file-viewer-markdown .task-checkbox { margin-right: 8px; cursor: pointer; accent-color: var(--color-accent); }
````

## File: src/terminal/resize-handler.ts
````typescript
// resize-handler.ts -- ResizeObserver + FitAddon + debounced IPC
// Per D-12: FitAddon.fit() fires instantly, invoke('resize_pty') debounced at 150ms
// Per D-14: resize is a control operation (always goes through)
// Per Pitfall 4: track last cols/rows to avoid infinite loop
// Migrated to TypeScript with @tauri-apps/api imports (Phase 6.1)

import { invoke } from '@tauri-apps/api/core';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/**
 * Attach resize handling to a terminal + container.
 */
export function attachResizeHandler(
  container: HTMLElement,
  terminal: Terminal,
  fitAddon: FitAddon,
  sessionName: string
): { detach: () => void } {
  let lastCols = 0;
  let lastRows = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new ResizeObserver(() => {
    // Defer fit() to next frame to avoid ResizeObserver infinite loop (UAT gap test 5)
    requestAnimationFrame(() => {
      // Skip fit when container is hidden (display:none). During restoreTabs(), all
      // non-active tab containers are display:none while their ResizeObservers are
      // active. When a subsequent tab is appended and the browser reflows, the
      // ResizeObserver fires for the hidden container. Without this guard,
      // fitAddon.fit() would measure 0 cols, terminal.onResize would emit, and
      // resize_pty would be invoked with 0 dimensions — sending SIGWINCH with the
      // wrong size to the running process (e.g. Claude Code TUI), breaking fullscreen.
      if (container.style.display === 'none') return;
      fitAddon.fit();

      const { cols, rows } = terminal;

      // Guard against infinite loop (Pitfall 4):
      // Only send IPC if dimensions actually changed
      if (cols === lastCols && rows === lastRows) return;

      lastCols = cols;
      lastRows = rows;

      // Debounced IPC to Rust (D-12: 150ms trailing)
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        invoke('resize_pty', { cols, rows, sessionName }).catch(() => {});
      }, 150);
    });
  });

  observer.observe(container);

  return {
    detach(): void {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    },
  };
}
````

## File: src-tauri/src/git_status.rs
````rust
//! Native git status via git2 (no shell-out)

use git2::Repository;
use tauri::async_runtime::spawn_blocking;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub modified: usize,
    pub staged: usize,
    pub untracked: usize,
}

impl GitStatus {
    pub fn for_path(path: &str) -> Result<Self, String> {
        let repo = Repository::open(path).map_err(|e| e.to_string())?;
        let head = repo.head().map_err(|e| e.to_string())?;
        let branch = head.shorthand().unwrap_or("HEAD").to_string();

        let mut modified = 0;
        let mut staged = 0;
        let mut untracked = 0;

        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true);
        let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

        for entry in statuses.iter() {
            let flags = entry.status();
            if flags.intersects(git2::Status::WT_MODIFIED) {
                modified += 1;
            }
            if flags.intersects(
                git2::Status::INDEX_MODIFIED | git2::Status::INDEX_NEW | git2::Status::INDEX_RENAMED,
            ) {
                staged += 1;
            }
            if flags.intersects(git2::Status::WT_NEW) {
                untracked += 1;
            }
        }

        Ok(GitStatus {
            branch,
            modified,
            staged,
            untracked,
        })
    }
}

#[tauri::command]
pub async fn get_git_status(path: String) -> Result<GitStatus, String> {
    spawn_blocking(move || GitStatus::for_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Individual file entry with status indicator for sidebar listing.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GitFileEntry {
    pub name: String,
    pub path: String,
    pub status: String, // "M", "S", "U"
}

/// Synchronous inner implementation of get_git_files for testing.
pub fn get_git_files_impl(path: &str) -> Result<Vec<GitFileEntry>, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let mut opts = git2::StatusOptions::new();
    opts.show(git2::StatusShow::IndexAndWorkdir);
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    // Collect workdir-related statuses
    for entry in statuses.iter() {
        let flags = entry.status();
        let rel_path = entry.path().unwrap_or("").to_string();
        let name = rel_path.split('/').last().unwrap_or(&rel_path).to_string();
        let full_path = format!("{}/{}", path, rel_path);
        let status = if flags.intersects(
            git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_NEW
                | git2::Status::INDEX_RENAMED,
        ) {
            "S"
        } else if flags.intersects(git2::Status::WT_MODIFIED) {
            "M"
        } else if flags.intersects(git2::Status::WT_NEW) {
            "U"
        } else {
            continue;
        };
        files.push(GitFileEntry {
            name,
            path: full_path,
            status: status.to_string(),
        });
    }

    Ok(files)
}

/// Return file-level git status entries for the sidebar GIT CHANGES section.
#[tauri::command]
pub async fn get_git_files(path: String) -> Result<Vec<GitFileEntry>, String> {
    spawn_blocking(move || get_git_files_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn run_git(dir: &std::path::Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git command failed");
        if !output.status.success() {
            eprintln!("git stderr: {}", String::from_utf8_lossy(&output.stderr));
        }
    }

    fn setup_git_repo() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        run_git(&dir.path(), &["init"]);
        run_git(&dir.path(), &["config", "user.email", "test@test.com"]);
        run_git(&dir.path(), &["config", "user.name", "Test"]);
        // Create initial commit so HEAD exists (git2 requires this for repo.head())
        let placeholder = dir.path().join(".gitkeep");
        std::fs::write(&placeholder, "").unwrap();
        run_git(&dir.path(), &["add", ".gitkeep"]);
        run_git(&dir.path(), &["commit", "-m", "initial"]);
        (dir, path)
    }

    #[test]
    fn empty_repo_has_zero_counts() {
        let (_dir, path) = setup_git_repo();
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.branch, "main");
        assert_eq!(status.modified, 0);
        assert_eq!(status.staged, 0);
        assert_eq!(status.untracked, 0);
    }

    #[test]
    fn staged_file_shows_staged_count() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "content").unwrap();
        run_git(&dir.path(), &["add", "test.txt"]);
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.staged, 1);
        assert_eq!(status.modified, 0);
        assert_eq!(status.untracked, 0);
    }

    #[test]
    fn modified_file_shows_modified_count() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "v1").unwrap();
        run_git(&dir.path(), &["add", "test.txt"]);
        run_git(&dir.path(), &["commit", "-m", "v1"]);
        std::fs::write(&file_path, "v2").unwrap();
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.modified, 1);
        assert_eq!(status.staged, 0);
    }

    #[test]
    fn untracked_file_shows_untracked_count() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("new.txt");
        std::fs::write(&file_path, "new content").unwrap();
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.untracked, 1);
    }

    #[test]
    fn get_git_files_returns_correct_status_letters() {
        let (dir, path) = setup_git_repo();
        // modified file (WT_MODIFIED) — commit first, then edit
        let modified = dir.path().join("modified.txt");
        std::fs::write(&modified, "m").unwrap();
        run_git(&dir.path(), &["add", "modified.txt"]);
        run_git(&dir.path(), &["commit", "-m", "add modified"]);
        std::fs::write(&modified, "mm").unwrap();
        // staged file (INDEX_NEW) — add AFTER the commit so it stays staged
        let staged = dir.path().join("staged.txt");
        std::fs::write(&staged, "s").unwrap();
        run_git(&dir.path(), &["add", "staged.txt"]);
        // untracked file (WT_NEW)
        let untracked = dir.path().join("untracked.txt");
        std::fs::write(&untracked, "u").unwrap();

        let files = get_git_files_impl(&path).unwrap();
        let file_statuses: std::collections::HashMap<_, _> =
            files.iter().map(|f| (f.name.as_str(), f.status.as_str())).collect();
        assert_eq!(file_statuses.get("staged.txt").map(|s| *s), Some("S"));
        assert_eq!(file_statuses.get("modified.txt").map(|s| *s), Some("M"));
        assert_eq!(file_statuses.get("untracked.txt").map(|s| *s), Some("U"));
    }
}
````

## File: src-tauri/src/state.rs
````rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Tauri-managed wrapper for in-memory AppState.
/// Updated on every save_state call; written to disk on window close.
pub struct ManagedAppState(pub Mutex<AppState>);

/// Application state persisted to ~/.config/efx-mux/state.json (per D-07)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    #[serde(default = "default_version")]
    pub version: u32,

    #[serde(default)]
    pub layout: LayoutState,

    #[serde(default)]
    pub theme: ThemeState,

    #[serde(default)]
    pub session: SessionState,

    #[serde(default)]
    pub project: ProjectState,

    #[serde(default)]
    pub panels: PanelsState,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            version: default_version(),
            layout: LayoutState::default(),
            theme: ThemeState::default(),
            session: SessionState::default(),
            project: ProjectState::default(),
            panels: PanelsState::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutState {
    #[serde(default = "default_sidebar_w", rename = "sidebar-w")]
    pub sidebar_w: String,

    #[serde(default = "default_right_w", rename = "right-w")]
    pub right_w: String,

    #[serde(default = "default_right_h_pct", rename = "right-h-pct")]
    pub right_h_pct: String,

    #[serde(default, rename = "sidebar-collapsed")]
    pub sidebar_collapsed: bool,

    #[serde(default = "default_server_pane_height", rename = "server-pane-height")]
    pub server_pane_height: String,

    #[serde(default = "default_server_pane_state", rename = "server-pane-state")]
    pub server_pane_state: String,

    #[serde(default = "default_file_tree_font_size", rename = "file-tree-font-size")]
    pub file_tree_font_size: String,

    #[serde(default = "default_file_tree_line_height", rename = "file-tree-line-height")]
    pub file_tree_line_height: String,

    #[serde(default, rename = "file-tree-bg-color")]
    pub file_tree_bg_color: String,

    /// Extra layout fields from JS. Preserves round-trip
    /// so the frontend can store arbitrary layout data without Rust schema changes.
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            sidebar_w: default_sidebar_w(),
            right_w: default_right_w(),
            right_h_pct: default_right_h_pct(),
            sidebar_collapsed: false,
            server_pane_height: default_server_pane_height(),
            server_pane_state: default_server_pane_state(),
            file_tree_font_size: default_file_tree_font_size(),
            file_tree_line_height: default_file_tree_line_height(),
            file_tree_bg_color: String::new(),
            extra: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeState {
    #[serde(default = "default_theme_mode")]
    pub mode: String,
}

impl Default for ThemeState {
    fn default() -> Self {
        Self {
            mode: default_theme_mode(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    #[serde(default = "default_main_session", rename = "main-tmux-session")]
    pub main_tmux_session: String,

    #[serde(default = "default_right_session", rename = "right-tmux-session")]
    pub right_tmux_session: String,

    /// Extra session fields from JS (e.g. terminal-tabs). Preserves round-trip
    /// so the frontend can store arbitrary session data without Rust schema changes.
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            main_tmux_session: default_main_session(),
            right_tmux_session: default_right_session(),
            extra: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectState {
    #[serde(default, rename = "active")]
    pub active: Option<String>,

    #[serde(default, rename = "projects")]
    pub projects: Vec<ProjectEntry>,
}

/// Project entry stored in the project registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub path: String,
    pub name: String,
    pub agent: String,
    #[serde(default)]
    pub gsd_file: Option<String>,
    #[serde(default)]
    pub server_cmd: Option<String>,
    #[serde(default)]
    pub server_url: Option<String>,
}

impl Default for ProjectEntry {
    fn default() -> Self {
        Self {
            path: String::new(),
            name: String::new(),
            agent: String::new(),
            gsd_file: None,
            server_cmd: None,
            server_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelsState {
    #[serde(default = "default_right_top_tab", rename = "right-top-tab")]
    pub right_top_tab: String,

    #[serde(default = "default_right_bottom_tab", rename = "right-bottom-tab")]
    pub right_bottom_tab: String,
}

impl Default for PanelsState {
    fn default() -> Self {
        Self {
            right_top_tab: default_right_top_tab(),
            right_bottom_tab: default_right_bottom_tab(),
        }
    }
}

// Default value functions (matching D-10)
fn default_sidebar_w() -> String {
    "200px".into()
}
fn default_right_w() -> String {
    "25%".into()
}
fn default_right_h_pct() -> String {
    "50".into()
}
fn default_theme_mode() -> String {
    "dark".into()
}
fn default_main_session() -> String {
    "efx-mux".into()
}
fn default_right_session() -> String {
    "efx-mux-right".into()
}
fn default_right_top_tab() -> String {
    "File Tree".into()
}
fn default_right_bottom_tab() -> String {
    "git".into()
}
fn default_server_pane_height() -> String {
    "200px".into()
}
fn default_server_pane_state() -> String {
    "strip".into()
}
fn default_file_tree_font_size() -> String {
    "13".into()
}
fn default_file_tree_line_height() -> String {
    "2".into()
}
fn default_version() -> u32 {
    1
}

/// Path to state.json
pub fn state_path() -> PathBuf {
    config_dir().join("state.json")
}

/// Returns ~/.config/efx-mux/
fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .filter(|h| !h.is_empty())
        .expect("[efxmux] FATAL: HOME environment variable is not set");
    PathBuf::from(home).join(".config/efx-mux")
}

/// Ensure ~/.config/efx-mux/ exists
pub fn ensure_config_dir() {
    let dir = config_dir();
    if !dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("[efxmux] Failed to create config dir {:?}: {}", dir, e);
        }
    }
}

/// Load state.json. Returns defaults if missing or corrupt (per D-09)
pub fn load_state_sync() -> AppState {
    ensure_config_dir();
    let path = state_path();

    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                // Check version first (D-08)
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(v) = json.get("version").and_then(|v| v.as_u64()) {
                        if v != 1 {
                            eprintln!(
                                "[efxmux] WARNING: state.json version {} not supported. Using defaults.",
                                v
                            );
                            return AppState::default();
                        }
                    }
                }
                match serde_json::from_str::<AppState>(&content) {
                    Ok(state) => return state,
                    Err(err) => {
                        eprintln!(
                            "[efxmux] WARNING: Corrupt state.json ({}). Using defaults.",
                            err
                        );
                    }
                }
            }
            Err(err) => {
                eprintln!(
                    "[efxmux] WARNING: Could not read state.json ({}). Using defaults.",
                    err
                );
            }
        }
    } else {
        eprintln!("[efxmux] WARNING: state.json not found. Using defaults.");
    }

    AppState::default()
}

/// Save state to state.json. Called from spawn_blocking thread (per D-11, D-12)
pub fn save_state_sync(state: &AppState) -> Result<(), String> {
    // Create config dir if missing (don't rely on ensure_config_dir which swallows errors)
    let dir = state_path().parent().unwrap().to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let path = state_path();
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&tmp_path, &json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Get the config directory path as a string (for JS integration)
pub fn get_config_dir_path() -> String {
    config_dir().to_string_lossy().to_string()
}

// -- Tauri commands (async wrappers around sync functions) ---------------------

/// Load app state from state.json. Returns defaults if missing or corrupt.
#[tauri::command]
pub async fn load_state() -> AppState {
    // Use spawn_blocking for file I/O (per D-11)
    tauri::async_runtime::spawn_blocking(load_state_sync)
        .await
        .unwrap_or_else(|_| AppState::default())
}

/// Save app state to state.json. Used by beforeunload hook and periodic saves.
/// Also updates the Tauri-managed in-memory copy for the close handler (WR-03).
#[tauri::command]
pub async fn save_state(
    state_json: String,
    managed: tauri::State<'_, ManagedAppState>,
) -> Result<(), String> {
    let state: AppState = serde_json::from_str(&state_json).map_err(|e| e.to_string())?;
    // Update in-memory copy for the close handler.
    // Recover from poison since AppState has no invariants to violate.
    {
        let mut guard = managed.0.lock().unwrap_or_else(|e| {
            eprintln!("[efxmux] WARNING: State mutex was poisoned, recovering");
            e.into_inner()
        });
        *guard = state.clone();
    }
    // Use spawn_blocking for file I/O (per D-11, D-12)
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&state))
        .await
        .map_err(|e| e.to_string())?
}

/// Return the config directory path (~/.config/efx-mux/)
#[tauri::command]
pub fn get_config_dir() -> String {
    get_config_dir_path()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_roundtrip() {
        let state = AppState::default();
        let json = serde_json::to_string(&state).unwrap();
        let restored: AppState = serde_json::from_str(&json).unwrap();
        assert_eq!(state.version, restored.version);
        assert_eq!(state.layout.sidebar_w, restored.layout.sidebar_w);
        assert_eq!(state.theme.mode, restored.theme.mode);
    }

    #[test]
    fn layout_state_roundtrip() {
        let layout = LayoutState {
            sidebar_w: "250px".into(),
            right_w: "30%".into(),
            right_h_pct: "60".into(),
            sidebar_collapsed: true,
            server_pane_height: "300px".into(),
            server_pane_state: "full".into(),
            file_tree_font_size: "14".into(),
            file_tree_line_height: "1.5".into(),
            file_tree_bg_color: "#1a1a2e".into(),
            extra: std::collections::HashMap::new(),
        };
        let json = serde_json::to_string(&layout).unwrap();
        let restored: LayoutState = serde_json::from_str(&json).unwrap();
        assert_eq!(layout.sidebar_w, restored.sidebar_w);
        assert_eq!(layout.sidebar_collapsed, restored.sidebar_collapsed);
    }

    #[test]
    fn theme_state_roundtrip() {
        let theme = ThemeState { mode: "light".into() };
        let json = serde_json::to_string(&theme).unwrap();
        let restored: ThemeState = serde_json::from_str(&json).unwrap();
        assert_eq!(theme.mode, restored.mode);
    }

    #[test]
    fn session_state_roundtrip() {
        let session = SessionState {
            main_tmux_session: "my-session".into(),
            right_tmux_session: "my-session-right".into(),
            extra: std::collections::HashMap::new(),
        };
        let json = serde_json::to_string(&session).unwrap();
        let restored: SessionState = serde_json::from_str(&json).unwrap();
        assert_eq!(session.main_tmux_session, restored.main_tmux_session);
    }

    #[test]
    fn project_state_roundtrip() {
        let project = ProjectState {
            active: Some("/path/to/project".into()),
            projects: vec![ProjectEntry {
                path: "/path/to/project".into(),
                name: "My Project".into(),
                agent: "claude".into(),
                gsd_file: Some("PLAN.md".into()),
                server_cmd: Some("npm run dev".into()),
                server_url: None,
            }],
        };
        let json = serde_json::to_string(&project).unwrap();
        let restored: ProjectState = serde_json::from_str(&json).unwrap();
        assert_eq!(project.active, restored.active);
        assert_eq!(project.projects.len(), restored.projects.len());
    }

    #[test]
    fn project_entry_roundtrip() {
        let entry = ProjectEntry {
            path: "/path/to/project".into(),
            name: "My Project".into(),
            agent: "claude".into(),
            gsd_file: Some("PLAN.md".into()),
            server_cmd: Some("npm run dev".into()),
            server_url: None,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let restored: ProjectEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(entry.name, restored.name);
    }

    #[test]
    fn panels_state_roundtrip() {
        let panels = PanelsState {
            right_top_tab: "GSD".into(),
            right_bottom_tab: "Files".into(),
        };
        let json = serde_json::to_string(&panels).unwrap();
        let restored: PanelsState = serde_json::from_str(&json).unwrap();
        assert_eq!(panels.right_top_tab, restored.right_top_tab);
    }

    #[test]
    fn app_state_default_has_version_1() {
        let state = AppState::default();
        assert_eq!(state.version, 1);
    }
}
````

## File: src-tauri/tauri.conf.json
````json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Efxmux",
  "version": "0.2.2",
  "identifier": "com.efxmux.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "title": "Efxmux",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "decorations": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "entitlements": "./Entitlements.plist"
    }
  }
}
````

## File: .gitignore
````
RESEARCH
node_modules/
.code-review-graph
dist
coverage/
repomix-output.xml
````

## File: README.md
````markdown
# Efxmux

![Efxmux](public/img/app-ui.png)

**A native macOS terminal multiplexer for AI-assisted development.**

Efxmux wraps Claude Code and OpenCode terminal sessions in a structured, multi-panel workspace. It co-locates the AI agent terminal, a live GSD progress viewer with checkbox write-back, git diff, file tree, and a secondary bash terminal — all around a real PTY connected to tmux. No wrapping, no protocol hacks, just the raw binary in a native window.

> Developers using Claude Code or OpenCode lose context switching between the terminal, their editor, and their planning docs. Efxmux collapses all of that into one native window with a terminal-first aesthetic — dark, fast, keyboard-driven.

---

## Why Efxmux

- **Zero wrapping** — Claude Code and OpenCode run as native PTY processes inside tmux. Full color, full interactivity, zero compatibility issues.
- **Persistent sessions** — Close the app, reopen it. Your layout, tabs, and tmux sessions are exactly where you left them. Processes keep running in the background.
- **Live planning panel** — Render your GSD `PLAN.md` with progress bars and checkboxes. Click a checkbox in the panel, it writes back to the `.md` file on disk, and Claude Code sees the change. Bidirectional.
- **Git diff at a glance** — GitHub-style unified diff viewer powered by `git2` (no shell-out). See what changed without leaving the workspace.
- **Project-scoped workspaces** — Register multiple projects. Switch between them and the terminal session, git status, file tree, and GSD viewer all update atomically.
- **Native performance** — Tauri 2 + Rust backend. WebGL-accelerated terminal rendering via xterm.js 6.0. Sub-20ms input latency.

---

## Features

### Terminal

- Real xterm.js 6.0 terminal connected to a live PTY via tmux
- WebGL2 GPU-accelerated rendering with automatic DOM fallback
- Flow control with backpressure (400KB high / 100KB low watermark)
- PTY output streamed via Tauri IPC channels for ordered, low-latency delivery
- Correct terminal resize (SIGWINCH) when panel splits are dragged
- Multi-tab terminal with per-project tab isolation and persistence
- Crash recovery overlay with "Restart Session" button

### Theming

- Navy-blue dark palette with layered depth and refined typography (Geist / Geist Mono)
- User-defined terminal colors via `~/.config/efx-mux/theme.json`
- iTerm2 `.json` profile auto-conversion
- Hot-reload: save `theme.json` and all terminals re-theme instantly
- Light mode with harmonized white palette

### Layout

- 3-zone layout: collapsible sidebar + main terminal + right panel (top/bottom split)
- Drag-resizable splits with persisted ratios
- Sidebar toggles between 40px icon strip and full-width (Ctrl+B)
- Collapsible server pane at the bottom of the main panel (Ctrl+S)

### Right Panel Views

| Tab | Description |
|-----|-------------|
| **GSD** | Markdown viewer with live file watching, progress bars, and checkbox write-back |
| **Diff** | GitHub-style unified diff with colored additions/deletions and +/- stats |
| **File Tree** | Interactive directory tree with folder collapse, inline icons, and keyboard navigation |
| **Bash** | Independent xterm.js terminal for ad-hoc commands |

### Project System

- Register projects with path, name, agent type, GSD file, and server command
- Sidebar shows project list with git branch badges and file change counts (M/S/U)
- Fuzzy-search project switcher (Ctrl+P)
- Atomic project switch: terminal session, git status, file tree, GSD viewer all update together

### Agent Support

- Auto-detect `claude` or `opencode` binary on PATH
- Launch directly in tmux PTY — no wrapping, no protocol interception
- Per-project agent configuration
- Agent header card with version info, model name, and status pill
- Fallback to plain bash with informational banner if agent not found

### Server Pane

- Collapsible bottom split with strip/expanded toggle
- Run your dev server with ANSI color output
- Controls: Open in Browser, Restart, Stop
- Per-project server isolation — servers keep running across project switches

### Keyboard

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Toggle sidebar |
| Ctrl+S | Toggle server pane |
| Ctrl+T | New terminal tab |
| Ctrl+W / Cmd+W | Close tab |
| Ctrl+Tab | Cycle tabs |
| Ctrl+P | Fuzzy project switcher |
| Ctrl+, | Preferences |
| Ctrl+/ | Keyboard cheatsheet |
| Cmd+K | Clear terminal |
| Ctrl+C/D/Z/L/R | Always passed through to PTY when terminal is focused |

### Session Persistence

- Full layout state saved to `~/.config/efx-mux/state.json`
- On reopen: layout restored, tabs restored, tmux sessions reattached
- Dead session detection with fresh session creation
- Corrupted state fallback to safe defaults
- First-run wizard for initial project setup

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | [Tauri 2](https://v2.tauri.app) (Rust) |
| Frontend | [Preact](https://preactjs.com) + [Signals](https://preactjs.com/guide/v10/signals/) |
| Bundler | [Vite](https://vite.dev) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Language | TypeScript 6 |
| Terminal | [xterm.js 6.0](https://xtermjs.org) + WebGL addon |
| PTY | [portable-pty](https://docs.rs/portable-pty) (Rust) |
| Sessions | tmux |
| Git | [git2](https://docs.rs/git2) (libgit2 bindings, no shell-out) |
| File watching | [notify](https://docs.rs/notify) (Rust) |
| Markdown | [marked](https://marked.js.org) |
| Icons | [Lucide](https://lucide.dev) |
| Fonts | Geist, Geist Mono, FiraCode |

---

## Design System

Efxmux uses a navy-blue palette with layered depth, designed for long coding sessions:

| Token | Dark | Light |
|-------|------|-------|
| Background | `#111927` | `#FFFFFF` |
| Elevated | `#19243A` | `#F6F8FA` |
| Deep | `#0B1120` | `#FFFFFF` |
| Border | `#243352` | `#D0D7DE` |
| Surface | `#324568` | `#E8ECF0` |
| Accent | `#258AD1` | `#258AD1` |
| Text | `#E6EDF3` | `#1F2328` |
| Text Muted | `#8B949E` | `#59636E` |

Typography: **Geist** for UI chrome, **Geist Mono** for code and section labels, **FiraCode** inside xterm.js.

---

## Prerequisites

- **macOS** (Monterey 12+ recommended)
- **tmux** 3.x+ (`brew install tmux`)
- **Rust** toolchain (`rustup`)
- **Node.js** 18+ and **pnpm**
- **Claude Code** or **OpenCode** (optional — falls back to plain bash)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/your-username/efx-mux.git
cd efx-mux

# Install dependencies
pnpm install

# Run in development mode (Vite + Tauri hot-reload)
pnpm tauri dev

# Build for production
pnpm tauri build
```

On first launch, the setup wizard will guide you through adding your first project and selecting your AI agent.

---

## Architecture

```
src/                          # Frontend (Preact + TypeScript)
  components/                 # 16 UI components
    sidebar.tsx               # Project list, git status, collapsible
    main-panel.tsx            # Primary terminal + server pane
    right-panel.tsx           # Tabbed views (GSD/Diff/FileTree/Bash)
    terminal-tabs.tsx         # Tab lifecycle, per-project persistence
    agent-header.tsx          # Agent info card with status
    gsd-viewer.tsx            # Markdown viewer with write-back
    diff-viewer.tsx           # GitHub-style unified diff
    file-tree.tsx             # Interactive directory tree
    server-pane.tsx           # Dev server controls
    ...
  terminal/                   # xterm.js management
    terminal-manager.ts       # Create/configure xterm instances
    pty-bridge.ts             # Tauri IPC ↔ PTY communication
    resize-handler.ts         # SIGWINCH propagation
  tokens.ts                   # Design system tokens
  state-manager.ts            # App state persistence
  main.tsx                    # Entry point + keyboard handler

src-tauri/                    # Backend (Rust)
  src/
    terminal/pty.rs           # PTY spawning, flow control, tmux
    theme/                    # Theme loading, hot-reload, iTerm2 import
    state.rs                  # State persistence (state.json)
    project.rs                # Project registration and switching
    git_status.rs             # git2 integration
    file_watcher.rs           # notify-based file watching
    server.rs                 # Dev server process management
    file_ops.rs               # File read/write for frontend
```

---

## What Efxmux Is Not

- **Not a text editor** — Files open in your `$EDITOR` via a terminal tab
- **Not an AI shell copilot** — Claude Code _is_ the AI; Efxmux is the workspace around it
- **Not cross-platform** — macOS first. No Windows/Linux support planned for v0.1
- **Not a collaboration tool** — Solo developer workspace, no cloud sync
- **Not a plugin platform** — Focused tool, not an extensible framework

---

## License

MIT

---

Built with Tauri, Preact, xterm.js, and tmux. Designed for developers who live in the terminal.
````

## File: repomix.config.json
````json
{
  "output": {
    "filePath": "repomix-output.xml",
    "style": "xml"
  },
  "ignore": {
    "customPatterns": [
      "src-tauri/target/**",
      "src-tauri/icons/**",
      "dist/**",
      "coverage/**",
      ".planning/**",
      ".claude/**",
      "RESEARCH/**",
      ".vscode/**",
      ".github/**",
      "**/*.woff2",
      "**/*.icns",
      "**/*.ico",
      "**/*.png",
      "pnpm-lock.yaml",
      "package-lock.json",
      "**/*.test.ts",
      "**/*.test.tsx"
    ]
  }
}
````

## File: vitest.config.ts
````typescript
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/terminal/terminal-manager.ts',
        'src/terminal/pty-bridge.ts',
        'src/terminal/resize-handler.ts',
        'src/drag-manager.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
});
````

## File: vitest.setup.ts
````typescript
// vitest.setup.ts — Global test setup for Efxmux
// Runs before every test file via vitest.config.ts setupFiles
import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ─── D-03: WebCrypto polyfill ────────────────────────────────
// jsdom lacks crypto.getRandomValues, which Tauri mocks need at import time
if (!globalThis.crypto?.getRandomValues) {
  const { randomFillSync } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (buf: Uint8Array) => randomFillSync(buf),
      subtle: {},
    },
  });
}

// ─── D-01: Tauri IPC auto-mock ───────────────────────────────
// Set __TAURI_INTERNALS__ so any module importing @tauri-apps/api/core
// does not throw at module load time (Pitfall 1 from research)
beforeEach(() => {
  (globalThis as any).__TAURI_INTERNALS__ = {
    postMessage: vi.fn(),
    ipc: vi.fn(),
  };
  (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {};
});

afterEach(async () => {
  try {
    const { clearMocks } = await import('@tauri-apps/api/mocks');
    clearMocks();
  } catch {
    // clearMocks may fail if mocks weren't initialized; safe to ignore
  }
  delete (globalThis as any).__TAURI_INTERNALS__;
  delete (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
});

// ─── D-02: xterm.js auto-mock ────────────────────────────────
// jsdom has no WebGL/canvas — mock all xterm packages so any module
// that transitively imports Terminal gets a stub automatically
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: any;
    open = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    dispose = vi.fn();
    clear = vi.fn();
    reset = vi.fn();
    focus = vi.fn();
    blur = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));
    onTitleChange = vi.fn(() => ({ dispose: vi.fn() }));
    loadAddon = vi.fn();
    rows = 24;
    cols = 80;
    element = null;
    textarea = null;
    unicode = { activeVersion: '11' };
    parser = { registerOscHandler: vi.fn() };
    constructor(opts?: any) {
      this.options = opts || {};
    }
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
    onContextLoss: vi.fn(() => ({ dispose: vi.fn() })),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    proposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
    dispose: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  })),
}));

// ─── D-04: Signal reset utility ──────────────────────────────
// Exported for test files that need to reset module-scoped signals.
// Each test file imports and calls resetSignals() in its own beforeEach.
// We do NOT auto-reset here to avoid importing all signal modules globally
// (which would create circular dependency risk).
//
// Usage in test files:
//   import { someSignal } from './state-manager';
//   beforeEach(() => { someSignal.value = initialValue; });
````

## File: src/components/file-tree.tsx
````typescript
// file-tree.tsx -- Keyboard-navigable file tree with inline SVG icons (D-07, D-08, D-12, D-13, PANEL-05, PANEL-06)
// Loads directory contents via list_directory Rust command.
// Dispatches file-opened CustomEvent for main.js to handle.
// Rewritten with inline SVG icons and tokens.ts colors (Phase 10)
// Added tree mode with collapsible folders and parent nav button (quick-260411-e3e)

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

// File Tree appearance settings (shared with preferences panel)
export const fileTreeFontSize = signal(13);
export const fileTreeLineHeight = signal(2);
export const fileTreeBgColor = signal('');

// View mode signal
const viewMode = signal<'flat' | 'tree'>('tree');

// Local signals for component state
interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
}

const entries = signal<FileEntry[]>([]);
const selectedIndex = signal(0);
const currentPath = signal('');
const loaded = signal(false);

// ── Tree mode state ──────────────────────────────────────────────

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[] | null; // null = not loaded, [] = loaded but empty
  expanded: boolean;
  depth: number;
}

const treeNodes = signal<TreeNode[]>([]);

/**
 * Flatten expanded tree nodes into a render list.
 */
function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.expanded && node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

const flattenedTree = computed(() => flattenTree(treeNodes.value));

/**
 * Load children for a tree node (lazy loading).
 */
async function loadTreeChildren(node: TreeNode): Promise<void> {
  try {
    const project = getActiveProject();
    const result = await invoke<FileEntry[]>('list_directory', { path: node.entry.path, projectRoot: project?.path || null });
    node.children = result.map(entry => ({
      entry,
      children: null,
      expanded: false,
      depth: node.depth + 1,
    }));
    // Trigger reactivity by replacing the array
    treeNodes.value = [...treeNodes.value];
  } catch (err) {
    console.error('[efxmux] tree list_directory failed:', err);
    node.children = [];
    treeNodes.value = [...treeNodes.value];
  }
}

/**
 * Toggle expand/collapse of a tree folder node.
 */
async function toggleTreeNode(node: TreeNode): Promise<void> {
  if (!node.entry.is_dir) return;
  if (node.children === null) {
    // First expansion: load children
    node.expanded = true;
    await loadTreeChildren(node);
  } else {
    // Toggle
    node.expanded = !node.expanded;
    treeNodes.value = [...treeNodes.value];
  }
}

/**
 * Initialize tree from project root.
 */
async function initTree(): Promise<void> {
  const project = getActiveProject();
  if (!project?.path) return;
  try {
    const result = await invoke<FileEntry[]>('list_directory', { path: project.path, projectRoot: project.path });
    treeNodes.value = result.map(entry => ({
      entry,
      children: null,
      expanded: false,
      depth: 0,
    }));
    selectedIndex.value = 0;
  } catch (err) {
    console.error('[efxmux] tree init failed:', err);
    treeNodes.value = [];
  }
}

/**
 * Find the parent TreeNode for a given node in the flattened list.
 */
function findParentNode(node: TreeNode, allNodes: TreeNode[]): TreeNode | null {
  // Walk up by searching for a folder at depth-1 that contains this node
  const idx = allNodes.indexOf(node);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (allNodes[i].depth === node.depth - 1 && allNodes[i].entry.is_dir) {
      return allNodes[i];
    }
  }
  return null;
}

// ── Inline SVG Icons (replacing lucide-preact per reference D-08) ────────────

function FolderIcon() {
  return (
    <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={colors.accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function FileCodeIcon() {
  return (
    <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={colors.textDim} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={colors.textDim} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg class="shrink-0" width="10" height="10" viewBox="0 0 10 10" fill="none"
      stroke={colors.textDim} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
      <path d="M3 1.5L7 5L3 8.5" />
    </svg>
  );
}

// ── Mode toggle icons ────────────────────────────────────────────

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? colors.accent : colors.textDim} stroke-width="1.5" stroke-linecap="round">
      <line x1="3" y1="3" x2="12" y2="3" />
      <line x1="3" y1="7" x2="12" y2="7" />
      <line x1="3" y1="11" x2="12" y2="11" />
      <circle cx="1" cy="3" r="0.5" fill={active ? colors.accent : colors.textDim} stroke="none" />
      <circle cx="1" cy="7" r="0.5" fill={active ? colors.accent : colors.textDim} stroke="none" />
      <circle cx="1" cy="11" r="0.5" fill={active ? colors.accent : colors.textDim} stroke="none" />
    </svg>
  );
}

function TreeIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? colors.accent : colors.textDim} stroke-width="1.5" stroke-linecap="round">
      <line x1="1" y1="2" x2="12" y2="2" />
      <line x1="4" y1="6" x2="12" y2="6" />
      <line x1="4" y1="10" x2="12" y2="10" />
      <line x1="2" y1="4" x2="2" y2="10" />
    </svg>
  );
}

/**
 * Format file size into a human-readable string.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

/**
 * Get the active project from signals.
 */
function getActiveProject(): ProjectEntry | undefined {
  return projects.value.find(p => p.name === activeProjectName.value);
}

/**
 * Load directory contents from Rust backend.
 */
async function loadDir(path: string): Promise<void> {
  try {
    const project = getActiveProject();
    const result = await invoke<FileEntry[]>('list_directory', { path, projectRoot: project?.path || null });
    entries.value = result;
    currentPath.value = path;
    selectedIndex.value = 0;
    loaded.value = true;
  } catch (err) {
    console.error('[efxmux] list_directory failed:', err);
    entries.value = [];
    loaded.value = true;
  }
}

/**
 * Navigate to parent directory (shared between button and keyboard).
 */
function navigateToParent(): void {
  const project = getActiveProject();
  const rootPath = project?.path;
  const parent = currentPath.value.split('/').slice(0, -1).join('/');
  if (parent && rootPath && parent.startsWith(rootPath)) {
    loadDir(parent);
  } else if (parent && !rootPath) {
    loadDir(parent);
  }
}

/**
 * Check if we can navigate to parent (not at project root).
 */
function canNavigateUp(): boolean {
  const project = getActiveProject();
  const rootPath = project?.path;
  if (!rootPath) return !!currentPath.value;
  return currentPath.value !== rootPath && currentPath.value.startsWith(rootPath);
}

/**
 * Open a file or navigate into a directory.
 */
function openEntry(entry: FileEntry): void {
  if (entry.is_dir) {
    loadDir(entry.path);
  } else {
    document.dispatchEvent(new CustomEvent('file-opened', {
      detail: { path: entry.path, name: entry.name }
    }));
  }
}

/**
 * FileTree component.
 * Renders a navigable file tree for the active project directory.
 * Supports flat mode (drill-down) and tree mode (collapsible hierarchy).
 */
export function FileTree() {
  useEffect(() => {
    function handleProjectChanged() {
      setTimeout(() => {
        const project = getActiveProject();
        if (project && project.path) {
          loadDir(project.path);
          if (viewMode.value === 'tree') {
            initTree();
          }
        }
      }, 50);
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Initial load
    const project = getActiveProject();
    if (project && project.path) {
      loadDir(project.path);
      if (viewMode.value === 'tree') {
        initTree();
      }
    }

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
    };
  }, []);

  /**
   * Keyboard navigation handler for flat mode.
   */
  function handleFlatKeydown(e: KeyboardEvent): void {
    if (!loaded.value || entries.value.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, entries.value.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (entries.value[selectedIndex.value]) {
          openEntry(entries.value[selectedIndex.value]);
        }
        break;
      case 'Backspace': {
        e.preventDefault();
        navigateToParent();
        break;
      }
    }
  }

  /**
   * Keyboard navigation handler for tree mode.
   */
  function handleTreeKeydown(e: KeyboardEvent): void {
    const flat = flattenedTree.value;
    if (flat.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, flat.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
        break;
      case 'Enter': {
        e.preventDefault();
        const node = flat[selectedIndex.value];
        if (!node) break;
        if (node.entry.is_dir) {
          toggleTreeNode(node);
        } else {
          document.dispatchEvent(new CustomEvent('file-opened', {
            detail: { path: node.entry.path, name: node.entry.name }
          }));
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const node = flat[selectedIndex.value];
        if (node?.entry.is_dir && !node.expanded) {
          toggleTreeNode(node);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const node = flat[selectedIndex.value];
        if (!node) break;
        if (node.entry.is_dir && node.expanded) {
          // Collapse expanded folder
          toggleTreeNode(node);
        } else {
          // Move to parent folder
          const parent = findParentNode(node, flat);
          if (parent) {
            const parentIdx = flat.indexOf(parent);
            if (parentIdx >= 0) selectedIndex.value = parentIdx;
          }
        }
        break;
      }
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (viewMode.value === 'flat') {
      handleFlatKeydown(e);
    } else {
      handleTreeKeydown(e);
    }
  }

  function switchToFlat() {
    viewMode.value = 'flat';
    selectedIndex.value = 0;
  }

  function switchToTree() {
    viewMode.value = 'tree';
    selectedIndex.value = 0;
    if (treeNodes.value.length === 0) {
      initTree();
    }
  }

  const bgColor = fileTreeBgColor.value || colors.bgDeep;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: bgColor, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ gap: 6, padding: '6px 12px', backgroundColor: colors.bgBase, borderBottom: `1px solid ${colors.bgBorder}`, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>File Tree</span>

        {/* Parent nav button -- flat mode only */}
        {viewMode.value === 'flat' && canNavigateUp() && (
          <span
            onClick={navigateToParent}
            style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted, cursor: 'pointer', userSelect: 'none' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            title="Navigate to parent directory"
          >..</span>
        )}

        <span style={{ flex: 1 }} />

        {/* Mode toggle */}
        <span
          onClick={switchToFlat}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
          title="Flat mode"
        >
          <ListIcon active={viewMode.value === 'flat'} />
        </span>
        <span
          onClick={switchToTree}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
          title="Tree mode"
        >
          <TreeIcon active={viewMode.value === 'tree'} />
        </span>

        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
          {viewMode.value === 'flat' ? (currentPath.value || '~/Dev/efx-mux') : ''}
        </span>
      </div>
      {/* File list */}
      <div
        style={{ flex: 1, overflow: 'auto', padding: '4px 0', outline: 'none' }}
        tabIndex={0}
        onKeyDown={handleKeydown}
      >
        {viewMode.value === 'flat' ? (
          /* Flat mode rendering */
          !loaded.value ? (
            <div style={{ padding: 16, color: colors.textMuted, fontSize: fileTreeFontSize.value }}>Loading...</div>
          ) : entries.value.length === 0 ? (
            <div style={{ padding: 16, color: colors.textMuted, fontSize: fileTreeFontSize.value }}>Empty directory</div>
          ) : (
            entries.value.map((entry, i) => {
              const isSelected = selectedIndex.value === i;
              return (
                <div
                  key={entry.path}
                  style={{ padding: `${fileTreeLineHeight.value}px 12px`, gap: 8, display: 'flex', alignItems: 'center', cursor: 'pointer', backgroundColor: isSelected ? colors.bgElevated : 'transparent' }}
                  onClick={() => { selectedIndex.value = i; openEntry(entry); }}
                  onMouseEnter={() => { selectedIndex.value = i; }}
                >
                  {entry.is_dir
                    ? <FolderIcon />
                    : (entry.name.match(/\.(ts|tsx|js|jsx|rs|css)$/)
                        ? <FileCodeIcon />
                        : <FileTextIcon />
                      )
                  }
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--file-tree-font, Geist)', fontSize: fileTreeFontSize.value, color: isSelected ? colors.textPrimary : colors.textMuted }}>
                    {entry.name}
                  </span>
                  {!entry.is_dir && entry.size != null && (
                    <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, marginLeft: 'auto', flexShrink: 0 }}>
                      {formatSize(entry.size)}
                    </span>
                  )}
                </div>
              );
            })
          )
        ) : (
          /* Tree mode rendering */
          flattenedTree.value.length === 0 ? (
            <div style={{ padding: 16, color: colors.textMuted, fontSize: fileTreeFontSize.value }}>Loading...</div>
          ) : (
            flattenedTree.value.map((node, i) => {
              const isSelected = selectedIndex.value === i;
              const paddingLeft = 12 + (node.depth * 16);
              return (
                <div
                  key={node.entry.path + '-' + node.depth}
                  style={{
                    padding: `${fileTreeLineHeight.value}px 12px`,
                    paddingLeft,
                    gap: 6,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? colors.bgElevated : 'transparent',
                  }}
                  onClick={() => {
                    selectedIndex.value = i;
                    if (node.entry.is_dir) {
                      toggleTreeNode(node);
                    } else {
                      document.dispatchEvent(new CustomEvent('file-opened', {
                        detail: { path: node.entry.path, name: node.entry.name }
                      }));
                    }
                  }}
                  onMouseEnter={() => { selectedIndex.value = i; }}
                >
                  {/* Chevron for folders, spacer for files */}
                  {node.entry.is_dir ? (
                    <span style={{ display: 'flex', alignItems: 'center', width: 10, flexShrink: 0 }}>
                      <ChevronIcon expanded={node.expanded} />
                    </span>
                  ) : (
                    <span style={{ width: 10, flexShrink: 0 }} />
                  )}
                  {node.entry.is_dir
                    ? <FolderIcon />
                    : (node.entry.name.match(/\.(ts|tsx|js|jsx|rs|css)$/)
                        ? <FileCodeIcon />
                        : <FileTextIcon />
                      )
                  }
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--file-tree-font, Geist)', fontSize: fileTreeFontSize.value, color: isSelected ? colors.textPrimary : colors.textMuted }}>
                    {node.entry.name}
                  </span>
                  {!node.entry.is_dir && node.entry.size != null && (
                    <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, marginLeft: 'auto', flexShrink: 0 }}>
                      {formatSize(node.entry.size)}
                    </span>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
````

## File: src/components/gsd-viewer.tsx
````typescript
// gsd-viewer.tsx -- GSD Markdown viewer with checkbox write-back + auto-refresh
// D-01: Checkbox write-back via write_checkbox Rust command
// D-02: marked.js renders markdown with task checkboxes
// D-03: Auto-refresh on md-file-changed Tauri event

import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { marked } from 'marked';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { colors } from '../tokens';

/**
 * Build a map of checkbox index -> line number (0-indexed).
 * Scans markdown text for task list items: `- [ ]`, `- [x]`, `* [ ]`, `* [x]`.
 */
function buildLineMap(text: string): number[] {
  const lines = text.split('\n');
  const lineMap: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-*]\s*\[[ xX]\]/.test(lines[i])) {
      lineMap.push(i);
    }
  }
  return lineMap;
}

/**
 * Inject data-line attributes into rendered HTML.
 * Finds <input> checkboxes and wraps their parent <li> with data-line.
 */
function injectLineNumbers(renderedHtml: string, lineMap: number[]): string {
  let checkboxIndex = 0;
  return renderedHtml.replace(
    /<input type="checkbox" class="task-checkbox"([^>]*)>/g,
    (_match: string, attrs: string) => {
      const line = lineMap[checkboxIndex] !== undefined ? lineMap[checkboxIndex] : -1;
      checkboxIndex++;
      return `<input type="checkbox" class="task-checkbox" data-line="${line}"${attrs}>`;
    }
  );
}

// Configure marked with custom checkbox renderer (D-02)
marked.use({
  renderer: {
    checkbox({ checked }: { checked: boolean }) {
      return `<input type="checkbox" class="task-checkbox"${checked ? ' checked' : ''}>`;
    }
  }
});

/**
 * GSD Viewer component.
 * Renders markdown with interactive checkboxes that write back to the .md file.
 * Auto-refreshes when the watched .md file changes externally.
 */
export function GSDViewer() {
  const contentRef = useRef<HTMLDivElement>(null);
  const currentPathRef = useRef<string | null>(null);

  /**
   * Get the active project from signals.
   */
  function getActiveProject(): ProjectEntry | undefined {
    return projects.value.find(p => p.name === activeProjectName.value);
  }

  useEffect(() => {
    /**
     * Load and render the GSD markdown file for a project.
     */
    async function loadGSD(project: ProjectEntry) {
      if (!project || !project.path) return;
      const gsdFile = project.gsd_file || 'PLAN.md';
      const path = project.path + '/' + gsdFile;
      currentPathRef.current = path;

      try {
        const content = await invoke<string>('read_file_content', { path });
        const lineMap = buildLineMap(content);
        const rendered = marked.parse(content, { async: false }) as string;
        const withLines = injectLineNumbers(rendered, lineMap);
        if (contentRef.current) {
          contentRef.current.innerHTML = withLines;
        }
      } catch (err) {
        console.warn('[efxmux] Failed to load GSD file:', err);
        if (contentRef.current) {
          contentRef.current.innerHTML = `<div class="p-4 text-text text-[13px]">No GSD file found (${gsdFile})</div>`;
        }
      }
    }

    // Listen for md-file-changed Tauri event (D-03: auto-refresh)
    let unlistenFn: (() => void) | null = null;
    listen('md-file-changed', () => {
      const project = getActiveProject();
      if (project && currentPathRef.current) {
        loadGSD(project);
      }
    }).then(fn => { unlistenFn = fn; });

    // Listen for project-changed DOM event (re-render when project switches)
    function handleProjectChanged() {
      setTimeout(() => {
        const project = getActiveProject();
        if (project) loadGSD(project);
      }, 50);
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Initial load when component mounts
    const project = getActiveProject();
    if (project) loadGSD(project);

    return () => {
      if (unlistenFn) unlistenFn();
      document.removeEventListener('project-changed', handleProjectChanged);
    };
  }, []);

  /**
   * Handle checkbox click events (D-01: write-back).
   * Delegates from container to avoid per-checkbox listeners.
   */
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('task-checkbox')) return;
    const input = target as HTMLInputElement;
    const line = parseInt(input.dataset.line || '', 10);
    if (isNaN(line) || line < 0) return;
    const checked = input.checked;
    if (!currentPathRef.current) return;
    invoke('write_checkbox', { path: currentPathRef.current, line, checked }).catch((err: unknown) => {
      console.error('[efxmux] write_checkbox failed:', err);
      // Revert checkbox visual state on error
      input.checked = !checked;
    });
  }

  return (
    <div
      class="h-full overflow-y-auto bg-bg-terminal p-1 flex flex-col"
      onClick={handleClick}
    >
      <div
        ref={contentRef}
        class="file-viewer-markdown flex-1 m-0 overflow-auto text-[14px] leading-relaxed"
        style={{ fontFamily: 'Geist, system-ui, sans-serif', color: colors.textMuted, padding: '6px' }}
      >
        <div class="text-text text-[13px]">Loading GSD...</div>
      </div>
    </div>
  );
}
````

## File: src/components/right-panel.tsx
````typescript
// right-panel.tsx -- Right panel with tabbed views and Bash Terminal
// D-11: Tab bars for right-top (GSD/Diff/File Tree) and right-bottom (Bash)
// D-12: Bash terminal lazy-connects via connectPty on first tab selection
// Phase 10: Navy-blue palette rewrite (Plan 06)

import { useEffect, useRef } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { rightTopTab, rightBottomTab, loadAppState, activeProjectName, projects } from '../state-manager';
import { getTheme, registerTerminal } from '../theme/theme-manager';
import { colors } from '../tokens';
import { TabBar } from './tab-bar';
import { GSDViewer } from './gsd-viewer';
import { DiffViewer } from './diff-viewer';
import { FileTree } from './file-tree';

const RIGHT_TOP_TABS = ['File Tree', 'GSD', 'Diff'];
const RIGHT_BOTTOM_TABS = ['Bash'];

/**
 * RightPanel component.
 * Two sub-panels separated by a horizontal split handle.
 * Right-top: GSD Viewer, Diff Viewer, File Tree (tabbed)
 * Right-bottom: Bash Terminal (tabbed, lazy-connected)
 */
export function RightPanel() {
  const bashContainerRef = useRef<HTMLDivElement>(null);
  const bashConnected = useRef(false);
  const bashSessionRef = useRef('');

  // Auto-switch to Diff tab when a file is clicked in sidebar GIT CHANGES
  useEffect(() => {
    function handleOpenDiff() {
      rightTopTab.value = 'Diff';
    }
    document.addEventListener('open-diff', handleOpenDiff);
    return () => {
      document.removeEventListener('open-diff', handleOpenDiff);
    };
  }, []);

  // Lazy-connect bash terminal on mount
  useEffect(() => {
    async function connectBashTerminal() {
      const container = bashContainerRef.current;
      if (!container || bashConnected.current) return;

      try {
        const { createTerminal } = await import('../terminal/terminal-manager');
        const { connectPty } = await import('../terminal/pty-bridge');
        const { attachResizeHandler } = await import('../terminal/resize-handler');

        const activeName = activeProjectName.value;
        const appState = await loadAppState();
        const sessionName = activeName
          ? activeName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() + '-right'
          : (appState?.session?.['right-tmux-session'] || 'efx-mux-right');
        bashSessionRef.current = sessionName;

        const theme = getTheme();
        const { terminal, fitAddon } = createTerminal(container, {
          theme: theme?.terminal,
          font: theme?.chrome?.font,
          fontSize: theme?.chrome?.fontSize || 13,
          sessionName,
        });
        registerTerminal(terminal, fitAddon);

        const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
        await connectPty(terminal, sessionName, activeProject?.path);
        bashConnected.current = true;

        setTimeout(() => {
          fitAddon.fit();
          attachResizeHandler(container, terminal, fitAddon, sessionName);
        }, 100);
      } catch (err) {
        console.error('[efxmux] Failed to connect bash terminal:', err);
      }
    }

    // Listen for project switch events (silent via Rust command)
    function handleSwitchBash(e: Event) {
      const { currentSession, targetSession, startDir } = (e as CustomEvent).detail;
      if (!currentSession) return;
      invoke('switch_tmux_session', {
        currentSession,
        targetSession,
        startDir: startDir ?? null,
      }).catch((err) => console.error('[efxmux] Failed to switch bash session:', err));
    }

    document.addEventListener('switch-bash-session', handleSwitchBash);

    // Initial connection
    setTimeout(() => connectBashTerminal(), 200);

    return () => {
      document.removeEventListener('switch-bash-session', handleSwitchBash);
    };
  }, []);

  return (
    <aside class="right-panel" aria-label="Right panel" style={{ backgroundColor: colors.bgBase, borderLeft: `1px solid ${colors.bgBorder}` }}>
      {/* Top panel: GSD / Diff / File Tree */}
      <div class="right-top flex flex-col min-h-0">
        <TabBar
          tabs={RIGHT_TOP_TABS}
          activeTab={rightTopTab}
          onSwitch={(tab) => { rightTopTab.value = tab; }}
        />
        <div class="right-top-content flex-1 min-h-0 overflow-hidden relative p-1">
          <div style={{ height: '100%', display: rightTopTab.value === 'GSD' ? 'block' : 'none' }}>
            <GSDViewer />
          </div>
          <div style={{ height: '100%', display: rightTopTab.value === 'Diff' ? 'block' : 'none' }}>
            <DiffViewer />
          </div>
          <div style={{ height: '100%', display: rightTopTab.value === 'File Tree' ? 'block' : 'none' }}>
            <FileTree />
          </div>
        </div>
      </div>

      {/* Split handle */}
      <div
        class="split-handle-h"
        data-handle="right-h"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize right panels"
      />

      {/* Bottom panel: Bash */}
      <div class="right-bottom flex flex-col min-h-0">
        <TabBar
          tabs={RIGHT_BOTTOM_TABS}
          activeTab={rightBottomTab}
          onSwitch={(tab) => { rightBottomTab.value = tab; }}
        />
        <div class="right-bottom-content flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: colors.bgDeep }}>
          <div
            ref={bashContainerRef}
            class="bash-terminal h-full"
            id="bash-terminal-container"
          />
        </div>
      </div>
    </aside>
  );
}
````

## File: src/components/sidebar.tsx
````typescript
// sidebar.tsx -- Project sidebar with projects, git status, git files, collapsed mode
// Restyled with Lucide icons, status dots, git badges (Phase 9)
// Visual rewrite to reference Sidebar pattern (Phase 10)

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { GitBranch, Plus, RotateCw, Settings, X } from 'lucide-preact';
import {
  projects,
  activeProjectName,
  sidebarCollapsed,
  getGitStatus,
  switchProject,
  getProjects,
  getActiveProject,
  removeProject,
} from '../state-manager';
import type { ProjectEntry, GitData } from '../state-manager';
import { openProjectModal } from './project-modal';
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';

// ---------------------------------------------------------------------------
// Local signals for sidebar-only state
// ---------------------------------------------------------------------------

const gitData = signal<Record<string, GitData>>({});
const gitFiles = signal<Array<{ name: string; path: string; status: string }>>([]);
const gitSectionOpen = signal(true);
const removeTarget = signal<string | null>(null);
const appVersion = signal<string>('');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Refresh git status for all projects. */
async function refreshAllGitStatus(): Promise<void> {
  const entries = await Promise.all(
    projects.value.map(async (p) => {
      try {
        const git = await getGitStatus(p.path);
        return { name: p.name, git };
      } catch {
        return { name: p.name, git: { branch: '', modified: 0, staged: 0, untracked: 0 } };
      }
    })
  );
  const newGitData: Record<string, GitData> = { ...gitData.value };
  for (const { name, git } of entries) {
    newGitData[name] = git;
  }
  gitData.value = newGitData;

  // Fetch file-level git data for the active project
  await refreshGitFiles();
}

/** Refresh file-level git entries for the active project. */
async function refreshGitFiles(): Promise<void> {
  const activeProject = projects.value.find(p => p.name === activeProjectName.value);
  if (!activeProject) {
    gitFiles.value = [];
    return;
  }
  try {
    const files = await invoke<Array<{ name: string; path: string; status: string }>>('get_git_files', { path: activeProject.path });
    gitFiles.value = files;
  } catch (err) {
    console.warn('[efxmux] Failed to fetch git files:', err);
    gitFiles.value = [];
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProjectRow({ project, index }: { project: ProjectEntry; index: number }) {
  const isActive = activeProjectName.value === project.name;
  const git = gitData.value[project.name] || { branch: '', modified: 0, staged: 0, untracked: 0 };

  return (
    <div
      class="group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['2xl'],
        padding: '10px 2px 10px 2px',
        borderRadius: radii.lg,
        backgroundColor: isActive ? colors.bgElevated : 'transparent',
        borderLeft: isActive ? `3px solid ${colors.accent}` : '3px solid transparent',
        cursor: 'pointer',
      }}
      title={project.path}
      data-index={index}
      onClick={async () => {
        if (isActive) return;
        try {
          await switchProject(project.name);
        } catch (err) {
          console.warn('[efxmux] Failed to switch project:', err);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        removeTarget.value = project.name;
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: isActive ? colors.statusGreen : colors.textDim,
          flexShrink: 0,
        }}
      />

      {/* Project info — matches reference ProjectItem */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            fontWeight: isActive ? 500 : 400,
            color: isActive ? colors.textPrimary : colors.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: isActive ? colors.accent : colors.textDim,
            }}
          >
            ⎇
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.textDim,
            }}
          >
            {git.branch || 'main'}
          </span>
        </div>
      </div>

      {/* Action buttons (edit + remove) — hidden until row hover */}
      <div
        class="project-row-actions"
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', opacity: 0, transition: 'opacity 0.15s' }}
      >
        <span
          style={{
            cursor: 'pointer',
            flexShrink: 0,
            color: colors.textMuted,
          }}
          class="hover:text-accent"
          title="Edit project settings"
          onClick={(e) => {
            e.stopPropagation();
            openProjectModal({ project });
          }}
        >
          <Settings size={12} />
        </span>
        <span
          style={{
            cursor: 'pointer',
            flexShrink: 0,
            color: colors.textMuted,
          }}
          class="hover:text-danger"
          title="Remove project"
          onClick={(e) => {
            e.stopPropagation();
            removeTarget.value = project.name;
          }}
        >
          <X size={12} />
        </span>
      </div>
    </div>
  );
}

function CollapsedIcon({ project, index }: { project: ProjectEntry; index: number }) {
  const isActive = activeProjectName.value === project.name;
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSizes.base,
        cursor: 'pointer',
        color: isActive ? colors.accent : colors.textMuted,
        position: 'relative',
      }}
      title={project.name}
      data-index={index}
      aria-label={`${project.name} project`}
      onClick={async () => {
        sidebarCollapsed.value = false;
        try {
          await switchProject(project.name);
        } catch (err) {
          console.warn('[efxmux] Failed to switch project:', err);
        }
      }}
    >
      {initial}
      {isActive && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.statusGreen,
            position: 'absolute',
            bottom: -2,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </div>
  );
}

function GitFileRow({ file }: { file: { name: string; path: string; status: string } }) {
  const badgeBg = file.status === 'M' ? colors.statusYellowBg :
    file.status === 'S' ? colors.statusGreenBg :
    colors.statusMutedBg;
  const badgeColor = file.status === 'M' ? colors.statusYellow :
    file.status === 'S' ? colors.statusGreen :
    colors.textMuted;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px',
        cursor: 'pointer',
      }}
      class="hover:bg-bg-raised"
      onClick={() => {
        document.dispatchEvent(new CustomEvent('open-diff', { detail: { path: file.path } }));
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 3,
          backgroundColor: badgeBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 600,
            color: badgeColor,
          }}
        >
          {file.status}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: colors.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {file.name}
      </span>
    </div>
  );
}

function RemoveDialog() {
  if (!removeTarget.value) return null;
  const name = removeTarget.value;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 101,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => { removeTarget.value = null; }}
    >
      <div
        style={{
          width: 360,
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgBorder}`,
          borderRadius: radii.xl,
          paddingBottom: spacing['5xl'],
        }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div
          style={{
            padding: `${spacing.lg}px ${spacing['4xl']}px`,
            fontSize: fontSizes.lg,
            fontFamily: fonts.sans,
            color: colors.textPrimary,
          }}
        >
          Remove {name}
        </div>
        <div
          style={{
            padding: `0 ${spacing['4xl']}px ${spacing.lg}px`,
            marginTop: spacing.sm,
            fontSize: fontSizes.base,
            fontFamily: fonts.sans,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          Remove this project from the sidebar?<br />
          The project files will not be deleted.
        </div>
        <div
          style={{
            padding: `${spacing.lg}px ${spacing['4xl']}px 0`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: spacing['2xl'],
          }}
        >
          <button
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${colors.bgBorder}`,
              color: colors.textMuted,
              padding: `${spacing.sm}px ${spacing['4xl']}px`,
              borderRadius: radii.sm,
              cursor: 'pointer',
              fontSize: fontSizes.base,
              fontFamily: fonts.sans,
            }}
            onClick={() => { removeTarget.value = null; }}
          >Cancel</button>
          <button
            style={{
              backgroundColor: colors.diffRed,
              border: 'none',
              color: 'white',
              padding: `${spacing.sm}px ${spacing['4xl']}px`,
              borderRadius: radii.sm,
              cursor: 'pointer',
              fontSize: fontSizes.base,
              fontFamily: fonts.sans,
            }}
            onClick={async () => {
              await removeProject(name);
              removeTarget.value = null;
              // Re-sync project list
              const updatedProjects = await getProjects();
              projects.value = updatedProjects;
              const active = await getActiveProject();
              activeProjectName.value = active;
            }}
          >Remove Project</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const git = computed(() => {
    if (!activeProjectName.value) return { branch: '', modified: 0, staged: 0, untracked: 0 };
    return gitData.value[activeProjectName.value] || { branch: '', modified: 0, staged: 0, untracked: 0 };
  });

  const totalChanges = computed(() => {
    const g = git.value;
    return (g.modified || 0) + (g.staged || 0) + (g.untracked || 0);
  });

  // Initialize sidebar data on mount
  useEffect(() => {
    async function init() {
      try {
        const [loadedProjects, active] = await Promise.all([getProjects(), getActiveProject()]);
        projects.value = loadedProjects;
        activeProjectName.value = active;
        // Note: Zero-project detection is handled by the wizard in main.tsx initProjects().
        // The sidebar must NOT open modals -- it only displays the project list.
        await refreshAllGitStatus();
        // Fetch app version
        const ver = await getVersion();
        appVersion.value = ver;
      } catch (err) {
        console.warn('[efxmux] Failed to load projects:', err);
      }
    }
    init();

    // Re-sync when project changes
    function handleProjectChanged(e: Event) {
      const detail = (e as CustomEvent).detail;
      activeProjectName.value = detail.name;
      refreshAllGitStatus();
    }

    // Refresh project list when a new project is added
    async function handleProjectAdded() {
      try {
        const updatedProjects = await getProjects();
        projects.value = updatedProjects;
      } catch (err) {
        console.warn('[efxmux] Failed to refresh projects after add:', err);
      }
    }

    // Listen for open-modal events (from "+" button)
    function handleOpenAddProject() {
      openProjectModal();
    }

    document.addEventListener('project-changed', handleProjectChanged);
    document.addEventListener('project-added', handleProjectAdded);
    document.addEventListener('open-add-project', handleOpenAddProject);

    // Listen for git-status-changed Tauri event (auto-refresh when git operations occur)
    let unlistenGit: (() => void) | undefined;
    listen('git-status-changed', () => {
      refreshAllGitStatus();
    }).then((unlisten) => {
      unlistenGit = unlisten;
    });

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
      document.removeEventListener('project-added', handleProjectAdded);
      document.removeEventListener('open-add-project', handleOpenAddProject);
      if (unlistenGit) unlistenGit();
    };
  }, []);

  return (
    <aside
      class={`sidebar${sidebarCollapsed.value ? ' collapsed' : ''}`}
      aria-label="Sidebar"
      style={{
        backgroundColor: colors.bgBase,
      }}
    >
      <RemoveDialog />

      <div class="sidebar-content">
        {sidebarCollapsed.value ? (
          <div
            class="sidebar-icons"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: spacing['2xl'],
              paddingTop: spacing.sm,
            }}
          >
            {projects.value.map((p, i) => (
              <CollapsedIcon key={p.name} project={p} index={i} />
            ))}
            <div style={{ height: spacing.sm }} />
            <div
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.textMuted,
                cursor: 'pointer',
              }}
              class="hover:text-accent"
              title="Add project"
              aria-label="Add project"
              onClick={() => { openProjectModal(); }}
            >
              <Plus size={14} />
            </div>
          </div>
        ) : (
          <div
            class="sidebar-content-full"
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            {/* Header — matches reference Sidebar.tsx SidebarHeader */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 16px 12px 12px',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  letterSpacing: '3px',
                }}
              >
                EFXMUX
                {appVersion.value && (
                  <span style={{ fontWeight: 400, letterSpacing: '1px', marginLeft: 6, color: colors.textMuted }}>
                    v{appVersion.value}
                  </span>
                )}
              </span>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: colors.accent,
                  color: 'white',
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: 'none',
                }}
                title="Add Project"
                aria-label="Add project"
                onClick={() => { openProjectModal(); }}
              >
                +
              </button>
            </div>

            {/* Projects section label — matches reference SectionLabel */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '1px 7px 4px',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '1.5px',
                  color: colors.textDim,
                }}
              >
                PROJECTS
              </span>
            </div>

            {/* Project list */}
            <div class="flex-1 overflow-y-auto">
              {projects.value.length === 0 ? (
                <div
                  style={{
                    padding: `${spacing['4xl']}px ${spacing.md}px`,
                    fontSize: fontSizes.base,
                    color: colors.textMuted,
                    textAlign: 'center',
                  }}
                >
                  No projects yet
                </div>
              ) : (
                projects.value.map((p, i) => (
                  <ProjectRow key={p.name} project={p} index={i} />
                ))
              )}
            </div>

            {/* Divider — matches reference */}
            <div style={{ padding: '10px 16px' }}>
              <div style={{ height: 1, width: '100%', backgroundColor: colors.bgBorder }} />
            </div>

            {/* Git section — matches reference SectionLabel + GitBranch + GitFile */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Section label with badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '1px 7px 4px',
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '1.5px',
                    color: colors.textDim,
                  }}
                >
                  GIT CHANGES
                </span>
                {totalChanges.value > 0 && (
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 10,
                      fontWeight: 600,
                      color: colors.accent,
                      backgroundColor: colors.accentMuted,
                      borderRadius: 8,
                      padding: '1px 6px',
                    }}
                  >
                    {totalChanges.value}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <div
                  style={{
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.textMuted,
                    cursor: 'pointer',
                  }}
                  class="hover:text-accent"
                  title="Refresh git status"
                  aria-label="Refresh git status"
                  onClick={async () => { await refreshAllGitStatus(); }}
                >
                  <RotateCw size={12} />
                </div>
              </div>

              {/* Branch name — matches reference GitBranch */}
              {git.value.branch && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px',
                  }}
                >
                  <span
                    style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted }}
                  >
                    {git.value.branch}
                  </span>
                </div>
              )}

              {/* Git file list — matches reference GitFile */}
              {gitFiles.value.length > 0 && (
                <div
                  class="flex-1 overflow-y-auto"
                  style={{ minHeight: 0 }}
                >
                  {gitFiles.value.map(f => (
                    <GitFileRow key={f.path} file={f} />
                  ))}
                </div>
              )}
              {gitFiles.value.length === 0 && totalChanges.value === 0 && (
                <div
                  style={{
                    padding: '4px',
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: colors.textMuted,
                  }}
                >
                  No changes
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
````

## File: src/terminal/terminal-manager.ts
````typescript
// terminal-manager.ts -- xterm.js lifecycle: create, mount, WebGL/DOM fallback
// Per D-06: retry WebGL once on context loss, then permanent DOM fallback
// Per D-07: silent fallback -- no visible indicator
// Per D-08: mount via querySelector, not Arrow.js ref
// Migrated to TypeScript (Phase 6.1)

import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';

export interface TerminalOptions {
  theme?: Record<string, string>;
  font?: string;
  fontSize?: number;
  /** tmux session name — required for Shift+Enter newline injection via send_literal_sequence */
  sessionName?: string;
}

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

/**
 * Create and mount an xterm.js Terminal instance.
 */
export function createTerminal(container: HTMLElement, options: TerminalOptions = {}): TerminalInstance {
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    fontSize: options.fontSize || 14,
    fontFamily: options.font ? `'${options.font}', monospace` : "'FiraCode Light', 'Fira Code', monospace",
    theme: options.theme || {
      background: '#111927',
      foreground: '#92a0a0',
      cursor: '#258ad1',
      selectionBackground: '#3e454a',
    },
    overviewRuler: { width: 10 },
    allowProposedApi: true,
  });

  // Word/line navigation: convert macOS shortcuts to terminal escape codes
  terminal.attachCustomKeyEventHandler((ev: KeyboardEvent): boolean => {
    if (ev.type !== 'keydown') return true;

    // Shift+Enter -> ESC+CR sequence for newline insert (Claude Code multi-line input)
    // By default xterm.js sends \r for both Enter and Shift+Enter. Claude Code recognises
    // \x1b\r (ESC followed by CR) as "meta+return" = insert newline. This is the same
    // sequence Claude Code's own /terminal-setup writes for non-native terminals (VS Code,
    // Alacritty, Warp). CSI u (\x1b[13;2u) requires the kitty keyboard protocol handshake
    // which efx-mux never initiates, so Claude Code ignores it.
    //
    // WHY NOT terminal.input(): terminal.input() routes through onData → write_pty →
    // PTY master → tmux client keyboard-input path. tmux with extended-keys=off does
    // NOT recognise extended sequences from the PTY and silently discards them.
    //
    // FIX: invoke send_literal_sequence which runs `tmux send-keys -l -t {session}`.
    // send-keys -l bypasses tmux's key-parsing table entirely and writes the raw bytes
    // directly to the pane's stdin. Claude Code receives \x1b\r and inserts a newline.
    if (ev.key === 'Enter' && ev.shiftKey && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      const sn = options.sessionName;
      if (sn) {
        invoke('send_literal_sequence', {
          sessionName: sn,
          sequence: '\x1b[13;2u',
        }).catch(() => {});
      }
      return false;
    }

    // Cmd+K -> clear terminal scrollback (standard macOS shortcut)
    if (ev.metaKey && !ev.ctrlKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      terminal.clear();
      return false;
    }

    // Cmd+Left -> beginning of line (Ctrl+A)
    if (ev.metaKey && ev.key === 'ArrowLeft') {
      ev.preventDefault();
      terminal.write('\x01'); // Ctrl+A - beginning of line
      return false;
    }
    // Cmd+Right -> end of line (Ctrl+E)
    if (ev.metaKey && ev.key === 'ArrowRight') {
      ev.preventDefault();
      terminal.write('\x05'); // Ctrl+E - end of line
      return false;
    }
    // Alt+Left -> word left (ESC b)
    if (ev.altKey && ev.key === 'ArrowLeft') {
      ev.preventDefault();
      terminal.write('\x1bb'); // ESC b - word backward
      return false;
    }
    // Alt+Right -> word right (ESC f)
    if (ev.altKey && ev.key === 'ArrowRight') {
      ev.preventDefault();
      terminal.write('\x1bf'); // ESC f - word forward
      return false;
    }
    // Block all Ctrl+key app shortcuts from reaching terminal (D-01, UX-01)
    if (ev.ctrlKey && !ev.metaKey) {
      const k = ev.key.toLowerCase();
      // App-claimed non-shift keys
      if (!ev.shiftKey && !ev.altKey && ['t', 'w', 'b', 's', 'p', 'k'].includes(k)) return false;
      // Ctrl+Tab
      if (ev.key === 'Tab' && !ev.shiftKey) return false;
      // Ctrl+? (Ctrl+Shift+/) and Ctrl+/
      if (k === '/' || ev.key === '?') return false;
      // Ctrl+Shift+T (theme toggle)
      if (k === 't' && ev.shiftKey) return false;
    }
    return true;
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Mount to DOM
  terminal.open(container);

  // Attempt WebGL renderer (D-06: retry once on context loss)
  let webglAttempts = 0;
  function tryWebGL(): void {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        webglAttempts++;
        if (webglAttempts < 2) {
          // Retry once (D-06)
          tryWebGL();
        }
        // If second attempt fails, DOM renderer stays active (D-07: silent, no indicator)
      });
      terminal.loadAddon(webgl);
    } catch (e: unknown) {
      // WebGL2 not available -- DOM renderer is the default, nothing to do (D-07)
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[efxmux] WebGL not available, using DOM renderer:', msg);
    }
  }
  tryWebGL();

  // Initial fit after mount
  fitAddon.fit();

  return {
    terminal,
    fitAddon,
    dispose(): void {
      terminal.dispose();
    },
  };
}
````

## File: src-tauri/src/lib.rs
````rust
// src-tauri/src/lib.rs
pub mod file_ops;
pub mod file_watcher;
pub mod git_status;
pub mod project;
pub mod server;
mod state;
mod terminal;
mod theme;

use std::collections::HashMap;
use tauri::Manager;
use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
use terminal::pty::{ack_bytes, check_tmux, cleanup_dead_sessions, destroy_pty_session, get_agent_version, get_pty_sessions, resize_pty, send_literal_sequence, spawn_terminal, write_pty, PtyManager};
use theme::iterm2::import_iterm2_theme;
use server::{detect_agent, kill_all_servers, restart_server, start_server, stop_server, ServerProcesses};
use state::{get_config_dir, load_state, save_state, ManagedAppState};
use theme::types::load_theme;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── macOS Application menu (first submenu = app name menu on macOS) ──
            let app_menu = SubmenuBuilder::new(app, "Efxmux")
                .item(&PredefinedMenuItem::about(app, None, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            // ── Edit menu — wires Cmd+C/V/X/A to WKWebView clipboard (per D-16) ──
            // PredefinedMenuItem maps to OS-level accelerators; WKWebView inherits.
            // @tauri-apps/plugin-clipboard-manager NOT needed for Cmd+C/V.
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            // ── Window menu ───────────────────────────────────────────────────────
            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .build()?;

            // Build and set the full menu
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;

            // Augment PATH for bundled app: macOS .app bundles inherit a minimal PATH
            // (/usr/bin:/bin:/usr/sbin:/sbin) that excludes Homebrew. Prepend known
            // Homebrew and user-local bin directories so tmux (and agent CLIs like
            // claude, opencode) are found regardless of launch method.
            {
                let current_path = std::env::var("PATH").unwrap_or_default();
                let extra = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin";
                if !current_path.contains("/opt/homebrew/bin") {
                    let augmented = format!("{}:{}", extra, current_path);
                    std::env::set_var("PATH", &augmented);
                    println!("[efx-mux] Augmented PATH for bundle: {}", augmented);
                }
            }

            // Ensure ~/.config/efx-mux/ exists before anything reads it
            state::ensure_config_dir();
            theme::types::ensure_config_dir();

            // Load initial state into Tauri managed state (for close handler, WR-03)
            let initial_state = state::load_state_sync();
            app.manage(ManagedAppState(std::sync::Mutex::new(initial_state)));

            // Initialize PtyManager for multi-session PTY support (D-09)
            app.manage(PtyManager(std::sync::Mutex::new(HashMap::new())));

            // Initialize ServerProcesses managed state for per-project server management (Phase 7, 07-06)
            app.manage(ServerProcesses(std::sync::Mutex::new(HashMap::new())));

            // Start theme file watcher (D-09: watch theme.json for changes)
            let app_handle = app.handle().clone();
            theme::watcher::start_theme_watcher(app_handle);

            // Probe for tmux availability (D-01)
            // If tmux is missing, the frontend will show a modal.
            match check_tmux() {
                Ok(version) => println!("[efx-mux] tmux found: {}", version),
                Err(e) => eprintln!("[efx-mux] WARNING: {}", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands (D-09: session-aware via PtyManager)
            spawn_terminal,
            write_pty,
            resize_pty,
            ack_bytes,
            get_pty_sessions,
            destroy_pty_session,
            cleanup_dead_sessions,

            // Theme
            load_theme,
            import_iterm2_theme,

            // State
            load_state,
            save_state,
            get_config_dir,

            // Git
            git_status::get_git_status,
            git_status::get_git_files,

            // Projects
            project::add_project,
            project::update_project,
            project::remove_project,
            project::switch_project,
            project::get_projects,
            project::get_active_project,

            // Phase 6: File operations (D-04, D-06, D-01)
            file_ops::get_file_diff,
            file_ops::list_directory,
            file_ops::read_file_content,
            file_ops::read_file,
            file_ops::write_checkbox,

            // Phase 6: File watcher (D-02)
            file_watcher::set_project_path,

            // Workspace switching
            terminal::pty::switch_tmux_session,

            // Shift+Enter newline: send literal sequence directly to tmux pane stdin
            send_literal_sequence,

            // Agent version detection (D-17)
            get_agent_version,

            // Phase 7: Server process management
            start_server,
            stop_server,
            restart_server,
            detect_agent,
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill ALL server processes on close (07-06: per-project HashMap, T-07-10)
                kill_all_servers(&window.app_handle());

                // Synchronously save the latest in-memory state to disk.
                // This guarantees state.json is written even if the JS
                // beforeunload async invoke did not complete (WR-03 fix).
                let managed = window.state::<ManagedAppState>();
                let snapshot = managed.0.lock().ok().map(|g| g.clone());
                if let Some(ref s) = snapshot {
                    if let Err(e) = state::save_state_sync(s) {
                        eprintln!("[efxmux] WARNING: Failed to save state on close: {}", e);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    // Kill ALL server processes on Cmd+Q / app quit (07-09: T-07-10)
                    // Both ExitRequested and Exit are handled to cover all exit paths:
                    // - ExitRequested fires when last window closes naturally
                    // - Exit fires unconditionally on app termination (Cmd+Q, menu quit)
                    kill_all_servers(app_handle);

                    // Synchronously save the latest in-memory state to disk.
                    let managed = app_handle.state::<ManagedAppState>();
                    let snapshot = managed.0.lock().ok().map(|g| g.clone());
                    if let Some(ref s) = snapshot {
                        if let Err(e) = state::save_state_sync(s) {
                            eprintln!("[efxmux] WARNING: Failed to save state on quit: {}", e);
                        }
                    }
                }
                _ => {}
            }
        });
}
````

## File: src-tauri/Cargo.toml
````toml
[package]
name = "gsd-mux"
version = "0.2.2"
description = "Terminal Multiplexer for AI-Assisted Development"
authors = ["Laurent Marques"]
edition = "2021"

[lib]
name = "gsd_mux_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.9.0"
notify = { version = "8.2", features = ["serde"] }
notify-debouncer-mini = "0.7"
git2 = "0.20.4"
regex = "1"
libc = "0.2"

[dev-dependencies]
tempfile = "3"
````

## File: src-tauri/src/terminal/pty.rs
````rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};

/// High watermark: pause PTY reads when unacknowledged bytes exceed this threshold.
const FLOW_HIGH_WATERMARK: u64 = 400_000;

/// Low watermark: resume PTY reads when unacknowledged bytes drop below this threshold.
/// Hysteresis prevents rapid pause/resume oscillation (HIGH=400KB pause, LOW=100KB resume).
const FLOW_LOW_WATERMARK: u64 = 100_000;

/// Per-session PTY state holding handles and flow control counters.
pub struct PtyState {
    pub writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    /// Tracks cumulative bytes sent to frontend (cloned into read thread before struct creation).
    #[allow(dead_code)]
    pub sent_bytes: Arc<AtomicU64>,
    pub acked_bytes: Arc<AtomicU64>,
    /// Must stay alive until child exits (portable-pty gotcha from CLAUDE.md).
    #[allow(dead_code)]
    pub slave: Arc<Mutex<Option<Box<dyn portable_pty::SlavePty + Send>>>>,
}

/// Tauri-managed wrapper for multiple named PTY sessions (D-09).
/// Replaces single PtyState managed by app.manage().
pub struct PtyManager(pub Mutex<HashMap<String, PtyState>>);

/// Probe for tmux availability. Returns version string or error with install instructions.
pub fn check_tmux() -> Result<String, String> {
    let output = std::process::Command::new("tmux")
        .arg("-V")
        .output()
        .map_err(|_| "tmux not found. Install with: brew install tmux".to_string())?;
    if !output.status.success() {
        return Err("tmux not found. Install with: brew install tmux".to_string());
    }
    String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())
        .map(|s| s.trim().to_string())
}

/// Spawn a terminal session inside tmux via portable-pty.
/// Streams PTY output to the frontend via a Tauri Channel.
#[tauri::command]
pub async fn spawn_terminal(
    app: tauri::AppHandle,
    on_output: tauri::ipc::Channel<Vec<u8>>,
    session_name: String,
    start_dir: Option<String>,
    shell_command: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    // Sanitize session_name: allow only alphanumeric, hyphen, underscore (T-02-01 mitigation)
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        return Err("Invalid session name: must contain at least one alphanumeric character".to_string());
    }

    // If the tmux session already exists, behaviour differs by tab type:
    //
    // AGENT TABS (shell_command is Some, e.g. "claude"):
    //   Kill the existing session so that `tmux new-session` below creates a FRESH one
    //   and runs the inline-export shell wrapper:
    //     export CLAUDE_CODE_NO_FLICKER=1 ...; claude; exec zsh
    //   Without killing first, `tmux new-session -A` merely RE-ATTACHES to the running
    //   session and the initial-command argument is silently ignored by tmux. The already-
    //   running claude process retains whatever environment it had when first launched,
    //   which may not include CLAUDE_CODE_NO_FLICKER=1 (e.g. sessions started before this
    //   fix was deployed). Only a fresh session guarantees the env var reaches claude.
    //
    // PLAIN SHELL TABS (shell_command is None):
    //   Re-attach to the existing session (preserve user shell state). Clear scrollback
    //   history to prevent stale content from being dumped to the new PTY client.
    let session_exists = std::process::Command::new("tmux")
        .args(["has-session", "-t", &sanitized])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if session_exists {
        if shell_command.as_deref().map(|s| !s.is_empty()).unwrap_or(false) {
            // Agent tab: kill the old session so the new-session command below creates
            // a fresh one with the correct environment (CLAUDE_CODE_NO_FLICKER=1 etc.)
            // baked into the inline-export shell wrapper. Ignoring the kill error is safe
            // -- if the session is already gone we still proceed to create a new one.
            let _ = std::process::Command::new("tmux")
                .args(["kill-session", "-t", &sanitized])
                .output();
        } else {
            // Plain shell tab: re-attach to the existing session.
            // Clear the scrollback history buffer ONLY -- do NOT send Ctrl+L.
            //
            // Sending `send-keys C-l` to an existing session fires a Ctrl+L keystroke
            // into whatever process is currently running (e.g., Claude Code's Ink TUI)
            // BEFORE the new PTY client attaches and establishes its window dimensions.
            // Ink interprets Ctrl+L as a clear-screen + full redraw. At that moment tmux
            // still has the stale dimensions from the previously detached client, so Ink
            // measures the wrong window size, its alternate-screen entry fails, and it
            // falls back to the "tmux detected · scroll with PgUp/PgDn" inline mode.
            //
            // clear-history alone is sufficient to prevent stale scrollback from being
            // dumped to the new client on attach.
            let _ = std::process::Command::new("tmux")
                .args(["clear-history", "-t", &sanitized])
                .output()
                .and_then(|o| {
                    if !o.status.success() {
                        let stderr = String::from_utf8_lossy(&o.stderr);
                        if !stderr.is_empty() {
                            eprintln!("[efxmux] clear-history warning: {}", stderr.trim());
                        }
                    }
                    Ok(o)
                });
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.env("TERM", "xterm-256color");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    // Inject Claude Code env vars directly into the PTY process environment.
    // macOS .app bundles launched by launchd receive a minimal environment —
    // user shell profile scripts (e.g. ~/.zshrc, custom wrapper scripts) are
    // NOT sourced. Any env vars the agent binary needs must be set explicitly here.
    //
    // CLAUDE_CODE_NO_FLICKER=1 suppresses the "tmux detected" fallback mode:
    // without it, Claude Code detects tmux and renders inline (non-fullscreen)
    // instead of using the alternate screen buffer (fullscreen TUI).
    cmd.env("CLAUDE_CODE_NO_FLICKER", "1");
    cmd.env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
    cmd.env("ENABLE_LSP_TOOL", "1");
    cmd.args(["new-session", "-A", "-s", &sanitized]);
    // Set tmux session start directory if provided (workspace-aware sessions)
    if let Some(ref dir) = start_dir {
        if std::path::Path::new(dir).is_dir() {
            cmd.args(["-c", dir]);
        }
    }
    // If shell_command is provided (e.g., agent binary), wrap it so the user
    // drops into an interactive shell after the agent exits (AGENT-03/04).
    // Plain `-c` is correct here — no login shell needed.
    // NOTE: cmd.env() calls above set vars on the tmux CLIENT process only.
    // tmux spawns the shell from the SERVER's environment, not the client's,
    // so those vars do NOT reach the shell. Env vars must be exported inline
    // inside the shell wrapper command (see format! below).
    if let Some(ref shell_cmd) = shell_command {
        if !shell_cmd.is_empty() {
            let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            // Inline export is required because tmux spawns shells from the SERVER's
            // environment, not the connecting client's. cmd.env() above sets vars on
            // the tmux CLIENT process only — those do NOT propagate into the shell that
            // tmux creates inside the session. Only inline export in the shell command
            // itself (or tmux -e flag) reliably delivers env vars to the spawned process.
            // This mirrors the approach already used in switch_tmux_session().
            let wrapped = format!(
                "{} -c 'export CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ENABLE_LSP_TOOL=1; {}; exec {}'",
                user_shell, shell_cmd, user_shell
            );
            cmd.arg(&wrapped);
        }
    }

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Enable tmux mouse mode so mouse wheel scrolls the buffer (not sent as arrow keys)
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "mouse", "on"])
        .output()
        .ok();

    // Set remain-on-exit so we can query exit code after process dies (D-08, UX-03)
    let _ = std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "remain-on-exit", "on"])
        .output();

    // Hide tmux green status bar -- reclaim the row for terminal content
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "status", "off"])
        .output()
        .ok();

    // take_writer() is one-shot -- store in Arc<Mutex<>> for reuse (CLAUDE.md gotcha)
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let sent_bytes = Arc::new(AtomicU64::new(0));
    let acked_bytes = Arc::new(AtomicU64::new(0));

    let state = PtyState {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
        sent_bytes: sent_bytes.clone(),
        acked_bytes: acked_bytes.clone(),
        slave: Arc::new(Mutex::new(Some(pair.slave))),
    };

    // Insert into PtyManager HashMap (D-09) instead of app.manage(state)
    let manager = app.state::<PtyManager>();
    let mut map = manager.0.lock().map_err(|e| e.to_string())?;
    map.insert(sanitized.clone(), state);
    drop(map);

    let sent = sent_bytes;
    let acked = acked_bytes;

    // Shared stop flag: monitoring thread sets this when pane dies,
    // read loop checks it to break out (since remain-on-exit keeps PTY alive).
    let stopped = Arc::new(AtomicBool::new(false));
    let stopped_for_reader = stopped.clone();

    // PTY read loop on dedicated OS thread (NOT tokio::spawn -- Research Pitfall 5)
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        let mut paused = false;
        loop {
            // Check if monitoring thread detected pane death
            if stopped_for_reader.load(Ordering::Relaxed) {
                break;
            }

            // Flow control: hysteresis between HIGH (400KB) and LOW (100KB) watermarks
            let unacked = sent.load(Ordering::Relaxed)
                .saturating_sub(acked.load(Ordering::Relaxed));

            if paused {
                // Resume only when unacked drops below LOW watermark
                if unacked <= FLOW_LOW_WATERMARK {
                    paused = false;
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    continue;
                }
            } else if unacked > FLOW_HIGH_WATERMARK {
                // Pause when unacked exceeds HIGH watermark
                paused = true;
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }

            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    sent.fetch_add(n as u64, Ordering::Relaxed);
                    if on_output.send(chunk).is_err() {
                        break; // Channel closed
                    }
                }
                Err(_) => break,
            }
        }
        // Read loop exited (EOF, error, or stopped flag). No exit detection here --
        // the monitoring thread handles that independently.
    });

    // --- Pane-death monitoring thread (08-05, UX-03, D-08) ---
    // remain-on-exit keeps the PTY master alive after shell exit, so the read loop
    // never gets EOF. This separate thread polls tmux pane_dead status to detect
    // process exit and emit pty-exited with the real exit code.
    let app_for_monitor = app.clone();
    let session_for_monitor = sanitized.clone();
    std::thread::spawn(move || {
        // Initial delay: let tmux stabilize after session creation
        std::thread::sleep(std::time::Duration::from_secs(1));

        loop {
            // Check if session still exists at all
            let session_exists = std::process::Command::new("tmux")
                .args(["has-session", "-t", &session_for_monitor])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            if !session_exists {
                // Session gone (external kill, tmux server died) -- emit exit code 0
                stopped.store(true, Ordering::Relaxed);
                let payload = serde_json::json!({
                    "session": session_for_monitor,
                    "code": 0
                });
                let _ = app_for_monitor.emit("pty-exited", payload);
                break;
            }

            // Poll pane_dead status
            let pane_dead = std::process::Command::new("tmux")
                .args(["display-message", "-t", &session_for_monitor, "-p", "#{pane_dead}"])
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        String::from_utf8(o.stdout).ok()
                    } else {
                        None
                    }
                })
                .map(|s| s.trim() == "1")
                .unwrap_or(false);

            if pane_dead {
                // Pane is dead -- query real exit code before killing session
                let exit_code = std::process::Command::new("tmux")
                    .args(["display-message", "-t", &session_for_monitor, "-p", "#{pane_dead_status}"])
                    .output()
                    .ok()
                    .and_then(|o| {
                        if o.status.success() {
                            String::from_utf8(o.stdout).ok()
                        } else {
                            None
                        }
                    })
                    .and_then(|s| s.trim().parse::<i32>().ok())
                    .unwrap_or(0); // T-08-05-02: default to 0 if parsing fails

                // Kill the dead session now that we have the exit code
                let _ = std::process::Command::new("tmux")
                    .args(["kill-session", "-t", &session_for_monitor])
                    .output();

                // Signal read loop to stop
                stopped.store(true, Ordering::Relaxed);

                // Emit pty-exited with real exit code
                let payload = serde_json::json!({
                    "session": session_for_monitor,
                    "code": exit_code
                });
                let _ = app_for_monitor.emit("pty-exited", payload);
                break;
            }

            // Poll every 500ms
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    Ok(())
}

/// Write input data to the PTY master (keystrokes from xterm.js).
#[tauri::command]
pub fn write_pty(data: String, session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let state = map.get(&session_name)
        .ok_or_else(|| format!("No PTY session found: {}", session_name))?;
    let mut writer = state.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize the PTY. This is a control operation that bypasses flow control (D-14).
#[tauri::command]
pub fn resize_pty(cols: u16, rows: u16, session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let state = map.get(&session_name)
        .ok_or_else(|| format!("No PTY session found: {}", session_name))?;
    let master = state.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

/// Acknowledge processed bytes from the frontend for flow control (D-11).
#[tauri::command]
pub fn ack_bytes(count: u64, session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let state = map.get(&session_name)
        .ok_or_else(|| format!("No PTY session found: {}", session_name))?;
    state.acked_bytes.fetch_add(count, Ordering::Relaxed);
    Ok(())
}

/// Switch a tmux client from one session to another without PTY output.
/// Creates the target session (detached) if it doesn't exist.
/// Runs tmux commands as system processes — completely silent in the terminal.
#[tauri::command]
pub fn switch_tmux_session(
    current_session: String,
    target_session: String,
    start_dir: Option<String>,
    shell_command: Option<String>,
) -> Result<(), String> {
    // Sanitize target session name
    let target: String = target_session
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if target.is_empty() {
        return Err("Invalid target session name".to_string());
    }

    // Create target session if it doesn't exist
    let has = std::process::Command::new("tmux")
        .args(["has-session", "-t", &target])
        .output();
    let needs_create = match has {
        Ok(out) => !out.status.success(),
        Err(_) => true,
    };
    if needs_create {
        let mut args = vec!["new-session", "-d", "-s", &target];
        let dir_str;
        if let Some(ref dir) = start_dir {
            if std::path::Path::new(dir).is_dir() {
                dir_str = dir.clone();
                args.push("-c");
                args.push(&dir_str);
            }
        }
        // If a shell command (agent binary) is specified, wrap it so the user
        // drops into an interactive shell after the agent exits (AGENT-03/04).
        // Env vars (CLAUDE_CODE_NO_FLICKER etc.) are already in the environment
        // inherited from the Tauri process via CommandBuilder in spawn_terminal.
        // switch_tmux_session creates sessions via std::process::Command (system
        // tmux) rather than a PTY CommandBuilder, so the env var must be passed
        // explicitly through the shell wrapper when needed.
        let shell_cmd_str;
        if let Some(ref cmd) = shell_command {
            if !cmd.is_empty() {
                let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                shell_cmd_str = format!(
                    "{} -c 'export CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ENABLE_LSP_TOOL=1; {}; exec {}'",
                    user_shell, cmd, user_shell
                );
                args.push(&shell_cmd_str);
            }
        }
        std::process::Command::new("tmux")
            .args(&args)
            .output()
            .map_err(|e| e.to_string())?;
    }

    // Enable mouse mode on target session
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &target, "mouse", "on"])
        .output()
        .ok();

    // Hide tmux green status bar on switched-to session
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &target, "status", "off"])
        .output()
        .ok();

    // Find the client attached to the current session
    let clients_out = std::process::Command::new("tmux")
        .args(["list-clients", "-t", &current_session, "-F", "#{client_name}"])
        .output();
    let client_name = match clients_out {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            s.lines().next().unwrap_or("").to_string()
        }
        Err(_) => String::new(),
    };

    if client_name.is_empty() {
        // Fallback: try switching without specifying client (works if only one client)
        std::process::Command::new("tmux")
            .args(["switch-client", "-t", &target])
            .output()
            .map_err(|e| e.to_string())?;
    } else {
        std::process::Command::new("tmux")
            .args(["switch-client", "-c", &client_name, "-t", &target])
            .output()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Destroy a PTY session: remove from PtyManager and drop all handles.
/// The read thread will exit when the master PTY fd is closed.
/// The tmux session is kept alive so tabs can be restored on project switch-back.
/// Stale screen content is handled by clearing history before re-attach in spawn_terminal.
#[tauri::command]
pub fn destroy_pty_session(session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let mut map = manager.0.lock().map_err(|e| e.to_string())?;
    // Remove drops the PtyState which closes the master PTY fd.
    // The read thread will get EOF and exit. The tmux client will detach.
    // The tmux session stays alive for re-attach on project switch-back.
    map.remove(&sanitized);

    Ok(())
}

/// List active PTY session names (debugging utility).
#[tauri::command]
pub fn get_pty_sessions(manager: tauri::State<'_, PtyManager>) -> Result<Vec<String>, String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    Ok(map.keys().cloned().collect())
}

/// Clean up dead tmux sessions left over from prior runs (08-05, UX-03).
/// Queries all tmux sessions for pane_dead=1 and kills them.
/// Called from JS on app startup to prevent reattaching to dead sessions.
#[tauri::command]
pub fn cleanup_dead_sessions() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}:#{pane_dead}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // No tmux server running -- nothing to clean up
        return Ok(vec![]);
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let mut cleaned = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() == 2 && parts[1] == "1" {
            let session_name = parts[0];
            let _ = std::process::Command::new("tmux")
                .args(["kill-session", "-t", session_name])
                .output();
            cleaned.push(session_name.to_string());
        }
    }

    Ok(cleaned)
}

/// Send a literal byte sequence directly to a tmux pane's stdin.
/// Uses `tmux send-keys -l` which bypasses tmux's key-parsing table entirely,
/// so sequences like \x1b[13;2u (CSI u / kitty keyboard protocol) reach the
/// inner program (e.g. Claude Code) without being eaten by tmux's key parser.
/// This is necessary because extended-keys=off means tmux does not recognise
/// CSI u when it arrives via the PTY master (keyboard-input path).
#[tauri::command]
pub fn send_literal_sequence(session_name: String, sequence: String) -> Result<(), String> {
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        return Err("Invalid session name".to_string());
    }
    std::process::Command::new("tmux")
        .args(["send-keys", "-t", &sanitized, "-l", &sequence])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get the version string of an AI agent binary (claude, opencode).
/// Validates agent name against a whitelist before executing (T-09-09 mitigation).
#[tauri::command]
pub async fn get_agent_version(agent: String) -> Result<String, String> {
    let valid_agents = ["claude", "opencode"];
    if !valid_agents.contains(&agent.as_str()) {
        return Err(format!("Unknown agent: {}", agent));
    }

    let output = std::process::Command::new(&agent)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run {} --version: {}", agent, e))?;

    if !output.status.success() {
        return Err(format!("{} --version exited with {}", agent, output.status));
    }

    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(version_str.lines().next().unwrap_or(&version_str).to_string())
}
````

## File: package.json
````json
{
  "name": "gsd-mux",
  "private": true,
  "version": "0.2.2",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "tauri": "tauri",
    "repomix": "npx repomix@latest --config repomix.config.json",
    "repomix:skill": "npx repomix@latest --skill-generate",
    "repomix:skill-remote": "npx repomix@latest --remote"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.10.5",
    "@tailwindcss/vite": "^4.2.2",
    "@tauri-apps/cli": "^2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/preact": "^3.2.4",
    "@vitest/coverage-v8": "^4.1.4",
    "@xterm/addon-web-links": "^0.12.0",
    "esbuild": "^0.28.0",
    "jsdom": "^29.0.2",
    "tailwindcss": "^4.2.2",
    "typescript": "^6.0.2",
    "vite": "^8.0.7",
    "vitest": "^4.1.4"
  },
  "dependencies": {
    "@preact/signals": "^2.9.0",
    "@tauri-apps/api": "^2.10.1",
    "@tauri-apps/plugin-dialog": "^2.7.0",
    "@tauri-apps/plugin-opener": "^2.5.3",
    "@xterm/addon-fit": "0.11.0",
    "@xterm/addon-webgl": "0.19.0",
    "@xterm/xterm": "6.0.0",
    "lucide-preact": "^1.8.0",
    "marked": "^14.1.4",
    "preact": "^10.29.1"
  }
}
````

## File: src/components/terminal-tabs.tsx
````typescript
// terminal-tabs.tsx -- Multi-tab terminal management for main panel (UX-02, D-04/D-05/D-06/D-07)
// Each tab is its own tmux session backed by a separate PTY.
// Tab state persists to state.json via updateSession (Pitfall 6).
// display:none/block preserves xterm.js scrollback + WebGL context.

import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { createTerminal, type TerminalOptions } from '../terminal/terminal-manager';
import { connectPty } from '../terminal/pty-bridge';
import { attachResizeHandler } from '../terminal/resize-handler';
import { registerTerminal, getTheme } from '../theme/theme-manager';
import { updateSession, activeProjectName, projects, getCurrentState } from '../state-manager';
import { detectAgent } from '../server/server-bridge';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalTab {
  id: string;
  sessionName: string;
  label: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  ptyConnected: boolean;
  disconnectPty?: () => void;
  detachResize?: () => void;
  exitCode?: number | null;  // undefined = running, number = exited
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export const terminalTabs = signal<TerminalTab[]>([]);
export const activeTabId = signal<string>('');
let tabCounter = 0;

/**
 * In-memory cache of tab metadata per project name.
 * Used to restore tabs when switching back to a previously visited project.
 * Key: project name, Value: array of { sessionName, label } for each tab.
 */
const projectTabCache = new Map<string, Array<{ sessionName: string; label: string }>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a tmux session name from a project name.
 * Sanitizes to alphanumeric + hyphen + underscore (matching pty.rs sanitization).
 */
function projectSessionName(projectName: string | null, suffix?: string): string {
  if (!projectName) return suffix ? `efx-mux-${suffix}` : 'efx-mux';
  const base = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

function getTerminalContainersEl(): HTMLElement | null {
  return document.querySelector('.terminal-containers');
}

/**
 * Wait for the next animation frame so the browser has laid out newly-appended
 * elements before FitAddon measures them. Without this, fitAddon.fit() reads
 * a zero-sized or default-sized (80-col) container and the PTY is spawned at
 * the wrong column count, causing paste truncation at col 80.
 */
function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function getThemeOptions(): TerminalOptions {
  const theme = getTheme();
  return {
    theme: theme?.terminal,
    font: theme?.chrome?.font,
    fontSize: theme?.chrome?.fontSize,
  };
}

async function getActiveProjectInfo(): Promise<{ path?: string; agent?: string } | null> {
  const activeName = activeProjectName.value;
  if (!activeName) return null;
  const project = projects.value.find(p => p.name === activeName);
  return project ? { path: project.path, agent: project.agent } : null;
}

async function resolveAgentBinary(agent?: string): Promise<string | undefined> {
  if (!agent || agent === 'bash') return undefined;
  try {
    return await detectAgent(agent);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Tab management functions (exported for keyboard handler)
// ---------------------------------------------------------------------------

/**
 * Create a new terminal tab with its own tmux session.
 */
export async function createNewTab(): Promise<TerminalTab | null> {
  const wrapper = getTerminalContainersEl();
  if (!wrapper) {
    console.error('[efxmux] .terminal-containers not found');
    return null;
  }

  tabCounter++;
  const id = `tab-${Date.now()}-${tabCounter}`;

  // Derive session name
  const activeName = activeProjectName.value;
  const sessionSuffix = tabCounter > 1 ? String(tabCounter) : undefined;
  const sessionName = projectSessionName(activeName, sessionSuffix);

  // Label: first tab gets agent name if configured
  const projectInfo = await getActiveProjectInfo();
  const isFirstTab = terminalTabs.value.length === 0;
  let label: string;
  if (isFirstTab && projectInfo?.agent && projectInfo.agent !== 'bash') {
    label = projectInfo.agent === 'claude' ? 'Claude' : projectInfo.agent === 'opencode' ? 'OpenCode' : `Terminal ${tabCounter}`;
  } else {
    label = `Terminal ${tabCounter}`;
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'absolute inset-0';
  container.style.display = 'none'; // Will be shown by switchToTab
  wrapper.appendChild(container);

  // Create terminal
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(container, { ...themeOpts, sessionName });
  registerTerminal(terminal, fitAddon);

  // Show the tab and register it before connecting PTY so switchToTab makes
  // the container visible and the browser can lay it out before we measure.
  const partialTab: TerminalTab = {
    id,
    sessionName,
    label,
    terminal,
    fitAddon,
    container,
    ptyConnected: false,
    disconnectPty: undefined,
    detachResize: undefined,
    exitCode: undefined,
  };
  terminalTabs.value = [...terminalTabs.value, partialTab];
  activeTabId.value = id;
  switchToTab(id);

  // Wait for browser layout so fitAddon.fit() reads the real container dimensions.
  // Without this, terminal.cols is the xterm.js default (80) and the PTY opens at
  // 80 cols — causing paste text to wrap at col 80 regardless of the visible width.
  await nextFrame();
  fitAddon.fit();

  // Connect PTY -- Ctrl+T tabs are always plain shell (UAT gap 1)
  const agentBinary = undefined;
  let disconnectPty: (() => void) | undefined;
  let ptyConnected = false;

  try {
    const conn = await connectPty(terminal, sessionName, projectInfo?.path, agentBinary);
    disconnectPty = conn.disconnect;
    ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY for tab:', err);
    terminal.writeln(`\x1b[33mFailed to connect PTY: ${err}\x1b[0m`);
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(container, terminal, fitAddon, sessionName);

  // Update the partial tab in-place with PTY connection results
  partialTab.ptyConnected = ptyConnected;
  partialTab.disconnectPty = disconnectPty;
  partialTab.detachResize = resizeHandle.detach;
  // Trigger reactivity
  terminalTabs.value = [...terminalTabs.value];

  persistTabState();

  return partialTab;
}

/**
 * Close the active terminal tab. If last tab, auto-creates a fresh one (D-07).
 */
export async function closeActiveTab(): Promise<void> {
  const tabs = terminalTabs.value;
  const currentId = activeTabId.value;
  const idx = tabs.findIndex(t => t.id === currentId);
  if (idx === -1) return;

  const tab = tabs[idx];
  // Destroy PTY session in Rust before disposing JS-side resources
  try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch {}
  disposeTab(tab);

  const remaining = tabs.filter(t => t.id !== currentId);
  terminalTabs.value = remaining;

  if (remaining.length === 0) {
    // D-07: closing last tab auto-creates fresh default
    await createNewTab();
  } else {
    // Switch to previous tab (or first)
    const newIdx = Math.min(idx, remaining.length - 1);
    activeTabId.value = remaining[newIdx].id;
    switchToTab(remaining[newIdx].id);
  }

  persistTabState();
}

/**
 * Close a specific tab by ID.
 */
export async function closeTab(tabId: string): Promise<void> {
  const tabs = terminalTabs.value;
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  // If this is the active tab, use closeActiveTab logic
  if (tabId === activeTabId.value) {
    await closeActiveTab();
    return;
  }

  const tab = tabs[idx];
  try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch {}
  disposeTab(tab);
  terminalTabs.value = tabs.filter(t => t.id !== tabId);
  persistTabState();
}

/**
 * Cycle to the next tab (wraps around).
 */
export function cycleToNextTab(): void {
  const tabs = terminalTabs.value;
  if (tabs.length <= 1) return;

  const idx = tabs.findIndex(t => t.id === activeTabId.value);
  const nextIdx = (idx + 1) % tabs.length;
  activeTabId.value = tabs[nextIdx].id;
  switchToTab(tabs[nextIdx].id);
}

/**
 * Get the active terminal + fitAddon, or null if no tabs.
 */
export function getActiveTerminal(): { terminal: Terminal; fitAddon: FitAddon } | null {
  const tab = terminalTabs.value.find(t => t.id === activeTabId.value);
  if (!tab) return null;
  return { terminal: tab.terminal, fitAddon: tab.fitAddon };
}

// ---------------------------------------------------------------------------
// Init first tab (called from main.tsx bootstrap)
// ---------------------------------------------------------------------------

/**
 * Initialize the first terminal tab during app bootstrap.
 * Replaces inline createTerminal + connectPty in main.tsx.
 */
export async function initFirstTab(
  themeOptions: TerminalOptions,
  sessionName: string,
  projectPath?: string,
  agentBinary?: string,
): Promise<{ terminal: Terminal; fitAddon: FitAddon } | null> {
  const wrapper = getTerminalContainersEl();
  if (!wrapper) {
    console.error('[efxmux] .terminal-containers not found');
    return null;
  }

  tabCounter++;
  const id = `tab-${Date.now()}-${tabCounter}`;

  // Label: use agent name if configured
  const activeName = activeProjectName.value;
  const activeProject = activeName ? projects.value.find(p => p.name === activeName) : null;
  let label: string;
  if (activeProject?.agent && activeProject.agent !== 'bash') {
    label = activeProject.agent === 'claude' ? 'Claude' : activeProject.agent === 'opencode' ? 'OpenCode' : 'Terminal 1';
  } else {
    label = 'Terminal 1';
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'absolute inset-0';
  wrapper.appendChild(container);

  // Create terminal
  const { terminal, fitAddon } = createTerminal(container, { ...themeOptions, sessionName });

  // Wait for browser layout before measuring. createTerminal calls fitAddon.fit()
  // synchronously, but the container was just appended — no layout has occurred yet.
  // Without this frame, terminal.cols stays at the xterm.js default (80) and the PTY
  // opens at 80 cols, causing paste text to wrap at col 80 regardless of visible width.
  await nextFrame();
  fitAddon.fit();

  // Connect PTY
  let disconnectPty: (() => void) | undefined;
  let ptyConnected = false;

  try {
    const conn = await connectPty(terminal, sessionName, projectPath, agentBinary);
    disconnectPty = conn.disconnect;
    ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to connect PTY:', err);
    terminal.writeln('\x1b[33mWarning: Could not attach to tmux session "' + sessionName + '":\x1b[0m ' + err);
    terminal.writeln('\x1b[33mIf tmux is not installed, run: brew install tmux\x1b[0m');
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(container, terminal, fitAddon, sessionName);

  const tab: TerminalTab = {
    id,
    sessionName,
    label,
    terminal,
    fitAddon,
    container,
    ptyConnected,
    disconnectPty,
    detachResize: resizeHandle.detach,
    exitCode: undefined,
  };

  terminalTabs.value = [tab];
  activeTabId.value = id;
  // Container is already visible (no display:none needed for first tab)

  persistTabState();

  return { terminal, fitAddon };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function switchToTab(tabId: string): void {
  const tabs = terminalTabs.value;
  for (const tab of tabs) {
    if (tab.id === tabId) {
      tab.container.style.display = 'block';
    } else {
      tab.container.style.display = 'none';
    }
  }
  // Defer focus+fit until after browser reflow (UAT gap 3)
  requestAnimationFrame(() => {
    const active = tabs.find(t => t.id === tabId);
    if (active) {
      active.fitAddon.fit();
      active.terminal.focus();
    }
  });
}

function disposeTab(tab: TerminalTab): void {
  tab.disconnectPty?.();
  tab.detachResize?.();
  tab.terminal.dispose();
  tab.container.remove();
}

// ---------------------------------------------------------------------------
// Tab persistence (Pitfall 6)
// ---------------------------------------------------------------------------

function persistTabState(): void {
  const activeName = activeProjectName.value;
  const tabs = terminalTabs.value.map(t => ({
    sessionName: t.sessionName,
    label: t.label,
  }));
  const data = JSON.stringify({ tabs, activeTabId: activeTabId.value });
  // Save under per-project key (and legacy flat key for backward compat)
  const patch: Record<string, string> = { 'terminal-tabs': data };
  if (activeName) {
    patch[`terminal-tabs:${activeName}`] = data;
  }
  updateSession(patch);
}

// ---------------------------------------------------------------------------
// Restart a tab's PTY session (for crash overlay)
// ---------------------------------------------------------------------------

export async function restartTabSession(tabId: string): Promise<void> {
  const tabs = terminalTabs.value;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Disconnect old PTY
  tab.disconnectPty?.();
  tab.detachResize?.();
  tab.terminal.dispose();

  // Clear exit code
  tab.exitCode = undefined;

  // New session name (increment suffix) — must be computed before createTerminal
  // so the key handler's sessionName closure captures the correct value.
  const projectInfo = await getActiveProjectInfo();
  tabCounter++;
  const newSessionSuffix = `r${tabCounter}`;
  const newSessionName = projectSessionName(activeProjectName.value, newSessionSuffix);

  // Create new terminal in same container
  tab.container.innerHTML = '';
  const themeOpts = getThemeOptions();
  const { terminal, fitAddon } = createTerminal(tab.container, { ...themeOpts, sessionName: newSessionName });
  registerTerminal(terminal, fitAddon);

  // Wait for browser layout before measuring, then fit — ensures the PTY opens
  // at the real container width instead of the 80-col xterm.js default.
  await nextFrame();
  fitAddon.fit();

  // Connect PTY
  const agentBinary = await resolveAgentBinary(projectInfo?.agent);
  try {
    const conn = await connectPty(terminal, newSessionName, projectInfo?.path, agentBinary);
    tab.disconnectPty = conn.disconnect;
    tab.ptyConnected = true;
  } catch (err) {
    console.error('[efxmux] Failed to restart PTY:', err);
    terminal.writeln(`\x1b[33mFailed to restart: ${err}\x1b[0m`);
    tab.ptyConnected = false;
  }

  // Attach resize handler
  const resizeHandle = attachResizeHandler(tab.container, terminal, fitAddon, newSessionName);
  tab.detachResize = resizeHandle.detach;

  tab.terminal = terminal;
  tab.fitAddon = fitAddon;
  tab.sessionName = newSessionName;

  // Trigger re-render
  terminalTabs.value = [...tabs];
  terminal.focus();
  fitAddon.fit();
  persistTabState();
}

// ---------------------------------------------------------------------------
// Clear all tabs (for project switch)
// ---------------------------------------------------------------------------

/**
 * Save current tabs to the per-project cache before clearing.
 * Call this with the OLD project name before switching away.
 */
export function saveProjectTabs(projectName: string): void {
  const tabs = terminalTabs.value;
  if (tabs.length > 0) {
    const tabMeta = tabs.map(t => ({
      sessionName: t.sessionName,
      label: t.label,
    }));
    projectTabCache.set(projectName, tabMeta);
    // Persist to disk so tabs survive app restart
    updateSession({
      [`terminal-tabs:${projectName}`]: JSON.stringify({ tabs: tabMeta, activeTabId: activeTabId.value }),
    });
  }
}

/**
 * Check if cached tabs exist for a project (in-memory or persisted on disk).
 */
export function hasProjectTabs(projectName: string): boolean {
  const cached = projectTabCache.get(projectName);
  if (cached && cached.length > 0) return true;
  // Also check persisted state on disk
  const state = getCurrentState();
  const persisted = state?.session?.[`terminal-tabs:${projectName}`];
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted);
      return parsed?.tabs?.length > 0;
    } catch { return false; }
  }
  return false;
}

/**
 * Restore tabs from the per-project cache (in-memory first, then disk).
 * Re-attaches to existing tmux sessions (whose history was cleared by
 * spawn_terminal in pty.rs to prevent stale content dump).
 * Returns true if tabs were restored, false if no cache exists.
 */
export async function restoreProjectTabs(
  projectName: string,
  projectPath?: string,
  agentBinary?: string,
): Promise<boolean> {
  let tabData: Array<{ sessionName: string; label: string }> | null = null;

  // Try in-memory cache first (from same-session project switch)
  const cached = projectTabCache.get(projectName);
  if (cached && cached.length > 0) {
    tabData = cached;
  }

  // Fall back to persisted state on disk (survives app restart)
  if (!tabData) {
    const state = getCurrentState();
    const persisted = state?.session?.[`terminal-tabs:${projectName}`];
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted);
        if (parsed?.tabs?.length > 0) {
          tabData = parsed.tabs;
        }
      } catch { /* ignore parse errors */ }
    }
  }

  if (!tabData || tabData.length === 0) return false;

  const restored = await restoreTabs(
    { tabs: tabData, activeTabId: '' },
    projectPath,
    agentBinary,
  );

  if (restored) {
    // Clear the in-memory cache entry since tabs are now live again
    projectTabCache.delete(projectName);
  }

  return restored;
}

export async function clearAllTabs(): Promise<void> {
  // Destroy PTY sessions in Rust so old PTY clients disconnect.
  // The tmux sessions are kept alive (not killed) so tabs can be restored
  // when switching back to this project. Stale screen content is cleared
  // by spawn_terminal before re-attaching.
  for (const tab of terminalTabs.value) {
    try {
      await invoke('destroy_pty_session', { sessionName: tab.sessionName });
    } catch {
      // Session may already be gone -- safe to ignore
    }
    disposeTab(tab);
  }
  terminalTabs.value = [];
  activeTabId.value = '';
  tabCounter = 0;
}

// ---------------------------------------------------------------------------
// Tab restoration (called from main.tsx bootstrap for session persistence)
// ---------------------------------------------------------------------------

/**
 * Restore tabs from persisted state.json data on app startup.
 * Returns true if at least 1 tab was restored, false otherwise.
 */
export async function restoreTabs(
  savedData: { tabs: Array<{ sessionName: string; label: string }>; activeTabId: string },
  projectPath?: string,
  agentBinary?: string,
): Promise<boolean> {
  if (!savedData?.tabs?.length) return false;

  const wrapper = getTerminalContainersEl();
  if (!wrapper) return false;

  const restoredTabs: TerminalTab[] = [];

  for (let i = 0; i < savedData.tabs.length; i++) {
    const saved = savedData.tabs[i];
    tabCounter++;
    const id = `tab-${Date.now()}-${tabCounter}`;

    // Create container — make it visible so the browser can lay it out and
    // fitAddon.fit() reads real dimensions. switchToTab will hide non-active tabs.
    const container = document.createElement('div');
    container.className = 'absolute inset-0';
    // Intentionally NOT setting display:none here — container must be visible for
    // fitAddon to measure the real column count before PTY spawn.
    wrapper.appendChild(container);

    // Create terminal — pass sessionName so the Shift+Enter key handler can invoke
    // send_literal_sequence with the correct tmux target.
    const themeOpts = getThemeOptions();
    const { terminal, fitAddon } = createTerminal(container, { ...themeOpts, sessionName: saved.sessionName });
    registerTerminal(terminal, fitAddon);

    // Wait for browser layout so fitAddon.fit() reads the real container width.
    // Without this, terminal.cols is 80 (xterm.js default) and the PTY opens at
    // 80 cols — causing paste text to wrap at col 80 regardless of visible width.
    await nextFrame();
    fitAddon.fit();

    // Hide after measuring — switchToTab will reveal the active tab.
    container.style.display = 'none';

    // Connect PTY -- first tab gets agent binary (it's the agent tab), rest are plain shell
    const shellCmd = (i === 0 && agentBinary) ? agentBinary : undefined;
    let disconnectPty: (() => void) | undefined;
    let ptyConnected = false;

    try {
      const conn = await connectPty(terminal, saved.sessionName, projectPath, shellCmd);
      disconnectPty = conn.disconnect;
      ptyConnected = true;
    } catch (err) {
      console.error('[efxmux] Failed to restore PTY for tab:', saved.sessionName, err);
      terminal.writeln(`\x1b[33mFailed to restore session "${saved.sessionName}": ${err}\x1b[0m`);
    }

    // Attach resize handler
    const resizeHandle = attachResizeHandler(container, terminal, fitAddon, saved.sessionName);

    restoredTabs.push({
      id,
      sessionName: saved.sessionName,
      label: saved.label,
      terminal,
      fitAddon,
      container,
      ptyConnected,
      disconnectPty,
      detachResize: resizeHandle.detach,
      exitCode: undefined,
    });
  }

  if (restoredTabs.length === 0) return false;

  terminalTabs.value = restoredTabs;

  // Activate the saved active tab (or first if saved ID no longer maps)
  // Since we generate new IDs, activate by index -- savedData.activeTabId won't match
  // Default to first tab
  activeTabId.value = restoredTabs[0].id;
  switchToTab(restoredTabs[0].id);

  persistTabState();
  return true;
}

// ---------------------------------------------------------------------------
// PTY exit event listener
// ---------------------------------------------------------------------------

listen<{ session: string; code: number }>('pty-exited', (event) => {
  const { session, code } = event.payload;
  const tabs = terminalTabs.value;
  const tab = tabs.find(t => t.sessionName === session);
  if (tab) {
    tab.exitCode = code;
    terminalTabs.value = [...tabs]; // trigger re-render
  }
});

// ---------------------------------------------------------------------------
// TerminalTabBar component (UI-SPEC Component 1)
// ---------------------------------------------------------------------------

import { CrashOverlay } from './crash-overlay';

export function TerminalTabBar() {
  const tabs = terminalTabs.value;
  const currentId = activeTabId.value;

  return (
    <div
      class="flex gap-1 px-2 py-2 shrink-0 items-center border-b"
      role="tablist"
      style={{ backgroundColor: colors.bgBase, borderColor: colors.bgBorder }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === currentId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            class="flex items-center gap-2 cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: isActive ? colors.bgElevated : 'transparent',
              border: isActive ? `1px solid ${colors.bgSurface}` : '1px solid transparent',
              borderRadius: 6,
              padding: '9px 16px',
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? colors.textPrimary : colors.textDim,
            }}
            onClick={() => {
              activeTabId.value = tab.id;
              switchToTab(tab.id);
            }}
            title={tab.sessionName}
          >
            {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.statusGreen, flexShrink: 0 }} />}
            <span>{tab.label}</span>
            <span
              class="ml-1 flex items-center justify-center"
              style={{ color: colors.textDim, fontSize: 14 }}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = colors.textPrimary; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = colors.textDim; }}
              title="Close tab"
            >{'\u00D7'}</span>
          </button>
        );
      })}
      {/* New tab button */}
      <button
        class="w-7 h-7 rounded flex items-center justify-center text-base cursor-pointer"
        style={{ color: colors.textDim, fontFamily: fonts.sans }}
        onMouseEnter={(e) => { const t = e.target as HTMLElement; t.style.color = colors.textPrimary; t.style.backgroundColor = colors.bgElevated; }}
        onMouseLeave={(e) => { const t = e.target as HTMLElement; t.style.color = colors.textDim; t.style.backgroundColor = 'transparent'; }}
        onClick={() => createNewTab()}
        title="New terminal tab (Ctrl+T)"
      >+</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active tab crash overlay rendering (used in main-panel.tsx)
// ---------------------------------------------------------------------------

export function ActiveTabCrashOverlay() {
  const tab = terminalTabs.value.find(t => t.id === activeTabId.value);
  if (!tab || tab.exitCode === undefined || tab.exitCode === null) return null;

  return (
    <CrashOverlay
      tab={tab}
      onRestart={() => restartTabSession(tab.id)}
    />
  );
}
````

## File: src/components/main-panel.tsx
````typescript
// main-panel.tsx -- Main panel with terminal-area + file viewer overlay + server-pane
// Phase 2: terminal-area is empty -- xterm.js mounts via querySelector (D-08)

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { marked } from 'marked';
import { ServerPane, serverPaneState } from './server-pane';
import { TerminalTabBar, ActiveTabCrashOverlay } from './terminal-tabs';
import { AgentHeader } from './agent-header';
import { colors } from '../tokens';

// Module-level signals for file viewer state
const fileViewerVisible = signal(false);
const fileName = signal('');
const filePath = signal('');
const fileContent = signal('');

function closeFileViewer(): void {
  fileViewerVisible.value = false;
  fileContent.value = '';
}

/**
 * Escape HTML entities for safe rendering in pre block.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Detect if a filename is a markdown file.
 */
function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(name);
}

/**
 * Detect file language from extension for syntax highlighting.
 */
function getLanguage(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    rs: 'rs', css: 'css', json: 'json', toml: 'toml', yaml: 'yaml', yml: 'yaml',
    html: 'html', htm: 'html', xml: 'html', svg: 'html',
    sh: 'sh', bash: 'sh', zsh: 'sh', fish: 'sh',
    py: 'py', rb: 'rb', go: 'go', java: 'java', c: 'c', cpp: 'c', h: 'c',
  };
  return ext ? (map[ext] || null) : null;
}

// Syntax token classes map to CSS classes: .syn-kw, .syn-str, .syn-cm, .syn-num, .syn-fn, .syn-op, .syn-type
// We keep this simple: regex-based line-by-line tokenization with no parser.

const KEYWORDS_JS = /\b(import|export|from|default|const|let|var|function|return|if|else|switch|case|break|for|while|do|new|this|class|extends|implements|interface|type|enum|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|void|delete|null|undefined|true|false|super|static|get|set|as|satisfies)\b/g;
const KEYWORDS_RS = /\b(fn|let|mut|const|pub|use|mod|struct|enum|impl|trait|type|where|match|if|else|for|while|loop|break|continue|return|self|Self|super|crate|true|false|as|in|ref|move|async|await|unsafe|extern|dyn|static|macro_rules)\b/g;
const KEYWORDS_PY = /\b(def|class|import|from|return|if|elif|else|for|while|break|continue|pass|yield|try|except|finally|raise|with|as|lambda|True|False|None|and|or|not|in|is|del|global|nonlocal|async|await)\b/g;
const KEYWORDS_GO = /\b(func|var|const|type|struct|interface|map|chan|go|select|case|default|if|else|for|range|return|break|continue|switch|defer|package|import|true|false|nil|make|len|cap|append|new)\b/g;
const KEYWORDS_SH = /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|export|local|readonly|source|set|unset|shift|true|false)\b/g;
const KEYWORDS_CSS = /\b(import|media|keyframes|font-face|supports|charset)\b/g;
const KEYWORDS_TOML = /\b(true|false)\b/g;

function getKeywordsPattern(lang: string): RegExp | null {
  switch (lang) {
    case 'ts': case 'js': return KEYWORDS_JS;
    case 'rs': return KEYWORDS_RS;
    case 'py': return KEYWORDS_PY;
    case 'go': return KEYWORDS_GO;
    case 'sh': return KEYWORDS_SH;
    case 'css': return KEYWORDS_CSS;
    case 'toml': case 'yaml': return KEYWORDS_TOML;
    case 'java': case 'c': return KEYWORDS_JS; // close enough for basic highlighting
    default: return null;
  }
}

/**
 * Simple syntax highlighter: produces HTML with <span class="syn-*"> tokens.
 * Works line-by-line. Handles strings, comments, numbers, keywords, and types.
 */
function highlightCode(code: string, lang: string): string {
  const escaped = escapeHtml(code);
  const lines = escaped.split('\n');
  let inBlockComment = false;

  const kwPattern = getKeywordsPattern(lang);

  return lines.map(line => {
    // Block comment handling (/* ... */)
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx >= 0) {
        inBlockComment = false;
        const commentPart = line.slice(0, endIdx + 2);
        const rest = line.slice(endIdx + 2);
        return `<span class="syn-cm">${commentPart}</span>${highlightLine(rest, lang, kwPattern)}`;
      }
      return `<span class="syn-cm">${line}</span>`;
    }

    const blockStart = line.indexOf('/*');
    if (blockStart >= 0 && !isInsideString(line, blockStart)) {
      const blockEnd = line.indexOf('*/', blockStart + 2);
      if (blockEnd >= 0) {
        // Single-line block comment
        const before = line.slice(0, blockStart);
        const comment = line.slice(blockStart, blockEnd + 2);
        const after = line.slice(blockEnd + 2);
        return `${highlightLine(before, lang, kwPattern)}<span class="syn-cm">${comment}</span>${highlightLine(after, lang, kwPattern)}`;
      } else {
        inBlockComment = true;
        const before = line.slice(0, blockStart);
        const comment = line.slice(blockStart);
        return `${highlightLine(before, lang, kwPattern)}<span class="syn-cm">${comment}</span>`;
      }
    }

    return highlightLine(line, lang, kwPattern);
  }).join('\n');
}

/** Check if a position is inside a string (approximate). */
function isInsideString(line: string, pos: number): boolean {
  let inSingle = false, inDouble = false, inBacktick = false;
  for (let i = 0; i < pos; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (ch === "'" && !inDouble && !inBacktick && prev !== '\\') inSingle = !inSingle;
    if (ch === '&' && line.slice(i, i + 6) === '&quot;' && !inSingle && !inBacktick) { inDouble = !inDouble; i += 5; continue; }
    if (ch === '`' && !inSingle && !inDouble && prev !== '\\') inBacktick = !inBacktick;
  }
  return inSingle || inDouble || inBacktick;
}

/** Highlight a single line (no block comment state). */
function highlightLine(line: string, lang: string, kwPattern: RegExp | null): string {
  if (!line) return line;

  // Line comments
  const commentMarkers = (lang === 'py' || lang === 'sh' || lang === 'yaml' || lang === 'toml') ? ['#'] : ['//'];
  for (const marker of commentMarkers) {
    const idx = line.indexOf(marker);
    if (idx >= 0 && !isInsideString(line, idx)) {
      const before = line.slice(0, idx);
      const comment = line.slice(idx);
      return `${tokenizeLine(before, lang, kwPattern)}<span class="syn-cm">${comment}</span>`;
    }
  }

  return tokenizeLine(line, lang, kwPattern);
}

/** Tokenize a line segment: strings, numbers, keywords, types. */
function tokenizeLine(segment: string, lang: string, kwPattern: RegExp | null): string {
  if (!segment) return segment;

  // Replace strings first (they shouldn't be keyword-highlighted)
  // Match &quot;...&quot;, '...', `...` (escaped quotes are already HTML entities)
  let result = segment.replace(/&quot;((?:[^&]|&(?!quot;))*)&quot;/g, '<span class="syn-str">&quot;$1&quot;</span>');
  result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '<span class="syn-str">\'$1\'</span>');
  result = result.replace(/`([^`]*)`/g, '<span class="syn-str">`$1`</span>');

  // Numbers (not inside tags already)
  result = result.replace(/(?<![a-zA-Z_"'>])(\b\d+\.?\d*(?:e[+-]?\d+)?\b)/g, '<span class="syn-num">$1</span>');

  // Keywords
  if (kwPattern) {
    result = result.replace(kwPattern, '<span class="syn-kw">$&</span>');
  }

  // Type-like identifiers (PascalCase words not already wrapped)
  result = result.replace(/(?<![<"'a-z])(\b[A-Z][a-zA-Z0-9]*\b)(?![^<]*>)/g, (match, p1) => {
    // Don't re-wrap if already inside a span
    return `<span class="syn-type">${p1}</span>`;
  });

  return result;
}

/**
 * Render file content based on type: markdown, code with highlighting, or plain text.
 */
function renderFileContent(name: string, content: string): { html: string; isMarkdown: boolean } {
  if (isMarkdownFile(name)) {
    const html = marked.parse(content, { async: false }) as string;
    return { html, isMarkdown: true };
  }

  const lang = getLanguage(name);
  if (lang) {
    return { html: highlightCode(content, lang), isMarkdown: false };
  }

  return { html: escapeHtml(content), isMarkdown: false };
}

export function MainPanel() {
  // Register show-file-viewer and Escape key listeners
  useEffect(() => {
    function handleShowFile(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        fileName.value = detail.name || '';
        filePath.value = detail.path || '';
        fileContent.value = detail.content || '';
        fileViewerVisible.value = true;
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && fileViewerVisible.value) {
        e.preventDefault();
        closeFileViewer();
      }
    }

    document.addEventListener('show-file-viewer', handleShowFile);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('show-file-viewer', handleShowFile);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  const rendered = fileViewerVisible.value
    ? renderFileContent(fileName.value, fileContent.value)
    : { html: '', isMarkdown: false };

  return (
    <main class="main-panel relative" aria-label="Main panel">
      <TerminalTabBar />
      <div class="terminal-area flex-1 bg-bg-terminal overflow-hidden relative min-h-[100px]">
        <AgentHeader />
        <div class="terminal-containers absolute inset-0" />
        <ActiveTabCrashOverlay />
      </div>

      {fileViewerVisible.value && (
        <div class="absolute inset-0 flex flex-col" style={{ backgroundColor: colors.bgBase, zIndex: 10 }}>
          <div class="flex items-center justify-between px-6 shrink-0" style={{ backgroundColor: colors.bgElevated, borderBottom: `1px solid ${colors.bgBorder}`, height: 56 }}>
            <div class="flex items-center gap-4 min-w-0">
              <span class="text-[12px] px-3 py-1.5 rounded font-semibold tracking-wider shrink-0" style={{ backgroundColor: colors.accent, color: colors.bgBase }}>READ-ONLY</span>
              <span class="text-[14px] font-mono overflow-hidden text-ellipsis whitespace-nowrap" style={{ fontFamily: 'GeistMono', color: colors.textSecondary }}>{fileName.value}</span>
            </div>
            <button
              onClick={closeFileViewer}
              class="cursor-pointer px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ml-6 shrink-0 hover:brightness-110"
              style={{ fontFamily: 'GeistMono', backgroundColor: colors.bgSurface, border: `1px solid ${colors.bgBorder}`, color: colors.textPrimary }}
              title="Close file viewer (Esc)"
            >Close</button>
          </div>
          {rendered.isMarkdown ? (
            <div
              class="file-viewer-markdown flex-1 m-0 overflow-auto text-[14px] leading-relaxed"
              style={{ fontFamily: 'Geist, system-ui, sans-serif', color: colors.textMuted, padding: '14px' }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : (
            <pre
              class="flex-1 m-0 overflow-auto text-[13px] font-mono leading-relaxed whitespace-pre tab-[4]"
              style={{ fontFamily: 'GeistMono', color: colors.textMuted, padding: '14px' }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          )}
        </div>
      )}

      {serverPaneState.value === 'expanded' && (
        <div
          class="split-handle-h"
          data-handle="main-h"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize server pane"
        />
      )}
      <ServerPane />
    </main>
  );
}
````