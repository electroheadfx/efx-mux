---
phase: 22
slug: dynamic-tabs-vertical-split-and-preferences-modal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/preact + mockIPC |
| **Config file** | vite.config.ts / vitest.config (Phase 11 infra) |
| **Quick run command** | `pnpm test --run <test-file>` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~30s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run <affected-test-file>`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | — | TBD | unit | `pnpm test --run <file>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner populates this table during plan generation — one row per task.*

---

## Wave 0 Requirements

- [ ] Test stubs for TABS-01 (uniform dynamic tabs — sticky removal)
- [ ] Test stubs for SPLIT-01 (scope-id migration: `terminal-tabs:<project>` → `:main-0`, `right-terminal-tabs:<project>` → `:right-0`)
- [ ] Test stubs for SPLIT-02 (singleton enforcement — GSD + Git Changes `+`-menu dimming)
- [ ] Test stubs for SPLIT-03 (cross-scope drag all tab kinds)
- [ ] Test stubs for SPLIT-04 (PTY session name collision avoidance via shared per-project counter)
- [ ] Test stubs for PREF-01 (titlebar Preferences button click → `togglePreferences()`)

*Existing vitest + @testing-library/preact + mockIPC infra (Phase 11) covers all phase needs — no framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-WebGL context stability (6 scopes × multiple xterms) | SPLIT-01 | WebKit soft-caps WebGL contexts; hardware-dependent | Open 3 `main-` splits + 3 `right-` splits, each with a terminal tab. Verify no context-loss warnings in devtools for 5 min. |
| Intra-zone resize handle cursor + drag UX | SPLIT-01 | Visual/tactile — ns-resize cursor + drag smoothness | Hover between sub-panes → cursor becomes `ns-resize`. Drag → ratios persist across app restart. |
| Tab drag drop affordance (accent border + insertion slot) | SPLIT-03 | Visual | Drag a Terminal tab from `main-0` → `right-1`. Verify accent border on `right-1` tab bar + insertion-slot line. Body must NOT tint. |
| Cmd+, keybind still opens Preferences | PREF-01 | OS menu integration — hard to unit-test | Press Cmd+, → Preferences panel slides in. Click titlebar Settings button → same behavior. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
