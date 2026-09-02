import type { ApiRouteStop } from '@/lib/api/routes';

export function countStopsMissingCoordinates(stops: ApiRouteStop[]): number {
  return stops.filter((s) => s.lat == null || s.lng == null).length;
}

export function formatETA(plannedArrival: string | null | undefined): string {
  if (!plannedArrival) return '—';
  const d = new Date(plannedArrival);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
