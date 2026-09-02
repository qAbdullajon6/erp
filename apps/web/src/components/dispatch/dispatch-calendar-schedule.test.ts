import { describe, expect, it } from 'vitest';
import {
  canDragSchedule,
  computeRescheduleFromDrag,
  snapMinutes,
} from './dispatch-calendar-schedule';
import type { CalendarEvent } from './dispatch-calendar-utils';
import type { ApiDispatch } from '@/lib/api/dispatches';

function stub(overrides: Partial<ApiDispatch> = {}): ApiDispatch {
  return {
    id: '1',
    organizationId: 'org',
    dispatchNumber: 'DSP-000001',
    orderId: 'o1',
    driverId: 'd1',
    vehicleId: 'v1',
    status: 'ASSIGNED',
    allowedTransitions: [],
    pickupDateScheduled: '2026-07-29T09:00:00.000Z',
    pickupDateActual: null,
    deliveryDateScheduled: '2026-07-29T11:00:00.000Z',
    deliveryDateActual: null,
    routeContext: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function eventFor(dispatch: ApiDispatch): CalendarEvent {
  return {
    id: dispatch.id,
    dispatch,
    start: new Date(dispatch.pickupDateScheduled),
    end: new Date(dispatch.deliveryDateScheduled),
    dayKey: '2026-07-29',
  };
}

describe('dispatch-calendar-schedule', () => {
  it('blocks terminal dispatches from drag', () => {
    expect(canDragSchedule(stub({ status: 'DELIVERED' }), true)).toBe(false);
    expect(canDragSchedule(stub({ status: 'ASSIGNED' }), false)).toBe(false);
    expect(canDragSchedule(stub({ status: 'ASSIGNED' }), true)).toBe(true);
  });

  it('snaps to 30 minutes', () => {
    expect(snapMinutes(44)).toBe(30);
    expect(snapMinutes(46)).toBe(60);
  });

  it('day-only drag keeps clock time', () => {
    // Local-stable construction via explicit local components
    const start = new Date(2026, 6, 29, 9, 0, 0);
    const end = new Date(2026, 6, 29, 11, 0, 0);
    const dispatch = stub({
      pickupDateScheduled: start.toISOString(),
      deliveryDateScheduled: end.toISOString(),
    });
    const event = eventFor(dispatch);
    event.start = start;
    event.end = end;
    const { pickup, delivery } = computeRescheduleFromDrag({
      event,
      targetDay: new Date(2026, 6, 30),
      deltaYPx: 0,
      mode: 'day-only',
    });
    expect(pickup.getDate()).toBe(30);
    expect(pickup.getHours()).toBe(9);
    expect(delivery.getHours()).toBe(11);
  });
});
