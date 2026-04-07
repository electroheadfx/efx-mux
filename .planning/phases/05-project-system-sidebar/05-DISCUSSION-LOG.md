# Phase 5: Project System + Sidebar - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 05-project-system-sidebar
**Mode:** auto (all decisions auto-selected)
**Areas discussed:** Project data model, Project registration, Sidebar layout, Git status integration, Project switching, Fuzzy search

---

## Project Data Model

| Option | Description | Selected |
|--------|-------------|----------|
| Extend state.json | Add `projects` array alongside existing fields | ✓ |
| Separate projects.json | Dedicated file for project registry | |
| SQLite database | Structured storage for projects | |

**User's choice:** Extend state.json (auto-selected: consistent with Phase 4 persistence layer)
**Notes:** ProjectState struct already exists with `active` field — natural extension point.

---

## Project Registration

| Option | Description | Selected |
|--------|-------------|----------|
| Modal dialog from sidebar | "+" button opens form with directory picker | ✓ |
| CLI-only registration | Terminal command to add projects | |
| Config file editing | Manual JSON editing | |

**User's choice:** Modal dialog (auto-selected: discoverable, satisfies UX-04 partially)

---

## Sidebar Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Two sections: projects + git | Scrollable project list on top, collapsible git changes below | ✓ |
| Single unified list | Projects with inline git info | |
| Tabbed sidebar | Switch between Projects and Git views | |

**User's choice:** Two sections (auto-selected: cleanest separation of concerns)

---

## Git Status Integration

| Option | Description | Selected |
|--------|-------------|----------|
| git2 crate via spawn_blocking | Native Rust, no shell-out, event-driven refresh | ✓ |
| Shell-out to git CLI | Simpler but against SIDE-01 spec | |

**User's choice:** git2 via spawn_blocking (auto-selected: per SIDE-01 requirement)

---

## Project Switching

| Option | Description | Selected |
|--------|-------------|----------|
| cd in existing tmux session | Keep terminal history, just change directory | ✓ |
| Kill and recreate session | Clean slate per project | |
| New tmux window per project | Keep all sessions alive | |

**User's choice:** cd in existing session (auto-selected: fastest, preserves history)

---

## Fuzzy Search (Ctrl+P)

| Option | Description | Selected |
|--------|-------------|----------|
| Plain JS overlay modal | No library, simple substring/fuzzy match | ✓ |
| External fuzzy library (fuse.js) | Better scoring but added dependency | |
| Command palette (VS Code style) | Full command system, overkill for project switching | |

**User's choice:** Plain JS overlay (auto-selected: lightweight for small project counts)

---

## Claude's Discretion

- Modal styling and animation
- Sidebar section heights and spacing
- Git badge icon choices
- Fuzzy search scoring algorithm
- Error toast styling

## Deferred Ideas

- Diff viewer rendering (Phase 6)
- Project-specific agent launching (Phase 7)
- Full first-run wizard (spans multiple phases)
