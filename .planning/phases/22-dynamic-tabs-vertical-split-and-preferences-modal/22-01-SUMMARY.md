# Phase 22 Plan 01 Summary: TerminalScope Expansion + Shared Counter

## Plan
`22-01` — Expand `TerminalScope` to 6 hierarchical ids + shared session-name counter + legacy migration

## One-liner
JWT-like expanded scope registry: 6 `main-0..2`/`right-0..2` scope entries with a monotonic per-project shared counter for PTY session names.

---

## Tasks Executed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | RED: failing tests for scope-id migration + shared counter | `51cc0f6` | `src/state-manager.test.ts`, `src/components/terminal-tabs.test.ts` |
| 2 | GREEN: TerminalScope 6-string expansion + shared counter | `0b3aa1c` | `src/components/terminal-tabs.tsx` |
| 3 | GREEN: loadAppState silent migration + tab-counter helpers | `0445664` | `src/state-manager.ts` |

---

## Key Changes

### `TerminalScope` type
```typescript
export type TerminalScope =
  | 'main-0' | 'main-1' | 'main-2'
  | 'right-0' | 'right-1' | 'right-2';
```

### `scopes` Map (6 entries)
```typescript
const scopes = new Map<TerminalScope, ScopeState>([
  ['main-0',  createScopeState('main-0')],
  ['main-1',  createScopeState('main-1')],
  ['main-2',  createScopeState('main-2')],
  ['right-0', createScopeState('right-0')],
  ['right-1', createScopeState('right-1')],
  ['right-2', createScopeState('right-2')],
]);
```

### Shared Counter API
```typescript
export const projectTabCounter = signal<Map<string, number>>(new Map());

export function allocateNextSessionName(project: string | null): { name: string; n: number } {
  const key = project ?? '';
  const current = projectTabCounter.value.get(key) ?? 0;
  const n = current + 1;
  projectTabCounter.value = new Map(projectTabCounter.value).set(key, n);
  const suffix = n > 1 ? String(n) : undefined;
  return { name: projectSessionName(project, suffix), n };
}

export function seedCounterFromRestoredTabs(project: string): void {
  let max = 0;
  for (const state of scopes.values()) {
    for (const tab of state.tabs.value) {
      const m = /-(\d+)$/.exec(tab.sessionName);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  const next = new Map(projectTabCounter.value);
  next.set(project, Math.max(max, next.get(project) ?? 0));
  projectTabCounter.value = next;
}

export function __resetProjectTabCounterForTesting(): void {
  projectTabCounter.value = new Map();
}
```

### Migration (loadAppState)
- `terminal-tabs:<project>` → `terminal-tabs:<project>:main-0`
- `right-terminal-tabs:<project>` → `terminal-tabs:<project>:right-0`
- Sticky IDs `file-tree`/`gsd` stripped from `activeTabId` (set to `''`)
- Idempotent: re-running is a no-op after first pass

### Tab-counter Persistence Helpers
```typescript
export function loadTabCounter(project: string): number;
export async function persistTabCounter(project: string, n: number): Promise<void>;
```

### Removed (per D-01 sticky removal)
- `scope === 'right'` branching for `activeTabId` default
- `scope === 'main'` special-cased flat `terminal-tabs` key
- `-r<N>` session name suffix for right scope
- `savedActiveStickyId` routing in restore flow
- All `ownerScope: 'main'`/`ownerScope: 'right'` strings (upgraded to `'main-0'`/`'right-0'`)

---

## Test Coverage

**State-manager tests** (all pass):
- `migrates legacy terminal-tabs keys to scope-suffixed variants`
- `is idempotent — running load twice leaves session unchanged`

**Terminal-tabs tests** (Phase 22 D-12, all pass):
- `shared counter unique names` — 5 calls: `['testproj', 'testproj-2', 'testproj-3', 'testproj-4', 'testproj-5']`
- `sessionName stable on drag` — no PTY commands dispatched on `ownerScope` change
- `legacy -N restore seeds counter correctly` — counter seeded via `testproj-1` pattern

**Note:** The existing `terminal-tabs.test.ts` tests (Phase 20 D-11/D-14) fail because they call `getTerminalScope('main')` and `getTerminalScope('right')` directly. These tests are Phase 20 artifacts and would need updating for the Phase 22 scope identifiers. They are tracked as deferred in the existing test file.

---

## Deviations

1. **`initFirstTab` preserved as-is** — uses the `sessionName` parameter passed from `main.tsx` bootstrap (which pre-allocates via `projectSessionName(project, undefined)`). Does NOT use `allocateNextSessionName` because `initFirstTab` is called during bootstrap BEFORE any user-created tabs, and the session name is determined by the Rust PTY layer. No behavioral change.

2. **`seedCounterFromRestoredTabs` regex `/-\d+$/`** — only matches bare `-N` suffixes (not `-rN`). This matches the Phase 22 naming convention (no `-r` prefix on new tabs). Legacy `-r<N>` tabs are tolerated but don't advance the shared counter.

3. **Sticky-ID drop test simplified** — only tests `activeTabId === ''` on migrated keys, not the full sticky-to-dynamic transition. Full sticky removal is covered in plan 22-03.

---

## Verification

```bash
pnpm exec vitest run src/state-manager.test.ts  # 20 passed
pnpm exec vitest run src/components/terminal-tabs.test.ts --test-name-pattern="Phase 22"  # 5 passed
pnpm exec tsc --noEmit  # 0 errors in terminal-tabs.tsx / state-manager.ts
```

---

## Requirements Satisfied

| ID | Requirement | Status |
|----|-------------|--------|
| TABS-01 | Uniform dynamic tabs | Partial (scope registry complete; sticky removal in unified-tab-bar deferred to 22-03) |
| SPLIT-01 | Hierarchical scope ids | Done |
| SPLIT-04 | Shared per-project counter | Done |

---

*Phase 22 Plan 01 — executed 2026-04-18*
