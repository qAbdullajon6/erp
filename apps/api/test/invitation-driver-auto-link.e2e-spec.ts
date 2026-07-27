import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { MembershipRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";
import { generateInvitationToken, hashInvitationToken } from "../src/invitations/invitation-token.util";

/**
 * Integration: DRIVER invitation accept auto-links Driver.userId when exactly
 * one unlinked Driver in the org shares the invite email.
 */
describe("Invitation DRIVER auto-link (e2e)", () => {
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
    const email = `admin-${randomUUID()}@example.com`;
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email,
      password: "correct-horse-battery",
      firstName: "Org",
      lastName: "Admin",
      organizationName,
    });
    expect(res.status).toBe(201);
    const organizationId = res.body.data.organization.id as string;
    const userId = res.body.data.user.id as string;
    createdOrganizationIds.push(organizationId);
    createdUserIds.push(userId);
    return {
      organizationId,
      adminUserId: userId,
      accessToken: res.body.data.accessToken as string,
    };
  }

  async function createPendingDriverInvite(input: {
    organizationId: string;
    invitedByUserId: string;
    email: string;
  }) {
    const rawToken = generateInvitationToken();
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        role: MembershipRole.DRIVER,
        tokenHash: hashInvitationToken(rawToken),
        status: "PENDING",
        invitedByUserId: input.invitedByUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { invitation, rawToken };
  }

  async function createDriver(input: {
    organizationId: string;
    email: string | null;
    userId?: string | null;
    employeeCode?: string;
  }) {
    return prisma.driver.create({
      data: {
        organizationId: input.organizationId,
        employeeCode: input.employeeCode ?? `EMP-${randomUUID().slice(0, 8)}`,
        firstName: "Fleet",
        lastName: "Driver",
        phone: "+998901112233",
        email: input.email,
        userId: input.userId ?? null,
      },
    });
  }

  async function acceptInvite(rawToken: string, emailHint: string) {
    const res = await request(app.getHttpServer()).post("/invite/accept").send({
      token: rawToken,
      firstName: "Invited",
      lastName: "Driver",
      password: "correct-horse-battery",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("DRIVER");
    createdUserIds.push(res.body.data.userId);
    // Sanity: login works with invite email
    void emailHint;
    return res.body.data as { userId: string; organizationId: string; role: string };
  }

  it("successful auto-link: exactly one unlinked Driver with same email", async () => {
    const { organizationId, adminUserId } = await registerAdmin(`AutoLink Success ${randomUUID()}`);
    const email = `driver-${randomUUID()}@Example.COM`;
    const driver = await createDriver({ organizationId, email });

    const { rawToken } = await createPendingDriverInvite({
      organizationId,
      invitedByUserId: adminUserId,
      email,
    });

    const accepted = await acceptInvite(rawToken, email);

    const linked = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(linked.userId).toBe(accepted.userId);

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId,
        action: "driver.link_user",
        entityId: driver.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({
      userId: accepted.userId,
      source: "invitation.accept",
      automatic: true,
    });
  });

  it("no match: invite email has no Driver row — User created, Driver.userId stays null", async () => {
    const { organizationId, adminUserId } = await registerAdmin(`AutoLink None ${randomUUID()}`);
    const email = `orphan-${randomUUID()}@example.com`;
    const other = await createDriver({
      organizationId,
      email: `other-${randomUUID()}@example.com`,
    });

    const { rawToken } = await createPendingDriverInvite({
      organizationId,
      invitedByUserId: adminUserId,
      email,
    });

    await acceptInvite(rawToken, email);

    const untouched = await prisma.driver.findUniqueOrThrow({ where: { id: other.id } });
    expect(untouched.userId).toBeNull();
  });

  it("multiple matches: two unlinked Drivers with same email — no auto-link", async () => {
    const { organizationId, adminUserId } = await registerAdmin(`AutoLink Multi ${randomUUID()}`);
    const email = `dup-${randomUUID()}@example.com`;
    const a = await createDriver({ organizationId, email, employeeCode: `A-${randomUUID().slice(0, 6)}` });
    const b = await createDriver({ organizationId, email, employeeCode: `B-${randomUUID().slice(0, 6)}` });

    const { rawToken } = await createPendingDriverInvite({
      organizationId,
      invitedByUserId: adminUserId,
      email,
    });

    await acceptInvite(rawToken, email);

    const [afterA, afterB] = await Promise.all([
      prisma.driver.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.driver.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(afterA.userId).toBeNull();
    expect(afterB.userId).toBeNull();
  });

  it("already-linked driver: only linked Driver shares email — no second link / no overwrite", async () => {
    const { organizationId, adminUserId } = await registerAdmin(`AutoLink Linked ${randomUUID()}`);
    const email = `taken-${randomUUID()}@example.com`;

    const priorUser = await prisma.user.create({
      data: {
        email: `prior-${randomUUID()}@example.com`,
        firstName: "Prior",
        lastName: "Link",
        passwordHash: "x",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(priorUser.id);

    const driver = await createDriver({
      organizationId,
      email,
      userId: priorUser.id,
    });

    const { rawToken } = await createPendingDriverInvite({
      organizationId,
      invitedByUserId: adminUserId,
      email,
    });

    const accepted = await acceptInvite(rawToken, email);

    const after = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(after.userId).toBe(priorUser.id);
    expect(after.userId).not.toBe(accepted.userId);
  });

  it("wrong organization: Driver in org B does not link when invite is for org A", async () => {
    const orgA = await registerAdmin(`AutoLink OrgA ${randomUUID()}`);
    const orgB = await registerAdmin(`AutoLink OrgB ${randomUUID()}`);
    const email = `cross-${randomUUID()}@example.com`;

    const driverInB = await createDriver({
      organizationId: orgB.organizationId,
      email,
    });

    const { rawToken } = await createPendingDriverInvite({
      organizationId: orgA.organizationId,
      invitedByUserId: orgA.adminUserId,
      email,
    });

    const accepted = await acceptInvite(rawToken, email);
    expect(accepted.organizationId).toBe(orgA.organizationId);

    const after = await prisma.driver.findUniqueOrThrow({ where: { id: driverInB.id } });
    expect(after.userId).toBeNull();

    const driversInA = await prisma.driver.findMany({
      where: { organizationId: orgA.organizationId, userId: accepted.userId },
    });
    expect(driversInA).toHaveLength(0);
  });
});
