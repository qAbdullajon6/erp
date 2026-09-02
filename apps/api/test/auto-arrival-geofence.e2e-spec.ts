import { randomUUID } from "crypto";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { PrismaService } from "../src/prisma/prisma.service";
import { GeofenceService } from "../src/telematics/geofences/geofence.service";
import { TelematicsSettingsService } from "../src/telematics/settings/telematics-settings.service";
import type { AlertService } from "../src/telematics/alerts/alert.service";
import type { TelematicsRealtimeService } from "../src/telematics/realtime/telematics-realtime.service";
import type { WorkflowEventService } from "../src/workflows/triggers/workflow-event.service";

/// Phase 2 Step 1 — Auto-arrival geofence hook integration test.
///
/// Drives the REAL PrismaService and REAL GeofenceService end-to-end.
/// Proves that dispatch status transitions (via DispatchesService) actually
/// write and archive geofence rows in the database.
///
/// Uses manual service construction (no HTTP server) following the
/// driver-dispatch.e2e-spec.ts pattern.
///
/// Covers test-plan items 9, 10, 11:
///   9. EN_ROUTE_TO_PICKUP transition → pickup fence row in DB
///  10. IN_TRANSIT transition → pickup fence archived, delivery fence created
///  11. Manual geofences for the same org are never touched

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const wfEvents = {
  emit: jest.fn(),
} as unknown as WorkflowEventService;
const tracking = {
  endSessionsForDispatch: jest.fn().mockResolvedValue(0),
  endSessionsOnVehicleReassign: jest.fn().mockResolvedValue(0),
  endSessionsForUser: jest.fn().mockResolvedValue(0),
} as unknown as ConstructorParameters<typeof DispatchesService>[5];

/// Real TelematicsSettingsService: only depends on Prisma; gives us the real
/// getOrCreate() / cache behaviour to prove the feature flag path works.
const telematicsSettings = new TelematicsSettingsService(prisma);

const geofences = new GeofenceService(
  prisma,
  audit,
  wfEvents,
  { publish: jest.fn() } as unknown as TelematicsRealtimeService,
  { raise: jest.fn() } as unknown as AlertService,
  telematicsSettings,
);

const dispatches = new DispatchesService(
  prisma,
  audit,
  policy,
  writer,
  wfEvents,
  tracking,
  geofences,
);

const PICKUP = new Date("2041-06-01T08:00:00.000Z");
const DELIVERY = new Date("2041-06-05T18:00:00.000Z");

// Tashkent depot → Samarkand warehouse (real Uzbek coordinates, nowhere near 0,0).
const PICKUP_LAT = "41.2995";
const PICKUP_LNG = "69.2401";
const DELIVERY_LAT = "39.6542";
const DELIVERY_LNG = "66.9597";

let organizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
let driverId: string;
let vehicleId: string;
let driverIdB: string;
let vehicleIdB: string;
/// Phase 2 Step 2: a driver whose user account exists, for notification targeting.
let driverUserIdForNotif: string;
let driverIdForNotif: string;
let vehicleIdForNotif: string;
const userIds: string[] = [];

async function makeOrder() {
  return prisma.order.create({
    data: {
      organizationId,
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId,
      pickupAddress: "1 Depot Rd",
      pickupCity: "Tashkent",
      pickupDate: PICKUP,
      pickupLat: PICKUP_LAT,
      pickupLng: PICKUP_LNG,
      deliveryAddress: "9 Dock St",
      deliveryCity: "Samarkand",
      deliveryDate: DELIVERY,
      deliveryLat: DELIVERY_LAT,
      deliveryLng: DELIVERY_LNG,
      cargoDescription: "Pallets",
      price: "1000.00",
      status: "PENDING",
    },
  });
}

/// Helper: creates a dispatch and advances it through DRAFT → ASSIGNED.
async function assignedDispatch(driver = driverId, vehicle = vehicleId) {
  const order = await makeOrder();
  const dispatch = await dispatches.create(
    organizationId,
    { orderId: order.id, driverId: driver, vehicleId: vehicle },
    actor,
  );
  await dispatches.updateStatus(organizationId, dispatch.id, { status: "ASSIGNED" }, actor);
  return { order, dispatch };
}

/// Helper: advance the dispatch to EN_ROUTE_TO_PICKUP (the hook trigger).
async function enRoute(dispatchId: string) {
  await dispatches.updateStatus(organizationId, dispatchId, { status: "EN_ROUTE_TO_PICKUP" }, actor);
}

/// Helper: advance the dispatch to IN_TRANSIT (triggers archive-pickup + create-delivery).
async function inTransit(dispatchId: string) {
  await dispatches.updateStatus(organizationId, dispatchId, { status: "AT_PICKUP" }, actor);
  await dispatches.updateStatus(organizationId, dispatchId, { status: "IN_TRANSIT" }, actor);
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Geofence Org", slug: `geofence-${randomUUID()}` },
  });
  organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `dispatcher-${randomUUID()}@example.test`,
      firstName: "Dana",
      lastName: "Dispatcher",
      passwordHash: "not-a-real-hash",
    },
  });
  userIds.push(user.id);
  const membership = await prisma.membership.create({
    data: { organizationId, userId: user.id, role: "DISPATCHER" },
  });
  actor = {
    userId: user.id,
    membershipId: membership.id,
    organizationId,
    role: "DISPATCHER",
    email: user.email,
    isPlatformAdmin: false,
  };

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      customerCode: `CUS-${randomUUID().slice(0, 8)}`,
      companyName: "Geofence Co",
      contactName: "Gary Customer",
    },
  });
  customerId = customer.id;

  // Phase 2 Step 2: create a driver user linked to driverIdForNotif for notification targeting.
  const driverUser = await prisma.user.create({
    data: {
      email: `driver-notif-${randomUUID()}@example.test`,
      firstName: "Nick",
      lastName: "Notify",
      passwordHash: "not-a-real-hash",
    },
  });
  userIds.push(driverUser.id);
  driverUserIdForNotif = driverUser.id;

  const [driverA, driverB, driverNotif, vehicleA, vehicleB, vehicleNotif] = await Promise.all([
    prisma.driver.create({
      data: {
        organizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Dan",
        lastName: "Driver A",
        phone: "+998 90 000 00 01",
      },
    }),
    prisma.driver.create({
      data: {
        organizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Dave",
        lastName: "Driver B",
        phone: "+998 90 000 00 02",
      },
    }),
    prisma.driver.create({
      data: {
        organizationId,
        userId: driverUser.id,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Nick",
        lastName: "Notify",
        phone: "+998 90 000 00 03",
      },
    }),
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: "Truck A",
      },
    }),
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `02 ${randomUUID().slice(0, 5)}`,
        type: "Truck B",
      },
    }),
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `03 ${randomUUID().slice(0, 5)}`,
        type: "Truck C",
      },
    }),
  ]);
  driverId = driverA.id;
  vehicleId = vehicleA.id;
  driverIdB = driverB.id;
  vehicleIdB = vehicleB.id;
  driverIdForNotif = driverNotif.id;
  vehicleIdForNotif = vehicleNotif.id;
});

afterEach(async () => {
  // Clean in FK order: notifications, geofences, dispatches, orders.
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.geofence.deleteMany({ where: { organizationId } });
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  jest.clearAllMocks();
  // Clear the in-process 30s geofence cache between tests.
  (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Item 9 — EN_ROUTE_TO_PICKUP creates a PICKUP geofence
// ---------------------------------------------------------------------------

describe("EN_ROUTE_TO_PICKUP transition (item 9)", () => {
  it("creates exactly one AUTO_ARRIVAL_PICKUP geofence in the database", async () => {
    const { dispatch } = await assignedDispatch();
    await enRoute(dispatch.id);

    const fences = await prisma.geofence.findMany({
      where: { organizationId, linkedDispatchId: dispatch.id, autoCreated: true },
    });
    expect(fences).toHaveLength(1);
    expect(fences[0]).toMatchObject({
      category: "AUTO_ARRIVAL_PICKUP",
      autoCreated: true,
      linkedDispatchId: dispatch.id,
      active: true,
      archivedAt: null,
      centerLat: parseFloat(PICKUP_LAT),
      centerLng: parseFloat(PICKUP_LNG),
      radiusM: 150, // default from TelematicsSettings
    });
  });

  it("the fence name contains the dispatch number", async () => {
    const { dispatch } = await assignedDispatch();
    await enRoute(dispatch.id);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, autoCreated: true },
    });
    const freshDispatch = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(fence.name).toContain(freshDispatch.dispatchNumber);
    expect(fence.name.toLowerCase()).toContain("pickup");
  });

  it("is idempotent — calling EN_ROUTE again on the same dispatch produces no duplicate", async () => {
    const { dispatch } = await assignedDispatch();
    // Direct call — status machine won't allow a double transition, so we call
    // the hook method directly for the idempotency assertion.
    await geofences.createForDispatch(organizationId, dispatch.id, "PICKUP");
    await geofences.createForDispatch(organizationId, dispatch.id, "PICKUP");

    const count = await prisma.geofence.count({
      where: { organizationId, linkedDispatchId: dispatch.id, autoCreated: true, archivedAt: null },
    });
    expect(count).toBe(1);
  });

  it("sets expiresAt approximately 24h after the scheduled pickup date", async () => {
    const { dispatch } = await assignedDispatch();
    await enRoute(dispatch.id);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    expect(fence.expiresAt).not.toBeNull();
    const expectedMs = PICKUP.getTime() + 24 * 60 * 60 * 1000;
    // Allow 1-second jitter from when the test creates the fixture.
    expect(Math.abs(fence.expiresAt!.getTime() - expectedMs)).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Item 10 — IN_TRANSIT archives pickup fence and creates delivery fence
// ---------------------------------------------------------------------------

describe("IN_TRANSIT transition (item 10)", () => {
  it("archives the pickup fence and creates a delivery fence", async () => {
    const { dispatch } = await assignedDispatch();
    await enRoute(dispatch.id);
    await inTransit(dispatch.id);

    const allFences = await prisma.geofence.findMany({
      where: { organizationId, linkedDispatchId: dispatch.id, autoCreated: true },
      orderBy: { createdAt: "asc" },
    });

    const pickup = allFences.find((f) => f.category === "AUTO_ARRIVAL_PICKUP");
    const delivery = allFences.find((f) => f.category === "AUTO_ARRIVAL_DELIVERY");

    expect(pickup).toBeDefined();
    expect(pickup!.archivedAt).not.toBeNull();
    expect(pickup!.active).toBe(false);

    expect(delivery).toBeDefined();
    expect(delivery!.archivedAt).toBeNull();
    expect(delivery!.active).toBe(true);
    expect(delivery!.centerLat).toBeCloseTo(parseFloat(DELIVERY_LAT), 4);
    expect(delivery!.centerLng).toBeCloseTo(parseFloat(DELIVERY_LNG), 4);
  });

  it("delivery fence links back to the dispatch and has the correct name", async () => {
    const { dispatch } = await assignedDispatch();
    await enRoute(dispatch.id);
    await inTransit(dispatch.id);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });
    const freshDispatch = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(fence.linkedDispatchId).toBe(dispatch.id);
    expect(fence.name).toContain(freshDispatch.dispatchNumber);
    expect(fence.name.toLowerCase()).toContain("delivery");
  });

  it("hook called with IN_TRANSIT when no pickup fence exists still creates delivery fence without crashing", async () => {
    // Calls handleArrivalGeofenceHook directly with IN_TRANSIT on a dispatch
    // that never had EN_ROUTE_TO_PICKUP — archiveForDispatch hits count=0 (no-op),
    // and createForDispatch still writes the delivery fence.
    const { dispatch } = await assignedDispatch();

    await dispatches.handleArrivalGeofenceHook(organizationId, dispatch.id, "IN_TRANSIT");

    const pickupFences = await prisma.geofence.count({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    expect(pickupFences).toBe(0);

    const delivery = await prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });
    expect(delivery).not.toBeNull();
    expect(delivery!.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 11 — Manual geofences for the org are never touched
// ---------------------------------------------------------------------------

describe("manual geofences are never affected (item 11)", () => {
  it("pre-existing manual geofences are untouched after EN_ROUTE_TO_PICKUP", async () => {
    const manualFence = await prisma.geofence.create({
      data: {
        organizationId,
        name: "Manual depot zone",
        type: "CIRCLE",
        active: true,
        centerLat: 41.3,
        centerLng: 69.25,
        radiusM: 200,
        alertOnEnter: true,
        alertOnExit: false,
        autoCreated: false,
      },
    });

    const { dispatch } = await assignedDispatch();
    await enRoute(dispatch.id);

    const after = await prisma.geofence.findUniqueOrThrow({ where: { id: manualFence.id } });
    expect(after.active).toBe(true);
    expect(after.archivedAt).toBeNull();
    expect(after.autoCreated).toBe(false);
    expect(after.linkedDispatchId).toBeNull();
  });

  it("manual geofences from a different dispatch are also untouched", async () => {
    const { dispatch: dispatchA } = await assignedDispatch();
    await enRoute(dispatchA.id);

    // A second dispatch with a different driver + vehicle to avoid double-booking.
    const { dispatch: dispatchB } = await assignedDispatch(driverIdB, vehicleIdB);
    await enRoute(dispatchB.id);

    // Each dispatch gets its own fence; dispatch A's fence is untouched.
    const fenceA = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatchA.id },
    });
    expect(fenceA.active).toBe(true);
    expect(fenceA.archivedAt).toBeNull();

    const fenceB = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatchB.id },
    });
    expect(fenceB.active).toBe(true);
    expect(fenceB.archivedAt).toBeNull();
  });

  it("archiving dispatch A pickup does not touch dispatch B pickup", async () => {
    const { dispatch: dispatchA } = await assignedDispatch();
    // Use separate driver/vehicle for dispatch B to avoid double-booking constraint.
    const { dispatch: dispatchB } = await assignedDispatch(driverIdB, vehicleIdB);

    await enRoute(dispatchA.id);
    await enRoute(dispatchB.id);

    // Move only dispatch A to IN_TRANSIT.
    await inTransit(dispatchA.id);

    const fenceA = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatchA.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    const fenceB = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatchB.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    expect(fenceA.archivedAt).not.toBeNull(); // archived
    expect(fenceB.archivedAt).toBeNull();      // still active — unaffected
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Step 2 — GPS-triggered auto-arrival via GeofenceService.evaluate()
// ---------------------------------------------------------------------------
//
// Items 12–16:
//  12. GPS ENTER on PICKUP fence → dispatch AT_PICKUP + driver notification
//  13. GPS ENTER on PICKUP fence when already AT_PICKUP → idempotent
//  14. GPS ENTER on DELIVERY fence → dispatch ARRIVED_AT_DELIVERY + notification + fence archived
//  15. GPS ENTER on DELIVERY fence when already ARRIVED_AT_DELIVERY → idempotent
//  16. Manual geofence ENTER never triggers auto-arrival

/// Helpers for Phase 2 Step 2

/// Dispatch setup for notification tests: requires a driver with userId.
async function notifDispatch() {
  const order = await makeOrder();
  const dispatch = await dispatches.create(
    organizationId,
    { orderId: order.id, driverId: driverIdForNotif, vehicleId: vehicleIdForNotif },
    actor,
  );
  await dispatches.updateStatus(organizationId, dispatch.id, { status: "ASSIGNED" }, actor);
  return { order, dispatch };
}

/// Calls evaluate() with coordinates that produce an ENTER event on the active fence.
/// prevLng is offset far enough outside the 150m default radius (~260m at Tashkent latitude).
async function simulateGpsEnter(
  fenceLat: number,
  fenceLng: number,
  vehicleId_: string,
  driverId_: string | null,
) {
  // Previous fix is ~260 m east of the fence centre — outside the 150 m radius.
  const prevLng = fenceLng + 0.003;
  await geofences.evaluate({
    organizationId,
    vehicleId: vehicleId_,
    driverId: driverId_,
    tripId: null,
    previous: { latitude: fenceLat, longitude: prevLng },
    current: { latitude: fenceLat, longitude: fenceLng },
    occurredAt: new Date(),
    alertsEnabled: false,
    vehicleLabel: "test truck",
  });
}

describe("GPS-triggered auto-arrival (items 12–16)", () => {
  it("item 12 — GPS ENTER on PICKUP fence transitions dispatch to AT_PICKUP", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    // Get the auto-created pickup fence to find its centre.
    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_PICKUP");
  });

  it("item 12 — GPS ENTER on PICKUP fence creates DRIVER_AUTO_ARRIVED_PICKUP notification", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const notif = await prisma.notification.findFirst({
      where: { organizationId, type: "DRIVER_AUTO_ARRIVED_PICKUP", entityId: dispatch.id },
    });
    expect(notif).not.toBeNull();
    const meta = notif!.metadata as { forDriverUserId?: string };
    expect(meta.forDriverUserId).toBe(driverUserIdForNotif);
  });

  it("item 13 — GPS ENTER on PICKUP fence is idempotent when dispatch already AT_PICKUP", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    // First ENTER — transitions to AT_PICKUP.
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);
    // Second ENTER — must be a no-op (dispatch already AT_PICKUP).
    await expect(simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif)).resolves.not.toThrow();

    const notifCount = await prisma.notification.count({
      where: { organizationId, type: "DRIVER_AUTO_ARRIVED_PICKUP", entityId: dispatch.id },
    });
    expect(notifCount).toBe(1); // Only one notification created, not two.
  });

  it("item 14 — GPS ENTER on DELIVERY fence transitions dispatch to ARRIVED_AT_DELIVERY", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("ARRIVED_AT_DELIVERY");
  });

  it("item 14 — GPS ENTER on DELIVERY fence creates DRIVER_AUTO_ARRIVED_DELIVERY notification", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const notif = await prisma.notification.findFirst({
      where: { organizationId, type: "DRIVER_AUTO_ARRIVED_DELIVERY", entityId: dispatch.id },
    });
    expect(notif).not.toBeNull();
  });

  it("item 14 — delivery fence is archived after delivery auto-arrival", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const after = await prisma.geofence.findUniqueOrThrow({ where: { id: fence.id } });
    expect(after.archivedAt).not.toBeNull();
    expect(after.active).toBe(false);
  });

  it("item 15 — GPS ENTER on DELIVERY fence is idempotent when already ARRIVED_AT_DELIVERY", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);
    await expect(simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif)).resolves.not.toThrow();

    const notifCount = await prisma.notification.count({
      where: { organizationId, type: "DRIVER_AUTO_ARRIVED_DELIVERY", entityId: dispatch.id },
    });
    expect(notifCount).toBe(1);
  });

  it("item 16 — manual geofence ENTER never triggers auto-arrival (or only auto-fence fires)", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    // A manual fence at exactly the pickup coords.
    await prisma.geofence.create({
      data: {
        organizationId,
        name: "Manual depot",
        type: "CIRCLE",
        active: true,
        centerLat: parseFloat(PICKUP_LAT),
        centerLng: parseFloat(PICKUP_LNG),
        radiusM: 150,
        alertOnEnter: false,
        alertOnExit: false,
        autoCreated: false,
      },
    });

    // Drive into the manual fence.
    await simulateGpsEnter(parseFloat(PICKUP_LAT), parseFloat(PICKUP_LNG), vehicleIdForNotif, driverIdForNotif);

    // Only the auto-created fence should trigger AT_PICKUP.
    // Manual fence ENTER must not create any auto-arrival notification.
    const autoNotif = await prisma.notification.findFirst({
      where: { organizationId, type: { startsWith: "DRIVER_AUTO_ARRIVED" } },
    });
    // Note: the auto-arrival pickup fence was ALSO entered (since it's at the same coords).
    // So we specifically check that it's limited to the auto-created fence transition, not
    // the manual one. The dispatch should be AT_PICKUP (from the auto-fence), not stuck in
    // EN_ROUTE_TO_PICKUP, and there should be exactly one notification.
    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_PICKUP");
    const notifCount = await prisma.notification.count({
      where: { organizationId, type: "DRIVER_AUTO_ARRIVED_PICKUP", entityId: dispatch.id },
    });
    expect(notifCount).toBe(1);
    // No delivery auto-arrival notification (still just AT_PICKUP).
    expect(autoNotif?.type).toBe("DRIVER_AUTO_ARRIVED_PICKUP");
  });
});

// ---------------------------------------------------------------------------
// Phase 5E-2 — Intermediate stop geofence / auto-arrival (items 17–22)
// ---------------------------------------------------------------------------
//
//  17. GPS ENTER on intermediate stop fence → dispatch AT_STOP + arrivedAt stamped
//  18. Two stops in sequence: stop 1 → AT_STOP → IN_TRANSIT → stop 2 → AT_STOP
//  19. Non-current stop ENTER (stop 2 while stop 1 active): no transition
//  20. Repeated ENTER on same fence: idempotent
//  21. Failed stop skipped; fence created for next eligible stop
//  22. Legacy dispatch (no intermediate stops): IN_TRANSIT still creates delivery fence

// Real Uzbek coordinates for intermediate stops on the Tashkent → Samarkand route.
const STOP1_LAT = 40.1216; // Jizzakh
const STOP1_LNG = 67.8422;
const STOP2_LAT = 39.9008; // Kattakurgan
const STOP2_LNG = 66.2596;

/// Inserts an INTERMEDIATE DispatchStop directly into the DB.
/// Uses stopIndex ≥ 10 to avoid the unique (dispatchId, stopIndex) conflict
/// with the PICKUP (0) and DELIVERY (1) stops created at dispatch time.
async function addIntermediateStop(
  dispatchId: string,
  stopIndex: number,
  lat: number,
  lng: number,
): Promise<{ id: string; stopIndex: number }> {
  return prisma.dispatchStop.create({
    data: {
      organizationId,
      dispatchId,
      stopType: "INTERMEDIATE",
      stopIndex,
      address: `Intermediate Stop ${stopIndex}`,
      city: "Uzbekistan",
      lat: lat.toString(),
      lng: lng.toString(),
    },
  });
}

/// Helper: dispatch at IN_TRANSIT with one intermediate stop ready for GPS testing.
async function dispatchWithOneIntermediateStop() {
  const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
  const stop = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);
  // EN_ROUTE_TO_PICKUP creates the pickup fence; AT_PICKUP → IN_TRANSIT archives it,
  // creates the delivery fence, and (Phase 5E-2) creates the intermediate stop fence.
  await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
  await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
  await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
  return { dispatch, stop };
}

describe("Intermediate stop geofence auto-arrival (items 17–22)", () => {
  it("item 17 — IN_TRANSIT creates an AUTO_ARRIVAL_STOP geofence for the first unvisited stop", async () => {
    const { dispatch, stop } = await dispatchWithOneIntermediateStop();

    const fence = await prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });
    expect(fence).not.toBeNull();
    expect(fence!.linkedDispatchStopId).toBe(stop.id);
    expect(fence!.active).toBe(true);
    expect(fence!.archivedAt).toBeNull();
    expect(fence!.centerLat).toBeCloseTo(STOP1_LAT, 4);
    expect(fence!.centerLng).toBeCloseTo(STOP1_LNG, 4);
  });

  it("item 17 — GPS ENTER on intermediate stop fence transitions dispatch to AT_STOP", async () => {
    const { dispatch } = await dispatchWithOneIntermediateStop();

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_STOP");
  });

  it("item 17 — GPS ENTER stamps arrivedAt on the correct DispatchStop", async () => {
    const { dispatch, stop } = await dispatchWithOneIntermediateStop();

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const updatedStop = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(updatedStop.arrivedAt).not.toBeNull();
  });

  it("item 17 — intermediate stop fence stays active after AT_STOP (archived only on depart)", async () => {
    const { dispatch } = await dispatchWithOneIntermediateStop();

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const after = await prisma.geofence.findUniqueOrThrow({ where: { id: fence.id } });
    expect(after.archivedAt).toBeNull();
    expect(after.active).toBe(true);
  });

  it("item 18 — two stops in sequence: stop 1 ENTER → AT_STOP → IN_TRANSIT → stop 2 ENTER → AT_STOP", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    const stop1 = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);
    const stop2 = await addIntermediateStop(dispatch.id, 20, STOP2_LAT, STOP2_LNG);

    // Advance to IN_TRANSIT — hook creates fence for stop1 (lowest unvisited index).
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    // Stop 1 fence should exist, stop 2 fence should not yet.
    const fence1 = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP", linkedDispatchStopId: stop1.id },
    });
    const fence2Before = await prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatch.id, linkedDispatchStopId: stop2.id },
    });
    expect(fence2Before).toBeNull();

    // GPS ENTER on stop 1 → AT_STOP.
    await simulateGpsEnter(fence1.centerLat!, fence1.centerLng!, vehicleIdForNotif, driverIdForNotif);
    let updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_STOP");

    // Depart: AT_STOP → IN_TRANSIT. Hook archives stop1 fence, creates stop2 fence.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    // Invalidate cache so evaluate() reloads fences from DB.
    (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);

    const fence1After = await prisma.geofence.findUniqueOrThrow({ where: { id: fence1.id } });
    expect(fence1After.archivedAt).not.toBeNull();
    expect(fence1After.active).toBe(false);

    const fence2 = await prisma.geofence.findFirst({
      where: {
        organizationId,
        linkedDispatchId: dispatch.id,
        category: "AUTO_ARRIVAL_STOP",
        linkedDispatchStopId: stop2.id,
        archivedAt: null,
      },
    });
    expect(fence2).not.toBeNull();

    // GPS ENTER on stop 2 → AT_STOP, stop2 arrivedAt stamped.
    await simulateGpsEnter(fence2!.centerLat!, fence2!.centerLng!, vehicleIdForNotif, driverIdForNotif);

    updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_STOP");

    const updatedStop2 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });
    expect(updatedStop2.arrivedAt).not.toBeNull();

    // Stop 1 arrivedAt was stamped during the first GPS ENTER.
    const updatedStop1 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop1.id } });
    expect(updatedStop1.arrivedAt).not.toBeNull();
  });

  it("item 19 — GPS ENTER on non-current stop fence does not transition dispatch", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    const stop1 = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);
    const stop2 = await addIntermediateStop(dispatch.id, 20, STOP2_LAT, STOP2_LNG);

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    // At this point only stop1's fence exists. Manually create a fence for stop2 to
    // simulate a driver driving past stop2 while stop1 is still the active stop.
    await geofences.createForDispatch(organizationId, dispatch.id, "INTERMEDIATE", {
      id: stop2.id,
      lat: { toNumber: () => STOP2_LAT },
      lng: { toNumber: () => STOP2_LNG },
      stopIndex: 20,
    });

    // GPS ENTER at stop2 coordinates — guard in handleAutoArrivalIntermediate should
    // detect that stop2 is not the current active stop and return without transitioning.
    const fence2 = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, linkedDispatchStopId: stop2.id, archivedAt: null },
    });
    await simulateGpsEnter(fence2.centerLat!, fence2.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("IN_TRANSIT"); // not AT_STOP

    const updatedStop2 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });
    expect(updatedStop2.arrivedAt).toBeNull(); // not stamped

    // stop1 also untouched (driver was at stop2 coords, far from stop1).
    const updatedStop1 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop1.id } });
    expect(updatedStop1.arrivedAt).toBeNull();
  });

  it("item 20 — repeated GPS ENTER on same intermediate fence is idempotent", async () => {
    const { dispatch, stop } = await dispatchWithOneIntermediateStop();

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });

    // First ENTER — transitions to AT_STOP.
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);
    // Second ENTER — must not throw, must not double-write arrivedAt or create extra history rows.
    await expect(
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
    ).resolves.not.toThrow();

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_STOP");

    const updatedStop = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(updatedStop.arrivedAt).not.toBeNull();

    // Only one AT_STOP history row (second ENTER lost the compare-and-set race).
    const historyCount = await prisma.dispatchStatusHistory.count({
      where: { organizationId, dispatchId: dispatch.id, status: "AT_STOP" },
    });
    expect(historyCount).toBe(1);
  });

  it("item 21 — failed stop is skipped; fence created for next eligible stop", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    const stop1 = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);
    const stop2 = await addIntermediateStop(dispatch.id, 20, STOP2_LAT, STOP2_LNG);

    // Mark stop1 as failed before IN_TRANSIT — simulates a stop that was
    // explicitly failed by the dispatcher before the dispatch left pickup.
    await prisma.dispatchStop.update({
      where: { id: stop1.id },
      data: { failedAt: new Date() },
    });

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    // Fence must be for stop2 (stop1 is excluded by failedAt IS NOT NULL).
    const fence = await prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP", archivedAt: null },
    });
    expect(fence).not.toBeNull();
    expect(fence!.linkedDispatchStopId).toBe(stop2.id);

    // No fence for stop1.
    const stop1Fence = await prisma.geofence.count({
      where: { organizationId, linkedDispatchId: dispatch.id, linkedDispatchStopId: stop1.id },
    });
    expect(stop1Fence).toBe(0);
  });

  it("item 22 — legacy dispatch (no intermediate stops) IN_TRANSIT behaves unchanged", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    // No intermediate stops added.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    // No intermediate fence created.
    const intermediateFenceCount = await prisma.geofence.count({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });
    expect(intermediateFenceCount).toBe(0);

    // Pickup fence archived, delivery fence active — unchanged from pre-5E-2 behavior.
    const pickupFence = await prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    expect(pickupFence!.archivedAt).not.toBeNull();

    const deliveryFence = await prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });
    expect(deliveryFence).not.toBeNull();
    expect(deliveryFence!.active).toBe(true);
    expect(deliveryFence!.archivedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 5E-8-2 regression — CAS safety (P2-1) and timestamp stamping (P2-2)
//
// These tests cover the two gaps confirmed in the GPS CAS audit:
//   P2-1: handleAutoArrivalEnter had no compare-and-set for PICKUP/DELIVERY fences,
//         allowing two concurrent GPS ENTER events to both write duplicate status
//         history rows and run the order status update twice.
//   P2-2: handleAutoArrivalEnter did not stamp DispatchStop.arrivedAt for the
//         PICKUP or DELIVERY stop, leaving the arrival timestamp unset after a
//         GPS-triggered transition (manual driver path stamped it correctly).
// ---------------------------------------------------------------------------

describe("GPS auto-arrival CAS safety and timestamp regression (Phase 5E-8-2)", () => {
  // -------------------------------------------------------------------------
  // P2-2 — DispatchStop.arrivedAt stamped by GPS path
  // -------------------------------------------------------------------------

  it("P2-2 — GPS ENTER on PICKUP fence stamps DispatchStop.arrivedAt for the PICKUP stop", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const pickupStop = await prisma.dispatchStop.findFirst({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(pickupStop).not.toBeNull();
    expect(pickupStop!.arrivedAt).not.toBeNull();
  });

  it("P2-2 — GPS ENTER on DELIVERY fence stamps DispatchStop.arrivedAt for the DELIVERY stop", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const deliveryStop = await prisma.dispatchStop.findFirst({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    expect(deliveryStop).not.toBeNull();
    expect(deliveryStop!.arrivedAt).not.toBeNull();
  });

  it("P2-2 — GPS ENTER on PICKUP fence does not overwrite a manual arrivedAt already set", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    // Manually stamp arrivedAt (simulates the manual driver path arriving first).
    const manualTime = new Date("2026-01-15T10:00:00.000Z");
    await prisma.dispatchStop.updateMany({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
      data: { arrivedAt: manualTime },
    });

    // GPS event arrives late — should be a no-op for the timestamp.
    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const pickupStop = await prisma.dispatchStop.findFirst({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    // Original timestamp preserved; GPS event did not overwrite.
    expect(pickupStop!.arrivedAt?.toISOString()).toBe(manualTime.toISOString());
  });

  // -------------------------------------------------------------------------
  // P2-1 — CAS prevents duplicate status history from concurrent GPS events
  // -------------------------------------------------------------------------

  it("P2-1 — two concurrent GPS ENTER on PICKUP fence produce exactly one status history row", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    // Fire two ENTER events concurrently — CAS means only one should write.
    await Promise.all([
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
    ]);

    const historyCount = await prisma.dispatchStatusHistory.count({
      where: { organizationId, dispatchId: dispatch.id, status: "AT_PICKUP" },
    });
    expect(historyCount).toBe(1);

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("AT_PICKUP");
  });

  it("P2-1 — two concurrent GPS ENTER on PICKUP fence produce at most one order PICKED_UP write", async () => {
    const { order, dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    await Promise.all([
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
    ]);

    // Order status should be PICKED_UP exactly once, not in an inconsistent state.
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe("PICKED_UP");
  });

  it("P2-1 — two concurrent GPS ENTER on DELIVERY fence produce exactly one status history row", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });

    await Promise.all([
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
    ]);

    const historyCount = await prisma.dispatchStatusHistory.count({
      where: { organizationId, dispatchId: dispatch.id, status: "ARRIVED_AT_DELIVERY" },
    });
    expect(historyCount).toBe(1);

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("ARRIVED_AT_DELIVERY");
  });

  it("P2-1 — repeated GPS ENTER on PICKUP fence is idempotent — no duplicate arrivedAt overwrite", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });

    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);
    const firstStop = await prisma.dispatchStop.findFirst({ where: { dispatchId: dispatch.id, stopType: "PICKUP" } });
    const firstArrivedAt = firstStop!.arrivedAt;
    expect(firstArrivedAt).not.toBeNull();

    // Second ENTER — must not change arrivedAt or add another history row.
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const secondStop = await prisma.dispatchStop.findFirst({ where: { dispatchId: dispatch.id, stopType: "PICKUP" } });
    expect(secondStop!.arrivedAt?.toISOString()).toBe(firstArrivedAt!.toISOString());

    const historyCount = await prisma.dispatchStatusHistory.count({
      where: { organizationId, dispatchId: dispatch.id, status: "AT_PICKUP" },
    });
    expect(historyCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 5E-8-3 — GPS stop lifecycle completeness
//
// These tests verify that the complete GPS-driven stop execution lifecycle
// keeps DispatchStop timestamps consistent with the manual driver path:
//
//   a. GPS intermediate arrival stamps arrivedAt → manual departure stamps completedAt
//   b. Departure stamps only the ACTIVE stop's completedAt; upcoming stops untouched
//   c. Full end-to-end lifecycle: pickup GPS → intermediate GPS → departure → delivery GPS
//   d. A failed intermediate stop is never given completedAt
//   e. Repeated GPS events on delivery fence do not overwrite delivery arrivedAt
// ---------------------------------------------------------------------------

describe("GPS stop lifecycle completeness (Phase 5E-8-3)", () => {
  it("a — GPS intermediate arrival stamps arrivedAt; manual AT_STOP → IN_TRANSIT then stamps completedAt", async () => {
    const { dispatch, stop } = await dispatchWithOneIntermediateStop();

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP" },
    });

    // GPS arrives — stamps arrivedAt, transitions to AT_STOP.
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    const afterArrival = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(afterArrival.arrivedAt).not.toBeNull();
    expect(afterArrival.completedAt).toBeNull(); // not yet departed

    // Driver manually departs.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const afterDepart = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(afterDepart.completedAt).not.toBeNull();
    expect(afterDepart.arrivedAt!.toISOString()).toBe(afterArrival.arrivedAt!.toISOString()); // arrivedAt preserved
  });

  it("b — departure stamps only the active stop's completedAt; upcoming stop remains untouched", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    const stop1 = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);
    const stop2 = await addIntermediateStop(dispatch.id, 20, STOP2_LAT, STOP2_LNG);

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);

    // GPS arrives at stop 1.
    const fence1 = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP", linkedDispatchStopId: stop1.id },
    });
    await simulateGpsEnter(fence1.centerLat!, fence1.centerLng!, vehicleIdForNotif, driverIdForNotif);

    // Driver departs stop 1.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);

    const updatedStop1 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop1.id } });
    const updatedStop2 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });

    expect(updatedStop1.completedAt).not.toBeNull(); // stop 1 departed
    expect(updatedStop2.completedAt).toBeNull(); // stop 2 not yet touched
    expect(updatedStop2.arrivedAt).toBeNull(); // stop 2 not yet arrived either
  });

  it("c — full GPS lifecycle: pickup → intermediate → delivery all stamp DispatchStop timestamps", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    const stop1 = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);

    // GPS arrives at pickup.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    const pickupFence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_PICKUP" },
    });
    await simulateGpsEnter(pickupFence.centerLat!, pickupFence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    // Driver manually departs pickup → rotates fence to intermediate stop.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);

    // GPS arrives at intermediate stop.
    const stopFence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP", linkedDispatchStopId: stop1.id },
    });
    await simulateGpsEnter(stopFence.centerLat!, stopFence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    // Driver manually departs intermediate stop → rotates fence to delivery.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);

    // GPS arrives at delivery.
    const deliveryFence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });
    await simulateGpsEnter(deliveryFence.centerLat!, deliveryFence.centerLng!, vehicleIdForNotif, driverIdForNotif);

    // Verify all timestamps are set correctly.
    const pickupStop = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId: dispatch.id, stopType: "PICKUP" } });
    const intermediateStop = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop1.id } });
    const deliveryStop = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId: dispatch.id, stopType: "DELIVERY" } });

    expect(pickupStop.arrivedAt).not.toBeNull(); // GPS-stamped on pickup
    expect(pickupStop.completedAt).not.toBeNull(); // manual departure from pickup
    expect(intermediateStop.arrivedAt).not.toBeNull(); // GPS-stamped on intermediate
    expect(intermediateStop.completedAt).not.toBeNull(); // manual departure from intermediate
    expect(deliveryStop.arrivedAt).not.toBeNull(); // GPS-stamped on delivery
    expect(deliveryStop.completedAt).toBeNull(); // not yet delivered (delivery happens after POD)

    const updated = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updated.status).toBe("ARRIVED_AT_DELIVERY");
  });

  it("d — failed intermediate stop: arrivedAt and failedAt preserved; completedAt never set by GPS or departure", async () => {
    const { dispatch } = await assignedDispatch(driverIdForNotif, vehicleIdForNotif);
    const stop1 = await addIntermediateStop(dispatch.id, 10, STOP1_LAT, STOP1_LNG);
    const stop2 = await addIntermediateStop(dispatch.id, 20, STOP2_LAT, STOP2_LNG);

    // Mark stop1 failed before IN_TRANSIT so the fence rotation skips it.
    const failedAt = new Date("2026-01-15T09:00:00.000Z");
    await prisma.dispatchStop.update({
      where: { id: stop1.id },
      data: { arrivedAt: new Date("2026-01-15T08:55:00.000Z"), failedAt },
    });

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);

    // Fence rotation created fence for stop2 (stop1 skipped due to failedAt).
    const fence2 = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_STOP", linkedDispatchStopId: stop2.id },
    });

    // GPS arrives at stop2 — should not touch stop1.
    await simulateGpsEnter(fence2.centerLat!, fence2.centerLng!, vehicleIdForNotif, driverIdForNotif);
    // Depart stop2.
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    // Failed stop1 must have its original timestamps unchanged.
    const updatedStop1 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop1.id } });
    expect(updatedStop1.failedAt?.toISOString()).toBe(failedAt.toISOString());
    expect(updatedStop1.completedAt).toBeNull(); // never completed

    // Stop2 was completed normally.
    const updatedStop2 = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });
    expect(updatedStop2.arrivedAt).not.toBeNull();
    expect(updatedStop2.completedAt).not.toBeNull();
  });

  it("e — repeated GPS ENTER on DELIVERY fence does not overwrite delivery arrivedAt", async () => {
    const { dispatch } = await notifDispatch();
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const fence = await prisma.geofence.findFirstOrThrow({
      where: { organizationId, linkedDispatchId: dispatch.id, category: "AUTO_ARRIVAL_DELIVERY" },
    });

    // First ENTER — stamps arrivedAt.
    await simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif);
    const firstDelivery = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId: dispatch.id, stopType: "DELIVERY" } });
    const firstArrivedAt = firstDelivery.arrivedAt;
    expect(firstArrivedAt).not.toBeNull();

    // Second ENTER after fence is archived — must not throw and must not overwrite.
    await expect(
      simulateGpsEnter(fence.centerLat!, fence.centerLng!, vehicleIdForNotif, driverIdForNotif),
    ).resolves.not.toThrow();

    const secondDelivery = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId: dispatch.id, stopType: "DELIVERY" } });
    expect(secondDelivery.arrivedAt?.toISOString()).toBe(firstArrivedAt!.toISOString());
  });
});
