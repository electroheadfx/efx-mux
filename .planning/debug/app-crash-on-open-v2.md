---
status: awaiting_human_verify
trigger: "App crashes when opening. Recurring issue. Reproduce with pnpm tauri dev."
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: lucide-preact dependency is declared in package.json but not installed in node_modules, causing Vite to fail resolving imports at dev startup
test: Check node_modules/lucide-preact existence
expecting: Directory missing = confirms hypothesis
next_action: Run pnpm install to install the missing dependency

## Symptoms

expected: App opens normally and displays the UI
actual: App crashes on open
errors: TS2307 Cannot find module 'lucide-preact'; node_modules/lucide-preact does not exist
reproduction: Run `pnpm tauri dev` from /Users/lmarques/Dev/efx-mux
started: Recurring issue, after recent changes adding lucide-preact imports

## Eliminated

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: cargo check (Rust compilation)
  found: Compiles successfully -- tokio dependency already added from previous debug session
  implication: Crash is NOT a Rust compilation issue

- timestamp: 2026-04-10T00:00:00Z
  checked: tsc --noEmit (TypeScript type check)
  found: 3 errors -- all TS2307 "Cannot find module 'lucide-preact'" in agent-header.tsx, file-tree.tsx, sidebar.tsx
  implication: Frontend cannot compile due to missing dependency

- timestamp: 2026-04-10T00:00:00Z
  checked: node_modules/lucide-preact directory
  found: Does not exist. Also checked node_modules/.pnpm/lucide-* -- no matches.
  implication: pnpm install was not run after lucide-preact was added to package.json

- timestamp: 2026-04-10T00:00:00Z
  checked: package.json
  found: lucide-preact ^1.8.0 is declared in dependencies
  implication: Dependency declared but never installed

## Resolution

root_cause: lucide-preact is listed in package.json dependencies but was never installed (pnpm install not run after it was added). Three components (agent-header.tsx, sidebar.tsx, file-tree.tsx) import from it, causing Vite to fail at dev startup, which crashes the Tauri app on open.
fix: Run pnpm install to install the missing dependency (lucide-preact 1.8.0)
verification: tsc --noEmit passes with 0 errors; vite build succeeds (768ms, all 1750 modules transformed)
files_changed: [node_modules/lucide-preact (installed via pnpm)]
