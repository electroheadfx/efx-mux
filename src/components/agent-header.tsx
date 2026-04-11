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
