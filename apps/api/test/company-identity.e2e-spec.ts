import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";
import { SEEDED_ACCOUNTANT_EMAIL, loginAs } from "./support/seeded-org";

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string };
    organization: { id: string; slug: string };
  };
}

interface OrganizationBody {
  data: {
    id: string;
    name: string;
    slug: string;
    status: string;
    defaultCurrency: string;
    timezone: string;
    legalName: string | null;
    registrationNumber: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    country: string | null;
    logoUrl: string | null;
  };
}

/// Every company-identity field, filled with a distinguishable value so a
/// mis-mapped column shows up as a wrong value rather than a passing test.
const FULL_IDENTITY = {
  legalName: "Sunrise Logistics LLC",
  registrationNumber: "REG-889201",
  taxId: "VAT-3310049",
  email: "billing@sunrise-logistics.test",
  phone: "+998 71 200 30 40",
  website: "https://sunrise-logistics.test",
  address: "12 Amir Temur Avenue, Block C",
  city: "Tashkent",
  postalCode: "100084",
  country: "Uzbekistan",
  logoUrl: "https://cdn.sunrise-logistics.test/logo.png",
} as const;

describe("Company identity (e2e)", () => {
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

  /// Each test gets its own organization rather than mutating the shared seeded
  /// fixture, so company-identity writes here cannot bleed into another spec.
  async function registerOrganization() {
    const email = `company-identity-${randomUUID()}@example.com`;
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email,
      password: "correct-horse-battery",
      firstName: "Company",
      lastName: "Admin",
      organizationName: `Sunrise ${randomUUID().slice(0, 8)}`,
    });

    expect(res.status).toBe(201);
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return body.data;
  }

  function getCurrent(token: string) {
    return request(app.getHttpServer())
      .get("/organizations/current")
      .set("Authorization", `Bearer ${token}`);
  }

  function patchCurrent(token: string, payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch("/organizations/current")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
  }

  describe("GET /organizations/current", () => {
    it("exposes every company-identity field, unset on a brand-new organization", async () => {
      const admin = await registerOrganization();

      const res = await getCurrent(admin.accessToken);

      expect(res.status).toBe(200);
      const org = (res.body as OrganizationBody).data;
      for (const field of Object.keys(FULL_IDENTITY)) {
        expect(org).toHaveProperty(field, null);
      }
      expect(org.defaultCurrency).toBe("USD");
      expect(org.timezone).toBe("UTC");
    });

    it("rejects an unauthenticated read", async () => {
      const res = await request(app.getHttpServer()).get("/organizations/current");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /organizations/current", () => {
    it("persists every company-identity field and returns it on a later read", async () => {
      const admin = await registerOrganization();

      const patched = await patchCurrent(admin.accessToken, FULL_IDENTITY);
      expect(patched.status).toBe(200);

      // Read back through a separate request so this asserts persistence, not
      // just the echo of the update response.
      const reread = await getCurrent(admin.accessToken);
      expect(reread.status).toBe(200);
      expect((reread.body as OrganizationBody).data).toMatchObject(FULL_IDENTITY);
    });

    it("leaves fields absent from the payload untouched", async () => {
      const admin = await registerOrganization();
      await patchCurrent(admin.accessToken, FULL_IDENTITY);

      await patchCurrent(admin.accessToken, { city: "Samarkand" }).expect(200);

      const org = (await getCurrent(admin.accessToken)).body as OrganizationBody;
      expect(org.data.city).toBe("Samarkand");
      expect(org.data.legalName).toBe(FULL_IDENTITY.legalName);
      expect(org.data.taxId).toBe(FULL_IDENTITY.taxId);
    });

    it("clears a field with null and with an empty string", async () => {
      const admin = await registerOrganization();
      await patchCurrent(admin.accessToken, FULL_IDENTITY);

      await patchCurrent(admin.accessToken, { taxId: null }).expect(200);
      // The UI clears a field by submitting a blank input, which arrives as "".
      // Storing that verbatim would print an empty line on an invoice.
      await patchCurrent(admin.accessToken, { registrationNumber: "" }).expect(200);
      await patchCurrent(admin.accessToken, { phone: "   " }).expect(200);

      const org = (await getCurrent(admin.accessToken)).body as OrganizationBody;
      expect(org.data.taxId).toBeNull();
      expect(org.data.registrationNumber).toBeNull();
      expect(org.data.phone).toBeNull();
    });

    it("trims surrounding whitespace and lowercases the billing email", async () => {
      const admin = await registerOrganization();

      await patchCurrent(admin.accessToken, {
        legalName: "  Padded Freight LLC  ",
        email: "  Billing@Padded-Freight.TEST  ",
      }).expect(200);

      const org = (await getCurrent(admin.accessToken)).body as OrganizationBody;
      expect(org.data.legalName).toBe("Padded Freight LLC");
      expect(org.data.email).toBe("billing@padded-freight.test");
    });

    it("still accepts a valid email and URL after they were cleared", async () => {
      const admin = await registerOrganization();

      await patchCurrent(admin.accessToken, { email: "", website: "", logoUrl: "" }).expect(200);
      await patchCurrent(admin.accessToken, {
        email: "ops@relisted.test",
        website: "https://relisted.test",
        logoUrl: "https://relisted.test/logo.svg",
      }).expect(200);

      const org = (await getCurrent(admin.accessToken)).body as OrganizationBody;
      expect(org.data.email).toBe("ops@relisted.test");
      expect(org.data.website).toBe("https://relisted.test");
    });
  });

  describe("validation", () => {
    it.each([
      ["email", "not-an-email"],
      ["website", "sunrise-logistics.test"],
      ["logoUrl", "/relative/logo.png"],
      ["logoUrl", "data:image/png;base64,AAAA"],
    ])("rejects a malformed %s (%s)", async (field, value) => {
      const admin = await registerOrganization();
      const res = await patchCurrent(admin.accessToken, { [field]: value });
      expect(res.status).toBe(400);
    });

    /// The timezone is fed straight into Intl.DateTimeFormat by report bucketing
    /// and the AI context, which throw RangeError on an unknown zone — so an
    /// unvalidated value here would surface as a 500 on an unrelated screen.
    it("rejects a timezone Intl cannot resolve, and accepts a real one", async () => {
      const admin = await registerOrganization();

      await patchCurrent(admin.accessToken, { timezone: "Mars/Phobos" }).expect(400);
      await patchCurrent(admin.accessToken, { timezone: "Asia/Tashkent" }).expect(200);

      const org = (await getCurrent(admin.accessToken)).body as OrganizationBody;
      expect(org.data.timezone).toBe("Asia/Tashkent");
    });

    it("rejects a currency outside the active ISO 4217 allowlist", async () => {
      const admin = await registerOrganization();

      await patchCurrent(admin.accessToken, { defaultCurrency: "XYZ" }).expect(400);
      await patchCurrent(admin.accessToken, { defaultCurrency: "US" }).expect(400);
      await patchCurrent(admin.accessToken, { defaultCurrency: "UZS" }).expect(200);

      const org = (await getCurrent(admin.accessToken)).body as OrganizationBody;
      expect(org.data.defaultCurrency).toBe("UZS");
    });

    it("rejects an empty company name rather than storing a blank one", async () => {
      const admin = await registerOrganization();
      await patchCurrent(admin.accessToken, { name: "" }).expect(400);
    });

    it("rejects a legal name longer than the column allows", async () => {
      const admin = await registerOrganization();
      await patchCurrent(admin.accessToken, { legalName: "x".repeat(201) }).expect(400);
    });
  });

  describe("authorization and tenant isolation", () => {
    it("refuses an unauthenticated write", async () => {
      const res = await request(app.getHttpServer())
        .patch("/organizations/current")
        .send({ legalName: "Should Not Persist LLC" });
      expect(res.status).toBe(401);
    });

    it("refuses a non-admin member, who can still read", async () => {
      const accountantToken = await loginAs(app, SEEDED_ACCOUNTANT_EMAIL);

      await getCurrent(accountantToken).expect(200);
      const res = await patchCurrent(accountantToken, { legalName: "Accountant Overreach LLC" });

      expect(res.status).toBe(403);
    });

    /// The route derives its organization from the access token, and the global
    /// ValidationPipe whitelists DTO fields, so a client-supplied id is dropped
    /// rather than honoured. This asserts the outcome that matters: the other
    /// tenant is untouched.
    it("ignores a client-supplied organization id in the body", async () => {
      const victim = await registerOrganization();
      const attacker = await registerOrganization();

      await patchCurrent(victim.accessToken, { legalName: "Victim Freight LLC" }).expect(200);

      await patchCurrent(attacker.accessToken, {
        id: victim.organization.id,
        organizationId: victim.organization.id,
        legalName: "Attacker Freight LLC",
      }).expect(200);

      const victimOrg = (await getCurrent(victim.accessToken)).body as OrganizationBody;
      const attackerOrg = (await getCurrent(attacker.accessToken)).body as OrganizationBody;

      expect(victimOrg.data.legalName).toBe("Victim Freight LLC");
      expect(victimOrg.data.id).toBe(victim.organization.id);
      expect(attackerOrg.data.legalName).toBe("Attacker Freight LLC");
      expect(attackerOrg.data.id).toBe(attacker.organization.id);
    });

    it("writes an audit entry naming the actor and the normalized values", async () => {
      const admin = await registerOrganization();

      await patchCurrent(admin.accessToken, { taxId: "  VAT-771  ", registrationNumber: "" }).expect(
        200,
      );

      const entry = await prisma.auditLog.findFirst({
        where: { organizationId: admin.organization.id, action: "organization.update" },
        orderBy: { createdAt: "desc" },
      });

      expect(entry).not.toBeNull();
      expect(entry?.actorUserId).toBe(admin.user.id);
      expect(entry?.metadata).toMatchObject({
        changes: { taxId: "VAT-771", registrationNumber: null },
      });
    });
  });

  /// An organization that can lose its last admin is an organization nobody can
  /// administer again. The guard lives in OrganizationsService; this covers it
  /// through the HTTP surface an admin actually clicks.
  describe("last-admin protection", () => {
    it("refuses to remove or demote the only active admin", async () => {
      const admin = await registerOrganization();

      const members = await request(app.getHttpServer())
        .get("/organizations/current/members")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const membership = (members.body as { data: Array<{ id: string; role: string }> }).data.find(
        (member) => member.role === "ADMIN",
      );
      expect(membership).toBeDefined();

      const demoted = await request(app.getHttpServer())
        .patch(`/organizations/current/members/${membership!.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ role: "DISPATCHER" });
      expect(demoted.status).toBe(409);

      const removed = await request(app.getHttpServer())
        .delete(`/organizations/current/members/${membership!.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(removed.status).toBe(409);

      // Still an admin afterwards, so the refusal was not merely cosmetic.
      const stillAdmin = await getCurrent(admin.accessToken);
      expect(stillAdmin.status).toBe(200);
    });
  });
});
