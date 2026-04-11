# Phase 4: Session Persistence - Discussion Log (Discuss Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-07
**Phase:** 04-session-persistence
**Mode:** discuss
**Areas analyzed:** State scope, Session reattach strategy, Dead session recovery, state.json schema, Corrupt/missing state handling

## Areas Discussed

### State scope
| Gray Area | User Decision | Rationale |
|-----------|---------------|-----------|
| What to persist | Layout + sidebar + theme + panel tabs + project | Phase 4 scope covers what exists today. Panel tabs and active project are pre-provisioned even though their UI doesn't exist yet (Phase 5/6). |

### Session reattach strategy
| Gray Area | User Decision | Rationale |
|-----------|---------------|-----------|
| How to reattach tmux sessions | Simple re-spawn | PtyState is recreated on restart. JS calls spawn_terminal with same session name. tmux -A attaches if session exists. Flow control counters reset fresh. Simplest approach. |

### Dead session recovery
| Gray Area | User Decision | Rationale |
|-----------|---------------|-----------|
| How to handle dead sessions | Warning + fresh session | Automatic non-blocking recovery. User sees fresh session; can debug daemon separately. No modal dialog. |

### state.json schema
| Gray Area | User Decision | Rationale |
|-----------|---------------|-----------|
| Schema structure | Flat key-value map | Easy to read, easy to extend. Version field allows future migrations. Follows theme.json pattern from Phase 3. |

### Corrupt/missing state handling
| Gray Area | User Decision | Rationale |
|-----------|---------------|-----------|
| Corrupt/missing state.json | Warning + defaults | If state.json is missing/corrupt, log warning and start with defaults. App works normally, no crash. |

## Corrections Made

No corrections — all assumptions confirmed.

---

*Phase: 04-session-persistence*
*Discussion: 2026-04-07*
