import { renderHook, act } from '@testing-library/react';
import { use_debounce } from './use_debounce';

describe('use_debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => use_debounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('settles to the latest value after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => use_debounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );

    rerender({ value: 'updated', delay: 500 });
    expect(result.current).toBe('initial');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe('updated');
  });

  it('resets the timer when the value changes before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => use_debounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } }
    );

    rerender({ value: 'b', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('a');

    rerender({ value: 'c', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe('c');
  });

  it('clears the pending timer on unmount', () => {
    const clear_spy = jest.spyOn(global, 'clearTimeout');
    const { rerender, unmount } = renderHook(
      ({ value }) => use_debounce(value, 500),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'updated' });
    unmount();

    expect(clear_spy).toHaveBeenCalled();
    clear_spy.mockRestore();
  });
});
