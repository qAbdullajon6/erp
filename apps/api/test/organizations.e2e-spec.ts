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

describe("Organizations (e2e)", () => {
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

  /// Adds a second user as a member of `admin`'s organization with the given
  /// role, by driving the real invite -> email -> accept flow rather than the
  /// removed direct-add endpoint: create the invitation, read its email out of
  /// the test-only outbox, accept it, then log in as the new member.
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

    return {
      email: memberEmail,
      membershipId: loginBody.data.membership.id,
      accessToken: loginBody.data.accessToken,
    };
  }

  it("rejects unauthenticated access to every organization endpoint", async () => {
    await request(app.getHttpServer()).get("/organizations/current").expect(401);
    await request(app.getHttpServer()).patch("/organizations/current").send({ name: "x" }).expect(401);
    await request(app.getHttpServer()).get("/organizations/current/members").expect(401);
  });

  it("enforces cross-organization isolation: an admin cannot act on another org's membership", async () => {
    const orgA = await registerAdmin(`Org A ${randomUUID()}`);
    const orgB = await registerAdmin(`Org B ${randomUUID()}`);

    // Org A's admin tries to modify Org B's own admin membership using Org
    // A's token — must 404, not leak that the membership exists elsewhere.
    await request(app.getHttpServer())
      .patch(`/organizations/current/members/${orgB.membership.id}`)
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send({ role: "DISPATCHER" })
      .expect(404);

    // Org B's own admin, using their own token, can still see their org is
    // untouched and their own membership list only ever contains their org.
    const membersRes = await request(app.getHttpServer())
      .get("/organizations/current/members")
      .set("Authorization", `Bearer ${orgB.accessToken}`)
      .expect(200);
    const members = (membersRes.body as { data: Array<{ id: string }> }).data;
    expect(members.map((m) => m.id)).toEqual([orgB.membership.id]);
  });

  it("only ADMIN can manage organization settings and members", async () => {
    const admin = await registerAdmin(`Admin-only Org ${randomUUID()}`);
    const dispatcher = await addMemberWithRole(admin, "DISPATCHER");

    await request(app.getHttpServer())
      .patch("/organizations/current")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ name: "Hijacked Name" })
      .expect(403);

    await request(app.getHttpServer())
      .get("/organizations/current/members")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(403);

    // Inviting a member is the only way to grow an organization now that
    // direct-add is gone; it must be exactly as ADMIN-only as the endpoints
    // above.
    await request(app.getHttpServer())
      .post(`/organizations/${admin.organization.id}/invitations`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ email: uniqueEmail(), role: "ACCOUNTANT" })
      .expect(403);

    // The admin themself can still do all of this.
    await request(app.getHttpServer())
      .patch("/organizations/current")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ name: "Legitimately Renamed" })
      .expect(200);
  });

  it("prevents demoting or removing the last active admin", async () => {
    const admin = await registerAdmin(`Last Admin Org ${randomUUID()}`);

    await request(app.getHttpServer())
      .patch(`/organizations/current/members/${admin.membership.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ role: "DISPATCHER" })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/organizations/current/members/${admin.membership.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(409);

    // Once a second admin exists, the first can safely be demoted.
    const secondAdmin = await addMemberWithRole(admin, "ADMIN");
    await request(app.getHttpServer())
      .patch(`/organizations/current/members/${admin.membership.id}`)
      .set("Authorization", `Bearer ${secondAdmin.accessToken}`)
      .send({ role: "DISPATCHER" })
      .expect(200);
  });
});
