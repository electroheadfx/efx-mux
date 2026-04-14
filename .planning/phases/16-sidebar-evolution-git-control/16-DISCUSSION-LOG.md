# Phase 16: Sidebar Evolution + Git Control - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 16-sidebar-evolution-git-control
**Areas discussed:** Tab architecture, Git staging UI, Commit workflow, Push + feedback

---

## Tab Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Icon tabs (recommended) | 3 icon buttons in a row (Folder, GitBranch, FileTree). Compact, matches terminal-first aesthetic. | |
| Text tabs | Full text labels: "Projects", "Files", "Git". More explicit but takes more space. | ✓ |
| Segmented control | Pill-shaped segmented buttons. More modern but heavier visual weight. | |

**User's choice:** Text tabs
**Notes:** User preferred explicit text labels over icons for clarity.

---

## Git Staging UI

| Option | Description | Selected |
|--------|-------------|----------|
| Split sections (recommended) | Two collapsible sections: "Staged" and "Changes". Matches VS Code/JetBrains pattern. | ✓ |
| Single list + badges | One flat list. Badge indicates S (staged) vs M (modified). Checkbox toggles staging. | |
| Inline stage buttons | No checkboxes. + button to stage, - button to unstage. More explicit actions. | |

**User's choice:** Split sections
**Notes:** User chose familiar VS Code-style layout with STAGED and CHANGES sections.

---

## Commit Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Inline textarea (recommended) | Always-visible textarea above staged section. Commit button below it. No modal friction. | ✓ |
| Expandable input | Single-line input that expands to multiline on focus. Saves vertical space when collapsed. | |
| Modal commit | Click commit button opens modal with message input + full diff preview. More ceremony. | |

**User's choice:** Inline textarea
**Notes:** User preferred always-visible input for faster workflow.

---

## Push + Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Button below commit (recommended) | Push button appears after successful commit. Shows spinner during push, toast on success/error. | ✓ |
| Always-visible push | Push button always visible. Badge shows "1 ahead" when unpushed commits exist. | |
| Commit + Push combo | Single "Commit & Push" button. Optional separate commit-only. Less control but faster. | |

**User's choice:** Button below commit
**Notes:** User chose separate push button with contextual appearance and toast feedback.

---

## Claude's Discretion

- Exact textarea height and resize behavior
- Collapsible section animation timing
- Toast notification positioning and duration
- Internal signal naming

## Deferred Ideas

- GIT-05 (undo last commit) — defer to later
- Hunk-level staging — future v0.3.x
- Branch switching UI — out of scope
