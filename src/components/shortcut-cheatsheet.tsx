// shortcut-cheatsheet.tsx -- Ctrl+? shortcut cheatsheet overlay
// UX-01, D-03: Dismisses on Escape, click outside, or any shortcut key press

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { colors, fonts } from '../tokens';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const visible = signal(false);

export function toggleCheatsheet() {
  visible.value = !visible.value;
}

function closeCheatsheet() {
  visible.value = false;
}

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

const TERMINAL_PASSTHROUGH = new Set(['c', 'd', 'z', 'l', 'r']);

const SHORTCUTS = [
  { section: 'Terminal', items: [
    { key: 'Ctrl+T', action: 'New terminal tab' },
    { key: 'Ctrl+W', action: 'Close active tab' },
    { key: 'Ctrl+Tab', action: 'Next tab' },
  ]},
  { section: 'Navigation', items: [
    { key: 'Ctrl+P', action: 'Switch project' },
    { key: 'Ctrl+B', action: 'Toggle sidebar' },
    { key: 'Ctrl+S', action: 'Toggle server pane' },
  ]},
  { section: 'App', items: [
    { key: 'Ctrl+Shift+T', action: 'Toggle dark/light theme' },
    { key: 'Ctrl+,', action: 'Settings' },
    { key: 'Ctrl+?', action: 'This cheatsheet' },
    { key: 'Cmd+K', action: 'Clear terminal' },
  ]},
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShortcutCheatsheet() {
  useEffect(() => {
    if (!visible.value) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCheatsheet();
        return;
      }
      // Close on any Ctrl+key that is NOT terminal passthrough
      if (e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (!TERMINAL_PASSTHROUGH.has(k) || e.shiftKey) {
          closeCheatsheet();
        }
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [visible.value]);

  if (!visible.value) return null;

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={closeCheatsheet}
    >
      <div
        class="w-[420px] max-h-[70vh] rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-y-auto"
        style={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.bgBorder}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="px-6 py-4" style={{ borderBottom: `1px solid ${colors.bgBorder}` }}>
          <span class="text-base" style={{ color: colors.textPrimary }}>Keyboard Shortcuts</span>
        </div>

        {/* Shortcut sections */}
        {SHORTCUTS.map((section) => (
          <div key={section.section}>
            <div class="px-6 py-2 text-[11px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
              {section.section}
            </div>
            {section.items.map((item) => (
              <div
                key={item.key}
                class="flex items-center justify-between px-6 py-2"
                style={{ borderBottom: `1px solid ${colors.bgBorder}` }}
              >
                <span class="text-sm" style={{ color: colors.textPrimary }}>{item.action}</span>
                <span
                  class="inline-flex items-center px-2 py-0.5 text-xs rounded"
                  style={{
                    backgroundColor: colors.bgDeep,
                    border: `1px solid ${colors.bgBorder}`,
                    color: colors.accent,
                    fontFamily: fonts.mono,
                  }}
                >
                  {item.key}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
