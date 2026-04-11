# Phase 10: Pixel-Perfect UI Rewrite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 10-pixel-perfect-ui-rewrite
**Areas discussed:** Color palette overhaul, Component rewrite strategy, Token system architecture, Scope & fidelity

---

## Color Palette Overhaul

| Option | Description | Selected |
|--------|-------------|----------|
| Reference navy-blue (Recommended) | Replace Phase 9 colors with RESEARCH/theme/tokens.ts palette. This is the design built as the visual source of truth. | ✓ |
| Keep Phase 9 GitHub-dark | Stay with current #0D1117/#161B22 palette. Only adopt reference's component structure and spacing, not its colors. | |
| Hybrid | Use reference palette for most surfaces but keep some Phase 9 values (e.g., accent #258AD1 is the same in both). | |

**User's choice:** Reference navy-blue (Recommended)
**Notes:** Full palette replacement from GitHub-dark to navy-blue family (#0B1120, #111927, #19243A, #243352, #324568)

---

## Token System Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind @theme + tokens.ts (Recommended) | Update @theme CSS vars to match reference palette. Also create a tokens.ts for components that need computed styles. Best of both worlds. | ✓ |
| Pure tokens.ts inline styles | Match reference exactly: all styling via inline style={{}} using tokens.ts. Remove Tailwind @theme dependency. | |
| Pure Tailwind @theme | Map all reference colors into @theme CSS vars. No tokens.ts file. Use Tailwind classes everywhere. | |

**User's choice:** Tailwind @theme + tokens.ts (Recommended)
**Notes:** Dual system: Tailwind @theme for utility classes, tokens.ts for inline styles and computed values

---

## Component Rewrite Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Replace visual layer only (Recommended) | Keep existing component logic but replace the JSX/styling to match reference. | |
| Full component replacement | Replace each component file entirely with the reference version, then wire in existing logic. | ✓ |
| Side-by-side migration | Create new components alongside old ones, switch over one at a time. | |

**User's choice:** Full component replacement
**Notes:** Replace files entirely with reference versions, then wire existing application logic back in. Higher fidelity to reference design.

---

## Scope & Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Pixel-perfect design, responsive layout (Recommended) | Match reference colors, spacing, typography exactly. Keep drag-resizable splits and responsive behavior. | ✓ |
| Pixel-perfect everything | Match reference dimensions exactly including fixed widths. Remove drag-resize. | |
| Design language only | Adopt reference's visual language but keep current component structure and adapt freely. | |

**User's choice:** Pixel-perfect design, responsive layout (Recommended)
**Notes:** Exact visual fidelity to reference design tokens and component structure, but responsive layout behavior preserved

---

## Claude's Discretion

- Light mode companion palette for navy-blue dark palette
- Server pane, GSD viewer, crash overlay, first-run wizard styling adaptations
- Fuzzy search and shortcut cheatsheet styling updates
- Integration wiring order and testing strategy

## Deferred Ideas

None — discussion stayed within phase scope
