import { cn } from '@/lib/utils';
import type { RouteStatus } from '@/lib/api/routes';
import { ROUTE_STATUS_COLORS, ROUTE_STATUS_LABELS } from './route-utils';

export function RouteStatusBadge({
  status,
  size = 'md',
}: {
  status: RouteStatus;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border font-semibold uppercase tracking-wide',
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
        ROUTE_STATUS_COLORS[status],
      )}
    >
      {ROUTE_STATUS_LABELS[status]}
    </span>
  );
}
