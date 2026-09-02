import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// Phase 5B — DispatchStop snapshot foundation.
///
/// Tests the invariants that MUST hold for the immutable stop snapshot model:
/// A. Dispatch creation creates exactly 2 stops (PICKUP at index 0, DELIVERY at index 1)
/// B. All location fields are copied exactly from the Order
/// C. Editing the Order after dispatch creation leaves stops unchanged (immutability)
/// D. Re-dispatch after DELIVERY_FAILED creates fresh snapshots from the new Order state
/// E. Old DELIVERY_FAILED dispatch retains its original snapshots
/// F. Organization A cannot read Organization B's stops (tenant isolation)
/// G. ARRIVED_AT_DELIVERY stamps arrivedAt on the DELIVERY stop
/// H. DELIVERED stamps completedAt on the DELIVERY stop

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const wfEvents = { emit: jest.fn() } as unknown as ConstructorParameters<typeof DispatchesService>[4];
const tracking = {
  endSessionsForDispatch: jest.fn().mockResolvedValue(0),
  endSessionsOnVehicleReassign: jest.fn().mockResolvedValue(0),
  endSessionsForUser: jest.fn().mockResolvedValue(0),
} as unknown as ConstructorParameters<typeof DispatchesService>[5];
const geofences = {
  createForDispatch: jest.fn().mockResolvedValue(undefined),
  archiveForDispatch: jest.fn().mockResolvedValue(undefined),
  archiveIntermediateStopForDispatch: jest.fn().mockResolvedValue(undefined),
  createForNextIntermediateStop: jest.fn().mockResolvedValue(undefined),
  rotateIntermediateStopFence: jest.fn().mockResolvedValue(undefined),
} as unknown as ConstructorParameters<typeof DispatchesService>[6];
const usageMetering = {
  enforceLimit: jest.fn().mockResolvedValue(undefined),
} as unknown as ConstructorParameters<typeof OrdersService>[6];
const geocoding = {
  geocodeOrderLocations: jest.fn().mockResolvedValue(undefined),
} as unknown as ConstructorParameters<typeof OrdersService>[7];

const dispatches = new DispatchesService(prisma, audit, policy, writer, wfEvents, tracking, geofences);
const orders = new OrdersService(prisma, audit, writer, dispatches, policy, wfEvents, usageMetering, geocoding);

/// Tenant fixture.
interface Fixture {
  organizationId: string;
  customerId: string;
  driverId: string;
  vehicleId: string;
  actor: CurrentUserPayload;
}

async function seedOrg(label: string): Promise<Fixture> {
  const org = await prisma.organization.create({
    data: { name: `Stop Org ${label}`, slug: `stop-org-${label.toLowerCase()}-${randomUUID()}` },
  });
  const organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `stop-${randomUUID()}@example.test`,
      firstName: "Stop",
      lastName: label,
      passwordHash: "x",
    },
  });
  const membership = await prisma.membership.create({
    data: { organizationId, userId: user.id, role: "DISPATCHER" },
  });
  const actor: CurrentUserPayload = {
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
      companyName: "Stop Co",
      contactName: "Sam Stop",
    },
  });

  const driver = await prisma.driver.create({
    data: {
      organizationId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Dave",
      lastName: "Driver",
      phone: "+998 90 000 00 00",
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId,
      vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
      plateNumber: `01 ${randomUUID().slice(0, 5)}`,
      type: "Truck",
    },
  });

  return { organizationId, customerId: customer.id, driverId: driver.id, vehicleId: vehicle.id, actor };
}

/// Full stop-data order — every nullable location field populated.
function richOrderData(
  organizationId: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    organizationId,
    orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
    customerId,
    status: "PENDING" as const,
    pickupAddress: "1 Depot Road",
    pickupCity: "Tashkent",
    pickupDate: new Date("2037-06-01T08:00:00Z"),
    deliveryAddress: "9 Dock Street",
    deliveryCity: "Samarkand",
    deliveryDate: new Date("2037-06-03T18:00:00Z"),
    cargoDescription: "Pallets",
    price: "1500.00",
    // Extended stop fields
    pickupPostalCode: "100001",
    pickupCountryCode: "UZ",
    pickupLat: "41.2995",
    pickupLng: "69.2401",
    pickupPlaceName: "Tashkent Depot",
    pickupContactName: "Alisher Pickup",
    pickupContactPhone: "+998 90 111 11 11",
    pickupInstructions: "Ring buzzer #3",
    pickupWindowStart: new Date("2037-06-01T07:00:00Z"),
    pickupWindowEnd: new Date("2037-06-01T10:00:00Z"),
    deliveryPostalCode: "140100",
    deliveryCountryCode: "UZ",
    deliveryLat: "39.6542",
    deliveryLng: "66.9597",
    deliveryPlaceName: "Samarkand Hub",
    deliveryContactName: "Bobur Delivery",
    deliveryContactPhone: "+998 90 222 22 22",
    deliveryInstructions: "Call on arrival",
    deliveryWindowStart: new Date("2037-06-03T14:00:00Z"),
    deliveryWindowEnd: new Date("2037-06-03T20:00:00Z"),
    ...overrides,
  };
}

let orgA: Fixture;
let orgB: Fixture;
const orgIds: string[] = [];
const userIds: string[] = [];

beforeAll(async () => {
  orgA = await seedOrg("A");
  orgB = await seedOrg("B");
  orgIds.push(orgA.organizationId, orgB.organizationId);
});

afterEach(async () => {
  // dispatch_stops cascade-delete with dispatches; orders cascade-delete dispatches.
  await prisma.dispatch.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// A. Schema/creation — 2 stops created with every dispatch
// ---------------------------------------------------------------------------

describe("A. dispatch creation creates exactly 2 stops", () => {
  it("creates stopIndex 0 (PICKUP) and stopIndex 1 (DELIVERY)", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const stops = await prisma.dispatchStop.findMany({
      where: { organizationId: orgA.organizationId },
      orderBy: { stopIndex: "asc" },
    });

    expect(stops).toHaveLength(2);
    expect(stops[0].stopIndex).toBe(0);
    expect(stops[0].stopType).toBe("PICKUP");
    expect(stops[1].stopIndex).toBe(1);
    expect(stops[1].stopType).toBe("DELIVERY");
  });

  it("creates stops via the order assign path too (orders.assign)", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });

    await orders.assign(
      orgA.organizationId,
      order.id,
      { driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const stops = await prisma.dispatchStop.findMany({ where: { organizationId: orgA.organizationId } });
    expect(stops).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// B. Snapshot correctness — all fields copied exactly
// ---------------------------------------------------------------------------

describe("B. all location fields are copied exactly", () => {
  it("copies every pickup field onto stopIndex 0", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const pickup = await prisma.dispatchStop.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, stopType: "PICKUP" },
    });

    expect(pickup.address).toBe("1 Depot Road");
    expect(pickup.city).toBe("Tashkent");
    expect(pickup.postalCode).toBe("100001");
    expect(pickup.countryCode).toBe("UZ");
    expect(Number(pickup.lat)).toBeCloseTo(41.2995, 4);
    expect(Number(pickup.lng)).toBeCloseTo(69.2401, 4);
    expect(pickup.placeName).toBe("Tashkent Depot");
    expect(pickup.contactName).toBe("Alisher Pickup");
    expect(pickup.contactPhone).toBe("+998 90 111 11 11");
    expect(pickup.instructions).toBe("Ring buzzer #3");
    expect(pickup.windowStart?.toISOString()).toBe("2037-06-01T07:00:00.000Z");
    expect(pickup.windowEnd?.toISOString()).toBe("2037-06-01T10:00:00.000Z");
  });

  it("copies every delivery field onto stopIndex 1", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const delivery = await prisma.dispatchStop.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, stopType: "DELIVERY" },
    });

    expect(delivery.address).toBe("9 Dock Street");
    expect(delivery.city).toBe("Samarkand");
    expect(delivery.postalCode).toBe("140100");
    expect(delivery.countryCode).toBe("UZ");
    expect(Number(delivery.lat)).toBeCloseTo(39.6542, 4);
    expect(Number(delivery.lng)).toBeCloseTo(66.9597, 4);
    expect(delivery.placeName).toBe("Samarkand Hub");
    expect(delivery.contactName).toBe("Bobur Delivery");
    expect(delivery.contactPhone).toBe("+998 90 222 22 22");
    expect(delivery.instructions).toBe("Call on arrival");
    expect(delivery.windowStart?.toISOString()).toBe("2037-06-03T14:00:00.000Z");
    expect(delivery.windowEnd?.toISOString()).toBe("2037-06-03T20:00:00.000Z");
  });

  it("handles null optional fields correctly (sparse order)", async () => {
    const sparse = await prisma.order.create({
      data: {
        organizationId: orgA.organizationId,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        customerId: orgA.customerId,
        status: "PENDING",
        pickupAddress: "1 Depot",
        pickupCity: "Tashkent",
        pickupDate: new Date("2037-07-01T08:00:00Z"),
        deliveryAddress: "9 Dock",
        deliveryCity: "Samarkand",
        deliveryDate: new Date("2037-07-03T18:00:00Z"),
        cargoDescription: "Boxes",
        price: "500.00",
        // All extended fields intentionally omitted (null)
      },
    });
    await dispatches.create(
      orgA.organizationId,
      { orderId: sparse.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const stops = await prisma.dispatchStop.findMany({ where: { organizationId: orgA.organizationId } });
    expect(stops).toHaveLength(2);
    stops.forEach((stop) => {
      expect(stop.postalCode).toBeNull();
      expect(stop.lat).toBeNull();
      expect(stop.lng).toBeNull();
      expect(stop.contactName).toBeNull();
      expect(stop.instructions).toBeNull();
      expect(stop.windowStart).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// C. Immutability — editing the Order must NOT change existing stops
// ---------------------------------------------------------------------------

describe("C. stop snapshots are immutable after dispatch creation", () => {
  it("editing the Order pickup/delivery fields does not alter the DispatchStop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    // Snapshot before edit
    const before = await prisma.dispatchStop.findMany({
      where: { organizationId: orgA.organizationId },
      orderBy: { stopIndex: "asc" },
    });

    // Mutate the Order's location fields
    await prisma.order.update({
      where: { id: order.id },
      data: {
        pickupAddress: "CHANGED ADDRESS",
        pickupCity: "CHANGED CITY",
        pickupLat: "99.9999",
        pickupContactName: "CHANGED CONTACT",
        deliveryAddress: "CHANGED DELIVERY",
        deliveryCity: "CHANGED DELIVERY CITY",
        deliveryPlaceName: "CHANGED PLACE",
      },
    });

    // Snapshot after edit — must be identical to before
    const after = await prisma.dispatchStop.findMany({
      where: { organizationId: orgA.organizationId },
      orderBy: { stopIndex: "asc" },
    });

    expect(after[0].address).toBe(before[0].address);
    expect(after[0].city).toBe(before[0].city);
    expect(after[0].lat?.toString()).toBe(before[0].lat?.toString());
    expect(after[0].contactName).toBe(before[0].contactName);
    expect(after[1].address).toBe(before[1].address);
    expect(after[1].city).toBe(before[1].city);
    expect(after[1].placeName).toBe(before[1].placeName);
  });
});

// ---------------------------------------------------------------------------
// D & E. Re-dispatch isolation — old dispatch keeps its snapshots; new dispatch
// gets fresh snapshots from the updated Order
// ---------------------------------------------------------------------------

describe("D+E. re-dispatch after DELIVERY_FAILED creates isolated snapshots", () => {
  it("old dispatch retains original snapshots; new dispatch gets new ones", async () => {
    // Create and advance original dispatch to DELIVERY_FAILED state via Prisma
    // (bypassing the service layer that guards re-dispatch, so the test is
    // surgical and does not depend on the driver-app path).
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });

    // First dispatch — created at original Order state
    const originalDispatch = await prisma.dispatch.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchNumber: `DSP-${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
        createdByUserId: orgA.actor.userId,
        status: "DELIVERY_FAILED",
        pickupDateScheduled: new Date("2037-06-01T08:00:00Z"),
        deliveryDateScheduled: new Date("2037-06-03T18:00:00Z"),
        failureReason: "CUSTOMER_UNAVAILABLE",
        failedAt: new Date(),
      },
    });

    // Create the two stop snapshots for the original dispatch manually
    // (simulating what createInTx would have done)
    await prisma.dispatchStop.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: originalDispatch.id,
        stopIndex: 0,
        stopType: "PICKUP",
        address: "1 Depot Road",
        city: "Tashkent",
      },
    });
    await prisma.dispatchStop.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: originalDispatch.id,
        stopIndex: 1,
        stopType: "DELIVERY",
        address: "9 Dock Street",
        city: "Samarkand",
      },
    });

    // Edit the Order — changed state for the re-dispatch
    await prisma.order.update({
      where: { id: order.id },
      data: {
        pickupAddress: "2 New Depot",
        deliveryAddress: "88 New Dock",
        status: "PENDING",
      },
    });

    // Re-dispatch via the production path (createInTx) — creates a NEW dispatch
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    // Old dispatch stops must be unchanged
    const oldStops = await prisma.dispatchStop.findMany({
      where: { dispatchId: originalDispatch.id },
      orderBy: { stopIndex: "asc" },
    });
    expect(oldStops[0].address).toBe("1 Depot Road");
    expect(oldStops[1].address).toBe("9 Dock Street");

    // New dispatch stops must reflect the edited Order
    const newDispatch = await prisma.dispatch.findFirstOrThrow({
      where: {
        organizationId: orgA.organizationId,
        orderId: order.id,
        status: { not: "DELIVERY_FAILED" },
      },
    });
    const newStops = await prisma.dispatchStop.findMany({
      where: { dispatchId: newDispatch.id },
      orderBy: { stopIndex: "asc" },
    });
    expect(newStops).toHaveLength(2);
    expect(newStops[0].address).toBe("2 New Depot");
    expect(newStops[1].address).toBe("88 New Dock");
  });
});

// ---------------------------------------------------------------------------
// F. Tenant isolation — org A cannot see org B stops
// ---------------------------------------------------------------------------

describe("F. organization isolation", () => {
  it("org A stops are never visible to org B queries", async () => {
    const orderA = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const orderB = await prisma.order.create({ data: richOrderData(orgB.organizationId, orgB.customerId) });

    await dispatches.create(
      orgA.organizationId,
      { orderId: orderA.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    await dispatches.create(
      orgB.organizationId,
      { orderId: orderB.id, driverId: orgB.driverId, vehicleId: orgB.vehicleId },
      orgB.actor,
    );

    // Org B scoped query must never return org A's stops
    const bStops = await prisma.dispatchStop.findMany({ where: { organizationId: orgB.organizationId } });
    expect(bStops.every((s) => s.organizationId === orgB.organizationId)).toBe(true);
    expect(bStops.every((s) => s.organizationId !== orgA.organizationId)).toBe(true);

    // A dispatch-scoped query with org isolation also works
    const dispatchA = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    const crossOrgAttempt = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatchA.id, organizationId: orgB.organizationId },
    });
    expect(crossOrgAttempt).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G & H. Arrival / completion integration
// ---------------------------------------------------------------------------

describe("G+H. stop execution timestamps are stamped on dispatch transitions", () => {
  it("ARRIVED_AT_DELIVERY stamps arrivedAt on the DELIVERY stop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    // Walk dispatch to ARRIVED_AT_DELIVERY
    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY"] as const) {
      const current = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
      void current;
    }

    const delivery = await prisma.dispatchStop.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, stopType: "DELIVERY" },
    });
    expect(delivery.arrivedAt).not.toBeNull();
    expect(delivery.completedAt).toBeNull();
  });

  it("DELIVERED stamps completedAt on the DELIVERY stop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const delivery = await prisma.dispatchStop.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, stopType: "DELIVERY" },
    });
    expect(delivery.arrivedAt).not.toBeNull();
    expect(delivery.completedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// I. Detail endpoint exposes stops
// ---------------------------------------------------------------------------

describe("I. stops appear in the dispatch detail response", () => {
  it("getById includes stops ordered by stopIndex", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const created = await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const detail = await dispatches.getById(orgA.organizationId, created.id);

    expect(detail.stops).toHaveLength(2);
    expect(detail.stops![0].stopType).toBe("PICKUP");
    expect(detail.stops![0].stopIndex).toBe(0);
    expect(detail.stops![0].address).toBe("1 Depot Road");
    expect(detail.stops![1].stopType).toBe("DELIVERY");
    expect(detail.stops![1].stopIndex).toBe(1);
    expect(detail.stops![1].address).toBe("9 Dock Street");
  });
});

// ---------------------------------------------------------------------------
// J. Regression — existing Phase 5A behaviour still works
// ---------------------------------------------------------------------------

describe("J. existing Phase 5A AT_STOP behaviour still works", () => {
  it("IN_TRANSIT → AT_STOP → ARRIVED_AT_DELIVERY → DELIVERED still completes", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    for (const status of [
      "ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT",
      "AT_STOP", "ARRIVED_AT_DELIVERY", "DELIVERED",
    ] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const final = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(final.status).toBe("DELIVERED");

    const stops = await prisma.dispatchStop.findMany({ where: { dispatchId: dispatch.id } });
    expect(stops).toHaveLength(2);
    const delivery = stops.find((s) => s.stopType === "DELIVERY")!;
    expect(delivery.arrivedAt).not.toBeNull();
    expect(delivery.completedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// K. Phase 5C — PICKUP stop execution timestamps
// ---------------------------------------------------------------------------

describe("K. PICKUP stop execution timestamps (Phase 5C)", () => {
  it("AT_PICKUP stamps arrivedAt on the PICKUP stop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const pickup = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(pickup.arrivedAt).not.toBeNull();
    expect(pickup.completedAt).toBeNull();
  });

  it("IN_TRANSIT stamps completedAt on the PICKUP stop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const pickup = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(pickup.arrivedAt).not.toBeNull();
    expect(pickup.completedAt).not.toBeNull();
  });

  it("PICKUP timestamps do not bleed onto the DELIVERY stop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const delivery = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    // DELIVERY stop must still be blank at IN_TRANSIT
    expect(delivery.arrivedAt).toBeNull();
    expect(delivery.completedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// L. Phase 5C — Undo safety: stop timestamps are rolled back on undo
// ---------------------------------------------------------------------------

describe("L. undo rolls back stop execution timestamps (Phase 5C)", () => {
  it("undo ARRIVED_AT_DELIVERY clears delivery.arrivedAt", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });

    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const before = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    expect(before.arrivedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatch.id, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    expect(after.arrivedAt).toBeNull();
    expect(after.completedAt).toBeNull();
  });

  it("undo DELIVERED clears delivery.completedAt only", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });

    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const before = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    expect(before.arrivedAt).not.toBeNull();
    expect(before.completedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatch.id, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    // arrivedAt was stamped by ARRIVED_AT_DELIVERY — undo of DELIVERED must not touch it
    expect(after.arrivedAt).not.toBeNull();
    expect(after.completedAt).toBeNull();
  });

  it("undo AT_PICKUP clears pickup.arrivedAt", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });

    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const before = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(before.arrivedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatch.id, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(after.arrivedAt).toBeNull();
    expect(after.completedAt).toBeNull();
  });

  it("undo IN_TRANSIT clears pickup.completedAt only", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });

    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const before = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(before.arrivedAt).not.toBeNull();
    expect(before.completedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatch.id, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    // arrivedAt was stamped by AT_PICKUP — undo of IN_TRANSIT must not touch it
    expect(after.arrivedAt).not.toBeNull();
    expect(after.completedAt).toBeNull();
  });

  it("undo IN_TRANSIT (from AT_PICKUP path) still correctly clears PICKUP.completedAt", async () => {
    // Regression guard: the `from === "IN_TRANSIT" && to === "AT_PICKUP"` fix
    // must not break the existing L4 behaviour when the direction is AT_PICKUP→IN_TRANSIT.
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });

    for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const) {
      await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status }, orgA.actor);
    }

    const before = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(before.arrivedAt).not.toBeNull();
    expect(before.completedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatch.id, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    expect(after.arrivedAt).not.toBeNull();
    expect(after.completedAt).toBeNull();
  });

  it("legacy dispatch (no stops) undo does not crash", async () => {
    const order = await prisma.order.create({
      data: richOrderData(orgA.organizationId, orgA.customerId),
    });

    const now = new Date();
    // Insert a legacy dispatch directly — no stops (simulating pre-Phase-5B).
    const legacy = await prisma.dispatch.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchNumber: `DSP-LEGACY-${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
        createdByUserId: orgA.actor.userId,
        status: "EN_ROUTE_TO_PICKUP",
        pickupDateScheduled: new Date("2037-06-01T08:00:00Z"),
        deliveryDateScheduled: new Date("2037-06-03T18:00:00Z"),
      },
    });
    // History entries required by undoStatus (needs 2 rows, latest within 120s)
    await prisma.dispatchStatusHistory.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: legacy.id,
        status: "DRAFT",
        changedByUserId: orgA.actor.userId,
        createdAt: new Date(now.getTime() - 2000),
      },
    });
    await prisma.dispatchStatusHistory.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: legacy.id,
        status: "EN_ROUTE_TO_PICKUP",
        changedByUserId: orgA.actor.userId,
        createdAt: new Date(now.getTime() - 500),
      },
    });
    // Open assignment required by undoStatus → closeOpenAssignment (CANCELLED path
    // is not taken here, but the assignment query still needs a row to be safe).
    await prisma.dispatchAssignment.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: legacy.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
      },
    });

    // Confirm no stops exist for this dispatch
    const stopsBefore = await prisma.dispatchStop.findMany({ where: { dispatchId: legacy.id } });
    expect(stopsBefore).toHaveLength(0);

    // Undo must not throw even with zero stops
    await expect(
      dispatches.undoStatus(orgA.organizationId, legacy.id, orgA.actor),
    ).resolves.toBeDefined();

    const stopsAfter = await prisma.dispatchStop.findMany({ where: { dispatchId: legacy.id } });
    expect(stopsAfter).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// M. Phase 5C Step 2 — AT_STOP execution lifecycle for INTERMEDIATE stops
//
// Architecture note: createStopSnapshots currently creates only PICKUP (index 0)
// and DELIVERY (index 1) stops. INTERMEDIATE stops do not yet have a production
// creation path. Tests M1–M9 insert INTERMEDIATE stops manually to verify the
// stamping logic works when such stops exist. Tests G and H verify the no-op
// safety for the current architecture (no INTERMEDIATE stops).
// ---------------------------------------------------------------------------

/// Creates a dispatch at a given status with PICKUP / INTERMEDIATE / DELIVERY stops
/// inserted directly so AT_STOP stamping can be exercised without a production
/// creation path for intermediate stops.
async function seedDispatchWithIntermediate(
  fix: Fixture,
  initialStatus: "IN_TRANSIT" | "AT_STOP",
): Promise<{ dispatchId: string; orderId: string }> {
  const order = await prisma.order.create({ data: richOrderData(fix.organizationId, fix.customerId) });
  const dispatch = await prisma.dispatch.create({
    data: {
      organizationId: fix.organizationId,
      dispatchNumber: `DSP-M-${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      driverId: fix.driverId,
      vehicleId: fix.vehicleId,
      createdByUserId: fix.actor.userId,
      status: initialStatus,
      pickupDateScheduled: new Date("2037-06-01T08:00:00Z"),
      deliveryDateScheduled: new Date("2037-06-03T18:00:00Z"),
    },
  });
  // Three-stop layout: PICKUP → INTERMEDIATE → DELIVERY
  await prisma.dispatchStop.createMany({
    data: [
      {
        organizationId: fix.organizationId,
        dispatchId: dispatch.id,
        stopIndex: 0,
        stopType: "PICKUP",
        address: "1 Start St",
        city: "Tashkent",
      },
      {
        organizationId: fix.organizationId,
        dispatchId: dispatch.id,
        stopIndex: 1,
        stopType: "INTERMEDIATE",
        address: "5 Mid Rd",
        city: "Jizzakh",
      },
      {
        organizationId: fix.organizationId,
        dispatchId: dispatch.id,
        stopIndex: 2,
        stopType: "DELIVERY",
        address: "9 End Ave",
        city: "Samarkand",
      },
    ],
  });
  // Seed status history so undoStatus has ≥ 2 rows within the 120 s window.
  const now = new Date();
  if (initialStatus === "IN_TRANSIT") {
    await prisma.dispatchStatusHistory.createMany({
      data: [
        {
          organizationId: fix.organizationId,
          dispatchId: dispatch.id,
          status: "AT_PICKUP",
          changedByUserId: fix.actor.userId,
          createdAt: new Date(now.getTime() - 4000),
        },
        {
          organizationId: fix.organizationId,
          dispatchId: dispatch.id,
          status: "IN_TRANSIT",
          changedByUserId: fix.actor.userId,
          createdAt: new Date(now.getTime() - 2000),
        },
      ],
    });
  } else {
    // AT_STOP
    await prisma.dispatchStatusHistory.createMany({
      data: [
        {
          organizationId: fix.organizationId,
          dispatchId: dispatch.id,
          status: "IN_TRANSIT",
          changedByUserId: fix.actor.userId,
          createdAt: new Date(now.getTime() - 4000),
        },
        {
          organizationId: fix.organizationId,
          dispatchId: dispatch.id,
          status: "AT_STOP",
          changedByUserId: fix.actor.userId,
          createdAt: new Date(now.getTime() - 2000),
        },
      ],
    });
  }
  await prisma.dispatchAssignment.create({
    data: {
      organizationId: fix.organizationId,
      dispatchId: dispatch.id,
      driverId: fix.driverId,
      vehicleId: fix.vehicleId,
    },
  });
  return { dispatchId: dispatch.id, orderId: order.id };
}

describe("M. AT_STOP execution lifecycle for INTERMEDIATE stops (Phase 5C Step 2)", () => {
  // A. AT_STOP entry stamps intermediate.arrivedAt
  it("IN_TRANSIT → AT_STOP stamps intermediate.arrivedAt, completedAt remains null", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "IN_TRANSIT");

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);

    const intermediate = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE" },
    });
    expect(intermediate.arrivedAt).not.toBeNull();
    expect(intermediate.completedAt).toBeNull();
  });

  // B. AT_STOP exit stamps intermediate.completedAt, arrivedAt preserved
  it("AT_STOP → IN_TRANSIT stamps intermediate.completedAt, arrivedAt preserved", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "AT_STOP");

    // Stamp arrivedAt first (simulating a prior AT_STOP entry)
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      data: { arrivedAt: new Date(Date.now() - 3000) },
    });

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);

    const intermediate = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE" },
    });
    expect(intermediate.arrivedAt).not.toBeNull();
    expect(intermediate.completedAt).not.toBeNull();
    // arrivedAt must be the earlier value, not overwritten by the IN_TRANSIT stamp
    expect(intermediate.completedAt!.getTime()).toBeGreaterThan(intermediate.arrivedAt!.getTime());
  });

  // C. Direct delivery — no AT_STOP → INTERMEDIATE not stamped
  it("direct IN_TRANSIT → ARRIVED_AT_DELIVERY does not stamp INTERMEDIATE stop", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "IN_TRANSIT");

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "ARRIVED_AT_DELIVERY" }, orgA.actor);

    const intermediate = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE" },
    });
    expect(intermediate.arrivedAt).toBeNull();
    expect(intermediate.completedAt).toBeNull();
  });

  // H. Stop isolation — PICKUP and DELIVERY unaffected by AT_STOP transitions
  it("AT_STOP transitions do not contaminate PICKUP or DELIVERY stops", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "IN_TRANSIT");

    // Pre-stamp PICKUP to simulate the pickup phase already completed
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "PICKUP" },
      data: { arrivedAt: new Date(Date.now() - 10000), completedAt: new Date(Date.now() - 8000) },
    });

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);

    const pickup = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "PICKUP" } });
    const delivery = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "DELIVERY" } });

    // PICKUP timestamps must be unchanged
    expect(pickup.arrivedAt).not.toBeNull();
    expect(pickup.completedAt).not.toBeNull();
    // DELIVERY must still be blank
    expect(delivery.arrivedAt).toBeNull();
    expect(delivery.completedAt).toBeNull();
  });

  // D. Undo AT_STOP arrival — arrivedAt cleared
  it("undo AT_STOP clears intermediate.arrivedAt", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "IN_TRANSIT");

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);

    const before = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    expect(before.arrivedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    expect(after.arrivedAt).toBeNull();
    expect(after.completedAt).toBeNull();
  });

  // E. Undo AT_STOP completion — completedAt cleared, arrivedAt preserved
  it("undo IN_TRANSIT (from AT_STOP) clears intermediate.completedAt only", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "AT_STOP");

    // Stamp arrivedAt (simulating prior AT_STOP entry)
    const arrivedAt = new Date(Date.now() - 5000);
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      data: { arrivedAt },
    });

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);

    const before = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    expect(before.arrivedAt).not.toBeNull();
    expect(before.completedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);

    const after = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    // arrivedAt was stamped by the earlier AT_STOP entry — undo of IN_TRANSIT must not clear it
    expect(after.arrivedAt).not.toBeNull();
    expect(after.completedAt).toBeNull();
  });

  // F. First-event semantics — AT_STOP re-entry does not overwrite original arrivedAt
  it("re-entering AT_STOP does not overwrite original intermediate.arrivedAt", async () => {
    const { dispatchId } = await seedDispatchWithIntermediate(orgA, "IN_TRANSIT");

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    const firstEntry = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    const t1 = firstEntry.arrivedAt!;

    // Exit back to IN_TRANSIT (stamps completedAt)
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);

    // Re-enter AT_STOP — arrivedAt IS NULL check prevents overwrite
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    const secondEntry = await prisma.dispatchStop.findFirstOrThrow({ where: { dispatchId, stopType: "INTERMEDIATE" } });

    // arrivedAt must still be the original T1 (completedAt was set by the exit, then arrivedAt was already set)
    expect(secondEntry.arrivedAt!.getTime()).toBe(t1.getTime());
  });

  // G. Legacy dispatch (no INTERMEDIATE stops) — AT_STOP transition does not crash
  it("dispatch without INTERMEDIATE stops can enter/exit AT_STOP without crash", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const legacy = await prisma.dispatch.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchNumber: `DSP-LEGACY-M-${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
        createdByUserId: orgA.actor.userId,
        status: "IN_TRANSIT",
        pickupDateScheduled: new Date("2037-06-01T08:00:00Z"),
        deliveryDateScheduled: new Date("2037-06-03T18:00:00Z"),
      },
    });
    await prisma.dispatchAssignment.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: legacy.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
      },
    });

    // Confirm no stops at all
    const stopsBefore = await prisma.dispatchStop.findMany({ where: { dispatchId: legacy.id } });
    expect(stopsBefore).toHaveLength(0);

    // IN_TRANSIT → AT_STOP must not crash despite zero INTERMEDIATE rows
    await expect(
      dispatches.updateStatus(orgA.organizationId, legacy.id, { status: "AT_STOP" }, orgA.actor),
    ).resolves.toBeDefined();

    const stopsAfter = await prisma.dispatchStop.findMany({ where: { dispatchId: legacy.id } });
    expect(stopsAfter).toHaveLength(0);
  });

  // I. Multiple INTERMEDIATE stops — limitation documented
  //
  // The current updateMany approach stamps ALL INTERMEDIATE stops with arrivedAt
  // when entering AT_STOP. With a single stop this is correct; with multiple
  // stops this is WRONG (all get stamped simultaneously regardless of visit order).
  // Active-stop selection is deferred to the multi-stop orchestration phase.
  it("multiple INTERMEDIATE stops: only the first unvisited gets arrivedAt stamped (Phase 5D-2)", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const dispatch = await prisma.dispatch.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchNumber: `DSP-MULTI-${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
        createdByUserId: orgA.actor.userId,
        status: "IN_TRANSIT",
        pickupDateScheduled: new Date("2037-06-01T08:00:00Z"),
        deliveryDateScheduled: new Date("2037-06-05T18:00:00Z"),
      },
    });
    await prisma.dispatchStop.createMany({
      data: [
        { organizationId: orgA.organizationId, dispatchId: dispatch.id, stopIndex: 0, stopType: "PICKUP", address: "Start", city: "Tashkent" },
        { organizationId: orgA.organizationId, dispatchId: dispatch.id, stopIndex: 1, stopType: "INTERMEDIATE", address: "Mid A", city: "Jizzakh" },
        { organizationId: orgA.organizationId, dispatchId: dispatch.id, stopIndex: 2, stopType: "INTERMEDIATE", address: "Mid B", city: "Navoi" },
        { organizationId: orgA.organizationId, dispatchId: dispatch.id, stopIndex: 3, stopType: "DELIVERY", address: "End", city: "Samarkand" },
      ],
    });
    await prisma.dispatchAssignment.create({
      data: {
        organizationId: orgA.organizationId,
        dispatchId: dispatch.id,
        driverId: orgA.driverId,
        vehicleId: orgA.vehicleId,
      },
    });

    await dispatches.updateStatus(orgA.organizationId, dispatch.id, { status: "AT_STOP" }, orgA.actor);

    const intermediates = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(intermediates).toHaveLength(2);
    expect(intermediates[0].arrivedAt).not.toBeNull(); // first stop: stamped
    expect(intermediates[1].arrivedAt).toBeNull();      // second stop: not yet visited
  });
});

// ---------------------------------------------------------------------------
// N. Phase 5D-1 — OrderStop snapshot: createStopSnapshots reads OrderStop rows
//
// These tests verify the new multi-stop snapshot behaviour introduced in
// Phase 5D-1. They use the production createStopSnapshots path (via
// dispatches.create / orders.assign) and real OrderStop rows.
// ---------------------------------------------------------------------------

/// Creates an OrderStop row for an order at the given intermediate stopIndex.
async function createOrderStop(
  orderId: string,
  organizationId: string,
  stopIndex: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.orderStop.create({
    data: {
      organizationId,
      orderId,
      stopIndex,
      address: `${stopIndex} Intermediate St`,
      city: `Stop City ${stopIndex}`,
      postalCode: `${100000 + stopIndex}`,
      countryCode: "UZ",
      placeName: `Intermediate Place ${stopIndex}`,
      contactName: `Contact ${stopIndex}`,
      contactPhone: `+998 90 ${stopIndex}00 00 00`,
      instructions: `Instructions for stop ${stopIndex}`,
      windowStart: new Date(`2037-06-02T${String(6 + stopIndex).padStart(2, "0")}:00:00Z`),
      windowEnd: new Date(`2037-06-02T${String(8 + stopIndex).padStart(2, "0")}:00:00Z`),
      lat: new Prisma.Decimal(`41.${stopIndex}000`),
      lng: new Prisma.Decimal(`69.${stopIndex}000`),
      ...overrides,
    },
  });
}

describe("N. Phase 5D-1 — OrderStop snapshot creation", () => {
  // A. Zero intermediate stops — backward compat
  it("N-A: order with no OrderStops creates exactly 2 dispatch stops (PICKUP + DELIVERY)", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const stops = await prisma.dispatchStop.findMany({
      where: { organizationId: orgA.organizationId },
      orderBy: { stopIndex: "asc" },
    });

    expect(stops).toHaveLength(2);
    expect(stops[0].stopIndex).toBe(0);
    expect(stops[0].stopType).toBe("PICKUP");
    expect(stops[1].stopIndex).toBe(1);
    expect(stops[1].stopType).toBe("DELIVERY");
  });

  // B. One intermediate stop
  it("N-B: order with 1 OrderStop creates 3 stops (PICKUP + INTERMEDIATE + DELIVERY)", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await createOrderStop(order.id, orgA.organizationId, 1);

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const stops = await prisma.dispatchStop.findMany({
      where: { organizationId: orgA.organizationId },
      orderBy: { stopIndex: "asc" },
    });

    expect(stops).toHaveLength(3);
    expect(stops[0].stopIndex).toBe(0);
    expect(stops[0].stopType).toBe("PICKUP");
    expect(stops[1].stopIndex).toBe(1);
    expect(stops[1].stopType).toBe("INTERMEDIATE");
    expect(stops[2].stopIndex).toBe(2);
    expect(stops[2].stopType).toBe("DELIVERY");
  });

  it("N-B: intermediate stop snapshot fields match OrderStop data", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const orderStop = await createOrderStop(order.id, orgA.organizationId, 1);

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    const intermediate = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    expect(intermediate.address).toBe(orderStop.address);
    expect(intermediate.city).toBe(orderStop.city);
    expect(intermediate.postalCode).toBe(orderStop.postalCode);
    expect(intermediate.countryCode).toBe(orderStop.countryCode);
    expect(intermediate.placeName).toBe(orderStop.placeName);
    expect(intermediate.contactName).toBe(orderStop.contactName);
    expect(intermediate.contactPhone).toBe(orderStop.contactPhone);
    expect(intermediate.instructions).toBe(orderStop.instructions);
    expect(intermediate.windowStart?.toISOString()).toBe(orderStop.windowStart?.toISOString());
    expect(intermediate.windowEnd?.toISOString()).toBe(orderStop.windowEnd?.toISOString());
    expect(Number(intermediate.lat)).toBeCloseTo(Number(orderStop.lat), 4);
    expect(Number(intermediate.lng)).toBeCloseTo(Number(orderStop.lng), 4);
    // Execution fields must start null — they are NOT copied from OrderStop
    expect(intermediate.arrivedAt).toBeNull();
    expect(intermediate.completedAt).toBeNull();
    expect(intermediate.failedAt).toBeNull();
    expect(intermediate.failureReason).toBeNull();
    expect(intermediate.failureNotes).toBeNull();
  });

  // C. Multiple intermediate stops
  it("N-C: 3 OrderStops produce 5 dispatch stops (PICKUP + 3×INTERMEDIATE + DELIVERY)", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await createOrderStop(order.id, orgA.organizationId, 1);
    await createOrderStop(order.id, orgA.organizationId, 2);
    await createOrderStop(order.id, orgA.organizationId, 3);

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const stops = await prisma.dispatchStop.findMany({
      where: { organizationId: orgA.organizationId },
      orderBy: { stopIndex: "asc" },
    });

    expect(stops).toHaveLength(5);
    expect(stops[0].stopType).toBe("PICKUP");
    expect(stops[0].stopIndex).toBe(0);
    expect(stops[1].stopType).toBe("INTERMEDIATE");
    expect(stops[1].stopIndex).toBe(1);
    expect(stops[2].stopType).toBe("INTERMEDIATE");
    expect(stops[2].stopIndex).toBe(2);
    expect(stops[3].stopType).toBe("INTERMEDIATE");
    expect(stops[3].stopIndex).toBe(3);
    expect(stops[4].stopType).toBe("DELIVERY");
    expect(stops[4].stopIndex).toBe(4);
  });

  it("N-C: intermediate stop ordering follows OrderStop.stopIndex ascending", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    // Insert out of logical order to confirm sorting is applied
    await createOrderStop(order.id, orgA.organizationId, 3, { address: "Third Stop", city: "Navoi" });
    await createOrderStop(order.id, orgA.organizationId, 1, { address: "First Stop", city: "Jizzakh" });
    await createOrderStop(order.id, orgA.organizationId, 2, { address: "Second Stop", city: "Gulistan" });

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    const intermediates = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });

    expect(intermediates).toHaveLength(3);
    expect(intermediates[0].address).toBe("First Stop");
    expect(intermediates[0].city).toBe("Jizzakh");
    expect(intermediates[1].address).toBe("Second Stop");
    expect(intermediates[1].city).toBe("Gulistan");
    expect(intermediates[2].address).toBe("Third Stop");
    expect(intermediates[2].city).toBe("Navoi");
  });

  // D. Snapshot immutability — editing OrderStop after dispatch does not change DispatchStop
  it("N-D: editing OrderStop after dispatch creation does not alter DispatchStop snapshot", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const orderStop = await createOrderStop(order.id, orgA.organizationId, 1);

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    const before = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    // Mutate the OrderStop directly
    await prisma.orderStop.update({
      where: { id: orderStop.id },
      data: { address: "CHANGED ADDRESS", city: "CHANGED CITY", contactName: "CHANGED CONTACT" },
    });

    // DispatchStop snapshot must be unchanged
    const after = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    expect(after.address).toBe(before.address);
    expect(after.city).toBe(before.city);
    expect(after.contactName).toBe(before.contactName);
  });

  // E. Re-dispatch snapshot
  it("N-E: re-dispatch after DELIVERY_FAILED snapshots current OrderStop state; old stops unchanged", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    const orderStop = await createOrderStop(order.id, orgA.organizationId, 1, {
      address: "Original Intermediate",
      city: "Jizzakh",
    });

    // First dispatch (production path)
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatchA = await prisma.dispatch.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, orderId: order.id },
    });

    // Force DELIVERY_FAILED (terminal state, simulating the failure without walking the full flow)
    await prisma.dispatch.update({
      where: { id: dispatchA.id },
      data: { status: "DELIVERY_FAILED", failureReason: "OTHER", failedAt: new Date() },
    });
    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING" } });

    // Update the OrderStop plan before re-dispatch
    await prisma.orderStop.update({
      where: { id: orderStop.id },
      data: { address: "New Intermediate", city: "Gulistan" },
    });

    // Re-dispatch
    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );
    const dispatchB = await prisma.dispatch.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, orderId: order.id, id: { not: dispatchA.id } },
    });

    // Dispatch A's intermediate stop must still show "Original Intermediate"
    const oldIntermediate = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatchA.id, stopType: "INTERMEDIATE" },
    });
    expect(oldIntermediate.address).toBe("Original Intermediate");

    // Dispatch B's intermediate stop must show the updated "New Intermediate"
    const newIntermediate = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatchB.id, stopType: "INTERMEDIATE" },
    });
    expect(newIntermediate.address).toBe("New Intermediate");
    expect(newIntermediate.city).toBe("Gulistan");

    // Dispatch B execution timestamps must all be null
    expect(newIntermediate.arrivedAt).toBeNull();
    expect(newIntermediate.completedAt).toBeNull();
    expect(newIntermediate.failedAt).toBeNull();
  });

  // F. Assign path — orders.assign creates stops from OrderStops
  it("N-F: orders.assign path also snapshots OrderStop rows into DispatchStop", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await createOrderStop(order.id, orgA.organizationId, 1, { address: "Assigned Intermediate", city: "Chirchiq" });

    await orders.assign(
      orgA.organizationId,
      order.id,
      { driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({
      where: { organizationId: orgA.organizationId, orderId: order.id },
    });
    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { stopIndex: "asc" },
    });

    expect(stops).toHaveLength(3);
    expect(stops[1].stopType).toBe("INTERMEDIATE");
    expect(stops[1].address).toBe("Assigned Intermediate");
    expect(stops[1].city).toBe("Chirchiq");
  });

  // G. Organization isolation — OrderStop from org A cannot leak into org B dispatch
  it("N-G: OrderStop rows from org A are never used in org B dispatch snapshots", async () => {
    const orderA = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await createOrderStop(orderA.id, orgA.organizationId, 1, { address: "Org A Stop" });

    const orderB = await prisma.order.create({ data: richOrderData(orgB.organizationId, orgB.customerId) });

    // Org B dispatch: orderB has NO OrderStops
    await dispatches.create(
      orgB.organizationId,
      { orderId: orderB.id, driverId: orgB.driverId, vehicleId: orgB.vehicleId },
      orgB.actor,
    );

    const dispatchB = await prisma.dispatch.findFirstOrThrow({
      where: { organizationId: orgB.organizationId },
    });
    const bStops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatchB.id },
      orderBy: { stopIndex: "asc" },
    });

    // Org B's dispatch must be the baseline 2-stop shape — org A's OrderStop must not appear
    expect(bStops).toHaveLength(2);
    expect(bStops.every((s) => s.organizationId === orgB.organizationId)).toBe(true);
    expect(bStops.some((s) => s.address === "Org A Stop")).toBe(false);
  });

  // H. Transaction integrity — orphaned intermediate is impossible
  //
  // Testing a genuine mid-snapshot rollback via the production service layer
  // would require injecting a failure inside the transaction, which would add
  // test-only production hooks. Instead we verify the positive invariant:
  // a successful create always produces a consistent set (all stops present,
  // correct count, no partially-created dispatch). The transactionality guarantee
  // is covered by the Prisma $transaction contract and the fact that all creates
  // share a single tx instance.
  it("N-H: after successful create all stops exist and execution fields are null", async () => {
    const order = await prisma.order.create({ data: richOrderData(orgA.organizationId, orgA.customerId) });
    await createOrderStop(order.id, orgA.organizationId, 1);
    await createOrderStop(order.id, orgA.organizationId, 2);

    await dispatches.create(
      orgA.organizationId,
      { orderId: order.id, driverId: orgA.driverId, vehicleId: orgA.vehicleId },
      orgA.actor,
    );

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { organizationId: orgA.organizationId } });
    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { stopIndex: "asc" },
    });

    // 4 stops (PICKUP + 2 INTERMEDIATE + DELIVERY)
    expect(stops).toHaveLength(4);
    stops.forEach((s) => {
      expect(s.arrivedAt).toBeNull();
      expect(s.completedAt).toBeNull();
      expect(s.failedAt).toBeNull();
      expect(s.failureReason).toBeNull();
      expect(s.failureNotes).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// O. Phase 5D-2 — Current intermediate stop execution
//
// Verifies that AT_STOP/undo only stamps or clears a single intermediate stop
// at a time, progressing through stops in ascending stopIndex order.
// ---------------------------------------------------------------------------

/// Creates a dispatch with `intermediateCount` INTERMEDIATE stops (plus PICKUP
/// and DELIVERY) at the given initial status, with a dispatchAssignment and
/// two status-history rows so undoStatus works immediately.
async function seedMultiStopDispatch(
  fix: Fixture,
  intermediateCount: number,
  initialStatus: "IN_TRANSIT" | "AT_STOP",
): Promise<{ dispatchId: string; orderId: string }> {
  const order = await prisma.order.create({ data: richOrderData(fix.organizationId, fix.customerId) });
  const dispatch = await prisma.dispatch.create({
    data: {
      organizationId: fix.organizationId,
      dispatchNumber: `DSP-O-${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      driverId: fix.driverId,
      vehicleId: fix.vehicleId,
      createdByUserId: fix.actor.userId,
      status: initialStatus,
      pickupDateScheduled: new Date("2037-07-01T08:00:00Z"),
      deliveryDateScheduled: new Date("2037-07-05T18:00:00Z"),
    },
  });

  const stopRows: {
    organizationId: string;
    dispatchId: string;
    stopIndex: number;
    stopType: "PICKUP" | "INTERMEDIATE" | "DELIVERY";
    address: string;
    city: string;
  }[] = [
    { organizationId: fix.organizationId, dispatchId: dispatch.id, stopIndex: 0, stopType: "PICKUP", address: "1 Start St", city: "Tashkent" },
  ];
  for (let i = 1; i <= intermediateCount; i++) {
    stopRows.push({
      organizationId: fix.organizationId,
      dispatchId: dispatch.id,
      stopIndex: i,
      stopType: "INTERMEDIATE",
      address: `${i * 10} Mid Rd`,
      city: `MidCity${i}`,
    });
  }
  stopRows.push({
    organizationId: fix.organizationId,
    dispatchId: dispatch.id,
    stopIndex: intermediateCount + 1,
    stopType: "DELIVERY",
    address: "9 End Ave",
    city: "Samarkand",
  });
  await prisma.dispatchStop.createMany({ data: stopRows });

  const now = new Date();
  const prevStatus = initialStatus === "IN_TRANSIT" ? "AT_PICKUP" : "IN_TRANSIT";
  await prisma.dispatchStatusHistory.createMany({
    data: [
      {
        organizationId: fix.organizationId,
        dispatchId: dispatch.id,
        status: prevStatus,
        changedByUserId: fix.actor.userId,
        createdAt: new Date(now.getTime() - 4000),
      },
      {
        organizationId: fix.organizationId,
        dispatchId: dispatch.id,
        status: initialStatus,
        changedByUserId: fix.actor.userId,
        createdAt: new Date(now.getTime() - 2000),
      },
    ],
  });
  await prisma.dispatchAssignment.create({
    data: {
      organizationId: fix.organizationId,
      dispatchId: dispatch.id,
      driverId: fix.driverId,
      vehicleId: fix.vehicleId,
    },
  });
  return { dispatchId: dispatch.id, orderId: order.id };
}

describe("O. Phase 5D-2 — Current intermediate stop execution (multi-stop)", () => {
  // O-A: AT_STOP stamps only the first unvisited intermediate (not all)
  it("O-A: AT_STOP stamps only stop #1 arrivedAt when two intermediates exist", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).not.toBeNull(); // stop 1 stamped
    expect(stops[1].arrivedAt).toBeNull();      // stop 2 not yet visited
  });

  // O-B: After stop 1 is completed, AT_STOP stamps stop 2 (not stop 1 again)
  it("O-B: AT_STOP stamps stop #2 arrivedAt after stop #1 is completed", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "AT_STOP");
    // Simulate stop 1 arrived (bypassing service to control timing)
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
      data: { arrivedAt: new Date(Date.now() - 10000) },
    });
    // Depart stop 1 — findActiveIntermediateStop picks stop 1
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    // Arrive at stop 2 — findCurrentIntermediateStop picks stop 2 (stop 1 has arrivedAt)
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].completedAt).not.toBeNull(); // stop 1 departed
    expect(stops[1].arrivedAt).not.toBeNull();    // stop 2 arrived
    expect(stops[1].completedAt).toBeNull();       // stop 2 not yet departed
  });

  // O-C: IN_TRANSIT from AT_STOP completes only the active stop, not stop 2
  it("O-C: IN_TRANSIT (from AT_STOP) completes only the active stop", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "AT_STOP");
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
      data: { arrivedAt: new Date(Date.now() - 5000) },
    });
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).not.toBeNull();
    expect(stops[0].completedAt).not.toBeNull();
    expect(stops[1].arrivedAt).toBeNull();
    expect(stops[1].completedAt).toBeNull();
  });

  // O-D: Full 2-stop sequential execution loop
  it("O-D: full 2-stop sequential loop stamps each stop in arrival then departure order", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).not.toBeNull();
    expect(stops[0].completedAt).not.toBeNull();
    expect(stops[1].arrivedAt).not.toBeNull();
    expect(stops[1].completedAt).not.toBeNull();
    expect(stops[0].arrivedAt!.getTime()).toBeLessThanOrEqual(stops[1].arrivedAt!.getTime());
  });

  // O-E: Zero intermediates — AT_STOP silently no-ops without error
  it("O-E: AT_STOP with no intermediate stops completes without error", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 0, "IN_TRANSIT");
    await expect(
      dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor),
    ).resolves.toBeDefined();
    const intermediates = await prisma.dispatchStop.findMany({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    expect(intermediates).toHaveLength(0);
  });

  // O-F: Zero intermediates — IN_TRANSIT from AT_STOP silently no-ops without error
  it("O-F: IN_TRANSIT from AT_STOP with no intermediate stops completes without error", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 0, "AT_STOP");
    await expect(
      dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor),
    ).resolves.toBeDefined();
  });

  // O-G: Three intermediates — sequential visits stamp each stop in order
  it("O-G: three intermediate stops are visited sequentially: #1, then #2, then #3", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 3, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops).toHaveLength(3);
    stops.forEach((s) => {
      expect(s.arrivedAt).not.toBeNull();
      expect(s.completedAt).not.toBeNull();
    });
    expect(stops[0].arrivedAt!.getTime()).toBeLessThanOrEqual(stops[1].arrivedAt!.getTime());
    expect(stops[1].arrivedAt!.getTime()).toBeLessThanOrEqual(stops[2].arrivedAt!.getTime());
  });

  // O-H: Undo AT_STOP on two-stop dispatch — clears only stop 1 arrivedAt
  it("O-H: undo AT_STOP clears only stop #1 arrivedAt, stop #2 untouched", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).toBeNull(); // cleared by undo
    expect(stops[1].arrivedAt).toBeNull(); // was never set
  });

  // O-I: Undo second AT_STOP — clears stop 2 arrivedAt, stop 1 untouched
  it("O-I: undo second AT_STOP clears stop #2 arrivedAt, leaving stop #1 untouched", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "AT_STOP");
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
      data: { arrivedAt: new Date(Date.now() - 10000) },
    });
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).not.toBeNull();  // stop 1 arrival preserved
    expect(stops[0].completedAt).not.toBeNull(); // stop 1 departure preserved
    expect(stops[1].arrivedAt).toBeNull();         // stop 2 arrival cleared by undo
  });

  // O-J: Undo IN_TRANSIT (from AT_STOP) — clears only active stop completedAt, arrivedAt preserved
  it("O-J: undo IN_TRANSIT (from AT_STOP) clears only the active stop completedAt", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "AT_STOP");
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
      data: { arrivedAt: new Date(Date.now() - 5000) },
    });
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).not.toBeNull();
    expect(stops[0].completedAt).toBeNull(); // cleared by undo
    expect(stops[1].arrivedAt).toBeNull();
    expect(stops[1].completedAt).toBeNull();
  });

  // O-K: Undo IN_TRANSIT after two stops complete — clears only stop 2 completedAt (most recent)
  it("O-K: undo IN_TRANSIT after two stops done clears only stop #2 completedAt", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "IN_TRANSIT" }, orgA.actor);
    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].completedAt).not.toBeNull(); // stop 1 completion preserved
    expect(stops[1].arrivedAt).not.toBeNull();    // stop 2 arrival preserved
    expect(stops[1].completedAt).toBeNull();       // stop 2 completion cleared by undo
  });

  // O-L: Stop 1 failed — AT_STOP skips it and stamps the next unvisited stop
  it("O-L: AT_STOP skips a failed intermediate and stamps the next unvisited stop", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await prisma.dispatchStop.updateMany({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
      data: { failedAt: new Date(Date.now() - 5000), failureReason: "INACCESSIBLE" },
    });
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    expect(stops[0].arrivedAt).toBeNull();     // stop 1 failed, not arrived
    expect(stops[1].arrivedAt).not.toBeNull(); // stop 2 is the new current stop
  });

  // O-M: IN_TRANSIT → ARRIVED_AT_DELIVERY shortcut — no intermediate stop is stamped
  it("O-M: IN_TRANSIT shortcut to ARRIVED_AT_DELIVERY does not stamp any intermediate", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "ARRIVED_AT_DELIVERY" }, orgA.actor);
    const stops = await prisma.dispatchStop.findMany({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    expect(stops.every((s) => s.arrivedAt === null && s.completedAt === null)).toBe(true);
  });

  // O-N: Undo AT_STOP when no arrivedAt is set (no active stop) — no-op, no error
  it("O-N: undo AT_STOP with no active stop does not throw and leaves stops unchanged", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "AT_STOP");
    // No arrivedAt set on any stop — findActiveIntermediateStop returns null
    await expect(
      dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor),
    ).resolves.toBeDefined();
    const stops = await prisma.dispatchStop.findMany({ where: { dispatchId, stopType: "INTERMEDIATE" } });
    stops.forEach((s) => expect(s.arrivedAt).toBeNull());
  });

  // O-O: Undo AT_STOP then re-enter AT_STOP restamps the same stop
  it("O-O: undo AT_STOP then re-enter AT_STOP correctly restamps stop #1", async () => {
    const { dispatchId } = await seedMultiStopDispatch(orgA, 2, "IN_TRANSIT");
    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    const afterFirstEntry = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
    });
    expect(afterFirstEntry.arrivedAt).not.toBeNull();

    await dispatches.undoStatus(orgA.organizationId, dispatchId, orgA.actor);
    const afterUndo = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
    });
    expect(afterUndo.arrivedAt).toBeNull();

    await dispatches.updateStatus(orgA.organizationId, dispatchId, { status: "AT_STOP" }, orgA.actor);
    const afterReentry = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 1 },
    });
    // Stop 2 must still be untouched
    const stop2 = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId, stopType: "INTERMEDIATE", stopIndex: 2 },
    });
    expect(afterReentry.arrivedAt).not.toBeNull();
    expect(stop2.arrivedAt).toBeNull();
  });
});
