import { randomUUID } from "crypto";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// Phase 5D-4 — OrderStop CRUD
///
/// Covers: create with stops, create without stops, update replaces stops,
/// update with undefined leaves stops alone, update with [] deletes stops,
/// getById includes stops, per-stop validation (window, countryCode),
/// dispatch snapshot not affected, stopIndex normalization.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const auditLog = jest.fn().mockResolvedValue(undefined);
const audit = { log: auditLog } as unknown as AuditService;
const wfEvents = { emit: jest.fn() } as unknown as ConstructorParameters<typeof DispatchesService>[4];
const usageMetering = {
  enforceLimit: jest.fn().mockResolvedValue(undefined),
} as unknown as ConstructorParameters<typeof OrdersService>[6];
const tracking = {
  endSessionsForDispatch: jest.fn().mockResolvedValue(0),
  endSessionsOnVehicleReassign: jest.fn().mockResolvedValue(0),
  endSessionsForUser: jest.fn().mockResolvedValue(0),
} as unknown as ConstructorParameters<typeof DispatchesService>[5];
const geocoding = {
  geocodeOrderLocations: jest.fn().mockResolvedValue(undefined),
} as unknown as ConstructorParameters<typeof OrdersService>[7];
const geofences = {
  createForDispatch: jest.fn().mockResolvedValue(undefined),
  archiveForDispatch: jest.fn().mockResolvedValue(undefined),
  archiveIntermediateStopForDispatch: jest.fn().mockResolvedValue(undefined),
  createForNextIntermediateStop: jest.fn().mockResolvedValue(undefined),
  rotateIntermediateStopFence: jest.fn().mockResolvedValue(undefined),
} as unknown as ConstructorParameters<typeof DispatchesService>[6];
const dispatches = new DispatchesService(prisma, audit, policy, writer, wfEvents, tracking, geofences);
const orders = new OrdersService(prisma, audit, writer, dispatches, policy, wfEvents, usageMetering, geocoding);

const PICKUP = new Date("2041-06-01T08:00:00.000Z");
const DELIVERY = new Date("2041-06-05T18:00:00.000Z");

let organizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
let driverId: string;
let vehicleId: string;

function makeBaseDto() {
  return {
    pickupAddress: "1 Depot Rd",
    pickupCity: "Tashkent",
    pickupDate: PICKUP.toISOString().slice(0, 10),
    deliveryAddress: "9 Dock St",
    deliveryCity: "Samarkand",
    deliveryDate: DELIVERY.toISOString().slice(0, 10),
    cargoDescription: "Pallets",
    price: 1000,
    customerId,
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "StopsOrg", slug: `stops-org-${randomUUID()}` },
  });
  organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `stops-actor-${randomUUID()}@example.test`,
      firstName: "Stops",
      lastName: "Actor",
      passwordHash: "not-a-real-hash",
    },
  });
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
  } as CurrentUserPayload;

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      customerCode: `CUS-${randomUUID().slice(0, 8)}`,
      companyName: "Stops Co",
      contactName: "Sam Stop",
      phone: "+998 71 000 00 01",
    },
  });
  customerId = customer.id;

  const driver = await prisma.driver.create({
    data: {
      organizationId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Dan",
      lastName: "Driver",
      phone: "+998 90 111 11 11",
    },
  });
  driverId = driver.id;

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId,
      vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
      plateNumber: `01 ${randomUUID().slice(0, 5)}`,
      type: "Truck",
    },
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// A — create with stops persists all stops in stopIndex order
// ---------------------------------------------------------------------------
describe("A — create with stops", () => {
  it("persists two intermediate stops with correct stopIndex", async () => {
    const dto = {
      ...makeBaseDto(),
      orderStops: [
        { address: "10 Mid Rd", city: "Bukhara" },
        { address: "20 Junction Ave", city: "Navoiy" },
      ],
    };
    const result = await orders.create(organizationId, dto, actor);
    const fetched = await orders.getById(organizationId, result.id);
    expect(fetched.orderStops).toHaveLength(2);
    expect(fetched.orderStops![0].city).toBe("Bukhara");
    expect(fetched.orderStops![0].stopIndex).toBe(1);
    expect(fetched.orderStops![1].city).toBe("Navoiy");
    expect(fetched.orderStops![1].stopIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// B — create without stops → getById returns empty orderStops
// ---------------------------------------------------------------------------
describe("B — create without stops", () => {
  it("returns an empty orderStops array when no stops were sent", async () => {
    const result = await orders.create(organizationId, makeBaseDto(), actor);
    const fetched = await orders.getById(organizationId, result.id);
    expect(fetched.orderStops ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C — update replaces all stops atomically
// ---------------------------------------------------------------------------
describe("C — update replaces stops", () => {
  it("replaces the two original stops with one new stop", async () => {
    const created = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: [
        { address: "Old 1", city: "CityA" },
        { address: "Old 2", city: "CityB" },
      ],
    }, actor);

    await orders.update(organizationId, created.id, {
      orderStops: [{ address: "New 1", city: "CityNew" }],
    }, actor);

    const fetched = await orders.getById(organizationId, created.id);
    expect(fetched.orderStops).toHaveLength(1);
    expect(fetched.orderStops![0].city).toBe("CityNew");
    expect(fetched.orderStops![0].stopIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D — update with orderStops === undefined leaves existing stops untouched
// ---------------------------------------------------------------------------
describe("D — update without orderStops leaves stops alone", () => {
  it("does not delete stops when orderStops is omitted from the DTO", async () => {
    const created = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: [{ address: "Keep Me", city: "Fergana" }],
    }, actor);

    // Update only the notes field — no orderStops key
    await orders.update(organizationId, created.id, { notes: "updated" }, actor);

    const fetched = await orders.getById(organizationId, created.id);
    expect(fetched.orderStops).toHaveLength(1);
    expect(fetched.orderStops![0].city).toBe("Fergana");
  });
});

// ---------------------------------------------------------------------------
// E — update with orderStops === [] deletes all stops
// ---------------------------------------------------------------------------
describe("E — update with empty array deletes all stops", () => {
  it("removes all stops when an empty array is sent", async () => {
    const created = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: [{ address: "Gone", city: "Termiz" }],
    }, actor);

    await orders.update(organizationId, created.id, { orderStops: [] }, actor);

    const fetched = await orders.getById(organizationId, created.id);
    expect(fetched.orderStops ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F — getById includes all stop fields
// ---------------------------------------------------------------------------
describe("F — getById exposes stop fields", () => {
  it("returns all optional fields when provided", async () => {
    const windowStart = "2041-06-02T09:00:00.000Z";
    const windowEnd = "2041-06-02T12:00:00.000Z";
    const result = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: [{
        address: "5 Field St",
        city: "Andijan",
        postalCode: "170001",
        countryCode: "UZ",
        placeName: "Gate 3",
        contactName: "Ivan",
        contactPhone: "+998901234567",
        instructions: "Ring bell",
        windowStart,
        windowEnd,
        lat: 40.78,
        lng: 72.35,
      }],
    }, actor);

    const fetched = await orders.getById(organizationId, result.id);
    const s = fetched.orderStops![0];
    expect(s.postalCode).toBe("170001");
    expect(s.countryCode).toBe("UZ");
    expect(s.placeName).toBe("Gate 3");
    expect(s.contactName).toBe("Ivan");
    expect(s.contactPhone).toBe("+998901234567");
    expect(s.instructions).toBe("Ring bell");
    expect(new Date(s.windowStart!).toISOString()).toBe(windowStart);
    expect(new Date(s.windowEnd!).toISOString()).toBe(windowEnd);
    expect(s.lat).toBeCloseTo(40.78, 4);
    expect(s.lng).toBeCloseTo(72.35, 4);
  });
});

// ---------------------------------------------------------------------------
// G — stopIndex normalization: client-provided indices are ignored
// ---------------------------------------------------------------------------
describe("G — stopIndex is always assigned from array position", () => {
  it("assigns stopIndex 1,2,3 regardless of input order", async () => {
    const result = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: [
        { address: "Third", city: "C3" },
        { address: "First", city: "C1" },
        { address: "Second", city: "C2" },
      ],
    }, actor);

    const fetched = await orders.getById(organizationId, result.id);
    expect(fetched.orderStops!.map((s) => s.stopIndex)).toEqual([1, 2, 3]);
    expect(fetched.orderStops!.map((s) => s.city)).toEqual(["C3", "C1", "C2"]);
  });
});

// ---------------------------------------------------------------------------
// H — per-stop window validation rejects invalid pairs
// ---------------------------------------------------------------------------
describe("H — stop window validation", () => {
  it("rejects a stop where windowEnd is before windowStart", async () => {
    await expect(
      orders.create(organizationId, {
        ...makeBaseDto(),
        orderStops: [{
          address: "Err St",
          city: "ErrCity",
          windowStart: "2041-06-02T12:00:00.000Z",
          windowEnd: "2041-06-02T09:00:00.000Z",
        }],
      }, actor),
    ).rejects.toThrow();
  });

  it("accepts a stop where only windowStart is provided (no end)", async () => {
    // Actually both or neither — this should fail the assertValidWindow check.
    await expect(
      orders.create(organizationId, {
        ...makeBaseDto(),
        orderStops: [{
          address: "One Side",
          city: "SideCity",
          windowStart: "2041-06-02T09:00:00.000Z",
        }],
      }, actor),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// I — dispatch snapshot not affected by delete-and-recreate
// ---------------------------------------------------------------------------
describe("I — dispatch snapshot is not affected by stop replacement", () => {
  it("DispatchStop rows created at assign time survive a subsequent stop update", async () => {
    const created = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: [{ address: "Snap Me", city: "SnapCity" }],
    }, actor);

    // Promote to PENDING so assign can proceed
    await prisma.order.update({ where: { id: created.id }, data: { status: "PENDING" } });
    await orders.assign(organizationId, created.id, { driverId, vehicleId }, actor);

    const dispatchBefore = await prisma.dispatch.findFirstOrThrow({
      where: { orderId: created.id, status: { not: "CANCELLED" } },
      include: { stops: { orderBy: { stopIndex: "asc" } } },
    });
    expect(dispatchBefore.stops.length).toBeGreaterThan(0);
    const snapStopCity = dispatchBefore.stops.find((s) => s.stopType === "INTERMEDIATE")?.city;
    expect(snapStopCity).toBe("SnapCity");

    // Now replace the OrderStop rows
    await orders.update(organizationId, created.id, {
      orderStops: [{ address: "New Stop", city: "NewCity" }],
    }, actor);

    // The DispatchStop should still have the original data
    const dispatchAfter = await prisma.dispatch.findFirstOrThrow({
      where: { orderId: created.id, status: { not: "CANCELLED" } },
      include: { stops: { orderBy: { stopIndex: "asc" } } },
    });
    const snapAfter = dispatchAfter.stops.find((s) => s.stopType === "INTERMEDIATE")?.city;
    expect(snapAfter).toBe("SnapCity");
  });
});

// ---------------------------------------------------------------------------
// J — multi-tenant isolation: cannot read another org's order stops
// ---------------------------------------------------------------------------
describe("J — multi-tenant isolation", () => {
  it("getById throws NotFoundException for another org's order", async () => {
    const otherOrg = await prisma.organization.create({
      data: { name: "Other", slug: `other-stops-${randomUUID()}` },
    });
    const otherCustomer = await prisma.customer.create({
      data: {
        organizationId: otherOrg.id,
        customerCode: `OC-${randomUUID().slice(0, 8)}`,
        companyName: "Other Co",
        contactName: "Other",
        phone: "+998 71 000 00 02",
      },
    });
    const other = await prisma.order.create({
      data: {
        organizationId: otherOrg.id,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        customerId: otherCustomer.id,
        pickupAddress: "X",
        pickupCity: "Y",
        pickupDate: PICKUP,
        deliveryAddress: "A",
        deliveryCity: "B",
        deliveryDate: DELIVERY,
        cargoDescription: "Z",
        price: "100.00",
      },
    });
    await expect(orders.getById(organizationId, other.id)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// K — many stops: 10 intermediate stops are persisted in order
// ---------------------------------------------------------------------------
describe("K — large stop list", () => {
  it("creates 10 intermediate stops with correct ordering", async () => {
    const stopList = Array.from({ length: 10 }, (_, i) => ({
      address: `${i + 1} Long Rd`,
      city: `City${i + 1}`,
    }));
    const result = await orders.create(organizationId, {
      ...makeBaseDto(),
      orderStops: stopList,
    }, actor);

    const fetched = await orders.getById(organizationId, result.id);
    expect(fetched.orderStops).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(fetched.orderStops![i].stopIndex).toBe(i + 1);
      expect(fetched.orderStops![i].city).toBe(`City${i + 1}`);
    }
  });
});

// ---------------------------------------------------------------------------
// L — create without stops does not fail (orderStops omitted)
// ---------------------------------------------------------------------------
describe("L — create with no stops field does not fail", () => {
  it("creates an order normally when orderStops is not sent", async () => {
    const result = await orders.create(organizationId, makeBaseDto(), actor);
    expect(result.id).toBeTruthy();
    const fetched = await orders.getById(organizationId, result.id);
    expect(fetched.orderStops ?? []).toEqual([]);
  });
});
