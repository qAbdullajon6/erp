import type { DispatchConflictsResponse } from '@/lib/api/dispatch-conflicts';
import type { CalendarEvent } from './dispatch-calendar-utils';
import type { CalendarKpiFocus } from './dispatch-calendar-filters';

export interface CalendarKpis {
  total: number;
  active: number;
  completed: number;
  delayed: number;
  drivers: number;
  vehicles: number;
  conflicts: number;
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isEventActive(event: CalendarEvent): boolean {
  const { status } = event.dispatch;
  return status !== 'DELIVERED' && status !== 'CANCELLED';
}

export function isEventDelayed(event: CalendarEvent, now = new Date()): boolean {
  return isEventActive(event) && event.end < now;
}

export function isEventCompleted(event: CalendarEvent): boolean {
  return event.dispatch.status === 'DELIVERED';
}

/** @deprecated Schedule-only overlap IDs — prefer engineConflictEventIds for KPI/focus. */
export function getConflictingEventIds(events: CalendarEvent[]): Set<string> {
  const live = events.filter(isEventActive);
  const conflictIds = new Set<string>();

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (!intervalsOverlap(a.start, a.end, b.start, b.end)) continue;

      const driverClash =
        a.dispatch.driverId && a.dispatch.driverId === b.dispatch.driverId;
      const vehicleClash =
        a.dispatch.vehicleId && a.dispatch.vehicleId === b.dispatch.vehicleId;

      if (driverClash || vehicleClash) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }

  return conflictIds;
}

export function engineConflictEventIds(
  events: CalendarEvent[],
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>,
): Set<string> {
  const ids = new Set<string>();
  if (!conflictsByDispatchId) return ids;

  for (const event of events) {
    const summary = conflictsByDispatchId[event.dispatch.id]?.summary;
    if (summary && summary.unresolved > 0) {
      ids.add(event.id);
    }
  }
  return ids;
}

export function applyKpiFocus(
  events: CalendarEvent[],
  focus?: CalendarKpiFocus,
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>,
  now: Date = new Date(),
): CalendarEvent[] {
  if (!focus) return events;
  const conflictIds =
    focus === 'conflicts' ? engineConflictEventIds(events, conflictsByDispatchId) : null;

  return events.filter((event) => {
    switch (focus) {
      case 'active':
        return isEventActive(event);
      case 'delayed':
        return isEventDelayed(event, now);
      case 'completed':
        return isEventCompleted(event);
      case 'conflicts':
        return conflictIds?.has(event.id) ?? false;
      default:
        return true;
    }
  });
}

export function computeCalendarKpis(
  events: CalendarEvent[],
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>,
): CalendarKpis {
  const now = new Date();
  const driverIds = new Set<string>();
  const vehicleIds = new Set<string>();
  let active = 0;
  let completed = 0;
  let delayed = 0;

  for (const event of events) {
    const { dispatch } = event;
    if (dispatch.driverId) driverIds.add(dispatch.driverId);
    if (dispatch.vehicleId) vehicleIds.add(dispatch.vehicleId);

    if (dispatch.status === 'DELIVERED') {
      completed++;
      continue;
    }
    if (dispatch.status === 'CANCELLED') continue;

    active++;
    if (event.end < now) delayed++;
  }

  const engineConflicts = engineConflictEventIds(events, conflictsByDispatchId);

  return {
    total: events.length,
    active,
    completed,
    delayed,
    drivers: driverIds.size,
    vehicles: vehicleIds.size,
    conflicts: engineConflicts.size,
  };
}
