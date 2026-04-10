// diff-viewer.tsx -- GitHub-style git diff viewer (D-04, D-05, D-11)
// Listens for open-diff CustomEvent from sidebar and renders per-file diffs.
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Restyled to GitHub-style with file headers, line numbers, colored accents (Phase 9)

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
 * Extract the filename from a file path.
 */
function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Render a unified diff string into GitHub-style HTML with file headers,
 * line numbers, colored borders, and hunk separators.
 */
function renderDiffHtml(diff: string, filePath?: string): string {
  if (!diff || !diff.trim()) {
    return '<div class="text-text p-4">No changes detected</div>';
  }

  const lines = diff.split('\n');
  let addCount = 0;
  let delCount = 0;
  let oldLineNo = 0;
  let newLineNo = 0;
  const bodyLines: string[] = [];

  for (const line of lines) {
    // Skip empty trailing line from split
    if (line === '' && bodyLines.length > 0) continue;

    if (line.startsWith('@@')) {
      // Parse hunk header for line numbers: @@ -old,count +new,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNo = parseInt(match[1], 10);
        newLineNo = parseInt(match[2], 10);
      }
      const escaped = escapeHtml(line);
      bodyLines.push(
        `<div class="px-3 py-1.5 bg-accent/5 text-accent text-xs font-mono border-y border-border/50">${escaped}</div>`
      );
    } else if (line.startsWith('+')) {
      addCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div class="flex"><span class="w-12 text-right pr-2 text-[11px] text-text/50 select-none shrink-0 bg-success/5 leading-6">${newLineNo}</span><div class="flex-1 pl-2 border-l-3 border-success bg-success/10 text-success leading-6">${escaped || '&nbsp;'}</div></div>`
      );
      newLineNo++;
    } else if (line.startsWith('-')) {
      delCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div class="flex"><span class="w-12 text-right pr-2 text-[11px] text-text/50 select-none shrink-0 bg-danger/5 leading-6">${oldLineNo}</span><div class="flex-1 pl-2 border-l-3 border-danger bg-danger/10 text-danger leading-6">${escaped || '&nbsp;'}</div></div>`
      );
      oldLineNo++;
    } else if (line.startsWith(' ')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div class="flex"><span class="w-12 text-right pr-2 text-[11px] text-text/50 select-none shrink-0 leading-6">${newLineNo}</span><div class="flex-1 pl-2 text-text leading-6">${escaped || '&nbsp;'}</div></div>`
      );
      oldLineNo++;
      newLineNo++;
    }
    // Skip any other lines (diff --git, index, ---, +++ headers are not sent by backend)
  }

  // File header bar
  const fileName = filePath ? basename(filePath) : 'unknown';
  const header = `<div class="flex items-center gap-2 px-3 py-2 bg-bg-raised border border-border rounded-t-md">
    <span class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent">M</span>
    <span class="text-sm text-text-bright font-mono flex-1">${escapeHtml(fileName)}</span>
    <span class="text-xs font-mono">
      <span class="text-success">+${addCount}</span>
      <span class="text-text mx-1">/</span>
      <span class="text-danger">-${delCount}</span>
    </span>
  </div>`;

  // Diff body container
  const body = `<div class="border border-t-0 border-border rounded-b-md overflow-hidden mb-2 font-mono text-[13px]">${bodyLines.join('')}</div>`;

  return header + body;
}

/**
 * DiffViewer component.
 * Renders git diff output with GitHub-style syntax highlighting.
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
        el.innerHTML = renderDiffHtml(diff, filePath);
      } catch (err) {
        el.innerHTML = `<div class="text-danger p-4">Error loading diff: ${escapeHtml(String(err))}</div>`;
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
