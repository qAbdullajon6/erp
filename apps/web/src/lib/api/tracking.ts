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

export type StreamStatus = "connecting" | "live" | "disconnected";

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
  /// Yields parsed events until the stream ends or `signal` aborts.
  async *streamLive(signal?: AbortSignal): AsyncGenerator<TrackingEvent> {
    const token = sessionManager.getAccessToken();
    const response = await fetch(`${this.baseUrl}/tracking/live-stream`, {
      method: "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Tracking stream failed (${response.status})`);
    }

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
  opts?: { enabled?: boolean },
) {
  const result = useQuery({
    queryKey: trackingKeys.vehicle(vehicleId ?? ""),
    queryFn: () => trackingAPI.getVehicleLatest(vehicleId!),
    enabled: (opts?.enabled ?? true) && !!vehicleId,
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

/// Apply an SSE event onto a fleet snapshot. Never invents coordinates —
/// missing payload fields leave the prior value.
export function applyTrackingEvent(
  vehicles: TrackingVehicle[],
  event: TrackingEvent,
): TrackingVehicle[] {
  if (!event.vehicleId) return vehicles;

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

    const next: TrackingVehicle = {
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
    return next;
  });
}
