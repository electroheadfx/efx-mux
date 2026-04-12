// src/server/server-bridge.test.ts
// Unit tests for server-bridge invoke calls and event listeners (Phase 12)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';

// Shared refs for event listener mock — declared at module scope so vi.mock (which is
// hoisted and runs before any test executes) can capture them in its closure.
let listenHandler: any;
const unlistenFn = vi.fn();

// Reset handler ref and clear mock state before each test
beforeEach(() => {
  vi.restoreAllMocks();
  listenHandler = undefined;
  unlistenFn.mockClear();
});

// vi.mock is hoisted to module top — this factory runs before any test body executes,
// so it captures the module-scoped listenHandler and unlistenFn via closure.
vi.mock('@tauri-apps/api/event', async () => {
  const actual = await vi.importActual('@tauri-apps/api/event');
  return {
    ...actual,
    listen: vi.fn().mockImplementation((event: string, handler: any) => {
      listenHandler = handler;
      return Promise.resolve(unlistenFn);
    }),
  };
});

describe('server-bridge', () => {
  // Test invoke calls with mocked IPC
  describe('invoke calls', () => {
    it('startServer calls invoke with correct args', async () => {
      const { startServer } = await import('./server-bridge');
      let capturedArgs: any;
      mockIPC((cmd, args) => {
        capturedArgs = args;
      });
      await startServer('npm run dev', '/tmp/project', 'my-project');
      expect(capturedArgs.cmd).toBe('npm run dev');
      expect(capturedArgs.cwd).toBe('/tmp/project');
      expect(capturedArgs.projectId).toBe('my-project');
    });

    it('stopServer calls invoke with projectId', async () => {
      const { stopServer } = await import('./server-bridge');
      let capturedCmd = '';
      mockIPC((cmd, args) => { capturedCmd = cmd; });
      await stopServer('my-project');
      expect(capturedCmd).toBe('stop_server');
    });

    it('restartServer calls invoke with correct args', async () => {
      const { restartServer } = await import('./server-bridge');
      let capturedArgs: any;
      mockIPC((cmd, args) => { capturedArgs = args; });
      await restartServer('npm run dev', '/tmp/project', 'my-project');
      expect(capturedArgs.cmd).toBe('npm run dev');
      expect(capturedArgs.projectId).toBe('my-project');
    });

    it('detectAgent returns agent name string from invoke', async () => {
      const { detectAgent } = await import('./server-bridge');
      mockIPC((cmd, args) => 'claude-code');
      const result = await detectAgent('claude');
      expect(result).toBe('claude-code');
    });

    it('detectAgent throws when agent not found', async () => {
      const { detectAgent } = await import('./server-bridge');
      mockIPC((cmd, args) => { throw new Error('Agent not found'); });
      await expect(detectAgent('nonexistent')).rejects.toThrow('Agent not found');
    });
  });

  // Test event listeners using the module-level mock above
  describe('event listeners', () => {
    it('listenServerOutput registers listener and returns unlisten', async () => {
      const { listenServerOutput } = await import('./server-bridge');
      const cb = vi.fn();
      const unlisten = await listenServerOutput(cb);

      const { listen } = await import('@tauri-apps/api/event');
      expect(listen).toHaveBeenCalledWith('server-output', expect.any(Function));
      expect(typeof unlisten).toBe('function');
    });

    it('listenServerStopped registers listener and returns unlisten', async () => {
      const { listenServerStopped } = await import('./server-bridge');
      const cb = vi.fn();
      const unlisten = await listenServerStopped(cb);

      const { listen } = await import('@tauri-apps/api/event');
      expect(listen).toHaveBeenCalledWith('server-stopped', expect.any(Function));
      expect(typeof unlisten).toBe('function');
    });

    it('listenServerOutput maps event payload to callback args', async () => {
      const { listenServerOutput } = await import('./server-bridge');
      const cb = vi.fn();
      await listenServerOutput(cb);

      // Simulate event via captured handler
      listenHandler({ payload: { project: 'test-proj', text: 'hello' } });
      expect(cb).toHaveBeenCalledWith('test-proj', 'hello');
    });

    it('listenServerStopped maps event payload to callback args', async () => {
      const { listenServerStopped } = await import('./server-bridge');
      const cb = vi.fn();
      await listenServerStopped(cb);

      // Simulate event via captured handler
      listenHandler({ payload: { project: 'test-proj', code: 0 } });
      expect(cb).toHaveBeenCalledWith('test-proj', 0);
    });
  });
});