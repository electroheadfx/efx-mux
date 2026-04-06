// drag-manager.js -- Vanilla JS drag manager for all split handles (per D-06 to D-09)
// No framework dependencies. Attaches to DOM handles identified by [data-handle].
// Ratios persisted via the saveRatios callback passed from main.js.

/**
 * Initialize drag behavior for all split handles.
 *
 * @param {{ saveRatios: (patch: Record<string, string>) => void }} options
 */
export function initDragManager({ saveRatios }) {
  const app = document.getElementById('app');
  if (!app) return;

  // -- Sidebar <-> Main vertical handle ----------------------------------------
  const sidebarHandle = document.querySelector('[data-handle="sidebar-main"]');
  if (sidebarHandle) {
    makeDragV(sidebarHandle, {
      onDrag(clientX) {
        // clientX is the new sidebar right edge.
        // Clamp: min 40px (icon strip), max 400px.
        const w = Math.min(400, Math.max(40, clientX));
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
      },
      onEnd(clientX) {
        const w = Math.min(400, Math.max(40, clientX));
        saveRatios({ '--sidebar-w': `${w}px` });
      },
    });
  }

  // -- Main <-> Right vertical handle ------------------------------------------
  const mainRightHandle = document.querySelector('[data-handle="main-right"]');
  if (mainRightHandle) {
    makeDragV(mainRightHandle, {
      onDrag(clientX) {
        // clientX is the left edge of the right panel.
        // Convert to a % of total window width for responsive behavior.
        const totalW = window.innerWidth;
        const rawPct = ((totalW - clientX) / totalW) * 100;
        // Clamp: min 10%, max 50%
        const pct = Math.min(50, Math.max(10, rawPct));
        document.documentElement.style.setProperty('--right-w', `${pct.toFixed(1)}%`);
      },
      onEnd(clientX) {
        const totalW = window.innerWidth;
        const rawPct = ((totalW - clientX) / totalW) * 100;
        const pct = Math.min(50, Math.max(10, rawPct));
        saveRatios({ '--right-w': `${pct.toFixed(1)}%` });
      },
    });
  }

  // -- Right top <-> Right bottom horizontal handle ----------------------------
  const rightHHandle = document.querySelector('[data-handle="right-h"]');
  if (rightHHandle) {
    makeDragH(rightHHandle, {
      onDrag(clientY) {
        // clientY is the Y position within the right panel.
        // We want to set the top sub-panel's flex-basis.
        const rightPanel = document.querySelector('.right-panel');
        if (!rightPanel) return;
        const rect = rightPanel.getBoundingClientRect();
        const rawPct = ((clientY - rect.top) / rect.height) * 100;
        // Clamp: top panel min 15%, max 85%
        const pct = Math.min(85, Math.max(15, rawPct));
        // Apply as flex-basis on .right-top and .right-bottom
        const rightTop = rightPanel.querySelector('.right-top');
        const rightBottom = rightPanel.querySelector('.right-bottom');
        if (rightTop)    rightTop.style.flex    = `0 0 ${pct.toFixed(1)}%`;
        if (rightBottom) rightBottom.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
        // Store as a data attribute for persistence
        rightPanel.dataset.splitPct = pct.toFixed(1);
      },
      onEnd(clientY) {
        const rightPanel = document.querySelector('.right-panel');
        if (!rightPanel) return;
        const pct = parseFloat(rightPanel.dataset.splitPct || '50');
        saveRatios({ '--right-h-pct': `${pct.toFixed(1)}` });
      },
    });
  }

  // Restore persisted right-panel horizontal split on mount
  // (--right-h-pct is stored as a plain number, not a CSS property)
  try {
    const saved = JSON.parse(localStorage.getItem('gsd-mux:split-ratios') || '{}');
    const pct = parseFloat(saved['--right-h-pct']);
    if (!isNaN(pct)) {
      const rightPanel = document.querySelector('.right-panel');
      if (rightPanel) {
        const rightTop    = rightPanel.querySelector('.right-top');
        const rightBottom = rightPanel.querySelector('.right-bottom');
        if (rightTop)    rightTop.style.flex    = `0 0 ${pct.toFixed(1)}%`;
        if (rightBottom) rightBottom.style.flex = `0 0 ${(100 - pct).toFixed(1)}%`;
      }
    }
  } catch { /* ignore corrupt localStorage */ }
}

// --- Vertical drag helper ----------------------------------------------------
/**
 * Attach vertical (column-resize) drag to a handle element.
 * @param {HTMLElement} handle
 * @param {{ onDrag: (clientX: number) => void, onEnd: (clientX: number) => void }} callbacks
 */
function makeDragV(handle, { onDrag, onEnd }) {
  const app = document.getElementById('app');

  handle.addEventListener('mousedown', (startEvent) => {
    startEvent.preventDefault();

    // Disable pointer events on panels to prevent mousemove event loss (Pitfall 3)
    app.classList.add('app-dragging');
    handle.classList.add('dragging');

    function onMove(e) {
      onDrag(e.clientX);
    }

    function onUp(e) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      app.classList.remove('app-dragging');
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
 * @param {HTMLElement} handle
 * @param {{ onDrag: (clientY: number) => void, onEnd: (clientY: number) => void }} callbacks
 */
function makeDragH(handle, { onDrag, onEnd }) {
  const app = document.getElementById('app');

  handle.addEventListener('mousedown', (startEvent) => {
    startEvent.preventDefault();
    app.classList.add('app-dragging');
    handle.classList.add('dragging');

    function onMove(e) {
      onDrag(e.clientY);
    }

    function onUp(e) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      app.classList.remove('app-dragging');
      handle.classList.remove('dragging');
      onEnd(e.clientY);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
