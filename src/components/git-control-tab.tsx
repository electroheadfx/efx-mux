// git-control-tab.tsx -- Git staging, commit, and push UI (Zed-style layout)
//
// Renders a Zed-editor-style git panel: header bar with Stage All,
// scrollable file list with click-to-stage rows, bottom-pinned branch bar,
// commit input, Commit Tracked button, and status bar.
// Uses git-service.ts for operations.
// Includes error log panel with clear button for operation feedback.

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ChevronDown, ChevronRight, Loader, X, GitBranch, MoreHorizontal, Maximize2, Pencil, ArrowUp, Undo2 } from 'lucide-preact';
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
import { projects, activeProjectName } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { stageFile, unstageFile, commit, push, getUnpushedCount, GitError } from '../services/git-service';
import { showToast } from './toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitFile {
  name: string;
  path: string;
  status: string;
  staged: boolean;
}

interface GitLogEntry {
  timestamp: string;
  type: 'error' | 'info' | 'success';
  message: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Local signals
// ---------------------------------------------------------------------------

const gitFiles = signal<GitFile[]>([]);
const commitMessage = signal('');
const unpushedCount = signal(0);
const stagedSectionOpen = signal(true);
const changesSectionOpen = signal(true);
const isCommitting = signal(false);
const isPushing = signal(false);
const gitLog = signal<GitLogEntry[]>([]);
const branchName = signal('');
const lastCommitMessage = signal('');

// ---------------------------------------------------------------------------
// Computed values
// ---------------------------------------------------------------------------

const stagedFiles = computed(() => gitFiles.value.filter(f => f.staged));
const changedFiles = computed(() => gitFiles.value.filter(f => !f.staged));
const canCommit = computed(() => stagedFiles.value.length > 0 && commitMessage.value.trim().length > 0);
const hasChangesOrCommits = computed(() => gitFiles.value.length > 0 || unpushedCount.value > 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveProject(): ProjectEntry | undefined {
  return projects.value.find(p => p.name === activeProjectName.value);
}

function addLogEntry(type: GitLogEntry['type'], message: string, detail?: string): void {
  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  gitLog.value = [...gitLog.value, { timestamp, type, message, detail }];
}

function clearLog(): void {
  gitLog.value = [];
}

async function refreshGitFiles(): Promise<void> {
  const project = getActiveProject();
  if (!project) {
    gitFiles.value = [];
    unpushedCount.value = 0;
    branchName.value = '';
    return;
  }

  try {
    // Fetch file-level git data
    const files = await invoke<Array<{ name: string; path: string; status: string }>>('get_git_files', { path: project.path });

    // Map status codes to staged/unstaged
    // Status codes from git2: 'M' = modified, 'A' = added, 'D' = deleted, '?' = untracked
    // 'S' prefix indicates staged (e.g., 'SM' = staged modified)
    gitFiles.value = files.map(f => ({
      name: f.name,
      path: f.path,
      status: f.status.replace('S', ''), // Strip S prefix for display
      staged: f.status.startsWith('S') || f.status === 'A', // A = staged new file
    }));

    // Fetch unpushed count
    unpushedCount.value = await getUnpushedCount(project.path);

    // Fetch branch name
    try {
      const gitData = await invoke<{ branch: string }>('get_git_status', { path: project.path });
      branchName.value = gitData.branch || 'main';
    } catch {
      branchName.value = 'main';
    }
  } catch (err) {
    console.warn('[GitControlTab] Failed to refresh git files:', err);
    gitFiles.value = [];
    unpushedCount.value = 0;
    branchName.value = '';
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleToggleStage(file: GitFile, shouldStage: boolean): Promise<void> {
  const project = getActiveProject();
  if (!project) return;

  // Optimistic update
  const previousFiles = gitFiles.value;
  gitFiles.value = gitFiles.value.map(f =>
    f.path === file.path ? { ...f, staged: shouldStage } : f
  );

  try {
    if (shouldStage) {
      await stageFile(project.path, file.path);
    } else {
      await unstageFile(project.path, file.path);
    }
    // Refresh to get accurate state
    await refreshGitFiles();
  } catch (err) {
    // Revert on error
    gitFiles.value = previousFiles;
    const action = shouldStage ? 'stage' : 'unstage';
    const errMsg = err instanceof GitError ? err.details || err.code : String(err);
    addLogEntry('error', `Failed to ${action} ${file.name}`, errMsg);
    showToast({
      type: 'error',
      message: `Failed to ${action} ${file.name}`,
      hint: 'See error log in GIT tab',
    });
  }
}

async function handleStageAll(): Promise<void> {
  const project = getActiveProject();
  if (!project) return;

  try {
    for (const file of changedFiles.value) {
      await stageFile(project.path, file.path);
    }
    await refreshGitFiles();
  } catch (err) {
    const errMsg = err instanceof GitError ? err.details || err.code : String(err);
    addLogEntry('error', 'Failed to stage all files', errMsg);
    showToast({
      type: 'error',
      message: 'Failed to stage all files',
      hint: 'See error log in GIT tab',
    });
  }
}

async function handleCommit(): Promise<void> {
  const project = getActiveProject();
  if (!project || !canCommit.value) return;

  isCommitting.value = true;
  try {
    const msg = commitMessage.value.trim();
    const oid = await commit(project.path, msg);
    const shortOid = oid.slice(0, 7);
    lastCommitMessage.value = msg;
    commitMessage.value = '';
    addLogEntry('success', `Committed ${shortOid}`);
    showToast({
      type: 'success',
      message: `Committed ${shortOid}`,
    });
    await refreshGitFiles();
  } catch (err) {
    const message = err instanceof GitError ? err.details || err.code : String(err);
    addLogEntry('error', 'Commit failed', message);
    showToast({
      type: 'error',
      message: 'Commit failed',
      hint: message,
    });
  } finally {
    isCommitting.value = false;
  }
}

async function handlePush(): Promise<void> {
  const project = getActiveProject();
  if (!project) return;

  isPushing.value = true;
  try {
    await push(project.path);
    // Get branch name for toast
    const gitData = await invoke<{ branch: string }>('get_git_status', { path: project.path });
    const branch = gitData.branch || 'main';
    addLogEntry('success', `Pushed to origin/${branch}`);
    showToast({
      type: 'success',
      message: `Pushed to origin/${branch}`,
    });
    await refreshGitFiles();
  } catch (err) {
    let errMessage = 'Push failed';
    let errDetail = String(err);

    if (err instanceof GitError) {
      if (err.code === 'AuthFailed') {
        errMessage = 'Authentication failed';
        errDetail = 'Run: ssh-add';
      } else if (err.code === 'PushRejected') {
        errMessage = 'Push rejected';
        errDetail = err.details || 'Pull first';
      } else {
        errDetail = err.details || err.code;
      }
    }

    addLogEntry('error', errMessage, errDetail);
    showToast({
      type: 'error',
      message: errMessage,
      hint: 'See error log in GIT tab',
    });
  } finally {
    isPushing.value = false;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: preact.ComponentChildren;
}) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xl,
          padding: `${spacing.md}px ${spacing.xl}px`,
          cursor: 'pointer',
        }}
      >
        {isOpen ? (
          <ChevronDown size={10} style={{ color: colors.textDim }} />
        ) : (
          <ChevronRight size={10} style={{ color: colors.textDim }} />
        )}
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSizes.xs,
            fontWeight: 600,
            color: colors.textDim,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
          }}
        >
          {title} ({count})
        </span>
      </div>
      <div
        style={{
          maxHeight: isOpen ? '1000px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 150ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function GitFileRow({
  file,
  onToggle,
}: {
  file: GitFile;
  onToggle: () => void;
}) {
  // Badge colors based on status
  const badgeBg =
    file.status === 'M' ? colors.statusYellowBg :
    file.status === 'A' ? colors.statusGreenBg :
    file.status === 'D' ? colors.diffRedBg :
    colors.statusMutedBg;
  const badgeColor =
    file.status === 'M' ? colors.statusYellow :
    file.status === 'A' ? colors.statusGreen :
    file.status === 'D' ? colors.diffRed :
    colors.textMuted;

  // Dot color matches badge color
  const dotColor = badgeColor;

  return (
    <div
      onClick={onToggle}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.bgElevated; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xl,
        padding: `${spacing.sm}px ${spacing.xl}px`,
        cursor: 'pointer',
        backgroundColor: 'transparent',
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Filename */}
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: fontSizes.base,
          color: colors.textPrimary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
        title={file.path}
      >
        {file.name}
      </span>

      {/* Status badge pill */}
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: fontSizes.xs,
          fontWeight: 600,
          color: badgeColor,
          backgroundColor: badgeBg,
          padding: `${spacing.xs}px ${spacing.md}px`,
          borderRadius: radii.sm,
          flexShrink: 0,
        }}
      >
        {file.status}
      </span>
    </div>
  );
}

function GitLogPanel() {
  const entries = gitLog.value;
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.bgBorder}`,
        maxHeight: 140,
        overflowY: 'auto',
      }}
    >
      {/* Header with clear button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.md}px ${spacing.xl}px`,
          position: 'sticky',
          top: 0,
          backgroundColor: colors.bgSurface,
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSizes.sm,
            fontWeight: 600,
            color: colors.textDim,
          }}
        >
          LOG ({entries.length})
        </span>
        <button
          onClick={clearLog}
          title="Clear log"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: radii.sm,
            backgroundColor: 'transparent',
            border: 'none',
            color: colors.textDim,
            cursor: 'pointer',
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Log entries */}
      {entries.map((entry, i) => {
        const entryColor =
          entry.type === 'error' ? colors.diffRed :
          entry.type === 'success' ? colors.statusGreen :
          colors.textMuted;

        return (
          <div
            key={i}
            style={{
              padding: `${spacing.sm}px ${spacing.xl}px`,
              fontFamily: fonts.mono,
              fontSize: fontSizes.sm,
              lineHeight: '1.4',
            }}
          >
            <span style={{ color: colors.textDim }}>{entry.timestamp} </span>
            <span style={{ color: entryColor }}>{entry.message}</span>
            {entry.detail && (
              <div
                style={{
                  color: colors.textDim,
                  paddingLeft: spacing['3xl'],
                  wordBreak: 'break-word',
                }}
              >
                {entry.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GitControlTab() {
  // Initialize on mount
  useEffect(() => {
    refreshGitFiles();

    // Listen for project changes
    function handleProjectChanged() {
      refreshGitFiles();
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Listen for git status changes from backend
    let unlistenGit: (() => void) | undefined;
    listen('git-status-changed', () => {
      refreshGitFiles();
    }).then((unlisten) => {
      unlistenGit = unlisten;
    });

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
      if (unlistenGit) unlistenGit();
    };
  }, []);

  const totalChanges = gitFiles.value.length;
  const changeSummary = totalChanges === 0
    ? 'No Changes'
    : `${totalChanges} Changed File${totalChanges > 1 ? 's' : ''}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* ── 1. HEADER BAR ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.md}px ${spacing.xl}px`,
          borderBottom: `1px solid ${colors.bgBorder}`,
          gap: spacing.xl,
          flexShrink: 0,
        }}
      >
        {/* Left: change summary */}
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSizes.base,
            fontWeight: 600,
            color: colors.textSecondary,
          }}
        >
          {changeSummary}
        </span>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
          {/* More button */}
          <button
            title="More options"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: radii.sm,
              backgroundColor: 'transparent',
              border: 'none',
              color: colors.textDim,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.bgElevated; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
          >
            <MoreHorizontal size={14} />
          </button>

          {/* Stage All button -- only when there are unstaged changes */}
          {changedFiles.value.length > 0 && (
            <button
              onClick={handleStageAll}
              style={{
                height: 22,
                padding: `0 ${spacing.xl}px`,
                backgroundColor: colors.bgElevated,
                border: `1px solid ${colors.bgBorder}`,
                borderRadius: radii.md,
                fontFamily: fonts.sans,
                fontSize: fontSizes.sm,
                color: colors.textSecondary,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Stage All
            </button>
          )}
        </div>
      </div>

      {/* ── 2. FILE LIST (scrollable) ─────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {totalChanges === 0 ? (
          /* Empty state */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontFamily: fonts.sans,
              fontSize: fontSizes.base,
              color: colors.textDim,
            }}
          >
            No changes to commit
          </div>
        ) : (
          <>
            {/* Staged section */}
            {stagedFiles.value.length > 0 && (
              <CollapsibleSection
                title="Staged"
                count={stagedFiles.value.length}
                isOpen={stagedSectionOpen.value}
                onToggle={() => { stagedSectionOpen.value = !stagedSectionOpen.value; }}
              >
                {stagedFiles.value.map(file => (
                  <GitFileRow
                    key={file.path}
                    file={file}
                    onToggle={() => handleToggleStage(file, false)}
                  />
                ))}
              </CollapsibleSection>
            )}

            {/* Changes section */}
            {changedFiles.value.length > 0 && (
              <CollapsibleSection
                title="Changes"
                count={changedFiles.value.length}
                isOpen={changesSectionOpen.value}
                onToggle={() => { changesSectionOpen.value = !changesSectionOpen.value; }}
              >
                {changedFiles.value.map(file => (
                  <GitFileRow
                    key={file.path}
                    file={file}
                    onToggle={() => handleToggleStage(file, true)}
                  />
                ))}
              </CollapsibleSection>
            )}
          </>
        )}
      </div>

      {/* ── Git Log Panel ─────────────────────────────────────────── */}
      <GitLogPanel />

      {/* ── 3. BOTTOM SECTION (pinned) ────────────────────────────── */}

      {/* 3a. Branch bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.md}px ${spacing.xl}px`,
          borderTop: `1px solid ${colors.bgBorder}`,
          flexShrink: 0,
        }}
      >
        {/* Left: branch info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <GitBranch size={12} style={{ color: colors.textDim }} />
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: fontSizes.base,
              fontWeight: 600,
              color: colors.textSecondary,
            }}
          >
            {branchName.value || 'main'}
          </span>
        </div>

        {/* Right: push pill */}
        {unpushedCount.value > 0 && (
          <button
            disabled={isPushing.value}
            onClick={handlePush}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.md,
              backgroundColor: isPushing.value ? colors.bgSurface : colors.accent,
              color: isPushing.value ? colors.textDim : 'white',
              fontFamily: fonts.sans,
              fontSize: fontSizes.sm,
              fontWeight: 600,
              borderRadius: radii.xl,
              height: 22,
              padding: `0 ${spacing.xl}px`,
              border: 'none',
              cursor: isPushing.value ? 'not-allowed' : 'pointer',
            }}
          >
            {isPushing.value ? (
              <Loader size={10} class="animate-spin" />
            ) : (
              <ArrowUp size={10} />
            )}
            Push {unpushedCount.value}
          </button>
        )}
      </div>

      {/* 3b. Commit input */}
      <div
        style={{
          padding: `${spacing.md}px ${spacing.xl}px`,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <textarea
          value={commitMessage.value}
          onInput={(e) => { commitMessage.value = (e.target as HTMLTextAreaElement).value; }}
          placeholder="Enter commit message"
          style={{
            width: '100%',
            height: 56,
            maxHeight: 120,
            resize: 'vertical',
            backgroundColor: colors.bgElevated,
            border: `1px solid ${colors.bgBorder}`,
            borderRadius: radii.md,
            padding: spacing.xl,
            fontFamily: fonts.mono,
            fontSize: fontSizes.base,
            color: colors.textPrimary,
            outline: 'none',
          }}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = colors.accent;
          }}
          onBlur={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = colors.bgBorder;
          }}
        />
        {/* Expand icon (decorative) */}
        <Maximize2
          size={10}
          style={{
            position: 'absolute',
            bottom: spacing.md + spacing.xl,
            right: spacing.md + spacing.xl,
            color: colors.textDim,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* 3c. Bottom toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.sm}px ${spacing.xl}px`,
          borderTop: `1px solid ${colors.bgBorder}`,
          flexShrink: 0,
        }}
      >
        {/* Left: pencil icon */}
        <button
          title="Edit"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            backgroundColor: 'transparent',
            border: 'none',
            color: colors.textDim,
            cursor: 'pointer',
          }}
        >
          <Pencil size={12} />
        </button>

        {/* Right: Commit Tracked button */}
        <button
          disabled={!canCommit.value || isCommitting.value}
          onClick={handleCommit}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.md,
            backgroundColor: canCommit.value && !isCommitting.value ? colors.accent : colors.bgSurface,
            color: canCommit.value && !isCommitting.value ? 'white' : colors.textDim,
            fontFamily: fonts.sans,
            fontSize: fontSizes.sm,
            fontWeight: 600,
            borderRadius: radii.md,
            height: 24,
            padding: `0 ${spacing.xl}px`,
            border: 'none',
            cursor: canCommit.value && !isCommitting.value ? 'pointer' : 'not-allowed',
          }}
        >
          {isCommitting.value ? (
            <Loader size={10} class="animate-spin" />
          ) : (
            <>
              Commit Tracked
              <ChevronDown size={8} />
            </>
          )}
        </button>
      </div>

      {/* 3d. Status bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.sm}px ${spacing.xl}px`,
          borderTop: `1px solid ${colors.bgBorder}`,
          backgroundColor: colors.bgDeep,
          flexShrink: 0,
        }}
      >
        {/* Left: last commit message */}
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSizes.xs,
            color: colors.textDim,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%',
          }}
        >
          {lastCommitMessage.value}
        </span>

        {/* Right: action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
          <button
            title="Undo"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              border: 'none',
              color: colors.textDim,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Undo2 size={10} />
          </button>
          <button
            title="Branch"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              border: 'none',
              color: colors.textDim,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <GitBranch size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
