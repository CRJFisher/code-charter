import { renderHook } from '@testing-library/react';
import { Theme } from '@code-charter/types';
import { dark_theme, light_theme } from '../../theme/default_themes';
import { use_theme } from '../../theme/theme_context';
import { use_flow_theme_styles } from './use_chart_theme_styles';

jest.mock('../../theme/theme_context');

const mocked_use_theme = use_theme as jest.MockedFunction<typeof use_theme>;

function set_theme(theme: Theme) {
  mocked_use_theme.mockReturnValue({ theme, is_standalone: true });
}

describe('use_flow_theme_styles', () => {
  afterEach(() => {
    mocked_use_theme.mockReset();
  });

  it('styles an unselected, non-entry node with default background and border', () => {
    set_theme(light_theme);
    const { result } = renderHook(() => use_flow_theme_styles());

    expect(result.current.get_node_style(false, false)).toEqual({
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      border: '2px solid #cccccc',
      color: '#000000',
      transition: 'all 0.3s ease',
    });
  });

  it('styles a selected entry-point node with the entry background and thicker selected border', () => {
    set_theme(light_theme);
    const { result } = renderHook(() => use_flow_theme_styles());

    expect(result.current.get_node_style(true, true)).toEqual({
      backgroundColor: '#e8f5e9',
      border: '3px solid #0096FF',
      color: '#000000',
      transition: 'all 0.3s ease',
    });
  });

  it('strokes selected edges with the selected colour and unselected edges with the base colour', () => {
    set_theme(light_theme);
    const { result } = renderHook(() => use_flow_theme_styles());

    expect(result.current.get_edge_style(true).stroke).toBe('#0096FF');
    expect(result.current.get_edge_style(false).stroke).toBe('#b1b1b7');
  });

  it('maps a button variant to its theme colour', () => {
    set_theme(light_theme);
    const { result } = renderHook(() => use_flow_theme_styles());

    expect(result.current.get_button_style('danger')).toMatchObject({
      backgroundColor: '#d73a49',
      color: '#000000',
    });
  });

  it('derives error styles from the active theme', () => {
    set_theme(light_theme);
    const { result } = renderHook(() => use_flow_theme_styles());

    expect(result.current.get_error_style()).toEqual({
      backgroundColor: '#fee',
      border: '1px solid #fcc',
      color: '#c00',
    });
  });

  it('resolves colours against the dark theme when it is active', () => {
    set_theme(dark_theme);
    const { result } = renderHook(() => use_flow_theme_styles());

    expect(result.current.get_node_style(false, false).backgroundColor).toBe('rgba(30, 30, 30, 0.9)');
    expect(result.current.get_edge_style(false).stroke).toBe('#555555');
  });

  it('keeps the colours object referentially stable across re-renders with the same theme', () => {
    set_theme(light_theme);
    const { result, rerender } = renderHook(() => use_flow_theme_styles());

    const first = result.current.colors;
    rerender();
    expect(result.current.colors).toBe(first);
  });

  it('recomputes colours when the theme changes', () => {
    set_theme(light_theme);
    const { result, rerender } = renderHook(() => use_flow_theme_styles());
    const light_colors = result.current.colors;

    set_theme(dark_theme);
    rerender();

    expect(result.current.colors).not.toBe(light_colors);
    expect(result.current.colors.edge.stroke).toBe('#555555');
  });
});
