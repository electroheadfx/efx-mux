// context-menu.tsx -- Context menu component for right-click actions
// Per D-01, D-02, D-03 from Phase 15 CONTEXT.md
// Phase 18 D-07: submenu support via optional `children` field

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { colors, radii, spacing, fonts } from '../tokens';

// D-01: Flat array item structure with separator support
// Phase 18 D-07: optional `children` field triggers submenu rendering
export interface ContextMenuItem {
  label: string;
  action?: () => void;
  // Accept any component with an optional size prop (lucide-preact icons accept
  // string | number for size, so keep this permissive to avoid coupling the
  // menu interface to a specific icon library).
  icon?: ComponentType<{ size?: number | string }>;
  disabled?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // WKWebView fix: track whether a mousedown already activated an item so the
  // subsequent click event (fired after mousedown+mouseup) does not double-invoke
  // the action. Reset to -1 after each click to allow future activations.
  const mouseDownActivatedIndex = useRef<number>(-1);
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);
  // Phase 18 quick-260416-uig: per-item hover tint for main menu.
  // Submenu is rendered via recursive <ContextMenu />, so the child instance
  // has its own hoveredIndex and inherits identical behaviour automatically.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // D-02: Auto-flip positioning -- flip to opposite side when menu would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const flipX = x + rect.width > window.innerWidth;
    const flipY = y + rect.height > window.innerHeight;
    if (flipX) menuRef.current.style.left = `${x - rect.width}px`;
    if (flipY) menuRef.current.style.top = `${y - rect.height}px`;
  }, [x, y]);

  // D-03: Close triggers: click outside, Escape key, item selection (NOT scroll parent)
  // Phase 18: click-outside check must also consider the submenu DOM node
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inSubmenu = submenuRef.current?.contains(target);
      if (!inMenu && !inSubmenu) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Phase 18: ArrowRight/ArrowLeft keyboard support for submenu enter/exit
  useEffect(() => {
    const handleArrowKeys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        // Only open submenu if the currently hovered row has children
        if (submenuIndex === null) {
          for (let i = 0; i < items.length; i++) {
            const row = rowRefs.current[i];
            if (items[i]?.children && row?.matches(':hover')) {
              const rect = row.getBoundingClientRect();
              setSubmenuIndex(i);
              setSubmenuPos({ x: rect.right, y: rect.top });
              e.preventDefault();
              return;
            }
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (submenuIndex !== null) {
          setSubmenuIndex(null);
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handleArrowKeys);
    return () => document.removeEventListener('keydown', handleArrowKeys);
  }, [items, submenuIndex]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    if (item.children) return; // submenu parent rows are no-op on click
    item.action?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      // WKWebView fix: stop mousedown from bubbling through the fixed-position menu
      // into DOM elements rendered below it (e.g. file-tree rows whose onMouseDown
      // calls e.preventDefault(), which suppresses the subsequent click event and
      // prevents item actions from firing).
      onMouseDown={(e) => { e.stopPropagation(); }}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: colors.bgElevated,
        border: `1px solid ${colors.bgBorder}`,
        borderRadius: radii.lg,
        padding: `${spacing.sm}px 0`,
        zIndex: 1000,
        minWidth: 160,
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div
            key={i}
            role="separator"
            style={{
              height: 1,
              backgroundColor: colors.bgBorder,
              margin: `${spacing.sm}px 0`,
            }}
          />
        ) : (
          <div
            key={i}
            role="menuitem"
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            aria-disabled={item.disabled}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? submenuIndex === i : undefined}
            onMouseEnter={() => {
              // Phase 18 quick-260416-uig: mark this row as hovered for bgSurface tint
              setHoveredIndex(i);
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              if (!item.children) {
                // Close any open submenu when hovering a non-submenu row (with 300ms delay).
                // Longer delay prevents accidental close when mouse arcs diagonally to the submenu.
                if (submenuIndex !== null) {
                  hoverTimerRef.current = setTimeout(() => setSubmenuIndex(null), 300);
                }
                return;
              }
              hoverTimerRef.current = setTimeout(() => {
                const row = rowRefs.current[i];
                if (!row) return;
                const rect = row.getBoundingClientRect();
                setSubmenuIndex(i);
                setSubmenuPos({ x: rect.right, y: rect.top });
              }, 150);
            }}
            onMouseLeave={() => {
              // Phase 18 quick-260416-uig: clear per-item hover tint immediately,
              // but allow 300ms for mouse to arc into the submenu before closing it.
              setHoveredIndex(null);
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            }}
            // WKWebView fix (primary trigger): fire the action on mousedown so it works
            // even when WKWebView's pointer-event routing suppresses the click event for
            // position:fixed elements that overlap overflow:hidden ancestors.
            // The outer menu onMouseDown calls stopPropagation to prevent tree-row
            // handlers from receiving this mousedown — but item rows need their own
            // stopPropagation too since Preact bubbles inner handlers before outer ones.
            // mouseDownActivatedIndex guards against double-invoke when click also fires.
            onMouseDown={(e) => {
              e.stopPropagation();
              mouseDownActivatedIndex.current = i;
              handleItemClick(item);
            }}
            // onClick retained for keyboard activation (Enter/Space) and JSDOM test compatibility.
            // Skipped if mousedown already triggered this item to prevent double-invoke.
            onClick={() => {
              if (mouseDownActivatedIndex.current === i) {
                mouseDownActivatedIndex.current = -1;
                return;
              }
              handleItemClick(item);
            }}
            style={{
              padding: `${spacing.lg}px ${spacing['4xl']}px`,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: item.disabled ? colors.textDim : colors.textPrimary,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xl,
              // Phase 18 quick-260416-uig: open-submenu cue (bgBorder) wins over hover tint (bgSurface);
              // otherwise plain rows pick up bgSurface on per-item hover.
              backgroundColor: submenuIndex === i ? colors.bgBorder : (hoveredIndex === i ? colors.bgSurface : 'transparent'),
            }}
          >
            {/* pointerEvents:none on icon wrapper and label so clicks always target
                the parent div's event handlers regardless of which child element the
                cursor lands on (SVG hit-test quirk in WKWebView).
                display:inline-flex (not display:contents) ensures pointer-events:none
                correctly prevents the icon SVG from intercepting events in WKWebView.
                display:contents is a known problem in WebKit: the element has no box
                of its own, so pointer-events:none may not apply to its SVG children. */}
            {item.icon && <span style={{ display: 'inline-flex', pointerEvents: 'none' }}><item.icon size={14} /></span>}
            <span style={{ flex: 1, pointerEvents: 'none' }}>{item.label}</span>
            {item.children && (
              <span
                style={{
                  fontSize: 10,
                  color: submenuIndex === i ? colors.accent : colors.textMuted,
                  pointerEvents: 'none',
                }}
              >
                ▸
              </span>
            )}
          </div>
        )
      )}
      {submenuIndex !== null && submenuPos && items[submenuIndex]?.children && (
        <div
          ref={submenuRef}
          onMouseEnter={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = setTimeout(() => setSubmenuIndex(null), 300);
          }}
        >
          <ContextMenu
            items={items[submenuIndex].children!}
            x={submenuPos.x}
            y={submenuPos.y}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
