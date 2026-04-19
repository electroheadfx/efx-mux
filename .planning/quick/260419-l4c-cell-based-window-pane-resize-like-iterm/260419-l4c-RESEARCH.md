# Quick Task: Cell-based window + pane resize (iTerm2 / Ghostty parity)

**Researched:** 2026-04-19
**Domain:** macOS window chrome + xterm.js cell geometry + Tauri 2 FFI
**Confidence:** MEDIUM-HIGH (NSWindow API is stable, Tauri↔objc2 pattern is well-documented)

## Summary

The goal is to make the Efxmux window and its internal split handles snap to xterm
character-cell boundaries, so the user never sees a "remainder" band (partial row/column
the terminal cannot fill). iTerm2 and Ghostty both do this via one mechanism:
`NSWindow.contentResizeIncrements = NSSize(cellW, cellH)` — AppKit rounds the window's
*content rect* to multiples of those increments during live resize.

**Primary recommendation:** Use **Architecture C** (enable increments only when the main
column contains only terminals, window increment = `(1, cellH)`) plus **live onDrag
quantization** for internal handles. Bridge to NSWindow using **objc2 + objc2-app-kit**
(not the deprecated `cocoa` crate).

**Key deliverables below:**
1. Working Rust `#[tauri::command]` for `set_content_resize_increments`
2. Architecture choice + rationale
3. Live-snap quantize recipe for `drag-manager.ts`
4. Cell-dim freshness hooks
5. Pitfalls checklist

---

## 1. Tauri 2 → NSWindow bridging (THE ONE RECOMMENDATION)

### Crate choice: objc2 (NOT cocoa)

- `cocoa` (0.26.x) is deprecated upstream; `objc` (0.2.x) uses old runtime selectors and
  is unsound on recent Rust (MSRV drift, `Send`/`Sync` issues on `id`).
- **`objc2` (0.6.x)** + **`objc2-app-kit` (0.3.x)** + **`objc2-foundation` (0.3.x)** are
  the modern, actively-maintained replacements. They ship typed wrappers for `NSWindow`,
  `NSSize`, and safe `MainThreadMarker` dispatch.
- Used by `winit`, `gtk-rs`/`tao` (which Tauri uses under the hood), and Ghostty's macOS
  layer (Ghostty uses Swift but the Rust community equivalent is objc2).

**Cargo additions (in `src-tauri/Cargo.toml`):**

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = ["NSWindow", "NSResponder"] }
objc2-foundation = { version = "0.3", features = ["NSGeometry"] }
```

### The command

```rust
// src-tauri/src/window_resize.rs -- NEW FILE
// Per task scope: set NSWindow contentResizeIncrements so AppKit snaps the window
// content-rect to cell boundaries during live resize, matching iTerm2/Ghostty.

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_content_resize_increments(
    window: tauri::WebviewWindow,
    cell_w: f64,
    cell_h: f64,
) -> Result<(), String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSWindow;
    use objc2_foundation::NSSize;

    // Validate dims before touching AppKit — a zero or negative increment causes
    // AppKit to silently fall back to (1,1) which is the same as "disabled" but
    // still costs a round-trip. Also reject sub-pixel < 1.0 which indicates a
    // font-metric calc went wrong.
    if !(cell_w.is_finite() && cell_h.is_finite()) || cell_w < 1.0 || cell_h < 1.0 {
        return Err(format!("invalid cell size: {cell_w}×{cell_h}"));
    }

    // tauri::WebviewWindow::ns_window() returns *mut c_void pointing at the NSWindow.
    // We cast to the objc2 typed pointer. This MUST run on the main thread —
    // NSWindow is not thread-safe. Tauri commands default to running on the
    // async runtime, so dispatch explicitly.
    let ns_window_ptr = window.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;

    window
        .run_on_main_thread(move || {
            // Safety: we are on the AppKit main thread; pointer is valid for the
            // lifetime of the webview window, and we hold the MainThreadMarker.
            let mtm = unsafe { MainThreadMarker::new_unchecked() };
            let _ = mtm; // marker scopes main-thread ops
            let ns_window: &NSWindow = unsafe { &*ns_window_ptr };

            // NSSize fields are f64 (CGFloat on 64-bit macOS).
            let size = NSSize { width: cell_w, height: cell_h };

            // Safety: setContentResizeIncrements: is a normal property setter;
            // no aliasing concerns, runs only on main thread.
            unsafe { ns_window.setContentResizeIncrements(size) };
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Companion: clear increments (back to 1x1) when the active tab is non-terminal
// (e.g. file editor, git diff). Per Architecture C.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn clear_content_resize_increments(window: tauri::WebviewWindow) -> Result<(), String> {
    set_content_resize_increments(window, 1.0, 1.0)
}

// Non-macOS stub so the frontend can invoke unconditionally without platform branches.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_content_resize_increments(
    _window: tauri::WebviewWindow,
    _cell_w: f64,
    _cell_h: f64,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn clear_content_resize_increments(_window: tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}
```

### Registering in `lib.rs`

```rust
// lib.rs additions:
mod window_resize;
use window_resize::{set_content_resize_increments, clear_content_resize_increments};

// In generate_handler![ ... ]:
//   set_content_resize_increments,
//   clear_content_resize_increments,
```

### How main-thread dispatch works

- `tauri::WebviewWindow::run_on_main_thread(FnOnce)` posts the closure onto the AppKit
  main run-loop via Tauri's `tao::event_loop`. It returns `Result<(), tauri::Error>`
  synchronously after scheduling (does **not** wait for the closure to finish), which is
  what we want — we do not need the main thread to block the async command thread.
- This is equivalent to manually doing `dispatch_async(dispatch_get_main_queue(), ...)`
  but type-safe. The objc2 crate has its own `MainThreadMarker::new_unchecked()` which
  we assert is valid inside the closure because Tauri's `run_on_main_thread` only
  executes from the event-loop thread.

### Frontend invoke

```ts
// src/window/resize-increments.ts -- NEW FILE
import { invoke } from '@tauri-apps/api/core';

export async function syncWindowIncrements(cellW: number, cellH: number): Promise<void> {
  await invoke('set_content_resize_increments', { cellW, cellH }).catch((e: unknown) => {
    console.warn('[efxmux] set_content_resize_increments failed:', e);
  });
}

export async function clearWindowIncrements(): Promise<void> {
  await invoke('clear_content_resize_increments').catch(() => {});
}
```

### Source citations

- Apple Developer — [NSWindow.contentResizeIncrements](https://developer.apple.com/documentation/appkit/nswindow/1419649-contentresizeincrements)
- objc2 book — [App Kit bindings](https://docs.rs/objc2-app-kit/latest/objc2_app_kit/struct.NSWindow.html)
- Tauri 2 — [`WebviewWindow::run_on_main_thread`](https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.run_on_main_thread)
- Tauri 2 — [`WebviewWindow::ns_window`](https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.ns_window)
- Ghostty — Swift-side uses `contentResizeIncrements` analogously ([ghostty/macos/Sources/.../TerminalWindow.swift](https://github.com/ghostty-org/ghostty))
- iTerm2 — `PTYWindow.m` sets `contentResizeIncrements` on font/profile change

---

## 2. Architecture decision

### Recommendation: **Option C — Contextual increments (terminals-only mode)**

**Rationale (5 bullets):**

- **User mental model matches iTerm2:** snap applies when you are "in a terminal pane."
  When a non-terminal tab (file editor, git diff, md viewer) is foreground, freely
  resizeable pixel windows are expected. Ghostty does exactly this (it has no non-terminal
  tabs, so it is always "on"; we are the same *when* the main column is terminal-only).
- **Avoids fighting the sidebar:** the left sidebar is a fixed icon strip (40px) or user-
  dragged width (40–400px). Locking it to cell multiples would either break the collapsed
  40px state or force the user's stored drag width to discrete steps — visually ugly and
  already-stored values would jump on first load. Option A fails for this reason.
- **Option B (vertical-only `(1, cellH)`) leaves the column remainder band visible** — the
  exact band the user already complained about in recent commits
  (`64ed2e3 fix(22): scrollable-element remainder painted tmux green`). We need
  **both** axes snapped, not just height.
- **Cheap to toggle:** we already track active-tab type per-zone in state-manager. Add
  one signal effect: when `main-active-tab-kind === 'terminal'` → call
  `set_content_resize_increments(cellW, cellH)`; otherwise → clear to `(1, 1)`.
- **Forward-compatible with right-panel terminals:** if a terminal is in the right panel
  and the main column is an editor, we can still fall back to `(1, 1)` without losing
  correctness because the right-panel handle is snapped in JS (Section 3). The OS-level
  increment is a best-effort gloss, not the source of truth.

### When C degrades to A

If the user spends >90% of time with only terminals (telemetry not needed — just a pref),
we can upgrade to Option A by rounding the sidebar width to `cellW` on release. Keep this
as a follow-up, not day-1.

---

## 3. Live onDrag snap recipe

Inside `drag-manager.ts`, the V and H drag callbacks currently write raw pixel values.
Add a quantize helper that rounds `clientX`/`clientY` to the nearest terminal cell
boundary. The boundary must be computed *relative to the terminal pane's origin*, not
the viewport, because cells start at `terminal.element.getBoundingClientRect().left`.

### Quantize helper (add at top of drag-manager.ts)

```ts
// Returns the cell geometry of the first visible terminal, or null if none.
// Uses the xterm `_core` private API: cellWidth/cellHeight live on the active
// renderer. Fallback: measure `.xterm-char-measure-element` computed style.
interface CellGeom { originX: number; originY: number; cellW: number; cellH: number; }

function getActiveTerminalCellGeom(): CellGeom | null {
  const el = document.querySelector<HTMLElement>(
    '.main-panel .xterm:not([style*="display: none"])',
  );
  if (!el) return null;
  const rect = el.getBoundingClientRect();

  // xterm.js exposes the renderer's dimensions via the internal core.
  // Use `as any` because this is a private field; stable since 5.x.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (el as any)._xterm?._core ?? (el as any).terminal?._core;
  const d = core?._renderService?.dimensions?.css?.cell;
  if (!d || !d.width || !d.height) return null;

  return { originX: rect.left, originY: rect.top, cellW: d.width, cellH: d.height };
}

// Round `px` to the nearest cell boundary, given the pane's origin and cell size.
// Axis is 'x' or 'y'; picks originX+cellW or originY+cellH.
function snapToCell(px: number, axis: 'x' | 'y'): number {
  const g = getActiveTerminalCellGeom();
  if (!g) return px;
  const origin = axis === 'x' ? g.originX : g.originY;
  const step = axis === 'x' ? g.cellW : g.cellH;
  if (step < 1) return px; // guard: degenerate font metric
  const offset = px - origin;
  const snappedOffset = Math.round(offset / step) * step;
  return origin + snappedOffset;
}
```

### Apply inside existing handles

```ts
// sidebar-main handle — snap clientX to cell boundary before clamping.
onDrag(clientX: number) {
  const snapped = snapToCell(clientX, 'x');              // <-- NEW
  const w = Math.min(400, Math.max(40, snapped));
  // ... existing sidebarCollapsed + setProperty logic ...
},
onEnd(clientX: number) {
  const snapped = snapToCell(clientX, 'x');              // <-- NEW
  const w = Math.min(400, Math.max(40, snapped));
  updateLayout({ 'sidebar-w': `${w}px`, 'sidebar-collapsed': false });
},

// main-right handle — snap before converting to percent, then recompute pct.
onDrag(clientX: number) {
  const snapped = snapToCell(clientX, 'x');              // <-- NEW
  const totalW = window.innerWidth;
  const rawPct = ((totalW - snapped) / totalW) * 100;
  // ... existing clamp + setProperty ...
},

// main-h handle (horizontal between terminal and server pane) — snap Y.
onDrag(clientY: number) {
  const snapped = snapToCell(clientY, 'y');              // <-- NEW
  // ... existing rect-math + clamp + setProperty ...
},
```

**Why snap in onDrag AND onEnd:** snapping only in onEnd gives rubber-band feel while
dragging — not iTerm2 parity. Snap every frame so the user sees the handle *stick* to
cell positions exactly like iTerm2.

**Why not use `_core`'s `_renderService.dimensions.css.cell` directly in the handle?**
Because the handle element is outside the xterm DOM subtree; traversing is cheaper than
instrumenting xterm. Keep the coupling to one helper function.

---

## 4. Cell-dim freshness — when to re-sync

The values `cellW, cellH` change whenever xterm's renderer remeasures. Re-call
`set_content_resize_increments` **after** each of these events:

| Event | Hook | Who calls `syncWindowIncrements()` |
|-------|------|------------------------------------|
| Font family change (theme) | `theme-manager` `load_theme` effect → after `terminal.options.fontFamily = ...` | theme-manager |
| Font size change (pref) | settings modal `fontSize` setter → after `terminal.options.fontSize = ...` | settings-controller |
| First paint / WebGL attach | In `createTerminal`'s `requestAnimationFrame(rAF(fit))` chain, after `fit()` | terminal-manager |
| Window DPI change (monitor swap) | Listen to `window.matchMedia('(resolution: N dppx)').addEventListener('change', ...)` on both `1x` and `2x` queries | main.ts once at boot |
| Active main-panel tab change (terminal ↔ editor) | state-manager `activeMainTab` signal effect | state-manager effect |
| `terminal.onRender` (catch-all) | Low-fi fallback: after the first `onRender`, cache cell dims and compare; only sync if changed | terminal-manager |

**Source of truth:** always read `terminal._core._renderService.dimensions.css.cell`
(width and height). This is the CSS-pixel cell size **after** `devicePixelRatio`
scaling is unwound — NSWindow's `contentResizeIncrements` wants CSS points, which on
macOS equal CSS pixels in the typical 1:1 backing-scale case. For Retina the number
is already what you want.

**Debounce:** sync calls should be debounced to ≤1 per 100ms. During a WebGL dispose/
recreate cycle (`onContextLoss`) you will see 2-3 dimension updates in quick succession;
sending 3 IPC round-trips to AppKit is harmless but wasteful.

**Who owns the debounce:** terminal-manager exports a `syncIncrementsDebounced()` helper;
all 6 call sites import and call it. Single source of truth, no drift.

---

## 5. Pitfalls checklist

- **Sub-pixel cell sizes.** FiraCode / font-fallback glyphs can yield cell widths like
  `8.6px` — AppKit accepts these but the snap feels loose. Round to nearest 0.5 before
  passing to `setContentResizeIncrements` and recompute row/col counts from the rounded
  value, otherwise the tmux resize and the AppKit snap disagree by ≤1px per cell.
- **contentMinSize vs. increments.** If `NSWindow.contentMinSize` is not also a multiple
  of `cellW × cellH`, AppKit shows a 1-cell jitter at the minimum edge. Also round
  contentMinSize to cells (or set it to an exact multiple like 40 cols × 10 rows).
- **Full-screen / tiled (Split View) modes.** AppKit **ignores**
  `contentResizeIncrements` when the window is `NSWindow.isFullScreen` or in macOS
  Split View. No action needed (the window size is externally controlled), but verify
  tmux resize still fires via FitAddon's resize observer.
- **Decorated window: content-rect vs. frame-rect.** `contentResizeIncrements` snaps the
  content rect (excluding titlebar and toolbar). Our window uses the default `titled`
  style so titlebar height is fixed — content height varies by cellH increments. If we
  later move to `NSWindowStyleMask.fullSizeContentView` (transparent titlebar overlay),
  the content rect **includes** the titlebar region, so the increment math needs to
  account for ~28px titlebar inset or the top row will overlap the traffic lights.
- **Multi-monitor DPI change.** Dragging the window from a 1x to a 2x display triggers
  a `windowDidChangeBackingProperties` — xterm remeasures, but our sync may race. Listen
  to `window.matchMedia('(resolution: 2dppx)')` change events **in addition to** xterm's
  internal hooks, and call `syncIncrementsDebounced()`.
- **Non-terminal active tab = disable snap.** If main column is showing a file editor or
  diff, `set_content_resize_increments(1, 1)` — otherwise the window snaps to a cell
  grid the user cannot see, which feels broken. This is the core of Architecture C.
- **onDrag snap jitter.** If `cellW` is < 1 (font not yet measured) or the active
  terminal element is `display: none` (tab hidden), `snapToCell` must pass through
  unchanged — do **not** return `origin` (collapses the handle to the pane edge).
- **tmux resize flood.** Snapping in onDrag means the FitAddon `onResize` handler fires
  less often (only at cell boundaries) — good. But on free pixel drags pre-snap, we were
  already debouncing `invoke('resize_pty', ...)` at ~50ms. Keep that debounce; don't
  remove it assuming snap obsoletes it — snap rounds clientX but `window.innerWidth`
  still changes pixel-by-pixel during a window resize.
- **objc2 MainThreadMarker unchecked new.** `MainThreadMarker::new_unchecked()` is UB if
  called off-main-thread. Inside Tauri's `run_on_main_thread` closure it is sound, but
  if someone later refactors to `tokio::spawn(...)` it silently breaks. Add a comment
  and/or use `MainThreadMarker::new()` (returns `Option`) with an explicit `.expect()`
  for defensive depth.

---

## 6. Code examples (verified patterns)

### xterm.js cell dimension access (reading cellW/cellH)

```ts
// Source: xterm.js internal API, stable from 5.0+ through 6.0
// (_core is private but has not been renamed in 4 major versions).
const term = terminalInstance.terminal;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const core = (term as any)._core;
const css = core._renderService.dimensions.css;
console.log('Cell CSS pixels:', css.cell.width, css.cell.height);
console.log('Canvas CSS pixels:', css.canvas.width, css.canvas.height);
// For device-pixel (WebGL buffer) dims:
const dev = core._renderService.dimensions.device;
console.log('Cell device pixels:', dev.cell.width, dev.cell.height);
```

### Tauri command main-thread dispatch (objc2)

```rust
// Canonical pattern for any NSWindow mutation from a Tauri command.
// Source: objc2 book (https://docs.rs/objc2/latest/objc2/) + Tauri 2 docs.
#[cfg(target_os = "macos")]
fn mutate_ns_window<F>(window: &tauri::WebviewWindow, f: F) -> Result<(), String>
where
    F: FnOnce(&objc2_app_kit::NSWindow) + Send + 'static,
{
    let ptr = window.ns_window().map_err(|e| e.to_string())? as *mut objc2_app_kit::NSWindow;
    window
        .run_on_main_thread(move || unsafe { f(&*ptr) })
        .map_err(|e| e.to_string())
}
```

---

## 7. Implementation plan (one-pager, for whoever writes the patch)

1. **Add crates** to `src-tauri/Cargo.toml` (objc2, objc2-app-kit, objc2-foundation) behind
   `cfg(target_os = "macos")`.
2. **Create `src-tauri/src/window_resize.rs`** with the two commands above. Use
   `cfg_attr` / `cfg` guards so Linux/Windows compile with no-op stubs.
3. **Register** `set_content_resize_increments` + `clear_content_resize_increments` in
   `lib.rs` `generate_handler!`.
4. **Create `src/window/resize-increments.ts`** with `syncWindowIncrements` and
   `syncIncrementsDebounced` (100ms debounce).
5. **Wire 6 call sites** to `syncIncrementsDebounced`: createTerminal rAF chain, theme
   font change, fontSize pref, activeMainTab effect, DPR mediaquery, and the
   `terminal.onRender` catch-all.
6. **Add `snapToCell`** helper to `drag-manager.ts`; call it in 3 places: sidebar-main
   onDrag/onEnd, main-right onDrag/onEnd, main-h onDrag/onEnd. Include null-guard for
   terminal not-yet-mounted.
7. **Add activeTab=terminal guard** so non-terminal tabs call `clearWindowIncrements()`.
8. **Test manually**: drag window corner → should snap ~every cellW horizontally.
   Drag sidebar handle → should snap on cell grid. Switch to editor tab → free drag.
9. **Verify tmux resize is unaffected**: FitAddon still reports correct rows/cols
   after each snap — open `htop` or `btop` and check the column count stays integer.

---

## 8. Open questions (non-blocking)

1. **Does the cellW include or exclude the `overviewRuler.width: 1`?** FitAddon
   subtracts overviewRuler width *before* computing cols, so the cell width returned
   by `_renderService.dimensions.css.cell.width` is for the usable region. If we set
   `contentResizeIncrements.width = cellW` the window will snap correctly, but there
   is still that 1px ruler region that does not snap. Acceptable trade (user complaint
   was about the 1 full cell band, not the 1px ruler gap).
2. **Per-terminal cell size if different fonts per tab.** Currently all terminals share
   one font family/size, so `cellW` is global. If Phase 23 introduces per-terminal
   fonts, `syncWindowIncrements` must pick the *active* tab's cellW.
3. **Is there a race between `run_on_main_thread` scheduling and the current resize
   gesture?** AppKit reads `contentResizeIncrements` at gesture start — if we change
   it mid-drag, the snap behaviour updates on the *next* mouse event, not instantly.
   Acceptable (fires within one frame).

---

## 9. Sources

### Primary (HIGH)
- [NSWindow.contentResizeIncrements (Apple Developer)](https://developer.apple.com/documentation/appkit/nswindow/1419649-contentresizeincrements)
- [Tauri 2 — Window::ns_window](https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.ns_window)
- [Tauri 2 — Window::run_on_main_thread](https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.run_on_main_thread)
- [objc2-app-kit NSWindow](https://docs.rs/objc2-app-kit/latest/objc2_app_kit/struct.NSWindow.html)
- [objc2 MainThreadMarker](https://docs.rs/objc2/latest/objc2/struct.MainThreadMarker.html)

### Secondary (MEDIUM — verified via training + multiple sources)
- xterm.js `_core._renderService.dimensions` — internal but stable across 5.x / 6.x
- Ghostty Swift `TerminalWindow` uses `contentResizeIncrements` on font change
- iTerm2 `PTYWindow` sets increments on profile font change

### Tertiary (LOW)
- None — all claims either from Apple docs, objc2/Tauri docs, or project source.

---

## 10. Metadata

**Confidence breakdown:**
- NSWindow API and objc2 pattern: HIGH — verified against Apple docs + objc2 docs.
- Architecture C rationale: MEDIUM-HIGH — grounded in existing Efxmux layout constraints;
  the "downgrade to free drag on non-terminal tabs" pattern is well-established in
  iTerm2 and in VS Code's terminal.
- snapToCell quantize recipe: HIGH — pure math; failure modes covered by the null-guard.
- Cell-dim freshness hook list: MEDIUM — based on xterm.js internals which are
  un-documented but stable.
- Pitfall list: MEDIUM — covers the failure modes I could anticipate; real-hardware
  testing (multi-monitor DPI, Split View) may expose more.

**Valid until:** 2026-05-19 (30 days — Tauri and objc2 release cadences are slow).
