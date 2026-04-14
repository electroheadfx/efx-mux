// git-service.test.ts -- Unit tests for git-service IPC wrappers (Phase 15)
import { describe, it, expect, beforeEach } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { stageFile, unstageFile, commit, push, GitError } from './git-service';

describe('git-service', () => {
  describe('stageFile', () => {
    it('calls invoke with correct args', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'stage_file') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await stageFile('/repo', 'file.txt');
      expect(captured).toEqual({ repoPath: '/repo', filePath: 'file.txt' });
    });

    it('throws GitError on failure', async () => {
      mockIPC(() => {
        throw new Error('stage failed');
      });

      await expect(stageFile('/repo', 'file.txt')).rejects.toThrow(GitError);
      await expect(stageFile('/repo', 'file.txt')).rejects.toThrow('StageError');
    });
  });

  describe('unstageFile', () => {
    it('calls invoke with correct args', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'unstage_file') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await unstageFile('/repo', 'file.txt');
      expect(captured).toEqual({ repoPath: '/repo', filePath: 'file.txt' });
    });

    it('throws GitError on failure', async () => {
      mockIPC(() => {
        throw new Error('unstage failed');
      });

      await expect(unstageFile('/repo', 'file.txt')).rejects.toThrow(GitError);
      await expect(unstageFile('/repo', 'file.txt')).rejects.toThrow('UnstageError');
    });
  });

  describe('commit', () => {
    it('calls invoke and returns commit ID', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'commit') {
          captured = args as Record<string, unknown>;
          return 'abc123def456';
        }
      });

      const commitId = await commit('/repo', 'Test commit message');
      expect(captured).toEqual({ repoPath: '/repo', message: 'Test commit message' });
      expect(commitId).toBe('abc123def456');
    });

    it('throws GitError on failure', async () => {
      mockIPC(() => {
        throw new Error('commit failed');
      });

      await expect(commit('/repo', 'message')).rejects.toThrow(GitError);
      await expect(commit('/repo', 'message')).rejects.toThrow('CommitError');
    });
  });

  describe('push', () => {
    it('calls invoke with optional remote and branch', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'push') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await push('/repo', 'origin', 'main');
      expect(captured).toEqual({ repoPath: '/repo', remote: 'origin', branch: 'main' });
    });

    it('calls invoke with undefined remote and branch when not provided', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'push') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await push('/repo');
      expect(captured).toEqual({ repoPath: '/repo', remote: undefined, branch: undefined });
    });

    it('throws GitError with AuthFailed code on auth error', async () => {
      mockIPC(() => {
        throw new Error('Authentication failed');
      });

      try {
        await push('/repo');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GitError);
        expect((e as GitError).code).toBe('AuthFailed');
      }
    });

    it('throws GitError with PushRejected code on push rejection', async () => {
      mockIPC(() => {
        throw new Error('Push rejected: non-fast-forward');
      });

      try {
        await push('/repo');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GitError);
        expect((e as GitError).code).toBe('PushRejected');
      }
    });

    it('throws GitError with PushError code on generic error', async () => {
      mockIPC(() => {
        throw new Error('network error');
      });

      try {
        await push('/repo');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GitError);
        expect((e as GitError).code).toBe('PushError');
      }
    });
  });
});
