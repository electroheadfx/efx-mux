// server-pane.test.tsx — Render tests for ServerPane component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { mockIPC } from '@tauri-apps/api/mocks';
import { ServerPane, serverPaneState, serverStatus, resetServerPane } from './server-pane';
import { projects, activeProjectName } from '../state-manager';

// Shared refs for event listener mock — module-level so vi.mock captures them
let listenHandler: any;
const unlistenFn = vi.fn();

beforeEach(() => {
  // Reset module signals
  resetServerPane();
  serverPaneState.value = 'strip';
  serverStatus.value = 'stopped';
  projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
  activeProjectName.value = 'testproj';

  // Reset mock state
  vi.restoreAllMocks();
  listenHandler = undefined;
  unlistenFn.mockClear();
});

// Use vi.mock to intercept module-level listen import from server-bridge.ts
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

describe('ServerPane', () => {


  it('renders toolbar with Start button', async () => {
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('Start');
  });

  it('renders toolbar with Stop button', async () => {
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('Stop');
  });

  it('renders toolbar with Restart button', async () => {
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('Restart');
  });

  it('renders toolbar with Open button', async () => {
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('Open');
  });

  it('renders Clear button in toolbar', async () => {
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('Clear');
  });

  it('shows expand/collapse toggle button', async () => {
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    // The toggle button shows '▸' in strip mode and '▾' in expanded
    const toggleButtons = screen.getAllByRole('button');
    expect(toggleButtons.some(b => b.textContent === '▸' || b.textContent === '▾')).toBe(true);
  });

  it('does not render log area in strip state', async () => {
    serverPaneState.value = 'strip';
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).not.toContain('No server command configured');
  });

  it('renders log area in expanded state', async () => {
    serverPaneState.value = 'expanded';
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('No server command configured');
  });

  it('shows "No server command configured" when project has no server_cmd', async () => {
    serverPaneState.value = 'expanded';
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }]; // no server_cmd
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.body.textContent).toContain('No server command configured');
  });

  it('toggles to expanded when clicking toggle button', async () => {
    serverPaneState.value = 'strip';
    render(<ServerPane />);
    await new Promise(r => setTimeout(r, 10));

    // Find and click the toggle button
    const buttons = screen.getAllByRole('button');
    const toggleBtn = buttons.find(b => b.textContent === '▸');
    if (toggleBtn) {
      fireEvent.click(toggleBtn);
      expect(serverPaneState.value).toBe('expanded');
    }
  });
});
