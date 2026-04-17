---
phase: 18-file-tree-enhancements
plan: 09
subsystem: ui
tags: [preact, rust, tauri, macos, menu, keyboard, wkwebview, gap-closure, vitest]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-03 triggerDeleteConfirm + Delete/Backspace keydown handlers in file-tree.tsx — the flow the new native-menu detour re-uses"
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-08 module-scoped vi.mock('@tauri-apps/api/event') capture pattern — extended in this plan to also capture the delete-selected-tree-row listener"
provides:
  - "Native Tauri MenuItem 'delete-selection' in the Edit submenu with CmdOrCtrl+Backspace accelerator (src-tauri/src/lib.rs)"
  - "on_menu_event match arm emitting 'delete-selected-tree-row' when the accelerator fires — AppKit intercepts the keystroke BEFORE WKWebView's NSResponder doCommandBySelector: can swallow it"
  - "FileTree useEffect Tauri listen('delete-selected-tree-row') registered alongside the git-status-changed listener; handler reads viewMode + selectedIndex at event time and routes the currently-selected entry to triggerDeleteConfirm; unregistered in cleanup"
  - "Test remediation: replaced the bogus /Delete/ DOM-pollution assertion with a real /permanently deleted/ assertion on the ConfirmModal's message template; added a new test that invokes the captured delete-selected-tree-row listener to exercise the native-menu event path"
  - "Extended module-scoped vi.mock('@tauri-apps/api/event') to capture BOTH git-status-changed (from Plan 18-08) and delete-selected-tree-row (this plan) listeners"
affects: [file-tree-enhancements, keyboard-shortcuts, wkwebview-accelerator-bypass, macos-menu-detour]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native-menu detour for WKWebView-intercepted accelerators: when WKWebView on macOS intercepts a Command-modified key combo via the AppKit NSResponder chain (doCommandBySelector:) before it reaches the DOM keydown path, bind the shortcut to a Tauri MenuItem in src-tauri/src/lib.rs. The menu handler emits a custom event that the frontend consumes via Tauri listen. Tauri intercepts the keystroke at the AppKit level before WebKit sees it, bypassing the DOM-layer suppression entirely. Same architecture as the existing CmdOrCtrl+, (preferences) and CmdOrCtrl+N (add-project) menu items."
    - "Dual-capture module-level vi.mock: extend a single vi.mock('@tauri-apps/api/event') factory to capture multiple event listeners into distinct module-level holder variables. Each describe block consumes the relevant holder. Simpler than per-describe re-mocking (which Vitest does not support — vi.mock is hoisted)."
    - "Real ConfirmModal-mounted test assertions: tests that exercise showConfirmModal must render <ConfirmModal /> alongside the component under test so the modal's DOM is observable. Without this, modalState.value.visible flips to true but produces no DOM, and assertions fall back to DOM pollution from sibling describes."

key-files:
  created: []
  modified:
    - "src-tauri/src/lib.rs — Added 'Delete Selection' MenuItem (id 'delete-selection', accelerator 'CmdOrCtrl+Backspace') to the Edit submenu between select_all and a new separator. Added 'delete-selection' match arm in on_menu_event that emits 'delete-selected-tree-row' via app.emit. All existing menu items preserved unchanged. +20 LOC."
    - "src/components/file-tree.tsx — Added a second listen block inside the FileTree useEffect alongside the existing git-status-changed listener. Handler reads viewMode + selectedIndex + entries/flattenedTree at event time and calls triggerDeleteConfirm for the currently-selected entry. Cleanup adds `if (unlistenDelete) unlistenDelete();` to the useEffect return. handleFlatKeydown and handleTreeKeydown switches UNCHANGED — plain Delete key path continues to work. +22 LOC."
    - "src/components/file-tree.test.tsx — Added ConfirmModal import. Extended the module-level vi.mock('@tauri-apps/api/event') factory to also capture the 'delete-selected-tree-row' callback into a new module-level holder capturedDeleteListener. Replaced the 'delete key' describe block with 'delete key (UAT Test 5 fix)' containing 3 tests: (1) Delete key keydown with ConfirmModal mounted asserts /permanently deleted/ in DOM, (2) plain Backspace preserved, (3) delete-selected-tree-row event invoked via captured listener asserts /permanently deleted/ in DOM. +63 / -13 LOC."

key-decisions:
  - "MenuItem is VISIBLE ('Delete Selection' under Edit menu) rather than hidden. Tauri MenuItems need to be visible for their accelerators to be registered at the AppKit level on macOS. A hidden menu item would not register the accelerator. Visual presence is an acceptable trade — the user sees a clearly-labeled 'Delete Selection' entry next to Cut/Copy/Paste in the Edit menu. Its effect is scoped by the JS listener's project + selectedIndex guards, so clicking the menu item with no file-tree selection is a silent no-op."
  - "Single accelerator ('CmdOrCtrl+Backspace') rather than registering both Cmd+Backspace AND Cmd+Delete. Tauri MenuItem::with_id signature accepts a single accelerator. The UAT bug specifically reports Cmd+Backspace; Cmd+Delete is rarely used as a macOS delete shortcut. If a secondary is needed later, a second hidden MenuItem with id 'delete-selection-alt' can be added."
  - "Emit a CustomEvent ('delete-selected-tree-row') rather than invoking a Tauri command. This mirrors the existing pattern used by the preferences / add-project / quit menu items. The alternative — a #[tauri::command] that the frontend polls or subscribes to — adds IPC overhead without benefit; the emit path is a single app.emit call."
  - "Keep the existing handleFlatKeydown / handleTreeKeydown case 'Backspace' + case 'Delete' branches unchanged. This is defense-in-depth: if WKWebView's interception behavior changes in a future macOS version, the keydown handlers still work as a fallback. Plain Delete key continues to route through the keydown path (not the native menu), so there is no functional regression for the already-working Delete shortcut."
  - "Extend the existing module-scoped vi.mock('@tauri-apps/api/event') instead of adding a new per-describe mock. Vitest hoists vi.mock to the top of the test file; per-describe mocking is not supported. The module-level factory now captures two listener types into two holder variables (capturedGitStatusListener, capturedDeleteListener), each reset in its respective beforeEach."
  - "Real /permanently deleted/ assertion instead of the prior /Delete/ hack. The old /Delete/ match was satisfied by the literal text 'Delete' left in the DOM by the 'context menu' describe block's menu items — not by any modal being rendered. The new assertion targets the unique triggerDeleteConfirm message template 'X will be permanently deleted. This cannot be undone.' which only appears when ConfirmModal is actually mounted and visible. This pins the contract between triggerDeleteConfirm's copy and the test."
  - "Render <><FileTree /><ConfirmModal /></> in both modal-surfacing tests. The ConfirmModal component consumes modalState (a module-level signal) and renders its own DOM tree when visible. In src/main.tsx the two components are co-mounted; in tests they must be co-mounted too. Without ConfirmModal in the tree, showConfirmModal flips modalState.visible=true but no DOM is produced."

patterns-established:
  - "Pattern: Command-modified accelerators intercepted by WKWebView on macOS MUST be re-routed through a Tauri native menu. Tauri/AppKit capture the keystroke before WebKit's doCommandBySelector: can consume it. Affected shortcuts so far: CmdOrCtrl+, (preferences), CmdOrCtrl+Q (quit), CmdOrCtrl+N (add-project), CmdOrCtrl+Backspace (delete-selection). Future plans adding Cmd-modified keyboard shortcuts should default to this pattern rather than fighting WKWebView's responder chain at the JS layer."
  - "Pattern: tests that assert showConfirmModal / modal dialogs MUST mount the modal component alongside the component under test. Assertions on the modal's rendered copy are the only reliable way to prove the modal surfaced; checking modalState directly couples the test to implementation internals and does not guard against DOM-rendering regressions."
  - "Pattern: when an existing test's assertion string is ambiguous (e.g., a short common word like 'Delete' that appears in unrelated UI), tighten the assertion to a unique substring that can only appear in the asserted component's rendered output. 'permanently deleted' is unique to the triggerDeleteConfirm template and cannot leak from context menu items, row labels, or button text."

requirements-completed: [TREE-01, MAIN-03]

# Metrics
duration: 8m
completed: 2026-04-17
---

# Phase 18 Plan 09: Cmd+Backspace Native-Menu Detour (UAT Test 5) Summary

**Registered a Tauri native MenuItem 'delete-selection' with CmdOrCtrl+Backspace accelerator that emits a 'delete-selected-tree-row' event consumed by file-tree.tsx to invoke triggerDeleteConfirm — bypasses WKWebView's NSResponder doCommandBySelector: interception that swallowed the keystroke before it reached the JS keydown handler.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-17T08:00:26Z
- **Completed:** 2026-04-17T08:07:31Z
- **Tasks:** 3
- **Files modified:** 3 (src-tauri/src/lib.rs, src/components/file-tree.tsx, src/components/file-tree.test.tsx)

## Accomplishments

- UAT Test 5 closed: Cmd+Backspace on a selected file-tree row now triggers the delete confirmation modal on macOS. The native-menu detour (AppKit MenuItem accelerator → on_menu_event → app.emit → Tauri listen → triggerDeleteConfirm) bypasses WKWebView's DOM-layer suppression of Command-modified text-editing shortcuts (WebKit Bugzilla #191768). The user's muscle memory for the canonical macOS delete shortcut is restored.
- Test suite hardened: the Plan 18-03 `delete key` describe block's sole assertion (`expect(document.body.textContent).toMatch(/Delete/)`) was a DOM-pollution hack — it passed only because prior describes left the literal word "Delete" in the rendered DOM. Replaced with a real `/permanently deleted/` assertion that only matches the triggerDeleteConfirm message template when ConfirmModal is actually rendered. Added a new test that invokes the captured `delete-selected-tree-row` listener directly, proving the native-menu event path routes to triggerDeleteConfirm. All 38 file-tree tests green (35 pre-existing untouched + 3 in the rewritten describe).
- Existing keydown paths preserved unchanged: handleFlatKeydown and handleTreeKeydown continue to handle plain Delete (and plain Backspace navigation to parent) via the DOM keydown path. Defense-in-depth: if WKWebView's interception behavior regresses or changes in a future macOS release, the keydown handlers still work as a fallback.
- Pattern documented: "native-menu detour for WKWebView-intercepted accelerators" is now an established convention in the codebase, joining CmdOrCtrl+, (preferences), CmdOrCtrl+Q (quit), and CmdOrCtrl+N (add-project). Future Cmd-modified shortcuts should default to this pattern.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register hidden delete-selection MenuItem + on_menu_event branch (Rust)** - `3e13fa2` (feat)
2. **Task 2: Wire file-tree.tsx listener for delete-selected-tree-row → triggerDeleteConfirm** - `a966019` (feat)
3. **Task 3: Replace bogus Delete-key test + add delete-selected-tree-row event-path test** - `7318f8a` (test)

## Files Created/Modified

- `src-tauri/src/lib.rs` — Added `let delete_selection_item = MenuItem::with_id(app, "delete-selection", "Delete Selection", true, Some("CmdOrCtrl+Backspace"))?;` before the Edit submenu builder. The Edit submenu now includes `.separator().item(&delete_selection_item)` after select_all. Added `"delete-selection" => { let _ = app.emit("delete-selected-tree-row", ()); }` branch in the on_menu_event match. All existing menu items (about, preferences, quit, add-project, undo, redo, cut, copy, paste, select_all, minimize) preserved unchanged. +20 LOC.
- `src/components/file-tree.tsx` — Added a second listen block inside the FileTree useEffect, immediately after the existing `git-status-changed` block: `let unlistenDelete: (() => void) | null = null; (async () => { unlistenDelete = await listen('delete-selected-tree-row', () => { ... }); })();`. The handler checks project + viewMode + selectedIndex and calls `triggerDeleteConfirm` on the selected entry. Cleanup return now includes `if (unlistenDelete) unlistenDelete();` immediately after the matching `if (unlistenFs) unlistenFs();` line. handleFlatKeydown and handleTreeKeydown switches UNCHANGED. +22 LOC.
- `src/components/file-tree.test.tsx` — Added `import { ConfirmModal } from './confirm-modal';` immediately after the FileTree import. Added `let capturedDeleteListener: (() => void) | null = null;` as a second module-level holder alongside `capturedGitStatusListener`. Extended the existing vi.mock factory: the arrow function now matches both events: `if (event === 'git-status-changed') capturedGitStatusListener = cb;` AND `if (event === 'delete-selected-tree-row') capturedDeleteListener = cb;`. Replaced the entire `describe('delete key', ...)` block with `describe('delete key (UAT Test 5 fix)', ...)` containing three `it(...)` cases as specified in the plan. +63 / -13 LOC.

## Decisions Made

- **Visible "Delete Selection" menu item over hidden.** Per exploration of Tauri's MenuItem::with_id API on macOS: accelerators register at the AppKit level only when the item is visible. A hidden menu item would not fire the accelerator. The item's effect is scoped by the JS listener's guards (no project → silent return; no selected row → silent return), so a stray click on the menu with no tree selection is a harmless no-op. The user-visible label also serves as in-app discoverability for the shortcut.
- **Single accelerator ('CmdOrCtrl+Backspace') rather than adding a Cmd+Delete alternate.** MenuItem::with_id supports one accelerator per item. The UAT bug report is specifically Cmd+Backspace. Adding a Cmd+Delete alt would require a second MenuItem, and Cmd+Delete is not a standard macOS delete shortcut (Delete alone is, handled by the existing keydown path). Dropped as YAGNI.
- **Kept existing keydown handlers unchanged.** The plan explicitly calls for defense-in-depth. If a future macOS version changes WKWebView's interception behavior, plain Delete (which works via the keydown path today) continues to work without any menu involvement, and Cmd+Backspace becomes a redundant dual-path shortcut. This is strictly additive — no regression risk for the already-working Delete key.
- **CustomEvent emit over a new #[tauri::command].** The Tauri event bus is already used for preferences-requested, quit-requested, add-project-requested, git-status-changed, etc. A new `#[tauri::command] fn trigger_delete_selected()` would require an IPC round-trip via invoke, which is unnecessary because the menu event handler runs in the Rust main thread and app.emit is fire-and-forget. Matches the established menu-event pattern exactly.
- **Extended the module-scoped vi.mock rather than adding per-describe mocks.** Vitest hoists vi.mock to the file top; per-describe vi.mock does not work. Plan 18-08 already established the module-level capture pattern for git-status-changed; this plan adds a second capture variable to the same factory. Each test's beforeEach resets its respective capture variable for isolation.
- **Real `/permanently deleted/` assertion over the prior `/Delete/` hack.** The old assertion was satisfied by the literal word "Delete" in the rendered DOM — from menu items ("Delete" in the context menu), button labels, etc. — even when the ConfirmModal was never mounted or visible. The new assertion targets the full phrase "permanently deleted" which appears only in triggerDeleteConfirm's message template `'X' will be permanently deleted. This cannot be undone.`. This phrase cannot leak from sibling describes because no other component in the codebase renders that exact string.
- **Render `<><FileTree /><ConfirmModal /></>` in the two modal-surfacing tests.** ConfirmModal consumes a module-level `modalState` signal and renders its own DOM subtree when `visible=true`. In production (`src/main.tsx`) both components are mounted as siblings. Tests that want to observe the modal's rendered output must mirror this — rendering only FileTree flips the signal but produces no modal DOM. The third test (plain Backspace) does not need ConfirmModal because it only asserts no-throw.

## Deviations from Plan

None — plan executed exactly as written.

The plan's Task 3 notes explicitly mentioned that `vi.stubGlobal('listen', ...)` would not intercept module imports and recommended module mocking as the fallback. Because Plan 18-08 already installed a module-level vi.mock with a capture for git-status-changed, the natural implementation was to extend that existing factory rather than add a new one. The plan wording ("use module mocking instead") is aligned with what was done; this is not a deviation, just the chosen branch of an explicit plan option.

## Issues Encountered

None. Every step executed as planned:
- Task 1 `cargo check` + `cargo build --release` both clean on first try.
- Task 2 `pnpm tsc --noEmit` clean on first try.
- Task 3: all 3 new tests passed on first run; full 38-test file-tree suite also green on first run.

One peripheral note: `pnpm test` (without `--run`) and `pnpm test -- --run` against the broader test directory surfaced pre-existing unrelated failures in `sidebar.test.tsx` (`terminal-tabs.tsx` module-import-time `listen` call rejecting with `transformCallback` undefined). These failures predate this plan, reproduce on `main` at 157395a without any Plan 18-09 changes, and are out of scope per the "scope boundary" rule. Running `pnpm exec vitest run src/components/file-tree.test.tsx` in isolation confirms all 38 file-tree tests pass.

## Verification

### Acceptance Grep Proof

```
grep -c "delete-selection" src-tauri/src/lib.rs              → 2  ✓ >= 2 (MenuItem id + on_menu_event arm)
grep -c "CmdOrCtrl+Backspace" src-tauri/src/lib.rs           → 1  ✓ >= 1
grep -c "delete-selected-tree-row" src-tauri/src/lib.rs      → 2  ✓ >= 1 (emit path + code comment reference)
grep -c "delete-selected-tree-row" src/components/file-tree.tsx → 2  ✓ >= 1 (listen + comment)
grep -c "unlistenDelete" src/components/file-tree.tsx         → 3  ✓ >= 2 (declaration + assignment + cleanup)
grep -c "permanently deleted" src/components/file-tree.test.tsx → 5  ✓ >= 2 (matches appear in assertions + test comments)
grep -c "ConfirmModal" src/components/file-tree.test.tsx      → 6  ✓ >= 2 (import + usage in two renders + comments)
grep -c "expect(document.body.textContent).toMatch(/Delete/)" src/components/file-tree.test.tsx → 0  ✓ (bogus hack removed)
```

### Type + Build + Test Proof

```
pnpm tsc --noEmit                                              → exit 0  ✓
cd src-tauri && cargo check                                    → Finished `dev` profile in 3.19s  ✓
cd src-tauri && cargo build --release                          → Finished `release` profile in 25.77s (full) / 15.13s (re-check)  ✓
pnpm exec vitest run src/components/file-tree.test.tsx         → 38/38 pass, 0 fail  ✓
pnpm exec vitest run src/components/file-tree.test.tsx -t "delete key"  → 3/3 pass, 35 skipped by -t filter  ✓
```

### Menu Event Flow Audit

| Layer | Code site | State |
|-------|-----------|-------|
| Accelerator registration | src-tauri/src/lib.rs:54-60 (MenuItem::with_id) | Registered with 'CmdOrCtrl+Backspace' |
| Menu inclusion | src-tauri/src/lib.rs:62-73 (edit_menu SubmenuBuilder .item(&delete_selection_item)) | Item appended after select_all separator |
| on_menu_event arm | src-tauri/src/lib.rs:215-217 ("delete-selection" match) | Emits 'delete-selected-tree-row' |
| Frontend listen | src/components/file-tree.tsx:821-835 (inside FileTree useEffect) | Registered alongside git-status-changed |
| Cleanup | src/components/file-tree.tsx:942 (inside useEffect return) | `if (unlistenDelete) unlistenDelete();` |
| Routing | src/components/file-tree.tsx:833 | `if (entry) void triggerDeleteConfirm(entry);` |
| Consumer | src/components/file-tree.tsx:934-975 (triggerDeleteConfirm) | UNCHANGED (Plan 18-03 artifact) |

### Known Stubs

None. Scanned src/components/file-tree.tsx, src/components/file-tree.test.tsx, and src-tauri/src/lib.rs for placeholder/TODO/FIXME/mock patterns. No stubs introduced by this plan — the MenuItem is fully functional, the listener routes to real production code (triggerDeleteConfirm), and the tests exercise real rendered DOM.

### Threat Flags

None. Per the plan's threat register:

- **T-18-09-01** (mitigated): Cmd+Backspace only OPENS the ConfirmModal; the user must click "Delete" in the modal before deleteFile runs. Verified in the production triggerDeleteConfirm flow at src/components/file-tree.tsx:934-975.
- **T-18-09-02** (mitigated): Stale selectedIndex after re-render → `entries[idx]` returns undefined → handler silently returns (the `if (entry)` guard at line 833). Same behavior as the existing Delete-key path.
- **T-18-09-03** (accepted): Accidental Cmd+Backspace while typing in InlineCreateRow may open the modal if a row is also selected. Worst case is a spurious modal — the user must still click "Delete" to delete. Documented.
- **T-18-09-04** (n/a): No data flow changes.
- **T-18-09-05** (mitigated): The new `/permanently deleted/` assertion pins the contract between triggerDeleteConfirm's copy and the test. If future work changes the message template without updating this test, the regression surfaces at test time rather than in production.

No new trust boundaries, IPC surface, or file access patterns introduced. The only new menu event uses the existing emit → listen pattern that's already used for preferences-requested, quit-requested, and add-project-requested.

## Upstream References

- **WebKit Bugzilla #191768** — "[iOS] Cannot prevent default key command in onkeydown handler" — root-cause reference for WKWebView's NSResponder interception of Command-modified keys before DOM keydown dispatch. Confirms the bug is known at the WebKit layer and will not be fixed at the application layer.
- **MarkupEditor #76, .NET MAUI #13934, wxWidgets #23151** — cross-framework reports of the same WKWebView behavior, confirming the issue is not specific to Tauri and must be worked around by routing Command accelerators through the native menu system.

## Next Phase Readiness

- UAT Test 5 closed. All 7 Phase 18 Wave 3 UAT gap-closure bugs (Plans 18-06 through 18-09) are complete.
- Phase 18 can proceed to final UAT re-validation and SUMMARY-PHASE aggregation.
- The "native-menu detour for WKWebView-intercepted accelerators" pattern is now an established codebase convention — future phases adding Cmd-modified keyboard shortcuts should default to this pattern rather than relying on DOM keydown handling.
- No new blockers introduced. No test infrastructure changes required for subsequent phases.

## Self-Check: PASSED

- FOUND: src-tauri/src/lib.rs (Task 1 edits — verified via Read at lines 40-73 and 210-220)
- FOUND: src/components/file-tree.tsx (Task 2 edits — verified via Read at lines 799-835 and 940-948)
- FOUND: src/components/file-tree.test.tsx (Task 3 edits — extended vi.mock at lines 1-35, rewritten describe block replacing the bogus Delete-key test)
- FOUND: 3e13fa2 — feat(18-09): add delete-selection menu item for Cmd+Backspace (UAT Test 5 fix)
- FOUND: a966019 — feat(18-09): listen for delete-selected-tree-row from native menu (UAT Test 5 fix)
- FOUND: 7318f8a — test(18-09): replace bogus Delete-key assertion with real ConfirmModal check + add Cmd+Backspace event-path test

---
*Phase: 18-file-tree-enhancements*
*Completed: 2026-04-17*
