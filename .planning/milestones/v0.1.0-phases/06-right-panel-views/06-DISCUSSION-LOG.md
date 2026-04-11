# Phase 6: Right Panel Views - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-07
**Phase:** 06-right-panel-views
**Mode:** assumptions
**Areas analyzed:** GSD Viewer Architecture, File Watcher, Diff Viewer, Bash Terminal, File Tree Architecture

## Assumptions Presented

### GSD Viewer Architecture
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| GSD Viewer reads PLAN.md via read_file Tauri command, renders with marked.js, checkbox write-back via write_checkbox command | Likely | git_status.rs pattern; marked checkbox override documented in CLAUDE.md |
| checkbox renderer emits data-line attribute for write-back | Confirmed HIGH via research | marked.js v14 checkbox({checked}) has no line number; D-01 updated to use listitem post-processing |

### File Watcher Implementation (PANEL-03)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Reuse theme/watcher.rs pattern (notify-debouncer-mini, 200ms, background thread, Tauri event) | Confident | watcher.rs lines 26-94, Cargo.toml notify deps confirmed |
| Frontend listens for file-changed event and re-renders | Confident | Established CustomEvent pattern from Phase 5 |

### Diff Viewer (PANEL-04)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| git2 Patch::to_buf() for unified diff string | Confirmed HIGH via research | docs.rs git2 confirmed no built-in formatter; Patch::to_buf() is cleanest API |
| CSS-only syntax highlighting (green/red backgrounds) | Confident | No highlight library in package.json; CSS approach sufficient |

### Bash Terminal = Second xterm.js (PANEL-07)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| HashMap<String, PtyState> wrapper for multiple PTY | Confirmed HIGH via research | Tauri 2 app.manage() same-type requires HashMap wrapper |
| right-tmux-session already in state.rs SessionState | Confident | state.rs line 89 confirmed |

### File Tree Architecture (PANEL-05, PANEL-06)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| list_directory + read_file_content Rust commands via spawn_blocking | Confident | git_status.rs establishes the pattern |
| Arrow.js keyboard navigation mirroring fuzzy-search.js | Confident | fuzzy-search.js lines 88-95 confirmed |

## Corrections Made

No corrections — all assumptions confirmed or research resolved ambiguities.

## Auto-Resolved

- **marked.js checkbox line number**: Auto-resolved D-01 to use listitem post-processing approach (checkbox token has no line number in v14). Recommended approach: checkbox renderer emits data-line via listitem post-processing or second render pass.
- **git2 unified diff**: Auto-resolved to Patch::to_buf() approach.
- **Tauri 2 multi-PTY**: Auto-resolved to HashMap<String, PtyState> pattern.

## External Research

- **marked.js checkbox renderer v14**: Found that checkbox({checked}) returns bare HTML only; no line number. Write-back requires tracking line numbers via listitem post-processing. (Source: markedjs/github discussions)
- **git2 Diff API**: Confirmed Patch::to_buf() is the cleanest way to get unified diff string. (Source: docs.rs/git2)
- **Tauri 2 multi-PTY**: Confirmed HashMap wrapper needed for same-type state. (Source: v2.tauri.app/develop/state-management)
