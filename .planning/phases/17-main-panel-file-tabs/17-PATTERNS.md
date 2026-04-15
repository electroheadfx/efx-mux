# Phase 17: Main Panel File Tabs - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 11 (5 new, 6 modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/unified-tab-bar.tsx` | component | event-driven | `src/components/terminal-tabs.tsx` (TerminalTabBar + signals) | exact |
| `src/components/editor-tab.tsx` | component | request-response | `src/components/diff-viewer.tsx` (imperative DOM in Preact) | role-match |
| `src/components/git-changes-tab.tsx` | component | request-response | `src/components/git-control-tab.tsx` (accordion + git IPC) | exact |
| `src/components/confirm-modal.tsx` | component | event-driven | `src/components/project-modal.tsx` (signal-driven modal) | exact |
| `src/editor/setup.ts` | utility | transform | `src/terminal/terminal-manager.ts` (imperative setup factory) | role-match |
| `src/editor/theme.ts` | config | transform | `src/tokens.ts` (design token consumption) | role-match |
| `src/editor/languages.ts` | utility | transform | `src/components/main-panel.tsx` lines 44-78 (getLanguage map) | exact |
| `src/components/main-panel.tsx` | component (MODIFY) | event-driven | self (remove overlay, swap TerminalTabBar) | exact |
| `src/components/terminal-tabs.tsx` | component (MODIFY) | event-driven | self (extract types, keep PTY logic) | exact |
| `src/main.tsx` | entry (MODIFY) | event-driven | self (rewire file-opened handler) | exact |
| `src/components/file-tree.tsx` | component (MODIFY) | event-driven | self (change click dispatch target) | exact |

## Pattern Assignments

### `src/components/unified-tab-bar.tsx` (component, event-driven) -- NEW

**Analog:** `src/components/terminal-tabs.tsx` lines 692-753

**Imports pattern** (terminal-tabs.tsx lines 6-17):
```typescript
import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { colors, fonts } from '../tokens';
```

**Signal-driven state pattern** (terminal-tabs.tsx lines 40-42):
```typescript
export const terminalTabs = signal<TerminalTab[]>([]);
export const activeTabId = signal<string>('');
let tabCounter = 0;
```

**Tab bar rendering pattern** (terminal-tabs.tsx lines 692-753):
```typescript
export function TerminalTabBar() {
  const tabs = terminalTabs.value;
  const currentId = activeTabId.value;

  return (
    <div
      class="flex gap-1 px-2 py-2 shrink-0 items-center border-b"
      role="tablist"
      style={{ backgroundColor: colors.bgBase, borderColor: colors.bgBorder }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === currentId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            class="flex items-center gap-2 cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: isActive ? colors.bgElevated : 'transparent',
              border: isActive ? `1px solid ${colors.bgSurface}` : '1px solid transparent',
              borderRadius: 6,
              padding: '9px 16px',
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? colors.textPrimary : colors.textDim,
            }}
            onClick={() => { /* switch tab */ }}
            title={tab.sessionName}
          >
            {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.statusGreen, flexShrink: 0 }} />}
            <span>{tab.label}</span>
            <span
              class="ml-1 flex items-center justify-center"
              style={{ color: colors.textDim, fontSize: 14 }}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              title="Close tab"
            >{'\u00D7'}</span>
          </button>
        );
      })}
      {/* New tab button */}
      <button class="w-7 h-7 rounded flex items-center justify-center text-base cursor-pointer"
        style={{ color: colors.textDim, fontFamily: fonts.sans }}
        onClick={() => createNewTab()}
        title="New terminal tab (Ctrl+T)"
      >+</button>
    </div>
  );
}
```

**Tab type indicator pattern** (terminal-tabs.tsx line 726 -- green dot for active):
```typescript
{isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.statusGreen, flexShrink: 0 }} />}
```

**[+] Dropdown integration pattern** (dropdown-menu.tsx lines 17-24):
```typescript
export interface DropdownProps {
  items: DropdownItem[];
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
  }) => VNode;
}
```

**Tab persistence pattern** (terminal-tabs.tsx lines 394-407):
```typescript
function persistTabState(): void {
  const activeName = activeProjectName.value;
  const tabs = terminalTabs.value.map(t => ({
    sessionName: t.sessionName,
    label: t.label,
  }));
  const data = JSON.stringify({ tabs, activeTabId: activeTabId.value });
  const patch: Record<string, string> = { 'terminal-tabs': data };
  if (activeName) {
    patch[`terminal-tabs:${activeName}`] = data;
  }
  updateSession(patch);
}
```

---

### `src/components/editor-tab.tsx` (component, request-response) -- NEW

**Analog:** `src/components/diff-viewer.tsx` (useRef + useEffect imperative DOM mounting)

**Imperative DOM mounting in Preact** (diff-viewer.tsx lines 122-159):
```typescript
import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';

export function DiffViewer() {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDiff(filePath: string) {
      const el = contentRef.current;
      if (!el) return;
      // ... imperative DOM manipulation
    }

    function handleOpenDiff(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.path) {
        loadDiff(detail.path);
      }
    }

    document.addEventListener('open-diff', handleOpenDiff);
    return () => {
      document.removeEventListener('open-diff', handleOpenDiff);
    };
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div ref={contentRef} />
    </div>
  );
}
```

**File read IPC pattern** (main.tsx lines 220-230):
```typescript
document.addEventListener('file-opened', async (e: Event) => {
  const { path, name } = (e as CustomEvent).detail;
  try {
    const content = await invoke('read_file_content', { path });
    // ... use content
  } catch (err) {
    console.error('[efxmux] Failed to read file:', err);
  }
});
```

**File write IPC pattern** (file-service.ts lines 27-33):
```typescript
export async function writeFile(path: string, content: string): Promise<void> {
  try {
    await invoke('write_file_content', { path, content });
  } catch (e) {
    throw new FileError('WriteError', String(e));
  }
}
```

**Toast feedback pattern** (toast.tsx lines 23-30):
```typescript
export function showToast(toast: Omit<Toast, 'id'>): void {
  const id = Date.now().toString();
  toasts.value = [...toasts.value, { ...toast, id }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
}
```

---

### `src/components/git-changes-tab.tsx` (component, request-response) -- NEW

**Analog:** `src/components/git-control-tab.tsx` (accordion sections + git IPC + listen events)

**Accordion section pattern** (git-control-tab.tsx lines 43-49, 63-64):
```typescript
const stagedSectionOpen = signal(true);
const changesSectionOpen = signal(true);

const stagedFiles = computed(() => gitFiles.value.filter(f => f.staged));
const changedFiles = computed(() => gitFiles.value.filter(f => !f.staged));
```

**Git status IPC + event listener pattern** (git-control-tab.tsx lines 9-18):
```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ChevronDown, ChevronRight } from 'lucide-preact';
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
import { projects, activeProjectName } from '../state-manager';
```

**Diff rendering reuse** (diff-viewer.tsx lines 33-115 -- `renderDiffHtml()` function):
```typescript
function renderDiffHtml(diff: string, filePath?: string): string {
  // ... parses unified diff, returns HTML with:
  // - File header bar with status badge [M], filename, +/- counts
  // - Hunk headers with accent color
  // - Added lines with green bg + green border-left
  // - Deleted lines with red bg + red border-left
  // - Context lines with dim text
}
```

**Collapsible chevron pattern** (git-control-tab.tsx uses `ChevronDown`/`ChevronRight` from lucide-preact):
```typescript
import { ChevronDown, ChevronRight } from 'lucide-preact';
// Toggle: sectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
```

**Git status file type** (git-control-tab.tsx lines 25-32):
```typescript
interface GitFile {
  name: string;
  path: string;
  status: string;
  staged: boolean;
  additions: number;
  deletions: number;
}
```

---

### `src/components/confirm-modal.tsx` (component, event-driven) -- NEW

**Analog:** `src/components/project-modal.tsx` (signal-driven modal with Escape key handling)

**Modal visibility signal pattern** (project-modal.tsx lines 17-18):
```typescript
const visible = signal(false);
```

**Modal open/close public API** (project-modal.tsx lines 36-60):
```typescript
export function openProjectModal(opts: { firstRun?: boolean; project?: ProjectEntry } = {}) {
  visible.value = true;
  // ... set fields
}

export function closeProjectModal() {
  visible.value = false;
}
```

**Modal backdrop + centered card** (project-modal.tsx lines 187-212):
```typescript
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
    onClick={() => { closeProjectModal(); }}
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
      {/* content */}
    </div>
  </div>
);
```

**Escape key handler** (project-modal.tsx lines 172-183):
```typescript
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
```

**Button styling pattern** (project-modal.tsx lines 461-495):
```typescript
{/* Cancel button */}
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
  onClick={() => { /* cancel */ }}
>Cancel</button>

{/* Destructive/primary button */}
<button
  style={{
    borderRadius: 8,
    backgroundColor: colors.accent, // or colors.diffRed for destructive
    border: 'none',
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: 'white',
    cursor: 'pointer',
  }}
>Discard</button>
```

---

### `src/editor/setup.ts` (utility, transform) -- NEW

**Analog:** `src/terminal/terminal-manager.ts` (imperative setup factory)

**Factory function pattern** -- the terminal-manager exports a `createTerminal(container, options)` function that returns `{ terminal, fitAddon }`. The editor setup should follow the same pattern: export a `createEditorState(content, options)` that returns a configured `EditorState`.

**Import grouping convention** (terminal-tabs.tsx lines 6-17 -- third-party first, then local):
```typescript
// Third-party
import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
// Local
import { createTerminal, type TerminalOptions } from '../terminal/terminal-manager';
import { colors, fonts } from '../tokens';
```

---

### `src/editor/theme.ts` (config, transform) -- NEW

**Analog:** `src/tokens.ts` (design token source)

**Token consumption pattern** (tokens.ts -- the theme file imports from tokens.ts and transforms values into CM6 theme format):
```typescript
export const colors = {
  bgBase: '#111927',
  bgElevated: '#19243A',
  bgBorder: '#243352',
  bgSurface: '#324568',
  accent: '#258AD1',
  accentMuted: '#258AD120',
  textPrimary: '#E6EDF3',
  textSecondary: '#C9D1D9',
  textMuted: '#8B949E',
  textDim: '#556A85',
  // ...
} as const;

export const fonts = {
  sans: 'Geist',
  mono: 'GeistMono',
} as const;
```

**Export convention** -- tokens.ts exports named `const` objects. The theme file should export named `const` for the CM6 theme and highlight style.

---

### `src/editor/languages.ts` (utility, transform) -- NEW

**Analog:** `src/components/main-panel.tsx` lines 44-54 (getLanguage extension map)

**Language detection map pattern** (main-panel.tsx lines 44-54):
```typescript
function getLanguage(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    rs: 'rs', css: 'css', json: 'json', toml: 'toml', yaml: 'yaml', yml: 'yaml',
    html: 'html', htm: 'html', xml: 'html', svg: 'html',
    sh: 'sh', bash: 'sh', zsh: 'sh', fish: 'sh',
  };
  return ext ? (map[ext] || null) : null;
}
```

New file replaces string returns with CM6 `Extension` returns. Same lookup pattern, different return type.

---

### `src/components/main-panel.tsx` (component, MODIFY)

**Self-analog.** Modifications:
1. Remove file viewer overlay (lines 14-17 signals, lines 18-21 close function, lines 26-199 highlight code, lines 202-228 event listener, lines 230-270 overlay JSX)
2. Replace `<TerminalTabBar />` (line 236) with `<UnifiedTabBar />`
3. Terminal area div becomes conditional on active tab type

**Current structure to preserve** (lines 234-284):
```typescript
return (
  <main class="main-panel relative" aria-label="Main panel">
    <TerminalTabBar />  {/* --> becomes <UnifiedTabBar /> */}
    <div class="terminal-area flex-1 bg-bg-terminal overflow-hidden relative min-h-[100px]">
      <AgentHeader />
      <div class="terminal-containers absolute inset-0" />
      <ActiveTabCrashOverlay />
    </div>
    {/* file viewer overlay --> REMOVE */}
    {/* server pane --> KEEP */}
    <ServerPane />
  </main>
);
```

---

### `src/components/terminal-tabs.tsx` (component, MODIFY)

**Self-analog.** Modifications:
1. Export `TerminalTab` interface (line 23-34) for reuse in unified tab type union
2. Remove `TerminalTabBar` component (lines 692-753) -- replaced by unified-tab-bar.tsx
3. Keep all tab management functions: `createNewTab`, `closeActiveTab`, `closeTab`, `cycleToNextTab`, `initFirstTab`, `restoreTabs`, `clearAllTabs`, `saveProjectTabs`, `restoreProjectTabs`
4. Keep `switchToTab` (lines 364-381) and `disposeTab` (lines 383-388) internal helpers
5. Keep `ActiveTabCrashOverlay` (lines 759-769)

---

### `src/main.tsx` (entry, MODIFY)

**Self-analog.** Modifications:
1. Rewire `file-opened` handler (lines 220-230) to create/focus an editor tab instead of dispatching `show-file-viewer`
2. Add `Cmd+S` intercept in keyboard handler (lines 145-204) for active editor tab save
3. Import `ConfirmModal` and add to App component JSX (line 96 area)

**File-opened handler to replace** (main.tsx lines 220-230):
```typescript
// CURRENT -- dispatches show-file-viewer (to be removed)
document.addEventListener('file-opened', async (e: Event) => {
  const { path, name } = (e as CustomEvent).detail;
  try {
    const content = await invoke('read_file_content', { path });
    document.dispatchEvent(new CustomEvent('show-file-viewer', {
      detail: { path, name, content }
    }));
  } catch (err) {
    console.error('[efxmux] Failed to read file:', err);
  }
});
```

**Keyboard handler integration point** (main.tsx lines 145-204, capture phase):
```typescript
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey) return;
  const key = e.key.toLowerCase();
  // ... existing switch cases
  // ADD: case for Cmd+S to save active editor tab
}, { capture: true });
```

---

### `src/components/file-tree.tsx` (component, MODIFY)

**Self-analog.** The file tree dispatches `file-opened` custom event on click. No change needed to the file tree itself -- the handler in main.tsx is what changes. The event payload `{ path, name }` stays the same.

---

## Shared Patterns

### Design Token Consumption
**Source:** `src/tokens.ts`
**Apply to:** All new component files, editor/theme.ts
```typescript
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
// All styling uses inline style={{}} with token values
// Example: style={{ backgroundColor: colors.bgElevated, fontFamily: fonts.sans, fontSize: 13 }}
```

### Signal-Based State Management
**Source:** `src/components/terminal-tabs.tsx` lines 40-42, `src/components/toast.tsx` line 14
**Apply to:** unified-tab-bar.tsx (tab list + active tab), confirm-modal.tsx (visibility)
```typescript
import { signal } from '@preact/signals';
// Module-level signals for component state
const myState = signal<MyType[]>([]);
// Components read .value reactively
// Mutations: signal.value = newValue (always create new array/object for reactivity)
```

### Custom Event Communication
**Source:** `src/main.tsx` lines 220-230, `src/components/diff-viewer.tsx` lines 139-149
**Apply to:** File open flow (file-opened event), tab creation
```typescript
// Dispatch
document.dispatchEvent(new CustomEvent('event-name', { detail: { key: value } }));

// Listen (in useEffect with cleanup)
useEffect(() => {
  function handler(e: Event) {
    const detail = (e as CustomEvent).detail;
    // ...
  }
  document.addEventListener('event-name', handler);
  return () => document.removeEventListener('event-name', handler);
}, []);
```

### Tauri IPC Pattern
**Source:** `src/services/file-service.ts` lines 27-33, `src/services/git-service.ts` lines 27-33
**Apply to:** Editor tab file read/write, git changes tab diff loading
```typescript
import { invoke } from '@tauri-apps/api/core';

// Read file
const content = await invoke<string>('read_file_content', { path });

// Write file
await invoke('write_file_content', { path, content });

// Get diff
const diff = await invoke<string>('get_file_diff', { path: filePath });
```

### Tauri Event Listener Pattern
**Source:** `src/components/terminal-tabs.tsx` lines 676-684
**Apply to:** git-changes-tab.tsx (listen for git-status-changed)
```typescript
import { listen } from '@tauri-apps/api/event';

listen<{ session: string; code: number }>('pty-exited', (event) => {
  const { session, code } = event.payload;
  // ... handle event
});
```

### Lucide Icons
**Source:** `src/components/git-control-tab.tsx` line 13
**Apply to:** Tab type indicators, git changes tab
```typescript
import { ChevronDown, ChevronRight, GitBranch } from 'lucide-preact';
// Usage: <ChevronDown size={14} />
```

### Test File Pattern
**Source:** `src/components/dropdown-menu.test.tsx`, `src/services/file-service.test.ts`
**Apply to:** All new test files
```typescript
// Component test structure
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';

describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('descriptive behavior', () => {
    render(<Component />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});

// Service/utility test structure (with Tauri IPC mocks)
import { describe, it, expect } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';

describe('service-name', () => {
  it('calls invoke with correct args', async () => {
    let captured: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'command_name') {
        captured = args as Record<string, unknown>;
        return 'result';
      }
    });
    // ... call function, assert captured args
  });
});
```

### Signal Reset in Tests
**Source:** `src/components/toast.test.tsx` lines 7-23
**Apply to:** Tests for components with module-level signals (unified-tab-bar, confirm-modal)
```typescript
// Use dynamic import to get fresh module with reset signals
let Component: typeof import('./component').Component;
let showFn: typeof import('./component').showFn;

beforeEach(async () => {
  vi.resetModules();
  const module = await import('./component');
  Component = module.Component;
  showFn = module.showFn;
});
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/editor/setup.ts` | utility | transform | No `src/editor/` directory exists yet. Closest structural analog is `src/terminal/terminal-manager.ts` (factory pattern for imperative library setup). CM6-specific setup code comes from RESEARCH.md patterns. |
| `src/editor/theme.ts` | config | transform | First CM6 theme in codebase. Token consumption pattern from `tokens.ts` is clear; CM6 theme API specifics come from RESEARCH.md Pattern 2. |
| `src/editor/languages.ts` | utility | transform | Replacement for regex-based `getLanguage()` in main-panel.tsx. The lookup map pattern is identical; CM6 language package imports come from RESEARCH.md Code Examples. |

**Note:** All three `src/editor/*.ts` files lack exact codebase analogs because the `src/editor/` directory is new. However, the patterns are well-covered by RESEARCH.md (CM6 setup, theme, and language patterns from official docs) combined with the project's existing conventions (named exports, token imports, factory functions).

---

## Metadata

**Analog search scope:** `src/components/`, `src/services/`, `src/terminal/`, `src/`, `src/theme/`
**Files scanned:** 28 source files + 16 test files
**Pattern extraction date:** 2026-04-15
