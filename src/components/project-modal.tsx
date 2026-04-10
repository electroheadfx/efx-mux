// project-modal.tsx -- Add Project modal with form, directory browser, validation
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
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
