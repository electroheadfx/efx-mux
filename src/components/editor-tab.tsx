// editor-tab.tsx -- CodeMirror 6 editor tab component
// Built per D-06, D-07, D-17, EDIT-01, EDIT-02, EDIT-03

import { useRef, useEffect } from 'preact/hooks';
import { EditorView } from '@codemirror/view';
import { listen } from '@tauri-apps/api/event';
import { createEditorState, registerEditorView, unregisterEditorView, registerSaveCallback, unregisterSaveCallback, triggerEditorSave } from '../editor/setup';
import { getLanguageExtension } from '../editor/languages';
import { writeFile, readFile } from '../services/file-service';
import { showToast } from './toast';
import { setEditorDirty } from './unified-tab-bar';

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
      } catch {
        // File may have been deleted -- ignore
      }
    });
    return () => {
      cancelled = true;
      unlistenPromise.then(fn => fn());
    };
  }, [filePath, tabId]);

  // Listen for editor-save event (dispatched by main.tsx on Cmd+S)
  useEffect(() => {
    function onEditorSave() {
      if (viewRef.current) {
        viewRef.current.focus();
        triggerEditorSave(tabId);
      }
    }
    document.addEventListener('editor-save', onEditorSave);
    return () => document.removeEventListener('editor-save', onEditorSave);
  }, [tabId]);

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
