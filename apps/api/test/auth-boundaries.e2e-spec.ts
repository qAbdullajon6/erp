/// Session, tenant-lifecycle and platform-support boundary probes (WS-8).
///
/// auth.e2e-spec.ts already covers the happy paths of login, rotation and the
/// password reset flow. This spec covers the boundaries around them, where the
/// question is not "does the credential work" but "does it stop working the
/// moment it should":
///
///   - an organization that is suspended or archived must stop transacting on
///     every credential type at once, including bearers already in the wild;
///   - the last ADMIN of a tenant must not be able to lock the tenant out;
///   - a reset link in flight must not survive the password change that was the
///     user's reaction to suspecting compromise;
///   - Open ERP (platform support) must be auditable at entry and exit, must
///     confine the operator to the organization they entered, and must lose its
///     tenant credential the moment the staff flag behind it is revoked.
///
/// Every organization used here is created by the spec itself. Nothing suspends,
/// archives or re-homes the shared seeded fixture org, because other specs
/// authenticate against it.

import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";
import { MailOutbox } from "../src/mail/mail.outbox";
import { PasswordService } from "../src/auth/password.service";
import { loginAs, SEEDED_PLATFORM_EMAIL } from "./support/seeded-org";

interface AuthBody {
  data: {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
    organization: { id: string; slug: string };
    membership: { id: string; role: string };
  };
}

const TENANT_PASSWORD = "boundary-probe-password-1";

describe("Auth and tenant boundaries (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: MailOutbox;
  let passwords: PasswordService;
  let platformToken: string;

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
    // MailOutbox is deliberately not exported from MailModule, so reach it
    // through the whole-container lookup rather than re-wiring MailService: the
    // real provider chain is what records both reset and portal invitations.
    outbox = app.get(MailOutbox, { strict: false });
    passwords = app.get(PasswordService, { strict: false });
    platformToken = await loginAs(app, SEEDED_PLATFORM_EMAIL);
  });

  afterAll(async () => {
    // Leave no support session open behind us: the seeded platform operator is
    // shared with other specs, and JwtStrategy confines them to whatever
    // organization the newest open session names.
    await prisma.platformSupportSession.updateMany({
      where: { endedAt: null },
      data: { endedAt: new Date() },
    });
    // API keys and devices do not cascade from Organization, so they have to go
    // first or the cleanup fails and leaves the Nest app open.
    const owned = { organizationId: { in: createdOrganizationIds } };
    await prisma.apiKey.deleteMany({ where: owned });
    await prisma.telematicsDevice.deleteMany({ where: owned });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  /// A brand-new tenant with exactly one ADMIN, which is the shape every real
  /// signup starts in.
  async function registerTenant(): Promise<AuthBody["data"] & { email: string }> {
    const email = `boundary-${randomUUID()}@example.com`;
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email,
        password: TENANT_PASSWORD,
        firstName: "Boundary",
        lastName: "Probe",
        organizationName: `Boundary Org ${randomUUID()}`,
      })
      .expect(201);

    const { data } = res.body as AuthBody;
    createdUserIds.push(data.user.id);
    createdOrganizationIds.push(data.organization.id);
    return { email, ...data };
  }

  function get(path: string, token: string) {
    return request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`);
  }

  describe("a suspended organization cannot transact", () => {
    it("stops bearers already issued, refresh and re-login, then resumes on reactivation", async () => {
      const tenant = await registerTenant();
      await get("/customers", tenant.accessToken).expect(200);

      await request(app.getHttpServer())
        .patch(`/platform/organizations/${tenant.organization.id}/status`)
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ status: "SUSPENDED" })
        .expect(200);

      // Reads, writes and both ways of obtaining a new credential all close.
      await get("/customers", tenant.accessToken).expect(401);
      await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({
          customerCode: `WS8-SUSPENDED-${randomUUID().slice(0, 8)}`,
          companyName: "Should Never Exist",
          contactName: "Nobody",
        })
        .expect(401);
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: tenant.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: tenant.email, password: TENANT_PASSWORD })
        .expect(401);

      // Suspension is what closed it, not something incidental to the fixture.
      await request(app.getHttpServer())
        .patch(`/platform/organizations/${tenant.organization.id}/status`)
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ status: "ACTIVE" })
        .expect(200);
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: tenant.email, password: TENANT_PASSWORD })
        .expect(200);

      const audit = await prisma.auditLog.findFirst({
        where: { organizationId: tenant.organization.id, action: "platform.org.suspend" },
      });
      expect(audit).not.toBeNull();
    });

    it("refuses a tenant ADMIN who tries to reactivate their own suspended organization", async () => {
      const tenant = await registerTenant();
      await prisma.organization.update({
        where: { id: tenant.organization.id },
        data: { status: "SUSPENDED" },
      });

      // The tenant's own bearer is already dead, but the platform route must
      // also refuse it on the staff flag rather than on the org status alone.
      await request(app.getHttpServer())
        .patch(`/platform/organizations/${tenant.organization.id}/status`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({ status: "ACTIVE" })
        .expect(401);

      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: tenant.organization.id },
      });
      expect(org.status).toBe("SUSPENDED");
    });
  });

  describe("an archived organization is gone for every credential type", () => {
    it("refuses the access token, refresh and login once deletedAt is set", async () => {
      const tenant = await registerTenant();
      await prisma.organization.update({
        where: { id: tenant.organization.id },
        data: { deletedAt: new Date() },
      });

      await get("/orders", tenant.accessToken).expect(401);
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: tenant.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: tenant.email, password: TENANT_PASSWORD })
        .expect(401);
    });

    it("hides an archived organization from the platform console and refuses Open ERP into it", async () => {
      const tenant = await registerTenant();
      await prisma.organization.update({
        where: { id: tenant.organization.id },
        data: { deletedAt: new Date() },
      });

      await get(`/platform/organizations/${tenant.organization.id}`, platformToken).expect(404);
      await request(app.getHttpServer())
        .post(`/platform/organizations/${tenant.organization.id}/enter`)
        .set("Authorization", `Bearer ${platformToken}`)
        .expect(404);
    });
  });

  describe("the last ADMIN cannot lock the tenant out", () => {
    it("refuses to demote or remove the only remaining ADMIN", async () => {
      const tenant = await registerTenant();

      await request(app.getHttpServer())
        .patch(`/organizations/current/members/${tenant.membership.id}`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({ role: "DISPATCHER" })
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/organizations/current/members/${tenant.membership.id}`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .patch(`/organizations/current/members/${tenant.membership.id}`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({ status: "REMOVED" })
        .expect(409);

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: tenant.membership.id },
      });
      expect(membership.role).toBe("ADMIN");
      expect(membership.status).toBe("ACTIVE");
    });

    it("allows the demotion once a second real ADMIN exists", async () => {
      const tenant = await registerTenant();
      const second = await prisma.user.create({
        data: {
          email: `second-admin-${randomUUID()}@example.com`,
          firstName: "Second",
          lastName: "Admin",
          passwordHash: await passwords.hash(TENANT_PASSWORD),
        },
      });
      createdUserIds.push(second.id);
      await prisma.membership.create({
        data: {
          organizationId: tenant.organization.id,
          userId: second.id,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });

      await request(app.getHttpServer())
        .patch(`/organizations/current/members/${tenant.membership.id}`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({ role: "DISPATCHER" })
        .expect(200);
    });

    it("does not count a platform support seat as the second ADMIN", async () => {
      const tenant = await registerTenant();
      const entered = await request(app.getHttpServer())
        .post(`/platform/organizations/${tenant.organization.id}/enter`)
        .set("Authorization", `Bearer ${platformToken}`)
        .expect(201);
      const supportToken = (entered.body as AuthBody).data.accessToken;

      // The operator now holds an ACTIVE ADMIN membership in this tenant. If
      // that seat were counted, the tenant's real last admin could demote
      // themselves and lose control of the organization the moment support ends.
      await request(app.getHttpServer())
        .patch(`/organizations/current/members/${tenant.membership.id}`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({ role: "DISPATCHER" })
        .expect(409);

      await request(app.getHttpServer())
        .post("/platform/organizations/support/exit")
        .set("Authorization", `Bearer ${supportToken}`)
        .expect(201);
    });
  });

  describe("a reset link does not outlive the password it was issued against", () => {
    it("invalidates an in-flight reset link when the user changes their password", async () => {
      const tenant = await registerTenant();

      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: tenant.email })
        .expect(200);
      const resetUrl = outbox.lastPasswordReset()!.resetUrl;
      const resetToken = new URL(resetUrl).searchParams.get("token")!;
      await request(app.getHttpServer())
        .post("/auth/reset-password/validate")
        .send({ token: resetToken })
        .expect(200);

      await request(app.getHttpServer())
        .post("/auth/change-password")
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({ currentPassword: TENANT_PASSWORD, newPassword: "changed-by-the-owner-1" })
        .expect(200);

      // Changing the password is how someone reacts to a reset email they did
      // not request. The stale capability must not still take over the account.
      await request(app.getHttpServer())
        .post("/auth/reset-password/validate")
        .send({ token: resetToken })
        .expect(400);
      await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: resetToken, newPassword: "attacker-chosen-password-1" })
        .expect(400);
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: tenant.email, password: "attacker-chosen-password-1" })
        .expect(401);
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: tenant.email, password: "changed-by-the-owner-1" })
        .expect(200);
    });

    it("refuses an expired reset link", async () => {
      const tenant = await registerTenant();
      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: tenant.email })
        .expect(200);
      const resetToken = new URL(outbox.lastPasswordReset()!.resetUrl).searchParams.get("token")!;

      await prisma.passwordResetToken.updateMany({
        where: { userId: tenant.user.id, usedAt: null },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .post("/auth/reset-password/validate")
        .send({ token: resetToken })
        .expect(400);
      await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: resetToken, newPassword: "expired-link-password-1" })
        .expect(400);
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: tenant.email, password: TENANT_PASSWORD })
        .expect(200);
    });

    it("refuses a reset link for a user who was archived after requesting it", async () => {
      const tenant = await registerTenant();
      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: tenant.email })
        .expect(200);
      const resetToken = new URL(outbox.lastPasswordReset()!.resetUrl).searchParams.get("token")!;

      await prisma.user.update({
        where: { id: tenant.user.id },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: resetToken, newPassword: "revived-account-password-1" })
        .expect(400);
    });
  });

  describe("platform support sessions are explicit, confined and auditable", () => {
    it("audits entry, scopes the minted bearer to the target org, and refuses the home bearer", async () => {
      const tenant = await registerTenant();
      const homeToken = await loginAs(app, SEEDED_PLATFORM_EMAIL);

      const entered = await request(app.getHttpServer())
        .post(`/platform/organizations/${tenant.organization.id}/enter`)
        .set("Authorization", `Bearer ${homeToken}`)
        .expect(201);
      const support = (entered.body as AuthBody).data;
      expect(support.organization.id).toBe(tenant.organization.id);

      const enterAudit = await prisma.auditLog.findFirst({
        where: {
          organizationId: tenant.organization.id,
          action: "platform.support.enter",
        },
      });
      expect(enterAudit).not.toBeNull();
      expect(enterAudit!.actorUserId).not.toBeNull();

      // The support bearer reads the tenant it entered...
      await get("/customers", support.accessToken).expect(200);
      // ...and the bearer minted for the operator's own console home is refused
      // while support is live, so a stale tab cannot act on the wrong tenant.
      await get("/customers", homeToken).expect(403);

      const exited = await request(app.getHttpServer())
        .post("/platform/organizations/support/exit")
        .set("Authorization", `Bearer ${support.accessToken}`)
        .expect(201);

      // Exit is audited and the tenant-side credential it minted is dead.
      const exitAudit = await prisma.auditLog.findFirst({
        where: {
          organizationId: tenant.organization.id,
          action: "platform.support.exit",
        },
      });
      expect(exitAudit).not.toBeNull();
      await get("/customers", support.accessToken).expect(401);
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: support.refreshToken })
        .expect(401);

      // And the operator is back on their console home membership.
      await get("/platform/organizations", (exited.body as AuthBody).data.accessToken).expect(200);
    });

    it("confines a live session to one organization at a time", async () => {
      const first = await registerTenant();
      const second = await registerTenant();
      const homeToken = await loginAs(app, SEEDED_PLATFORM_EMAIL);

      const enteredFirst = await request(app.getHttpServer())
        .post(`/platform/organizations/${first.organization.id}/enter`)
        .set("Authorization", `Bearer ${homeToken}`)
        .expect(201);
      const firstSupport = (enteredFirst.body as AuthBody).data;

      const enteredSecond = await request(app.getHttpServer())
        .post(`/platform/organizations/${second.organization.id}/enter`)
        .set("Authorization", `Bearer ${firstSupport.accessToken}`)
        .expect(201);
      const secondSupport = (enteredSecond.body as AuthBody).data;

      // Switching organizations tears the first tenant's credential down rather
      // than leaving the operator holding two live tenant bearers.
      await get("/customers", firstSupport.accessToken).expect(401);
      await get("/customers", secondSupport.accessToken).expect(200);

      const firstMembership = await prisma.membership.findFirst({
        where: { organizationId: first.organization.id, user: { isPlatformAdmin: true } },
      });
      expect(firstMembership!.status).toBe("REMOVED");

      await request(app.getHttpServer())
        .post("/platform/organizations/support/exit")
        .set("Authorization", `Bearer ${secondSupport.accessToken}`)
        .expect(201);
    });

    it("ends open support sessions and their tenant seat when the staff flag is revoked", async () => {
      const tenant = await registerTenant();

      // A second operator, so revocation is done by somebody other than the
      // account losing the flag — the real shape of an offboarding.
      const operator = await registerTenant();
      await request(app.getHttpServer())
        .patch("/platform/settings/staff")
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ userId: operator.user.id, isPlatformAdmin: true })
        .expect(200);
      const operatorToken = await loginAs(app, operator.email, TENANT_PASSWORD);

      const entered = await request(app.getHttpServer())
        .post(`/platform/organizations/${tenant.organization.id}/enter`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(201);
      const support = (entered.body as AuthBody).data;
      await get("/customers", support.accessToken).expect(200);

      await request(app.getHttpServer())
        .patch("/platform/settings/staff")
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ userId: operator.user.id, isPlatformAdmin: false })
        .expect(200);

      // Losing the flag must not leave an ordinary ADMIN membership behind in
      // the tenant that was being supported: with the flag gone, JwtStrategy no
      // longer applies the support-session rules to that membership.
      await get("/customers", support.accessToken).expect(401);
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: support.refreshToken })
        .expect(401);

      const seat = await prisma.membership.findFirst({
        where: { organizationId: tenant.organization.id, userId: operator.user.id },
      });
      expect(seat!.status).toBe("REMOVED");
      const open = await prisma.platformSupportSession.count({
        where: { userId: operator.user.id, endedAt: null },
      });
      expect(open).toBe(0);

      const revokeAudit = await prisma.auditLog.findFirst({
        where: { action: "platform.staff.revoke", entityId: operator.user.id },
      });
      expect(revokeAudit).not.toBeNull();

      // The de-staffed operator is also out of the Platform Console itself.
      await get("/platform/organizations", operatorToken).expect(403);
    });

    it("refuses a de-staffed operator's slug login into a previously supported tenant", async () => {
      const tenant = await registerTenant();
      const operator = await registerTenant();
      await request(app.getHttpServer())
        .patch("/platform/settings/staff")
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ userId: operator.user.id, isPlatformAdmin: true })
        .expect(200);
      const operatorToken = await loginAs(app, operator.email, TENANT_PASSWORD);
      await request(app.getHttpServer())
        .post(`/platform/organizations/${tenant.organization.id}/enter`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(201);
      await request(app.getHttpServer())
        .patch("/platform/settings/staff")
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ userId: operator.user.id, isPlatformAdmin: false })
        .expect(200);

      // organizationSlug is validated against real memberships, and the support
      // seat is no longer one, so this must land back in the operator's own org.
      const relogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          email: operator.email,
          password: TENANT_PASSWORD,
          organizationSlug: tenant.organization.slug,
        });
      if (relogin.status === 200) {
        expect((relogin.body as AuthBody).data.organization.id).not.toBe(tenant.organization.id);
      } else {
        expect(relogin.status).toBe(401);
      }
    });
  });

  /// Authorization decides whether a destructive action is allowed; the audit
  /// trail is what makes it answerable afterwards. An action that succeeds
  /// silently is indistinguishable from one nobody performed.
  describe("destructive actions are attributable", () => {
    it("records who archived, revoked or rotated, against the acting organization", async () => {
      const tenant = await registerTenant();
      const auth = { Authorization: `Bearer ${tenant.accessToken}` };

      const customer = await request(app.getHttpServer())
        .post("/customers")
        .set(auth)
        .send({
          customerCode: `WS8-AUDIT-${randomUUID().slice(0, 8)}`,
          companyName: "Audited Customer",
          contactName: "Audit Contact",
        })
        .expect(201);
      const customerId = (customer.body as { data: { id: string } }).data.id;
      await request(app.getHttpServer())
        .post(`/customers/${customerId}/archive`)
        .set(auth)
        .expect(200);

      const key = await request(app.getHttpServer())
        .post("/admin/api-keys")
        .set(auth)
        .send({ name: "Audited key", scopes: ["orders:read"] })
        .expect(201);
      const keyId = (key.body as { data: { id: string } }).data.id;
      await request(app.getHttpServer())
        .post(`/admin/api-keys/${keyId}/rotate`)
        .set(auth)
        .expect(200);
      await request(app.getHttpServer()).delete(`/admin/api-keys/${keyId}`).set(auth).expect(200);

      const device = await request(app.getHttpServer())
        .post("/telematics/devices")
        .set(auth)
        .send({
          provider: "MANUAL",
          externalId: `WS8-AUDIT-DEV-${randomUUID().slice(0, 8)}`,
          name: "Audited device",
        })
        .expect(201);
      const deviceId = (device.body as { data: { id: string } }).data.id;
      await request(app.getHttpServer())
        .post(`/telematics/devices/${deviceId}/archive`)
        .set(auth)
        .expect(200);

      const logged = await prisma.auditLog.findMany({
        where: { organizationId: tenant.organization.id },
        select: { action: true, actorUserId: true, entityId: true },
      });
      const actions = logged.map((entry) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          "customer.archive",
          "api_key.rotate",
          "api_key.revoke",
          "telematics.device.archive",
        ]),
      );
      // Attribution, not just occurrence: an entry with no actor answers nothing.
      for (const entry of logged.filter((e) => e.action.endsWith(".archive"))) {
        expect(entry.actorUserId).toBe(tenant.user.id);
      }
    });
  });

  describe("staff and customer-portal bearers are not interchangeable", () => {
    it("refuses a portal bearer on staff routes and a staff bearer on portal routes", async () => {
      const tenant = await registerTenant();
      const created = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .send({
          customerCode: `WS8-PORTAL-${randomUUID().slice(0, 8)}`,
          companyName: `Portal Customer ${randomUUID().slice(0, 8)}`,
          contactName: "Portal Contact",
          email: `portal-${randomUUID()}@example.com`,
        })
        .expect(201);
      const customer = (created.body as { data: { id: string; email: string } }).data;

      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/portal-access/invitations`)
        .set("Authorization", `Bearer ${tenant.accessToken}`)
        .expect(201);
      const acceptUrl = outbox.lastCustomerPortalInvitation()!.acceptUrl;
      const inviteToken = new URL(acceptUrl).searchParams.get("token")!;
      await request(app.getHttpServer())
        .post("/customer-portal/invitations/accept")
        .send({ token: inviteToken, password: "portal-strong-password-1" })
        .expect(200);

      const portalLogin = await request(app.getHttpServer())
        .post("/customer-portal/auth/login")
        .send({ email: customer.email, password: "portal-strong-password-1" })
        .expect(200);
      const portal = (
        portalLogin.body as { data: { accessToken: string; refreshToken: string } }
      ).data;

      // The two token families share a signing secret by documented design, so
      // the only thing keeping them apart is validation. Prove it holds.
      await get("/customers", portal.accessToken).expect(401);
      await get("/customer-portal/auth/me", tenant.accessToken).expect(401);
      await get("/customer-portal/auth/me", portal.accessToken).expect(200);

      // A portal session dies with the organization behind it, exactly like a
      // staff session does — archiving a tenant must not leave its customers
      // able to read invoices and orders that no longer have an owner.
      await prisma.organization.update({
        where: { id: tenant.organization.id },
        data: { deletedAt: new Date() },
      });
      await get("/customer-portal/auth/me", portal.accessToken).expect(401);
      await request(app.getHttpServer())
        .post("/customer-portal/auth/refresh")
        .send({ refreshToken: portal.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post("/customer-portal/auth/login")
        .send({ email: customer.email, password: "portal-strong-password-1" })
        .expect(401);
    });
  });
});
