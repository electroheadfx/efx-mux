---
status: resolved
trigger: "shift-enter-newline: Shift+Enter in Claude Code prompt should insert a newline, but instead it submits the prompt"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T02:30:00Z
---

## Current Focus

hypothesis: CONFIRMED. sessionName is undefined in the key handler when tabs are restored from disk (restoreTabs code path, line 613 terminal-tabs.tsx). Three createTerminal call sites in terminal-tabs.tsx omit sessionName: restoreTabs (line 613), restartTabSession (line 429), and potentially any other path. The createNewTab and initFirstTab paths correctly pass sessionName.
test: N/A — root cause confirmed by user logs ("sessionName is empty, cannot send sequence")
expecting: N/A
next_action: fix the three createTerminal call sites that omit sessionName, and verify the sequence being sent (\x1b[13;2u) is correct for Claude Code's parser

## Symptoms

expected: Shift+Enter inserts newline in Claude Code prompt (multi-line input)
actual: Shift+Enter submits the prompt (same as Enter)
errors: `/terminal-setup` says "Terminal setup cannot be run from tmux"
reproduction: Open Claude Code in efx-mux, type text, press Shift+Enter
started: Always been this way - Shift+Enter never worked in efx-mux

## Eliminated

- hypothesis: xterm.js Shift+Enter handler is not firing or not suppressing default \r
  evidence: xterm.js source confirms _keyDown returns false immediately when custom handler returns false (line 1025-1026 of CoreBrowserTerminal.ts). terminal.input() fires onData synchronously. The handler logic is architecturally correct.
  timestamp: 2026-04-14T00:02:00Z

- hypothesis: terminal.input('\x1b[13;2u', true) correctly routes the sequence to Claude Code
  evidence: tmux has extended-keys=off (confirmed via `tmux show-options -g extended-keys`). When the PTY writes \x1b[13;2u to the tmux client's stdin, tmux's key parser does not recognize CSI u sequences with extended-keys=off. The sequence is eaten/discarded. Claude Code never receives it.
  timestamp: 2026-04-14T00:02:00Z

- hypothesis: send_literal_sequence + \x1b[13;2u is the correct fix — tmux send-keys -l delivers the CSI u sequence and Claude Code recognizes it
  evidence: User confirms Shift+Enter no longer submits (send_literal_sequence is being called, \r is suppressed) but NO newline is inserted. Binary search of Claude Code binary: the string "13;2" does not appear anywhere. Claude Code's /terminal-setup writes \x1b\r (ESC+CR) for all non-native terminals (Alacritty, VS Code, Warp), not CSI u. CSI u (\x1b[13;2u) requires the kitty keyboard protocol handshake — the application writes \x1b[?u to query, terminal responds. efx-mux PTY never sends this activation sequence so Claude Code never enters kitty-input mode and silently ignores \x1b[13;2u. Confirmed by GitHub issues #11192 and #5757 on anthropics/claude-code where CSI u is inserted literally into input instead of being interpreted.
  timestamp: 2026-04-14T00:03:00Z

- hypothesis: \x1b\r (ESC+CR) is the correct sequence for Claude Code's shift+return detection
  evidence: User confirms \x1b\r ALSO does not insert a newline (checkpoint response). Investigation of Claude Code 2.1.98 binary (Bun-compiled) reveals Claude Code does NOT use Node.js readline's keypress parser — it uses its own custom Ink key parser. That parser has regexes: ES4=/^\x1b\[(\d+)(?:;(\d+))?u/ (kitty CSI u) and CS4=/^\x1b\[27;(\d+);(\d+)~/ (XTerm modified-other-key). Modifier decoding: Klq(H) = {shift:!!((H-1)&1), meta:!!((H-1)&2), ctrl:!!((H-1)&4)}. Keycode table: Tlq(13)="return". Claude Code's input handler checks X.shift (Ink key object), which comes from H.shift in QS4(). QS4 builds shift from keypress.shift. For \x1b\r: Bun readline produces {name:"return", meta:true, shift:false} — shift is NOT set. So \x1b\r produces key.meta=true, key.shift=false, and Claude Code's check `if(X.shift)` is false — no newline. The correct sequences that produce shift=true for return in Claude Code's OWN parser are: \x1b[13;2u (ES4 path: keycode=13, modifier=2 → shift=true) and \x1b[27;2;13~ (CS4 path: modifier=2, keycode=13 → shift=true). However these also FAILED. This means one of: (a) the invoke call silently fails (sessionName empty), (b) the Rust command executes but the session target is wrong, or (c) tmux send-keys -l does not deliver bytes to Claude Code's stdin as expected. The .catch(()=>{}) in terminal-manager.ts swallows all errors — we have no visibility into whether invoke even executes.
  timestamp: 2026-04-14T01:00:00Z

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  checked: src/terminal/terminal-manager.ts — createTerminal function and attachCustomKeyEventHandler block
  found: xterm.js Terminal is created with an existing `attachCustomKeyEventHandler` that handles macOS navigation shortcuts (Cmd+K, Cmd+Left/Right, Alt+Left/Right) and blocks app-claimed Ctrl+key combos. There is NO handler for Shift+Enter. By default xterm.js sends `\r` (carriage return) for Enter regardless of Shift modifier.
  implication: Shift+Enter reaches the PTY as plain `\r`, which tmux/Claude Code treats identically to Enter — causing prompt submission instead of newline insertion.

- timestamp: 2026-04-14T00:00:00Z
  checked: src/terminal/pty-bridge.ts — terminal.onData handler
  found: All terminal input goes through `terminal.onData` which forwards raw string data via `invoke('write_pty', { data, sessionName })`. The custom key handler is the correct interception point — returning `false` from it suppresses onData, and calling `terminal.write(...)` directly bypasses onData. So the fix must use the existing `attachCustomKeyEventHandler` to intercept Shift+Enter BEFORE it reaches onData, suppress the default `\r`, and explicitly write `\x1b[13;2u` to the PTY via `invoke('write_pty')`.
  implication: Fix belongs in terminal-manager.ts inside the existing `attachCustomKeyEventHandler`. Use `invoke('write_pty')` directly is not available here (no sessionName), so instead we need to use the correct xterm.js pattern — see below.

- timestamp: 2026-04-14T00:00:00Z
  checked: xterm.js attachCustomKeyEventHandler API behavior
  found: When the handler returns `false`, xterm.js suppresses the key event entirely — it does NOT call onData. When it returns `true`, normal processing proceeds (onData fires with the char). To send a custom sequence, we must call `terminal.write(seq)` then return `false`. But `terminal.write()` only writes to the terminal display buffer, not to the PTY. The actual PTY write happens in `onData`. So the correct approach is: return `false` to suppress the default `\r`, AND write the custom sequence via onData by triggering it — which is NOT possible from within the handler. The correct xterm.js API is: return `false` AND call `terminal.input('\x1b[13;2u')` (which fires onData with that string). `terminal.input()` is the method that programmatically fires onData.
  implication: Handler must call `terminal.input('\x1b[13;2u')` then return `false`.

- timestamp: 2026-04-14T00:02:00Z
  checked: tmux extended-keys setting and CSI u routing architecture
  found: `tmux show-options -g extended-keys` returns `extended-keys off`. The data path is: terminal.input() → onData → write_pty → PTY master → tmux CLIENT stdin (keyboard input). tmux's key parser does not recognize CSI u sequences when extended-keys=off. The sequence \x1b[13;2u is eaten by tmux and never forwarded to the pane (Claude Code). xterm.js CoreBrowserTerminal.ts line 1025-1026 confirms returning false from the custom handler does suppress the default \r — so after the previous fix, Shift+Enter sends \x1b[13;2u (eaten by tmux) and suppresses \r. Claude Code receives nothing. User reports "still submits" — likely the \r is not being suppressed (or the handler is not intercepting) and we need to verify more carefully, but the architectural path through write_pty is fundamentally broken.
  implication: The write_pty → PTY master path CANNOT deliver CSI u to Claude Code through tmux with extended-keys=off. Need an alternative path.

- timestamp: 2026-04-14T00:02:00Z
  checked: tmux send-keys -l behavior
  found: `tmux send-keys -l -t {session} {string}` sends LITERAL bytes directly to the pane's stdin, bypassing tmux's key parsing entirely. This is distinct from the keyboard-input path (PTY master → tmux client). With send-keys -l, the bytes go directly to the program running in the pane — Claude Code receives \x1b[13;2u from its stdin and interprets it as Shift+Enter (insert newline) regardless of tmux keyboard settings.
  implication: Fix requires a new Rust Tauri command that calls `tmux send-keys -l -t {session}` instead of writing through the PTY master. The session name must be passed into the key handler.

- timestamp: 2026-04-14T00:02:00Z
  checked: createTerminal call sites in terminal-tabs.tsx and main.tsx
  found: createTerminal(container, options) is called without sessionName. The sessionName is available at the call site (e.g., line 144 and 312 in terminal-tabs.tsx). TerminalOptions does not include sessionName. The key handler closure in terminal-manager.ts has no access to sessionName.
  implication: Must add sessionName parameter to createTerminal (or TerminalOptions) so the Shift+Enter handler can invoke the new send_literal_sequence command with the correct session target.

- timestamp: 2026-04-14T00:03:00Z
  checked: Claude Code binary (strings), GitHub issues #5757 #11192 #9321 #35692, /terminal-setup documentation, iTerm2+tmux gist
  found: The string "13;2" does not appear in the Claude Code binary. Claude Code's /terminal-setup writes \x1b\r (ESC+CR, i.e. \u001b\r) for all non-natively-supported terminals. CSI u (\x1b[13;2u) requires the kitty keyboard protocol handshake which efx-mux never initiates. Without negotiation, Claude Code ignores \x1b[13;2u entirely (GH #11192: it appears verbatim in input). \x1b\r is recognized unconditionally — it is the canonical ESC-prefix-meta interpretation where ESC before CR = "meta+return" = insert newline.
  implication: Change the sequence in terminal-manager.ts from '\x1b[13;2u' to '\x1b\r'. The Rust send_literal_sequence command and all wiring are correct — only the sequence value needs to change.

- timestamp: 2026-04-14T01:00:00Z
  checked: Claude Code 2.1.98 binary (Bun-compiled) — key parser internals via strings extraction
  found: Claude Code has its OWN custom Ink key parser separate from Node.js/Bun readline. It uses regexes ES4=/^\x1b\[(\d+)(?:;(\d+))?u/ (kitty CSI u) and CS4=/^\x1b\[27;(\d+);(\d+)~/ (XTerm modified-other-key). Modifier decoding function Klq(H): shift=!!((H-1)&1), meta=!!((H-1)&2), ctrl=!!((H-1)&4). Keycode map Tlq(13)="return". Claude Code checks X.shift (not X.meta) in `if(X.name==="return"){if(X.shift){...insert newline}}`. For \x1b\r: Bun readline produces {name:"return",meta:true,shift:false} — shift is false, handler does NOT trigger. For \x1b[13;2u (kitty): Claude Code's ES4 parser would produce {name:"return",shift:true} but this also failed. Both correct sequences (\x1b[13;2u and \x1b[27;2;13~) should work in Claude Code's parser — the failure is upstream. Also found: Claude Code has a configurable keybinding system with action "chat:newline" in the "Chat" context — this is configurable via ~/.claude/keybindings.json.
  implication: The sequence \x1b[13;2u IS the correct value for Claude Code's parser. The failure must be in the delivery chain: either (a) sessionName is empty so invoke() fails silently, (b) the Rust command runs but targets wrong tmux pane, or (c) the bytes are not reaching Claude Code's stdin. Must add diagnostic logging to verify invoke fires and sessionName is correct.

- timestamp: 2026-04-14T02:00:00Z
  checked: User DevTools console logs after diagnostic logging was added to terminal-manager.ts
  found: Log shows "[efxmux] Shift+Enter: sessionName= – undefined – sequence=\\x1b[13;2u" and "sessionName is empty, cannot send sequence". Rust logs show send_literal_sequence was never called. Confirmed sessionName is undefined in the key handler closure.
  implication: Root cause is missing sessionName in createTerminal call sites. Checked all four call sites: createNewTab (line 144) and initFirstTab (line 312) correctly pass sessionName; restoreTabs (line 613) and restartTabSession (line 429) did not pass sessionName; right-panel.tsx bash terminal (line 60) also did not pass sessionName. Fixed all three missing sites.

- timestamp: 2026-04-14T02:00:00Z
  checked: All createTerminal call sites in the codebase (grep across src/)
  found: Four call sites in terminal-tabs.tsx, one in right-panel.tsx. After fix: all five now pass sessionName. The sequence \x1b[13;2u remains unchanged — it is correct for Claude Code's ES4 kitty parser path; the prior failures were entirely due to the invoke never executing.
  implication: Fix is complete. Awaiting user verification that Shift+Enter now inserts a newline in Claude Code.

## Resolution

root_cause: sessionName was undefined in the attachCustomKeyEventHandler closure for terminals created via restoreTabs, restartTabSession, and the right-panel bash terminal. These three createTerminal call sites passed only theme options (themeOpts) without sessionName. The createNewTab and initFirstTab paths correctly passed sessionName. When the app restores tabs from persisted state on startup (the normal launch path), restoreTabs is called — so every terminal session after app restart had sessionName=undefined. The Shift+Enter handler logged the empty sessionName and bailed out, never calling invoke('send_literal_sequence').
fix: Added sessionName to all three missing createTerminal call sites. For restartTabSession, moved newSessionName computation above the createTerminal call so it is available to pass in. For restoreTabs, passed saved.sessionName. For right-panel bash terminal, passed the already-computed sessionName variable.
verification: User confirmed fix works end-to-end. Shift+Enter now inserts a newline in Claude Code prompt instead of submitting.
files_changed:
  - src-tauri/src/terminal/pty.rs
  - src-tauri/src/lib.rs
  - src/terminal/terminal-manager.ts
  - src/components/terminal-tabs.tsx
  - src/components/right-panel.tsx
