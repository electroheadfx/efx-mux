---
phase: 07-server-pane-agent-support
reviewed: 2026-04-09T16:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src-tauri/src/server.rs
  - src-tauri/src/lib.rs
  - src/components/server-pane.tsx
  - src/main.tsx
  - src/server/server-bridge.ts
  - src/server/ansi-html.ts
  - src/styles/app.css
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-09T16:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed 7 source files for Phase 7 (Server Pane + Agent Support). The architecture is solid: Rust backend manages per-project server processes with process group signals, EOF-based exit detection, and proper zombie reaping. The frontend TypeScript layer correctly HTML-escapes before ANSI processing (T-07-03 XSS mitigation), implements per-project server state caching for workspace isolation, and handles process lifecycle events with SIGTERM/SIGKILL signal code filtering. No critical issues found in this file scope. Four warnings cover a render-time signal mutation pattern, unclamped RGB values in ANSI parsing, a bare ANSI reset sequence not being matched, and a cache miss for background project output. The `lib.rs` setup, `server-bridge.ts` bridge, and `app.css` styles are clean.

## Warnings

### WR-01: Signal Mutation During Render Body Can Cause Re-render Loop

**File:** `src/components/server-pane.tsx:107-111`
**Issue:** The `ServerPane` component mutates the `serverStatus` signal directly in the render function body (not inside `useEffect`). When the signal value changes, Preact re-renders the component, which re-evaluates the same condition. The guard conditions prevent infinite loops currently, but this is a fragile pattern -- if a future change alters the guard logic, an infinite loop results.
**Fix:** Move status synchronization into a `useEffect`:
```tsx
useEffect(() => {
  const isUnconfigured = !project?.server_cmd;
  if (isUnconfigured && serverStatus.value !== 'unconfigured' && serverStatus.value !== 'running') {
    serverStatus.value = 'unconfigured';
  } else if (!isUnconfigured && serverStatus.value === 'unconfigured') {
    serverStatus.value = 'stopped';
  }
}, [project?.server_cmd]);
```

### WR-02: Unclamped RGB Values in ANSI Truecolor Parsing

**File:** `src/server/ansi-html.ts:83-84`
**Issue:** RGB values extracted from ANSI truecolor sequences (`38;2;R;G;B`) are used directly in hex color construction without clamping to the valid 0-255 range. A malformed ANSI sequence with values > 255 or negative values would produce invalid CSS color strings (e.g., `#1ff0000` for R=511). The same issue exists for background truecolor on lines 98-99. While unlikely from well-behaved programs, server processes can emit arbitrary byte sequences.
**Fix:** Clamp RGB values before hex conversion:
```typescript
const clamp = (v: number) => Math.max(0, Math.min(255, v));
const r = clamp(parts[i + 2]), g = clamp(parts[i + 3]), b = clamp(parts[i + 4]);
```
Apply at both foreground (line 83) and background (line 98) truecolor handling.

### WR-03: ANSI Bare Reset `\x1b[m` Not Matched, Causes Unclosed Spans

**File:** `src/server/ansi-html.ts:59`
**Issue:** The regex `\x1b\[(\d+(?:;\d+)*)m` requires at least one digit. The common ANSI reset `\x1b[m` (no digits, equivalent to `\x1b[0m`) does not match. It falls through to the strip-remaining regex on line 129 and is silently removed, but any open `<span>` tags from prior color codes remain unclosed. This causes style bleed across log lines -- a colored line's style leaks into subsequent uncolored lines.
**Fix:** Make the digit group optional:
```typescript
escaped = escaped.replace(/\x1b\[(\d+(?:;\d+)*)?m/g, (_match, codes: string | undefined) => {
  if (!codes) {
    // Bare \x1b[m = reset
    const result = '</span>'.repeat(openSpans);
    openSpans = 0;
    return result;
  }
  // ... existing logic unchanged
});
```

### WR-04: Cache Miss for Background Project Output

**File:** `src/components/server-pane.tsx:148-170`
**Issue:** When server output arrives for a non-active project, the code retrieves the cache via `projectServerCache.get(project)` on line 149. If the cache entry does not exist (e.g., a server was started, app restarted, and output arrives before the user visits that project), lines 165-170 skip the cache update entirely because `cached` is undefined. Switching to that project later shows empty logs despite the server being active.
**Fix:** Initialize a cache entry when output arrives for an uncached project:
```typescript
let cached = projectServerCache.get(project);
if (!cached && project !== activeProjectName.value) {
  cached = { logs: [], status: 'running', url: null };
  projectServerCache.set(project, cached);
}
```

## Info

### IN-01: Fire-and-Forget invoke Without Error Handling

**File:** `src/main.tsx:269`
**Issue:** `invoke('set_project_path', { path: project.path })` is called without `await` and without `.catch()`. If this invocation fails, the error is silently swallowed. While unlikely to fail in practice, it deviates from the error-handling pattern used elsewhere in the same function.
**Fix:** Add `await`:
```typescript
await invoke('set_project_path', { path: project.path });
```

### IN-02: Duplicate 3-State Cycle Logic

**File:** `src/main.tsx:131-134` and `src/components/server-pane.tsx:277-281`
**Issue:** The 3-state cycle logic (`strip -> expanded -> collapsed -> strip`) is duplicated between the Ctrl+S keyboard handler in `main.tsx` and the `handleToggle` click handler in `server-pane.tsx`. Both independently implement the same state machine including the `updateLayout` call and `initDragManager` re-initialization. If the cycle order or side effects change, both locations must be updated.
**Fix:** Extract the cycle logic into a shared exported function in `server-pane.tsx`:
```typescript
export function cycleServerPaneState() {
  const current = serverPaneState.value;
  if (current === 'strip') serverPaneState.value = 'expanded';
  else if (current === 'expanded') serverPaneState.value = 'collapsed';
  else serverPaneState.value = 'strip';
  updateLayout({ 'server-pane-state': serverPaneState.value });
  if (serverPaneState.value === 'expanded') {
    requestAnimationFrame(() => initDragManager());
  }
}
```

### IN-03: Magic String Array for Server Pane State Validation

**File:** `src/main.tsx:146`
**Issue:** The inline array `['strip', 'expanded', 'collapsed']` duplicates the type definition from the `serverPaneState` signal in `server-pane.tsx`. If a new state is added, both locations must be updated independently.
**Fix:** Export a const array and derive the type:
```typescript
// server-pane.tsx
export const SERVER_PANE_STATES = ['strip', 'expanded', 'collapsed'] as const;
export type ServerPaneState = typeof SERVER_PANE_STATES[number];
```

---

_Reviewed: 2026-04-09T16:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
