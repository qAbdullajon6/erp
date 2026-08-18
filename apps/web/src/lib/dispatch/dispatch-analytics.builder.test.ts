import { describe, expect, it } from 'vitest';
import { buildDispatchAnalyticsInsights } from './dispatch-analytics.builder';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';

function dispatch(partial: Partial<ApiDispatch> & Pick<ApiDispatch, 'id' | 'status'>): ApiDispatch {
  return {
    dispatchNumber: `DSP-${partial.id}`,
    organizationId: 'org-1',
    orderId: 'order-1',
    driverId: null,
    vehicleId: null,
    pickupDateScheduled: new Date().toISOString(),
    deliveryDateScheduled: new Date().toISOString(),
    pickupDateActual: null,
    deliveryDateActual: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } as ApiDispatch;
}

const EMPTY_BOARD: DispatchBoardSummary = {
  unassignedOrders: [],
  drivers: { available: [], busy: [], onLeave: [], inactive: [] },
  vehicles: { available: [], busy: [], inUse: [], maintenance: [], inactive: [] },
};

describe('buildDispatchAnalyticsInsights', () => {
  it('flags an overloaded driver and emits a matching insight', () => {
    const dispatches = [
      dispatch({ id: 'd1', status: 'ASSIGNED', driverId: 'drv-1', vehicleId: 'veh-1' }),
      dispatch({ id: 'd2', status: 'IN_TRANSIT', driverId: 'drv-1', vehicleId: 'veh-2' }),
    ];

    const snapshot = buildDispatchAnalyticsInsights({
      activeDispatches: dispatches,
      board: EMPTY_BOARD,
      conflictsByDispatchId: {},
      topDelayedRoutes: [],
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(snapshot.insights.some((i) => i.id === 'driver-overloaded')).toBe(true);
    expect(snapshot.driversNeedingAttention.some((d) => d.id === 'drv-1')).toBe(true);
  });

  it('summarizes active conflicts from the conflicts-by-dispatch map', () => {
    const dispatches = [dispatch({ id: 'd1', status: 'ASSIGNED', driverId: 'drv-1', vehicleId: 'veh-1' })];

    const snapshot = buildDispatchAnalyticsInsights({
      activeDispatches: dispatches,
      board: EMPTY_BOARD,
      conflictsByDispatchId: {
        d1: {
          dispatchId: 'd1',
          checkedAt: new Date().toISOString(),
          summary: { total: 1, critical: 1, high: 0, medium: 0, low: 0, unresolved: 1 },
          items: [
            {
              id: 'c1',
              type: 'vehicle.maintenance',
              category: 'vehicle',
              severity: 'critical',
              message: 'Vehicle in maintenance',
              description: '',
              recommendation: '',
              recommendations: [],
              autoResolvable: false,
              ignored: false,
              resolved: false,
              detectedAt: new Date().toISOString(),
            },
          ],
        },
      },
      topDelayedRoutes: [],
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(snapshot.conflictSummary.total).toBe(1);
    expect(snapshot.conflictSummary.critical).toBe(1);
    expect(snapshot.insights.some((i) => i.id === 'conflict-attention')).toBe(true);
  });

  it('raises a route-congestion insight from backend-computed delayed routes, without re-deriving the delay predicate', () => {
    const snapshot = buildDispatchAnalyticsInsights({
      activeDispatches: [],
      board: EMPTY_BOARD,
      conflictsByDispatchId: {},
      topDelayedRoutes: [{ route: 'Tashkent → Samarkand', count: 3 }],
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(snapshot.insights.some((i) => i.id === 'route-congestion')).toBe(true);
  });
});
