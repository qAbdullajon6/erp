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

describe("Auth (e2e)", () => {
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

  it("rotates the refresh token, rejecting reuse of the old one", async () => {
    const { refreshToken } = await registerFixtureUser();

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(200);
    const newRefreshToken = (refreshed.body as AuthResultBody).data.refreshToken;
    expect(newRefreshToken).not.toBe(refreshToken);

    // Reusing the original (now-rotated-away) token must fail.
    await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken }).expect(401);

    // The new one still works.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: newRefreshToken })
      .expect(200);
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
