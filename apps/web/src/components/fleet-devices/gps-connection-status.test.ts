import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFLINE_THRESHOLD_MS,
  deriveGpsConnectionStatus,
} from './gps-connection-status';
import type { TelematicsDevice } from '@/lib/api/telematics-devices';
import type { TrackingVehicle } from '@/lib/api/tracking';

function device(partial: Partial<TelematicsDevice> = {}): TelematicsDevice {
  return {
    id: 'd1',
    organizationId: 'o1',
    name: 'Unit',
    provider: 'TRACCAR',
    externalId: '862531043215285',
    vehicleId: 'v1',
    active: true,
    lastSeenAt: null,
    hasIngestSecret: true,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function tracking(partial: Partial<TrackingVehicle> = {}): TrackingVehicle {
  return {
    vehicleId: 'v1',
    vehicleCode: 'VEH-0008',
    plateNumber: '40Z135ZZ',
    driverId: null,
    driverName: null,
    dispatchId: null,
    tripId: null,
    sessionId: null,
    latitude: null,
    longitude: null,
    speedKph: null,
    heading: null,
    ignitionOn: null,
    odometerKm: null,
    fuelLevelPct: null,
    movementState: 'UNKNOWN',
    isStale: true,
    lastRecordedAt: null,
    lastReceivedAt: null,
    lastHeartbeatAt: null,
    ...partial,
  };
}

describe('deriveGpsConnectionStatus', () => {
  it('does not treat a bare device row as connected', () => {
    const result = deriveGpsConnectionStatus({ device: device() });
    expect(result.status).toBe('WAITING_FOR_CONNECTION');
    expect(result.isSuccessfullyConnected).toBe(false);
  });

  it('marks recent lastSeenAt as device online without inventing coordinates', () => {
    const now = new Date('2026-08-08T12:00:00.000Z').getTime();
    const result = deriveGpsConnectionStatus({
      device: device({ lastSeenAt: '2026-08-08T11:59:00.000Z' }),
      now,
      offlineThresholdMs: DEFAULT_OFFLINE_THRESHOLD_MS,
    });
    expect(result.status).toBe('DEVICE_ONLINE');
    expect(result.isSuccessfullyConnected).toBe(true);
    expect(result.latitude).toBeNull();
  });

  it('marks old lastSeenAt as stale', () => {
    const now = new Date('2026-08-08T12:00:00.000Z').getTime();
    const result = deriveGpsConnectionStatus({
      device: device({ lastSeenAt: '2026-08-08T11:00:00.000Z' }),
      now,
    });
    expect(result.status).toBe('STALE');
    expect(result.isSuccessfullyConnected).toBe(false);
  });

  it('prefers fresh tracking position when available', () => {
    const result = deriveGpsConnectionStatus({
      device: device({ lastSeenAt: '2026-08-08T11:59:00.000Z' }),
      tracking: tracking({
        latitude: 40.39666,
        longitude: 71.29186,
        isStale: false,
        lastRecordedAt: '2026-08-08T11:59:30.000Z',
        lastReceivedAt: '2026-08-08T11:59:30.000Z',
        movementState: 'MOVING',
      }),
    });
    expect(result.status).toBe('POSITION_RECEIVED');
    expect(result.hasFreshPosition).toBe(true);
    expect(result.isSuccessfullyConnected).toBe(true);
  });

  it('does not claim connected when tracking position is stale and device is quiet', () => {
    const now = new Date('2026-08-08T12:00:00.000Z').getTime();
    const result = deriveGpsConnectionStatus({
      device: device({ lastSeenAt: '2026-08-08T10:00:00.000Z' }),
      tracking: tracking({
        latitude: 40.1,
        longitude: 71.1,
        isStale: true,
        lastRecordedAt: '2026-08-08T10:00:00.000Z',
      }),
      now,
    });
    expect(result.status).toBe('STALE');
    expect(result.isSuccessfullyConnected).toBe(false);
  });

  it('keeps device online when lastSeenAt is fresh even if map fix is still stale', () => {
    const now = new Date('2026-08-08T12:00:00.000Z').getTime();
    const result = deriveGpsConnectionStatus({
      device: device({ lastSeenAt: '2026-08-08T11:59:00.000Z' }),
      tracking: tracking({
        latitude: 40.1,
        longitude: 71.1,
        isStale: true,
        lastRecordedAt: '2026-08-08T10:00:00.000Z',
      }),
      now,
    });
    expect(result.status).toBe('DEVICE_ONLINE');
    expect(result.isSuccessfullyConnected).toBe(true);
  });

  it('surfaces inactive and archived honestly', () => {
    expect(
      deriveGpsConnectionStatus({ device: device({ active: false }) }).status,
    ).toBe('INACTIVE');
    expect(
      deriveGpsConnectionStatus({
        device: device({ archivedAt: '2026-08-01T00:00:00.000Z' }),
      }).status,
    ).toBe('ARCHIVED');
  });

  it('does not let a tracking fetch error hide recent device telemetry', () => {
    const now = new Date('2026-08-08T12:00:00.000Z').getTime();
    const result = deriveGpsConnectionStatus({
      device: device({ lastSeenAt: '2026-08-08T11:59:00.000Z' }),
      trackingError: true,
      now,
    });
    expect(result.status).toBe('DEVICE_ONLINE');
    expect(result.isSuccessfullyConnected).toBe(true);
  });

  it('surfaces tracking errors only when there is no telemetry evidence', () => {
    expect(
      deriveGpsConnectionStatus({
        device: device({ lastSeenAt: null }),
        trackingError: true,
      }).status,
    ).toBe('ERROR');
  });
});
