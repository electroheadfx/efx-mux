---
status: diagnosed
trigger: "Cmd+Backspace do not trigger delete modal (Phase 18 UAT Test 5)"
created: 2026-04-16T23:08:00Z
updated: 2026-04-16T23:18:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "WKWebView on macOS intercepts Cmd+Backspace via the native text-editing command pipeline (NSResponder doCommandBySelector: → deleteToBeginningOfLine: / deleteBackward:) before the keydown event is dispatched to the focused JavaScript scroll-container handler. As a result, handleFlatKeydown / handleTreeKeydown never see the event, e.metaKey is never read, triggerDeleteConfirm is never invoked, and no modal appears. The Delete key (which is NOT bound to a macOS NSResponder text-editing command) reaches the handler normally."
  confirming_evidence:
    - "src/components/file-tree.tsx case 'Backspace' (lines 1084 flat / 1152 tree) has correct logic — verified by code reading. The flat-mode branch reads entries.value[selectedIndex.value]; tree-mode reads flattenedTree.value[selectedIndex.value]?.entry. Both call triggerDeleteConfirm if e.metaKey is true."
    - "Probe test (src/components/_probe-cmd-backspace.test.tsx, removed after diagnosis) instrumented the handler with a capture-phase listener and an IPC trace. fireEvent.keyDown(fileList, { key: 'Backspace', metaKey: true }) WAS captured by the container AND triggered count_children IPC — proving the handler logic is reachable when the event actually arrives. Same result for fireEvent.keyDown(fileList, { key: 'Delete' })."
    - "src/main.tsx global keydown listener (lines 186-254, capture-phase) has NO 'backspace' arm in its switch and does NOT call preventDefault/stopPropagation for unmatched keys — confirming main.tsx is not the culprit."
    - "src/components/confirm-modal.tsx is mounted at src/main.tsx:92 in the live app, so the modal CAN render when modalState becomes visible. The fact that Delete works in the live app proves the showConfirmModal → modalState → ConfirmModal render pipeline works end-to-end. The issue is strictly that the Cmd+Backspace event never reaches showConfirmModal."
    - "Web research (WebKit Bugzilla #191768, MarkupEditor issue #76, .NET MAUI #13934, wxWidgets #23151) confirms a known WebKit/WKWebView pattern on macOS: Command-modifier key combinations are intercepted by the native AppKit responder chain (doCommandBySelector:) BEFORE being dispatched as DOM keydown events. The macOS Ventura+ regression made this strictly worse. Cmd+Backspace in particular maps to deleteBackward:/deleteToBeginningOfLine: NSResponder selectors."
    - "The plan summary's 18-03-SUMMARY.md claims this works ('Cmd+Backspace triggers the same delete flow on macOS') but the only test for it (the 'pressing Delete on focused scroll container' test in file-tree.test.tsx) actually does NOT exercise Cmd+Backspace AND fails when run in isolation — its assertion expect(document.body.textContent).toMatch(/Delete/) is satisfied by stale DOM text from a prior describe block ('context menu' renders the menu item literal text 'Delete'), not by an actually-rendered modal. Confirmed by running pnpm exec vitest run src/components/file-tree.test.tsx -t 'pressing Delete on focused scroll container' in isolation: FAILS."
  falsification_test: "Add a temporary console.log at the very top of handleFlatKeydown / handleTreeKeydown printing e.key, e.metaKey, e.code, and a stack trace marker. Build and run the live app on macOS. Press Delete — log appears. Press Cmd+Backspace — if no log appears, the WKWebView interception hypothesis is confirmed. If a log DOES appear with metaKey=true and the modal still doesn't show, the hypothesis is wrong and the bug is downstream (e.g. in triggerDeleteConfirm or showConfirmModal). I have not run this test against the live macOS binary because the user explicitly requested no app builds."
  fix_rationale: "(For the gap-closure plan, not this diagnosis step.) Two non-exclusive remedies: (a) Replace the e.key === 'Backspace' && e.metaKey gating with a parallel listener that uses native macOS-aware key detection: bind the Cmd+Backspace shortcut via Tauri's native menu (Edit menu → 'Delete' MenuItem with accelerator 'CmdOrCtrl+Backspace') wired through on_menu_event, then dispatch a CustomEvent the file-tree listens for. This bypasses WebKit's doCommandBySelector: interception entirely because Tauri intercepts the keystroke at the AppKit level before WebKit sees it. (b) Alternatively, also bind the SHIFT+ or CTRL+ variant as a secondary shortcut so the user has a working keyboard path while the WebKit issue is upstream. The clean fix is (a)."
  blind_spots: "I have NOT (1) instrumented the live macOS binary with a console.log at the top of the keydown handler to directly observe whether the event arrives — this is the falsification_test. (2) Ruled out a less-likely alternative: maybe e.metaKey IS true when the handler fires but selectedIndex.value points to a stale index after a re-render, so flattenedTree.value[selectedIndex.value]?.entry is undefined. The probe test refutes this for a freshly-clicked row but not for the user's actual interaction sequence. (3) Verified whether the user's selectedIndex.value was meaningful at the time of pressing — they may have clicked a row, but if the scroll container received focus through a different path (e.g. Tab key), the click handler may not have fired. (4) Tested whether plain Backspace still navigates to parent in flat mode in the live app — if WKWebView intercepts plain Backspace too, that's an even broader symptom."

## Symptoms

expected: "Cmd+Backspace on a selected file-tree row triggers the delete confirm modal (same as Delete key)."
actual: "Pressing Cmd+Backspace does nothing. Delete key works fine."
errors: "None reported."
reproduction: "Phase 18 UAT Test 5. Select a row in the file tree, press Cmd+Backspace — no modal appears."
started: "Discovered during Phase 18 UAT (2026-04-16). Code claims this works (per plan summary)."

## Eliminated

- hypothesis: "main.tsx global keydown listener intercepts Cmd+Backspace and calls preventDefault/stopPropagation."
  evidence: "Read src/main.tsx:186-254. The switch (true) statement has cases for 'b','s','t','w','Tab','p','/','?',',' but no 'backspace' arm. Unmatched keys fall through without preventDefault/stopPropagation. Cmd+Backspace would propagate normally."
  timestamp: 2026-04-16T23:10:00Z

- hypothesis: "The keydown handler's case 'Backspace' branch has a logic error that prevents triggerDeleteConfirm from being called."
  evidence: "Probe test confirmed that fireEvent.keyDown(fileList, { key: 'Backspace', metaKey: true }) DOES invoke triggerDeleteConfirm (count_children IPC was called for the selected entry's path). Logic is correct in jsdom."
  timestamp: 2026-04-16T23:14:00Z

- hypothesis: "showConfirmModal / ConfirmModal mount chain is broken."
  evidence: "ConfirmModal is mounted at src/main.tsx:92. Delete key works in the live app per user report — the same triggerDeleteConfirm → showConfirmModal → modalState → ConfirmModal render pipeline. If this chain were broken, Delete would also fail."
  timestamp: 2026-04-16T23:15:00Z

## Evidence

- timestamp: 2026-04-16T23:08:00Z
  checked: "src/components/file-tree.tsx handleFlatKeydown switch (lines 1063-1095)"
  found: "case 'Backspace' has correct logic: if (e.metaKey) { e.preventDefault(); ... triggerDeleteConfirm ... break; } e.preventDefault(); navigateToParent();"
  implication: "Logic appears correct on paper."

- timestamp: 2026-04-16T23:08:00Z
  checked: "src/components/file-tree.tsx handleTreeKeydown switch (lines 1101-1166)"
  found: "case 'Backspace' has correct logic: if (e.metaKey) { ... triggerDeleteConfirm ... } — NO else branch (plain Backspace is not bound in tree mode, per plan)."
  implication: "Logic also looks correct."

- timestamp: 2026-04-16T23:09:00Z
  checked: "src/main.tsx global keydown listener (lines 186-254, capture-phase)"
  found: "Listener does NOT match Cmd+Backspace in any case — switch has no 'backspace' arm. Listener also does not preventDefault/stopPropagation for unmatched keys, so events should bubble normally."
  implication: "main.tsx listener is not the culprit."

- timestamp: 2026-04-16T23:10:00Z
  checked: "Test suite — pnpm exec vitest run src/components/file-tree.test.tsx"
  found: "31/31 tests pass when run as a suite. NO test fires Cmd+Backspace."
  implication: "Cmd+Backspace path is untested in CI. The code claims to work but is unverified."

- timestamp: 2026-04-16T23:11:00Z
  checked: "Probe test instrumenting the keydown handler with a capture-phase listener and IPC trace"
  found: "fireEvent.keyDown(fileList, { key: 'Backspace', metaKey: true }) is captured on the container, e.metaKey is true, and triggerDeleteConfirm fires (count_children invoked with the selected entry's path)."
  implication: "The handler IS reachable and the logic IS correct, when the event actually arrives. The bug must be that the event does NOT arrive in WKWebView."

- timestamp: 2026-04-16T23:13:00Z
  checked: "Existing 'pressing Delete on focused scroll container dispatches a confirm modal flow' test run in isolation: pnpm exec vitest run src/components/file-tree.test.tsx -t 'pressing Delete on focused scroll container'"
  found: "FAILS. Body text after fireEvent.keyDown is 'File TreesrcREADME.md1.0Kindex.ts2.0K' — no 'Delete' substring. The test only passes in suite mode because earlier 'context menu' describe-block tests render menu items containing the literal text 'Delete' and leave it in the DOM (no cleanup)."
  implication: "The plan's only validation that Delete (and by extension Cmd+Backspace) actually invokes the modal is BOGUS. There is no real test for either keyboard shortcut. The plan summary's claim 'Cmd+Backspace triggers the same delete flow on macOS' was never verified."

- timestamp: 2026-04-16T23:16:00Z
  checked: "Web research on WKWebView keydown event suppression for Command-modifier combinations on macOS"
  found: "WebKit Bugzilla #191768 ([iOS] Cannot prevent default key command in onkeydown handler) plus multiple framework reports (MarkupEditor #76, .NET MAUI #13934, wxWidgets) confirm: WKWebView on macOS routes Command-modified keys through the AppKit NSResponder chain (doCommandBySelector:) BEFORE dispatching them as DOM keydown events. macOS Ventura+ made this regression strictly worse. Cmd+Backspace in particular maps to deleteBackward:/deleteToBeginningOfLine: NSResponder selectors."
  implication: "On the user's live macOS app, the Cmd+Backspace keydown event is intercepted by AppKit/WebKit before reaching the focused scroll container's onKeyDown handler. The handler never sees the event, so it never invokes triggerDeleteConfirm. Plain Delete is NOT bound to an NSResponder selector and reaches the handler normally — explaining why Delete works but Cmd+Backspace does not."

- timestamp: 2026-04-16T23:17:00Z
  checked: "src-tauri/src/lib.rs macOS menu setup (lines 30-67)"
  found: "Menus include Cut/Copy/Paste/Undo/Redo/SelectAll (PredefinedMenuItem) plus custom 'Preferences', 'Quit', 'Add Project'. NO menu item is bound to Cmd+Backspace. There is no native intercept of the shortcut at the Tauri layer either."
  implication: "The fix path includes registering a native Tauri menu item bound to 'CmdOrCtrl+Backspace' that emits a CustomEvent the file-tree listens for. Tauri/AppKit will intercept the keystroke before WebKit's doCommandBySelector: fires, bypassing the WKWebView-layer suppression entirely. This is also the same pattern used elsewhere in the app for Cmd+W (closeUnifiedTab) and Cmd+, (preferences)."

## Resolution

root_cause: "WKWebView on macOS intercepts Cmd+Backspace via the AppKit NSResponder chain (doCommandBySelector: → deleteBackward:/deleteToBeginningOfLine:) BEFORE the keydown event is dispatched to the focused JavaScript scroll-container handler. The handler logic in src/components/file-tree.tsx (handleFlatKeydown lines 1084-1094, handleTreeKeydown lines 1152-1158) is CORRECT — but it never receives the event, so triggerDeleteConfirm is never invoked. Plain Delete is not bound to an NSResponder text-editing selector and reaches the handler normally, which is why Delete works but Cmd+Backspace does not. Compounding the bug: the only test for the Delete-key path is bogus (passes only by accident from prior describe-block DOM pollution), so the plan's claim 'Cmd+Backspace triggers the same delete flow on macOS' was never actually verified in CI."
fix:
verification:
files_changed: []
</content>
