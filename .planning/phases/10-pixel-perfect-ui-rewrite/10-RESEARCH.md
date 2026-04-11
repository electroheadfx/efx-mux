# Phase 10: Pixel-Perfect UI Rewrite - Research

**Researched:** 2026-04-10
**Domain:** Preact UI component rewrite with design token migration
**Confidence:** HIGH

## Summary

This phase replaces all visual markup in the Efxmux UI with pixel-perfect implementations from the reference design in `RESEARCH/theme/`. The reference is a complete standalone Preact+Tailwind app with a navy-blue color palette, precise typography (Geist/Geist Mono at specific pixel sizes), and component-level design specs extracted from Pencil mockups.

The core challenge is a **visual-only replacement**: every component's JSX/CSS must be rewritten to match the reference, while preserving all existing application logic -- Preact signals, Tauri `invoke()` calls, event listeners, PTY management, drag resizing, and state persistence. The reference components are static mockups with hardcoded data; the current components contain complex runtime logic. The merger must be methodical.

**Primary recommendation:** Work in three waves: (1) foundation -- update design tokens in `app.css` and create `src/tokens.ts`, update `index.css` global styles; (2) leaf components first -- rewrite components with no children dependencies (tab-bar, agent-header, crash-overlay); (3) container components -- rewrite sidebar, main-panel, right-panel and their sub-components, wiring in existing logic last.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Replace Phase 9 GitHub-dark palette with reference navy-blue palette from `RESEARCH/theme/tokens.ts`. New base colors: bgDeep=#0B1120, bgBase=#111927, bgElevated=#19243A, bgBorder=#243352, bgSurface=#324568
- **D-02:** Adopt all reference text colors: textPrimary=#E6EDF3, textSecondary=#C9D1D9, textMuted=#8B949E, textDim=#556A85
- **D-03:** Adopt all reference status colors: statusGreen=#3FB950, statusYellow=#D29922, diffRed=#F85149, plus their opacity variants (statusGreenBg=#3FB95020, statusYellowBg=#D2992220, etc.)
- **D-04:** Accent stays #258AD1 (unchanged from Phase 9 and reference)
- **D-05:** Agent gradient stays #A855F7 -> #6366F1 (unchanged from Phase 9 and reference)
- **D-06:** Dual token system: update Tailwind 4 @theme CSS variables in app.css to match reference palette AND create a `src/tokens.ts` file mirroring `RESEARCH/theme/tokens.ts` for components that need computed styles
- **D-07:** @theme vars provide the base palette for Tailwind utility classes. tokens.ts provides programmatic access for inline styles, complex expressions, and values that don't map cleanly to Tailwind
- **D-08:** Full component replacement: replace each component file entirely with the reference version from `RESEARCH/theme/`, then wire in existing application logic
- **D-09:** Reference components are the starting point for visual markup. Existing logic from current components must be carefully extracted and integrated into the new visual structure
- **D-10:** Components to rewrite: Sidebar, MainPanel, RightPanel, DiffViewer, FileTree, AddProjectModal, PreferencesPanel, TabBar, AgentHeader, ServerPane, GsdViewer
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| preact | (existing) | UI framework | Already installed, all components use Preact signals+hooks | [VERIFIED: codebase] |
| @preact/signals | (existing) | Reactive state | All component state uses signals | [VERIFIED: codebase] |
| tailwindcss | 4.x (existing) | Utility CSS via @theme | Already configured with @theme tokens | [VERIFIED: app.css] |
| lucide-preact | (existing) | Icons | Already installed; keep for most icons | [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| marked | (existing) | Markdown rendering | GSD viewer only | [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lucide-preact icons | Inline SVG (as in reference FileTree) | Reference uses inline SVG for file tree icons; keep lucide-preact for everything else, use inline SVG only where reference specifically does |

**No new dependencies needed.** This phase is purely visual refactoring of existing components.

## Architecture Patterns

### Token Architecture (D-06, D-07)

**Dual token system:**

1. **`src/styles/app.css` @theme block** -- CSS custom properties consumed by Tailwind utility classes (`bg-bg`, `text-text-bright`, etc.)
2. **`src/tokens.ts`** -- TypeScript constants consumed by inline `style={{}}` props for values that don't map cleanly to Tailwind (opacity hex variants like `#3FB95020`, computed gradients, pixel-specific dimensions)

**Token mapping from reference to @theme:**

| Reference token | @theme CSS var | Tailwind class |
|----------------|----------------|----------------|
| `colors.bgDeep` (#0B1120) | `--color-bg-terminal` | `bg-bg-terminal` |
| `colors.bgBase` (#111927) | `--color-bg` | `bg-bg` |
| `colors.bgElevated` (#19243A) | `--color-bg-raised` | `bg-bg-raised` |
| `colors.bgBorder` (#243352) | `--color-border` | `border-border` |
| `colors.bgSurface` (#324568) | `--color-border-interactive` | `border-border-interactive` |
| `colors.textPrimary` (#E6EDF3) | `--color-text-bright` | `text-text-bright` |
| `colors.textSecondary` (#C9D1D9) | (new: `--color-text-secondary`) | `text-text-secondary` |
| `colors.textMuted` (#8B949E) | `--color-text` | `text-text` |
| `colors.textDim` (#556A85) | `--color-text-muted` | `text-text-muted` |
| `colors.accent` (#258AD1) | `--color-accent` | `text-accent` / `bg-accent` |
| `colors.statusGreen` (#3FB950) | `--color-success` | `text-success` / `bg-success` |
| `colors.statusYellow` (#D29922) | `--color-warning` | `text-warning` / `bg-warning` |
| `colors.diffRed` (#F85149) | `--color-danger` | `text-danger` / `bg-danger` |

**Values that MUST use tokens.ts (not @theme):**
- `colors.accentMuted` (#258AD120) -- hex+alpha opacity
- `colors.statusGreenBg` (#3FB95020) -- hex+alpha opacity
- `colors.statusGreenCheck` (#3FB95030) -- hex+alpha opacity
- `colors.statusYellowBg` (#D2992220) -- hex+alpha opacity
- `colors.statusMutedBg` (#8B949E20) -- hex+alpha opacity
- `colors.diffRedBg` (#F8514915) -- hex+alpha opacity
- `colors.diffGreenBg` (#3FB95015) -- hex+alpha opacity
- `colors.diffRedLineno` (#F8514980) -- hex+alpha opacity
- `colors.diffGreenLineno` (#3FB95080) -- hex+alpha opacity
- `colors.diffHunkBg` (#258AD108) -- hex+alpha opacity
- Agent gradient values
- All `fontSizes`, `spacing`, `radii` maps

### Component Rewrite Pattern

**For each component:**

1. Start with reference component markup from `RESEARCH/theme/`
2. Replace hardcoded data with signal-driven dynamic data
3. Replace `useState` (reference uses React hooks) with Preact signals where the current component uses signals
4. Wire in all `useEffect` hooks, event listeners, `invoke()` calls from current component
5. Preserve all `aria-*` attributes and accessibility
6. Keep CSS class names for layout (`sidebar`, `main-panel`, `right-panel`, etc.) that are consumed by `drag-manager.ts`
7. Update inline styles to use `tokens.ts` imports

### Recommended Project Structure (unchanged)
```
src/
├── components/        # All rewritten components (same filenames)
├── styles/
│   └── app.css        # Updated @theme tokens + layout CSS
├── tokens.ts          # NEW: TypeScript design tokens
├── state-manager.ts   # UNCHANGED
├── drag-manager.ts    # UNCHANGED
├── terminal/          # UNCHANGED
├── server/            # UNCHANGED
└── theme/             # UNCHANGED
```

### Anti-Patterns to Avoid
- **Breaking CSS class contracts:** `drag-manager.ts` relies on `.sidebar`, `.main-panel`, `.right-panel`, `.split-handle-v`, `.split-handle-h`, `.server-pane`, `.state-strip`, `.state-expanded` CSS classes. These MUST be preserved.
- **Removing signal reactivity:** Reference components use React `useState`. Current components use `@preact/signals`. Do NOT convert signals to useState -- keep the signal-based architecture.
- **Adopting fixed dimensions from reference:** Reference has `width: 280` on sidebar, `width: 380` on right panel. These are static mockup values. The app uses CSS custom properties (`--sidebar-w`, `--right-w`) set by `drag-manager.ts` for resizable panels.
- **Breaking event contracts:** Many components communicate via `CustomEvent` on `document` (`open-diff`, `project-changed`, `project-added`, `file-opened`, `show-file-viewer`, `switch-bash-session`, `open-add-project`, `project-pre-switch`). All must be preserved.
- **Mixing reference imports:** Reference components import from `'./tokens'`. Production components must import from `'../tokens'` (one level up from components/).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon components | Custom SVG components for all icons | `lucide-preact` for standard icons, inline SVG only for file tree (matching reference) | Consistency, tree-shaking |
| Color opacity variants | Manual rgba() conversion | Hex+alpha notation from tokens.ts (e.g., `#3FB95020`) | Already works in all modern browsers/WebKit |
| Font loading | Dynamic font loading | Existing `@font-face` declarations in app.css | Fonts already self-hosted in `/public/fonts/` |
| Light mode tokens | Separate light mode token file | `[data-theme="light"]` CSS override block in app.css | Existing pattern, proven to work |

## Common Pitfalls

### Pitfall 1: Drag Manager CSS Contract Breakage
**What goes wrong:** Resizable panels stop working after visual rewrite
**Why it happens:** `drag-manager.ts` queries DOM for `.sidebar`, `.main-panel`, `.right-panel`, `.split-handle-v`, `.split-handle-h` and reads/sets CSS custom properties (`--sidebar-w`, `--right-w`)
**How to avoid:** Keep all CSS classes listed in `app.css` layout section. Do not remove or rename them. Reference components use inline styles with fixed widths -- these must be replaced with the CSS class approach.
**Warning signs:** Panels won't resize after dragging split handles

### Pitfall 2: Server Pane State Machine Regression
**What goes wrong:** Server pane toggle breaks, logs disappear, crash detection fails
**Why it happens:** `server-pane.tsx` has complex state: `serverPaneState` signal (strip/expanded), `serverStatus` (stopped/running/crashed/unconfigured), per-project cache (`projectServerCache`), restart guard (`isRestarting`), event listeners for `server-output` and `server-stopped`
**How to avoid:** The reference only has a `ServerPaneStrip` (collapsed view). The expanded view must be adapted from the current implementation. Restyle the existing server pane rather than rebuilding from scratch.
**Warning signs:** Servers don't start/stop, logs don't scroll, project switching loses server state

### Pitfall 3: Terminal Tab Container Reference Loss
**What goes wrong:** Terminal doesn't render or crashes after tab switch
**Why it happens:** `terminal-tabs.tsx` creates `HTMLDivElement` containers per tab and manages their `display: none/block` to preserve xterm.js WebGL contexts. The `div.terminal-containers` in main-panel must remain as the mount point.
**How to avoid:** Keep `div.terminal-containers.absolute.inset-0` in the main panel terminal area. Do not change its position or nesting. `terminal-tabs.tsx` logic is largely unchanged -- only its `TerminalTabBar` render function gets restyled.
**Warning signs:** Blank terminal area, WebGL context loss errors

### Pitfall 4: Reference Uses React Hooks, App Uses Preact Signals
**What goes wrong:** Copy-pasting reference code introduces `useState`/`useCallback` where signals are needed
**Why it happens:** Reference is a standalone Preact app using hooks. Production app uses `@preact/signals` for reactive state and module-level signals for cross-component communication.
**How to avoid:** Only copy visual markup (JSX structure, class names, inline styles) from reference. All state management comes from existing component implementations.
**Warning signs:** Import errors, stale renders, lost reactivity

### Pitfall 5: Font Family Name Mismatch
**What goes wrong:** Geist Mono renders as fallback font
**Why it happens:** Reference uses `fontFamily: 'Geist Mono'` but app.css declares `font-family: 'GeistMono'` (no space). tokens.ts must use the same name as @font-face declaration.
**How to avoid:** In `src/tokens.ts`, set `mono: 'GeistMono'` to match the existing `@font-face` declaration. OR update `@font-face` to use `'Geist Mono'` (with space) and update all references. Pick one and be consistent.
**Warning signs:** Monospace text renders in system monospace instead of GeistMono

### Pitfall 6: Tailwind Arbitrary Value Syntax
**What goes wrong:** Colors like `bg-[#3FB95020]` don't render
**Why it happens:** Tailwind 4 handles arbitrary values but hex+alpha may not work as expected in all utility contexts
**How to avoid:** Use inline `style={{ backgroundColor: colors.statusGreenBg }}` from tokens.ts for opacity-variant colors. Reserve Tailwind utilities for the base palette colors that map to @theme vars.
**Warning signs:** Elements missing backgrounds or using wrong opacity

## Code Examples

### tokens.ts (new file)
```typescript
// Source: RESEARCH/theme/tokens.ts (adapted for production)
export const colors = {
  bgDeep: '#0B1120',
  bgBase: '#111927',
  bgElevated: '#19243A',
  bgBorder: '#243352',
  bgSurface: '#324568',
  accent: '#258AD1',
  accentMuted: '#258AD120',
  textPrimary: '#E6EDF3',
  textSecondary: '#C9D1D9',
  textMuted: '#8B949E',
  textDim: '#556A85',
  statusGreen: '#3FB950',
  statusGreenBg: '#3FB95020',
  statusGreenCheck: '#3FB95030',
  statusYellow: '#D29922',
  statusYellowBg: '#D2992220',
  statusMutedBg: '#8B949E20',
  diffRed: '#F85149',
  diffRedBg: '#F8514915',
  diffRedLineno: '#F8514980',
  diffGreenBg: '#3FB95015',
  diffGreenLineno: '#3FB95080',
  diffHunkBg: '#258AD108',
  agentGradientStart: '#A855F7',
  agentGradientEnd: '#6366F1',
} as const;

export const fonts = {
  sans: 'Geist',
  mono: 'GeistMono',  // NOTE: matches @font-face name in app.css
} as const;

export const fontSizes = {
  xs: 9, sm: 10, md: 11, base: 12, lg: 13, xl: 15, '2xl': 20,
} as const;

export const spacing = {
  none: 0, xs: 1, sm: 2, md: 4, lg: 6, xl: 8,
  '2xl': 10, '3xl': 12, '4xl': 16, '5xl': 20, '6xl': 28,
} as const;

export const radii = {
  sm: 3, md: 4, lg: 6, xl: 8,
} as const;
```

### Updated @theme block for app.css
```css
@theme {
  --color-bg: #111927;           /* bgBase */
  --color-bg-raised: #19243A;    /* bgElevated */
  --color-bg-terminal: #0B1120;  /* bgDeep */
  --color-border: #243352;       /* bgBorder */
  --color-border-interactive: #324568; /* bgSurface */
  --color-text: #8B949E;         /* textMuted */
  --color-text-bright: #E6EDF3;  /* textPrimary */
  --color-text-secondary: #C9D1D9; /* textSecondary (NEW) */
  --color-text-muted: #556A85;   /* textDim */
  --color-accent: #258AD1;
  --color-success: #3FB950;
  --color-warning: #D29922;
  --color-danger: #F85149;

  /* Light mode values -- to be updated for navy palette */
  --color-bg-light: #FFFFFF;
  --color-bg-raised-light: #F6F8FA;
  /* ... (Claude's discretion) */

  --font-family-sans: 'Geist', system-ui, sans-serif;
  --font-family-mono: 'GeistMono', 'FiraCode', monospace;
}
```

### Component Rewrite Example: AgentHeader
```typescript
// Source: Merger of RESEARCH/theme/MainPanel.tsx AgentHeader + src/components/agent-header.tsx logic
import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';
import { activeProjectName, projects } from '../state-manager';
import { terminalTabs, activeTabId } from './terminal-tabs';

// ... existing signals and logic preserved ...

export function AgentHeader() {
  // ... existing useEffect for version fetching ...

  return (
    <div
      class="flex items-center w-full"
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: 8,
        padding: '8px 12px',
        gap: 10,
      }}
    >
      {/* Agent icon with gradient */}
      <div
        class="flex items-center justify-center shrink-0"
        style={{
          width: 28, height: 28, borderRadius: 6,
          background: `linear-gradient(180deg, ${colors.agentGradientStart} 0%, ${colors.agentGradientEnd} 100%)`,
        }}
      >
        <span class="text-xs text-white" style={{ fontFamily: fonts.sans }}>&#x25C6;</span>
      </div>
      {/* Agent info -- wired to signals */}
      <div class="flex flex-col flex-1 min-w-0" style={{ gap: 1 }}>
        <span class="text-xs font-medium truncate"
          style={{ fontFamily: fonts.sans, color: colors.textPrimary }}>
          {displayName.value} {agentVersion.value}
        </span>
        <span class="text-[10px] truncate"
          style={{ fontFamily: fonts.mono, color: colors.textDim }}>
          {/* existing model/path display logic */}
        </span>
      </div>
      {/* Status badge -- wired to isRunning signal */}
      <div class="flex items-center shrink-0"
        style={{
          backgroundColor: isRunning.value ? colors.statusGreenBg : colors.diffRedBg,
          borderRadius: 4, padding: '3px 8px', gap: 4,
        }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: isRunning.value ? colors.statusGreen : colors.diffRed,
        }} />
        <span class="text-[10px] font-medium"
          style={{
            fontFamily: fonts.mono,
            color: isRunning.value ? colors.statusGreen : colors.diffRed,
          }}>
          {isRunning.value ? 'Ready' : 'Stopped'}
        </span>
      </div>
    </div>
  );
}
```

## Component Mapping: Reference to Current

| Reference File | Current File | Logic Complexity | Key Logic to Preserve |
|---------------|-------------|------------------|----------------------|
| `tokens.ts` | (new `src/tokens.ts`) | None | N/A -- pure data |
| `index.css` | `src/styles/app.css` | Low | @font-face, layout classes, drag state, GSD content styles, xterm scrollbar |
| `Sidebar.tsx` | `sidebar.tsx` (13.6K) | HIGH | Signal-based git data, project switching, remove dialog, collapsed mode, event listeners |
| `MainPanel.tsx` | `main-panel.tsx` (3.8K) | MEDIUM | File viewer overlay, server pane integration, terminal-tabs mount |
| `MainPanel.tsx` (AgentHeader) | `agent-header.tsx` (3.8K) | MEDIUM | Version fetching via invoke, isRunning computed signal |
| `MainPanel.tsx` (TerminalTabBar) | `terminal-tabs.tsx` (18.8K) | HIGH | Multi-tab PTY lifecycle, session persistence -- only restyle TabBar render |
| `MainPanel.tsx` (ServerPaneStrip) | `server-pane.tsx` (13.8K) | HIGH | Full server lifecycle, per-project cache, crash detection -- restyle only |
| `RightPanel.tsx` | `right-panel.tsx` (5.2K) | MEDIUM | Bash terminal lazy-connect, tmux session switching, tab signals |
| `RightPanel.tsx` (TabBar) | `tab-bar.tsx` (1.0K) | LOW | Signal-based active tab |
| `DiffViewer.tsx` | `diff-viewer.tsx` (5.5K) | MEDIUM | invoke-based diff loading, innerHTML rendering with escape |
| `FileTree.tsx` | `file-tree.tsx` (6.1K) | MEDIUM | invoke-based directory listing, keyboard navigation, file-opened events |
| `AddProjectModal.tsx` | `project-modal.tsx` (10.6K) | HIGH | Form validation, directory browse, add/edit modes, first-run variant |
| `PreferencesPanel.tsx` | `preferences-panel.tsx` (7.9K) | MEDIUM | Theme toggle, project editing, keyboard dismiss |
| (no reference) | `crash-overlay.tsx` (1.7K) | LOW | Exit code display, restart button |
| (no reference) | `first-run-wizard.tsx` (12.2K) | HIGH | Multi-step wizard, agent detection -- styling only |
| (no reference) | `fuzzy-search.tsx` (6.3K) | MEDIUM | Project search, keyboard nav -- styling only |
| (no reference) | `shortcut-cheatsheet.tsx` (3.5K) | LOW | Static display -- styling only |
| (no reference) | `gsd-viewer.tsx` (5.2K) | MEDIUM | Markdown rendering, checkbox write-back, file watching |

## Rewrite Order (Recommended)

**Wave 1: Foundation (no visual breakage)**
1. Create `src/tokens.ts`
2. Update `src/styles/app.css` @theme block with new palette values
3. Merge reference `index.css` global styles (scrollbar, input resets, body bg) into `app.css`

**Wave 2: Leaf components (minimal dependencies)**
4. `tab-bar.tsx` -- pill-style tabs from reference RightPanel TabButton
5. `agent-header.tsx` -- reference AgentHeader visual + existing signals
6. `crash-overlay.tsx` -- restyle to match new palette (no reference, discretion)

**Wave 3: Content panels (moderate logic)**
7. `diff-viewer.tsx` -- reference DiffViewer visual + existing invoke/event logic
8. `file-tree.tsx` -- reference FileTree visual + existing invoke/keyboard logic (switch to inline SVG for icons here)
9. `gsd-viewer.tsx` -- restyle for new palette (discretion, update .gsd-content CSS)

**Wave 4: Container components (complex logic)**
10. `sidebar.tsx` -- reference Sidebar visual + all existing git/project/event logic
11. `main-panel.tsx` -- reference MainPanel composition + existing file viewer/server pane
12. `right-panel.tsx` -- reference RightPanel visual + bash terminal lazy-connect
13. `server-pane.tsx` -- adapt ServerPaneStrip for collapsed + restyle expanded view

**Wave 5: Modals and overlays (self-contained)**
14. `project-modal.tsx` -- reference AddProjectModal visual + existing form/validation logic
15. `preferences-panel.tsx` -- reference PreferencesPanel visual + existing theme toggle
16. `first-run-wizard.tsx` -- restyle to match new palette (discretion)
17. `fuzzy-search.tsx` -- restyle to match new palette (discretion)
18. `shortcut-cheatsheet.tsx` -- restyle to match new palette (discretion)

**Wave 6: Light mode update (discretion)**
19. Update `[data-theme="light"]` CSS variables for navy palette companion

## Critical CSS Classes to Preserve

These CSS classes are consumed by `drag-manager.ts`, `main.tsx`, or terminal management code. They MUST remain on the correct elements:

| Class | Consumer | Element |
|-------|----------|---------|
| `.sidebar` | drag-manager.ts | `<aside>` sidebar root |
| `.sidebar.collapsed` | drag-manager.ts, signals | Collapsed state |
| `.sidebar-content` | app.css | Scrollable content area |
| `.main-panel` | drag-manager.ts | `<main>` main panel root |
| `.right-panel` | drag-manager.ts | `<aside>` right panel root |
| `.right-top` / `.right-bottom` | drag-manager.ts | Right sub-panels |
| `.right-top-content` / `.right-bottom-content` | app.css | Content overflow |
| `.terminal-area` | app.css, terminal-tabs.tsx | Terminal mount area |
| `.terminal-containers` | terminal-tabs.tsx | xterm.js container mount |
| `.split-handle-v` | drag-manager.ts | Vertical split handles |
| `.split-handle-h` | drag-manager.ts | Horizontal split handles |
| `.server-pane` | app.css | Server pane root |
| `.state-strip` / `.state-expanded` | app.css | Server pane states |
| `.server-pane-toolbar` | app.css | Toolbar height |
| `.server-pane-logs` | app.css | Log area scroll |
| `.bash-terminal` | right-panel.tsx | Bash terminal container |
| `.gsd-content` | app.css | GSD viewer styles |
| `.file-tree` | app.css | File tree focus |
| `.app-dragging` | drag-manager.ts | Drag state overlay |
| `.section-label` | app.css | Section header utility |

## State of the Art

| Old Approach (Phase 9) | New Approach (Phase 10) | Impact |
|------------------------|-------------------------|--------|
| GitHub-dark palette (#0D1117 base) | Navy-blue palette (#111927 base) | All color tokens change |
| Tailwind-only colors via @theme | Dual system: @theme + tokens.ts | Enables hex+alpha opacity colors |
| lucide-preact for all icons | lucide-preact + inline SVG for file tree | Better visual match to reference |
| Rounded-full pill tab bar | Pill-style with border + elevated bg | Different tab visual pattern |
| Bottom-border active tab (main) | Bottom-border active tab (main) + pill active (right) | Two tab bar styles |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Font-face name 'GeistMono' in app.css needs tokens.ts to use same name | Pitfall 5 | Fonts render as fallback -- easy to fix |
| A2 | Hex+alpha colors (#RRGGBBAA) work in WKWebView inline styles | Token Architecture | Colors render without opacity -- would need rgba() conversion |
| A3 | Tailwind 4 @theme variable renaming is backward-compatible with existing utility classes | Token Architecture | All Tailwind utility classes break -- would need search-and-replace |

## Open Questions

1. **Font family naming convention**
   - What we know: app.css uses `'GeistMono'` (no space), reference uses `'Geist Mono'` (with space)
   - What's unclear: Which name does the actual font file register as
   - Recommendation: Check the actual @font-face declaration and match tokens.ts accordingly. Current app.css already works with `'GeistMono'`, so tokens.ts should use that.

2. **Light mode palette for navy base**
   - What we know: Current light mode uses GitHub-light colors (#FFFFFF, #F6F8FA, etc.)
   - What's unclear: What light mode looks like against navy-blue dark mode
   - Recommendation: Start with existing light mode values, adjust if user requests changes. This is explicitly Claude's discretion.

3. **Server pane expanded view styling**
   - What we know: Reference only has ServerPaneStrip (collapsed). Current expanded view has toolbar with Start/Stop/Restart/Open/Clear buttons + scrollable log area.
   - What's unclear: Exact visual spec for expanded state
   - Recommendation: Apply reference navy-blue palette to existing expanded view structure. Use tokens.ts colors for button styles matching the reference ServerPaneStrip button patterns (accent bg for primary actions, border for secondary).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual visual validation (UI phase) |
| Config file | none |
| Quick run command | `pnpm tauri dev` |
| Full suite command | `pnpm tauri dev` + visual inspection |

### Phase Requirements to Test Map
| Behavior | Test Type | Method |
|----------|-----------|--------|
| All colors match reference tokens.ts | Visual | Side-by-side comparison with reference app |
| Typography matches reference font sizes | Visual | Inspect element font-size values |
| Drag-resize still works (sidebar, main, right) | Manual | Drag all split handles |
| Server pane strip/expanded toggle works | Manual | Ctrl+S toggle, Start/Stop buttons |
| Terminal renders and accepts input | Manual | Type commands in terminal |
| Bash terminal in right panel works | Manual | Type commands in bash panel |
| Tab switching works (right panel) | Manual | Click GSD/Diff/File Tree tabs |
| Project switching preserves state | Manual | Switch projects, verify terminals switch |
| Add project modal opens and submits | Manual | Click + button, fill form, submit |
| Preferences panel opens | Manual | Ctrl+, keyboard shortcut |
| Git changes display in sidebar | Manual | Make file changes, verify sidebar updates |
| Diff viewer shows file diffs | Manual | Click changed file in sidebar |
| File tree navigates directories | Manual | Arrow keys, Enter, Backspace |
| GSD viewer renders markdown with checkboxes | Manual | Open project with GSD file |
| Crash overlay appears on PTY exit | Manual | Kill tmux session manually |

### Wave 0 Gaps
None -- existing dev server infrastructure covers all validation needs.

## Security Domain

Not applicable for this phase. This is a visual-only refactoring with no new inputs, outputs, network calls, or data handling. All existing security measures (HTML escaping in diff viewer, XSS prevention in GSD viewer) are preserved unchanged.

## Sources

### Primary (HIGH confidence)
- `RESEARCH/theme/tokens.ts` -- Complete reference token system [VERIFIED: read from filesystem]
- `RESEARCH/theme/*.tsx` -- All reference components [VERIFIED: read from filesystem]
- `src/components/*.tsx` -- All current components [VERIFIED: read from filesystem]
- `src/styles/app.css` -- Current theme infrastructure [VERIFIED: read from filesystem]
- `src/main.tsx` -- App composition and bootstrap [VERIFIED: read from filesystem]
- `src/drag-manager.ts` -- CSS class contracts [VERIFIED: referenced in app.css]

### Secondary (MEDIUM confidence)
- Tailwind 4 @theme documentation [ASSUMED: based on working existing config]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing
- Architecture: HIGH -- dual token system clearly specified in decisions, reference code fully available
- Pitfalls: HIGH -- identified from direct code analysis of both reference and current implementations
- Component mapping: HIGH -- every component file read and cross-referenced

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- no external dependencies changing)
