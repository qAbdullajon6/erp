// Frontend tests for route optimization utilities
// Tests the pure helpers that don't require DOM rendering

import { describe, it, expect } from 'vitest';
import type { ApiRouteStop } from '@/lib/api/routes';

// ─── Helpers used in the optimization preview panel ─────────────────────────

function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function buildStopById(
  stops: Array<{ id: string; address: string; city: string }>,
): Map<string, { address: string; city: string }> {
  return new Map(stops.map((s) => [s.id, s]));
}

function isChanged(changedIds: Set<string>, stopId: string): boolean {
  return changedIds.has(stopId);
}

function sortByProposedSequence(
  proposedSequence: Array<{ id: string; sequence: number }>,
): Array<{ id: string; sequence: number }> {
  return [...proposedSequence].sort((a, b) => a.sequence - b.sequence);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('route-optimization frontend helpers', () => {
  // 1 — formatKm handles sub-km values
  it('1: formatKm formats meters for values under 1000', () => {
    expect(formatKm(500)).toBe('500 m');
    expect(formatKm(0)).toBe('0 m');
    expect(formatKm(999)).toBe('999 m');
  });

  // 2 — formatKm handles km values
  it('2: formatKm formats km for values 1000 and above', () => {
    expect(formatKm(1000)).toBe('1.0 km');
    expect(formatKm(1500)).toBe('1.5 km');
    expect(formatKm(10000)).toBe('10.0 km');
    expect(formatKm(250000)).toBe('250.0 km');
  });

  // 3 — buildStopById creates an id-keyed map
  it('3: buildStopById maps stop id to address/city', () => {
    const stops = [
      { id: 'a', address: '1 Main St', city: 'Tashkent' },
      { id: 'b', address: '2 Oak Ave', city: 'Samarkand' },
    ];
    const map = buildStopById(stops);
    expect(map.get('a')).toEqual({ id: 'a', address: '1 Main St', city: 'Tashkent' });
    expect(map.get('b')).toEqual({ id: 'b', address: '2 Oak Ave', city: 'Samarkand' });
    expect(map.get('missing')).toBeUndefined();
  });

  // 4 — isChanged detects changed stop ids
  it('4: isChanged returns true for ids in changedIds set', () => {
    const changed = new Set(['id1', 'id3']);
    expect(isChanged(changed, 'id1')).toBe(true);
    expect(isChanged(changed, 'id2')).toBe(false);
    expect(isChanged(changed, 'id3')).toBe(true);
  });

  // 5 — sortByProposedSequence sorts ascending by sequence
  it('5: sortByProposedSequence produces ascending sequence order', () => {
    const proposed = [
      { id: 'c', sequence: 3 },
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2 },
    ];
    const sorted = sortByProposedSequence(proposed);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(sorted.map((s) => s.sequence)).toEqual([1, 2, 3]);
  });

  // 6 — sortByProposedSequence does not mutate the input array
  it('6: sortByProposedSequence does not mutate input', () => {
    const original = [
      { id: 'b', sequence: 2 },
      { id: 'a', sequence: 1 },
    ];
    const copy = [...original];
    sortByProposedSequence(original);
    expect(original[0]).toEqual(copy[0]);
    expect(original[1]).toEqual(copy[1]);
  });

  // 7 — distanceSaved calculation
  it('7: distanceSaved is non-negative when optimized < current', () => {
    const current = 100_000;
    const optimized = 80_000;
    const saved = Math.max(0, current - optimized);
    expect(saved).toBe(20_000);
    expect(saved).toBeGreaterThanOrEqual(0);
  });

  // 8 — distanceSaved is zero when there is no improvement
  it('8: distanceSaved is 0 when optimized equals current', () => {
    const current = 50_000;
    const optimized = 50_000;
    const saved = Math.max(0, current - optimized);
    expect(saved).toBe(0);
  });

  // 9 — changedStopIds identifies stops that moved
  it('9: changedStopIds contains only stops whose sequence changed', () => {
    const current = [
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2 },
      { id: 'c', sequence: 3 },
    ];
    const proposed = [
      { id: 'a', sequence: 1 }, // unchanged
      { id: 'c', sequence: 2 }, // moved
      { id: 'b', sequence: 3 }, // moved
    ];
    const currentMap = new Map(current.map((s) => [s.id, s.sequence]));
    const changed = proposed
      .filter((p) => currentMap.get(p.id) !== p.sequence)
      .map((p) => p.id);
    expect(changed).toContain('b');
    expect(changed).toContain('c');
    expect(changed).not.toContain('a');
    expect(changed).toHaveLength(2);
  });

  // 10 — empty proposed sequence is safe to sort
  it('10: sortByProposedSequence with empty array returns empty', () => {
    const result = sortByProposedSequence([]);
    expect(result).toEqual([]);
  });
});

// ─── getFixedReason classification ───────────────────────────────────────────
// Local mirror of the function in route-optimization-preview.tsx so it can be
// unit-tested without importing a React component module.

const ACTIVE_DISPATCH_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_STOP', 'ARRIVED_AT_DELIVERY',
]);

function getFixedReason(stop: ApiRouteStop): 'locked' | 'completed' | 'active' | null {
  if (stop.optimizationLocked) return 'locked';
  if (stop.status === 'COMPLETED' || stop.status === 'SKIPPED') return 'completed';
  if (stop.dispatch) {
    if (ACTIVE_DISPATCH_STATUSES.has(stop.dispatch.status)) return 'active';
    if (stop.dispatch.stops.some((ds) => ds.arrivedAt != null)) return 'active';
  }
  return null;
}

function makeStop(overrides: Partial<ApiRouteStop> = {}): ApiRouteStop {
  return {
    id: 'stop-x',
    sequence: 1,
    orderId: null,
    dispatchId: null,
    label: null,
    address: '1 Main',
    city: 'City',
    lat: '41.0',
    lng: '69.0',
    plannedArrival: null,
    plannedDeparture: null,
    distanceFromPrevM: null,
    durationFromPrevSec: null,
    status: 'PENDING',
    optimizationLocked: false,
    notes: null,
    order: null,
    dispatch: null,
    ...overrides,
  };
}

describe('getFixedReason', () => {
  it('11: returns null for a normal pending stop with no dispatch', () => {
    expect(getFixedReason(makeStop())).toBeNull();
  });

  it('12: returns locked when optimizationLocked is true', () => {
    expect(getFixedReason(makeStop({ optimizationLocked: true }))).toBe('locked');
  });

  it('13: locked takes priority over completed status', () => {
    expect(getFixedReason(makeStop({ optimizationLocked: true, status: 'COMPLETED' }))).toBe('locked');
  });

  it('14: returns completed for COMPLETED route-stop status', () => {
    expect(getFixedReason(makeStop({ status: 'COMPLETED' }))).toBe('completed');
  });

  it('15: returns completed for SKIPPED route-stop status', () => {
    expect(getFixedReason(makeStop({ status: 'SKIPPED' }))).toBe('completed');
  });

  it('16: returns active for IN_TRANSIT dispatch', () => {
    const stop = makeStop({
      dispatch: {
        id: 'd1', dispatchNumber: 'DSP-1', status: 'IN_TRANSIT',
        vehicleId: null, driverId: null, failureReason: null,
        failureNotes: null, failedAt: null, stops: [],
      },
    });
    expect(getFixedReason(stop)).toBe('active');
  });

  it('17: returns active for AT_STOP dispatch', () => {
    const stop = makeStop({
      dispatch: {
        id: 'd1', dispatchNumber: 'DSP-1', status: 'AT_STOP',
        vehicleId: null, driverId: null, failureReason: null,
        failureNotes: null, failedAt: null, stops: [],
      },
    });
    expect(getFixedReason(stop)).toBe('active');
  });

  it('18: returns active when any dispatch stop has arrivedAt set', () => {
    const stop = makeStop({
      dispatch: {
        id: 'd1', dispatchNumber: 'DSP-1', status: 'ASSIGNED',
        vehicleId: null, driverId: null, failureReason: null,
        failureNotes: null, failedAt: null,
        stops: [{
          id: 'ds1', stopIndex: 0, stopType: 'PICKUP',
          arrivedAt: '2026-08-22T10:00:00Z', completedAt: null,
          failedAt: null, failureReason: null, failureNotes: null,
        }],
      },
    });
    expect(getFixedReason(stop)).toBe('active');
  });

  it('19: returns null for DELIVERED dispatch (terminal, stop is not active)', () => {
    const stop = makeStop({
      dispatch: {
        id: 'd1', dispatchNumber: 'DSP-1', status: 'DELIVERED',
        vehicleId: null, driverId: null, failureReason: null,
        failureNotes: null, failedAt: null, stops: [],
      },
    });
    // DELIVERED is not in ACTIVE_DISPATCH_STATUSES; no arrivedAt; returns null
    // (the RouteStop.status would be COMPLETED if the dispatch delivered)
    expect(getFixedReason(stop)).toBeNull();
  });
});
