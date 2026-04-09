# Phase 8: Keyboard + Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 08-keyboard-polish
**Areas discussed:** Shortcut conflicts, Tab management, PTY crash recovery, First-run wizard

---

## Shortcut Conflicts

| Option | Description | Selected |
|--------|-------------|----------|
| Capture-before-terminal | Same pattern as Ctrl+S: capture:true keydown handler fires before xterm.js | ✓ |
| Focus-aware routing | When terminal focused, Ctrl+T/W go to terminal. Requires focus tracking | |
| Modifier prefix | Use Cmd+T/W/Tab instead of Ctrl. macOS-native feel | |

**User's choice:** Capture-before-terminal
**Notes:** Consistent with existing Ctrl+S pattern already proven in Phase 7.

### Terminal passthrough

| Option | Description | Selected |
|--------|-------------|----------|
| Standard set only | Ctrl+C/D/Z/L/R pass through. Everything else fair game | ✓ |
| All Ctrl+letter except defined | Default all to terminal, only capture defined shortcuts | |
| You decide | Claude picks passthrough set | |

**User's choice:** Standard set only

### Cheatsheet

| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+? opens overlay | Quick shortcut reference overlay, dismisses on key/click | ✓ |
| No cheatsheet | Learned from docs/wizard only | |
| Tooltip hints on hover | Shortcut shown in button tooltips | |

**User's choice:** Ctrl+? opens overlay

---

## Tab Management

### What Ctrl+T creates

| Option | Description | Selected |
|--------|-------------|----------|
| New terminal session | Opens new terminal tab in main panel, own tmux session | ✓ |
| New panel view tab | Adds view tab to right panel | |
| Context-dependent | Terminal in main, view in right panel | |

**User's choice:** New terminal session

### Tab bar location

| Option | Description | Selected |
|--------|-------------|----------|
| Top of main terminal area | Tab bar above terminal, iTerm2 style | ✓ |
| Inside sidebar | Sessions listed in sidebar under project | |
| Bottom strip | Thin strip below terminal, tmux-status-line style | |

**User's choice:** Top of main terminal area

### Closing last tab

| Option | Description | Selected |
|--------|-------------|----------|
| Closes tab, creates fresh default | Auto-opens new default session. Always at least one terminal | ✓ |
| Prevents closing last tab | No-op with visual feedback | |
| Closes tab, shows empty state | Empty state with Ctrl+T prompt | |

**User's choice:** Closes tab, creates fresh default

---

## PTY Crash Recovery

### Exit detection

| Option | Description | Selected |
|--------|-------------|----------|
| Exit code based | Code 0 = normal, non-zero = crash. Different banner styling | ✓ |
| All exits same banner | No distinction, same restart option | |
| Normal exit auto-replaces | Code 0 auto-opens bash, only non-zero shows banner | |

**User's choice:** Exit code based

### Banner design

| Option | Description | Selected |
|--------|-------------|----------|
| Inline overlay on terminal | Centered overlay, terminal dimmed behind. Terminal-first aesthetic | ✓ |
| Replace terminal content | Full replacement card, scrollback gone | |
| Bottom toast notification | Small toast at bottom, non-intrusive | |

**User's choice:** Inline overlay on terminal

---

## First-Run Wizard

### Wizard format

| Option | Description | Selected |
|--------|-------------|----------|
| Modal wizard | Focused modal on first launch, 2-3 steps max | ✓ |
| Full-screen onboarding | Guided flow replaces entire app | |
| Inline prompts | No wizard, learn by doing with empty state hints | |

**User's choice:** Modal wizard

### Wizard data collected

| Option | Description | Selected |
|--------|-------------|----------|
| Just project + agent | Minimal: dir, name, agent choice | |
| Project + agent + theme import | Also offer iTerm2/Ghostty theme import | |
| Project + agent + server + GSD file | Full config: all fields | |

**User's choice:** Project + agent + theme import + server + GSD file (custom: full wizard with all fields)

### Skippability

| Option | Description | Selected |
|--------|-------------|----------|
| Skippable with defaults | Each step has Skip button, sensible defaults | ✓ |
| Required first time | Must complete all steps | |
| Skip entire wizard | Skip link at start, open with empty state | |

**User's choice:** Skippable with defaults

---

## Claude's Discretion

- Shortcut cheatsheet visual design and layout
- Tab bar styling
- Crash overlay dimming opacity and animation
- Wizard step transitions and progress indicator
- Default session naming convention for new tabs
- Exact passthrough key detection implementation

## Deferred Ideas

None -- discussion stayed within phase scope
