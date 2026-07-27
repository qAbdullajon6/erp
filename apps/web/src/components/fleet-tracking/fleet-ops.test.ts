import { describe, expect, it } from 'vitest';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { TrackingHistoryPoint, TrackingVehicle } from '@/lib/api/tracking';
import {
  buildHistoryTimeline,
  buildFleetDispatchIndex,
  filterFleetVehicles,
} from './fleet-ops';

function vehicle(overrides: Partial<TrackingVehicle> = {}): TrackingVehicle {
  return {
    vehicleId: 'v1',
    plateNumber: 'ABC-123',
    vehicleCode: 'TRK-01',
    movementState: 'MOVING',
    latitude: 41.3,
    longitude: 69.2,
    isStale: false,
    ...overrides,
  } as TrackingVehicle;
}

function dispatch(overrides: Partial<ApiDispatch> = {}): ApiDispatch {
  return {
    id: 'd1',
    dispatchNumber: 'DSP-100',
    status: 'IN_TRANSIT',
    vehicleId: 'v1',
    vehicle: { id: 'v1', plateNumber: 'ABC-123' },
    order: {
      id: 'o1',
      orderNumber: 'ORD-500',
      customer: {
        id: 'c1',
        companyName: 'Acme Logistics',
        contactName: 'Jane Doe',
      },
      pickupCity: 'Tashkent',
      deliveryCity: 'Samarkand',
    },
    driver: { id: 'dr1', firstName: 'John', lastName: 'Smith' },
    ...overrides,
  } as ApiDispatch;
}

describe('filterFleetVehicles', () => {
  const dispatchIndex = buildFleetDispatchIndex([dispatch()]);

  it('matches customer name in search', () => {
    const vehicles = [vehicle()];
    const result = filterFleetVehicles(vehicles, 'all', 'acme', dispatchIndex);
    expect(result).toHaveLength(1);
  });

  it('matches registration plate in search', () => {
    const vehicles = [vehicle({ plateNumber: 'REG-999' })];
    const result = filterFleetVehicles(vehicles, 'all', 'reg-999', dispatchIndex);
    expect(result).toHaveLength(1);
  });

  it('filters has_driver when driver is assigned', () => {
    const withDriver = vehicle({ driverId: 'dr1', driverName: 'John Smith' });
    const withoutDriver = vehicle({ vehicleId: 'v2', driverId: null, driverName: null });
    const result = filterFleetVehicles(
      [withDriver, withoutDriver],
      'has_driver',
      '',
      dispatchIndex,
    );
    expect(result.map((v) => v.vehicleId)).toEqual(['v1']);
  });

  it('filters has_alerts by alert vehicle membership', () => {
    const alertIds = new Set(['v1']);
    const vehicles = [
      vehicle(),
      vehicle({ vehicleId: 'v2', plateNumber: 'XYZ-000' }),
    ];
    const result = filterFleetVehicles(
      vehicles,
      'has_alerts',
      '',
      dispatchIndex,
      alertIds,
    );
    expect(result.map((v) => v.vehicleId)).toEqual(['v1']);
  });
});

describe('trackingAvailability', () => {
  it('labels fresh GPS as Tracking', async () => {
    const { trackingAvailability } = await import('./fleet-ops');
    expect(
      trackingAvailability(
        vehicle({
          sessionId: 's1',
          hasActiveDispatch: true,
          isStale: false,
          movementState: 'MOVING',
        }),
      ),
    ).toBe('tracking');
  });

  it('labels session without coordinates as Waiting for GPS', async () => {
    const { trackingAvailability } = await import('./fleet-ops');
    expect(
      trackingAvailability(
        vehicle({
          sessionId: 's1',
          hasActiveDispatch: true,
          latitude: null,
          longitude: null,
          isStale: false,
          movementState: 'UNKNOWN',
        }),
      ),
    ).toBe('waiting_for_gps');
  });

  it('labels stale session with coords as GPS Lost', async () => {
    const { trackingAvailability } = await import('./fleet-ops');
    expect(
      trackingAvailability(
        vehicle({
          sessionId: 's1',
          hasActiveDispatch: true,
          isStale: true,
          movementState: 'OFFLINE',
        }),
      ),
    ).toBe('gps_lost');
  });

  it('labels unassigned idle vehicle as No Active Dispatch', async () => {
    const { trackingAvailability } = await import('./fleet-ops');
    expect(
      trackingAvailability(
        vehicle({
          sessionId: null,
          hasActiveDispatch: false,
          latitude: null,
          longitude: null,
        }),
      ),
    ).toBe('no_active_dispatch');
  });
});

describe('buildHistoryTimeline', () => {
  it('merges consecutive points with the same movement state', () => {
    const points: TrackingHistoryPoint[] = [
      {
        at: '2026-07-26T10:00:00.000Z',
        lat: 1,
        lng: 2,
        speedKph: 30,
        heading: 90,
        tripId: null,
        movementState: 'MOVING',
      },
      {
        at: '2026-07-26T10:05:00.000Z',
        lat: 1.1,
        lng: 2.1,
        speedKph: 35,
        heading: 90,
        tripId: null,
        movementState: 'MOVING',
      },
      {
        at: '2026-07-26T10:10:00.000Z',
        lat: 1.2,
        lng: 2.2,
        speedKph: 0,
        heading: null,
        tripId: null,
        movementState: 'STOPPED',
      },
    ];

    const events = buildHistoryTimeline(points);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('moving');
    expect(events[0].pointCount).toBe(2);
    expect(events[0].durationSec).toBe(300);
    expect(events[1].kind).toBe('stopped');
    expect(events[1].pointCount).toBe(1);
  });

  it('returns empty array for no points', () => {
    expect(buildHistoryTimeline([])).toEqual([]);
  });
});
