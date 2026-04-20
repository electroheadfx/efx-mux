---
status: complete
---

# Quick Task 260413-q8l: Summary

**Task:** Add version to EFXMUX sidebar title, remove 4px left padding
**Completed:** 2026-04-13

## Changes

- `src/components/sidebar.tsx`:
  - Added import: `getVersion` from `@tauri-apps/api/app`
  - Added `appVersion` signal
  - Fetches version on mount alongside project data
  - Displays version next to "EFXMUX" title (e.g., "EFXMUX v0.2.1")
  - Reduced header left padding from 16px to 12px

## Commit

- `4d6a22e` feat(sidebar): add version display to EFXMUX title
