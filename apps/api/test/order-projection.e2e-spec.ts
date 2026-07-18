import { randomUUID } from "crypto";
import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { backfillDispatches, rollbackBackfill, verifyBackfill } from "../src/order-state/backfill";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// ADR-001 Phase 4 + 5 (Task 8.5) against the real database.
///
/// Implements R3 (Order is a projection of Dispatch), R4 (commercial lifecycle),
/// R6, R7, R8. Satisfies AR2 (one transaction) and AR5 (two writers only).
///
/// The pure mapping is already covered as a plain function in
/// src/order-state/projection.policy.spec.ts. What is tested HERE is the thing a
/// pure test cannot show: that driving the real API through the real services
/// actually lands the order in the projected state, atomically, without any code
/// writing Order.status behind the policies' backs.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const wfEvents = { emit: () => {} } as any;
const dispatches = new DispatchesService(prisma, audit, policy, writer, wfEvents);
const orders = new OrdersService(prisma, audit, writer, dispatches, policy, wfEvents);

const PICKUP = new Date("2034-04-01T08:00:00.000Z");
const DELIVERY = new Date("2034-04-03T18:00:00.000Z");

let organizationId: string;
let otherOrganizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
let driverA: string;
let driverB: string;
let vehicleA: string;
let vehicleB: string;
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
      status: "PENDING",
      ...overrides,
    },
  });
}

function orderRow(id: string) {
  return prisma.order.findUniqueOrThrow({ where: { id } });
}

async function orderHistory(id: string) {
  const rows = await prisma.orderStatusHistory.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.status);
}

/// Assigns through the ORDER api — which, since Phase 4, creates and activates a
/// dispatch and lets the projection write the order.
async function assign(orderId: string, driverId = driverA, vehicleId = vehicleA) {
  return orders.assign(organizationId, orderId, { driverId, vehicleId }, actor);
}

async function liveDispatch(orderId: string) {
  return prisma.dispatch.findFirstOrThrow({
    where: { orderId, status: { notIn: ["CANCELLED"] } },
  });
}

beforeAll(async () => {
  const [org, other] = await Promise.all([
    prisma.organization.create({ data: { name: "Proj Org", slug: `proj-${randomUUID()}` } }),
    prisma.organization.create({ data: { name: "Other Proj", slug: `other-proj-${randomUUID()}` } }),
  ]);
  organizationId = org.id;
  otherOrganizationId = other.id;

  const user = await prisma.user.create({
    data: {
      email: `proj-${randomUUID()}@example.test`,
      firstName: "Pia",
      lastName: "Projection",
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
      companyName: "Proj Co",
      contactName: "Pat Proj",
    },
  });
  customerId = customer.id;

  const mkDriver = () =>
    prisma.driver.create({
      data: {
        organizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Dee",
        lastName: "River",
        phone: "+998 90 000 00 00",
      },
    });
  const mkVehicle = () =>
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: "Truck",
      },
    });

  const [da, db, va, vb] = await Promise.all([mkDriver(), mkDriver(), mkVehicle(), mkVehicle()]);
  driverA = da.id;
  driverB = db.id;
  vehicleA = va.id;
  vehicleB = vb.id;
});

afterEach(async () => {
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId: otherOrganizationId } });
});

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("R3 — the order follows its dispatch", () => {
  it("assigning an order creates a dispatch and PROJECTS the order to ASSIGNED", async () => {
    const order = await makeOrder();

    await assign(order.id);

    const dispatch = await liveDispatch(order.id);
    expect(dispatch.status).toBe("ASSIGNED");

    // The order was never written directly — this status came from the projection.
    const row = await orderRow(order.id);
    expect(row.status).toBe("ASSIGNED");
    expect(row.driverId).toBe(driverA);
    expect(row.vehicleId).toBe(vehicleA);
    expect(await orderHistory(order.id)).toEqual(["ASSIGNED"]);
  });

  it("EN_ROUTE_TO_PICKUP leaves the order ASSIGNED — the customer sees nothing yet", async () => {
    const order = await makeOrder();
    await assign(order.id);
    const dispatch = await liveDispatch(order.id);

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor);

    expect((await orderRow(order.id)).status).toBe("ASSIGNED");
    // ...and no phantom history row for a move that did not happen.
    expect(await orderHistory(order.id)).toEqual(["ASSIGNED"]);
  });

  it("AT_PICKUP projects the order to PICKED_UP (Amendment B, Z1)", async () => {
    const order = await makeOrder();
    await assign(order.id);
    let dispatch = await liveDispatch(order.id);
    dispatch = await dispatches
      .updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, actor)
      .then(() => liveDispatch(order.id));

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "AT_PICKUP" }, actor);

    expect((await orderRow(order.id)).status).toBe("PICKED_UP");
    expect(await orderHistory(order.id)).toEqual(["ASSIGNED", "PICKED_UP"]);
  });

  it("DELIVERED copies the dispatch's actual delivery time onto the order (R7)", async () => {
    const order = await makeOrder();
    await assign(order.id);
    await driveDispatchTo(order.id, "DELIVERED");

    const dispatch = await liveDispatch(order.id);
    const row = await orderRow(order.id);

    expect(row.status).toBe("DELIVERED");
    expect(row.deliveredAt).not.toBeNull();
    // Not "roughly the same" — the SAME instant. The order does not take its own
    // clock reading; it reads the dispatch's.
    expect(row.deliveredAt).toEqual(dispatch.deliveryDateActual);
  });

  it("records every order state the dispatch passed through, in order", async () => {
    const order = await makeOrder();
    await assign(order.id);
    await driveDispatchTo(order.id, "DELIVERED");

    expect(await orderHistory(order.id)).toEqual([
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "DELIVERED",
    ]);
  });
});

describe("R8 — cancelling the dispatch releases the order", () => {
  it("returns the order to PENDING and clears the driver and vehicle", async () => {
    const order = await makeOrder();
    await assign(order.id);
    const dispatch = await liveDispatch(order.id);

    await dispatches.cancel(organizationId, dispatch.id, actor);

    const row = await orderRow(order.id);
    expect(row.status).toBe("PENDING");
    expect(row.driverId).toBeNull();
    expect(row.vehicleId).toBeNull();
    expect(await orderHistory(order.id)).toEqual(["ASSIGNED", "PENDING"]);
  });

  it("frees the driver for someone else — the release is real, not cosmetic", async () => {
    const first = await makeOrder();
    await assign(first.id);
    await dispatches.cancel(organizationId, (await liveDispatch(first.id)).id, actor);

    const second = await makeOrder();
    await expect(assign(second.id)).resolves.toMatchObject({ driverId: driverA });
  });
});

describe("R4 / Z2 — the commercial lifecycle outranks the projection", () => {
  it("cancelling an ORDER kills its dispatch and the order STAYS cancelled", async () => {
    const order = await makeOrder();
    await assign(order.id);

    await orders.cancel(organizationId, order.id, { note: "Customer changed their mind" }, actor);

    const row = await orderRow(order.id);
    // Without the Z2 guard the dispatch cancellation would project back to
    // PENDING and quietly un-cancel the order.
    expect(row.status).toBe("CANCELLED");
    expect(row.cancelledAt).not.toBeNull();
    expect((await liveDispatch(order.id).catch(() => null))).toBeNull();

    // driverId/vehicleId are PROJECTION fields, so a dead order projects nobody.
    // Before this rule, cancelling an order left it pointing at a driver and a
    // truck forever — which is exactly the legacy rows the Phase 5 dry run found.
    expect(row.driverId).toBeNull();
    expect(row.vehicleId).toBeNull();
  });

  it("cancelling the ORDER releases the driver for someone else, just like cancelling the dispatch", async () => {
    const first = await makeOrder();
    await assign(first.id);

    await orders.cancel(organizationId, first.id, {}, actor);

    const second = await makeOrder();
    await expect(assign(second.id)).resolves.toMatchObject({ driverId: driverA });
  });

  it("approval does NOT wipe an assignment — only cancellation clears the projection", async () => {
    const draft = await makeOrder({ status: "DRAFT" });

    await orders.updateStatus(organizationId, draft.id, { status: "PENDING" }, actor);
    await assign(draft.id);

    const row = await orderRow(draft.id);
    expect(row.driverId).toBe(driverA);
    expect(row.vehicleId).toBe(vehicleA);
  });

  it("a later projection cannot resurrect a cancelled order", async () => {
    const order = await makeOrder();
    await assign(order.id);
    await orders.cancel(organizationId, order.id, {}, actor);

    // Force a projection to run again over the cancelled order.
    await prisma.$transaction((tx) => writer.project(tx, organizationId, order.id, actor));

    expect((await orderRow(order.id)).status).toBe("CANCELLED");
  });

  it("a DRAFT order is never approved by a dispatch appearing (Z3)", async () => {
    const draft = await makeOrder({ status: "DRAFT" });

    // A dispatcher may sketch a dispatch for an unapproved order...
    await dispatches.create(
      organizationId,
      { orderId: draft.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );

    // ...but that is not an approval. Only TransitionPolicy performs DRAFT -> PENDING.
    expect((await orderRow(draft.id)).status).toBe("DRAFT");
  });

  it("a DRAFT dispatch does not make a PENDING order look assigned (R1, Z3)", async () => {
    // A dispatcher sketching a plan must not commit the order to a driver. Only
    // ACTIVATING the dispatch does that.
    const order = await makeOrder();

    await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );

    const row = await orderRow(order.id);
    expect(row.status).toBe("PENDING");
    expect(row.driverId).toBeNull();
    expect(row.vehicleId).toBeNull();
    expect(await orderHistory(order.id)).toEqual([]);
  });

  it("approval is TransitionPolicy's, and it works", async () => {
    const draft = await makeOrder({ status: "DRAFT" });

    await orders.updateStatus(organizationId, draft.id, { status: "PENDING" }, actor);

    expect((await orderRow(draft.id)).status).toBe("PENDING");
  });
});

describe("the order API still behaves exactly as it did", () => {
  it("the driver flow ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED works through /orders", async () => {
    const order = await makeOrder();
    await assign(order.id);

    for (const status of ["PICKED_UP", "IN_TRANSIT", "DELIVERED"] as const) {
      const result = await orders.updateStatus(organizationId, order.id, { status }, actor);
      // The endpoint returns the status that was asked for — which is only true
      // because AT_PICKUP projects to PICKED_UP (Amendment B, Z1).
      expect(result.status).toBe(status);
    }

    expect((await orderRow(order.id)).status).toBe("DELIVERED");
    // Under the hood the dispatch really walked every intermediate state.
    const dispatch = await liveDispatch(order.id);
    expect(dispatch.status).toBe("DELIVERED");
    const dispatchHistory = await prisma.dispatchStatusHistory.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { createdAt: "asc" },
    });
    expect(dispatchHistory.map((h) => h.status)).toEqual([
      "DRAFT",
      "ASSIGNED",
      "EN_ROUTE_TO_PICKUP",
      "AT_PICKUP",
      "IN_TRANSIT",
      "DELIVERED",
    ]);
  });

  it("still rejects an illegal order transition with the same 409", async () => {
    const order = await makeOrder();
    await assign(order.id);

    await expect(
      orders.updateStatus(organizationId, order.id, { status: "DELIVERED" }, actor),
    ).rejects.toThrow(ConflictException);
  });

  it("still refuses to move a driverless order to ASSIGNED", async () => {
    const order = await makeOrder();

    await expect(
      orders.updateStatus(organizationId, order.id, { status: "ASSIGNED" }, actor),
    ).rejects.toThrow(/Assign a driver and vehicle/);
  });

  it("reassignment swaps the resources on the SAME dispatch (Task 8.7)", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const original = await liveDispatch(order.id);

    await assign(order.id, driverB, vehicleB);

    const row = await orderRow(order.id);
    expect(row.status).toBe("ASSIGNED");
    expect(row.driverId).toBe(driverB);
    expect(row.vehicleId).toBe(vehicleB);

    // Until Task 8.7 this cancelled the dispatch and created a replacement, which
    // threw the trip's status history away. Now the dispatch survives, and only its
    // ASSIGNMENT history gains a row.
    const all = await prisma.dispatch.findMany({ where: { orderId: order.id } });
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(original.id);
    expect(all[0].status).toBe("ASSIGNED");

    // A reassignment is not a status change: the order was ASSIGNED and stays so.
    expect(await orderHistory(order.id)).toEqual(["ASSIGNED"]);
  });
});

describe("AR2 — the dispatch move and the projection are one transaction", () => {
  it("a failed projection rolls the dispatch back too", async () => {
    const order = await makeOrder();
    await assign(order.id);
    const dispatch = await liveDispatch(order.id);
    const ghost = { ...actor, userId: randomUUID() };

    // The order history row FKs to users; a ghost actor makes it fail after the
    // dispatch row has already been written inside the same transaction.
    await expect(
      dispatches.updateStatus(organizationId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, ghost),
    ).rejects.toThrow();

    // Neither side moved.
    expect((await liveDispatch(order.id)).status).toBe("ASSIGNED");
    expect((await orderRow(order.id)).status).toBe("ASSIGNED");
  });
});

describe("ADR-001 Phase 5 — backfill", () => {
  /// A legacy order: assigned the old way, straight onto the Order row, with no
  /// dispatch anywhere. This is what every pre-ADR order looks like.
  async function legacyOrder(
    status: "ASSIGNED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED",
    driverId = driverA,
    vehicleId = vehicleA,
  ) {
    return makeOrder({
      status,
      driverId,
      vehicleId,
      deliveredAt: status === "DELIVERED" ? new Date("2034-04-03T17:00:00.000Z") : null,
    });
  }

  const run = (runId: string, dryRun: boolean) =>
    backfillDispatches(prisma as unknown as PrismaClient, { runId, dryRun, organizationId });

  it("dry run reports what it would do and writes NOTHING", async () => {
    const order = await legacyOrder("IN_TRANSIT");

    const report = await run("dry-1", true);

    expect(report.dryRun).toBe(true);
    expect(report.created).toHaveLength(1);
    expect(report.created[0]).toMatchObject({
      orderNumber: order.orderNumber,
      orderStatus: "IN_TRANSIT",
      inferredDispatchStatus: "IN_TRANSIT",
    });
    expect(await prisma.dispatch.count({ where: { orderId: order.id } })).toBe(0);
  });

  it.each([
    ["ASSIGNED", "ASSIGNED"],
    ["PICKED_UP", "AT_PICKUP"],
    ["IN_TRANSIT", "IN_TRANSIT"],
    ["DELIVERED", "DELIVERED"],
  ] as const)("infers the dispatch state of a %s order as %s", async (orderStatus, expected) => {
    const order = await legacyOrder(orderStatus);

    await run(`infer-${orderStatus}`, false);

    const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { orderId: order.id } });
    expect(dispatch.status).toBe(expected);
    expect(dispatch.driverId).toBe(driverA);
  });

  it("the backfilled dispatch projects BACK to the status the order already had", async () => {
    // The property that makes the migration safe: the backfill must not change
    // what any order means.
    const order = await legacyOrder("PICKED_UP");
    await run("safe-1", false);

    await prisma.$transaction((tx) => writer.project(tx, organizationId, order.id, actor));

    const row = await orderRow(order.id);
    expect(row.status).toBe("PICKED_UP");
    expect(row.driverId).toBe(driverA);
  });

  it("preserves the delivery time of a DELIVERED order (R7 in reverse)", async () => {
    const order = await legacyOrder("DELIVERED");
    const originalDeliveredAt = order.deliveredAt;
    await run("delivered-1", false);

    await prisma.$transaction((tx) => writer.project(tx, organizationId, order.id, actor));

    expect((await orderRow(order.id)).deliveredAt).toEqual(originalDeliveredAt);
  });

  it("is idempotent — a second run creates nothing", async () => {
    await legacyOrder("ASSIGNED");

    const first = await run("idem-1", false);
    const second = await run("idem-2", false);

    expect(first.created).toHaveLength(1);
    expect(second.created).toHaveLength(0);
    expect(second.alreadyDispatched).toBe(1);
    expect(await prisma.dispatch.count({ where: { organizationId } })).toBe(1);
  });

  it("rolls back exactly its own run, and nothing else", async () => {
    await legacyOrder("ASSIGNED");
    await run("rb-1", false);

    // A dispatch a real dispatcher created afterwards, which must survive.
    const live = await makeOrder();
    await assign(live.id, driverB, vehicleB);

    const { removed } = await rollbackBackfill(prisma as unknown as PrismaClient, "rb-1");

    expect(removed).toBe(1);
    expect(await prisma.dispatch.count({ where: { orderId: live.id } })).toBe(1);
  });

  it("refuses to guess: an order with a driver but no vehicle is reported, not invented", async () => {
    const broken = await makeOrder({ status: "ASSIGNED", driverId: driverA, vehicleId: null });

    const report = await run("incomplete-1", false);

    expect(report.created).toHaveLength(0);
    expect(report.skippedIncomplete).toEqual([
      { orderId: broken.id, orderNumber: broken.orderNumber, hasDriver: true, hasVehicle: false },
    ]);
    expect(await prisma.dispatch.count({ where: { orderId: broken.id } })).toBe(0);
  });

  it("refuses to guess: a CANCELLED order holding a driver is reported, not dispatched", async () => {
    // No dispatch state projects onto CANCELLED, so creating one would change the
    // order's meaning.
    const weird = await makeOrder({ status: "CANCELLED", driverId: driverA, vehicleId: vehicleA });

    const report = await run("weird-1", false);

    expect(report.created).toHaveLength(0);
    expect(report.skippedUnrepresentable[0]).toMatchObject({ orderNumber: weird.orderNumber });
    expect(await prisma.dispatch.count({ where: { orderId: weird.id } })).toBe(0);
  });

  it("reports legacy data that is ALREADY double-booked instead of crashing", async () => {
    // Two legacy orders holding the SAME driver over the SAME window. Nothing
    // prevented this before Task 8.2 — and the exclusion constraint is what
    // finally notices. The backfill must surface it, not die on it, and must not
    // pick a winner.
    const first = await legacyOrder("ASSIGNED");
    const second = await legacyOrder("IN_TRANSIT");

    const report = await run("conflict-1", false);

    expect(report.created).toHaveLength(1);
    expect(report.conflicted).toHaveLength(1);
    expect(report.conflicted[0].reason).toMatch(/already assigned/i);
    // The one that could be reconstructed was, and the corrupt one was left alone
    // for a human — the run did not abort halfway.
    const numbers = [first.orderNumber, second.orderNumber];
    expect(numbers).toContain(report.created[0].orderNumber);
    expect(numbers).toContain(report.conflicted[0].orderNumber);
  });

  it("verify() reports a clean bill of health after a real run", async () => {
    await legacyOrder("IN_TRANSIT", driverA, vehicleA);
    await legacyOrder("ASSIGNED", driverB, vehicleB);

    await run("verify-1", false);
    const result = await verifyBackfill(prisma as unknown as PrismaClient, organizationId);

    expect(result.orphanedOrders).toEqual([]);
    expect(result.disagreeingOrders).toEqual([]);
  });

  it("verify() catches an orphan BEFORE the backfill runs", async () => {
    const order = await legacyOrder("IN_TRANSIT");

    const result = await verifyBackfill(prisma as unknown as PrismaClient, organizationId);

    expect(result.orphanedOrders).toContain(order.orderNumber);
  });

  it("stays inside its tenant", async () => {
    const foreignCustomer = await prisma.customer.create({
      data: {
        organizationId: otherOrganizationId,
        customerCode: `CUS-${randomUUID().slice(0, 8)}`,
        companyName: "Foreign Co",
        contactName: "Fay Foreign",
      },
    });
    const foreignDriver = await prisma.driver.create({
      data: {
        organizationId: otherOrganizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Fay",
        lastName: "Foreign",
        phone: "+998 90 111 11 11",
      },
    });
    const foreignVehicle = await prisma.vehicle.create({
      data: {
        organizationId: otherOrganizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `02 ${randomUUID().slice(0, 5)}`,
        type: "Van",
      },
    });
    const foreignOrder = await prisma.order.create({
      data: {
        organizationId: otherOrganizationId,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        customerId: foreignCustomer.id,
        pickupAddress: "1 Far Rd",
        pickupCity: "Bukhara",
        pickupDate: PICKUP,
        deliveryAddress: "2 Far St",
        deliveryCity: "Khiva",
        deliveryDate: DELIVERY,
        cargoDescription: "Crates",
        price: "500.00",
        status: "ASSIGNED",
        driverId: foreignDriver.id,
        vehicleId: foreignVehicle.id,
      },
    });
    await legacyOrder("ASSIGNED");

    // Scoped to OUR organization only.
    const report = await run("tenant-1", false);

    expect(report.created).toHaveLength(1);
    expect(await prisma.dispatch.count({ where: { orderId: foreignOrder.id } })).toBe(0);
  });
});

/// Walks the dispatch to a target state through every legal intermediate step.
async function driveDispatchTo(orderId: string, target: "IN_TRANSIT" | "DELIVERED") {
  const path = ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED"] as const;
  for (const step of path) {
    const dispatch = await liveDispatch(orderId);
    await dispatches.updateStatus(organizationId, dispatch.id, { status: step }, actor);
    if (step === target) return;
  }
}

describe("TD-006 — the server tells the client which ORDER transitions are legal", () => {
  /// orders-detail carried a hand-copied duplicate of the order transition table,
  /// and the driver screen carried a second one that ALSO mirrored
  /// DRIVER_ALLOWED_STATUSES. Both are deleted; this is the field that replaced them.
  it("a DRAFT order may only be approved", async () => {
    const order = await makeOrder({ status: "DRAFT" });

    const response = await orders.getById(organizationId, order.id);

    expect(response.allowedTransitions).toEqual(["PENDING"]);
  });

  it("an ASSIGNED order may only be picked up", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);

    const response = await orders.getById(organizationId, order.id);

    expect(response.allowedTransitions).toEqual(["PICKED_UP"]);
  });

  it("a terminal order offers nothing", async () => {
    const order = await makeOrder();
    await orders.cancel(organizationId, order.id, {}, actor);

    const response = await orders.getById(organizationId, order.id);

    expect(response.allowedTransitions).toEqual([]);
  });

  it("what it offers, the API accepts — walked end to end", async () => {
    const order = await makeOrder({ status: "DRAFT" });

    // Approve, using only what the server offers at each step.
    let current = await orders.getById(organizationId, order.id);
    expect(current.allowedTransitions).toEqual(["PENDING"]);
    await orders.updateStatus(organizationId, order.id, { status: "PENDING" }, actor);

    // PENDING -> ASSIGNED is legal in the graph but goes through /assign.
    current = await orders.getById(organizationId, order.id);
    expect(current.allowedTransitions).toEqual(["ASSIGNED"]);
    await assign(order.id, driverA, vehicleA);

    for (;;) {
      current = await orders.getById(organizationId, order.id);
      const next = current.allowedTransitions[0];
      if (!next) break;
      await orders.updateStatus(organizationId, order.id, { status: next }, actor);
    }

    expect((await orders.getById(organizationId, order.id)).status).toBe("DELIVERED");
  });
});
