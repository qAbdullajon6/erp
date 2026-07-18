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

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe("Reports (e2e)", () => {
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
        pickupDate: "2027-01-01T09:00:00.000Z",
        deliveryAddress: "2 Side St",
        deliveryCity: "Samarkand",
        deliveryDate: "2027-01-05T09:00:00.000Z",
        cargoDescription: "General freight",
        price: 500,
        ...overrides,
      })
      .expect(201);
    return (res.body as { data: { id: string; orderNumber: string } }).data;
  }

  async function deliverOrder(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    customerId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const driverRes = await request(app.getHttpServer())
      .post("/drivers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ firstName: "Aziz", lastName: "Karimov", phone: "+998901234567" })
      .expect(201);
    const vehicleRes = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ plateNumber: `P${randomUUID().slice(0, 6)}`, type: "truck" })
      .expect(201);
    const driver = (driverRes.body as { data: { id: string } }).data;
    const vehicle = (vehicleRes.body as { data: { id: string } }).data;
    const order = await createOrder(admin, customerId, overrides);

    await request(app.getHttpServer())
      .post(`/orders/${order.id}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "PENDING" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/assign`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ driverId: driver.id, vehicleId: vehicle.id })
      .expect(200);
    for (const status of ["PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status })
        .expect(200);
    }
    return { ...order, driverId: driver.id, vehicleId: vehicle.id };
  }

  describe("filter validation", () => {
    it("rejects an invalid orderStatus/invoiceStatus/comparisonPeriod", async () => {
      const admin = await registerAdmin(`Reports Validation Org ${randomUUID()}`);
      await request(app.getHttpServer())
        .get("/reports/executive-overview?orderStatus=NOT_REAL")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get("/reports/executive-overview?invoiceStatus=NOT_REAL")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get("/reports/executive-overview?comparisonPeriod=not_real")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
    });

    it("rejects an unknown query parameter", async () => {
      const admin = await registerAdmin(`Reports Allowlist Org ${randomUUID()}`);
      await request(app.getHttpServer())
        .get("/reports/executive-overview?somethingUnknown=1")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
    });
  });

  describe("tenancy isolation", () => {
    it("never includes another organization's orders/revenue", async () => {
      const adminA = await registerAdmin(`Reports Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Reports Isolation Org B ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      const customerB = await createCustomer(adminB);
      await deliverOrder(adminA, customerA.id, { price: 700, deliveryDate: "2027-02-01T09:00:00.000Z" });
      await deliverOrder(adminB, customerB.id, { price: 12345, deliveryDate: "2027-02-01T09:00:00.000Z" });

      const res = await request(app.getHttpServer())
        .get("/reports/executive-overview?dateFrom=2027-01-01&dateTo=2027-03-01")
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .expect(200);
      const body = res.body as { data: { totals: { totalRevenue: string; totalOrders: number } } };
      expect(body.data.totals.totalRevenue).toBe("700");
      expect(Number(body.data.totals.totalRevenue)).not.toBe(12345);
    });
  });

  describe("executive overview calculations", () => {
    it("computes revenue, expenses, profit, completion rate, and on-time rate correctly", async () => {
      const admin = await registerAdmin(`Executive Calc Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const delivered = await deliverOrder(admin, customer.id, {
        price: 1000,
        deliveryDate: "2027-03-05T09:00:00.000Z",
      });
      // A cancelled order shouldn't count toward revenue.
      const cancelled = await createOrder(admin, customer.id, { deliveryDate: "2027-03-06T09:00:00.000Z" });
      await request(app.getHttpServer())
        .post(`/orders/${cancelled.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId: delivered.id, category: "FUEL", description: "Fuel", amount: 150, expenseDate: "2027-03-05T09:00:00.000Z" })
        .expect(201)
        .then(async (res) => {
          const expenseId = (res.body as { data: { id: string } }).data.id;
          await request(app.getHttpServer())
            .post(`/expenses/${expenseId}/approve`)
            .set("Authorization", `Bearer ${admin.accessToken}`)
            .expect(200);
        });

      const res = await request(app.getHttpServer())
        .get("/reports/executive-overview?dateFrom=2027-03-01&dateTo=2027-03-10")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const totals = (
        res.body as {
          data: {
            totals: {
              totalOrders: number;
              deliveredOrders: number;
              totalRevenue: string;
              approvedExpenses: string;
              estimatedGrossProfit: string;
              deliveryCompletionRate: number;
              onTimeDeliveryRate: number;
            };
          };
        }
      ).data.totals;

      expect(totals.totalOrders).toBe(2); // delivered + cancelled, both in range
      expect(totals.deliveredOrders).toBe(1);
      expect(totals.totalRevenue).toBe("1000");
      expect(totals.approvedExpenses).toBe("150");
      expect(totals.estimatedGrossProfit).toBe("850");
      expect(totals.deliveryCompletionRate).toBe(50);
      expect(totals.onTimeDeliveryRate).toBe(100); // delivered immediately, well before deliveryDate
    });

    it("supports previous_period comparison with a changePercent", async () => {
      const admin = await registerAdmin(`Comparison Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await deliverOrder(admin, customer.id, { price: 200, deliveryDate: "2027-04-15T09:00:00.000Z" });

      const res = await request(app.getHttpServer())
        .get("/reports/executive-overview?dateFrom=2027-04-10&dateTo=2027-04-20&comparisonPeriod=previous_period")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const body = res.body as { data: { comparison: { totalRevenue: { current: number; previous: number; changePercent: number | null } } } };
      expect(body.data.comparison.totalRevenue.current).toBe(200);
      expect(body.data.comparison.totalRevenue.previous).toBe(0);
      // previous is 0 -> changePercent is not mathematically valid -> null
      expect(body.data.comparison.totalRevenue.changePercent).toBeNull();
    });
  });

  describe("operations report exceptions", () => {
    it("lists delayed and unassigned orders with navigable order data", async () => {
      const admin = await registerAdmin(`Operations Exceptions Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const overdueOrder = await createOrder(admin, customer.id, {
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });
      const pendingOrder = await createOrder(admin, customer.id);
      await request(app.getHttpServer())
        .post(`/orders/${pendingOrder.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PENDING" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get("/reports/operations")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const exceptions = (
        res.body as {
          data: {
            exceptions: {
              delayedOrders: { orderId: string; orderNumber: string; customerId: string }[];
              unassignedActiveOrders: { orderId: string }[];
            };
          };
        }
      ).data.exceptions;

      expect(exceptions.delayedOrders.some((o) => o.orderId === overdueOrder.id)).toBe(true);
      expect(exceptions.delayedOrders.find((o) => o.orderId === overdueOrder.id)?.customerId).toBe(customer.id);
      expect(exceptions.unassignedActiveOrders.some((o) => o.orderId === pendingOrder.id)).toBe(true);
    });
  });

  describe("financial report", () => {
    it("buckets receivables aging correctly", async () => {
      const admin = await registerAdmin(`Aging Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      async function createOverdueInvoice(daysPastDue: number, amount: number) {
        const dueDate = new Date(Date.now() - daysPastDue * 24 * 60 * 60 * 1000).toISOString();
        const res = await request(app.getHttpServer())
          .post("/invoices")
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send({ customerId: customer.id, dueDate, lineItems: [{ description: "X", quantity: 1, unitPrice: amount }] })
          .expect(201);
        const invoiceId = (res.body as { data: { id: string } }).data.id;
        await request(app.getHttpServer())
          .post(`/invoices/${invoiceId}/send`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .expect(200);
        return invoiceId;
      }

      await createOverdueInvoice(10, 100); // 1-30 bucket
      await createOverdueInvoice(45, 200); // 31-60 bucket
      await createOverdueInvoice(120, 300); // 90+ bucket

      const res = await request(app.getHttpServer())
        .get("/reports/financial")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const aging = (res.body as { data: { receivablesAging: { bucket: string; amount: string; invoiceCount: number }[] } })
        .data.receivablesAging;

      expect(aging.find((b) => b.bucket === "1-30")?.amount).toBe("100");
      expect(aging.find((b) => b.bucket === "31-60")?.amount).toBe("200");
      expect(aging.find((b) => b.bucket === "90+")?.amount).toBe("300");
      expect(aging.find((b) => b.bucket === "61-90")?.invoiceCount).toBe(0);
    });

    it("labels profitability as Estimated Gross Profit and only counts APPROVED expenses", async () => {
      const admin = await registerAdmin(`Profitability Label Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const delivered = await deliverOrder(admin, customer.id, { price: 500, deliveryDate: "2027-05-01T09:00:00.000Z" });

      await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId: delivered.id, category: "TOLL", description: "unapproved toll", amount: 9999, expenseDate: "2027-05-01T09:00:00.000Z" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get("/reports/financial?dateFrom=2027-04-25&dateTo=2027-05-10")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const body = res.body as { data: { profitability: { label: string; byOrder: { orderId: string; estimatedGrossProfit: string }[] } } };

      expect(body.data.profitability.label).toBe("Estimated Gross Profit");
      const row = body.data.profitability.byOrder.find((o) => o.orderId === delivered.id);
      expect(row?.estimatedGrossProfit).toBe("500"); // unapproved expense doesn't reduce it
    });
  });

  describe("CSV export", () => {
    it("returns a CSV with the correct content-type and escapes fields containing commas", async () => {
      const admin = await registerAdmin(`CSV Export Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await createOrder(admin, customer.id, {
        pickupCity: "Tashkent, Uzbekistan",
        pickupDate: "2026-07-01T09:00:00.000Z",
        deliveryDate: "2026-07-05T09:00:00.000Z",
      });

      const res = await request(app.getHttpServer())
        .get("/reports/export?type=operations")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(/attachment; filename=/);
      expect(res.text).toContain('"Tashkent, Uzbekistan"');
    });

    it("rejects an export request with an invalid type", async () => {
      const admin = await registerAdmin(`CSV Export Invalid Type Org ${randomUUID()}`);
      await request(app.getHttpServer())
        .get("/reports/export?type=not-a-real-type")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
    });
  });

  describe("role scoping", () => {
    it("DRIVER has no reports access; other roles can read", async () => {
      const admin = await registerAdmin(`Reports Role Org ${randomUUID()}`);
      const driver = await addMemberWithRole(admin, "DRIVER");
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");

      await request(app.getHttpServer())
        .get("/reports/executive-overview")
        .set("Authorization", `Bearer ${driver.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get("/reports/executive-overview")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(200);
    });
  });
});
