---
status: diagnosed
trigger: "Phase 18 UAT Test 8: New File with existing name silently replaces existing file (data loss). User: 'when I try with a name which exist already it replace the file or folder !'"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. `create_file` Rust command (Phase 15, file_ops.rs:356-378) writes via `fs::write(path, "")` with NO existence check, silently truncating the existing file. This contrasts with `create_folder` (Phase 18, file_ops.rs:417-425) and `copy_path` (file_ops.rs:457-479) which both have `Path::exists()` guards. Frontend `InlineCreateRow.commit()` is correctly written to surface "already exists" errors but never receives one because Rust never returns it.
test: Read create_file_impl, create_folder_impl, file-service.ts createFile wrapper, InlineCreateRow.commit() handler, and verify command registration in lib.rs
expecting: Asymmetry between create_file (no guard) and create_folder (guarded) — confirmed
next_action: Return ROOT CAUSE FOUND to caller; fix is deferred to gap-closure plan.

## Symptoms

expected: "'<name>' already exists" error when creating file/folder with name that collides; existing file/folder remains untouched. Per Plan 18-03 SUMMARY: "conflict → ''{name}' already exists' with input re-focused for retry".
actual: When Right-click folder → New File → typing existing name → Enter, the existing file is silently REPLACED (data loss). No error shown.
errors: None reported by user (no toast, no inline error message — silent overwrite).
reproduction: Phase 18 UAT Test 8. Right-click any folder → New File → type a name that already exists → press Enter. Observe: existing file content is gone, replaced with empty file.
started: Found in Phase 18 UAT (2026-04-16); root cause likely present since Phase 15 introduced create_file.

## Eliminated

(none yet — investigation just beginning)

## Evidence

- timestamp: 2026-04-16T00:00:00Z
  checked: /Users/lmarques/Dev/efx-mux/src-tauri/src/file_ops.rs lines 356-378 (create_file_impl + create_file Tauri command)
  found: |
    create_file_impl is defined as:
      pub fn create_file_impl(path: &str) -> Result<(), String> {
          if !is_safe_path(path) { return Err("Invalid path: directory traversal not allowed".to_string()); }
          if let Some(parent) = Path::new(path).parent() {
              if !parent.as_os_str().is_empty() {
                  std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
              }
          }
          std::fs::write(path, "").map_err(|e| e.to_string())
      }
    There is NO `Path::new(path).exists()` check before `std::fs::write(path, "")`.
    `std::fs::write` documentation: "This function will create a file if it does not exist, and will entirely replace its contents if it does." → silent truncation.
  implication: create_file always overwrites existing files. Confirms hypothesis.

- timestamp: 2026-04-16T00:00:00Z
  checked: /Users/lmarques/Dev/efx-mux/src-tauri/src/file_ops.rs lines 417-425 (create_folder_impl)
  found: |
    create_folder_impl is defined as:
      pub fn create_folder_impl(path: &str) -> Result<(), String> {
          if !is_safe_path(path) { return Err("Invalid path: directory traversal not allowed".to_string()); }
          if Path::new(path).exists() {
              return Err(format!("Path already exists: {}", path));
          }
          std::fs::create_dir_all(path).map_err(|e| e.to_string())
      }
    create_folder DOES have `Path::new(path).exists()` check (line 421-423). Returns "Path already exists: {path}".
    Also note: tests confirm this — create_folder_rejects_existing test exists at line 876-886.
  implication: |
    Asymmetry: create_folder rejects existing (Phase 18 added explicit guard); create_file (Phase 15) does not.
    The user said "file or folder" but evidence suggests folder path is actually safe — only file path has the bug.
    However: test the folder path too in the frontend to be sure the Rust error is surfaced.

- timestamp: 2026-04-16T00:00:00Z
  checked: /Users/lmarques/Dev/efx-mux/src/services/file-service.ts lines 80-87 (createFile wrapper)
  found: |
    createFile is:
      export async function createFile(path: string): Promise<void> {
        try {
          await invoke('create_file', { path });
          await emit('git-status-changed');
        } catch (e) {
          throw new FileError('CreateError', String(e));
        }
      }
    The wrapper would surface a Rust error properly via FileError if Rust returned one. But Rust never returns one for existing-file case.
  implication: Frontend wrapper is correct. The bug is purely in Rust create_file_impl.

- timestamp: 2026-04-16T00:00:00Z
  checked: Tests in file_ops.rs lines 828-859 for create_file
  found: |
    Tests exist:
      - create_file_creates_empty_file (file does not exist case)
      - create_file_creates_parent_directories
      - create_file_rejects_traversal
    There is NO test like "create_file_rejects_existing" that would have caught this.
    Compare to create_folder which has explicit create_folder_rejects_existing test (line 876).
  implication: Test gap. Phase 15 spec did not require existence check; Phase 18 spec for create_folder did, but this asymmetry was never reconciled.

- timestamp: 2026-04-16T00:00:00Z
  checked: /Users/lmarques/Dev/efx-mux/src/components/file-tree.tsx lines 614-635 (InlineCreateRow.commit())
  found: |
    InlineCreateRow.commit() is:
      async function commit() {
        if (committedRef.current) return;
        const err = validate(name);
        if (err) { setError(err); return; }
        committedRef.current = true;
        const target = `${parentDir}/${name.trim()}`;
        try {
          if (kind === 'file') await createFile(target);
          else await createFolder(target);
          onDone();
        } catch (e) {
          committedRef.current = false;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('exists')) {
            setError(`'${name.trim()}' already exists`);
          } else {
            setError(msg);
          }
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    The validate() function (line 607-612) only checks for empty name and slash/null characters — it does NOT pre-check for path existence (and reasonably should not, since that would be a Rust round-trip).
    The catch block IS correctly written to surface "already exists" errors and re-focus the input.
  implication: |
    Frontend is correct and properly handles the error case — IF Rust returns one. For the file path, the catch block is unreachable because `createFile` resolves successfully (Rust silently overwrites). For the folder path, Rust returns "Path already exists: {path}" which contains "already exists", the catch fires, and the error message renders correctly. → Bug is ONLY on the file path, not the folder path. User's bug report wording "file or folder" likely conflated both because they only tested file.

- timestamp: 2026-04-16T00:00:00Z
  checked: /Users/lmarques/Dev/efx-mux/src-tauri/src/lib.rs line 160 (command registration)
  found: |
    `file_ops::create_file,` is registered in the generate_handler! macro. No middleware, no override, no other guard layer.
  implication: The Tauri invoke('create_file', { path }) call goes directly to the file_ops::create_file async wrapper which calls create_file_impl which calls std::fs::write(path, ""). No interception possible.

## Resolution

root_cause: |
  `create_file_impl` in src-tauri/src/file_ops.rs (line 356-367) calls `std::fs::write(path, "")` without first checking `Path::new(path).exists()`. `std::fs::write` silently truncates an existing file rather than failing. The companion command `create_folder_impl` (added in Phase 18, line 417-425) DOES include `if Path::new(path).exists() { return Err("Path already exists: {}") }`, but `create_file_impl` (added in Phase 15) was never updated to match.

  The frontend wrapper `createFile` in src/services/file-service.ts and the InlineCreateRow handler in src/components/file-tree.tsx both correctly propagate any FileError that the backend returns — but the backend never returns one in the conflict case. Result: the error path that Plan 18-03 SUMMARY describes ("conflict → ''{name}' already exists' with input re-focused for retry") is unreachable for files.

  Note: `create_folder` is not affected — its existence check works. The user's "file or folder" wording in the bug report likely covers both because they tested the file path and assumed folder was symmetric.
fix: (deferred — this is find_root_cause_only mode)
verification: (deferred)
files_changed: []
