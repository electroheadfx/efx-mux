// gsd-pane.test.tsx -- Render tests for GSDPane container (Phase 19, Plan 04)
// De-skipped from Plan 01 scaffold now that the real GSDPane container ships.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { projects, activeProjectName, gsdSubTab } from '../state-manager';

// Mock Tauri APIs before GSDPane is imported -- same pattern as gsd-viewer.test.tsx.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.reject(new Error('missing file'))),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { GSDPane } from './gsd-pane';

describe('GSDPane', () => {
  beforeEach(() => {
    projects.value = [{ path: '/tmp/proj', name: 'testproj', agent: 'claude' }];
    activeProjectName.value = 'testproj';
    gsdSubTab.value = 'State';
  });

  it('renders all 5 sub-tab pill labels', () => {
    render(<GSDPane />);
    for (const label of ['Milestones', 'Phases', 'Progress', 'History', 'State']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('defaults to State sub-tab per D-02', () => {
    render(<GSDPane />);
    expect(gsdSubTab.value).toBe('State');
  });

  it('shows missing-file copy when STATE.md absent', async () => {
    render(<GSDPane />);
    await waitFor(
      () => {
        expect(screen.queryByText(/No \.planning\/STATE\.md found/)).toBeTruthy();
      },
      { timeout: 1000 }
    );
  });
});
