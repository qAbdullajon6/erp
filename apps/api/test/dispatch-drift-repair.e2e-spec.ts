import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchService } from "../src/dispatch/dispatch.service";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { DriverDoubleBookedError } from "../src/dispatch/dispatch.errors";
import { OrderWriter } from "../src/order-state/order-writer";
import { repairDriftedDispatches } from "../src/order-state/repair-drifted-dispatches";
import { PrismaService } from "../src/prisma/prisma.service";

/// TD-005 — the phantom reservation, and the repair for it.
///
/// A dispatch left in a RESERVING state (R1) for an order that finished days ago
/// holds its driver and vehicle forever. Since Task 8.6 made Dispatch the sole
/// execution source, that phantom is the ONLY thing availability consults — so the
/// driver is permanently busy with nothing.
///
/// These tests build the corrupt state directly through PrismaClient, exactly as it
/// exists in the live database, then prove: (a) it really does block the driver,
/// (b) the repair frees them, (c) the projection cannot demote the finished order
/// while doing so.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const dispatches = new DispatchesService(prisma, audit, policy, writer, { emit: () => {} } as any);
const board = new DispatchService(prisma, queries);

const PICKUP = new Date("2035-02-01T08:00:00.000Z");
const DELIVERY = new Date("2035-02-03T18:00:00.000Z");
const DELIVERED_AT = new Date("2035-02-03T16:30:00.000Z");

let organizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
let driverA: string;
let vehicleA: string;
const userIds: string[] = [];

const repair = (runId: string, dryRun: boolean) =>
  repairDriftedDispatches(prisma as unknown as PrismaClient, { runId, dryRun, organizationId });

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
      status: "PENDING",
      ...overrides,
    },
  });
}

/// Recreates the exact corruption found in the live database: a finished order whose
/// dispatch never followed it. Written straight through Prisma, because no API path
/// can produce this any more — which is the point.
async function driftedDispatch(
  dispatchStatus: "ASSIGNED" | "DRAFT",
  orderStatus: "DELIVERED" | "CANCELLED" = "DELIVERED",
) {
  const order = await makeOrder({
    status: orderStatus,
    driverId: driverA,
    vehicleId: vehicleA,
    deliveredAt: orderStatus === "DELIVERED" ? DELIVERED_AT : null,
  });
  const dispatch = await prisma.dispatch.create({
    data: {
      organizationId,
      dispatchNumber: `DSP-${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      driverId: driverA,
      vehicleId: vehicleA,
      status: dispatchStatus,
      pickupDateScheduled: PICKUP,
      deliveryDateScheduled: DELIVERY,
    },
  });
  return { order, dispatch };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Drift Org", slug: `drift-${randomUUID()}` },
  });
  organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `drift-${randomUUID()}@example.test`,
      firstName: "Dan",
      lastName: "Drift",
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
      companyName: "Drift Co",
      contactName: "Dot Drift",
    },
  });
  customerId = customer.id;

  const [driver, vehicle] = await Promise.all([
    prisma.driver.create({
      data: {
        organizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Dee",
        lastName: "River",
        phone: "+998 90 000 00 00",
      },
    }),
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: "Truck",
      },
    }),
  ]);
  driverA = driver.id;
  vehicleA = vehicle.id;
});

afterEach(async () => {
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("the phantom reservation is real", () => {
  it("a DELIVERED order whose dispatch is still ASSIGNED blocks the driver forever", async () => {
    await driftedDispatch("ASSIGNED");
    const fresh = await makeOrder();

    // This is the bug, demonstrated: the driver finished this job days ago and is
    // still unbookable.
    await expect(
      dispatches.create(
        organizationId,
        { orderId: fresh.id, driverId: driverA, vehicleId: vehicleA },
        actor,
      ),
    ).rejects.toThrow(DriverDoubleBookedError);
  });

  it("availability reports the driver as busy for a job that is over", async () => {
    await driftedDispatch("ASSIGNED");

    const free = await board.availability(organizationId, {
      pickupDate: PICKUP.toISOString(),
      deliveryDate: DELIVERY.toISOString(),
    });

    expect(free.drivers.map((d) => d.id)).not.toContain(driverA);
  });
});

describe("the repair", () => {
  it("dry run reports the drift and writes nothing", async () => {
    const { dispatch } = await driftedDispatch("ASSIGNED");

    const report = await repair("dry", true);

    expect(report.repaired).toHaveLength(1);
    expect(report.repaired[0]).toMatchObject({
      dispatchNumber: dispatch.dispatchNumber,
      from: "ASSIGNED",
      to: "DELIVERED",
      wasPhantomReservation: true,
    });
    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.status).toBe("ASSIGNED");
  });

  it("moves an executing dispatch to DELIVERED, taking the time from the ORDER (R7)", async () => {
    const { dispatch } = await driftedDispatch("ASSIGNED");

    await repair("r1", false);

    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.status).toBe("DELIVERED");
    // Not "now" — the instant the order recorded. Nothing is invented.
    expect(after.deliveryDateActual).toEqual(DELIVERED_AT);
  });

  it("cancels a DRAFT that was never executed, rather than claiming a trip it never made", async () => {
    const { dispatch } = await driftedDispatch("DRAFT");

    await repair("r2", false);

    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.deliveryDateActual).toBeNull();
  });

  it("records one honest history row, and does not fabricate the steps in between", async () => {
    const { dispatch } = await driftedDispatch("ASSIGNED");

    await repair("r3", false);

    const history = await prisma.dispatchStatusHistory.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.status)).toEqual(["DELIVERED"]);
    expect(history[0].note).toContain("TD-005 repair");
    // No EN_ROUTE_TO_PICKUP / AT_PICKUP / IN_TRANSIT rows invented with today's clock.
  });

  it("releases the reservation: the driver is bookable again", async () => {
    await driftedDispatch("ASSIGNED");
    await repair("r4", false);

    const fresh = await makeOrder();
    await expect(
      dispatches.create(
        organizationId,
        { orderId: fresh.id, driverId: driverA, vehicleId: vehicleA },
        actor,
      ),
    ).resolves.toBeDefined();
  });

  it("availability no longer reports the phantom", async () => {
    await driftedDispatch("ASSIGNED");
    await repair("r5", false);

    const free = await board.availability(organizationId, {
      pickupDate: PICKUP.toISOString(),
      deliveryDate: DELIVERY.toISOString(),
    });

    expect(free.drivers.map((d) => d.id)).toContain(driverA);
    expect(free.vehicles.map((v) => v.id)).toContain(vehicleA);
  });

  it("AssignmentPolicy agrees the driver is assignable afterwards", async () => {
    await driftedDispatch("ASSIGNED");
    await repair("r6", false);

    await expect(
      policy.assertAssignable({
        organizationId,
        driverId: driverA,
        vehicleId: vehicleA,
        window: { pickupDate: PICKUP, deliveryDate: DELIVERY },
      }),
    ).resolves.toMatchObject({ driver: { id: driverA } });
  });

  it("does not touch the Order — the projection owns it (AR5)", async () => {
    const { order } = await driftedDispatch("ASSIGNED");

    await repair("r7", false);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("DELIVERED");
    expect(after.deliveredAt).toEqual(DELIVERED_AT);
    expect(after.driverId).toBe(driverA);
  });

  it("is idempotent — a second run finds nothing to do", async () => {
    await driftedDispatch("ASSIGNED");

    const first = await repair("idem-a", false);
    const second = await repair("idem-b", false);

    expect(first.repaired).toHaveLength(1);
    expect(second.repaired).toHaveLength(0);
  });

  it("leaves a healthy dispatch alone", async () => {
    const order = await makeOrder();
    const created = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );
    await dispatches.updateStatus(organizationId, created.id, { status: "ASSIGNED" }, actor);

    const report = await repair("healthy", false);

    expect(report.repaired).toHaveLength(0);
    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("ASSIGNED");
  });
});

describe("R7 — the repair cannot demote the finished order it is reconciling with", () => {
  it("a DELIVERED order survives having all of its dispatches cancelled", async () => {
    // The landmine the repair walks straight into: cancelling the drifted DRAFT
    // leaves a DELIVERED order whose every dispatch is CANCELLED. R8 says "all
    // cancelled -> release to PENDING", which would demote a completed, invoiced
    // delivery back into the unassigned pool and wipe its deliveredAt.
    const { order } = await driftedDispatch("DRAFT");
    await repair("frozen", false);

    // Force a projection over the repaired state.
    await prisma.$transaction((tx) => writer.project(tx, organizationId, order.id, actor));

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("DELIVERED");
    expect(after.deliveredAt).toEqual(DELIVERED_AT);
  });
});
