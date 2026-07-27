import type { MyDispatch } from '@/services/api/endpoints/driver';

export type UrgencyLevel = 'overdue' | 'due-soon' | 'normal';

export interface Urgency {
  level: UrgencyLevel;
  label: string;
}

const DUE_SOON_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

const OPEN_STATUSES = new Set<MyDispatch['status']>(['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT']);

function formatRelative(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * There is no priority field anywhere on Order or Dispatch (verified against
 * apps/api/prisma/schema.prisma — the only "priority" in the whole schema
 * belongs to the internal notification delivery queue, an unrelated table).
 * Rather than fabricate one, this derives real urgency from the one thing that
 * IS real: how the delivery deadline the dispatcher actually scheduled compares
 * to right now, for a dispatch that hasn't finished yet.
 */
export function getUrgency(dispatch: MyDispatch): Urgency | null {
  if (!OPEN_STATUSES.has(dispatch.status)) return null;

  const deliveryDue = new Date(dispatch.deliveryDateScheduled).getTime();
  const now = Date.now();
  const diff = deliveryDue - now;

  if (diff < 0) {
    return { level: 'overdue', label: `Overdue by ${formatRelative(diff)}` };
  }
  if (diff <= DUE_SOON_WINDOW_MS) {
    return { level: 'due-soon', label: `Due in ${formatRelative(diff)}` };
  }
  return null;
}
