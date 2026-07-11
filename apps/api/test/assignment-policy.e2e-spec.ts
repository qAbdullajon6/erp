import { randomUUID } from "crypto";
import { NotFoundException } from "@nestjs/common";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchService } from "../src/dispatch/dispatch.service";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import {
  DriverDoubleBookedError,
  DriverNotAssignableError,
  VehicleCapacityExceededError,
  VehicleDoubleBookedError,
  VehicleNotAssignableError,
} from "../src/dispatch/dispatch.errors";
import { OrderWriter } from "../src/order-state/order-writer";
import { PrismaService } from "../src/prisma/prisma.service";

/// AssignmentPolicy / AssignmentQueries verification (Task 8.4).
/// Implements AR1 (one implementation per rule) and AR4 (no endpoint computes
/// availability itself), enforcing R5 and R12.
///
/// The point of this suite is the SPLIT-BRAIN. Before 8.4 the question "is this
/// driver busy?" had four answers in three files: dispatch-create asked the
/// Dispatch table, order-assign and the board asked the Order table, and none of
/// them could see the other's commitments. So the same driver could be booked
/// twice, once through each system, and the board would cheerfully show them as
/// available. Everything below would have passed happily in that world; several
/// of these tests would have failed to reject a booking that was plainly illegal.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const dispatches = new DispatchesService(prisma, audit, policy, new OrderWriter());
const board = new DispatchService(prisma, queries);

const PICKUP = new Date("2033-09-01T08:00:00.000Z");
const DELIVERY = new Date("2033-09-03T18:00:00.000Z");
/// Comfortably after the window above.
const LATER_PICKUP = new Date("2033-09-10T08:00:00.000Z");
const LATER_DELIVERY = new Date("2033-09-12T18:00:00.000Z");

let organizationId: string;
let otherOrganizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
let driverA: string;
let driverB: string;
let vehicleA: string;
let vehicleB: string;
let foreignDriver: string;
const userIds: string[] = [];

async function makeOrder(overrides: Record<string, unknown> = {}) {
  return prisma.order.create({
    data: {
      organizationId,
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId,
      pickupAddress: "1 Depot Rd",
      pickupCity: "Tashkent",
      pickupDate: PICKUP,
      deliveryAddress: "9 Dock St",
      deliveryCity: "Samarkand",
      deliveryDate: DELIVERY,
      cargoDescription: "Pallets",
      price: "1000.00",
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const [org, other] = await Promise.all([
    prisma.organization.create({ data: { name: "Policy Org", slug: `policy-${randomUUID()}` } }),
    prisma.organization.create({ data: { name: "Foreign Org", slug: `foreign-${randomUUID()}` } }),
  ]);
  organizationId = org.id;
  otherOrganizationId = other.id;

  const user = await prisma.user.create({
    data: {
      email: `policy-${randomUUID()}@example.test`,
      firstName: "Pia",
      lastName: "Policy",
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
      companyName: "Policy Co",
      contactName: "Pat Policy",
    },
  });
  customerId = customer.id;

  const driver = (orgId: string) =>
    prisma.driver.create({
      data: {
        organizationId: orgId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Dee",
        lastName: "River",
        phone: "+998 90 000 00 00",
      },
    });
  const vehicle = (capacityKg?: string) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: "Truck",
        ...(capacityKg ? { capacityKg } : {}),
      },
    });

  const [a, b, foreign, va, vb] = await Promise.all([
    driver(organizationId),
    driver(organizationId),
    driver(otherOrganizationId),
    vehicle(),
    vehicle(),
  ]);
  driverA = a.id;
  driverB = b.id;
  foreignDriver = foreign.id;
  vehicleA = va.id;
  vehicleB = vb.id;
});

afterEach(async () => {
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  // Reset anything a test knocked out of its default administrative status.
  await prisma.driver.updateMany({ where: { organizationId }, data: { status: "ACTIVE" } });
  await prisma.vehicle.updateMany({ where: { organizationId }, data: { status: "AVAILABLE" } });
});

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

/// Commits driverA + vehicleA the only way a resource can now be committed: by
/// creating a dispatch and ACTIVATING it. A DRAFT reserves nothing (R1).
async function driverHeldByDispatch() {
  const order = await makeOrder();
  const created = await dispatches.create(
    organizationId,
    { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
    actor,
  );
  await dispatches.updateStatus(organizationId, created.id, { status: "ASSIGNED" }, actor);
  return order;
}

const window = { pickupDate: PICKUP, deliveryDate: DELIVERY };

describe("R5 — Dispatch is the sole execution source (Task 8.6)", () => {
  it("an order row carrying a driver but NO dispatch reserves nothing", async () => {
    // This is the contract Task 8.6 introduced, and it is only safe because of
    // what came before it: since Task 8.5 assigning an order CREATES a dispatch,
    // so this state cannot arise from the API any more, and the Phase 5 backfill
    // gave every historical assigned order the dispatch it should have had.
    //
    // Before 8.6 this row would have reserved the driver (the transitional Order
    // arm). It no longer does, because Order.driverId is a projection — a copy of
    // what the dispatch says — and a copy with no original reserves nothing.
    await makeOrder({ status: "ASSIGNED", driverId: driverA, vehicleId: vehicleA });
    const fresh = await makeOrder();

    await expect(
      dispatches.create(organizationId, { orderId: fresh.id, driverId: driverA, vehicleId: vehicleA }, actor),
    ).resolves.toBeDefined();
  });

  it("blocks a dispatch for a driver already committed by an ACTIVE DISPATCH", async () => {
    const first = await makeOrder();
    const created = await dispatches.create(
      organizationId,
      { orderId: first.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );
    // A DRAFT reserves nothing (R1); activating it is what commits the driver.
    await dispatches.updateStatus(organizationId, created.id, { status: "ASSIGNED" }, actor);

    const second = await makeOrder();
    const error = await dispatches
      .create(organizationId, { orderId: second.id, driverId: driverA, vehicleId: vehicleB }, actor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriverDoubleBookedError);
    expect((error as Error).message).toContain(`dispatch ${created.dispatchNumber}`);
  });

  it("does not let a dispatch conflict with its own order's other dispatch", async () => {
    // A dispatch never competes with another dispatch for the SAME order — that is
    // reassignment (close one, open the next), not a double-booking.
    const order = await makeOrder();
    const first = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );
    await dispatches.updateStatus(organizationId, first.id, { status: "ASSIGNED" }, actor);
    await dispatches.cancel(organizationId, first.id, actor);

    await expect(
      dispatches.create(
        organizationId,
        { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
        actor,
      ),
    ).resolves.toMatchObject({ driverId: driverA });
  });

  it("allows the same driver in a window that does not overlap", async () => {
    await driverHeldByDispatch();
    const later = await makeOrder({ pickupDate: LATER_PICKUP, deliveryDate: LATER_DELIVERY });

    await expect(
      dispatches.create(
        organizationId,
        { orderId: later.id, driverId: driverA, vehicleId: vehicleA },
        actor,
      ),
    ).resolves.toBeDefined();
  });
});

describe("capacity — a rule the dispatch path never had", () => {
  it("rejects cargo heavier than the vehicle can carry", async () => {
    const small = await prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: "Van",
        capacityKg: "1000",
      },
    });
    const heavy = await makeOrder({ cargoWeightKg: "2500" });

    // Before 8.4 this dispatch was created without a murmur: assertCapacity
    // lived in OrdersService and nothing on the dispatch path called it.
    const error = await dispatches
      .create(organizationId, { orderId: heavy.id, driverId: driverA, vehicleId: small.id }, actor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VehicleCapacityExceededError);
    expect((error as VehicleCapacityExceededError).getStatus()).toBe(400);

    await prisma.dispatch.deleteMany({ where: { organizationId } });
    await prisma.vehicle.delete({ where: { id: small.id } });
  });

  it("allows cargo the vehicle can carry", async () => {
    const order = await makeOrder({ cargoWeightKg: "500" });

    await expect(
      dispatches.create(
        organizationId,
        { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
        actor,
      ),
    ).resolves.toBeDefined();
  });
});

describe("R12 — eligibility", () => {
  it("rejects a driver who is not ACTIVE", async () => {
    await prisma.driver.update({ where: { id: driverA }, data: { status: "ON_LEAVE" } });

    await expect(
      policy.assertAssignable({ organizationId, driverId: driverA, vehicleId: vehicleA, window }),
    ).rejects.toThrow(DriverNotAssignableError);
  });

  it("rejects a vehicle that is not AVAILABLE", async () => {
    await prisma.vehicle.update({ where: { id: vehicleA }, data: { status: "MAINTENANCE" } });

    await expect(
      policy.assertAssignable({ organizationId, driverId: driverA, vehicleId: vehicleA, window }),
    ).rejects.toThrow(VehicleNotAssignableError);
  });

  it("treats another organization's driver as not found, never as not assignable", async () => {
    await expect(
      policy.assertAssignable({
        organizationId,
        driverId: foreignDriver,
        vehicleId: vehicleA,
        window,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("AR4 — availability and the board ask the SAME question the policy asks", () => {
  it("availability excludes a driver held by a dispatch", async () => {
    await driverHeldByDispatch();

    const free = await board.availability(organizationId, {
      pickupDate: PICKUP.toISOString(),
      deliveryDate: DELIVERY.toISOString(),
    });

    expect(free.drivers.map((d) => d.id)).not.toContain(driverA);
    expect(free.vehicles.map((v) => v.id)).not.toContain(vehicleA);
    // ...and still offers the ones that really are free.
    expect(free.drivers.map((d) => d.id)).toContain(driverB);
  });

  it("availability offers a driver again once the window has passed", async () => {
    await driverHeldByDispatch();

    const free = await board.availability(organizationId, {
      pickupDate: LATER_PICKUP.toISOString(),
      deliveryDate: LATER_DELIVERY.toISOString(),
    });

    expect(free.drivers.map((d) => d.id)).toContain(driverA);
  });

  it("the board reports a dispatch-held driver as busy, showing the trip", async () => {
    const order = await driverHeldByDispatch();

    const result = await board.board(organizationId);

    expect(result.drivers.available.map((d) => d.id)).not.toContain(driverA);
    const busy = result.drivers.busy.find((b) => b.driver.id === driverA);
    expect(busy?.currentOrder.orderNumber).toBe(order.orderNumber);
  });

  it("the board ignores a legacy order row that has no dispatch behind it", async () => {
    // Same contract as the policy: busy-ness is a DISPATCH fact. The board and the
    // policy therefore cannot disagree, which is the whole of AR4.
    await makeOrder({ status: "ASSIGNED", driverId: driverA, vehicleId: vehicleA });

    const result = await board.board(organizationId);

    expect(result.drivers.available.map((d) => d.id)).toContain(driverA);
    expect(result.drivers.busy.map((b) => b.driver.id)).not.toContain(driverA);
  });

  it("what availability offers, the policy accepts", async () => {
    // The invariant that makes AR4 worth having: the frontend pre-check and the
    // server-side rule cannot disagree, because they are the same query.
    await driverHeldByDispatch();
    const target = await makeOrder();

    const free = await board.availability(organizationId, {
      pickupDate: PICKUP.toISOString(),
      deliveryDate: DELIVERY.toISOString(),
    });

    const offeredDriver = free.drivers[0]!.id;
    const offeredVehicle = free.vehicles[0]!.id;
    await expect(
      dispatches.create(
        organizationId,
        { orderId: target.id, driverId: offeredDriver, vehicleId: offeredVehicle },
        actor,
      ),
    ).resolves.toBeDefined();
  });
});
