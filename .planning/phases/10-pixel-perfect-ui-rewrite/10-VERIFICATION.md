---
phase: 10-pixel-perfect-ui-rewrite
verified: 2026-04-10T22:00:00Z
status: human_needed
score: 11/12 must-haves verified
overrides_applied: 0
gaps:
  - truth: "File tree uses inline SVG icons, 20px depth indentation, bgElevated selected row"
    status: partial
    reason: "Inline SVG icons implemented and bgElevated selected row confirmed. However 20px depth indentation is NOT implemented. The file tree is a flat single-level navigator (clicking a folder replaces the list). No depth tracking, no indented tree rendering. SUMMARY.md claims 'depth indentation' was done but the code at src/components/file-tree.tsx has zero depth/paddingLeft logic."
    artifacts:
      - path: "src/components/file-tree.tsx"
        issue: "No depth tracking, no paddingLeft logic. Row padding is flat '7px 16px' for all entries regardless of tree depth."
    missing:
      - "Add depth parameter to rendering loop: paddingLeft: 16 + depth * 20"
      - "Track depth either via recursive children or via path depth relative to project root"
human_verification:
  - test: "Verify panel resize works after all visual updates"
    expected: "Dragging sidebar/main/right split handles resizes panels; layout persists in state.json. No regression from Phase 9."
    why_human: "Drag resize is a runtime DOM + drag-manager.ts behavior that cannot be verified by static code analysis."
  - test: "Verify app renders correctly in Tauri dev (navy-blue palette end-to-end)"
    expected: "All surfaces use navy-blue palette: bgDeep (#0B1120) terminals, bgBase (#111927) sidebars and panel headers, bgElevated (#19243A) cards and active items, accent blue (#258AD1) interactive elements."
    why_human: "Pixel-for-pixel palette match requires visual inspection — cannot be verified by grep alone."
  - test: "Verify light mode toggle applies harmonized white palette"
    expected: "Switching to light mode: all surfaces go white (#FFFFFF), borders #D0D7DE, text #1F2328, accent #0969DA."
    why_human: "Light mode toggle is a runtime behavior requiring visual verification."
---

# Phase 10: Pixel-Perfect UI Rewrite — Verification Report

**Phase Goal:** Rewrite all UI components to match the reference design in RESEARCH/theme/ pixel-for-pixel. The reference is a complete standalone Preact+Tailwind app with a navy-blue color palette, precise typography, and component-level design specs. This phase replaces the Phase 9 visual layer entirely with the reference design while preserving all existing application logic.
**Verified:** 2026-04-10T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | src/tokens.ts exports all color, font, spacing, radius tokens from reference navy-blue palette | VERIFIED | src/tokens.ts exists (78 lines), exports `colors`, `fonts`, `fontSizes`, `spacing`, `radii` as const. All 24 colors confirmed including bgDeep, bgBase, bgElevated, agentGradientStart, etc. |
| 2 | @theme CSS vars in app.css updated to navy-blue palette (bgBase=#111927, bgElevated=#19243A, bgDeep=#0B1120, bgBorder=#243352, bgSurface=#324568) | VERIFIED | app.css @theme block lines 4-34 confirmed: `--color-bg: #111927`, `--color-bg-raised: #19243A`, `--color-bg-terminal: #0B1120`, `--color-border: #243352`, `--color-border-interactive: #324568` |
| 3 | All components use reference visual patterns with tokens.ts colors for opacity variants | VERIFIED | All 12 modified components import from `../tokens` and use inline style with tokens.ts values. Build succeeds (683ms, 0 errors). |
| 4 | Sidebar uses project items with status dots + accent left border, section labels in uppercase GeistMono | VERIFIED | sidebar.tsx confirmed: `isActive ? colors.bgElevated : 'transparent'`, `borderLeft: 3px solid colors.accent` for active rows, `statusGreen`/`textDim` status dots, GeistMono uppercase section labels |
| 5 | Agent header uses 28x28 gradient icon, bgElevated card, status pill with statusGreenBg/diffRedBg | VERIFIED | agent-header.tsx: 28x28 icon with `linear-gradient(180deg, colors.agentGradientStart 0%, colors.agentGradientEnd 100%)`, `statusGreenBg`/`diffRedBg` status pill confirmed |
| 6 | Diff viewer uses GitHub-style header (status badge + filename + +/- stats) with diffGreenBg/diffRedBg line backgrounds | VERIFIED | diff-viewer.tsx: `colors.diffHunkBg`, `colors.diffGreenBg`, `colors.diffRedBg` confirmed in renderDiffHtml function |
| 7 | File tree uses inline SVG icons, 20px depth indentation, bgElevated selected row | PARTIAL | Inline SVG icons (FolderIcon, FileCodeIcon, FileTextIcon) confirmed. bgElevated for selected row confirmed. **20px depth indentation NOT implemented** — file-tree renders a flat single-level list with navigation (clicking folder replaces the entire list), no depth tracking exists in the code. SUMMARY claimed "depth indentation" but the implementation has none. |
| 8 | Server pane strip/expanded toggle uses navy-blue palette throughout | VERIFIED | server-pane.tsx: `colors.statusGreen`, `colors.diffRed`, `colors.accentMuted`, `colors.bgBase`, `colors.bgBorder` confirmed (10 matches). strip/expanded states preserved. |
| 9 | Modals (Add Project, Preferences) use bgElevated card, 12px radius, bgSurface borders | VERIFIED | project-modal.tsx: 520px width, `colors.bgElevated`, `colors.bgSurface` border confirmed. preferences-panel.tsx: `colors.bgElevated`, `colors.bgBorder` confirmed. Both use `rgba(0,0,0,0.5)` overlay. |
| 10 | Light mode uses harmonized white palette (#FFFFFF backgrounds, #D0D7DE borders) | VERIFIED | app.css `[data-theme="light"]` block: `--color-bg-light: #FFFFFF`, `--color-bg-raised-light: #FFFFFF`, `--color-border-light: #D0D7DE`, `--color-accent-light: #0969DA` confirmed. |
| 11 | Drag-resizable panels (sidebar, main, right) preserve all CSS class contracts with drag-manager.ts | VERIFIED | `.sidebar`, `.main-panel`, `.right-panel`, `.split-handle-v`, `.split-handle-h` all confirmed in app.css and component files. sidebar.tsx uses `class="sidebar"` aside element. main-panel.tsx uses `class="main-panel"`. right-panel.tsx uses `class="right-panel"`. |
| 12 | Panel resize works correctly after all visual updates | NEEDS HUMAN | Cannot verify panel resize behavior via static analysis. Requires running `pnpm tauri dev` and physically dragging split handles. |

**Score:** 11/12 truths verified (1 partial, 1 human-needed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tokens.ts` | Design tokens (colors, fonts, fontSizes, spacing, radii) | VERIFIED | 78 lines, 5 const exports, 24 colors |
| `src/styles/app.css` | Navy-blue @theme + light mode + gsd-content CSS | VERIFIED | @theme with all 5 navy-blue core vars, [data-theme="light"] block, .gsd-content h2/p updated |
| `src/components/tab-bar.tsx` | Pill-style tab bar with bgElevated active | VERIFIED | bgElevated + bgSurface border for active, transparent for inactive |
| `src/components/agent-header.tsx` | 28x28 gradient icon, statusGreenBg/diffRedBg pill | VERIFIED | Gradient icon + status pill confirmed |
| `src/components/crash-overlay.tsx` | Navy-blue card with bgElevated | VERIFIED | colors.bgElevated confirmed |
| `src/components/diff-viewer.tsx` | diffGreenBg/diffRedBg line styling | VERIFIED | All diff colors from tokens.ts confirmed |
| `src/components/file-tree.tsx` | Inline SVG icons, bgElevated selection, 20px depth | PARTIAL | Icons + selection confirmed, depth indentation missing |
| `src/components/gsd-viewer.tsx` | bg-bg-terminal container | VERIFIED | `class="... bg-bg-terminal ..."` confirmed |
| `src/components/sidebar.tsx` | bgElevated active rows, statusGreen dots, section labels | VERIFIED | All token references confirmed |
| `src/components/main-panel.tsx` | bg-bg-terminal area, terminal-containers preserved | VERIFIED | Both confirmed |
| `src/components/right-panel.tsx` | bgBase + bgDeep content areas | VERIFIED | bgBase + bgBorder border, bgDeep content confirmed |
| `src/components/server-pane.tsx` | statusGreen/diffRed/accentMuted palette | VERIFIED | All 10 token references confirmed |
| `src/components/project-modal.tsx` | bgElevated card, 520px, bgSurface borders | VERIFIED | All confirmed |
| `src/components/preferences-panel.tsx` | bgElevated card, uppercase mono section labels | VERIFIED | Confirmed |
| `src/components/terminal-tabs.tsx` | bgBase container, accent active indicator, statusGreen dot | VERIFIED | Confirmed |
| `src/components/first-run-wizard.tsx` | bgElevated card, bgBorder borders | VERIFIED | Confirmed |
| `src/components/fuzzy-search.tsx` | bgElevated card | VERIFIED | Confirmed |
| `src/components/shortcut-cheatsheet.tsx` | bgElevated card, bgBorder borders | VERIFIED | Confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/tokens.ts` | All components | `import { colors, fonts } from '../tokens'` | WIRED | All 12 Phase 10 components import from tokens.ts |
| `src/styles/app.css @theme` | Components | `bg-bg-terminal`, `bg-bg`, `bg-bg-raised` Tailwind utilities | WIRED | @theme vars wired to Tailwind 4, consumed by gsd-viewer and others |
| `sidebar.tsx` GitFileRow | `diff-viewer.tsx` | `open-diff` CustomEvent dispatch | WIRED | GitFileRow dispatches `open-diff` event (line 250), diff-viewer listens |
| `main-panel.tsx` | `AgentHeader` | Component mount in JSX | WIRED | `<AgentHeader />` in main-panel.tsx |
| `main-panel.tsx` | `terminal-containers` | `div.terminal-containers.absolute.inset-0` | WIRED | div preserved at line 73 |
| `right-panel.tsx` | `GSDViewer`, `DiffViewer`, `FileTree` | Conditional rendering on `rightTopTab.value` | WIRED | All three components mounted with display:none/block switching |
| `server-pane.tsx` | strip/expanded state | `serverPaneState` signal | WIRED | Signal toggles between 'strip' and 'expanded' at line 25, 285-295 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `agent-header.tsx` | `agentVersion`, `isRunning` | `invoke('get_agent_version')`, `isRunning` signal | Yes — invoke call + event-driven signal | FLOWING |
| `sidebar.tsx` | `gitData`, `gitFiles` | `gitData` signal populated by event listener (`project-changed`), `invoke('get_git_status')` | Yes — real git2 data via Tauri invoke | FLOWING |
| `diff-viewer.tsx` | diff HTML | `invoke('get_file_diff')` via `open-diff` event | Yes — real diff from git2 | FLOWING |
| `file-tree.tsx` | `entries` | `invoke('list_directory')` | Yes — real filesystem listing | FLOWING |
| `gsd-viewer.tsx` | markdown HTML | File watcher via `notify`, `invoke('read_gsd_file')` | Yes — real file content | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | `pnpm build` | `✓ built in 683ms` | PASS |
| tokens.ts exports present | `grep -n "^export const" src/tokens.ts` | 5 exports confirmed (colors, fonts, fontSizes, spacing, radii) | PASS |
| Navy-blue palette in @theme | `grep "color-bg:" src/styles/app.css` | `#111927` confirmed | PASS |
| All key components import tokens | `grep "from '../tokens'" src/components/*.tsx` | All 12 Phase 10 components confirmed | PASS |
| Drag-manager CSS classes preserved | `grep -n "\.sidebar\|\.main-panel\|\.right-panel\|\.split-handle" src/styles/app.css` | All 4 class families present | PASS |
| terminal-containers preserved | `grep "terminal-containers" src/components/main-panel.tsx` | Present at line 73 | PASS |
| file-tree depth indentation | `grep "depth\|paddingLeft" src/components/file-tree.tsx` | 0 matches | FAIL — depth NOT implemented |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UI-01 | 10-01, 10-02, 10-03, 10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10 | Navy-blue palette across all components | SATISFIED | tokens.ts + all components verified |
| UI-02 | 10-01, 10-06 | @theme CSS vars and tab bar styling | SATISFIED | @theme block confirmed, tab bars updated |
| UI-03 | 10-09 | TerminalTabBar styling | SATISFIED | terminal-tabs.tsx: bgBase container, accent active indicator confirmed |
| UI-04 | 10-02, 10-03, 10-04, 10-05, 10-07, 10-08, 10-09 | Component visual rewrite with tokens.ts | SATISFIED | All leaf components verified |
| UI-05 | 10-06 | main-panel.tsx navy-blue | SATISFIED | bg-bg-terminal terminal area, file viewer overlay confirmed |
| UI-06 | 10-06 | right-panel.tsx navy-blue | SATISFIED | bgBase + bgDeep content areas confirmed |
| UI-07 | 10-03 | Diff viewer GitHub-style | SATISFIED | diffGreenBg/diffRedBg/diffHunkBg all confirmed |
| UI-08 | (10-03 implicit) | File tree inline SVG icons | SATISFIED | FolderIcon, FileCodeIcon, FileTextIcon inline SVGs confirmed. Note: UI-08 not claimed by any single plan but the work is done. |
| SIDE-01 | 10-05 | Git changes section with file counts | SATISFIED | gitData/gitFiles signals in sidebar.tsx confirmed |
| SIDE-02 | 10-05 | Click changed file opens diff | SATISFIED | GitFileRow dispatches open-diff, diff-viewer listens |
| PROJ-01 | 10-08 | Project registration modal with form | SATISFIED | project-modal.tsx signals and handleSubmit preserved |
| PANEL-02 | 10-04 | GSD viewer with checkbox write-back | SATISFIED | gsd-viewer.tsx confirmed: bg-bg-terminal container + .gsd-content CSS updated |
| PANEL-04 | 10-03 | Diff viewer syntax-highlighted | SATISFIED | renderDiffHtml with tokens.ts colors confirmed |
| PANEL-05 | 10-03 | File tree interactive with keyboard nav | SATISFIED | ArrowUp/Down/Enter/Backspace handlers present in file-tree.tsx |
| AGENT-01 | 10-07 | Server pane collapsable with actions | SATISFIED | strip/expanded signal + handleToggle confirmed |

**ORPHANED REQUIREMENTS NOTE:** UI-01 through UI-08 are not defined in `.planning/REQUIREMENTS.md` traceability table. They exist only in ROADMAP.md as phase-specific requirements. This is pre-existing (noted in Phase 9 verification). Not a Phase 10 issue.

**UX-01 NOTE:** Plan 10-09 frontmatter lists UX-01, but Phase 10 ROADMAP does not include UX-01 in its requirements. UX-01 belongs to Phase 8 (Keyboard + Polish). The Plan 09 frontmatter claim is incorrect. UX-01 is out of scope for Phase 10 verification.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/sidebar.tsx` | 248 | `class="hover:bg-bg-raised"` on GitFileRow | Info | Uses Tailwind class `bg-bg-raised` for hover. This maps to `--color-bg-raised: #19243A` (bgElevated) via @theme, which is correct behavior. Not a stub — hover is a valid interaction state and the value is correct via CSS variable. |
| `src/components/file-tree.tsx` | 197 | `padding: '7px 16px'` applied to all rows (no depth) | Warning | Flat padding for all entries — does not implement 20px depth indentation per plan spec and ROADMAP SC-7. |

### Human Verification Required

#### 1. Panel Resize After Visual Update

**Test:** Run `pnpm tauri dev`. Drag the split handle between sidebar and main panel left/right. Drag the split handle between main panel and right panel left/right.
**Expected:** Panels resize smoothly. Ratios persist in state.json on close/reopen. No visual glitches in navy-blue borders at panel edges.
**Why human:** Drag-manager.ts operates on runtime DOM measurements. Cannot verify resize behavior through static analysis.

#### 2. Full Visual Palette Inspection

**Test:** Run `pnpm tauri dev`. Open the app and visually inspect all surfaces.
**Expected:** Terminal area is deep navy (#0B1120), panel headers are #111927, cards/active items are #19243A, accent blue #258AD1 on interactive elements, status indicators use correct green (#3FB950) and red (#F85149).
**Why human:** Pixel-for-pixel palette verification requires visual inspection. Grep confirms token values in source but not that the compiled CSS delivers the correct rendered colors.

#### 3. Light Mode Toggle

**Test:** Open Preferences panel. Click the theme toggle to switch to light mode.
**Expected:** All surfaces switch to white (#FFFFFF), borders become #D0D7DE, text becomes #1F2328, accent becomes #0969DA.
**Why human:** CSS variable overrides via `[data-theme="light"]` require runtime verification.

### Gaps Summary

One confirmed gap blocking full ROADMAP success criterion #7:

**File tree 20px depth indentation not implemented.** The plan (10-03) explicitly stated the file tree should track depth and apply `paddingLeft: 16 + depth * 20` for each indentation level. The implementation renders a flat single-level directory view — clicking a folder replaces the entire list rather than expanding in-place with indented children. The SUMMARY for plan 10-03 incorrectly claimed "depth indentation" was complete.

This is a partial implementation of the file tree visual spec. The inline SVG icons and bgElevated selected row are correct. Only the tree depth rendering is missing.

**Impact:** ROADMAP success criterion #7 is partially met. All other 11 criteria are verified.

---

_Verified: 2026-04-10T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
