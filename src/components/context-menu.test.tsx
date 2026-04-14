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
