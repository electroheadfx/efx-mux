// main-panel.tsx -- Main panel with terminal-area + file viewer overlay + server-pane
// Phase 2: terminal-area is empty -- xterm.js mounts via querySelector (D-08)

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { marked } from 'marked';
import { ServerPane, serverPaneState } from './server-pane';
import { TerminalTabBar, ActiveTabCrashOverlay } from './terminal-tabs';
import { AgentHeader } from './agent-header';
import { colors } from '../tokens';

// Module-level signals for file viewer state
const fileViewerVisible = signal(false);
const fileName = signal('');
const filePath = signal('');
const fileContent = signal('');

function closeFileViewer(): void {
  fileViewerVisible.value = false;
  fileContent.value = '';
}

/**
 * Escape HTML entities for safe rendering in pre block.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Detect if a filename is a markdown file.
 */
function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(name);
}

/**
 * Detect file language from extension for syntax highlighting.
 */
function getLanguage(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    rs: 'rs', css: 'css', json: 'json', toml: 'toml', yaml: 'yaml', yml: 'yaml',
    html: 'html', htm: 'html', xml: 'html', svg: 'html',
    sh: 'sh', bash: 'sh', zsh: 'sh', fish: 'sh',
    py: 'py', rb: 'rb', go: 'go', java: 'java', c: 'c', cpp: 'c', h: 'c',
  };
  return ext ? (map[ext] || null) : null;
}

// Syntax token classes map to CSS classes: .syn-kw, .syn-str, .syn-cm, .syn-num, .syn-fn, .syn-op, .syn-type
// We keep this simple: regex-based line-by-line tokenization with no parser.

const KEYWORDS_JS = /\b(import|export|from|default|const|let|var|function|return|if|else|switch|case|break|for|while|do|new|this|class|extends|implements|interface|type|enum|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|void|delete|null|undefined|true|false|super|static|get|set|as|satisfies)\b/g;
const KEYWORDS_RS = /\b(fn|let|mut|const|pub|use|mod|struct|enum|impl|trait|type|where|match|if|else|for|while|loop|break|continue|return|self|Self|super|crate|true|false|as|in|ref|move|async|await|unsafe|extern|dyn|static|macro_rules)\b/g;
const KEYWORDS_PY = /\b(def|class|import|from|return|if|elif|else|for|while|break|continue|pass|yield|try|except|finally|raise|with|as|lambda|True|False|None|and|or|not|in|is|del|global|nonlocal|async|await)\b/g;
const KEYWORDS_GO = /\b(func|var|const|type|struct|interface|map|chan|go|select|case|default|if|else|for|range|return|break|continue|switch|defer|package|import|true|false|nil|make|len|cap|append|new)\b/g;
const KEYWORDS_SH = /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|export|local|readonly|source|set|unset|shift|true|false)\b/g;
const KEYWORDS_CSS = /\b(import|media|keyframes|font-face|supports|charset)\b/g;
const KEYWORDS_TOML = /\b(true|false)\b/g;

function getKeywordsPattern(lang: string): RegExp | null {
  switch (lang) {
    case 'ts': case 'js': return KEYWORDS_JS;
    case 'rs': return KEYWORDS_RS;
    case 'py': return KEYWORDS_PY;
    case 'go': return KEYWORDS_GO;
    case 'sh': return KEYWORDS_SH;
    case 'css': return KEYWORDS_CSS;
    case 'toml': case 'yaml': return KEYWORDS_TOML;
    case 'java': case 'c': return KEYWORDS_JS; // close enough for basic highlighting
    default: return null;
  }
}

/**
 * Simple syntax highlighter: produces HTML with <span class="syn-*"> tokens.
 * Works line-by-line. Handles strings, comments, numbers, keywords, and types.
 */
function highlightCode(code: string, lang: string): string {
  const escaped = escapeHtml(code);
  const lines = escaped.split('\n');
  let inBlockComment = false;

  const kwPattern = getKeywordsPattern(lang);

  return lines.map(line => {
    // Block comment handling (/* ... */)
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx >= 0) {
        inBlockComment = false;
        const commentPart = line.slice(0, endIdx + 2);
        const rest = line.slice(endIdx + 2);
        return `<span class="syn-cm">${commentPart}</span>${highlightLine(rest, lang, kwPattern)}`;
      }
      return `<span class="syn-cm">${line}</span>`;
    }

    const blockStart = line.indexOf('/*');
    if (blockStart >= 0 && !isInsideString(line, blockStart)) {
      const blockEnd = line.indexOf('*/', blockStart + 2);
      if (blockEnd >= 0) {
        // Single-line block comment
        const before = line.slice(0, blockStart);
        const comment = line.slice(blockStart, blockEnd + 2);
        const after = line.slice(blockEnd + 2);
        return `${highlightLine(before, lang, kwPattern)}<span class="syn-cm">${comment}</span>${highlightLine(after, lang, kwPattern)}`;
      } else {
        inBlockComment = true;
        const before = line.slice(0, blockStart);
        const comment = line.slice(blockStart);
        return `${highlightLine(before, lang, kwPattern)}<span class="syn-cm">${comment}</span>`;
      }
    }

    return highlightLine(line, lang, kwPattern);
  }).join('\n');
}

/** Check if a position is inside a string (approximate). */
function isInsideString(line: string, pos: number): boolean {
  let inSingle = false, inDouble = false, inBacktick = false;
  for (let i = 0; i < pos; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (ch === "'" && !inDouble && !inBacktick && prev !== '\\') inSingle = !inSingle;
    if (ch === '&' && line.slice(i, i + 6) === '&quot;' && !inSingle && !inBacktick) { inDouble = !inDouble; i += 5; continue; }
    if (ch === '`' && !inSingle && !inDouble && prev !== '\\') inBacktick = !inBacktick;
  }
  return inSingle || inDouble || inBacktick;
}

/** Highlight a single line (no block comment state). */
function highlightLine(line: string, lang: string, kwPattern: RegExp | null): string {
  if (!line) return line;

  // Line comments
  const commentMarkers = (lang === 'py' || lang === 'sh' || lang === 'yaml' || lang === 'toml') ? ['#'] : ['//'];
  for (const marker of commentMarkers) {
    const idx = line.indexOf(marker);
    if (idx >= 0 && !isInsideString(line, idx)) {
      const before = line.slice(0, idx);
      const comment = line.slice(idx);
      return `${tokenizeLine(before, lang, kwPattern)}<span class="syn-cm">${comment}</span>`;
    }
  }

  return tokenizeLine(line, lang, kwPattern);
}

/** Tokenize a line segment: strings, numbers, keywords, types. */
function tokenizeLine(segment: string, lang: string, kwPattern: RegExp | null): string {
  if (!segment) return segment;

  // Replace strings first (they shouldn't be keyword-highlighted)
  // Match &quot;...&quot;, '...', `...` (escaped quotes are already HTML entities)
  let result = segment.replace(/&quot;((?:[^&]|&(?!quot;))*)&quot;/g, '<span class="syn-str">&quot;$1&quot;</span>');
  result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '<span class="syn-str">\'$1\'</span>');
  result = result.replace(/`([^`]*)`/g, '<span class="syn-str">`$1`</span>');

  // Numbers (not inside tags already)
  result = result.replace(/(?<![a-zA-Z_"'>])(\b\d+\.?\d*(?:e[+-]?\d+)?\b)/g, '<span class="syn-num">$1</span>');

  // Keywords
  if (kwPattern) {
    result = result.replace(kwPattern, '<span class="syn-kw">$&</span>');
  }

  // Type-like identifiers (PascalCase words not already wrapped)
  result = result.replace(/(?<![<"'a-z])(\b[A-Z][a-zA-Z0-9]*\b)(?![^<]*>)/g, (match, p1) => {
    // Don't re-wrap if already inside a span
    return `<span class="syn-type">${p1}</span>`;
  });

  return result;
}

/**
 * Render file content based on type: markdown, code with highlighting, or plain text.
 */
function renderFileContent(name: string, content: string): { html: string; isMarkdown: boolean } {
  if (isMarkdownFile(name)) {
    const html = marked.parse(content, { async: false }) as string;
    return { html, isMarkdown: true };
  }

  const lang = getLanguage(name);
  if (lang) {
    return { html: highlightCode(content, lang), isMarkdown: false };
  }

  return { html: escapeHtml(content), isMarkdown: false };
}

export function MainPanel() {
  // Register show-file-viewer and Escape key listeners
  useEffect(() => {
    function handleShowFile(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        fileName.value = detail.name || '';
        filePath.value = detail.path || '';
        fileContent.value = detail.content || '';
        fileViewerVisible.value = true;
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && fileViewerVisible.value) {
        e.preventDefault();
        closeFileViewer();
      }
    }

    document.addEventListener('show-file-viewer', handleShowFile);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('show-file-viewer', handleShowFile);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  const rendered = fileViewerVisible.value
    ? renderFileContent(fileName.value, fileContent.value)
    : { html: '', isMarkdown: false };

  return (
    <main class="main-panel relative" aria-label="Main panel">
      <TerminalTabBar />
      <div class="terminal-area flex-1 bg-bg-terminal overflow-hidden relative min-h-[100px]">
        <AgentHeader />
        <div class="terminal-containers absolute inset-0" />
        <ActiveTabCrashOverlay />
      </div>

      {fileViewerVisible.value && (
        <div class="absolute inset-0 flex flex-col" style={{ backgroundColor: colors.bgBase, zIndex: 10 }}>
          <div class="flex items-center justify-between pl-4 pr-8 py-3 shrink-0" style={{ backgroundColor: colors.bgElevated, borderBottom: `1px solid ${colors.bgBorder}` }}>
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-[11px] px-2.5 py-1 rounded font-semibold tracking-wider shrink-0" style={{ backgroundColor: colors.accent, color: colors.bgBase }}>READ-ONLY</span>
              <span class="text-[13px] font-mono overflow-hidden text-ellipsis whitespace-nowrap" style={{ fontFamily: 'GeistMono', color: colors.textSecondary }}>{fileName.value}</span>
            </div>
            <button
              onClick={closeFileViewer}
              class="cursor-pointer px-5 py-2 rounded text-sm font-mono transition-colors duration-150 ml-4 shrink-0"
              style={{ fontFamily: 'GeistMono', backgroundColor: 'transparent', border: `1px solid ${colors.bgBorder}`, color: colors.textMuted }}
              title="Close file viewer (Esc)"
            >Close</button>
          </div>
          {rendered.isMarkdown ? (
            <div
              class="file-viewer-markdown flex-1 m-0 overflow-auto text-[14px] leading-relaxed"
              style={{ fontFamily: 'Geist, system-ui, sans-serif', color: colors.textMuted, padding: '14px' }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : (
            <pre
              class="flex-1 m-0 overflow-auto text-[13px] font-mono leading-relaxed whitespace-pre tab-[4]"
              style={{ fontFamily: 'GeistMono', color: colors.textMuted, padding: '14px' }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          )}
        </div>
      )}

      {serverPaneState.value === 'expanded' && (
        <div
          class="split-handle-h"
          data-handle="main-h"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize server pane"
        />
      )}
      <ServerPane />
    </main>
  );
}
