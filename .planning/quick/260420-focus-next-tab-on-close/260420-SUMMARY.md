---
quick_id: 260420-focus-next-tab-on-close
status: complete
created: 2026-04-20
---

# Quick Task Summary: Focus Next Tab on Close

## What Changed

Added `switchToAdjacentTabInScope(scope, currentId)` helper in unified-tab-bar.tsx and updated all close paths to use it.

## Files Modified

- `src/components/unified-tab-bar.tsx` — Added helper function + updated 5 close paths

## Implementation Details

### New Helper (line ~1254)
```typescript
function switchToAdjacentTabInScope(scope: TerminalScope, currentId: string): void {
  const order = getScopedTabOrder(scope);
  const idx = order.indexOf(currentId);
  if (idx === -1) return;
  const nextId = order[idx + 1] ?? order[idx - 1];
  if (!nextId) return;
  // ...activate nextId
}
```

### Updated Close Paths
1. **Right-scope Git Changes** — now calls `switchToAdjacentTabInScope('right-0', tabId)`
2. **GSD singleton tabs** — now calls `switchToAdjacentTabInScope(gsd.owningScope, tabId)`
3. **File Tree tabs** — now calls `switchToAdjacentTabInScope(ftTab.ownerScope, tabId)`
4. **Right-scope agent terminals** — now calls `switchToAdjacentTabInScope(termScope!, tabId)`
5. **Right-scope non-agent terminals** — now calls `switchToAdjacentTabInScope(termScope!, tabId)`

## Behavior Before/After

| Scenario | Before | After |
|----------|--------|-------|
| Close GSD tab with other tabs in scope | No tab selected | Next tab focused |
| Close File Tree tab with other tabs in scope | No tab selected | Next tab focused |
| Close right-scope terminal with other tabs | No tab selected | Next tab focused |

## Verification

- TypeScript compiles (no new errors in unified-tab-bar.tsx)
- Logic follows existing `switchToAdjacentTab` pattern for consistency
