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
        `<div class="bg-accent/[0.03] px-4 py-2 text-xs font-mono text-accent">${escaped}</div>`
      );
    } else if (line.startsWith('+')) {
      addCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div class="bg-[#3FB95015] border-l-[3px] border-l-success px-4 py-[2px] gap-3 flex"><span class="text-xs font-mono text-success/50 w-8 text-right shrink-0 leading-6">${newLineNo}</span><span class="text-xs font-mono text-success leading-6">${escaped || '&nbsp;'}</span></div>`
      );
      newLineNo++;
    } else if (line.startsWith('-')) {
      delCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div class="bg-[#F8514915] border-l-[3px] border-l-danger px-4 py-[2px] gap-3 flex"><span class="text-xs font-mono text-danger/50 w-8 text-right shrink-0 leading-6">${oldLineNo}</span><span class="text-xs font-mono text-danger leading-6">${escaped || '&nbsp;'}</span></div>`
      );
      oldLineNo++;
    } else if (line.startsWith(' ')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div class="px-4 py-[2px] gap-3 flex"><span class="text-xs font-mono text-[#484F58] w-8 text-right shrink-0 leading-6">${newLineNo}</span><span class="text-xs font-mono text-text leading-6">${escaped || '&nbsp;'}</span></div>`
      );
      oldLineNo++;
      newLineNo++;
    }
    // Skip any other lines (diff --git, index, ---, +++ headers are not sent by backend)
  }

  // File header bar (per D-06: no rounded corners, bg-bg, M badge warning color)
  const fileName = filePath ? basename(filePath) : 'unknown';
  const header = `<div class="bg-bg px-4 py-2.5 gap-2 border-b border-border flex items-center">
    <span class="w-4 h-4 rounded-[3px] bg-warning/[0.125] flex items-center justify-center">
      <span class="text-[9px] font-mono font-semibold text-warning">M</span>
    </span>
    <span class="text-xs font-mono font-medium text-text-bright flex-1">${escapeHtml(fileName)}</span>
    <span class="text-[11px] font-mono font-semibold text-success">+${addCount}</span>
    <span class="gap-2"></span>
    <span class="text-[11px] font-mono font-semibold text-danger">-${delCount}</span>
  </div>`;

  // Diff body container (per D-06: bg-bg-terminal, no border, no rounded corners)
  const body = `<div class="bg-bg-terminal py-2 font-mono text-[13px]">${bodyLines.join('')}</div>`;

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
