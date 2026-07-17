import { randomUUID } from "crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import {
  DriverDoubleBookedError,
  VehicleDoubleBookedError,
} from "../src/dispatch/dispatch.errors";
import { OrderWriter } from "../src/order-state/order-writer";
import { PrismaService } from "../src/prisma/prisma.service";

/// Transactional-write verification for ADR-001 Phase 2 (Task 8.3).
/// Implements R5 (no double-booking), R9, R13 (legal transitions only), AR2
/// (every business write is atomic).
///
/// This drives the REAL DispatchesService against the REAL database, because the
/// two things under test — atomicity and what the database does under concurrency
/// — are precisely the things a mocked Prisma cannot show you. A unit test with a
/// fake client would happily "prove" a rollback that never happened.
///
/// The audit service is the only stub, and only so we can assert the thing the
/// brief requires: that audit stays OUTSIDE the transaction, and therefore is
/// never written for a business write that rolled back.

const prisma = new PrismaService();
const auditLog = jest.fn().mockResolvedValue(undefined);
const audit = { log: auditLog } as unknown as AuditService;
// The real policy and the real queries: the assignment rules are part of what
// these transactions have to get right, so stubbing them would hide exactly the
// interaction under test.
const queries = new AssignmentQueries(prisma);
const service = new DispatchesService(prisma, audit, new AssignmentPolicy(prisma, queries), new OrderWriter(), { emit: () => {} } as any);

const PICKUP = new Date("2032-05-01T08:00:00.000Z");
const DELIVERY = new Date("2032-05-03T18:00:00.000Z");

interface Fixture {
  organizationId: string;
  actor: CurrentUserPayload;
  orderA: string;
  orderB: string;
  driverA: string;
  driverB: string;
  vehicleA: string;
  vehicleB: string;
}

let fx: Fixture;
const userIds: string[] = [];

/// An actor whose user row does not exist. The status-history row has a foreign
/// key to users(id), so writing history for this actor fails INSIDE the
/// transaction, after the dispatch row has already been written — which is
/// exactly the partial-write scenario AR2 exists to prevent.
function ghostActor(): CurrentUserPayload {
  return { ...fx.actor, userId: randomUUID() };
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: "Tx Org", slug: `tx-org-${randomUUID()}` },
  });
  const organizationId = organization.id;

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

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      customerCode: `CUS-${randomUUID().slice(0, 8)}`,
      companyName: "Tx Co",
      contactName: "Tara Tx",
    },
  });

  const makeOrder = () =>
    prisma.order.create({
      data: {
        organizationId,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        pickupAddress: "1 Depot Rd",
        pickupCity: "Tashkent",
        pickupDate: PICKUP,
        deliveryAddress: "9 Dock St",
        deliveryCity: "Samarkand",
        deliveryDate: DELIVERY,
        cargoDescription: "Pallets",
        price: "1000.00",
      },
    });
  const makeDriver = (suffix: string) =>
    prisma.driver.create({
      data: {
        organizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Driver",
        lastName: suffix,
        phone: "+998 90 000 00 00",
      },
    });
  const makeVehicle = (suffix: string) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: `Truck ${suffix}`,
      },
    });

  const [orderA, orderB, driverA, driverB, vehicleA, vehicleB] = await Promise.all([
    makeOrder(),
    makeOrder(),
    makeDriver("A"),
    makeDriver("B"),
    makeVehicle("A"),
    makeVehicle("B"),
  ]);

  fx = {
    organizationId,
    actor: {
      userId: user.id,
      membershipId: membership.id,
      organizationId,
      role: "DISPATCHER",
      email: user.email,
      isPlatformAdmin: false,
    },
    orderA: orderA.id,
    orderB: orderB.id,
    driverA: driverA.id,
    driverB: driverB.id,
    vehicleA: vehicleA.id,
    vehicleB: vehicleB.id,
  };
});

afterEach(async () => {
  await prisma.dispatch.deleteMany({ where: { organizationId: fx.organizationId } });
  auditLog.mockClear();
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: fx.organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

/// Creates a DRAFT dispatch through the real service.
function createDraft(
  orderId: string,
  driverId: string,
  vehicleId: string,
  actor: CurrentUserPayload = fx.actor,
) {
  return service.create(fx.organizationId, { orderId, driverId, vehicleId }, actor);
}

function historyFor(dispatchId: string) {
  return prisma.dispatchStatusHistory.findMany({
    where: { dispatchId },
    orderBy: { createdAt: "asc" },
  });
}

/// Runs both promises to completion and reports who won, without letting an
/// unhandled rejection escape.
async function race<T>(a: Promise<T>, b: Promise<T>) {
  const results = await Promise.allSettled([a, b]);
  return {
    fulfilled: results.filter((r) => r.status === "fulfilled"),
    rejected: results.filter((r) => r.status === "rejected") as PromiseRejectedResult[],
  };
}

describe("dispatch writes are atomic (AR2)", () => {
  it("commits the dispatch and its first history row together", async () => {
    const dispatch = await createDraft(fx.orderA, fx.driverA, fx.vehicleA);

    const history = await historyFor(dispatch.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: "DRAFT", note: "Dispatch created" });
  });

  it("rolls the dispatch back when the history write fails — no orphan dispatch", async () => {
    await expect(createDraft(fx.orderA, fx.driverA, fx.vehicleA, ghostActor())).rejects.toThrow();

    // The dispatch row was written before the history row failed. If the two were
    // not in one transaction, it would still be sitting there.
    const dispatches = await prisma.dispatch.findMany({
      where: { organizationId: fx.organizationId },
    });
    expect(dispatches).toEqual([]);
  });

  it("does not write an audit entry for a business write that rolled back", async () => {
    await expect(createDraft(fx.orderA, fx.driverA, fx.vehicleA, ghostActor())).rejects.toThrow();

    expect(auditLog).not.toHaveBeenCalled();
  });

  it("leaves the status and the history untouched when a status change fails mid-transaction", async () => {
    const dispatch = await createDraft(fx.orderA, fx.driverA, fx.vehicleA);
    auditLog.mockClear();

    await expect(
      service.updateStatus(fx.organizationId, dispatch.id, { status: "ASSIGNED" }, ghostActor()),
    ).rejects.toThrow();

    const after = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(after.status).toBe("DRAFT");
    expect(await historyFor(dispatch.id)).toHaveLength(1); // only the DRAFT row from create
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe("R5 — a lost double-booking race is a conflict, not a 500", () => {
  /// A DRAFT dispatch reserves nothing (R1), so the overlap constraint only bites
  /// when a draft is ACTIVATED. Two drafts for the same driver in the same window
  /// are therefore legal to create — and illegal to both activate.
  async function twoDraftsSharing(resource: "driver" | "vehicle") {
    const first = await createDraft(fx.orderA, fx.driverA, fx.vehicleA);
    const second = await createDraft(
      fx.orderB,
      // Share exactly one resource, so only one constraint can fire.
      resource === "driver" ? fx.driverA : fx.driverB,
      resource === "driver" ? fx.vehicleB : fx.vehicleA,
    );
    return [first, second];
  }

  const activate = (id: string) =>
    service.updateStatus(fx.organizationId, id, { status: "ASSIGNED" }, fx.actor);

  it("translates a driver overlap into a domain conflict when activating sequentially", async () => {
    const [first, second] = await twoDraftsSharing("driver");
    await activate(first.id);

    // Before 8.3 this escaped as a raw Postgres 23P01 and became an HTTP 500:
    // updateStatus never re-checked overlap, so nothing above the database knew.
    const error = await activate(second.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DriverDoubleBookedError);
    expect((error as ConflictException).getStatus()).toBe(409);
  });

  it("translates a vehicle overlap into a domain conflict", async () => {
    const [first, second] = await twoDraftsSharing("vehicle");
    await activate(first.id);

    const error = await activate(second.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VehicleDoubleBookedError);
    expect((error as ConflictException).getStatus()).toBe(409);
  });

  it("under simultaneous activation exactly one wins and the loser gets a 409", async () => {
    const [first, second] = await twoDraftsSharing("driver");

    const { fulfilled, rejected } = await race(activate(first.id), activate(second.id));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    // And the database agrees: only one of them actually reserves the driver.
    const active = await prisma.dispatch.findMany({
      where: { organizationId: fx.organizationId, status: "ASSIGNED" },
    });
    expect(active).toHaveLength(1);
  });

  it("the loser of the race leaves nothing behind — no status change, no history row", async () => {
    const [first, second] = await twoDraftsSharing("driver");

    const { rejected } = await race(activate(first.id), activate(second.id));
    expect(rejected).toHaveLength(1);

    const stillDraft = await prisma.dispatch.findMany({
      where: { organizationId: fx.organizationId, status: "DRAFT" },
    });
    expect(stillDraft).toHaveLength(1);
    // Its history must still be just the DRAFT row from create: the ASSIGNED row
    // was written before the constraint fired, and must have rolled back with it.
    expect(await historyFor(stillDraft[0].id)).toHaveLength(1);
  });
});

describe("R13 — concurrent transitions on the same dispatch", () => {
  async function assignedDispatch() {
    const dispatch = await createDraft(fx.orderA, fx.driverA, fx.vehicleA);
    await service.updateStatus(fx.organizationId, dispatch.id, { status: "ASSIGNED" }, fx.actor);
    auditLog.mockClear();
    return dispatch;
  }

  const advance = (id: string) =>
    service.updateStatus(fx.organizationId, id, { status: "EN_ROUTE_TO_PICKUP" }, fx.actor);

  it("applies the transition exactly once when two requests arrive together", async () => {
    const dispatch = await assignedDispatch();

    const { fulfilled, rejected } = await race(advance(dispatch.id), advance(dispatch.id));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser's compare-and-set matched no rows; it re-read and reported the
    // status it actually found — a conflict, never a 500 and never a silent no-op.
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    // The decisive assertion: ONE history row for the transition, not two.
    const history = await historyFor(dispatch.id);
    expect(history.map((h) => h.status)).toEqual(["DRAFT", "ASSIGNED", "EN_ROUTE_TO_PICKUP"]);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("cancels exactly once when two cancels arrive together", async () => {
    const dispatch = await assignedDispatch();

    const { fulfilled, rejected } = await race(
      service.cancel(fx.organizationId, dispatch.id, fx.actor),
      service.cancel(fx.organizationId, dispatch.id, fx.actor),
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const history = await historyFor(dispatch.id);
    expect(history.filter((h) => h.status === "CANCELLED")).toHaveLength(1);
  });

  it("rejects a transition that a concurrent request has already made illegal", async () => {
    const dispatch = await assignedDispatch();
    // Someone cancels while we were still holding a stale ASSIGNED read.
    await service.cancel(fx.organizationId, dispatch.id, fx.actor);

    const error = await advance(dispatch.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toContain("CANCELLED");
  });

  it("still 404s for a dispatch belonging to another organization", async () => {
    const dispatch = await assignedDispatch();

    await expect(
      service.updateStatus(randomUUID(), dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, fx.actor),
    ).rejects.toThrow(NotFoundException);
  });
});
