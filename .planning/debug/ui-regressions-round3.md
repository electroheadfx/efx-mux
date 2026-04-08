---
status: awaiting_human_verify
trigger: "4 UI issues: terminal scroll, tab styling, pane padding, project cd"
created: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Focus

hypothesis: 4 confirmed issues with known root causes - implementing fixes
test: Apply all 4 fixes and verify
expecting: All 4 issues resolved
next_action: Implement Issue 1 fix (PageUp/PageDown interception in terminal-manager.ts)

## Symptoms

expected: 1) Mouse wheel + PageUp/Down scroll terminal scrollback 2) macOS-style pill tabs 3) Inner padding on all panes 4) Terminals cd to project directory
actual: 1) Scroll goes to CLI history 2) Flat basic tabs 3) No padding 4) Terminals stay in ~
errors: No error messages - UI/UX regressions
reproduction: Launch app and observe
started: Issues 1,3 after Phase 6.1 migration. Issue 4 missing feature.

## Eliminated

(none)

## Evidence

- timestamp: 2026-04-08
  checked: terminal-manager.ts
  found: Has wheel handler (line 91-95) but NO PageUp/PageDown interception in key handler (line 44-80)
  implication: PageUp/Down keys are sent to tmux as-is, causing CLI history navigation

- timestamp: 2026-04-08
  checked: tab-bar.tsx
  found: Uses rounded-t with border-bottom styling, flat appearance
  implication: Needs pill-shaped macOS-style tabs

- timestamp: 2026-04-08
  checked: app.css + right-panel.tsx
  found: .right-top-content and .right-bottom-content have no padding. Terminal area has p-1 inline.
  implication: Right panel content areas need padding for non-terminal viewers

- timestamp: 2026-04-08
  checked: main.tsx + pty-bridge.ts + pty.rs
  found: spawn_terminal creates tmux sessions without -c (working directory). No cd command sent after connect.
  implication: Need to send cd command after PTY connection and on project switch

## Resolution

root_cause: 4 separate issues - see Evidence
fix: 1) Added PageUp/PageDown interception in terminal key handler 2) Changed tabs to pill-shaped rounded-full style 3) Added padding:4px to right panel content areas 4) Added cd to project dir after PTY connect + on project switch for both terminals
verification: TypeScript compiles (exit 0), Vite build succeeds
files_changed: [src/terminal/terminal-manager.ts, src/components/tab-bar.tsx, src/styles/app.css, src/main.tsx, src/components/right-panel.tsx]
