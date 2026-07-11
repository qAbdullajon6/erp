import { randomUUID } from "crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { DriverDispatchService } from "../src/dispatch/driver/driver-dispatch.service";
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
const dispatches = new DispatchesService(prisma, audit, policy, writer);
const orders = new OrdersService(prisma, audit, writer, dispatches, policy);
const driverApp = new DriverDispatchService(prisma, dispatches, writer, audit);

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

const advance = (id: string, status: "EN_ROUTE_TO_PICKUP" | "AT_PICKUP" | "IN_TRANSIT" | "DELIVERED") =>
  driverApp.updateStatus(organizationId, driverActor.userId, id, { status }, driverActor);

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
});

afterEach(async () => {
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  auditLog.mockClear();
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
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED"] as const) {
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
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED"] as const) {
      await advance(dispatch.id, s);
    }

    const row = await orderRow(order.id);
    const finished = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });

    expect(row.status).toBe("DELIVERED");
    expect(row.deliveredAt).toEqual(finished.deliveryDateActual);
  });

  it("the order records every state it passed through", async () => {
    const { dispatch, order } = await assignedDispatch();
    for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED"] as const) {
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
