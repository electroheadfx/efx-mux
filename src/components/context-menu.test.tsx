// context-menu.test.tsx -- Tests for ContextMenu component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { ContextMenu, type ContextMenuItem } from './context-menu';

const mockItems: ContextMenuItem[] = [
  { label: 'Copy', action: vi.fn() },
  { label: 'Paste', action: vi.fn() },
  { label: 'Delete', action: vi.fn(), disabled: true },
];

const mockItemsWithSeparator: ContextMenuItem[] = [
  { label: 'Open', action: vi.fn() },
  { label: '', action: () => {}, separator: true },
  { label: 'Delete', action: vi.fn() },
];

describe('ContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock function implementations
    mockItems.forEach(item => {
      if (typeof item.action === 'function') {
        (item.action as ReturnType<typeof vi.fn>).mockClear?.();
      }
    });
    mockItemsWithSeparator.forEach(item => {
      if (typeof item.action === 'function') {
        (item.action as ReturnType<typeof vi.fn>).mockClear?.();
      }
    });
  });

  it('renders menu items with correct labels', () => {
    const onClose = vi.fn();
    render(<ContextMenu items={mockItems} x={100} y={100} onClose={onClose} />);

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Paste')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ContextMenu items={mockItems} x={100} y={100} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking outside the menu', () => {
    const onClose = vi.fn();
    render(<ContextMenu items={mockItems} x={100} y={100} onClose={onClose} />);

    // Click outside the menu (on document body)
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls item action and onClose when item is clicked', () => {
    const onClose = vi.fn();
    const action = vi.fn();
    const items = [{ label: 'Test Action', action }];
    render(<ContextMenu items={items} x={100} y={100} onClose={onClose} />);

    fireEvent.click(screen.getByText('Test Action'));

    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call action when disabled item is clicked', () => {
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [
      { label: 'Disabled Item', action: vi.fn(), disabled: true },
    ];
    render(<ContextMenu items={items} x={100} y={100} onClose={onClose} />);

    fireEvent.click(screen.getByText('Disabled Item'));

    expect(items[0].action).not.toHaveBeenCalled();
    // onClose should also not be called for disabled items
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders separator between items when separator=true', () => {
    const onClose = vi.fn();
    render(<ContextMenu items={mockItemsWithSeparator} x={100} y={100} onClose={onClose} />);

    // Find the menu container
    const menu = screen.getByRole('menu');
    // Separator should be a div with specific styling (height: 1px)
    const separators = menu.querySelectorAll('[role="separator"]');
    expect(separators.length).toBe(1);
  });

  it('has role="menu" on container', () => {
    const onClose = vi.fn();
    render(<ContextMenu items={mockItems} x={100} y={100} onClose={onClose} />);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('has role="menuitem" on each item', () => {
    const onClose = vi.fn();
    render(<ContextMenu items={mockItems} x={100} y={100} onClose={onClose} />);

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBe(3);
  });
});

describe('submenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders submenu after 150ms hover on parent row', async () => {
    const childAction = vi.fn();
    const parentItems: ContextMenuItem[] = [
      { label: 'Parent', children: [{ label: 'Child', action: childAction }] },
    ];
    const onClose = vi.fn();
    render(<ContextMenu items={parentItems} x={10} y={10} onClose={onClose} />);
    const parentRow = screen.getByText('Parent').closest('[role="menuitem"]') as HTMLElement;
    fireEvent.mouseEnter(parentRow);
    // Wait past the 150ms hover delay
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText('Child')).not.toBeNull();
  });

  it('invokes child action and closes whole menu on submenu item click', async () => {
    const childAction = vi.fn();
    const onClose = vi.fn();
    const parentItems: ContextMenuItem[] = [
      { label: 'Open In', children: [{ label: 'Zed', action: childAction }] },
    ];
    render(<ContextMenu items={parentItems} x={10} y={10} onClose={onClose} />);
    const parentRow = screen.getByText('Open In').closest('[role="menuitem"]') as HTMLElement;
    fireEvent.mouseEnter(parentRow);
    await new Promise((r) => setTimeout(r, 200));
    const childRow = screen.getByText('Zed').closest('[role="menuitem"]') as HTMLElement;
    fireEvent.click(childRow);
    expect(childAction).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders no submenu chevron when item has no children', () => {
    const items: ContextMenuItem[] = [{ label: 'Plain Item', action: () => {} }];
    render(<ContextMenu items={items} x={10} y={10} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain('▸');
  });

  it('parent row with children has aria-haspopup menu', () => {
    const items: ContextMenuItem[] = [
      { label: 'Open In', children: [{ label: 'Zed', action: () => {} }] },
    ];
    render(<ContextMenu items={items} x={10} y={10} onClose={() => {}} />);
    const parentRow = screen.getByText('Open In').closest('[role="menuitem"]');
    expect(parentRow?.getAttribute('aria-haspopup')).toBe('menu');
  });
});

// ── Phase 18 quick-260416-uig: per-item hover background tint ────────────────

describe('hover background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies hover background on mouseEnter and clears it on mouseLeave', () => {
    const items: ContextMenuItem[] = [
      { label: 'Copy', action: vi.fn() },
      { label: 'Paste', action: vi.fn() },
    ];
    render(<ContextMenu items={items} x={100} y={100} onClose={vi.fn()} />);
    const row = screen.getByText('Copy').closest('[role="menuitem"]') as HTMLElement;
    expect(row).not.toBeNull();
    // Before hover -- transparent (inline style returns empty string for 'transparent')
    const before = row.style.backgroundColor;
    expect(before === '' || before === 'transparent').toBe(true);
    // Hover -- bgSurface #324568 -> rgb(50, 69, 104)
    fireEvent.mouseEnter(row);
    expect(row.style.backgroundColor).toMatch(/rgb\(50, ?69, ?104\)|#324568/i);
    // Leave -- reverts
    fireEvent.mouseLeave(row);
    const after = row.style.backgroundColor;
    expect(after === '' || after === 'transparent').toBe(true);
  });

  it('applies hover background on submenu items', async () => {
    const parentItems: ContextMenuItem[] = [
      {
        label: 'Open In',
        children: [
          { label: 'Child A', action: vi.fn() },
          { label: 'Child B', action: vi.fn() },
        ],
      },
    ];
    render(<ContextMenu items={parentItems} x={10} y={10} onClose={vi.fn()} />);
    const parentRow = screen.getByText('Open In').closest('[role="menuitem"]') as HTMLElement;
    fireEvent.mouseEnter(parentRow);
    // Wait past the 150ms hover delay that opens the submenu
    await new Promise((r) => setTimeout(r, 200));
    const childRow = screen.getByText('Child B').closest('[role="menuitem"]') as HTMLElement;
    expect(childRow).not.toBeNull();
    fireEvent.mouseEnter(childRow);
    expect(childRow.style.backgroundColor).toMatch(/rgb\(50, ?69, ?104\)|#324568/i);
  });
});
