# Quick Task 260411-dsm: Make pane resize borders thin 1px

## Task 1: Reduce split handle visual width to 1px

**files:** `src/styles/app.css`
**action:** Change `--handle-size: 4px` to `--handle-size: 1px` in the `:root` CSS custom properties. Keep `--handle-hit: 8px` unchanged so the drag hit target remains usable.
**verify:** Visual border between panes is 1px thin, drag still works with wider hit area.
**done:** Resize borders render as 1px lines.
