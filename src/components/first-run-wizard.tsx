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
