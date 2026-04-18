# Phase 20: Right Panel Multi-Terminal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 20-right-panel-multi-terminal
**Areas discussed:** Module architecture, Tab bar UX + plus-menu types, Session naming + persistence, Edge behavior, Layout pivot (Option B)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Module architecture (share vs duplicate) | Refactor terminal-tabs.tsx instance-based or duplicate | ✓ |
| Tab bar UX + plus-menu types | UnifiedTabBar reuse vs new bar; plus menu contents | ✓ |
| Session naming + persistence scheme | Avoid collision with main panel | ✓ |
| Edge behavior (close-last, agent fallback, crash) | Policies on degenerate states | ✓ |

---

## Module Architecture

### How should terminal-tabs infrastructure be shared?

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor to instance-based module | Convert to scope-parametrized; one bug fix covers both panels | ✓ |
| Duplicate as right-terminal-tabs.tsx | Copy+rename; zero risk to main panel; drift risk | |
| Parametric factory (createTerminalTabsModule) | Cleanest theoretically; big call-site migration | |

**Notes:** User accepted the recommended instance-based refactor.

### How should the instance scope be identified?

| Option | Description | Selected |
|--------|-------------|----------|
| String identifier: `'main' \| 'right'` | Extensible to future scopes; readable | ✓ |
| Boolean `isRight` flag | Simpler binary; harder to extend | |
| Per-scope module export | Two bundles explicit at call sites | |

### How should existing main-panel callers migrate?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep top-level exports backed by `'main'` scope | Minimal diff to Phase 17 code | ✓ |
| Break and rename all main-panel call sites | Uniform API; touches many files | |

### Should the fit/PTY/resize/crash-listener pipeline be shared across scopes?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared pipeline, scope-parametrized | createTerminal + connectPty + resize + pty-exited listener all reused | ✓ |
| Right panel minimal — skip features | Inconsistent behavior across panels | |

---

## Tab Bar UX + Plus Menu (first round — pre-pivot)

### Which tab bar renders above the right-panel bottom pane?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse UnifiedTabBar, scope-parametrized | Drag-reorder, rename, close, + dropdown all free | ✓ |
| New lighter RightTabBar | Smaller blast radius; divergent visuals | |
| Extend simple TabBar with trailing + slot | Lean but loses reorder/rename | |

### What appears in the right-panel plus dropdown? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal (Zsh) | Plain shell tab | ✓ |
| Agent | Project's configured agent binary | ✓ |
| Git Changes | Available in both panels with shared ownership | ✓ (context-dependent — see pivot) |
| Diff / File preview | Not built; deferred | ✗ (deferred) |

**Notes:** User later confirmed "Diff / File preview" should be deferred to a future phase. Git Changes confirmed with shared-tab behavior (moves focus between panels).

### Right-panel tab features parity with main panel? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Close button (×) per tab | Required | ✓ |
| Rename on double-click | Matches main panel | ✓ |
| Drag-to-reorder | Free with UnifiedTabBar | ✓ |
| Horizontal scroll + wheel scroll | Free with UnifiedTabBar | ✓ |

---

## Layout Pivot — Option B

Mid-discussion, the user reframed the phase. After reviewing an ASCII schema showing three possible layouts (A: remove bottom pane entirely; B: multi-terminal in right-panel tab bar alongside File Tree/GSD; C: keep split, upgrade bottom to multi-tab), the user chose **Option B**.

**User's framing:** "Multi-terminal lives only in main panel's [tab bar] -> in main tab AND in right sidebar."

**Interpretation:** Terminal/Agent tabs appear in BOTH the main-panel tab bar (Phase 17, already built) AND the right-panel tab bar (new). No dedicated bottom Bash pane; no horizontal split.

### Option B layout confirmation

```
[File Tree | GSD | Term A | Agent B | +▾]
```

Right-panel becomes a single full-height pane hosting one unified tab bar.

---

## Tab Bar Composition (Option B)

### How should File Tree and GSD appear in the unified right-panel tab bar?

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky, uncloseable, always leftmost | Pane never degenerates to blank | ✓ |
| Closeable; re-openable from plus menu | Matches main-panel flexibility; allows blank pane | |
| Sticky but reorderable | Drag but no close | |

### Right-panel plus menu contents? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal (Zsh) | Plain shell | ✓ |
| Agent | Configured agent binary | ✓ |
| Git Changes | Shared-tab with main panel (moves focus) | ✓ |

### Mount strategy for non-terminal tab bodies?

| Option | Description | Selected |
|--------|-------------|----------|
| Always mounted, `display: none` when inactive | Preserves scroll, parse cache, xterm state | ✓ |
| Lazy-mount on first activation | First-switch latency trade | |
| Unmount on blur | Breaks xterm; inconsistent | |

---

## Initial State & Default Tab

### Initial right-panel state on a brand-new project?

| Option | Description | Selected |
|--------|-------------|----------|
| File Tree + GSD only, no terminals | Cleanest start; no preemptive bash | ✓ |
| File Tree + GSD + one Terminal | Pre-spawn shell; redundant with main panel | |
| File Tree + GSD + one Agent | Auto-spawn if agent configured; too magical | |

### Right-panel default active tab on app startup?

| Option | Description | Selected |
|--------|-------------|----------|
| Restore last-active tab per project | Matches editor-tab restore pattern | ✓ |
| Always File Tree on startup | Predictable; loses workflow context | |
| Always GSD on startup | Matches "where am I" framing; loses tab context | |

---

## Session Naming & Persistence

### Session naming scheme for right-panel terminal tabs?

| Option | Description | Selected |
|--------|-------------|----------|
| Suffix `-right-<N>` | Clear prefix; longer | |
| Suffix `-r<N>` | Compact; less `tmux ls` noise | ✓ |
| Scope-prefixed `right-<project>-<N>` | Inverts standard ordering | |

### Persistence key for right-panel tabs?

| Option | Description | Selected |
|--------|-------------|----------|
| `right-terminal-tabs:<project>` | Separate key, no migration conflict | ✓ |
| Extend existing key with scope subfield | Unified but requires migration | |

---

## Migration

### Legacy `-right` bash session + old state keys?

| Option | Description | Selected |
|--------|-------------|----------|
| Kill old `-right` session + drop old state keys | Clean start; no stale clutter | ✓ |
| Adopt old `-right` as `-r1` | Preserves scrollback; complex rename flow | |
| Leave orphaned; ignore old keys | Zero code; invisible clutter | |

---

## Edge Behavior

### Crash overlay + restart for right-panel terminal tabs?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse CrashOverlay + restart flow | Scope-agnostic helper; free with refactor | ✓ |
| Silent exit — just mark tab and let user close | Inconsistent with main panel | |

### Right-panel tab bar features parity (Option B)? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Close × on terminal tabs only (not File Tree/GSD) | Sticky tabs decision implies this | ✓ |
| Double-click rename for terminal tabs only | File Tree/GSD labels are fixed | ✓ |
| Drag-reorder within terminal-tab section only | Sticky tabs pinned to leftmost | ✓ |
| Agent-quit confirm modal on close | Same pattern as main-panel | ✓ |

---

## Claude's Discretion

- Exact API shape of the scope parametrization in `terminal-tabs.tsx`.
- Placement of sticky-tab rendering logic inside `UnifiedTabBar`.
- Icon choices for sticky File Tree and GSD tabs (Lucide).
- Visual divider between sticky and dynamic tab segments.
- Tab-bar layout transition animation on add/remove.
- Test coverage split (unit vs component render).
- Restart-session suffix collision avoidance (`-rr<N>` candidate).

## Deferred Ideas

- Diff / File preview as a tab type (no component exists).
- File Tree / GSD also openable as main-panel tabs.
- Per-scope keyboard shortcuts.
- Split-pane right panel (third scope `'right-bottom'` if requested later).
- Per-tab theme override.
- Legacy `-right` session adoption (preserve scrollback on upgrade) — rejected in favor of clean kill.
