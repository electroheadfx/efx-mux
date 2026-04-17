// right-panel.tsx — Phase 20: Single-pane right panel with UnifiedTabBar scope="right".
//
// D-01: The prior two-pane split ([File Tree | GSD] top, [Bash] bottom) is gone.
//       A single full-height pane is driven by the right-scope tab bar.
// D-17: First render defaults to the File Tree sticky tab.
// D-21: No legacy bash-session DOM listener is installed here. The old eager
//       bash connect-on-mount is deleted; right-scope terminal tabs are plain
//       dynamic tabs now, driven by the scope='right' tab bar.
// Pitfall 6: Exactly one body is visible at any time — sticky File Tree, sticky
//            GSD, Git Changes (when owned by right), or the terminal-containers
//            wrapper. All others are display:none.

import { colors } from '../tokens';
import { UnifiedTabBar, gitChangesTab } from './unified-tab-bar';
import { GSDPane } from './gsd-pane';
import { FileTree } from './file-tree';
import { GitChangesTab } from './git-changes-tab';
import { getTerminalScope } from './terminal-tabs';

/**
 * RightPanel — flex column with a UnifiedTabBar at top and a single content
 * region below. Sticky File Tree + GSD bodies are always mounted; Git Changes
 * renders when this scope owns it; the terminal-containers wrapper is the mount
 * point for scope='right' terminal/agent PTYs. Visibility is toggled via
 * display: block/none based on getTerminalScope('right').activeTabId.
 */
export function RightPanel() {
  const { activeTabId } = getTerminalScope('right');
  const activeId = activeTabId.value;
  const gc = gitChangesTab.value;
  const gcOwnedHere = gc?.owningScope === 'right';
  const gcActive = !!gcOwnedHere && !!gc && activeId === gc.id;
  const stickyActive = activeId === 'file-tree' || activeId === 'gsd';
  // Dynamic active = active tab is a terminal/agent id (not sticky, not gc).
  const isDynamic = !stickyActive && !gcActive;

  return (
    <aside
      class="right-panel flex flex-col"
      aria-label="Right panel"
      style={{
        backgroundColor: colors.bgBase,
        borderLeft: `1px solid ${colors.bgBorder}`,
      }}
    >
      <UnifiedTabBar scope="right" />
      <div class="right-panel-content flex-1 relative overflow-hidden">
        {/* Sticky File Tree body — always mounted, display toggled */}
        <div
          style={{
            height: '100%',
            display: activeId === 'file-tree' ? 'block' : 'none',
          }}
        >
          <FileTree />
        </div>
        {/* Sticky GSD body — always mounted, display toggled */}
        <div
          style={{
            height: '100%',
            display: activeId === 'gsd' ? 'block' : 'none',
          }}
        >
          <GSDPane />
        </div>
        {/* Git Changes body — rendered only when this scope owns it */}
        {gcOwnedHere && gc && (
          <div
            style={{
              height: '100%',
              display: gcActive ? 'block' : 'none',
            }}
          >
            <GitChangesTab />
          </div>
        )}
        {/* Terminal container wrapper — PTY mount point for scope='right'.
            Positioned absolute so it overlays the content area; visibility is
            controlled by display toggle so xterm retains measurable layout. */}
        <div
          class="terminal-containers"
          data-scope="right"
          style={{
            position: 'absolute',
            inset: 0,
            display: isDynamic ? 'block' : 'none',
          }}
        />
      </div>
    </aside>
  );
}
