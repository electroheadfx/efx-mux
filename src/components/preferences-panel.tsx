// preferences-panel.tsx -- Ctrl+, preferences panel overlay (UX-01)
// Read-only display of current project settings with theme toggle and edit action.
// Dismisses on Escape or click outside.

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { activeProjectName, projects } from '../state-manager';
import { toggleThemeMode } from '../theme/theme-manager';
import { openProjectModal } from './project-modal';

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
  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div
      class="fixed inset-0 bg-black/30 z-[100] flex items-center justify-center"
      onClick={closePreferences}
    >
      <div
        class="w-[500px] max-h-[70vh] bg-bg-raised border border-border-interactive rounded-xl shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="px-6 pt-5 pb-4 flex items-center justify-between border-b border-border">
          <span class="text-base font-semibold text-text-bright font-sans">Preferences</span>
          <button
            onClick={closePreferences}
            class="w-7 h-7 rounded-md border border-border-interactive flex items-center justify-center hover:bg-bg"
            title="Close preferences"
          ><span class="text-sm text-text">{'\u2715'}</span></button>
        </div>

        {/* Body */}
        <div class="pt-4">
          {/* Current Project */}
          <div>
            <div class="px-6 py-2 pt-2 section-label">
              Current Project
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Name</span>
              <span class="text-[13px] font-medium text-text-bright font-sans">{name ?? 'None'}</span>
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Path</span>
              <span class="text-[11px] font-mono text-text truncate max-w-[280px]" title={activeProject?.path ?? ''}>
                {activeProject?.path ?? 'N/A'}
              </span>
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Agent</span>
              <div class="flex items-center gap-1.5">
                <div class="w-4 h-4 rounded flex items-center justify-center text-white text-[8px]"
                     style="background: linear-gradient(180deg, #A855F7, #6366F1)">&#x25C6;</div>
                <span class="text-[13px] font-medium text-text-bright font-sans">Claude Code</span>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div>
            <div class="px-6 py-2 pt-4 section-label">
              Appearance
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Theme</span>
              <div class="rounded-md border border-border-interactive flex">
                <button
                  onClick={() => toggleThemeMode()}
                  class={`rounded-md px-3 py-[5px] text-[11px] font-medium font-sans ${isDark ? 'bg-accent text-white' : 'text-text-muted'}`}
                >Dark</button>
                <button
                  onClick={() => toggleThemeMode()}
                  class={`rounded-md px-3 py-[5px] text-[11px] font-medium font-sans ${!isDark ? 'bg-accent text-white' : 'text-text-muted'}`}
                >Light</button>
              </div>
            </div>
          </div>

          {/* Shortcuts */}
          <div>
            <div class="px-6 py-2 pt-4 section-label">
              Shortcuts
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Toggle sidebar</span>
              <div class="flex items-center gap-1">
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">Ctrl</span>
                <span class="text-[10px] font-mono text-text-muted">+</span>
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">B</span>
              </div>
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Quick switch</span>
              <div class="flex items-center gap-1">
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">Ctrl</span>
                <span class="text-[10px] font-mono text-text-muted">+</span>
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">P</span>
              </div>
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">New tab</span>
              <div class="flex items-center gap-1">
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">Ctrl</span>
                <span class="text-[10px] font-mono text-text-muted">+</span>
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">T</span>
              </div>
            </div>
            <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
              <span class="text-[13px] text-text font-sans">Close tab</span>
              <div class="flex items-center gap-1">
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">&#x2318;</span>
                <span class="text-[10px] font-mono text-text-muted">+</span>
                <span class="rounded bg-bg border border-border-interactive px-2 py-[3px] text-[10px] font-mono text-text">W</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div>
            <div class="px-6 py-2 pt-4 section-label">
              Actions
            </div>
            <div class="px-6 py-3">
              <button
                onClick={() => { closePreferences(); openProjectModal({ project: activeProject ?? undefined }); }}
                class="rounded-lg bg-accent px-5 py-2 text-[13px] font-semibold text-white font-sans hover:bg-accent/90 cursor-pointer transition-opacity"
              >
                Edit Project
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
