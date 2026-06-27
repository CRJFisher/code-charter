import { useEffect, useState } from 'react';

export function use_debounce<T>(value: T, delay: number): T {
  const [debounced_value, set_debounced_value] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      set_debounced_value(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debounced_value;
}
