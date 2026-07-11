import React from 'react';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { use_keyboard_navigation, SkipToGraph } from './keyboard_navigation';
import { ThemeProviderComponent } from '../../theme/theme_context';

const mock_get_nodes = jest.fn();
const mock_get_edges = jest.fn();
const mock_set_nodes = jest.fn();
const mock_fit_view = jest.fn();

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  useReactFlow: () => ({
    getNodes: mock_get_nodes,
    getEdges: mock_get_edges,
    setNodes: mock_set_nodes,
    fitView: mock_fit_view,
  }),
}));

const mock_notify = jest.fn();
jest.mock('./error_handling', () => ({
  error_notification_manager: { notify: (...args: unknown[]) => mock_notify(...args) },
}));

type TestNode = { id: string; selected: boolean };
type NodesUpdater = (nodes: TestNode[]) => TestNode[];

function apply_updater(updater: NodesUpdater, nodes: TestNode[]): TestNode[] {
  return updater(nodes);
}

describe('use_keyboard_navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock_get_nodes.mockReturnValue([]);
    mock_get_edges.mockReturnValue([]);
  });

  it('moves selection toward the caller on ArrowUp', () => {
    mock_get_nodes.mockReturnValue([{ id: 'callee', selected: true }, { id: 'caller', selected: false }]);
    mock_get_edges.mockReturnValue([{ source: 'caller', target: 'callee' }]);
    const target = document.createElement('div');
    target.setAttribute('data-id', 'caller');
    target.setAttribute('tabindex', '-1');
    document.body.appendChild(target);
    const on_node_navigate = jest.fn();

    renderHook(() => use_keyboard_navigation({ on_node_navigate }));
    const prevented = !fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(prevented).toBe(true);
    const next = apply_updater(mock_set_nodes.mock.calls[0][0], mock_get_nodes());
    expect(next.find(n => n.id === 'caller')?.selected).toBe(true);
    expect(next.find(n => n.id === 'callee')?.selected).toBe(false);
    expect(on_node_navigate).toHaveBeenCalledWith('caller');
    expect(document.activeElement).toBe(target);

    document.body.removeChild(target);
  });

  it('moves selection toward the callee on ArrowDown', () => {
    mock_get_nodes.mockReturnValue([{ id: 'caller', selected: true }, { id: 'callee', selected: false }]);
    mock_get_edges.mockReturnValue([{ source: 'caller', target: 'callee' }]);
    const on_node_navigate = jest.fn();

    renderHook(() => use_keyboard_navigation({ on_node_navigate }));
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    const next = apply_updater(mock_set_nodes.mock.calls[0][0], mock_get_nodes());
    expect(next.find(n => n.id === 'callee')?.selected).toBe(true);
    expect(on_node_navigate).toHaveBeenCalledWith('callee');
  });

  it('ignores arrow keys when no node is selected', () => {
    mock_get_nodes.mockReturnValue([{ id: 'a', selected: false }]);
    mock_get_edges.mockReturnValue([{ source: 'a', target: 'b' }]);

    renderHook(() => use_keyboard_navigation());
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(mock_set_nodes).not.toHaveBeenCalled();
  });

  it('does nothing when the selected node has no connecting edge in that direction', () => {
    mock_get_nodes.mockReturnValue([{ id: 'lonely', selected: true }]);
    mock_get_edges.mockReturnValue([]);
    const on_node_navigate = jest.fn();

    renderHook(() => use_keyboard_navigation({ on_node_navigate }));
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(mock_set_nodes).not.toHaveBeenCalled();
    expect(on_node_navigate).not.toHaveBeenCalled();
  });

  it('fits the view on Ctrl+F', () => {
    renderHook(() => use_keyboard_navigation());
    const prevented = !fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(prevented).toBe(true);
    expect(mock_fit_view).toHaveBeenCalledWith({ padding: 0.2, duration: 500 });
  });

  it('leaves an unmodified f keypress alone', () => {
    renderHook(() => use_keyboard_navigation());
    fireEvent.keyDown(window, { key: 'f' });

    expect(mock_fit_view).not.toHaveBeenCalled();
  });

  it('deselects every node on Escape', () => {
    renderHook(() => use_keyboard_navigation());
    fireEvent.keyDown(window, { key: 'Escape' });

    const next = apply_updater(mock_set_nodes.mock.calls[0][0], [
      { id: 'a', selected: true },
      { id: 'b', selected: true },
    ]);
    expect(next.every(n => !n.selected)).toBe(true);
  });

  it('surfaces the shortcut list on Shift+?', () => {
    renderHook(() => use_keyboard_navigation());
    fireEvent.keyDown(window, { key: '?', shiftKey: true });

    expect(mock_notify).toHaveBeenCalledWith(expect.stringContaining('Keyboard shortcuts'), 'info');
  });

  it('does not hijack keys while typing in an input field', () => {
    mock_get_nodes.mockReturnValue([{ id: 'a', selected: true }]);
    renderHook(() => use_keyboard_navigation());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mock_set_nodes).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('stops handling keys after unmount', () => {
    const { unmount } = renderHook(() => use_keyboard_navigation());
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(mock_set_nodes).not.toHaveBeenCalled();
  });
});

describe('SkipToGraph', () => {
  const render_link = () =>
    render(
      <ThemeProviderComponent force_standalone>
        <SkipToGraph />
      </ThemeProviderComponent>
    );

  it('focuses the graph when the skip link is activated', () => {
    const graph = document.createElement('div');
    graph.className = 'react-flow';
    graph.setAttribute('tabindex', '-1');
    document.body.appendChild(graph);

    render_link();
    fireEvent.click(screen.getByText('Skip to code flow diagram'));

    expect(document.activeElement).toBe(graph);
    document.body.removeChild(graph);
  });

  it('reveals the offscreen link on focus and hides it again on blur', () => {
    render_link();
    const link = screen.getByText('Skip to code flow diagram');

    fireEvent.focus(link);
    expect(link.style.left).toBe('10px');

    fireEvent.blur(link);
    expect(link.style.left).toBe('-9999px');
  });
});
