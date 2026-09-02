import { randomUUID } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { DeliveryFailureReason } from "@prisma/client";
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

/// Phase 3 — Failed Delivery & Exception Handling E2E tests.
///
/// Drives the REAL PrismaService and service layer end-to-end (no HTTP server).
/// Proves that reportFailure() transitions the dispatch, appends a DeliveryAttempt,
/// projects the order back to PENDING, and enforces all business rules.

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

const PICKUP = new Date("2041-07-01T08:00:00.000Z");
const DELIVERY = new Date("2041-07-05T18:00:00.000Z");

let organizationId: string;
let orgB: string; // isolation org
let customerId: string;
let dispatcher: CurrentUserPayload;
let driverActor: CurrentUserPayload;
let driverIdA: string;
let vehicleIdA: string;
const userIds: string[] = [];

async function makeOrder(orgId = organizationId, custId = customerId) {
  return prisma.order.create({
    data: {
      organizationId: orgId,
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId: custId,
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

/// Creates an ASSIGNED dispatch.
async function assignedDispatch(driverId = driverIdA, vehicleId = vehicleIdA) {
  const order = await makeOrder();
  await orders.assign(organizationId, order.id, { driverId, vehicleId }, dispatcher);
  const dispatch = await prisma.dispatch.findFirstOrThrow({
    where: { orderId: order.id, status: { not: "CANCELLED" } },
  });
  return { order, dispatch };
}

/// Advance a dispatch all the way to ARRIVED_AT_DELIVERY.
async function arrivedDispatch(driverId = driverIdA, vehicleId = vehicleIdA) {
  const { order, dispatch } = await assignedDispatch(driverId, vehicleId);
  const id = dispatch.id;
  await driverApp.accept(organizationId, driverActor.userId, id, driverActor);
  for (const status of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "AT_STOP", "ARRIVED_AT_DELIVERY"] as const) {
    await driverApp.updateStatus(organizationId, driverActor.userId, id, { status }, driverActor);
  }
  return { order, dispatch: await prisma.dispatch.findUniqueOrThrow({ where: { id } }) };
}

const failureDto = (reason: DeliveryFailureReason, notes?: string) => ({
  reason,
  notes,
  lat: undefined,
  lng: undefined,
});

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Failure Org", slug: `failure-${randomUUID()}` },
  });
  organizationId = org.id;

  const orgBRow = await prisma.organization.create({
    data: { name: "Other Org", slug: `other-${randomUUID()}` },
  });
  orgB = orgBRow.id;

  const makeUser = async (role: "DISPATCHER" | "DRIVER", orgId = organizationId) => {
    const user = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${randomUUID()}@failure.test`,
        firstName: role === "DRIVER" ? "Dan" : "Dee",
        lastName: role === "DRIVER" ? "Driver" : "Dispatcher",
        passwordHash: "not-a-real-hash",
      },
    });
    userIds.push(user.id);
    const membership = await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, role },
    });
    return {
      userId: user.id,
      membershipId: membership.id,
      organizationId: orgId,
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
      companyName: "Failure Co",
      contactName: "Cara Customer",
      phone: "+998 71 000 00 00",
    },
  });
  customerId = customer.id;

  const driverRow = await prisma.driver.create({
    data: {
      organizationId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Dan",
      lastName: "Driver",
      phone: "+998 90 111 11 11",
      userId: driverActor.userId,
    },
  });
  const vehicleRow = await prisma.vehicle.create({
    data: {
      organizationId,
      vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
      plateNumber: `01 ${randomUUID().slice(0, 5)}`,
      type: "Truck",
    },
  });
  driverIdA = driverRow.id;
  vehicleIdA = vehicleRow.id;

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
  await prisma.deliveryAttempt.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.dispatch.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } });
  auditLog.mockClear();
  recordDriverAction.mockClear();
  (wfEvents.emit as jest.Mock).mockClear();
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

// ─── Core transition ─────────────────────────────────────────────────────────

describe("reportFailure — core transition", () => {
  it("transitions dispatch to DELIVERY_FAILED from ARRIVED_AT_DELIVERY", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor);
    const row = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(row.status).toBe("DELIVERY_FAILED");
  });

  it("stamps failureReason, failureNotes, failedAt on the dispatch", async () => {
    const { dispatch } = await arrivedDispatch();
    const before = new Date();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("WRONG_ADDRESS", "gate was locked"), driverActor);
    const row = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(row.failureReason).toBe("WRONG_ADDRESS");
    expect(row.failureNotes).toBe("gate was locked");
    expect(row.failedAt).toBeDefined();
    expect(row.failedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("projects order back to PENDING when failure is the only dispatch", async () => {
    const { order, dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("ACCESS_PROBLEM"), driverActor);
    const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderRow.status).toBe("PENDING");
    expect(orderRow.driverId).toBeNull();
  });

  it("returns driver to AVAILABLE after failure", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("VEHICLE_PROBLEM"), driverActor);
    const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverIdA } });
    expect(driver.operationalStatus).toBe("AVAILABLE");
  });
});

// ─── DeliveryAttempt record ───────────────────────────────────────────────────

describe("DeliveryAttempt — append-only record", () => {
  it("creates a DeliveryAttempt row with correct fields", async () => {
    const { order, dispatch } = await arrivedDispatch();
    const before = new Date();
    await driverApp.reportFailure(
      organizationId,
      driverActor.userId,
      dispatch.id,
      { reason: "CUSTOMER_REFUSED", notes: "refused to sign", lat: 41.2995, lng: 69.2401 },
      driverActor,
    );
    const attempts = await prisma.deliveryAttempt.findMany({ where: { dispatchId: dispatch.id } });
    expect(attempts).toHaveLength(1);
    const a = attempts[0];
    expect(a.failureReason).toBe("CUSTOMER_REFUSED");
    expect(a.notes).toBe("refused to sign");
    expect(Number(a.lat)).toBeCloseTo(41.2995, 4);
    expect(Number(a.lng)).toBeCloseTo(69.2401, 4);
    expect(a.orderId).toBe(order.id);
    expect(a.driverId).toBe(driverIdA);
    expect(a.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("each failure reason creates its own DeliveryAttempt (all 7 reasons accepted)", async () => {
    const reasons: DeliveryFailureReason[] = [
      "CUSTOMER_UNAVAILABLE",
      "CUSTOMER_REFUSED",
      "WRONG_ADDRESS",
      "ACCESS_PROBLEM",
      "DAMAGED_CARGO",
      "VEHICLE_PROBLEM",
      "OTHER",
    ];
    // Each reason requires a fresh dispatch (state machine prevents re-use).
    for (const reason of reasons) {
      const { dispatch } = await arrivedDispatch();
      const notes = reason === "OTHER" ? "some note" : undefined;
      await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto(reason, notes), driverActor);
      const attempt = await prisma.deliveryAttempt.findFirstOrThrow({ where: { dispatchId: dispatch.id } });
      expect(attempt.failureReason).toBe(reason);
      // Clean up for the loop so afterEach doesn't double-delete.
      await prisma.deliveryAttempt.deleteMany({ where: { dispatchId: dispatch.id } });
      await prisma.notification.deleteMany({ where: { organizationId } });
      await prisma.dispatch.deleteMany({ where: { id: dispatch.id } });
    }
  });
});

// ─── Validation guards ────────────────────────────────────────────────────────

describe("reportFailure — validation guards", () => {
  it("rejects failure from any status other than ARRIVED_AT_DELIVERY", async () => {
    for (const status of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const) {
      const { dispatch } = await assignedDispatch();
      await driverApp.accept(organizationId, driverActor.userId, dispatch.id, driverActor);
      // Advance to the target status.
      const chain = ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const;
      for (const s of chain) {
        await driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: s }, driverActor);
        if (s === status) break;
      }
      await expect(
        driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Clean up for next iteration.
      await prisma.dispatch.deleteMany({ where: { id: dispatch.id } });
      await prisma.order.deleteMany({ where: { id: (await prisma.dispatch.findMany({ where: { id: dispatch.id } })).map((d) => d.orderId)[0] ?? "none" } });
    }
  });

  it("requires notes when reason is OTHER", async () => {
    const { dispatch } = await arrivedDispatch();
    await expect(
      driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("OTHER", ""), driverActor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("OTHER", "   "), driverActor),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Does not throw when a real note is provided.
    await expect(
      driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("OTHER", "customer moved"), driverActor),
    ).resolves.toBeDefined();
  });

  it("does NOT transition to DELIVERED — dispatch ends at DELIVERY_FAILED", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("DAMAGED_CARGO"), driverActor);
    const row = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(row.status).toBe("DELIVERY_FAILED");
    expect(row.status).not.toBe("DELIVERED");
  });

  it("DELIVERY_FAILED is terminal — no further transitions allowed from driver", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor);
    // Attempt to advance from DELIVERY_FAILED via updateStatus must fail.
    await expect(
      driverApp.updateStatus(organizationId, driverActor.userId, dispatch.id, { status: "DELIVERED" }, driverActor),
    ).rejects.toBeDefined();
  });

  it("POD requirement is bypassed only by failure path — successful delivery still requires POD when checklist is on", async () => {
    // Create an org with POD required.
    const podOrg = await prisma.organization.create({
      data: { name: "POD Org", slug: `pod-${randomUUID()}` },
    });
    try {
      await prisma.organizationDriverSettings.create({
        data: {
          organizationId: podOrg.id,
          requirePhotos: true,
          requireSignature: false,
          requireReceiverName: false,
          requireReceiverPhone: false,
          requireNotes: false,
        },
      });
      const podCust = await prisma.customer.create({
        data: {
          organizationId: podOrg.id,
          customerCode: `CUS-${randomUUID().slice(0, 8)}`,
          companyName: "POD Co",
          contactName: "Pete POD",
          phone: "+998 71 000 00 01",
        },
      });
      const podUser = await prisma.user.create({
        data: {
          email: `disp-${randomUUID()}@pod.test`,
          firstName: "PD",
          lastName: "Disp",
          passwordHash: "x",
        },
      });
      userIds.push(podUser.id);
      const podMem = await prisma.membership.create({
        data: { organizationId: podOrg.id, userId: podUser.id, role: "DISPATCHER" },
      });
      const podDispatcher: CurrentUserPayload = {
        userId: podUser.id,
        membershipId: podMem.id,
        organizationId: podOrg.id,
        role: "DISPATCHER",
        email: podUser.email,
        isPlatformAdmin: false,
      };
      const podDriverUser = await prisma.user.create({
        data: {
          email: `driver-${randomUUID()}@pod.test`,
          firstName: "PD",
          lastName: "Driver",
          passwordHash: "x",
        },
      });
      userIds.push(podDriverUser.id);
      const podDriverMem = await prisma.membership.create({
        data: { organizationId: podOrg.id, userId: podDriverUser.id, role: "DRIVER" },
      });
      const podDriverActor: CurrentUserPayload = {
        userId: podDriverUser.id,
        membershipId: podDriverMem.id,
        organizationId: podOrg.id,
        role: "DRIVER",
        email: podDriverUser.email,
        isPlatformAdmin: false,
      };
      const podDriver = await prisma.driver.create({
        data: {
          organizationId: podOrg.id,
          employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
          firstName: "PD",
          lastName: "Driver",
          phone: "+998 90 999 99 99",
          userId: podDriverUser.id,
        },
      });
      const podVehicle = await prisma.vehicle.create({
        data: {
          organizationId: podOrg.id,
          vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
          plateNumber: `02 ${randomUUID().slice(0, 5)}`,
          type: "Van",
        },
      });
      const podOrder = await prisma.order.create({
        data: {
          organizationId: podOrg.id,
          orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
          customerId: podCust.id,
          pickupAddress: "1 Rd",
          pickupCity: "City",
          pickupDate: PICKUP,
          deliveryAddress: "2 St",
          deliveryCity: "Town",
          deliveryDate: DELIVERY,
          cargoDescription: "Box",
          price: "500.00",
          status: "PENDING",
        },
      });
      const podOrdersService = new OrdersService(prisma, audit, writer, dispatches, policy, wfEvents, usageMetering, geocoding);
      await podOrdersService.assign(podOrg.id, podOrder.id, { driverId: podDriver.id, vehicleId: podVehicle.id }, podDispatcher);
      const podDispatch = await prisma.dispatch.findFirstOrThrow({ where: { orderId: podOrder.id, status: { not: "CANCELLED" } } });
      await driverApp.accept(podOrg.id, podDriverUser.id, podDispatch.id, podDriverActor);
      for (const s of ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY"] as const) {
        await driverApp.updateStatus(podOrg.id, podDriverUser.id, podDispatch.id, { status: s }, podDriverActor);
      }
      // Attempt to deliver without POD — must reject (POD required).
      await expect(
        driverApp.updateStatus(podOrg.id, podDriverUser.id, podDispatch.id, { status: "DELIVERED" }, podDriverActor),
      ).rejects.toBeDefined();
      // Failure path must succeed even when POD is required.
      await expect(
        driverApp.reportFailure(podOrg.id, podDriverUser.id, podDispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), podDriverActor),
      ).resolves.toBeDefined();
    } finally {
      await prisma.deliveryAttempt.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.notification.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.dispatch.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.order.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.customer.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.driver.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.vehicle.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.organizationDriverSettings.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.membership.deleteMany({ where: { organizationId: podOrg.id } });
      await prisma.organization.deleteMany({ where: { id: podOrg.id } });
    }
  });
});

// ─── Order re-dispatch readiness ──────────────────────────────────────────────

describe("order returns to PENDING and can be re-dispatched", () => {
  it("allows a new dispatch to be created for the same order after failure", async () => {
    const { order, dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("WRONG_ADDRESS"), driverActor);

    // Order is PENDING again — new dispatch must succeed.
    const newDispatch = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverIdA, vehicleId: vehicleIdA },
      dispatcher,
    );
    expect(newDispatch.id).not.toBe(dispatch.id);
    expect(newDispatch.status).toBe("DRAFT");
  });

  it("dispatches_one_live_per_order index allows re-dispatch: DELIVERY_FAILED and DRAFT coexist for the same order", async () => {
    // This is a regression test for the database constraint fix in migration
    // 20260819200001_add_delivery_attempt_model. Before that migration the index
    // only excluded CANCELLED and DELIVERED, so the INSERT for a second dispatch
    // would fail with a unique constraint violation even though the service-level
    // pre-check at createInTx correctly treated DELIVERY_FAILED as non-blocking.
    const { order, dispatch: failedDispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, failedDispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor);

    const newDispatch = await dispatches.create(
      organizationId,
      { orderId: order.id, driverId: driverIdA, vehicleId: vehicleIdA },
      dispatcher,
    );

    // Both dispatch rows must exist for the same order.
    const all = await prisma.dispatch.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(all).toHaveLength(2);

    const failed = all.find((d) => d.id === failedDispatch.id)!;
    expect(failed.status).toBe("DELIVERY_FAILED");

    const reDispatched = all.find((d) => d.id === newDispatch.id)!;
    expect(reDispatched.status).toBe("DRAFT");
    expect(reDispatched.orderId).toBe(order.id);
  });
});

// ─── Notifications ────────────────────────────────────────────────────────────

describe("dispatcher notifications", () => {
  it("creates a DISPATCH_DELIVERY_FAILED notification", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor);
    const notif = await prisma.notification.findFirst({
      where: { organizationId, type: "DISPATCH_DELIVERY_FAILED", entityId: dispatch.id },
    });
    expect(notif).not.toBeNull();
    expect(notif!.severity).toBe("HIGH");
  });

  it("does not create a duplicate notification if one already exists (idempotent)", async () => {
    const { dispatch } = await arrivedDispatch();
    // Pre-create the notification to simulate a prior call.
    await prisma.notification.create({
      data: {
        organizationId,
        type: "DISPATCH_DELIVERY_FAILED",
        category: "OPERATIONS",
        severity: "HIGH",
        title: "Delivery failed",
        message: "pre-existing",
        entityType: "Dispatch",
        entityId: dispatch.id,
      },
    });
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor);
    const notifs = await prisma.notification.findMany({
      where: { organizationId, type: "DISPATCH_DELIVERY_FAILED", entityId: dispatch.id },
    });
    // Only one notification must exist.
    expect(notifs).toHaveLength(1);
  });
});

// ─── Driver action events ─────────────────────────────────────────────────────

describe("driver action events", () => {
  it("records a DELIVERY_FAILED driver action event", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("ACCESS_PROBLEM"), driverActor);
    expect(recordDriverAction).toHaveBeenCalledWith(
      organizationId,
      driverIdA,
      "DELIVERY_FAILED",
      expect.objectContaining({ dispatchId: dispatch.id }),
    );
  });
});

// ─── Audit log ───────────────────────────────────────────────────────────────

describe("audit log", () => {
  it("writes a dispatch.delivery_failed audit entry", async () => {
    const { dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("DAMAGED_CARGO", "box crushed"), driverActor);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "dispatch.delivery_failed",
        entityType: "Dispatch",
        entityId: dispatch.id,
        metadata: expect.objectContaining({ reason: "DAMAGED_CARGO", notes: "box crushed" }),
      }),
    );
  });
});

// ─── Workflow events ──────────────────────────────────────────────────────────

describe("workflow events", () => {
  it("emits dispatch.failed workflow event with payload", async () => {
    const { order, dispatch } = await arrivedDispatch();
    await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("VEHICLE_PROBLEM", "flat tire"), driverActor);
    expect(wfEvents.emit).toHaveBeenCalledWith(
      organizationId,
      "dispatch.failed",
      expect.objectContaining({
        id: dispatch.id,
        orderId: order.id,
        reason: "VEHICLE_PROBLEM",
        notes: "flat tire",
      }),
    );
  });
});

// ─── Authorization ────────────────────────────────────────────────────────────

describe("authorization", () => {
  it("rejects a driver attempting to report failure for another driver's dispatch", async () => {
    // Create a second driver user not linked to the dispatch.
    const otherUser = await prisma.user.create({
      data: {
        email: `other-${randomUUID()}@failure.test`,
        firstName: "Other",
        lastName: "Driver",
        passwordHash: "x",
      },
    });
    userIds.push(otherUser.id);
    const otherMem = await prisma.membership.create({
      data: { organizationId, userId: otherUser.id, role: "DRIVER" },
    });
    const otherActor: CurrentUserPayload = {
      userId: otherUser.id,
      membershipId: otherMem.id,
      organizationId,
      role: "DRIVER",
      email: otherUser.email,
      isPlatformAdmin: false,
    };
    const { dispatch } = await arrivedDispatch();
    await expect(
      driverApp.reportFailure(organizationId, otherUser.id, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), otherActor),
    ).rejects.toBeDefined();
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe("response shape", () => {
  it("returns the updated dispatch with failureReason, failureNotes, failedAt", async () => {
    const { dispatch } = await arrivedDispatch();
    const result = await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_REFUSED", "refused"), driverActor);
    expect(result).toMatchObject({
      id: dispatch.id,
      status: "DELIVERY_FAILED",
      failureReason: "CUSTOMER_REFUSED",
      failureNotes: "refused",
      failedAt: expect.any(String),
    });
  });

  it("allowedTransitions is empty on a DELIVERY_FAILED dispatch", async () => {
    const { dispatch } = await arrivedDispatch();
    const result = await driverApp.reportFailure(organizationId, driverActor.userId, dispatch.id, failureDto("CUSTOMER_UNAVAILABLE"), driverActor);
    expect(result.allowedTransitions).toEqual([]);
  });
});
