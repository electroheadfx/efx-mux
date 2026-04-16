---
status: diagnosed
trigger: "when I drag on a folder or root it choose a non-choosed folder instead to copy the file"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "On macOS with `titleBarStyle: \"Overlay\"`, Tauri 2.10's `onDragDropEvent.payload.position` is reported in a coordinate system whose y-origin is offset by ~28 px (the height of the macOS overlay title bar) from the webview viewport origin used by `getBoundingClientRect()`. After the existing DPR division, the y value handed to `handleFinderDrop` does not align with the row rectangles, so the hit-test loop matches a row above (or below) the row actually under the cursor, copying the file into an unintended folder."
  confirming_evidence:
    - "tauri.conf.json:21 sets `titleBarStyle: \"Overlay\"` and decorations: true — the documented config that triggers this offset bug."
    - "@tauri-apps/api 2.10.1 dpi.d.ts confirms `onDragDropEvent.position` is `PhysicalPosition` (physical pixels, DPI-independent). main.tsx correctly divides by `window.devicePixelRatio`, so DPR is NOT the issue — the residual error after DPR is a constant ~28px y offset."
    - "Tauri GitHub Issue #10744 explicitly documents this exact bug on macOS: 'off by about 28 pixels' on the y axis, observed when comparing `onDragDropEvent.position` to `getBoundingClientRect()`. The 28px corresponds to the macOS title bar height."
    - "The frontend has no compensating offset anywhere: grep for `titleBarStyle|TITLE_BAR_HEIGHT` in src/ returns only the css class name. main.tsx:282-286 and file-tree.tsx:751-790 use `position.y` raw against `rect.top/bottom` from `getBoundingClientRect()`."
    - "Plan 18-05-SUMMARY.md explicitly notes (key-decisions and Deviations §1) that the jsdom tests had to be adjusted to use `y: 0` because jsdom returns zero-rects — confirming the production hit-test geometry was NEVER validated against realistic non-zero rects in the test suite. The bug is a pure geometry mismatch that a jsdom test cannot expose."
  falsification_test: "On a running build, instrument main.tsx to log `payload.position.y / dpr` and compare to `MouseEvent.clientY` from a synthetic mouse event at the same screen location (or the cursor position when the OS drop fires). If the difference is ≈ 28px on macOS with Overlay, the hypothesis is confirmed. If the difference is 0 or a different constant, the hypothesis is wrong and the offset comes from elsewhere (e.g. some other padding ancestor)."
  fix_rationale: "The root cause is a Tauri-known coordinate-system mismatch. The fix is to subtract the macOS title bar height (currently 28px on Sonoma+ with Overlay) from `payload.position.y` in main.tsx BEFORE the CustomEvent dispatch — keeping the file-tree handler unchanged and DPR division in place. A robust implementation queries the actual offset at runtime instead of hardcoding 28: e.g. compare `getCurrentWindow().innerSize() / dpr` to `window.innerHeight` (difference = title bar height in CSS px), or use `getCurrentWebview().position()` minus `getCurrentWindow().innerPosition()`. Hardcoding 28 is acceptable as a v1 fix since the value is stable on macOS Sonoma/Sequoia."
  blind_spots:
    - "I have not run the app to instrument-print the actual numbers. The 28px offset is inferred from Tauri Issue #10744 plus our matching config; the actual offset on the user's exact macOS version could differ slightly (older versions report 22px, newer 28px). If the user is on a non-Sonoma macOS, the constant may be off."
    - "I have not eliminated a small contribution from x-axis offset. The bug report and our setup imply x is correct, but if the file tree's left edge is slightly off, the symptom (wrong folder) could be mixed with that. The user's verbatim phrasing ('chooses a non-choosed folder' — singular wrong folder, not 'misses entirely') is consistent with a y-only error, so x is probably fine."
    - "I have not verified whether the Finder-drag enters the webview when the cursor is over our custom titlebar div (y=0..28). If Tauri suppresses drops in the title-bar drag region but reports their position as the first valid in-content position, the offset symptom would be the SAME but the underlying mechanism slightly different. Either way the fix (offset subtraction) addresses both."
    - "If Tauri 2.10.x has silently fixed Issue #10744, the offset would be 0 and the bug would be elsewhere — but the user's reproduction confirms the bug is real, and the issue thread shows no fix landed as of late 2025."

## Symptoms

expected: dropping a Finder file onto a folder row in the FileTree copies that file into the folder under the cursor
actual: file is copied into a different (non-cursor) folder
errors: none reported
reproduction: Phase 18 UAT Test 16 — drag a Finder file onto a specific folder row, release; file lands in wrong folder
started: discovered during Phase 18 UAT (2026-04-16); no prior baseline

## Eliminated

- hypothesis: "DPR correction is wrong direction (multiplying instead of dividing)"
  evidence: "main.tsx:282-286 divides payload.position.{x,y} by window.devicePixelRatio. Tauri @tauri-apps/api 2.10.1 dpi.d.ts confirms position is PhysicalPosition (physical pixels). Division is correct: it converts physical→logical/CSS, matching what getBoundingClientRect returns. (verified by reading source on 2026-04-16)"
  timestamp: 2026-04-16T00:01:00Z

- hypothesis: "Position is not corrected for the file-tree's container offset / scroll position"
  evidence: "getBoundingClientRect() ALREADY returns viewport-relative coordinates (post-scroll, post-flexbox-offset). The hit-test compares position.y against rect.top/bottom from getBoundingClientRect() — both should be in the same viewport-relative CSS-pixel space. Container offset and scroll are NOT a source of error here. (verified by re-reading file-tree.tsx:768-790 on 2026-04-16)"
  timestamp: 2026-04-16T00:02:00Z

- hypothesis: "getBoundingClientRect returns coordinates relative to viewport but position is relative to window or webview origin (DPR-only mismatch)"
  evidence: "Closely related to root cause but distinct from it. Even after DPR division, position.y is still offset from clientY by a constant ~28px. The offset is NOT a unit-system error (logical vs physical) — it is an ORIGIN error: Tauri reports y from a different vertical reference point than the webview viewport. So the residual mismatch after DPR division IS the bug. This hypothesis is technically RIGHT — and it is the same bug as the macOS title-bar overlay offset."
  timestamp: 2026-04-16T00:03:00Z

- hypothesis: "Hit-test loop scans rows in wrong order or misses scroll offset"
  evidence: "The loop in handleFinderDrop (file-tree.tsx:778-791) iterates ALL rows with data-file-tree-index and breaks on the FIRST whose rect contains position.y. It uses getBoundingClientRect() which already accounts for scroll. Order doesn't matter unless two rows overlap (they don't — non-overlapping vertical rows in a flex column). Scroll offset is correctly handled by getBoundingClientRect. NOT the bug."
  timestamp: 2026-04-16T00:04:00Z

- hypothesis: "Tauri 2 webviewWindow position units changed (logical vs physical) — recent Tauri change"
  evidence: "Verified via dpi.d.ts and webview.js source in node_modules: position is wrapped with `new PhysicalPosition(...)` on every drag event variant (webview.js:555, 564, 574). PhysicalPosition is documented as physical pixels. No unit change — physical pixels has been consistent since 2.0.0."
  timestamp: 2026-04-16T00:05:00Z

## Evidence

- timestamp: 2026-04-16T00:01:00Z
  checked: "main.tsx:260-296 (Tauri onDragDropEvent subscriber)"
  found: "Subscribes to getCurrentWebviewWindow().onDragDropEvent(). On enter/over/drop, divides payload.position.{x,y} by window.devicePixelRatio (DPR), then dispatches CustomEvent with detail.position={x,y} in (intended) CSS pixels. Inside-project filter routes only outside-project paths to the Finder pipeline."
  implication: "DPR is correctly handled. The y value emitted to the file-tree is intended to be CSS pixels relative to the same origin as MouseEvent.clientY / getBoundingClientRect."

- timestamp: 2026-04-16T00:02:00Z
  checked: "file-tree.tsx:768-824 (handleFinderDrop)"
  found: "Reads detail.position. Iterates all elements with [data-file-tree-index] attribute; for each, calls getBoundingClientRect() and compares position.y against rect.top/bottom. First row whose rect contains position.y wins. Falls back to scroll container bounding rect for empty-area drops; otherwise shows 'Drop target outside file tree' toast."
  implication: "Hit-test logic is geometrically sound IF position.y and rect.top/bottom share the same coordinate origin and unit system. The whole correctness of the feature depends on that single assumption."

- timestamp: 2026-04-16T00:03:00Z
  checked: "tauri.conf.json:12-24"
  found: "app.windows[0] declares decorations: true, titleBarStyle: \"Overlay\", dragDropEnabled: true. The Overlay style is the macOS-specific config that places the native title bar AS A TRANSPARENT OVERLAY over the webview content (the webview spans the full window, including under the ~28px title bar region)."
  implication: "This config is the ONE Tauri-bug-trigger condition documented in GitHub Issue #10744. The webview-content viewport origin (where getBoundingClientRect measures from) is the top of the WINDOW, but Tauri reports drag positions from a coordinate system offset by the title bar height."

- timestamp: 2026-04-16T00:04:00Z
  checked: "src/main.tsx App component (lines 51-78)"
  found: "Renders a custom <div data-tauri-drag-region class=\"titlebar-drag-region\"> with inline height: 28 at the very top of #app-root. The actual content panels (Sidebar/MainPanel/RightPanel — including FileTree) start at y=28 inside the viewport, BELOW our custom titlebar div. The first FileTree row is therefore at clientY ≈ 28 + (header-bar height ≈ 32) ≈ 60 minimum."
  implication: "Our 28px custom titlebar div SITS UNDER the macOS native title bar overlay. Coincidentally the same height. The file tree's first row lives at y ≈ 60+ in the webview viewport, but Tauri's drag position is offset by ≈28 from this. That 28px error is exactly the height of one or two file-tree rows, so the cursor's actual row vs the matched row differs by 1-2 rows visually — matching the user's report."

- timestamp: 2026-04-16T00:05:00Z
  checked: "node_modules/@tauri-apps/api/webview.js:548-587 (onDragDropEvent implementation)"
  found: "All four DRAG_* event variants wrap event.payload.position via `new PhysicalPosition(event.payload.position)`. Position arrives from the Rust runtime as raw JSON; PhysicalPosition wraps it without transformation."
  implication: "No JS-side coordinate transformation between the wry/tao Rust runtime and our handler. Whatever offset is present in the runtime payload reaches our code unchanged. Tauri Issue #10744 (still open as of late 2025) confirms the runtime payload IS offset by ~28 on macOS Overlay."

- timestamp: 2026-04-16T00:06:00Z
  checked: "WebSearch — Tauri Issue #10744 'DragDropEvent payload position is incorrect'"
  found: "Documented bug on macOS 14+: drag event y is off by ~28 pixels when comparing to HTMLDivElement.getBoundingClientRect(). User in issue notes that subtracting 28 from y aligns the values. Maintainers acknowledge the issue. The 28px corresponds to the macOS title bar height on the Overlay style."
  implication: "EXACT match to our environment and our reported bug. This is a known Tauri runtime issue — not a logic bug in our code per se, but an unhandled platform-specific offset that we must compensate for in the dispatch layer."

- timestamp: 2026-04-16T00:07:00Z
  checked: "Plan 18-05-SUMMARY.md (key-decisions, Deviations §1, lines 163, 169-176)"
  found: "Test suite for the Finder-drop hit-test had to use `y: 0` and `clientY: 0` because jsdom returns zero-rects for all elements. The summary explicitly states: 'In real browsers with non-zero rects, the original `rect.top + 5` would also work.' The production hit-test geometry has NEVER been verified end-to-end against a real macOS WKWebView with a non-zero title bar offset."
  implication: "The test gap is precisely the gap that hides this bug. The unit tests pass because they exercise the loop logic with degenerate (zero) geometry. The production code path under realistic geometry is exactly where the offset bug manifests."

- timestamp: 2026-04-16T00:08:00Z
  checked: "Searched src/ for any compensating offset (titleBarStyle, TITLE_BAR_HEIGHT, webview.position, innerPosition)"
  found: "No matches. The frontend has no logic anywhere that adjusts for the macOS overlay title bar offset. The DPR division in main.tsx is the only coordinate transformation applied to payload.position before hit-testing."
  implication: "Confirms: no existing code attempts to fix this. The fix needs to be added — likely in main.tsx at the dispatch layer (subtract the macOS title-bar height from payload.position.y after DPR division)."

## Resolution

root_cause: |
  On macOS with `titleBarStyle: "Overlay"`, Tauri 2.10.x's `getCurrentWebviewWindow().onDragDropEvent` reports `payload.position` in a coordinate system whose y-origin is offset by approximately 28 CSS pixels (the macOS native title bar height) from the webview viewport origin used by `MouseEvent.clientY` and `Element.getBoundingClientRect()`. main.tsx:282-286 correctly converts physical→CSS pixels via `window.devicePixelRatio` but does NOT subtract this 28px offset. The result: when the user drops a file at viewport clientY=Y, the value passed to handleFinderDrop is Y±28, so the hit-test loop in file-tree.tsx:778-791 matches a row that is ~28px (≈ 1-2 file-tree rows) above or below the row actually under the cursor. This is the documented Tauri Issue #10744; the JSDOM-based test suite hides the bug because the production hit-test math was never exercised against realistic non-zero geometry (Plan 18-05-SUMMARY explicitly notes the test was reduced to `y: 0` because jsdom returns zero-rects).

fix: (not implemented — diagnosis-only mode)
verification: (not applicable — diagnosis-only mode)
files_changed: []
