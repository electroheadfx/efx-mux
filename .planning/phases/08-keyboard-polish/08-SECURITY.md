---
phase: 08
slug: keyboard-polish
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-10
---

# Phase 08 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Frontend ↔ Tauri IPC | Keyboard events dispatched via invoke/emit | Key codes, tab IDs, state JSON |
| Tauri ↔ tmux/PTY | Shell process spawning and exit code reading | Process handles, exit codes, session names |
| State persistence | AppState serialized to local JSON file | Project paths, tab state, preferences |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-08-02 | DoS | cheatsheet overlay | accept | Static content, idempotent toggle | closed |
| T-08-05 | DoS | tab creation | mitigate | Monotonic `tabCounter` + `Date.now()` composite ID (terminal-tabs.tsx:40,100) | closed |
| T-08-09 | Info Disclosure | wizard state | accept | User's own data stored locally | closed |
| T-08-04-01 | Tampering | CustomEvent dispatch | accept | Internal dispatch, no external input vector | closed |
| T-08-05-02 | Info Disclosure | exit code parsing | mitigate | `.unwrap_or(0)` default on parse failure (pty.rs:250) | closed |
| T-08-06-02 | DoS | tmux session gone | mitigate | ANSI warning banner on connectPty failure (terminal-tabs.tsx:287) | closed |
| T-08-07-02 | Tampering | state overwrite | mitigate | `project.projects` field in AppState; synced before every save path (state-manager.ts:34,103-105,162-164) | closed |
| T-08-08-01 | Info Disclosure | preferences display | accept | Read-only display of in-memory config, no credentials | closed |

*Status: open / closed*
*Disposition: mitigate (implementation required) / accept (documented risk) / transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-08-02 | Static content, no dynamic rendering from user input; toggle is idempotent | plan author | 2026-04-10 |
| AR-08-02 | T-08-09 | Wizard data (project path, name) is user's own data stored locally; same scope as project-modal | plan author | 2026-04-10 |
| AR-08-03 | T-08-04-01 | CustomEvent('open-fuzzy-search') is internal dispatch within same document context; no external input vector | plan author | 2026-04-10 |
| AR-08-04 | T-08-08-01 | Read-only display of project config already in memory; no sensitive data exposed, no network calls | plan author | 2026-04-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-10 | 8 | 8 | 0 | gsd-security-auditor (sonnet) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-10
