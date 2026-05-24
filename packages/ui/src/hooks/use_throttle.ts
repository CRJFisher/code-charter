import { useMemo, useRef } from 'react';

// Hook for throttling function calls
export function use_throttle<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number
): T {
  const last_run = useRef(Date.now());

  return useMemo(
    () =>
      ((...args: Parameters<T>) => {
        if (Date.now() - last_run.current >= delay) {
          last_run.current = Date.now();
          return callback(...args);
        }
      }) as T,
    [callback, delay]
  );
}
