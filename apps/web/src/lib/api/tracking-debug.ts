import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { unwrapResponse as unwrap } from "./error";

export type TrackingDebugPacket = {
  id: string;
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  deviceId: string | null;
  source: string;
  receivedAt: string;
  deviceAt: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  accuracyM: number | null;
  processingDurationMs: number;
  sseBroadcastDurationMs: number | null;
  replayWriteDurationMs: number | null;
  outcome: "accepted" | "rejected";
  reason: string | null;
  movementState: string | null;
  tripId: string | null;
  sessionId: string | null;
};

export type TrackingDebugEvent = {
  id: string;
  organizationId: string;
  kind: string;
  at: string;
  vehicleId: string | null;
  driverId: string | null;
  dispatchId: string | null;
  sessionId: string | null;
  tripId: string | null;
  message: string;
  meta?: Record<string, unknown>;
};

export type TrackingDebugDiagnostic = {
  code: string;
  severity: "info" | "warning" | "critical";
  count: number;
  message: string;
  sampleIds: string[];
};

export type TrackingDebugMetrics = {
  windowStartedAt: string;
  packetsTotal: number;
  packetsAccepted: number;
  packetsRejected: number;
  packetsPerMinute: number;
  avgGpsIntervalMs: number | null;
  avgProcessingLatencyMs: number | null;
  avgSseBroadcastLatencyMs: number | null;
  avgReplayWriteLatencyMs: number | null;
  connectedDriversEstimate: number;
  activeSessions: number;
  sseClientsGlobal: number;
  sseClientsOrg: number;
};

export type TrackingDebugSnapshot = {
  generatedAt: string;
  offlineThresholdSec: number;
  sessions: Array<{
    id: string;
    vehicleId: string | null;
    driverId: string | null;
    deviceId: string | null;
    dispatchId: string | null;
    source: string;
    status: string;
    startedAt: string;
    lastHeartbeatAt: string;
    lastPositionAt: string | null;
    heartbeatAgeSec: number;
    gpsAgeSec: number | null;
    heartbeatMissing: boolean;
    movementState: string | null;
    lastReceivedAt: string | null;
  }>;
  vehicleStates: Array<{
    vehicleId: string;
    driverId: string | null;
    tripId: string | null;
    latitude: number | null;
    longitude: number | null;
    speedKph: number | null;
    heading: number | null;
    movementState: string;
    lastRecordedAt: string | null;
    lastReceivedAt: string | null;
    isStale: boolean;
  }>;
  trips: Array<{
    id: string;
    vehicleId: string;
    driverId: string | null;
    dispatchId: string | null;
    status: string;
    startedAt: string;
    pointCount: number;
  }>;
  sse: {
    clientsGlobal: number;
    clientsOrg: number;
    clients: Array<{ organizationId: string; vehicleFilterCount: number | null }>;
  };
  packets: TrackingDebugPacket[];
  timeline: TrackingDebugEvent[];
  diagnostics: TrackingDebugDiagnostic[];
  metrics: TrackingDebugMetrics;
};

class TrackingDebugAPI {
  private baseUrl = "/api";

  async getSnapshot(): Promise<TrackingDebugSnapshot> {
    const res = await apiFetch(`${this.baseUrl}/tracking/debug/snapshot`, { method: "GET" });
    return unwrap<TrackingDebugSnapshot>(res, "Failed to load tracking debug snapshot");
  }

  async exportJson(): Promise<unknown> {
    const res = await apiFetch(`${this.baseUrl}/tracking/debug/export`, { method: "GET" });
    return unwrap(res, "Failed to export tracking diagnostics");
  }
}

export const trackingDebugAPI = new TrackingDebugAPI();

export function useTrackingDebugSnapshotQuery(enabled = true) {
  return useQuery({
    queryKey: ["tracking", "debug", "snapshot"],
    queryFn: () => trackingDebugAPI.getSnapshot(),
    enabled,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}
