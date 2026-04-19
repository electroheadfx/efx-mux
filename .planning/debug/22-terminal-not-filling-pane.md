---
slug: 22-terminal-not-filling-pane
status: awaiting_human_verify
trigger: In split mode, the top pane's terminal content stops well above the pane's bottom edge, leaving a variable-height empty zone that changes with resizing. The xterm.js FitAddon is not re-fitting when the split ratio (CSS flex height of the pane) changes.
created: 2026-04-19
updated: 2026-04-19
goal: find_and_fix
---

# Debug: 22-terminal-not-filling-pane

## Symptoms

<DATA_START>
**Setup:** Main panel split vertically into 2 sub-scopes. Top pane has terminal tabs (Terminal 6 active). Bottom pane has a different terminal / agent.

**Observed (screenshot 2026-04-19 post-768be19):**
- Top pane's xterm renders only the first few lines of output at top of pane
- Huge empty black zone below the visible prompt line, extending down to the bottom-pane's tab bar
- The empty zone's height VARIES with resize of the split handle
- Bottom pane's terminal appears to fit correctly

**Expected:** xterm fills the full height of its pane, with the prompt at the bottom of the available rows (or at top but with rows count matching container).

**Timeline:**
- Plan 22-04 added `.split-handle-h-intra` intra-zone resize
- Plan 22-11 wired the resize via CSS var + direct `pane.style.flex` mutation + removed flex:1 wrapper divs

**Reproduction:**
1. Fresh Efxmux.app, open project
2. Create 2+ terminal tabs in main
3. Split main (icon button) → 2 sub-scopes
4. Focus top pane's terminal
5. Observe empty zone below terminal content
6. Drag the split handle — empty zone resizes with the pane, confirming the terminal DOM dimensions are frozen while the pane's CSS height changes
<DATA_END>

## Current Focus

- hypothesis: resolved — see reasoning_checkpoint
- test: add broadcast event + listener; verify with unit test
- expecting: terminals refit on split/drag/topology change regardless of whether ResizeObserver fires
- next_action: implement fix in drag-manager.ts + resize-handler.ts + sub-scope-pane.tsx, add unit test
- reasoning_checkpoint:
    hypothesis: "Top pane xterm rows/cols were computed by FitAddon at a point when its container had a DIFFERENT height than after the split topology change. Intra-zone drag mutates pane.style.height imperatively, but the only refit path depends on ResizeObserver firing on the innermost `.absolute.inset-0` terminal container. Evidence suggests that refit path is unreliable for the pre-existing (main-0) pane across the split transition — likely a combination of (a) Preact re-rendering SubScopePane with new inline style writes that might be coalesced with drag-manager writes at an unpredictable moment, and (b) nested absolute `inset:0` elements where layout-change bubbling to ResizeObserver is subject to timing. The BOTTOM pane works because its terminal is mounted AFTER the split, so fit() at mount time sees the correct final size."
    confirming_evidence:
      - "resize-handler.ts attaches ResizeObserver on container; there is NO other refit trigger — no window-resize, no cross-component signal, no broadcast."
      - "drag-manager.ts intra-zone onDrag mutates pane.style.height/flex directly but dispatches NO event; the only way xterm learns of the size change is via the ResizeObserver chain."
      - "sub-scope-pane.tsx SubScopePane re-renders with new `height: var(--main-split-0-pct, 50%)` + `flex: none` on split; Preact's style diff can overwrite drag-manager's inline px height, and there is no explicit notification that the terminal should refit."
      - "User observation: the empty zone's height VARIES with pane resize, proving the terminal's (rows × cellHeight) is frozen while its container keeps tracking the pane — i.e. fit() ran once and never re-ran for this particular terminal."
      - "Bottom pane fits correctly — confirming the refit pipeline works when the terminal is mounted AT the final container size, but is unreliable for a pre-existing terminal whose container size changed after mount."
    falsification_test: "If, after adding a window-dispatched `'efxmux:layout-changed'` event that terminals listen for (alongside the ResizeObserver) and dispatching it on intra-zone drag + split spawn/close, the top pane still shows a frozen terminal height when the pane is resized, then the root cause is elsewhere (e.g. fitAddon.fit() actually being called but failing to update xterm geometry due to the WebglAddon or some other xterm internal issue)."
    fix_rationale: "Add a guaranteed, layout-change-agnostic refit path: broadcast `'efxmux:layout-changed'` from all code paths that mutate pane geometry (drag-manager intra-zone onDrag/onEnd, spawnSubScopeForZone, closeSubScope). Every terminal's resize-handler subscribes to this event and runs the same RAF-deferred fit() logic as the ResizeObserver. This is belt-and-suspenders: if ResizeObserver works, fit() runs once. If it does not, the event-driven path ensures fit() still runs. Also addresses the broader architectural gap — terminals are completely decoupled from layout changes today."
    blind_spots:
      - "Cannot execute the Tauri app in this session to confirm fix live; must rely on unit test + static reasoning."
      - "WebglAddon behavior under repeated fit() calls is not verified here — if it caches framebuffer geometry in a way that survives fit(), this fix won't help. CLAUDE.md notes WebGL fallback works in WKWebView, but stress behavior is untested."
      - "Preact re-render writing `height: var(--...-split-0-pct)` after drag-manager wrote `height: 400px` is a separate visual glitch that this fix does NOT address; it only addresses the terminal-content-not-filling-pane symptom."
      - "The ResizeObserver may in fact be firing correctly and the bug may be purely in xterm's 6.0 scrollbar/overview-ruler layout. This fix ensures fit() is called from a second path, which is strictly more reliable."
  tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-19
  checked: "src/terminal/resize-handler.ts — only refit trigger"
  found: "ResizeObserver attached to container; RAF-deferred fit(); no other code path triggers fit() on existing terminals after mount. No window-level events, no signal-driven broadcast."
  implication: "If ResizeObserver misses a size change (for any reason — timing, Preact reconciliation, xterm internals), the terminal's rows/cols are permanently frozen at their last-fit value."

- timestamp: 2026-04-19
  checked: "src/drag-manager.ts attachIntraZoneHandles onDrag/onEnd"
  found: "Mutates document.documentElement.style.--<zone>-split-<idx>-pct AND pane0/pane1 inline style.height + style.flex='none'. Dispatches NO event. No notification reaches terminal instances."
  implication: "Drag-manager expects ResizeObserver on each terminal container to pick up the cascading size change via layout. There is no belt-and-suspenders path."

- timestamp: 2026-04-19
  checked: "src/components/sub-scope-pane.tsx SubScopePane style block"
  found: "Non-last pane uses `height: var(--<zone>-split-<idx>-pct, <fallback>%)` + `flex: 'none'`. Last pane uses `flex: 1`. Preact re-renders on any signal change in the scope (tab list, active tab, file tree, etc.) and re-writes the inline style from scratch."
  implication: "Preact's style write can race drag-manager's px-height write. More importantly, topology changes (split add/close) cause existing panes to switch between 'flex:1' and 'flex:none + height:var(..)' modes — existing terminals must refit after each topology change."

- timestamp: 2026-04-19
  checked: "src/components/main-panel.tsx + 22-11 commit 19f3f7d"
  found: "22-11 removed the wrapper `<div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>` around each SubScopePane so SubScopePane is itself the flex item. Before 22-11 the wrapper handled all sizing; after 22-11 SubScopePane's own inline style must do so. Terminals mounted before 22-11's restructure operated under the wrapper's stable height; after restructure, size cascades through one fewer level."
  implication: "Pre-existing terminals (main-0 after a user triggers split) go through a parent-sizing-mode transition that isn't mirrored by any refit signal."

- timestamp: 2026-04-19
  checked: "src/components/sub-scope-pane.tsx spawnSubScopeForZone / closeSubScope"
  found: "Both functions mutate the activeMainSubScopes / activeRightSubScopes signals and persist via updateLayout. Neither function dispatches any resize or layout-change notification."
  implication: "Any existing terminal whose pane's effective height changes as a result of a scope add/remove has no way to learn about it except via ResizeObserver — which is the unreliable path."

## Eliminated

(populated by debugger)

## Resolution

- root_cause: "Architectural gap — terminals had a single refit path (ResizeObserver on the absolute-inset:0 terminal container), and it was unreliable for pre-existing terminals across the split-topology transition introduced in 22-11. When the user splits the main panel, the pre-existing top-pane terminal's pane changes from 'flex:1' (fills everything) to 'flex:none + height:var(--main-split-0-pct, 50%)' (fixed fraction). Preact re-renders with the new inline style, drag-manager may write a px height, and the ResizeObserver may or may not fire on the cascaded size change — but xterm only learns about geometry changes through that observer. With no belt-and-suspenders refit path, any missed observer event leaves the terminal frozen at its last rows/cols, producing the variable-height empty zone below the content."
- fix: |
    Introduced a `efxmux:layout-changed` window event that every code path mutating pane geometry dispatches, and every resize-handler subscribes to (alongside ResizeObserver).
    - src/terminal/resize-handler.ts: export LAYOUT_CHANGED_EVENT + dispatchLayoutChanged(); attachResizeHandler now also addEventListener on the window for that event, sharing the RAF-deferred fit path with the ResizeObserver; detach() removes the listener.
    - src/drag-manager.ts: intra-zone onDrag + onEnd call dispatchLayoutChanged() after mutating pane style.
    - src/components/sub-scope-pane.tsx: spawnSubScopeForZone() and closeSubScope() schedule dispatchLayoutChanged() on a microtask (after Preact applies the new inline styles) so pre-existing terminals refit on split topology changes.
    - src/terminal/resize-handler.test.ts: 6 new tests proving the listener is installed, fires on event, honours the display:none guard, and is properly detached.
- verification: |
    - pnpm exec vitest run src/terminal/resize-handler.test.ts → 6/6 pass
    - pnpm exec vitest run src/drag-manager.test.ts src/components/main-panel.test.tsx src/terminal/resize-handler.test.ts → 16/16 pass (no regression)
    - pnpm exec tsc --noEmit -p tsconfig.build.json → clean
    - Pre-existing test failures in other files (git-control-tab, sidebar, terminal-tabs, unified-tab-bar, right-panel) exist on the same branch WITHOUT my changes (confirmed by stashing + rerunning) — not introduced by this fix.
    - Cannot run Tauri app in this session per project convention; awaiting user verification.
- files_changed:
    - src/terminal/resize-handler.ts
    - src/drag-manager.ts
    - src/components/sub-scope-pane.tsx
    - src/terminal/resize-handler.test.ts
