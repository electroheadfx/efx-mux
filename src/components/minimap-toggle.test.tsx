// minimap-toggle.test.tsx — Phase 20 Plan 05-C tests
//
// Covers: Minimap toggle icon visibility is gated by the active tab's TYPE
// within its scope. The icon must ONLY appear when the scope's active tab is
// an editor (file) tab. For terminal / agent / git-changes / file-tree / gsd
// tabs, the icon is hidden.
//
// Because each scope (main / right) has its own activeTabId, the main and
// right tab bars independently compute visibility — a file open in the main
// scope does NOT make the right-scope icon appear (and vice versa).

import { describe, it, expect } from 'vitest';
import { isEditorTabActiveInScope } from './unified-tab-bar';

// Minimal UnifiedTab shapes (structural — matches the exported type's
// discriminants without needing to re-import internal symbols).
type AnyTab =
  | { type: 'terminal'; id: string; terminalTabId: string; scope: 'main' | 'right' }
  | { type: 'editor'; id: string; filePath: string; fileName: string; content: string; dirty: boolean; pinned: boolean }
  | { type: 'git-changes'; id: string; owningScope: 'main' | 'right' }
  | { type: 'file-tree'; id: 'file-tree' }
  | { type: 'gsd'; id: 'gsd' };

function editorTab(id: string): AnyTab {
  return { type: 'editor', id, filePath: `/p/${id}`, fileName: id, content: '', dirty: false, pinned: false };
}
function termTab(id: string, scope: 'main' | 'right' = 'main'): AnyTab {
  return { type: 'terminal', id, terminalTabId: id, scope };
}
function gcTab(id: string, owningScope: 'main' | 'right' = 'main'): AnyTab {
  return { type: 'git-changes', id, owningScope };
}
const fileTreeTab: AnyTab = { type: 'file-tree', id: 'file-tree' };
const gsdTab: AnyTab = { type: 'gsd', id: 'gsd' };

describe('isEditorTabActiveInScope (minimap icon visibility gate)', () => {
  it('returns false when activeId is empty', () => {
    expect(isEditorTabActiveInScope([editorTab('e1')] as any, '')).toBe(false);
  });

  it('returns false when the active tab is a terminal tab', () => {
    const tabs = [termTab('t1'), editorTab('e1')];
    expect(isEditorTabActiveInScope(tabs as any, 't1')).toBe(false);
  });

  it('returns false when the active tab is a git-changes tab', () => {
    const tabs = [gcTab('gc1'), editorTab('e1')];
    expect(isEditorTabActiveInScope(tabs as any, 'gc1')).toBe(false);
  });

  it('returns false when the active tab is the sticky File Tree tab', () => {
    const tabs = [fileTreeTab, gsdTab, editorTab('e1')];
    expect(isEditorTabActiveInScope(tabs as any, 'file-tree')).toBe(false);
  });

  it('returns false when the active tab is the sticky GSD tab', () => {
    const tabs = [fileTreeTab, gsdTab, editorTab('e1')];
    expect(isEditorTabActiveInScope(tabs as any, 'gsd')).toBe(false);
  });

  it('returns true when the active tab is an editor (file) tab', () => {
    const tabs = [termTab('t1'), editorTab('e1'), editorTab('e2')];
    expect(isEditorTabActiveInScope(tabs as any, 'e1')).toBe(true);
    expect(isEditorTabActiveInScope(tabs as any, 'e2')).toBe(true);
  });

  it('returns false when activeId is not in the scoped list (e.g., file open in OTHER scope)', () => {
    // Simulates: main-scope tab list has terminals only; active id belongs to
    // an editor tab that lives in the other scope. Since we filter by the
    // scope's ordered list, the icon is correctly hidden in this scope.
    const mainOrdered = [termTab('t1'), termTab('t2')];
    expect(isEditorTabActiveInScope(mainOrdered as any, 'editor-in-right-scope')).toBe(false);
  });

  it('main and right scopes compute visibility independently', () => {
    // Main: editor active → icon shows in main.
    const mainOrdered = [termTab('t1'), editorTab('e1')];
    // Right: File Tree (sticky) active → icon hidden in right.
    const rightOrdered = [fileTreeTab, gsdTab, termTab('r-t1', 'right')];
    expect(isEditorTabActiveInScope(mainOrdered as any, 'e1')).toBe(true);
    expect(isEditorTabActiveInScope(rightOrdered as any, 'file-tree')).toBe(false);
  });
});
