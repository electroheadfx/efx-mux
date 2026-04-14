# Phase 16: Sidebar Evolution + Git Control - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the sidebar from a single project list + git changes display into a 3-tab system (Projects, File Tree, Git Control). Users can stage, commit, and push changes from the dedicated Git Control tab. No branch switching, no hunk-level staging, no merge conflict resolution — those are future phases.

</domain>

<decisions>
## Implementation Decisions

### Tab Architecture
- **D-01:** Text tabs row below EFXMUX header: "Projects | Files | Git"
- **D-02:** Active tab indicated by accent color underline or background
- **D-03:** Tab state stored in local signal (not persisted across sessions)
- **D-04:** File Tree tab renders existing FileTree component; Projects tab renders existing project list

### Git Staging UI
- **D-05:** Two collapsible sections: "STAGED" and "CHANGES" with file counts in headers
- **D-06:** Checkbox per file — checked = staged, unchecked = unstaged
- **D-07:** Clicking checkbox calls git-service.ts stageFile/unstageFile
- **D-08:** File badges show status: [M] modified, [A] added, [D] deleted, [?] untracked

### Commit Workflow
- **D-09:** Always-visible multiline textarea at top of Git Control tab
- **D-10:** Placeholder text: "Commit message..."
- **D-11:** "Commit (N files)" button below textarea, disabled when no staged files or empty message
- **D-12:** On commit success: clear textarea, refresh file lists, show brief success indicator

### Push + Feedback
- **D-13:** "Push to origin" button appears below Commit button when unpushed commits exist
- **D-14:** Spinner on button during push operation
- **D-15:** Toast notification on error with recovery hint (e.g., "Run: ssh-add" for auth failures)
- **D-16:** Toast notification on success: "Pushed to origin/branch"

### Claude's Discretion
- Exact textarea height and resize behavior
- Collapsible section animation timing
- Toast notification positioning and duration
- Internal signal naming within components

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Patterns
- `src/components/sidebar.tsx` — Current sidebar structure, git data signals, project list rendering
- `src/services/git-service.ts` — Phase 15 git IPC wrappers: stageFile, unstageFile, commit, push
- `src/components/file-tree.tsx` — FileTree component to embed in Files tab

### Success Criteria (from ROADMAP.md)
1. User can switch between 3 sidebar tabs: Projects, File Tree, Git Control
2. User can stage individual files via checkboxes in git control pane
3. User can unstage individual files via checkboxes
4. User can commit staged changes with message input
5. User can push commits to remote repository

### Requirements (from REQUIREMENTS.md)
- SIDE-01: 3 sidebar tabs (Projects, File Tree, Git Control)
- GIT-01: Stage files via checkboxes
- GIT-02: Unstage files via checkboxes
- GIT-03: Commit with message
- GIT-04: Push to remote
- GIT-05: Undo last commit (soft reset) — out of scope for initial implementation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `git-service.ts` — stageFile(), unstageFile(), commit(), push() ready to use
- `gitFiles` signal in sidebar.tsx — already fetches file-level git data
- `FileTree` component — can be embedded directly in Files tab
- `tokens.ts` — colors.accent, colors.bgElevated for tab styling

### Established Patterns
- Local signals for component state (see `gitSectionOpen`, `removeTarget` in sidebar.tsx)
- Event-driven refresh via `document.addEventListener('project-changed', ...)` and Tauri `listen()`
- `invoke()` from `@tauri-apps/api/core` for IPC calls
- Lucide icons for UI elements

### Integration Points
- `refreshGitFiles()` in sidebar.tsx — call after stage/unstage/commit
- `git-status-changed` Tauri event — trigger refresh on backend git operations
- Toast system — need to add (no existing toast component)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

- GIT-05 (undo last commit) — defer to Phase 16.1 or v0.3.x patch
- Hunk-level staging — REQUIREMENTS.md lists as v0.3.x future requirement
- Branch switching UI — explicitly out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 16-sidebar-evolution-git-control*
*Context gathered: 2026-04-14*
