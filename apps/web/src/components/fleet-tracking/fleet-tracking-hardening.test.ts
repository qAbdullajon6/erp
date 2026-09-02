import { describe, expect, it, vi } from "vitest";
import {
  applyTrackingEvent,
  mergeLiveFleetSnapshot,
  type TrackingEvent,
  type TrackingVehicle,
  type StreamStatus,
} from "@/lib/api/tracking";
import { filterFleetVehicles, buildFleetDispatchIndex } from "@/components/fleet-tracking/fleet-ops";
import {
  bindLayerHoverHandlers,
  createSelectedMarkerClickHandler,
  describeFleetStreamPill,
  eventAdvancesLiveData,
  fleetSnapshotPollIntervalMs,
  isSelectionHiddenByFilter,
  isSseTransportConnected,
  nextSseReconnectDelayMs,
  parseFleetTrackingSearch,
  quantizeMapPoint,
  reduceStreamStatus,
  resolveDeepLinkSelection,
  shouldSyncSelectionToSearch,
  streamStatusLabel,
} from "@/components/fleet-tracking/fleet-tracking-hardening";

function vehicle(overrides: Partial<TrackingVehicle> = {}): TrackingVehicle {
  return {
    vehicleId: "v1",
    vehicleCode: "VEH-0001",
    plateNumber: "01A111AA",
    driverId: null,
    driverName: null,
    dispatchId: null,
    hasActiveDispatch: false,
    tripId: null,
    sessionId: null,
    sessionSource: null,
    latitude: 41.31,
    longitude: 69.24,
    speedKph: 40,
    heading: 90,
    ignitionOn: true,
    odometerKm: null,
    fuelLevelPct: null,
    movementState: "MOVING",
    isStale: false,
    lastRecordedAt: "2026-08-11T10:00:00.000Z",
    lastReceivedAt: "2026-08-11T10:00:00.000Z",
    lastHeartbeatAt: null,
    ...overrides,
  };
}

describe("bindLayerHoverHandlers", () => {
  it("registers and removes matching mouseenter/mouseleave handlers (no leak on rebind)", () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const key = (type: string, layer: string) => `${type}:${layer}`;
    const map = {
      on(type: string, layer: string, handler: (...args: unknown[]) => void) {
        const k = key(type, layer);
        if (!listeners.has(k)) listeners.set(k, new Set());
        listeners.get(k)!.add(handler);
      },
      off(type: string, layer: string, handler: (...args: unknown[]) => void) {
        listeners.get(key(type, layer))?.delete(handler);
      },
    };

    const setPointer = () => undefined;
    const clearPointer = () => undefined;
    const layers = ["fleet-unclustered", "fleet-clusters"];

    const cleanup1 = bindLayerHoverHandlers(map, layers, setPointer, clearPointer);
    expect(listeners.get("mouseenter:fleet-unclustered")?.size).toBe(1);
    expect(listeners.get("mouseleave:fleet-unclustered")?.size).toBe(1);
    expect(listeners.get("mouseenter:fleet-clusters")?.size).toBe(1);

    // Simulate GeoJSON effect re-run: cleanup first, then rebind.
    cleanup1();
    expect(listeners.get("mouseenter:fleet-unclustered")?.size).toBe(0);
    expect(listeners.get("mouseleave:fleet-unclustered")?.size).toBe(0);

    const cleanup2 = bindLayerHoverHandlers(map, layers, setPointer, clearPointer);
    expect(listeners.get("mouseenter:fleet-unclustered")?.size).toBe(1);
    cleanup2();
    expect(listeners.get("mouseenter:fleet-unclustered")?.size).toBe(0);
  });
});

describe("createSelectedMarkerClickHandler", () => {
  it("always uses the current vehicleId from the getter (never a stale closure)", () => {
    let currentId: string | null = "vehicle-a";
    const onSelect = vi.fn();
    const handler = createSelectedMarkerClickHandler(() => currentId, onSelect);

    handler({ stopPropagation: vi.fn() });
    expect(onSelect).toHaveBeenCalledWith("vehicle-a");

    currentId = "vehicle-b";
    handler({ stopPropagation: vi.fn() });
    expect(onSelect).toHaveBeenCalledWith("vehicle-b");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe("mergeLiveFleetSnapshot", () => {
  it("does not let an older snapshot overwrite fresher SSE position fields", () => {
    const current = [
      vehicle({
        latitude: 41.5,
        longitude: 69.5,
        speedKph: 55,
        lastReceivedAt: "2026-08-11T10:00:30.000Z",
        lastRecordedAt: "2026-08-11T10:00:30.000Z",
      }),
    ];
    const snapshot = [
      vehicle({
        latitude: 41.31,
        longitude: 69.24,
        speedKph: 10,
        lastReceivedAt: "2026-08-11T10:00:00.000Z",
        lastRecordedAt: "2026-08-11T10:00:00.000Z",
        plateNumber: "01A111AA",
        vehicleCode: "VEH-0001",
      }),
    ];

    const merged = mergeLiveFleetSnapshot(current, snapshot);
    expect(merged).toHaveLength(1);
    expect(merged[0].latitude).toBe(41.5);
    expect(merged[0].longitude).toBe(69.5);
    expect(merged[0].speedKph).toBe(55);
    expect(merged[0].lastReceivedAt).toBe("2026-08-11T10:00:30.000Z");
    expect(merged[0].plateNumber).toBe("01A111AA");
  });

  it("adds vehicles that appear only in the snapshot and drops removed ones", () => {
    const current = [vehicle({ vehicleId: "gone" }), vehicle({ vehicleId: "keep" })];
    const snapshot = [
      vehicle({ vehicleId: "keep", plateNumber: "KEEP" }),
      vehicle({ vehicleId: "new", plateNumber: "NEW" }),
    ];
    const merged = mergeLiveFleetSnapshot(current, snapshot);
    expect(merged.map((v) => v.vehicleId).sort()).toEqual(["keep", "new"]);
  });
});

describe("applyTrackingEvent upsert", () => {
  it("updates an existing vehicle without duplicating", () => {
    const prev = [vehicle()];
    const event: TrackingEvent = {
      type: "position",
      vehicleId: "v1",
      at: "2026-08-11T10:01:00.000Z",
      payload: { latitude: 41.4, longitude: 69.3, speedKph: 12 },
    };
    const next = applyTrackingEvent(prev, event);
    expect(next).toHaveLength(1);
    expect(next[0].latitude).toBe(41.4);
    expect(next[0].speedKph).toBe(12);
  });

  it("adds a previously unseen vehicle from an SSE position/state event", () => {
    const prev = [vehicle()];
    const event: TrackingEvent = {
      type: "position",
      vehicleId: "v-new",
      at: "2026-08-11T10:01:00.000Z",
      payload: { latitude: 40.1, longitude: 68.2, speedKph: 5, movementState: "MOVING" },
    };
    const next = applyTrackingEvent(prev, event);
    expect(next).toHaveLength(2);
    const added = next.find((v) => v.vehicleId === "v-new");
    expect(added?.latitude).toBe(40.1);
    expect(added?.lastReceivedAt).toBe("2026-08-11T10:01:00.000Z");
  });

  it("does not invent vehicles for non-position events", () => {
    const prev = [vehicle()];
    const event: TrackingEvent = {
      type: "alert",
      vehicleId: "v-alert-only",
      at: "2026-08-11T10:01:00.000Z",
      payload: {},
    };
    expect(applyTrackingEvent(prev, event)).toHaveLength(1);
  });
});

describe("filters affect map and sidebar consistently", () => {
  it("search + status filters produce one shared visible fleet list", () => {
    const vehicles = [
      vehicle({ vehicleId: "moving", movementState: "MOVING", plateNumber: "AAA" }),
      vehicle({
        vehicleId: "idle",
        movementState: "IDLING",
        plateNumber: "BBB",
        latitude: 41.2,
        longitude: 69.1,
      }),
      vehicle({
        vehicleId: "offline",
        movementState: "OFFLINE",
        plateNumber: "CCC",
        isStale: true,
      }),
    ];
    const dispatchIndex = buildFleetDispatchIndex([]);
    const sidebar = filterFleetVehicles(vehicles, "moving", "aaa", dispatchIndex);
    const map = filterFleetVehicles(vehicles, "moving", "aaa", dispatchIndex);
    expect(sidebar).toEqual(map);
    expect(sidebar.map((v) => v.vehicleId)).toEqual(["moving"]);
  });
});

describe("?vehicleId= deep link search parsing", () => {
  it("accepts a non-empty vehicleId", () => {
    expect(parseFleetTrackingSearch({ vehicleId: "  uuid-1  " })).toEqual({
      vehicleId: "uuid-1",
    });
  });

  it("ignores empty / non-string vehicleId (unauthorized/invalid fail closed at load)", () => {
    expect(parseFleetTrackingSearch({ vehicleId: "" })).toEqual({});
    expect(parseFleetTrackingSearch({ vehicleId: "   " })).toEqual({});
    expect(parseFleetTrackingSearch({ vehicleId: 123 })).toEqual({});
    expect(parseFleetTrackingSearch({})).toEqual({});
  });
});

describe("resolveDeepLinkSelection (fail-closed race)", () => {
  it("waits while vehicles are still empty before the snapshot succeeds", () => {
    expect(
      resolveDeepLinkSelection({
        selectedVehicleId: "valid-org-id",
        fleetSnapshotSucceeded: false,
        fleetSnapshotFailed: false,
        fleetVehicleIds: [],
      }),
    ).toBe("wait");
  });

  it("keeps a valid vehicleId once the authoritative snapshot includes it", () => {
    expect(
      resolveDeepLinkSelection({
        selectedVehicleId: "valid-org-id",
        fleetSnapshotSucceeded: true,
        fleetSnapshotFailed: false,
        fleetVehicleIds: ["valid-org-id", "other"],
      }),
    ).toBe("keep");
  });

  it("clears invalid/cross-org/unknown ids only after a successful snapshot", () => {
    expect(
      resolveDeepLinkSelection({
        selectedVehicleId: "unknown-or-cross-org",
        fleetSnapshotSucceeded: true,
        fleetSnapshotFailed: false,
        fleetVehicleIds: ["valid-org-id"],
      }),
    ).toBe("clear");
  });

  it("clears archived vehicles missing from the live org snapshot", () => {
    expect(
      resolveDeepLinkSelection({
        selectedVehicleId: "archived-id",
        fleetSnapshotSucceeded: true,
        fleetSnapshotFailed: false,
        fleetVehicleIds: [],
      }),
    ).toBe("clear");
  });

  it("does not clear on API error (never interpret failure as not found)", () => {
    expect(
      resolveDeepLinkSelection({
        selectedVehicleId: "valid-org-id",
        fleetSnapshotSucceeded: false,
        fleetSnapshotFailed: true,
        fleetVehicleIds: [],
      }),
    ).toBe("wait");
  });
});

describe("shouldSyncSelectionToSearch (URL flicker guard)", () => {
  it("does not promote selection into ?vehicleId= while snapshot is still loading", () => {
    expect(
      shouldSyncSelectionToSearch({
        selectedVehicleId: "valid-org-id",
        urlVehicleId: null,
        selectionDecision: "wait",
        urlDecision: "wait",
      }),
    ).toBe(false);
  });

  it("promotes selection once the snapshot confirms keep", () => {
    expect(
      shouldSyncSelectionToSearch({
        selectedVehicleId: "valid-org-id",
        urlVehicleId: null,
        selectionDecision: "keep",
        urlDecision: "wait",
      }),
    ).toBe(true);
  });

  it("does not strip a deep-link URL while snapshot is loading", () => {
    expect(
      shouldSyncSelectionToSearch({
        selectedVehicleId: null,
        urlVehicleId: "valid-org-id",
        selectionDecision: "wait",
        urlDecision: "wait",
      }),
    ).toBe(false);
  });

  it("no-ops when URL and selection already match", () => {
    expect(
      shouldSyncSelectionToSearch({
        selectedVehicleId: "valid-org-id",
        urlVehicleId: "valid-org-id",
        selectionDecision: "keep",
        urlDecision: "keep",
      }),
    ).toBe(false);
  });
});

describe("SSE reconnect backoff", () => {
  it("exponentially backs off and caps at max", () => {
    expect(nextSseReconnectDelayMs(0)).toBe(1_500);
    expect(nextSseReconnectDelayMs(1)).toBe(3_000);
    expect(nextSseReconnectDelayMs(2)).toBe(6_000);
    expect(nextSseReconnectDelayMs(10)).toBe(20_000);
  });
});

describe("SSE status semantics", () => {
  it("transitions CONNECTING → CONNECTED_WAITING → LIVE → RECONNECTING → CONNECTED_WAITING", () => {
    let status: StreamStatus = "disconnected";
    status = reduceStreamStatus(status, { type: "connect_start", attempt: 0 });
    expect(status).toBe("connecting");

    status = reduceStreamStatus(status, { type: "opened" });
    expect(status).toBe("connected_waiting");
    expect(isSseTransportConnected(status)).toBe(true);

    status = reduceStreamStatus(status, { type: "data_event", eventType: "position" });
    expect(status).toBe("live");

    status = reduceStreamStatus(status, { type: "stream_end" });
    expect(status).toBe("disconnected");

    status = reduceStreamStatus(status, { type: "connect_start", attempt: 1 });
    expect(status).toBe("reconnecting");

    status = reduceStreamStatus(status, { type: "opened" });
    expect(status).toBe("connected_waiting");
  });

  it("does not treat keep-alive / non-GPS frames as LIVE_DATA", () => {
    expect(eventAdvancesLiveData("position")).toBe(true);
    expect(eventAdvancesLiveData("state")).toBe(true);
    expect(eventAdvancesLiveData("alert")).toBe(false);
    expect(eventAdvancesLiveData("heartbeat")).toBe(false);

    let status: StreamStatus = reduceStreamStatus("disconnected", {
      type: "connect_start",
      attempt: 0,
    });
    status = reduceStreamStatus(status, { type: "opened" });
    // Keep-alive never reaches the reducer; alert alone must not become live.
    status = reduceStreamStatus(status, { type: "data_event", eventType: "alert" });
    expect(status).toBe("connected_waiting");
  });

  it("labels distinguish connection from GPS data", () => {
    expect(streamStatusLabel("connected_waiting")).toContain("waiting for GPS");
    expect(streamStatusLabel("live")).toBe("Live");
    expect(streamStatusLabel("reconnecting")).toBe("Reconnecting");
    expect(
      describeFleetStreamPill({
        streamStatus: "live",
        lastReceivedAt: "2026-08-11T10:00:00.000Z",
        isStale: false,
        lastReceivedRelative: "12s ago",
      }).label,
    ).toContain("GPS updated");
    expect(
      describeFleetStreamPill({
        streamStatus: "disconnected",
        lastReceivedRelative: "22m ago",
      }).label,
    ).toContain("Offline");
  });
});

describe("poll fallback when SSE GPS data is not flowing", () => {
  it("disables REST poll only while LIVE_DATA; polls otherwise including connected_waiting", () => {
    expect(fleetSnapshotPollIntervalMs("live")).toBe(false);
    expect(fleetSnapshotPollIntervalMs("connected_waiting")).toBe(10_000);
    expect(fleetSnapshotPollIntervalMs("connecting")).toBe(10_000);
    expect(fleetSnapshotPollIntervalMs("reconnecting")).toBe(10_000);
    expect(fleetSnapshotPollIntervalMs("disconnected")).toBe(10_000);
    expect(fleetSnapshotPollIntervalMs("error")).toBe(10_000);
  });
});

describe("quantizeMapPoint", () => {
  it("rounds to 4 decimals so slow GPS drift shares one query key", () => {
    expect(quantizeMapPoint({ lat: 40.396641666, lng: 71.292045111 })).toEqual({
      lat: 40.3966,
      lng: 71.292,
    });
  });
});

describe("isSelectionHiddenByFilter", () => {
  it("is true when selected vehicle is in fleet but not in filtered list", () => {
    expect(isSelectionHiddenByFilter("v1", ["v2"], ["v1", "v2"])).toBe(true);
  });

  it("is false when selected is visible or unknown to the fleet", () => {
    expect(isSelectionHiddenByFilter("v1", ["v1", "v2"], ["v1", "v2"])).toBe(false);
    expect(isSelectionHiddenByFilter("gone", ["v1"], ["v1"])).toBe(false);
    expect(isSelectionHiddenByFilter(null, ["v1"], ["v1"])).toBe(false);
  });
});
