import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from './dispatch-calendar-utils';
import {
  applyKpiFocus,
  getConflictingEventIds,
  isEventDelayed,
} from './dispatch-calendar-stats';

function event(
  id: string,
  status: CalendarEvent['dispatch']['status'],
  start: Date,
  end: Date,
  driverId = 'd1',
  vehicleId = 'v1',
): CalendarEvent {
  return {
    id,
    dayKey: '2026-07-29',
    start,
    end,
    dispatch: {
      id,
      organizationId: 'org',
      dispatchNumber: id,
      orderId: 'o1',
      driverId,
      vehicleId,
      status,
      allowedTransitions: [],
      pickupDateScheduled: start.toISOString(),
      pickupDateActual: null,
      deliveryDateScheduled: end.toISOString(),
      deliveryDateActual: null,
      createdAt: start.toISOString(),
      updatedAt: start.toISOString(),
    },
  };
}

describe('dispatch-calendar-stats', () => {
  it('filters delayed dispatches', () => {
    const past = event(
      'a',
      'IN_TRANSIT',
      new Date('2026-07-29T08:00:00'),
      new Date('2026-07-29T09:00:00'),
    );
    const future = event(
      'b',
      'ASSIGNED',
      new Date('2026-07-29T18:00:00'),
      new Date('2026-07-29T19:00:00'),
    );
    expect(isEventDelayed(past, new Date('2026-07-29T12:00:00'))).toBe(true);
    expect(applyKpiFocus([past, future], 'delayed')).toEqual([past]);
  });

  it('marks overlapping driver assignments as conflicts', () => {
    const a = event(
      'a',
      'ASSIGNED',
      new Date('2026-07-29T10:00:00'),
      new Date('2026-07-29T11:00:00'),
      'same-driver',
      'v1',
    );
    const b = event(
      'b',
      'ASSIGNED',
      new Date('2026-07-29T10:30:00'),
      new Date('2026-07-29T11:30:00'),
      'same-driver',
      'v2',
    );
    const ids = getConflictingEventIds([a, b]);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(applyKpiFocus([a, b], 'conflicts')).toHaveLength(2);
  });
});
