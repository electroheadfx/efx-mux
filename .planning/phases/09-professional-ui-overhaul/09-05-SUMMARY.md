---
phase: 09-professional-ui-overhaul
plan: 05
title: "Agent Header Card and GSD Viewer Design Update"
subsystem: ui-components
tags: [agent-header, version-detection, status-pill, gsd-viewer, design-tokens]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [agent-header-component, get-agent-version-command]
  affects: [main-panel, gsd-viewer, pty-commands]
tech_stack:
  added: []
  patterns: [signal-derived-state, whitelist-validation, tauri-command]
key_files:
  created:
    - src/components/agent-header.tsx
  modified:
    - src/components/main-panel.tsx
    - src-tauri/src/terminal/pty.rs
    - src-tauri/src/lib.rs
    - src/styles/app.css
decisions:
  - "Agent name whitelist validation (claude, opencode) prevents arbitrary command execution"
  - "Agent icon uses gradient purple/indigo background with single-letter identifier"
  - "Status pill derives running state from exitCode === undefined on active tab"
metrics:
  duration: "3min"
  completed: "2026-04-10"
---

# Phase 09 Plan 05: Agent Header Card and GSD Viewer Design Update Summary

Agent header card with version detection, gradient icon, and reactive status pill rendered above terminal tabs; GSD viewer headings and code blocks updated to use Geist font families.

## Task Completion

| # | Task | Status | Commit | Key Changes |
|---|------|--------|--------|-------------|
| 1 | Agent header card + Rust version command + wire into main panel | Done | 1dace1e | New agent-header.tsx, get_agent_version Rust command, main-panel wiring |
| 2 | Update GSD viewer and remaining components to new design language | Done | 091660f | font-family-sans on headings, font-family-mono on code, border-radius 4px |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Agent whitelist validation** - get_agent_version validates agent name against ["claude", "opencode"] before executing any system command (T-09-09 mitigation)
2. **Gradient icon design** - Purple-to-indigo gradient (#A855F7 to #6366F1) with single letter (C/O/B) for agent identification
3. **isRunning derivation** - Uses `exitCode === undefined` (not null check) since undefined means PTY is still running

## Threat Surface

No new threat surface beyond what was documented in the plan's threat model. The get_agent_version command implements all three mitigations (T-09-09 whitelist, T-09-10 accepted, T-09-11 spawn_blocking).

## Known Stubs

None - all data sources are wired (version from invoke, status from terminal tab signals, agent from project entry).

## Self-Check: PASSED

- All 5 created/modified files verified on disk
- Commit 1dace1e (Task 1) verified in git log
- Commit 091660f (Task 2) verified in git log
