# Phase 17: Main Panel File Tabs - Research

**Researched:** 2026-04-15
**Domain:** CodeMirror 6 editor integration, unified tab management, git diff accordion
**Confidence:** HIGH

## Summary

Phase 17 replaces the current read-only file viewer overlay and terminal-only tab bar with a unified tab system mixing terminal tabs, editor tabs (CodeMirror 6), and a git changes tab. The core work involves integrating CodeMirror 6 into a Preact/Tauri/Vite application, building a custom dark theme from existing design tokens, managing unsaved state tracking with save/close workflows, and implementing tab drag-and-drop reordering.

CodeMirror 6 is a mature, modular editor that integrates well with any framework since it uses vanilla DOM mounting (`new EditorView({ parent: domElement })`). The project already has Preact signals for state management, `file-service.ts` for file I/O, `diff-viewer.tsx` for diff rendering, and the `Dropdown` component for menus -- all of which are direct reuse targets. The main technical challenges are: (1) building a custom CM6 theme from tokens.ts, (2) detecting unsaved state via CM6's `EditorView.updateListener`, and (3) generalizing the terminal-only tab bar into a polymorphic tab system.

**Primary recommendation:** Use the `codemirror` meta-package with `basicSetup` for editor setup, add language-specific packages per D-08, build the custom theme with `EditorView.theme()` + `HighlightStyle.define()` from `@codemirror/language`, and use `@replit/codemirror-minimap` for the minimap. For TOML and shell highlighting, use `@codemirror/legacy-modes` with `StreamLanguage.define()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Unified tab bar -- single row mixing terminal tabs, editor tabs, and git changes tab. Replaces current TerminalTabBar.
- **D-02:** Each tab has a type indicator (green dot for active terminal, filename for editors, delta icon for git changes).
- **D-03:** One tab per file policy -- clicking an already-open file focuses its existing tab instead of creating a duplicate.
- **D-04:** [+] dropdown menu offers: Terminal Zsh, Agent (claude/opencode), Git Changes. Uses existing Dropdown component (Phase 15).
- **D-05:** Tab drag-and-drop reordering (EDIT-05 requirement).
- **D-06:** Extensions: line numbers, active line highlight, bracket matching + auto-close, search (Cmd+F), minimap, code folding.
- **D-07:** Custom CM6 theme built from tokens.ts (colors.bgBase, colors.textPrimary, colors.accent, etc.) -- matches Solarized Dark.
- **D-08:** Language support: TS/JS/TSX/JSX, Rust, CSS, HTML, JSON, TOML, YAML, Markdown, Shell. Each via @codemirror/lang-* packages.
- **D-09:** Unsaved indicator dot in tab title when file buffer differs from disk (EDIT-02).
- **D-10:** Cmd+S saves active editor tab to disk via file-service.ts writeFile (EDIT-03).
- **D-11:** Confirmation modal when closing tab with unsaved changes (EDIT-04).
- **D-12:** Accordion layout -- collapsible file entries with inline diff expansion. Reuses diff rendering logic from diff-viewer.tsx.
- **D-13:** File headers show status badge [M]/[A]/[D], filename, and +/- line counts.
- **D-14:** Auto-refresh on git-status-changed Tauri event (existing event pattern).
- **D-15:** Single-click in file tree opens file in editor tab (replaces read-only overlay).
- **D-16:** Remove existing read-only file viewer overlay from main-panel.tsx. All file viewing goes through editor tabs.
- **D-17:** Editor tabs are editable by default. Binary/large files can be shown as read-only fallback.

### Claude's Discretion
- Exact unsaved confirmation modal design and wording
- Tab overflow behavior when many tabs are open (scroll, compress, or dropdown)
- CodeMirror minimap positioning and sizing
- Tab drag feedback visuals (ghost element, insertion marker)
- Internal signal/state management architecture for unified tab system
- Whether to use native HTML drag-drop or a lightweight library for tab reordering

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | Open files in tabs with CodeMirror 6 syntax highlighting | CM6 setup pattern with `basicSetup` + language packages; custom theme from tokens.ts |
| EDIT-02 | Unsaved indicator dot in tab title | `EditorView.updateListener` tracks `docChanged`; compare buffer vs disk content |
| EDIT-03 | Save with Cmd+S | CM6 `keymap.of()` with `Mod-s` binding; calls `file-service.ts` writeFile |
| EDIT-04 | Confirmation modal on close with unsaved changes | Custom Preact modal component following project-modal.tsx pattern |
| EDIT-05 | Reorder tabs via drag and drop | Native HTML5 drag-and-drop API on tab elements |
| MAIN-01 | Add new tabs via dropdown (Terminal Zsh, Agent, Git changes) | Existing `Dropdown` component from Phase 15; tab type discriminated union |
| MAIN-02 | Git changes panel with accordion per-file diffs | Reuse `renderDiffHtml()` from diff-viewer.tsx; accordion collapsible sections |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File editing (CM6) | Browser / Client | -- | CodeMirror 6 is a browser-native editor; all editing happens in the DOM |
| File read/write | API / Backend (Rust) | Browser / Client | `read_file_content` and `write_file_content` are Tauri IPC commands in Rust; frontend calls via `invoke()` |
| Unsaved state tracking | Browser / Client | -- | In-memory comparison of CM6 buffer vs last-saved content; pure frontend logic |
| Tab management | Browser / Client | -- | Preact signals manage tab list, active tab, tab types; no backend involvement |
| Git diff data | API / Backend (Rust) | Browser / Client | `get_file_diff` and `get_git_status` are Tauri IPC commands; frontend renders the data |
| Tab persistence | Browser / Client | API / Backend (Rust) | Tab state serialized to state.json via existing `updateSession()` pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `codemirror` | 6.0.2 | Meta-package: exports `basicSetup` + `EditorView` | Official convenience bundle; includes line numbers, history, fold, bracket matching, search [VERIFIED: npm registry] |
| `@codemirror/state` | 6.6.0 | Editor state management, transactions, state fields | Required by CM6 architecture [VERIFIED: npm registry] |
| `@codemirror/view` | 6.41.0 | Editor view, DOM rendering, themes, keymaps | Required by CM6 architecture [VERIFIED: npm registry] |
| `@codemirror/language` | 6.12.3 | Language infrastructure, `HighlightStyle`, `syntaxHighlighting`, `StreamLanguage` | Required for theme syntax colors and legacy mode support [VERIFIED: npm registry] |
| `@codemirror/commands` | 6.10.3 | Default keybindings, `defaultKeymap`, `indentWithTab` | Standard key handling [VERIFIED: npm registry] |
| `@codemirror/search` | 6.6.0 | Search/replace panel (Cmd+F) | Required by D-06 [VERIFIED: npm registry] |

### Language Packages
| Library | Version | Purpose | Languages Covered |
|---------|---------|---------|-------------------|
| `@codemirror/lang-javascript` | 6.2.5 | JS/TS/JSX/TSX highlighting + parsing | TS, JS, TSX, JSX [VERIFIED: npm registry] |
| `@codemirror/lang-rust` | 6.0.2 | Rust highlighting | Rust [VERIFIED: npm registry] |
| `@codemirror/lang-css` | 6.3.1 | CSS highlighting | CSS [VERIFIED: npm registry] |
| `@codemirror/lang-html` | 6.4.11 | HTML highlighting (includes embedded JS/CSS) | HTML [VERIFIED: npm registry] |
| `@codemirror/lang-json` | 6.0.2 | JSON highlighting | JSON [VERIFIED: npm registry] |
| `@codemirror/lang-markdown` | 6.5.0 | Markdown highlighting | Markdown [VERIFIED: npm registry] |
| `@codemirror/lang-yaml` | 6.1.3 | YAML highlighting | YAML [VERIFIED: npm registry] |
| `@codemirror/legacy-modes` | 6.5.2 | StreamLanguage-based modes for TOML and Shell | TOML, Shell/Bash [VERIFIED: npm registry + GitHub mode listing] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@replit/codemirror-minimap` | 0.5.2 | Minimap extension for CM6 | D-06 minimap requirement [VERIFIED: npm registry] |
| `@lezer/highlight` | 1.2.3 | Highlight tag definitions for HighlightStyle | Required for custom syntax theme colors [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `codemirror` meta-package | Individual `@codemirror/*` imports | Meta-package is simpler; individual imports save ~5KB but add complexity. Use meta-package. |
| `@replit/codemirror-minimap` | No minimap | Minimap is a D-06 requirement; no alternative needed |
| Native HTML5 drag-drop | `@atlaskit/pragmatic-drag-and-drop` or `dnd-kit` | Tab reordering is simple enough for native API; libraries add 20-50KB for minimal gain |
| `@codemirror/language-data` | Individual lang-* packages | language-data auto-loads all 23 languages (~71KB); individual packages are lighter and explicit. Use individual packages per D-08. |

**Installation:**
```bash
pnpm add codemirror @codemirror/lang-javascript @codemirror/lang-rust @codemirror/lang-css @codemirror/lang-html @codemirror/lang-json @codemirror/lang-markdown @codemirror/lang-yaml @codemirror/legacy-modes @replit/codemirror-minimap @lezer/highlight
```

Note: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, and `@codemirror/search` are dependencies of the `codemirror` meta-package and will be installed automatically. Import them directly from their own packages.

## Architecture Patterns

### System Architecture Diagram

```
File Tree Click                    [+] Dropdown Menu
     |                                    |
     v                                    v
 "file-opened" event            createTab(type: terminal|editor|git)
     |                                    |
     +-----------> UnifiedTabStore <------+
                   (Preact signals)
                        |
          +-------------+-------------+
          |             |             |
    TerminalTab    EditorTab     GitChangesTab
    (xterm.js)     (CM6 view)   (accordion diffs)
          |             |             |
          v             v             v
     PTY/tmux     read_file_content   get_git_status
     (Rust IPC)   write_file_content  get_file_diff
                  (Rust IPC)          (Rust IPC)
                        |
                        v
                  Unsaved Tracker
                  (buffer vs disk)
                        |
               +--------+--------+
               |                 |
          Tab dot indicator   Cmd+S save
          (EDIT-02)           (EDIT-03)
                                 |
                                 v
                          Confirm Modal
                          (on close if dirty)
                          (EDIT-04)
```

### Recommended Project Structure
```
src/
  components/
    main-panel.tsx         # MODIFY: remove file viewer overlay, use UnifiedTabBar
    unified-tab-bar.tsx    # NEW: replaces TerminalTabBar, handles all tab types
    editor-tab.tsx         # NEW: CodeMirror 6 editor wrapper component
    git-changes-tab.tsx    # NEW: accordion per-file diff panel
    confirm-modal.tsx      # NEW: reusable confirmation modal
    terminal-tabs.tsx      # MODIFY: extract tab data types, keep PTY logic
  editor/
    setup.ts               # NEW: CM6 extensions, language detection, basicSetup config
    theme.ts               # NEW: custom dark theme from tokens.ts
    languages.ts           # NEW: language loader map (extension -> CM6 language)
  services/
    file-service.ts        # EXISTING: writeFile for Cmd+S save
  tokens.ts                # EXISTING: design tokens consumed by CM6 theme
```

### Pattern 1: CodeMirror 6 Editor Mounting in Preact
**What:** Mount CM6 as an imperative DOM element inside a Preact component using `useRef` + `useEffect`.
**When to use:** Any time CM6 needs to render in a Preact component.
**Example:**
```typescript
// Source: https://codemirror.net/docs/guide (adapted for Preact)
import { useRef, useEffect } from 'preact/hooks';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { efxmuxTheme, efxmuxHighlightStyle } from '../editor/theme';

interface EditorTabProps {
  filePath: string;
  content: string;
  language: Extension;
  onDirtyChange: (dirty: boolean) => void;
}

function EditorTab({ filePath, content, language, onDirtyChange }: EditorTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savedContentRef = useRef(content);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        language,
        efxmuxTheme,
        syntaxHighlighting(efxmuxHighlightStyle),
        keymap.of([{
          key: 'Mod-s',
          run: (view) => {
            handleSave(view);
            return true;
          }
        }]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const currentDoc = update.state.doc.toString();
            onDirtyChange(currentDoc !== savedContentRef.current);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); };
  }, [filePath]); // Re-create on file change

  return <div ref={containerRef} class="flex-1 overflow-hidden" />;
}
```
[VERIFIED: codemirror.net/docs/guide -- EditorView, basicSetup, EditorState.create, updateListener patterns]

### Pattern 2: Custom CM6 Theme from Design Tokens
**What:** Build a CM6 theme using `EditorView.theme()` for structural styling and `HighlightStyle.define()` for syntax colors, both consuming values from `tokens.ts`.
**When to use:** Creating the Efxmux dark theme for all editor tabs.
**Example:**
```typescript
// Source: https://codemirror.net/docs/guide (theme section)
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { colors, fonts } from '../tokens';

export const efxmuxTheme = EditorView.theme({
  '&': {
    backgroundColor: colors.bgBase,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: '13px',
  },
  '.cm-content': {
    caretColor: colors.accent,
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: colors.accent,
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: colors.accentMuted,
  },
  '.cm-activeLine': {
    backgroundColor: `${colors.bgElevated}80`,
  },
  '.cm-gutters': {
    backgroundColor: colors.bgBase,
    color: colors.textDim,
    borderRight: `1px solid ${colors.bgBorder}`,
  },
  '.cm-activeLineGutter': {
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
  },
  '.cm-foldPlaceholder': {
    backgroundColor: colors.bgSurface,
    border: 'none',
    color: colors.textMuted,
  },
  '.cm-searchMatch': {
    backgroundColor: `${colors.statusYellow}30`,
    outline: `1px solid ${colors.statusYellow}50`,
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: `${colors.statusYellow}50`,
  },
}, { dark: true });

export const efxmuxHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#C792EA' },        // purple keywords
  { tag: tags.string, color: '#C3E88D' },          // green strings
  { tag: tags.comment, color: colors.textDim },     // dim comments
  { tag: tags.number, color: '#F78C6C' },           // orange numbers
  { tag: tags.function(tags.variableName), color: '#82AAFF' }, // blue functions
  { tag: tags.typeName, color: '#FFCB6B' },         // yellow types
  { tag: tags.operator, color: '#89DDFF' },          // cyan operators
  { tag: tags.bool, color: '#FF5370' },              // red booleans
  { tag: tags.propertyName, color: colors.textSecondary },
  { tag: tags.definition(tags.variableName), color: '#82AAFF' },
]);
```
[VERIFIED: codemirror.net/docs/guide -- EditorView.theme with `{ dark: true }` option]
[VERIFIED: codemirror.net/docs/changelog -- HighlightStyle.define + syntaxHighlighting wrapping required since 0.20.0]

### Pattern 3: Legacy Mode Integration (TOML, Shell)
**What:** Use `StreamLanguage.define()` from `@codemirror/language` with modes from `@codemirror/legacy-modes`.
**When to use:** For TOML and Shell/Bash where no native CM6 lang package exists.
**Example:**
```typescript
// Source: https://github.com/codemirror/legacy-modes (confirmed toml.js and shell.js exist)
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { shell } from '@codemirror/legacy-modes/mode/shell';

const tomlLanguage = StreamLanguage.define(toml);
const shellLanguage = StreamLanguage.define(shell);
```
[VERIFIED: GitHub codemirror/legacy-modes mode directory -- toml.js and shell.js confirmed present]

### Pattern 4: Unified Tab Type System
**What:** Discriminated union for tab types, extending the existing `TerminalTab` pattern.
**When to use:** Managing the heterogeneous tab collection.
**Example:**
```typescript
// Inspired by existing TerminalTab interface in terminal-tabs.tsx
interface BaseTab {
  id: string;
  type: 'terminal' | 'editor' | 'git-changes';
}

interface TerminalTabData extends BaseTab {
  type: 'terminal';
  sessionName: string;
  label: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  ptyConnected: boolean;
  exitCode?: number | null;
}

interface EditorTabData extends BaseTab {
  type: 'editor';
  filePath: string;
  fileName: string;
  content: string;        // initial file content, set once at tab creation
  dirty: boolean;       // true when buffer !== saved content
  editorView?: EditorView;
}

interface GitChangesTabData extends BaseTab {
  type: 'git-changes';
}

type UnifiedTab = TerminalTabData | EditorTabData | GitChangesTabData;
```
[ASSUMED -- architecture pattern; aligns with existing codebase conventions]

### Pattern 5: Unsaved Change Detection
**What:** Track dirty state by comparing CM6 document content to the last-saved version.
**When to use:** For the unsaved indicator dot (EDIT-02) and close confirmation (EDIT-04).
**Example:**
```typescript
// Source: https://codemirror.net/docs/guide (updateListener, docChanged)
// Store reference to last-saved content
let savedContent = initialContent;

const dirtyTracker = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    const currentDoc = update.state.doc.toString();
    const isDirty = currentDoc !== savedContent;
    // Update tab dirty signal
    updateTabDirty(tabId, isDirty);
  }
});

// After successful save:
function onSaveSuccess(view: EditorView) {
  savedContent = view.state.doc.toString();
  updateTabDirty(tabId, false);
}
```
[VERIFIED: codemirror.net/docs/guide -- EditorView.updateListener and update.docChanged API]

### Pattern 6: Native HTML5 Tab Drag-and-Drop
**What:** Use native `dragstart`/`dragover`/`drop` events for tab reordering.
**When to use:** D-05 tab reordering.
**Example:**
```typescript
// Standard HTML5 DnD pattern for horizontal tab reorder
function TabElement({ tab, index, onReorder }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        onReorder(fromIndex, index);
      }}
    >
      {tab.label}
    </div>
  );
}
```
[ASSUMED -- standard HTML5 DnD API; no library needed for simple reordering]

### Anti-Patterns to Avoid
- **Creating EditorView on every render:** CM6 views are imperative DOM objects. Create once in `useEffect`, store in ref, destroy on cleanup. Never re-create on re-render.
- **Comparing document strings on every keystroke for dirty tracking:** While `doc.toString()` is the simplest approach, for very large files consider debouncing the comparison or using a generation counter. For typical code files (<50KB), string comparison is fine.
- **Using `@codemirror/language-data` for auto-loading:** This pulls in all 23 language packages (~71KB). Since D-08 specifies exactly which languages to support, import them individually.
- **Re-implementing bracket matching, code folding, or search:** These are all included in `basicSetup` from the `codemirror` meta-package. Do not hand-roll.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code editor | Custom textarea with syntax highlighting | CodeMirror 6 (`codemirror` package) | CM6 handles selection, undo, IME, bidi, accessibility, and 100+ edge cases |
| Syntax highlighting | Regex-based tokenizer (like current `highlightCode()` in main-panel.tsx) | CM6 language packages with Lezer parser | Current regex highlighter is fragile; CM6 uses proper incremental parsing |
| Bracket matching | Custom bracket scanner | `basicSetup` includes `bracketMatching()` | Handles nested brackets, string exclusion, multi-cursor |
| Code folding | Custom fold detection | `basicSetup` includes `foldGutter()` + `codeFolding()` | Language-aware folding with gutter indicators |
| Search/replace | Custom Cmd+F overlay | `basicSetup` includes `searchKeymap` from `@codemirror/search` | Handles regex, case sensitivity, replace all, highlight matches |
| Minimap | Custom canvas rendering | `@replit/codemirror-minimap` | Proper scaling, viewport overlay, synced scrolling |
| Tab drag-and-drop | Custom mouse event tracking | Native HTML5 DnD API (`draggable`, `ondragstart`, `ondrop`) | Browser handles ghost image, cursor changes, events |

**Key insight:** The existing `highlightCode()` function in main-panel.tsx (lines 85-182) with its regex-based tokenizer is exactly the kind of hand-rolled syntax highlighting that CM6 replaces entirely. The entire file viewer overlay (signals, rendering, escape handler) gets removed per D-16.

## Common Pitfalls

### Pitfall 1: CM6 EditorView Lifecycle in Preact
**What goes wrong:** EditorView is created but never destroyed, or is recreated on every render causing memory leaks and duplicate editors.
**Why it happens:** Preact's declarative model clashes with CM6's imperative DOM approach.
**How to avoid:** Create EditorView in `useEffect` with a cleanup function that calls `view.destroy()`. Store the view in a `useRef`. Key the effect on `filePath` so it recreates only when the file changes.
**Warning signs:** Multiple editor instances in the same container, scroll position resets, increasing memory usage.

### Pitfall 2: Cmd+S Intercepted by Browser/Tauri
**What goes wrong:** Pressing Cmd+S triggers the browser save-page dialog or Tauri's default handler instead of saving the file.
**Why it happens:** Tauri's WKWebView or the browser intercepts the keyboard event before CM6's keymap.
**How to avoid:** Use `e.preventDefault()` in a document-level keydown handler with `capture: true`, AND also register the `Mod-s` keybinding in CM6's keymap. The existing keyboard handler pattern in `main.tsx` (line ~175) already uses capture phase -- extend it.
**Warning signs:** Browser "Save Page" dialog appears, file content not written.

### Pitfall 3: Tab State Persistence Across Project Switches
**What goes wrong:** Editor tabs lose their file paths or content when switching projects.
**Why it happens:** The existing `saveProjectTabs()`/`restoreProjectTabs()` pattern in terminal-tabs.tsx only persists terminal session names, not editor file paths.
**How to avoid:** Extend the tab persistence format to include `{ type, filePath, scrollPosition }` for editor tabs. On restore, re-read file content from disk (it may have changed).
**Warning signs:** Blank editor tabs after project switch, wrong file content displayed.

### Pitfall 4: Unsaved Dot Indicator Desyncs
**What goes wrong:** The unsaved dot shows when the file is actually saved, or disappears when the file is dirty.
**Why it happens:** The `savedContent` reference becomes stale after external file changes, or the dirty check fires before the save completes.
**How to avoid:** Update `savedContent` immediately after `writeFile()` resolves, using the exact string that was written (from `view.state.doc.toString()`). For external changes, consider watching via `notify` events and offering a reload prompt.
**Warning signs:** Dot persists after Cmd+S, dot missing when file was externally modified.

### Pitfall 5: File Viewer Removal Breaks Existing Event Flow
**What goes wrong:** After removing the file viewer overlay, clicking files in the tree does nothing because the `show-file-viewer` event chain is broken.
**Why it happens:** The current flow is: file-tree dispatches `file-opened` -> main.tsx reads content -> dispatches `show-file-viewer` -> main-panel.tsx renders overlay. Removing the overlay without rewiring the event chain leaves a dead path.
**How to avoid:** Replace the `file-opened` handler in main.tsx to create/focus an editor tab instead of dispatching `show-file-viewer`. The file tree itself does not need to change -- it still dispatches `file-opened` with `{ path, name }`.
**Warning signs:** File clicks do nothing, console errors about missing event handlers.

### Pitfall 6: CM6 Theme Not Applied or Partially Applied
**What goes wrong:** Editor uses default light theme or syntax colors don't match the Solarized Dark palette.
**Why it happens:** `EditorView.theme()` sets structural styles but not syntax colors. `HighlightStyle.define()` sets syntax colors but must be wrapped in `syntaxHighlighting()` to be used as an extension.
**How to avoid:** Always use both: `efxmuxTheme` (structural) AND `syntaxHighlighting(efxmuxHighlightStyle)` (syntax) as separate extensions in the editor state.
**Warning signs:** White background with colored syntax, or dark background with no syntax colors.

## Code Examples

### Language Detection Map
```typescript
// editor/languages.ts
// Source: CodeMirror 6 lang packages (npm registry verified) + legacy-modes
import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { shell } from '@codemirror/legacy-modes/mode/shell';

const languageMap: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  rs: () => rust(),
  css: () => css(),
  html: () => html(),
  htm: () => html(),
  json: () => json(),
  md: () => markdown(),
  markdown: () => markdown(),
  mdx: () => markdown(),
  yaml: () => yaml(),
  yml: () => yaml(),
  toml: () => StreamLanguage.define(toml),
  sh: () => StreamLanguage.define(shell),
  bash: () => StreamLanguage.define(shell),
  zsh: () => StreamLanguage.define(shell),
};

export function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  const factory = languageMap[ext];
  return factory ? factory() : null;
}
```
[VERIFIED: npm registry for all package names; VERIFIED: GitHub legacy-modes for toml/shell]

### Minimap Extension Setup
```typescript
// Source: https://github.com/replit/codemirror-minimap (README)
import { showMinimap } from '@replit/codemirror-minimap';

const minimapExtension = showMinimap.compute(['doc'], () => ({
  create: () => {
    const dom = document.createElement('div');
    return { dom };
  },
  displayText: 'blocks',
  showOverlay: 'always',
}));
```
[CITED: github.com/replit/codemirror-minimap -- README setup example]

### Confirmation Modal Component
```typescript
// Following project-modal.tsx pattern (signal-based visibility)
import { signal } from '@preact/signals';
import { colors, fonts, radii, spacing } from '../tokens';

const modalState = signal<{
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}>({ visible: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });

export function showConfirmModal(opts: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}): void {
  modalState.value = { visible: true, ...opts };
}

export function ConfirmModal() {
  const { visible, title, message, onConfirm, onCancel } = modalState.value;
  if (!visible) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
    >
      <div style={{
        backgroundColor: colors.bgElevated,
        border: `1px solid ${colors.bgBorder}`,
        borderRadius: radii.xl,
        padding: spacing['5xl'],
        width: 340,
      }}>
        <h3 style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.xl }}>
          {title}
        </h3>
        <p style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginBottom: spacing['4xl'] }}>
          {message}
        </p>
        <div class="flex gap-2 justify-end">
          <button onClick={() => { modalState.value = { ...modalState.value, visible: false }; onCancel(); }}
            style={{ /* secondary button styles */ }}>
            Cancel
          </button>
          <button onClick={() => { modalState.value = { ...modalState.value, visible: false }; onConfirm(); }}
            style={{ backgroundColor: colors.diffRed, /* destructive button */ }}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
```
[ASSUMED -- pattern follows existing project-modal.tsx and crash-overlay.tsx conventions]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CM5 modes | CM6 with Lezer parser | 2021 (CM6 stable) | Incremental parsing, modular extensions, TypeScript-native |
| `HighlightStyle.get()` | `syntaxHighlighting(HighlightStyle.define([...]))` | CM6 v0.20.0 (2022) | HighlightStyle must be wrapped in syntaxHighlighting() to be an extension |
| `@codemirror/stream-parser` | `StreamLanguage` in `@codemirror/language` | CM6 v0.20.0 (2022) | Legacy mode adapter moved into language package |
| Regex-based syntax highlighting (current main-panel.tsx) | CodeMirror 6 with proper parsers | This phase | Replaces fragile regex tokenizer with tree-sitter-grade parsing |

**Deprecated/outdated:**
- `@codemirror/stream-parser` -- merged into `@codemirror/language`, no separate package needed [VERIFIED: codemirror.net/docs/changelog]
- `HighlightStyle.get()` -- renamed to `highlightingFor()` in v0.20.0; use `syntaxHighlighting()` wrapper [VERIFIED: codemirror.net/docs/changelog]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Native HTML5 DnD is sufficient for tab reordering (no library needed) | Architecture Patterns: Pattern 6 | LOW -- worst case, add a lightweight DnD library in a follow-up |
| A2 | Discriminated union pattern for unified tab types is the right architecture | Architecture Patterns: Pattern 4 | LOW -- could also use a class hierarchy, but union is more idiomatic TypeScript |
| A3 | String comparison for dirty tracking is performant enough for typical code files | Architecture Patterns: Pattern 5 | LOW -- CM6 doc.toString() is fast for files under 100KB |
| A4 | Confirmation modal design follows project-modal.tsx pattern | Code Examples: Confirmation Modal | LOW -- well-established pattern in codebase |
| A5 | Syntax highlighting colors (purple keywords, green strings, etc.) match Solarized Dark well | Pattern 2: Theme | MEDIUM -- exact colors may need tuning by the user; the pattern is correct |

## Open Questions (RESOLVED)

1. **Tab overflow behavior with many open tabs** (RESOLVED)
   - What we know: Claude's discretion per CONTEXT.md
   - What's unclear: Whether to use horizontal scroll, compress tab widths, or show a dropdown for overflow tabs
   - RESOLVED: Use horizontal scroll with a max-width per tab (truncate filename with ellipsis). Simplest approach, matches VS Code behavior. Implemented in Plan 02 unified-tab-bar.tsx with `overflow-x: auto`, `maxWidth: 200`, `textOverflow: 'ellipsis'`, and `onWheel` horizontal scroll handler.

2. **External file modification detection** (RESOLVED)
   - What we know: The `notify` crate watches for file changes (file_watcher.rs exists)
   - What's unclear: Whether to show a "file changed on disk" prompt for open editor tabs
   - RESOLVED: Deferred to a follow-up phase. For Phase 17, rely on the user's awareness. The dirty dot correctly shows buffer differs from saved content at save time. No external modification detection in scope.

3. **CM6 performance in WKWebView** (RESOLVED)
   - What we know: xterm.js WebGL works in WKWebView. CM6 uses standard DOM (not WebGL).
   - What's unclear: Whether CM6 has any Safari/WebKit-specific issues
   - RESOLVED: LOW risk accepted. CM6 is widely used in Safari-based editors and uses standard DOM APIs. Monitor during implementation via the human-verify checkpoint in Plan 03 Task 3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Package installation | (check at execution) | -- | npm (but project uses pnpm per memory) |
| Tauri CLI | Build system | Existing | ^2 | -- |
| Vite | Dev server | Existing | ^8.0.7 | -- |
| Preact | UI framework | Existing | ^10.29.1 | -- |

No new external tools or system-level dependencies required. All new packages are npm packages installable via pnpm.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 with jsdom |
| Config file | `/Users/lmarques/Dev/efx-mux/vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Editor tab renders CM6 with syntax highlighting | component | `pnpm vitest run src/components/editor-tab.test.tsx -t "renders editor"` | Wave 0 |
| EDIT-02 | Unsaved dot appears when buffer differs from disk | unit | `pnpm vitest run src/components/unified-tab-bar.test.tsx -t "dirty indicator"` | Wave 0 |
| EDIT-03 | Cmd+S saves file via writeFile | unit | `pnpm vitest run src/components/editor-tab.test.tsx -t "save"` | Wave 0 |
| EDIT-04 | Confirmation modal on dirty tab close | component | `pnpm vitest run src/components/confirm-modal.test.tsx` | Wave 0 |
| EDIT-05 | Tab drag reorder updates order | unit | `pnpm vitest run src/components/unified-tab-bar.test.tsx -t "reorder"` | Wave 0 |
| MAIN-01 | Dropdown creates new tab types | component | `pnpm vitest run src/components/unified-tab-bar.test.tsx -t "dropdown"` | Wave 0 |
| MAIN-02 | Git changes accordion renders diffs | component | `pnpm vitest run src/components/git-changes-tab.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test:coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/editor-tab.test.tsx` -- covers EDIT-01, EDIT-03
- [ ] `src/components/unified-tab-bar.test.tsx` -- covers EDIT-02, EDIT-05, MAIN-01
- [ ] `src/components/confirm-modal.test.tsx` -- covers EDIT-04
- [ ] `src/components/git-changes-tab.test.tsx` -- covers MAIN-02
- [ ] `src/editor/languages.test.ts` -- covers language detection map
- [ ] CM6 mocking strategy: CM6's EditorView requires DOM -- jsdom should work but may need EditorView mock for unit tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | yes | File paths validated in Rust backend (file_ops.rs already has traversal prevention); CM6 handles XSS by using DOM APIs, not innerHTML |
| V6 Cryptography | no | -- |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via editor file save | Tampering | Rust `write_file_content_impl` already validates against `../` traversal [VERIFIED: file_ops.rs line 270+] |
| XSS via file content rendering | Tampering | CM6 uses DOM text nodes, not innerHTML. The old `highlightCode()` with `dangerouslySetInnerHTML` is being removed. |
| Unsaved data loss | Denial of service | Confirmation modal on tab close (EDIT-04) prevents accidental data loss |

## Sources

### Primary (HIGH confidence)
- [Context7: /websites/codemirror_net] -- EditorView setup, theme creation, updateListener, extensions, HighlightStyle
- [npm registry] -- All package versions verified via `npm view`
- [GitHub: codemirror/legacy-modes/tree/main/mode] -- Confirmed toml.js and shell.js exist
- [Codebase: src/components/terminal-tabs.tsx] -- Existing tab architecture and patterns
- [Codebase: src/components/main-panel.tsx] -- File viewer overlay to be removed
- [Codebase: src/services/file-service.ts] -- writeFile() IPC wrapper
- [Codebase: src/components/diff-viewer.tsx] -- renderDiffHtml() for reuse
- [Codebase: src/components/dropdown-menu.tsx] -- Dropdown component for [+] menu

### Secondary (MEDIUM confidence)
- [GitHub: replit/codemirror-minimap README] -- Minimap extension setup pattern
- [codemirror.net/docs/changelog] -- HighlightStyle migration, StreamLanguage location

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm registry with current versions
- Architecture: HIGH -- patterns derived from official CM6 docs and existing codebase conventions
- Pitfalls: HIGH -- based on CM6's documented lifecycle requirements and codebase event flow analysis

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable ecosystem, CM6 6.x is mature)
