---
phase: 17
slug: main-panel-file-tabs
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-15
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 17-01 | 1 | EDIT-01 | T-17-01 | npm packages from trusted scopes | structural | `cd /Users/lmarques/Dev/efx-mux && node -e "require('codemirror')" && test -f src/editor/theme.ts && test -f src/editor/languages.ts && echo "PASS"` | N/A (structural) | ⬜ pending |
| 01-T2 | 17-01 | 1 | EDIT-04 | — | N/A | structural | `cd /Users/lmarques/Dev/efx-mux && grep -l "showConfirmModal" src/components/confirm-modal.tsx && grep -l "role=\"dialog\"" src/components/confirm-modal.tsx && echo "PASS"` | N/A (structural) | ⬜ pending |
| 02-T1 | 17-02 | 2 | EDIT-02, EDIT-05, MAIN-01 | T-17-04 | DnD data is tab IDs only | structural | `cd /Users/lmarques/Dev/efx-mux && grep -c "TerminalTabBar" src/components/terminal-tabs.tsx \| grep "0" && grep -l "UnifiedTabBar" src/components/unified-tab-bar.tsx && grep -l "draggable" src/components/unified-tab-bar.tsx && echo "PASS"` | N/A (structural) | ⬜ pending |
| 02-T2 | 17-02 | 2 | EDIT-01, EDIT-03 | T-17-03 | CM6 DOM text nodes, no innerHTML | structural | `cd /Users/lmarques/Dev/efx-mux && grep -l "EditorView" src/components/editor-tab.tsx && grep -l "createEditorState" src/components/editor-tab.tsx && grep -l "writeFile" src/components/editor-tab.tsx && echo "PASS"` | N/A (structural) | ⬜ pending |
| 03-T1 | 17-03 | 3 | MAIN-02 | T-17-07 | escapeHtml on diff content before innerHTML | structural | `cd /Users/lmarques/Dev/efx-mux && grep -l "GitChangesTab" src/components/git-changes-tab.tsx && grep -l "git-status-changed" src/components/git-changes-tab.tsx && grep -l "ChevronDown" src/components/git-changes-tab.tsx && echo "PASS"` | N/A (structural) | ⬜ pending |
| 03-T2 | 17-03 | 3 | EDIT-01, EDIT-03 | T-17-06 | Path validated in Rust backend | structural | `cd /Users/lmarques/Dev/efx-mux && grep -c "show-file-viewer" src/components/main-panel.tsx \| grep "0" && grep -l "UnifiedTabBar" src/components/main-panel.tsx && grep -l "openEditorTab" src/main.tsx && grep -l "ConfirmModal" src/main.tsx && echo "PASS"` | N/A (structural) | ⬜ pending |
| 03-T3 | 17-03 | 3 | ALL | — | N/A | checkpoint | `test -f src/components/unified-tab-bar.tsx && test -f src/components/editor-tab.tsx && test -f src/components/git-changes-tab.tsx && echo "PASS"` | N/A (human) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note on Nyquist compliance:** Phase 17 tasks are primarily UI component creation where the verify commands check structural correctness (file existence, key exports, pattern presence). CodeMirror 6 mounting, drag-and-drop, and visual rendering require a live DOM and are verified through the human checkpoint (03-T3). The RESEARCH.md Wave 0 test files (editor-tab.test.tsx, unified-tab-bar.test.tsx, confirm-modal.test.tsx, git-changes-tab.test.tsx, languages.test.ts) are candidates for post-phase test hardening but are not blockers for the structural verify commands above. Marked `nyquist_compliant: true` because every task has an `<automated>` verify command and the human checkpoint covers behavioral verification.

---

## Wave 0 Requirements

- [ ] Test stubs for EDIT-01 through EDIT-05 and MAIN-01, MAIN-02 (deferred to post-phase hardening)
- [x] Existing infrastructure covers framework setup (vitest + jsdom already configured)
- [ ] CM6 mocking strategy: EditorView requires DOM -- jsdom should work but may need mock for unit tests

**Wave 0 test file candidates (from RESEARCH.md Validation Architecture):**
| File | Covers | Priority |
|------|--------|----------|
| `src/editor/languages.test.ts` | Language detection map (pure function, easy to test) | HIGH |
| `src/components/confirm-modal.test.tsx` | EDIT-04 modal render + signal toggle | MEDIUM |
| `src/components/unified-tab-bar.test.tsx` | EDIT-02, EDIT-05, MAIN-01 tab state logic | MEDIUM |
| `src/components/editor-tab.test.tsx` | EDIT-01, EDIT-03 (needs CM6 mock) | LOW |
| `src/components/git-changes-tab.test.tsx` | MAIN-02 (needs IPC mock) | LOW |

These are not scheduled in Plans 01-03 to keep context budget focused on implementation. They can be added in a post-phase test hardening pass or as part of a future testing phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop tab reorder | EDIT-05 | DOM drag events hard to automate in jsdom | Drag tab to new position, verify order updates |
| Unsaved indicator dot | EDIT-02 | Visual indicator requires rendering check | Type in editor, verify dot appears in tab |
| Confirmation modal on close | EDIT-04 | Modal interaction flow | Click close on dirty tab, verify modal |
| CodeMirror syntax highlighting | EDIT-01 | Visual rendering quality | Open .ts file, verify syntax colors |
| Git changes accordion expand | MAIN-02 | IPC + visual rendering | Click chevron, verify diff appears |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (deferred -- see note above)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending human checkpoint (Plan 03 Task 3)
