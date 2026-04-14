# Phase 15: Foundation Primitives - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Shared UI components and Rust write commands available for all downstream features (Phases 16-21). This is infrastructure — no user-facing requirements, but enables git control, file editing, and enhanced menus throughout the app.

</domain>

<decisions>
## Implementation Decisions

### Context Menu Component
- **D-01:** Flat array item structure with separator support: `{label, action, icon?, disabled?, separator?}`
- **D-02:** Auto-flip positioning — flip to opposite side when menu would overflow viewport
- **D-03:** Close triggers: click outside, Escape key, item selection (NOT scroll parent)

### Dropdown Menu Component
- **D-04:** Uncontrolled state — component manages open/close internally via signal
- **D-05:** Full keyboard navigation: arrow keys, Enter/Space select, type-ahead search, Home/End
- **D-06:** Render prop trigger pattern: `<Dropdown trigger={(props) => <button {...props}>Menu</button>}>`

### Git Commands (Rust)
- **D-07:** Operations: `stage_file(path)`, `unstage_file(path)`, `commit(message)`, `push(remote?, branch?)`
- **D-08:** Typed error enum: `Result<T, GitError>` with variants (NotARepo, FileNotFound, PushRejected, etc.)
- **D-09:** Push auth: discover from repo config — use SSH if `ssh://`, HTTPS if `https://`

### Service Layer (TypeScript)
- **D-10:** Separate service files: `git-service.ts` + `file-service.ts`
- **D-11:** Error handling: throw typed errors (`throw new GitError('PushRejected', details)`) — callers use try/catch
- **D-12:** File service operations: `writeFile(path, content)`, `deleteFile(path)`, `renameFile(from, to)`, `createFile(path)`

### Claude's Discretion
- Exact icon choices for menu items (use Lucide)
- Internal signal naming within components
- Rust module organization (extend existing files vs new `git_ops.rs`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Patterns
- `src/components/sidebar.tsx` — Component pattern: Preact + signals, invoke for IPC, Lucide icons, tokens.ts styling
- `src-tauri/src/file_ops.rs` — Rust command pattern: spawn_blocking, path validation, atomic writes
- `src-tauri/src/git_status.rs` — Git2 usage pattern: Repository::open, StatusOptions, typed return structs

### Success Criteria (from ROADMAP.md)
1. Context menu component renders on right-click with configurable items
2. Dropdown menu component renders with click-to-toggle and keyboard navigation
3. `write_file_content` Rust command writes file and returns success/error
4. `git-service.ts` module exposes stage/unstage/commit/push IPC wrappers
5. `file-service.ts` module exposes file CRUD IPC wrappers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tokens.ts` — Inline style tokens for colors, spacing, fonts
- Lucide icons — Already imported in sidebar.tsx, use same pattern
- `invoke()` from `@tauri-apps/api/core` — IPC pattern established

### Established Patterns
- Components use local signals for UI state (see `gitSectionOpen`, `removeTarget` in sidebar.tsx)
- Rust commands use `spawn_blocking()` for sync operations on blocking thread
- Path validation via `is_safe_path()` helper prevents directory traversal
- Atomic writes: tmp file + rename pattern (see `write_checkbox_impl`)

### Integration Points
- Context menu: consumed by file-tree.tsx (Phase 18) for delete/rename actions
- Dropdown: consumed by tab-bar.tsx (Phase 17) for "Add tab" menu, sidebar.tsx (Phase 16) for git actions
- Git service: consumed by sidebar.tsx git control pane (Phase 16)
- File service: consumed by main-panel.tsx editor tabs (Phase 17)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-foundation-primitives*
*Context gathered: 2026-04-14*
