---
phase: '10'
plan: '08'
subsystem: ui
tags:
  - phase-10
  - pixel-perfect
  - modal
  - preferences
dependency_graph:
  requires: []
  provides: []
  affects:
    - src/components/project-modal.tsx
    - src/components/preferences-panel.tsx
tech_stack:
  added: []
  patterns:
    - Navy-blue modal palette via tokens.ts
    - Inline style approach for all visual elements
    - InputShell wrapper pattern for form fields
    - SectionLabel/SettingRow/ThemeToggle primitive components
key_files:
  created: []
  modified:
    - src/components/project-modal.tsx
    - src/components/preferences-panel.tsx
decisions: []
metrics:
  duration: "~1 minute"
  completed: '2026-04-10'
---

# Phase 10 Plan 08: project-modal and preferences-panel rewrite

## One-liner

Rewrote project-modal.tsx and preferences-panel.tsx with navy-blue palette using token-based inline styles, matching reference AddProjectModal and PreferencesPanel designs.

## Completed Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Rewrite project-modal.tsx with reference modal styling | b712906 |
| 2 | Rewrite preferences-panel.tsx with reference modal styling | a001b9e |

## Deviations from Plan

**Rule 2 (Auto-fix bug) - Pre-existing missing fonts import in diff-viewer.tsx**
- Issue: diff-viewer.tsx line 58 used `fonts.mono` without importing `fonts` from tokens
- Fix: Linter auto-fixed by adding `fonts` to the existing `import { colors } from '../tokens'`
- Files modified: src/components/diff-viewer.tsx
- Commit: linter auto-fix (occurred during build verification before task 1)

## Summary

Both components fully restyled to navy-blue palette from tokens.ts:

**project-modal.tsx:**
- 520px width, bgElevated card, bgSurface borders, 12px radius
- InputShell wrapper: bgBase background, bgSurface border, 8px radius, 10px 12px padding
- FieldLabel: GeistMono uppercase, textDim, 1.2px letter-spacing
- Agent field includes gradient diamond icon (20x20, purple gradient)
- Browse button: accentMuted background, accent text
- Footer: Cancel (border bgSurface, 8px radius) + Add Project (accent fill, 8px radius)
- All form logic preserved: signals, validation, browse, add/edit modes

**preferences-panel.tsx:**
- 520px width, bgElevated card, bgSurface borders, 12px radius
- SectionLabel: GeistMono uppercase, textDim, 1.5px letter-spacing
- SettingRow: textMuted labels, textPrimary values, 1px bottom border with alpha
- ThemeToggle: accent fill when active, textDim when inactive, 6px radius
- KbdKey: bgBase fill, bgSurface border, 4px radius
- AgentBadge: gradient diamond icon (purple gradient), textPrimary text
- Edit Project button: accent fill, 8px radius
- All existing functionality preserved

Both modals use identical overlay: `rgba(0,0,0,0.5)`.

## Success Criteria

- [x] project-modal.tsx: 520px width, bgElevated card, bgSurface borders, 12px radius
- [x] preferences-panel.tsx: bgElevated card, section labels in uppercase mono
- [x] Both modals use same overlay background (rgba(0,0,0,0.5))
- [x] All form logic preserved (project-modal: signals, validation, browse)
- [x] All settings preserved (preferences-panel: visible, toggle, settings)
- [x] pnpm build succeeds

## Self-Check

All files found, all commits verified present.
