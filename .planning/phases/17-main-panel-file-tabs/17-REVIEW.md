---
phase: 17-main-panel-file-tabs
reviewed: 2026-04-15T18:42:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - package.json
  - src/components/confirm-modal.tsx
  - src/components/dropdown-menu.tsx
  - src/components/editor-tab.tsx
  - src/components/git-changes-tab.tsx
  - src/components/main-panel.tsx
  - src/components/right-panel.tsx
  - src/components/sidebar.tsx
  - src/components/terminal-tabs.tsx
  - src/components/unified-tab-bar.tsx
  - src/editor/languages.ts
  - src/editor/setup.ts
  - src/editor/theme.ts
  - src/main.tsx
  - src/services/file-service.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-04-15T18:42:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed 15 source files spanning the unified tab bar system, editor integration (CodeMirror 6), git changes accordion, terminal tab management, file service layer, and the main application entry point. The codebase is well-structured with good separation of concerns, proper HTML escaping in diff rendering, and solid error handling patterns throughout. Found 1 critical issue (signal mutation inside computed causing potential infinite loops), 5 warnings (stale closure in module-level sync code, duplicate function, empty catch blocks hiding errors, dangerouslySetInnerHTML with non-user-sourced but partially-validated input, and a missing `await` for an async restore call), and 3 info-level items.

## Critical Issues

### CR-01: Signal mutation inside computed body risks infinite update loops

**File:** `src/components/unified-tab-bar.tsx:90-95`
**Issue:** The `editorTabs` and `tabOrder` computed signals call `ensureProjectInMaps()` inside their computed body. `ensureProjectInMaps` (lines 64-71) mutates the `_editorTabsByProject` and `_tabOrderByProject` signals when the project key is missing. Mutating a signal inside a `computed` callback triggers a re-evaluation of any dependents, which can cascade back into the same computed, causing an infinite update cycle or at minimum unpredictable evaluation order. Preact Signals does not guarantee safe behavior when a computed writes to a signal it transitively depends on.

**Fix:** Move the initialization out of computed. Either call `ensureProjectInMaps` at the point where `activeProjectName` changes (e.g., in the project-switch event handler or via an `effect`), or make the computed purely read-only:
```typescript
export const editorTabs = computed<EditorTabData[]>(() => {
  const name = activeProjectName.value;
  if (!name) return [];
  return _editorTabsByProject.value.get(name) ?? [];
});

export const tabOrder = computed<string[]>(() => {
  const name = activeProjectName.value;
  if (!name) return [];
  return _tabOrderByProject.value.get(name) ?? [];
});

// Separate effect to initialize maps when project changes
effect(() => {
  const name = activeProjectName.value;
  if (name) ensureProjectInMaps(name);
});
```

## Warnings

### WR-01: Module-level terminalTabs sync runs once at import time, not reactively

**File:** `src/components/unified-tab-bar.tsx:123-127`
**Issue:** The `terminalTabs.value.forEach(...)` block at module level runs only once when the module is first imported. At import time, `terminalTabs.value` is an empty array, so this code never appends terminal IDs to `tabOrder`. New terminal tabs created later are not synced by this code. The `setProjectTabOrder` calls within `openEditorTab`, `openGitChangesTab`, and `closeUnifiedTab` do append IDs to `tabOrder`, but terminal tabs created via `createNewTab` are never added to `tabOrder` through this path. This means the `getOrderedTabs` function may produce an order list that omits terminal tabs, and tab ordering via drag-and-drop may not persist correctly for terminal tabs.

**Fix:** Replace the module-level forEach with a reactive subscription or effect:
```typescript
effect(() => {
  const terminals = terminalTabs.value;
  const currentOrder = tabOrder.value;
  const newIds = terminals.map(t => t.id).filter(id => !currentOrder.includes(id));
  if (newIds.length > 0) {
    setProjectTabOrder([...currentOrder, ...newIds]);
  }
});
```

### WR-02: Duplicate `projectSessionName` function (one copy is dead code internally)

**File:** `src/components/terminal-tabs.tsx:61-65`
**Issue:** `terminal-tabs.tsx` defines a local `projectSessionName` function identical to the exported one in `src/utils/session-name.ts`. Meanwhile, `main.tsx` imports from `utils/session-name`. The local copy in `terminal-tabs.tsx` is used internally there but diverges from the shared utility. If either copy's sanitization logic changes, the other will silently remain out of sync, potentially producing mismatched tmux session names between the main bootstrap and tab management code.

**Fix:** Remove the local function from `terminal-tabs.tsx` and import from the shared utility:
```typescript
import { projectSessionName } from '../utils/session-name';
```

### WR-03: Empty catch blocks hide PTY cleanup failures

**File:** `src/components/terminal-tabs.tsx:214` and `src/components/terminal-tabs.tsx:248`
**Issue:** Both `closeActiveTab` and `closeTab` swallow all errors from `invoke('destroy_pty_session', ...)` with empty catch blocks `catch {}`. While session cleanup is non-critical, silently swallowing errors makes debugging backend PTY issues harder when sessions fail to clean up.

**Fix:** Add a warn-level log:
```typescript
try {
  await invoke('destroy_pty_session', { sessionName: tab.sessionName });
} catch (err) {
  console.warn('[efxmux] destroy_pty_session failed (non-fatal):', err);
}
```

### WR-04: `dangerouslySetInnerHTML` with diff content that passes through `escapeHtml`

**File:** `src/components/git-changes-tab.tsx:320`
**Issue:** The diff accordion body uses `dangerouslySetInnerHTML` with output from `renderDiffLines`. While `renderDiffLines` does call `escapeHtml` on each line's text content (line 66, 74, 83, 94), the diff data comes from the Rust backend via `invoke('get_file_diff')`. The `escapeHtml` function correctly escapes `&`, `<`, `>`, and `"` (lines 36-40), but does not escape single quotes (`'`). In the current rendering context (inline styles, no attribute values using single quotes), this is not exploitable. However, the pattern of injecting backend data via `dangerouslySetInnerHTML` creates a fragile security surface -- any future template change that introduces single-quoted attributes could open an injection vector. The fallback string `'Loading diff...'` is also passed through `renderDiffLines` without issue since it contains no special characters.

**Fix:** Consider adding single-quote escaping to `escapeHtml` for defense-in-depth:
```typescript
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### WR-05: Missing `await` on async `restoreEditorTabs` call

**File:** `src/main.tsx:314`
**Issue:** `restoreEditorTabs(activeName)` is an async function that returns `Promise<boolean>`, but it is called without `await`. This means any errors thrown during editor tab restoration (e.g., file read failures) will produce unhandled promise rejections rather than being caught. Additionally, the editor tabs may not be fully restored before subsequent code that depends on them runs.

**Fix:** Add `await` to the call:
```typescript
if (activeName) {
  await restoreEditorTabs(activeName);
}
```

## Info

### IN-01: Suppressed eslint exhaustive-deps warning hides potential stale closure

**File:** `src/components/editor-tab.tsx:78-79`
**Issue:** The `eslint-disable-next-line react-hooks/exhaustive-deps` comment suppresses a warning that `handleSave` and `handleDirtyChange` are not in the `useEffect` dependency array (line 79). These functions are defined inside the component body and capture `tabId`, `filePath`, `fileName`, and `setupRef` via closure. Since the effect only depends on `[filePath]`, if the component re-renders with a new `tabId` while `filePath` stays the same, the registered save callback and dirty change handler will reference stale `tabId` values.

In practice, `tabId` is derived from `filePath` (via `'editor-' + Date.now()`) so this stale closure is unlikely to manifest, but the suppression masks the real dependency.

**Fix:** Consider using `useCallback` with proper dependencies for `handleSave` and `handleDirtyChange`, or use a ref for `tabId` to ensure the closure always reads the current value.

### IN-02: Unused `syntaxHighlighting` import in theme.ts creates duplicate extension

**File:** `src/editor/theme.ts:5`
**Issue:** `theme.ts` imports `syntaxHighlighting` from `@codemirror/language` and uses it to create `efxmuxSyntaxHighlighting` (line 83). However, `setup.ts` also imports `syntaxHighlighting` separately (line 7) and wraps `efxmuxHighlightStyle` again at line 89: `syntaxHighlighting(efxmuxHighlightStyle)`. The exported `efxmuxSyntaxHighlighting` from `theme.ts` is never imported by any other file. This means the highlight style is wrapped in `syntaxHighlighting()` twice -- once as the unused export and once in `setup.ts`. No bug results (the unused export is simply dead code), but it adds confusion about which is the canonical extension.

**Fix:** Either remove the `efxmuxSyntaxHighlighting` export from `theme.ts`, or import and use it in `setup.ts` instead of creating a second wrapper:
```typescript
// In setup.ts, replace:
import { syntaxHighlighting } from '@codemirror/language';
// ...
syntaxHighlighting(efxmuxHighlightStyle),

// With:
import { efxmuxSyntaxHighlighting } from './theme';
// ...
efxmuxSyntaxHighlighting,
```

### IN-03: Editor tab ID uses `Date.now()` without additional uniqueness guarantee

**File:** `src/components/unified-tab-bar.tsx:153`
**Issue:** Editor tab IDs are generated as `'editor-' + Date.now()`. If two files are opened programmatically in rapid succession (e.g., during `restoreEditorTabs` which loops over persisted tabs), `Date.now()` could return the same millisecond value, producing duplicate IDs. The one-tab-per-file check at line 144 prevents duplicate tabs for the same `filePath`, but if two different files are opened in the same millisecond, they would share an ID, causing React key conflicts and incorrect tab-close behavior.

**Fix:** Add a counter suffix for uniqueness:
```typescript
let editorTabCounter = 0;
// ...
const newTab: EditorTabData = {
  id: `editor-${Date.now()}-${++editorTabCounter}`,
  // ...
};
```

---

_Reviewed: 2026-04-15T18:42:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
