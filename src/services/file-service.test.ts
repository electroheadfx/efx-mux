// file-service.test.ts -- Unit tests for file-service IPC wrappers (Phase 15)
import { describe, it, expect } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { writeFile, deleteFile, renameFile, createFile, FileError } from './file-service';

describe('file-service', () => {
  describe('writeFile', () => {
    it('calls invoke with path and content', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'write_file_content') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await writeFile('/path/file.txt', 'content');
      expect(captured).toEqual({ path: '/path/file.txt', content: 'content' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('write failed');
      });

      await expect(writeFile('/path', 'content')).rejects.toThrow(FileError);
      await expect(writeFile('/path', 'content')).rejects.toThrow('WriteError');
    });
  });

  describe('deleteFile', () => {
    it('calls invoke with path', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'delete_file') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await deleteFile('/path/file.txt');
      expect(captured).toEqual({ path: '/path/file.txt' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('delete failed');
      });

      await expect(deleteFile('/path')).rejects.toThrow(FileError);
      await expect(deleteFile('/path')).rejects.toThrow('DeleteError');
    });
  });

  describe('renameFile', () => {
    it('calls invoke with from and to', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'rename_file') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await renameFile('/old/path.txt', '/new/path.txt');
      expect(captured).toEqual({ from: '/old/path.txt', to: '/new/path.txt' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('rename failed');
      });

      await expect(renameFile('/old', '/new')).rejects.toThrow(FileError);
      await expect(renameFile('/old', '/new')).rejects.toThrow('RenameError');
    });
  });

  describe('createFile', () => {
    it('calls invoke with path', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'create_file') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await createFile('/path/new.txt');
      expect(captured).toEqual({ path: '/path/new.txt' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('create failed');
      });

      await expect(createFile('/path')).rejects.toThrow(FileError);
      await expect(createFile('/path')).rejects.toThrow('CreateError');
    });
  });

  describe('FileError', () => {
    it('has correct name and message', () => {
      const error = new FileError('WriteError', 'permission denied');
      expect(error.name).toBe('FileError');
      expect(error.code).toBe('WriteError');
      expect(error.details).toBe('permission denied');
      expect(error.message).toBe('WriteError: permission denied');
    });

    it('handles missing details', () => {
      const error = new FileError('DeleteError');
      expect(error.message).toBe('DeleteError');
      expect(error.details).toBeUndefined();
    });
  });
});
