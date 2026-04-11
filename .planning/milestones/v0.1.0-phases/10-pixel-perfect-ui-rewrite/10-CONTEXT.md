# Phase 10: Pixel-Perfect UI Rewrite - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite all UI components to match the reference design in `RESEARCH/theme/` pixel-for-pixel. The reference is a complete standalone Preact+Tailwind app extracted from the Pencil design mockups, with its own design tokens, component implementations, and a navy-blue color palette. This phase replaces the Phase 9 visual layer entirely with the reference design while preserving all existing application logic (state signals, Tauri invoke, PTY management, event handlers).

</domain>

<decisions>
## Implementation Decisions

### Color palette
- **D-01:** Replace Phase 9 GitHub-dark palette with the reference navy-blue palette from `RESEARCH/theme/tokens.ts`. New base colors: bgDeep=#0B1120, bgBase=#111927, bgElevated=#19243A, bgBorder=#243352, bgSurface=#324568
- **D-02:** Adopt all reference text colors: textPrimary=#E6EDF3, textSecondary=#C9D1D9, textMuted=#8B949E, textDim=#556A85
- **D-03:** Adopt all reference status colors: statusGreen=#3FB950, statusYellow=#D29922, diffRed=#F85149, plus their opacity variants (statusGreenBg=#3FB95020, statusYellowBg=#D2992220, etc.)
- **D-04:** Accent stays #258AD1 (unchanged from Phase 9 and reference)
- **D-05:** Agent gradient stays #A855F7 -> #6366F1 (unchanged from Phase 9 and reference)

### Token system architecture
- **D-06:** Dual token system: update Tailwind 4 @theme CSS variables in app.css to match reference palette AND create a `src/tokens.ts` file mirroring `RESEARCH/theme/tokens.ts` for components that need computed styles (gradients, opacity variants, inline style props)
- **D-07:** @theme vars provide the base palette for Tailwind utility classes. tokens.ts provides programmatic access for inline styles, complex expressions, and values that don't map cleanly to Tailwind (e.g., `#3FB95020` opacity variants)

### Component rewrite strategy
- **D-08:** Full component replacement: replace each component file entirely with the reference version from `RESEARCH/theme/`, then wire in existing application logic (state signals, Tauri invoke, event handlers, PTY management)
- **D-09:** Reference components are the starting point for visual markup. Existing logic from current components must be carefully extracted and integrated into the new visual structure
- **D-10:** Components to rewrite: Sidebar, MainPanel, RightPanel, DiffViewer, FileTree, AddProjectModal, PreferencesPanel, TabBar, AgentHeader, ServerPane, GsdViewer

### Scope and fidelity
- **D-11:** Pixel-perfect design fidelity: match reference colors, spacing, typography, font sizes, border radii, and component structure exactly as specified in tokens.ts and reference components
- **D-12:** Responsive layout preserved: keep drag-resizable splits and responsive behavior from current app. Do NOT adopt fixed layout dimensions from reference (280px sidebar, 380px right panel are defaults/minimums, not fixed)
- **D-13:** Match reference typography exactly: Geist sans for UI, Geist Mono for code/labels/badges, font sizes from tokens.ts fontSizes map (xs:9, sm:10, md:11, base:12, lg:13, xl:15, 2xl:20)

### Claude's Discretion
- Light mode companion palette for the new navy-blue dark palette
- Server pane styling adaptation (reference has a ServerPaneStrip; current app has a more complex expandable pane)
- GSD viewer styling updates to match new design language
- Crash overlay and first-run wizard styling updates
- Fuzzy search and shortcut cheatsheet styling updates
- Exact approach to wiring existing logic into replacement components (order of integration, testing strategy)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference design (source of truth for visual output)
- `RESEARCH/theme/tokens.ts` — Complete design token system: colors, fonts, fontSizes, spacing, radii, layout dimensions
- `RESEARCH/theme/App.tsx` — Root app composition, modal overlay pattern, keyboard shortcut wiring
- `RESEARCH/theme/Sidebar.tsx` — Sidebar: header, project items with status dots, section labels, git changes with M/U badges
- `RESEARCH/theme/MainPanel.tsx` — Terminal tab bar, agent header card, prompt bar, server pane strip
- `RESEARCH/theme/RightPanel.tsx` — Right tab bar (pill-style), GSD content, bash panel, split handle
- `RESEARCH/theme/DiffViewer.tsx` — GitHub-style diff: header with status badge and +/- stats, hunk lines, colored additions/deletions with left border accents
- `RESEARCH/theme/FileTree.tsx` — File tree: header with path, folder/file icons (inline SVG), depth indentation, file sizes, selected state
- `RESEARCH/theme/AddProjectModal.tsx` — Modal: 520px, rounded-xl, header/divider/form/footer, field labels, browse button, agent icon
- `RESEARCH/theme/PreferencesPanel.tsx` — Preferences: section labels, setting rows, theme toggle, keycap badges, agent badge
- `RESEARCH/theme/index.css` — Global styles: scrollbar theming, input resets, caret color

### Current components to replace (preserve logic from these)
- `src/components/sidebar.tsx` (13.6K) — Project list, git status, file changes, drag handle, state signals
- `src/components/main-panel.tsx` (3.8K) — Terminal container, agent header mount, server pane integration
- `src/components/right-panel.tsx` (5.2K) — Tab switching, GSD/Diff/FileTree routing, bash terminal
- `src/components/diff-viewer.tsx` (5.5K) — Git2 diff rendering, file selection
- `src/components/file-tree.tsx` (6.1K) — Recursive tree, keyboard navigation, file open handler
- `src/components/project-modal.tsx` (10.6K) — Add project form, directory browse, validation, Tauri invoke
- `src/components/preferences-panel.tsx` (7.9K) — Settings, theme toggle, project edit
- `src/components/tab-bar.tsx` (1.0K) — Generic tab bar component
- `src/components/agent-header.tsx` (3.8K) — Agent version detection, status pill
- `src/components/terminal-tabs.tsx` (18.8K) — Terminal tab management, PTY lifecycle
- `src/components/server-pane.tsx` (13.8K) — Server process management, output display
- `src/components/gsd-viewer.tsx` (5.2K) — Markdown rendering, checkbox write-back

### Theme infrastructure
- `src/styles/app.css` — Tailwind 4 @theme tokens, @font-face declarations, light mode override
- `src/state-manager.ts` — Preact signals for all reactive state

### Phase 9 context (prior decisions)
- `.planning/phases/09-professional-ui-overhaul/09-CONTEXT.md` — Phase 9 design decisions, many of which are being superseded by reference design

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Geist + Geist Mono + FiraCode fonts already self-hosted in `/public/fonts/`
- Tailwind 4 @theme token system in app.css — update values, keep mechanism
- `lucide-preact` already installed for icons
- `state-manager.ts` signal system for all reactive state
- All Tauri invoke commands (PTY, git, file watching, state persistence) — unchanged

### Established Patterns
- Preact signals for reactive UI state
- Tauri `invoke()` for Rust backend calls
- `listen()` / `emit()` for event-based communication
- @font-face declarations in app.css for self-hosted fonts
- [data-theme="light"] attribute for light mode override

### Integration Points
- `src/styles/app.css @theme`: Replace all color token values with navy-blue palette
- `src/tokens.ts` (new): Create from `RESEARCH/theme/tokens.ts`, used by components for inline styles
- Every component in `src/components/`: Replace visual markup, preserve application logic
- `src/main.tsx` and `src/app.tsx`: May need structural updates to match reference App.tsx composition

</code_context>

<specifics>
## Specific Ideas

- The `RESEARCH/theme/` directory is a complete, buildable Preact app that can be run standalone to see the exact target visual output
- Reference uses inline SVG for file tree icons (folder, file-code, file-text) rather than lucide-preact — evaluate whether to keep lucide-preact or switch to inline SVGs as in the reference
- Reference's ServerPaneStrip is a minimal 1-line strip; current server-pane.tsx has full expandable output. The strip pattern should be adopted for the collapsed state
- Reference's PromptBar is decorative (Claude Code renders its own prompt inside xterm.js) — this is purely visual context for the agent header area, not functional

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-pixel-perfect-ui-rewrite*
*Context gathered: 2026-04-10*
