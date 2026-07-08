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

interface CustomerBody {
  id: string;
}
interface DriverBody {
  id: string;
}
interface VehicleBody {
  id: string;
}
interface OrderBody {
  id: string;
  orderNumber: string;
  status: string;
  price: string;
  currency: string;
}

interface InvoiceBody {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  orderId: string | null;
  lineItems?: { description: string; quantity: string; unitPrice: string; lineTotal: string }[];
}
interface InvoiceResponse {
  data: InvoiceBody;
}

interface ExpenseBody {
  id: string;
  expenseNumber: string;
  status: string;
  amount: string;
}
interface ExpenseResponse {
  data: ExpenseBody;
}

interface ErrorBody {
  error: { statusCode: number; message: string | string[] };
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

const FUTURE_PICKUP = "2027-08-01T09:00:00.000Z";
const FUTURE_DELIVERY = "2027-08-05T09:00:00.000Z";

describe("Finance (e2e)", () => {
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
    const registerRes = await request(app.getHttpServer()).post("/auth/register").send({
      email: memberEmail,
      password: "correct-horse-battery",
      firstName: "Member",
      lastName: "User",
      organizationName: `Throwaway Org ${randomUUID()}`,
    });
    const memberBody = registerRes.body as AuthResultBody;
    createdUserIds.push(memberBody.data.user.id);
    createdOrganizationIds.push(memberBody.data.organization.id);

    await request(app.getHttpServer())
      .post("/organizations/current/members")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: memberEmail, password: "correct-horse-battery", organizationSlug: admin.organization.slug })
      .expect(200);

    return { email: memberEmail, accessToken: (loginRes.body as AuthResultBody).data.accessToken };
  }

  async function createCustomer(admin: Awaited<ReturnType<typeof registerAdmin>>, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ companyName: "Acme Logistics", contactName: "Jane Doe", ...overrides })
      .expect(201);
    return (res.body as { data: CustomerBody }).data;
  }

  async function createDriver(admin: Awaited<ReturnType<typeof registerAdmin>>) {
    const res = await request(app.getHttpServer())
      .post("/drivers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ firstName: "Aziz", lastName: "Karimov", phone: "+998901234567" })
      .expect(201);
    return (res.body as { data: DriverBody }).data;
  }

  async function createVehicle(admin: Awaited<ReturnType<typeof registerAdmin>>) {
    const res = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ plateNumber: "01A123BC", type: "truck" })
      .expect(201);
    return (res.body as { data: VehicleBody }).data;
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
        pickupDate: FUTURE_PICKUP,
        deliveryAddress: "2 Side St",
        deliveryCity: "Samarkand",
        deliveryDate: FUTURE_DELIVERY,
        cargoDescription: "General freight",
        price: 500,
        ...overrides,
      })
      .expect(201);
    return (res.body as { data: OrderBody }).data;
  }

  /// Drives a fresh order all the way to DELIVERED so it's eligible for
  /// invoicing — assign requires PENDING/ASSIGNED, so this always creates
  /// its own driver/vehicle to avoid double-booking collisions with other
  /// tests' fixtures.
  async function deliverOrder(admin: Awaited<ReturnType<typeof registerAdmin>>, customerId: string, overrides: Record<string, unknown> = {}) {
    const driver = await createDriver(admin);
    const vehicle = await createVehicle(admin);
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
    return order;
  }

  async function createManualInvoice(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    customerId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        customerId,
        lineItems: [{ description: "Freight service", quantity: 2, unitPrice: 100 }],
        ...overrides,
      })
      .expect(201);
    return (res.body as InvoiceResponse).data;
  }

  describe("invoice creation and server-side totals", () => {
    it("computes lineTotal/subtotal/totalAmount server-side from line items, discount, and tax", async () => {
      const admin = await registerAdmin(`Invoice Totals Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [
          { description: "Line A", quantity: 3, unitPrice: 50 },
          { description: "Line B", quantity: 1, unitPrice: 25 },
        ],
        discountAmount: 10,
        taxAmount: 5,
      });

      // subtotal = 3*50 + 1*25 = 175; total = 175 - 10 + 5 = 170
      expect(invoice.subtotal).toBe("175");
      expect(invoice.totalAmount).toBe("170");
      expect(invoice.balanceDue).toBe("170");
      expect(invoice.status).toBe("DRAFT");
      expect(invoice.lineItems).toHaveLength(2);
      expect(invoice.lineItems?.[0].lineTotal).toBe("150");
    });

    it("rejects a client trying to smuggle its own totalAmount/balanceDue — those aren't real input fields", async () => {
      const admin = await registerAdmin(`Invoice Smuggled Totals Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      // The global ValidationPipe's forbidNonWhitelisted rejects any
      // property CreateInvoiceDto doesn't declare — totalAmount/balanceDue
      // are always server-computed and were never accepted as input at
      // all, so this 400s rather than silently ignoring the extra fields.
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId: customer.id,
          lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
          totalAmount: 999999,
          balanceDue: 0,
        })
        .expect(400);
    });

    it("rejects creating an invoice with zero line items", async () => {
      const admin = await registerAdmin(`Invoice No Lines Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ customerId: customer.id, lineItems: [] })
        .expect(400);
    });

    it("there is no permanent delete route", async () => {
      const admin = await registerAdmin(`Invoice No Delete Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id);
      await request(app.getHttpServer())
        .delete(`/invoices/${invoice.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  describe("invoice from delivered order", () => {
    it("creates an invoice prefilled from a DELIVERED order", async () => {
      const admin = await registerAdmin(`Invoice From Order Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await deliverOrder(admin, customer.id, { price: 750 });

      const res = await request(app.getHttpServer())
        .post(`/invoices/from-order/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);
      const invoice = (res.body as InvoiceResponse).data;
      expect(invoice.orderId).toBe(order.id);
      expect(invoice.totalAmount).toBe("750");
      expect(invoice.balanceDue).toBe("750");
      expect(invoice.status).toBe("DRAFT");
    });

    it("rejects invoicing a non-delivered order", async () => {
      const admin = await registerAdmin(`Invoice Not Delivered Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);

      const res = await request(app.getHttpServer())
        .post(`/invoices/from-order/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
      expect((res.body as ErrorBody).error.message).toMatch(/delivered/i);
    });

    it("rejects a second active invoice for the same order, but allows a new one after cancelling the first", async () => {
      const admin = await registerAdmin(`Invoice Duplicate Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await deliverOrder(admin, customer.id);

      const first = await request(app.getHttpServer())
        .post(`/invoices/from-order/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);
      const firstInvoice = (first.body as InvoiceResponse).data;

      await request(app.getHttpServer())
        .post(`/invoices/from-order/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);

      await request(app.getHttpServer())
        .post(`/invoices/${firstInvoice.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/invoices/from-order/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(201);
    });
  });

  describe("invoice editing and finalization", () => {
    it("allows editing while DRAFT, recomputing totals, but blocks editing once SENT", async () => {
      const admin = await registerAdmin(`Invoice Edit Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id);

      const edited = await request(app.getHttpServer())
        .patch(`/invoices/${invoice.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ lineItems: [{ description: "Revised", quantity: 1, unitPrice: 300 }], discountAmount: 50 })
        .expect(200);
      expect((edited.body as InvoiceResponse).data.totalAmount).toBe("250");

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/invoices/${invoice.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ notes: "too late" })
        .expect(409);
    });

    it("rejects sending an already-SENT invoice, and rejects cancelling once PAID", async () => {
      const admin = await registerAdmin(`Invoice Finalize Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [{ description: "Full amount", quantity: 1, unitPrice: 100 }],
      });
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 100, method: "CASH" })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });
  });

  describe("payments", () => {
    it("rejects a payment on a DRAFT invoice", async () => {
      const admin = await registerAdmin(`Payment On Draft Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id);
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 10, method: "CASH" })
        .expect(409);
    });

    it("rejects a payment exceeding the balance due", async () => {
      const admin = await registerAdmin(`Payment Overpay Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
      });
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 150, method: "CASH" })
        .expect(400);
      expect((res.body as ErrorBody).error.message).toMatch(/exceeds/i);
    });

    it("rejects a mismatched payment currency", async () => {
      const admin = await registerAdmin(`Payment Currency Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
      });
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 50, method: "CASH", currency: "UZS" })
        .expect(400);
    });

    it("updates paidAmount/balanceDue/status atomically: SENT -> PARTIALLY_PAID -> PAID", async () => {
      const admin = await registerAdmin(`Payment Atomic Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
      });
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const firstPay = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 40, method: "BANK_TRANSFER" })
        .expect(201);
      const afterFirst = (firstPay.body as { data: { invoice: InvoiceBody } }).data.invoice;
      expect(afterFirst.status).toBe("PARTIALLY_PAID");
      expect(afterFirst.paidAmount).toBe("40");
      expect(afterFirst.balanceDue).toBe("60");

      const secondPay = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 60, method: "CARD" })
        .expect(201);
      const afterSecond = (secondPay.body as { data: { invoice: InvoiceBody } }).data.invoice;
      expect(afterSecond.status).toBe("PAID");
      expect(afterSecond.balanceDue).toBe("0");

      const listRes = await request(app.getHttpServer())
        .get(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((listRes.body as { data: { items: unknown[] } }).data.items).toHaveLength(2);
    });

    it("there is no permanent delete route for payments", async () => {
      const admin = await registerAdmin(`Payment No Delete Org ${randomUUID()}`);
      await request(app.getHttpServer())
        .delete(`/payments/${randomUUID()}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  describe("overdue behavior", () => {
    it("lazily flips a SENT invoice to OVERDUE once dueDate has passed and balance remains", async () => {
      const admin = await registerAdmin(`Overdue Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
        dueDate: "2020-01-01T00:00:00.000Z",
      });
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const fetched = await request(app.getHttpServer())
        .get(`/invoices/${invoice.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((fetched.body as InvoiceResponse).data.status).toBe("OVERDUE");
    });
  });

  describe("expenses", () => {
    async function createExpense(admin: Awaited<ReturnType<typeof registerAdmin>>, overrides: Record<string, unknown> = {}) {
      const res = await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ category: "FUEL", description: "Diesel refill", amount: 80, ...overrides })
        .expect(201);
      return (res.body as ExpenseResponse).data;
    }

    it("starts PENDING with an auto-generated expenseNumber", async () => {
      const admin = await registerAdmin(`Expense Create Org ${randomUUID()}`);
      const expense = await createExpense(admin);
      expect(expense.status).toBe("PENDING");
      expect(expense.expenseNumber).toMatch(/^EXP-\d{4}-\d{4}$/);
    });

    it("only ADMIN/ACCOUNTANT can approve or reject; OPERATIONS_MANAGER cannot", async () => {
      const admin = await registerAdmin(`Expense Approve Role Org ${randomUUID()}`);
      const ops = await addMemberWithRole(admin, "OPERATIONS_MANAGER");
      const expense = await createExpense(admin);

      await request(app.getHttpServer())
        .post(`/expenses/${expense.id}/approve`)
        .set("Authorization", `Bearer ${ops.accessToken}`)
        .expect(403);

      const approved = await request(app.getHttpServer())
        .post(`/expenses/${expense.id}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((approved.body as ExpenseResponse).data.status).toBe("APPROVED");
    });

    it("rejects editing or re-deciding a non-PENDING expense", async () => {
      const admin = await registerAdmin(`Expense Edit After Decision Org ${randomUUID()}`);
      const expense = await createExpense(admin);
      await request(app.getHttpServer())
        .post(`/expenses/${expense.id}/reject`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ rejectionReason: "Missing receipt" })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/expenses/${expense.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 999 })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/expenses/${expense.id}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });

    it("SALES_CRM_MANAGER and DISPATCHER have no expense access at all", async () => {
      const admin = await registerAdmin(`Expense No Access Org ${randomUUID()}`);
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");
      const dispatcher = await addMemberWithRole(admin, "DISPATCHER");

      await request(app.getHttpServer())
        .get("/expenses")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get("/expenses")
        .set("Authorization", `Bearer ${dispatcher.accessToken}`)
        .expect(403);
    });

    it("there is no permanent delete route", async () => {
      const admin = await registerAdmin(`Expense No Delete Org ${randomUUID()}`);
      const expense = await createExpense(admin);
      await request(app.getHttpServer())
        .delete(`/expenses/${expense.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  describe("order profitability", () => {
    it("only APPROVED expenses count toward estimated gross profit", async () => {
      const admin = await registerAdmin(`Profitability Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await deliverOrder(admin, customer.id, { price: 1000 });

      const approvedExpense = await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId: order.id, category: "FUEL", description: "Fuel", amount: 120 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/expenses/${(approvedExpense.body as ExpenseResponse).data.id}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId: order.id, category: "TOLL", description: "Toll (unapproved)", amount: 500 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/finance/order-profitability/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const body = res.body as { data: { revenue: string; approvedExpenses: string; estimatedGrossProfit: string } };
      expect(body.data.revenue).toBe("1000");
      expect(body.data.approvedExpenses).toBe("120");
      expect(body.data.estimatedGrossProfit).toBe("880");
    });
  });

  describe("finance summary and role restrictions", () => {
    it("DISPATCHER can read finance summary but not the raw invoice/payment lists", async () => {
      const admin = await registerAdmin(`Dispatcher Finance Org ${randomUUID()}`);
      const dispatcher = await addMemberWithRole(admin, "DISPATCHER");

      const res = await request(app.getHttpServer())
        .get("/finance/summary")
        .set("Authorization", `Bearer ${dispatcher.accessToken}`)
        .expect(200);
      const body = res.body as { data: { invoices: { count: number }; expenses: { pendingCount: number } } };
      expect(typeof body.data.invoices.count).toBe("number");
      expect(typeof body.data.expenses.pendingCount).toBe("number");

      await request(app.getHttpServer())
        .get("/invoices")
        .set("Authorization", `Bearer ${dispatcher.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get("/payments")
        .set("Authorization", `Bearer ${dispatcher.accessToken}`)
        .expect(403);
    });

    it("SALES_CRM_MANAGER can create/read invoices but not send/cancel/record payments", async () => {
      const admin = await registerAdmin(`Sales Invoice Role Org ${randomUUID()}`);
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");
      const customer = await createCustomer(admin);

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({ customerId: customer.id, lineItems: [{ description: "X", quantity: 1, unitPrice: 10 }] })
        .expect(201);
      const invoice = (createRes.body as InvoiceResponse).data;

      await request(app.getHttpServer())
        .get(`/invoices/${invoice.id}`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({ amount: 5, method: "CASH" })
        .expect(403);
    });

    it("DRIVER has no finance access at all", async () => {
      const admin = await registerAdmin(`Driver Finance Role Org ${randomUUID()}`);
      const driver = await addMemberWithRole(admin, "DRIVER");
      await request(app.getHttpServer())
        .get("/finance/summary")
        .set("Authorization", `Bearer ${driver.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get("/invoices")
        .set("Authorization", `Bearer ${driver.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get("/expenses")
        .set("Authorization", `Bearer ${driver.accessToken}`)
        .expect(403);
    });
  });

  describe("tenancy isolation", () => {
    it("an invoice/expense id from another organization returns 404", async () => {
      const adminA = await registerAdmin(`Finance Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Finance Isolation Org B ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      const invoiceA = await createManualInvoice(adminA, customerA.id);

      await request(app.getHttpServer())
        .get(`/invoices/${invoiceA.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(404);

      const expenseRes = await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .send({ category: "FUEL", description: "X", amount: 10 })
        .expect(201);
      const expenseA = (expenseRes.body as ExpenseResponse).data;

      await request(app.getHttpServer())
        .get(`/expenses/${expenseA.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(404);
    });
  });

  describe("audit logs", () => {
    it("records invoice, payment, and expense actions", async () => {
      const admin = await registerAdmin(`Finance Audit Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const invoice = await createManualInvoice(admin, customer.id, {
        lineItems: [{ description: "X", quantity: 1, unitPrice: 50 }],
      });
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/send`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/payments`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ amount: 50, method: "CASH" })
        .expect(201);

      const invoiceLogs = await prisma.auditLog.findMany({
        where: { entityType: "Invoice", entityId: invoice.id },
        orderBy: { createdAt: "asc" },
      });
      expect(invoiceLogs.map((l) => l.action)).toEqual(["invoice.create", "invoice.send"]);

      const paymentLogs = await prisma.auditLog.findMany({ where: { entityType: "Payment" } });
      expect(paymentLogs.some((l) => l.action === "payment.record")).toBe(true);

      const expenseRes = await request(app.getHttpServer())
        .post("/expenses")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ category: "FUEL", description: "X", amount: 10 })
        .expect(201);
      const expense = (expenseRes.body as ExpenseResponse).data;
      await request(app.getHttpServer())
        .post(`/expenses/${expense.id}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const expenseLogs = await prisma.auditLog.findMany({
        where: { entityType: "Expense", entityId: expense.id },
        orderBy: { createdAt: "asc" },
      });
      expect(expenseLogs.map((l) => l.action)).toEqual(["expense.create", "expense.approve"]);
    });
  });
});
