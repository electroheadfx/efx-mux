# Phase 9: Professional UI Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 09-professional-ui-overhaul
**Areas discussed:** Color system & depth, Typography & fonts, Component polish, Agent header card

---

## Color system & depth

| Option | Description | Selected |
|--------|-------------|----------|
| Use ROADMAP values exactly | Adopt #0D1117/#161B22/#010409 as specified. GitHub-dark inspired. | :heavy_check_mark: |
| Tweak toward current warmth | Blend ROADMAP values with warmer undertone to keep Solarized warmth. | |
| You decide | Claude picks best approach. | |

**User's choice:** Use ROADMAP values exactly
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Flat with border separation | bg/bg-raised distinguished by borders only. Clean and minimal, like Linear. | :heavy_check_mark: |
| Shadow elevation layers | bg/bg-raised/bg-elevated with increasing box-shadow. More 3D depth. | |
| Mix: borders + subtle shadows on modals | Flat panels, shadow on floating elements. | |

**User's choice:** Flat -- confirmed by Pencil mockup ("Same design available in pencil through MCP, i think its flat")
**Notes:** User referenced the Pencil mockup file at /Users/lmarques/Desktop/efxmux.pen as the design source of truth

| Option | Description | Selected |
|--------|-------------|----------|
| Update light mode to match new design | Create proper light companion palette. Both modes equally polished. | :heavy_check_mark: |
| Dark-only for now | Focus on dark mode. Light mode gets basic contrast fixes only. | |
| You decide | Claude picks based on effort vs impact. | |

**User's choice:** Update light mode to match new design
**Notes:** None

---

## Typography & fonts

| Option | Description | Selected |
|--------|-------------|----------|
| Self-hosted woff2 | Bundle Geist + Geist Mono woff2 files in /public/fonts/. Zero external requests. | :heavy_check_mark: |
| Google Fonts CDN | Load from fonts.googleapis.com. Smaller bundle but requires network. | |
| You decide | Claude picks. | |

**User's choice:** Self-hosted woff2
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind utility class | Create reusable `section-label` class in app.css. | :heavy_check_mark: |
| Component-level styling | Each component styles its own labels inline. | |
| You decide | Claude picks. | |

**User's choice:** Tailwind utility class
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Follow ROADMAP spec strictly | Exact sizes/weights as specified in ROADMAP. | :heavy_check_mark: |
| Use mockup as reference, adjust as needed | Start from ROADMAP, allow adjustments. | |
| You decide | Claude uses best judgment. | |

**User's choice:** Follow ROADMAP spec strictly
**Notes:** None

---

## Component polish

| Option | Description | Selected |
|--------|-------------|----------|
| Match mockup pixel-for-pixel | Rebuild sidebar project cards to match Pencil design exactly. | :heavy_check_mark: |
| Incremental -- badges first | Add badges to existing layout, refine later. | |
| You decide | Claude matches mockup spirit. | |

**User's choice:** Match mockup pixel-for-pixel
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Full GitHub-style | File header, stats badge, line numbers, left border accents. | :heavy_check_mark: |
| Visual upgrade only | Better colors/borders but keep simple structure. | |
| You decide | Claude matches as closely as practical. | |

**User's choice:** Full GitHub-style
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Add lucide-preact | Install lucide-preact for consistent tree-shakeable icons. | :heavy_check_mark: |
| Inline SVGs only | Copy specific SVG paths inline. No new dependency. | |
| You decide | Claude picks based on bundle impact. | |

**User's choice:** Add lucide-preact
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Restyle existing components | Keep logic, update Tailwind classes to match mockup. | :heavy_check_mark: |
| Rebuild from mockup | Rewrite modal components from scratch. | |
| You decide | Claude assesses each modal. | |

**User's choice:** Restyle existing components
**Notes:** None

---

## Agent header card

| Option | Description | Selected |
|--------|-------------|----------|
| Run `claude --version` at startup | One-shot command before agent session. Parse version string. | :heavy_check_mark: |
| Static label from project config | Use agent type from config as static label. | |
| You decide | Claude picks. | |

**User's choice:** Run `claude --version` at startup
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Process alive = Ready | Green when PTY running, red when exited/crashed. | :heavy_check_mark: |
| Static decorative | Always shows 'Ready'. Purely cosmetic. | |
| You decide | Claude decides. | |

**User's choice:** Process alive = Ready
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Above terminal tabs | Agent card is fixed header above tab bar. Always visible. | :heavy_check_mark: |
| Inside the tab bar row | Agent info integrated into tab bar, tabs on right. | |
| You decide | Claude matches mockup. | |

**User's choice:** Above terminal tabs
**Notes:** None

---

## Claude's Discretion

- Light mode companion palette specific color values
- Exact Geist font weights to bundle
- GSD viewer styling updates
- Bottom status bar styling
- Transition/animation approach
- Modal overlay shadow values

## Deferred Ideas

None -- discussion stayed within phase scope
