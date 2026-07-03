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
  organizationId: string;
  customerCode: string;
  companyName: string;
  contactName: string;
  creditLimit: string;
  status: string;
  archivedAt: string | null;
}

interface CustomerResponse {
  data: CustomerBody;
}

interface CustomerListResponse {
  data: {
    items: CustomerBody[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  };
}

interface ErrorBody {
  error: { statusCode: number; message: string | string[] };
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe("Customers (e2e)", () => {
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
      .send({
        email: memberEmail,
        password: "correct-horse-battery",
        organizationSlug: admin.organization.slug,
      })
      .expect(200);

    return { email: memberEmail, accessToken: (loginRes.body as AuthResultBody).data.accessToken };
  }

  async function createCustomer(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        companyName: "Acme Logistics",
        contactName: "Jane Doe",
        ...overrides,
      })
      .expect(201);
    return (res.body as CustomerResponse).data;
  }

  describe("authenticated CRUD", () => {
    it("creates a customer with an auto-generated code and returns it, then reads/updates it", async () => {
      const admin = await registerAdmin(`CRUD Org ${randomUUID()}`);

      const created = await createCustomer(admin, {
        contactName: "Ada Lovelace",
        email: "ada@example.com",
        creditLimit: 15000,
      });
      expect(created.customerCode).toMatch(/^CUS-\d{4}$/);
      expect(created.creditLimit).toBe("15000");
      expect(created.status).toBe("ACTIVE");

      const fetched = await request(app.getHttpServer())
        .get(`/customers/${created.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((fetched.body as CustomerResponse).data.companyName).toBe("Acme Logistics");

      const updated = await request(app.getHttpServer())
        .patch(`/customers/${created.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "Acme Logistics International", status: "AT_RISK" })
        .expect(200);
      const updatedBody = (updated.body as CustomerResponse).data;
      expect(updatedBody.companyName).toBe("Acme Logistics International");
      expect(updatedBody.status).toBe("AT_RISK");
    });

    it("rejects all requests with no token", async () => {
      await request(app.getHttpServer()).get("/customers").expect(401);
      await request(app.getHttpServer()).post("/customers").send({}).expect(401);
    });

    it("there is no permanent delete route", async () => {
      const admin = await registerAdmin(`No Delete Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      await request(app.getHttpServer())
        .delete(`/customers/${customer.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404); // no such route exists at all
    });
  });

  describe("validation", () => {
    it("rejects a create request missing required fields", async () => {
      const admin = await registerAdmin(`Validation Org ${randomUUID()}`);

      const res = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ contactName: "Missing Company Name" })
        .expect(400);
      expect((res.body as ErrorBody).error.message).toBeDefined();
    });

    it("rejects an invalid customerCode format", async () => {
      const admin = await registerAdmin(`Validation Org ${randomUUID()}`);

      await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "X", contactName: "Y", customerCode: "has space" })
        .expect(400);
    });

    it("rejects an unknown query parameter on the list endpoint", async () => {
      const admin = await registerAdmin(`Validation Org ${randomUUID()}`);

      await request(app.getHttpServer())
        .get("/customers?hasOverdueBalance=true")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
    });
  });

  describe("customer code uniqueness", () => {
    it("rejects a duplicate customerCode within the same organization", async () => {
      const admin = await registerAdmin(`Code Uniqueness Org ${randomUUID()}`);
      await createCustomer(admin, { customerCode: "ACME-001" });

      const res = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "Another Co", contactName: "Someone", customerCode: "ACME-001" })
        .expect(409);
      expect((res.body as ErrorBody).error.message).toMatch(/already exists/i);
    });

    it("allows the same customerCode to be reused across different organizations", async () => {
      const adminA = await registerAdmin(`Reuse Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Reuse Org B ${randomUUID()}`);

      await createCustomer(adminA, { customerCode: "SHARED-001" });
      const customerB = await createCustomer(adminB, { customerCode: "SHARED-001" });
      expect(customerB.customerCode).toBe("SHARED-001");
    });
  });

  describe("organization isolation", () => {
    it("a customer id from another organization returns 404, never leaking existence", async () => {
      const adminA = await registerAdmin(`Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Isolation Org B ${randomUUID()}`);
      const customerA = await createCustomer(adminA);

      await request(app.getHttpServer())
        .get(`/customers/${customerA.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/customers/${customerA.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .send({ companyName: "Hijacked" })
        .expect(404);
    });

    it("a list only ever returns the caller's own organization's customers", async () => {
      const adminA = await registerAdmin(`List Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`List Isolation Org B ${randomUUID()}`);
      await createCustomer(adminA, { companyName: "Only In A" });
      await createCustomer(adminB, { companyName: "Only In B" });

      const res = await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .expect(200);
      const items = (res.body as CustomerListResponse).data.items;
      expect(items.every((c) => c.organizationId === adminA.organization.id)).toBe(true);
      expect(items.some((c) => c.companyName === "Only In B")).toBe(false);
    });
  });

  describe("role restrictions", () => {
    it("read-only roles can list/view but not create/update/archive", async () => {
      const admin = await registerAdmin(`Role Restriction Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const accountant = await addMemberWithRole(admin, "ACCOUNTANT");

      await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .send({ companyName: "X", contactName: "Y" })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/customers/${customer.id}`)
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .send({ companyName: "Hijacked" })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/archive`)
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .expect(403);
    });

    it("DRIVER has no access at all", async () => {
      const admin = await registerAdmin(`Driver No Access Org ${randomUUID()}`);
      const driver = await addMemberWithRole(admin, "DRIVER");

      await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${driver.accessToken}`)
        .expect(403);
    });

    it("SALES_CRM_MANAGER can create/update/archive like ADMIN", async () => {
      const admin = await registerAdmin(`Sales Manager Org ${randomUUID()}`);
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");

      const res = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({ companyName: "Sales Created Co", contactName: "Someone" })
        .expect(201);
      const customer = (res.body as CustomerResponse).data;

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/archive`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(200);
    });
  });

  describe("archive/restore", () => {
    it("archives, excludes from default list, includes with includeArchived, then restores", async () => {
      const admin = await registerAdmin(`Archive Restore Org ${randomUUID()}`);
      const customer = await createCustomer(admin, { companyName: "Archive Me" });

      const archived = await request(app.getHttpServer())
        .post(`/customers/${customer.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((archived.body as CustomerResponse).data.status).toBe("ARCHIVED");
      expect((archived.body as CustomerResponse).data.archivedAt).not.toBeNull();

      const defaultList = await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(
        (defaultList.body as CustomerListResponse).data.items.some((c) => c.id === customer.id),
      ).toBe(false);

      const withArchived = await request(app.getHttpServer())
        .get("/customers?includeArchived=true")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(
        (withArchived.body as CustomerListResponse).data.items.some((c) => c.id === customer.id),
      ).toBe(true);

      // Can't archive again, can't edit while archived.
      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .patch(`/customers/${customer.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "Edit While Archived" })
        .expect(409);

      const restored = await request(app.getHttpServer())
        .post(`/customers/${customer.id}/restore`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((restored.body as CustomerResponse).data.status).toBe("ACTIVE");
      expect((restored.body as CustomerResponse).data.archivedAt).toBeNull();

      // Can't restore something that's not archived.
      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/restore`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });
  });

  describe("list search/filter/sort/pagination", () => {
    it("supports search, status filter, sorting, and pagination together", async () => {
      const admin = await registerAdmin(`List Features Org ${randomUUID()}`);
      await createCustomer(admin, { companyName: "Zeta Freight", contactName: "Zed", city: "Tashkent" });
      await createCustomer(admin, { companyName: "Alpha Freight", contactName: "Ann", city: "Samarkand" });
      await createCustomer(admin, {
        companyName: "Beta Shipping",
        contactName: "Bea",
        city: "Tashkent",
      });

      const searchRes = await request(app.getHttpServer())
        .get("/customers?search=Tashkent")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((searchRes.body as CustomerListResponse).data.items).toHaveLength(2);

      const sortedRes = await request(app.getHttpServer())
        .get("/customers?sortBy=companyName&sortOrder=asc&limit=100")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const names = (sortedRes.body as CustomerListResponse).data.items.map((c) => c.companyName);
      expect(names).toEqual(["Alpha Freight", "Beta Shipping", "Zeta Freight"]);

      const page1 = await request(app.getHttpServer())
        .get("/customers?limit=2&page=1&sortBy=companyName&sortOrder=asc")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const page1Body = (page1.body as CustomerListResponse).data;
      expect(page1Body.items).toHaveLength(2);
      expect(page1Body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    });

    it("rejects a sortBy field that isn't allowlisted", async () => {
      const admin = await registerAdmin(`Sort Allowlist Org ${randomUUID()}`);
      await request(app.getHttpServer())
        .get("/customers?sortBy=internalNotes")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
    });
  });

  describe("audit logs", () => {
    it("records create, update, archive, and restore actions", async () => {
      const admin = await registerAdmin(`Audit Org ${randomUUID()}`);
      const customer = await createCustomer(admin);

      await request(app.getHttpServer())
        .patch(`/customers/${customer.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "Renamed" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/restore`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: "Customer", entityId: customer.id },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((l) => l.action)).toEqual([
        "customer.create",
        "customer.update",
        "customer.archive",
        "customer.restore",
      ]);
      expect(logs.every((l) => l.organizationId === admin.organization.id)).toBe(true);
    });
  });
});
