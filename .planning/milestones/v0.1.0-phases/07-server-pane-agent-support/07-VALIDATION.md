---
phase: 7
slug: server-pane-agent-support
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (Tauri desktop app — no automated test framework configured) |
| **Config file** | none |
| **Quick run command** | `cargo build 2>&1 \| tail -5` |
| **Full suite command** | `cargo build && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo build 2>&1 | tail -5`
- **After every plan wave:** Run `cargo build && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | AGENT-01 | — | N/A | build | `cargo build` | N/A | ⬜ pending |
| 07-01-02 | 01 | 1 | AGENT-06 | — | N/A | build | `cargo build` | N/A | ⬜ pending |
| 07-01-03 | 01 | 1 | AGENT-03 | — | Binary detection validates via `which` | build | `cargo build` | N/A | ⬜ pending |
| 07-01-04 | 01 | 1 | AGENT-04 | — | Binary detection validates via `which` | build | `cargo build` | N/A | ⬜ pending |
| 07-01-05 | 01 | 1 | AGENT-05 | — | Fallback to bash when agent not found | build | `cargo build` | N/A | ⬜ pending |
| 07-02-01 | 02 | 2 | AGENT-01 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 07-02-02 | 02 | 2 | AGENT-02 | — | URL opens via system browser | build | `pnpm build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — `cargo build` and `pnpm build` verify compilation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Server pane Ctrl+` 3-state toggle | AGENT-01 | Requires GUI interaction | Press Ctrl+` repeatedly, verify cycle: strip → expanded → collapsed → strip |
| Open in Browser launches URL | AGENT-02 | Requires running dev server | Set server_url in project config, click Open, verify browser opens |
| Server Start/Stop/Restart buttons | AGENT-01 | Requires running dev server | Configure server_cmd, test each button |
| Agent binary detection | AGENT-03/04 | Requires specific binaries installed | Verify `claude`/`opencode` launches in main terminal |
| Fallback bash with banner | AGENT-05 | Requires no agent binary | Remove claude/opencode from PATH, verify bash + banner |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
