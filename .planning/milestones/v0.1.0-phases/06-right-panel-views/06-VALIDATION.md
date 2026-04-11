---
phase: "06"
slug: "right-panel-views"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-04-07"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification via Tauri dev server |
| **Config file** | none — manual testing |
| **Quick run command** | `npm run tauri dev` |
| **Full suite command** | `npm run tauri dev` (full app) |
| **Estimated runtime** | ~30 seconds per app launch |

---

## Sampling Rate

- **After Wave 1 (Rust backend):** Run `cd src-tauri && cargo check` to verify compilation
- **After Wave 2 (JS components):** Run `npm run tauri dev` and manually verify each view
- **Before `/gsd-verify-work`:** Full manual verification of all 7 PANEL requirements

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | PANEL-02, PANEL-07 | cargo check | `cd src-tauri && cargo check 2>&1 \| head -30` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06 | cargo check | `cd src-tauri && cargo check 2>&1 \| head -30` | ✅ | ⬜ pending |
| 06-01-03 | 01 | 1 | PANEL-03 | file exists | `ls src-tauri/src/file_watcher.rs` | ✅ | ⬜ pending |
| 06-01-04 | 01 | 1 | PANEL-07 | cargo check | `cd src-tauri && cargo check 2>&1 \| head -50` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | PANEL-01 | file exists | `ls src/components/tab-bar.js` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 2 | PANEL-02, PANEL-03 | grep | `grep -c "marked\|write_checkbox\|md-file-changed" src/components/gsd-viewer.js` | ✅ | ⬜ pending |
| 06-02-03 | 02 | 2 | PANEL-04 | grep | `grep -c "open-diff\|get_file_diff\|escapeHtml" src/components/diff-viewer.js` | ✅ | ⬜ pending |
| 06-02-04 | 02 | 2 | PANEL-05, PANEL-06 | grep | `grep -c "list_directory\|file-opened\|ArrowDown\|ArrowUp" src/components/file-tree.js` | ✅ | ⬜ pending |
| 06-02-05 | 02 | 2 | PANEL-01, PANEL-07 | grep | `grep -c "TabBar\|GSDViewer\|DiffViewer\|FileTree\|connectPty" src/components/right-panel.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/tab-bar.js` — Created in Wave 2 Task 1 (not a test file, but foundational)
- [ ] All JS components created in Wave 2

*Existing infrastructure (Tauri dev server + cargo check) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tab bar switches views | PANEL-01 | UI interaction | Click each tab in right-top (GSD/Diff/File Tree) and right-bottom (Bash). Verify view changes. |
| Checkbox write-back | PANEL-02 | File I/O + UI | In GSD Viewer, click a checkbox. Open PLAN.md in editor, verify [x] changed to [ ] or vice versa. |
| GSD auto-refresh | PANEL-03 | File watcher | With GSD tab open, edit PLAN.md in external editor. Verify viewer auto-updates within 500ms. |
| Diff viewer rendering | PANEL-04 | Git diff | Click a modified file in sidebar. Verify diff appears in Diff tab with green/red highlighting. |
| File tree keyboard nav | PANEL-05 | Keyboard input | Focus file tree, use ArrowUp/Down to navigate, Enter to open file/directory. |
| Files open as tabs | PANEL-06 | Tab management | Click a file in file tree. Verify it opens as a new read-only tab in main panel. |
| Bash terminal connects | PANEL-07 | PTY + tmux | Switch to Bash tab. Verify terminal connects to right-tmux-session and is usable. |

*All phase behaviors require manual verification via Tauri dev server.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: cargo check after Wave 1, manual test after Wave 2
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
