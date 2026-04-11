---
status: awaiting_human_verify
trigger: "Three issues with the file preview panel: scroll doesn't work, no syntax highlighting, no markdown rendering"
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

## Current Focus

hypothesis: File preview in main-panel.tsx is a minimal <pre> with escapeHtml() - no syntax highlighting library, no markdown rendering, and scroll issue is due to terminal-containers div with absolute positioning overlaying the file viewer
test: Read code to confirm root causes, then implement fixes
expecting: Three separate issues all in main-panel.tsx
next_action: Fix all three issues in main-panel.tsx

## Symptoms

expected: File preview should scroll with mouse wheel, code files should have syntax coloring, markdown files should render as HTML
actual: Mouse wheel scroll does nothing in file preview (scrollbar works), all files show plain unformatted text, markdown shows raw source
errors: None reported
reproduction: Click any file in file tree to open preview, try scrolling with mouse wheel, observe no syntax colors and no markdown rendering
timeline: Never worked - features were never implemented

## Eliminated

## Evidence

- timestamp: 2026-04-11T00:01:00Z
  checked: main-panel.tsx file viewer implementation
  found: File viewer is a simple <pre> with escapeHtml() - no syntax highlighting, no markdown detection. The overlay div uses class="absolute inset-0" but the terminal-containers div also uses class="absolute inset-0" - both are positioned absolutely within the same relative parent.
  implication: Three distinct root causes confirmed.

- timestamp: 2026-04-11T00:02:00Z
  checked: Package.json and existing code
  found: marked (^14.1.4) is available and already used by gsd-viewer.tsx. No syntax highlighting library installed. The file viewer pre element has overflow-auto which should scroll, but the terminal-containers div at z-index default sits on top and captures wheel events.
  implication: Can use marked for markdown. Need a syntax highlighting approach. Need z-index fix for scroll.

## Resolution

root_cause: |
  1. SCROLL: The terminal-containers div (class="terminal-containers absolute inset-0") overlaps the file viewer overlay (also class="absolute inset-0"). Both are inside the same relative parent. The terminal-containers div sits on top in DOM order and captures wheel events, preventing the file viewer pre from scrolling.
  2. SYNTAX: The file viewer uses escapeHtml() + dangerouslySetInnerHTML on a <pre> tag with no syntax highlighting whatsoever.
  3. MARKDOWN: No markdown detection or rendering - all files go through the same plain text path. marked.js is available in deps but not used in the file viewer.
fix: |
  1. SCROLL: Added zIndex: 10 to the file viewer overlay div so it sits above terminal-containers
  2. SYNTAX: Added regex-based line-by-line syntax highlighter with support for JS/TS, Rust, Python, Go, Shell, CSS, TOML/YAML, Java, C/C++. Highlights keywords, strings, comments, numbers, and PascalCase types via CSS classes (.syn-kw, .syn-str, .syn-cm, .syn-num, .syn-type)
  3. MARKDOWN: Added markdown detection by extension (.md, .markdown, .mdx) and rendering via marked.js (already a dep). Markdown files render in a styled div with .file-viewer-markdown CSS class instead of a <pre> tag
verification: TypeScript compilation passes. Needs manual UI verification.
files_changed: [src/components/main-panel.tsx, src/styles/app.css]
