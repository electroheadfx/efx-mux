// dropdown-menu.test.tsx -- Tests for Dropdown component
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { Dropdown, type DropdownItem } from './dropdown-menu';

const mockItems: DropdownItem[] = [
  { label: 'Apple', action: vi.fn() },
  { label: 'Banana', action: vi.fn() },
  { label: 'Cherry', action: vi.fn() },
];

describe('Dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItems.forEach(item => {
      (item.action as ReturnType<typeof vi.fn>).mockClear();
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('dropdown is closed by default', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    // Menu items should not be visible
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  });

  it('clicking trigger opens dropdown', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));

    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('pressing Escape closes dropdown', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    // Open the dropdown
    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByText('Apple')).toBeInTheDocument();

    // Press Escape
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });

    // Menu should be closed
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('ArrowDown moves selection to next item', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // First item should be selected by default (index 0)
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveAttribute('data-selected', 'true');

    // Press ArrowDown to move to next item
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveAttribute('data-selected', 'true');
    expect(items[0]).toHaveAttribute('data-selected', 'false');
  });

  it('ArrowUp moves selection to previous item', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // Move down twice first
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const items = screen.getAllByRole('menuitem');
    expect(items[2]).toHaveAttribute('data-selected', 'true');

    // Now ArrowUp should go back
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[1]).toHaveAttribute('data-selected', 'true');
  });

  it('Enter activates selected item', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // Move to Banana
    fireEvent.keyDown(menu, { key: 'ArrowDown' });

    // Press Enter
    fireEvent.keyDown(menu, { key: 'Enter' });

    expect(mockItems[1].action).toHaveBeenCalledTimes(1);
    // Menu should close
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('Space activates selected item', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // First item selected, press Space
    fireEvent.keyDown(menu, { key: ' ' });

    expect(mockItems[0].action).toHaveBeenCalledTimes(1);
  });

  it('Home moves to first item', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // Move to last item
    fireEvent.keyDown(menu, { key: 'End' });
    const items = screen.getAllByRole('menuitem');
    expect(items[2]).toHaveAttribute('data-selected', 'true');

    // Press Home
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(items[0]).toHaveAttribute('data-selected', 'true');
  });

  it('End moves to last item', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // Press End
    fireEvent.keyDown(menu, { key: 'End' });

    const items = screen.getAllByRole('menuitem');
    expect(items[2]).toHaveAttribute('data-selected', 'true');
  });

  it('type-ahead filters to matching item', async () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // Type 'c' to match Cherry
    fireEvent.keyDown(menu, { key: 'c' });

    const items = screen.getAllByRole('menuitem');
    expect(items[2]).toHaveAttribute('data-selected', 'true');
  });

  it('type-ahead buffer clears after 500ms', async () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    fireEvent.click(screen.getByText('Menu'));
    const menu = screen.getByRole('menu');

    // Type 'b' to match Banana
    fireEvent.keyDown(menu, { key: 'b' });
    const items = screen.getAllByRole('menuitem');
    expect(items[1]).toHaveAttribute('data-selected', 'true');

    // Advance time past 500ms
    vi.advanceTimersByTime(600);

    // Type 'a' - should now match Apple (buffer cleared)
    fireEvent.keyDown(menu, { key: 'a' });
    expect(items[0]).toHaveAttribute('data-selected', 'true');
  });

  it('has aria-haspopup on trigger', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    const trigger = screen.getByText('Menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('has aria-expanded that reflects open state', () => {
    render(
      <Dropdown
        items={mockItems}
        trigger={(props) => <button {...props}>Menu</button>}
      />
    );

    const trigger = screen.getByText('Menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
