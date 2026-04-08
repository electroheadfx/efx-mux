// diff-viewer.tsx -- Git diff viewer with CSS syntax highlighting (D-04, D-05)
// Listens for open-diff CustomEvent from sidebar and renders per-file diffs.
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';

/**
 * Escape HTML special characters to prevent XSS in diff output.
 */
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a unified diff string into syntax-highlighted HTML.
 */
function renderDiffHtml(diff: string): string {
  if (!diff || !diff.trim()) {
    return '<div class="text-text p-4">No changes detected</div>';
  }

  const lines = diff.split('\n');
  const highlighted = lines.map(line => {
    const escaped = escapeHtml(line);
    if (line.startsWith('+')) {
      return `<div class="diff-add" style="background: rgba(133, 153, 0, 0.15); color: #859900; padding: 0 4px; margin: 0 -4px;">${escaped}</div>`;
    } else if (line.startsWith('-')) {
      return `<div class="diff-del" style="background: rgba(220, 50, 47, 0.15); color: #dc322f; padding: 0 4px; margin: 0 -4px;">${escaped}</div>`;
    } else if (line.startsWith('@@')) {
      return `<div class="diff-hunk" style="color: var(--color-accent); font-weight: bold; margin-top: 8px;">${escaped}</div>`;
    } else {
      return `<div class="diff-context" style="color: var(--color-text);">${escaped}</div>`;
    }
  }).join('');

  return `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${highlighted}</pre>`;
}

/**
 * DiffViewer component.
 * Renders git diff output with CSS syntax highlighting.
 * Listens for open-diff CustomEvent dispatched by sidebar when a file is clicked.
 */
export function DiffViewer() {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDiff(filePath: string) {
      const el = contentRef.current;
      if (!el) return;
      el.innerHTML = '<div class="text-text p-4">Loading diff...</div>';

      try {
        const diff = await invoke<string>('get_file_diff', { path: filePath });
        el.innerHTML = renderDiffHtml(diff);
      } catch (err) {
        el.innerHTML = `<div style="color: #dc322f; padding: 16px;">Error loading diff: ${escapeHtml(String(err))}</div>`;
      }
    }

    function handleOpenDiff(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.path) {
        loadDiff(detail.path);
      }
    }

    document.addEventListener('open-diff', handleOpenDiff);
    return () => {
      document.removeEventListener('open-diff', handleOpenDiff);
    };
  }, []);

  return (
    <div class="h-full overflow-y-auto px-4 py-2 font-mono text-[13px] leading-relaxed">
      <div ref={contentRef}>
        <div class="text-text">Click a file in the sidebar to view its diff</div>
      </div>
    </div>
  );
}
