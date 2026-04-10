---
phase: 10-pixel-perfect-ui-rewrite
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/components/agent-header.tsx
  - src/components/crash-overlay.tsx
  - src/components/diff-viewer.tsx
  - src/components/file-tree.tsx
  - src/components/first-run-wizard.tsx
  - src/components/fuzzy-search.tsx
  - src/components/main-panel.tsx
  - src/components/preferences-panel.tsx
  - src/components/project-modal.tsx
  - src/components/right-panel.tsx
  - src/components/server-pane.tsx
  - src/components/shortcut-cheatsheet.tsx
  - src/components/sidebar.tsx
  - src/components/tab-bar.tsx
  - src/components/terminal-tabs.tsx
  - src/styles/app.css
  - src/tokens.ts
findings:
  critical: 2
  warning: 8
  info: 6
  total: 16
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-10
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 10 completed a pixel-perfect UI rewrite across all 15 component files, migrating from a GitHub-dark palette to a navy-blue palette sourced from `tokens.ts`. The migration is largely coherent — token usage is consistent, no raw hex values leak in for the core palette, and `escapeHtml` guards are present at all `innerHTML` injection points.

Two critical issues were found: (1) JSX template literal strings in `diff-viewer.tsx` and `file-tree.tsx` are being written as raw string attributes rather than JSX expression attributes, meaning `${colors.textMuted}` will render as a literal dollar-sign string in the browser, making those panels visually broken; (2) the server-pane log viewer injects HTML via `dangerouslySetInnerHTML` from a path where the upstream `ansiToHtml` function must be trusted to sanitize — this is documented as safe (T-07-06), but the safety contract is not verified within this file.

Several warnings cover logic errors (missing key props causing reconciliation bugs, a `useEffect` called conditionally after an early return, and a broken Enter-key handler in the wizard). Info items cover dead code and minor style inconsistencies.

---

## Critical Issues

### CR-01: JSX style attributes written as raw template strings (not JSX expressions)

**Files:**
- `src/components/diff-viewer.tsx:154-158`
- `src/components/file-tree.tsx:174-212`

**Issue:** Several JSX elements use HTML-style `style="..."` string attributes with `${...}` template literal interpolations. In JSX/TSX, `style="..."` is treated as a plain string — the `${}` placeholders are emitted verbatim to the DOM, not evaluated. The correct form is `style={{ ... }}` (object syntax) or, for dynamic single-attribute strings, a JSX expression `style={`...`}` where string templates are allowed inside `{}`. As written, these elements will render with literal `${colors.textMuted}` text in their `style` attribute, breaking all colour theming for the diff viewer outer container and the file-tree outer/header containers.

Specific broken lines in `diff-viewer.tsx`:
```tsx
// Line 154 — style value is a raw string, never interpolated
<div style="height: 100%; overflow-y: auto; padding: 8px 16px; font-family: ${fonts.mono}; font-size: 13px; line-height: 1.5;">
  <div ref={contentRef}>
    <div style="color: ${colors.textMuted};">Click a file in the sidebar to view its diff</div>
  </div>
</div>
```

Specific broken lines in `file-tree.tsx`:
```tsx
// Line 174 — outer wrapper, bgDeep never applied
<div style="height: 100%; display: flex; flex-direction: column; background-color: ${colors.bgDeep}; overflow: hidden;">
// Line 176 — header bar, bgBase + bgBorder never applied
<div style="gap: 8px; padding: 10px 16px; background-color: ${colors.bgBase}; border-bottom: 1px solid ${colors.bgBorder}; ...">
```

**Fix:** Change all `style="..."` string attributes that contain `${}` interpolations to JSX expression syntax. For the DiffViewer outer wrapper:
```tsx
// diff-viewer.tsx line 154
<div style={{ height: '100%', overflowY: 'auto', padding: '8px 16px', fontFamily: fonts.mono, fontSize: 13, lineHeight: 1.5 }}>
  <div ref={contentRef}>
    <div style={{ color: colors.textMuted }}>Click a file in the sidebar to view its diff</div>
  </div>
</div>
```

For the FileTree outer wrapper and header (lines 174-179), convert each `style="..."` to `style={{ ... }}` object syntax, matching the pattern used by the entry rows on lines 197-212 of the same file (those lines correctly use JSX expression syntax `style={`...`}` inside the map, but the static wrappers above them do not).

Note: The entry rows in `file-tree.tsx` lines 197, 208, 212 use the `style={`...`` template literal inside `{}` which is valid JSX — only the static outer elements above them (lines 174, 176, 183, 188, 189) use the broken `style="..."` form.

---

### CR-02: `dangerouslySetInnerHTML` in server-pane log viewer — safety contract not enforced locally

**File:** `src/components/server-pane.tsx:353`

**Issue:** The server log is rendered via:
```tsx
<div dangerouslySetInnerHTML={{ __html: logHtml }} />
```
where `logHtml = serverLogs.value.join('')`. Each entry in `serverLogs` is the output of `ansiToHtml(text)`. The comment at line 6 states "T-07-06: ansiToHtml HTML-escapes before ANSI processing (XSS-safe)", but that contract is enforced solely inside `../server/ansi-html` — not verified here. If `ansiToHtml` is ever changed, replaced, or a log entry is appended without going through it (e.g., lines 231, 244, 253, 268, 272, 201), the raw string would be injected as HTML. Lines 231 and 253 call `ansiToHtml('[server] Starting: ' + proj.server_cmd + '\n')` where `proj.server_cmd` is user-controlled input. This is safe only as long as `ansiToHtml` escapes HTML — which it currently does per T-07-06 — but the risk is structural.

**Fix:** Add a local assertion comment at the `dangerouslySetInnerHTML` call site referencing the invariant, and ensure all `serverLogs` push sites pass through `ansiToHtml`. Optionally add a wrapper:
```ts
// All entries in serverLogs MUST be passed through ansiToHtml() which
// HTML-escapes input before processing ANSI codes (T-07-06).
// Do NOT push raw strings directly into serverLogs.
```
The more robust fix is to audit that every `serverLogs.value = [...serverLogs.value, <expr>]` in the file uses `ansiToHtml(...)`. The one at line 253 (`ansiToHtml('[server] Stopped\n')`) is fine, but the crash message build on line 201 in the listener callback also passes through `ansiToHtml` — that is correct. All current sites are safe; this is a maintainability concern that could become a vulnerability.

---

## Warnings

### WR-01: Missing `key` props on list items — Preact reconciliation bug

**Files:**
- `src/components/sidebar.tsx:477` — `CollapsedIcon` rendered in map without `key`
- `src/components/sidebar.tsx:587` — `ProjectRow` rendered in map without `key`
- `src/components/sidebar.tsx:686` — `GitFileRow` rendered in map without `key`
- `src/components/fuzzy-search.tsx:206` — `SearchResult` rendered in map without `key`

**Issue:** These map calls render components without a `key` prop. Preact uses `key` to identify which items changed, moved, or were removed during reconciliation. Missing keys cause incorrect DOM reuse when items are inserted, reordered, or deleted — the wrong item may receive focus, show stale state, or fail to re-render. This is particularly impactful for `ProjectRow` (project switching) and `SearchResult` (fuzzy search navigation).

**Fix:** Add the `key` prop to each rendered component:
```tsx
// sidebar.tsx — collapsed icons
{projects.value.map((p, i) => (
  <CollapsedIcon key={p.name} project={p} index={i} />
))}

// sidebar.tsx — project rows
{projects.value.map((p, i) => (
  <ProjectRow key={p.name} project={p} index={i} />
))}

// sidebar.tsx — git file rows
{gitFiles.value.map(f => (
  <GitFileRow key={f.path} file={f} />
))}

// fuzzy-search.tsx
{results.map((p, i) => (
  <SearchResult key={p.name} project={p} index={i} />
))}
```

---

### WR-02: `useEffect` called after conditional early return in `first-run-wizard.tsx`

**File:** `src/components/first-run-wizard.tsx:291-308`

**Issue:** The `FirstRunWizard` component calls `if (!visible.value) return null` on line 291, then calls `useEffect` on line 294. This violates the Rules of Hooks — hooks must not be called conditionally or after an early return. In Preact (which follows the same constraint), calling a hook after a conditional return causes the hook call count to change between renders, leading to subtle state corruption or silent no-op behaviour when `visible` transitions from `false` to `true`.

```tsx
// current (broken) order:
export function FirstRunWizard() {
  if (!visible.value) return null;   // line 291 — early return
  useEffect(() => { ... }, []);       // line 294 — hook after return: INVALID
```

**Fix:** Move the `useEffect` call above the early return:
```tsx
export function FirstRunWizard() {
  useEffect(() => {
    if (!visible.value) return;
    function handleKeydown(e: KeyboardEvent) { ... }
    document.addEventListener('keydown', handleKeydown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeydown, { capture: true });
  }, [visible.value]);  // re-run when visible changes

  if (!visible.value) return null;
  // ... rest of render
```

---

### WR-03: Enter key in `FirstRunWizard` triggers `handlePrimary` even inside text inputs

**File:** `src/components/first-run-wizard.tsx:301-304`

**Issue:** The global keydown handler registered in `FirstRunWizard` unconditionally calls `handlePrimary()` on every `Enter` keypress (line 301-304), regardless of which element has focus. When the user is typing in the Directory, Name, Server Command, or GSD File text inputs (Steps 1, 4), pressing Enter inside those inputs will advance the wizard step instead of completing normal text input. The correct pattern is to check `e.target` or let the `<form onSubmit>` handle Enter naturally.

```tsx
// current — Enter anywhere in wizard advances step
if (e.key === 'Enter') {
  e.preventDefault();
  handlePrimary();
}
```

**Fix:** Guard against input elements being the active target:
```tsx
if (e.key === 'Enter') {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  e.preventDefault();
  handlePrimary();
}
```

---

### WR-04: `agent-header.tsx` has duplicate `display` / `alignItems` / `width` props

**File:** `src/components/agent-header.tsx:78-87`

**Issue:** The outer container `<div>` specifies both Tailwind utility classes (`class="flex items-center w-full"`) and redundant inline style properties for the same CSS properties:
```tsx
<div
  class="flex items-center w-full"   // Tailwind: display:flex, align-items:center, width:100%
  style={{
    display: 'flex',        // duplicate
    alignItems: 'center',   // duplicate
    width: '100%',          // duplicate
    ...
  }}
>
```
The inline styles will win over Tailwind (specificity), but the duplication is misleading and increases maintenance risk if one source is updated without the other.

**Fix:** Remove the three duplicate properties from the `style` object and rely on Tailwind classes, or remove the Tailwind classes and use only `style`:
```tsx
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
    padding: '8px 12px',
    gap: 10,
  }}
>
```

---

### WR-05: `preferences-panel.tsx` hardcodes a border color as raw hex instead of token

**File:** `src/components/preferences-panel.tsx:63`

**Issue:** `SettingRow` hardcodes the separator color as `'#1B202880'` instead of using a design token:
```tsx
borderBottom: border ? '1px solid #1B202880' : 'none',
```
This raw hex is not present in `tokens.ts` and does not match any of the palette values (`bgBorder` is `#243352`, `bgSurface` is `#324568`). It also will not respond to light-mode theme switching, unlike all other token usages in this file.

**Fix:** Replace with the appropriate token:
```tsx
borderBottom: border ? `1px solid ${colors.bgBorder}` : 'none',
```

---

### WR-06: `preferences-panel.tsx` — `AgentBadge` always renders "Claude Code" regardless of active project

**File:** `src/components/preferences-panel.tsx:313`

**Issue:** The Agent row in `PreferencesPanel` always renders `<AgentBadge name="Claude Code" />` as a hardcoded string. The active project's agent is available via `activeProject?.agent` (resolved two lines above), but is not passed to `AgentBadge`. If the active project uses `opencode` or `bash`, this row will still show "Claude Code".

```tsx
// current — hardcoded
<SettingRow label="Agent">
  <AgentBadge name="Claude Code" />
</SettingRow>
```

**Fix:**
```tsx
<SettingRow label="Agent">
  <AgentBadge name={
    activeProject?.agent === 'opencode' ? 'OpenCode' :
    activeProject?.agent === 'bash' ? 'Bash' :
    'Claude Code'
  } />
</SettingRow>
```

---

### WR-07: `project-modal.tsx` — close button bypasses `isFirstRun` guard

**File:** `src/components/project-modal.tsx:234`

**Issue:** The close button (X) in the modal header calls `visible.value = false` directly, bypassing the `closeProjectModal()` function which has an `isFirstRun` guard:
```tsx
// closeProjectModal() has guard (line 59):
export function closeProjectModal() {
  if (isFirstRun.value) return; // First-run: only close via X button
  visible.value = false;
}

// But the X button ignores this guard (line 234):
<button onClick={() => { visible.value = false; }}>
```
The comment says "only close via X button" for first-run, which matches the intent — but this means `isFirstRun` is actually intentionally bypassed here. However, the Escape key handler (line 174) calls `closeProjectModal()` which respects the guard. This creates an inconsistency: on first-run, Escape is blocked but the X button closes the modal. If the intent is "Escape blocked, X allowed on first-run", the code is correct but the guard comment is misleading. If the intent is "modal cannot be closed at all on first-run", the X button must be hidden/disabled.

**Fix (if X should be hidden on first-run):**
```tsx
{!isFirstRun.value && (
  <button onClick={() => { visible.value = false; }} ...>
    <span>{'\u2715'}</span>
  </button>
)}
```

---

### WR-08: `tokens.ts` — `fontSizes` values are unitless integers, causing silent CSS failures

**File:** `src/tokens.ts:47-55`

**Issue:** `fontSizes` exports raw numbers (`xs: 9`, `sm: 10`, etc.). When used as `fontSize: fontSizes.lg` in an inline style object, React/Preact will automatically append `"px"` to numeric values for `fontSize`. This is intentional Preact behaviour and works correctly. However, several components also use these values in string template literals inside `renderDiffHtml` (e.g., `diff-viewer.tsx` line 60: `font-size: 12px`), where the token is NOT used and the values are hardcoded. This means the diff viewer and file-tree header font sizes are hardcoded at `12px`/`13px` rather than consuming tokens.

Additionally, `fontSizes.xs` is `9` and `fontSizes.sm` is `10` — but `agent-header.tsx` uses `fontSizes.sm` for both the icon glyph (line 105) and the primary label (line 126). A `10px` primary label is unusually small. This appears to be an off-by-one in token selection: `fontSizes.lg` (13) would be more appropriate for a primary label.

**Fix for label size:**
```tsx
// agent-header.tsx line 126 — change fontSizes.sm to fontSizes.lg
fontSize: fontSizes.lg,  // 13px instead of 10px
```

**Fix for diff-viewer hardcoded sizes:** Use `fontSizes.base` (12) in `renderDiffHtml` string interpolations:
```ts
font-size: ${fontSizes.base}px;
```

---

## Info

### IN-01: `terminal-tabs.tsx` — `agentBinary` always `undefined` in `createNewTab`

**File:** `src/components/terminal-tabs.tsx:130`

**Issue:** In `createNewTab`, the variable `agentBinary` is declared as `undefined` with a comment "Ctrl+T tabs are always plain shell (UAT gap 1)" — but `resolveAgentBinary` exists and is used in `restartTabSession`. The comment explains the intent, but the variable declaration is dead code:
```ts
// Connect PTY -- Ctrl+T tabs are always plain shell (UAT gap 1)
const agentBinary = undefined;
```
This could simply be removed and `undefined` passed directly to `connectPty`.

**Fix:** Remove the variable and pass `undefined` directly:
```ts
const conn = await connectPty(terminal, sessionName, projectInfo?.path, undefined);
```

---

### IN-02: `diff-viewer.tsx` — inline `shrink: 0` is not a valid CSS property name

**File:** `src/components/diff-viewer.tsx:69,80,90`

**Issue:** Inside `renderDiffHtml`, the HTML string includes `shrink: 0` as a CSS property:
```html
<span style="... shrink: 0; ...">
```
The valid CSS property is `flex-shrink: 0`, not `shrink: 0`. `shrink: 0` is silently ignored by browsers. The line numbers in the diff output may unexpectedly grow/shrink in flex containers as a result.

**Fix:** Replace `shrink: 0` with `flex-shrink: 0` in the three affected `bodyLines.push(...)` calls (lines 69, 80, 90).

---

### IN-03: `file-tree.tsx` — path label in header is hardcoded to `~/Dev/efx-mux`

**File:** `src/components/file-tree.tsx:179`

**Issue:** The file tree header shows `~/Dev/efx-mux` as the current path label, but this is hardcoded:
```tsx
<span style={...}>~/Dev/efx-mux</span>
```
The actual current path is available in the `currentPath` signal. On any machine other than the developer's, or for any non-efx-mux project, this label will be wrong.

**Fix:**
```tsx
<span style={...}>{currentPath.value || '—'}</span>
```

---

### IN-04: `server-pane.tsx` — side-effect signal mutation during render

**File:** `src/components/server-pane.tsx:108-111`

**Issue:** The `ServerPane` component mutates `serverStatus` (a signal) during the render function body, not inside a `useEffect`:
```tsx
if (isUnconfigured && serverStatus.value !== 'unconfigured' && serverStatus.value !== 'running') {
  serverStatus.value = 'unconfigured';
} else if (!isUnconfigured && serverStatus.value === 'unconfigured') {
  serverStatus.value = 'stopped';
}
```
Mutating a signal during render triggers a re-render while the current render is in progress. In Preact, this is generally tolerated (it schedules a follow-up render rather than an immediate synchronous one), but it is an anti-pattern that can cause flicker and double-render in edge cases. The standard fix is `useEffect`.

**Fix:**
```tsx
useEffect(() => {
  if (isUnconfigured && serverStatus.value !== 'unconfigured' && serverStatus.value !== 'running') {
    serverStatus.value = 'unconfigured';
  } else if (!isUnconfigured && serverStatus.value === 'unconfigured') {
    serverStatus.value = 'stopped';
  }
}, [isUnconfigured]);
```

---

### IN-05: `app.css` — `.gsd-content h2` uses `--color-text-secondary` which is not defined in light mode overrides

**File:** `src/styles/app.css:275`

**Issue:** The GSD Viewer styles reference `--color-text-secondary`:
```css
.gsd-content h2 { color: var(--color-text-secondary); ... }
```
The `@theme` block defines `--color-text-secondary: #C9D1D9` for dark mode, but the `[data-theme="light"]` override block (lines 61-73) does not include a `--color-text-secondary` override. In light mode, `h2` headings will render as `#C9D1D9` (a light-grey value) against a `#FFFFFF` background — nearly invisible.

**Fix:** Add the light-mode override to the `[data-theme="light"]` block:
```css
[data-theme="light"] {
  /* existing overrides ... */
  --color-text-secondary: #57606a;  /* GitHub light secondary text */
}
```

---

### IN-06: `sidebar.tsx` — imports `GitBranch` from `lucide-preact` but never uses it

**File:** `src/components/sidebar.tsx:9`

**Issue:** `GitBranch` is imported but the component renders the branch name using a plain Unicode symbol (`⎇`) instead:
```tsx
import { GitBranch, Plus, RotateCw, X } from 'lucide-preact';
// GitBranch is never referenced in the file body
```
The branch display at line 674 uses only text, not the icon.

**Fix:** Remove `GitBranch` from the import:
```tsx
import { Plus, RotateCw, X } from 'lucide-preact';
```

---

_Reviewed: 2026-04-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
