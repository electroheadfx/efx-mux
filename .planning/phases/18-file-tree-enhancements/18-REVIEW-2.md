---
phase: 18-file-tree-enhancements
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src-tauri/src/git_ops.rs
  - src/components/editor-tab.test.tsx
  - src/components/editor-tab.tsx
  - src/components/file-tree.test.tsx
  - src/components/git-control-tab.tsx
  - src/components/unified-tab-bar.tsx
  - src/main.tsx
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 18: Code Review Report (Round 2)

**Reviewed:** 2026-04-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Phase 18 gap-closure round-2 deltas (plans 18-10, 18-11, 18-12) from commit `2155645` to HEAD. Scope:

- **Plan 18-10 (Gap G-01 primary):** `RevertOutcome::{Mutated, NoOp}` enum in `git_ops.rs`, `revert_file_impl` returns outcome, Tauri command layer emits `git-status-changed` on `Mutated`, frontend belt-and-braces emits in `handleRevertFile` / `handleRevertAll`.
- **Plan 18-11 (Gap G-01 secondary):** New `closeEditorTabForDeletedFile` helper in `unified-tab-bar.tsx`, editor-tab.tsx catches ENOENT-shaped errors on `readFile` and closes the stale tab.
- **Plan 18-12 (Gap G-02):** Module-level `isFinderDragActive` cache in `main.tsx` — set at Tauri `enter`, read at pathless `over`, reset at `leave`/`drop`.

Overall quality is good: each delta is small, tightly scoped, and accompanied by tests. Rust plumbing for the `RevertOutcome` enum is clean; the `AppHandle<R: Runtime>` generic keeps the command testable without leaking tauri internals into `revert_file_impl`. The `isFinderDragActive` cache is a pragmatic workaround for Tauri 2's pathless `over` events, and the comment block at line 57-65 of `main.tsx` clearly documents the root cause.

Three warnings merit attention before release:

1. **`editor-tab.tsx` catch block ignores the `cancelled` flag** — after the awaited `readFile` rejects, the code can call `closeEditorTabForDeletedFile(filePath)` even when the component has already unmounted and `cancelled` is `true`. Low-probability race but a clean fix.
2. **`editor-tab.test.tsx` mocks the wrong error shape** — production `readFile()` wraps Rust errors in `FileError('ReadError', String(e))` so `err.message` is `"ReadError: No such file..."`. The test mocks a raw `new Error('No such file...')`. The regex still matches because of the substring, but the test does not exercise the production error shape and will miss regressions if someone changes the `FileError` prefix.
3. **`isFinderDragActive` is not reset on `enter → (no leave) → enter`** — if Tauri fires an `enter` with inside-only paths AFTER a prior `enter` that set the flag true, the early `return` at line 304 leaves `isFinderDragActive = true` stale until the next `leave`/`drop`. Recovery is eventual, not immediate.

None rise to Critical. The four Info items cover minor code-quality concerns (redundant reactivity pass in `closeEditorTabForDeletedFile`, silent error swallowing, one platform assumption, a test that asserts only that the listener "runs without error").

## Warnings

### WR-01: editor-tab catch block proceeds after cleanup, racing unmount

**File:** `src/components/editor-tab.tsx:89-122`
**Issue:** The `git-status-changed` listener checks `cancelled` once before awaiting `readFile(filePath)` (line 92), but the catch block at line 105 has no `cancelled` re-check before calling `closeEditorTabForDeletedFile(filePath)`. If the component unmounts during the await (e.g. user closes the tab or navigates projects), the cleanup sets `cancelled = true` and nulls out `viewRef` / `setupRef`. When the await rejects, the catch block still invokes the closer on a tab that a different code path may be concurrently removing, mutating the signals during an unmount-in-progress.

Practical impact is low — `closeEditorTabForDeletedFile` is documented (correctly) as a silent no-op when the filePath matches zero tabs — but the code depends on that invariant holding through the entire race window. A future refactor that makes the function throw or log on missing tabs would silently surface this bug.

**Fix:**
```typescript
} catch (err) {
  if (cancelled) return;  // bail out: component is unmounting
  const msg = err instanceof Error ? err.message : String(err);
  if (/no such file|not found|notfound|os error 2/i.test(msg)) {
    closeEditorTabForDeletedFile(filePath);
  }
}
```

### WR-02: editor-tab test mocks an error shape that does not match production

**File:** `src/components/editor-tab.test.tsx:52-57` (and :91-96)
**Issue:** The test throws `new Error('No such file or directory (os error 2)')` from the mocked IPC. But the production path routes through `readFile()` in `src/services/file-service.ts:94-100`, which wraps any thrown error in `new FileError('ReadError', String(e))`. That means by the time the catch block in `editor-tab.tsx:105` runs in production, `err.message` is `"ReadError: No such file or directory (os error 2)"` — not `"No such file or directory (os error 2)"`.

The regex happens to match both strings because of the `no such file` substring, so the test passes. But the test:

1. Does not cover the scenario where a real Rust error message does *not* contain one of the regex alternatives but the `FileError` prefix or a `FileError` stringification does. Example: a future `FileError` subclass that adds `Deleted` to the code would not match the regex at all.
2. Will silently break if the `FileError` constructor changes format (e.g. drops the code prefix), because the test exercises a parallel code path that skips the wrapper entirely.

**Fix:** Throw the same error shape production produces. Either:
```typescript
// Option A: throw the FileError directly
import { FileError } from '../services/file-service';
mockIPC((cmd, _args) => {
  if (cmd === 'read_file_content') {
    throw new FileError('ReadError', 'No such file or directory (os error 2)');
  }
  return null;
});
```
Or keep the raw `Error` but update the regex comment to document that production wraps the message. Option A is strictly better because it exercises the actual production wrapping.

### WR-03: isFinderDragActive not cleared on consecutive `enter` events

**File:** `src/main.tsx:296-305`
**Issue:** The `enter` branch sets `isFinderDragActive = anyOutside`, then returns early when `!anyOutside` (intra-tree drag). But if a prior drag already set `isFinderDragActive = true` and a *new* drag begins without an intervening `leave` (Tauri does not guarantee `leave` before a new `enter` in all scenarios — it depends on window focus transitions), and that new drag resolves to `anyOutside === false`, the assignment on line 303 correctly writes `false`. That path is fine.

The actual race is different: if two consecutive `enter` events arrive where the first is `anyOutside = true` and the second is `anyOutside = false`, the second correctly clears the flag. But if the second is `anyOutside = true` too (e.g. path list changed), the flag remains correctly true. The issue is only if the application relies on the flag reflecting the *current-in-flight* drag — which, on inspection, it does, because `over` events between two `enter` events would use the most recent `enter`'s decision. Line 303 always assigns regardless of prior value, so this is actually safe.

However, there is a related concern: if a `drop` event fires without a prior `enter` (Tauri 2.10.x has filed several bugs about event ordering around macOS Spaces / Mission Control), `isFinderDragActive` will be `false` from the last-processed `leave`, and the `drop` will be silently dropped on line 309. The drag feedback the user saw (row highlight on `over`) will be followed by no action on release — confusing UX.

**Fix:** Treat `drop` as authoritative (it carries paths), independent of the cached flag:
```typescript
if (payload.type === 'drop') {
  // Drop always carries paths; re-evaluate inside-project on the spot
  // rather than trusting the stale enter-time cache.
  const projectName = activeProjectName.value;
  const project = projectName ? projects.value.find(p => p.name === projectName) : undefined;
  const projectPath = project?.path ?? '';
  const anyOutside = payload.paths.length > 0
    && payload.paths.some(p => !projectPath || !p.startsWith(projectPath));
  if (!anyOutside) {
    isFinderDragActive = false;
    return;
  }
  // …dispatch tree-finder-drop as before…
}
```
Keep the cache for `over` (which has no paths). This makes `drop` recover from a missed `enter`.

## Info

### IN-01: closeEditorTabForDeletedFile triggers two reactivity passes per call

**File:** `src/components/unified-tab-bar.tsx:497-520`
**Issue:** The helper calls `setEditorDirty(tab.id, false)` inside a loop (line 513), and each call invokes `setProjectEditorTabs([...tabs])` which emits a signal change. Then on line 518 it calls `setProjectEditorTabs(editorTabs.value.filter(...))` again with a reduced array. The intermediate `setEditorDirty` calls are observable as transient signal emissions — subscribers (e.g. persistence) see the tab list briefly in the "dirty=false with filePath still present" state before seeing it removed.

Since persistence is gated by `_suppressPersist` and the `persistEditorTabs` logic rescans from `editorTabs.value` on each fire, the worst case is an extra JSON write per deleted tab. Minor.

**Fix:** Fold the dirty reset into the filter-and-remove in one pass:
```typescript
export function closeEditorTabForDeletedFile(filePath: string): void {
  const matching = editorTabs.value.filter(t => t.filePath === filePath);
  if (matching.length === 0) return;

  const activeId = activeUnifiedTabId.value;
  if (matching.some(t => t.id === activeId)) {
    switchToAdjacentTab(activeId);
  }

  // Single set: drop matching tabs from the editorTabs array.
  // Clearing dirty state is implicit (removed tabs can't be dirty).
  const matchingIds = new Set(matching.map(t => t.id));
  setProjectEditorTabs(editorTabs.value.filter(t => !matchingIds.has(t.id)));
  setProjectTabOrder(tabOrder.value.filter(id => !matchingIds.has(id)));
}
```
The explicit `setEditorDirty` loop is dead once the tabs are removed.

### IN-02: app.emit failure silently swallowed

**File:** `src-tauri/src/git_ops.rs:568-570`
**Issue:** `let _ = app.emit("git-status-changed", ());` discards any emit failure. This is intentional (frontend has belt-and-braces emits in `handleRevertFile` / `handleRevertAll`) but a failed emit here means the file-tree will not refresh unless the frontend is the triggering call-site. If a future caller invokes `revert_file` directly (e.g. a CLI command or a keyboard-shortcut handler that doesn't also emit), silent failure would leave the tree stale.

**Fix:** At minimum log the failure. Emit failures in Tauri 2 are rare (channel has buffer backpressure only in extreme cases) but a warn-level log captures any future regression:
```rust
if matches!(outcome, RevertOutcome::Mutated) {
    if let Err(e) = app.emit("git-status-changed", ()) {
        eprintln!("[git_ops] revert_file: emit git-status-changed failed: {}", e);
    }
}
```

### IN-03: MACOS_TITLE_BAR_OFFSET hardcoded — inherited from Plan 18-07

**File:** `src/main.tsx:55`
**Issue:** Previous review (WR-03 of 18-REVIEW.md) already flagged this. Plan 18-12 did not change it — noting for completeness so it is not assumed fixed. Any future macOS version change to title bar height (none announced, but historically Apple has shifted by 2-4 px) requires a manual constant update. The comment acknowledges this; consider a runtime check against `window.outerHeight - window.innerHeight` to auto-detect.

**Fix:** Out of scope for round-2. Flagging for continuity with the prior review.

### IN-04: Plan 18-12 test "runs 3 dispatches without error" asserts only the tautology

**File:** `src/components/file-tree.test.tsx:1118-1124`
**Issue:** The third `dispatchOver(10, 10)` call is followed by `expect(true).toBe(true)` — a literal tautology. The comment admits jsdom's zero-rects don't distinguish positions, so the test only proves "the listener doesn't throw." That's weaker than the test description implies ("multiple tree-finder-dragover dispatches with changing positions update the highlighted row").

Since Plan 18-12's actual contract (per-row highlight updates as cursor moves across rows) cannot be verified with jsdom's flat geometry, this is an inherent test-environment limitation rather than a code bug. Consider either:
1. Mocking `getBoundingClientRect` with non-zero rects (pattern already established in `'finder drop hit-test geometry'` describe at line 706) so position-dependent row selection becomes observable.
2. Deleting the third dispatch and its tautology, leaving the first two dispatches as the "dispatch pipeline runs" smoke test.

Both options preserve the signal that Plan 18-12's main.tsx fix works; option 1 actually verifies the Plan 18-12 behavior contract ("highlight follows cursor").

**Fix:** Reuse the `getBCRSpy` pattern from the geometry-tests describe block and assert which row has `style.borderLeft` set after each dispatch.

---

_Reviewed: 2026-04-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
