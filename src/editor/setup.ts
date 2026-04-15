// editor/setup.ts -- CodeMirror 6 EditorState factory
// Built per D-06

import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { syntaxHighlighting } from '@codemirror/language';
import { efxmuxTheme, efxmuxHighlightStyle } from './theme';
import { getLanguageExtension } from './languages';
import { showMinimap } from '@replit/codemirror-minimap';

// ── Options Interface ─────────────────────────────────────────────────────────

export interface EditorSetupOptions {
  /** CM6 language extension (from getLanguageExtension), or null for plain text */
  language: Extension | null;
  /** Called when user presses Mod-s (Cmd+s / Ctrl+s) */
  onSave: (content: string) => void;
  /** Called when the document dirty state changes (true = unsaved, false = saved) */
  onDirtyChange: (dirty: boolean) => void;
}

// ── Result Interface ──────────────────────────────────────────────────────────

export interface EditorSetupResult {
  state: EditorState;
  getSavedContent: () => string;
  setSavedContent: (content: string) => void;
}

// ── EditorView Registry ────────────────────────────────────────────────────────

/** Module-level registry: tabId -> EditorView, so closeUnifiedTab can get current content */
const editorViewMap = new Map<string, EditorView>();

export function registerEditorView(tabId: string, view: EditorView): void {
  editorViewMap.set(tabId, view);
}

export function unregisterEditorView(tabId: string): void {
  editorViewMap.delete(tabId);
}

export function getEditorCurrentContent(tabId: string): string | null {
  const view = editorViewMap.get(tabId);
  if (!view) return null;
  return view.state.doc.toString();
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates a configured CM6 EditorState with all required extensions:
 * basicSetup, language support, custom theme, syntax highlighting, minimap,
 * Mod-s save keymap, and dirty-change tracking.
 */
export function createEditorState(
  content: string,
  options: EditorSetupOptions,
): EditorSetupResult {
  let savedContent = content;

  const extensions: Extension[] = [
    basicSetup,
    ...(options.language ? [options.language] : []),
    efxmuxTheme,
    syntaxHighlighting(efxmuxHighlightStyle),
    keymap.of([
      {
        key: 'Mod-s',
        run: (view: EditorView) => {
          options.onSave(view.state.doc.toString());
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onDirtyChange(update.state.doc.toString() !== savedContent);
      }
    }),
    showMinimap.compute(['doc'], () => ({
      create: () => ({ dom: document.createElement('div') }),
      displayText: 'blocks',
      showOverlay: 'always',
    })),
  ];

  const state = EditorState.create({ doc: content, extensions });

  return {
    state,
    getSavedContent: () => savedContent,
    setSavedContent: (s: string) => {
      savedContent = s;
    },
  };
}
