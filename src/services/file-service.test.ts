// file-service.test.ts -- Unit tests for file-service IPC wrappers (Phase 15 + 18)
import { describe, it, expect } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import {
  writeFile,
  deleteFile,
  renameFile,
  createFile,
  createFolder,
  copyPath,
  launchExternalEditor,
  openDefault,
  revealInFinder,
  detectEditors,
  FileError,
} from './file-service';

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

  // ========== Phase 18: File tree enhancements ==========

  describe('createFolder', () => {
    it('calls invoke with path', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'create_folder') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await createFolder('/tmp/new');
      expect(captured).toEqual({ path: '/tmp/new' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('mkdir failed');
      });

      await expect(createFolder('/x')).rejects.toThrow(FileError);
      await expect(createFolder('/x')).rejects.toThrow('CreateFolderError');
    });
  });

  describe('copyPath', () => {
    it('calls invoke with from and to', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'copy_path') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await copyPath('/src', '/dst');
      expect(captured).toEqual({ from: '/src', to: '/dst' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('copy failed');
      });

      await expect(copyPath('/a', '/b')).rejects.toThrow(FileError);
      await expect(copyPath('/a', '/b')).rejects.toThrow('CopyError');
    });
  });

  describe('launchExternalEditor', () => {
    it('calls invoke with app and path', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'launch_external_editor') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await launchExternalEditor('Zed', '/p/f.txt');
      expect(captured).toEqual({ app: 'Zed', path: '/p/f.txt' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('launch failed');
      });

      await expect(launchExternalEditor('Zed', '/x')).rejects.toThrow(FileError);
      await expect(launchExternalEditor('Zed', '/x')).rejects.toThrow('LaunchError');
    });
  });

  describe('openDefault', () => {
    it('calls invoke with path', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'open_default') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await openDefault('/x');
      expect(captured).toEqual({ path: '/x' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('open failed');
      });

      await expect(openDefault('/x')).rejects.toThrow(FileError);
      await expect(openDefault('/x')).rejects.toThrow('OpenDefaultError');
    });
  });

  describe('revealInFinder', () => {
    it('calls invoke with path', async () => {
      let captured: Record<string, unknown> | undefined;
      mockIPC((cmd, args) => {
        if (cmd === 'reveal_in_finder') {
          captured = args as Record<string, unknown>;
          return;
        }
      });

      await revealInFinder('/x');
      expect(captured).toEqual({ path: '/x' });
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('reveal failed');
      });

      await expect(revealInFinder('/x')).rejects.toThrow(FileError);
      await expect(revealInFinder('/x')).rejects.toThrow('RevealError');
    });
  });

  describe('detectEditors', () => {
    it('returns DetectedEditors object', async () => {
      mockIPC((cmd) => {
        if (cmd === 'detect_editors') {
          return { zed: true, code: false, subl: false, cursor: false, idea: false };
        }
      });

      const result = await detectEditors();
      expect(result.zed).toBe(true);
      expect(result.code).toBe(false);
      expect(result.subl).toBe(false);
      expect(result.cursor).toBe(false);
      expect(result.idea).toBe(false);
    });

    it('throws FileError on failure', async () => {
      mockIPC(() => {
        throw new Error('detect failed');
      });

      await expect(detectEditors()).rejects.toThrow(FileError);
      await expect(detectEditors()).rejects.toThrow('DetectError');
    });
  });
});
