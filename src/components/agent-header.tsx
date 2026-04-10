// agent-header.tsx -- Agent header card with version detection and status pill (D-17, D-18, D-19)
// Shows agent type (Claude Code / OpenCode / Bash), version string, and PTY running status.
// Sits above the terminal tab bar in the main panel.

import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { Circle } from 'lucide-preact';
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
    <div class="flex items-center gap-3 px-4 py-2 bg-bg-raised border-b border-border shrink-0">
      {/* Agent icon -- gradient circle */}
      <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ background: 'linear-gradient(135deg, #A855F7, #6366F1)' }}>
        {agentName.value === 'claude' ? 'C' : agentName.value === 'opencode' ? 'O' : 'B'}
      </div>

      {/* Agent name + version */}
      <div class="flex flex-col min-w-0">
        <span class="text-sm font-semibold text-text-bright font-sans leading-tight">{displayName.value}</span>
        {agentVersion.value && (
          <span class="text-[11px] text-text font-mono leading-tight truncate">{agentVersion.value}</span>
        )}
      </div>

      {/* Status pill */}
      <div class="ml-auto flex items-center gap-1.5">
        <Circle
          size={8}
          fill="currentColor"
          class={isRunning.value ? 'text-success' : 'text-danger'}
        />
        <span class={`text-xs font-mono ${isRunning.value ? 'text-success' : 'text-danger'}`}>
          {isRunning.value ? 'Ready' : 'Stopped'}
        </span>
      </div>
    </div>
  );
}
