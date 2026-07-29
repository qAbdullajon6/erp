import { describe, expect, it } from 'vitest';
import { buildDispatchAnalytics } from './dispatch-analytics.builder';
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

describe('buildDispatchAnalytics', () => {
  it('computes core KPIs from dispatches and board summary', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const dispatches = [
      dispatch({ id: 'd1', status: 'ASSIGNED', driverId: 'drv-1', vehicleId: 'veh-1' }),
      dispatch({ id: 'd2', status: 'DRAFT' }),
      dispatch({
        id: 'd3',
        status: 'DELIVERED',
        deliveryDateActual: '2026-07-29T10:00:00.000Z',
      }),
    ];
    const board: DispatchBoardSummary = {
      unassignedOrders: [],
      drivers: {
        available: [],
        busy: [
          {
            driver: {
              id: 'drv-1',
              employeeCode: 'D1',
              firstName: 'A',
              lastName: 'B',
              phone: '',
              status: 'ACTIVE',
            },
            currentOrder: {
              id: 'o1',
              orderNumber: 'ORD-1',
              customerName: 'Acme',
              pickupCity: 'Tashkent',
              deliveryCity: 'Samarkand',
              pickupDate: now.toISOString(),
              deliveryDate: now.toISOString(),
              status: 'IN_TRANSIT',
            },
          },
        ],
        onLeave: [],
        inactive: [],
      },
      vehicles: {
        available: [],
        busy: [
          {
            vehicle: {
              id: 'veh-1',
              vehicleCode: 'V1',
              plateNumber: 'ABC-1',
              type: 'TRUCK',
              status: 'IN_USE',
            },
            currentOrder: {
              id: 'o1',
              orderNumber: 'ORD-1',
              customerName: 'Acme',
              pickupCity: 'Tashkent',
              deliveryCity: 'Samarkand',
              pickupDate: now.toISOString(),
              deliveryDate: now.toISOString(),
              status: 'IN_TRANSIT',
            },
          },
        ],
        inUse: [],
        maintenance: [],
        inactive: [],
      },
    };

    const snapshot = buildDispatchAnalytics({
      dispatches,
      board,
      conflictsByDispatchId: {},
      now,
    });

    expect(snapshot.kpis.activeDispatches).toBe(1);
    expect(snapshot.kpis.draftDispatches).toBe(1);
    expect(snapshot.kpis.completedToday).toBe(1);
    expect(snapshot.kpis.activeDrivers).toBe(1);
    expect(snapshot.kpis.activeVehicles).toBe(1);
    expect(snapshot.dispatchesByStatus.some((s) => s.status === 'DRAFT')).toBe(true);
  });

  it('emits deterministic insights for overloaded drivers', () => {
    const dispatches = [
      dispatch({ id: 'd1', status: 'ASSIGNED', driverId: 'drv-1', vehicleId: 'veh-1' }),
      dispatch({ id: 'd2', status: 'IN_TRANSIT', driverId: 'drv-1', vehicleId: 'veh-2' }),
    ];

    const snapshot = buildDispatchAnalytics({
      dispatches,
      board: null,
      conflictsByDispatchId: {},
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(snapshot.insights.some((i) => i.id === 'driver-overloaded')).toBe(true);
    expect(snapshot.driversNeedingAttention.some((d) => d.id === 'drv-1')).toBe(true);
  });
});
