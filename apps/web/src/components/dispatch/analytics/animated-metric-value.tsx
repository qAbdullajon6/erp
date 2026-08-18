'use client';

import { useEffect, useRef, useState } from 'react';

export function AnimatedMetricValue({
  value,
  formatter = (n) => n.toLocaleString(),
  durationMs = 700,
}: {
  value: number;
  formatter?: (value: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);

    const from = displayRef.current;
    const to = value;
    if (from === to) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplay(to);
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, durationMs]);

  return <span className="tabular-nums">{formatter(Math.round(display))}</span>;
}
