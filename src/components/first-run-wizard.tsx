// first-run-wizard.tsx -- Multi-step first-run wizard modal (UX-04)
// Replaces openProjectModal({ firstRun: true }) in main.tsx initProjects()
// 5 steps: Welcome, Project, Agent, Theme, Server & GSD

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { addProject, switchProject } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

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
      <h2 class="text-xl font-semibold text-text-bright mb-4" style="font-family: system-ui, sans-serif">
        Welcome to Efxmux
      </h2>
      <p class="text-sm text-text leading-relaxed max-w-[360px] mx-auto">
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
        <label class="block text-[11px] uppercase tracking-widest text-text mb-1">Directory</label>
        <div class="flex">
          <input
            type="text"
            placeholder="/path/to/project"
            class="flex-1 h-8 px-2 text-sm bg-bg border border-border rounded-l-sm text-text-bright outline-none focus:border-accent transition-colors"
            value={directory.value}
            onInput={(e) => { directory.value = (e.target as HTMLInputElement).value; }}
          />
          <button
            type="button"
            class="w-8 h-8 bg-bg border border-border border-l-0 rounded-r-sm text-text cursor-pointer text-sm shrink-0"
            title="Browse"
            onClick={handleBrowse}
          >[...]</button>
        </div>
      </div>

      {/* Name */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest text-text mb-1">Name</label>
        <input
          type="text"
          placeholder="project-name"
          class="w-full h-8 px-2 text-sm bg-bg border border-border rounded-sm text-text-bright outline-none focus:border-accent box-border transition-colors"
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
      <p class="text-sm text-text mb-4">Which AI coding agent do you use?</p>
      <div class="flex gap-3">
        {agents.map((a) => (
          <div
            key={a.id}
            class={`flex-1 p-4 rounded border cursor-pointer text-center transition-all duration-150 ${
              agent.value === a.id
                ? 'border-accent bg-accent/10 text-text-bright'
                : 'border-border bg-bg text-text hover:border-accent/50'
            }`}
            onClick={() => { agent.value = a.id; }}
          >
            <div class="text-sm font-semibold mb-1" style="font-family: system-ui, sans-serif">{a.label}</div>
            <div class="text-[11px] text-text">{a.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTheme() {
  return (
    <div>
      <p class="text-sm text-text mb-4">Import your iTerm2 color profile for a familiar look.</p>
      <button
        type="button"
        class="bg-bg border border-border text-text-bright px-4 py-2 rounded-sm text-sm cursor-pointer hover:border-accent transition-colors"
        onClick={handleImportTheme}
      >
        Choose iTerm2 Profile...
      </button>
      {themeImported.value && (
        <p class="text-sm text-[#859900] mt-3">Theme imported!</p>
      )}
    </div>
  );
}

function StepServer() {
  return (
    <div>
      {/* Server Command */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest text-text mb-1">Server Command</label>
        <input
          type="text"
          placeholder="Optional, e.g. npm run dev"
          class="w-full h-8 px-2 text-sm bg-bg border border-border rounded-sm text-text-bright outline-none focus:border-accent box-border transition-colors"
          value={serverCmd.value}
          onInput={(e) => { serverCmd.value = (e.target as HTMLInputElement).value; }}
        />
      </div>

      {/* GSD File */}
      <div class="mb-4">
        <label class="block text-[11px] uppercase tracking-widest text-text mb-1">GSD File</label>
        <input
          type="text"
          placeholder="Optional .md path"
          class="w-full h-8 px-2 text-sm bg-bg border border-border rounded-sm text-text-bright outline-none focus:border-accent box-border transition-colors"
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
    <div class="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
      <div class="w-[520px] bg-bg-raised border border-border rounded-lg shadow-2xl">
        {/* Header */}
        <div class="px-6 py-4 border-b border-border flex items-center justify-between">
          <span class="text-base text-text-bright">{STEPS[step.value]}</span>
          <button
            onClick={closeWithDefaults}
            class="w-7 h-7 flex items-center justify-center text-base text-text cursor-pointer rounded hover:bg-bg hover:text-text-bright transition-colors"
            title="Close wizard"
          >{'\u2715'}</button>
        </div>

        {/* Step dots */}
        <div class="flex gap-2 justify-center py-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              class={`w-2 h-2 rounded-full ${
                i === step.value ? 'bg-accent' :
                i < step.value ? 'bg-accent opacity-50' :
                'bg-border'
              }`}
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
        <div class="px-6 py-4 border-t border-border flex justify-between items-center">
          <div>
            {step.value > 0 && step.value < STEPS.length && (
              <span onClick={handleSkip} class="text-sm text-text cursor-pointer hover:text-text-bright">Skip</span>
            )}
          </div>
          <div class="flex gap-2">
            {step.value > 0 && (
              <button
                onClick={() => { step.value--; }}
                class="bg-transparent border border-border text-text px-4 py-2 rounded-sm text-sm cursor-pointer hover:bg-bg hover:text-text-bright transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handlePrimary}
              class="bg-accent text-white px-4 py-2 rounded-sm text-sm cursor-pointer hover:opacity-90 transition-opacity"
            >
              {step.value === 0 ? 'Get Started' : step.value === STEPS.length - 1 ? 'Finish Setup' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
