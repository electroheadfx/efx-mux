---
phase: 17-main-panel-file-tabs
plan: 01
subsystem: editor
tags: [codemirror, editor, theme, modal, cm6]
dependency_graph:
  requires: []
  provides:
    - editor/theme.ts: efxmuxTheme, efxmuxHighlightStyle
    - editor/languages.ts: getLanguageExtension
    - editor/setup.ts: createEditorState
    - components/confirm-modal.tsx: ConfirmModal, showConfirmModal
  affects:
    - main-panel.tsx (file viewer overlay removal - Plan 03)
    - terminal-tabs.tsx (unified tab bar - Plan 02)
tech_stack:
  added:
    - codemirror@^6.0.2
    - @codemirror/lang-javascript@^6.2.5
    - @codemirror/lang-rust@^6.0.2
    - @codemirror/lang-css@^6.3.1
    - @codemirror/lang-html@^6.4.11
    - @codemirror/lang-json@^6.0.2
    - @codemirror/lang-markdown@6.5.0
    - @codemirror/lang-yaml@^6.1.3
    - @codemirror/legacy-modes@^6.5.2
    - @replit/codemirror-minimap@^0.5.2
    - @lezer/highlight@^1.2.3
    - @codemirror/state@^6.6.0
    - @codemirror/view@^6.41.0
    - @codemirror/language@^6.12.3
  patterns:
    - EditorView.theme() for structural CM6 styling
    - HighlightStyle.define() + syntaxHighlighting() for syntax colors
    - StreamLanguage.define() for toml and shell legacy modes
    - Signal-driven modal pattern (matching project-modal.tsx)
key_files:
  created:
    - src/editor/theme.ts
    - src/editor/languages.ts
    - src/editor/setup.ts
    - src/components/confirm-modal.tsx
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - id: D-07
    decision: Custom CM6 theme built from tokens.ts colors/fonts via EditorView.theme() + HighlightStyle.define()
    rationale: Matches Solarized Dark palette, no external theme dependency
  - id: D-08
    decision: getLanguageExtension uses a Record<string, () => Extension> factory map
    rationale: Lazy loading avoids importing all language packages at startup
  - id: D-06
    decision: createEditorState returns EditorSetupResult with closure-based savedContent tracking
    rationale: Dirty state comparison uses closure over initial content, minimap is showMinimap.compute with empty dom placeholder
  - id: D-11
    decision: confirm-modal.tsx uses signal-driven visibility with module-level modalState signal
    rationale: Matches project-modal.tsx pattern; Escape/Enter handlers in useEffect; Enter triggers onSave if present else onConfirm
metrics:
  duration: ~5 min
  completed: 2026-04-15
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 17 Plan 01 Summary: CodeMirror 6 Infrastructure + Confirmation Modal

## One-liner

CM6 packages installed, custom Solarized Dark theme and language extensions created, editor setup factory built, and three-button confirmation modal implemented.

## Completed Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Install CM6 packages and create editor theme + languages | `12c80e9` |
| 2 | Create editor setup factory and confirmation modal | `9b5fe0d` |

## What Was Built

### Task 1: CM6 packages + theme + languages (`12c80e9`)

**Packages installed via pnpm:** `codemirror`, `@codemirror/lang-javascript`, `@codemirror/lang-rust`, `@codemirror/lang-css`, `@codemirror/lang-html`, `@codemirror/lang-json`, `@codemirror/lang-markdown`, `@codemirror/lang-yaml`, `@codemirror/legacy-modes`, `@replit/codemirror-minimap`, `@lezer/highlight`, plus `@codemirror/state`, `@codemirror/view`, `@codemirror/language` (added as direct deps to fix TypeScript module resolution with `moduleResolution: "bundler"`).

**`src/editor/theme.ts`:**
- `efxmuxTheme`: `EditorView.theme()` with `{ dark: true }` setting backgroundColor `#111927`, color `#E6EDF3`, fontFamily `GeistMono`, fontSize `13px`, caret, selection, activeLine, gutters, foldPlaceholder, searchMatch styling
- `efxmuxHighlightStyle`: `HighlightStyle.define()` with 10 syntax token colors per UI-SPEC D-07 table (keyword purple, string green, comment dim, number orange, function blue, typeName yellow, operator cyan, bool red, propertyName secondary, definition blue)

**`src/editor/languages.ts`:**
- `getLanguageExtension(fileName: string): Extension | null` using a `Record<string, () => Extension>` factory map
- Supports: ts, tsx, js, jsx, mjs, cjs, rs, css, html, htm, json, md, markdown, mdx, yaml, yml, toml (StreamLanguage.define), sh/bash/zsh (StreamLanguage.define)

### Task 2: Editor setup factory + confirmation modal (`9b5fe0d`)

**`src/editor/setup.ts`:**
- `createEditorState(content: string, options: EditorSetupOptions): EditorSetupResult`
- Returns `{ state: EditorState, getSavedContent, setSavedContent }` with closure-based savedContent tracking
- Extensions: `basicSetup` + language extension + `efxmuxTheme` + `syntaxHighlighting(efxmuxHighlightStyle)` + Mod-s keymap + `updateListener` for dirty tracking + `showMinimap.compute` with empty div placeholder

**`src/components/confirm-modal.tsx`:**
- Signal-driven modal with module-level `modalState` signal
- `showConfirmModal(opts)` opens modal; `ConfirmModal` renders it
- Three-button variant: Cancel (ghost/bgSurface border), Discard (destructive/diffRed), Save File (accent) — Save File only rendered when `onSave` provided
- Keyboard: Escape calls onCancel + hides; Enter calls onSave if present else onConfirm
- Backdrop click calls onCancel + hides; card click `stopPropagation`
- ARIA: `role="dialog"`, `aria-modal="true"`
- Styled with `colors.bgElevated`, `colors.bgBorder`, `radii.xl`, `spacing` tokens

## Deviations from Plan

### Rule 3 - Fix: TypeScript module resolution

**Found during:** Task 1 verification
**Issue:** `tsc --noEmit` failed with `TS2307: Cannot find module '@codemirror/view'|'@codemirror/state'|'@codemirror/language'`
**Fix:** Added `@codemirror/state`, `@codemirror/view`, `@codemirror/language` as direct dependencies in `package.json`. These packages are transitive dependencies of `codemirror` but not exposed at root `node_modules/@codemirror/` with pnpm's isolation + `moduleResolution: "bundler"`.
**Files modified:** `package.json`, `pnpm-lock.yaml`
**Commit:** `12c80e9`

## Verification

```bash
pnpm list codemirror @codemirror/lang-javascript @codemirror/lang-rust \
  @codemirror/legacy-modes @replit/codemirror-minimap @lezer/highlight
# All packages present in node_modules

test -f src/editor/theme.ts        # efxmuxTheme + efxmuxHighlightStyle
test -f src/editor/languages.ts    # getLanguageExtension
test -f src/editor/setup.ts       # createEditorState
test -f src/components/confirm-modal.tsx  # ConfirmModal + showConfirmModal

npx tsc --noEmit  # Clean compilation, no errors
```

## TDD Gate Compliance

N/A — Plan type is `execute`, not `tdd`.

## Self-Check

- [x] All acceptance criteria met for both tasks
- [x] TypeScript compiles clean
- [x] No files deleted in commits
- [x] Commits are atomic (task 1 and task 2 separate)
- [x] All new files tracked in git
