/// Shared urgency / ops counters for the Dispatch Board — presentation only.
/// Counts are derived from already-fetched dispatches + board summary. No new APIs.

import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';

export const NON_TERMINAL: ReadonlySet<DispatchStatus> = new Set([
  'DRAFT',
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
]);

export const WAITING_PICKUP: ReadonlySet<DispatchStatus> = new Set([
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
]);

export function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function hoursSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)));
}

export function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

/// A dispatch is scheduled to a day, not to a minute: `deliveryDateScheduled`
/// carries the order's date-only delivery date, so midnight. Comparing it to
/// `Date.now()` marked every delivery due today as overdue from 00:01 — a
/// same-day job was born red. The deadline is the end of the scheduled day.
export function scheduleDeadline(iso: string): number {
  return new Date(iso).getTime() + 24 * 60 * 60 * 1000;
}

export function isDispatchOverdue(d: ApiDispatch): boolean {
  return NON_TERMINAL.has(d.status) && scheduleDeadline(d.deliveryDateScheduled) < Date.now();
}

export function isWaitingPickup(d: ApiDispatch): boolean {
  return WAITING_PICKUP.has(d.status);
}

export function isDeliveredToday(d: ApiDispatch): boolean {
  if (d.status !== 'DELIVERED') return false;
  const when = d.deliveryDateActual || d.updatedAt;
  return isToday(when);
}

export type DeliveryUrgency = {
  label: string;
  tone: string;
  isLate: boolean;
  dueToday: boolean;
  isUrgent: boolean;
};

export function getDeliveryUrgency(deliveryDate: string): DeliveryUrgency {
  const now = new Date();
  // Measured against the end of the scheduled day, not its midnight start —
  // otherwise every job due today reads as hours late from the moment the day
  // begins. Days remaining are still counted from the scheduled day itself.
  const diffHours = (scheduleDeadline(deliveryDate) - now.getTime()) / (1000 * 60 * 60);
  const diffDays = Math.ceil((new Date(deliveryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffHours < 0) {
    const hoursLate = Math.abs(diffHours);
    if (hoursLate < 24) {
      return {
        label: `${Math.max(1, Math.ceil(hoursLate))}h late`,
        tone: 'text-destructive',
        isLate: true,
        dueToday: false,
        isUrgent: true,
      };
    }
    return {
      label: `${Math.ceil(hoursLate / 24)}d late`,
      tone: 'text-destructive',
      isLate: true,
      dueToday: false,
      isUrgent: true,
    };
  }
  if (diffHours < 24) {
    return {
      label: 'Due today',
      tone: 'text-warning',
      isLate: false,
      dueToday: true,
      isUrgent: true,
    };
  }
  if (diffHours < 48) {
    return {
      label: 'Tomorrow',
      tone: 'text-warning',
      isLate: false,
      dueToday: false,
      isUrgent: false,
    };
  }
  if (diffDays <= 3) {
    return {
      label: `${diffDays}d left`,
      tone: 'text-muted-foreground',
      isLate: false,
      dueToday: false,
      isUrgent: false,
    };
  }
  return {
    label: `${diffDays}d`,
    tone: 'text-muted-foreground',
    isLate: false,
    dueToday: false,
    isUrgent: false,
  };
}

/// Drivers currently on more than one live job (board busy list).
export function overloadedDriverIds(board: DispatchBoardSummary | null): Set<string> {
  if (!board) return new Set();
  const counts = new Map<string, number>();
  for (const b of board.drivers.busy) {
    counts.set(b.driver.id, (counts.get(b.driver.id) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}

export function formatElapsed(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export type BoardOpsCounts = {
  overdue: number;
  waitingPickup: number;
  inTransit: number;
  deliveredToday: number;
  driversAvailable: number;
  idleVehicles: number;
  pickupToday: number;
  needsReassignment: number;
  needsAssignment: number;
};

export function computeBoardOpsCounts(
  dispatches: ApiDispatch[],
  board: DispatchBoardSummary | null,
): BoardOpsCounts {
  const overloaded = overloadedDriverIds(board);
  return {
    overdue: dispatches.filter(isDispatchOverdue).length,
    waitingPickup: dispatches.filter(isWaitingPickup).length,
    inTransit: dispatches.filter((d) => d.status === 'IN_TRANSIT').length,
    deliveredToday: dispatches.filter(isDeliveredToday).length,
    driversAvailable: board?.drivers.available.length ?? 0,
    idleVehicles: board?.vehicles.available.length ?? 0,
    pickupToday: dispatches.filter(
      (d) => NON_TERMINAL.has(d.status) && isToday(d.pickupDateScheduled),
    ).length,
    needsReassignment: dispatches.filter(
      (d) => NON_TERMINAL.has(d.status) && overloaded.has(d.driverId),
    ).length,
    needsAssignment: board?.unassignedOrders.length ?? 0,
  };
}
