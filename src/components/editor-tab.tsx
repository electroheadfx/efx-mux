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

  async function handleSave(docContent: string): Promise<void> {
    try {
      await writeFile(filePath, docContent);
      if (setupRef.current) {
        setupRef.current.setSavedContent(docContent);
      }
      setEditorDirty(tabId, false);
      showToast({ type: 'success', message: `Saved ${fileName}` });
    } catch (err) {
      showToast({ type: 'error', message: `Save failed: ${String(err)}` });
    }
  }

  function handleDirtyChange(dirty: boolean): void {
    setEditorDirty(tabId, dirty);
  }

  // Create EditorView once per filePath; destroy on cleanup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lang = getLanguageExtension(fileName);
    const setup = createEditorState(content, {
      language: lang,
      onSave: handleSave,
      onDirtyChange: handleDirtyChange,
    });

    const view = new EditorView({
      state: setup.state,
      parent: container,
    });

    viewRef.current = view;
    setupRef.current = setup;

    // Register so closeUnifiedTab can get current content via getEditorCurrentContent
    registerEditorView(tabId, view);
    registerSaveCallback(tabId, handleSave);

    return () => {
      unregisterEditorView(tabId);
      unregisterSaveCallback(tabId);
      view.destroy();
      viewRef.current = null;
      setupRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

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
