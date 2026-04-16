---
phase: 18
slug: file-tree-enhancements
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (TS)** | Vitest 3.x + @testing-library/preact (jsdom env) |
| **Framework (Rust)** | `cargo test` with `tempfile` fixtures |
| **Config file** | `vite.config.ts` (Vitest block), `src-tauri/Cargo.toml` [dev-dependencies] |
| **Quick run command** | `pnpm test -- --run src/components/file-tree.test.tsx` (per-file) |
| **Full suite command** | `pnpm test -- --run && cd src-tauri && cargo test` |
| **Estimated runtime** | ~25s (TS) + ~15s (Rust) = ~40s |

---

## Sampling Rate

- **After every task commit:** Run the relevant per-file Vitest target OR `cargo test <module>` for Rust
- **After every plan wave:** Run `pnpm test -- --run` (TS full) and `cargo test` (Rust full)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25s (TS per-file), 15s (Rust per-module)

---

## Per-Task Verification Map

> Populated during planning — each plan task maps to a verification row.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TREE-01..05, MAIN-03 | TBD | TBD | TBD | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Validation Points from Research

From `18-RESEARCH.md` §Validation Architecture:

| # | Assertion | Type |
|---|-----------|------|
| V1 | After `delete_file(path)`: `std::fs::metadata(path).is_err()` returns true (file gone) | unit (Rust) |
| V2 | After `create_file(path)`: `test -f <path>` returns 0 (file exists and empty) | unit (Rust) |
| V3 | After `create_folder(path)`: `test -d <path>` returns 0 (dir exists) | unit (Rust) |
| V4 | After `copy_path(src, dst)` on a dir: every file in `src` exists at corresponding `dst` path AND `src` tree still intact (non-destructive) | unit (Rust) |
| V5 | After `rename_file(from, to)`: `from` metadata errors AND `to` metadata succeeds with same size | unit (Rust) |
| V6 | `count_children(path)` on a known fixture tree returns expected `{files, folders, total, capped}` shape; 10k entry cap triggers `capped: true` | unit (Rust) |
| V7 | Delete-confirm dispatch: ConfirmModal opens with message containing child count on folder delete (mock `count_children`) | component (Vitest) |
| V8 | Mouse-drag intra-tree: mousedown → mousemove beyond threshold creates ghost element in DOM; mouseup on target folder calls `renameFile(src, dst)` mock | component (Vitest) |
| V9 | Tauri `onDragDropEvent` handler: paths inside project root are ignored (intra-drag pipeline owns those); paths outside trigger `copyPath` call | component (Vitest with mocked window API) |
| V10 | Submenu "Open In ▸": hover on submenu parent after 150ms shows child menu; ArrowRight enters, ArrowLeft exits | component (Vitest) |
| V11 | Inline create input: Enter commits valid name; Esc cancels; duplicate name shows inline error and blocks commit | component (Vitest) |
| V12 | External editor launch: `invoke('open_external', { app: 'Zed', path })` dispatched with correct args on menu click | component (Vitest) |

---

## Wave 0 Requirements

Tests that must exist (or be created) as a prerequisite to V1–V12:

- [ ] `src-tauri/tests/file_ops_tests.rs` — cover V1–V6 (exists for current cmds, extend for `create_folder`, `copy_path`, `count_children`)
- [ ] `src/components/file-tree.test.tsx` — cover V7, V8, V10, V11, V12 (file may not exist — create in Wave 0)
- [ ] `src/services/file-service.test.ts` — add tests for `createFolder` and `copyPath` wrappers
- [ ] `src/__mocks__/@tauri-apps/api/webviewWindow.ts` — mock `onDragDropEvent` for V9
- [ ] Fixture: `src-tauri/tests/fixtures/sample-tree/` with known file/folder counts for `count_children` tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real drag from macOS Finder into the tree copies files | TREE-05 | WKWebView + real Finder can't be scripted from Vitest | Run app; open Finder; drag 2 files from Downloads into a tree folder; verify both appear in tree and still exist in Downloads |
| External editor launches actual Zed/VSCode window | TREE-03 | Spawning real GUI apps in CI is infeasible | Run app on a machine with Zed + VSCode installed; right-click a file → Open In ▸ Zed; verify Zed opens with that file |
| Delete-key-only-when-tree-focused behavior | TREE-02 | Focus behavior depends on real DOM + OS input | Run app; focus a terminal pane; press Delete on a tree-selected file; verify NO delete fired. Focus the tree; press Delete; verify confirm modal appears. |
| Drag ghost visual (shadow, opacity) | TREE-04 | Visual polish not assertable in jsdom | Drag a file over 3 different target folders; verify ghost follows cursor, target row highlights with accent border |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references above
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
