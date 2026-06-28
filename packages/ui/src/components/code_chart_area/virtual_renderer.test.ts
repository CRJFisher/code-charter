import { get_visible_nodes } from './virtual_renderer';

describe('get_visible_nodes', () => {
  it('identifies visible nodes within viewport', () => {
    const nodes = [
      { id: '1', position: { x: 0, y: 0 }, width: 200, height: 100 },
      { id: '2', position: { x: 300, y: 0 }, width: 200, height: 100 },
      { id: '3', position: { x: 1000, y: 1000 }, width: 200, height: 100 },
    ];

    const viewport = { x: 0, y: 0, zoom: 1 };
    const visible = get_visible_nodes(nodes, viewport, 800, 600);

    expect(visible.has('1')).toBe(true);
    expect(visible.has('2')).toBe(true);
    expect(visible.has('3')).toBe(false);
  });

  it('includes nodes that fall inside the buffer area', () => {
    const nodes = [
      { id: '1', position: { x: -50, y: -50 }, width: 200, height: 100 },
      { id: '2', position: { x: 850, y: 0 }, width: 200, height: 100 },
    ];

    const viewport = { x: 0, y: 0, zoom: 1 };
    const visible = get_visible_nodes(nodes, viewport, 800, 600, 100);

    expect(visible.has('1')).toBe(true);
    expect(visible.has('2')).toBe(true);
  });

  it('widens the visible area as zoom decreases', () => {
    const nodes = [
      { id: '1', position: { x: 0, y: 0 }, width: 200, height: 100 },
      { id: '2', position: { x: 500, y: 0 }, width: 200, height: 100 },
    ];

    const viewport = { x: 0, y: 0, zoom: 0.5 };
    const visible = get_visible_nodes(nodes, viewport, 400, 300);

    expect(visible.has('1')).toBe(true);
    expect(visible.has('2')).toBe(true);
  });

  it('returns an empty set when given no nodes', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const visible = get_visible_nodes([], viewport, 800, 600);

    expect(visible.size).toBe(0);
  });

  it('falls back to default node dimensions when width and height are absent', () => {
    const nodes = [
      { id: '1', position: { x: -150, y: -50 } },
    ];

    const viewport = { x: 0, y: 0, zoom: 1 };
    const visible = get_visible_nodes(nodes, viewport, 800, 600, 0);

    expect(visible.has('1')).toBe(true);
  });

  it('excludes a node that lies entirely outside the buffered viewport', () => {
    const nodes = [
      { id: '1', position: { x: 5000, y: 5000 }, width: 200, height: 100 },
    ];

    const viewport = { x: 0, y: 0, zoom: 1 };
    const visible = get_visible_nodes(nodes, viewport, 800, 600);

    expect(visible.has('1')).toBe(false);
  });
});
