import { useEffect, useState } from 'react';

/** Forces a re-render every `intervalMs` — for components displaying a relative
 * age ("12s ago") derived from a timestamp in a store. The store update alone
 * won't re-render a "time since X" label between store changes; this does. */
export function useTick(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
}
