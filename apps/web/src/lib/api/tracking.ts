import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { unwrapResponse as unwrap } from "./error";
import { describeError } from "./describe-error";
import { sessionManager } from "./session";

/// Fleet Tracking client — `/tracking/*` Phase 1 surface.
/// Dashboard / order / dispatch detail continue to use `/telematics/live`
/// via `lib/api/telematics.ts`; this module is the Fleet Tracking workspace
/// source of truth.

export type MovementState = "MOVING" | "IDLING" | "STOPPED" | "OFFLINE" | "UNKNOWN";
export type TrackingSessionSource = "DRIVER_APP" | "DEVICE" | "STAFF" | "API";

/// Matches `TrackingLivePosition` from TrackingService.
export interface TrackingVehicle {
  vehicleId: string;
  vehicleCode: string | null;
  plateNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  dispatchId: string | null;
  hasActiveDispatch?: boolean;
  tripId: string | null;
  sessionId: string | null;
  sessionSource?: TrackingSessionSource | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  ignitionOn: boolean | null;
  odometerKm: number | null;
  fuelLevelPct: number | null;
  movementState: MovementState;
  isStale: boolean;
  lastRecordedAt: string | null;
  lastReceivedAt: string | null;
  lastHeartbeatAt: string | null;
}

export interface TrackingStatePayload {
  latitude?: number | null;
  longitude?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  movementState?: MovementState;
  driverId?: string | null;
  tripId?: string | null;
  vehicleId?: string;
  ignitionOn?: boolean | null;
  odometerKm?: number | null;
  fuelLevelPct?: number | null;
  sessionId?: string | null;
  lastHeartbeatAt?: string | null;
}

export interface TrackingEvent {
  type: "position" | "state" | "alert" | "geofence" | "trip" | "heartbeat";
  vehicleId?: string | null;
  payload: TrackingStatePayload;
  at: string;
}

export interface TrackingHistoryPoint {
  at: string;
  lat: number;
  lng: number;
  speedKph: number | null;
  heading: number | null;
  movementState: MovementState;
  tripId: string | null;
}

export interface TrackingHistoryResponse {
  vehicleId: string | null;
  driverId: string | null;
  from: string;
  to: string;
  pointCount: number;
  points: TrackingHistoryPoint[];
}

interface LiveFleetResponse {
  generatedAt: string;
  vehicles: TrackingVehicle[];
}

/// SSE transport + GPS data delivery status for Fleet Tracking.
/// Keep-alive comment frames alone never advance to `live`.
export type StreamStatus =
  | "connecting"
  | "connected_waiting"
  | "live"
  | "reconnecting"
  | "error"
  | "disconnected";

export interface StreamLiveOptions {
  signal?: AbortSignal;
  /// Fired once the HTTP SSE response is open (status OK + body available).
  onOpen?: () => void;
}

class TrackingAPI {
  private baseUrl = "/api";

  async getLiveFleet(): Promise<TrackingVehicle[]> {
    const res = await apiFetch(`${this.baseUrl}/tracking/live`, { method: "GET" });
    const body = await unwrap<LiveFleetResponse>(res, "Failed to load live fleet");
    // Empty fleet is a valid 200 — never treat a missing array as a hard failure.
    return Array.isArray(body.vehicles) ? body.vehicles : [];
  }

  async getVehicleLatest(vehicleId: string): Promise<TrackingVehicle> {
    const res = await apiFetch(`${this.baseUrl}/tracking/vehicles/${vehicleId}`, {
      method: "GET",
    });
    return unwrap<TrackingVehicle>(res, "Failed to load vehicle position");
  }

  async getHistory(params: {
    vehicleId?: string;
    driverId?: string;
    from: string;
    to: string;
    limit?: number;
  }): Promise<TrackingHistoryResponse> {
    const qs = new URLSearchParams();
    if (params.vehicleId) qs.set("vehicleId", params.vehicleId);
    if (params.driverId) qs.set("driverId", params.driverId);
    qs.set("from", params.from);
    qs.set("to", params.to);
    if (params.limit != null) qs.set("limit", String(params.limit));

    const res = await apiFetch(`${this.baseUrl}/tracking/history?${qs}`, { method: "GET" });
    const body = await unwrap<TrackingHistoryResponse>(res, "Failed to load tracking history");
    return {
      ...body,
      points: Array.isArray(body.points) ? body.points : [],
      pointCount: body.pointCount ?? 0,
    };
  }

  /// Authenticated SSE over fetch (EventSource cannot send Authorization).
  /// Yields parsed application `data:` events until the stream ends or aborts.
  /// Comment frames (e.g. `: keep-alive`) are ignored and never yielded.
  async *streamLive(
    signalOrOptions?: AbortSignal | StreamLiveOptions,
  ): AsyncGenerator<TrackingEvent> {
    const options: StreamLiveOptions =
      signalOrOptions instanceof AbortSignal || signalOrOptions == null
        ? { signal: signalOrOptions ?? undefined }
        : signalOrOptions;
    const token = sessionManager.getAccessToken();
    const response = await fetch(`${this.baseUrl}/tracking/live-stream`, {
      method: "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Tracking stream failed (${response.status})`);
    }

    options.onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              yield JSON.parse(data) as TrackingEvent;
            } catch {
              // Malformed frame — keep the stream alive.
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const trackingAPI = new TrackingAPI();

export const trackingKeys = {
  all: ["tracking"] as const,
  liveFleet: () => [...trackingKeys.all, "live"] as const,
  vehicle: (vehicleId: string) => [...trackingKeys.all, "vehicle", vehicleId] as const,
  history: (vehicleId: string, hours: number, limit: number) =>
    [...trackingKeys.all, "history", vehicleId, hours, limit] as const,
};

export function useTrackingLiveQuery(opts?: { enabled?: boolean; refetchInterval?: number }) {
  const result = useQuery({
    queryKey: trackingKeys.liveFleet(),
    queryFn: () => trackingAPI.getLiveFleet(),
    enabled: opts?.enabled ?? true,
    refetchInterval: opts?.refetchInterval,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load the live fleet")
      : null,
  };
}

export function useTrackingVehicleQuery(
  vehicleId: string | null,
  opts?: { enabled?: boolean; refetchInterval?: number | false },
) {
  const result = useQuery({
    queryKey: trackingKeys.vehicle(vehicleId ?? ""),
    queryFn: () => trackingAPI.getVehicleLatest(vehicleId!),
    enabled: (opts?.enabled ?? true) && !!vehicleId,
    refetchInterval: opts?.refetchInterval,
    refetchOnReconnect: true,
  });

  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load vehicle position")
      : null,
  };
}

export function useTrackingHistoryQuery(
  vehicleId: string | null,
  opts?: { enabled?: boolean; hours?: number; limit?: number },
) {
  const hours = opts?.hours ?? 2;
  const limit = opts?.limit ?? 200;

  const result = useQuery({
    queryKey: trackingKeys.history(vehicleId ?? "", hours, limit),
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
      return trackingAPI.getHistory({
        vehicleId: vehicleId!,
        from: from.toISOString(),
        to: to.toISOString(),
        limit,
      });
    },
    enabled: (opts?.enabled ?? true) && !!vehicleId,
    staleTime: 30_000,
    refetchOnReconnect: true,
  });

  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load tracking history")
      : null,
  };
}

/// Prefer lastReceivedAt (server ingest time); fall back to lastRecordedAt.
export function trackingTimestampMs(vehicle: Pick<TrackingVehicle, "lastReceivedAt" | "lastRecordedAt">): number {
  const raw = vehicle.lastReceivedAt ?? vehicle.lastRecordedAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/// Merge a REST `/tracking/live` snapshot into local fleet state without
/// letting an older snapshot clobber fresher SSE position fields.
/// Snapshot membership is authoritative for who is in the fleet (archived /
/// removed vehicles drop out).
export function mergeLiveFleetSnapshot(
  current: TrackingVehicle[],
  snapshot: TrackingVehicle[],
): TrackingVehicle[] {
  const currentById = new Map(current.map((v) => [v.vehicleId, v]));
  const next: TrackingVehicle[] = [];

  for (const snap of snapshot) {
    const prev = currentById.get(snap.vehicleId);
    if (!prev) {
      next.push(snap);
      continue;
    }

    if (trackingTimestampMs(prev) > trackingTimestampMs(snap)) {
      next.push({
        ...snap,
        latitude: prev.latitude,
        longitude: prev.longitude,
        speedKph: prev.speedKph,
        heading: prev.heading,
        movementState: prev.movementState,
        isStale: prev.isStale,
        lastReceivedAt: prev.lastReceivedAt,
        lastRecordedAt: prev.lastRecordedAt,
        ignitionOn: prev.ignitionOn ?? snap.ignitionOn,
        odometerKm: prev.odometerKm ?? snap.odometerKm,
        fuelLevelPct: prev.fuelLevelPct ?? snap.fuelLevelPct,
        lastHeartbeatAt: prev.lastHeartbeatAt ?? snap.lastHeartbeatAt,
        sessionId: prev.sessionId ?? snap.sessionId,
      });
    } else {
      next.push(snap);
    }
  }

  return next;
}

/// Soft-merge a single-vehicle REST detail into local state (same freshness rule).
export function mergeVehicleDetail(
  current: TrackingVehicle,
  detail: TrackingVehicle,
): TrackingVehicle {
  if (trackingTimestampMs(current) > trackingTimestampMs(detail)) {
    return {
      ...detail,
      latitude: current.latitude,
      longitude: current.longitude,
      speedKph: current.speedKph,
      heading: current.heading,
      movementState: current.movementState,
      isStale: current.isStale,
      lastReceivedAt: current.lastReceivedAt,
      lastRecordedAt: current.lastRecordedAt,
      ignitionOn: current.ignitionOn ?? detail.ignitionOn,
      odometerKm: current.odometerKm ?? detail.odometerKm,
      fuelLevelPct: current.fuelLevelPct ?? detail.fuelLevelPct,
      lastHeartbeatAt: current.lastHeartbeatAt ?? detail.lastHeartbeatAt,
      sessionId: current.sessionId ?? detail.sessionId,
    };
  }
  return { ...current, ...detail };
}

function emptyVehicleFromEvent(vehicleId: string, event: TrackingEvent): TrackingVehicle {
  return {
    vehicleId,
    vehicleCode: null,
    plateNumber: null,
    driverId: event.payload.driverId ?? null,
    driverName: null,
    dispatchId: null,
    hasActiveDispatch: false,
    tripId: event.payload.tripId ?? null,
    sessionId: event.payload.sessionId ?? null,
    sessionSource: null,
    latitude: event.payload.latitude ?? null,
    longitude: event.payload.longitude ?? null,
    speedKph: event.payload.speedKph ?? null,
    heading: event.payload.heading ?? null,
    ignitionOn: event.payload.ignitionOn ?? null,
    odometerKm: event.payload.odometerKm ?? null,
    fuelLevelPct: event.payload.fuelLevelPct ?? null,
    movementState: event.payload.movementState ?? "UNKNOWN",
    isStale: false,
    lastRecordedAt: event.at ?? null,
    lastReceivedAt: event.at ?? null,
    lastHeartbeatAt: event.payload.lastHeartbeatAt ?? null,
  };
}

/// Apply an SSE event onto a fleet snapshot. Upserts unknown vehicleIds for
/// position/state events. Never invents coordinates — missing payload fields
/// leave the prior value.
export function applyTrackingEvent(
  vehicles: TrackingVehicle[],
  event: TrackingEvent,
): TrackingVehicle[] {
  if (!event.vehicleId) return vehicles;

  const index = vehicles.findIndex((v) => v.vehicleId === event.vehicleId);

  if (index === -1) {
    if (event.type !== "state" && event.type !== "position") return vehicles;
    return [...vehicles, emptyVehicleFromEvent(event.vehicleId, event)];
  }

  return vehicles.map((v) => {
    if (v.vehicleId !== event.vehicleId) return v;

    if (event.type === "heartbeat") {
      return {
        ...v,
        sessionId: event.payload.sessionId ?? v.sessionId,
        lastHeartbeatAt: event.payload.lastHeartbeatAt ?? event.at ?? v.lastHeartbeatAt,
      };
    }

    if (event.type !== "state" && event.type !== "position") return v;

    return {
      ...v,
      latitude: event.payload.latitude !== undefined ? event.payload.latitude : v.latitude,
      longitude: event.payload.longitude !== undefined ? event.payload.longitude : v.longitude,
      speedKph: event.payload.speedKph !== undefined ? event.payload.speedKph : v.speedKph,
      heading: event.payload.heading !== undefined ? event.payload.heading : v.heading,
      movementState: event.payload.movementState ?? v.movementState,
      driverId: event.payload.driverId !== undefined ? event.payload.driverId : v.driverId,
      tripId: event.payload.tripId !== undefined ? event.payload.tripId : v.tripId,
      ignitionOn:
        event.payload.ignitionOn !== undefined ? event.payload.ignitionOn : v.ignitionOn,
      odometerKm:
        event.payload.odometerKm !== undefined ? event.payload.odometerKm : v.odometerKm,
      fuelLevelPct:
        event.payload.fuelLevelPct !== undefined ? event.payload.fuelLevelPct : v.fuelLevelPct,
      lastReceivedAt: event.at ?? v.lastReceivedAt,
      lastRecordedAt: event.at ?? v.lastRecordedAt,
      isStale: false,
    };
  });
}
