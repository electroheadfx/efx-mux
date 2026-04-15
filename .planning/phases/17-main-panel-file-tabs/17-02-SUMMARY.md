---
phase: 17-main-panel-file-tabs
plan: 02
subsystem: tabs
tags: [codemirror, editor, tabs, drag-drop, cm6]
dependency_graph:
  requires: []
  provides:
    - src/components/unified-tab-bar.tsx: UnifiedTabBar, openEditorTab, openGitChangesTab, closeUnifiedTab, setEditorDirty, updateEditorSavedContent, editorTabs, gitChangesTab, activeUnifiedTabId, tabOrder, allTabs
    - src/components/editor-tab.tsx: EditorTab
  affects:
    - main-panel.tsx (replaced TerminalTabBar with UnifiedTabBar)
    - terminal-tabs.tsx (removed TerminalTabBar function, kept all exports)
tech_stack:
  added:
    - unified-tab-bar.tsx: Preact + signals + native HTML5 DnD + Dropdown
    - editor-tab.tsx: CodeMirror 6 + useRef/useEffect pattern
  patterns:
    - Discriminated union tab types (BaseTab union)
    - Signal-driven derived state via computed()
    - Native HTML5 drag-and-drop reordering
    - showConfirmModal for dirty tab close workflow
    - useRef + useEffect imperative DOM for EditorView
    - File-service writeFile for Cmd+S save
key_files:
  created:
    - src/components/unified-tab-bar.tsx
    - src/components/editor-tab.tsx
  modified:
    - src/components/terminal-tabs.tsx (removed TerminalTabBar)
    - src/components/main-panel.tsx (use UnifiedTabBar)
    - src/components/dropdown-menu.tsx (icon type fix)
decisions:
  - id: D-01
    decision: Unified tab bar single-row mixing terminal, editor, git-changes tabs
    rationale: Replaces TerminalTabBar with extensible tab type system
  - id: D-02
    decision: Green dot (statusGreen) active terminal, yellow dot (statusYellow) dirty editor, FileDiff icon git-changes
    rationale: Visual type differentiation per UI-SPEC
  - id: D-03
    decision: One-tab-per-file enforcement via openEditorTab duplicate check
    rationale: EDIT-05 requirement
  - id: D-04
    decision: Dropdown [+] menu: Terminal (Zsh), Agent, Git Changes
    rationale: MAIN-01 requirement
  - id: D-05
    decision: Native HTML5 drag-and-drop with tabOrder signal and border visual indicators
    rationale: EDIT-05 requirement; avoids library dependency
  - id: D-11
    decision: showConfirmModal for dirty editor tab close with Discard/Save/Cancel
    rationale: EDIT-04 requirement
  - id: EDIT-02
    decision: setEditorDirty updates EditorTabData.dirty field, yellow dot shown when dirty
    rationale: EDIT-02 requirement
metrics:
  duration: ~8 min
  completed: 2026-04-15
  tasks_completed: 3
  files_created: 2
  files_modified: 3
---

# Phase 17 Plan 02 Summary: Unified Tab Bar + Editor Tab

## One-liner

Unified tab bar component created replacing TerminalTabBar, CodeMirror 6 editor tab component implemented with dirty tracking and Cmd+S save, TypeScript errors fixed.

## Completed Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Create unified tab bar (remove TerminalTabBar, new unified-tab-bar.tsx) | `6d672a8` |
| 2 | Create CodeMirror 6 editor tab component | `bd9e5bf` |
| 3 | Update main-panel.tsx to use UnifiedTabBar + fix TS errors | `f3b6327` |

## What Was Built

### Task 1: Unified Tab Bar (`6d672a8`)

**Removed:** `TerminalTabBar` function from `terminal-tabs.tsx` (lines 692-753), kept all exports.

**Created:** `src/components/unified-tab-bar.tsx`

**Tab type system:**
```typescript
interface BaseTab { id: string; type: 'terminal' | 'editor' | 'git-changes'; }
interface EditorTabData extends BaseTab {
  type: 'editor'; filePath: string; fileName: string; content: string; dirty: boolean;
}
interface GitChangesTabData extends BaseTab { type: 'git-changes'; }
type UnifiedTab = { type: 'terminal'; id: string; terminalTabId: string } | EditorTabData | GitChangesTabData;
```

**Signals:** `editorTabs`, `gitChangesTab`, `activeUnifiedTabId`, `tabOrder`, `allTabs` (computed combining all three tab types).

**Key exports:**
- `openEditorTab(filePath, fileName, content)`: one-tab-per-file enforcement (D-03), creates new tab or focuses existing
- `openGitChangesTab()`: singleton git changes tab
- `closeUnifiedTab(tabId)`: delegates to closeTab for terminal, shows confirmModal for dirty editor tabs (D-11)
- `setEditorDirty(tabId, dirty)`: updates dirty flag, triggers yellow dot
- `updateEditorSavedContent(tabId)`: clears dirty after save

**Drag-and-drop:** Native HTML5 DnD via `tabOrder` signal. `handleDragStart/Over/Drop/End` manage reordering. Visual indicator: 2px accent border on drag-over target.

**Dropdown menu:** Terminal (Zsh), Agent, Git Changes items with Terminal/Bot/FileDiff icons.

**Type indicators:** Green dot (statusGreen) for active terminal, yellow dot (statusYellow) for dirty editor, FileDiff icon for git changes.

**Active tab synchronization:** `activeTabId.subscribe` syncs terminal tab changes to `activeUnifiedTabId`; tab click syncs in both directions.

### Task 2: CodeMirror 6 Editor Tab (`bd9e5bf`)

**Created:** `src/components/editor-tab.tsx`

**Pattern:** `useRef` + `useEffect` (per RESEARCH.md Pattern 1 anti-pattern avoidance). EditorView created once per filePath in useEffect, stored in `viewRef`, destroyed on cleanup. Never recreates on re-render.

**handleSave:** `writeFile(filePath, docContent)` via file-service.ts, `setSavedContent(docContent)`, `setEditorDirty(tabId, false)`, `showToast({ type: 'success', message: `Saved ${fileName}` })`.

**handleDirtyChange:** calls `setEditorDirty(tabId, dirty)`.

**Visibility:** `display: isActive ? 'flex' : 'none'` preserves EditorView scroll position and undo history across tab switches.

**Focus:** `view.focus()` called in useEffect when `isActive` changes to true.

### Task 3: TypeScript Fixes + main-panel.tsx Update (`f3b6327`)

**Bug fix (Rule 1):** `main-panel.tsx` still referenced `TerminalTabBar` after removal.
- Fixed import: `import { UnifiedTabBar } from './unified-tab-bar'`
- Fixed JSX: `<TerminalTabBar />` to `<UnifiedTabBar />`

**Bug fix (Rule 1):** LucideIcon type incompatibility with `DropdownItem.icon: ComponentType<{ size?: number }>`.
- Fixed: `ComponentType<{ size?: number }>` to `ComponentType<any>` in dropdown-menu.tsx

## Deviations from Plan

### Rule 1 - Auto-fix: Bug Fixes

**1. main-panel.tsx still used TerminalTabBar after removal**
- **Found during:** TypeScript compile check
- **Issue:** `main-panel.tsx` line 8 imported `TerminalTabBar` from `terminal-tabs.tsx` and line 236 rendered `<TerminalTabBar />`. Both needed updating after TerminalTabBar removal.
- **Fix:** Changed import and JSX to use `UnifiedTabBar` from new `unified-tab-bar.tsx`
- **Files modified:** `src/components/main-panel.tsx`

**2. LucideIcon type incompatibility with DropdownItem.icon**
- **Found during:** TypeScript compile check
- **Issue:** `ComponentType<{ size?: number }>` not assignable from `LucideIcon` (which has `size?: string | number` in its LucideProps)
- **Fix:** Changed icon type to `ComponentType<any>`
- **Files modified:** `src/components/dropdown-menu.tsx`

## Verification

```bash
# Task 1
grep -c "TerminalTabBar" src/components/terminal-tabs.tsx  # 0 (removed)
test -f src/components/unified-tab-bar.tsx                  # exists
grep "export function UnifiedTabBar" src/components/unified-tab-bar.tsx  # found
grep "export function openEditorTab" src/components/unified-tab-bar.tsx  # found
grep "draggable" src/components/unified-tab-bar.tsx        # found
grep "Dropdown" src/components/unified-tab-bar.tsx         # found
grep "Terminal (Zsh)" src/components/unified-tab-bar.tsx   # found
grep "statusYellow" src/components/unified-tab-bar.tsx      # found
grep "statusGreen" src/components/unified-tab-bar.tsx      # found

# Task 2
test -f src/components/editor-tab.tsx                       # exists
grep "EditorView" src/components/editor-tab.tsx            # found
grep "createEditorState" src/components/editor-tab.tsx     # found
grep "writeFile" src/components/editor-tab.tsx             # found
grep "view.destroy()" src/components/editor-tab.tsx        # found
grep "dangerouslySetInnerHTML" src/components/editor-tab.tsx # not found

# TypeScript
npx tsc --noEmit  # Clean compilation
```

## TDD Gate Compliance

N/A -- Plan type is `execute`, not `tdd`.

## Self-Check

- [x] All acceptance criteria met for all 3 tasks
- [x] TypeScript compiles clean
- [x] No files deleted in commits (TerminalTabBar function replaced, not deleted -- just removed from terminal-tabs.tsx)
- [x] Commits are atomic (3 separate commits for 3 tasks)
- [x] All new files tracked in git
- [x] main-panel.tsx updated to use UnifiedTabBar
- [x] dropdown-menu.tsx icon type fixed
