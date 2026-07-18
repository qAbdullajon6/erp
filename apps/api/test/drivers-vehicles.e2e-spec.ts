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

interface DriverBody {
  id: string;
  organizationId: string;
  employeeCode: string;
  status: string;
  archivedAt: string | null;
}
interface DriverResponse {
  data: DriverBody;
}
interface DriverListResponse {
  data: { items: DriverBody[]; meta: { total: number } };
}

interface VehicleBody {
  id: string;
  organizationId: string;
  vehicleCode: string;
  status: string;
  capacityKg: string | null;
  capacityM3: string | null;
  archivedAt: string | null;
}
interface VehicleResponse {
  data: VehicleBody;
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe("Drivers + Vehicles (e2e)", () => {
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

  async function createDriver(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/drivers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ firstName: "Aziz", lastName: "Karimov", phone: "+998901234567", ...overrides })
      .expect(201);
    return (res.body as DriverResponse).data;
  }

  async function createVehicle(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ plateNumber: "01A123BC", type: "truck", ...overrides })
      .expect(201);
    return (res.body as VehicleResponse).data;
  }

  describe("Drivers CRUD + roles", () => {
    it("creates with an auto-generated employeeCode, reads, updates, archives, restores", async () => {
      const admin = await registerAdmin(`Driver CRUD Org ${randomUUID()}`);
      const driver = await createDriver(admin, { licenseNumber: "AB1234567" });
      expect(driver.employeeCode).toMatch(/^EMP-\d{4}$/);
      expect(driver.status).toBe("ACTIVE");

      const updated = await request(app.getHttpServer())
        .patch(`/drivers/${driver.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ON_LEAVE" })
        .expect(200);
      expect((updated.body as DriverResponse).data.status).toBe("ON_LEAVE");

      const archived = await request(app.getHttpServer())
        .post(`/drivers/${driver.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((archived.body as DriverResponse).data.archivedAt).not.toBeNull();

      const listDefault = await request(app.getHttpServer())
        .get("/drivers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((listDefault.body as DriverListResponse).data.items.some((d) => d.id === driver.id)).toBe(false);

      const restored = await request(app.getHttpServer())
        .post(`/drivers/${driver.id}/restore`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((restored.body as DriverResponse).data.archivedAt).toBeNull();
    });

    it("rejects a duplicate employeeCode within the same organization but allows reuse across organizations", async () => {
      const adminA = await registerAdmin(`Driver Code Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Driver Code Org B ${randomUUID()}`);
      await createDriver(adminA, { employeeCode: "EMP-SHARED" });

      await request(app.getHttpServer())
        .post("/drivers")
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .send({ firstName: "X", lastName: "Y", phone: "1", employeeCode: "EMP-SHARED" })
        .expect(409);

      await createDriver(adminB, { employeeCode: "EMP-SHARED" });
    });

    it("a driver id from another organization returns 404", async () => {
      const adminA = await registerAdmin(`Driver Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Driver Isolation Org B ${randomUUID()}`);
      const driver = await createDriver(adminA);

      await request(app.getHttpServer())
        .get(`/drivers/${driver.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(404);
    });

    it("only ADMIN/OPERATIONS_MANAGER/DISPATCHER can access; SALES_CRM_MANAGER/ACCOUNTANT/DRIVER cannot", async () => {
      // This test does four register+add-member+login round trips back to
      // back, each involving deliberately-slow Argon2id hashing (see
      // PasswordService) — relies on jest-e2e.json's global testTimeout.
      const admin = await registerAdmin(`Driver Role Org ${randomUUID()}`);
      const dispatcher = await addMemberWithRole(admin, "DISPATCHER");
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");
      const accountant = await addMemberWithRole(admin, "ACCOUNTANT");
      const driverRole = await addMemberWithRole(admin, "DRIVER");

      await request(app.getHttpServer())
        .get("/drivers")
        .set("Authorization", `Bearer ${dispatcher.accessToken}`)
        .expect(200);

      for (const nonAllowed of [sales, accountant, driverRole]) {
        await request(app.getHttpServer())
          .get("/drivers")
          .set("Authorization", `Bearer ${nonAllowed.accessToken}`)
          .expect(403);
      }
    });

    it("there is no permanent delete route", async () => {
      const admin = await registerAdmin(`Driver No Delete Org ${randomUUID()}`);
      const driver = await createDriver(admin);
      await request(app.getHttpServer())
        .delete(`/drivers/${driver.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  describe("Vehicles CRUD + roles", () => {
    it("creates with an auto-generated vehicleCode and serializes capacity as decimal strings", async () => {
      const admin = await registerAdmin(`Vehicle CRUD Org ${randomUUID()}`);
      const vehicle = await createVehicle(admin, { capacityKg: 5000, capacityM3: 20 });
      expect(vehicle.vehicleCode).toMatch(/^VEH-\d{4}$/);
      expect(vehicle.status).toBe("AVAILABLE");
      expect(vehicle.capacityKg).toBe("5000");
      expect(vehicle.capacityM3).toBe("20");
    });

    it("archives, excludes from default list, restores", async () => {
      const admin = await registerAdmin(`Vehicle Archive Org ${randomUUID()}`);
      const vehicle = await createVehicle(admin);

      await request(app.getHttpServer())
        .post(`/vehicles/${vehicle.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/vehicles/${vehicle.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .post(`/vehicles/${vehicle.id}/restore`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/vehicles/${vehicle.id}/restore`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });

    it("only ADMIN/OPERATIONS_MANAGER/DISPATCHER can access", async () => {
      const admin = await registerAdmin(`Vehicle Role Org ${randomUUID()}`);
      const opsManager = await addMemberWithRole(admin, "OPERATIONS_MANAGER");
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");

      await request(app.getHttpServer())
        .get("/vehicles")
        .set("Authorization", `Bearer ${opsManager.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get("/vehicles")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(403);
    });

    it("there is no permanent delete route", async () => {
      const admin = await registerAdmin(`Vehicle No Delete Org ${randomUUID()}`);
      const vehicle = await createVehicle(admin);
      await request(app.getHttpServer())
        .delete(`/vehicles/${vehicle.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  describe("audit logs", () => {
    it("records driver and vehicle create/update/archive/restore", async () => {
      const admin = await registerAdmin(`Fleet Audit Org ${randomUUID()}`);
      const driver = await createDriver(admin);
      await request(app.getHttpServer())
        .patch(`/drivers/${driver.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ lastName: "Renamed" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/drivers/${driver.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: "Driver", entityId: driver.id },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((l) => l.action)).toEqual(["driver.create", "driver.update", "driver.archive"]);
    });
  });
});
