import type { ApiRouteStop } from '@/lib/api/routes';

export type StopExecutionState =
  | 'UPCOMING'
  | 'EN_ROUTE'
  | 'AT_STOP'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface RouteProgress {
  total: number;
  completed: number;
  failed: number;
  active: number;
  upcoming: number;
  percentage: number;
}

export function deriveStopExecutionState(
  dispatch: ApiRouteStop['dispatch'],
): StopExecutionState | null {
  if (!dispatch) return null;

  switch (dispatch.status) {
    case 'DELIVERED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'DELIVERY_FAILED':
      return 'FAILED';
    case 'DRAFT':
    case 'ASSIGNED':
      return 'UPCOMING';
    case 'EN_ROUTE_TO_PICKUP':
    case 'AT_PICKUP':
    case 'IN_TRANSIT':
      return 'EN_ROUTE';
    case 'AT_STOP':
    case 'ARRIVED_AT_DELIVERY':
      return 'AT_STOP';
    default:
      return 'UPCOMING';
  }
}

export function computeRouteProgress(stops: ApiRouteStop[]): RouteProgress {
  const total = stops.length;
  let completed = 0;
  let failed = 0;
  let active = 0;

  for (const stop of stops) {
    const state = deriveStopExecutionState(stop.dispatch);
    if (state === 'COMPLETED') completed++;
    else if (state === 'FAILED' || state === 'CANCELLED') failed++;
    else if (state === 'EN_ROUTE' || state === 'AT_STOP') active++;
  }

  const upcoming = total - completed - failed - active;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, failed, active, upcoming, percentage };
}

export function findCurrentStop(stops: ApiRouteStop[]): ApiRouteStop | null {
  return (
    [...stops]
      .sort((a, b) => a.sequence - b.sequence)
      .find((s) => {
        const state = deriveStopExecutionState(s.dispatch);
        return state === 'EN_ROUTE' || state === 'AT_STOP';
      }) ?? null
  );
}

export function findNextStop(
  stops: ApiRouteStop[],
  currentStop: ApiRouteStop | null,
): ApiRouteStop | null {
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  const isPending = (s: ApiRouteStop) => {
    const state = deriveStopExecutionState(s.dispatch);
    return state === 'UPCOMING' || state === null;
  };

  if (currentStop) {
    const idx = sorted.findIndex((s) => s.id === currentStop.id);
    if (idx === -1) return null;
    return sorted.slice(idx + 1).find(isPending) ?? null;
  }

  return sorted.find(isPending) ?? null;
}
