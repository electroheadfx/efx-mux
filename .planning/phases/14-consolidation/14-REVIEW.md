---
phase: 14-consolidation
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/components/fuzzy-search.tsx
  - src/components/main-panel.tsx
  - src/components/tab-bar.tsx
  - src/components/right-panel.tsx
  - src/components/file-tree.tsx
  - src/components/gsd-viewer.tsx
  - src/components/diff-viewer.tsx
  - src/components/project-modal.tsx
  - src/components/sidebar.tsx
  - src/components/terminal-tabs.tsx
  - src/tokens.ts
  - src/state-manager.ts
  - src/theme/theme-manager.ts
  - src/server/server-bridge.ts
  - src/terminal/terminal-manager.ts
  - package.json
  - src-tauri/Cargo.toml
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---
# Phase 14: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed all 17 listed source files at standard depth. No security vulnerabilities or logic errors found. Two correctness issues were identified: a `marked.parse()` async/sync mismatch in `gsd-viewer.tsx` that will cause the GSD viewer to fail to render, and an inconsistent console log prefix in `terminal-manager.ts`. Three additional informational items include a missing event listener cleanup, an unused local variable, and a dead code path.

## Warnings

### WR-01: `marked.parse()` returns Promise but is treated as string in gsd-viewer

**File:** `src/components/gsd-viewer.tsx:83`
**Issue:** `marked.parse(content)` returns a `Promise<string>` in marked v14 when called without `{ async: false }`. The `as string` type cast is a lie -- at runtime, `rendered` will be a `Promise` object, not a string. When passed to `injectLineNumbers(rendered, lineMap)`, the `.replace()` call on the Promise object returns `undefined`, so the GSD markdown will not render (innerHTML becomes `undefined`).

`main-panel.tsx:189` correctly uses `marked.parse(content, { async: false }) as string` on the same marked version (v14.1.4). The gsd-viewer.tsx call is missing this option.

**Fix:**
```typescript
// Before (line 83):
const rendered = marked.parse(content) as string;

// After:
const rendered = marked.parse(content, { async: false }) as string;
```

### WR-02: Inconsistent console prefix: `[efx-mux]` vs `[efxmux]`

**File:** `src/terminal/terminal-manager.ts:117`
**Issue:** All other source files use `[efxmux]` as the console prefix (e.g., `console.warn('[efxmux] ...')`), but `terminal-manager.ts` uses `[efx-mux]` with a hyphen. This makes log filtering inconsistent across the codebase.

**Fix:**
```typescript
// Before (line 117):
console.warn('[efx-mux] WebGL not available, using DOM renderer:', msg);

// After:
console.warn('[efxmux] WebGL not available, using DOM renderer:', msg);
```

## Info

### IN-01: Unused local variable in switchToTab

**File:** `src/components/terminal-tabs.tsx:334-349`
**Issue:** `switchToTab` retrieves `const tabs = terminalTabs.value` but then iterates over it using `for...of` where the loop variable shadows the outer `tabs` name (the parameter `tabId` is the one used for comparison). The outer `const tabs` is redundantly read once at the start and not meaningfully used beyond that initial read.

**Fix:** This is a style-level issue only. The function works correctly but could be simplified:
```typescript
function switchToTab(tabId: string): void {
  for (const tab of terminalTabs.value) {
    tab.container.style.display = tab.id === tabId ? 'block' : 'none';
  }
  requestAnimationFrame(() => {
    const active = terminalTabs.value.find(t => t.id === tabId);
    if (active) {
      active.fitAddon.fit();
      active.terminal.focus();
    }
  });
}
```

### IN-02: Unused `projectSessionCache` reference in restoreProjectTabs

**File:** `src/components/terminal-tabs.tsx:485-520`
**Issue:** `restoreProjectTabs` has a `let tabData` variable that starts as `null` and is progressively populated from either in-memory cache or disk. However, after falling back to disk (lines 493-504), the `projectSessionCache` map is never consulted -- only the disk-persisted `terminal-tabs:${projectName}` key is checked. The in-memory cache is checked via `projectTabCache.get()` but the local variable `tabData` shadows this and makes the logic harder to follow.

**Fix:** No action required. The code is functionally correct.

### IN-03: Ctrl+K shortcut blocks Alt+K on macOS

**File:** `src/terminal/terminal-manager.ts:44-91`
**Issue:** The `attachCustomKeyEventHandler` at line 82 blocks non-shift Ctrl keys including `k`, meaning `Cmd+K` (which translates to `Ctrl+K` in the event handler) clears the terminal. However, the condition at line 78-79 is `if (ev.ctrlKey && !ev.metaKey)`. On macOS, `Cmd+K` should produce `ev.metaKey=true, ev.ctrlKey=false`, so it would pass through correctly. The blocking is only for pure `Ctrl+K` (not Cmd+K), which is the intended behavior. This is not a bug -- just confirming the logic is as designed.

### IN-04: No regression risk from changes

The reviewed files (all Phase 14 consolidation changes) are primarily: comment cleanup, imports consolidation, and token/color system refactoring. No logic changes were introduced that could cause regressions. The `marked.parse` issue in gsd-viewer.tsx is pre-existing (not introduced by phase 14 changes).

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
