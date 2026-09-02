import { randomUUID } from "crypto";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { PrismaService } from "../src/prisma/prisma.service";
import { AUTO_ARRIVAL_INTERMEDIATE_CATEGORY, GeofenceService } from "../src/telematics/geofences/geofence.service";
import { TelematicsSettingsService } from "../src/telematics/settings/telematics-settings.service";
import type { AlertService } from "../src/telematics/alerts/alert.service";
import type { TelematicsRealtimeService } from "../src/telematics/realtime/telematics-realtime.service";
import type { WorkflowEventService } from "../src/workflows/triggers/workflow-event.service";

/// Phase 5E-7 — Atomic intermediate fence rotation (P2-1 fix).
///
/// Uses the REAL GeofenceService to verify actual database fence state after
/// the rotateIntermediateStopFence transaction: archive + create never leaves
/// a window where the current fence is archived but the next one does not exist.
///
/// Covers:
///  1. AT_PICKUP → IN_TRANSIT creates the first intermediate stop fence
///  2. AT_STOP → IN_TRANSIT atomically archives stop-1 fence and creates stop-2 fence
///  3. No duplicate fences after a double rotate call (idempotency)
///  4. No next stop: archive-only rotation leaves no active intermediate fence
///  5. After all stops are visited: dispatch reaches ARRIVED_AT_DELIVERY cleanly

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const wfEvents = { emit: jest.fn() } as unknown as WorkflowEventService;
const tracking = {
  endSessionsForDispatch: jest.fn().mockResolvedValue(0),
  endSessionsOnVehicleReassign: jest.fn().mockResolvedValue(0),
  endSessionsForUser: jest.fn().mockResolvedValue(0),
} as unknown as ConstructorParameters<typeof DispatchesService>[5];

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

const PICKUP = new Date("2041-08-01T08:00:00.000Z");
const DELIVERY = new Date("2041-08-03T18:00:00.000Z");

// Real Uzbek coordinates — well away from (0,0) null-island.
const PICKUP_LAT = "41.2995";
const PICKUP_LNG = "69.2401";
const DELIVERY_LAT = "39.6542";
const DELIVERY_LNG = "66.9597";
// Intermediate stop coordinates (Namangan and Fergana).
const STOP1_LAT = "40.9983";
const STOP1_LNG = "71.6726";
const STOP2_LAT = "40.3842";
const STOP2_LNG = "71.7843";

let organizationId: string;
let customerId: string;
let driverId: string;
let vehicleId: string;
let actor: CurrentUserPayload;
const userIds: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function makeOrderWithStops(intermediateCount: number) {
  const order = await prisma.order.create({
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

  const coords = [
    { lat: STOP1_LAT, lng: STOP1_LNG },
    { lat: STOP2_LAT, lng: STOP2_LNG },
  ];

  for (let i = 1; i <= intermediateCount; i++) {
    const c = coords[i - 1] ?? { lat: STOP1_LAT, lng: STOP1_LNG };
    await prisma.orderStop.create({
      data: {
        organizationId,
        orderId: order.id,
        stopIndex: i,
        address: `${i} Stop Ave`,
        city: "Namangan",
        lat: c.lat,
        lng: c.lng,
      },
    });
  }

  return order;
}

async function createDispatch(intermediateStopCount: number) {
  const order = await makeOrderWithStops(intermediateStopCount);
  const dispatch = await dispatches.create(
    organizationId,
    { orderId: order.id, driverId, vehicleId },
    actor,
  );
  await dispatches.updateStatus(organizationId, dispatch.id, { status: "ASSIGNED" }, actor);
  return { order, dispatch };
}

async function activeIntermediateFences(dispatchId: string) {
  return prisma.geofence.findMany({
    where: {
      organizationId,
      linkedDispatchId: dispatchId,
      category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
      autoCreated: true,
      archivedAt: null,
    },
  });
}

async function allIntermediateFences(dispatchId: string) {
  return prisma.geofence.findMany({
    where: {
      organizationId,
      linkedDispatchId: dispatchId,
      category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
      autoCreated: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Geofence Rotation Org", slug: `georot-${randomUUID()}` },
  });
  organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `dispatcher-georot-${randomUUID()}@example.test`,
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
      companyName: "Rotation Test Co",
      contactName: "Sam Stop",
    },
  });
  customerId = customer.id;

  const driver = await prisma.driver.create({
    data: {
      organizationId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Dan",
      lastName: "Driver",
      phone: "+998 90 200 00 00",
    },
  });
  driverId = driver.id;

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId,
      vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
      plateNumber: `99 ${randomUUID().slice(0, 5)}`,
      type: "Truck",
    },
  });
  vehicleId = vehicle.id;

  await prisma.organizationDriverSettings.create({
    data: {
      organizationId,
      requirePhotos: false,
      requireSignature: false,
      requireReceiverName: false,
      requireReceiverPhone: false,
      requireNotes: false,
    },
  });

  // TelematicsSettingsService.getOrCreate() creates settings with
  // arrivalGeofenceEnabled: true and arrivalGeofenceRadiusM: 150 by default.
  await telematicsSettings.getOrCreate(organizationId);
});

afterEach(async () => {
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.geofence.deleteMany({ where: { organizationId } });
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  jest.clearAllMocks();
  // Flush the 30-second in-process geofence cache between tests.
  (geofences as unknown as { activeCache: Map<string, unknown> }).activeCache.delete(organizationId);
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. First rotation — AT_PICKUP → IN_TRANSIT creates stop-1 fence
// ─────────────────────────────────────────────────────────────────────────────

describe("1. first rotation — AT_PICKUP → IN_TRANSIT", () => {
  it("creates exactly one active intermediate fence for stop 1", async () => {
    const { dispatch } = await createDispatch(2);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const active = await activeIntermediateFences(dispatch.id);
    expect(active).toHaveLength(1);

    const stop1 = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE", stopIndex: 1 },
    });
    expect(active[0].linkedDispatchStopId).toBe(stop1.id);
    expect(active[0].active).toBe(true);
    expect(active[0].archivedAt).toBeNull();
    expect(Number(active[0].centerLat)).toBeCloseTo(parseFloat(STOP1_LAT), 3);
    expect(Number(active[0].centerLng)).toBeCloseTo(parseFloat(STOP1_LNG), 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Second rotation — AT_STOP → IN_TRANSIT archives stop-1 fence
//    and creates stop-2 fence atomically
// ─────────────────────────────────────────────────────────────────────────────

describe("2. second rotation — AT_STOP → IN_TRANSIT (normal departure)", () => {
  it("archives the stop-1 fence and creates the stop-2 fence in the same transaction", async () => {
    const { dispatch } = await createDispatch(2);

    // Advance through first stop cycle
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    // Arrive at stop 1
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_STOP" }, actor);
    // Depart stop 1 — triggers rotation
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const all = await allIntermediateFences(dispatch.id);
    expect(all).toHaveLength(2);

    // First fence (stop 1) must be archived
    const fence1 = all[0];
    expect(fence1.archivedAt).not.toBeNull();
    expect(fence1.active).toBe(false);

    // Second fence (stop 2) must be active
    const fence2 = all[1];
    expect(fence2.archivedAt).toBeNull();
    expect(fence2.active).toBe(true);
    expect(Number(fence2.centerLat)).toBeCloseTo(parseFloat(STOP2_LAT), 3);
    expect(Number(fence2.centerLng)).toBeCloseTo(parseFloat(STOP2_LNG), 3);

    // Exactly one active intermediate fence at all times
    const active = await activeIntermediateFences(dispatch.id);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(fence2.id);
  });

  it("each fence references its correct DispatchStop via linkedDispatchStopId", async () => {
    const { dispatch } = await createDispatch(2);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_STOP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    const [stop1, stop2] = stops;

    const all = await allIntermediateFences(dispatch.id);
    expect(all[0].linkedDispatchStopId).toBe(stop1.id);
    expect(all[1].linkedDispatchStopId).toBe(stop2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Idempotency — calling rotateIntermediateStopFence twice does not
//    create a duplicate fence for the same stop
// ─────────────────────────────────────────────────────────────────────────────

describe("3. idempotency — double rotation call", () => {
  it("does not create a duplicate fence when rotateIntermediateStopFence is called twice", async () => {
    const { dispatch } = await createDispatch(2);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    // Simulate a double-call (e.g. two concurrent GPS hooks arriving in parallel)
    await geofences.rotateIntermediateStopFence(organizationId, dispatch.id);
    await geofences.rotateIntermediateStopFence(organizationId, dispatch.id);

    const active = await activeIntermediateFences(dispatch.id);
    expect(active).toHaveLength(1); // exactly one, not two
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. No-next-stop case — archive only, no new fence created
// ─────────────────────────────────────────────────────────────────────────────

describe("4. no-next-stop — archive without create", () => {
  it("archives the last intermediate fence and creates no new one when all stops are visited", async () => {
    const { dispatch } = await createDispatch(1); // single intermediate stop

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_STOP" }, actor);
    // Depart the only stop — no next stop to create a fence for
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);

    const all = await allIntermediateFences(dispatch.id);
    expect(all).toHaveLength(1);
    expect(all[0].archivedAt).not.toBeNull(); // archived
    expect(all[0].active).toBe(false);

    const active = await activeIntermediateFences(dispatch.id);
    expect(active).toHaveLength(0); // none active
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Full lifecycle — dispatch reaches ARRIVED_AT_DELIVERY with correct
//    fence state throughout
// ─────────────────────────────────────────────────────────────────────────────

describe("5. full lifecycle — all intermediate fences archived at delivery", () => {
  it("all intermediate fences are archived when dispatch reaches ARRIVED_AT_DELIVERY", async () => {
    const { dispatch } = await createDispatch(2);

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_STOP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_STOP" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "IN_TRANSIT" }, actor);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: "ARRIVED_AT_DELIVERY" }, actor);

    // All intermediate fences must be archived — dispatch is now at delivery
    const active = await activeIntermediateFences(dispatch.id);
    expect(active).toHaveLength(0);

    // Total: 2 intermediate fences created (one per stop), both archived
    const all = await allIntermediateFences(dispatch.id);
    expect(all).toHaveLength(2);
    expect(all.every((f) => f.archivedAt !== null)).toBe(true);
  });
});
