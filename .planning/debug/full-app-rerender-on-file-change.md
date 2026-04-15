---
status: resolved
trigger: "Git revert (and any file modification) causes full app re-render and navigates back to project tab"
created: 2026-04-15
updated: 2026-04-15
---

# Debug: Full App Re-render on File Change

## Symptoms

- **Expected:** Revert file / modify file should only update git status, not re-render entire app
- **Actual:** Entire app re-renders, navigation resets to project tab
- **Scope:** Not revert-specific -- any file modification triggers it
- **Timeline:** Pre-existing issue, exposed by revert feature
- **Reproduction:** Modify any file in the project, or use revert button

## Current Focus

- hypothesis: CONFIRMED -- Vite dev server watch config too permissive, triggers full page reload on non-source file changes
- next_action: none -- fix applied

## Evidence

- timestamp: 2026-04-15 -- vite.config.ts watch.ignored only had `**/src-tauri/**`, leaving CLAUDE.md, .planning/, .claude/, .github/, RESEARCH/, README.md, repomix-output.xml, pnpm-lock.yaml, package-lock.json all watched
- timestamp: 2026-04-15 -- Vite detects changes to files outside its module graph (non-source files) and performs a full page reload rather than HMR, because it cannot determine which modules are affected
- timestamp: 2026-04-15 -- Full page reload resets all Preact signal state (activeTab, rightTopTab, etc.) back to defaults since signals are module-level variables re-initialized on load

## Eliminated

- Tauri file_watcher.rs -- only emits targeted events (md-file-changed, git-status-changed), does not trigger page reloads
- state-manager.ts signal architecture -- signals work correctly, the issue is they get wiped by full page reload not by reactivity bugs

## Resolution

- **root_cause:** Vite dev server watch configuration in vite.config.ts only ignored `**/src-tauri/**`. When any non-source file changed (CLAUDE.md, .planning/*, README.md, etc.), Vite could not HMR the change (file is not in the module graph), so it triggered a full page reload. This reset all Preact signal state including active tab, sidebar tab, and right panel tabs.
- **fix:** Expanded `server.watch.ignored` in vite.config.ts to exclude all non-source directories and files: `.git/`, `.planning/`, `.claude/`, `.github/`, `RESEARCH/`, `node_modules/`, `repomix-output.*`, `CLAUDE.md`, `README.md`, `pnpm-lock.yaml`, `package-lock.json`. Now only actual source files (src/, public/, index.html, config files) trigger Vite's watcher.
- **files_changed:** vite.config.ts
