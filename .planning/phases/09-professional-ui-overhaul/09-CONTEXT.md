# Phase 9: Professional UI Overhaul - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the app from a functional but plain terminal wrapper into a professional-grade developer tool with refined visual depth, typography, and polish -- matching the quality bar of tools like Warp, Cursor, and Linear. Covers UI-01 through UI-08 from ROADMAP.md.

</domain>

<decisions>
## Implementation Decisions

### Color system & depth
- **D-01:** Adopt ROADMAP color values exactly: bg=#0D1117, bg-raised=#161B22, bg-terminal=#010409, border subtle=#1B2028, border interactive=#30363D, text=#8B949E, text-bright=#E6EDF3, accent=#258AD1, success=#3FB950, warning=#D29922, danger=#F85149
- **D-02:** Replace existing Tailwind 4 @theme tokens in app.css with the new palette values. All 6 current tokens (bg, bg-raised, border, text, text-bright, accent) get new values; add new tokens for bg-terminal, success, warning, danger
- **D-03:** Flat surfaces with border separation (no shadow elevation). Panels and sidebar use border-only depth. Confirmed by Pencil mockup design language
- **D-04:** Update light mode to match the new design -- create a proper light companion palette for the new dark values. Both modes should feel equally polished

### Typography & fonts
- **D-05:** Switch from FiraCode-everywhere to Geist (UI chrome) + Geist Mono (code chrome/section labels) + FiraCode (xterm.js terminal only)
- **D-06:** Self-hosted woff2 files in /public/fonts/ for Geist and Geist Mono. Same loading pattern as existing FiraCode. Zero external requests, works offline
- **D-07:** Follow ROADMAP typography spec strictly: UI headings Geist 600 13-16px, UI body Geist 400-500 12-13px, Section labels Geist Mono 500 10px uppercase letter-spacing 1.2px, Code/terminal chrome Geist Mono 12-13px
- **D-08:** Create a global `section-label` utility class in app.css for uppercase section labels (uppercase, tracking-wider, text-[10px], Geist Mono 500). Apply consistently across sidebar, preferences, modals

### Component polish -- Sidebar
- **D-09:** Rebuild sidebar project cards to match Pencil mockup pixel-for-pixel: status dots (green=active), git branch badges, colored file status badges (M=blue tint, S=green tint, U=orange tint with letter + tinted background)
- **D-10:** Sidebar section headers use the new section-label utility (uppercase Geist Mono) matching mockup: "PROJECTS", "GIT CHANGES", etc.

### Component polish -- Diff viewer
- **D-11:** Full GitHub-style diff viewer: file header bar showing filename + M icon badge + stats badge (+N -N in green/red), line numbers column, left border accents on added/deleted lines (green/red), proper hunk separators with @@ styling

### Component polish -- File tree
- **D-12:** Add lucide-preact package for consistent tree-shakeable icons across file tree, sidebar, and other components
- **D-13:** File tree uses Lucide folder/file icons with proper indentation hierarchy and file size metadata (right-aligned, muted text) matching the mockup

### Component polish -- Modals
- **D-14:** Restyle existing modal components (project-modal.tsx, preferences-panel.tsx) -- keep existing logic, update Tailwind classes to match mockup: rounded-xl (12px), dark input fields with 8px radius, header/footer dividers, shadow depth on the modal card itself
- **D-15:** Preferences panel matches mockup structure: "CURRENT PROJECT" section with Name/Path/Agent rows, "APPEARANCE" section with Dark/Light toggle, "SHORTCUTS" section with keycap-styled badges

### Component polish -- Tab bars
- **D-16:** Tab bars use pill-style active states with subtle border + filled background (existing TabBar component already uses rounded-full pills -- update colors to new palette)

### Agent header card
- **D-17:** New agent header card above the terminal tab bar showing agent type/version info and a status pill. Fixed position, always visible regardless of active tab
- **D-18:** Run `claude --version` (or `opencode --version`) as a one-shot command at startup to get version info. This is a separate command invocation, not parsing agent stdout (respects no-output-parsing constraint)
- **D-19:** Status pill reflects PTY process state: green "Ready" dot when process is running, red "Stopped" when exited/crashed. Based on existing PTY process state tracking

### Claude's Discretion
- Light mode companion palette color choices (should feel professional, not just inverted)
- Exact Geist font weights to bundle (Regular 400, Medium 500, SemiBold 600 minimum)
- GSD viewer styling updates to match new design language
- Bottom status bar styling (currently shows "Efxmux" -- update to new palette)
- Transition/animation approach for theme changes
- Exact shadow values for modal overlay (only element with shadow per flat design decision)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design mockups (source of truth)
- `/Users/lmarques/Desktop/efxmux.pen` -- Pencil mockup file with 5 screens: Main App Layout (JtCpP), Diff Viewer (gkmpT), File Tree (leQ9s), Add Project Modal (JyvDG), Preferences Panel (Vwvx7). Use Pencil MCP tools to read/screenshot

### Color & typography spec
- `.planning/ROADMAP.md` lines 220-260 -- Phase 9 success criteria, color system table, typography system spec

### Current theme infrastructure
- `src/styles/app.css` -- Tailwind 4 @theme tokens, @font-face declarations, light mode override via [data-theme="light"]
- `src/theme/theme-manager.ts` -- Theme loading, iTerm2 import, hot-reload. Must be updated for new palette defaults

### Components to restyle
- `src/components/sidebar.tsx` (12.7K) -- Project cards, git status, file list. Major rework for mockup matching
- `src/components/diff-viewer.tsx` (2.9K) -- Current basic diff rendering. Rebuild for GitHub-style
- `src/components/file-tree.tsx` (4.8K) -- Current tree. Add Lucide icons and metadata
- `src/components/project-modal.tsx` (10.5K) -- Add Project modal. Restyle to mockup
- `src/components/preferences-panel.tsx` (5.2K) -- Preferences. Restyle to mockup
- `src/components/tab-bar.tsx` (998B) -- Pill-style tabs. Update palette colors
- `src/components/main-panel.tsx` (3.6K) -- Add agent header card above terminal tabs
- `src/components/terminal-tabs.tsx` (18.7K) -- Terminal tab management. Agent header integration point

### Agent version detection
- `src-tauri/src/terminal/pty.rs` -- PtyManager, spawn_terminal. Add version detection command
- `src/state-manager.ts` -- Signals for agent metadata (version, status)

### Prior phase context
- `.planning/phases/08-keyboard-polish/08-CONTEXT.md` -- Phase 8 decisions on shortcuts, tabs, crash overlay

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TabBar` component (tab-bar.tsx): Already uses rounded-full pill style. Update colors only
- `project-modal.tsx` (10.5K): Full modal with form fields. Restyle, don't rebuild
- `preferences-panel.tsx` (5.2K): Settings panel with sections. Restyle to match mockup
- `crash-overlay.tsx` (1.7K): Terminal overlay pattern. Agent header can follow similar positioning approach
- `state-manager.ts`: Signal-based reactive state. Add agent metadata signals

### Established Patterns
- Tailwind 4 @theme tokens for all colors -- single source of truth in app.css
- @font-face declarations in app.css for self-hosted fonts
- [data-theme="light"] attribute for light mode override
- Preact signals for reactive UI state
- Tauri invoke for Rust backend calls

### Integration Points
- `app.css @theme`: Replace all 6 color tokens, add 4 new ones (bg-terminal, success, warning, danger)
- `app.css @font-face`: Add Geist and Geist Mono font declarations
- `main-panel.tsx`: Insert agent header card component above terminal tabs
- `pty.rs`: Add Tauri command for `claude --version` / `opencode --version` one-shot
- `package.json`: Add lucide-preact dependency

</code_context>

<specifics>
## Specific Ideas

- Pencil mockup at `/Users/lmarques/Desktop/efxmux.pen` is the visual source of truth for all component styling
- The mockup shows the main app at 1440x900 -- a full 3-panel window with all elements in context
- Sidebar project cards in mockup show: colored dot (green=active), project name, path, git branch badge, and collapsible git changes section with M/S/U colored badges
- Diff viewer header shows: M icon badge (blue), filename, and "+6 -11" stats in green/red
- File tree shows: Lucide folder icons (blue tint), file icons, selected file highlighted, file sizes right-aligned
- Add Project modal has: "DIRECTORY" label above path input with Browse button, "AGENT" with icon, "GSD FILE" and "SERVER COMMAND" optional fields, Cancel/Add Project footer buttons
- Preferences has: section grouping with uppercase labels, keycap-styled keyboard shortcut badges (Ctrl + ?)

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 09-professional-ui-overhaul*
*Context gathered: 2026-04-10*
