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
            Settings
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
