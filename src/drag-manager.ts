// drag-manager.ts -- Vanilla DOM drag manager for all split handles (per D-06 to D-09)
// No framework dependencies. Attaches to DOM handles identified by [data-handle].
// Ratios persisted via state-manager.ts (Phase 4: state.json via Rust backend).
// Migrated to TypeScript (Phase 6.1)

import { updateLayout } from './state-manager';

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
  if (sidebarHandle) {
    makeDragV(sidebarHandle, {
      onDrag(clientX: number) {
        // clientX is the new sidebar right edge.
        // Clamp: min 40px (icon strip), max 400px.
        const w = Math.min(400, Math.max(40, clientX));
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
      },
      onEnd(clientX: number) {
        const w = Math.min(400, Math.max(40, clientX));
        updateLayout({ 'sidebar-w': `${w}px` });
      },
    });
  }

  // -- Main <-> Right vertical handle ------------------------------------------
  const mainRightHandle = document.querySelector<HTMLElement>('[data-handle="main-right"]');
  if (mainRightHandle) {
    makeDragV(mainRightHandle, {
      onDrag(clientX: number) {
        // clientX is the left edge of the right panel.
        // Convert to a % of total window width for responsive behavior.
        const totalW = window.innerWidth;
        const rawPct = ((totalW - clientX) / totalW) * 100;
        // Clamp: min 10%, max 50%
        const pct = Math.min(50, Math.max(10, rawPct));
        document.documentElement.style.setProperty('--right-w', `${pct.toFixed(1)}%`);
      },
      onEnd(clientX: number) {
        const totalW = window.innerWidth;
        const rawPct = ((totalW - clientX) / totalW) * 100;
        const pct = Math.min(50, Math.max(10, rawPct));
        updateLayout({ 'right-w': `${pct.toFixed(1)}%` });
      },
    });
  }

  // -- Right top <-> Right bottom horizontal handle ----------------------------
  const rightHHandle = document.querySelector<HTMLElement>('[data-handle="right-h"]');
  if (rightHHandle) {
    makeDragH(rightHHandle, {
      onDrag(clientY: number) {
        // clientY is the Y position within the right panel.
        // We want to set the top sub-panel's flex-basis.
        const rightPanel = document.querySelector<HTMLElement>('.right-panel');
        if (!rightPanel) return;
        const rect = rightPanel.getBoundingClientRect();
        const rawPct = ((clientY - rect.top) / rect.height) * 100;
        // Clamp: top panel min 15%, max 85%
        const pct = Math.min(85, Math.max(15, rawPct));
        // Apply as flex-basis on .right-top and .right-bottom
        const rightTop = rightPanel.querySelector<HTMLElement>('.right-top');
        const rightBottom = rightPanel.querySelector<HTMLElement>('.right-bottom');
        if (rightTop)    rightTop.style.flex    = `0 0 ${pct.toFixed(1)}%`;
        if (rightBottom) rightBottom.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
        // Store as a data attribute for persistence
        rightPanel.dataset.splitPct = pct.toFixed(1);
      },
      onEnd(_clientY: number) {
        const rightPanel = document.querySelector<HTMLElement>('.right-panel');
        if (!rightPanel) return;
        const pct = parseFloat(rightPanel.dataset.splitPct || '50');
        updateLayout({ 'right-h-pct': `${pct.toFixed(1)}` });
      },
    });
  }
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
