// src-tauri/src/window_resize.rs
// Bridge: set NSWindow contentResizeIncrements via objc2/objc2-app-kit on macOS.
// This enables AppKit to snap the window content-rect to xterm character-cell
// boundaries during live resize — matching iTerm2/Ghostty behaviour.
//
// Architecture C: increments are enabled ONLY when the main-panel active tab is a
// terminal. For editor/file-tree/gsd/git-changes tabs, the frontend calls
// clear_content_resize_increments() to restore free pixel resize.
//
// Non-macOS: both commands compile to no-op stubs that always return Ok(()).
// The frontend never branches on OS — the same invoke() call shape works everywhere.

// ── macOS implementation ────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_content_resize_increments(
    window: tauri::WebviewWindow,
    cell_w: f64,
    cell_h: f64,
) -> Result<(), String> {
    use objc2::MainThreadMarker;
    use objc2_foundation::NSSize;

    // Validate dims BEFORE touching AppKit.
    // A zero/negative/non-finite increment causes AppKit to silently ignore the
    // call or fall back to (1,1). A value < 1.0 indicates a font-metric calc went
    // wrong (sub-pixel cell), which we treat as an error so the caller can log it.
    if !(cell_w.is_finite() && cell_h.is_finite()) || cell_w < 1.0 || cell_h < 1.0 {
        return Err(format!("invalid cell size: {cell_w}×{cell_h}"));
    }

    // tauri::WebviewWindow::ns_window() returns *mut c_void pointing at the NSWindow.
    // Cast to usize to erase the pointer type — raw pointers are not `Send`, but
    // `usize` is. We reconstruct the typed pointer inside run_on_main_thread() where
    // it is safe to dereference (we are guaranteed to be on the AppKit main thread).
    //
    // SAFETY: The NSWindow pointer is valid for the lifetime of the webview window.
    // We erase it to usize only to satisfy Rust's `Send` bound on the closure; we
    // NEVER dereference it outside the run_on_main_thread callback.
    let ns_window_addr = window.ns_window().map_err(|e| e.to_string())? as usize;

    // SAFETY NOTE: run_on_main_thread() posts this closure to the AppKit event-loop
    // thread. We must NOT call setContentResizeIncrements directly here (async
    // command body runs on a Tokio worker thread). NSWindow is NOT thread-safe.
    // MainThreadMarker::new_unchecked() is ONLY sound inside a run_on_main_thread
    // closure — do NOT move this assertion anywhere else (e.g. tokio::spawn) or
    // it becomes UB.
    window
        .run_on_main_thread(move || {
            // Safety: we are executing on the AppKit main run-loop thread; the
            // address was obtained from a live WebviewWindow and remains valid.
            // MainThreadMarker confirms we hold the main-thread invariant.
            let mtm = unsafe { MainThreadMarker::new_unchecked() };
            let _ = mtm; // marker scopes main-thread ops; explicitly unused is fine

            // Reconstruct the typed pointer from the address and call the setter.
            // Safety: setContentResizeIncrements: is a normal property setter with
            // no aliasing concerns; runs only on the main thread (run_on_main_thread
            // guarantee). Pointer was obtained from a live WebviewWindow and is valid.
            unsafe {
                let ns_window = &*(ns_window_addr as *mut objc2_app_kit::NSWindow);
                // NSSize fields are f64 (= CGFloat on 64-bit macOS).
                let size = NSSize { width: cell_w, height: cell_h };
                ns_window.setContentResizeIncrements(size);
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Clear contentResizeIncrements (reset to 1×1) so the window resizes freely
/// by pixel. Called when the active main-panel tab switches to a non-terminal
/// kind (editor, file-tree, gsd, git-changes) per Architecture C.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn clear_content_resize_increments(window: tauri::WebviewWindow) -> Result<(), String> {
    set_content_resize_increments(window, 1.0, 1.0)
}

// ── Non-macOS stubs ─────────────────────────────────────────────────────────
// These compile on Linux/Windows so the frontend invoke() call shape is
// identical across all platforms — no OS branches needed in TS/JS.

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
