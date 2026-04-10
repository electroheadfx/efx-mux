// project-modal.tsx -- Add Project modal with form, directory browser, validation
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { useEffect, useRef } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { addProject, updateProject, switchProject } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

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
      class="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center animate-[fadeIn_150ms_ease-out]"
      onClick={() => {
        if (!isFirstRun.value) closeProjectModal();
      }}
    >
      <div
        class="w-[480px] bg-bg-raised border border-border rounded-lg shadow-2xl z-[101] animate-[fadeIn_150ms_ease-out]"
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div class="flex items-center px-6 py-4 border-b border-border">
          <div class="flex-1 text-base text-text-bright">{editingName.value ? 'Edit Project' : 'Add Project'}</div>
          <div
            class="w-7 h-7 flex items-center justify-center text-base text-text cursor-pointer rounded hover:bg-bg hover:text-text-bright transition-colors"
            title="Close"
            onClick={() => {
              visible.value = false;
            }}
          >{'\u2715'}</div>
        </div>

        {/* Form */}
        <form
          ref={formRef}
          class="px-6 py-4"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        >
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
              value={name.value}
              onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
            />
          </div>

          {/* Agent */}
          <div class="mb-4">
            <label class="block text-[11px] uppercase tracking-widest text-text mb-1">Agent</label>
            <input
              type="text"
              list="agent-suggestions"
              placeholder="claude"
              class="w-full h-8 px-2 text-sm bg-bg border border-border rounded-sm text-text-bright outline-none focus:border-accent box-border transition-colors"
              value={agent.value}
              onInput={(e) => { agent.value = (e.target as HTMLInputElement).value; }}
            />
            <datalist id="agent-suggestions">
              <option value="claude" />
              <option value="opencode" />
              <option value="bash" />
            </datalist>
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

          {/* Server Command */}
          <div class="mb-2">
            <label class="block text-[11px] uppercase tracking-widest text-text mb-1">Server Command</label>
            <input
              type="text"
              placeholder="Optional, e.g. npm run dev"
              class="w-full h-8 px-2 text-sm bg-bg border border-border rounded-sm text-text-bright outline-none focus:border-accent box-border transition-colors"
              value={serverCmd.value}
              onInput={(e) => { serverCmd.value = (e.target as HTMLInputElement).value; }}
            />
          </div>

          {/* Error */}
          {error.value && (
            <div class="text-xs text-[#dc322f] mb-2">
              {error.value}
            </div>
          )}

          {/* Buttons */}
          <div class="pt-4 pb-2 flex justify-end gap-3 border-t border-border mt-2">
            {!isFirstRun.value && (
              <button
                type="button"
                class="bg-transparent border border-border text-text px-4 py-2 rounded-sm cursor-pointer text-sm hover:bg-bg-raised hover:text-text-bright transition-colors"
                onClick={() => { closeProjectModal(); }}
              >Cancel Add</button>
            )}
            <button
              type="submit"
              disabled={!isValid.value}
              class={`border-none text-white px-4 py-2 rounded-sm text-sm transition-opacity ${
                isValid.value
                  ? 'bg-accent cursor-pointer opacity-100'
                  : 'bg-accent cursor-not-allowed opacity-40'
              }`}
            >{editingName.value ? 'Save Changes' : 'Add Project'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
