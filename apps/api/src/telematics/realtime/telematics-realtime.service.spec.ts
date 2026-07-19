import type { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { TelematicsRealtimeService } from "./telematics-realtime.service";

/// Builds a ConfigService stub that returns the given SSE connection limits for
/// the "telematics" config key. The service never reads any other key.
function makeConfig(perOrg: number, global: number): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === "telematics") {
        return { sseMaxConnectionsPerOrg: perOrg, sseMaxConnectionsGlobal: global };
      }
      throw new Error(`Unexpected config key: ${key}`);
    },
  } as unknown as ConfigService;
}

describe("TelematicsRealtimeService (SSE)", () => {
  let service: TelematicsRealtimeService;
  let mockResponses: Array<MockResponse>;

  class MockResponse {
    public writableEnded = false;
    public written: string[] = [];
    public headers = new Map<string, string>();
    public eventListeners = new Map<string, Array<() => void>>();

    write(data: string): void {
      if (this.writableEnded) throw new Error("Response already ended");
      this.written.push(data);
    }

    setHeader(name: string, value: string): void {
      this.headers.set(name, value);
    }

    on(event: string, listener: () => void): void {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event)!.push(listener);
    }

    emit(event: string): void {
      this.eventListeners.get(event)?.forEach((fn) => fn());
    }

    end(): void {
      this.writableEnded = true;
    }
  }

  beforeEach(async () => {
    // High limits so the existing fan-out tests are never gated by admission.
    service = new TelematicsRealtimeService(makeConfig(20, 500));
    mockResponses = [];

    // Initialize the service without Redis (single-instance mode)
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it("registers and removes SSE clients", () => {
    const res = new MockResponse() as unknown as Response;
    service.tryRegisterClient(res, { organizationId: "org-1" });
    expect(service.clientCount()).toBe(1);

    service.removeClient(res);
    expect(service.clientCount()).toBe(0);
  });

  it("publishes events only to clients of the same organization", () => {
    const res1 = new MockResponse() as unknown as Response;
    const res2 = new MockResponse() as unknown as Response;

    service.tryRegisterClient(res1, { organizationId: "org-1" });
    service.tryRegisterClient(res2, { organizationId: "org-2" });

    service.publish("org-1", {
      type: "position",
      vehicleId: "vehicle-1",
      payload: { lat: 40.7128, lng: -74.006 },
      at: new Date().toISOString(),
    });

    const mock1 = res1 as unknown as MockResponse;
    const mock2 = res2 as unknown as MockResponse;

    expect(mock1.written.length).toBe(1);
    expect(mock1.written[0]).toContain('"type":"position"');
    expect(mock1.written[0]).toContain('"vehicleId":"vehicle-1"');

    expect(mock2.written.length).toBe(0);
  });

  it("filters events by vehicleIds when specified", () => {
    const res1 = new MockResponse() as unknown as Response;
    const res2 = new MockResponse() as unknown as Response;

    service.tryRegisterClient(res1, {
      organizationId: "org-1",
      vehicleIds: new Set(["vehicle-1"]),
    });
    service.tryRegisterClient(res2, {
      organizationId: "org-1",
      vehicleIds: new Set(["vehicle-2"]),
    });

    service.publish("org-1", {
      type: "position",
      vehicleId: "vehicle-1",
      payload: { lat: 40.7128, lng: -74.006 },
      at: new Date().toISOString(),
    });

    const mock1 = res1 as unknown as MockResponse;
    const mock2 = res2 as unknown as MockResponse;

    expect(mock1.written.length).toBe(1);
    expect(mock2.written.length).toBe(0);
  });

  it("sends events to all clients when no vehicleIds filter is set", () => {
    const res1 = new MockResponse() as unknown as Response;
    const res2 = new MockResponse() as unknown as Response;

    service.tryRegisterClient(res1, { organizationId: "org-1" });
    service.tryRegisterClient(res2, { organizationId: "org-1" });

    service.publish("org-1", {
      type: "alert",
      vehicleId: "vehicle-1",
      payload: { severity: "HIGH" },
      at: new Date().toISOString(),
    });

    const mock1 = res1 as unknown as MockResponse;
    const mock2 = res2 as unknown as MockResponse;

    expect(mock1.written.length).toBe(1);
    expect(mock2.written.length).toBe(1);
  });

  it("formats SSE events correctly", () => {
    const res = new MockResponse() as unknown as Response;
    service.tryRegisterClient(res, { organizationId: "org-1" });

    service.publish("org-1", {
      type: "state",
      vehicleId: "vehicle-1",
      payload: { movementState: "MOVING", speedKph: 60 },
      at: "2026-07-17T12:00:00.000Z",
    });

    const mock = res as unknown as MockResponse;
    expect(mock.written[0]).toMatch(/^data: \{.*\}\n\n$/);
    const json = JSON.parse(mock.written[0].replace(/^data: /, "").replace(/\n\n$/, ""));
    expect(json.type).toBe("state");
    expect(json.vehicleId).toBe("vehicle-1");
    expect(json.payload.movementState).toBe("MOVING");
  });

  it("removes clients whose response has ended", () => {
    const res = new MockResponse() as unknown as Response;
    service.tryRegisterClient(res, { organizationId: "org-1" });

    const mock = res as unknown as MockResponse;
    mock.end();

    service.publish("org-1", {
      type: "position",
      vehicleId: "vehicle-1",
      payload: { lat: 40.7128, lng: -74.006 },
      at: new Date().toISOString(),
    });

    // Client should be auto-removed, so no writes
    expect(mock.written.length).toBe(0);
    expect(service.clientCount()).toBe(0);
  });

  it("handles write errors gracefully and removes failed clients", () => {
    const res = new MockResponse() as unknown as Response;
    service.tryRegisterClient(res, { organizationId: "org-1" });

    const mock = res as unknown as MockResponse;
    mock.write = () => {
      throw new Error("Connection reset");
    };

    service.publish("org-1", {
      type: "position",
      vehicleId: "vehicle-1",
      payload: { lat: 40.7128, lng: -74.006 },
      at: new Date().toISOString(),
    });

    // Client should be removed after write failure
    expect(service.clientCount()).toBe(0);
  });

  it("publishes all event types correctly", () => {
    const res = new MockResponse() as unknown as Response;
    service.tryRegisterClient(res, { organizationId: "org-1" });

    const eventTypes: Array<{ type: "position" | "state" | "alert" | "geofence" | "trip"; vehicleId: string }> = [
      { type: "position", vehicleId: "v1" },
      { type: "state", vehicleId: "v1" },
      { type: "alert", vehicleId: "v1" },
      { type: "geofence", vehicleId: "v1" },
      { type: "trip", vehicleId: "v1" },
    ];

    eventTypes.forEach((evt) => {
      service.publish("org-1", {
        ...evt,
        payload: { test: true },
        at: new Date().toISOString(),
      });
    });

    const mock = res as unknown as MockResponse;
    expect(mock.written.length).toBe(5);

    eventTypes.forEach((evt, idx) => {
      const json = JSON.parse(mock.written[idx].replace(/^data: /, "").replace(/\n\n$/, ""));
      expect(json.type).toBe(evt.type);
    });
  });

  describe("connection admission control", () => {
    const newRes = () => new MockResponse() as unknown as Response;

    it("A: accepts connections up to the per-org limit and rejects beyond it", () => {
      const s = new TelematicsRealtimeService(makeConfig(2, 500));

      expect(s.tryRegisterClient(newRes(), { organizationId: "org-1" })).toBe(true);
      expect(s.tryRegisterClient(newRes(), { organizationId: "org-1" })).toBe(true);
      // Third connection for the same org exceeds the per-org limit of 2.
      expect(s.tryRegisterClient(newRes(), { organizationId: "org-1" })).toBe(false);

      // Rejected connection was not registered.
      expect(s.clientCount()).toBe(2);
    });

    it("B: accepts connections up to the global limit and rejects beyond it", () => {
      // Global cap 2, per-org cap high so global is the binding constraint.
      const s = new TelematicsRealtimeService(makeConfig(100, 2));

      expect(s.tryRegisterClient(newRes(), { organizationId: "org-1" })).toBe(true);
      expect(s.tryRegisterClient(newRes(), { organizationId: "org-2" })).toBe(true);
      // Third connection (different org again) exceeds the global limit of 2.
      expect(s.tryRegisterClient(newRes(), { organizationId: "org-3" })).toBe(false);

      expect(s.clientCount()).toBe(2);
    });

    it("C: removeClient restores capacity", () => {
      const s = new TelematicsRealtimeService(makeConfig(1, 500));
      const first = newRes();
      const second = newRes();

      expect(s.tryRegisterClient(first, { organizationId: "org-1" })).toBe(true);
      // At the per-org cap of 1, the next connection is rejected.
      expect(s.tryRegisterClient(second, { organizationId: "org-1" })).toBe(false);

      // Freeing the first connection restores a slot for the org.
      s.removeClient(first);
      expect(s.tryRegisterClient(second, { organizationId: "org-1" })).toBe(true);
      expect(s.clientCount()).toBe(1);
    });

    it("D: one org hitting its limit does not block another org until the global limit", () => {
      // Per-org cap 1, global cap high.
      const s = new TelematicsRealtimeService(makeConfig(1, 500));

      expect(s.tryRegisterClient(newRes(), { organizationId: "org-A" })).toBe(true);
      // org-A is at its per-org cap.
      expect(s.tryRegisterClient(newRes(), { organizationId: "org-A" })).toBe(false);
      // org-B is unaffected by org-A saturating its own quota.
      expect(s.tryRegisterClient(newRes(), { organizationId: "org-B" })).toBe(true);

      expect(s.clientCount()).toBe(2);
    });

    it("E: lazy removal on a dead socket restores the org's capacity (no counter desync)", () => {
      const s = new TelematicsRealtimeService(makeConfig(1, 500));
      const dead = new MockResponse();

      expect(s.tryRegisterClient(dead as unknown as Response, { organizationId: "org-1" })).toBe(true);
      // Socket dies; the next publish detaches it via fanOutLocal.
      dead.end();
      s.publish("org-1", {
        type: "position",
        vehicleId: "v1",
        payload: {},
        at: new Date().toISOString(),
      });

      // The per-org tally was decremented through the same path as removeClient,
      // so the freed slot is usable again — proving org counts don't leak.
      expect(s.clientCount()).toBe(0);
      expect(s.tryRegisterClient(new MockResponse() as unknown as Response, { organizationId: "org-1" })).toBe(true);
    });
  });
});
