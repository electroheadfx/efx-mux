---
phase: 10
slug: pixel-perfect-ui-rewrite
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 10-01-01 | 01 | 1 | TBD | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. This phase is a visual rewrite — validation is primarily build success and visual inspection.*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
