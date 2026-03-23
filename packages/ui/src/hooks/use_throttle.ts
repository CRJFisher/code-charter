import { useMemo, useRef } from 'react';

// Hook for throttling function calls
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef(Date.now());

  return useMemo(
    () =>
      ((...args: Parameters<T>) => {
        if (Date.now() - lastRun.current >= delay) {
          lastRun.current = Date.now();
          return callback(...args);
        }
      }) as T,
    [callback, delay]
  );
}
