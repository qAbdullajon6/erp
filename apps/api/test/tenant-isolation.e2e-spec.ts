/// Cross-tenant access probes (WS-8).
///
/// Two real organizations exist for the duration of this spec: the seeded
/// fixture org (A) and a freshly registered one (B). Every probe authenticates
/// as B's ADMIN — the broadest membership role there is, so a 403 from
/// RolesGuard can never be what makes a probe "pass" — and aims a request at an
/// object id that belongs to A.
///
/// The invariant under test is not a particular status code. It is that no
/// request made with B's credentials may read A's data or change A's rows. Each
/// probe therefore asserts a non-2xx response, and the suite finishes by
/// re-reading every fixture in A to prove nothing was mutated: a handler that
/// wrote first and 500'd afterwards would satisfy "non-2xx" while still being a
/// cross-tenant write.

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";
import { loginAs, SEEDED_ADMIN_EMAIL } from "./support/seeded-org";

interface AuthBody {
  data: {
    accessToken: string;
    user: { id: string };
    organization: { id: string };
    membership: { id: string };
  };
}

type Method = "get" | "post" | "patch" | "put" | "delete";

interface Probe {
  name: string;
  method: Method;
  path: () => string;
  body?: () => Record<string, unknown>;
}

describe("Tenant isolation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /// Organization A — the seeded fixture org, owner of every probed object.
  let orgAId: string;
  let orgAAdminToken: string;
  let orgAAdminUserId: string;

  /// Organization B — the attacker. A real tenant with a real ADMIN seat.
  let orgBId: string;
  let orgBToken: string;

  const a = {
    customerId: "",
    driverId: "",
    vehicleId: "",
    orderId: "",
    dispatchId: "",
    invoiceId: "",
    paymentId: "",
    expenseId: "",
    documentId: "",
    noteId: "",
    notificationId: "",
    deviceId: "",
    geofenceId: "",
    workflowId: "",
    apiKeyId: "",
    importSessionId: "",
    auditLogId: "",
    tripId: "",
  };

  const b = {
    customerId: "",
    orderId: "",
  };

  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    orgAAdminToken = await loginAs(app, SEEDED_ADMIN_EMAIL);
    const meRes = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${orgAAdminToken}`)
      .expect(200);
    const me = meRes.body as { data: { organization: { id: string }; user: { id: string } } };
    orgAId = me.data.organization.id;
    orgAAdminUserId = me.data.user.id;

    const registerRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: `ws8-attacker-${suffix}@example.test`,
        password: "Attacker-Password-2026!",
        firstName: "Cross",
        lastName: "Tenant",
        organizationName: `WS8 Probe Org ${suffix}`,
      })
      .expect(201);
    const registered = (registerRes.body as AuthBody).data;
    orgBId = registered.organization.id;
    orgBToken = registered.accessToken;

    await seedOrgAFixtures();
    await seedOrgBFixtures();
  });

  afterAll(async () => {
    // Only ever removes rows this spec created. Organization B cascades to its
    // own users/memberships; organization A is the shared seed and is left
    // exactly as it was found apart from the fixtures deleted here.
    await prisma.dispatchStatusHistory.deleteMany({ where: { dispatchId: a.dispatchId } });
    await prisma.dispatchAssignment.deleteMany({ where: { dispatchId: a.dispatchId } });
    await prisma.trip.deleteMany({ where: { id: a.tripId } });
    await prisma.dispatch.deleteMany({ where: { id: a.dispatchId } });
    await prisma.payment.deleteMany({ where: { id: a.paymentId } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: a.invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: a.invoiceId } });
    await prisma.expense.deleteMany({ where: { id: a.expenseId } });
    await prisma.orderDocument.deleteMany({ where: { id: a.documentId } });
    await prisma.orderNote.deleteMany({ where: { id: a.noteId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: a.orderId } });
    await prisma.order.deleteMany({ where: { id: a.orderId } });
    await prisma.telematicsDevice.deleteMany({ where: { id: a.deviceId } });
    await prisma.geofence.deleteMany({ where: { id: a.geofenceId } });
    await prisma.notification.deleteMany({ where: { id: a.notificationId } });
    await prisma.workflowExecution.deleteMany({ where: { workflowId: a.workflowId } });
    await prisma.workflow.deleteMany({ where: { id: a.workflowId } });
    await prisma.apiKey.deleteMany({ where: { id: a.apiKeyId } });
    await prisma.importRow.deleteMany({ where: { sessionId: a.importSessionId } });
    await prisma.importSession.deleteMany({ where: { id: a.importSessionId } });
    await prisma.auditLog.deleteMany({ where: { id: a.auditLogId } });
    await prisma.driver.deleteMany({ where: { id: a.driverId } });
    await prisma.vehicle.deleteMany({ where: { id: a.vehicleId } });
    await prisma.customer.deleteMany({ where: { id: a.customerId } });

    await prisma.organization.deleteMany({ where: { id: orgBId } });
    await prisma.user.deleteMany({ where: { email: `ws8-attacker-${suffix}@example.test` } });

    await app.close();
  });

  async function seedOrgAFixtures(): Promise<void> {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgAId,
        customerCode: `WS8-CUS-${suffix}`,
        companyName: "Org A Confidential Customer",
        contactName: "Alice A",
        email: "alice@org-a.test",
      },
    });
    a.customerId = customer.id;

    const driver = await prisma.driver.create({
      data: {
        organizationId: orgAId,
        employeeCode: `WS8-DRV-${suffix}`,
        firstName: "Dana",
        lastName: "Driver",
        phone: "+10000000001",
      },
    });
    a.driverId = driver.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgAId,
        vehicleCode: `WS8-VEH-${suffix}`,
        plateNumber: `WS8${suffix.toUpperCase()}`,
        type: "TRUCK",
      },
    });
    a.vehicleId = vehicle.id;

    const order = await prisma.order.create({
      data: {
        organizationId: orgAId,
        orderNumber: `WS8-ORD-${suffix}`,
        customerId: customer.id,
        pickupAddress: "1 Org A Way",
        pickupCity: "Tashkent",
        pickupDate: new Date("2026-09-01T08:00:00.000Z"),
        deliveryAddress: "2 Org A Way",
        deliveryCity: "Samarkand",
        deliveryDate: new Date("2026-09-02T08:00:00.000Z"),
        cargoDescription: "Org A confidential cargo",
        price: "1000.00",
        status: "PENDING",
      },
    });
    a.orderId = order.id;

    const dispatch = await prisma.dispatch.create({
      data: {
        organizationId: orgAId,
        dispatchNumber: `WS8-DSP-${suffix}`,
        orderId: order.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        status: "ASSIGNED",
        pickupDateScheduled: new Date("2026-09-01T08:00:00.000Z"),
        deliveryDateScheduled: new Date("2026-09-02T08:00:00.000Z"),
      },
    });
    a.dispatchId = dispatch.id;

    const trip = await prisma.trip.create({
      data: {
        organizationId: orgAId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        startedAt: new Date("2026-09-01T09:00:00.000Z"),
        status: "COMPLETED",
        endedAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    });
    a.tripId = trip.id;

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: orgAId,
        invoiceNumber: `WS8-INV-${suffix}`,
        customerId: customer.id,
        status: "SENT",
        subtotal: "1000.00",
        totalAmount: "1000.00",
        balanceDue: "1000.00",
      },
    });
    a.invoiceId = invoice.id;

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgAId,
        invoiceId: invoice.id,
        amount: "100.00",
        method: "BANK_TRANSFER",
      },
    });
    a.paymentId = payment.id;

    const expense = await prisma.expense.create({
      data: {
        organizationId: orgAId,
        expenseNumber: `WS8-EXP-${suffix}`,
        category: "FUEL",
        description: "Org A fuel",
        amount: "50.00",
      },
    });
    a.expenseId = expense.id;

    const document = await prisma.orderDocument.create({
      data: {
        organizationId: orgAId,
        orderId: order.id,
        kind: "POD",
        fileName: "org-a-pod.pdf",
        mimeType: "application/pdf",
        storagePath: `uploads/orders/${order.id}/org-a-pod.pdf`,
      },
    });
    a.documentId = document.id;

    const note = await prisma.orderNote.create({
      data: {
        organizationId: orgAId,
        orderId: order.id,
        body: "Org A internal note",
        authorUserId: orgAAdminUserId,
      },
    });
    a.noteId = note.id;

    const notification = await prisma.notification.create({
      data: {
        organizationId: orgAId,
        type: `ws8.probe.${suffix}`,
        category: "OPERATIONS",
        severity: "LOW",
        title: "Org A notification",
        message: "Org A only",
      },
    });
    a.notificationId = notification.id;

    const device = await prisma.telematicsDevice.create({
      data: {
        organizationId: orgAId,
        vehicleId: vehicle.id,
        provider: "MANUAL",
        externalId: `WS8-DEV-${suffix}`,
        name: "Org A device",
      },
    });
    a.deviceId = device.id;

    const geofence = await prisma.geofence.create({
      data: {
        organizationId: orgAId,
        name: "Org A depot",
        type: "CIRCLE",
        centerLat: 41.3,
        centerLng: 69.2,
        radiusM: 250,
      },
    });
    a.geofenceId = geofence.id;

    const workflow = await prisma.workflow.create({
      data: {
        organizationId: orgAId,
        name: "Org A workflow",
        config: { trigger: { type: "order.created" }, actions: [] },
        createdByUserId: orgAAdminUserId,
      },
    });
    a.workflowId = workflow.id;

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId: orgAId,
        name: "Org A key",
        keyPrefix: `flowerp_test_${suffix}`,
        keyHash: createHash("sha256").update(`ws8-${suffix}`).digest("hex"),
        createdByUserId: orgAAdminUserId,
      },
    });
    a.apiKeyId = apiKey.id;

    const importSession = await prisma.importSession.create({
      data: {
        organizationId: orgAId,
        uploadedByUserId: orgAAdminUserId,
        entityType: "Customer",
        fileName: "org-a-customers.csv",
        format: "csv",
        fileSizeBytes: 128,
        headers: ["companyName", "contactName"],
        status: "VALIDATED",
      },
    });
    a.importSessionId = importSession.id;

    const auditLog = await prisma.auditLog.create({
      data: {
        organizationId: orgAId,
        actorUserId: orgAAdminUserId,
        action: "ws8.probe",
        entityType: "Customer",
        entityId: customer.id,
      },
    });
    a.auditLogId = auditLog.id;
  }

  async function seedOrgBFixtures(): Promise<void> {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgBId,
        customerCode: `WS8-B-CUS-${suffix}`,
        companyName: "Org B Customer",
        contactName: "Bob B",
      },
    });
    b.customerId = customer.id;

    const order = await prisma.order.create({
      data: {
        organizationId: orgBId,
        orderNumber: `WS8-B-ORD-${suffix}`,
        customerId: customer.id,
        pickupAddress: "1 Org B Way",
        pickupCity: "Tashkent",
        pickupDate: new Date("2026-09-01T08:00:00.000Z"),
        deliveryAddress: "2 Org B Way",
        deliveryCity: "Bukhara",
        deliveryDate: new Date("2026-09-02T08:00:00.000Z"),
        cargoDescription: "Org B cargo",
        price: "500.00",
        status: "PENDING",
      },
    });
    b.orderId = order.id;
  }

  function send(probe: Probe, token: string) {
    const req = request(app.getHttpServer())[probe.method](probe.path()).set(
      "Authorization",
      `Bearer ${token}`,
    );
    return probe.body ? req.send(probe.body()) : req.send();
  }

  /// Every probe below targets an object owned by organization A.
  const probes: Probe[] = [
    { name: "GET /customers/:id", method: "get", path: () => `/customers/${a.customerId}` },
    {
      name: "PATCH /customers/:id",
      method: "patch",
      path: () => `/customers/${a.customerId}`,
      body: () => ({ contactName: "Owned by B" }),
    },
    {
      name: "POST /customers/:id/archive",
      method: "post",
      path: () => `/customers/${a.customerId}/archive`,
    },
    {
      name: "POST /customers/:id/restore",
      method: "post",
      path: () => `/customers/${a.customerId}/restore`,
    },

    { name: "GET /drivers/:id", method: "get", path: () => `/drivers/${a.driverId}` },
    {
      name: "PATCH /drivers/:id",
      method: "patch",
      path: () => `/drivers/${a.driverId}`,
      body: () => ({ firstName: "Owned by B" }),
    },
    {
      name: "POST /drivers/:id/archive",
      method: "post",
      path: () => `/drivers/${a.driverId}/archive`,
    },
    {
      name: "POST /drivers/:id/restore",
      method: "post",
      path: () => `/drivers/${a.driverId}/restore`,
    },

    { name: "GET /vehicles/:id", method: "get", path: () => `/vehicles/${a.vehicleId}` },
    {
      name: "PATCH /vehicles/:id",
      method: "patch",
      path: () => `/vehicles/${a.vehicleId}`,
      body: () => ({ make: "Owned by B" }),
    },
    {
      name: "POST /vehicles/:id/archive",
      method: "post",
      path: () => `/vehicles/${a.vehicleId}/archive`,
    },
    {
      name: "POST /vehicles/:id/restore",
      method: "post",
      path: () => `/vehicles/${a.vehicleId}/restore`,
    },

    { name: "GET /orders/:id", method: "get", path: () => `/orders/${a.orderId}` },
    {
      name: "PATCH /orders/:id",
      method: "patch",
      path: () => `/orders/${a.orderId}`,
      body: () => ({ notes: "Owned by B" }),
    },
    {
      name: "POST /orders/:id/status",
      method: "post",
      path: () => `/orders/${a.orderId}/status`,
      body: () => ({ status: "IN_TRANSIT" }),
    },
    {
      name: "POST /orders/:id/cancel",
      method: "post",
      path: () => `/orders/${a.orderId}/cancel`,
      body: () => ({ reason: "cross tenant" }),
    },
    {
      name: "POST /orders/:id/archive",
      method: "post",
      path: () => `/orders/${a.orderId}/archive`,
    },
    {
      name: "POST /orders/:id/restore",
      method: "post",
      path: () => `/orders/${a.orderId}/restore`,
    },
    { name: "GET /orders/:id/documents", method: "get", path: () => `/orders/${a.orderId}/documents` },
    {
      name: "PATCH /orders/:id/documents/:documentId",
      method: "patch",
      path: () => `/orders/${a.orderId}/documents/${a.documentId}`,
      body: () => ({ fileName: "owned-by-b.pdf" }),
    },
    {
      name: "DELETE /orders/:id/documents/:documentId",
      method: "delete",
      path: () => `/orders/${a.orderId}/documents/${a.documentId}`,
    },
    {
      name: "GET /orders/:id/documents/:documentId/file",
      method: "get",
      path: () => `/orders/${a.orderId}/documents/${a.documentId}/file`,
    },
    { name: "GET /orders/:id/notes", method: "get", path: () => `/orders/${a.orderId}/notes` },
    {
      name: "POST /orders/:id/notes",
      method: "post",
      path: () => `/orders/${a.orderId}/notes`,
      body: () => ({ body: "injected by B" }),
    },
    {
      name: "PATCH /orders/:id/notes/:noteId",
      method: "patch",
      path: () => `/orders/${a.orderId}/notes/${a.noteId}`,
      body: () => ({ body: "rewritten by B" }),
    },
    {
      name: "DELETE /orders/:id/notes/:noteId",
      method: "delete",
      path: () => `/orders/${a.orderId}/notes/${a.noteId}`,
    },

    { name: "GET /dispatches/:id", method: "get", path: () => `/dispatches/${a.dispatchId}` },
    {
      name: "PATCH /dispatches/:id",
      method: "patch",
      path: () => `/dispatches/${a.dispatchId}`,
      body: () => ({ notes: "Owned by B" }),
    },
    {
      name: "POST /dispatches/:id/status",
      method: "post",
      path: () => `/dispatches/${a.dispatchId}/status`,
      body: () => ({ status: "IN_TRANSIT" }),
    },
    {
      name: "POST /dispatches/:id/undo-status",
      method: "post",
      path: () => `/dispatches/${a.dispatchId}/undo-status`,
    },
    {
      name: "POST /dispatches/:id/cancel",
      method: "post",
      path: () => `/dispatches/${a.dispatchId}/cancel`,
      body: () => ({ reason: "cross tenant" }),
    },
    {
      name: "POST /dispatches/:id/reschedule",
      method: "post",
      path: () => `/dispatches/${a.dispatchId}/reschedule`,
      body: () => ({
        pickupDateScheduled: "2026-10-01T08:00:00.000Z",
        deliveryDateScheduled: "2026-10-02T08:00:00.000Z",
      }),
    },
    {
      name: "GET /dispatches/:id/conflicts",
      method: "get",
      path: () => `/dispatches/${a.dispatchId}/conflicts`,
    },
    {
      name: "POST /dispatches/:id/check-conflicts",
      method: "post",
      path: () => `/dispatches/${a.dispatchId}/check-conflicts`,
    },
    {
      name: "GET /dispatches/:id/proof-of-delivery",
      method: "get",
      path: () => `/dispatches/${a.dispatchId}/proof-of-delivery`,
    },

    { name: "GET /invoices/:id", method: "get", path: () => `/invoices/${a.invoiceId}` },
    {
      name: "PATCH /invoices/:id",
      method: "patch",
      path: () => `/invoices/${a.invoiceId}`,
      body: () => ({ notes: "Owned by B" }),
    },
    {
      name: "POST /invoices/:id/send",
      method: "post",
      path: () => `/invoices/${a.invoiceId}/send`,
    },
    {
      name: "POST /invoices/:id/cancel",
      method: "post",
      path: () => `/invoices/${a.invoiceId}/cancel`,
    },
    {
      name: "GET /invoices/:invoiceId/payments",
      method: "get",
      path: () => `/invoices/${a.invoiceId}/payments`,
    },
    {
      name: "POST /invoices/:invoiceId/payments",
      method: "post",
      path: () => `/invoices/${a.invoiceId}/payments`,
      body: () => ({ amount: 1, method: "CASH" }),
    },

    { name: "GET /expenses/:id", method: "get", path: () => `/expenses/${a.expenseId}` },
    {
      name: "PATCH /expenses/:id",
      method: "patch",
      path: () => `/expenses/${a.expenseId}`,
      body: () => ({ description: "Owned by B" }),
    },
    {
      name: "POST /expenses/:id/approve",
      method: "post",
      path: () => `/expenses/${a.expenseId}/approve`,
    },
    {
      name: "POST /expenses/:id/reject",
      method: "post",
      path: () => `/expenses/${a.expenseId}/reject`,
      body: () => ({ rejectionReason: "cross tenant" }),
    },

    {
      name: "POST /notifications/:id/read",
      method: "post",
      path: () => `/notifications/${a.notificationId}/read`,
    },
    {
      name: "POST /notifications/:id/unread",
      method: "post",
      path: () => `/notifications/${a.notificationId}/unread`,
    },
    {
      name: "POST /notifications/:id/archive",
      method: "post",
      path: () => `/notifications/${a.notificationId}/archive`,
    },

    {
      name: "GET /telematics/devices/:id",
      method: "get",
      path: () => `/telematics/devices/${a.deviceId}`,
    },
    {
      name: "PATCH /telematics/devices/:id",
      method: "patch",
      path: () => `/telematics/devices/${a.deviceId}`,
      body: () => ({ name: "Owned by B" }),
    },
    {
      name: "POST /telematics/devices/:id/rotate-secret",
      method: "post",
      path: () => `/telematics/devices/${a.deviceId}/rotate-secret`,
    },
    {
      name: "POST /telematics/devices/:id/archive",
      method: "post",
      path: () => `/telematics/devices/${a.deviceId}/archive`,
    },
    {
      name: "POST /telematics/devices/:id/restore",
      method: "post",
      path: () => `/telematics/devices/${a.deviceId}/restore`,
    },

    {
      name: "GET /telematics/geofences/:id",
      method: "get",
      path: () => `/telematics/geofences/${a.geofenceId}`,
    },
    {
      name: "PATCH /telematics/geofences/:id",
      method: "patch",
      path: () => `/telematics/geofences/${a.geofenceId}`,
      body: () => ({ name: "Owned by B" }),
    },
    {
      name: "POST /telematics/geofences/:id/archive",
      method: "post",
      path: () => `/telematics/geofences/${a.geofenceId}/archive`,
    },
    {
      name: "POST /telematics/geofences/:id/restore",
      method: "post",
      path: () => `/telematics/geofences/${a.geofenceId}/restore`,
    },

    { name: "GET /telematics/trips/:id", method: "get", path: () => `/telematics/trips/${a.tripId}` },

    { name: "GET /workflows/:id", method: "get", path: () => `/workflows/${a.workflowId}` },
    {
      name: "PATCH /workflows/:id",
      method: "patch",
      path: () => `/workflows/${a.workflowId}`,
      body: () => ({ name: "Owned by B" }),
    },
    { name: "DELETE /workflows/:id", method: "delete", path: () => `/workflows/${a.workflowId}` },
    {
      name: "POST /workflows/:id/toggle",
      method: "post",
      path: () => `/workflows/${a.workflowId}/toggle`,
    },
    {
      name: "POST /workflows/:id/publish",
      method: "post",
      path: () => `/workflows/${a.workflowId}/publish`,
    },
    {
      name: "POST /workflows/:id/archive",
      method: "post",
      path: () => `/workflows/${a.workflowId}/archive`,
    },
    {
      name: "POST /workflows/:id/duplicate",
      method: "post",
      path: () => `/workflows/${a.workflowId}/duplicate`,
    },
    {
      name: "GET /workflows/:id/export",
      method: "get",
      path: () => `/workflows/${a.workflowId}/export`,
    },
    {
      name: "POST /workflows/:id/execute",
      method: "post",
      path: () => `/workflows/${a.workflowId}/execute`,
      body: () => ({ payload: {} }),
    },
    {
      name: "GET /workflows/:id/executions",
      method: "get",
      path: () => `/workflows/${a.workflowId}/executions`,
    },

    {
      name: "PATCH /admin/api-keys/:id",
      method: "patch",
      path: () => `/admin/api-keys/${a.apiKeyId}`,
      body: () => ({ name: "Owned by B" }),
    },
    {
      name: "DELETE /admin/api-keys/:id",
      method: "delete",
      path: () => `/admin/api-keys/${a.apiKeyId}`,
    },
    {
      name: "POST /admin/api-keys/:id/rotate",
      method: "post",
      path: () => `/admin/api-keys/${a.apiKeyId}/rotate`,
    },
    {
      name: "POST /admin/api-keys/:id/disable",
      method: "post",
      path: () => `/admin/api-keys/${a.apiKeyId}/disable`,
    },
    {
      name: "POST /admin/api-keys/:id/enable",
      method: "post",
      path: () => `/admin/api-keys/${a.apiKeyId}/enable`,
    },

    {
      name: "GET /import/sessions/:id",
      method: "get",
      path: () => `/import/sessions/${a.importSessionId}`,
    },
    {
      name: "PUT /import/sessions/:id/mapping",
      method: "put",
      path: () => `/import/sessions/${a.importSessionId}/mapping`,
      body: () => ({ columnMapping: { "0": "companyName" } }),
    },
    {
      name: "POST /import/sessions/:id/validate",
      method: "post",
      path: () => `/import/sessions/${a.importSessionId}/validate`,
    },
    {
      name: "POST /import/sessions/:id/execute",
      method: "post",
      path: () => `/import/sessions/${a.importSessionId}/execute`,
      body: () => ({ duplicateStrategy: "SKIP" }),
    },
    {
      name: "POST /import/sessions/:id/cancel",
      method: "post",
      path: () => `/import/sessions/${a.importSessionId}/cancel`,
    },
    {
      name: "POST /import/sessions/:id/resume",
      method: "post",
      path: () => `/import/sessions/${a.importSessionId}/resume`,
    },
    {
      name: "POST /import/sessions/:id/retry",
      method: "post",
      path: () => `/import/sessions/${a.importSessionId}/retry`,
    },
    {
      name: "GET /import/sessions/:id/errors",
      method: "get",
      path: () => `/import/sessions/${a.importSessionId}/errors`,
    },

    { name: "GET /audit/:id", method: "get", path: () => `/audit/${a.auditLogId}` },
  ];

  describe("organization B cannot reach organization A's objects by id", () => {
    it.each(probes.map((p) => [p.name, p] as const))("%s", async (_name, probe) => {
      const res = await send(probe, orgBToken);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(res.body)).not.toContain("Org A Confidential Customer");
    });
  });

  describe("cross-tenant foreign keys cannot be injected on create", () => {
    it("POST /orders rejects another organization's customerId", async () => {
      const res = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({
          customerId: a.customerId,
          pickupAddress: "1 B Way",
          pickupCity: "Tashkent",
          pickupDate: "2026-09-01T08:00:00.000Z",
          deliveryAddress: "2 B Way",
          deliveryCity: "Bukhara",
          deliveryDate: "2026-09-02T08:00:00.000Z",
          cargoDescription: "probe",
          price: 10,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.order.findFirst({
        where: { organizationId: orgBId, customerId: a.customerId },
      });
      expect(leaked).toBeNull();
    });

    it("POST /orders/:id/assign rejects another organization's driver and vehicle", async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${b.orderId}/assign`)
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({ driverId: a.driverId, vehicleId: a.vehicleId });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: b.orderId } });
      expect(order.driverId).toBeNull();
      expect(order.vehicleId).toBeNull();
    });

    it("POST /dispatches rejects another organization's order, driver and vehicle", async () => {
      const res = await request(app.getHttpServer())
        .post("/dispatches")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({ orderId: a.orderId, driverId: a.driverId, vehicleId: a.vehicleId });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.dispatch.findFirst({ where: { organizationId: orgBId } });
      expect(leaked).toBeNull();
    });

    it("POST /invoices rejects another organization's customerId", async () => {
      const res = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({
          customerId: a.customerId,
          lineItems: [{ description: "probe", quantity: 1, unitPrice: 1 }],
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.invoice.findFirst({
        where: { organizationId: orgBId, customerId: a.customerId },
      });
      expect(leaked).toBeNull();
    });

    it("POST /invoices/from-order/:orderId rejects another organization's order", async () => {
      const res = await request(app.getHttpServer())
        .post(`/invoices/from-order/${a.orderId}`)
        .set("Authorization", `Bearer ${orgBToken}`)
        .send();
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.invoice.findFirst({
        where: { organizationId: orgBId, orderId: a.orderId },
      });
      expect(leaked).toBeNull();
    });

    it("POST /expenses rejects another organization's order, vehicle and driver", async () => {
      const res = await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({
          orderId: a.orderId,
          vehicleId: a.vehicleId,
          driverId: a.driverId,
          category: "FUEL",
          description: "probe",
          amount: 1,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.expense.findFirst({
        where: {
          organizationId: orgBId,
          OR: [{ orderId: a.orderId }, { vehicleId: a.vehicleId }, { driverId: a.driverId }],
        },
      });
      expect(leaked).toBeNull();
    });

    it("POST /telematics/devices rejects another organization's vehicleId", async () => {
      const res = await request(app.getHttpServer())
        .post("/telematics/devices")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({
          provider: "MANUAL",
          externalId: `WS8-B-DEV-${suffix}`,
          name: "probe",
          vehicleId: a.vehicleId,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.telematicsDevice.findFirst({
        where: { organizationId: orgBId, vehicleId: a.vehicleId },
      });
      expect(leaked).toBeNull();
      await prisma.telematicsDevice.deleteMany({ where: { organizationId: orgBId } });
    });

    it("POST /telematics/geofences rejects another organization's linkedCustomerId", async () => {
      const res = await request(app.getHttpServer())
        .post("/telematics/geofences")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({
          name: "probe",
          type: "CIRCLE",
          centerLat: 41.3,
          centerLng: 69.2,
          radiusM: 100,
          linkedCustomerId: a.customerId,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const leaked = await prisma.geofence.findFirst({
        where: { organizationId: orgBId, linkedCustomerId: a.customerId },
      });
      expect(leaked).toBeNull();
      await prisma.geofence.deleteMany({ where: { organizationId: orgBId } });
    });
  });

  describe("a client-supplied organization id is never trusted", () => {
    it("ignores organizationId in a create body", async () => {
      const res = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${orgBToken}`)
        .send({
          organizationId: orgAId,
          customerCode: `WS8-SPOOF-${suffix}`,
          companyName: "Spoofed into A",
          contactName: "Spoof",
        });
      expect(res.status).toBe(201);
      const created = await prisma.customer.findFirst({
        where: { customerCode: `WS8-SPOOF-${suffix}` },
      });
      expect(created?.organizationId).toBe(orgBId);
      await prisma.customer.deleteMany({ where: { customerCode: `WS8-SPOOF-${suffix}` } });
    });

    it("ignores an organizationId query parameter on a list endpoint", async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers?organizationId=${orgAId}&limit=100`)
        .set("Authorization", `Bearer ${orgBToken}`)
        .expect(200);
      const body = res.body as { data: { items: Array<{ id: string }> } };
      const ids = body.data.items.map((item) => item.id);
      expect(ids).not.toContain(a.customerId);
    });
  });

  /// List endpoints legitimately answer 200 for organization B; what matters is
  /// that none of A's rows appear in them.
  describe("list endpoints only ever contain the caller's own rows", () => {
    it.each([
      ["/customers?limit=100", () => a.customerId],
      ["/drivers?limit=100", () => a.driverId],
      ["/vehicles?limit=100", () => a.vehicleId],
      ["/orders?limit=100", () => a.orderId],
      ["/dispatches?limit=100", () => a.dispatchId],
      ["/invoices?limit=100", () => a.invoiceId],
      ["/payments?limit=100", () => a.paymentId],
      ["/expenses?limit=100", () => a.expenseId],
      ["/notifications?limit=100", () => a.notificationId],
      ["/telematics/devices?limit=100", () => a.deviceId],
      ["/telematics/geofences?limit=100", () => a.geofenceId],
      ["/telematics/trips?limit=100", () => a.tripId],
      ["/workflows?limit=100", () => a.workflowId],
      ["/admin/api-keys", () => a.apiKeyId],
      ["/import/sessions?limit=100", () => a.importSessionId],
      ["/audit?limit=100", () => a.auditLogId],
    ] as const)("GET %s", async (path, ownedByA) => {
      const res = await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${orgBToken}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(ownedByA());
    });
  });

  /// Runs last: proves the probes above were refused before any write landed.
  describe("organization A's rows are untouched", () => {
    it("left every fixture exactly as it was", async () => {
      const [customer, driver, vehicle, order, dispatch, invoice, expense, document, note] =
        await Promise.all([
          prisma.customer.findUniqueOrThrow({ where: { id: a.customerId } }),
          prisma.driver.findUniqueOrThrow({ where: { id: a.driverId } }),
          prisma.vehicle.findUniqueOrThrow({ where: { id: a.vehicleId } }),
          prisma.order.findUniqueOrThrow({ where: { id: a.orderId } }),
          prisma.dispatch.findUniqueOrThrow({ where: { id: a.dispatchId } }),
          prisma.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } }),
          prisma.expense.findUniqueOrThrow({ where: { id: a.expenseId } }),
          prisma.orderDocument.findUniqueOrThrow({ where: { id: a.documentId } }),
          prisma.orderNote.findUniqueOrThrow({ where: { id: a.noteId } }),
        ]);

      expect(customer.contactName).toBe("Alice A");
      expect(customer.archivedAt).toBeNull();
      expect(driver.firstName).toBe("Dana");
      expect(driver.archivedAt).toBeNull();
      expect(vehicle.archivedAt).toBeNull();
      expect(vehicle.make).toBeNull();
      expect(order.status).toBe("PENDING");
      expect(order.notes).toBeNull();
      expect(order.archivedAt).toBeNull();
      expect(order.cancelledAt).toBeNull();
      expect(dispatch.status).toBe("ASSIGNED");
      expect(dispatch.notes).toBeNull();
      expect(invoice.status).toBe("SENT");
      expect(invoice.notes).toBeNull();
      expect(invoice.cancelledAt).toBeNull();
      expect(expense.status).toBe("PENDING");
      expect(expense.description).toBe("Org A fuel");
      expect(document.fileName).toBe("org-a-pod.pdf");
      expect(note.body).toBe("Org A internal note");

      const notification = await prisma.notification.findUniqueOrThrow({
        where: { id: a.notificationId },
      });
      expect(notification.isRead).toBe(false);
      expect(notification.isArchived).toBe(false);

      const device = await prisma.telematicsDevice.findUniqueOrThrow({ where: { id: a.deviceId } });
      expect(device.name).toBe("Org A device");
      expect(device.archivedAt).toBeNull();

      const geofence = await prisma.geofence.findUniqueOrThrow({ where: { id: a.geofenceId } });
      expect(geofence.name).toBe("Org A depot");
      expect(geofence.archivedAt).toBeNull();

      const workflow = await prisma.workflow.findUniqueOrThrow({ where: { id: a.workflowId } });
      expect(workflow.name).toBe("Org A workflow");
      expect(workflow.status).toBe("DRAFT");
      expect(workflow.active).toBe(false);

      const apiKey = await prisma.apiKey.findUniqueOrThrow({ where: { id: a.apiKeyId } });
      expect(apiKey.name).toBe("Org A key");
      expect(apiKey.status).toBe("ACTIVE");
      expect(apiKey.revokedAt).toBeNull();

      const session = await prisma.importSession.findUniqueOrThrow({
        where: { id: a.importSessionId },
      });
      expect(session.status).toBe("VALIDATED");
      expect(session.columnMapping).toBeNull();
      expect(session.cancelRequested).toBe(false);

      // No workflow may have been duplicated into B, and no row of A's may have
      // been re-parented.
      const strays = await prisma.workflow.count({ where: { organizationId: orgBId } });
      expect(strays).toBe(0);
    });
  });
});
