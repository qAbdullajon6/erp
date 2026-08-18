export interface BreakInterval {
  startedAt: string;
  endedAt: string | null;
}

/** Sum closed (+ optional open-through-now) break durations in whole minutes. */
export function sumBreakMinutes(
  breaks: BreakInterval[],
  now: Date = new Date(),
  includeOpen = true,
): number {
  let totalMs = 0;
  for (const b of breaks) {
    const start = new Date(b.startedAt).getTime();
    if (!Number.isFinite(start)) continue;
    const endRaw = b.endedAt ? new Date(b.endedAt).getTime() : includeOpen ? now.getTime() : NaN;
    if (!Number.isFinite(endRaw) || endRaw <= start) continue;
    totalMs += endRaw - start;
  }
  return Math.round(totalMs / 60_000);
}
