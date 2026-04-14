# Phase 15: Foundation Primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 15-foundation-primitives
**Areas discussed:** Context menu API, Dropdown menu API, Git commands scope, Service layer pattern

---

## Context Menu API

### Menu Item Structure
| Option | Description | Selected |
|--------|-------------|----------|
| Flat array with separators | Array of {label, action, icon?, disabled?, separator?} — simple, covers 90% of use cases | ✓ |
| Nested submenus | Items can have `children` for nested menus — more complex | |
| Section-based | Grouped by section: {sections: [{title, items}]} — cleaner for long menus | |

**User's choice:** Flat array with separators

### Positioning
| Option | Description | Selected |
|--------|-------------|----------|
| Auto-flip | Flip to opposite side when menu would overflow viewport — standard behavior | ✓ |
| Constrain within bounds | Shift menu to stay visible without flipping — simpler logic | |
| You decide | Claude picks the approach | |

**User's choice:** Auto-flip

### Close Triggers
| Option | Description | Selected |
|--------|-------------|----------|
| Click outside | Standard — clicking anywhere outside menu closes it | ✓ |
| Escape key | Standard — pressing Escape closes menu | ✓ |
| Item selection | Close after selecting any non-disabled item | ✓ |
| Scroll parent | Close when parent container scrolls | |

**User's choice:** Click outside, Escape key, Item selection (NOT scroll parent)

---

## Dropdown Menu API

### State Management
| Option | Description | Selected |
|--------|-------------|----------|
| Uncontrolled | Component manages open/close internally via signal — simpler for most uses | ✓ |
| Controlled | Parent passes isOpen/onToggle props — more flexible but verbose | |
| Both modes | Support both via optional props — most flexible, more code | |

**User's choice:** Uncontrolled

### Keyboard Navigation
| Option | Description | Selected |
|--------|-------------|----------|
| Arrow keys for focus | Up/Down to move between items — essential | ✓ |
| Enter/Space to select | Trigger the focused item — standard | ✓ |
| Type-ahead search | Typing jumps to matching item — nice for long lists | ✓ |
| Home/End keys | Jump to first/last item — accessibility bonus | ✓ |

**User's choice:** All four selected — full keyboard support

### Trigger Element
| Option | Description | Selected |
|--------|-------------|----------|
| Render prop pattern | `<Dropdown trigger={(props) => <button {...props}>Menu</button>}` — flexible | ✓ |
| Built-in button | `<Dropdown label="Menu">` — simpler but less customizable | |
| Wrapper pattern | `<Dropdown><MyButton/></Dropdown>` wraps children — implicit binding | |

**User's choice:** Render prop pattern

---

## Git Commands Scope

### Operations
| Option | Description | Selected |
|--------|-------------|----------|
| stage_file(path) | Add file to staging area — needed for GIT-01 | ✓ |
| unstage_file(path) | Remove file from staging — needed for GIT-02 | ✓ |
| commit(message) | Commit staged changes — needed for GIT-03 | ✓ |
| push(remote?, branch?) | Push to remote — needed for GIT-04 | ✓ |

**User's choice:** All four operations

### Error Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Typed error enum | `Result<T, GitError>` with variants: NotARepo, FileNotFound, PushRejected, etc. | ✓ |
| String errors | `Result<T, String>` with descriptive messages — simpler, less structured | |
| You decide | Claude picks during implementation | |

**User's choice:** Typed error enum

### Push Auth
| Option | Description | Selected |
|--------|-------------|----------|
| Discover from repo config | Use whatever remote URL the repo has — SSH if ssh://, HTTPS if https:// | ✓ |
| SSH only | Only support SSH key-based auth — simpler, requires ssh-agent | |
| Defer to Phase 16 | Expose the command now, figure out auth during Phase 16 | |

**User's choice:** Discover from repo config

---

## Service Layer Pattern

### Module Organization
| Option | Description | Selected |
|--------|-------------|----------|
| Separate files | git-service.ts + file-service.ts — clear separation of concerns | ✓ |
| Single ipc-services.ts | One file with exported namespaces — easier discovery, bigger file | |
| Inline in components | invoke() calls stay in components — no abstraction layer | |

**User's choice:** Separate files

### TypeScript Error Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Throw with typed errors | `throw new GitError('PushRejected', details)` — callers use try/catch | ✓ |
| Return Result type | `{ok: true, data} | {ok: false, error}` — explicit, no exceptions | |
| Pass through Rust errors | Let invoke() rejection bubble up — minimal wrapper | |

**User's choice:** Throw with typed errors

### File Service Operations
| Option | Description | Selected |
|--------|-------------|----------|
| writeFile(path, content) | Write/overwrite file — core requirement | ✓ |
| deleteFile(path) | Delete file with confirmation — needed for TREE-01 | ✓ |
| renameFile(from, to) | Rename/move file — useful for drag/drop | ✓ |
| createFile(path) | Create empty file — needed for MAIN-03 | ✓ |

**User's choice:** All four operations — full CRUD

---

## Claude's Discretion

- Exact icon choices for menu items
- Internal signal naming within components
- Rust module organization (extend existing files vs new git_ops.rs)

## Deferred Ideas

None — discussion stayed within phase scope.
