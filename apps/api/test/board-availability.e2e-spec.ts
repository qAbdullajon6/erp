import { randomUUID } from "crypto";
import { AuditService } from "../src/audit/audit.service";
import type { CurrentUserPayload } from "../src/auth/interfaces/current-user.interface";
import { AssignmentPolicy } from "../src/dispatch/assignment/assignment.policy";
import { AssignmentQueries } from "../src/dispatch/assignment/assignment.queries";
import { DispatchService } from "../src/dispatch/dispatch.service";
import { DispatchesService } from "../src/dispatch/dispatches.service";
import { OrderWriter } from "../src/order-state/order-writer";
import { OrdersService } from "../src/orders/orders.service";
import { PrismaService } from "../src/prisma/prisma.service";

/// Task 8.8 — the board and the availability endpoint are the SAME question.
///
/// Satisfies AR4: no endpoint computes availability itself. Both read
/// AssignmentQueries, which is the same code AssignmentPolicy consults before
/// accepting an assignment — so "what the board shows", "what the dialog offers"
/// and "what the API accepts" cannot drift apart. These tests hold them together.

const prisma = new PrismaService();
const queries = new AssignmentQueries(prisma);
const policy = new AssignmentPolicy(prisma, queries);
const writer = new OrderWriter();
const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const wfEvents = { emit: () => {} } as any;
const dispatches = new DispatchesService(prisma, audit, policy, writer, wfEvents);
const orders = new OrdersService(prisma, audit, writer, dispatches, policy, wfEvents);
const board = new DispatchService(prisma, queries);

const PICKUP = new Date("2037-03-01T08:00:00.000Z");
const DELIVERY = new Date("2037-03-03T18:00:00.000Z");
const WINDOW = { pickupDate: PICKUP.toISOString(), deliveryDate: DELIVERY.toISOString() };

let organizationId: string;
let customerId: string;
let actor: CurrentUserPayload;
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

const assign = (orderId: string, driverId: string, vehicleId: string) =>
  orders.assign(organizationId, orderId, { driverId, vehicleId }, actor);

const liveDispatch = (orderId: string) =>
  prisma.dispatch.findFirstOrThrow({ where: { orderId, status: { notIn: ["CANCELLED"] } } });

/// The two canonical reads, as the frontend sees them.
const freeDrivers = async () =>
  (await board.availability(organizationId, WINDOW)).drivers.map((d) => d.id);
const freeVehicles = async () =>
  (await board.availability(organizationId, WINDOW)).vehicles.map((v) => v.id);
const boardBusyDrivers = async () =>
  (await board.board(organizationId)).drivers.busy.map((b) => b.driver.id);
const boardAvailableDrivers = async () =>
  (await board.board(organizationId)).drivers.available.map((d) => d.id);

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Board Org", slug: `board-${randomUUID()}` },
  });
  organizationId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `board-${randomUUID()}@example.test`,
      firstName: "Bo",
      lastName: "Board",
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
      companyName: "Board Co",
      contactName: "Bea Board",
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

  const [a, b, va, vb] = await Promise.all([mkDriver(), mkDriver(), mkVehicle(), mkVehicle()]);
  driverA = a.id;
  driverB = b.id;
  vehicleA = va.id;
  vehicleB = vb.id;
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

describe("availability and the board move together", () => {
  it("assignment removes the driver from availability and puts them on the board's busy column", async () => {
    const order = await makeOrder();
    expect(await freeDrivers()).toContain(driverA);
    expect(await boardAvailableDrivers()).toContain(driverA);

    await assign(order.id, driverA, vehicleA);

    expect(await freeDrivers()).not.toContain(driverA);
    expect(await boardBusyDrivers()).toContain(driverA);
    expect(await boardAvailableDrivers()).not.toContain(driverA);
  });

  it("reassignment is reflected IMMEDIATELY in both, with no stale entry left behind", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    await dispatches.update(organizationId, dispatch.id, { driverId: driverB, vehicleId: vehicleB }, actor);

    // The old pair is free again...
    expect(await freeDrivers()).toContain(driverA);
    expect(await freeVehicles()).toContain(vehicleA);
    expect(await boardAvailableDrivers()).toContain(driverA);

    // ...and the new pair is not.
    expect(await freeDrivers()).not.toContain(driverB);
    expect(await freeVehicles()).not.toContain(vehicleB);
    expect(await boardBusyDrivers()).toContain(driverB);
  });

  it("the board names the trip the busy driver is actually on, after a reassignment", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);
    await dispatches.update(organizationId, dispatch.id, { driverId: driverB }, actor);

    const busy = (await board.board(organizationId)).drivers.busy.find((b) => b.driver.id === driverB);
    expect(busy?.currentOrder.orderNumber).toBe(order.orderNumber);
  });

  it("a CANCELLED dispatch releases the driver and the vehicle (R8)", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    const dispatch = await liveDispatch(order.id);

    await dispatches.cancel(organizationId, dispatch.id, actor);

    expect(await freeDrivers()).toContain(driverA);
    expect(await freeVehicles()).toContain(vehicleA);
    expect(await boardAvailableDrivers()).toContain(driverA);
  });

  it("a COMPLETED dispatch releases the driver and the vehicle (R7)", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);
    for (const status of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED"] as const) {
      const dispatch = await liveDispatch(order.id);
      await dispatches.updateStatus(organizationId, dispatch.id, { status }, actor);
    }

    // The job is done: DELIVERED is not a reserving status (R1).
    expect(await freeDrivers()).toContain(driverA);
    expect(await freeVehicles()).toContain(vehicleA);
    expect(await boardAvailableDrivers()).toContain(driverA);
  });

  it("an in-flight dispatch keeps holding them at every intermediate step", async () => {
    const order = await makeOrder();
    await assign(order.id, driverA, vehicleA);

    for (const status of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const) {
      const dispatch = await liveDispatch(order.id);
      await dispatches.updateStatus(organizationId, dispatch.id, { status }, actor);

      expect(await freeDrivers()).not.toContain(driverA);
      expect(await boardBusyDrivers()).toContain(driverA);
    }
  });
});

describe("AR4 — what availability offers is exactly what the policy accepts", () => {
  it("every driver availability offers can actually be assigned", async () => {
    const held = await makeOrder();
    await assign(held.id, driverA, vehicleA);

    const target = await makeOrder();
    const offeredDrivers = await freeDrivers();
    const offeredVehicles = await freeVehicles();

    // The invariant the assignment dialog depends on: the UI must never present a
    // resource the API is about to reject.
    for (const driverId of offeredDrivers) {
      for (const vehicleId of offeredVehicles) {
        await expect(
          policy.assertAssignable({
            organizationId,
            driverId,
            vehicleId,
            window: { pickupDate: PICKUP, deliveryDate: DELIVERY },
            exclude: { orderId: target.id },
          }),
        ).resolves.toBeDefined();
      }
    }
    expect(offeredDrivers.length).toBeGreaterThan(0);
  });

  it("and nothing it withholds can be", async () => {
    const held = await makeOrder();
    await assign(held.id, driverA, vehicleA);

    expect(await freeDrivers()).not.toContain(driverA);

    const target = await makeOrder();
    await expect(assign(target.id, driverA, vehicleB)).rejects.toThrow();
  });
});
