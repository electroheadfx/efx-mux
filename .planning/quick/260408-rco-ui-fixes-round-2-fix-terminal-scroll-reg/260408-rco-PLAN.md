---
type: quick
description: "UI fixes round 2: terminal mouse scroll regression, white flash on startup, bash terminal theme mismatch"
files_modified:
  - src/terminal/terminal-manager.ts
  - index.html
  - src/components/right-panel.tsx
  - src/theme/theme-manager.ts
---

<objective>
Fix three UI regressions/issues in a single pass:
1. Mouse wheel scrolls CLI history (arrow keys) instead of scrollback buffer in tmux terminals
2. White flash on startup before Vite loads CSS
3. Right-bottom Bash terminal missing theme colors and font from theme-manager

Purpose: Polish the terminal experience -- scrolling, theming, and startup appearance.
Output: Four modified files, all three issues resolved.
</objective>

<context>
@src/terminal/terminal-manager.ts
@src/theme/theme-manager.ts
@src/components/right-panel.tsx
@index.html
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix terminal mouse scroll regression and white flash</name>
  <files>src/terminal/terminal-manager.ts, index.html</files>
  <action>
**terminal-manager.ts -- Fix mouse wheel scroll in tmux:**

After `terminal.open(container)` (after line 86) and before the WebGL setup, attach a custom wheel event handler that intercepts scroll events and scrolls the xterm viewport directly instead of letting xterm.js convert wheel events to arrow key sequences (which is what happens when tmux puts the terminal in alternate screen buffer mode).

Add this after line 86 (`terminal.open(container);`):

```typescript
// Fix: tmux uses alternate screen buffer, causing xterm.js to convert wheel
// events to arrow key sequences. Intercept wheel events and scroll the
// xterm viewport (scrollback buffer) directly instead.
terminal.attachCustomWheelEventHandler((ev: WheelEvent): boolean => {
  const lines = Math.round(ev.deltaY / 25) || (ev.deltaY > 0 ? 1 : -1);
  terminal.scrollLines(lines);
  return false; // Prevent xterm.js default handling (arrow keys to tmux)
});
```

Return `false` from the handler to prevent xterm.js from processing the wheel event (which would send arrow keys to the alternate screen app / tmux).

**index.html -- Fix white flash on startup:**

Add inline style to the `<body>` tag to set the dark background before any CSS loads:

```html
<body style="background-color: #282d3a; color: #92a0a0;">
```

This matches the Solarized Dark theme bg and text colors used throughout the app.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
  - terminal-manager.ts has `attachCustomWheelEventHandler` that calls `scrollLines()` and returns false
  - index.html body tag has inline style with background-color #282d3a
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix Bash terminal theme mismatch and enable hot-reload</name>
  <files>src/theme/theme-manager.ts, src/components/right-panel.tsx</files>
  <action>
**theme-manager.ts -- Add getTheme() export:**

Add a new public function after `getTerminalTheme()` (after line 110):

```typescript
/**
 * Get the full cached theme data (terminal + chrome).
 * Used by components that need both terminal colors and chrome font/fontSize.
 */
export function getTheme(): ThemeData | null {
  return currentTheme;
}
```

**right-panel.tsx -- Use theme and register terminal for hot-reload:**

1. Add imports at top (update the existing import block or add new):
   ```typescript
   import { getTheme, registerTerminal } from '../theme/theme-manager';
   ```

2. In the `connectBashTerminal()` async function, replace lines 52-54:
   ```typescript
   const { terminal, fitAddon } = createTerminal(container, {
     fontSize: 13,
   });
   ```
   With:
   ```typescript
   const theme = getTheme();
   const { terminal, fitAddon } = createTerminal(container, {
     theme: theme?.terminal,
     font: theme?.chrome?.font,
     fontSize: theme?.chrome?.fontSize || 13,
   });
   registerTerminal(terminal, fitAddon);
   ```

This ensures the Bash terminal gets the same Solarized Dark colors, FiraCode font, and font size as the main terminal. The `registerTerminal` call enables hot-reload theme updates when the user toggles dark/light mode or the theme file changes.

Note: `getTheme()` will return non-null because `initTheme()` runs in main.tsx during `requestAnimationFrame`, and the bash terminal connects after a 200ms `setTimeout`, so the theme is already loaded.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
  - theme-manager.ts exports `getTheme()` returning full ThemeData
  - right-panel.tsx imports getTheme and registerTerminal from theme-manager
  - Bash terminal createTerminal call passes theme.terminal, chrome.font, chrome.fontSize
  - Bash terminal is registered for hot-reload via registerTerminal()
  - TypeScript compiles without errors
  </done>
</task>

<task type="checkpoint:human-verify" gate="non-blocking">
  <what-built>Three UI fixes: terminal scroll, white flash, bash theme</what-built>
  <how-to-verify>
    1. Launch the app. Verify NO white flash -- background should be dark (#282d3a) immediately
    2. In the main terminal (left panel), use mouse wheel to scroll. Verify it scrolls the scrollback buffer (not sending up/down arrow keys to tmux/shell)
    3. Click the "Bash" tab in the right-bottom panel. Verify the Bash terminal has the same dark background, text color, and font as the main terminal (not default xterm white/black)
    4. If theme hot-reload is testable (Ctrl+Shift+T toggle), verify both terminals update together
  </how-to-verify>
  <resume-signal>Type "approved" or describe any remaining issues</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Visual verification of all three fixes in the running app
</verification>

<success_criteria>
- Mouse wheel scrolls terminal scrollback buffer, not CLI history
- App startup shows dark background immediately (no white flash)
- Bash terminal in right panel matches main terminal theme (colors, font, size)
- Bash terminal receives hot-reload theme updates
</success_criteria>
