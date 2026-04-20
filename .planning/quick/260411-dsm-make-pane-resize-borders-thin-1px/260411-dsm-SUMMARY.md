---
status: complete
---

# Quick Task 260411-dsm: Make pane resize borders thin 1px

## Summary

Changed `--handle-size` CSS custom property from `4px` to `1px` in `src/styles/app.css`. This makes the visual border between all resizable panes (vertical sidebar handles and horizontal right-panel handles) render as thin 1px lines. The `--handle-hit` target remains at `8px` so drag interaction is unaffected.

## Files Changed

- `src/styles/app.css` — `--handle-size: 4px` → `--handle-size: 1px`
