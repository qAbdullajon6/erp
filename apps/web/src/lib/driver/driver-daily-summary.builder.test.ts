import { describe, expect, it } from 'vitest';
import { buildDriverDailySummary } from './driver-daily-summary.builder';

describe('buildDriverDailySummary', () => {
  it('aggregates today trips, expenses, and break minutes', () => {
    const now = new Date(2026, 6, 29, 15, 0, 0);
    const dayIso = (h: number, m = 0) => new Date(2026, 6, 29, h, m, 0).toISOString();

    const summary = buildDriverDailySummary({
      now,
      distanceKm: null,
      trips: [
        {
          id: '1',
          status: 'DELIVERED',
          pickupDateScheduled: dayIso(8),
          deliveryDateScheduled: dayIso(12),
          pickupDateActual: dayIso(8),
          deliveryDateActual: dayIso(11),
        },
        {
          id: '2',
          status: 'ASSIGNED',
          pickupDateScheduled: new Date(2026, 6, 30, 8, 0, 0).toISOString(),
          deliveryDateScheduled: new Date(2026, 6, 30, 12, 0, 0).toISOString(),
          pickupDateActual: null,
          deliveryDateActual: null,
        },
      ],
      expenses: [
        { amount: '40.5', category: 'FUEL', expenseDate: dayIso(10) },
        { amount: 10, category: 'TOLL', expenseDate: dayIso(11) },
      ],
      breaks: [{ startedAt: dayIso(9), endedAt: dayIso(9, 30) }],
    });

    expect(summary.trips).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.distanceKm).toBeNull();
    expect(summary.hours).toBe(3);
    expect(summary.fuelTotal).toBe(40.5);
    expect(summary.expensesTotal).toBe(50.5);
    expect(summary.breakMinutes).toBe(30);
  });
});
