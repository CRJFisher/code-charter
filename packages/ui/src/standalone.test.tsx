import { act } from '@testing-library/react';
import { init } from './standalone';

const mock_themed_app = jest.fn((_props: { force_standalone?: boolean }) => (
  <div data-testid="themed-app" />
));

jest.mock('./components/themed_app', () => ({
  ThemedApp: (props: { force_standalone?: boolean }) => mock_themed_app(props),
}));

describe('init', () => {
  beforeEach(() => {
    mock_themed_app.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('logs an error and returns without mounting when #root is absent', () => {
    const error_spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => init()).not.toThrow();
    expect(error_spy).toHaveBeenCalledWith('CodeCharterUI: No root element found');
    expect(mock_themed_app).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe('');
  });

  it('mounts the themed app into #root when present', () => {
    document.body.innerHTML = '<div id="root"></div>';

    act(() => {
      init();
    });

    expect(document.querySelector('[data-testid="themed-app"]')).not.toBeNull();
    expect(mock_themed_app).toHaveBeenCalledWith({ force_standalone: undefined });
  });

  it('forwards force_standalone to the themed app', () => {
    document.body.innerHTML = '<div id="root"></div>';

    act(() => {
      init({ force_standalone: true });
    });

    expect(mock_themed_app).toHaveBeenCalledWith({ force_standalone: true });
  });
});
