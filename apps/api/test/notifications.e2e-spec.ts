import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string; email: string };
    organization: { id: string; slug: string };
    membership: { id: string; role: string };
  };
}

interface NotificationBody {
  id: string;
  type: string;
  category: string;
  severity: string;
  entityId: string | null;
  isRead: boolean;
  isArchived: boolean;
}
interface NotificationListResponse {
  data: { items: NotificationBody[]; meta: { total: number }; unreadCount: number };
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe("Notifications (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function registerAdmin(organizationName: string) {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email,
      password: "correct-horse-battery",
      firstName: "Org",
      lastName: "Admin",
      organizationName,
    });
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return { email, ...body.data };
  }

  async function addMemberWithRole(admin: Awaited<ReturnType<typeof registerAdmin>>, role: string) {
    const memberEmail = uniqueEmail();

    await request(app.getHttpServer())
      .post(`/organizations/${admin.organization.id}/invitations`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role })
      .expect(201);

    const outboxRes = await request(app.getHttpServer()).get("/test/mail/outbox").expect(200);
    const invite = (outboxRes.body as { data: Array<{ to: string; acceptUrl: string }> }).data.find(
      (entry) => entry.to === memberEmail,
    );
    if (!invite) throw new Error(`No invitation email captured for ${memberEmail}`);

    await request(app.getHttpServer())
      .post("/invite/accept")
      .send({
        token: invite.acceptUrl.split("/invite/")[1],
        firstName: "Member",
        lastName: "User",
        password: "correct-horse-battery",
      })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: memberEmail, password: "correct-horse-battery", organizationSlug: admin.organization.slug })
      .expect(200);
    const loginBody = loginRes.body as AuthResultBody;
    createdUserIds.push(loginBody.data.user.id);

    return { email: memberEmail, accessToken: loginBody.data.accessToken };
  }

  async function createCustomer(admin: Awaited<ReturnType<typeof registerAdmin>>, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ companyName: "Acme Logistics", contactName: "Jane Doe", ...overrides })
      .expect(201);
    return (res.body as { data: { id: string } }).data;
  }

  async function createOrder(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    customerId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        customerId,
        pickupAddress: "1 Main St",
        pickupCity: "Tashkent",
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryAddress: "2 Side St",
        deliveryCity: "Samarkand",
        deliveryDate: "2026-07-05T09:00:00.000Z",
        cargoDescription: "General freight",
        price: 500,
        ...overrides,
      })
      .expect(201);
    return (res.body as { data: { id: string; orderNumber: string } }).data;
  }

  async function listNotifications(admin: Awaited<ReturnType<typeof registerAdmin>>) {
    const res = await request(app.getHttpServer())
      .get("/notifications?limit=100")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    return (res.body as NotificationListResponse).data;
  }

  describe("tenancy isolation", () => {
    it("never surfaces another organization's delayed order", async () => {
      const adminA = await registerAdmin(`Notif Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Notif Isolation Org B ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      const orderA = await createOrder(adminA, customerA.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });

      const listB = await listNotifications(adminB);
      expect(listB.items.some((n) => n.entityId === orderA.id)).toBe(false);
    });
  });

  describe("rule generation", () => {
    it("generates ORDER_DELAYED for an order past its delivery date and not yet delivered", async () => {
      const admin = await registerAdmin(`Delayed Rule Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });

      const list = await listNotifications(admin);
      const notification = list.items.find((n) => n.type === "ORDER_DELAYED" && n.entityId === order.id);
      expect(notification).toBeDefined();
      expect(notification?.category).toBe("OPERATIONS");
      expect(notification?.severity).toBe("HIGH");
    });

    it("generates ORDER_UNASSIGNED for a PENDING order", async () => {
      const admin = await registerAdmin(`Unassigned Rule Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PENDING" })
        .expect(200);

      const list = await listNotifications(admin);
      expect(list.items.some((n) => n.type === "ORDER_UNASSIGNED" && n.entityId === order.id)).toBe(true);
    });

    it("generates CUSTOMER_CREDIT_LIMIT_EXCEEDED when outstanding balance exceeds the limit", async () => {
      const admin = await registerAdmin(`Credit Limit Rule Org ${randomUUID()}`);
      const customer = await createCustomer(admin, { creditLimit: 100 });
      const invoiceRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ customerId: customer.id, lineItems: [{ description: "Big order", quantity: 1, unitPrice: 500 }] })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/invoices/${(invoiceRes.body as { data: { id: string } }).data.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const list = await listNotifications(admin);
      const notification = list.items.find(
        (n) => n.type === "CUSTOMER_CREDIT_LIMIT_EXCEEDED" && n.entityId === customer.id,
      );
      expect(notification).toBeDefined();
      expect(notification?.severity).toBe("CRITICAL");
    });

    it("generates ORDER_NEGATIVE_PROFIT when approved expenses exceed a delivered order's price", async () => {
      const admin = await registerAdmin(`Negative Profit Rule Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driverRes = await request(app.getHttpServer())
        .post("/drivers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ firstName: "A", lastName: "B", phone: "1" })
        .expect(201);
      const vehicleRes = await request(app.getHttpServer())
        .post("/vehicles")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ plateNumber: `P${randomUUID().slice(0, 6)}`, type: "van" })
        .expect(201);
      const order = await createOrder(admin, customer.id, { price: 100 });
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PENDING" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          driverId: (driverRes.body as { data: { id: string } }).data.id,
          vehicleId: (vehicleRes.body as { data: { id: string } }).data.id,
        })
        .expect(200);
      for (const status of ["PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
        await request(app.getHttpServer())
          .post(`/orders/${order.id}/status`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send({ status })
          .expect(200);
      }
      const expenseRes = await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId: order.id, category: "FUEL", description: "Expensive fuel", amount: 500 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/expenses/${(expenseRes.body as { data: { id: string } }).data.id}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const list = await listNotifications(admin);
      expect(list.items.some((n) => n.type === "ORDER_NEGATIVE_PROFIT" && n.entityId === order.id)).toBe(true);
    });

    it("generates VEHICLE_INSURANCE_EXPIRY and DRIVER_LICENSE_EXPIRY within the warning window", async () => {
      const admin = await registerAdmin(`Expiry Rule Org ${randomUUID()}`);
      const soonDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

      const vehicleRes = await request(app.getHttpServer())
        .post("/vehicles")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ plateNumber: `P${randomUUID().slice(0, 6)}`, type: "truck", insuranceExpiry: soonDate })
        .expect(201);
      const driverRes = await request(app.getHttpServer())
        .post("/drivers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ firstName: "Exp", lastName: "Iry", phone: "1", licenseExpiry: soonDate })
        .expect(201);

      const list = await listNotifications(admin);
      expect(
        list.items.some(
          (n) => n.type === "VEHICLE_INSURANCE_EXPIRY" && n.entityId === (vehicleRes.body as { data: { id: string } }).data.id,
        ),
      ).toBe(true);
      expect(
        list.items.some(
          (n) => n.type === "DRIVER_LICENSE_EXPIRY" && n.entityId === (driverRes.body as { data: { id: string } }).data.id,
        ),
      ).toBe(true);
    });
  });

  describe("deduplication and resolved-condition lifecycle", () => {
    it("never creates a second open notification for the same still-qualifying entity", async () => {
      const admin = await registerAdmin(`Dedup Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });

      await listNotifications(admin);
      await listNotifications(admin);
      const list = await listNotifications(admin);
      const matches = list.items.filter((n) => n.type === "ORDER_DELAYED" && n.entityId === order.id);
      expect(matches).toHaveLength(1);
    });

    it("auto-archives a notification once its underlying condition resolves", async () => {
      const admin = await registerAdmin(`Resolve Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PENDING" })
        .expect(200);

      const beforeList = await listNotifications(admin);
      expect(beforeList.items.some((n) => n.type === "ORDER_UNASSIGNED" && n.entityId === order.id && !n.isArchived)).toBe(
        true,
      );

      // Resolve the condition: cancel the order (no longer PENDING).
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const afterList = await listNotifications(admin);
      expect(afterList.items.some((n) => n.type === "ORDER_UNASSIGNED" && n.entityId === order.id)).toBe(false);

      const archivedRes = await request(app.getHttpServer())
        .get("/notifications?isArchived=true&limit=100")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const archived = (archivedRes.body as NotificationListResponse).data;
      expect(archived.items.some((n) => n.type === "ORDER_UNASSIGNED" && n.entityId === order.id)).toBe(true);
    });
  });

  describe("settings", () => {
    it("returns sensible defaults and can be updated by ADMIN", async () => {
      const admin = await registerAdmin(`Settings Org ${randomUUID()}`);
      const getRes = await request(app.getHttpServer())
        .get("/notifications/settings")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const settings = (
        getRes.body as {
          data: { enabledCategories: string[]; invoiceDueSoonDays: number; lowSeverityEnabled: boolean };
        }
      ).data;
      expect(settings.enabledCategories.sort()).toEqual(["CUSTOMERS", "FINANCE", "FLEET", "OPERATIONS"]);
      expect(settings.invoiceDueSoonDays).toBe(3);
      expect(settings.lowSeverityEnabled).toBe(true);

      const patchRes = await request(app.getHttpServer())
        .patch("/notifications/settings")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ invoiceDueSoonDays: 7, lowSeverityEnabled: false })
        .expect(200);
      const updated = (patchRes.body as { data: { invoiceDueSoonDays: number; lowSeverityEnabled: boolean } }).data;
      expect(updated.invoiceDueSoonDays).toBe(7);
      expect(updated.lowSeverityEnabled).toBe(false);
    });

    it("disabling a category archives its already-open notifications on next read", async () => {
      const admin = await registerAdmin(`Category Toggle Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await createOrder(admin, customer.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });
      await listNotifications(admin); // generates ORDER_DELAYED (OPERATIONS)

      await request(app.getHttpServer())
        .patch("/notifications/settings")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ enabledCategories: ["FINANCE", "CUSTOMERS", "FLEET"] })
        .expect(200);

      const list = await listNotifications(admin);
      expect(list.items.some((n) => n.type === "ORDER_DELAYED")).toBe(false);
    });

    it("non-ADMIN cannot read or update settings", async () => {
      const admin = await registerAdmin(`Settings Role Org ${randomUUID()}`);
      const accountant = await addMemberWithRole(admin, "ACCOUNTANT");
      await request(app.getHttpServer())
        .get("/notifications/settings")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch("/notifications/settings")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .send({ lowSeverityEnabled: false })
        .expect(403);
    });
  });

  describe("read/archive actions", () => {
    it("marks read/unread, archives, and supports read-all/archive-all", async () => {
      const admin = await registerAdmin(`Actions Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await createOrder(admin, customer.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });
      const list = await listNotifications(admin);
      const notification = list.items[0];

      const readRes = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/read`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((readRes.body as { data: NotificationBody }).data.isRead).toBe(true);

      const unreadRes = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/unread`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((unreadRes.body as { data: NotificationBody }).data.isRead).toBe(false);

      const unreadCountRes = await request(app.getHttpServer())
        .get("/notifications/unread-count")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((unreadCountRes.body as { data: { unreadCount: number } }).data.unreadCount).toBeGreaterThan(0);

      await request(app.getHttpServer())
        .post("/notifications/read-all")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const afterReadAll = await request(app.getHttpServer())
        .get("/notifications/unread-count")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((afterReadAll.body as { data: { unreadCount: number } }).data.unreadCount).toBe(0);

      await request(app.getHttpServer())
        .post("/notifications/archive-all")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const afterArchiveAll = await request(app.getHttpServer())
        .get("/notifications?isArchived=true")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((afterArchiveAll.body as NotificationListResponse).data.items.length).toBeGreaterThan(0);
    });

    it("a notification id from another organization returns 404", async () => {
      const adminA = await registerAdmin(`Notif Cross Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Notif Cross Org B ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      await createOrder(adminA, customerA.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });
      const listA = await listNotifications(adminA);
      const notification = listA.items[0];

      await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/read`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(404);
    });
  });

  describe("role scoping", () => {
    it("DISPATCHER only sees OPERATIONS/FLEET notifications, not FINANCE/CUSTOMERS", async () => {
      const admin = await registerAdmin(`Role Scoping Org ${randomUUID()}`);
      const dispatcher = await addMemberWithRole(admin, "DISPATCHER");
      const customer = await createCustomer(admin, { creditLimit: 100 });

      // OPERATIONS notification
      await createOrder(admin, customer.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });
      // CUSTOMERS notification (credit limit exceeded)
      const invoiceRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ customerId: customer.id, lineItems: [{ description: "Big", quantity: 1, unitPrice: 500 }] })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/invoices/${(invoiceRes.body as { data: { id: string } }).data.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const dispatcherRes = await request(app.getHttpServer())
        .get("/notifications?limit=100")
        .set("Authorization", `Bearer ${dispatcher.accessToken}`)
        .expect(200);
      const dispatcherItems = (dispatcherRes.body as NotificationListResponse).data.items;
      expect(dispatcherItems.some((n) => n.category === "OPERATIONS")).toBe(true);
      expect(dispatcherItems.some((n) => n.category === "CUSTOMERS")).toBe(false);
    });

    it("DRIVER has no notifications access at all", async () => {
      const admin = await registerAdmin(`Driver Notif Role Org ${randomUUID()}`);
      const driver = await addMemberWithRole(admin, "DRIVER");
      await request(app.getHttpServer())
        .get("/notifications")
        .set("Authorization", `Bearer ${driver.accessToken}`)
        .expect(403);
    });
  });
});
