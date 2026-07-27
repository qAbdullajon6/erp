/// Mirrors apps/api's real GPS ingest contract exactly — see
/// docs/DRIVER_MOBILE_GPS.md and apps/api/src/telematics/dto/tracking.dto.ts /
/// ingest-positions.dto.ts. Nothing here is invented: every field, every limit
/// (batch 1–1000, idempotencyKey max 128 chars, recordedAt future-skew) matches
/// what the server actually validates.

export interface IngestPosition {
  latitude: number;
  longitude: number;
  /** ISO-8601 device time. Omit to let the server default to receive-time —
   * always sent here since the phone's own clock is what "device time" means. */
  recordedAt: string;
  speedKph?: number;
  heading?: number;
  altitudeM?: number;
  accuracyM?: number;
  /** Client-generated, stable across retries of the SAME fix — this is what
   * makes offline-queue replay and reconnect-duplicate submission safe (server
   * dedupes on it within a batch, see the ingest contract doc §6). */
  idempotencyKey: string;
}

/** Response shape of both POST /tracking/my-location and the vehicle/device
 * ingest siblings — apps/api/src/telematics/tracking/tracking.types.ts's
 * `TrackingReceiveResult`. `accepted < positions.length` is partial success,
 * not a transport failure — rejected fixes failed validation and must not be
 * retried. */
export interface TrackingReceiveResult {
  accepted: number;
  rejected: number;
  tripId: string | null;
  sessionId: string | null;
  latest: {
    latitude: number;
    longitude: number;
    speedKph: number | null;
    movementState: 'MOVING' | 'IDLING' | 'STOPPED' | 'OFFLINE' | 'UNKNOWN';
    recordedAt: string;
  } | null;
}

/** Response shape of POST /tracking/my-heartbeat —
 * apps/api/src/telematics/tracking/tracking.types.ts's `TrackingHeartbeatView`. */
export interface TrackingHeartbeatResult {
  sessionId: string;
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  deviceId: string | null;
  dispatchId: string | null;
  source: 'DRIVER_APP' | 'DEVICE' | 'STAFF' | 'API';
  status: 'ACTIVE' | 'ENDED';
  startedAt: string;
  lastHeartbeatAt: string;
  lastPositionAt: string | null;
  endedAt: string | null;
  isStale: boolean;
}
