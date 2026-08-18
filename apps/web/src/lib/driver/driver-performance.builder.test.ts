import { describe, expect, it } from 'vitest';
import { buildDriverPerformance } from './driver-performance.builder';

describe('buildDriverPerformance', () => {
  it('computes on-time / late percentages and averages', () => {
    const snapshot = buildDriverPerformance({
      trips: [
        {
          id: '1',
          status: 'DELIVERED',
          pickupDateScheduled: '2026-07-29T08:00:00.000Z',
          deliveryDateScheduled: '2026-07-29T12:00:00.000Z',
          pickupDateActual: '2026-07-29T08:10:00.000Z',
          deliveryDateActual: '2026-07-29T11:30:00.000Z',
          statusHistory: [
            { status: 'AT_PICKUP', createdAt: '2026-07-29T08:10:00.000Z' },
            { status: 'IN_TRANSIT', createdAt: '2026-07-29T08:40:00.000Z' },
          ],
        },
        {
          id: '2',
          status: 'DELIVERED',
          pickupDateScheduled: '2026-07-28T08:00:00.000Z',
          deliveryDateScheduled: '2026-07-28T12:00:00.000Z',
          pickupDateActual: '2026-07-28T08:00:00.000Z',
          deliveryDateActual: '2026-07-28T13:00:00.000Z',
          statusHistory: [
            { status: 'AT_PICKUP', createdAt: '2026-07-28T08:00:00.000Z' },
            { status: 'IN_TRANSIT', createdAt: '2026-07-28T08:20:00.000Z' },
          ],
        },
        {
          id: '3',
          status: 'CANCELLED',
          pickupDateScheduled: '2026-07-27T08:00:00.000Z',
          deliveryDateScheduled: '2026-07-27T12:00:00.000Z',
          pickupDateActual: null,
          deliveryDateActual: null,
        },
      ],
    });

    expect(snapshot.trips).toBe(3);
    expect(snapshot.completed).toBe(2);
    expect(snapshot.cancelled).toBe(1);
    expect(snapshot.onTimePct).toBe(50);
    expect(snapshot.latePct).toBe(50);
    expect(snapshot.avgLoadingMinutes).toBe(25);
    expect(snapshot.avgDeliveryMinutes).toBeGreaterThan(0);
  });

  it('returns zeros when there are no trips', () => {
    const snapshot = buildDriverPerformance({ trips: [] });
    expect(snapshot).toEqual({
      trips: 0,
      completed: 0,
      cancelled: 0,
      onTimePct: 0,
      latePct: 0,
      avgLoadingMinutes: null,
      avgDeliveryMinutes: null,
    });
  });
});
