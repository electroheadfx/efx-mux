// diff-viewer.tsx -- GitHub-style git diff viewer (D-04, D-05, D-11)
// Listens for open-diff CustomEvent from sidebar and renders per-file diffs.
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Restyled to GitHub-style with file headers, line numbers, colored accents (Phase 9)
// Rewritten with tokens.ts colors (Phase 10)

import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';

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
    return `<div style="color: ${colors.textMuted}; padding: 16px;">No changes detected</div>`;
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
        `<div style="background-color: ${colors.diffHunkBg}; padding: 8px 16px;">
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.accent};">${escaped}</span>
        </div>`
      );
    } else if (line.startsWith('+')) {
      addCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="background-color: ${colors.diffGreenBg}; border-left: 3px solid ${colors.statusGreen}; padding: 2px 16px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.diffGreenLineno}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${newLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.statusGreen}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      newLineNo++;
    } else if (line.startsWith('-')) {
      delCount++;
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="background-color: ${colors.diffRedBg}; border-left: 3px solid ${colors.diffRed}; padding: 2px 16px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.diffRedLineno}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${oldLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.diffRed}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      oldLineNo++;
    } else if (line.startsWith(' ')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="padding: 2px 16px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.textDim}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${newLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.textMuted}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      oldLineNo++;
      newLineNo++;
    }
    // Skip any other lines (diff --git, index, ---, +++ headers are not sent by backend)
  }

  // File header bar
  const fileName = filePath ? basename(filePath) : 'unknown';
  const header = `<div style="background-color: ${colors.bgBase}; padding: 10px 16px; gap: 8px; border-bottom: 1px solid ${colors.bgBorder}; display: flex; align-items: center;">
    <span style="width: 16px; height: 16px; border-radius: 3px; background-color: ${colors.statusYellowBg}; display: flex; align-items: center; justify-content: center;">
      <span style="font-family: ${fonts.mono}; font-size: 9px; font-weight: 600; color: ${colors.statusYellow};">M</span>
    </span>
    <span style="font-family: ${fonts.mono}; font-size: 12px; font-weight: 500; color: ${colors.textPrimary}; flex: 1;">${escapeHtml(fileName)}</span>
    <span style="font-family: ${fonts.mono}; font-size: 11px; font-weight: 600; color: ${colors.statusGreen};">+${addCount}</span>
    <span style="gap: 8px;"></span>
    <span style="font-family: ${fonts.mono}; font-size: 11px; font-weight: 600; color: ${colors.diffRed};">-${delCount}</span>
  </div>`;

  // Diff body container
  const body = `<div style="padding: 8px 0; font-family: ${fonts.mono}; font-size: 13px;">${bodyLines.join('')}</div>`;

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
      el.innerHTML = `<div style="color: ${colors.textMuted}; padding: 16px;">Loading diff...</div>`;

      try {
        const diff = await invoke<string>('get_file_diff', { path: filePath });
        el.innerHTML = renderDiffHtml(diff, filePath);
      } catch (err) {
        el.innerHTML = `<div style="color: ${colors.diffRed}; padding: 16px;">Error loading diff: ${escapeHtml(String(err))}</div>`;
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
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 16px', fontFamily: fonts.mono, fontSize: 13, lineHeight: 1.5 }}>
      <div ref={contentRef}>
        <div style={{ color: colors.textMuted }}>Click a file in the sidebar to view its diff</div>
      </div>
    </div>
  );
}
