import type { TelematicsDevice } from '@/lib/api/telematics-devices';
import type { TrackingVehicle } from '@/lib/api/tracking';

/// Matches `TelematicsSettings.offlineThresholdSec` default (600s).
/// Used only when the tracking API has not already computed `isStale`.
export const DEFAULT_OFFLINE_THRESHOLD_MS = 600_000;

/// Product-facing connection states for GPS onboarding verification.
/// Derived from real telemetry fields — never from "device row exists".
export type GpsConnectionStatus =
  | 'WAITING_FOR_CONNECTION'
  | 'DEVICE_ONLINE'
  | 'POSITION_RECEIVED'
  | 'STALE'
  | 'INACTIVE'
  | 'ARCHIVED'
  | 'ERROR';

export type GpsConnectionInput = {
  device: Pick<
    TelematicsDevice,
    'active' | 'archivedAt' | 'lastSeenAt' | 'vehicleId'
  >;
  /// Live vehicle snapshot when the device is attached. Prefer backend `isStale`.
  tracking?: Pick<
    TrackingVehicle,
    | 'latitude'
    | 'longitude'
    | 'isStale'
    | 'lastReceivedAt'
    | 'lastRecordedAt'
    | 'movementState'
  > | null;
  trackingError?: boolean;
  now?: number;
  offlineThresholdMs?: number;
};

export type GpsConnectionResult = {
  status: GpsConnectionStatus;
  lastSeenAt: string | null;
  lastPositionAt: string | null;
  latitude: number | null;
  longitude: number | null;
  hasFreshPosition: boolean;
  isSuccessfullyConnected: boolean;
};

function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return now - t;
}

export function deriveGpsConnectionStatus(
  input: GpsConnectionInput,
): GpsConnectionResult {
  const now = input.now ?? Date.now();
  const threshold = input.offlineThresholdMs ?? DEFAULT_OFFLINE_THRESHOLD_MS;
  const { device, tracking } = input;

  const lastSeenAt = device.lastSeenAt;
  const lastPositionAt =
    tracking?.lastRecordedAt ?? tracking?.lastReceivedAt ?? null;
  const latitude = tracking?.latitude ?? null;
  const longitude = tracking?.longitude ?? null;
  const hasCoords =
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const base = {
    lastSeenAt,
    lastPositionAt,
    latitude,
    longitude,
  };

  if (device.archivedAt) {
    return {
      ...base,
      status: 'ARCHIVED',
      hasFreshPosition: false,
      isSuccessfullyConnected: false,
    };
  }

  if (!device.active) {
    return {
      ...base,
      status: 'INACTIVE',
      hasFreshPosition: false,
      isSuccessfullyConnected: false,
    };
  }

  /// Prefer live position / device telemetry over a tracking fetch failure.
  /// A failed map lookup must not hide a real recent `lastSeenAt`.
  if (hasCoords && tracking && !tracking.isStale) {
    return {
      ...base,
      status: 'POSITION_RECEIVED',
      hasFreshPosition: true,
      isSuccessfullyConnected: true,
    };
  }

  const seenAge = ageMs(lastSeenAt, now);
  if (seenAge != null && seenAge <= threshold) {
    return {
      ...base,
      status: 'DEVICE_ONLINE',
      hasFreshPosition: false,
      /// Device has reported recently; a fresh map fix may still be catching up.
      isSuccessfullyConnected: true,
    };
  }

  if (hasCoords || (seenAge != null && seenAge > threshold)) {
    return {
      ...base,
      status: 'STALE',
      hasFreshPosition: false,
      isSuccessfullyConnected: false,
    };
  }

  if (input.trackingError) {
    return {
      ...base,
      status: 'ERROR',
      hasFreshPosition: false,
      isSuccessfullyConnected: false,
    };
  }

  return {
    ...base,
    status: 'WAITING_FOR_CONNECTION',
    hasFreshPosition: false,
    isSuccessfullyConnected: false,
  };
}

export function gpsConnectionStatusLabel(status: GpsConnectionStatus): string {
  switch (status) {
    case 'WAITING_FOR_CONNECTION':
      return 'Waiting for GPS signal';
    case 'DEVICE_ONLINE':
      return 'Device online';
    case 'POSITION_RECEIVED':
      return 'Position received';
    case 'STALE':
      return 'Signal stale';
    case 'INACTIVE':
      return 'Device inactive';
    case 'ARCHIVED':
      return 'Device archived';
    case 'ERROR':
      return 'Unable to verify';
  }
}

export function gpsConnectionStatusClass(status: GpsConnectionStatus): string {
  switch (status) {
    case 'POSITION_RECEIVED':
    case 'DEVICE_ONLINE':
      return 'bg-success/15 text-success';
    case 'WAITING_FOR_CONNECTION':
      return 'bg-warning/15 text-warning';
    case 'STALE':
      return 'bg-warning/15 text-warning';
    case 'INACTIVE':
    case 'ARCHIVED':
    case 'ERROR':
      return 'bg-destructive/10 text-destructive';
  }
}

export function gpsConnectionStatusHint(status: GpsConnectionStatus): string {
  switch (status) {
    case 'WAITING_FOR_CONNECTION':
      return 'FlowERP has registered this device, but has not received GPS data yet. Finish gateway setup, then wait for the first position.';
    case 'DEVICE_ONLINE':
      return 'The device has checked in recently. Waiting for a map position on the connected vehicle.';
    case 'POSITION_RECEIVED':
      return 'A recent GPS position is available for the connected vehicle.';
    case 'STALE':
      return 'A previous signal was received, but nothing recent. Check power, SIM, and gateway forwarding.';
    case 'INACTIVE':
      return 'This device is marked inactive and will not accept ingest.';
    case 'ARCHIVED':
      return 'This device is archived.';
    case 'ERROR':
      return 'Could not load live tracking for verification. Try again in a moment.';
  }
}
