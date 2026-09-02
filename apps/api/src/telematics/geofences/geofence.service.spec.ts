import { Logger } from "@nestjs/common";
import { Geofence, Prisma } from "@prisma/client";
import type { AuditService } from "../../audit/audit.service";
import type { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import type { AlertService } from "../alerts/alert.service";
import type { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import type { TelematicsSettingsService } from "../settings/telematics-settings.service";
import type { PrismaService } from "../../prisma/prisma.service";
import {
  GeofenceService,
  AUTO_ARRIVAL_PICKUP_CATEGORY,
  AUTO_ARRIVAL_DELIVERY_CATEGORY,
} from "./geofence.service";

/// Unit tests for GeofenceService.createForDispatch and archiveForDispatch.
///
/// Every collaborator is mocked — these tests prove the decision logic
/// (coordinate validation, idempotency, category routing, cache invalidation)
/// independently of Postgres.

const SETTINGS_DEFAULT = {
  arrivalGeofenceEnabled: true,
  arrivalGeofenceRadiusM: 150,
};

const DISPATCH_ROW = {
  dispatchNumber: "DP-0001",
  pickupDateScheduled: new Date("2041-05-01T08:00:00Z"),
  deliveryDateScheduled: new Date("2041-05-03T18:00:00Z"),
  order: {
    pickupLat: new Prisma.Decimal("41.2995"),
    pickupLng: new Prisma.Decimal("69.2401"),
    deliveryLat: new Prisma.Decimal("39.6542"),
    deliveryLng: new Prisma.Decimal("66.9597"),
  },
};

function makeService() {
  const prisma = {
    dispatch: { findFirst: jest.fn() },
    geofence: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "geo-1" }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  const settings = {
    getOrCreate: jest.fn().mockResolvedValue(SETTINGS_DEFAULT),
  } as unknown as TelematicsSettingsService;

  const service = new GeofenceService(
    prisma,
    { log: jest.fn() } as unknown as AuditService,
    { emit: jest.fn() } as unknown as WorkflowEventService,
    { publish: jest.fn() } as unknown as TelematicsRealtimeService,
    { raise: jest.fn() } as unknown as AlertService,
    settings,
  );

  // Silence logger noise in test output.
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

  return { service, prisma, settings };
}

describe("GeofenceService — createForDispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a PICKUP fence when coordinates are valid", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          type: "CIRCLE",
          category: AUTO_ARRIVAL_PICKUP_CATEGORY,
          autoCreated: true,
          linkedDispatchId: "disp-1",
          centerLat: 41.2995,
          centerLng: 69.2401,
          radiusM: 150,
          active: true,
          alertOnEnter: false,
          alertOnExit: false,
        }),
      }),
    );
  });

  it("creates a DELIVERY fence with delivery coordinates", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForDispatch("org-1", "disp-1", "DELIVERY");

    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: AUTO_ARRIVAL_DELIVERY_CATEGORY,
          centerLat: 39.6542,
          centerLng: 66.9597,
        }),
      }),
    );
  });

  it("skips creation when arrivalGeofenceEnabled is false", async () => {
    const { service, prisma, settings } = makeService();
    (settings.getOrCreate as jest.Mock).mockResolvedValue({
      ...SETTINGS_DEFAULT,
      arrivalGeofenceEnabled: false,
    });

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.dispatch.findFirst).not.toHaveBeenCalled();
    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("skips and warns when PICKUP coordinates are missing (null)", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue({
      ...DISPATCH_ROW,
      order: { ...DISPATCH_ROW.order, pickupLat: null, pickupLng: null },
    });

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it("skips and warns when DELIVERY coordinates are missing (null)", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue({
      ...DISPATCH_ROW,
      order: { ...DISPATCH_ROW.order, deliveryLat: null, deliveryLng: null },
    });

    await service.createForDispatch("org-1", "disp-1", "DELIVERY");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("skips and warns when coordinates are (0,0) — null island", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue({
      ...DISPATCH_ROW,
      order: {
        ...DISPATCH_ROW.order,
        pickupLat: new Prisma.Decimal("0"),
        pickupLng: new Prisma.Decimal("0"),
      },
    });

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it("uses the configured radius from settings", async () => {
    const { service, prisma, settings } = makeService();
    (settings.getOrCreate as jest.Mock).mockResolvedValue({
      ...SETTINGS_DEFAULT,
      arrivalGeofenceRadiusM: 300,
    });
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ radiusM: 300 }) }),
    );
  });

  it("is idempotent — does not create a duplicate when an active fence exists", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue({ id: "existing-geo" });

    await service.createForDispatch("org-1", "disp-1", "PICKUP");
    // Call a second time to confirm still idempotent
    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("enforces organization isolation — dispatch not in org is skipped", async () => {
    const { service, prisma } = makeService();
    // findFirst returns null because the WHERE includes organizationId
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForDispatch("org-other", "disp-1", "PICKUP");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it("sets name using dispatch number and arrival type", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Auto-arrival: DP-0001 pickup" }),
      }),
    );
  });

  it("sets expiresAt 24h after the scheduled pickup date", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    const expectedExpiry = new Date(DISPATCH_ROW.pickupDateScheduled.getTime() + 24 * 60 * 60 * 1000);
    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: expectedExpiry }),
      }),
    );
  });

  it("invalidates the active-geofence cache after creating a fence", async () => {
    const { service, prisma } = makeService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);

    // Prime the cache with a fake entry so we can detect deletion.
    const cache = (service as unknown as { activeCache: Map<string, unknown> }).activeCache;
    cache.set("org-1", { value: [], expiresAt: Date.now() + 30_000 });

    await service.createForDispatch("org-1", "disp-1", "PICKUP");

    expect(cache.has("org-1")).toBe(false);
  });
});

describe("GeofenceService — archiveForDispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("archives the active PICKUP auto-geofence for the dispatch", async () => {
    const { service, prisma } = makeService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await service.archiveForDispatch("org-1", "disp-1", "PICKUP");

    expect(prisma.geofence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          linkedDispatchId: "disp-1",
          category: AUTO_ARRIVAL_PICKUP_CATEGORY,
          autoCreated: true,
          archivedAt: null,
        }),
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect((prisma.geofence.updateMany as jest.Mock).mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });

  it("archives the active DELIVERY auto-geofence for the dispatch", async () => {
    const { service, prisma } = makeService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await service.archiveForDispatch("org-1", "disp-1", "DELIVERY");

    expect(prisma.geofence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: AUTO_ARRIVAL_DELIVERY_CATEGORY }),
      }),
    );
  });

  it("invalidates the cache when fences were archived", async () => {
    const { service, prisma } = makeService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const cache = (service as unknown as { activeCache: Map<string, unknown> }).activeCache;
    cache.set("org-1", { value: [], expiresAt: Date.now() + 30_000 });

    await service.archiveForDispatch("org-1", "disp-1", "PICKUP");

    expect(cache.has("org-1")).toBe(false);
  });

  it("does NOT invalidate the cache when no fences were matched", async () => {
    const { service, prisma } = makeService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const cache = (service as unknown as { activeCache: Map<string, unknown> }).activeCache;
    cache.set("org-1", { value: [], expiresAt: Date.now() + 30_000 });

    await service.archiveForDispatch("org-1", "disp-1", "PICKUP");

    expect(cache.has("org-1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleAutoArrivalEnter — Phase 2 Step 2 (GPS-triggered auto-arrival)
// ---------------------------------------------------------------------------

function makeAutoArrivalService() {
  const txFn = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
    fn({
      dispatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dispatchStop: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dispatchStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
    }),
  );

  const prisma = {
    dispatch: { findFirst: jest.fn() },
    geofence: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "geo-1" }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    },
    $transaction: txFn,
  } as unknown as PrismaService;

  const wfEvents = { emit: jest.fn() } as unknown as WorkflowEventService;

  const service = new GeofenceService(
    prisma,
    { log: jest.fn() } as unknown as AuditService,
    wfEvents,
    { publish: jest.fn() } as unknown as TelematicsRealtimeService,
    { raise: jest.fn() } as unknown as AlertService,
    { getOrCreate: jest.fn().mockResolvedValue(SETTINGS_DEFAULT) } as unknown as TelematicsSettingsService,
  );

  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

  return { service, prisma, wfEvents, txFn };
}

const BASE_CTX: Parameters<typeof GeofenceService.prototype.evaluate>[0] = {
  organizationId: "org-1",
  vehicleId: "veh-1",
  driverId: "drv-1",
  tripId: null,
  previous: { latitude: 41.2990, longitude: 69.2380 },
  current: { latitude: 41.2995, longitude: 69.2401 },
  occurredAt: new Date("2041-06-01T10:00:00Z"),
  alertsEnabled: false,
  vehicleLabel: "01 AA 123",
};

const PICKUP_FENCE = {
  id: "fence-pickup",
  organizationId: "org-1",
  name: "Auto-arrival: DP-0001 pickup",
  type: "CIRCLE",
  active: true,
  autoCreated: true,
  linkedDispatchId: "disp-1",
  category: AUTO_ARRIVAL_PICKUP_CATEGORY,
  centerLat: 41.2995,
  centerLng: 69.2401,
  radiusM: 150,
  alertOnEnter: false,
  alertOnExit: false,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Geofence;

const DELIVERY_FENCE = {
  ...PICKUP_FENCE,
  id: "fence-delivery",
  name: "Auto-arrival: DP-0001 delivery",
  category: AUTO_ARRIVAL_DELIVERY_CATEGORY,
  centerLat: 39.6542,
  centerLng: 66.9597,
} as unknown as Geofence;

const DISPATCH_WITH_DRIVER = {
  id: "disp-1",
  orderId: "order-1",
  driver: { userId: "user-drv-1" },
};

type AutoArrivalFn = (ctx: typeof BASE_CTX, fence: Geofence) => Promise<void>;

describe("GeofenceService — handleAutoArrivalEnter (Phase 2 Step 2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pickup fence ENTER advances dispatch EN_ROUTE_TO_PICKUP → AT_PICKUP", async () => {
    const { service, prisma, txFn } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(prisma.dispatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "EN_ROUTE_TO_PICKUP" }),
    }));
    expect(txFn).toHaveBeenCalled();
  });

  it("delivery fence ENTER advances dispatch IN_TRANSIT → ARRIVED_AT_DELIVERY", async () => {
    const { service, prisma, txFn } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, DELIVERY_FENCE);

    expect(prisma.dispatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "IN_TRANSIT" }),
    }));
    expect(txFn).toHaveBeenCalled();
  });

  it("creates a driver notification with the correct type and metadata", async () => {
    const { service, prisma } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "DRIVER_AUTO_ARRIVED_PICKUP",
        category: "OPERATIONS",
        entityId: "disp-1",
        metadata: expect.objectContaining({ forDriverUserId: "user-drv-1" }),
      }),
    }));
  });

  it("is idempotent — returns early when dispatch is not in expected status", async () => {
    const { service, prisma, txFn } = makeAutoArrivalService();
    // findFirst returns null → dispatch already transitioned or wrong status
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(null);

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(txFn).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("suppresses duplicate notification when one already exists", async () => {
    const { service, prisma } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue({ id: "dup-notif" });

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("skips notification when driver has no userId", async () => {
    const { service, prisma } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue({ id: "disp-1", orderId: "order-1", driver: { userId: null } });

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("archives the delivery fence after delivery auto-arrival", async () => {
    const { service, prisma } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, DELIVERY_FENCE);

    expect(prisma.geofence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ category: AUTO_ARRIVAL_DELIVERY_CATEGORY }),
    }));
  });

  it("does NOT archive a pickup fence on pickup arrival (it stays until IN_TRANSIT)", async () => {
    const { service, prisma } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(prisma.geofence.updateMany).not.toHaveBeenCalled();
  });

  it("ignores a non-auto-arrival category fence", async () => {
    const { service, prisma, txFn } = makeAutoArrivalService();
    const manualFence = { ...PICKUP_FENCE, category: "DEPOT", autoCreated: false } as unknown as Geofence;

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, manualFence);

    expect(prisma.dispatch.findFirst).not.toHaveBeenCalled();
    expect(txFn).not.toHaveBeenCalled();
  });

  it("emits dispatch.auto_arrived workflow event after transition", async () => {
    const { service, prisma, wfEvents } = makeAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_WITH_DRIVER);

    await (service as unknown as { handleAutoArrivalEnter: AutoArrivalFn }).handleAutoArrivalEnter(BASE_CTX, PICKUP_FENCE);

    expect(wfEvents.emit).toHaveBeenCalledWith("org-1", "dispatch.auto_arrived", expect.objectContaining({
      dispatchId: "disp-1",
      arrivalType: "PICKUP",
      toStatus: "AT_PICKUP",
    }));
  });
});

// ---------------------------------------------------------------------------
// Phase 5E-2 — createForDispatch("INTERMEDIATE") and archiveIntermediateStopForDispatch
// ---------------------------------------------------------------------------

import { AUTO_ARRIVAL_INTERMEDIATE_CATEGORY } from "./geofence.service";

const INTERMEDIATE_STOP = {
  id: "stop-1",
  stopIndex: 1,
  lat: new Prisma.Decimal("41.3100"),
  lng: new Prisma.Decimal("69.2600"),
};

const DISPATCH_ROW_WITH_NUMBER = {
  ...DISPATCH_ROW,
  dispatchNumber: "DP-0001",
};

function makeIntermediateService() {
  const prisma = {
    dispatch: { findFirst: jest.fn() },
    dispatchStop: { findFirst: jest.fn() },
    geofence: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "geo-intermediate" }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  const settings = {
    getOrCreate: jest.fn().mockResolvedValue(SETTINGS_DEFAULT),
  } as unknown as TelematicsSettingsService;

  const service = new GeofenceService(
    prisma,
    { log: jest.fn() } as unknown as AuditService,
    { emit: jest.fn() } as unknown as WorkflowEventService,
    { publish: jest.fn() } as unknown as TelematicsRealtimeService,
    { raise: jest.fn() } as unknown as AlertService,
    settings,
  );

  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

  return { service, prisma, settings };
}

describe("GeofenceService — createForDispatch('INTERMEDIATE')", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a fence for the intermediate stop when coordinates are valid", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW_WITH_NUMBER);

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", INTERMEDIATE_STOP);

    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          type: "CIRCLE",
          category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
          autoCreated: true,
          linkedDispatchId: "disp-1",
          linkedDispatchStopId: "stop-1",
          centerLat: 41.31,
          centerLng: 69.26,
          radiusM: 150,
          active: true,
          alertOnEnter: false,
          alertOnExit: false,
        }),
      }),
    );
  });

  it("skips when arrivalGeofenceEnabled is false", async () => {
    const { service, prisma, settings } = makeIntermediateService();
    (settings.getOrCreate as jest.Mock).mockResolvedValue({ ...SETTINGS_DEFAULT, arrivalGeofenceEnabled: false });

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", INTERMEDIATE_STOP);

    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("skips and warns when coordinates are null", async () => {
    const { service, prisma } = makeIntermediateService();
    const nullStop = { ...INTERMEDIATE_STOP, lat: null, lng: null };

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", nullStop);

    expect(prisma.geofence.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it("skips and warns when coordinates are (0,0)", async () => {
    const { service, prisma } = makeIntermediateService();
    const zeroStop = { ...INTERMEDIATE_STOP, lat: new Prisma.Decimal("0"), lng: new Prisma.Decimal("0") };

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", zeroStop);

    expect(prisma.geofence.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it("is idempotent — skips creation when an active fence for this stop already exists", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue({ id: "existing" });

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", INTERMEDIATE_STOP);

    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("idempotency check uses linkedDispatchStopId for per-stop uniqueness", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW_WITH_NUMBER);

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", INTERMEDIATE_STOP);

    expect(prisma.geofence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          linkedDispatchStopId: "stop-1",
          category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
          autoCreated: true,
          archivedAt: null,
        }),
      }),
    );
  });

  it("skips when no stop provided", async () => {
    const { service, prisma } = makeIntermediateService();

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it("uses stopIndex in the fence name", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW_WITH_NUMBER);

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", INTERMEDIATE_STOP);

    expect(prisma.geofence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Auto-arrival: DP-0001 stop 1" }),
      }),
    );
  });

  it("invalidates the active-geofence cache after creating a fence", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW_WITH_NUMBER);

    const cache = (service as unknown as { activeCache: Map<string, unknown> }).activeCache;
    cache.set("org-1", { value: [], expiresAt: Date.now() + 30_000 });

    await service.createForDispatch("org-1", "disp-1", "INTERMEDIATE", INTERMEDIATE_STOP);

    expect(cache.has("org-1")).toBe(false);
  });
});

describe("GeofenceService — createForNextIntermediateStop", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a fence for the first unvisited intermediate stop", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(INTERMEDIATE_STOP);
    (prisma.geofence.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_ROW_WITH_NUMBER);

    await service.createForNextIntermediateStop("org-1", "disp-1");

    expect(prisma.dispatchStop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dispatchId: "disp-1",
          stopType: "INTERMEDIATE",
          arrivedAt: null,
          failedAt: null,
        }),
        orderBy: { stopIndex: "asc" },
      }),
    );
    expect(prisma.geofence.create).toHaveBeenCalled();
  });

  it("no-ops when no unvisited intermediate stop exists", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForNextIntermediateStop("org-1", "disp-1");

    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("skips when arrivalGeofenceEnabled is false", async () => {
    const { service, prisma, settings } = makeIntermediateService();
    (settings.getOrCreate as jest.Mock).mockResolvedValue({ ...SETTINGS_DEFAULT, arrivalGeofenceEnabled: false });

    await service.createForNextIntermediateStop("org-1", "disp-1");

    expect(prisma.dispatchStop.findFirst).not.toHaveBeenCalled();
    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });

  it("skips failed stops — queries only arrivedAt:null failedAt:null", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(null);

    await service.createForNextIntermediateStop("org-1", "disp-1");

    // The query itself filters out failed/arrived stops; returning null means no eligible stop.
    expect(prisma.geofence.create).not.toHaveBeenCalled();
  });
});

describe("GeofenceService — archiveIntermediateStopForDispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("archives the active intermediate fence for the dispatch", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await service.archiveIntermediateStopForDispatch("org-1", "disp-1");

    expect(prisma.geofence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          linkedDispatchId: "disp-1",
          category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
          autoCreated: true,
          archivedAt: null,
        }),
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect((prisma.geofence.updateMany as jest.Mock).mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });

  it("no-ops and does not touch cache when no active fence exists", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const cache = (service as unknown as { activeCache: Map<string, unknown> }).activeCache;
    cache.set("org-1", { value: [], expiresAt: Date.now() + 30_000 });

    await service.archiveIntermediateStopForDispatch("org-1", "disp-1");

    expect(cache.has("org-1")).toBe(true);
  });

  it("invalidates cache when a fence was archived", async () => {
    const { service, prisma } = makeIntermediateService();
    (prisma.geofence.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const cache = (service as unknown as { activeCache: Map<string, unknown> }).activeCache;
    cache.set("org-1", { value: [], expiresAt: Date.now() + 30_000 });

    await service.archiveIntermediateStopForDispatch("org-1", "disp-1");

    expect(cache.has("org-1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 5E-2 — handleAutoArrivalIntermediate (GPS → IN_TRANSIT → AT_STOP)
// ---------------------------------------------------------------------------

const INTERMEDIATE_FENCE = {
  ...PICKUP_FENCE,
  id: "fence-stop-1",
  name: "Auto-arrival: DP-0001 stop 1",
  category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
  linkedDispatchId: "disp-1",
  linkedDispatchStopId: "stop-1",
} as unknown as Geofence;

const DISPATCH_IN_TRANSIT = {
  id: "disp-1",
  driver: { userId: "user-drv-1" },
};

const CURRENT_STOP_ROW = {
  id: "stop-1",
  stopIndex: 1,
};

function makeIntermediateAutoArrivalService() {
  const updateManyDispatch = jest.fn().mockResolvedValue({ count: 1 });
  const updateManyStop = jest.fn().mockResolvedValue({ count: 1 });
  const createHistory = jest.fn().mockResolvedValue({});

  const txFn = jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
    fn({
      dispatch: { updateMany: updateManyDispatch },
      dispatchStop: { updateMany: updateManyStop },
      dispatchStatusHistory: { create: createHistory },
    }),
  );

  const prisma = {
    dispatch: { findFirst: jest.fn() },
    dispatchStop: { findFirst: jest.fn() },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    },
    geofence: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: txFn,
  } as unknown as PrismaService;

  const wfEvents = { emit: jest.fn() } as unknown as WorkflowEventService;

  const service = new GeofenceService(
    prisma,
    { log: jest.fn() } as unknown as AuditService,
    wfEvents,
    { publish: jest.fn() } as unknown as TelematicsRealtimeService,
    { raise: jest.fn() } as unknown as AlertService,
    { getOrCreate: jest.fn().mockResolvedValue(SETTINGS_DEFAULT) } as unknown as TelematicsSettingsService,
  );

  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

  return { service, prisma, wfEvents, txFn, updateManyDispatch, updateManyStop, createHistory };
}

type IntermediateFn = (ctx: typeof BASE_CTX, fence: Geofence) => Promise<void>;

describe("GeofenceService — handleAutoArrivalIntermediate (Phase 5E-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("transitions dispatch IN_TRANSIT → AT_STOP on ENTER of current stop fence", async () => {
    const { service, prisma, txFn, updateManyDispatch } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(txFn).toHaveBeenCalled();
    expect(updateManyDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "disp-1", status: "IN_TRANSIT" }),
        data: expect.objectContaining({ status: "AT_STOP" }),
      }),
    );
  });

  it("stamps DispatchStop.arrivedAt with the GPS occurredAt timestamp", async () => {
    const { service, prisma, updateManyStop } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(updateManyStop).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "stop-1", arrivedAt: null }),
        data: expect.objectContaining({ arrivedAt: BASE_CTX.occurredAt }),
      }),
    );
  });

  it("creates a dispatchStatusHistory row with note 'Auto-arrival via GPS geofence'", async () => {
    const { service, prisma, createHistory } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(createHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "AT_STOP",
          note: "Auto-arrival via GPS geofence",
        }),
      }),
    );
  });

  it("guard 1: exits immediately when dispatch is not IN_TRANSIT", async () => {
    const { service, prisma, txFn } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(null); // already AT_STOP

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(txFn).not.toHaveBeenCalled();
  });

  it("guard 2: exits when fence stop is not the current active stop", async () => {
    const { service, prisma, txFn } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    // Current stop is stop-2, but fence is for stop-1 (already visited)
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue({ id: "stop-2", stopIndex: 2 });

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(txFn).not.toHaveBeenCalled();
  });

  it("guard 2: exits when no current stop exists (all visited or failed)", async () => {
    const { service, prisma, txFn } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(null);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(txFn).not.toHaveBeenCalled();
  });

  it("race safety: exits cleanly when compare-and-set updateMany returns count 0", async () => {
    const { service, prisma, updateManyDispatch, updateManyStop, createHistory } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);
    updateManyDispatch.mockResolvedValue({ count: 0 }); // race lost

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    // Stop stamp and history must NOT fire when the race is lost
    expect(updateManyStop).not.toHaveBeenCalled();
    expect(createHistory).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("creates a driver notification with entityId = stop ID (per-stop dedup)", async () => {
    const { service, prisma } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "DRIVER_AUTO_ARRIVED_STOP",
          entityId: "stop-1",
          metadata: expect.objectContaining({ forDriverUserId: "user-drv-1", stopId: "stop-1" }),
        }),
      }),
    );
  });

  it("suppresses duplicate notification when one already exists for this stop", async () => {
    const { service, prisma } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue({ id: "existing-notif" });

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("skips notification when driver has no userId", async () => {
    const { service, prisma } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue({ id: "disp-1", driver: { userId: null } });
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("does NOT archive the intermediate fence on AT_STOP (fence stays active while AT_STOP)", async () => {
    const { service, prisma } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    // geofence.updateMany is archiveIntermediateStopForDispatch — must NOT be called
    expect(prisma.geofence.updateMany).not.toHaveBeenCalled();
  });

  it("emits dispatch.auto_arrived with arrivalType INTERMEDIATE", async () => {
    const { service, prisma, wfEvents } = makeIntermediateAutoArrivalService();
    (prisma.dispatch.findFirst as jest.Mock).mockResolvedValue(DISPATCH_IN_TRANSIT);
    (prisma.dispatchStop.findFirst as jest.Mock).mockResolvedValue(CURRENT_STOP_ROW);

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, INTERMEDIATE_FENCE);

    expect(wfEvents.emit).toHaveBeenCalledWith("org-1", "dispatch.auto_arrived", expect.objectContaining({
      dispatchId: "disp-1",
      arrivalType: "INTERMEDIATE",
      toStatus: "AT_STOP",
      stopId: "stop-1",
    }));
  });

  it("exits immediately when fence has no linkedDispatchStopId", async () => {
    const { service, prisma, txFn } = makeIntermediateAutoArrivalService();
    const noStopFence = { ...INTERMEDIATE_FENCE, linkedDispatchStopId: null } as unknown as Geofence;

    await (service as unknown as { handleAutoArrivalEnter: IntermediateFn }).handleAutoArrivalEnter(BASE_CTX, noStopFence);

    expect(prisma.dispatch.findFirst).not.toHaveBeenCalled();
    expect(txFn).not.toHaveBeenCalled();
  });
});
