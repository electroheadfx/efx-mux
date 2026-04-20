---
phase: 22
slug: dynamic-tabs-vertical-split-and-preferences-modal
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-20
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| state.json → loadAppState | User-editable file deserialized into in-memory AppState | JSON blobs (scope/tab state) |
| terminal-tabs → PTY (Rust) | Session names flow to `invoke('spawn_terminal')` | Sanitized session name string |
| preferences-panel | Local UI state toggle | Boolean toggle |
| drag-manager → signal state | DOM events mutate signal arrays | Tab IDs, scope literals |
| CSS custom properties | Split ratios stored as CSS vars | Numeric percentages |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-22-01-01 | Tampering | state-manager.loadAppState migration | mitigate | Regex anchors `^…$`; migration only operates on whitelisted key shapes; JSON parse in try/catch | closed |
| T-22-01-02 | Tampering | terminal-tabs.allocateNextSessionName | accept | Project name sanitized by `projectSessionName` (existing allowlist); counter is integer | closed |
| T-22-01-03 | DoS | state.json thousands of legacy keys | accept | Migration O(n) bounded by normal usage | closed |
| T-22-02-01 | Spoofing | titlebar-prefs-btn gesture hijack | mitigate | `-webkit-app-region: no-drag` + drag-guard in `onMouseDown` | closed |
| T-22-02-02 | Tampering | Preferences panel state | accept | Local UI; no persisted surface | closed |
| T-22-03-01 | Tampering | handleCrossScopeDrop scope params | mitigate | Callers pass typed `TerminalScope` values; no user string reaches tmux/Rust | closed |
| T-22-03-02 | EoP | Singleton bypass via signal mutation | accept | Local-only app; no adversarial code path | closed |
| T-22-03-03 | DoS | Spamming split icon at cap | mitigate | `disabled` attribute + `atCap` check in onClick | closed |
| T-22-04-01 | Tampering | state.layout.main-active-subscopes | mitigate | JSON.parse try/catch; validate against known TerminalScope literals; fail-soft | closed |
| T-22-04-02 | Tampering | split-ratio CSS variable | accept | Pure visual; bad value → weird layout, user drags to fix | closed |
| T-22-04-03 | DoS | Spamming spawnSubScopeForZone | mitigate | Cap at 3 enforced in function + UI disabled state | closed |
| T-22-06-01 | Tampering | getTerminalScope arg | mitigate | Remap exhaustive over legacy IDs; others throw | closed |
| T-22-06-02 | DoS | restore loop iteration | accept | Bounded by max 3 entries (Phase 22 cap D-07) | closed |
| T-22-07-01 | Tampering | per-project split-state JSON | mitigate | JSON.parse try/catch + Array.isArray validation | closed |
| T-22-07-02 | DoS | first-launch flag missed write | accept | Failure mode is idempotent re-seed | closed |
| T-22-08-01 | Tampering | tab-counter session value | mitigate | parseInt + Number.isFinite + sign check; fallback to existing | closed |
| T-22-08-02 | DoS | save_state spam on rapid mutations | accept | Tab add/close user-driven (1 per click) | closed |
| T-22-09-01 | Spoofing | tab.type label rendering | mitigate | Explicit if/else-if per kind; no template interpolation of user data | closed |
| T-22-09-02 | Tampering | gsd close → null signal | accept | Idempotent; re-click is no-op | closed |
| T-22-10-01 | Tampering | closeSubScope re-pointing tabs | mitigate | Bounded loops; ownerScope from typed literal | closed |
| T-22-10-02 | DoS | spamming closeSubScope | accept | Bounded by max 3 scopes; user-driven | closed |
| T-22-11-01 | Tampering | split ratio CSS var | accept | Pure visual; user can re-drag | closed |
| T-22-11-02 | DoS | spamming attachIntraZoneHandles | mitigate | Idempotent via dataset.dragInit gate | closed |
| T-22-12-01 | Tampering | scope literal in +-menu action | mitigate | Captured from typed prop; cannot be user-mutated | closed |
| T-22-12-02 | Info Disclosure | gap-fill slot reuse | accept | Option chosen accepts reuse; no sensitive data in terminal slots | closed |
| T-22-13-01 | Tampering | scoped order array | mitigate | Filter removes duplicates; tabs ID-only | closed |
| T-22-13-02 | DoS | spamming drag operations | accept | User-driven; bounded by mouse rate | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-01-02, T-22-01-03 | Counter integer; migration bounded by usage | gsd-secure-phase | 2026-04-20 |
| AR-22-02 | T-22-02-02 | Local UI toggle; no network/persistence surface | gsd-secure-phase | 2026-04-20 |
| AR-22-03 | T-22-03-02 | Desktop app; no adversarial runtime | gsd-secure-phase | 2026-04-20 |
| AR-22-04 | T-22-04-02 | Visual-only CSS; self-healing via drag | gsd-secure-phase | 2026-04-20 |
| AR-22-05 | T-22-06-02, T-22-10-02 | Bounded by UI cap (max 3) | gsd-secure-phase | 2026-04-20 |
| AR-22-06 | T-22-07-02 | Idempotent re-seed on failure | gsd-secure-phase | 2026-04-20 |
| AR-22-07 | T-22-08-02, T-22-09-02, T-22-13-02 | User-driven rate; no amplification | gsd-secure-phase | 2026-04-20 |
| AR-22-08 | T-22-11-01 | Visual CSS; user can re-drag | gsd-secure-phase | 2026-04-20 |
| AR-22-09 | T-22-12-02 | No sensitive data in terminal session slots | gsd-secure-phase | 2026-04-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-20 | 27 | 27 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-20
