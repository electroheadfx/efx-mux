# Phase 20: Right Panel Multi-Terminal - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 9 files (4 primary source refactors, 4 new tests, 1 Rust command, +main.tsx bootstrap edit)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/right-panel.tsx` (rewrite) | container-component | event-driven (signal-reactive) | Current `right-panel.tsx` sections (bash wiring) + `main-panel.tsx` pattern (tab bar + content wrapper) | exact (same file) |
| `src/components/unified-tab-bar.tsx` (refactor) | container-component | event-driven (signal-reactive) | Self (Phase 17) — add `scope` prop branch + sticky-tab renderer | exact (same file) |
| `src/components/terminal-tabs.tsx` (refactor to scope registry) | module / service | CRUD (tab lifecycle) + event-driven (pty-exited) | Self (Phase 17) + per-project Map pattern from `unified-tab-bar.tsx:57-95` | exact (self-scoped) |
| `src/state-manager.ts` (drop legacy keys + right-scope persistence) | state/config | request-response (IPC) | Self — `updateSession`/`loadAppState` already parameterized | exact (same file) |
| `src/main.tsx` (migration bootstrap + dual-scope restore) | bootstrap | event-driven (project switch) | `main.tsx:402` existing `cleanup_dead_sessions` hook + `restoreProjectTabs` call site | exact (same file) |
| `src-tauri/src/terminal/pty.rs` (new `kill_legacy_right_sessions` command) | Rust command | batch / request-response | `pty.rs:540` `cleanup_dead_sessions` | exact (same file, adjacent pattern) |
| `src/components/unified-tab-bar.test.tsx` (NEW) | test | render/interaction | `src/components/dropdown-menu.test.tsx`, `src/components/editor-tab.test.tsx` | role-match |
| `src/components/right-panel.test.tsx` (NEW) | test | render | `src/components/gsd-pane.test.tsx`, `src/components/sidebar.test.tsx` | role-match |
| `src/components/terminal-tabs.test.ts` (NEW) | test | unit (signal round-trip) | `src/state-manager.test.ts` (mockIPC + signal reset beforeEach) | role-match |

---

## Pattern Assignments

### `src/components/terminal-tabs.tsx` (module / service)

**Analog:** Self (Phase 17) + per-project Map pattern from `src/components/unified-tab-bar.tsx:56-95`

Primary refactor target. The existing module-global signal pattern (`terminalTabs`, `activeTabId`, `tabCounter`, `projectTabCache`) must be converted to a `Map<TerminalScope, ScopeState>` while keeping all top-level exports as thin wrappers over `scope='main'`. The per-project Map pattern already in `unified-tab-bar.tsx` is the production-tested template.

**Per-project Map pattern to copy** — `src/components/unified-tab-bar.tsx` lines 56-95:
```typescript
/** Editor tabs keyed by project name */
const _editorTabsByProject = signal<Map<string, EditorTabData[]>>(new Map());
/** Tab order keyed by project name */
const _tabOrderByProject = signal<Map<string, string[]>>(new Map());

function getProjectEditorTabs(projectName: string): EditorTabData[] {
  return _editorTabsByProject.value.get(projectName) ?? [];
}

function ensureProjectInMaps(projectName: string): void {
  if (!_editorTabsByProject.value.has(projectName)) {
    _editorTabsByProject.value = new Map(_editorTabsByProject.value).set(projectName, []);
  }
  ...
}

/** Get tabs for the active project (read-only computed for compatibility) */
export const editorTabs = computed<EditorTabData[]>(() => {
  const name = activeProjectName.value;
  if (!name) return [];
  ensureProjectInMaps(name);
  return getProjectEditorTabs(name);
});
```
Apply identically but keyed by `TerminalScope` ('main' | 'right') instead of project name. Since scopes are known at module load (exactly 2), initialize both entries eagerly rather than lazily — cleaner than `ensureProjectInMaps`.

**Existing lifecycle to preserve (all these functions get a scoped internal body + a main-wrapper export)** — `src/components/terminal-tabs.tsx`:

- `createNewTab(options)` — lines 118-223. Must split into `createNewTabScoped(scope, options)` with two differences at line 132 (session-suffix derivation):
  ```typescript
  // Current (main only):
  const sessionSuffix = tabCounter > 1 ? String(tabCounter) : undefined;
  // New (scoped):
  let sessionSuffix: string | undefined;
  if (scope === 'main') {
    sessionSuffix = s.counter.n > 1 ? String(s.counter.n) : undefined;
  } else {
    sessionSuffix = `r${s.counter.n}`;    // D-14: always -r<N>, even for first right tab
  }
  ```
  And at line 119 (container lookup):
  ```typescript
  // Current: document.querySelector('.terminal-containers')
  // New: document.querySelector(s.containerSelector)
  //   where containerSelector = '.terminal-containers' for main,
  //                            '.terminal-containers[data-scope="right"]' for right
  ```

- `closeActiveTab` / `closeTab` / `cycleToNextTab` / `renameTerminalTab` / `switchToTab` — lines 228-435. All reference `terminalTabs.value` and `activeTabId.value`. Scope the reads/writes to `getScope(scope).tabs.value` / `getScope(scope).activeTabId.value`. Export wrappers resolve `scope='main'` by default.

- `persistTabState` — lines 448-462. The patch-key derivation must be scope-aware:
  ```typescript
  // scope='main'  → patch = { 'terminal-tabs': data, [`terminal-tabs:${project}`]: data }
  // scope='right' → patch = { [`right-terminal-tabs:${project}`]: data }
  //                 (no global flat key for right scope — D-15)
  ```

- `restartTabSession` — lines 468-524. **Pitfall 1 applies here.** Change line 485 from:
  ```typescript
  const newSessionSuffix = `r${tabCounter}`;
  ```
  to:
  ```typescript
  const newSessionSuffix = `rr${getScope(tab.ownerScope).counter.n}`;  // D-14/Pitfall 1: double-r to avoid colliding with right-scope -r<N>
  ```
  Each tab must know its owning scope (add `ownerScope: TerminalScope` to `TerminalTab` or look it up via the registry lookup in the `pty-exited` listener).

- `pty-exited` listener — lines 734-742. Make scope-agnostic:
  ```typescript
  listen<{ session: string; code: number }>('pty-exited', (event) => {
    const { session, code } = event.payload;
    for (const [, state] of scopes) {
      const tab = state.tabs.value.find(t => t.sessionName === session);
      if (tab) {
        tab.exitCode = code;
        state.tabs.value = [...state.tabs.value];
        return; // D-14 guarantees unique session names across scopes
      }
    }
  });
  ```

- `projectTabCache` — line 57. Becomes a two-layer map: `Map<TerminalScope, Map<string, TabMeta[]>>`. Extend `saveProjectTabs(projectName)` → `saveProjectTabs(projectName, scope='main')`. `restoreProjectTabs` follows the same pattern.

**New export for right-panel call sites:**
```typescript
export function getTerminalScope(scope: TerminalScope) {
  const s = getScope(scope);
  return {
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    createNewTab: (opts?: CreateTabOptions) => createNewTabScoped(scope, opts),
    closeTab: (id: string) => closeTabScoped(scope, id),
    switchToTab: (id: string) => switchToTabScoped(scope, id),
    renameTab: (id: string, label: string) => renameTabScoped(scope, id, label),
    ActiveTabCrashOverlay: () => ActiveTabCrashOverlayScoped(scope),
  };
}
```

---

### `src/components/unified-tab-bar.tsx` (container-component)

**Analog:** Self (Phase 17) — line-anchored refactor

**Scope prop introduction** — current signature at line 818:
```typescript
export function UnifiedTabBar() { ... }
```
becomes:
```typescript
interface UnifiedTabBarProps { scope: 'main' | 'right' }
export function UnifiedTabBar({ scope }: UnifiedTabBarProps) { ... }
```

**Tab type extension** — current union at lines 49-52:
```typescript
type UnifiedTab =
  | { type: 'terminal'; id: string; terminalTabId: string }
  | EditorTabData
  | GitChangesTabData;
```
Add sticky variants:
```typescript
interface StickyTabData extends BaseTab {
  type: 'file-tree' | 'gsd';
}
type UnifiedTab =
  | { type: 'terminal'; id: string; terminalTabId: string; scope: 'main' | 'right' }
  | EditorTabData
  | GitChangesTabData
  | StickyTabData;
```

**`gitChangesTab` owning-scope** — current at line 113:
```typescript
export const gitChangesTab = signal<GitChangesTabData | null>(null);
```
becomes (Pitfall 3):
```typescript
interface GitChangesTabData extends BaseTab {
  type: 'git-changes';
  owningScope: 'main' | 'right';  // NEW
}
// gitChangesTab signal shape unchanged — just the interface gets the new field
```

**Sticky tab ordering pattern** — extend `getOrderedTabs` at lines 588-610:
```typescript
function getOrderedTabs(scope: 'main' | 'right'): UnifiedTab[] {
  const all = allTabsForScope(scope);           // filter allTabs.value by scope ownership
  const dynamic = computeDynamicOrder(scope, all);
  if (scope === 'main') return dynamic;
  // D-02/D-03: sticky pair always prepended, never in tabOrder
  const sticky: UnifiedTab[] = [
    { type: 'file-tree', id: 'file-tree' },
    { type: 'gsd', id: 'gsd' },
  ];
  return [...sticky, ...dynamic];
}
```

**Plus-menu scope branch** — replace `buildDropdownItems` at lines 614-632:
```typescript
function buildDropdownItems(scope: 'main' | 'right'): DropdownItem[] {
  if (scope === 'main') {
    return [
      { label: 'Terminal (Zsh)', icon: Terminal, action: () => createNewTab() },
      { label: 'Agent', icon: Bot, action: () => createNewTab({ isAgent: true }) },
      { label: 'Git Changes', icon: FileDiff, action: () => openGitChangesTab() },
    ];
  }
  // scope === 'right'
  const rightScope = getTerminalScope('right');
  const gcInRight = gitChangesTab.value?.owningScope === 'right';
  return [
    { label: 'Terminal (Zsh)', icon: Terminal, action: () => rightScope.createNewTab() },
    { label: 'Agent', icon: Bot, action: () => rightScope.createNewTab({ isAgent: true }) },
    {
      label: 'Git Changes',
      icon: FileDiff,
      action: () => openOrMoveGitChangesToRight(),
      disabled: gcInRight,   // UI-SPEC: disabled at 40% opacity when already in right
    },
  ];
}
```

**Drag-reorder sticky rejection** — apply to `onTabMouseDown` at lines 658-680 and drop-resolver at lines 737-795. Two-line filter (Pitfall 7):
```typescript
function onTabMouseDown(e: MouseEvent, tabId: string): void {
  ...
  // Refuse drag on sticky tabs
  if (tabId.startsWith('sticky-') || tabId === 'file-tree' || tabId === 'gsd') return;
  ...
}
// In onDocMouseUp drop resolver at line 776:
if (targetId && targetId !== reorder.sourceId
    && !(targetId === 'file-tree' || targetId === 'gsd')) {
  // existing reorder body
}
```

**Sticky tab render branch** — insert into `renderTab` at line 942. Before the `tab.type === 'terminal'` branch:
```typescript
if (tab.type === 'file-tree' || tab.type === 'gsd') {
  const Icon = tab.type === 'file-tree' ? FolderOpen : ListChecks;
  label = tab.type === 'file-tree' ? 'File Tree' : 'GSD';
  tabTitle = label;
  indicator = <Icon size={14} style={{ color: isActive ? colors.accent : colors.textMuted, flexShrink: 0 }} />;
  // Render with same outer wrapper as dynamic tabs BUT:
  //   - no close button (omit the final <span onClick={e => onClose(e, tab.id)}> block)
  //   - no onDblClick rename trigger
  //   - same padding, color rules, font, active underline
  return <div /* ... same as dynamic ... */ />;
}
```

**Imports diff at line 11** — add `FolderOpen, ListChecks`:
```typescript
import { Terminal, Bot, FileDiff, Pin, PanelRightClose, PanelRight, FolderOpen, ListChecks } from 'lucide-preact';
```

---

### `src/components/right-panel.tsx` (container-component, full rewrite)

**Analog:** RESEARCH Example 2 (skeleton) + existing `main-panel.tsx` tab-bar + content wrapper pattern + current `right-panel.tsx` sticky-body `display: block | none` pattern at lines 120-125.

**Imports pattern** — copy from current `right-panel.tsx:6-13` but **drop**: `useRef`, `useEffect`, `invoke`, `loadAppState`, `saveAppState`, `TabBar`, `RIGHT_TOP_TABS`/`RIGHT_BOTTOM_TABS`, `rightBottomTab`, `getTheme`/`registerTerminal`:
```typescript
import { colors } from '../tokens';
import { UnifiedTabBar, gitChangesTab } from './unified-tab-bar';
import { GSDPane } from './gsd-pane';
import { FileTree } from './file-tree';
import { GitChangesTab } from './git-changes-tab';
import { getTerminalScope } from './terminal-tabs';
```

**Sticky body + container wrapper pattern** — copy from current `right-panel.tsx` lines 119-127 (GSD/FileTree `display: block | none`), then stack with the terminal wrapper:
```tsx
export function RightPanel() {
  const { activeTabId } = getTerminalScope('right');
  const activeId = activeTabId.value;
  const gc = gitChangesTab.value;
  const gcOwnedHere = gc?.owningScope === 'right';
  const isDynamic = !(activeId === 'file-tree' || activeId === 'gsd' || (gcOwnedHere && activeId === gc?.id));

  return (
    <aside class="right-panel flex flex-col"
      aria-label="Right panel"
      style={{ backgroundColor: colors.bgBase, borderLeft: `1px solid ${colors.bgBorder}` }}
    >
      <UnifiedTabBar scope="right" />
      <div class="right-panel-content flex-1 relative overflow-hidden">
        <div style={{ height: '100%', display: activeId === 'file-tree' ? 'block' : 'none' }}>
          <FileTree />
        </div>
        <div style={{ height: '100%', display: activeId === 'gsd' ? 'block' : 'none' }}>
          <GSDPane />
        </div>
        {gcOwnedHere && gc && (
          <div style={{ height: '100%', display: activeId === gc.id ? 'block' : 'none' }}>
            <GitChangesTab />
          </div>
        )}
        <div
          class="terminal-containers absolute inset-0"
          data-scope="right"
          style={{ display: isDynamic ? 'block' : 'none' }}
        />
      </div>
    </aside>
  );
}
```

**Removed DOM/behavior** (Pitfall 6 + D-21):
- No `bashContainerRef`, no `bashConnected` / `bashSessionRef` refs.
- No `useEffect` for bash auto-connect.
- No `document.addEventListener('switch-bash-session', ...)`.
- No `.split-handle-h` node.
- No `.right-top` / `.right-bottom` / `.right-top-content` / `.right-bottom-content` nodes.

**Error handling pattern** — none required in this component; errors flow through terminal-tabs' `createNewTab` already (try/catch at `terminal-tabs.tsx:201-208`).

---

### `src/state-manager.ts` (state/config)

**Analog:** Self — targeted deletions.

**Signal removal** — line 46:
```typescript
// BEFORE:
export const rightBottomTab = signal('Bash');
// AFTER: (delete line entirely)
```

**Fallback default shape update** — lines 73-79 (inside the `catch` of `loadAppState`):
```typescript
// BEFORE (lines 74-78):
currentState = {
  version: 1,
  layout: { 'sidebar-w': '200px', 'right-w': '25%', 'right-h-pct': '50', 'sidebar-collapsed': false },
  theme: { mode: 'dark' },
  session: { 'main-tmux-session': 'efx-mux', 'right-tmux-session': 'efx-mux-right' },
  project: { active: null, projects: [] },
  panels: { 'right-top-tab': 'File Tree', 'right-bottom-tab': 'Bash', 'gsd-sub-tab': 'State' },
};

// AFTER (D-20):
currentState = {
  version: 1,
  layout: { 'sidebar-w': '200px', 'right-w': '25%', 'sidebar-collapsed': false },       // drop right-h-pct
  theme: { mode: 'dark' },
  session: { 'main-tmux-session': 'efx-mux' },                                          // drop right-tmux-session
  project: { active: null, projects: [] },
  panels: { 'right-top-tab': 'File Tree', 'gsd-sub-tab': 'State' },                    // drop right-bottom-tab
};
```

**Drop signal restore** — line 85:
```typescript
// BEFORE:
if (currentState?.panels?.['right-bottom-tab']) rightBottomTab.value = currentState.panels['right-bottom-tab'];
// AFTER: (delete line entirely)
```

**Silent key drop on first save** — add inside `saveAppState` (lines 102-113) OR at the end of `loadAppState` after the signal restore block (line 94). Per RESEARCH Example 3, doing it once on load is simpler:
```typescript
// D-20: migrate away from legacy right-panel layout keys. Idempotent, silent.
if (currentState) {
  delete (currentState.panels as any)?.['right-bottom-tab'];
  delete (currentState.session as any)?.['right-tmux-session'];
  delete (currentState.layout as any)?.['right-h-pct'];
}
```

**No new exports needed** — `updateSession` already handles arbitrary keys; right-scope `terminal-tabs.tsx` calls it directly with `right-terminal-tabs:<project>` and `right-active-tab:<project>` keys.

---

### `src/main.tsx` (bootstrap)

**Analog:** Self — existing `cleanup_dead_sessions` hook at line 402 + dual-scope restore by duplicating the pattern at lines 415-430.

**Migration invocation pattern** — insert immediately after line 402 (RESEARCH Example 3):
```typescript
try { await invoke('cleanup_dead_sessions'); } catch {}

// D-19: kill legacy <project>-right tmux sessions from prior layout. Best-effort, non-fatal.
try {
  const projectNames = projects.value.map(p => p.name);
  if (projectNames.length > 0) {
    const killed = await invoke<string[]>('kill_legacy_right_sessions', { projectNames });
    if (killed.length > 0) console.log('[efxmux] killed legacy right sessions:', killed);
  }
} catch { /* best-effort */ }
```

**Dual-scope restore pattern** — after the main-scope `restoreTabs` block (line 430), add a sibling right-scope restore that delegates to `getTerminalScope('right').restoreProjectTabs(activeName, activeProject?.path)` — identical shape to lines 415-430 but reading `right-terminal-tabs:<project>` and calling the scoped restore. Apply `_suppressPersist` guard pattern (Pitfall 4) the same way `suppressEditorPersist` is used at line 462.

**`project-pre-switch` handler extension** — lines 506-512:
```typescript
document.addEventListener('project-pre-switch', (e: Event) => {
  const { oldName } = (e as CustomEvent).detail;
  if (oldName) {
    saveCurrentProjectState(oldName);
    saveProjectTabs(oldName);                     // existing: saves main scope
    saveProjectTabs(oldName, 'right');            // NEW: save right scope too (D-18)
  }
});
```
Signature extension of `saveProjectTabs(projectName, scope='main')` lives in `terminal-tabs.tsx`.

**Remove stale right-bash bootstrap** — lines 396-399 (unused `rightCurrentSession` derivation) and 566-570 (`switch-bash-session` dispatch in project-changed handler) are **deleted** per D-21.

**Remove `right-h-pct` layout apply** — lines 468-480 (the whole `if (appState?.layout?.['right-h-pct'])` block) deleted per D-20.

---

### `src-tauri/src/terminal/pty.rs` (new `kill_legacy_right_sessions` command)

**Analog:** `src-tauri/src/terminal/pty.rs:536-566` — `cleanup_dead_sessions`

**Imports / decorator pattern** — already in file (line 539):
```rust
#[tauri::command]
pub fn cleanup_dead_sessions() -> Result<Vec<String>, String> { ... }
```

**Core pattern to copy** — lines 540-566:
```rust
#[tauri::command]
pub fn cleanup_dead_sessions() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}:#{pane_dead}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(vec![]);       // no tmux server — nothing to do
    }
    // iterate parsed output, kill-session per match, push name to `cleaned`
    Ok(cleaned)
}
```

**New command** — same file, adjacent to `cleanup_dead_sessions`:
```rust
/// Phase 20 D-19: Kill legacy "<project>-right" tmux sessions from the pre-Phase-20
/// right-panel layout. Best-effort; silently ignores missing sessions. Called once
/// at app bootstrap after cleanup_dead_sessions.
#[tauri::command]
pub fn kill_legacy_right_sessions(project_names: Vec<String>) -> Result<Vec<String>, String> {
    let mut killed = Vec::new();
    for name in project_names {
        // Mirror pty.rs sanitization (alphanumeric + - + _) to match the session
        // names actually used by the old right-panel code path.
        let sanitized: String = name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect::<String>()
            .to_lowercase();
        if sanitized.is_empty() { continue; }
        let target = format!("{}-right", sanitized);
        let status = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &target])
            .output();
        // tmux returns non-zero when the session doesn't exist — treat as no-op.
        if let Ok(out) = status {
            if out.status.success() {
                killed.push(target);
            }
        }
    }
    Ok(killed)
}
```

**Handler registration** — `src-tauri/src/lib.rs` line 135, add to the `generate_handler!` list alongside `cleanup_dead_sessions`:
```rust
cleanup_dead_sessions,
kill_legacy_right_sessions,   // NEW
```

**Error handling pattern** — best-effort; never propagate failure (RESEARCH Pitfall 2). Do not `.map_err(...)?` on the `.output()` inside the loop — let it silently skip (matches `cleanup_dead_sessions` lines 558-562).

---

### `src/components/unified-tab-bar.test.tsx` (NEW)

**Analog:** `src/components/dropdown-menu.test.tsx` (render + fireEvent) + `src/components/editor-tab.test.tsx` (mockIPC + listener capture pattern).

**Imports pattern** — `src/components/dropdown-menu.test.tsx:1-5`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { Dropdown, type DropdownItem } from './dropdown-menu';
```

**Tauri mock pattern** — `src/components/editor-tab.test.tsx:14-23` + `src/components/git-control-tab.test.tsx:6-13`:
```typescript
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
```

**Signal reset beforeEach** — `src/components/sidebar.test.tsx:14-35`:
```typescript
beforeEach(() => {
  projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
  activeProjectName.value = 'testproj';
  // reset scoped registries per scope
});
```

**Tests to write (Validation Architecture map):**
- D-05: `<UnifiedTabBar scope="right" />` renders "File Tree" and "GSD" labels with no `×` adjacent
- D-05: Terminal tab rendered alongside sticky pair keeps its `×` close button
- D-03: `fireEvent.mouseDown` on a dynamic tab then `mouseMove` past x=0 does NOT reorder sticky tabs (assert `tabOrder` unchanged)
- D-07: With `gitChangesTab.value = { id: 'gc', type: 'git-changes', owningScope: 'main' }`, right `+` → Git Changes flips `owningScope` to `'right'`
- D-06: `scope="right"` plus-menu items == ['Terminal (Zsh)', 'Agent', 'Git Changes']; `scope="main"` items identical list (no regression)

---

### `src/components/right-panel.test.tsx` (NEW)

**Analog:** `src/components/gsd-pane.test.tsx` (Tauri mocks at module scope + project signal seed).

**Setup pattern** — `src/components/gsd-pane.test.tsx:7-22`:
```typescript
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.reject(new Error('missing file'))),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { RightPanel } from './right-panel';

describe('RightPanel', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
  });
  ...
});
```

**Tests to write:**
- D-17: Fresh render shows "File Tree" and "GSD" tabs, active = File Tree, no dynamic tab
- D-01: No element with `[data-handle="right-h"]` (split handle absent)
- D-01: No `.right-bottom` node in DOM
- D-21: After render, dispatching `CustomEvent('switch-bash-session', ...)` produces no side-effect (listener absent)
- Pitfall 6: Only one sticky body has `display: block` at a time; `.terminal-containers[data-scope="right"]` has `display: none` when activeId is sticky

---

### `src/components/terminal-tabs.test.ts` (NEW)

**Analog:** `src/state-manager.test.ts` (mockIPC + signal reset, lines 1-56).

**Setup pattern** — `src/state-manager.test.ts:37-48`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { projects, activeProjectName } from '../state-manager';
import {
  terminalTabs, activeTabId,
  getTerminalScope,
} from './terminal-tabs';

beforeEach(() => {
  projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'bash' }];
  activeProjectName.value = 'testproj';
  mockIPC((cmd) => {
    if (cmd === 'spawn_terminal') return null;
    if (cmd === 'destroy_pty_session') return null;
    if (cmd === 'resize_pty') return null;
    if (cmd === 'load_state') return { version: 1, layout: {}, theme: { mode: 'dark' }, session: {}, project: { active: null, projects: [] }, panels: {} };
    if (cmd === 'save_state') return null;
    return null;
  });
});
```

**Tests to write:**
- D-10/D-11 backward-compat: top-level `terminalTabs` signal === `getTerminalScope('main').tabs`
- D-10 isolation: pushing to `getTerminalScope('right').tabs.value` does NOT mutate `getTerminalScope('main').tabs.value`
- D-14: `getTerminalScope('right').createNewTab()` produces sessionName matching `/-r\d+$/` (assert via the spawn_terminal mockIPC args capture)
- D-14: `getTerminalScope('main').createNewTab()` for first tab produces bare `testproj` (no suffix); second tab produces `testproj-2` (no `r`)
- Pitfall 1: simulate crash + restart → new sessionName matches `/-rr\d+$/`, never `/-r\d+$/` unless already right-scope
- D-15/D-16 persistence round-trip: seed `right-terminal-tabs:testproj` in state, invoke `restoreProjectTabs('testproj', '/tmp/proj', undefined, 'right')`, assert `getTerminalScope('right').tabs.value.length === seeded.length`

---

## Shared Patterns

### Tauri IPC invoke pattern
**Source:** `src/components/terminal-tabs.tsx:236`
**Apply to:** all Rust-command call sites (new `kill_legacy_right_sessions` invocation, restore paths)
```typescript
try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch (err) {
  console.warn('[efxmux] Failed to destroy PTY session:', err);
}
```
**Key property:** non-fatal catch + `console.warn` prefixed `[efxmux]`. Never throw into the UI layer.

### Signal reactivity trigger
**Source:** `src/components/terminal-tabs.tsx:218, 301, 740`
**Apply to:** every mutation of `TerminalTab` object fields
```typescript
tab.label = newLabel;
terminalTabs.value = [...terminalTabs.value]; // trigger reactivity after in-place mutation
```
**Why:** Preact signals re-render only on identity change. In-place mutation needs an explicit array-clone assignment.

### `listen()` cleanup pattern
**Source:** `src/components/terminal-tabs.tsx:734` (module-level listener, no cleanup — intentional, survives HMR)
**Apply to:** module-level `pty-exited` listener in the refactored terminal-tabs (keep single instance, iterate scopes)

### Persistence — `updateSession` patch shape
**Source:** `src/components/terminal-tabs.tsx:448-462`
**Apply to:** all per-scope persistence writes
```typescript
const data = JSON.stringify({ tabs, activeTabId: activeTabId.value });
const patch: Record<string, string> = { [scopedKey]: data };
if (activeName) patch[`${scopedKey}:${activeName}`] = data;
updateSession(patch);
```
For right scope, skip the global-flat key (only the per-project form is used, per D-15).

### Confirm modal (agent-quit)
**Source:** `src/components/unified-tab-bar.tsx:420-446`
**Apply to:** right-scope agent tab close
```typescript
if (termTab?.isAgent) {
  showConfirmModal({
    title: 'Quit Agent',
    message: 'Do you want to quit just the agent or close the terminal session entirely?',
    confirmLabel: 'Quit Terminal',
    onConfirm: () => { /* destroy */ closeTab(tabId); },
    onCancel: () => {},
    onSave: () => { invoke('write_pty', { data: '/exit\r', sessionName: termTab.sessionName }); },
    saveLabel: 'Quit Agent Only',
  });
}
```
Scope-aware call: use `getTerminalScope(tab.ownerScope).closeTab(tabId)` in `onConfirm`.

### Tokens-only styling
**Source:** `src/components/crash-overlay.tsx:23-49` + `unified-tab-bar.tsx:848-851`
**Apply to:** all new JSX (right-panel.tsx, sticky tab render branch)
```typescript
import { colors, fonts, spacing } from '../tokens';
// No hex literals, no raw pixel magic numbers for colors.
```

### Container display toggle (D-09 mount-always)
**Source:** `src/components/right-panel.tsx:120-125` (existing) + `src/components/terminal-tabs.tsx:418-426` (switchToTab)
**Apply to:** sticky bodies + Git Changes body in new `right-panel.tsx`
```tsx
<div style={{ height: '100%', display: activeId === '<id>' ? 'block' : 'none' }}>
  <StickyBody />
</div>
```
Never unmount (preserves GSD parse cache, FileTree scroll, xterm.js WebGL context).

### Test mockIPC beforeEach reset
**Source:** `src/state-manager.test.ts:38-56`
**Apply to:** all new test files
```typescript
beforeEach(() => {
  // 1. reset all signals to known values
  // 2. mockIPC((cmd, args) => ...) returning deterministic fixtures
  // 3. no cross-test pollution
});
```

---

## No Analog Found

None. Every file in Phase 20's scope has a direct in-repo analog — by construction, since this phase is a scope-parametrization refactor of Phase 17's production-tested infrastructure.

---

## Metadata

**Analog search scope:** `src/components/`, `src/state-manager.ts`, `src/main.tsx`, `src/utils/`, `src-tauri/src/terminal/`, `src-tauri/src/lib.rs`, `src/**/*.test.{ts,tsx}`
**Files scanned:** `terminal-tabs.tsx`, `unified-tab-bar.tsx`, `right-panel.tsx`, `state-manager.ts`, `state-manager.test.ts`, `main.tsx` (lines 370-582), `session-name.ts`, `crash-overlay.tsx`, `gsd-pane.tsx`, `gsd-pane.test.tsx`, `dropdown-menu.test.tsx`, `editor-tab.test.tsx`, `git-control-tab.test.tsx`, `sidebar.test.tsx`, `pty.rs` (lines 530-610), `lib.rs` (handler registration)
**Pattern extraction date:** 2026-04-17
