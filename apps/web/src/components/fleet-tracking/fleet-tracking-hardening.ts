/// Pure helpers for FleetMap layer event wiring — kept free of Mapbox so
/// listener attach/cleanup contracts can be unit-tested without a GL context.

import type { StreamStatus, TrackingEvent } from "@/lib/api/tracking";

export type LayerEventMap = {
  on: (type: string, layer: string, handler: (...args: unknown[]) => void) => void;
  off: (type: string, layer: string, handler: (...args: unknown[]) => void) => void;
};

/// Bind named hover handlers so every `on` has a matching `off` with the
/// same function reference (anonymous lambdas cannot be removed).
export function bindLayerHoverHandlers(
  map: LayerEventMap,
  layers: string[],
  setPointer: () => void,
  clearPointer: () => void,
): () => void {
  for (const layer of layers) {
    map.on("mouseenter", layer, setPointer);
    map.on("mouseleave", layer, clearPointer);
  }
  return () => {
    for (const layer of layers) {
      map.off("mouseenter", layer, setPointer);
      map.off("mouseleave", layer, clearPointer);
    }
  };
}

/// Selected HTML marker click — always reads the current vehicle id from a
/// getter so the listener never closes over a stale id from first creation.
export function createSelectedMarkerClickHandler(
  getVehicleId: () => string | null,
  onSelect: (vehicleId: string) => void,
): (event: { stopPropagation: () => void }) => void {
  return (event) => {
    event.stopPropagation();
    const id = getVehicleId();
    if (id) onSelect(id);
  };
}

export const FLEET_SSE_RECONNECT_BASE_MS = 1_500;
export const FLEET_SSE_RECONNECT_MAX_MS = 20_000;

export function nextSseReconnectDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, attempt);
  return Math.min(FLEET_SSE_RECONNECT_BASE_MS * 2 ** safeAttempt, FLEET_SSE_RECONNECT_MAX_MS);
}

/// Deep-link / selection fail-closed against the authoritative live snapshot.
/// Empty `vehicles=[]` before a successful snapshot must NOT clear selection.
export type DeepLinkSelectionDecision = "wait" | "keep" | "clear";

export function resolveDeepLinkSelection(input: {
  selectedVehicleId: string | null;
  /** True only after `/tracking/live` succeeded (empty fleet is still success). */
  fleetSnapshotSucceeded: boolean;
  /** True when the live fleet request failed — never treat as "not found". */
  fleetSnapshotFailed: boolean;
  fleetVehicleIds: ReadonlyArray<string> | ReadonlySet<string>;
}): DeepLinkSelectionDecision {
  if (!input.selectedVehicleId) return "wait";
  if (input.fleetSnapshotFailed) return "wait";
  if (!input.fleetSnapshotSucceeded) return "wait";
  const ids =
    input.fleetVehicleIds instanceof Set
      ? input.fleetVehicleIds
      : new Set(input.fleetVehicleIds);
  return ids.has(input.selectedVehicleId) ? "keep" : "clear";
}

/// Whether selection ↔ `?vehicleId=` navigation should run.
/// Prevents promoting an unvalidated session selection into the URL (flicker).
export function shouldSyncSelectionToSearch(input: {
  selectedVehicleId: string | null;
  urlVehicleId: string | null;
  selectionDecision: DeepLinkSelectionDecision;
  /** Decision for the URL id when selection is null (strip vs wait). */
  urlDecision: DeepLinkSelectionDecision;
}): boolean {
  if (input.urlVehicleId === input.selectedVehicleId) return false;
  // Fail-closed effect owns clearing invalid ids; don't write them into the URL.
  if (input.selectedVehicleId && input.selectionDecision === "clear") return false;
  if (input.selectedVehicleId && input.selectionDecision === "wait") return false;
  if (!input.selectedVehicleId && input.urlVehicleId && input.urlDecision === "wait") {
    return false;
  }
  return true;
}

export type StreamStatusAction =
  | { type: "connect_start"; attempt: number }
  | { type: "opened" }
  | { type: "data_event"; eventType: TrackingEvent["type"] }
  | { type: "stream_end" }
  | { type: "stream_error" }
  | { type: "cleanup" };

/// Position/state application events advance to LIVE_DATA. Keep-alive comments
/// never reach this reducer. Alert/geofence/trip alone do not mean GPS live.
export function eventAdvancesLiveData(eventType: TrackingEvent["type"] | string): boolean {
  return eventType === "position" || eventType === "state";
}

export function reduceStreamStatus(
  current: StreamStatus,
  action: StreamStatusAction,
): StreamStatus {
  switch (action.type) {
    case "connect_start":
      return action.attempt > 0 ? "reconnecting" : "connecting";
    case "opened":
      return "connected_waiting";
    case "data_event":
      if (eventAdvancesLiveData(action.eventType)) return "live";
      // Non-GPS application frames: stay waiting/live, or mark connected if we
      // somehow still had a pre-open status.
      if (current === "live" || current === "connected_waiting") return current;
      return "connected_waiting";
    case "stream_error":
      return "error";
    case "stream_end":
    case "cleanup":
      return "disconnected";
    default:
      return current;
  }
}

export function isSseTransportConnected(status: StreamStatus): boolean {
  return status === "connected_waiting" || status === "live";
}

export function isLiveGpsDataStream(status: StreamStatus): boolean {
  return status === "live";
}

/// When SSE is delivering GPS data events, skip REST polling; otherwise poll.
export function fleetSnapshotPollIntervalMs(streamStatus: StreamStatus): number | false {
  return streamStatus === "live" ? false : 10_000;
}

export function streamStatusLabel(status: StreamStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "connected_waiting":
      return "Connected · waiting for GPS";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Stream error";
    case "disconnected":
      return "Disconnected";
  }
}

export type FleetStreamPillTone = "live" | "connected" | "warn" | "muted";

export function describeFleetStreamPill(input: {
  streamStatus: StreamStatus;
  lastReceivedAt?: string | null;
  isStale?: boolean;
  /** Preformatted relative time (e.g. formatRelativeTime). */
  lastReceivedRelative?: string | null;
}): { label: string; tone: FleetStreamPillTone; title: string } {
  const { streamStatus, lastReceivedAt, isStale, lastReceivedRelative } = input;
  const relative = lastReceivedRelative?.trim() || null;

  if (streamStatus === "reconnecting") {
    return {
      label: "Reconnecting",
      tone: "warn",
      title: "Live stream reconnecting…",
    };
  }
  if (streamStatus === "connecting") {
    return {
      label: "Connecting",
      tone: "warn",
      title: "Opening live stream…",
    };
  }
  if (streamStatus === "error") {
    return {
      label: "Stream error",
      tone: "warn",
      title: "Live stream error — using snapshot polling",
    };
  }
  if (streamStatus === "disconnected") {
    return {
      label: relative ? `Offline · last GPS ${relative}` : "Offline",
      tone: "muted",
      title: "Live stream disconnected — showing last snapshot",
    };
  }
  if (streamStatus === "connected_waiting") {
    return {
      label: "Connected · waiting for GPS",
      tone: "connected",
      title: "SSE connected — waiting for position/state events",
    };
  }
  // live (LIVE_DATA)
  if (isStale || !lastReceivedAt) {
    return {
      label: relative ? `Live · last GPS ${relative}` : "Live · waiting for GPS",
      tone: "live",
      title: "SSE delivering data; GPS may be stale — see lastReceivedAt",
    };
  }
  return {
    label: relative ? `Live · GPS updated ${relative}` : "Live",
    tone: "live",
    title: "SSE connected with recent GPS data events",
  };
}

export function parseFleetTrackingSearch(
  search: Record<string, unknown>,
): { vehicleId?: string } {
  const out: { vehicleId?: string } = {};
  if (typeof search.vehicleId === "string" && search.vehicleId.trim()) {
    out.vehicleId = search.vehicleId.trim();
  }
  return out;
}

/// Round lat/lng for TanStack Query keys so slow GPS drift does not spam
/// Mapbox reverse-geocode / directions proxy calls.
export function quantizeMapCoord(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function quantizeMapPoint(
  point: { lat: number; lng: number },
  decimals = 4,
): { lat: number; lng: number } {
  return {
    lat: quantizeMapCoord(point.lat, decimals),
    lng: quantizeMapCoord(point.lng, decimals),
  };
}

/// Selected vehicle still in fleet but excluded by active search/status filter.
export function isSelectionHiddenByFilter(
  selectedVehicleId: string | null,
  filteredIds: ReadonlySet<string> | readonly string[],
  fleetIds: ReadonlySet<string> | readonly string[],
): boolean {
  if (!selectedVehicleId) return false;
  const filtered =
    filteredIds instanceof Set ? filteredIds : new Set(filteredIds);
  const fleet = fleetIds instanceof Set ? fleetIds : new Set(fleetIds);
  if (!fleet.has(selectedVehicleId)) return false;
  return !filtered.has(selectedVehicleId);
}
