# Phase 11: Test Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 11-Test Infrastructure
**Areas discussed:** Mock strategy, Coverage policy, Test file organization

---

## Mock Strategy

### Tauri IPC Mocking

| Option | Description | Selected |
|--------|-------------|----------|
| Global setup file | Auto-mock invoke/listen in vitest.setup.ts. Tests override specific commands as needed. Less boilerplate per test | ✓ |
| Per-test manual mock | Each test imports and configures mockIPC(). More verbose but explicit about what's mocked | |
| Typed mock factory | Build typed wrapper around mockIPC with predefined responses for all 25 commands. Most robust, most upfront work | |

**User's choice:** Global setup file
**Notes:** None

### xterm.js Handling

| Option | Description | Selected |
|--------|-------------|----------|
| vi.mock auto-mock | Auto-mock @xterm/xterm in setup file. Modules importing Terminal get a stub. Simplest approach | ✓ |
| Manual mock per test | Only mock xterm in tests that actually need it. More targeted but more boilerplate | |
| Skip testing those modules | Don't test any module that transitively imports Terminal. Limits scope | |

**User's choice:** vi.mock auto-mock
**Notes:** None

---

## Coverage Policy

### Threshold Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Soft targets, no CI gate | Track coverage but don't fail CI on thresholds. Focus on writing good tests, not hitting numbers | |
| Moderate thresholds (60-70%) | Gate CI on reasonable coverage. Prevents regressions without being oppressive | ✓ |
| Per-module targets | Different thresholds per directory (e.g. 80% for utils, 40% for components). More nuanced | |

**User's choice:** Moderate thresholds (60-70%)
**Notes:** None

### Coverage Exclusions

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal + PTY modules only | Exclude terminal-manager, pty-bridge, resize-handler. Everything else counted | |
| Terminal + components | Also exclude Preact components from coverage | |
| You decide | Claude picks sensible exclusions based on what's testable in jsdom | ✓ |

**User's choice:** You decide (Claude's discretion)
**Notes:** None

---

## Test File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Colocated | foo.test.ts next to foo.ts. Already supported by vitest config. Easy to find, moves with source | ✓ |
| Centralized __tests__/ | All tests in src/__tests__/ mirroring src/ structure. Keeps src/ cleaner but harder to navigate | |
| Hybrid | Unit tests colocated, integration tests in separate test/ dir at root | |

**User's choice:** Colocated
**Notes:** Already supported by existing vitest config pattern `src/**/*.test.{ts,tsx}`

---

## Claude's Discretion

- Coverage exclusion list (which modules to exclude based on jsdom testability)
- WebCrypto polyfill implementation details
- Signal reset utility implementation
- Exact coverage threshold numbers within 60-70% range

## Deferred Ideas

None
