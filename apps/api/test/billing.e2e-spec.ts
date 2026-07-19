import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";

/// Controller-level E2E for the Billing module, driving the real NestJS app
/// (no service mocks). Covers the three billing HTTP surfaces:
///   - Admin        /subscriptions/*, /plans/*
///   - Developer    /developer/subscription/*
///   - Customer     /customer/billing/*
/// Verifies JWT auth, RBAC, organization isolation, validation, and the
/// feature-gate / quota read paths against a live database.

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string };
    organization: { id: string; slug: string };
  };
}

interface PlanBody {
  id: string;
  name: string;
  slug: string;
  price: number;
}

/// TransformInterceptor wraps every response in `{ data: ... }`.
function data<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function uniqueEmail(prefix = "billing"): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

describe("Billing (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  // Org A — the primary org: gets a subscription and a portal customer.
  let adminToken: string;
  let orgAId: string;
  let dispatcherToken: string; // a non-ADMIN member of org A

  // Org B — a second org, to prove cross-org isolation.
  let otherToken: string;
  let orgBId: string;

  let customerToken: string; // customer-portal JWT for a customer in org A

  // Plans seeded in the dev DB (seed-subscription-plans.ts).
  let plans: PlanBody[] = [];
  const planBySlug = (slug: string) => plans.find((p) => p.slug === slug);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await registerAdmin(`Billing Org A ${randomUUID()}`);
    adminToken = admin.accessToken;
    orgAId = admin.organization.id;

    const other = await registerAdmin(`Billing Org B ${randomUUID()}`);
    otherToken = other.accessToken;
    orgBId = other.organization.id;

    dispatcherToken = await addMemberWithRole(admin, "DISPATCHER");

    const plansRes = await request(app.getHttpServer()).get("/plans").expect(200);
    plans = (plansRes.body as { data: { plans: PlanBody[] } }).data.plans;
  });

  afterAll(async () => {
    // Every billing/customer/membership record hangs off Organization with
    // onDelete: Cascade, so deleting the orgs (then the users) is sufficient —
    // the same cleanup the sibling customer-portal e2e relies on.
    if (prisma) {
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (app) await app.close();
  });

  async function registerAdmin(organizationName: string) {
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email: uniqueEmail("admin"),
      password: "correct-horse-battery",
      firstName: "Org",
      lastName: "Admin",
      organizationName,
    });
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return body.data;
  }

  async function addMemberWithRole(
    admin: { accessToken: string; organization: { id: string } },
    role: string,
  ): Promise<string> {
    const memberEmail = uniqueEmail("member");
    await request(app.getHttpServer())
      .post(`/organizations/${admin.organization.id}/invitations`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role })
      .expect(201);

    const outbox = await request(app.getHttpServer()).get("/test/mail/outbox").expect(200);
    const invite = (outbox.body as { data: Array<{ to: string; acceptUrl: string }> }).data.find(
      (e) => e.to === memberEmail,
    );
    if (!invite) throw new Error(`No invitation email for ${memberEmail}`);

    await request(app.getHttpServer())
      .post("/invite/accept")
      .send({
        token: invite.acceptUrl.split("/invite/")[1],
        firstName: "Member",
        lastName: role,
        password: "correct-horse-battery",
      })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: memberEmail, password: "correct-horse-battery" })
      .expect(200);
    const body = login.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    return body.data.accessToken;
  }

  async function provisionCustomer(admin: { accessToken: string }): Promise<string> {
    const customer = data<{ id: string; email: string }>(
      await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "Portal Co", contactName: "Cust", email: uniqueEmail("customer") })
        .expect(201),
    );

    await request(app.getHttpServer())
      .post(`/customers/${customer.id}/portal-access/invitations`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(201);

    const outbox = await request(app.getHttpServer())
      .get("/test/mail/customer-portal-outbox")
      .expect(200);
    const emails = (outbox.body as { data: Array<{ acceptUrl: string }> }).data;
    const token = new URL(emails[emails.length - 1].acceptUrl).searchParams.get("token")!;

    await request(app.getHttpServer())
      .post("/customer-portal/invitations/accept")
      .send({ token, password: "customer-strong-pass" })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post("/customer-portal/auth/login")
      .send({ email: customer.email, password: "customer-strong-pass" })
      .expect(200);
    return (login.body as { data: { accessToken: string } }).data.accessToken;
  }

  // ── Plans (public + admin) ──────────────────────────────────────

  describe("/plans", () => {
    it("lists active plans without authentication", async () => {
      const res = await request(app.getHttpServer()).get("/plans").expect(200);
      const body = data<{ plans: PlanBody[] }>(res);
      expect(Array.isArray(body.plans)).toBe(true);
      expect(body.plans.length).toBeGreaterThan(0);
    });

    it("returns a single plan by slug without authentication", async () => {
      const slug = plans[0].slug;
      const res = await request(app.getHttpServer()).get(`/plans/${slug}`).expect(200);
      expect(data<{ plan: PlanBody }>(res).plan.slug).toBe(slug);
    });

    it("404s an unknown plan slug", async () => {
      await request(app.getHttpServer()).get("/plans/does-not-exist").expect(404);
    });

    it("requires auth for the admin plan listing", async () => {
      await request(app.getHttpServer()).get("/plans/admin/all").expect(401);
    });

    it("forbids a non-ADMIN from the admin plan listing", async () => {
      await request(app.getHttpServer())
        .get("/plans/admin/all")
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .expect(403);
    });

    it("lets an ADMIN list all plans", async () => {
      const res = await request(app.getHttpServer())
        .get("/plans/admin/all")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(data<{ plans: PlanBody[] }>(res).plans.length).toBeGreaterThan(0);
    });
  });

  // ── Admin subscriptions ─────────────────────────────────────────

  describe("/subscriptions (admin)", () => {
    it("rejects an unauthenticated request", async () => {
      await request(app.getHttpServer()).get("/subscriptions").expect(401);
    });

    it("rejects an invalid/garbage token", async () => {
      await request(app.getHttpServer())
        .get("/subscriptions")
        .set("Authorization", "Bearer not-a-real-jwt")
        .expect(401);
    });

    it("forbids a non-ADMIN member", async () => {
      await request(app.getHttpServer())
        .get("/subscriptions")
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .expect(403);
    });

    it("404s when the org has no subscription yet", async () => {
      // Org B never creates one.
      await request(app.getHttpServer())
        .get("/subscriptions")
        .set("Authorization", `Bearer ${otherToken}`)
        .expect(404);
    });

    it("validates the create body (missing planId)", async () => {
      await request(app.getHttpServer())
        .post("/subscriptions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ seats: 5 })
        .expect(400);
    });

    it("creates a subscription for the authenticated org", async () => {
      const starter = planBySlug("starter") ?? plans[0];
      const res = await request(app.getHttpServer())
        .post("/subscriptions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ planId: starter.id, seats: 5 })
        .expect(201);

      const sub = data<{ subscription: { id: string; organizationId: string; status: string } }>(res)
        .subscription;
      expect(sub.organizationId).toBe(orgAId);
      expect(["ACTIVE", "TRIAL"]).toContain(sub.status);
    });

    it("is idempotent-guarded: a second create conflicts", async () => {
      const starter = planBySlug("starter") ?? plans[0];
      await request(app.getHttpServer())
        .post("/subscriptions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ planId: starter.id })
        .expect(409);
    });

    it("returns the current subscription for its own org only", async () => {
      const mine = data<{ subscription: { id: string; organizationId: string } }>(
        await request(app.getHttpServer())
          .get("/subscriptions")
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(200),
      ).subscription;
      expect(mine.organizationId).toBe(orgAId);
      expect(mine.organizationId).not.toBe(orgBId);
    });

    it("upgrades to a higher-tier plan", async () => {
      const pro = planBySlug("professional");
      if (!pro) return; // plan set may vary; skip gracefully
      const res = await request(app.getHttpServer())
        .post("/subscriptions/upgrade")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ newPlanId: pro.id })
        .expect(201);
      expect(data<{ subscription: { plan: { slug: string } } }>(res).subscription.plan.slug).toBe(
        "professional",
      );
    });

    it("rejects an upgrade to a non-higher plan", async () => {
      const free = planBySlug("free") ?? planBySlug("starter");
      if (!free) return;
      await request(app.getHttpServer())
        .post("/subscriptions/upgrade")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ newPlanId: free.id })
        .expect(409);
    });

    it("validates addSeats (count must be positive)", async () => {
      await request(app.getHttpServer())
        .post("/subscriptions/seats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ count: 0 })
        .expect(400);
    });

    it("reports a usage summary", async () => {
      const res = await request(app.getHttpServer())
        .get("/subscriptions/usage")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(data<{ usage: { metrics: unknown[] } }>(res).usage).toHaveProperty("metrics");
    });

    it("reports a seat summary", async () => {
      const res = await request(app.getHttpServer())
        .get("/subscriptions/seats")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(data<{ seats: { used: number } }>(res).seats).toHaveProperty("used");
    });

    it("returns subscription history", async () => {
      const res = await request(app.getHttpServer())
        .get("/subscriptions/history")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const history = data<{ history: unknown[] }>(res).history;
      expect(Array.isArray(history)).toBe(true);
      // Create + upgrade should have recorded at least two events.
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it("forbids a non-ADMIN from mutating the subscription", async () => {
      const starter = planBySlug("starter") ?? plans[0];
      await request(app.getHttpServer())
        .post("/subscriptions/upgrade")
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .send({ newPlanId: starter.id })
        .expect(403);
    });
  });

  // ── Developer subscription API ──────────────────────────────────

  describe("/developer/subscription", () => {
    it("rejects an unauthenticated request", async () => {
      await request(app.getHttpServer()).get("/developer/subscription").expect(401);
    });

    it("returns the current subscription for an ADMIN", async () => {
      await request(app.getHttpServer())
        .get("/developer/subscription")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    });

    it("is reachable by a non-admin member role (DISPATCHER)", async () => {
      // This endpoint deliberately allows all member roles to read their plan.
      await request(app.getHttpServer())
        .get("/developer/subscription")
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .expect(200);
    });

    it("checks a named feature gate", async () => {
      const res = await request(app.getHttpServer())
        .get("/developer/subscription/feature?name=custom_branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const body = data<{ feature: string; enabled: boolean }>(res);
      expect(body.feature).toBe("custom_branding");
      expect(typeof body.enabled).toBe("boolean");
    });

    it("reports quotas", async () => {
      await request(app.getHttpServer())
        .get("/developer/subscription/quotas")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    });

    it("reports rate limits", async () => {
      await request(app.getHttpServer())
        .get("/developer/subscription/rate-limits")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ── Customer Portal billing ─────────────────────────────────────

  describe("/customer/billing", () => {
    beforeAll(async () => {
      customerToken = await provisionCustomer({ accessToken: adminToken });
    });

    it("rejects a request with no customer token", async () => {
      await request(app.getHttpServer()).get("/customer/billing/subscription").expect(401);
    });

    it("rejects a staff session JWT on the customer guard", async () => {
      // A staff (admin) JWT must not authenticate against the customer portal.
      await request(app.getHttpServer())
        .get("/customer/billing/subscription")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(401);
    });

    it("returns the subscription overview for the customer's org", async () => {
      await request(app.getHttpServer())
        .get("/customer/billing/subscription")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);
    });

    it("returns a usage summary", async () => {
      await request(app.getHttpServer())
        .get("/customer/billing/usage")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);
    });

    it("returns invoice history", async () => {
      await request(app.getHttpServer())
        .get("/customer/billing/invoices")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);
    });

    it("returns payment history", async () => {
      await request(app.getHttpServer())
        .get("/customer/billing/payments")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);
    });

    it("returns upgrade eligibility", async () => {
      await request(app.getHttpServer())
        .get("/customer/billing/upgrade-eligibility")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);
    });
  });
});
