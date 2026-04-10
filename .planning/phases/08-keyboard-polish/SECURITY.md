# SECURITY.md — Phase 08: Keyboard Polish

**Generated:** 2026-04-10
**ASVS Level:** 1
**Block on:** critical

---

## Threat Verification Summary

**Threats Closed:** 8/8
**Threats Open:** 0/8

---

## Threat Register

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-08-02 | DoS | accept | CLOSED | Accepted risks log (see below) |
| T-08-05 | DoS | mitigate | CLOSED | `terminal-tabs.tsx:40` — `let tabCounter = 0`; `terminal-tabs.tsx:100` — `tab-${Date.now()}-${tabCounter}` monotonic ID; no tab limit (iTerm2 parity) |
| T-08-09 | Info Disclosure | accept | CLOSED | Accepted risks log (see below) |
| T-08-04-01 | Tampering | accept | CLOSED | Accepted risks log (see below) |
| T-08-05-02 | Info Disclosure | mitigate | CLOSED | `pty.rs:250` — `.unwrap_or(0)` — parse failure defaults to exit code 0, comment reads `// T-08-05-02: default to 0 if parsing fails` |
| T-08-06-02 | DoS | mitigate | CLOSED | `terminal-tabs.tsx:287` — `terminal.writeln('\r\n\x1b[33mWarning: Could not attach to tmux session...')` — warning banner written to terminal on connectPty failure |
| T-08-07-02 | Tampering | mitigate | CLOSED | `state-manager.ts:34` — `project: { active: string \| null; projects: ProjectEntry[] }` — projects field present in AppState; `state-manager.ts:104-105` and `state-manager.ts:163-164` — signals synced into state before every save path (saveAppState and initBeforeUnload) |
| T-08-08-01 | Info Disclosure | accept | CLOSED | Accepted risks log (see below) |

---

## Mitigation Evidence Detail

### T-08-05 (DoS — tab creation)
The tab ID is composed of `Date.now()` and a monotonically incrementing `tabCounter`. No upper bound on tab count is enforced, consistent with iTerm2 behavior declared in the mitigation plan. Each tab creation goes through `createNewTab()` in `terminal-tabs.tsx`. The counter is reset via `clearAllTabs()` on project switch.

**Files searched:** `/Users/lmarques/Dev/efx-mux/src/components/terminal-tabs.tsx`
**Pattern found at:** line 40 (`tabCounter`), line 100 (`tab-${Date.now()}-${tabCounter}`)

### T-08-05-02 (Info Disclosure — exit code parsing)
The pane-death monitoring thread in `pty.rs` queries `#{pane_dead_status}` via tmux, parses the output as `i32`, and calls `.unwrap_or(0)` when parsing fails. The comment at line 250 explicitly cites `T-08-05-02`. The session-gone branch at line 215-218 also hardcodes `"code": 0`.

**Files searched:** `/Users/lmarques/Dev/efx-mux/src-tauri/src/terminal/pty.rs`
**Pattern found at:** line 250 (`.unwrap_or(0)` with `T-08-05-02` comment)

### T-08-06-02 (DoS — tmux session gone)
`connectPty` in `terminal-tabs.tsx` wraps the PTY connect call in a try/catch. On failure, a yellow ANSI warning is written directly to the terminal: `Warning: Could not attach to tmux session "${sessionName}"`. This matches the declared mitigation "warning banner."

**Files searched:** `/Users/lmarques/Dev/efx-mux/src/components/terminal-tabs.tsx`
**Pattern found at:** line 287 (`terminal.writeln` with warning text)

### T-08-07-02 (Tampering — state overwrite)
The `AppState` interface declares `project: { active: string | null; projects: ProjectEntry[] }`. The `saveAppState` function (called on every state mutation) syncs `projects.value` into `state.project.projects` before `JSON.stringify`. The `initBeforeUnload` listener performs the same sync. The `loadAppState` function restores `projects.value` from the persisted `project.projects` array.

Note: The implementation uses `project.projects` (nested) rather than a top-level `projects` field. The save-cycle protection is functionally equivalent to the plan's declared mitigation and is effective.

**Files searched:** `/Users/lmarques/Dev/efx-mux/src/state-manager.ts`
**Pattern found at:** line 34 (interface), lines 103-105 (saveAppState sync), lines 162-164 (beforeunload sync), lines 87-89 (loadAppState restore)

---

## Accepted Risks Log

| Threat ID | Category | Component | Rationale |
|-----------|----------|-----------|-----------|
| T-08-02 | DoS | cheatsheet overlay | Static content; no dynamic rendering from user input; toggle is idempotent. Risk: negligible. |
| T-08-09 | Info Disclosure | wizard state | Wizard collects project path and name — user's own locally stored data, same scope as existing project-modal. No network transmission. Risk: accepted (local-only). |
| T-08-04-01 | Tampering | CustomEvent dispatch | `CustomEvent('open-fuzzy-search')` is internal dispatch within the same document context. `openSearch()` only toggles a visibility signal. No external input vector. Risk: none. |
| T-08-08-01 | Info Disclosure | preferences display | Read-only display of project config (name, path, agent) already held in memory. No sensitive credentials. No network exposure. Risk: accepted (same scope as sidebar). |

---

## Unregistered Flags

None. No `## Threat Flags` sections were present in any of the 8 SUMMARY files for this phase.

---

*Audited by gsd-security-auditor against threat register in PLAN.md files 08-01 through 08-08.*
*Implementation files are read-only; no patches applied.*
