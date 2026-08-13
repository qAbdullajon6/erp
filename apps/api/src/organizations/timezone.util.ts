/// The organization timezone is not decorative: report bucketing
/// (report-filters.util.ts) and the AI context's `todayIn()` feed it straight
/// into `Intl.DateTimeFormat`, which throws `RangeError` on an unknown zone.
/// Accepting an arbitrary string here therefore turns a settings typo into a
/// 500 on unrelated screens, so validation asks the same engine that will
/// later consume the value whether it can resolve it.
export function isSupportedTimezone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
