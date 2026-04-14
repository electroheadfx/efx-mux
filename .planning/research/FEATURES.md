# Feature Research

**Domain:** Terminal Multiplexer IDE (v0.3.0 Workspace Evolution)
**Researched:** 2026-04-14
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| File editing in tabs | Every IDE/editor has this; users will instinctively double-click to edit | HIGH | Requires Monaco/CodeMirror integration, tab state management, unsaved changes tracking |
| Tab close with unsaved warning | Universal pattern; losing work is catastrophic UX | LOW | Modal confirmation when dirty flag set |
| Git staging with checkboxes | VS Code, Zed, GitKraken all use this; standard mental model | MEDIUM | Checkbox per file, "Stage All" button, visual staging state |
| Git commit with message input | Cannot commit without message; core git workflow | LOW | Text input + Commit button, validation for empty message |
| File delete with confirmation | Destructive action requires confirmation; universal pattern | LOW | Modal dialog, no direct deletion |
| Expand/collapse diff per file | GitHub, GitLab, VS Code all have this; users expect to focus on one file at a time | MEDIUM | Accordion pattern with chevron indicators |
| Tab reordering via drag | Browser tabs, VS Code, every tabbed interface supports this | MEDIUM | Drag handle detection, drop zone preview |
| Open in external editor | Users have preferred editors (Zed, VS Code); forcing built-in editor is hostile | LOW | `open -a` command via Tauri shell, configurable editor preference |
| File tree delete | Cannot manage files without delete; paired with create | LOW | Context menu + keyboard shortcut (Delete/Backspace) |
| Visual git status in file tree | See which files are modified without opening git panel | LOW | Status badge/color overlay on tree nodes |

### Differentiators (Competitive Advantage)

Features that set Efxmux apart. Not required, but valuable for terminal-first developers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| GSD sub-tabs (Milestones/Phases/Progress/History/State) | No other tool shows AI planning context inline; unique to GSD workflow | MEDIUM | Parse ROADMAP.md sections, render STATE.md, tab switching |
| Interleaved staged/unstaged diff view (Zed-style) | Focus stays on code location, not on "staged" vs "unstaged" sections; reduces cognitive load | HIGH | Requires diff-of-diffs rendering, per-hunk stage/unstage buttons |
| AI-generated commit messages | Zed and VS Code have this; competitive parity becoming table stakes | MEDIUM | LLM integration via existing agent, staged content as context |
| Drag files from Finder to file tree | macOS-native workflow; no other terminal multiplexer supports this | HIGH | Tauri file drop events, copy operation, tree refresh |
| Sidebar bash sub-TUI tabs | Run multiple terminal sessions in sidebar without consuming main panel space | MEDIUM | Extends existing terminal-tabs pattern to sidebar |
| Per-hunk staging from diff view | Stage only specific changes within a file; power user feature | HIGH | Hunk boundary detection, partial staging commands |
| Undo last commit (soft reset) | Zed shows "Uncommit" button immediately after commit; safety net | LOW | `git reset HEAD^ --soft` via git2 |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full Monaco/VS Code editor | "Why not just embed VS Code?" | 50MB+ bundle size, WebGL conflicts with xterm.js, complexity explosion, maintenance burden | Lightweight CodeMirror 6 for basic editing; external editor for heavy work |
| Real-time collaborative editing | "Google Docs but for code" | Massive complexity (CRDT, networking, presence); conflicts with terminal-first ethos | Not applicable to single-user tool |
| Git graph visualization | "Show me the branch tree" | Complex canvas rendering, marginal value for daily workflow, VS Code extension exists | Text-based branch name display, defer to external tools |
| Auto-save | "Save my work automatically" | Dangerous with code; accidental saves break builds; conflicts with git workflow | Unsaved indicator + Cmd+S; explicit save only |
| Syntax highlighting in diff | "Color the code in diff view" | Requires language detection, TextMate grammars, significant complexity for read-only view | Keep current line-level +/- coloring; add syntax highlighting only for editor tabs |
| Multi-window support | "I want diffs on second monitor" | Breaks single-window value proposition, state sync complexity | Defer indefinitely per PROJECT.md |

## Feature Dependencies

```
[File editing in tabs]
    |--requires--> [Tab bar component] (EXISTS)
    |--requires--> [File read/write commands] (EXISTS: read_file, write_checkbox pattern)
    |--requires--> [Monaco or CodeMirror integration] (NEW)

[Git staging UI]
    |--requires--> [Git status display] (EXISTS: sidebar git section)
    |--requires--> [Git file list] (EXISTS: get_git_files command)
    |--requires--> [Stage command] (NEW: git add via git2)
    |--requires--> [Unstage command] (NEW: git reset via git2)

[Git commit]
    |--requires--> [Git staging UI]
    |--requires--> [Commit command] (NEW: git commit via git2)

[Git push]
    |--requires--> [Git commit]
    |--requires--> [Push command] (NEW: git push via git2, requires auth handling)

[Accordion diff panels]
    |--requires--> [Diff viewer] (EXISTS: diff-viewer.tsx)
    |--requires--> [Expand/collapse state per file] (NEW)

[GSD sub-tabs]
    |--requires--> [GSD viewer] (EXISTS: gsd-viewer.tsx)
    |--requires--> [ROADMAP.md section parser] (NEW)
    |--requires--> [STATE.md reader] (EXISTS: read_file_content)

[Sidebar 3-tab structure]
    |--requires--> [Tab bar component] (EXISTS)
    |--requires--> [File tree component] (EXISTS)
    |--requires--> [Git control panel] (NEW, depends on Git staging UI)

[File tree drag/drop]
    |--requires--> [File tree component] (EXISTS)
    |--requires--> [Move file command] (NEW)
    |--requires--> [Tauri file drop events] (NEW)

[External editor integration]
    |--requires--> [tauri-plugin-opener or shell command] (EXISTS: tauri_plugin_opener)
    |--requires--> [Editor preference setting] (NEW)
```

### Dependency Notes

- **File editing requires editor library:** Monaco is heavyweight (VS Code engine), CodeMirror 6 is modular and lightweight. Given Efxmux's terminal-first ethos, CodeMirror 6 with minimalSetup is recommended.
- **Git staging requires new Rust commands:** The existing `git2` crate supports staging (`index.add_path`), unstaging (`index.remove_path`), and committing. No new dependencies needed.
- **Git push requires authentication:** git2 does not pick up SSH keys automatically. For HTTPS, credential helpers work. For SSH, may need manual key path configuration. This is the highest-risk feature.
- **GSD sub-tabs requires markdown parsing:** The existing `marked.js` can extract sections by heading. No new dependencies needed, but parsing logic is non-trivial.
- **Sidebar restructure conflicts with current layout:** The current sidebar has Projects + Git Changes in one scrollable view. Moving to 3 tabs requires UI redesign but no new dependencies.

## MVP Definition

### Launch With (v0.3.0)

Minimum viable product for this milestone.

- [x] **Tab bar for main panel** -- Already exists (terminal-tabs.tsx pattern)
- [ ] **File editing in tabs** -- CodeMirror 6 with basic syntax highlighting
- [ ] **Unsaved file indicator** -- Dot or asterisk in tab title
- [ ] **Save file (Cmd+S)** -- Write file content via Tauri command
- [ ] **Git staging checkboxes** -- Individual file stage/unstage
- [ ] **Git commit with message** -- Text area + commit button
- [ ] **Accordion diff per file** -- Expand/collapse in git changes view
- [ ] **File tree delete** -- Context menu with confirmation dialog
- [ ] **Open in external editor** -- Configurable $EDITOR or specific app
- [ ] **GSD sub-tabs** -- At minimum: Milestones, Phases, Progress from ROADMAP.md
- [ ] **Sidebar 3-tab structure** -- Projects, File Tree, Git Control

### Add After Validation (v0.3.x)

Features to add once core is working.

- [ ] **Git push** -- Add after commit is stable; requires auth testing
- [ ] **Drag/drop files in tree** -- Add after delete works reliably
- [ ] **Finder drag-to-tree** -- macOS-specific, add after internal drag works
- [ ] **Per-hunk staging** -- Power user feature; add after file-level staging is solid
- [ ] **Undo last commit** -- Safety feature; add after commit UI is proven
- [ ] **Sidebar bash sub-TUI tabs** -- Extends existing pattern; add when main features stable

### Future Consideration (v0.4+)

Features to defer until this milestone is complete.

- [ ] **AI commit message generation** -- Requires LLM integration beyond current agent spawn
- [ ] **Interleaved staged/unstaged diff** -- Complex UI; Zed took months to build this
- [ ] **Git stash support** -- Nice to have, not critical path
- [ ] **Branch switching UI** -- Current workflow is terminal-based; defer UI

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| File editing in tabs | HIGH | HIGH | P1 |
| Git staging checkboxes | HIGH | MEDIUM | P1 |
| Git commit | HIGH | LOW | P1 |
| Accordion diff | MEDIUM | MEDIUM | P1 |
| File tree delete | HIGH | LOW | P1 |
| GSD sub-tabs | MEDIUM | MEDIUM | P1 |
| Sidebar 3-tabs | MEDIUM | MEDIUM | P1 |
| Open in external editor | HIGH | LOW | P1 |
| Tab reordering | MEDIUM | MEDIUM | P2 |
| Git push | HIGH | HIGH | P2 |
| Drag/drop in tree | MEDIUM | HIGH | P2 |
| Finder drag-to-tree | LOW | HIGH | P3 |
| Per-hunk staging | MEDIUM | HIGH | P3 |
| Undo commit | LOW | LOW | P3 |
| Sidebar bash tabs | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v0.3.0 launch
- P2: Should have, add in v0.3.x patches
- P3: Nice to have, consider for v0.4.0

## Competitor Feature Analysis

| Feature | VS Code | Zed | Warp Terminal | Efxmux Approach |
|---------|---------|-----|---------------|-----------------|
| File editing | Full Monaco with extensions | Custom GPU-rendered editor | None (terminal only) | CodeMirror 6 basic editing; external editor for complex work |
| Git staging | Checkbox per file, line-level staging | Interleaved diff-of-diffs, per-hunk | View-only diff panel (feature request open) | Checkbox per file (v0.3.0), per-hunk later |
| Git commit | Inline message box, AI assist optional | Inline + AI generation, Uncommit button | Via terminal commands | Inline message box, defer AI to v0.4 |
| Git push | Sync button, branch protection | Push/Pull/Fetch buttons, remote selector | Via terminal commands | Button in git panel (v0.3.x) |
| Diff collapse | Expand All / Collapse All buttons | File-level collapse, auto-collapse generated | N/A | Per-file accordion with chevrons |
| File tree delete | Right-click > Delete, keyboard shortcut | Right-click > Move to Trash | N/A | Right-click + Delete key, confirmation modal |
| Open external | Right-click > Reveal in Finder / Open With | Cmd+Shift+O opens in configured editor | N/A | Menu item + keyboard shortcut |
| Drag/drop | Full support (files, folders, between windows) | Full support | N/A | Internal tree drag (v0.3.x), Finder drop (v0.4) |

## Implementation Notes

### CodeMirror 6 vs Monaco

**Recommendation: CodeMirror 6**

| Criterion | Monaco | CodeMirror 6 |
|-----------|--------|--------------|
| Bundle size | ~2MB minified | ~150KB with basic setup |
| WebGL conflicts | Uses canvas, may conflict with xterm.js WebGL | DOM-based, no conflicts |
| Language support | Full VS Code grammar support | Good support, simpler setup |
| Extensibility | Extension ecosystem (heavy) | Plugin system (lightweight) |
| Tauri integration | Works but resource-heavy | Proven lightweight in Tauri apps |

CodeMirror 6 packages needed:
- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/commands`
- `@codemirror/language`
- `@codemirror/lang-javascript` (and other lang packages as needed)

### Git Operations via git2

Existing `git2` crate in Cargo.toml supports all needed operations:

```rust
// Stage file
let mut index = repo.index()?;
index.add_path(Path::new("file.txt"))?;
index.write()?;

// Unstage file
index.remove_path(Path::new("file.txt"))?;
index.write()?;

// Commit
let tree_id = index.write_tree()?;
let tree = repo.find_tree(tree_id)?;
let sig = repo.signature()?;
let parent = repo.head()?.peel_to_commit()?;
repo.commit(Some("HEAD"), &sig, &sig, "message", &tree, &[&parent])?;
```

### Accordion Diff Pattern

Based on GitLab and VS Code patterns:
- Default state: All files collapsed (show file header only)
- Click header or chevron to expand/collapse
- "Expand All" / "Collapse All" buttons in toolbar
- Persist collapse state during session (not across restarts)

### GSD Sub-Tabs Section Parsing

ROADMAP.md has predictable structure:
```markdown
## Milestones
...
## Phases
...
## Progress
...
```

Parse by splitting on `## ` headers, extract section content by name.

## Sources

- [VS Code Source Control Documentation](https://code.visualstudio.com/docs/sourcecontrol/overview)
- [VS Code Staging and Committing](https://code.visualstudio.com/docs/sourcecontrol/staging-commits)
- [Zed Git Documentation](https://zed.dev/docs/git)
- [Zed Native Git Support Blog](https://zed.dev/blog/git)
- [Zed Git Panel Architecture](https://deepwiki.com/zed-industries/zed/6.1-git-panel-and-ui)
- [GitLab Collapse/Expand Diffs Issue](https://gitlab.com/gitlab-org/gitlab/-/issues/361278)
- [GitLab Rapid Diffs Architecture](https://docs.gitlab.com/development/fe_guide/rapid_diffs/)
- [Warp Terminal Git Feature Request](https://github.com/warpdotdev/Warp/issues/8542)
- [Monaco Editor GitHub](https://github.com/microsoft/monaco-editor)
- [CodeMirror 6 Homepage](https://codemirror.net/)
- [SideX - VS Code rebuilt on Tauri](https://github.com/Sidenai/sidex)
- [Montauri Editor - Monaco + Tauri](https://github.com/TimSusa/montauri-editor)
- [JetBrains Rider Editor Tabs](https://www.jetbrains.com/help/rider/Managing_Editor_Tabs.html)
- [W3C WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [NN/g Drag and Drop UX](https://www.nngroup.com/articles/drag-drop/)
- [Smart Interface Design Patterns - Drag and Drop](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/)
- [GitHub Desktop Staging](https://simpledev.io/lesson/stage-files-gh-desktop-1/)
- [GitKraken Staging](https://help.gitkraken.com/gitkraken-desktop/staging/)

---
*Feature research for: Efxmux v0.3.0 Workspace Evolution*
*Researched: 2026-04-14*
