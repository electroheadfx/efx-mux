---
phase: 17-main-panel-file-tabs
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - package.json
  - pnpm-lock.yaml
  - src/components/confirm-modal.tsx
  - src/components/dropdown-menu.tsx
  - src/components/editor-tab.tsx
  - src/components/git-changes-tab.tsx
  - src/components/main-panel.tsx
  - src/components/terminal-tabs.tsx
  - src/components/unified-tab-bar.tsx
  - src/editor/languages.ts
  - src/editor/setup.ts
  - src/editor/theme.ts
  - src/main.tsx
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed 12 files covering the main panel, unified tab bar, editor tabs, git changes tab, terminal tabs, and supporting modules. Found 1 critical issue, 3 warnings, and 2 info items. The critical issue is a broken synthetic keyboard event in the editor-save handler that will fail to trigger the CodeMirror keymap. The project name in package.json also needs correction to "efxmux" per project conventions.

## Critical Issues

### CR-01: Broken synthetic keyboard event in editor-save handler

**File:** `src/components/editor-tab.tsx:91-100`
**Issue:** The synthetic `KeyboardEvent` dispatched for Cmd+S uses `keyCode: 19` and `which: 19`, which are the values for the Pause/Break key, not 's' (which should be 83). This mismatch causes CM6's `Mod-s` keymap handler to fail matching the event, so the save action never fires.

**Fix:**
```typescript
const event = new KeyboardEvent('keydown', {
  key: 's',
  code: 'KeyS',
  keyCode: 83,
  which: 83,
  bubbles: true,
  cancelable: true,
  metaKey: true,
  ctrlKey: false,
});
```

## Warnings

### WR-01: Typeahead buffer timeout not cleaned up on item changes

**File:** `src/components/dropdown-menu.tsx:87-94`
**Issue:** The `typeaheadTimeout` ref is set but never cleared when `selectableItems` changes (e.g., when items are filtered or the menu re-renders). If the user triggers a typeahead search and the items change before the 500ms timeout fires, the old timeout still fires and clears `typeaheadBuffer.current` after its new content was already set.

**Fix:** Add cleanup in a useEffect or clear the timeout before setting a new one:
```typescript
// Clear buffer after 500ms
if (typeaheadTimeout.current) clearTimeout(typeaheadTimeout.current);
typeaheadTimeout.current = setTimeout(() => {
  typeaheadBuffer.current = '';
}, 500);
```

### WR-02: Silent error swallowing in PTY session cleanup

**File:** `src/components/terminal-tabs.tsx:212,246`
**Issue:** Errors from `destroy_pty_session` are silently swallowed with empty catch blocks. While this may be intentional for non-critical cleanup, it hides failures that could indicate backend issues.

**Fix:** Add logging for unexpected failures:
```typescript
try { await invoke('destroy_pty_session', { sessionName: tab.sessionName }); } catch (err) {
  console.warn('[efxmux] Failed to destroy PTY session:', err);
}
```

### WR-03: Duplicate `projectSessionName` function

**File:** `src/components/terminal-tabs.tsx:60-64` and `src/main.tsx:42-45`
**Issue:** Identical `projectSessionName` functions exist in both files. This is a maintenance hazard — changes to the sanitization logic must be kept in sync manually.

**Fix:** Extract to a shared utility module (e.g., `src/utils/session-name.ts`) and import it in both files.

## Info

### IN-01: Project name mismatch in package.json

**File:** `package.json:3`
**Issue:** The package name is `"gsd-mux"` but the project is branded as "efxmux" per CLAUDE.md conventions.

**Fix:** Rename to `"efxmux"`:
```json
"name": "efxmux"
```

### IN-02: Suppressed eslint hook exhaustive-deps warning

**File:** `src/components/editor-tab.tsx:75-76`
**Issue:** The eslint-disable comment hides a potential stale-closure bug. The useEffect creating the EditorView depends only on `filePath`, but `handleSave` and `handleDirtyChange` are not in the dependency array. If those functions change identity due to parent re-renders, the effect will still use the stale closure.

**Fix:** Consider including `handleSave` and `handleDirtyChange` in the dependency array, or restructure to use refs for stable function identities.

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_