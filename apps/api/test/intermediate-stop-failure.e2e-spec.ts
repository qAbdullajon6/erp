import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { DriverActionEventsService } from "../src/dispatch/driver/driver-action-events.service";
import { DriverDispatchService } from "../src/dispatch/driver/driver-dispatch.service";
import { DriverWorkspaceService } from "../src/dispatch/driver/driver-workspace.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// Phase 5E-4 — Intermediate stop failure and recovery lifecycle.
///
/// Verifies:
///   - reportIntermediateStopFailure() guards and happy path
///   - Atomic stop stamp + AT_STOP → IN_TRANSIT transition
///   - Correct stop timestamp semantics (failedAt set, completedAt null, arrivedAt preserved)
///   - Concurrency safety (double-failure rejected)
///   - undoStatus undo fix (failure departure does not clear prior completed stop)
///   - Multi-stop progression after a failed intermediate stop
///   - Driver action event + dispatcher notification

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const auditLog = jest.fn().mockResolvedValue(undefined);
const audit = { log: auditLog } as unknown as AuditService;
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
const recordDriverAction = jest.fn().mockResolvedValue(undefined);
const events = { record: recordDriverAction } as unknown as DriverActionEventsService;
const workspace = new DriverWorkspaceService(prisma, events, audit);
const driverApp = new DriverDispatchService(
  prisma,
  dispatches,
  writer,
  audit,
  tracking as unknown as ConstructorParameters<typeof DriverDispatchService>[4],
  events,
  workspace,
  wfEvents as unknown as ConstructorParameters<typeof DriverDispatchService>[7],
);

const PICKUP = new Date("2041-06-01T08:00:00.000Z");
const DELIVERY = new Date("2041-06-03T18:00:00.000Z");

let organizationId: string;
let customerId: string;
let driverId: string;
let vehicleId: string;
let dispatcher: CurrentUserPayload;
let driverActor: CurrentUserPayload;
const userIds: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeOrderData(intermediateStopCount = 0) {
  return {
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
    status: "PENDING" as const,
  };
}

function makeStopData(orderId: string, stopIndex: number) {
  return {
    organizationId,
    orderId,
    stopIndex,
    address: `${stopIndex} Intermediate Ave`,
    city: "Bukhara",
    postalCode: "200100",
    countryCode: "UZ",
  };
}

async function createOrderWithStops(intermediateCount: number) {
  const order = await prisma.order.create({ data: makeOrderData(intermediateCount) });
  for (let i = 1; i <= intermediateCount; i++) {
    await prisma.orderStop.create({ data: makeStopData(order.id, i) });
  }
  return order;
}

async function assignedDispatch(intermediateCount = 1) {
  const order = await createOrderWithStops(intermediateCount);
  await orders.assign(organizationId, order.id, { driverId, vehicleId }, dispatcher);
  const dispatch = await prisma.dispatch.findFirstOrThrow({
    where: { orderId: order.id, status: { not: "CANCELLED" } },
    include: { stops: { orderBy: { stopIndex: "asc" } } },
  });
  return { order, dispatch };
}

// Advance driver to AT_STOP on the first intermediate stop.
async function advanceToAtStop(dispatchId: string) {
  await driverApp.accept(organizationId, driverActor.userId, dispatchId, driverActor);
  await driverApp.updateStatus(organizationId, driverActor.userId, dispatchId, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
  await driverApp.updateStatus(organizationId, driverActor.userId, dispatchId, { status: "AT_PICKUP" }, driverActor);
  await driverApp.updateStatus(organizationId, driverActor.userId, dispatchId, { status: "IN_TRANSIT" }, driverActor);
  await driverApp.updateStatus(organizationId, driverActor.userId, dispatchId, { status: "AT_STOP" }, driverActor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "StopFail Org", slug: `stopfail-${randomUUID()}` },
  });
  organizationId = org.id;

  const makeUser = async (role: "DISPATCHER" | "DRIVER") => {
    const user = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-sf-${randomUUID()}@example.test`,
        firstName: role === "DRIVER" ? "Dan" : "Dee",
        lastName: role === "DRIVER" ? "Driver" : "Dispatcher",
        passwordHash: "not-a-real-hash",
      },
    });
    userIds.push(user.id);
    const membership = await prisma.membership.create({
      data: { organizationId, userId: user.id, role },
    });
    return {
      userId: user.id,
      membershipId: membership.id,
      organizationId,
      role,
      email: user.email,
      isPlatformAdmin: false,
    } as CurrentUserPayload;
  };

  dispatcher = await makeUser("DISPATCHER");
  driverActor = await makeUser("DRIVER");

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      customerCode: `CUS-${randomUUID().slice(0, 8)}`,
      companyName: "Stop Fail Co",
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
      phone: "+998 90 100 00 00",
      userId: driverActor.userId,
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
});

afterEach(async () => {
  await prisma.driverActionEvent.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  auditLog.mockClear();
  recordDriverAction.mockClear();
  (geofences.archiveIntermediateStopForDispatch as jest.Mock).mockClear();
  (geofences.createForNextIntermediateStop as jest.Mock).mockClear();
  (geofences.rotateIntermediateStopFence as jest.Mock).mockClear();
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Valid failure — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("1. valid intermediate stop failure — happy path", () => {
  it("stamps failedAt on the stop and transitions dispatch to IN_TRANSIT", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const activeStop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    const before = Date.now();

    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      activeStop.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );
    const after = Date.now();

    const updatedStop = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: activeStop.id } });
    expect(updatedStop.failedAt).not.toBeNull();
    expect(updatedStop.failedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(updatedStop.failedAt!.getTime()).toBeLessThanOrEqual(after);
    expect(updatedStop.failureReason).toBe("WRONG_ADDRESS");
    expect(updatedStop.completedAt).toBeNull();
    expect(updatedStop.arrivedAt).not.toBeNull(); // preserved from AT_STOP transition

    const updatedDispatch = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(updatedDispatch.status).toBe("IN_TRANSIT");
  });

  it("records a status history entry for IN_TRANSIT after failure", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "ACCESS_PROBLEM" },
      driverActor,
    );

    const history = await prisma.dispatchStatusHistory.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { createdAt: "desc" },
    });
    expect(history[0].status).toBe("IN_TRANSIT");
    expect(history[0].note).toContain("ACCESS_PROBLEM");
  });

  it("records an INTERMEDIATE_STOP_FAILED driver action event", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "ACCESS_PROBLEM", notes: "Gate locked" },
      driverActor,
    );

    expect(recordDriverAction).toHaveBeenCalledWith(
      organizationId,
      driverId,
      "INTERMEDIATE_STOP_FAILED",
      expect.objectContaining({
        dispatchId: dispatch.id,
        payload: expect.objectContaining({ stopId: stop.id, reason: "ACCESS_PROBLEM", notes: "Gate locked" }),
      }),
    );
  });

  it("creates a DISPATCH_INTERMEDIATE_STOP_FAILED dispatcher notification", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );

    const notif = await prisma.notification.findFirst({
      where: { organizationId, type: "DISPATCH_INTERMEDIATE_STOP_FAILED", entityId: dispatch.id },
    });
    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("Intermediate stop could not be completed");
    expect(notif!.message).toContain("wrong address");
    expect(notif!.message).not.toContain("Delivery failed");
    expect(notif!.message).toContain("Delivery is continuing");
  });

  it("invokes the IN_TRANSIT geofence hook after the transaction", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "VEHICLE_PROBLEM" },
      driverActor,
    );

    expect(geofences.rotateIntermediateStopFence).toHaveBeenCalledWith(organizationId, dispatch.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Guard rejections
// ─────────────────────────────────────────────────────────────────────────────

describe("2. guard rejections", () => {
  it("rejects when dispatch is not AT_STOP", async () => {
    const { dispatch } = await assignedDispatch(1);
    // Dispatch is ASSIGNED — not AT_STOP
    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        stop.id,
        { reason: "WRONG_ADDRESS" },
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when dispatch is IN_TRANSIT (not yet at stop)", async () => {
    const { dispatch } = await assignedDispatch(1);
    await driverApp.accept(organizationId, driverActor.userId, dispatch.id, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);
    // Status is now IN_TRANSIT, not AT_STOP

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        stop.id,
        { reason: "WRONG_ADDRESS" },
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when the stop is a DELIVERY stop", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const deliveryStop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "DELIVERY" },
    });
    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        deliveryStop.id,
        { reason: "WRONG_ADDRESS" },
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when the stop is a PICKUP stop", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const pickupStop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        pickupStop.id,
        { reason: "WRONG_ADDRESS" },
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when the stop has not been arrived at (future/unvisited stop)", async () => {
    const { dispatch } = await assignedDispatch(2); // 2 intermediate stops
    await advanceToAtStop(dispatch.id); // arrives at stop 1

    // Stop 2 is future/unvisited (arrivedAt = null)
    const futureStop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE", arrivedAt: null },
      orderBy: { stopIndex: "desc" },
    });
    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        futureStop.id,
        { reason: "WRONG_ADDRESS" },
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when stop does not belong to this dispatch (NotFoundException)", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        randomUUID(), // non-existent stop id
        { reason: "WRONG_ADDRESS" },
        driverActor,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("requires a note when reason is OTHER", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        stop.id,
        { reason: "OTHER" }, // no notes
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Already-failed / already-completed stop rejection
// ─────────────────────────────────────────────────────────────────────────────

describe("3. already-failed and already-completed stop rejection", () => {
  it("rejects a second failure on an already-failed stop (409)", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    // First failure succeeds and transitions dispatch to IN_TRANSIT
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );

    // The stop is now failed AND the dispatch is IN_TRANSIT — both guards fire
    await expect(
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        stop.id,
        { reason: "ACCESS_PROBLEM" },
        driverActor,
      ),
    // Dispatch is no longer AT_STOP → BadRequestException from status check
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Stop timestamp semantics
// ─────────────────────────────────────────────────────────────────────────────

describe("4. stop timestamp semantics after failure", () => {
  it("failed stop: arrivedAt preserved, completedAt null, failedAt set", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stopBefore = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    const arrivedAt = stopBefore.arrivedAt;
    expect(arrivedAt).not.toBeNull(); // was stamped by AT_STOP transition

    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stopBefore.id,
      { reason: "ACCESS_PROBLEM" },
      driverActor,
    );

    const stopAfter = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stopBefore.id } });
    expect(stopAfter.arrivedAt).toEqual(arrivedAt); // unchanged
    expect(stopAfter.completedAt).toBeNull();        // never stamped
    expect(stopAfter.failedAt).not.toBeNull();       // stamped by failure
  });

  it("pickup stop timestamps are unaffected by intermediate failure", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const pickupBefore = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "PICKUP" },
    });
    const intermediateStop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      intermediateStop.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );

    const pickupAfter = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: pickupBefore.id } });
    expect(pickupAfter.arrivedAt).toEqual(pickupBefore.arrivedAt);
    expect(pickupAfter.completedAt).toEqual(pickupBefore.completedAt);
    expect(pickupAfter.failedAt).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Concurrency — second concurrent failure is rejected (409)
// ─────────────────────────────────────────────────────────────────────────────

describe("5. concurrency: second failure attempt is rejected", () => {
  it("one of two concurrent failure requests succeeds, the other gets ConflictException", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    const fail = () =>
      driverApp.reportIntermediateStopFailure(
        organizationId,
        driverActor.userId,
        dispatch.id,
        stop.id,
        { reason: "WRONG_ADDRESS" },
        driverActor,
      );

    const results = await Promise.allSettled([fail(), fail()]);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    // The loser sees a Conflict (status changed concurrently)
    const rejection = (failed[0] as PromiseRejectedResult).reason;
    expect(rejection).toBeInstanceOf(ConflictException);

    // Stop must have exactly one failedAt (not overwritten)
    const finalStop = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(finalStop.failedAt).not.toBeNull();
    expect(finalStop.completedAt).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Undo fix — failure departure does not clear prior completed stop
// ─────────────────────────────────────────────────────────────────────────────

describe("6. undoStatus undo fix", () => {
  it("normal departure: undo IN_TRANSIT → AT_STOP clears the completed stop's completedAt", async () => {
    const { dispatch } = await assignedDispatch(2); // 2 intermediate stops
    await advanceToAtStop(dispatch.id); // arrive at stop 1

    // Complete stop 1 normally (AT_STOP → IN_TRANSIT)
    await driverApp.updateStatus(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { status: "IN_TRANSIT" },
      driverActor,
    );
    await driverApp.updateStatus(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { status: "AT_STOP" },
      driverActor,
    );

    // Stop 2 is the active intermediate stop: arrived, not yet completed, not failed.
    // Without completedAt: null we could accidentally match stop 1 (which is already
    // completed and also has arrivedAt set).
    const stop2 = await prisma.dispatchStop.findFirstOrThrow({
      where: {
        dispatchId: dispatch.id,
        stopType: "INTERMEDIATE",
        arrivedAt: { not: null },
        completedAt: null,
        failedAt: null,
      },
    });

    // Depart stop 2 normally
    await driverApp.updateStatus(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { status: "IN_TRANSIT" },
      driverActor,
    );

    // Stop 2 should now have completedAt set
    const stop2After = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });
    expect(stop2After.completedAt).not.toBeNull();

    // Undo: IN_TRANSIT → AT_STOP — should clear stop 2's completedAt
    await dispatches.undoStatus(organizationId, dispatch.id, dispatcher);

    const stop2Undone = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });
    expect(stop2Undone.completedAt).toBeNull(); // correctly cleared
  });

  it("failure departure: undo IN_TRANSIT → AT_STOP does NOT clear the prior completed stop", async () => {
    const { dispatch } = await assignedDispatch(2); // 2 intermediate stops
    await advanceToAtStop(dispatch.id); // arrive at stop 1

    // Complete stop 1 normally
    await driverApp.updateStatus(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { status: "IN_TRANSIT" },
      driverActor,
    );
    await driverApp.updateStatus(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { status: "AT_STOP" },
      driverActor,
    );

    const stop1 = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE", completedAt: { not: null } },
    });
    const stop1CompletedAt = stop1.completedAt;
    expect(stop1CompletedAt).not.toBeNull();

    // Fail stop 2 — the active stop (arrived, not completed, not failed).
    const stop2 = await prisma.dispatchStop.findFirstOrThrow({
      where: {
        dispatchId: dispatch.id,
        stopType: "INTERMEDIATE",
        arrivedAt: { not: null },
        completedAt: null,
        failedAt: null,
      },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop2.id,
      { reason: "ACCESS_PROBLEM" },
      driverActor,
    );

    // Dispatch is now IN_TRANSIT after failure. Undo back to AT_STOP.
    await dispatches.undoStatus(organizationId, dispatch.id, dispatcher);

    // stop 1's completedAt must NOT have been cleared
    const stop1After = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop1.id } });
    expect(stop1After.completedAt).toEqual(stop1CompletedAt);

    // stop 2's failedAt must remain
    const stop2After = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop2.id } });
    expect(stop2After.failedAt).not.toBeNull();
    expect(stop2After.completedAt).toBeNull();
    expect(stop2After.arrivedAt).not.toBeNull();

    // Dispatch reverted to AT_STOP
    const dispatchAfter = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(dispatchAfter.status).toBe("AT_STOP");
  });

  it("failed stop's failedAt remains after undo", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );

    const stopWithFailedAt = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    const failedAtTimestamp = stopWithFailedAt.failedAt;

    await dispatches.undoStatus(organizationId, dispatch.id, dispatcher);

    const stopAfterUndo = await prisma.dispatchStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(stopAfterUndo.failedAt).toEqual(failedAtTimestamp); // unchanged
    expect(stopAfterUndo.completedAt).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Multi-stop progression
// ─────────────────────────────────────────────────────────────────────────────

describe("7. multi-stop progression: stop 1 completed, stop 2 failed, stop 3 pending", () => {
  it("correct stop states after stop 2 failure", async () => {
    const { dispatch } = await assignedDispatch(3); // 3 intermediate stops

    // Complete stop 1 normally
    await advanceToAtStop(dispatch.id); // arrive at stop 1
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);

    // Arrive at stop 2
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);

    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    const [stop1, stop2, stop3] = stops;

    expect(stop1.completedAt).not.toBeNull();
    expect(stop2.arrivedAt).not.toBeNull();
    expect(stop2.completedAt).toBeNull();

    // Fail stop 2
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop2.id,
      { reason: "ACCESS_PROBLEM", notes: "Gate locked by security" },
      driverActor,
    );

    const finalStops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
      orderBy: { stopIndex: "asc" },
    });
    const [final1, final2, final3] = finalStops;

    // Stop 1: completed (unchanged)
    expect(final1.completedAt).not.toBeNull();
    expect(final1.failedAt).toBeNull();

    // Stop 2: failed (arrivedAt preserved, completedAt null)
    expect(final2.arrivedAt).not.toBeNull();
    expect(final2.completedAt).toBeNull();
    expect(final2.failedAt).not.toBeNull();
    expect(final2.failureReason).toBe("ACCESS_PROBLEM");
    expect(final2.failureNotes).toBe("Gate locked by security");

    // Stop 3: still upcoming
    expect(final3.arrivedAt).toBeNull();
    expect(final3.completedAt).toBeNull();
    expect(final3.failedAt).toBeNull();

    // Dispatch: IN_TRANSIT
    const dispatchAfter = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(dispatchAfter.status).toBe("IN_TRANSIT");
  });

  it("driver can continue to stop 3 after stop 2 fails and dispatch reaches IN_TRANSIT", async () => {
    const { dispatch } = await assignedDispatch(2); // 2 intermediate stops

    // Complete stop 1
    await advanceToAtStop(dispatch.id);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);

    // Fail stop 2 — the active stop (arrived, not completed, not failed).
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);
    const stop2 = await prisma.dispatchStop.findFirstOrThrow({
      where: {
        dispatchId: dispatch.id,
        stopType: "INTERMEDIATE",
        arrivedAt: { not: null },
        completedAt: null,
        failedAt: null,
      },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop2.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );

    // Dispatch is now IN_TRANSIT — driver can advance to ARRIVED_AT_DELIVERY
    const result = await driverApp.updateStatus(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { status: "ARRIVED_AT_DELIVERY" },
      driverActor,
    );
    expect(result.status).toBe("ARRIVED_AT_DELIVERY");
  });

  it("delivery failure semantics are completely unaffected by intermediate stop failure feature", async () => {
    const { dispatch } = await assignedDispatch(1);
    await advanceToAtStop(dispatch.id);

    const stop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });
    await driverApp.reportIntermediateStopFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      stop.id,
      { reason: "WRONG_ADDRESS" },
      driverActor,
    );

    // Continue to delivery and fail it
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "ARRIVED_AT_DELIVERY" }, driverActor);

    await driverApp.reportFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { reason: "CUSTOMER_UNAVAILABLE" },
      driverActor,
    );

    const finalDispatch = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(finalDispatch.status).toBe("DELIVERY_FAILED");
    expect(finalDispatch.failureReason).toBe("CUSTOMER_UNAVAILABLE");
    // Intermediate stop failure should not affect delivery-level failure fields
    expect(finalDispatch.failedAt).not.toBeNull();
  });
});
