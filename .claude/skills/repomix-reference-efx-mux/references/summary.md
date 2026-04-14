This file is a merged representation of a subset of the codebase, containing files not matching ignore patterns, combined into a single document by Repomix.

# Summary

## Purpose

This is a reference codebase organized into multiple files for AI consumption.
It is designed to be easily searchable using grep and other text-based tools.

## File Structure

This skill contains the following reference files:

| File | Contents |
|------|----------|
| `project-structure.md` | Directory tree with line counts per file |
| `files.md` | All file contents (search with `## File: <path>`) |
| `tech-stack.md` | Languages, frameworks, and dependencies |
| `summary.md` | This file - purpose and format explanation |

## Usage Guidelines

- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes

- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching these patterns are excluded: src-tauri/target/**, src-tauri/icons/**, dist/**, coverage/**, .planning/**, .claude/**, RESEARCH/**, .vscode/**, .github/**, **/*.woff2, **/*.icns, **/*.ico, **/*.png, pnpm-lock.yaml, package-lock.json, **/*.test.ts, **/*.test.tsx
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

## Statistics

59 files | 10 700 lines

| Language | Files | Lines |
|----------|------:|------:|
| TypeScript (TSX) | 17 | 5 473 |
| Rust | 15 | 2 855 |
| TypeScript | 13 | 1 352 |
| JSON | 5 | 142 |
| No Extension | 2 | 13 |
| Markdown | 2 | 389 |
| PLIST | 1 | 23 |
| HTML | 1 | 12 |
| YAML | 1 | 3 |
| TOML | 1 | 29 |
| Other | 1 | 409 |

**Largest files:**
- `src/components/sidebar.tsx` (744 lines)
- `src/components/terminal-tabs.tsx` (712 lines)
- `src/components/file-tree.tsx` (567 lines)
- `src-tauri/src/terminal/pty.rs` (528 lines)
- `src/components/project-modal.tsx` (501 lines)
- `src-tauri/src/state.rs` (459 lines)
- `src/components/preferences-panel.tsx` (420 lines)
- `src/styles/app.css` (409 lines)
- `src/components/first-run-wizard.tsx` (384 lines)
- `src/main.tsx` (381 lines)