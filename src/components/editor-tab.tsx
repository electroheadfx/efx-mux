// editor-tab.tsx -- CodeMirror 6 editor tab component
// Built per D-06, D-07, D-17, EDIT-01, EDIT-02, EDIT-03

import { useRef, useEffect } from 'preact/hooks';
import { EditorView } from '@codemirror/view';
import { listen } from '@tauri-apps/api/event';
import { createEditorState, registerEditorView, unregisterEditorView, registerSaveCallback, unregisterSaveCallback } from '../editor/setup';
import { getLanguageExtension } from '../editor/languages';
import { writeFile, readFile } from '../services/file-service';
import { showToast } from './toast';
import { setEditorDirty, setEditorChangedOnDisk, closeEditorTabForDeletedFile } from './unified-tab-bar';

// ── Props ─────────────────────────────────────────────────────────────────────────

export interface EditorTabProps {
  tabId: string;
  filePath: string;
  fileName: string;
  content: string;
  isActive: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function EditorTab({ tabId, filePath, fileName, content, isActive }: EditorTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const setupRef = useRef<ReturnType<typeof createEditorState> | null>(null);

  // IN-02: stash latest values in refs so the EditorView-creation useEffect
  // can read fresh callbacks / fileName without re-running on every render.
  // The useEffect only re-creates the EditorView when filePath changes (a
  // different file = genuinely different view); for everything else we reach
  // the latest value through `.current`. This removes the stale-closure risk
  // that the previous exhaustive-deps suppression was masking.
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;

  // initialContentRef captures `content` at first mount so the EditorView is
  // seeded with the correct text at creation. It is intentionally NOT
  // reassigned on every render — ongoing content edits flow through
  // CodeMirror itself, and external disk changes flow through the
  // file-tree-changed listener (Plan 21-01). The `useRef(content)` form
  // only uses the initial argument; subsequent renders ignore it, which is
  // exactly the semantic we need. We also refresh it before the EditorView
  // is re-created on filePath change (see the useEffect below), using a
  // closure captured from the latest render rather than reading `content`
  // directly inside the useEffect — so the deps array can remain honest
  // without needing to suppress the exhaustive-deps rule.
  const initialContentRef = useRef(content);
  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  async function handleSave(docContent: string): Promise<void> {
    try {
      await writeFile(filePath, docContent);
      if (setupRef.current) {
        setupRef.current.setSavedContent(docContent);
      }
      setEditorDirty(tabId, false);
      showToast({ type: 'success', message: `Saved ${fileNameRef.current}` });
    } catch (err) {
      showToast({ type: 'error', message: `Save failed: ${String(err)}` });
    }
  }

  function handleDirtyChange(dirty: boolean): void {
    setEditorDirty(tabId, dirty);
  }

  // Stable refs for callbacks so the EditorView useEffect's deps array is
  // honest. The callbacks close over `filePath`, `tabId`, `fileNameRef`;
  // updating `.current` every render ensures CodeMirror always invokes the
  // latest version without triggering EditorView recreation.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const handleDirtyChangeRef = useRef(handleDirtyChange);
  handleDirtyChangeRef.current = handleDirtyChange;

  // Create EditorView once per filePath; destroy on cleanup.
  // Deps are accurate: fileName / content / callbacks are reached via refs,
  // so no suppression of the react-hooks/exhaustive-deps rule is needed.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Refresh the initial-content ref from latestContentRef (updated every
    // render) at the moment of EditorView creation — handles filePath
    // changes where the parent passes new content alongside the new path.
    initialContentRef.current = latestContentRef.current;

    const lang = getLanguageExtension(fileNameRef.current);
    const setup = createEditorState(initialContentRef.current, {
      language: lang,
      onSave: (doc) => handleSaveRef.current(doc),
      onDirtyChange: (dirty) => handleDirtyChangeRef.current(dirty),
    });

    const view = new EditorView({
      state: setup.state,
      parent: container,
    });

    viewRef.current = view;
    setupRef.current = setup;

    // Register so closeUnifiedTab can get current content via getEditorCurrentContent
    registerEditorView(tabId, view);
    registerSaveCallback(tabId, (doc) => handleSaveRef.current(doc));

    return () => {
      unregisterEditorView(tabId);
      unregisterSaveCallback(tabId);
      view.destroy();
      viewRef.current = null;
      setupRef.current = null;
    };
  }, [filePath, tabId]);

  // Focus the editor when tab becomes active
  useEffect(() => {
    if (isActive && viewRef.current) {
      viewRef.current.focus();
    }
  }, [isActive]);

  // Re-read file content when git status changes (handles git checkout/revert)
  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen('git-status-changed', async () => {
      if (cancelled || !viewRef.current || !setupRef.current) return;
      try {
        const diskContent = await readFile(filePath);
        const savedContent = setupRef.current.getSavedContent();
        if (diskContent !== savedContent) {
          // File changed on disk -- update editor
          const view = viewRef.current;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: diskContent },
          });
          setupRef.current.setSavedContent(diskContent);
          setEditorDirty(tabId, false);
        }
      } catch (err) {
        // Plan 18-11 (Gap G-01 secondary fix): auto-close the tab when the file
        // has been deleted from disk. Match common FS not-found error text so
        // permission errors / other transient failures still silently retry on
        // the next emit. closeEditorTabForDeletedFile bypasses the unsaved-changes
        // confirm modal because the file is gone — saving is impossible.
        const msg = err instanceof Error ? err.message : String(err);
        if (/no such file|not found|notfound|os error 2/i.test(msg)) {
          closeEditorTabForDeletedFile(filePath);
        }
        // else: transient failure — ignore, listener will re-run on next emit.
      }
    });
    return () => {
      cancelled = true;
      unlistenPromise.then(fn => fn());
    };
  }, [filePath, tabId]);

  // Phase 21 Plan 01 (FIX-01 / D-06, D-07): re-read file content when the project
  // file-tree watcher reports an external change matching this tab's filePath.
  //
  // Dirty-guard: if the editor buffer differs from the last-saved baseline, we
  // REFUSE to clobber the user's unsaved edits and instead flip the
  // `changedOnDisk` flag to surface a tab-level indicator. If the buffer is
  // clean we reload in place, preserving scroll position best-effort.
  //
  // CRITICAL: this listener MUST NOT touch activeUnifiedTabId — D-06 requires
  // focus preservation. We only mutate the editor buffer of THIS tab, and only
  // when the watcher's payload path equals THIS tab's filePath.
  //
  // SECURITY (threat T-21-01-04): we call readFile(filePath) using the
  // closure-captured trusted path, NOT event.payload. The payload is used only
  // as an equality gate. Even if the watcher were compromised it could not
  // redirect us to a different file.
  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen<string>('file-tree-changed', async (event) => {
      if (cancelled || !viewRef.current || !setupRef.current) return;

      // Path-filter: only react if the watcher's changed path matches this tab.
      const changedPath = event.payload;
      if (changedPath !== filePath) return;

      try {
        const diskContent = await readFile(filePath);
        const savedContent = setupRef.current.getSavedContent();
        if (diskContent === savedContent) {
          // No-op: file on disk matches our baseline. Also clear the indicator
          // if it was previously set (e.g. user reverted the external change).
          setEditorChangedOnDisk(tabId, false);
          return;
        }

        // Dirty = buffer differs from saved baseline.
        const currentDoc = viewRef.current.state.doc.toString();
        const isDirty = currentDoc !== savedContent;

        if (isDirty) {
          // D-07: preserve unsaved edits. Flag the indicator instead.
          setEditorChangedOnDisk(tabId, true);
          return;
        }

        // Clean tab — reload in place. Preserve scroll best-effort.
        const view = viewRef.current;
        const scrollTop = view.scrollDOM.scrollTop;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: diskContent },
        });
        setupRef.current.setSavedContent(diskContent);
        setEditorDirty(tabId, false);
        setEditorChangedOnDisk(tabId, false);
        // Restore scroll after dispatch (next frame so layout settles).
        requestAnimationFrame(() => { view.scrollDOM.scrollTop = scrollTop; });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/no such file|not found|notfound|os error 2/i.test(msg)) {
          closeEditorTabForDeletedFile(filePath);
        }
        // else: transient failure — ignore, listener will re-run on next emit.
      }
    });
    return () => {
      cancelled = true;
      unlistenPromise.then(fn => fn());
    };
  }, [filePath, tabId]);

  return (
    <div
      style={{
        display: isActive ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
