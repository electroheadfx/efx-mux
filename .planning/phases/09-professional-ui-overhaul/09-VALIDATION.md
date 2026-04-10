---
phase: 9
slug: professional-ui-overhaul
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 + jsdom |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Visual inspection in running app
- **After every plan wave:** Full visual review of all restyled components
- **Before `/gsd-verify-work`:** Side-by-side comparison with all 5 Pencil mockup screens
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | UI-01 | — | N/A | manual-only | Visual inspection | N/A | ⬜ pending |
| 09-01-02 | 01 | 1 | UI-02 | — | N/A | manual-only | Visual inspection | N/A | ⬜ pending |
| 09-02-01 | 02 | 1 | UI-03 | — | N/A | manual-only | Visual inspection | N/A | ⬜ pending |
| 09-03-01 | 03 | 1 | UI-04 | — | N/A | unit | `pnpm test -- src/components/agent-header.test.tsx` | ❌ W0 | ⬜ pending |
| 09-04-01 | 04 | 2 | UI-05 | — | N/A | manual-only | Visual inspection | N/A | ⬜ pending |
| 09-05-01 | 05 | 2 | UI-06 | — | N/A | manual-only | Visual inspection | N/A | ⬜ pending |
| 09-06-01 | 06 | 2 | UI-07 | — | N/A | unit | `pnpm test -- src/components/diff-viewer.test.tsx` | ❌ W0 | ⬜ pending |
| 09-07-01 | 07 | 2 | UI-08 | — | N/A | manual-only | Visual inspection | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/agent-header.test.tsx` — stubs for UI-04 (version parsing, status state)
- [ ] `src/components/diff-viewer.test.tsx` — stubs for UI-07 (renderDiffHtml output classes)

*Existing infrastructure covers remaining requirements via manual visual inspection.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Color tokens applied globally | UI-01 | Pure CSS token update | Verify all panels use #0D1117 bg, #161B22 raised in running app |
| Geist fonts render correctly | UI-02 | Font loading is visual | Inspect sidebar text is Geist, terminal chrome is Geist Mono |
| Sidebar project cards styled | UI-03 | Visual design fidelity | Compare sidebar with Pencil mockup (JtCpP) |
| Modal styling matches mockup | UI-05 | Visual design fidelity | Compare Add Project modal with Pencil mockup (JyvDG) |
| Tab bar pill styling | UI-06 | Visual design fidelity | Verify active tab has filled bg + subtle border |
| File tree with Lucide icons | UI-08 | Visual design fidelity | Compare file tree with Pencil mockup (leQ9s) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
