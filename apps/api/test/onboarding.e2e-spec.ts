import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";

/// Setup progress had no test at all, which is how it shipped in a state
/// where `GET /onboarding/progress` threw for every organization (no row was
/// ever created) and every response was doubly wrapped in `{ data }`.

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string };
    organization: { id: string; slug: string };
  };
}

interface ProgressBody {
  data: {
    organizationId: string;
    completed: boolean;
    skipped: boolean;
    steps: {
      organizationProfile: boolean;
      firstCustomer: boolean;
      firstDriver: boolean;
      firstVehicle: boolean;
      firstOrder: boolean;
    };
  };
}

describe("Onboarding (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];

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

  async function registerAdmin() {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: `onboarding-${randomUUID()}@example.com`,
        password: "correct-horse-battery",
        firstName: "Org",
        lastName: "Admin",
        organizationName: `Onboarding Org ${randomUUID()}`,
      })
      .expect(201);
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return body.data;
  }

  function getProgress(accessToken: string) {
    return request(app.getHttpServer())
      .get("/onboarding/progress")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
  }

  it("reports every step outstanding for a freshly registered organization", async () => {
    const admin = await registerAdmin();

    const res = await getProgress(admin.accessToken);
    const progress = (res.body as ProgressBody).data;

    expect(progress.organizationId).toBe(admin.organization.id);
    expect(progress.completed).toBe(false);
    expect(progress.skipped).toBe(false);
    expect(progress.steps).toEqual({
      organizationProfile: false,
      firstCustomer: false,
      firstDriver: false,
      firstVehicle: false,
      firstOrder: false,
    });
  });

  /// The steps are read from the data, so doing the work is what completes
  /// them — no client has to remember to report it, and deleting the last
  /// vehicle honestly reopens that step.
  it("completes each step as the underlying record appears", async () => {
    const admin = await registerAdmin();
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    await request(app.getHttpServer())
      .patch("/organizations/current")
      .set(auth)
      .send({ legalName: "Onboarding Logistics LLC" })
      .expect(200);
    expect((await getProgress(admin.accessToken)).body.data.steps.organizationProfile).toBe(true);

    const customer = await request(app.getHttpServer())
      .post("/customers")
      .set(auth)
      .send({ companyName: "Acme Logistics", contactName: "Jane Doe" })
      .expect(201);
    expect((await getProgress(admin.accessToken)).body.data.steps.firstCustomer).toBe(true);

    await request(app.getHttpServer())
      .post("/drivers")
      .set(auth)
      .send({ firstName: "Aziz", lastName: "Karimov", phone: "+998901234567" })
      .expect(201);
    expect((await getProgress(admin.accessToken)).body.data.steps.firstDriver).toBe(true);

    await request(app.getHttpServer())
      .post("/vehicles")
      .set(auth)
      .send({ plateNumber: `01A${Math.floor(Math.random() * 900 + 100)}BC`, type: "truck" })
      .expect(201);
    expect((await getProgress(admin.accessToken)).body.data.steps.firstVehicle).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .post("/orders")
      .set(auth)
      .send({
        customerId: (customer.body as { data: { id: string } }).data.id,
        pickupAddress: "1 Depot Rd",
        pickupCity: "Tashkent",
        deliveryAddress: "2 Market St",
        deliveryCity: "Samarkand",
        pickupDate: today,
        deliveryDate: today,
        cargoDescription: "Pallets",
        price: 500,
      })
      .expect(201);

    const final = (await getProgress(admin.accessToken)).body as ProgressBody;
    expect(final.data.steps.firstOrder).toBe(true);
    expect(final.data.completed).toBe(true);
  });

  it("remembers that an admin dismissed the checklist", async () => {
    const admin = await registerAdmin();

    await request(app.getHttpServer())
      .post("/onboarding/skip")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    const progress = (await getProgress(admin.accessToken)).body as ProgressBody;
    expect(progress.data.skipped).toBe(true);
  });
});
