# Phase 20 — Deferred Items

Issues discovered during Phase 20 plan execution that are OUT OF SCOPE for the
plan that found them. They are logged here for later attention.

---

## From Plan 20-03

### Full-suite vitest timeout on `src/components/file-tree.test.tsx`

- **Discovered during:** Plan 20-03 final verification step
- **Symptom:** `pnpm test` (full suite) fails with
  `[vitest-pool]: Timeout terminating forks worker for test files .../file-tree.test.tsx` +
  `Error: Worker exited unexpectedly`.
- **Scope check:** Plan 20-03 did not touch `file-tree.test.tsx` nor any file-tree
  component. The failure is not caused by this plan's edits.
- **Evidence it's pre-existing / unrelated:** `pnpm test -- --run src/state-manager.test.ts`
  (17 tests) passes cleanly after every Plan 20-03 commit. The timeout is specific to
  the file-tree test file's own worker lifecycle.
- **Deferred to:** whichever phase next touches file-tree.test.tsx, or a dedicated test
  infra cleanup task.

### `right-panel.tsx` still imports the removed `rightBottomTab` signal

- **Discovered during:** Plan 20-03 Task 1 typecheck
- **Symptom:** `pnpm exec tsc --noEmit` emits:
  `src/components/right-panel.tsx(8,23): error TS2724: '"../state-manager"' has no exported member named 'rightBottomTab'.`
- **Scope check:** The plan explicitly says "Do NOT modify right-panel.tsx here. …
  flag the remaining call sites in the SUMMARY — Plan 04 will clean them up during
  the right-panel rewrite."
- **Deferred to:** **Plan 20-04** (right-panel rewrite), which will remove the import
  and replace the entire bottom-tab UI.
- **Remaining call sites (6 uses in right-panel.tsx):**
  - line 8: `import { rightBottomTab } from '../state-manager'`
  - line 34–36: guard `!RIGHT_BOTTOM_TABS.includes(rightBottomTab.value)` fallback
  - line 143: `activeTab={rightBottomTab}`
  - line 144: `onSwitch={(tab) => { rightBottomTab.value = tab; }}`
