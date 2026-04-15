// git-control-tab.tsx -- Git staging, commit, and push UI (Phase 16)
//
// Renders STAGED/CHANGES sections with file checkboxes, commit textarea,
// and Commit/Push buttons. Uses git-service.ts for operations.
// Includes error log panel with clear button for operation feedback.

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ChevronDown, ChevronRight, Loader, X } from 'lucide-preact';
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
  } catch (err) {
    console.warn('[GitControlTab] Failed to refresh git files:', err);
    gitFiles.value = [];
    unpushedCount.value = 0;
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckboxChange(file: GitFile, shouldStage: boolean): Promise<void> {
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

async function handleCommit(): Promise<void> {
  const project = getActiveProject();
  if (!project || !canCommit.value) return;

  isCommitting.value = true;
  try {
    const oid = await commit(project.path, commitMessage.value.trim());
    const shortOid = oid.slice(0, 7);
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
    const branchName = gitData.branch || 'main';
    addLogEntry('success', `Pushed to origin/${branchName}`);
    showToast({
      type: 'success',
      message: `Pushed to origin/${branchName}`,
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
            fontFamily: fonts.mono,
            fontSize: fontSizes.sm,
            fontWeight: 600,
            color: colors.textDim,
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
  onToggle: (checked: boolean) => void;
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xl,
        padding: `${spacing.md}px ${spacing.xl}px`,
      }}
    >
      <input
        type="checkbox"
        checked={file.staged}
        onChange={(e) => onToggle((e.target as HTMLInputElement).checked)}
        style={{
          accentColor: colors.accent,
          width: 16,
          height: 16,
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: radii.sm,
          backgroundColor: badgeBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSizes.sm,
            fontWeight: 600,
            color: badgeColor,
          }}
        >
          {file.status}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: fontSizes.base,
          color: colors.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={file.path}
      >
        {file.name}
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

  // Empty state: no changes and no unpushed commits
  if (!hasChangesOrCommits.value) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing['4xl'],
          }}
        >
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSizes.lg,
              fontWeight: 600,
              color: colors.textMuted,
              marginBottom: spacing.xl,
            }}
          >
            No changes
          </div>
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSizes.base,
              color: colors.textDim,
            }}
          >
            Working directory is clean.
          </div>
        </div>
        {/* Show log even in clean state so errors remain visible */}
        <GitLogPanel />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Commit textarea -- only show when there are files to stage/commit */}
      {gitFiles.value.length > 0 && (
        <div style={{ padding: `${spacing.xl}px ${spacing['3xl']}px` }}>
          <textarea
            value={commitMessage.value}
            onInput={(e) => { commitMessage.value = (e.target as HTMLTextAreaElement).value; }}
            placeholder="Commit message..."
            style={{
              width: '100%',
              height: 64,
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
        </div>
      )}

      {/* Buttons row -- only show when there are actionable items */}
      {(gitFiles.value.length > 0 || unpushedCount.value > 0) && (
        <div
          style={{
            display: 'flex',
            gap: spacing.xl,
            padding: `0 ${spacing['3xl']}px ${spacing.xl}px`,
          }}
        >
          {/* Commit button (D-11) -- only show when there are files */}
          {gitFiles.value.length > 0 && (
            <button
              disabled={!canCommit.value || isCommitting.value}
              onClick={handleCommit}
              style={{
                flex: 1,
                height: 28,
                borderRadius: radii.md,
                backgroundColor: canCommit.value && !isCommitting.value
                  ? colors.accent
                  : colors.bgSurface,
                border: 'none',
                fontFamily: fonts.sans,
                fontSize: fontSizes.base,
                fontWeight: 600,
                color: canCommit.value && !isCommitting.value ? 'white' : colors.textDim,
                cursor: canCommit.value && !isCommitting.value ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xl,
              }}
            >
              {isCommitting.value && <Loader size={12} class="animate-spin" />}
              Commit ({stagedFiles.value.length} files)
            </button>
          )}

          {/* Push button (D-13) - only visible when unpushed commits exist */}
          {unpushedCount.value > 0 && (
            <button
              disabled={isPushing.value}
              onClick={handlePush}
              style={{
                flex: 1,
                height: 28,
                borderRadius: radii.md,
                backgroundColor: isPushing.value ? colors.bgSurface : colors.accent,
                border: 'none',
                fontFamily: fonts.sans,
                fontSize: fontSizes.base,
                fontWeight: 600,
                color: isPushing.value ? colors.textDim : 'white',
                cursor: isPushing.value ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xl,
              }}
            >
              {isPushing.value ? (
                <Loader size={12} class="animate-spin" />
              ) : (
                `Push (${unpushedCount.value})`
              )}
            </button>
          )}
        </div>
      )}

      {/* File sections */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Staged section (D-05) */}
        {stagedFiles.value.length > 0 && (
          <CollapsibleSection
            title="STAGED"
            count={stagedFiles.value.length}
            isOpen={stagedSectionOpen.value}
            onToggle={() => { stagedSectionOpen.value = !stagedSectionOpen.value; }}
          >
            {stagedFiles.value.map(file => (
              <GitFileRow
                key={file.path}
                file={file}
                onToggle={(checked) => handleCheckboxChange(file, checked)}
              />
            ))}
          </CollapsibleSection>
        )}

        {/* Changes section (D-05) */}
        {changedFiles.value.length > 0 && (
          <CollapsibleSection
            title="CHANGES"
            count={changedFiles.value.length}
            isOpen={changesSectionOpen.value}
            onToggle={() => { changesSectionOpen.value = !changesSectionOpen.value; }}
          >
            {changedFiles.value.map(file => (
              <GitFileRow
                key={file.path}
                file={file}
                onToggle={(checked) => handleCheckboxChange(file, checked)}
              />
            ))}
          </CollapsibleSection>
        )}

        {/* Nothing staged message */}
        {stagedFiles.value.length === 0 && changedFiles.value.length > 0 && (
          <div
            style={{
              padding: `${spacing['3xl']}px ${spacing['4xl']}px`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSizes.base,
                fontWeight: 600,
                color: colors.textMuted,
                marginBottom: spacing.md,
              }}
            >
              Nothing staged
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSizes.sm,
                color: colors.textDim,
              }}
            >
              Check files below to stage them.
            </div>
          </div>
        )}

        {/* Only unpushed commits, no file changes */}
        {gitFiles.value.length === 0 && unpushedCount.value > 0 && (
          <div
            style={{
              padding: `${spacing['3xl']}px ${spacing['4xl']}px`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSizes.base,
                fontWeight: 600,
                color: colors.textMuted,
                marginBottom: spacing.md,
              }}
            >
              {unpushedCount.value} unpushed commit{unpushedCount.value > 1 ? 's' : ''}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSizes.sm,
                color: colors.textDim,
              }}
            >
              Working directory is clean. Click Push to sync.
            </div>
          </div>
        )}
      </div>

      {/* Error/info log panel at bottom */}
      <GitLogPanel />
    </div>
  );
}
