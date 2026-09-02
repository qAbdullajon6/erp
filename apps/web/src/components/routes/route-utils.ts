import type { RouteStatus, RouteStopStatus } from '@/lib/api/routes';

export function formatRouteDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

export function formatRouteDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  DRAFT: 'Draft',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/// Tailwind className string for each status pill — border + bg + text.
/// Deliberately does not overlap with the shared StatusBadge (which targets
/// order/dispatch statuses). Route statuses need their own brand-aligned map.
export const ROUTE_STATUS_COLORS: Record<RouteStatus, string> = {
  DRAFT: 'border-border/40 bg-muted/20 text-muted-foreground',
  PLANNED: 'border-primary/30 bg-primary/5 text-primary',
  IN_PROGRESS: 'border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400',
  COMPLETED: 'border-success/30 bg-success/5 text-success',
  CANCELLED: 'border-destructive/30 bg-destructive/5 text-destructive',
};

export const STOP_STATUS_LABELS: Record<RouteStopStatus, string> = {
  PENDING: 'Pending',
  COMPLETED: 'Done',
  SKIPPED: 'Skipped',
};

export const STOP_STATUS_COLORS: Record<RouteStopStatus, string> = {
  PENDING: 'border-border/40 bg-muted/10 text-muted-foreground',
  COMPLETED: 'border-success/30 bg-success/5 text-success',
  SKIPPED: 'border-amber-400/30 bg-amber-400/5 text-amber-600 dark:text-amber-400',
};
