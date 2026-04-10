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
        <div class="px-6 py-4 border-b border-border flex items-center justify-between">
          <span class="text-text-bright text-base font-semibold font-sans">Preferences</span>
          <button
            onClick={closePreferences}
            class="w-7 h-7 flex items-center justify-center text-base text-text cursor-pointer rounded hover:bg-bg hover:text-text-bright transition-colors"
            title="Close preferences"
          >{'\u2715'}</button>
        </div>

        {/* Current Project */}
        <div>
          <div class="px-6 py-3 section-label">
            Current Project
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text-bright font-sans">Name</span>
            <span class="text-sm text-text font-mono">{name ?? 'None'}</span>
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text-bright font-sans">Path</span>
            <span class="text-sm text-text font-mono truncate max-w-[280px]" title={activeProject?.path ?? ''}>
              {activeProject?.path ?? 'N/A'}
            </span>
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text-bright font-sans">Agent</span>
            <span class="text-sm text-text font-mono">{activeProject?.agent ?? 'N/A'}</span>
          </div>
        </div>

        {/* Appearance */}
        <div>
          <div class="px-6 py-3 section-label">
            Appearance
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text-bright font-sans">Theme</span>
            <button
              onClick={() => toggleThemeMode()}
              class="inline-flex items-center gap-2 px-3 py-1.5 bg-bg border border-border-interactive text-text-bright text-xs font-mono rounded-lg cursor-pointer hover:border-accent transition-colors"
            >
              {isDark ? 'Dark' : 'Light'} -- click to toggle
            </button>
          </div>
        </div>

        {/* Shortcuts */}
        <div>
          <div class="px-6 py-3 section-label">
            Shortcuts
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text font-sans">Toggle sidebar</span>
            <kbd class="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border-interactive text-text-bright text-xs font-mono rounded">Ctrl+B</kbd>
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text font-sans">Quick switch</span>
            <kbd class="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border-interactive text-text-bright text-xs font-mono rounded">Ctrl+P</kbd>
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text font-sans">New tab</span>
            <kbd class="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border-interactive text-text-bright text-xs font-mono rounded">Ctrl+T</kbd>
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text font-sans">Close tab</span>
            <kbd class="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border-interactive text-text-bright text-xs font-mono rounded">{'\u2318'}+W</kbd>
          </div>
          <div class="flex items-center justify-between px-6 py-2.5 border-b border-border/30">
            <span class="text-sm text-text font-sans">All shortcuts</span>
            <kbd class="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border-interactive text-text-bright text-xs font-mono rounded">Ctrl+?</kbd>
          </div>
        </div>

        {/* Actions */}
        <div>
          <div class="px-6 py-3 section-label">
            Actions
          </div>
          <div class="px-6 py-3">
            <button
              onClick={() => { closePreferences(); openProjectModal({ project: activeProject ?? undefined }); }}
              class="bg-accent text-white px-4 py-2 rounded-lg text-sm font-sans cursor-pointer hover:opacity-90 transition-opacity"
            >
              Edit Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
