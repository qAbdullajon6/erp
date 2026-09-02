import { describe, it, expect } from 'vitest';
import {
  deriveStopExecutionState,
  computeRouteProgress,
  findCurrentStop,
  findNextStop,
} from './route-execution-state';
import type { ApiRouteStop } from '@/lib/api/routes';

function makeStop(
  id: string,
  sequence: number,
  dispatchStatus?: string,
): ApiRouteStop {
  return {
    id,
    sequence,
    orderId: null,
    dispatchId: dispatchStatus ? `d-${id}` : null,
    label: null,
    address: `${id} St`,
    city: 'City',
    lat: null,
    lng: null,
    plannedArrival: null,
    plannedDeparture: null,
    distanceFromPrevM: null,
    durationFromPrevSec: null,
    status: 'PENDING',
    optimizationLocked: false,
    notes: null,
    order: null,
    dispatch: dispatchStatus
      ? {
          id: `d-${id}`,
          dispatchNumber: `DSP-${id}`,
          status: dispatchStatus,
          vehicleId: null,
          driverId: null,
          failureReason: null,
          failureNotes: null,
          failedAt: null,
          stops: [],
        }
      : null,
  };
}

describe('deriveStopExecutionState', () => {
  it('returns null for stops without a dispatch', () => {
    expect(deriveStopExecutionState(null)).toBeNull();
  });

  it('maps DELIVERED → COMPLETED', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'DELIVERED').dispatch)).toBe('COMPLETED');
  });

  it('maps DELIVERY_FAILED → FAILED', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'DELIVERY_FAILED').dispatch)).toBe('FAILED');
  });

  it('maps CANCELLED → CANCELLED', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'CANCELLED').dispatch)).toBe('CANCELLED');
  });

  it('maps DRAFT → UPCOMING', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'DRAFT').dispatch)).toBe('UPCOMING');
  });

  it('maps ASSIGNED → UPCOMING', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'ASSIGNED').dispatch)).toBe('UPCOMING');
  });

  it('maps IN_TRANSIT → EN_ROUTE', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'IN_TRANSIT').dispatch)).toBe('EN_ROUTE');
  });

  it('maps EN_ROUTE_TO_PICKUP → EN_ROUTE', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'EN_ROUTE_TO_PICKUP').dispatch)).toBe('EN_ROUTE');
  });

  it('maps AT_STOP → AT_STOP', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'AT_STOP').dispatch)).toBe('AT_STOP');
  });

  it('maps ARRIVED_AT_DELIVERY → AT_STOP', () => {
    expect(deriveStopExecutionState(makeStop('1', 1, 'ARRIVED_AT_DELIVERY').dispatch)).toBe('AT_STOP');
  });
});

describe('computeRouteProgress', () => {
  it('returns zeros for an empty route', () => {
    const p = computeRouteProgress([]);
    expect(p).toEqual({ total: 0, completed: 0, failed: 0, active: 0, upcoming: 0, percentage: 0 });
  });

  it('counts correctly across states', () => {
    const stops = [
      makeStop('a', 1, 'DELIVERED'),       // COMPLETED
      makeStop('b', 2, 'DELIVERY_FAILED'),  // FAILED
      makeStop('c', 3, 'IN_TRANSIT'),       // EN_ROUTE (active)
      makeStop('d', 4, 'ASSIGNED'),         // UPCOMING
      makeStop('e', 5),                     // no dispatch → upcoming
    ];
    const p = computeRouteProgress(stops);
    expect(p.total).toBe(5);
    expect(p.completed).toBe(1);
    expect(p.failed).toBe(1);
    expect(p.active).toBe(1);
    expect(p.upcoming).toBe(2);
    expect(p.percentage).toBe(20); // 1/5 = 20%
  });

  it('counts CANCELLED dispatches as failed', () => {
    const stops = [
      makeStop('a', 1, 'CANCELLED'),
      makeStop('b', 2, 'DELIVERED'),
    ];
    const p = computeRouteProgress(stops);
    expect(p.failed).toBe(1);
    expect(p.completed).toBe(1);
    expect(p.percentage).toBe(50);
  });
});

describe('findCurrentStop', () => {
  it('returns null when no stop is active', () => {
    const stops = [makeStop('a', 1, 'ASSIGNED'), makeStop('b', 2, 'DELIVERED')];
    expect(findCurrentStop(stops)).toBeNull();
  });

  it('returns the first EN_ROUTE stop by sequence', () => {
    const stops = [
      makeStop('a', 2, 'IN_TRANSIT'),
      makeStop('b', 1, 'IN_TRANSIT'),
    ];
    expect(findCurrentStop(stops)?.id).toBe('b');
  });

  it('prefers AT_STOP over EN_ROUTE when it appears earlier in sequence', () => {
    const stops = [
      makeStop('a', 1, 'AT_STOP'),
      makeStop('b', 2, 'IN_TRANSIT'),
    ];
    expect(findCurrentStop(stops)?.id).toBe('a');
  });
});

describe('findNextStop', () => {
  it('returns first upcoming stop when no current stop', () => {
    const stops = [makeStop('a', 1, 'DELIVERED'), makeStop('b', 2, 'ASSIGNED')];
    const next = findNextStop(stops, null);
    expect(next?.id).toBe('b');
  });

  it('returns first upcoming stop after current', () => {
    const stops = [
      makeStop('a', 1, 'IN_TRANSIT'),
      makeStop('b', 2, 'ASSIGNED'),
      makeStop('c', 3, 'ASSIGNED'),
    ];
    const current = findCurrentStop(stops)!;
    const next = findNextStop(stops, current);
    expect(next?.id).toBe('b');
  });

  it('returns null when no more upcoming stops after current', () => {
    const stops = [makeStop('a', 1, 'IN_TRANSIT'), makeStop('b', 2, 'DELIVERED')];
    const current = findCurrentStop(stops)!;
    expect(findNextStop(stops, current)).toBeNull();
  });

  it('includes stops without a dispatch as upcoming', () => {
    const stops = [makeStop('a', 1, 'IN_TRANSIT'), makeStop('b', 2)];
    const current = findCurrentStop(stops)!;
    expect(findNextStop(stops, current)?.id).toBe('b');
  });
});
