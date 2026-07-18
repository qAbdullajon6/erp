import { useEffect, useState } from 'react';

/// Holds a value still for a moment before letting it through.
///
/// Search boxes feed a React Query key. Without this, every keystroke is a NEW key,
/// which means a new request: typing "DSP-000041" fires ten of them, nine of which
/// are already stale before they land, and the results flicker as they race each
/// other back. React Query deduplicates identical keys, not a sequence of different
/// ones — so the debounce has to happen before the key is built, not after.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
