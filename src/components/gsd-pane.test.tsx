// gsd-pane.test.tsx -- Render tests for GSDPane component (Phase 19, Wave 3)
// This scaffold uses `describe.skip` until Plan 04 implements the real GSDPane.
// The imports must resolve at compile-time so that the test file is valid
// TypeScript today -- see gsd-pane.tsx placeholder stub for that contract.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { projects, activeProjectName, gsdSubTab } from '../state-manager';

// Mock Tauri APIs before GSDPane is imported -- same pattern as gsd-viewer.test.tsx.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.reject(new Error('missing file'))),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Plan 04 creates the real GSDPane component -- this import MUST exist for the
// test file to compile. Until Plan 04, mark the suite as skipped so CI stays green.
import { GSDPane } from './gsd-pane';

describe.skip('GSDPane (Wave 3)', () => {
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
    // Wait for async read_file_content rejection to resolve.
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByText(/No \.planning\/STATE\.md found/)).toBeTruthy();
  });
});
