import { apiFetch } from "./fetch";
import { unwrapResponse as unwrap } from "./error";
import { sessionManager } from "./session";
import { useQuery } from "@tanstack/react-query";

/// Live-tracking client for the Fleet Tracking screen. Talks to the telematics
/// controller (`/telematics/live`, `/telematics/live-stream`) using the same
/// infrastructure every other client uses: `apiFetch` for JSON, and — for the
/// authenticated SSE stream — the fetch + ReadableStream reader pattern the AI
/// Copilot client already uses (EventSource cannot send an Authorization
/// header, and the stream is JwtAuthGuard-protected).

export type MovementState = "MOVING" | "IDLING" | "STOPPED" | "OFFLINE" | "UNKNOWN";

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

/// The subset of an event payload the live map consumes (emitted on `state`
/// events). Other event kinds carry their own payloads, but the map only reads
/// position/state fields, so this is the shape it needs.
export interface TelematicsStatePayload {
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  movementState: MovementState;
}

export interface TelematicsEvent {
  type: "position" | "state" | "alert" | "geofence" | "trip";
  vehicleId?: string;
  payload: TelematicsStatePayload;
  at: string;
}

interface LiveFleetResponse {
  generatedAt: string;
  vehicles: Vehicle[];
}

class TelematicsAPI {
  private baseUrl = "/api";

  /// Point-in-time snapshot of the whole fleet's last-known positions.
  async getLiveFleet(): Promise<Vehicle[]> {
    const res = await apiFetch(`${this.baseUrl}/telematics/live`, { method: "GET" });
    const body = await unwrap<LiveFleetResponse>(res, "Failed to load live fleet");
    return body.vehicles;
  }

  /// Subscribes to the live SSE stream, yielding each parsed event until the
  /// caller aborts. Best-effort: a dropped or unauthorized stream simply ends
  /// (the initial `getLiveFleet` snapshot is the source of truth for errors).
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
              // A frame we cannot parse is not worth killing the stream over.
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

export const telematicsAPI = new TelematicsAPI();

export const telematicsKeys = {
  all: ["telematics"] as const,
  liveFleet: () => [...telematicsKeys.all, "live-fleet"] as const,
};

/// Initial fleet snapshot. Live updates after mount arrive via `streamLive`,
/// so this does not poll — it's the first paint and the retry/error surface.
export function useLiveFleetQuery() {
  return useQuery({
    queryKey: telematicsKeys.liveFleet(),
    queryFn: () => telematicsAPI.getLiveFleet(),
  });
}
