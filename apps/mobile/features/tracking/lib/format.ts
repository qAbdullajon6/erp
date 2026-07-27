/** Relative age for display ("12s ago", "3m ago") — every value this formats
 * comes from a real recorded timestamp (store/tracking-store.ts); there is no
 * synthetic "just now" default when nothing has happened yet, callers pass
 * `null` and get "—" instead. */
export function formatAge(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
