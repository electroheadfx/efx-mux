// git-changes-tab.tsx -- Git changes accordion tab for unified tab system
// Built per D-12, D-13, D-14, MAIN-02, UI-SPEC GitChangesTab component

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ChevronDown, ChevronRight } from 'lucide-preact';
import { colors, fonts, spacing, radii } from '../tokens';
import { projects, activeProjectName } from '../state-manager';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitFile {
  name: string;
  path: string;
  status: string;
  staged: boolean;
  additions: number;
  deletions: number;
}

// ── Module-level signals ──────────────────────────────────────────────────────

const changedFiles = signal<GitFile[]>([]);
const expandedFiles = signal<Set<string>>(new Set());
const fileDiffs = signal<Record<string, string>>({});
const isLoading = signal(false);

// ── Diff Rendering ────────────────────────────────────────────────────────────

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
 * Render diff lines into HTML (without file header).
 * Adapted from diff-viewer.tsx renderDiffHtml body portion.
 */
function renderDiffLines(diff: string): string {
  if (!diff || !diff.trim()) {
    return `<div style="color: ${colors.textMuted}; padding: 16px;">No changes detected</div>`;
  }

  const lines = diff.split('\n');
  let oldLineNo = 0;
  let newLineNo = 0;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (line === '' && bodyLines.length > 0) continue;

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNo = parseInt(match[1], 10);
        newLineNo = parseInt(match[2], 10);
      }
      const escaped = escapeHtml(line);
      bodyLines.push(
        `<div style="background-color: ${colors.diffHunkBg}; padding: 1px 7px 4px;">
          <span style="font-family: ${fonts.mono}; font-size: 12px; color: ${colors.accent};">${escaped}</span>
        </div>`
      );
    } else if (line.startsWith('+')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="background-color: ${colors.diffGreenBg}; border-left: 3px solid ${colors.statusGreen}; padding: 4px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.diffGreenLineno}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${newLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.statusGreen}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      newLineNo++;
    } else if (line.startsWith('-')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="background-color: ${colors.diffRedBg}; border-left: 3px solid ${colors.diffRed}; padding: 4px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.diffRedLineno}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${oldLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.diffRed}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      oldLineNo++;
    } else if (line.startsWith(' ')) {
      const content = line.substring(1);
      const escaped = escapeHtml(content);
      bodyLines.push(
        `<div style="padding: 4px; display: flex; gap: 12px;">
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.textDim}; width: 32px; text-align: right; shrink: 0; line-height: 24px;">${newLineNo}</span>
          <span style="font-family: ${fonts.mono}; font-size: 13px; color: ${colors.textMuted}; line-height: 24px;">${escaped || '&nbsp;'}</span>
        </div>`
      );
      oldLineNo++;
      newLineNo++;
    }
  }

  return `<div style="padding: 8px 0; font-family: ${fonts.mono}; font-size: 14px;">${bodyLines.join('')}</div>`;
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function statusBadge(status: string): preact.JSX.Element {
  let bg: string;
  let color: string;

  switch (status) {
    case 'M':
      bg = colors.statusYellowBg;
      color = colors.statusYellow;
      break;
    case 'A':
      bg = colors.statusGreenBg;
      color = colors.statusGreen;
      break;
    case 'D':
      bg = colors.diffRedBg;
      color = colors.diffRed;
      break;
    default:
      bg = colors.statusMutedBg;
      color = colors.textMuted;
  }

  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 500,
        color,
        backgroundColor: bg,
        padding: `${spacing.xs}px 4px`,
        borderRadius: radii.sm,
        flexShrink: 0,
      }}
    >
      {`[${status}]`}
    </span>
  );
}

// ── Data Loading ──────────────────────────────────────────────────────────────

async function loadGitStatus(): Promise<void> {
  const project = projects.value.find(p => p.name === activeProjectName.value);
  if (!project?.path) return;

  isLoading.value = true;
  try {
    // get_git_files returns GitFileEntry[] (array of {name, path, status})
    const files = await invoke<Array<{ name: string; path: string; status: string }>>('get_git_files', { path: project.path });
    changedFiles.value = files.map(f => ({
      name: f.name,
      path: f.path,
      status: f.status,
      staged: f.status === 'S',
      additions: 0,
      deletions: 0,
    }));
  } catch (err) {
    console.error('[efxmux] Failed to load git status:', err);
  } finally {
    isLoading.value = false;
  }
}

// ── Expand/Collapse ───────────────────────────────────────────────────────────

async function toggleExpand(filePath: string): Promise<void> {
  const current = new Set(expandedFiles.value);
  if (current.has(filePath)) {
    current.delete(filePath);
    expandedFiles.value = current;
    return;
  }
  current.add(filePath);
  expandedFiles.value = current;

  // Lazy-load diff if not cached
  if (!fileDiffs.value[filePath]) {
    try {
      const diff = await invoke<string>('get_file_diff', { path: filePath });
      fileDiffs.value = { ...fileDiffs.value, [filePath]: diff };
    } catch (err) {
      fileDiffs.value = { ...fileDiffs.value, [filePath]: 'Error loading diff' };
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GitChangesTab() {
  useEffect(() => {
    loadGitStatus();

    // Auto-refresh on git-status-changed (per D-14)
    const unlistenPromise = listen('git-status-changed', () => {
      loadGitStatus();
      // Clear diff cache so re-expand fetches fresh data
      fileDiffs.value = {};
    });

    return () => {
      unlistenPromise.then(fn => fn());
    };
  }, []);

  // Empty state
  if (changedFiles.value.length === 0 && !isLoading.value) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: spacing['3xl'],
        }}
      >
        <span style={{ fontFamily: fonts.sans, fontSize: 14, fontWeight: 500, color: colors.textMuted }}>
          No changes
        </span>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textDim }}>
          Working tree is clean. Edit files to see changes here.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: colors.bgBase,
      }}
    >
      {isLoading.value && (
        <div style={{ padding: spacing['3xl'], color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13 }}>
          Loading...
        </div>
      )}

      {changedFiles.value.map(file => {
        const isExpanded = expandedFiles.value.has(file.path);
        return (
          <div key={file.path}>
            {/* Accordion Header */}
            <div
              onClick={() => toggleExpand(file.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: `${spacing.lg}px ${spacing['3xl']}px`,
                backgroundColor: colors.bgBase,
                borderBottom: `1px solid ${colors.bgBorder}`,
                cursor: 'pointer',
                gap: spacing.md,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.bgElevated;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.bgBase;
              }}
            >
              {/* Chevron */}
              {isExpanded ? (
                <ChevronDown size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
              ) : (
                <ChevronRight size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
              )}

              {/* Filename */}
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 13,
                  fontWeight: 500,
                  color: colors.textPrimary,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={file.path}
              >
                {file.name}
              </span>

              {/* Status badge */}
              {statusBadge(file.status)}

              {/* Diff stats */}
              <span style={{ fontFamily: fonts.mono, fontSize: 11, display: 'flex', gap: spacing.md, flexShrink: 0 }}>
                {file.additions > 0 && (
                  <span style={{ color: colors.statusGreen }}>+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span style={{ color: colors.diffRed }}>-{file.deletions}</span>
                )}
              </span>
            </div>

            {/* Accordion Content */}
            {isExpanded && (
              <div
                dangerouslySetInnerHTML={{ __html: renderDiffLines(fileDiffs.value[file.path] || 'Loading diff...') }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
