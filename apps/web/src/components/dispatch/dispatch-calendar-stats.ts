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

function countScheduleConflicts(events: CalendarEvent[]): number {
  const conflictIds = getConflictingEventIds(events);
  const pairs = new Set<string>();
  let conflicts = 0;
  const live = events.filter((e) => conflictIds.has(e.id));

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (!intervalsOverlap(a.start, a.end, b.start, b.end)) continue;

      if (a.dispatch.driverId && a.dispatch.driverId === b.dispatch.driverId) {
        const key = `d:${[a.id, b.id].sort().join(':')}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          conflicts++;
        }
      }
      if (a.dispatch.vehicleId && a.dispatch.vehicleId === b.dispatch.vehicleId) {
        const key = `v:${[a.id, b.id].sort().join(':')}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          conflicts++;
        }
      }
    }
  }

  return conflicts;
}

export function applyKpiFocus(
  events: CalendarEvent[],
  focus?: CalendarKpiFocus,
): CalendarEvent[] {
  if (!focus) return events;
  const now = new Date();
  const conflictIds = focus === 'conflicts' ? getConflictingEventIds(events) : null;

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

export function computeCalendarKpis(events: CalendarEvent[]): CalendarKpis {
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

  return {
    total: events.length,
    active,
    completed,
    delayed,
    drivers: driverIds.size,
    vehicles: vehicleIds.size,
    conflicts: countScheduleConflicts(events),
  };
}
