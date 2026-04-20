// main-panel.tsx — Phase 22 Plan 04: N-sub-scope layout
//
// Re-exports shared state helpers from sub-scope-pane.tsx for backward compat.
// MainPanel renders N sub-scopes with SubScopePane + intra-zone handles.

import { colors } from '../tokens';
import {
  SubScopePane,
  activeMainSubScopes,
  getActiveSubScopesForZone,
  spawnSubScopeForZone,
  closeSubScope,
  __resetActiveSubScopesForTesting,
  restoreActiveSubScopes,
} from './sub-scope-pane';
import { ServerPane } from './server-pane';
import { useEffect } from 'preact/hooks';

// Re-export shared helpers so callers can import from main-panel
export { getActiveSubScopesForZone, spawnSubScopeForZone, closeSubScope, __resetActiveSubScopesForTesting, restoreActiveSubScopes };

export function MainPanel() {
  const scopes = activeMainSubScopes.value;

  // Re-register handles whenever scope count changes (new handles appear)
  useEffect(() => {
    import('../drag-manager').then(dm => dm.attachIntraZoneHandles('main'));
  }, [scopes.length]);

  return (
    <main
      class="main-panel relative flex flex-col"
      aria-label="Main panel"
      style={{ backgroundColor: colors.bgBase, flex: 1, overflow: 'hidden' }}
    >
      <div class="flex flex-col" style={{ flex: 1, overflow: 'hidden' }}>
        {scopes.map((scope, i) => (
          <>
            <SubScopePane key={scope} scope={scope} zone="main" index={i} total={scopes.length} />
            {i < scopes.length - 1 && (
              <div
                key={`main-intra-${i}`}
                class="split-handle-h-intra"
                data-handle={`main-intra-${i}`}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize split pane"
              />
            )}
          </>
        ))}
      </div>
      <ServerPane />
    </main>
  );
}
