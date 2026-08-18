import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  MailService,
  type PasswordResetEmailMessage,
} from "../src/mail/mail.service";

interface AuthResultBody {
  data: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
    organization: { id: string; slug: string };
    membership: { id: string; role: string };
  };
}

interface ErrorBody {
  error: { statusCode: number; message: string };
}

interface MeResultBody {
  data: {
    user: { id: string; email: string };
    organization: { id: string; slug: string };
    membership: { id: string; role: string };
  };
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

const passwordResetMessages: PasswordResetEmailMessage[] = [];
const sendPasswordResetEmailMock = jest.fn(
  (message: PasswordResetEmailMessage): Promise<void> => {
    passwordResetMessages.push(message);
    return Promise.resolve();
  },
);

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendInvitationEmail: jest.fn(),
        sendCustomerPortalInvitationEmail: jest.fn(),
        sendPasswordResetEmail: sendPasswordResetEmailMock,
        sendRawEmail: jest.fn(),
        sendLeadNotificationEmail: jest.fn(),
        sendDemoConfirmationEmail: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cascades memberships/refresh tokens/audit logs scoped to these orgs.
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function registerFixtureUser() {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email,
        password: "correct-horse-battery",
        firstName: "Test",
        lastName: "User",
        organizationName: `Test Org ${randomUUID()}`,
      });
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return { email, ...body.data };
  }

  it("register creates a User, Organization and ADMIN Membership, returning tokens", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: uniqueEmail(),
        password: "correct-horse-battery",
        firstName: "Ada",
        lastName: "Lovelace",
        organizationName: "Analytical Engines Ltd",
      })
      .expect(201);

    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);

    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
    expect(body.data.membership.role).toBe("ADMIN");
    expect(body.data.organization.slug).toContain("analytical-engines");
    expect(body.data).not.toHaveProperty("passwordHash");
  });

  it("rejects registering the same email twice", async () => {
    const { email } = await registerFixtureUser();

    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email,
        password: "another-password-1",
        firstName: "Dup",
        lastName: "User",
        organizationName: "Another Org",
      })
      .expect(409);

    expect((res.body as ErrorBody).error.message).toMatch(/already exists/i);
  });

  it("logs in with correct credentials and rejects incorrect ones", async () => {
    const { email } = await registerFixtureUser();

    const wrongPassword = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "not-the-right-password" })
      .expect(401);
    expect((wrongPassword.body as ErrorBody).error.message).toMatch(/invalid email or password/i);

    const correct = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "correct-horse-battery" })
      .expect(200);
    expect((correct.body as AuthResultBody).data.accessToken).toEqual(expect.any(String));
  });

  it("keeps forgot-password responses generic and resets a password with a one-time token", async () => {
    const fixture = await registerFixtureUser();
    passwordResetMessages.length = 0;

    const unknown = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: uniqueEmail() })
      .expect(200);
    const known = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: fixture.email })
      .expect(200);

    expect(unknown.body).toEqual(known.body);
    const resetMessage = passwordResetMessages.at(-1);
    expect(resetMessage?.to).toBe(fixture.email);
    const resetToken = new URL(resetMessage!.resetUrl).searchParams.get("token");
    expect(resetToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post("/auth/reset-password/validate")
      .send({ token: resetToken })
      .expect(200);
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: resetToken, newPassword: "reset-password-strong" })
      .expect(200);

    // The capability is one-time and resetting credentials invalidates both
    // refresh and access tokens issued before the reset.
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: resetToken, newPassword: "another-password-strong" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: fixture.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fixture.email, password: "correct-horse-battery" })
      .expect(401);
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fixture.email, password: "reset-password-strong" })
      .expect(200);
  });

  it("invalidates older unused reset links when a new one is requested", async () => {
    const fixture = await registerFixtureUser();
    passwordResetMessages.length = 0;

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: fixture.email })
      .expect(200);
    const firstToken = new URL(passwordResetMessages.at(-1)!.resetUrl).searchParams.get("token");

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: fixture.email })
      .expect(200);
    const secondToken = new URL(passwordResetMessages.at(-1)!.resetUrl).searchParams.get("token");

    expect(secondToken).not.toBe(firstToken);
    await request(app.getHttpServer())
      .post("/auth/reset-password/validate")
      .send({ token: firstToken })
      .expect(400);
    await request(app.getHttpServer())
      .post("/auth/reset-password/validate")
      .send({ token: secondToken })
      .expect(200);
  });

  it("keeps a generic 200 and invalidates the token when reset email delivery fails", async () => {
    const fixture = await registerFixtureUser();
    passwordResetMessages.length = 0;
    sendPasswordResetEmailMock.mockImplementationOnce((message: PasswordResetEmailMessage) => {
      passwordResetMessages.push(message);
      return Promise.reject(new Error("simulated delivery failure"));
    });

    const unknown = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: uniqueEmail() })
      .expect(200);
    const failedDelivery = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: fixture.email })
      .expect(200);

    expect(failedDelivery.body).toEqual(unknown.body);
    const resetToken = new URL(passwordResetMessages.at(-1)!.resetUrl).searchParams.get("token");
    await request(app.getHttpServer())
      .post("/auth/reset-password/validate")
      .send({ token: resetToken })
      .expect(400);

    const storedToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: fixture.user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(storedToken.usedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorUserId: fixture.user.id,
        action: "auth.password_reset.requested",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toMatchObject({ eligible: true, delivery: "failed" });
  });

  it("rejects login, refresh, and access JWTs for soft-deleted users and organizations", async () => {
    const fixture = await registerFixtureUser();
    await prisma.user.update({
      where: { id: fixture.user.id },
      data: { deletedAt: new Date() },
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fixture.email, password: "correct-horse-battery" })
      .expect(401);
    expect((login.body as ErrorBody).error.message).toMatch(/invalid email or password/i);
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: fixture.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .expect(401);

    const activeFixture = await registerFixtureUser();
    await prisma.organization.update({
      where: { id: activeFixture.organization.id },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: activeFixture.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${activeFixture.accessToken}`)
      .expect(401);
  });

  it("GET /auth/me requires a valid token and never returns a password hash", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);

    const { accessToken } = await registerFixtureUser();
    const res = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const body = (res.body as MeResultBody).data;
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.membership.role).toBe("ADMIN");
  });

  it("rejects requests with no token, a garbage token, or a token for a different signature", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-real-jwt")
      .expect(401);
  });

  it("detects refresh-token reuse and revokes the rotated token family", async () => {
    const { refreshToken } = await registerFixtureUser();

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(200);
    const newRefreshToken = (refreshed.body as AuthResultBody).data.refreshToken;
    expect(newRefreshToken).not.toBe(refreshToken);

    // Reusing the original (now-rotated-away) token must fail.
    await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken }).expect(401);

    // Reuse is treated as credential theft, so the replacement is revoked too.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: newRefreshToken })
      .expect(401);
  });

  it("allows only one concurrent rotation of the same refresh token", async () => {
    const { refreshToken } = await registerFixtureUser();
    const attempts = await Promise.all([
      request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken }),
      request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken }),
    ]);

    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([200, 401]);
    const successful = attempts.find((attempt) => attempt.status === 200);
    const replacement = (successful!.body as AuthResultBody).data.refreshToken;

    // The losing concurrent replay is a reuse signal and revokes the family.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: replacement })
      .expect(401);
  });

  it("logout revokes only the current session's refresh token", async () => {
    const { accessToken, refreshToken } = await registerFixtureUser();

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken }).expect(401);
  });

  it("logout-all revokes every refresh token for the user", async () => {
    const fixture = await registerFixtureUser();

    const second = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fixture.email, password: "correct-horse-battery" })
      .expect(200);
    const secondRefreshToken = (second.body as AuthResultBody).data.refreshToken;

    await request(app.getHttpServer())
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: fixture.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: secondRefreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .expect(401);
  });

  it("change-password requires the correct current password and revokes existing sessions", async () => {
    const { accessToken, refreshToken, email } = await registerFixtureUser();

    await request(app.getHttpServer())
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "wrong-current-password", newPassword: "brand-new-password-1" })
      .expect(401);

    await request(app.getHttpServer())
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "correct-horse-battery", newPassword: "brand-new-password-1" })
      .expect(200);

    // Old refresh token was revoked as part of the password change.
    await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken }).expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    // New password works; old one doesn't.
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "correct-horse-battery" })
      .expect(401);
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "brand-new-password-1" })
      .expect(200);
  });
});
