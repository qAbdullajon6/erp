import { randomUUID } from "crypto";
import { ConflictException } from "@nestjs/common";
import type { DispatchStatus } from "@prisma/client";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import {
  DriverDoubleBookedError,
  VehicleCapacityExceededError,
  DriverNotAssignableError,
} from "../src/dispatch/dispatch.errors";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// Task 8.7 — Assignment Unification.
///
/// Implements R5, R9 (append-only assignment history), R12. Satisfies AR1 (one
/// implementation of assignment), AR2, AR4, AR5.
///
/// POST /orders/:id/assign no longer assigns anything. It creates or reassigns a
/// DISPATCH, and the order follows by projection. The tests below prove that the
/// wrapper cannot get around any dispatch rule, and that DispatchAssignment — a
/// table that until this task nothing on earth ever wrote a row to — now records
/// every change of hands.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const auditLog = jest.fn().mockResolvedValue(undefined);
const audit = { log: auditLog } as unknown as AuditService;
const wfEvents = { emit: () => {} } as any;
const dispatches = new DispatchesService(prisma, audit, policy, writer, wfEvents);
const orders = new OrdersService(prisma, audit, writer, dispatches, policy, wfEvents);

const PICKUP = new Date("2036-06-01T08:00:00.000Z");
const DELIVERY = new Date("2036-06-03T18:00:00.000Z");

let organizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
let driverA: string;
let driverB: string;
let driverC: string;
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

const assign = (orderId: string, driverId: string, vehicleId: string) =>
  orders.assign(organizationId, orderId, { driverId, vehicleId }, actor);

const liveDispatch = (orderId: string) =>
  prisma.dispatch.findFirstOrThrow({ where: { orderId, status: { notIn: ["CANCELLED"] } } });

/// The assignment ledger for a dispatch, oldest first.
async function assignmentHistory(dispatchId: string) {
  return prisma.dispatchAssignment.findMany({
    where: { dispatchId },
    orderBy: { assignedAt: "asc" },
  });
}

const openAssignments = (dispatchId: string) =>
  prisma.dispatchAssignment.count({ where: { dispatchId, unassignedAt: null } });

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Unify Org", slug: `unify-${randomUUID()}` },
  });
  organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `unify-${randomUUID()}@example.test`,
      firstName: "Uma",
      lastName: "Unify",
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
      companyName: "Unify Co",
      contactName: "Ulan Unify",
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

  const [a, b, c, va, vb] = await Promise.all([
    mkDriver(),
    mkDriver(),
    mkDriver(),
    mkVehicle(),
    mkVehicle(),
  ]);
  driverA = a.id;
  driverB = b.id;
  driverC = c.id;
  vehicleA = va.id;
  vehicleB = vb.id;
});

afterEach(async () => {
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  await prisma.driver.updateMany({ where: { organizationId }, data: { status: "ACTIVE" } });
  auditLog.mockClear();
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("R9 — DispatchAssignment is finally alive", () => {
  it("creating a dispatch opens an assignment", async () => {
    const order = await makeOrder();
    const dispatch = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );

    const history = await assignmentHistory(dispatch.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      driverId: driverA,
      vehicleId: vehicleA,
      unassignedAt: null,
      reason: "Initial assignment",
      changedByUserId: actor.userId,
    });
  });

  it("reassignment CLOSES the previous assignment and opens a new one", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    await dispatches.update(organizationId, dispatch.id, { driverId: driverB }, actor);

    const history = await assignmentHistory(dispatch.id);
    expect(history).toHaveLength(2);

    // The old row is closed, not overwritten: it still says driverA was on this job.
    expect(history[0]).toMatchObject({ driverId: driverA, vehicleId: vehicleA });
    expect(history[0].unassignedAt).not.toBeNull();

    expect(history[1]).toMatchObject({
      driverId: driverB,
      vehicleId: vehicleA,
      unassignedAt: null,
    });
  });

  it("never leaves two open assignments, however many times the driver changes", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    await dispatches.update(organizationId, dispatch.id, { driverId: driverB }, actor);
    await dispatches.update(organizationId, dispatch.id, { driverId: driverC }, actor);
    await dispatches.update(organizationId, dispatch.id, { vehicleId: vehicleB }, actor);

    const history = await assignmentHistory(dispatch.id);
    expect(history).toHaveLength(4);
    expect(await openAssignments(dispatch.id)).toBe(1);
    // The whole chain of custody survives, in order.
    expect(history.map((h) => h.driverId)).toEqual([driverA, driverB, driverC, driverC]);
  });

  it("cancelling the dispatch closes the assignment — nobody is on a dead job", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    await dispatches.cancel(organizationId, dispatch.id, actor);

    expect(await openAssignments(dispatch.id)).toBe(0);
    const history = await assignmentHistory(dispatch.id);
    expect(history).toHaveLength(1);
    expect(history[0].unassignedAt).not.toBeNull();
  });

  it("cancelling through the STATUS endpoint also closes the assignment", async () => {
    // POST /dispatches/:id/status accepts CANCELLED (it is in ALLOWED_TRANSITIONS),
    // so there are two doors to the same room. Both must close the ledger, or a
    // driver stays recorded as being on a job that no longer exists.
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    await dispatches.updateStatus(organizationId, dispatch.id, { status: "CANCELLED" }, actor);

    expect(await openAssignments(dispatch.id)).toBe(0);
  });

  it("a no-op PATCH writes no assignment row at all", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    // Same driver, same vehicle, plus a notes edit.
    await dispatches.update(
      organizationId,
      dispatch.id,
      { driverId: driverA, vehicleId: vehicleA, notes: "call ahead" },
      actor,
    );

    expect(await assignmentHistory(dispatch.id)).toHaveLength(1);
    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.notes).toBe("call ahead");
  });
});

describe("the wrapper cannot bypass a single dispatch rule (AR1)", () => {
  it("POST /orders/:id/assign is refused when the driver is double-booked", async () => {
    const held = await makeOrder();
    await assign(held.id, driverA, vehicleA);

    const second = await makeOrder();
    await expect(assign(second.id, driverA, vehicleB)).rejects.toThrow(DriverDoubleBookedError);
  });

  it("POST /orders/:id/assign is refused when the cargo does not fit", async () => {
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

    await expect(assign(heavy.id, driverA, small.id)).rejects.toThrow(VehicleCapacityExceededError);

    await prisma.vehicle.delete({ where: { id: small.id } });
  });

  it("POST /orders/:id/assign is refused for an inactive driver", async () => {
    await prisma.driver.update({ where: { id: driverA }, data: { status: "ON_LEAVE" } });
    const order = await makeOrder();

    await expect(assign(order.id, driverA, vehicleA)).rejects.toThrow(DriverNotAssignableError);
  });

  it("REASSIGNMENT is refused when the new driver is double-booked", async () => {
    const other = await makeOrder();
    await assign(other.id, driverB, vehicleB);

    const mine = await makeOrder();
    await assign(mine.id, driverA, vehicleA);
    const dispatch = await liveDispatch(mine.id);

    // driverB is busy on the other order in the same window.
    await expect(
      dispatches.update(organizationId, dispatch.id, { driverId: driverB }, actor),
    ).rejects.toThrow(DriverDoubleBookedError);
  });

  it("a refused reassignment changes NOTHING — no dispatch write, no assignment row", async () => {
    const other = await makeOrder();
    await assign(other.id, driverB, vehicleB);
    const mine = await makeOrder();
    await assign(mine.id, driverA, vehicleA);
    const dispatch = await liveDispatch(mine.id);

    await expect(
      dispatches.update(organizationId, dispatch.id, { driverId: driverB, notes: "swap" }, actor),
    ).rejects.toThrow(ConflictException);

    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.driverId).toBe(driverA);
    // The notes edit rolled back with the reassignment: one transaction (AR2).
    expect(after.notes).toBeNull();
    expect(await assignmentHistory(dispatch.id)).toHaveLength(1);
    expect(await openAssignments(dispatch.id)).toBe(1);
  });

  it("reassigning a dispatch to the driver it already has is not a self-conflict", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    // Only the vehicle changes; the driver stays. The dispatch must not conflict
    // with the driver IT is holding.
    await expect(
      dispatches.update(organizationId, dispatch.id, { vehicleId: vehicleB }, actor),
    ).resolves.toMatchObject({ driverId: driverA, vehicleId: vehicleB });
  });
});

describe("the wrapper's API result is unchanged (backward compatibility)", () => {
  it("first assignment returns the order ASSIGNED with the driver and vehicle", async () => {
    const order = await makeOrder();

    const result = await assign(order.id, driverA, vehicleA);

    expect(result).toMatchObject({
      id: order.id,
      status: "ASSIGNED",
      driverId: driverA,
      vehicleId: vehicleA,
    });
  });

  it("reassignment returns the order ASSIGNED with the NEW driver and vehicle", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);

    const result = await assign(order.id, driverB, vehicleB);

    expect(result).toMatchObject({ status: "ASSIGNED", driverId: driverB, vehicleId: vehicleB });
  });

  it("still audits order.assign and order.reassign exactly as before", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "order.assign" }));

    auditLog.mockClear();
    await assign(order.id, driverB, vehicleB);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "order.reassign" }));
  });

  it("Order is written ONLY by the projection — the wrapper never touches it (AR5)", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    await assign(order.id, driverB, vehicleB);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    // The order's driver is a COPY of the dispatch's, derived after the fact.
    const dispatch = await liveDispatch(order.id);
    expect(row.driverId).toBe(dispatch.driverId);
    expect(row.vehicleId).toBe(dispatch.vehicleId);

    // A reassignment is not a status change, so it must add no order history.
    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history.map((h) => h.status)).toEqual(["ASSIGNED"]);
  });
});

describe("AR2 — a rolled-back reassignment leaves the assignment ledger consistent", () => {
  it("a failure mid-transaction leaves exactly one open assignment, unchanged", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);
    const ghost = { ...actor, userId: randomUUID() };

    // DispatchAssignment.changedByUserId FKs to users, so a ghost actor fails the
    // write AFTER the dispatch row and the close have already been applied inside
    // the transaction.
    await expect(
      dispatches.update(organizationId, dispatch.id, { driverId: driverB }, ghost),
    ).rejects.toThrow();

    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.driverId).toBe(driverA);

    const history = await assignmentHistory(dispatch.id);
    expect(history).toHaveLength(1);
    // The close was rolled back too: the original assignment is still OPEN. Without
    // one transaction this dispatch would have had zero open assignments — a driver
    // on the job with nothing recording it.
    expect(history[0].unassignedAt).toBeNull();
    expect(await openAssignments(dispatch.id)).toBe(1);
  });
});

describe("R13 — the server tells the client which transitions are legal (Task 8.10)", () => {
  /// The board and the detail screen used to each carry their own copy of the
  /// transition table. They now ask. This is the field they ask through, and it is
  /// computed from the same ALLOWED_TRANSITIONS the service enforces — so the UI
  /// cannot offer a button the API would refuse.
  it("a DRAFT dispatch may only be ASSIGNED", async () => {
    const order = await makeOrder();
    const dispatch = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      actor,
    );

    expect(dispatch.allowedTransitions).toEqual(["ASSIGNED"]);
  });

  it("an in-flight dispatch may advance or be cancelled", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await dispatches.getById(organizationId, (await liveDispatch(order.id)).id);

    expect(dispatch.allowedTransitions).toEqual(["EN_ROUTE_TO_PICKUP", "CANCELLED"]);
  });

  it("a terminal dispatch offers nothing", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const live = await liveDispatch(order.id);
    const cancelled = await dispatches.cancel(organizationId, live.id, actor);

    expect(cancelled.allowedTransitions).toEqual([]);
  });

  it("what it offers, the API accepts — every single one", async () => {
    // The invariant the whole board rests on: no button that fails.
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    let current = await dispatches.getById(organizationId, (await liveDispatch(order.id)).id);

    // Walk the forward chain, at each step taking a transition the server offered.
    for (;;) {
      const forward = (current.allowedTransitions as DispatchStatus[]).filter(
        (s) => s !== "CANCELLED",
      );
      if (forward.length === 0) break;
      current = await dispatches.updateStatus(
        organizationId,
        current.id,
        { status: forward[0] },
        actor,
      );
    }

    expect(current.status).toBe("DELIVERED");
    expect(current.allowedTransitions).toEqual([]);
  });
});
