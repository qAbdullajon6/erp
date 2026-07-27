import type { MovementState, TrackingSessionSource, TrackingSessionStatus } from "@prisma/client";

/// Canonical live-position shape for the /tracking surface. Coordinates are
/// null only when no GPS fix has ever been stored for the vehicle — never
/// fabricated.
export interface TrackingLivePosition {
  vehicleId: string;
  vehicleCode: string | null;
  plateNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  dispatchId: string | null;
  /// True when a live dispatch is currently assigned to this vehicle
  /// (ASSIGNED … IN_TRANSIT). Independent of TrackingSession.dispatchId.
  hasActiveDispatch: boolean;
  tripId: string | null;
  sessionId: string | null;
  sessionSource: TrackingSessionSource | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  ignitionOn: boolean | null;
  odometerKm: number | null;
  fuelLevelPct: number | null;
  movementState: MovementState;
  isStale: boolean;
  lastRecordedAt: Date | null;
  lastReceivedAt: Date | null;
  lastHeartbeatAt: Date | null;
}

export interface TrackingHistoryPoint {
  at: Date;
  lat: number;
  lng: number;
  speedKph: number | null;
  heading: number | null;
  movementState: MovementState;
  tripId: string | null;
}

export interface TrackingHeartbeatView {
  sessionId: string;
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  deviceId: string | null;
  dispatchId: string | null;
  source: TrackingSessionSource;
  status: TrackingSessionStatus;
  startedAt: Date;
  lastHeartbeatAt: Date;
  lastPositionAt: Date | null;
  endedAt: Date | null;
  /// True when lastHeartbeatAt is older than the org offline threshold.
  isStale: boolean;
}

export interface TrackingReceiveResult {
  accepted: number;
  rejected: number;
  tripId: string | null;
  sessionId: string | null;
  latest: {
    latitude: number;
    longitude: number;
    speedKph: number | null;
    movementState: MovementState;
    recordedAt: Date;
  } | null;
}
