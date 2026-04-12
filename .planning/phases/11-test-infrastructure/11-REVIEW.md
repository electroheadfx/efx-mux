---
phase: 11-test-infrastructure
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - vitest.config.ts
  - vitest.setup.ts
  - src/__test__/canary.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the Vitest configuration, the global test setup file, and the canary smoke-test suite. The infrastructure is well-structured and the mocking strategy for Tauri IPC and xterm.js is sound. Two warnings were found — one involving a top-level `await` in a setup file and one involving a probabilistically flaky assertion — and three informational items covering typing, coverage-threshold philosophy, and a test-isolation gap.

## Warnings

### WR-01: Top-level `await` in a non-ESM setup file may silently fail or require special bundler support

**File:** `vitest.setup.ts:9`
**Issue:** `await import('node:crypto')` is used at the top level of `vitest.setup.ts` outside any `async` function. Top-level `await` requires the file to be treated as an ES module (i.e., the enclosing package must have `"type": "module"` in `package.json`, or the file must use the `.mts` extension). If the project is not configured this way, Node.js will throw a `SyntaxError` at setup time, silently aborting all tests rather than producing a clear diagnostic. Vitest generally handles this via its own ESM transform pipeline, but the behaviour depends on whether the setup file is processed before Vite's transform or after. If another test runner or direct Node invocation is ever used, this will break.
**Fix:** Wrap the conditional polyfill in an async IIFE to avoid dependence on ambient top-level await support:
```typescript
// vitest.setup.ts line 8-16 — replace with:
if (!globalThis.crypto?.getRandomValues) {
  (async () => {
    const { randomFillSync } = await import('node:crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (buf: Uint8Array) => randomFillSync(buf),
        subtle: {},
      },
    });
  })();
}
```
Alternatively, use the synchronous `require('node:crypto')` form since this code only runs in Node (jsdom environment):
```typescript
if (!globalThis.crypto?.getRandomValues) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomFillSync } = require('node:crypto') as typeof import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (buf: Uint8Array) => randomFillSync(buf),
      subtle: {},
    },
  });
}
```

---

### WR-02: Probabilistically flaky assertion in WebCrypto polyfill test

**File:** `src/__test__/canary.test.ts:21`
**Issue:** The assertion `expect(buf.some((b) => b !== 0)).toBe(true)` relies on the statistical near-impossibility of all 16 bytes being zero (probability 1/256^16). While this will essentially never fail in practice, it is not deterministic — a strict CI policy that flags non-deterministic tests will flag this. More importantly, the comment "probabilistically certain" signals that the assertion does not actually verify correctness; it merely verifies that `randomFillSync` was called and produced output, not that the polyfill wiring is correct.
**Fix:** Assert the byte array was mutated in a verifiable way by spying on the underlying function, or simply assert the return value identity and that the buffer object is the same instance returned:
```typescript
it('has WebCrypto polyfill active', () => {
  expect(globalThis.crypto).toBeDefined();
  expect(globalThis.crypto.getRandomValues).toBeInstanceOf(Function);
  const buf = new Uint8Array(16);
  const result = globalThis.crypto.getRandomValues(buf);
  // Verify the function returns the same buffer (spec-compliant behaviour)
  expect(result).toBe(buf);
});
```
If the mock/polyfill is `randomFillSync`-backed, `result` will be `buf` (node `randomFillSync` returns the filled buffer), making this a deterministic assertion.

---

## Info

### IN-01: `(globalThis as any)` casts suppress type safety in setup file

**File:** `vitest.setup.ts:22-23, 26, 36-37`
**Issue:** Six uses of `(globalThis as any)` suppress TypeScript checks for the Tauri global properties. This is common in test setup, but declaring a local interface extension would be safer and communicates intent:
```typescript
declare global {
  // eslint-disable-next-line no-var
  var __TAURI_INTERNALS__: { postMessage: ReturnType<typeof vi.fn>; ipc: ReturnType<typeof vi.fn> } | undefined;
  var __TAURI_EVENT_PLUGIN_INTERNALS__: Record<string, unknown> | undefined;
}
```
This is low priority (test files only) but would catch accidental typos in property names.

---

### IN-02: Coverage thresholds set at 60% may drift low without clear ownership

**File:** `vitest.config.ts:27-31`
**Issue:** All four coverage thresholds (statements, branches, functions, lines) are set to 60%. This is a reasonable starting point but provides no upward ratchet — once tests are added, there is nothing preventing the threshold from staying at 60% as the codebase grows. Consider adding a comment documenting the intended trajectory (e.g., "target 80% by Phase 15") so future contributors know the threshold is provisional.
**Fix:** Add a comment inline:
```typescript
thresholds: {
  // Starting threshold — raise to 80 once Phase 12+ component tests land
  statements: 60,
  branches: 60,
  functions: 60,
  lines: 60,
},
```

---

### IN-03: INFRA-04 coverage smoke test asserts only that the module is defined, not that instrumentation ran

**File:** `src/__test__/canary.test.ts:65-70`
**Issue:** The coverage smoke test imports `../tokens` and asserts `tokens` is defined. This does exercise the import path and ensures coverage instrumentation does not crash, but it does not verify that `v8` coverage data is actually being collected. This is acceptable as a smoke test but the comment "validates that coverage instrumentation works" slightly overstates what is being checked. No functional issue — just a documentation accuracy note.
**Fix:** Update the comment:
```typescript
// Importing a real source module ensures the coverage instrumentation
// pipeline does not crash on source files (does NOT verify v8 data is emitted).
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
