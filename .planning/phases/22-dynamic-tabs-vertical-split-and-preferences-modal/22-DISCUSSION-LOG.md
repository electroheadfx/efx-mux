# Phase 22: Dynamic tabs, vertical split, and preferences modal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 22-dynamic-tabs-vertical-split-and-preferences-modal
**Areas discussed:** Sticky→dynamic + defaults, Vertical split model, Cross-split tab drag, Preferences titlebar UX

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky→dynamic + defaults | GSD + Git Changes become dynamic; first-launch state; empty scopes; singleton vs multi-instance; migration | ✓ |
| Vertical split model | Max splits, split icon placement, resize, scope naming | ✓ |
| Cross-split tab drag | Which types, PTY rename policy, singleton move, drop affordance | ✓ |
| Preferences titlebar UX | Button location, panel style, icon + keybind | ✓ |

**User's choice:** All four areas.

---

## Sticky→Dynamic + Defaults

### First launch default
| Option | Description | Selected |
|--------|-------------|----------|
| Empty both scopes | Main + right both start empty | |
| Main: Terminal-1, right: empty | Main auto-spawns Terminal-1, right empty | |
| Main: Term-1, right: GSD+FT | Main Terminal-1; right GSD + File Tree as dynamic tabs | ✓ |

### Empty scope allowed
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — empty allowed | Placeholder shown; user adds via + | ✓ |
| No — protect last tab | Close-X disabled on last tab | |

### GSD / Git Changes multiplicity
| Option | Description | Selected |
|--------|-------------|----------|
| Singleton global | One GSD + one Git Changes alive anywhere; + dims item when active | ✓ |
| Multi-instance | User can open N GSD tabs, N Git Changes | |
| Singleton per scope | One per scope | |

### Migration of sticky IDs
| Option | Description | Selected |
|--------|-------------|----------|
| Drop silently | Strip sticky IDs on load; first-launch default re-creates equivalent dynamic tabs | ✓ |
| Convert to dynamic | Upgrade reads sticky IDs and creates equivalent dynamic tabs | |

**Notes:** The "drop silently" option combined with the first-launch default (main Term-1, right GSD+FT) effectively gives existing users the same visual layout after upgrade without explicit conversion logic.

---

## Vertical Split Model

### Split count cap
| Option | Description | Selected |
|--------|-------------|----------|
| 2 (binary) | Zone = 1 or 2 panes | |
| N (unlimited) | Stack of N sub-panes | |
| 3 max | Cap at 3 sub-panes per zone | ✓ |

### Split trigger location
| Option | Description | Selected |
|--------|-------------|----------|
| Tab bar, right of + | New `[⬌]` icon button next to `+` menu | ✓ |
| In + menu | 'Split Below' entry inside + dropdown | |
| Tab context menu | Right-click tab → 'Move to split below' | |

### Resize between sub-panes
| Option | Description | Selected |
|--------|-------------|----------|
| Drag handle, persist | Horizontal drag-handle; ratio saved to state.layout | ✓ |
| Even, non-resize | 50/50 fixed split | |
| Drag, not persist | Handle works but resets each session | |

### Scope identifier scheme
| Option | Description | Selected |
|--------|-------------|----------|
| Hierarchical strings | 'main-0', 'main-1', 'right-0' — extends Phase 20 linearly | ✓ |
| UUID per scope | Stable random IDs | |
| Nested objects | AppState.layout.main = { splits: [...] } | |

**Notes:** User chose the option with minimal refactor surface relative to Phase 20's existing `TerminalScope = 'main' | 'right'` union. Preview ASCII schemas were presented and approved as-designed.

---

## Cross-Split Tab Drag

### Draggable tab types
| Option | Description | Selected |
|--------|-------------|----------|
| All types | Terminal, agent, editor, GSD, Git Changes all draggable anywhere | ✓ |
| All except sticky-ish | GSD + Git Changes move via singleton handoff not drag | |
| Editor + Terminal only | Agent/GSD/GitCh fixed to origin | |

### PTY rename on scope move
| Option | Description | Selected |
|--------|-------------|----------|
| Keep name, update ownership | No tmux rename; only ownerScope metadata changes | ✓ |
| Rename to match target | '<proj>-1' → '<proj>-r1-1'; tmux rename-session called | |
| Globally unique IDs | UUID session names; scope-in-name convention dropped | |

**Notes:** User accepted the risk of potential name collision when a target scope already owns a session with the same name — planner to add collision-avoidance (UUID under the hood or rename-on-collision policy) as implementation detail.

### Singleton (GSD / Git Changes) move
| Option | Description | Selected |
|--------|-------------|----------|
| Move (extend Phase 20 handoff) | Tab relocates; ownerScope updated; + menu in source re-enables | ✓ |
| Block + show toast | Reject drop; force close-first | |

### Drop affordance
| Option | Description | Selected |
|--------|-------------|----------|
| Highlight target tab bar | Accent border + insertion-slot line | ✓ |
| Highlight whole pane | Target pane body overlay | |
| Both (bar + pane) | Border + tint | |

---

## Preferences Titlebar UX

### Button location
| Option | Description | Selected |
|--------|-------------|----------|
| HTML in titlebar overlay | Div with `-webkit-app-region: no-drag` right side of titleBarStyle:Overlay zone | ✓ |
| Native NSToolbar item | Native Obj-C toolbar via tauri | |
| Already in native menu only | No visible button — keep current menu path only | |

**Notes:** User pointed out the existing left-side `[+]` button (`.titlebar-add-btn` in `src/main.tsx:92` + `app.css:444`) as the visual + CSS template to mirror.

### Panel style
| Option | Description | Selected |
|--------|-------------|----------|
| Keep slide-in | Reuse existing preferences-panel.tsx | ✓ |
| Modal (centered) | Redesign to centered overlay with backdrop | |

### Icon + keybind
| Option | Description | Selected |
|--------|-------------|----------|
| ⚙ Settings icon, keep Cmd+, | Lucide Settings gear; existing keybind + native menu | ✓ |
| Cog2 icon, keep Cmd+, | Lucide Cog2 | |
| ⚙ + rewire keybind to JS | Intercept Cmd+, in keyboard-handler.ts; remove native menu path | |

---

## Claude's Discretion

Areas where the user explicitly deferred to Claude (planner):
- Exact Lucide icon names (Settings vs Cog2, SplitSquareVertical vs Rows2)
- Empty-scope placeholder content
- UUID length/format for PTY collision avoidance
- Split-icon button size/spacing
- Intra-zone resize handle module structure
- Split add/remove animation
- Split body mounting strategy (always-mount with display toggle vs mount-on-activate)
- File Tree availability in main scope + menu
- Test split between unit and component render tests

## Deferred Ideas

Ideas mentioned during discussion that were noted for future phases:
- True multi-window support (out of scope per PROJECT.md)
- Centered modal redesign for preferences
- Keyboard shortcuts for split creation / nav (Cmd+\, Cmd+Shift+Arrow)
- Tab-bar overflow UI for many tabs or narrow splits
- N-unlimited splits (chose 3-max)
- GSD / Git Changes multi-instance (chose singleton)
- Horizontal in-zone splits (left/right within a zone)
- Tab-drag into titlebar to spawn new window
