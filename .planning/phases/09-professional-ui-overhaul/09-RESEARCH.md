# Phase 9: Professional UI Overhaul - Research

**Researched:** 2026-04-10
**Domain:** UI design systems, typography, icon libraries, Tailwind 4 theming, Preact component styling
**Confidence:** HIGH

## Summary

This phase is a pure frontend UI polish pass -- no new backend functionality, minimal Rust changes (one new Tauri command for agent version detection). The work involves: (1) updating Tailwind 4 @theme color tokens in app.css, (2) self-hosting Geist and Geist Mono variable fonts as woff2, (3) installing lucide-preact for icons, (4) restyling 8 existing Preact components to match Pencil mockups, and (5) adding a new agent-header component with version detection.

All decisions are locked by CONTEXT.md (D-01 through D-19). The color palette, typography system, and component-level design are fully specified. The Pencil mockup file at `/Users/lmarques/Desktop/efxmux.pen` is the pixel-level source of truth.

**Primary recommendation:** Execute as a layered approach -- foundation first (colors + fonts + icons), then component-by-component restyling, with the agent header card as a separate unit since it touches both frontend and Rust backend.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Adopt ROADMAP color values exactly: bg=#0D1117, bg-raised=#161B22, bg-terminal=#010409, border subtle=#1B2028, border interactive=#30363D, text=#8B949E, text-bright=#E6EDF3, accent=#258AD1, success=#3FB950, warning=#D29922, danger=#F85149
- **D-02:** Replace existing Tailwind 4 @theme tokens in app.css with the new palette values. All 6 current tokens get new values; add new tokens for bg-terminal, success, warning, danger
- **D-03:** Flat surfaces with border separation (no shadow elevation). Panels and sidebar use border-only depth
- **D-04:** Update light mode to match the new design -- create a proper light companion palette
- **D-05:** Switch from FiraCode-everywhere to Geist (UI chrome) + Geist Mono (code chrome/section labels) + FiraCode (xterm.js terminal only)
- **D-06:** Self-hosted woff2 files in src/fonts/ for Geist and Geist Mono. Same loading pattern as existing FiraCode. Zero external requests, works offline
- **D-07:** Follow ROADMAP typography spec strictly
- **D-08:** Create a global `section-label` utility class in app.css for uppercase section labels
- **D-09:** Rebuild sidebar project cards to match Pencil mockup pixel-for-pixel
- **D-10:** Sidebar section headers use the new section-label utility
- **D-11:** Full GitHub-style diff viewer
- **D-12:** Add lucide-preact package for consistent tree-shakeable icons
- **D-13:** File tree uses Lucide folder/file icons with indentation hierarchy and file size metadata
- **D-14:** Restyle existing modal components -- keep existing logic, update Tailwind classes
- **D-15:** Preferences panel matches mockup structure
- **D-16:** Tab bars use pill-style active states with new palette colors
- **D-17:** New agent header card above terminal tab bar
- **D-18:** Run `claude --version` (or `opencode --version`) as a one-shot command at startup
- **D-19:** Status pill reflects PTY process state

### Claude's Discretion
- Light mode companion palette color choices
- Exact Geist font weights to bundle (Regular 400, Medium 500, SemiBold 600 minimum)
- GSD viewer styling updates to match new design language
- Bottom status bar styling
- Transition/animation approach for theme changes
- Exact shadow values for modal overlay

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Deeper dark palette with layered depth | Color token update in app.css @theme (D-01, D-02) |
| UI-02 | Typography upgrade: Geist + Geist Mono + FiraCode | Font self-hosting pattern, @font-face declarations (D-05, D-06, D-07) |
| UI-03 | Refined sidebar project cards with status dots and badges | Sidebar component restyle with Lucide icons (D-09, D-10) |
| UI-04 | Agent header card with version and status pill | New component + Rust version detection command (D-17, D-18, D-19) |
| UI-05 | Rounded modal cards with shadow depth and dark inputs | Modal/preferences component restyle (D-14, D-15) |
| UI-06 | Pill-style tab bars | Tab bar color update (D-16) |
| UI-07 | GitHub-inspired diff viewer | Diff viewer rebuild (D-11) |
| UI-08 | Lucide icons in file tree with hierarchy | lucide-preact + file tree restyle (D-12, D-13) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-preact | 1.8.0 | Tree-shakeable SVG icons (Lucide icon set) | Only official Preact binding for Lucide; peer dep preact ^10.27.2 matches project ^10.29.1 [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Geist Variable (woff2) | 1.3.0 | UI sans-serif font | Self-hosted from Vercel GitHub release [VERIFIED: github.com/vercel/geist-font] |
| Geist Mono Variable (woff2) | 1.3.0 | Code/label monospace font | Self-hosted from Vercel GitHub release [VERIFIED: github.com/vercel/geist-font] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lucide-preact | Inline SVGs | Lucide is decision D-12; inline SVGs lose consistency and add maintenance burden |
| Variable font (Geist) | Static weight woff2 files | Variable font is single ~68KB file supporting all weights 100-900; static files would be ~40KB each x3 = ~120KB |

**Installation:**
```bash
pnpm add lucide-preact
```

**Font acquisition:** Download Geist-Variable.woff2 (~68KB) and GeistMono-Variable.woff2 from the Vercel geist-font GitHub repository (`packages/next/dist/fonts/geist-sans/Geist-Variable.woff2` and `packages/next/dist/fonts/geist-mono/GeistMono-Variable.woff2`) into `src/fonts/`. [VERIFIED: raw GitHub URL returned valid woff2 binary]

## Architecture Patterns

### Font Loading Pattern (matches existing FiraCode)
```
src/
  fonts/
    FiraCode-Light.woff2      # existing (xterm.js only)
    Geist-Variable.woff2      # NEW: UI chrome
    GeistMono-Variable.woff2  # NEW: code chrome + section labels
  styles/
    app.css                   # @font-face + @theme tokens + utility classes
```

### Pattern 1: Variable Font @font-face
**What:** Single woff2 variable font file with `font-weight: 100 900` range declaration
**When to use:** When bundling Geist (UI) and Geist Mono (code chrome)
**Example:**
```css
/* Source: Vercel Geist font documentation + existing FiraCode pattern in app.css */
@font-face {
  font-family: 'Geist';
  src: url('/fonts/Geist-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'GeistMono';
  src: url('/fonts/GeistMono-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
```
[VERIFIED: existing FiraCode pattern in src/styles/app.css line 23-28]

### Pattern 2: Tailwind 4 @theme Token Update
**What:** Replace color values in the existing @theme block; add new tokens
**When to use:** Foundation layer -- first change in the phase
**Example:**
```css
@theme {
  --color-bg: #0D1117;
  --color-bg-raised: #161B22;
  --color-bg-terminal: #010409;
  --color-border: #1B2028;
  --color-border-interactive: #30363D;
  --color-text: #8B949E;
  --color-text-bright: #E6EDF3;
  --color-accent: #258AD1;
  --color-success: #3FB950;
  --color-warning: #D29922;
  --color-danger: #F85149;

  --font-family-sans: 'Geist', system-ui, sans-serif;
  --font-family-mono: 'GeistMono', 'FiraCode', monospace;
}
```
[VERIFIED: existing @theme block in src/styles/app.css lines 4-21]

### Pattern 3: Section Label Utility Class
**What:** Reusable CSS class for uppercase section headers (D-08)
**When to use:** Sidebar section headers, modal section headers, preferences sections
**Example:**
```css
.section-label {
  font-family: 'GeistMono', monospace;
  font-weight: 500;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--color-text);
}
```
[ASSUMED: pattern derived from D-07/D-08 typography spec]

### Pattern 4: Agent Version Detection (Rust Backend)
**What:** One-shot command execution to get agent version string
**When to use:** Agent header card, run once at terminal tab creation
**Example:**
```rust
// Source: D-18 decision + existing spawn pattern in pty.rs
#[tauri::command]
pub async fn get_agent_version(agent: String) -> Result<String, String> {
    let output = std::process::Command::new(&agent)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run {} --version: {}", agent, e))?;
    if !output.status.success() {
        return Err(format!("{} --version failed", agent));
    }
    String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())
        .map(|s| s.trim().to_string())
}
```
[ASSUMED: follows existing `check_tmux()` pattern at pty.rs line 34-45]

### Pattern 5: Lucide Icon Usage in Preact
**What:** Import individual icons from lucide-preact (tree-shaking)
**When to use:** File tree, sidebar, modals
**Example:**
```tsx
// Source: lucide-preact documentation
import { Folder, File, GitBranch, Circle } from 'lucide-preact';

// Usage in JSX
<Folder size={14} class="text-accent" />
<File size={14} class="text-text" />
<GitBranch size={12} class="text-accent" />
<Circle size={8} fill="currentColor" class="text-success" />
```
[VERIFIED: lucide-preact npm package exists, version 1.8.0, peer dep preact ^10.27.2]

### Anti-Patterns to Avoid
- **Hardcoded color values in components:** All colors must use Tailwind theme tokens (bg-bg, text-text, etc.), never raw hex values. The existing codebase has some inline `style={{ color: '#b58900' }}` in sidebar.tsx that must be replaced with theme tokens.
- **Shadow on non-modal elements:** D-03 locks flat design with border separation. Only modal overlay cards get shadow (shadow-2xl on the card itself).
- **Importing all Lucide icons:** Always import individual icons (`import { Folder } from 'lucide-preact'`), never the entire set.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG icons | Custom SVG sprites or inline paths | lucide-preact individual imports | 1500+ consistent icons, tree-shakeable, maintained |
| Font loading | Manual preload/async font loading | @font-face with font-display: block | Already-proven pattern in this codebase (FiraCode) |
| Color system | Manual CSS variable management | Tailwind 4 @theme tokens | Single source of truth, automatic utility generation |

## Common Pitfalls

### Pitfall 1: Tailwind 4 @theme Border Token Split
**What goes wrong:** The current codebase uses a single `--color-border` token. D-01 introduces TWO border values (subtle #1B2028 and interactive #30363D). Components using `border-border` need audit.
**Why it happens:** Some borders are structural (panel dividers = subtle) while others are interactive (input borders, hover states = interactive).
**How to avoid:** Add both `--color-border` (subtle, default) and `--color-border-interactive` as @theme tokens. Audit all `border-border` usages and upgrade interactive elements to `border-border-interactive`.
**Warning signs:** Inputs and buttons looking invisible against backgrounds.

### Pitfall 2: Light Mode Regression
**What goes wrong:** Changing dark mode colors without updating the light mode companion palette breaks light mode.
**Why it happens:** Light mode uses [data-theme="light"] CSS override that references `--color-*-light` variables. These must be updated in parallel.
**How to avoid:** Update both dark and light palette values in the same commit. Test both modes visually.
**Warning signs:** Invisible text, unreadable inputs in light mode.

### Pitfall 3: Font Loading Flash (FOUT)
**What goes wrong:** Content renders in fallback font before Geist loads, causing layout shift.
**Why it happens:** Variable fonts are larger (~68KB) and may take a moment to load in Tauri's WKWebView.
**How to avoid:** Use `font-display: block` (already used for FiraCode). Fonts are local files in Tauri (no network request), so load time is negligible. The real risk is a typo in the font path.
**Warning signs:** System font visible briefly on app start.

### Pitfall 4: theme-manager.ts Inline Style Specificity
**What goes wrong:** theme-manager.ts sets inline CSS properties (--bg, --bg-raised, etc.) which override @theme tokens.
**Why it happens:** theme.json user customization writes inline styles on documentElement, which have higher specificity than @theme CSS.
**How to avoid:** The theme-manager property names must match the NEW @theme token names. If @theme adds `--color-bg-terminal`, theme-manager must be updated to handle it. Also, CHROME_PROPS array (line 121 of theme-manager.ts) must be updated with new token names.
**Warning signs:** Colors reverting to old palette after theme load.

### Pitfall 5: Hardcoded Colors in Existing Components
**What goes wrong:** Sidebar has inline styles like `style={{ color: '#b58900' }}` and diff-viewer has inline `style="background: rgba(133, 153, 0, 0.15)"`. These bypass the theme system.
**Why it happens:** Legacy code from pre-theme-system phases.
**How to avoid:** Replace ALL inline color values with Tailwind classes using the new semantic tokens (text-warning, text-success, text-danger, bg-success/10, etc.).
**Warning signs:** Old solarized colors visible after palette swap.

### Pitfall 6: Vite Static Asset Path for Fonts
**What goes wrong:** @font-face `src: url('/fonts/...')` may not resolve correctly in Tauri build.
**Why it happens:** Existing FiraCode is at `src/fonts/FiraCode-Light.woff2` and the CSS reference is `url('/fonts/FiraCode-Light.woff2')`. Vite serves from `src/` root in dev and builds assets. Need to confirm the path mapping.
**How to avoid:** Follow the exact same pattern as FiraCode. The existing font already works, so placing new woff2 files alongside it and using the same URL pattern is safe.
**Warning signs:** 404 errors for font files in dev console.

## Code Examples

### Color Token Migration (app.css @theme)
```css
/* Source: D-01, D-02 decisions + existing app.css structure */
@theme {
  /* Dark mode (default) */
  --color-bg: #0D1117;
  --color-bg-raised: #161B22;
  --color-bg-terminal: #010409;
  --color-border: #1B2028;
  --color-border-interactive: #30363D;
  --color-text: #8B949E;
  --color-text-bright: #E6EDF3;
  --color-accent: #258AD1;
  --color-success: #3FB950;
  --color-warning: #D29922;
  --color-danger: #F85149;

  /* Light mode values */
  --color-bg-light: #FFFFFF;
  --color-bg-raised-light: #F6F8FA;
  --color-bg-terminal-light: #FFFFFF;
  --color-border-light: #D0D7DE;
  --color-border-interactive-light: #D0D7DE;
  --color-text-light: #656D76;
  --color-text-bright-light: #1F2328;
  --color-accent-light: #0969DA;
  --color-success-light: #1A7F37;
  --color-warning-light: #9A6700;
  --color-danger-light: #CF222E;

  /* Typography */
  --font-family-sans: 'Geist', system-ui, sans-serif;
  --font-family-mono: 'GeistMono', 'FiraCode', monospace;
}
```
[ASSUMED: light mode palette values are Claude's discretion per CONTEXT.md; using GitHub-inspired light theme as starting point]

### Sidebar Project Card (mockup-derived)
```tsx
// Source: D-09 decision + Pencil mockup
import { Circle, GitBranch } from 'lucide-preact';

function ProjectRow({ project, isActive, git }: Props) {
  return (
    <div class={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer ${
      isActive ? 'bg-bg-raised' : 'hover:bg-bg-raised/50'
    }`}>
      <Circle
        size={8}
        fill={isActive ? '#3FB950' : 'transparent'}
        class={isActive ? 'text-success' : 'text-border-interactive'}
      />
      <div class="flex-1 min-w-0">
        <div class="text-sm text-text-bright truncate">{project.name}</div>
        <div class="text-[11px] text-text truncate">{project.path}</div>
      </div>
      {git.branch && (
        <span class="flex items-center gap-1 text-[11px] text-accent px-1.5 py-0.5 bg-accent/10 rounded">
          <GitBranch size={10} />
          {git.branch}
        </span>
      )}
    </div>
  );
}
```
[ASSUMED: exact styling derived from mockup description; must verify against Pencil MCP tools during implementation]

### Git File Status Badges (mockup-derived)
```tsx
// Source: D-09 decision - colored file status badges
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  'M': { label: 'M', bg: 'bg-accent/15', text: 'text-accent' },      // blue tint
  'S': { label: 'S', bg: 'bg-success/15', text: 'text-success' },     // green tint
  'U': { label: 'U', bg: 'bg-warning/15', text: 'text-warning' },     // orange tint
};
```
[ASSUMED: specific badge colors inferred from D-09 description "M=blue tint, S=green tint, U=orange tint"]

### Agent Header Card
```tsx
// Source: D-17, D-18, D-19 decisions
function AgentHeader({ agentType, version, isRunning }: Props) {
  return (
    <div class="flex items-center gap-3 px-4 py-2 bg-bg-raised border-b border-border shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-text-bright font-[Geist]">{agentType}</span>
        {version && <span class="text-xs text-text font-mono">{version}</span>}
      </div>
      <div class="ml-auto flex items-center gap-1.5">
        <Circle size={8} fill={isRunning ? '#3FB950' : '#F85149'} class={isRunning ? 'text-success' : 'text-danger'} />
        <span class={`text-xs ${isRunning ? 'text-success' : 'text-danger'}`}>
          {isRunning ? 'Ready' : 'Stopped'}
        </span>
      </div>
    </div>
  );
}
```
[ASSUMED: layout derived from D-17/D-19 decisions; must verify against Pencil mockup]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static font weight files | Variable fonts (single woff2) | 2023+ | ~50% smaller total size, infinite weight granularity |
| Solarized-derived palette | GitHub-dark inspired palette | Phase 9 | Deeper, more professional dark mode |
| FiraCode everywhere | Geist (UI) + Geist Mono (code) + FiraCode (terminal) | Phase 9 | Proportional UI text improves readability of non-code content |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Light mode companion palette using GitHub-inspired values (#FFFFFF bg, #F6F8FA raised, etc.) | Code Examples | Low -- user said light mode palette is Claude's discretion; any professional palette works |
| A2 | Geist Variable font path is `packages/next/dist/fonts/geist-sans/Geist-Variable.woff2` in GitHub repo | Architecture Patterns | Medium -- if path changed, font download fails; verified URL returned valid woff2 binary |
| A3 | GeistMono Variable font path is `packages/next/dist/fonts/geist-mono/GeistMono-Variable.woff2` | Architecture Patterns | Medium -- not directly verified but follows same naming convention |
| A4 | lucide-preact icons accept `size`, `class`, `fill` props | Code Examples | Low -- standard Lucide API across all framework bindings |
| A5 | Vite serves files from src/fonts/ at /fonts/ URL path | Pitfalls | Low -- existing FiraCode at src/fonts/ works with url('/fonts/...') |
| A6 | `claude --version` outputs a parseable version string | Architecture Patterns | Medium -- if format differs, parsing needs adjustment |

## Open Questions (RESOLVED)

1. **GeistMono-Variable.woff2 exact GitHub path**
   - What we know: Geist-Variable.woff2 confirmed at `packages/next/dist/fonts/geist-sans/`
   - What's unclear: Exact filename for Geist Mono variable font (GeistMono-Variable.woff2 vs Geist-Mono-Variable.woff2)
   - RESOLVED: Executor will check the GitHub repo at build time. Fallback: download from the `geist` npm package (`node_modules/geist/dist/fonts/geist-mono/`). Plan 01 Task 2 already includes this fallback path. Either filename works — the @font-face declaration adapts.

2. **`claude --version` output format**
   - What we know: D-18 says "run as one-shot command at startup"
   - What's unclear: Exact output format (e.g., "Claude Code v1.2.3" or "1.2.3" or multi-line)
   - RESOLVED: Plan 05 Task 1 parses the first line of stdout and extracts any version-like pattern (semver regex). If parsing fails, displays "Claude Code" as a generic label with no version. Graceful degradation — no crash path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 + jsdom |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Color tokens updated in @theme | manual-only | Visual inspection | N/A |
| UI-02 | Geist fonts load correctly | manual-only | Visual inspection | N/A |
| UI-03 | Sidebar project cards styled per mockup | manual-only | Visual inspection | N/A |
| UI-04 | Agent header shows version + status | unit | `pnpm test -- src/components/agent-header.test.tsx` | Wave 0 |
| UI-05 | Modal styling matches mockup | manual-only | Visual inspection | N/A |
| UI-06 | Tab bar pill styling | manual-only | Visual inspection | N/A |
| UI-07 | Diff viewer GitHub-style rendering | unit | `pnpm test -- src/components/diff-viewer.test.tsx` | Wave 0 |
| UI-08 | File tree with Lucide icons | manual-only | Visual inspection | N/A |

**Justification for manual-only:** Most UI-0X requirements are purely visual styling changes (CSS class updates). These are best verified by visual inspection against the Pencil mockups. The two testable units are: (1) agent header component logic (version parsing, status pill state), and (2) diff viewer HTML rendering (correct CSS classes for add/del/hunk lines).

### Sampling Rate
- **Per task commit:** Visual inspection in running app
- **Per wave merge:** Full visual review of all restyled components
- **Phase gate:** Side-by-side comparison with all 5 Pencil mockup screens

### Wave 0 Gaps
- [ ] `src/components/agent-header.test.tsx` -- covers UI-04 (version parsing, status state)
- [ ] `src/components/diff-viewer.test.tsx` -- covers UI-07 (renderDiffHtml output has correct classes)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | escapeHtml in diff-viewer (already exists) |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via diff content rendering | Tampering | escapeHtml() already applied in diff-viewer.tsx; must be retained in restyle |
| Agent version command injection | Tampering | Hardcode `--version` arg; agent name comes from project config (user-controlled, not external) |

## Sources

### Primary (HIGH confidence)
- npm registry: lucide-preact@1.8.0 -- version, peer dependencies confirmed [VERIFIED]
- Existing codebase: src/styles/app.css, src/fonts/FiraCode-Light.woff2, all component files [VERIFIED]
- Vercel geist-font GitHub: Geist-Variable.woff2 exists at raw URL, ~68KB [VERIFIED]

### Secondary (MEDIUM confidence)
- [Vercel Geist Font page](https://vercel.com/font) -- font family overview, OFL license
- [geist-font GitHub releases](https://github.com/vercel/geist-font/releases/tag/1.3.0) -- release 1.3.0 with font files
- [Fontsource Geist](https://fontsource.org/fonts/geist/install) -- alternative install method

### Tertiary (LOW confidence)
- Light mode palette values (GitHub-inspired) -- not verified against any specific reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- lucide-preact verified on npm, Geist fonts verified on GitHub
- Architecture: HIGH -- all patterns follow existing codebase conventions (font loading, @theme tokens, Preact components)
- Pitfalls: HIGH -- identified from direct codebase inspection (theme-manager.ts, inline styles, border token split)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- no fast-moving dependencies)
