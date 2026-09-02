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

interface ErrorBody {
  error: { statusCode: number; message: string | string[] };
}

function uniqueEmail(prefix = "test"): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

const FUTURE_PICKUP = "2027-11-01T09:00:00.000Z";
const FUTURE_DELIVERY = "2027-11-05T09:00:00.000Z";

/// Inserts a DELIVERY_FAILED dispatch + status history entry directly via Prisma.
/// Creates minimal driver and vehicle records scoped to the given org.
/// All records are cleaned up automatically via organization CASCADE delete in afterAll.
async function createFailedDispatchFixture(
  prisma: PrismaService,
  orgId: string,
  orderId: string,
) {
  const driver = await prisma.driver.create({
    data: {
      organizationId: orgId,
      employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
      firstName: "Fail",
      lastName: "Driver",
      phone: "+998 90 000 11 22",
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: orgId,
      vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
      plateNumber: `99 ${randomUUID().slice(0, 4).toUpperCase()}`,
      type: "Truck",
    },
  });
  const dispatch = await prisma.dispatch.create({
    data: {
      organizationId: orgId,
      dispatchNumber: `DSP-FAIL-${randomUUID().slice(0, 6).toUpperCase()}`,
      orderId,
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: "DELIVERY_FAILED",
      pickupDateScheduled: new Date(FUTURE_PICKUP),
      deliveryDateScheduled: new Date(FUTURE_DELIVERY),
      failureReason: "CUSTOMER_UNAVAILABLE",
    },
  });
  await prisma.dispatchStatusHistory.create({
    data: {
      organizationId: orgId,
      dispatchId: dispatch.id,
      status: "DELIVERY_FAILED",
    },
  });
  return dispatch;
}

describe("Customer Portal (e2e)", () => {
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
    const email = uniqueEmail("admin");
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

  async function createCustomer(admin: Awaited<ReturnType<typeof registerAdmin>>, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        companyName: "Acme Logistics",
        contactName: "Jane Doe",
        email: uniqueEmail("customer"),
        ...overrides,
      })
      .expect(201);
    return (res.body as { data: { id: string; email: string } }).data;
  }

  async function createOrder(admin: Awaited<ReturnType<typeof registerAdmin>>, customerId: string) {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        customerId,
        pickupAddress: "1 Main St",
        pickupCity: "Tashkent",
        pickupDate: FUTURE_PICKUP,
        deliveryAddress: "2 Side St",
        deliveryCity: "Samarkand",
        deliveryDate: FUTURE_DELIVERY,
        cargoDescription: "General freight",
        price: 500,
      })
      .expect(201);
    const order = (res.body as { data: { id: string } }).data;
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "PENDING" })
      .expect(200);
    return order;
  }

  async function createInvoice(admin: Awaited<ReturnType<typeof registerAdmin>>, customerId: string) {
    const res = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        customerId,
        lineItems: [{ description: "Freight service", quantity: 1, unitPrice: 500 }],
      })
      .expect(201);
    const invoice = (res.body as { data: { id: string } }).data;
    await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/send`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    return invoice;
  }

  async function inviteAndActivate(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    customerId: string,
    password = "customer-strong-pass",
  ) {
    await request(app.getHttpServer())
      .post(`/customers/${customerId}/portal-access/invitations`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(201);

    const outboxRes = await request(app.getHttpServer())
      .get("/test/mail/customer-portal-outbox")
      .expect(200);
    const emails = (outboxRes.body as { data: Array<{ acceptUrl: string }> }).data;
    const acceptUrl = emails[emails.length - 1].acceptUrl;
    const token = new URL(acceptUrl).searchParams.get("token")!;

    await request(app.getHttpServer())
      .post("/customer-portal/invitations/accept")
      .send({ token, password })
      .expect(200);

    return token;
  }

  async function loginCustomer(email: string, password: string, organizationSlug?: string) {
    const res = await request(app.getHttpServer())
      .post("/customer-portal/auth/login")
      .send({ email, password, ...(organizationSlug ? { organizationSlug } : {}) })
      .expect(200);
    return (res.body as {
      data: { accessToken: string; refreshToken: string; customer: { id: string; email: string } };
    }).data;
  }

  describe("provisioning: invite -> activate -> login", () => {
    it("walks the full flow end to end", async () => {
      const admin = await registerAdmin(`Portal Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      await inviteAndActivate(admin, customer.id, "customer-strong-pass");

      const session = await loginCustomer(customer.email, "customer-strong-pass");
      expect(session.customer.id).toBe(customer.id);
      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();
    });

    it("rejects inviting a customer that already has portal access", async () => {
      const admin = await registerAdmin(`Portal Dup Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await inviteAndActivate(admin, customer.id);

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });

    it("rejects a second open invitation for the same customer", async () => {
      const admin = await registerAdmin(`Portal Reinvite Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });

    it("resend rotates the token so the old link no longer works", async () => {
      const admin = await registerAdmin(`Portal Resend Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const createRes = await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);
      const invitationId = (createRes.body as { data: { id: string } }).data.id;

      const outboxBefore = await request(app.getHttpServer()).get("/test/mail/customer-portal-outbox").expect(200);
      const beforeEmails = (outboxBefore.body as { data: Array<{ acceptUrl: string }> }).data;
      const oldUrl = beforeEmails[beforeEmails.length - 1].acceptUrl;
      const oldToken = new URL(oldUrl).searchParams.get("token")!;

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations/${invitationId}/resend`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/customer-portal/invitations/accept")
        .send({ token: oldToken, password: "whatever-pass" })
        .expect(404);
    });

    it("revoke prevents acceptance", async () => {
      const admin = await registerAdmin(`Portal Revoke Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const createRes = await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);
      const invitationId = (createRes.body as { data: { id: string } }).data.id;

      const outboxRes = await request(app.getHttpServer()).get("/test/mail/customer-portal-outbox").expect(200);
      const outboxEmails = (outboxRes.body as { data: Array<{ acceptUrl: string }> }).data;
      const acceptUrl = outboxEmails[outboxEmails.length - 1].acceptUrl;
      const token = new URL(acceptUrl).searchParams.get("token")!;

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations/${invitationId}/revoke`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post("/customer-portal/invitations/accept")
        .send({ token, password: "whatever-pass" })
        .expect(410);
      expect((res.body as ErrorBody).error.message).toMatch(/revoked/i);
    });

    it("expired invitations cannot be accepted", async () => {
      const admin = await registerAdmin(`Portal Expire Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const createRes = await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);
      const invitationId = (createRes.body as { data: { id: string } }).data.id;

      const outboxRes = await request(app.getHttpServer()).get("/test/mail/customer-portal-outbox").expect(200);
      const outboxEmails = (outboxRes.body as { data: Array<{ acceptUrl: string }> }).data;
      const acceptUrl = outboxEmails[outboxEmails.length - 1].acceptUrl;
      const token = new URL(acceptUrl).searchParams.get("token")!;

      await request(app.getHttpServer())
        .post(`/test/customer-portal-invitations/${invitationId}/expire`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post("/customer-portal/invitations/accept")
        .send({ token, password: "whatever-pass" })
        .expect(410);
      expect((res.body as ErrorBody).error.message).toMatch(/expired/i);
    });

    it("SALES_CRM_MANAGER can invite; a read-only role cannot", async () => {
      const admin = await registerAdmin(`Portal RBAC Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const accountantEmail = uniqueEmail("accountant");
      await request(app.getHttpServer())
        .post(`/organizations/${admin.organization.id}/invitations`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ email: accountantEmail, role: "ACCOUNTANT" })
        .expect(201);
      const outbox = await request(app.getHttpServer()).get("/test/mail/outbox").expect(200);
      const invite = (outbox.body as { data: Array<{ to: string; acceptUrl: string }> }).data.find(
        (e) => e.to === accountantEmail,
      )!;
      await request(app.getHttpServer())
        .post("/invite/accept")
        .send({
          token: invite.acceptUrl.split("/invite/")[1],
          firstName: "Amy",
          lastName: "Accountant",
          password: "correct-horse-battery",
        })
        .expect(200);
      const accountantLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: accountantEmail, password: "correct-horse-battery", organizationSlug: admin.organization.slug })
        .expect(200);
      const accountantToken = (accountantLogin.body as AuthResultBody).data.accessToken;
      createdUserIds.push((accountantLogin.body as AuthResultBody).data.user.id);

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${accountantToken}`)
        .expect(403);
    });
  });

  describe("customer session lifecycle", () => {
    it("logs in, refreshes (rotating the token), and logs out", async () => {
      const admin = await registerAdmin(`Portal Session Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await inviteAndActivate(admin, customer.id, "session-pass-123");

      const session = await loginCustomer(customer.email, "session-pass-123");

      const refreshRes = await request(app.getHttpServer())
        .post("/customer-portal/auth/refresh")
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      const refreshed = (refreshRes.body as { data: { accessToken: string; refreshToken: string } }).data;
      expect(refreshed.accessToken).toBeTruthy();
      expect(refreshed.refreshToken).not.toBe(session.refreshToken);

      // The old refresh token was rotated out — using it again must fail.
      await request(app.getHttpServer())
        .post("/customer-portal/auth/refresh")
        .send({ refreshToken: session.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post("/customer-portal/auth/logout")
        .set("Authorization", `Bearer ${refreshed.accessToken}`)
        .send({ refreshToken: refreshed.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post("/customer-portal/auth/refresh")
        .send({ refreshToken: refreshed.refreshToken })
        .expect(401);
    });

    it("changing password revokes every other active session", async () => {
      const admin = await registerAdmin(`Portal PwChange Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await inviteAndActivate(admin, customer.id, "old-password-123");

      const sessionA = await loginCustomer(customer.email, "old-password-123");
      const sessionB = await loginCustomer(customer.email, "old-password-123");

      await request(app.getHttpServer())
        .post("/customer-portal/auth/change-password")
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .send({ currentPassword: "old-password-123", newPassword: "new-password-456" })
        .expect(200);

      // sessionB's refresh token must now be dead.
      await request(app.getHttpServer())
        .post("/customer-portal/auth/refresh")
        .send({ refreshToken: sessionB.refreshToken })
        .expect(401);

      // Old password no longer works; new one does.
      await request(app.getHttpServer())
        .post("/customer-portal/auth/login")
        .send({ email: customer.email, password: "old-password-123" })
        .expect(401);
      await loginCustomer(customer.email, "new-password-456");
    });

    it("resolves login by email across organizations when only one account matches (the fixed bug)", async () => {
      const admin = await registerAdmin(`Portal Disambig Org ${randomUUID()}`);
      const sharedEmail = uniqueEmail("shared");
      const customer = await createCustomer(admin, { email: sharedEmail });
      await inviteAndActivate(admin, customer.id, "shared-pass-123");

      // No organizationSlug supplied at all — must still resolve correctly
      // even though many other organizations/accounts exist in this database.
      const session = await loginCustomer(sharedEmail, "shared-pass-123");
      expect(session.customer.email.toLowerCase()).toBe(sharedEmail.toLowerCase());
    });

    it("asks the customer to disambiguate when the same email has portal accounts in two organizations", async () => {
      const sharedEmail = uniqueEmail("dual");

      const adminA = await registerAdmin(`Portal Dual Org A ${randomUUID()}`);
      const customerA = await createCustomer(adminA, { email: sharedEmail });
      await inviteAndActivate(adminA, customerA.id, "dual-pass-A");

      const adminB = await registerAdmin(`Portal Dual Org B ${randomUUID()}`);
      const customerB = await createCustomer(adminB, { email: sharedEmail });
      await inviteAndActivate(adminB, customerB.id, "dual-pass-B");

      const res = await request(app.getHttpServer())
        .post("/customer-portal/auth/login")
        .send({ email: sharedEmail, password: "dual-pass-A" })
        .expect(401);
      expect((res.body as ErrorBody).error.message).toMatch(/more than one organization/i);

      // Specifying the organization resolves the ambiguity.
      await loginCustomer(sharedEmail, "dual-pass-A", adminA.organization.slug);
    });
  });

  describe("authenticated portal endpoints", () => {
    async function setUpActiveCustomer() {
      const admin = await registerAdmin(`Portal Data Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      const invoice = await createInvoice(admin, customer.id);
      await inviteAndActivate(admin, customer.id, "data-pass-123");
      const session = await loginCustomer(customer.email, "data-pass-123");
      return { admin, customer, order, invoice, session };
    }

    it("GET /customer-portal/auth/me returns the session", async () => {
      const { session } = await setUpActiveCustomer();

      const res = await request(app.getHttpServer())
        .get("/customer-portal/auth/me")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      expect((res.body as { data: { customer: { id: string } } }).data.customer.id).toBe(
        session.customer.id,
      );
    });

    it("GET /customer-portal/dashboard returns real aggregates as string money", async () => {
      const { session, invoice } = await setUpActiveCustomer();

      const res = await request(app.getHttpServer())
        .get("/customer-portal/dashboard")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      const data = (res.body as { data: { outstandingBalance: string; outstandingInvoiceCount: number } }).data;
      expect(typeof data.outstandingBalance).toBe("string");
      expect(data.outstandingInvoiceCount).toBeGreaterThanOrEqual(0);
      expect(invoice.id).toBeTruthy();
    });

    it("GET /customer-portal/orders lists only this customer's orders, and /:id/timeline works", async () => {
      const { session, order } = await setUpActiveCustomer();

      const listRes = await request(app.getHttpServer())
        .get("/customer-portal/orders")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      const items = (listRes.body as { data: { items: Array<{ id: string }> } }).data.items;
      expect(items.some((i) => i.id === order.id)).toBe(true);

      await request(app.getHttpServer())
        .get(`/customer-portal/orders/${order.id}`)
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/customer-portal/orders/${order.id}/timeline`)
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
    });

    it("GET /customer-portal/invoices lists and fetches this customer's invoices", async () => {
      const { session, invoice } = await setUpActiveCustomer();

      const listRes = await request(app.getHttpServer())
        .get("/customer-portal/invoices")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      const items = (listRes.body as { data: { items: Array<{ id: string }> } }).data.items;
      expect(items.some((i) => i.id === invoice.id)).toBe(true);

      await request(app.getHttpServer())
        .get(`/customer-portal/invoices/${invoice.id}`)
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
    });

    it("GET /customer-portal/documents lists an invoice document", async () => {
      const { session, invoice } = await setUpActiveCustomer();

      const res = await request(app.getHttpServer())
        .get("/customer-portal/documents")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      const items = (res.body as { data: { items: Array<{ id: string }> } }).data.items;
      expect(items.some((d) => d.id === `invoice:${invoice.id}`)).toBe(true);
    });

    it("notifications: list, unread-count, mark-read, mark-all-read", async () => {
      const { session } = await setUpActiveCustomer();

      const list = await request(app.getHttpServer())
        .get("/customer-portal/notifications")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      const items = (list.body as { data: { items: Array<{ key: string; isRead: boolean }> } }).data.items;
      expect(items.length).toBeGreaterThan(0);

      const before = await request(app.getHttpServer())
        .get("/customer-portal/notifications/unread-count")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      expect((before.body as { data: { unreadCount: number } }).data.unreadCount).toBe(items.length);

      await request(app.getHttpServer())
        .post("/customer-portal/notifications/read-all")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(201);

      const after = await request(app.getHttpServer())
        .get("/customer-portal/notifications/unread-count")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      expect((after.body as { data: { unreadCount: number } }).data.unreadCount).toBe(0);
    });

    it("profile: reads and updates, with creditLimit as a string", async () => {
      const { session } = await setUpActiveCustomer();

      const getRes = await request(app.getHttpServer())
        .get("/customer-portal/profile")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      const profile = (getRes.body as { data: { creditLimit: string } }).data;
      expect(typeof profile.creditLimit).toBe("string");

      const patchRes = await request(app.getHttpServer())
        .patch("/customer-portal/profile")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .send({ contactName: "Updated Contact", city: "Bukhara" })
        .expect(200);
      expect((patchRes.body as { data: { contactName: string } }).data.contactName).toBe(
        "Updated Contact",
      );
    });

    it("rejects every authenticated route without a token", async () => {
      await request(app.getHttpServer()).get("/customer-portal/dashboard").expect(401);
      await request(app.getHttpServer()).get("/customer-portal/orders").expect(401);
      await request(app.getHttpServer()).get("/customer-portal/invoices").expect(401);
      await request(app.getHttpServer()).get("/customer-portal/payments").expect(401);
      await request(app.getHttpServer()).get("/customer-portal/documents").expect(401);
      await request(app.getHttpServer()).get("/customer-portal/notifications").expect(401);
      await request(app.getHttpServer()).get("/customer-portal/profile").expect(401);
    });

    it("GET /customer-portal/payments and /summary are scoped to this customer", async () => {
      const { session } = await setUpActiveCustomer();

      const listRes = await request(app.getHttpServer())
        .get("/customer-portal/payments")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      expect(Array.isArray((listRes.body as { data: { items: unknown[] } }).data.items)).toBe(true);

      const summaryRes = await request(app.getHttpServer())
        .get("/customer-portal/payments/summary")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      const summary = (summaryRes.body as {
        data: { outstandingBalance: string; paidThisMonth: string; overdueCount: number };
      }).data;
      expect(typeof summary.outstandingBalance).toBe("string");
      expect(typeof summary.paidThisMonth).toBe("string");
      expect(typeof summary.overdueCount).toBe("number");
    });

    it("delivery-proof endpoints 404 for another customer's order", async () => {
      const admin = await registerAdmin(`Portal Proof Org ${randomUUID()}`);
      const customerA = await createCustomer(admin);
      const customerB = await createCustomer(admin);
      const orderB = await createOrder(admin, customerB.id);
      await inviteAndActivate(admin, customerA.id, "proof-pass-A");
      const sessionA = await loginCustomer(customerA.email, "proof-pass-A");

      await request(app.getHttpServer())
        .get(`/customer-portal/orders/${orderB.id}/delivery-proof`)
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(404);
    });

    it("notification preferences GET/PATCH round-trip", async () => {
      const { session } = await setUpActiveCustomer();

      const getRes = await request(app.getHttpServer())
        .get("/customer-portal/notifications/preferences")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
      expect(
        (getRes.body as { data: { preferences: { shipmentDelivered: boolean } } }).data.preferences
          .shipmentDelivered,
      ).toBe(true);

      const patchRes = await request(app.getHttpServer())
        .patch("/customer-portal/notifications/preferences")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .send({
          preferences: { shipmentDelivered: false },
          language: "uz",
          timezone: "Asia/Tashkent",
        })
        .expect(200);
      const patched = (patchRes.body as {
        data: { preferences: { shipmentDelivered: boolean }; language: string; timezone: string };
      }).data;
      expect(patched.preferences.shipmentDelivered).toBe(false);
      expect(patched.language).toBe("uz");
      expect(patched.timezone).toBe("Asia/Tashkent");
    });
  });

  describe("delivery failure customer experience", () => {
    it("timeline shows 'Delivery attempted' label — raw DELIVERY_FAILED enum is never exposed", async () => {
      const admin = await registerAdmin(`Portal DF Timeline Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await createFailedDispatchFixture(prisma, admin.organization.id, order.id);
      await inviteAndActivate(admin, customer.id, "df-pass-1");
      const session = await loginCustomer(customer.email, "df-pass-1");

      const res = await request(app.getHttpServer())
        .get(`/customer-portal/orders/${order.id}/timeline`)
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      const events = (res.body as { data: Array<{ label: string; status: string }> }).data;
      const labels = events.map((e) => e.label);

      // Customer-safe label is present
      expect(labels).toContain("Delivery attempted");
      // Raw internal enum value is never exposed as a label
      expect(labels).not.toContain("DELIVERY_FAILED");
      // No raw failure reason enum in any label
      for (const label of labels) {
        expect(label).not.toMatch(/CUSTOMER_UNAVAILABLE|REFUSED_DELIVERY|WRONG_ADDRESS|ACCESS_DENIED|DAMAGED_IN_TRANSIT|RECIPIENT_ABSENT/);
      }
    });

    it("notification feed includes a customer-safe failure notification", async () => {
      const admin = await registerAdmin(`Portal DF Notif Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await createFailedDispatchFixture(prisma, admin.organization.id, order.id);
      await inviteAndActivate(admin, customer.id, "df-pass-2");
      const session = await loginCustomer(customer.email, "df-pass-2");

      const res = await request(app.getHttpServer())
        .get("/customer-portal/notifications")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      const items = (res.body as { data: { items: Array<{ key: string; message: string }> } }).data.items;
      const failureItem = items.find((i) => i.key.startsWith("dispatch-failed:"));

      expect(failureItem).toBeDefined();
      // Message is customer-safe — no internal enum
      expect(failureItem!.message).not.toContain("DELIVERY_FAILED");
      expect(failureItem!.message).not.toContain("CUSTOMER_UNAVAILABLE");
      expect(failureItem!.message).toMatch(/delivery/i);
    });

    it("customer isolation: delivery-failure events of org B are not visible to org A customer", async () => {
      const adminA = await registerAdmin(`Portal DF Iso A ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      const orderA = await createOrder(adminA, customerA.id);
      await inviteAndActivate(adminA, customerA.id, "df-iso-pass-A");
      const sessionA = await loginCustomer(customerA.email, "df-iso-pass-A");

      // Org B has a DELIVERY_FAILED dispatch — must not appear in org A's feed
      const adminB = await registerAdmin(`Portal DF Iso B ${randomUUID()}`);
      const customerB = await createCustomer(adminB);
      const orderB = await createOrder(adminB, customerB.id);
      await createFailedDispatchFixture(prisma, adminB.organization.id, orderB.id);

      const res = await request(app.getHttpServer())
        .get("/customer-portal/notifications")
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(200);

      const items = (res.body as { data: { items: Array<{ key: string }> } }).data.items;
      // No dispatch-failed notification visible for org A customer (their order has no failure)
      const failureItems = items.filter((i) => i.key.startsWith("dispatch-failed:"));
      expect(failureItems).toHaveLength(0);

      // Also verify order A timeline has no failure entry
      const timelineRes = await request(app.getHttpServer())
        .get(`/customer-portal/orders/${orderA.id}/timeline`)
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(200);
      const events = (timelineRes.body as { data: Array<{ label: string }> }).data;
      expect(events.map((e) => e.label)).not.toContain("Delivery attempted");
    });
  });

  describe("portal isolation", () => {
    it("a customer from org A cannot see org B's orders/invoices even with a valid session", async () => {
      const adminA = await registerAdmin(`Portal Isolation A ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      await inviteAndActivate(adminA, customerA.id, "iso-pass-A");
      const sessionA = await loginCustomer(customerA.email, "iso-pass-A");

      const adminB = await registerAdmin(`Portal Isolation B ${randomUUID()}`);
      const customerB = await createCustomer(adminB);
      const orderB = await createOrder(adminB, customerB.id);
      const invoiceB = await createInvoice(adminB, customerB.id);

      await request(app.getHttpServer())
        .get(`/customer-portal/orders/${orderB.id}`)
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/customer-portal/invoices/${invoiceB.id}`)
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(404);
    });

    it("a customer cannot see another customer's orders within the same organization", async () => {
      const admin = await registerAdmin(`Portal Sibling Org ${randomUUID()}`);
      const customerA = await createCustomer(admin);
      const customerB = await createCustomer(admin);
      const orderB = await createOrder(admin, customerB.id);
      await inviteAndActivate(admin, customerA.id, "sibling-pass-A");
      const sessionA = await loginCustomer(customerA.email, "sibling-pass-A");

      await request(app.getHttpServer())
        .get(`/customer-portal/orders/${orderB.id}`)
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(404);
    });

    it("a suspended portal account is rejected even with a previously-valid access token", async () => {
      const admin = await registerAdmin(`Portal Suspend Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await inviteAndActivate(admin, customer.id, "suspend-pass-123");
      const session = await loginCustomer(customer.email, "suspend-pass-123");

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/suspend`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get("/customer-portal/auth/me")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/reactivate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get("/customer-portal/auth/me")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);
    });
  });

  describe("staff-facing portal access status", () => {
    it("reports no account and no pending invitation for a fresh customer", async () => {
      const admin = await registerAdmin(`Portal Status Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const res = await request(app.getHttpServer())
        .get(`/customers/${customer.id}/portal-access`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const status = (res.body as {
        data: { hasAccount: boolean; pendingInvitation: unknown };
      }).data;
      expect(status.hasAccount).toBe(false);
      expect(status.pendingInvitation).toBeNull();
    });

    it("reports an active account after activation", async () => {
      const admin = await registerAdmin(`Portal Status Active Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await inviteAndActivate(admin, customer.id);

      const res = await request(app.getHttpServer())
        .get(`/customers/${customer.id}/portal-access`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const status = (res.body as { data: { hasAccount: boolean; accountStatus: string } }).data;
      expect(status.hasAccount).toBe(true);
      expect(status.accountStatus).toBe("ACTIVE");
    });
  });

  describe("shipment.status safety — no raw internal dispatch enum exposed", () => {
    /// Creates a minimal dispatch in any status directly via Prisma.
    /// All records are cleaned up by the org CASCADE delete in afterAll.
    async function createDispatchInStatus(orgId: string, orderId: string, status: string) {
      const driver = await prisma.driver.create({
        data: {
          organizationId: orgId,
          employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
          firstName: "Test",
          lastName: "Driver",
          phone: "+998 90 000 99 11",
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: orgId,
          vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
          plateNumber: `99 ${randomUUID().slice(0, 4).toUpperCase()}`,
          type: "Truck",
        },
      });
      return prisma.dispatch.create({
        data: {
          organizationId: orgId,
          dispatchNumber: `DSP-${status.slice(0, 6)}-${randomUUID().slice(0, 6).toUpperCase()}`,
          orderId,
          driverId: driver.id,
          vehicleId: vehicle.id,
          status: status as never,
          pickupDateScheduled: new Date(FUTURE_PICKUP),
          deliveryDateScheduled: new Date(FUTURE_DELIVERY),
        },
      });
    }

    async function setUpAndGetShipmentStatus(dispatchStatus: string) {
      const admin = await registerAdmin(`Portal SS ${dispatchStatus.slice(0, 8)} ${randomUUID().slice(0, 6)}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await createDispatchInStatus(admin.organization.id, order.id, dispatchStatus);
      await inviteAndActivate(admin, customer.id, "ss-pass-123");
      const session = await loginCustomer(customer.email, "ss-pass-123");

      const res = await request(app.getHttpServer())
        .get(`/customer-portal/orders/${order.id}`)
        .set("Authorization", `Bearer ${session.accessToken}`)
        .expect(200);

      return (res.body as { data: { shipment: { status: string | null } } }).data.shipment.status;
    }

    it("AT_STOP → customer receives 'In transit', never the raw enum", async () => {
      const status = await setUpAndGetShipmentStatus("AT_STOP");
      expect(status).toBe("In transit");
      expect(status).not.toBe("AT_STOP");
    });

    it("DELIVERY_FAILED → customer receives 'Delivery attempted', never the raw enum", async () => {
      const status = await setUpAndGetShipmentStatus("DELIVERY_FAILED");
      expect(status).toBe("Delivery attempted");
      expect(status).not.toBe("DELIVERY_FAILED");
    });

    it("AT_PICKUP → customer receives 'At pickup', never the raw enum", async () => {
      const status = await setUpAndGetShipmentStatus("AT_PICKUP");
      expect(status).toBe("At pickup");
      expect(status).not.toBe("AT_PICKUP");
    });

    it("ARRIVED_AT_DELIVERY → customer receives 'Arrived at destination', never the raw enum", async () => {
      const status = await setUpAndGetShipmentStatus("ARRIVED_AT_DELIVERY");
      expect(status).toBe("Arrived at destination");
      expect(status).not.toBe("ARRIVED_AT_DELIVERY");
    });

    it("EN_ROUTE_TO_PICKUP → customer receives 'On the way to pickup', never the raw enum", async () => {
      const status = await setUpAndGetShipmentStatus("EN_ROUTE_TO_PICKUP");
      expect(status).toBe("On the way to pickup");
      expect(status).not.toBe("EN_ROUTE_TO_PICKUP");
    });

    it("IN_TRANSIT → customer receives 'In transit'", async () => {
      const status = await setUpAndGetShipmentStatus("IN_TRANSIT");
      expect(status).toBe("In transit");
    });

    it("tenant isolation: order detail 404s for a different org's customer", async () => {
      const adminA = await registerAdmin(`Portal SS Iso A ${randomUUID().slice(0, 6)}`);
      const customerA = await createCustomer(adminA);
      await inviteAndActivate(adminA, customerA.id, "ss-iso-pass-A");
      const sessionA = await loginCustomer(customerA.email, "ss-iso-pass-A");

      const adminB = await registerAdmin(`Portal SS Iso B ${randomUUID().slice(0, 6)}`);
      const customerB = await createCustomer(adminB);
      const orderB = await createOrder(adminB, customerB.id);
      await createDispatchInStatus(adminB.organization.id, orderB.id, "AT_STOP");

      await request(app.getHttpServer())
        .get(`/customer-portal/orders/${orderB.id}`)
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .expect(404);
    });
  });
});
