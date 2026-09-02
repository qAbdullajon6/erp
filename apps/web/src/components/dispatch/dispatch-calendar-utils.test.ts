import { describe, expect, it } from 'vitest';
import {
  parseCalendarView,
  shiftAnchor,
  toCalendarEvent,
  toDateParam,
  visibleRange,
} from './dispatch-calendar-utils';
import type { ApiDispatch } from '@/lib/api/dispatches';

function stubDispatch(overrides: Partial<ApiDispatch> = {}): ApiDispatch {
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
    deliveryDateScheduled: '2026-07-30T17:00:00.000Z',
    deliveryDateActual: null,
    routeContext: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('dispatch-calendar-utils', () => {
  it('parses view with week default', () => {
    expect(parseCalendarView('month')).toBe('month');
    expect(parseCalendarView('day')).toBe('day');
    expect(parseCalendarView('nope')).toBe('week');
  });

  it('builds week range Mon–Sun', () => {
    const { start, end } = visibleRange(new Date('2026-07-29T12:00:00'), 'week');
    expect(toDateParam(start)).toBe('2026-07-27');
    expect(toDateParam(end)).toBe('2026-08-02');
  });

  it('shifts month anchors', () => {
    const next = shiftAnchor(new Date('2026-07-15T12:00:00'), 'month', 1);
    expect(toDateParam(next)).toBe('2026-08-15');
  });

  it('maps dispatch to calendar event on pickup day', () => {
    const event = toCalendarEvent(stubDispatch());
    expect(event.dayKey).toBe('2026-07-29');
    expect(event.dispatch.dispatchNumber).toBe('DSP-000001');
  });
});
