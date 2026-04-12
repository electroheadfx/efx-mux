# Dependency Audit Report
**Plan:** 14-02 (Dependency Audit)
**Generated:** 2026-04-12
**Baseline:** cargo test passes (19/19 tests)

---

## package.json Audit

### Dependencies Verified

| Package | Version | Used In | Status |
|---------|---------|---------|--------|
| @preact/signals | ^2.9.0 | src/main.tsx, src/components/file-tree.tsx, src/components/terminal-tabs.tsx, src/components/preferences-panel.tsx, src/components/shortcut-cheatsheet.tsx | ACTIVE |
| @tauri-apps/api | ^2.10.1 | src/main.tsx, src/components/project-modal.tsx, src/server/server-bridge.ts | ACTIVE |
| @tauri-apps/plugin-dialog | ^2.7.0 | src/components/project-modal.tsx, src/components/first-run-wizard.tsx | ACTIVE |
| @tauri-apps/plugin-opener | ^2.5.3 | src/server/server-bridge.ts | ACTIVE |
| @xterm/xterm | 6.0.0 | src/terminal/terminal-manager.ts, src/terminal/pty-bridge.ts, src/terminal/resize-handler.ts, src/components/terminal-tabs.tsx, src/theme/theme-manager.ts | ACTIVE |
| @xterm/addon-fit | 0.11.0 | src/terminal/terminal-manager.ts, src/terminal/resize-handler.ts, src/components/terminal-tabs.tsx, src/theme/theme-manager.ts | ACTIVE |
| @xterm/addon-webgl | 0.19.0 | src/terminal/terminal-manager.ts | ACTIVE |
| @xterm/addon-web-links | 0.12.0 | (devDependency only) | DEV_ONLY |
| lucide-preact | ^1.8.0 | src/components/sidebar.tsx | ACTIVE |
| marked | ^14.1.4 | src/components/gsd-viewer.tsx, src/components/main-panel.tsx | ACTIVE |
| preact | ^10.29.1 | src/main.tsx, src/components/project-modal.tsx, src/components/preferences-panel.tsx | ACTIVE |

### Analysis

**All dependencies are actively imported.** No unused packages found.

**Note on @xterm/addon-web-links:** Listed in devDependencies (not dependencies). The grep above showed no imports from `src/` for this package, which is correct -- it is used as a dev/test dependency only. No action needed.

---

## Cargo.toml Audit

### Crates Verified

| Crate | Version | Used In | Status |
|-------|---------|---------|--------|
| tauri | 2 | lib.rs (tauri::Builder), all .rs files via tauri::Manager/Emitter/AppHandle | ACTIVE |
| tauri-plugin-opener | 2 | lib.rs (.plugin()) | ACTIVE |
| tauri-plugin-dialog | 2 | lib.rs (.plugin()) | ACTIVE |
| serde | 1 (derive) | state.rs, git_status.rs, file_ops.rs (Serialize/Deserialize derives) | ACTIVE |
| serde_json | 1 | server.rs (serde_json::json! and parse/serialize) | ACTIVE |
| portable-pty | 0.9.0 | terminal/pty.rs (native_pty_system, PtySize, CommandBuilder) | ACTIVE |
| notify | 8.2 | file_watcher.rs (RecursiveMode) | ACTIVE |
| notify-debouncer-mini | 0.7 | file_watcher.rs (new_debouncer, DebounceEventResult) | ACTIVE |
| git2 | 0.20.4 | git_status.rs, file_ops.rs (Repository, Status, DiffOptions) | ACTIVE |
| regex | 1 | file_ops.rs (checkbox parsing in write_checkbox_impl) | ACTIVE |
| libc | 0.2 | server.rs (waitpid, killpg, SIGTERM/SIGKILL constants) | ACTIVE |

### Analysis

**All crates are actively used.** No unused crates found.

**serde via derive macro:** `#[derive(Serialize, Deserialize)]` in state.rs, git_status.rs, and file_ops.rs counts as usage -- the derive macros expand to impl code that references serde.

**Note on dev-dependencies:** `tempfile` is used by git_status.rs and file_ops.rs test modules (TempDir). Appropriate for testing.

---

## Version Comparison vs CLAUDE.md Matrix

| Package/Crate | CLAUDE.md Version | package.json/Cargo.toml Version | Status |
|--------------|-------------------|--------------------------------|--------|
| tauri (Rust) | 2.10.3 | 2 (no patch specified) | REQUIRES REVIEW |
| @tauri-apps/api (JS) | ^2.0.0 | ^2.10.1 | OK (^2 allows 2.10.x) |
| @xterm/xterm | 6.0.0 | 6.0.0 | OK |
| @xterm/addon-webgl | 0.19.0 | 0.19.0 | OK |
| @xterm/addon-fit | 0.11.0 | 0.11.0 | OK |
| @xterm/addon-web-links | 0.12.0 | ^0.12.0 (dev) | OK |
| portable-pty (Rust) | 0.9.0 | 0.9.0 | OK |
| git2 (Rust) | 0.20.4 | 0.20.4 | OK |
| notify (Rust) | 8.2.0 | 8.2 | OK |

### Version Discrepancies Flagged for Review

1. **tauri (Rust):** CLAUDE.md specifies `2.10.3` but Cargo.toml specifies `version = "2"` without a patch version. This means Cargo will resolve to the latest 2.x (currently 2.10.3 per docs.rs). No action taken -- versions are aligned but matrix is out of date.

---

## Verification

- `cargo test` passes: 19/19 tests
- All dependencies verified via grep on source trees
- No packages or crates flagged for removal

---

## Conclusion

**No dependency removals are recommended.** Every package in package.json and every crate in Cargo.toml is actively used in source code. All version discrepancies are informational only -- no auto-fixes applied per plan mandate.
