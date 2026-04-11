---
phase: 10
slug: pixel-perfect-ui-rewrite
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-10
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (if configured) / manual visual verification |
| **Config file** | vite.config.ts or vitest.config.ts |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm build && pnpm check` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run `pnpm build && pnpm check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | UI-01, UI-02 | — | N/A | build | `pnpm build` | `src/tokens.ts` | pending |
| 10-01-02 | 01 | 1 | UI-01, UI-02 | — | N/A | build | `pnpm build` | `src/styles/app.css` | pending |
| 10-01-03 | 01 | 1 | UI-01, UI-02 | — | N/A | build | `pnpm build` | `src/styles/app.css` | pending |
| 10-02-01 | 02 | 2 | UI-01, UI-04 | — | N/A | build | `pnpm build` | `src/components/tab-bar.tsx` | pending |
| 10-02-02 | 02 | 2 | UI-01, UI-04 | — | N/A | build | `pnpm build` | `src/components/agent-header.tsx` | pending |
| 10-02-03 | 02 | 2 | UI-01, UI-04 | — | N/A | build | `pnpm build` | `src/components/crash-overlay.tsx` | pending |
| 10-03-01 | 03 | 2 | UI-01, UI-04, UI-07, PANEL-04 | — | N/A | build | `pnpm build` | `src/components/diff-viewer.tsx` | pending |
| 10-03-02 | 03 | 2 | UI-01, UI-04, UI-07, PANEL-05 | — | N/A | build | `pnpm build` | `src/components/file-tree.tsx` | pending |
| 10-04-01 | 04 | 2 | UI-01, UI-04, PANEL-02 | — | N/A | build | `pnpm build` | `src/components/gsd-viewer.tsx` | pending |
| 10-04-02 | 04 | 2 | UI-01, UI-04, PANEL-02 | — | N/A | build | `pnpm build` | `src/styles/app.css` | pending |
| 10-05-01 | 05 | 5 | UI-01, UI-04, SIDE-01, SIDE-02 | — | N/A | build | `pnpm build` | `src/components/sidebar.tsx` | pending |
| 10-06-01 | 06 | 6 | UI-01, UI-02, UI-04, UI-05, UI-06 | — | N/A | build | `pnpm build` | `src/components/main-panel.tsx` | pending |
| 10-06-02 | 06 | 6 | UI-01, UI-02, UI-04, UI-05, UI-06 | — | N/A | build | `pnpm build` | `src/components/right-panel.tsx` | pending |
| 10-06-03 | 06 | 6 | UI-01, UI-02, UI-04, UI-05, UI-06 | — | N/A | manual | Wave 0 | — | pending |
| 10-07-01 | 07 | 2 | UI-01, UI-04, AGENT-01 | — | N/A | build | `pnpm build` | `src/components/server-pane.tsx` | pending |
| 10-08-01 | 08 | 2 | UI-01, UI-04, PROJ-01 | — | N/A | build | `pnpm build` | `src/components/project-modal.tsx` | pending |
| 10-08-02 | 08 | 2 | UI-01, UI-04, PROJ-01 | — | N/A | build | `pnpm build` | `src/components/preferences-panel.tsx` | pending |
| 10-09-01 | 09 | 2 | UI-01, UI-02, UI-03, UX-01 | — | N/A | build | `pnpm build` | `src/components/terminal-tabs.tsx` | pending |
| 10-09-02 | 09 | 2 | UI-01, UI-02, UI-03, UX-01 | — | N/A | build | `pnpm build` | `src/components/first-run-wizard.tsx` | pending |
| 10-09-03 | 09 | 2 | UI-01, UI-02, UI-03, UX-01 | — | N/A | build | `pnpm build` | `src/components/fuzzy-search.tsx` | pending |
| 10-09-04 | 09 | 2 | UI-01, UI-02, UI-03, UX-01 | — | N/A | build | `pnpm build` | `src/components/shortcut-cheatsheet.tsx` | pending |
| 10-10-01 | 10 | 2 | UI-01 | — | N/A | build | `pnpm build` | `src/styles/app.css` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 dependencies (visual/manual testing):

| Task ID | What | Why Wave 0 |
|---------|------|------------|
| 10-06-03 | Human verify: main-panel.tsx + right-panel.tsx composition | Container component visual correctness requires human inspection |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pixel-perfect color match | D-01 to D-05 | Visual comparison to reference design | Run reference app and production app side-by-side, compare each component |
| Typography match | D-13 | Font rendering varies by platform | Inspect computed styles in DevTools, compare to tokens.ts fontSizes |
| Responsive layout | D-12 | Drag-resize behavior is interactive | Resize panels, verify min/max constraints and smooth resizing |
| Component visual fidelity | D-11 | Subjective visual assessment | Compare each component to RESEARCH/theme/ reference screenshots |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending