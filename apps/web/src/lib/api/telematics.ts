import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { unwrapResponse as unwrap } from "./error";
import { describeError } from "./describe-error";
import { sessionManager } from "./session";

/// Telematics module client — live map snapshot (used by dashboard/detail),
/// plus Phase 3 Fleet Tracking surfaces: alerts, trips, geofence events,
/// analytics. Fleet Tracking live stream uses `/tracking/*` via `tracking.ts`.

export type MovementState = "MOVING" | "IDLING" | "STOPPED" | "OFFLINE" | "UNKNOWN";

export type TelematicsAlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type NotificationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TripStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type GeofenceEventType = "ENTER" | "EXIT" | "DWELL";

export interface Vehicle {
  vehicleId: string;
  vehicleCode: string | null;
  plateNumber: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  movementState: MovementState;
  isStale: boolean;
  driverId: string | null;
  driverName: string | null;
  tripId: string | null;
  lastRecordedAt: string | null;
  lastReceivedAt: string | null;
}

export interface TelematicsStatePayload {
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  movementState: MovementState;
}

export interface TelematicsEvent {
  type: "position" | "state" | "alert" | "geofence" | "trip" | "heartbeat";
  vehicleId?: string;
  payload: TelematicsStatePayload & Record<string, unknown>;
  at: string;
}

export interface TelematicsAlert {
  id: string;
  organizationId: string;
  type: string;
  severity: NotificationSeverity;
  status: TelematicsAlertStatus;
  vehicleId: string | null;
  driverId: string | null;
  tripId: string | null;
  geofenceId: string | null;
  title: string;
  message: string;
  latitude: number | null;
  longitude: number | null;
  value: number | null;
  threshold: number | null;
  occurredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface TelematicsTrip {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string | null;
  dispatchId: string | null;
  orderId: string | null;
  status: TripStatus;
  startedAt: string;
  endedAt: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  distanceKm: string;
  durationSec: number;
  movingSec: number;
  idleSec: number;
  stopCount: number;
  maxSpeedKph: number;
  avgSpeedKph: number;
  pointCount: number;
  autoClosed: boolean;
  harshAccelCount: number;
  harshBrakeCount: number;
  harshCornerCount: number;
  speedingCount: number;
  fuelConsumedL: string | null;
  startOdometerKm: number | null;
  endOdometerKm: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripReplayPoint {
  at: string;
  lat: number;
  lng: number;
  speedKph: number | null;
  heading: number | null;
  movementState: MovementState;
}

export interface TripReplayPayload {
  tripId: string;
  pointCount: number;
  points: TripReplayPoint[];
}

export interface GeofenceEventItem {
  id: string;
  geofenceId: string;
  vehicleId: string;
  driverId: string | null;
  tripId: string | null;
  type: GeofenceEventType;
  occurredAt: string;
  latitude: number;
  longitude: number;
  dwellSec: number | null;
}

export interface TelematicsAnalyticsOverview {
  range: { from: string; to: string };
  totalDistanceKm: number;
  totalTrips: number;
  movingHours: number;
  idleHours: number;
  utilizationPct: number;
  maxSpeedKph: number;
  harshEvents: number;
  speedingEvents: number;
  fleet: {
    totalVehicles: number;
    moving: number;
    idling: number;
    stopped: number;
    offline: number;
  };
  openAlerts: number;
}

export interface TelematicsFuelAnalytics {
  range: { from: string; to: string };
  estimate: boolean;
  totalDistanceKm: number;
  totalEstimatedFuelLiters: number;
  fleetLitersPer100Km: number;
}

export interface TelematicsHealthRow {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  recordedAt: string | null;
  fuelLevelPct: number | null;
  batteryVoltage: number | null;
  checkEngineOn: boolean | null;
  openHealthAlerts: number;
}

interface LiveFleetResponse {
  generatedAt: string;
  vehicles: Vehicle[];
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

class TelematicsAPI {
  private baseUrl = "/api";

  async getLiveFleet(): Promise<Vehicle[]> {
    const res = await apiFetch(`${this.baseUrl}/telematics/live`, { method: "GET" });
    const body = await unwrap<LiveFleetResponse>(res, "Failed to load live fleet");
    return Array.isArray(body.vehicles) ? body.vehicles : [];
  }

  async *streamLive(signal?: AbortSignal): AsyncGenerator<TelematicsEvent> {
    const token = sessionManager.getAccessToken();
    const response = await fetch(`${this.baseUrl}/telematics/live-stream`, {
      method: "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal,
    });

    if (!response.ok || !response.body) return;

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
              yield JSON.parse(data) as TelematicsEvent;
            } catch {
              // keep stream alive
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listAlerts(params: {
    page?: number;
    limit?: number;
    status?: TelematicsAlertStatus;
    severity?: NotificationSeverity;
    vehicleId?: string;
  } = {}): Promise<{ items: TelematicsAlert[]; meta: PageMeta; openCount: number }> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set("page", String(params.page));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.status) qs.set("status", params.status);
    if (params.severity) qs.set("severity", params.severity);
    if (params.vehicleId) qs.set("vehicleId", params.vehicleId);
    const res = await apiFetch(`${this.baseUrl}/telematics/alerts?${qs}`, { method: "GET" });
    const body = await unwrap<{ items: TelematicsAlert[]; meta: PageMeta; openCount: number }>(
      res,
      "Failed to load alerts",
    );
    return {
      items: Array.isArray(body.items) ? body.items : [],
      meta: body.meta,
      openCount: body.openCount ?? 0,
    };
  }

  async acknowledgeAlert(id: string): Promise<TelematicsAlert> {
    const res = await apiFetch(`${this.baseUrl}/telematics/alerts/${id}/acknowledge`, {
      method: "POST",
    });
    return unwrap(res, "Failed to acknowledge alert");
  }

  async resolveAlert(id: string): Promise<TelematicsAlert> {
    const res = await apiFetch(`${this.baseUrl}/telematics/alerts/${id}/resolve`, {
      method: "POST",
    });
    return unwrap(res, "Failed to resolve alert");
  }

  async listTrips(params: {
    page?: number;
    limit?: number;
    vehicleId?: string;
    status?: TripStatus;
  } = {}): Promise<{ items: TelematicsTrip[]; meta: PageMeta }> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set("page", String(params.page));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.vehicleId) qs.set("vehicleId", params.vehicleId);
    if (params.status) qs.set("status", params.status);
    const res = await apiFetch(`${this.baseUrl}/telematics/trips?${qs}`, { method: "GET" });
    const body = await unwrap<{ items: TelematicsTrip[]; meta: PageMeta }>(
      res,
      "Failed to load trips",
    );
    return { items: Array.isArray(body.items) ? body.items : [], meta: body.meta };
  }

  async getTrip(id: string): Promise<TelematicsTrip> {
    const res = await apiFetch(`${this.baseUrl}/telematics/trips/${id}`, {
      method: "GET",
    });
    return unwrap(res, "Failed to load trip");
  }

  async replayTrip(id: string, limit = 10_000): Promise<TripReplayPayload> {
    const qs = new URLSearchParams({ limit: String(limit) });
    const res = await apiFetch(
      `${this.baseUrl}/telematics/trips/${id}/replay?${qs}`,
      { method: "GET" },
    );
    const body = await unwrap<TripReplayPayload>(res, "Failed to load trip replay");
    return {
      tripId: body.tripId,
      pointCount: body.pointCount ?? 0,
      points: Array.isArray(body.points) ? body.points : [],
    };
  }

  async listGeofenceEvents(params: {
    page?: number;
    limit?: number;
    vehicleId?: string;
    type?: GeofenceEventType;
    from?: string;
    to?: string;
  } = {}): Promise<{ items: GeofenceEventItem[]; meta: PageMeta }> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set("page", String(params.page));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.vehicleId) qs.set("vehicleId", params.vehicleId);
    if (params.type) qs.set("type", params.type);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const res = await apiFetch(`${this.baseUrl}/telematics/geofences/events?${qs}`, {
      method: "GET",
    });
    const body = await unwrap<{ items: GeofenceEventItem[]; meta: PageMeta }>(
      res,
      "Failed to load geofence events",
    );
    return { items: Array.isArray(body.items) ? body.items : [], meta: body.meta };
  }

  async analyticsOverview(params: { from?: string; to?: string } = {}): Promise<TelematicsAnalyticsOverview> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await apiFetch(`${this.baseUrl}/telematics/analytics/overview${suffix}`, {
      method: "GET",
    });
    return unwrap(res, "Failed to load fleet analytics");
  }

  async analyticsFuel(params: { from?: string; to?: string } = {}): Promise<TelematicsFuelAnalytics> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await apiFetch(`${this.baseUrl}/telematics/analytics/fuel${suffix}`, {
      method: "GET",
    });
    return unwrap(res, "Failed to load fuel analytics");
  }

  async analyticsHealth(params: { vehicleId?: string } = {}): Promise<{ vehicles: TelematicsHealthRow[] }> {
    const qs = new URLSearchParams();
    if (params.vehicleId) qs.set("vehicleId", params.vehicleId);
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await apiFetch(`${this.baseUrl}/telematics/analytics/health${suffix}`, {
      method: "GET",
    });
    const body = await unwrap<{ vehicles: TelematicsHealthRow[] }>(res, "Failed to load health analytics");
    return { vehicles: Array.isArray(body.vehicles) ? body.vehicles : [] };
  }
}

export const telematicsAPI = new TelematicsAPI();

export const telematicsKeys = {
  all: ["telematics"] as const,
  liveFleet: () => [...telematicsKeys.all, "live-fleet"] as const,
  alerts: (params: Record<string, unknown>) => [...telematicsKeys.all, "alerts", params] as const,
  trips: (params: Record<string, unknown>) => [...telematicsKeys.all, "trips", params] as const,
  trip: (id: string) => [...telematicsKeys.all, "trip", id] as const,
  tripReplay: (id: string, limit: number) =>
    [...telematicsKeys.all, "trip", id, "replay", limit] as const,
  geofenceEvents: (params: Record<string, unknown>) =>
    [...telematicsKeys.all, "geofence-events", params] as const,
  analyticsOverview: () => [...telematicsKeys.all, "analytics", "overview"] as const,
  analyticsFuel: () => [...telematicsKeys.all, "analytics", "fuel"] as const,
  analyticsHealth: (vehicleId?: string | null) =>
    [...telematicsKeys.all, "analytics", "health", vehicleId ?? "all"] as const,
};

export function useLiveFleetQuery(opts?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: telematicsKeys.liveFleet(),
    queryFn: () => telematicsAPI.getLiveFleet(),
    enabled: opts?.enabled ?? true,
    refetchInterval: opts?.refetchInterval,
  });
}

export function useTelematicsAlertsQuery(
  params: {
    vehicleId?: string | null;
    status?: TelematicsAlertStatus;
    severity?: NotificationSeverity;
    limit?: number;
  } = {},
  opts?: { enabled?: boolean; requireVehicleId?: boolean },
) {
  const requireVehicleId = opts?.requireVehicleId ?? true;
  const queryParams = {
    vehicleId: params.vehicleId ?? undefined,
    status: params.status,
    severity: params.severity,
    limit: params.limit ?? 30,
    page: 1,
  };
  const result = useQuery({
    queryKey: telematicsKeys.alerts(queryParams),
    queryFn: () => telematicsAPI.listAlerts(queryParams),
    enabled:
      (opts?.enabled ?? true) &&
      (requireVehicleId ? !!params.vehicleId : true),
    refetchOnReconnect: true,
  });
  return {
    ...result,
    errorMessage: result.error ? describeError(result.error, "Failed to load alerts") : null,
  };
}

export function useAcknowledgeAlertMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsAPI.acknowledgeAlert(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...telematicsKeys.all, "alerts"] });
      void qc.invalidateQueries({ queryKey: telematicsKeys.analyticsOverview() });
    },
  });
}

export function useResolveAlertMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsAPI.resolveAlert(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...telematicsKeys.all, "alerts"] });
      void qc.invalidateQueries({ queryKey: telematicsKeys.analyticsOverview() });
    },
  });
}

export function useTelematicsTripsQuery(
  params: { vehicleId?: string | null; limit?: number } = {},
  opts?: { enabled?: boolean },
) {
  const queryParams = {
    vehicleId: params.vehicleId ?? undefined,
    limit: params.limit ?? 10,
    page: 1,
  };
  const result = useQuery({
    queryKey: telematicsKeys.trips(queryParams),
    queryFn: () => telematicsAPI.listTrips(queryParams),
    enabled: (opts?.enabled ?? true) && !!params.vehicleId,
    refetchOnReconnect: true,
  });
  return {
    ...result,
    errorMessage: result.error ? describeError(result.error, "Failed to load trips") : null,
  };
}

export function useTelematicsTripQuery(
  id?: string | null,
  opts?: { enabled?: boolean },
) {
  const result = useQuery({
    queryKey: telematicsKeys.trip(id ?? ""),
    queryFn: () => telematicsAPI.getTrip(id!),
    enabled: (opts?.enabled ?? true) && !!id,
  });
  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load trip")
      : null,
  };
}

export function useTripReplayQuery(
  id?: string | null,
  opts?: { enabled?: boolean; limit?: number },
) {
  const limit = opts?.limit ?? 10_000;
  const result = useQuery({
    queryKey: telematicsKeys.tripReplay(id ?? "", limit),
    queryFn: () => telematicsAPI.replayTrip(id!, limit),
    enabled: (opts?.enabled ?? true) && !!id,
    staleTime: 5 * 60_000,
  });
  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load trip replay")
      : null,
  };
}

export function useGeofenceEventsQuery(
  params: {
    vehicleId?: string | null;
    limit?: number;
    from?: string;
    to?: string;
  } = {},
  opts?: { enabled?: boolean },
) {
  const queryParams = {
    vehicleId: params.vehicleId ?? undefined,
    limit: params.limit ?? 10,
    page: 1,
    from: params.from,
    to: params.to,
  };
  const result = useQuery({
    queryKey: telematicsKeys.geofenceEvents(queryParams),
    queryFn: () => telematicsAPI.listGeofenceEvents(queryParams),
    enabled: (opts?.enabled ?? true) && !!params.vehicleId,
    refetchOnReconnect: true,
  });
  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load geofence events")
      : null,
  };
}

export function useTelematicsAnalyticsOverviewQuery(opts?: { enabled?: boolean }) {
  const result = useQuery({
    queryKey: telematicsKeys.analyticsOverview(),
    queryFn: () => telematicsAPI.analyticsOverview(),
    enabled: opts?.enabled ?? true,
    staleTime: 60_000,
    refetchOnReconnect: true,
  });
  return {
    ...result,
    errorMessage: result.error ? describeError(result.error, "Failed to load analytics") : null,
  };
}

export function useTelematicsFuelQuery(opts?: { enabled?: boolean }) {
  const result = useQuery({
    queryKey: telematicsKeys.analyticsFuel(),
    queryFn: () => telematicsAPI.analyticsFuel(),
    enabled: opts?.enabled ?? true,
    staleTime: 60_000,
  });
  return {
    ...result,
    errorMessage: result.error ? describeError(result.error, "Failed to load fuel analytics") : null,
  };
}

export function useTelematicsHealthQuery(
  vehicleId?: string | null,
  opts?: { enabled?: boolean; fleetWide?: boolean },
) {
  const fleetWide = opts?.fleetWide === true;
  const result = useQuery({
    queryKey: telematicsKeys.analyticsHealth(fleetWide ? null : vehicleId),
    queryFn: () =>
      telematicsAPI.analyticsHealth(
        fleetWide ? {} : { vehicleId: vehicleId ?? undefined },
      ),
    enabled: (opts?.enabled ?? true) && (fleetWide || !!vehicleId),
    staleTime: 60_000,
    refetchOnReconnect: true,
  });
  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, "Failed to load health analytics")
      : null,
  };
}
