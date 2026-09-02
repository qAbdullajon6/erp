import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { notifyDriverOfAssignment } from "../src/dispatch/driver/driver-assignment-notify";
import { DriverActionEventsService } from "../src/dispatch/driver/driver-action-events.service";
import { DriverDispatchService } from "../src/dispatch/driver/driver-dispatch.service";
import { DriverWorkspaceService } from "../src/dispatch/driver/driver-workspace.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// Task 8.12 — the driver executes the DISPATCH.
///
/// Implements R3 (Order remains a projection), R13, R14 (scoping). Satisfies AR1
/// (no second rule set for drivers), AR2, AR5.
///
/// The point of this suite is the SOURCE. A driver's list used to be found by
/// `Order.driverId` — but since Task 8.6 that column is a projection, a photocopy of
/// what the dispatch says. The driver was reading their own work off the copy. These
/// tests pin the list to the dispatch, and the mutation check at the end proves it:
/// go back to the Order table, and they go red.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const auditLog = jest.fn().mockResolvedValue(undefined);
const audit = { log: auditLog } as unknown as AuditService;
const wfEvents = {
  emit: jest.fn(),
} as unknown as ConstructorParameters<typeof DispatchesService>[4];
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
const recordDriverAction = jest.fn().mockResolvedValue(undefined);
const events = { record: recordDriverAction } as unknown as DriverActionEventsService;
const workspace = new DriverWorkspaceService(prisma, events, audit);
const driverTracking = {
  endSessionsForDispatch: jest.fn().mockResolvedValue(0),
} as unknown as ConstructorParameters<typeof DriverDispatchService>[4];
const driverApp = new DriverDispatchService(
  prisma,
  dispatches,
  writer,
  audit,
  driverTracking,
  events,
  workspace,
  wfEvents,
);

const PICKUP = new Date("2041-05-01T08:00:00.000Z");
const DELIVERY = new Date("2041-05-03T18:00:00.000Z");

let organizationId: string;
let customerId: string;
let dispatcher: CurrentUserPayload;
/// The driver we act as: a User linked to a Driver row.
let driverActor: CurrentUserPayload;
let driverA: string;
let driverB: string;
let vehicleA: string;
let vehicleB: string;
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
      deliveryAddress: "9 Dock St",
      deliveryCity: "Samarkand",
      deliveryDate: DELIVERY,
      cargoDescription: "Pallets",
      price: "1000.00",
      status: "PENDING",
    },
  });
}

/// Assigns an order, which creates and activates a dispatch (Task 8.7).
async function assignedDispatch(driverId = driverA, vehicleId = vehicleA) {
  const order = await makeOrder();
  await orders.assign(organizationId, order.id, { driverId, vehicleId }, dispatcher);
  const dispatch = await prisma.dispatch.findFirstOrThrow({
    where: { orderId: order.id, status: { not: "CANCELLED" } },
  });
  return { order, dispatch };
}

const accept = (id: string) =>
  driverApp.accept(organizationId, driverActor.userId, id, driverActor);

const advance = async (
  id: string,
  status: "EN_ROUTE_TO_PICKUP" | "AT_PICKUP" | "IN_TRANSIT" | "ARRIVED_AT_DELIVERY" | "DELIVERED",
) => {
  if (status === "EN_ROUTE_TO_PICKUP") {
    const current = await prisma.dispatch.findUniqueOrThrow({ where: { id } });
    if (current.driverAcceptanceStatus !== "ACCEPTED") {
      await accept(id);
    }
  }
  return driverApp.updateStatus(organizationId, driverActor.userId, id, { status }, driverActor);
};

const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Driver Org", slug: `driver-${randomUUID()}` },
  });
  organizationId = org.id;

  const makeUser = async (role: "DISPATCHER" | "DRIVER") => {
    const user = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${randomUUID()}@example.test`,
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
      companyName: "Driver Co",
      contactName: "Cara Customer",
      phone: "+998 71 000 00 00",
    },
  });
  customerId = customer.id;

  // driverA is LINKED to the driver user — that link is how the API finds their work.
  const a = await prisma.driver.create({
    data: {
      organizationId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Dan",
      lastName: "Driver",
      phone: "+998 90 111 11 11",
      userId: driverActor.userId,
    },
  });
  const b = await prisma.driver.create({
    data: {
      organizationId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Otto",
      lastName: "Other",
      phone: "+998 90 222 22 22",
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
  const [va, vb] = await Promise.all([mkVehicle(), mkVehicle()]);

  driverA = a.id;
  driverB = b.id;
  vehicleA = va.id;
  vehicleB = vb.id;

  // Legacy trip-flow tests don't upload POD; keep checklist off by default.
  // P3.3.4A POD gate tests flip requirements on for that org.
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
  await prisma.dispatchDeliveryProof.deleteMany({ where: { organizationId } });
  await prisma.driverBreak.deleteMany({ where: { organizationId } });
  await prisma.vehicleInspection.deleteMany({ where: { organizationId } });
  await prisma.expense.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  auditLog.mockClear();
  (events.record as jest.Mock).mockClear();
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("the driver's list comes from DISPATCH, not from Order.driverId", () => {
  it("shows a dispatch assigned to them", async () => {
    const { dispatch } = await assignedDispatch();

    const mine = await driverApp.listMine(organizationId, driverActor.userId);

    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id: dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      status: "ASSIGNED",
    });
  });

  it("does NOT show another driver's dispatch", async () => {
    await assignedDispatch(driverB, vehicleB);

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
  });

  it("ignores an order row that claims them but has no dispatch behind it", async () => {
    // The legacy shape: Order.driverId set, no dispatch. Since Task 8.6 that column
    // is a projection with no original, and it reserves nobody — so it must not put
    // work on a driver's phone either.
    const order = await makeOrder();
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "ASSIGNED", driverId: driverA, vehicleId: vehicleA },
    });

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
  });

  it("hides a DRAFT dispatch — a dispatcher's sketch is not the driver's work (R1)", async () => {
    const order = await makeOrder();
    await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      dispatcher,
    );

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
  });

  it("drops a finished job off the to-do list, but keeps it for the archive", async () => {
    const { dispatch } = await assignedDispatch();
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"] as const) {
      await advance(dispatch.id, s);
    }

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
    expect(await driverApp.listMine(organizationId, driverActor.userId, true)).toHaveLength(1);
  });
});

describe("the driver sees the dispatch, not just the order", () => {
  it("carries the dispatch number, the scheduled window, the customer and the vehicle", async () => {
    const { dispatch, order } = await assignedDispatch();

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    expect(mine.dispatchNumber).toMatch(/^DSP-/);
    expect(mine.pickupDateScheduled).toEqual(PICKUP);
    expect(mine.deliveryDateScheduled).toEqual(DELIVERY);
    expect(mine.customer).toMatchObject({ companyName: "Driver Co", phone: "+998 71 000 00 00" });
    expect(mine.vehicle.id).toBe(vehicleA);
    // The order is context, nested — not the thing being worked on.
    expect(mine.order).toMatchObject({ id: order.id, pickupCity: "Tashkent" });
  });

  it("is told what it may do next, narrowed to the driver-safe set", async () => {
    const { dispatch } = await assignedDispatch();

    const pending = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    // Until the driver accepts, Start Trip is gated — no transitions offered.
    expect(pending.allowedTransitions).toEqual([]);
    expect(pending.driverAcceptanceStatus).toBe("PENDING");

    await accept(dispatch.id);
    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    // The dispatcher's view of the same dispatch also offers CANCELLED. The driver's
    // does not — narrowed server-side, from the one R13 table.
    expect(mine.allowedTransitions).toEqual(["EN_ROUTE_TO_PICKUP"]);
    const asDispatcher = await dispatches.getById(organizationId, dispatch.id);
    expect(asDispatcher.allowedTransitions).toContain("CANCELLED");
  });
});

describe("EN_ROUTE_TO_PICKUP is finally recordable in real time", () => {
  it("the driver can say they are on their way, as a step of its own", async () => {
    const { dispatch, order } = await assignedDispatch();

    const result = await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");

    expect(result.status).toBe("EN_ROUTE_TO_PICKUP");
    // The customer sees nothing yet — the order stays ASSIGNED (Amendment B).
    expect((await orderRow(order.id)).status).toBe("ASSIGNED");
  });

  it("records each stage at the moment it happens, not backfilled at the end", async () => {
    const { dispatch } = await assignedDispatch();

    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    await advance(dispatch.id, "AT_PICKUP");
    await advance(dispatch.id, "IN_TRANSIT");
    await advance(dispatch.id, "ARRIVED_AT_DELIVERY");
    await advance(dispatch.id, "DELIVERED");

    const history = await prisma.dispatchStatusHistory.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { createdAt: "asc" },
    });

    expect(history.map((h) => h.status)).toEqual([
      "DRAFT",
      "ASSIGNED",
      "EN_ROUTE_TO_PICKUP",
      "AT_PICKUP",
      "IN_TRANSIT",
      "ARRIVED_AT_DELIVERY",
      "DELIVERED",
    ]);
    // Before Task 8.12 a driver could only send PICKED_UP, and the order path walked
    // the dispatch through EN_ROUTE_TO_PICKUP on their behalf — stamping a state they
    // had been in for an hour with the timestamp of the moment they arrived. Each row
    // now carries the time it actually happened, and they are strictly increasing.
    const times = history.map((h) => h.createdAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("R3 — the order still follows the dispatch (projection unchanged)", () => {
  it("AT_PICKUP projects the order to PICKED_UP", async () => {
    const { dispatch, order } = await assignedDispatch();
    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");

    await advance(dispatch.id, "AT_PICKUP");

    expect((await orderRow(order.id)).status).toBe("PICKED_UP");
  });

  it("DELIVERED completes the order, with the dispatch's own delivery time (R7)", async () => {
    const { dispatch, order } = await assignedDispatch();
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"] as const) {
      await advance(dispatch.id, s);
    }

    const row = await orderRow(order.id);
    const finished = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });

    expect(row.status).toBe("DELIVERED");
    expect(row.deliveredAt).toEqual(finished.deliveryDateActual);
  });

  it("the order records every state it passed through", async () => {
    const { dispatch, order } = await assignedDispatch();
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"] as const) {
      await advance(dispatch.id, s);
    }

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.status)).toEqual([
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "DELIVERED",
    ]);
  });
});

describe("a driver may only do a driver's job", () => {
  it("cannot cancel a dispatch", async () => {
    const { dispatch } = await assignedDispatch();

    await expect(
      driverApp.updateStatus(
        organizationId,
        driverActor.userId,
        dispatch.id,
        { status: "CANCELLED" },
        driverActor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("cannot activate a DRAFT dispatch — committing a driver is the dispatcher's call", async () => {
    const order = await makeOrder();
    const draft = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverA, vehicleId: vehicleA },
      dispatcher,
    );

    await expect(
      driverApp.updateStatus(
        organizationId,
        driverActor.userId,
        draft.id,
        { status: "ASSIGNED" },
        driverActor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("cannot skip a step — R13 still applies to them", async () => {
    const { dispatch } = await assignedDispatch();

    // Straight to IN_TRANSIT without ever arriving at the pickup.
    await expect(advance(dispatch.id, "IN_TRANSIT")).rejects.toThrow(
      /Cannot transition a dispatch/,
    );
  });

  it("cannot touch another driver's dispatch — and is told NOT FOUND, not forbidden", async () => {
    const { dispatch } = await assignedDispatch(driverB, vehicleB);

    // A 403 would confirm the id exists. It does not exist, as far as this driver
    // is concerned (R14).
    await expect(
      driverApp.getMine(organizationId, driverActor.userId, dispatch.id),
    ).rejects.toThrow(NotFoundException);
    await expect(advance(dispatch.id, "EN_ROUTE_TO_PICKUP")).rejects.toThrow(NotFoundException);
  });

  it("a user with no driver profile is told so plainly", async () => {
    await expect(
      driverApp.listMine(organizationId, dispatcher.userId),
    ).rejects.toThrow(/No driver profile is linked/);
  });
});

describe("the SOURCE, pinned — when the projection and the dispatch disagree", () => {
  /// The tests above cannot tell the two apart, because the projection is always in
  /// step with the dispatch: ask either, get the same answer. That makes them useless
  /// as a guard — swap the query back to Order.driverId and they stay green.
  ///
  /// So these force the two apart. Order.driverId is written directly, behind the
  /// projection's back, exactly as a stale or repaired row might be. The dispatch is
  /// the operational record (ADR-001); the driver must follow IT.
  it("still shows a dispatch that is theirs, even if the order projection says otherwise", async () => {
    const { dispatch, order } = await assignedDispatch(driverA, vehicleA);

    // The projection now lies: it says somebody else is driving.
    await prisma.order.update({ where: { id: order.id }, data: { driverId: driverB } });

    const mine = await driverApp.listMine(organizationId, driverActor.userId);

    // The dispatch still says driverA, and the dispatch is the truth.
    expect(mine.map((d) => d.id)).toEqual([dispatch.id]);
  });

  it("does NOT show a dispatch that is not theirs, even if the order projection claims it is", async () => {
    const { order } = await assignedDispatch(driverB, vehicleB);

    // The projection claims our driver has this job. The dispatch says otherwise.
    await prisma.order.update({ where: { id: order.id }, data: { driverId: driverA } });

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
  });

  it("refuses to let them move a dispatch the projection wrongly credits to them", async () => {
    const { dispatch, order } = await assignedDispatch(driverB, vehicleB);
    await prisma.order.update({ where: { id: order.id }, data: { driverId: driverA } });

    await expect(advance(dispatch.id, "EN_ROUTE_TO_PICKUP")).rejects.toThrow(NotFoundException);
  });
});

describe("P3.3.4A — accept / reject gate", () => {
  it("refuses EN_ROUTE until the driver accepts", async () => {
    const { dispatch } = await assignedDispatch();

    await expect(
      driverApp.updateStatus(
        organizationId,
        driverActor.userId,
        dispatch.id,
        { status: "EN_ROUTE_TO_PICKUP" },
        driverActor,
      ),
    ).rejects.toThrow(/Accept the assignment/);
  });

  it("accept unlocks Start Trip and writes an action event + notification", async () => {
    const { dispatch } = await assignedDispatch();

    const accepted = await accept(dispatch.id);
    expect(accepted.driverAcceptanceStatus).toBe("ACCEPTED");
    expect(accepted.allowedTransitions).toEqual(["EN_ROUTE_TO_PICKUP"]);

    expect(recordDriverAction).toHaveBeenCalledWith(
      organizationId,
      driverA,
      "DRIVER_ACCEPTED",
      expect.objectContaining({ dispatchId: dispatch.id }),
    );

    const note = await prisma.notification.findFirst({
      where: { organizationId, type: "DRIVER_ASSIGNMENT_ACCEPTED", entityId: dispatch.id },
    });
    expect(note).toBeTruthy();
  });

  it("reject requires a reason, hides the job from the active list, and notifies", async () => {
    const { dispatch } = await assignedDispatch();

    await expect(
      driverApp.reject(
        organizationId,
        driverActor.userId,
        dispatch.id,
        { reason: "OTHER" } as any,
        driverActor,
      ),
    ).rejects.toThrow(BadRequestException);

    await driverApp.reject(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { reason: "VEHICLE_ISSUE", note: "Flat tire" },
      driverActor,
    );

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
    const row = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(row.driverAcceptanceStatus).toBe("REJECTED");
    expect(row.driverId).toBe(driverA);

    const note = await prisma.notification.findFirst({
      where: { organizationId, type: "DRIVER_ASSIGNMENT_REJECTED", entityId: dispatch.id },
    });
    expect(note).toBeTruthy();
  });
});

describe("P3.3.4A — POD checklist gate + breaks", () => {
  beforeEach(async () => {
    await prisma.organizationDriverSettings.update({
      where: { organizationId },
      data: {
        requirePhotos: true,
        requireSignature: true,
        requireReceiverName: true,
        requireReceiverPhone: false,
        requireNotes: false,
      },
    });
  });

  afterEach(async () => {
    await prisma.organizationDriverSettings.update({
      where: { organizationId },
      data: {
        requirePhotos: false,
        requireSignature: false,
        requireReceiverName: false,
        requireReceiverPhone: false,
        requireNotes: false,
      },
    });
  });

  it("blocks DELIVERED when required POD fields are missing", async () => {
    const { dispatch } = await assignedDispatch();
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY"] as const) {
      await advance(dispatch.id, s);
    }

    await expect(advance(dispatch.id, "DELIVERED")).rejects.toThrow(/checklist incomplete/i);
  });

  it("allows DELIVERED after required proofs + meta are present", async () => {
    const { dispatch } = await assignedDispatch();
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY"] as const) {
      await advance(dispatch.id, s);
    }

    const fakeFile = {
      buffer: Buffer.from("fake-photo"),
      originalname: "pod.jpg",
      mimetype: "image/jpeg",
      size: 10,
    } as Express.Multer.File;

    await workspace.uploadProof(
      organizationId,
      driverActor.userId,
      dispatch.id,
      "PHOTO",
      fakeFile,
    );
    await workspace.uploadProof(
      organizationId,
      driverActor.userId,
      dispatch.id,
      "SIGNATURE",
      { ...fakeFile, originalname: "sig.png" },
    );
    await workspace.updatePodMeta(organizationId, driverActor.userId, dispatch.id, {
      receiverName: "Alex Receiver",
    });

    const done = await advance(dispatch.id, "DELIVERED");
    expect(done.status).toBe("DELIVERED");
  });

  it("start/end break toggles operational status", async () => {
    const started = await workspace.startBreak(organizationId, driverActor.userId);
    expect(started.id).toBeTruthy();

    const me = await workspace.getMe(organizationId, driverActor.userId);
    expect(me.operationalStatus).toBe("BREAK");
    expect(me.onBreak).toBe(true);

    await workspace.endBreak(organizationId, driverActor.userId);
    const after = await workspace.getMe(organizationId, driverActor.userId);
    expect(after.operationalStatus).toBe("AVAILABLE");
    expect(after.onBreak).toBe(false);
  });
});

describe("P3.3.4B — receipt, inspection history, assignment notify", () => {
  it("uploads and replaces an expense receipt", async () => {
    const created = await workspace.createExpense(
      organizationId,
      driverActor.userId,
      {
        category: "TOLL",
        description: "Bridge",
        amount: 12.5,
      },
      driverActor,
    );

    const file = {
      buffer: Buffer.from("%PDF-1.4 receipt"),
      originalname: "toll.pdf",
      mimetype: "application/pdf",
      size: 16,
    } as Express.Multer.File;

    const withReceipt = await workspace.uploadExpenseReceipt(
      organizationId,
      driverActor.userId,
      created.id,
      file,
    );
    expect(withReceipt.hasReceipt).toBe(true);

    const replaced = await workspace.uploadExpenseReceipt(
      organizationId,
      driverActor.userId,
      created.id,
      { ...file, originalname: "toll2.pdf", buffer: Buffer.from("%PDF-1.4 b") },
    );
    expect(replaced.hasReceipt).toBe(true);

    const cleared = await workspace.deleteExpenseReceipt(
      organizationId,
      driverActor.userId,
      created.id,
    );
    expect(cleared.hasReceipt).toBe(false);
  });

  it("stores inspection photos and lists history", async () => {
    const insp = await workspace.createInspection(organizationId, driverActor.userId, {
      vehicleId: vehicleA,
      tyres: true,
      lights: true,
      brakes: true,
      oil: true,
      coolant: true,
      documents: true,
    });

    const photo = {
      buffer: Buffer.from("jpeg-bytes"),
      originalname: "front.jpg",
      mimetype: "image/jpeg",
      size: 10,
    } as Express.Multer.File;

    const withPhoto = await workspace.uploadInspectionPhoto(
      organizationId,
      driverActor.userId,
      insp.id,
      photo,
    );
    expect(withPhoto.photos).toHaveLength(1);

    const list = await workspace.listMyInspections(organizationId, driverActor.userId);
    expect(list.some((r) => r.id === insp.id)).toBe(true);
  });

  it("creates a driver-targeted assignment notification on accept path setup", async () => {
    const { dispatch } = await assignedDispatch();
    await notifyDriverOfAssignment(prisma, {
      organizationId,
      driverId: driverA,
      dispatchId: dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      reason: "assigned",
    });

    const inbox = await workspace.listMyNotifications(organizationId, driverActor.userId);
    expect(inbox.items.some((n) => n.type === "DRIVER_NEW_ASSIGNMENT" && n.entityId === dispatch.id)).toBe(
      true,
    );
  });
});

describe("stop-level fields in the driver response", () => {
  it("includes all pickup and delivery stop fields when present", async () => {
    const order = await prisma.order.create({
      data: {
        organizationId,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        customerId,
        pickupAddress: "1 Depot Rd",
        pickupCity: "Tashkent",
        pickupDate: PICKUP,
        pickupPlaceName: "Main Depot",
        pickupPostalCode: "100001",
        pickupCountryCode: "UZ",
        pickupContactName: "Ali Pickup",
        pickupContactPhone: "+998901111111",
        pickupInstructions: "Ring bell twice",
        pickupWindowStart: new Date("2041-05-01T09:00:00.000Z"),
        pickupWindowEnd: new Date("2041-05-01T12:00:00.000Z"),
        pickupLat: new Prisma.Decimal("41.2995"),
        pickupLng: new Prisma.Decimal("69.2401"),
        deliveryAddress: "9 Dock St",
        deliveryCity: "Samarkand",
        deliveryDate: DELIVERY,
        deliveryPlaceName: "East Warehouse",
        deliveryPostalCode: "140100",
        deliveryCountryCode: "UZ",
        deliveryContactName: "Bobur Delivery",
        deliveryContactPhone: "+998902222222",
        deliveryInstructions: "Leave at gate",
        deliveryWindowStart: new Date("2041-05-03T13:00:00.000Z"),
        deliveryWindowEnd: new Date("2041-05-03T16:00:00.000Z"),
        deliveryLat: new Prisma.Decimal("39.6542"),
        deliveryLng: new Prisma.Decimal("66.9597"),
        cargoDescription: "Pallets",
        price: "1000.00",
        status: "PENDING",
      },
    });
    await orders.assign(organizationId, order.id, { driverId: driverA, vehicleId: vehicleA }, dispatcher);
    const dispatch = await prisma.dispatch.findFirstOrThrow({
      where: { orderId: order.id, status: { not: "CANCELLED" } },
    });

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    expect(mine.order.pickupPlaceName).toBe("Main Depot");
    expect(mine.order.pickupPostalCode).toBe("100001");
    expect(mine.order.pickupCountryCode).toBe("UZ");
    expect(mine.order.pickupContactName).toBe("Ali Pickup");
    expect(mine.order.pickupContactPhone).toBe("+998901111111");
    expect(mine.order.pickupInstructions).toBe("Ring bell twice");
    expect(mine.order.pickupWindowStart).toBe("2041-05-01T09:00:00.000Z");
    expect(mine.order.pickupWindowEnd).toBe("2041-05-01T12:00:00.000Z");
    expect(mine.order.pickupLat).toBe("41.2995");
    expect(mine.order.pickupLng).toBe("69.2401");

    expect(mine.order.deliveryPlaceName).toBe("East Warehouse");
    expect(mine.order.deliveryPostalCode).toBe("140100");
    expect(mine.order.deliveryCountryCode).toBe("UZ");
    expect(mine.order.deliveryContactName).toBe("Bobur Delivery");
    expect(mine.order.deliveryContactPhone).toBe("+998902222222");
    expect(mine.order.deliveryInstructions).toBe("Leave at gate");
    expect(mine.order.deliveryWindowStart).toBe("2041-05-03T13:00:00.000Z");
    expect(mine.order.deliveryWindowEnd).toBe("2041-05-03T16:00:00.000Z");
    expect(mine.order.deliveryLat).toBe("39.6542");
    expect(mine.order.deliveryLng).toBe("66.9597");
  });

  it("returns null for all stop fields when not set — backward-compatible with old orders", async () => {
    const { dispatch } = await assignedDispatch();

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    expect(mine.order.pickupPlaceName).toBeNull();
    expect(mine.order.pickupPostalCode).toBeNull();
    expect(mine.order.pickupCountryCode).toBeNull();
    expect(mine.order.pickupContactName).toBeNull();
    expect(mine.order.pickupContactPhone).toBeNull();
    expect(mine.order.pickupInstructions).toBeNull();
    expect(mine.order.pickupWindowStart).toBeNull();
    expect(mine.order.pickupWindowEnd).toBeNull();
    expect(mine.order.pickupLat).toBeNull();
    expect(mine.order.pickupLng).toBeNull();
    expect(mine.order.deliveryPlaceName).toBeNull();
    expect(mine.order.deliveryContactName).toBeNull();
    expect(mine.order.deliveryInstructions).toBeNull();
    expect(mine.order.deliveryWindowStart).toBeNull();
    expect(mine.order.deliveryLat).toBeNull();
    expect(mine.order.deliveryLng).toBeNull();
  });
});

/// Phase 5C Step 3 — stops[] in the driver API response.
///
/// A: legacy dispatch returns empty stops array.
/// B: new dispatch returns PICKUP + DELIVERY stops.
/// C: stop snapshot fields match the order data.
/// D: AT_PICKUP stamps PICKUP.arrivedAt visible in driver response.
/// E: IN_TRANSIT stamps PICKUP.completedAt visible in driver response.
/// F: ARRIVED_AT_DELIVERY stamps DELIVERY.arrivedAt visible in driver response.
/// G: DELIVERED stamps DELIVERY.completedAt visible in driver response.
/// H: AT_STOP stamps INTERMEDIATE.arrivedAt visible in driver response.
/// I: IN_TRANSIT from AT_STOP stamps INTERMEDIATE.completedAt.
describe("Phase 5C Step 3 — stops[] in driver API response", () => {
  it("A: legacy dispatch (no stop rows) returns stops: []", async () => {
    const { dispatch } = await assignedDispatch();
    // Delete the auto-created stops to simulate a legacy dispatch.
    await prisma.dispatchStop.deleteMany({ where: { dispatchId: dispatch.id } });

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    expect(mine.stops).toEqual([]);
  });

  it("B: new dispatch returns PICKUP at index 0 and DELIVERY at last index", async () => {
    const { dispatch } = await assignedDispatch();

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    expect(mine.stops).toHaveLength(2);
    expect(mine.stops[0].stopType).toBe("PICKUP");
    expect(mine.stops[0].stopIndex).toBe(0);
    expect(mine.stops[1].stopType).toBe("DELIVERY");
    expect(mine.stops[1].stopIndex).toBe(1);
  });

  it("C: stop snapshot fields match the order data at dispatch creation", async () => {
    const { dispatch, order } = await assignedDispatch();

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const pickup = mine.stops.find((s: { stopType: string }) => s.stopType === "PICKUP")!;
    expect(pickup.address).toBe(order.pickupAddress);
    expect(pickup.city).toBe(order.pickupCity);
    const delivery = mine.stops.find((s: { stopType: string }) => s.stopType === "DELIVERY")!;
    expect(delivery.address).toBe(order.deliveryAddress);
    expect(delivery.city).toBe(order.deliveryCity);
  });

  it("D: AT_PICKUP stamps PICKUP.arrivedAt visible in driver response", async () => {
    const { dispatch } = await assignedDispatch();
    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    const before = new Date();
    await advance(dispatch.id, "AT_PICKUP");

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const pickup = mine.stops.find((s: { stopType: string }) => s.stopType === "PICKUP")!;
    expect(pickup.arrivedAt).not.toBeNull();
    expect(new Date(pickup.arrivedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(pickup.completedAt).toBeNull();
  });

  it("E: IN_TRANSIT stamps PICKUP.completedAt visible in driver response", async () => {
    const { dispatch } = await assignedDispatch();
    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    await advance(dispatch.id, "AT_PICKUP");
    const before = new Date();
    await advance(dispatch.id, "IN_TRANSIT");

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const pickup = mine.stops.find((s: { stopType: string }) => s.stopType === "PICKUP")!;
    expect(pickup.arrivedAt).not.toBeNull();
    expect(pickup.completedAt).not.toBeNull();
    expect(new Date(pickup.completedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it("F: ARRIVED_AT_DELIVERY stamps DELIVERY.arrivedAt visible in driver response", async () => {
    const { dispatch } = await assignedDispatch();
    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    await advance(dispatch.id, "AT_PICKUP");
    await advance(dispatch.id, "IN_TRANSIT");
    const before = new Date();
    await advance(dispatch.id, "ARRIVED_AT_DELIVERY");

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const delivery = mine.stops.find((s: { stopType: string }) => s.stopType === "DELIVERY")!;
    expect(delivery.arrivedAt).not.toBeNull();
    expect(new Date(delivery.arrivedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(delivery.completedAt).toBeNull();
  });

  it("G: DELIVERED stamps DELIVERY.completedAt visible in driver response", async () => {
    const { dispatch } = await assignedDispatch();
    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    await advance(dispatch.id, "AT_PICKUP");
    await advance(dispatch.id, "IN_TRANSIT");
    await advance(dispatch.id, "ARRIVED_AT_DELIVERY");
    const before = new Date();
    await advance(dispatch.id, "DELIVERED");

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const delivery = mine.stops.find((s: { stopType: string }) => s.stopType === "DELIVERY")!;
    expect(delivery.arrivedAt).not.toBeNull();
    expect(delivery.completedAt).not.toBeNull();
    expect(new Date(delivery.completedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it("H: AT_STOP stamps INTERMEDIATE.arrivedAt visible in driver response", async () => {
    const { dispatch } = await assignedDispatch();
    // Insert an INTERMEDIATE stop between PICKUP and DELIVERY.
    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { stopIndex: "asc" },
    });
    // Re-index DELIVERY to stopIndex 2 first to free up index 1.
    await prisma.dispatchStop.update({
      where: { id: stops[1].id },
      data: { stopIndex: 2 },
    });
    await prisma.dispatchStop.create({
      data: {
        organizationId,
        dispatchId: dispatch.id,
        stopIndex: 1,
        stopType: "INTERMEDIATE",
        address: "5 Transit Ave",
        city: "Bukhara",
      },
    });

    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    await advance(dispatch.id, "AT_PICKUP");
    await advance(dispatch.id, "IN_TRANSIT");
    const before = new Date();
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const intermediate = mine.stops.find((s: { stopType: string }) => s.stopType === "INTERMEDIATE")!;
    expect(intermediate.arrivedAt).not.toBeNull();
    expect(new Date(intermediate.arrivedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(intermediate.completedAt).toBeNull();
  });

  it("I: IN_TRANSIT from AT_STOP stamps INTERMEDIATE.completedAt visible in driver response", async () => {
    const { dispatch } = await assignedDispatch();
    const stops = await prisma.dispatchStop.findMany({
      where: { dispatchId: dispatch.id },
      orderBy: { stopIndex: "asc" },
    });
    await prisma.dispatchStop.update({
      where: { id: stops[1].id },
      data: { stopIndex: 2 },
    });
    await prisma.dispatchStop.create({
      data: {
        organizationId,
        dispatchId: dispatch.id,
        stopIndex: 1,
        stopType: "INTERMEDIATE",
        address: "5 Transit Ave",
        city: "Bukhara",
      },
    });

    await advance(dispatch.id, "EN_ROUTE_TO_PICKUP");
    await advance(dispatch.id, "AT_PICKUP");
    await advance(dispatch.id, "IN_TRANSIT");
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);
    const before = new Date();
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);

    const intermediate = mine.stops.find((s: { stopType: string }) => s.stopType === "INTERMEDIATE")!;
    expect(intermediate.arrivedAt).not.toBeNull();
    expect(intermediate.completedAt).not.toBeNull();
    expect(new Date(intermediate.completedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });
});

// ---------------------------------------------------------------------------
// P5D-3-A — Full multi-stop driver workflow (production path)
// ---------------------------------------------------------------------------

async function makeOrderWithStops(stopCount: number) {
  const order = await makeOrder();
  for (let i = 1; i <= stopCount; i++) {
    await prisma.orderStop.create({
      data: {
        organizationId,
        orderId: order.id,
        stopIndex: i,
        address: `${i} Intermediate Rd`,
        city: `City${i}`,
      },
    });
  }
  return order;
}

async function assignedDispatchWithStops(stopCount: number) {
  const order = await makeOrderWithStops(stopCount);
  await orders.assign(organizationId, order.id, { driverId: driverA, vehicleId: vehicleA }, dispatcher);
  const dispatch = await prisma.dispatch.findFirstOrThrow({
    where: { orderId: order.id, status: { not: "CANCELLED" } },
  });
  return { order, dispatch };
}

describe("P5D-3-A — multi-stop full driver workflow via production path", () => {
  it("creates PICKUP + 3 INTERMEDIATE + DELIVERY stops when order has 3 OrderStop rows", async () => {
    const { dispatch } = await assignedDispatchWithStops(3);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    const pickup = mine.stops.filter((s: { stopType: string }) => s.stopType === "PICKUP");
    const intermediate = mine.stops.filter((s: { stopType: string }) => s.stopType === "INTERMEDIATE");
    const delivery = mine.stops.filter((s: { stopType: string }) => s.stopType === "DELIVERY");

    expect(pickup).toHaveLength(1);
    expect(intermediate).toHaveLength(3);
    expect(delivery).toHaveLength(1);
    expect(mine.stops).toHaveLength(5);
  });

  it("stamps only the first intermediate stop on AT_STOP", async () => {
    const { dispatch } = await assignedDispatchWithStops(3);

    await accept(dispatch.id);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    const stops = mine.stops.filter((s: { stopType: string }) => s.stopType === "INTERMEDIATE");

    expect(stops[0].arrivedAt).not.toBeNull();
    expect(stops[1].arrivedAt).toBeNull();
    expect(stops[2].arrivedAt).toBeNull();
  });

  it("walks through all 3 intermediate stops sequentially and reaches ARRIVED_AT_DELIVERY", async () => {
    const { dispatch } = await assignedDispatchWithStops(3);

    await accept(dispatch.id);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_PICKUP" }, driverActor);

    for (let i = 0; i < 3; i++) {
      await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);
      await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);
    }

    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "ARRIVED_AT_DELIVERY" }, driverActor);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    expect(mine.status).toBe("ARRIVED_AT_DELIVERY");

    const intermediateStops = mine.stops.filter((s: { stopType: string }) => s.stopType === "INTERMEDIATE");
    for (const s of intermediateStops) {
      expect(s.arrivedAt).not.toBeNull();
      expect(s.completedAt).not.toBeNull();
    }
  });

  it("stopIndex values in driver response are ordered 0, 1, 2, 3, 4 for 3 intermediate stops", async () => {
    const { dispatch } = await assignedDispatchWithStops(3);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    const indexes = mine.stops.map((s: { stopIndex: number }) => s.stopIndex);

    expect(indexes).toEqual([0, 1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// P5D-3-B — operationalStatus transitions for AT_STOP
// ---------------------------------------------------------------------------

describe("P5D-3-B — operationalStatus changes with AT_STOP", () => {
  it("sets operationalStatus to LOADING when driver transitions to AT_STOP", async () => {
    const { dispatch } = await assignedDispatchWithStops(1);

    await accept(dispatch.id);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);

    const driver = await prisma.driver.findFirstOrThrow({ where: { id: driverA } });
    expect(driver.operationalStatus).toBe("LOADING");
  });

  it("sets operationalStatus back to DRIVING when driver transitions from AT_STOP to IN_TRANSIT", async () => {
    const { dispatch } = await assignedDispatchWithStops(1);

    await accept(dispatch.id);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);

    const driver = await prisma.driver.findFirstOrThrow({ where: { id: driverA } });
    expect(driver.operationalStatus).toBe("DRIVING");
  });
});

// ---------------------------------------------------------------------------
// P5D-3-C — failed stop fields visible in driver API
// ---------------------------------------------------------------------------

describe("P5D-3-C — failed intermediate stop fields are visible in driver API", () => {
  it("exposes failedAt, failureReason, and failureNotes on a failed intermediate stop", async () => {
    const { dispatch } = await assignedDispatchWithStops(1);

    const dispatchStop = await prisma.dispatchStop.findFirstOrThrow({
      where: { dispatchId: dispatch.id, stopType: "INTERMEDIATE" },
    });

    const failedAt = new Date("2026-06-01T10:00:00.000Z");
    await prisma.dispatchStop.update({
      where: { id: dispatchStop.id },
      data: {
        failedAt,
        failureReason: "ACCESS_DENIED",
        failureNotes: "Gate was locked — could not reach dock",
      },
    });

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    const intermediate = mine.stops.find((s: { stopType: string }) => s.stopType === "INTERMEDIATE")!;

    expect(intermediate.failedAt).toBe(failedAt.toISOString());
    expect(intermediate.failureReason).toBe("ACCESS_DENIED");
    expect(intermediate.failureNotes).toBe("Gate was locked — could not reach dock");
  });

  it("returns null for failedAt, failureReason, failureNotes on a non-failed stop", async () => {
    const { dispatch } = await assignedDispatchWithStops(1);

    const mine = await driverApp.getMine(organizationId, driverActor.userId, dispatch.id);
    const intermediate = mine.stops.find((s: { stopType: string }) => s.stopType === "INTERMEDIATE")!;

    expect(intermediate.failedAt).toBeNull();
    expect(intermediate.failureReason).toBeNull();
    expect(intermediate.failureNotes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 5E-1 regression — listMine() must include AT_STOP
//
// P1 bug: listMine() used a hardcoded status list that was missing AT_STOP.
// When a driver transitioned IN_TRANSIT → AT_STOP the dispatch disappeared
// from their active job list. Fix: use DRIVER_DISPATCH_STATUSES constant.
// ---------------------------------------------------------------------------

describe("Phase 5E-1 regression — listMine() includes AT_STOP", () => {
  it("dispatch stays visible in listMine() after IN_TRANSIT → AT_STOP", async () => {
    const { dispatch } = await assignedDispatchWithStops(1);

    await accept(dispatch.id);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "EN_ROUTE_TO_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_PICKUP" }, driverActor);
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "IN_TRANSIT" }, driverActor);

    // Baseline: visible while IN_TRANSIT.
    expect(await driverApp.listMine(organizationId, driverActor.userId)).toHaveLength(1);

    // The P1 bug: this transition made the dispatch disappear.
    await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "AT_STOP" }, driverActor);

    const result = await driverApp.listMine(organizationId, driverActor.userId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(dispatch.id);
    expect(result[0].status).toBe("AT_STOP");

    // The intermediate stop's arrivedAt must be visible (stop info not lost).
    const intermediate = result[0].stops?.find(
      (s: { stopType: string }) => s.stopType === "INTERMEDIATE",
    );
    expect(intermediate).toBeDefined();
    expect(intermediate?.arrivedAt).not.toBeNull();
  });

  it("DELIVERED and CANCELLED dispatches do not appear in the active list", async () => {
    // DELIVERED
    const { dispatch: delivered } = await assignedDispatch();
    await accept(delivered.id);
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"] as const) {
      await advance(delivered.id, s);
    }

    // CANCELLED — set directly via Prisma (dispatcher cancel path)
    const { dispatch: cancelled } = await assignedDispatch();
    await prisma.dispatch.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });

    expect(await driverApp.listMine(organizationId, driverActor.userId)).toEqual([]);
  });
});
