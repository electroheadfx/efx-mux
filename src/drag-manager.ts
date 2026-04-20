// drag-manager.ts -- Vanilla DOM drag manager for all split handles (per D-06 to D-09)
// No framework dependencies. Attaches to DOM handles identified by [data-handle].
// Ratios persisted via state-manager.ts (Phase 4: state.json via Rust backend).
// Migrated to TypeScript (Phase 6.1)

import { updateLayout, activeProjectName, sidebarCollapsed } from './state-manager';
import { snapToCell, syncIncrementsDebounced } from './window/resize-increments';

interface DragCallbacksV {
  onDrag: (clientX: number) => void;
  onEnd: (clientX: number) => void;
}

interface DragCallbacksH {
  onDrag: (clientY: number) => void;
  onEnd: (clientY: number) => void;
}

/**
 * Initialize drag behavior for all split handles.
 */
export function initDragManager(): void {
  const app = document.getElementById('app');
  if (!app) return;

  // -- Sidebar <-> Main vertical handle ----------------------------------------
  const sidebarHandle = document.querySelector<HTMLElement>('[data-handle="sidebar-main"]');
  // Idempotency guard: skip if already initialized (matches pattern used by mainHHandle).
  if (sidebarHandle && !sidebarHandle.dataset.dragInit) {
    sidebarHandle.dataset.dragInit = 'true';
    makeDragV(sidebarHandle, {
      onDrag(clientX: number) {
        // Snap to cell boundary before clamping (Architecture C live drag quantization).
        const snapped = snapToCell(clientX, 'x');
        // clientX / snapped is the new sidebar right edge.
        // Clamp: min 40px (icon strip), max 400px.
        const w = Math.min(400, Math.max(40, snapped));
        // Bug fix 22-sidebar-resize-dead: when the sidebar is collapsed the CSS rule
        // `.sidebar.collapsed { width: 40px }` has higher specificity than
        // `width: var(--sidebar-w)`, so updating the CSS var alone has no visual
        // effect. Clear the collapsed flag first so the class is removed, then
        // immediately set the var to the desired drag width.
        // The Preact signal effect fires synchronously and sets --sidebar-w: '200px';
        // the setProperty call immediately after overrides that with the drag value.
        if (sidebarCollapsed.value) {
          sidebarCollapsed.value = false;
        }
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
      },
      onEnd(clientX: number) {
        const snapped = snapToCell(clientX, 'x');
        const w = Math.min(400, Math.max(40, snapped));
        updateLayout({ 'sidebar-w': `${w}px`, 'sidebar-collapsed': false });
        syncIncrementsDebounced();
      },
    });
  }

  // -- Main <-> Right vertical handle ------------------------------------------
  const mainRightHandle = document.querySelector<HTMLElement>('[data-handle="main-right"]');
  if (mainRightHandle) {
    makeDragV(mainRightHandle, {
      onDrag(clientX: number) {
        // Snap to cell boundary before converting to percent.
        const snapped = snapToCell(clientX, 'x');
        // snapped is the left edge of the right panel.
        // Convert to a % of total window width for responsive behavior.
        const totalW = window.innerWidth;
        const rawPct = ((totalW - snapped) / totalW) * 100;
        // Clamp: min 10%, max 50%
        const pct = Math.min(50, Math.max(10, rawPct));
        document.documentElement.style.setProperty('--right-w', `${pct.toFixed(1)}%`);
      },
      onEnd(clientX: number) {
        const snapped = snapToCell(clientX, 'x');
        const totalW = window.innerWidth;
        const rawPct = ((totalW - snapped) / totalW) * 100;
        const pct = Math.min(50, Math.max(10, rawPct));
        updateLayout({ 'right-w': `${pct.toFixed(1)}%` });
        syncIncrementsDebounced();
      },
    });
  }

  // -- Main terminal <-> Server pane horizontal handle (D-03) ------------------
  const mainHHandle = document.querySelector<HTMLElement>('[data-handle="main-h"]');
  if (mainHHandle && !mainHHandle.dataset.dragInit) {
    mainHHandle.dataset.dragInit = 'true';
    makeDragH(mainHHandle, {
      onDrag(clientY: number) {
        // Snap to cell boundary before computing server pane height.
        const snapped = snapToCell(clientY, 'y');
        // Server pane is at the bottom of .main-panel. Its height = container bottom - snapped.
        const mainPanel = document.querySelector<HTMLElement>('.main-panel');
        if (!mainPanel) return;
        const rect = mainPanel.getBoundingClientRect();
        const newHeight = rect.bottom - snapped;
        // Clamp: min 100px, max 50% of main panel height
        const clamped = Math.min(rect.height * 0.5, Math.max(100, newHeight));
        document.documentElement.style.setProperty('--server-pane-h', `${Math.round(clamped)}px`);
      },
      onEnd(clientY: number) {
        const snapped = snapToCell(clientY, 'y');
        const mainPanel = document.querySelector<HTMLElement>('.main-panel');
        if (!mainPanel) return;
        const rect = mainPanel.getBoundingClientRect();
        const newHeight = rect.bottom - snapped;
        const clamped = Math.min(rect.height * 0.5, Math.max(100, newHeight));
        updateLayout({ 'server-pane-height': `${Math.round(clamped)}px` });
        syncIncrementsDebounced();
      },
    });
  }

  // -- Phase 20 D-01: the Right top <-> Right bottom horizontal handle block
  //    is removed. The right panel is now a single-pane shell driven by
  //    UnifiedTabBar scope="right"; there is no internal horizontal split, and
  //    `right-h-pct` is no longer written to state.json (migration in
  //    state-manager.ts silently drops any stale value).
}

// --- Vertical drag helper ----------------------------------------------------
/**
 * Attach vertical (column-resize) drag to a handle element.
 */
function makeDragV(handle: HTMLElement, { onDrag, onEnd }: DragCallbacksV): void {
  const app = document.getElementById('app');

  handle.addEventListener('mousedown', (startEvent: MouseEvent) => {
    startEvent.preventDefault();

    // Disable pointer events on panels to prevent mousemove event loss (Pitfall 3)
    app?.classList.add('app-dragging');
    handle.classList.add('dragging');

    function onMove(e: MouseEvent): void {
      onDrag(e.clientX);
    }

    function onUp(e: MouseEvent): void {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      app?.classList.remove('app-dragging');
      handle.classList.remove('dragging');
      onEnd(e.clientX);
    }

    // Attach to document so events continue even when cursor leaves the handle
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/**
 * Phase 22 D-09: register intra-zone resize handles for stacked sub-scopes.
 * Handle elements must carry `data-handle="${zone}-intra-${i}"` where i is the
 * index of the handle (0 = between sub-scope 0 and 1, 1 = between 1 and 2).
 * Idempotent: re-running skips handles already initialized.
 */
export function attachIntraZoneHandles(zone: 'main' | 'right'): void {
  document.querySelectorAll<HTMLElement>(`[data-handle^="${zone}-intra-"]`).forEach((handle) => {
    if (handle.dataset.dragInit === 'true') return;
    handle.dataset.dragInit = 'true';
    const idxMatch = /-(\d+)$/.exec(handle.dataset.handle ?? '');
    const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;

    makeDragH(handle, {
      onDrag(clientY: number) {
        // Snap to cell boundary before intra-zone height math.
        const snapped = snapToCell(clientY, 'y');
        const panel = document.querySelector<HTMLElement>(`.${zone}-panel`);
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        // Calculate cumulative position from top as percentage
        const cumulativePct = ((snapped - rect.top) / rect.height) * 100;
        // For handle idx, the CSS var represents THIS pane's height.
        // Subtract previous panes' cumulative height to get this pane's height.
        let prevCumulative = 0;
        if (idx > 0) {
          const prevVar = getComputedStyle(document.documentElement).getPropertyValue(`--${zone}-split-${idx - 1}-pct`).trim();
          // Previous var is already a pane height, so cumulative = sum of all previous pane heights
          // For idx=1, prevCumulative = pane 0's height = --zone-split-0-pct
          // We need cumulative position of previous handle = sum of panes 0..idx-1
          // Simplification: cumulative position before handle idx = sum of --zone-split-0-pct through --zone-split-(idx-1)-pct
          for (let i = 0; i < idx; i++) {
            const varVal = getComputedStyle(document.documentElement).getPropertyValue(`--${zone}-split-${i}-pct`).trim();
            prevCumulative += parseFloat(varVal) || 0;
          }
        }
        const paneHeightPct = cumulativePct - prevCumulative;
        const clamped = Math.max(10, Math.min(90, paneHeightPct));
        document.documentElement.style.setProperty(
          `--${zone}-split-${idx}-pct`,
          `${clamped.toFixed(1)}%`,
        );

        // Phase 22 gap-closure 22-11: also mutate the adjacent panes' inline
        // style.height + flex so non-Preact consumers (and the 22-11 RED tests)
        // observe the resize. Without this, SubScopePane renders flex:1 and the
        // CSS var is cosmetically set but visually invisible.
        //
        // Bug fix 22-split-resize-position-reset: Use panel height (rect.height)
        // as reference frame since clamped is a percentage of panel height.
        // Previously used totalPx (sum of 2 adjacent panes) which caused position
        // jumps with 3+ panes because totalPx << rect.height.
        const panes = panel.querySelectorAll<HTMLElement>('.sub-scope-pane');
        const pane0 = panes[idx];
        const pane1 = panes[idx + 1];
        if (pane0 && pane1 && rect.height > 0) {
          // pane0's new height in pixels = clamped% of panel height
          const newPane0Px = (clamped / 100) * rect.height;
          pane0.style.height = `${newPane0Px}px`;
          pane0.style.flex = 'none';

          // pane1's height: if it's the last pane (flex:1), let it auto-fill;
          // otherwise compute from its CSS var percentage.
          const isPane1Last = pane1 === panes[panes.length - 1];
          if (isPane1Last) {
            // Last pane uses flex:1 to absorb remaining space
            pane1.style.height = '';
            pane1.style.flex = '1';
          } else {
            // Middle pane: compute from its CSS var (--zone-split-(idx+1)-pct)
            const pane1VarVal = getComputedStyle(document.documentElement).getPropertyValue(`--${zone}-split-${idx + 1}-pct`).trim();
            const pane1Pct = parseFloat(pane1VarVal) || (100 / panes.length);
            const newPane1Px = (pane1Pct / 100) * rect.height;
            pane1.style.height = `${newPane1Px}px`;
            pane1.style.flex = 'none';
          }
        }
      },
      onEnd(clientY: number) {
        // Snap to cell boundary before persisting.
        const snapped = snapToCell(clientY, 'y');
        const panel = document.querySelector<HTMLElement>(`.${zone}-panel`);
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        // Calculate cumulative position from top as percentage
        const cumulativePct = ((snapped - rect.top) / rect.height) * 100;
        // Subtract previous panes' heights to get this pane's height
        let prevCumulative = 0;
        for (let i = 0; i < idx; i++) {
          const varVal = getComputedStyle(document.documentElement).getPropertyValue(`--${zone}-split-${i}-pct`).trim();
          prevCumulative += parseFloat(varVal) || 0;
        }
        const paneHeightPct = cumulativePct - prevCumulative;
        const clamped = Math.max(10, Math.min(90, paneHeightPct));
        // Phase 22 gap-closure 22-07: persist per-project so project A's split
        // ratio does not leak into project B when switching.
        const project = activeProjectName.value;
        const key = project
          ? `${zone}-split-${idx}-pct:${project}`
          : `${zone}-split-${idx}-pct`;
        void updateLayout({ [key]: `${clamped.toFixed(1)}%` });
        syncIncrementsDebounced();
      },
    });
  });
}

// --- Horizontal drag helper --------------------------------------------------
/**
 * Attach horizontal (row-resize) drag to a handle element.
 */
function makeDragH(handle: HTMLElement, { onDrag, onEnd }: DragCallbacksH): void {
  const app = document.getElementById('app');

  handle.addEventListener('mousedown', (startEvent: MouseEvent) => {
    startEvent.preventDefault();
    app?.classList.add('app-dragging');
    handle.classList.add('dragging');

    function onMove(e: MouseEvent): void {
      onDrag(e.clientY);
    }

    function onUp(e: MouseEvent): void {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      app?.classList.remove('app-dragging');
      handle.classList.remove('dragging');
      onEnd(e.clientY);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
