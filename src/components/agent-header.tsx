// agent-header.tsx -- Agent header card with version detection and status pill (D-01)
// Shows agent type (Claude Code / OpenCode / Bash), version string, and PTY running status.
// Sits inside the terminal area as a floating card.

import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { activeProjectName, projects } from '../state-manager';
import { terminalTabs, activeTabId } from './terminal-tabs';

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
    <div class="flex items-center gap-2.5 rounded-lg bg-bg-raised px-3 py-2 w-full">
      {/* Gradient diamond icon */}
      <div class="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs shrink-0"
        style={{ background: 'linear-gradient(180deg, #A855F7, #6366F1)' }}>&#x25C6;</div>

      {/* Info column */}
      <div class="flex flex-col gap-px flex-1 min-w-0">
        <span class="text-xs font-medium text-text-bright font-sans leading-tight">
          {displayName.value} {agentVersion.value}
        </span>
        <span class="text-[10px] text-[#484F58] font-mono leading-tight truncate">
          {agentName.value === 'claude' ? 'Opus 4' : agentName.value === 'opencode' ? 'OpenCode' : 'Bash'} · {activeProjectName.value || 'No project'}
        </span>
      </div>

      {/* Status pill */}
      <div class={`flex items-center gap-1 rounded px-2 py-[3px] ${isRunning.value ? 'bg-success/[0.125]' : 'bg-danger/[0.125]'}`}>
        <span class={`w-1.5 h-1.5 rounded-full ${isRunning.value ? 'bg-success' : 'bg-danger'}`}></span>
        <span class={`text-[10px] font-mono font-medium ${isRunning.value ? 'text-success' : 'text-danger'}`}>
          {isRunning.value ? 'Ready' : 'Stopped'}
        </span>
      </div>
    </div>
  );
}
