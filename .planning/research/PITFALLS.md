# Pitfalls Research: Workspace Evolution (v0.3.0)

**Domain:** Adding file editing, git staging/commit/push, and drag-drop to existing Tauri 2 + Preact + xterm.js 6.0 + git2 app
**Researched:** 2026-04-14
**Confidence:** HIGH (verified against Tauri v2 docs, git2-rs docs, xterm.js issues, libgit2 authentication guides)

---

## Critical Pitfalls

---

### Pitfall 1: File Watcher Misses External Editor Changes Due to Atomic Save Pattern

**What goes wrong:**
The existing `file_watcher.rs` watches project directories for `.md` file changes. However, many external editors (VS Code, Zed, Vim) use atomic saves: write to a temp file, then rename over the original. On macOS, `notify` with FSEvents backend may report only the rename event (not the content change), or may report events for the temp file that doesn't match your `.md` filter. The user edits a file in Zed, saves it, but the file tree in Efxmux doesn't update.

**Why it happens:**
The current watcher filters events by file extension (`ext == "md"`). When Zed saves `foo.md`, it actually writes to `.foo.md.swp` or similar, then renames. The rename event may not trigger the extension filter correctly, or the debouncer (200ms in current code) coalesces the create/rename events into something the filter doesn't recognize.

**How to avoid:**
- Use `notify-debouncer-full` (not `notify-debouncer-mini`) which provides richer event metadata including the final path after renames
- Watch for `DebouncedEventKind::Any` and re-check the target file's existence/mtime rather than trusting event content
- For file tree specifically: don't rely solely on file watcher events. Poll the directory listing on focus-regain (`window.onfocus`) as a fallback
- Consider increasing debounce timeout to 500ms to let atomic save complete before emitting

**Warning signs:**
- User edits file externally, Efxmux file tree shows stale state
- `.md` changes detected in terminal editors but not GUI editors
- Events fire for temp files that immediately disappear

**Phase to address:**
Bug fix phase early in milestone. Existing code (`file_watcher.rs` lines 42-50) needs revision before new file tree features.

---

### Pitfall 2: git2-rs Push Requires Explicit Credential Callback -- SSH Agent Not Automatic

**What goes wrong:**
The app adds "git push" capability via git2-rs. Developer assumes `Remote::push()` will use the system SSH agent automatically (since `git push` from terminal works). But git2/libgit2 does NOT automatically integrate with macOS Keychain or ssh-agent. Push fails with "authentication required" or hangs indefinitely waiting for credentials.

**Why it happens:**
libgit2 is a standalone C library that does not shell out to `git`. It has its own SSH implementation (via libssh2 or openssl). The macOS ssh-agent stores keys in Keychain with `--apple-use-keychain`, but libgit2's `Cred::ssh_key_from_agent()` talks to ssh-agent via the `SSH_AUTH_SOCK` socket, which may not have the keys loaded if the user hasn't run `ssh-add` in the current session.

**How to avoid:**
- Implement a full credential callback chain that tries multiple methods in order:
  1. `Cred::ssh_key_from_agent()` -- tries ssh-agent
  2. `Cred::ssh_key()` with `~/.ssh/id_ed25519` or `~/.ssh/id_rsa` -- tries default keys
  3. Fallback to showing an error dialog asking user to run `ssh-add`
- Set up `RemoteCallbacks::credentials()` with the callback before calling `push()`
- Consider using the `git2-credentials` crate which wraps this complexity
- Handle the case where `allowed_types` doesn't include SSH (HTTPS repos need different handling)

**Warning signs:**
- Push works in terminal but not in Efxmux
- Push hangs indefinitely (credential callback looping)
- "Permission denied (publickey)" or "authentication required" errors
- Works on developer's machine (keys loaded), fails for users who haven't run `ssh-add`

**Phase to address:**
Git control implementation phase. Must be designed upfront, not retrofitted.

---

### Pitfall 3: git2-rs Commit Signing Not Built-In -- SSH Signing Unsupported

**What goes wrong:**
Users have `commit.gpgsign=true` in their git config, expecting all commits to be signed. The app creates commits via `repo.commit()` which produces unsigned commits. Worse, if the user has SSH signing configured (the modern GitHub-recommended approach), libgit2 has no built-in support at all -- there's an open issue (libgit2#6397) requesting it.

**Why it happens:**
libgit2 provides only `git_commit_create_with_signature()` -- the signing itself is the app's responsibility. For GPG signing, you'd need to shell out to `gpg` or use a Rust GPG library. For SSH signing, libgit2 doesn't support it natively.

**How to avoid:**
- Explicitly document that Efxmux commits are unsigned
- Check user's `commit.gpgsign` config and warn if true: "Commits created in Efxmux will not be signed. Use terminal for signed commits."
- For GPG: consider shelling out to `git commit` for the commit step (defeats purpose of git2 but preserves signing)
- For SSH: no good solution exists in git2-rs. Shell out to git or skip signing.
- The `git2-ext` crate has experimental signing support -- evaluate for future milestone

**Warning signs:**
- User's GitHub shows "Unverified" badge on commits made from Efxmux
- CI pipelines that require signed commits reject pushes
- User confusion: "I have signing enabled but Efxmux commits aren't signed"

**Phase to address:**
Git control design phase. Make explicit architectural decision: unsigned commits with warning, or shell out to git.

---

### Pitfall 4: Tauri Drag-Drop is Backwards -- `dragDropEnabled: false` Enables DOM Drag-Drop

**What goes wrong:**
Developer wants to implement file drag-drop in the file tree (reorder files, drag from Finder). Sets `dragDropEnabled: true` in Tauri config expecting to enable drag-drop. But this enables Tauri's INTERNAL drag-drop system which DISABLES native DOM drag-drop events. `ondragstart`, `ondrop` handlers in Preact components never fire.

**Why it happens:**
The Tauri config option is confusingly named. `dragDropEnabled: true` means "Tauri's internal drag-drop handling is enabled" which intercepts events before they reach the DOM. To use standard HTML5 drag-drop API (`draggable`, `ondragstart`, `ondrop`), you must set `dragDropEnabled: false`.

**How to avoid:**
- Set `dragDropEnabled: false` in `tauri.conf.json` under `app.windows[].dragDropEnabled`
- If you need BOTH Tauri file drop (files from Finder) AND DOM drag-drop (reorder within app):
  - Use `dragDropEnabled: false` globally
  - Listen to `onDragDropEvent` from Tauri API for external file drops
  - Use standard DOM events for internal drag operations
  - Detect source by checking `event.dataTransfer.files.length > 0` (external) vs custom drag data (internal)

**Warning signs:**
- DOM drag handlers never fire despite correct JSX attributes
- `ondragstart` works in browser dev but not in Tauri app
- Files dropped from Finder work but internal drag-reorder doesn't

**Phase to address:**
File tree feature implementation phase. Verify config before writing any drag-drop code.

---

### Pitfall 5: macOS Drag-Drop Crash on Invalid File Paths

**What goes wrong:**
User drags a file from another app (like Apple Music or Rekordbox) where the underlying file has been moved/deleted. Tauri's native drag handler tries to resolve the path and calls `abort()` when the file doesn't exist. The entire Efxmux app crashes with SIGABRT.

**Why it happens:**
This is a known Tauri bug (tauri-apps/tauri#14624, reported December 2025, affects Tauri 2.5.1 through 2.9.4). Tauri's macOS drag handling code panics instead of returning an error when the dragged file path is invalid. The bug affects any drag operation where the source file no longer exists.

**How to avoid:**
- This bug may be fixed in Tauri 2.10+. Check release notes before starting implementation.
- If not fixed: add defensive code in `onDragDropEvent` handler to catch and handle invalid paths gracefully
- Display user feedback ("Dropped file not found") rather than crashing
- Consider filing/upvoting the issue if implementing drag-drop is critical

**Warning signs:**
- App crashes when dragging files from media library apps
- SIGABRT in crash logs during drag operations
- Crashes only on macOS, not in web dev mode

**Phase to address:**
Drag-drop implementation phase. Verify Tauri version fixes bug or implement workaround.

---

### Pitfall 6: xterm.js Phantom Characters on Fast Scroll (Synchronized Output)

**What goes wrong:**
User scrolls fast through terminal output (especially TUI apps like Claude Code). "Phantom characters" appear -- garbled text, characters stuck on screen that aren't part of the buffer, visual artifacts. This is a known issue mentioned in the user's research notes.

**Why it happens:**
TUI applications use DEC mode 2026 "Synchronized Output" to batch screen updates. The app sends `CSI ? 2026 h` (start sync), renders a frame, then sends `CSI ? 2026 l` (end sync). xterm.js 5.x didn't support this; xterm.js 6.0 added support. However, during fast scroll, the synchronization can break down -- intermediate frames render when they shouldn't.

**How to avoid:**
- Verify xterm.js 6.0 is correctly configured (project already uses 6.0)
- Ensure WebGL addon is active (project uses it) -- DOM renderer has worse sync behavior
- If phantom chars persist in 6.0:
  - Implement a scroll debouncer that pauses PTY reads during fast scroll
  - Or implement backpressure: when xterm.js write buffer > 128KB, pause PTY reads
  - Consider explicit sync mode detection and buffering
- Add `.xterm-selection { overflow: hidden; }` to fix selection highlight artifacts (related issue #5198)

**Warning signs:**
- Characters "stick" on screen after scrolling
- Visual glitches only during fast scroll, not normal typing
- TUI apps (htop, vim, Claude Code) affected more than plain shell

**Phase to address:**
Bug fix phase. This is a known issue that should be prioritized early.

---

### Pitfall 7: git2-rs Repository Locking Causes Concurrent Operation Failures

**What goes wrong:**
User clicks "Stage All" in git control while a background refresh is reading git status. git2's `Repository::statuses()` holds a read lock. The staging operation tries to acquire a write lock. One operation fails with "failed to create locked file" or hangs.

**Why it happens:**
git2/libgit2 uses pessimistic locking at the Repository level. Operations create `.git/index.lock` or similar lock files. Unlike git CLI which handles this gracefully with retries, git2 operations fail immediately if the lock is held.

**How to avoid:**
- Serialize all git operations through a single async channel/mutex in Rust
- Use `spawn_blocking` with a single-permit semaphore for git operations
- Never call git2 operations concurrently from multiple Tauri commands
- The current code already uses `spawn_blocking` -- extend this to use an `Arc<Mutex<Repository>>` or operation queue

**Warning signs:**
- "failed to create locked file" errors in Tauri logs
- Operations hang when git status refresh overlaps with user action
- Works fine with slow interaction, fails under fast clicking

**Phase to address:**
Git control implementation phase. Architecture decision: serialize all git2 access.

---

## Moderate Pitfalls

---

### Pitfall 8: File Edit Tab with Binary or Large Files Corrupts Data or Freezes UI

**What goes wrong:**
User double-clicks a file to edit in tab. Current `read_file_content` has a 1MB guard, but even files under 1MB can cause problems. Binary files (images, compiled assets) render as mojibake. Large text files (500KB+ of minified JS) cause UI freeze while loading into xterm.js or text editor component.

**Why it happens:**
The current implementation uses `std::fs::read_to_string()` which assumes UTF-8. Binary files with invalid UTF-8 sequences either fail or produce garbled output. Large files block the UI thread if not handled with streaming.

**How to avoid:**
- Detect binary content before rendering. Use `content_inspector` crate to check first 1KB for NULL bytes or BOM markers
- For binary files: show "Binary file, cannot edit" message with option to open in external editor
- For large text files (>100KB): stream content or show warning before loading
- Add encoding detection for non-UTF-8 files (use `encoding_rs` crate)
- Preserve BOM on save if file had one (`unicode-bom` crate)

**Warning signs:**
- Opening `.png` or `.wasm` file shows garbage text
- UI freezes for several seconds when opening large files
- Saved file has different encoding than original
- Non-ASCII characters corrupted after save

**Phase to address:**
File editing implementation phase. Add binary/encoding detection before content display.

---

### Pitfall 9: File Editing Without Locking Causes External Editor Conflicts

**What goes wrong:**
User opens `README.md` in Efxmux tab for editing. Meanwhile, they also have it open in VS Code. User edits in VS Code and saves. Then edits in Efxmux and saves. The Efxmux save overwrites VS Code changes without warning.

**Why it happens:**
The current `write_checkbox` uses atomic write (temp + rename) but doesn't check if file changed since it was loaded. There's no file locking mechanism. External editors modify the file between read and write.

**How to avoid:**
- Store file mtime when loading for edit
- Before saving, compare current mtime against stored mtime
- If different: prompt user "File changed externally. Reload, Overwrite, or Cancel?"
- Consider watching the specific file being edited (not just directory) for external changes
- Use `flock` or similar advisory locking if editing is long-running (but note: Zed/VS Code don't respect advisory locks)

**Warning signs:**
- User loses changes made in other editor
- File content jumps unexpectedly after save
- No warning when external changes occurred

**Phase to address:**
File editing implementation phase. Implement mtime check before any write operation.

---

### Pitfall 10: xterm.js Custom Scrollbar CSS Breaks Viewport Clicking

**What goes wrong:**
User wants a thin custom scrollbar (mentioned in research notes). Developer adds CSS `::-webkit-scrollbar` rules to `.xterm-viewport`. The scrollbar looks correct but becomes unclickable -- can't drag the scrollbar thumb, clicking in scrollbar track doesn't scroll.

**Why it happens:**
The xterm.js fit addon calculates terminal dimensions including scrollbar width. Custom CSS that changes scrollbar width causes the fit calculation to be wrong. The `.xterm-rows` div extends over the scrollbar area, intercepting click events. Historical issue: xterm.js#1284.

**How to avoid:**
- If customizing scrollbar: also override the fit addon's calculation or accept slightly wrong column count
- Use `position: absolute; right: 0; z-index: 1;` on `.xterm-viewport` to ensure scrollbar is on top
- Test scrollbar clicking after any CSS changes to scrollbar
- Consider using `scrollbar-width: thin` (standard CSS, not webkit) for simpler implementation

**Warning signs:**
- Scrollbar visible but mouse cursor shows text selection instead of pointer
- Can scroll with wheel but not by clicking scrollbar
- Scrollbar works after resize but breaks after fit()

**Phase to address:**
Terminal scroll fix phase. Test thoroughly after any scrollbar CSS changes.

---

### Pitfall 11: Concurrent File Watchers Accumulate on Project Switch

**What goes wrong:**
User switches projects frequently. Each project switch calls `set_project_path` which spawns new watcher threads. The old watchers are never stopped. After 10 project switches, there are 10 MD watchers and 10 git watchers running, consuming resources and potentially emitting stale events.

**Why it happens:**
The current `file_watcher.rs` spawns threads that run forever (`loop { sleep(3600) }`). There's no mechanism to stop old watchers when the project changes. The watcher threads hold `debouncer` which holds file handles.

**How to avoid:**
- Store watcher handles in `ManagedAppState` and drop them when project changes
- Use `tokio::sync::broadcast` or `std::sync::mpsc` to send shutdown signal to watcher threads
- Or: single watcher thread that receives new paths via channel, unwatches old, watches new
- Check for handle leaks with `lsof | grep efxmux` during testing

**Warning signs:**
- File handle count grows over time
- Events fire for old project paths after switching
- Memory usage creeps up with project switches

**Phase to address:**
Bug fix phase early in milestone. Architectural fix before adding more watchers.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip commit signing | Avoids gpg/ssh signing complexity | Users with signing requirements can't use git control | v0.3.0 MVP -- document limitation clearly |
| Shell out to `git push` | Gets auth for free (uses user's git config) | Loses git2 benefits, spawns processes | Never for push -- implement credential callback |
| No file locking | Simpler edit implementation | Data loss on concurrent edits | v0.3.0 if mtime check is implemented |
| Single watcher thread per feature | Simple implementation | Resource leak on project switch | Never -- fix watcher lifecycle in bug fix phase |
| Ignore binary files | Simpler file tree | Users confused why files won't open | v0.3.0 -- show clear "binary file" message |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| git2-rs push | Assuming ssh-agent works automatically | Implement `RemoteCallbacks::credentials()` with fallback chain |
| git2-rs + concurrent ops | Calling git2 from multiple async tasks | Serialize all git2 calls through single mutex/semaphore |
| Tauri drag-drop | Setting `dragDropEnabled: true` | Set `dragDropEnabled: false` to enable DOM drag-drop |
| Tauri file drop from Finder | Not handling `onDragDropEvent` separately | Use Tauri API for external drops, DOM events for internal |
| notify file watcher | Trusting event paths with atomic saves | Re-check file existence after debounce; poll on focus |
| xterm.js scrollbar | Customizing via CSS without testing clicks | Test scrollbar interaction after any CSS changes |
| File encoding | Assuming all files are UTF-8 | Detect binary/encoding before read; preserve BOM on write |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading large files into editor | UI freeze for 1-3 seconds | Stream content; warn for >100KB; reject >1MB | Files > 100KB |
| Many file watchers running | High CPU idle; file handle exhaustion | Stop old watchers on project switch | After 10+ project switches |
| git2 status on large repos | Slow git status pane refresh | Cache status; only refresh on watcher event | Repos with 10K+ files |
| xterm.js fast scroll without backpressure | Phantom characters; browser memory pressure | Implement write buffer high-water mark | TUI apps with high output |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Editing files outside project root | User edits `/etc/passwd` via path manipulation | Validate all paths stay within active project (existing code does this) |
| Storing SSH credentials in memory | Credential theft via memory dump | Use `Cred::ssh_key_from_agent()`; never store passphrases |
| Trusting external file drop paths | Path traversal via specially crafted filename | Canonicalize paths; reject if outside allowed directories |
| Not sanitizing commit messages | Command injection if shelling out to git | Use git2 API (no shell); or escape shell arguments |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent push failure | User thinks push succeeded; changes lost | Show clear error dialog with actionable message |
| Unsigned commits without warning | User's GitHub shows "Unverified" badges | Check config; warn before first commit |
| File edit overwrites external changes | Data loss | mtime check; "File changed externally" dialog |
| Binary file opens as garbled text | Confusion; potential accidental corruption | Detect binary; show "Cannot edit binary file" |
| Drag-drop doesn't work (config wrong) | Feature appears broken | Test drag-drop in first implementation PR |

## "Looks Done But Isn't" Checklist

- [ ] **Git push:** Test with fresh macOS user who hasn't run `ssh-add` -- credential callback must handle this
- [ ] **Git push:** Test with HTTPS remote -- credential callback must handle username/password
- [ ] **Git commit:** Check user's `commit.gpgsign` config and display warning if true
- [ ] **Drag-drop:** Verify `dragDropEnabled: false` in `tauri.conf.json`
- [ ] **Drag-drop:** Test dragging file from Finder AND reordering within file tree
- [ ] **File edit:** Test opening a `.png` file -- should show error, not garbled text
- [ ] **File edit:** Test opening file >1MB -- should be rejected with clear message
- [ ] **File watcher:** Switch projects 5 times, verify old watchers stopped (check `lsof`)
- [ ] **Scrollbar:** After CSS changes, verify scrollbar thumb is draggable
- [ ] **Fast scroll:** Test with Claude Code running; no phantom characters

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SSH push auth fails | LOW | Implement credential callback; add user-facing error with "run ssh-add" hint |
| Drag-drop config wrong | LOW | Set `dragDropEnabled: false`; re-test |
| Binary file corruption | MEDIUM | Add binary detection; user may have already corrupted files -- warn in release notes |
| Watcher accumulation | MEDIUM | Implement watcher lifecycle management; restart app to clear leaked handles |
| External edit overwrite | MEDIUM | Implement mtime check; lost data cannot be recovered |
| Commit signing expectations | LOW | Document limitation; add warning dialog |
| Scrollbar not clickable | LOW | Fix CSS z-index; test clicking before shipping |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| File watcher atomic save | Bug fix phase (early) | Test with Zed external edit; file tree updates |
| Watcher accumulation | Bug fix phase (early) | `lsof` shows constant handle count after project switches |
| Phantom characters | Bug fix phase (early) | Fast scroll in Claude Code; no visual artifacts |
| Scrollbar CSS | Bug fix phase (early) | Scrollbar thumb is draggable |
| git2 push auth | Git control design | Push works without prior `ssh-add`; HTTPS repos work |
| git2 commit signing | Git control design | Warning shown if `commit.gpgsign=true` |
| git2 locking | Git control implementation | Concurrent status refresh + stage operation doesn't crash |
| Drag-drop config | File tree implementation | DOM drag handlers fire correctly |
| Drag-drop crash | File tree implementation | No crash when dragging deleted file reference |
| Binary file detection | File editing implementation | Binary files show error message |
| External edit conflict | File editing implementation | mtime check prompts on conflict |

## Sources

**Official Documentation:**
- Tauri v2 drag-drop API: https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow
- Tauri v2 file system plugin: https://v2.tauri.app/plugin/file-system
- git2-rs RemoteCallbacks: https://docs.rs/git2/latest/git2/struct.RemoteCallbacks.html
- git2-rs credential handling: https://docs.rs/git2/latest/git2/struct.Cred.html
- libgit2 authentication guide: https://libgit2.org/docs/guides/authentication/
- xterm.js terminal options: https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/
- notify-debouncer-mini: https://docs.rs/notify-debouncer-mini/latest/notify_debouncer_mini/
- content_inspector crate: https://docs.rs/content_inspector/latest/content_inspector/

**GitHub Issues (Known Bugs):**
- Tauri drag-drop crash (SIGABRT): https://github.com/tauri-apps/tauri/issues/14624
- Tauri drag-drop config confusion: https://github.com/tauri-apps/tauri/issues/14373
- libgit2 SSH signing not supported: https://github.com/libgit2/libgit2/issues/6397
- xterm.js selection highlight after scroll: https://github.com/xtermjs/xterm.js/issues/5198
- xterm.js fit addon scrollbar issue: https://github.com/xtermjs/xterm.js/issues/1284
- git2-rs credential callback looping: https://github.com/rust-lang/git2-rs/issues/347

**Community Resources:**
- notify file watcher debounce patterns: https://oneuptime.com/blog/post/2026-01-25-file-watcher-debouncing-rust/view
- Tauri drag-drop config fix: https://ellie.wtf/notes/drag-event-issues-in-Tauri
- Git commit signing explained (GitButler): https://blog.gitbutler.com/signing-commits-in-git-explained

---
*Pitfalls research for: Efxmux v0.3.0 Workspace Evolution*
*Researched: 2026-04-14*
