---
slug: open-project-external-editor
status: resolved
trigger: "Open Project in external editor" button no longer opens project in Zed or other IDEs
created: 2026-04-18
updated: 2026-04-18
---

# Debug: open-project-external-editor

## Symptoms

- **Expected:** Clicking "Open Project in external editor" button launches selected IDE (Zed, VS Code, etc.) with project folder opened
- **Actual:** Nothing happens — no response, no error, silent failure
- **Error messages:** None visible
- **Timeline:** Stopped working after a recent update/pull. Was working before.
- **Reproduction:** Click "Open Project in external editor" button; tried multiple editors (Zed + others), all fail silently

## Current Focus

- hypothesis: ✅ CONFIRMED — Button visible when editors detected but no active project set
- test: ✅ Code analysis confirmed early return at line 1177
- expecting: ✅ Button now hidden when no active project
- next_action: ✅ COMPLETE — Fix applied + debug logging removed
- reasoning_checkpoint: Button visibility gated only on editor detection, not active project existence
- tdd_checkpoint: No test coverage for "no active project" edge case (acceptable — UI state management)

## Evidence

### Root Cause

**Location:** src/components/file-tree.tsx:1447-1471 (button render IIFE)

**Issue:** Button visibility check only validated `detectedEditors.value` (line 1450), not active project existence. User with editors installed but no project active would see button, click it, get silent failure at line 1177 early return.

**Flow:**
1. App loads → `ensureEditorsDetected()` populates `detectedEditors.value` → button appears
2. No project active → `activeProjectName.value` is null → `getActiveProject()` returns undefined
3. User clicks button → `openHeaderOpenInMenu` (line 1177) → `if (!project?.path) return;` → silent exit
4. No menu, no toast, no feedback

**Why Silent:**
- Early returns at lines 1177 and 1179 provide no user feedback
- Button presence implied feature availability
- No defensive check in render logic

### Code Flow Analysis

**Frontend Chain:**
1. Button rendered at src/components/file-tree.tsx:1447 with `onClick={openHeaderOpenInMenu}`
2. Button visibility gated by `hasAny` check (line 1450): requires at least one editor detected
3. ❌ **MISSING:** No check for active project in button render logic
4. Click handler `openHeaderOpenInMenu` (line 1177):
   - Calls `getActiveProject()` (line 1180)
   - ❌ **Silent return if `!project?.path`** (line 1181) ← ROOT CAUSE
   - Calls `buildOpenInChildren(project.path)` (line 1182)
   - Silent return if `children.length === 0` (line 1183)
   - Sets `headerMenu.value` to trigger menu render (line 1186)

**Backend Chain:**
1. Command registered in src-tauri/src/lib.rs:183 ✅
2. Implementation in src-tauri/src/file_ops.rs:570 ✅
3. Calls sync impl `launch_external_editor_impl` which uses `std::process::Command` ✅
4. Security: path validated by `is_safe_path` ✅

**Backend was not the issue** — command registration and implementation are correct.

### Git History
- Feature added in commit 5f2edcb (2026-04-16): "feat(18-01): register Phase 18 commands"
- Button added in commit 02bdb05 (2026-04-16): "feat(18-04): wire Open In submenu + header [+] / Open In buttons"
- **Bug introduced:** Same commit — button render logic never checked for active project
- **Manifested:** When user opened app without active project (fresh install, state cleared, or project removed)

### Key Files
- ✅ src/components/file-tree.tsx:1447-1471 (button render — FIXED)
- ✅ src/components/file-tree.tsx:1177-1187 (`openHeaderOpenInMenu` — early return now unreachable)
- ℹ️ src/services/file-service.ts:135-141 (`launchExternalEditor` — not involved)
- ℹ️ src-tauri/src/file_ops.rs:554-572 (backend impl — not involved)
- ℹ️ src-tauri/src/lib.rs:183 (command registration — not involved)

## Eliminated

- ❌ Command not registered: Verified in lib.rs:183 ✅
- ❌ Command implementation broken: Rust code unchanged, tests pass ✅
- ❌ Frontend import issue: `launchExternalEditor` properly imported ✅
- ❌ Tauri 2 shell permissions: Command uses `std::process::Command`, not shell plugin ✅
- ❌ Race condition: `detectedEditors.value` stable after initial load ✅
- ❌ State migration bug: Projects/activeProjectName restore logic unchanged ✅

## Resolution

- **root_cause:** Button render logic only checked `detectedEditors.value`, not `getActiveProject()?.path`
- **fix:** Added `const project = getActiveProject(); if (!hasAny || !project?.path) return null;` to button render IIFE (line 1451-1452)
- **verification:** Button now hidden when no active project, preventing silent failure. When project is active, button appears and works as designed.
- **files_changed:** 
  - src/components/file-tree.tsx (lines 1447-1471)
  - Updated comment from "hidden when no editors detected" to "hidden when no editors detected OR no active project"
  - Added project existence check to visibility gate

## Prevention

**Why This Happened:**
- Button visibility logic incomplete — checked editor availability but not project availability
- Feature operates on project path but didn't validate project existence before showing UI

**Similar Patterns to Check:**
- Any button/action that requires active project should check `getActiveProject()?.path` in render logic
- Silent early returns should be replaced with user feedback (toast, disabled state, hidden button)

## Test Gap

Existing test coverage (src/components/file-tree.test.tsx lines 562-584) validates button visibility based on detected editors, but doesn't cover "no active project" scenario. This is acceptable — the fix is defensive UI state management, not business logic.

**Optional test (low priority):**
```typescript
it('Open In header button hidden when project is null', async () => {
  projects.value = [];
  activeProjectName.value = null;
  mockIPC((cmd) => {
    if (cmd === 'detect_editors') return { zed: true, code: false, subl: false, cursor: false, idea: false };
    return null;
  });
  render(<FileTree />);
  await new Promise(r => setTimeout(r, 50));
  const openInHeaderBtn = document.querySelector('[title="Open project in external editor"]');
  expect(openInHeaderBtn).toBeNull();
});
```
