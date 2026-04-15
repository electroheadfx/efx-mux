// editor-tab.tsx -- CodeMirror 6 editor tab component
// Built per D-06, D-07, D-17, EDIT-01, EDIT-02, EDIT-03

import { useRef, useEffect } from 'preact/hooks';
import { EditorView } from '@codemirror/view';
import { createEditorState, registerEditorView, unregisterEditorView } from '../editor/setup';
import { getLanguageExtension } from '../editor/languages';
import { writeFile } from '../services/file-service';
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

    return () => {
      unregisterEditorView(tabId);
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
