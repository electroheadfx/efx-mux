// right-panel.tsx — Phase 22 Plan 04: N-sub-scope layout
//
// Generalized from single-scope Phase 20 renderer to N-sub-scope (1..3).
// SubScopePane renders each scope's tab bar + always-mounted body stack.
// Intra-zone handles between stacked sub-scopes.

import { colors } from '../tokens';
import { SubScopePane, activeRightSubScopes } from './sub-scope-pane';

export function RightPanel() {
  const scopes = activeRightSubScopes.value;

  return (
    <aside
      class="right-panel flex flex-col"
      aria-label="Right panel"
      style={{
        backgroundColor: colors.bgBase,
        borderLeft: `1px solid ${colors.bgBorder}`,
        flex: 1,
        overflow: 'hidden',
      }}
    >
      {scopes.map((scope, i) => (
        <div key={scope} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <SubScopePane scope={scope} zone="right" />
          {i < scopes.length - 1 && (
            <div
              class="split-handle-h-intra"
              data-handle={`right-intra-${i}`}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize split pane"
            />
          )}
        </div>
      ))}
    </aside>
  );
}
