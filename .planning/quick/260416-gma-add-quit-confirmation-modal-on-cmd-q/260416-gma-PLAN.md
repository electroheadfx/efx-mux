---
phase: quick
plan: 260416-gma
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.tsx
  - src/components/confirm-modal.tsx
autonomous: true
must_haves:
  truths:
    - "Pressing Cmd+Q shows a confirmation modal before quitting"
    - "Clicking Cancel in the modal keeps the app running"
    - "Clicking Quit in the modal closes the app"
    - "Pressing Escape on the modal cancels the quit"
  artifacts:
    - path: "src/main.tsx"
      provides: "onCloseRequested handler wired during bootstrap"
    - path: "src/components/confirm-modal.tsx"
      provides: "showConfirmModal reused for quit confirmation"
  key_links:
    - from: "src/main.tsx"
      to: "getCurrentWindow().onCloseRequested"
      via: "Tauri 2 window close-requested event"
      pattern: "onCloseRequested"
---

<objective>
Add a quit confirmation modal that intercepts Cmd+Q (and any window close) to ask
"Are you sure you want to quit?" before closing the app.

Purpose: Prevent accidental quit when terminal sessions are active.
Output: Modified main.tsx with close-requested interceptor, using existing ConfirmModal.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/main.tsx
@src/components/confirm-modal.tsx
@src/state-manager.ts (initBeforeUnload pattern)
@src-tauri/src/lib.rs (on_window_event CloseRequested handler)

<interfaces>
<!-- Existing confirm modal API the executor must use -->

From src/components/confirm-modal.tsx:
```typescript
export interface ShowConfirmModalOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSave?: () => void;
}

export function showConfirmModal(opts: ShowConfirmModalOptions): void;
```

From @tauri-apps/api/window (already imported in main.tsx):
```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';
// getCurrentWindow().onCloseRequested(handler) — handler receives CloseRequestedEvent
// CloseRequestedEvent has .preventDefault() to cancel the close
// getCurrentWindow().destroy() — force-close the window (bypasses close-requested)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire quit confirmation on window close-requested</name>
  <files>src/main.tsx, src/components/confirm-modal.tsx</files>
  <action>
In `src/main.tsx`, inside the `bootstrap()` function, after the `initBeforeUnload()` call
(around line 116), add a close-requested interceptor:

```typescript
// Quit confirmation modal: intercept Cmd+Q / window close (quick-260416-gma)
getCurrentWindow().onCloseRequested(async (event) => {
  event.preventDefault();
  showConfirmModal({
    title: 'Quit Efxmux?',
    message: 'Are you sure you want to quit? Active terminal sessions will be preserved by tmux.',
    onConfirm: () => {
      getCurrentWindow().destroy();
    },
    onCancel: () => {},
  });
});
```

Add `showConfirmModal` to the imports from `./components/confirm-modal`:
```typescript
import { ConfirmModal, showConfirmModal } from './components/confirm-modal';
```

Key implementation details:
- Use `event.preventDefault()` to block the default close behavior.
- On Confirm ("Quit"), call `getCurrentWindow().destroy()` which force-closes the window
  and bypasses the close-requested handler (no infinite loop).
- On Cancel, do nothing — the modal hides and the app stays open.
- Do NOT pass `onSave` — only two buttons needed: Cancel and Quit.
- The existing `on_window_event(CloseRequested)` in lib.rs will still fire when `destroy()`
  is called, so server cleanup and state save remain intact.

In `src/components/confirm-modal.tsx`, make the confirm button label configurable:
- Add an optional `confirmLabel?: string` field to `ConfirmModalState` and
  `ShowConfirmModalOptions` (defaults to `'Discard'` for backward compat).
- In the Discard button's text content, replace the hardcoded `Discard` with
  `{confirmLabel ?? 'Discard'}`.
- The quit confirmation will pass `confirmLabel: 'Quit'` so the button reads "Quit"
  instead of "Discard".

Update the showConfirmModal call in main.tsx to include `confirmLabel: 'Quit'`.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - Cmd+Q or clicking the red window close button shows the confirmation modal
    - Modal title reads "Quit Efxmux?"
    - Modal message reads "Are you sure you want to quit? Active terminal sessions will be preserved by tmux."
    - Two buttons: Cancel (closes modal, app stays) and Quit (closes app)
    - Escape key dismisses the modal (existing ConfirmModal behavior)
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes (no type errors)
2. Manual: launch app, press Cmd+Q, see confirmation modal appear
3. Manual: click Cancel — app stays running
4. Manual: press Cmd+Q again, click Quit — app closes
5. Manual: press Cmd+Q, press Escape — modal dismisses, app stays
</verification>

<success_criteria>
- Cmd+Q and window close button both trigger the quit confirmation modal
- Cancel keeps the app running, Quit closes it
- Confirm button reads "Quit" (not "Discard")
- No infinite loop (destroy() bypasses close-requested)
- Existing state save and server cleanup still work on quit
</success_criteria>

<output>
After completion, create `.planning/quick/260416-gma-add-quit-confirmation-modal-on-cmd-q/260416-gma-SUMMARY.md`
</output>
