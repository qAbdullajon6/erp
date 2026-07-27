/** `2026-07-28T09:00:00.000Z` -> `Jul 28, 9:00 AM` in the device's own locale/timezone. */
export function formatScheduled(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDateOnly(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  );
}
