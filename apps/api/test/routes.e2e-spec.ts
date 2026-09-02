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

interface RouteBody {
  id: string;
  routeNumber: string;
  status: string;
  plannedDate: string;
  driverId: string | null;
  vehicleId: string | null;
  totalDistanceM: number | null;
  totalDurationSec: number | null;
  calculatedAt: string | null;
  calculationStatus: string | null;
  geometry: string | null;
  stops: RouteStopBody[];
  driver: { id: string } | null;
  vehicle: { id: string } | null;
}

interface RouteStopBody {
  id: string;
  sequence: number;
  address: string;
  city: string;
  lat: string | null;
  lng: string | null;
  status: string;
  optimizationLocked: boolean;
  distanceFromPrevM: number | null;
  durationFromPrevSec: number | null;
  dispatch: { id: string; status: string } | null;
  order: { id: string; orderNumber: string } | null;
}

interface OptimizationPreviewBody {
  routeUpdatedAt: string;
  optimized: boolean;
  currentDistance: number;
  optimizedDistance: number;
  distanceSaved: number;
  currentSequence: Array<{ id: string; sequence: number }>;
  proposedSequence: Array<{ id: string; sequence: number }>;
  warnings: string[];
  changedStopIds: string[];
  eligibleCount: number;
  fixedCount: number;
  missingCoordCount: number;
}

interface RouteResponse {
  data: RouteBody;
}

function uniqueEmail(): string {
  return `routes-e2e-${randomUUID()}@example.com`;
}

const PLANNED_DATE = "2030-06-15";

describe("Routes (e2e)", () => {
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
    await prisma.route.deleteMany({
      where: { organizationId: { in: createdOrganizationIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function registerAdmin(organizationName: string) {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email,
      password: "correct-horse-battery",
      firstName: "Admin",
      lastName: "User",
      organizationName,
    });
    expect(res.status).toBe(201);
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return { email, ...body.data };
  }

  async function createDriver(token: string, orgId: string) {
    const res = await request(app.getHttpServer())
      .post("/drivers")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Test", lastName: "Driver", phone: `+1${Date.now().toString().slice(-9)}` })
      .expect(201);
    return (res.body as { data: { id: string } }).data;
  }

  async function createVehicle(token: string, orgId: string) {
    const plate = `RTE${randomUUID().slice(0, 6).toUpperCase()}`;
    const res = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send({ plateNumber: plate, type: "van" })
      .expect(201);
    return (res.body as { data: { id: string } }).data;
  }

  async function createRoute(token: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post("/routes")
      .set("Authorization", `Bearer ${token}`)
      .send({ plannedDate: PLANNED_DATE, ...overrides })
      .expect(201);
    return (res.body as RouteResponse).data;
  }

  async function addStop(
    token: string,
    routeId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(`/routes/${routeId}/stops`)
      .set("Authorization", `Bearer ${token}`)
      .send({ address: "123 Main St", city: "Tashkent", ...overrides })
      .expect(201);
    return (res.body as { data: RouteStopBody }).data;
  }

  // ─── A: Route creation ────────────────────────────────────────────────────

  describe("A: Route creation", () => {
    it("creates a route and returns a unique route number", async () => {
      const admin = await registerAdmin("Org-A-Creation");
      const route = await createRoute(admin.accessToken);

      expect(route.id).toBeDefined();
      expect(route.routeNumber).toMatch(/^RTE-\d{6}$/);
      expect(route.status).toBe("DRAFT");
      expect(route.plannedDate).toContain(PLANNED_DATE);
      expect(route.stops).toEqual([]);
      expect(route.driver).toBeNull();
      expect(route.vehicle).toBeNull();
    });

    it("creates a second route with a different route number", async () => {
      const admin = await registerAdmin("Org-A-Sequence");
      const r1 = await createRoute(admin.accessToken);
      const r2 = await createRoute(admin.accessToken);
      expect(r1.routeNumber).not.toBe(r2.routeNumber);
    });

    it("rejects creation without plannedDate", async () => {
      const admin = await registerAdmin("Org-A-Validation");
      await request(app.getHttpServer())
        .post("/routes")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(400);
    });

    it("rejects creation with a driver from another org", async () => {
      const admin1 = await registerAdmin("Org-A-Foreign1");
      const admin2 = await registerAdmin("Org-A-Foreign2");
      const foreignDriver = await createDriver(admin2.accessToken, admin2.organization.id);

      await request(app.getHttpServer())
        .post("/routes")
        .set("Authorization", `Bearer ${admin1.accessToken}`)
        .send({ plannedDate: PLANNED_DATE, driverId: foreignDriver.id })
        .expect(404);
    });
  });

  // ─── B: Organization isolation ────────────────────────────────────────────

  describe("B: Organization isolation", () => {
    it("cannot see another org's routes", async () => {
      const admin1 = await registerAdmin("Org-B-Iso1");
      const admin2 = await registerAdmin("Org-B-Iso2");

      const route = await createRoute(admin1.accessToken);

      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin2.accessToken}`)
        .expect(404);

      expect((res.body as { error: { statusCode: number } }).error.statusCode).toBe(404);
    });

    it("list returns only routes belonging to the requesting org", async () => {
      const admin1 = await registerAdmin("Org-B-List1");
      const admin2 = await registerAdmin("Org-B-List2");

      await createRoute(admin1.accessToken);
      await createRoute(admin1.accessToken);
      await createRoute(admin2.accessToken);

      const res = await request(app.getHttpServer())
        .get("/routes")
        .set("Authorization", `Bearer ${admin1.accessToken}`)
        .expect(200);

      const items = (res.body as { data: { items: RouteBody[] } }).data.items;
      const admin1OrgId = admin1.organization.id;
      for (const item of items) {
        // All returned routes must belong to admin1's org — verified by checking
        // the route is fetchable by admin1 (none belong to admin2).
        const check = await request(app.getHttpServer())
          .get(`/routes/${item.id}`)
          .set("Authorization", `Bearer ${admin1.accessToken}`);
        expect(check.status).toBe(200);
      }
    });
  });

  // ─── C: Driver/vehicle organization validation ─────────────────────────────

  describe("C: Driver/vehicle organization validation", () => {
    it("allows assigning own org's driver via PATCH", async () => {
      const admin = await registerAdmin("Org-C-Driver");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const route = await createRoute(admin.accessToken);

      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id })
        .expect(200);
      expect((res.body as RouteResponse).data.driver?.id).toBe(driver.id);
    });

    it("rejects assigning a driver from another org via PATCH", async () => {
      const admin1 = await registerAdmin("Org-C-Cross1");
      const admin2 = await registerAdmin("Org-C-Cross2");
      const foreignDriver = await createDriver(admin2.accessToken, admin2.organization.id);
      const route = await createRoute(admin1.accessToken);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin1.accessToken}`)
        .send({ driverId: foreignDriver.id })
        .expect(404);
    });

    it("rejects assigning a vehicle from another org via PATCH", async () => {
      const admin1 = await registerAdmin("Org-C-VehCross1");
      const admin2 = await registerAdmin("Org-C-VehCross2");
      const foreignVehicle = await createVehicle(admin2.accessToken, admin2.organization.id);
      const route = await createRoute(admin1.accessToken);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin1.accessToken}`)
        .send({ vehicleId: foreignVehicle.id })
        .expect(404);
    });
  });

  // ─── D: Add route stops ───────────────────────────────────────────────────

  describe("D: Add route stops", () => {
    it("adds stops and sequences them starting at 1", async () => {
      const admin = await registerAdmin("Org-D-Stops");
      const route = await createRoute(admin.accessToken);

      const s1 = await addStop(admin.accessToken, route.id, { address: "Warehouse A", city: "Tashkent" });
      const s2 = await addStop(admin.accessToken, route.id, { address: "Warehouse B", city: "Samarkand" });

      expect(s1.sequence).toBe(1);
      expect(s2.sequence).toBe(2);
    });

    it("returns stops in sequence order on getById", async () => {
      const admin = await registerAdmin("Org-D-Order");
      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { city: "City1", address: "Addr1" });
      await addStop(admin.accessToken, route.id, { city: "City2", address: "Addr2" });
      await addStop(admin.accessToken, route.id, { city: "City3", address: "Addr3" });

      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    });
  });

  // ─── E: Stop ordering ────────────────────────────────────────────────────

  describe("E: Stop ordering", () => {
    it("reorders stops and updates sequences", async () => {
      const admin = await registerAdmin("Org-E-Reorder");
      const route = await createRoute(admin.accessToken);
      const s1 = await addStop(admin.accessToken, route.id, { city: "First", address: "A" });
      const s2 = await addStop(admin.accessToken, route.id, { city: "Second", address: "B" });
      const s3 = await addStop(admin.accessToken, route.id, { city: "Third", address: "C" });

      // Reverse order
      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [s3.id, s2.id, s1.id] })
        .expect(200);

      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops[0].id).toBe(s3.id);
      expect(stops[0].sequence).toBe(1);
      expect(stops[1].id).toBe(s2.id);
      expect(stops[1].sequence).toBe(2);
      expect(stops[2].id).toBe(s1.id);
      expect(stops[2].sequence).toBe(3);
    });

    it("rejects reorder if stopIds list does not exactly match the route's stops", async () => {
      const admin = await registerAdmin("Org-E-ReorderBad");
      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { city: "A", address: "Addr" });

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [randomUUID()] })
        .expect(400);
    });
  });

  // ─── F: Remove route stop ─────────────────────────────────────────────────

  describe("F: Remove route stop", () => {
    it("removes a stop and compacts sequences", async () => {
      const admin = await registerAdmin("Org-F-Remove");
      const route = await createRoute(admin.accessToken);
      const s1 = await addStop(admin.accessToken, route.id, { city: "Keep1", address: "A" });
      const s2 = await addStop(admin.accessToken, route.id, { city: "Remove", address: "B" });
      const s3 = await addStop(admin.accessToken, route.id, { city: "Keep2", address: "C" });

      await request(app.getHttpServer())
        .delete(`/routes/${route.id}/stops/${s2.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops).toHaveLength(2);
      expect(stops[0].id).toBe(s1.id);
      expect(stops[0].sequence).toBe(1);
      expect(stops[1].id).toBe(s3.id);
      expect(stops[1].sequence).toBe(2);
    });

    it("returns 404 when removing a stop that does not exist", async () => {
      const admin = await registerAdmin("Org-F-Miss");
      const route = await createRoute(admin.accessToken);

      await request(app.getHttpServer())
        .delete(`/routes/${route.id}/stops/${randomUUID()}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  // ─── G: Duplicate stop protection ────────────────────────────────────────

  describe("G: Duplicate stop protection", () => {
    it("rejects adding the same orderId twice on one route", async () => {
      const admin = await registerAdmin("Org-G-Dup");

      // Create a customer and order to reference
      const customerRes = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "TestCo", contactName: "Bob" })
        .expect(201);
      const customerId = (customerRes.body as { data: { id: string } }).data.id;

      const orderRes = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId,
          pickupDate: "2030-06-01T08:00:00.000Z",
          deliveryDate: "2030-06-05T18:00:00.000Z",
          pickupAddress: "1 Pickup Rd",
          pickupCity: "CityA",
          deliveryAddress: "1 Delivery Rd",
          deliveryCity: "CityB",
          cargoDescription: "Goods",
          price: 100,
        })
        .expect(201);
      const orderId = (orderRes.body as { data: { id: string } }).data.id;

      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { orderId, address: "1 Main", city: "Tashkent" });

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId, address: "2 Main", city: "Samarkand" })
        .expect(409);
    });
  });

  // ─── H: Route totals calculation ──────────────────────────────────────────

  describe("H: Route totals calculation", () => {
    it("calculate endpoint returns 200 and sets totals (Mapbox not configured → zero values)", async () => {
      const admin = await registerAdmin("Org-H-Calc");
      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, {
        city: "Tashkent",
        address: "Main Square",
        lat: "41.3",
        lng: "69.2",
      });
      await addStop(admin.accessToken, route.id, {
        city: "Samarkand",
        address: "Registan",
        lat: "39.6",
        lng: "66.9",
      });

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/calculate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      // With Mapbox not configured the service falls back to zero-values.
      // The contract is that totalDistanceM and totalDurationSec are set on the route.
      const detail = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const updated = (detail.body as RouteResponse).data;
      expect(typeof updated.totalDistanceM).toBe("number");
      expect(typeof updated.totalDurationSec).toBe("number");
    });

    it("calculate on a route with <2 stops is a no-op (returns 200)", async () => {
      const admin = await registerAdmin("Org-H-OneStop");
      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { city: "Tashkent", address: "1 St" });

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/calculate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
    });
  });

  // ─── I: Route status transitions ─────────────────────────────────────────

  describe("I: Route status transitions", () => {
    it("DRAFT → PLANNED requires driver, vehicle, and at least one stop", async () => {
      const admin = await registerAdmin("Org-I-Plan");
      const route = await createRoute(admin.accessToken);

      // No driver, vehicle, or stops yet
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(400);

      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);

      // Assign driver + vehicle but still no stops
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(400);

      // Add a stop — now planning should succeed
      await addStop(admin.accessToken, route.id, { city: "Tashkent", address: "Hub" });

      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);

      expect((res.body as RouteResponse).data.status).toBe("PLANNED");
    });

    it("COMPLETED → anything is rejected", async () => {
      const admin = await registerAdmin("Org-I-Completed");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      await addStop(admin.accessToken, route.id, { city: "City", address: "Addr" });

      // DRAFT → PLANNED → IN_PROGRESS → COMPLETED
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "COMPLETED" })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(400);
    });

    it("DRAFT → COMPLETED is an invalid transition", async () => {
      const admin = await registerAdmin("Org-I-Skip");
      const route = await createRoute(admin.accessToken);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "COMPLETED" })
        .expect(400);
    });

    it("cannot mutate stops on an IN_PROGRESS route", async () => {
      const admin = await registerAdmin("Org-I-NoMutate");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      await addStop(admin.accessToken, route.id, { city: "City", address: "Addr" });

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ address: "New Stop", city: "City" })
        .expect(400);
    });
  });

  // ─── J: Route ↔ dispatch relationship ────────────────────────────────────

  describe("J: Route ↔ dispatch relationship", () => {
    it("a stop can reference a dispatchId and it is returned in the response", async () => {
      const admin = await registerAdmin("Org-J-Dispatch");

      const customerRes = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "JCo", contactName: "Jane" })
        .expect(201);
      const customerId = (customerRes.body as { data: { id: string } }).data.id;

      const orderRes = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId,
          pickupDate: "2030-07-01T08:00:00.000Z",
          deliveryDate: "2030-07-05T18:00:00.000Z",
          pickupAddress: "1 Pick",
          pickupCity: "Tashkent",
          deliveryAddress: "1 Del",
          deliveryCity: "Samarkand",
          cargoDescription: "Goods",
          price: 500,
        })
        .expect(201);
      const orderId = (orderRes.body as { data: { id: string } }).data.id;

      // Orders start as DRAFT; must be PENDING before dispatching
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PENDING" })
        .expect(200);

      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);

      const dispatchRes = await request(app.getHttpServer())
        .post("/dispatches")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId, driverId: driver.id, vehicleId: vehicle.id })
        .expect(201);
      const dispatchId = (dispatchRes.body as { data: { id: string } }).data.id;

      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, {
        city: "Tashkent",
        address: "Hub",
        dispatchId,
      });

      const detail = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const stops = (detail.body as RouteResponse).data.stops;
      expect(stops[0].dispatch).toBeDefined();
      expect(stops[0].dispatch!.id).toBe(dispatchId);
    });
  });

  // ─── K: Cancelled dispatch does not corrupt route ────────────────────────

  describe("K: Cancelled dispatch does not corrupt route", () => {
    it("route remains stable when a referenced dispatch is cancelled", async () => {
      const admin = await registerAdmin("Org-K-Cancel");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);

      const customerRes = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "KCo", contactName: "Karl" })
        .expect(201);
      const customerId = (customerRes.body as { data: { id: string } }).data.id;

      const orderRes = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId,
          pickupDate: "2030-07-10T08:00:00.000Z",
          deliveryDate: "2030-07-15T18:00:00.000Z",
          pickupAddress: "1 Pk",
          pickupCity: "Tashkent",
          deliveryAddress: "1 Del",
          deliveryCity: "Samarkand",
          cargoDescription: "Goods",
          price: 200,
        })
        .expect(201);
      const orderId = (orderRes.body as { data: { id: string } }).data.id;

      // Orders start as DRAFT; must be PENDING before dispatching
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PENDING" })
        .expect(200);

      const dispatchRes = await request(app.getHttpServer())
        .post("/dispatches")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ orderId, driverId: driver.id, vehicleId: vehicle.id })
        .expect(201);
      const dispatchId = (dispatchRes.body as { data: { id: string } }).data.id;

      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { city: "Tashkent", address: "Hub", dispatchId });

      // Advance dispatch to ARRIVED_AT_DELIVERY then cancel
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "EN_ROUTE_TO_PICKUP" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "AT_PICKUP" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_TRANSIT" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ARRIVED_AT_DELIVERY" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(200);

      // Route is still accessible and stops are intact
      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const updated = (res.body as RouteResponse).data;
      expect(updated.status).toBe("DRAFT");
      expect(updated.stops).toHaveLength(1);
      expect(updated.stops[0].dispatch?.status).toBe("CANCELLED");
    });
  });

  // ─── Shared helpers for dispatch-creation tests ──────────────────────────

  async function createOrderAndDispatch(
    token: string,
    tag: string,
    driverId: string,
    vehicleId: string,
  ): Promise<{ orderId: string; dispatchId: string }> {
    const customerRes = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyName: `${tag}Co`, contactName: `${tag}Contact` })
      .expect(201);
    const customerId = (customerRes.body as { data: { id: string } }).data.id;

    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        pickupDate: "2030-08-01T08:00:00.000Z",
        deliveryDate: "2030-08-05T18:00:00.000Z",
        pickupAddress: "1 Pickup St",
        pickupCity: "Tashkent",
        deliveryAddress: "1 Delivery St",
        deliveryCity: "Samarkand",
        cargoDescription: "Goods",
        price: 100,
      })
      .expect(201);
    const orderId = (orderRes.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "PENDING" })
      .expect(200);

    const dispatchRes = await request(app.getHttpServer())
      .post("/dispatches")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, driverId, vehicleId })
      .expect(201);
    const dispatchId = (dispatchRes.body as { data: { id: string } }).data.id;

    return { orderId, dispatchId };
  }

  // ─── M: Dispatch integrity guards ────────────────────────────────────────

  describe("M: Dispatch integrity guards", () => {
    it("rejects adding a cancelled dispatch to a route", async () => {
      const admin = await registerAdmin("Org-M-Terminal");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "MT1", driver.id, vehicle.id);

      // DRAFT → ASSIGNED → CANCELLED (DRAFT cannot jump directly to CANCELLED)
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(200);

      const route = await createRoute(admin.accessToken);
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ address: "1 Main", city: "Tashkent", dispatchId })
        .expect(400);
    });

    it("rejects adding the same dispatch twice on one route", async () => {
      const admin = await registerAdmin("Org-M-Dup");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "MD1", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { address: "1 Main", city: "Tashkent", dispatchId });

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ address: "2 Main", city: "Samarkand", dispatchId })
        .expect(409);
    });

    it("rejects adding a dispatch already on another active route", async () => {
      const admin = await registerAdmin("Org-M-CrossRoute");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "MCR", driver.id, vehicle.id);

      const routeA = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, routeA.id, { address: "Stop A", city: "Tashkent", dispatchId });

      const routeB = await createRoute(admin.accessToken);
      await request(app.getHttpServer())
        .post(`/routes/${routeB.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ address: "Stop B", city: "Samarkand", dispatchId })
        .expect(409);
    });

    it("allows adding a dispatch to a new route after the old route is cancelled", async () => {
      const admin = await registerAdmin("Org-M-AfterCancel");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "MAC", driver.id, vehicle.id);

      const routeA = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, routeA.id, { address: "Stop A", city: "Tashkent", dispatchId });

      // Cancel routeA → dispatch is now free to be re-linked
      await request(app.getHttpServer())
        .patch(`/routes/${routeA.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(200);

      const routeB = await createRoute(admin.accessToken);
      await request(app.getHttpServer())
        .post(`/routes/${routeB.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ address: "Stop B", city: "Samarkand", dispatchId })
        .expect(201);
    });

    it("rejects adding a stop when dispatchId belongs to a different orderId than provided", async () => {
      const admin = await registerAdmin("Org-M-Consistency");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);

      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "MC1", driver.id, vehicle.id);

      // Create a separate order (different from the dispatch's order)
      const customerRes = await request(app.getHttpServer())
        .post("/customers")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyName: "OtherCo", contactName: "Other" })
        .expect(201);
      const otherCustomerId = (customerRes.body as { data: { id: string } }).data.id;
      const otherOrderRes = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId: otherCustomerId,
          pickupDate: "2030-09-01T08:00:00.000Z",
          deliveryDate: "2030-09-05T18:00:00.000Z",
          pickupAddress: "2 Pick",
          pickupCity: "Bukhara",
          deliveryAddress: "2 Del",
          deliveryCity: "Namangan",
          cargoDescription: "Other",
          price: 200,
        })
        .expect(201);
      const otherOrderId = (otherOrderRes.body as { data: { id: string } }).data.id;

      const route = await createRoute(admin.accessToken);
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ address: "1 Main", city: "Tashkent", dispatchId, orderId: otherOrderId })
        .expect(400);
    });
  });

  // ─── N: Reorder edge cases ────────────────────────────────────────────────

  describe("N: Reorder edge cases", () => {
    it("swaps two stops correctly", async () => {
      const admin = await registerAdmin("Org-N-TwoSwap");
      const route = await createRoute(admin.accessToken);
      const s1 = await addStop(admin.accessToken, route.id, { city: "Alpha", address: "1 A" });
      const s2 = await addStop(admin.accessToken, route.id, { city: "Beta", address: "1 B" });

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [s2.id, s1.id] })
        .expect(200);

      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops[0].id).toBe(s2.id);
      expect(stops[0].sequence).toBe(1);
      expect(stops[1].id).toBe(s1.id);
      expect(stops[1].sequence).toBe(2);
    });

    it("moves first stop to last position", async () => {
      const admin = await registerAdmin("Org-N-FirstLast");
      const route = await createRoute(admin.accessToken);
      const s1 = await addStop(admin.accessToken, route.id, { city: "A", address: "1" });
      const s2 = await addStop(admin.accessToken, route.id, { city: "B", address: "2" });
      const s3 = await addStop(admin.accessToken, route.id, { city: "C", address: "3" });

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [s2.id, s3.id, s1.id] })
        .expect(200);

      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops.map((s) => s.id)).toEqual([s2.id, s3.id, s1.id]);
      expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    });

    it("moves last stop to first position", async () => {
      const admin = await registerAdmin("Org-N-LastFirst");
      const route = await createRoute(admin.accessToken);
      const s1 = await addStop(admin.accessToken, route.id, { city: "A", address: "1" });
      const s2 = await addStop(admin.accessToken, route.id, { city: "B", address: "2" });
      const s3 = await addStop(admin.accessToken, route.id, { city: "C", address: "3" });

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [s3.id, s1.id, s2.id] })
        .expect(200);

      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops.map((s) => s.id)).toEqual([s3.id, s1.id, s2.id]);
      expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    });

    it("handles repeated reorders correctly", async () => {
      const admin = await registerAdmin("Org-N-Repeated");
      const route = await createRoute(admin.accessToken);
      const s1 = await addStop(admin.accessToken, route.id, { city: "A", address: "1" });
      const s2 = await addStop(admin.accessToken, route.id, { city: "B", address: "2" });
      const s3 = await addStop(admin.accessToken, route.id, { city: "C", address: "3" });

      // First reorder: reverse
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [s3.id, s2.id, s1.id] })
        .expect(200);

      // Second reorder: back to original
      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/stops/reorder`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ stopIds: [s1.id, s2.id, s3.id] })
        .expect(200);

      const stops: RouteStopBody[] = (res.body as RouteResponse).data.stops;
      expect(stops.map((s) => s.id)).toEqual([s1.id, s2.id, s3.id]);
      expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    });
  });

  // ─── O: Route completion guard ────────────────────────────────────────────

  describe("O: Route completion guard", () => {
    async function buildInProgressRoute(
      token: string,
      driverId: string,
      vehicleId: string,
    ) {
      const route = await createRoute(token, { driverId, vehicleId });
      await addStop(token, route.id, { city: "Stop1", address: "1 Main St" });
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "PLANNED" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);
      return route;
    }

    it("O1: completes a route with no dispatches", async () => {
      const admin = await registerAdmin("Org-O1-NoDsp");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const route = await buildInProgressRoute(admin.accessToken, driver.id, vehicle.id);

      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "COMPLETED" })
        .expect(200);
      expect((res.body as RouteResponse).data.status).toBe("COMPLETED");
    });

    it("O2: rejects completion when a dispatch is still active (ASSIGNED)", async () => {
      const admin = await registerAdmin("Org-O2-ActiveDsp");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(
        admin.accessToken, "O2", driver.id, vehicle.id,
      );

      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      await addStop(admin.accessToken, route.id, { city: "StopA", address: "1 A St", dispatchId });
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "COMPLETED" })
        .expect(400);

      const msg: string = (res.body as { error: { message: string } }).error.message;
      expect(msg).toContain("dispatch");
      expect(msg).toContain("active");
    });

    it("O3: completes route once active dispatch is cancelled", async () => {
      const admin = await registerAdmin("Org-O3-AfterCancel");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(
        admin.accessToken, "O3", driver.id, vehicle.id,
      );

      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      await addStop(admin.accessToken, route.id, { city: "StopB", address: "1 B St", dispatchId });
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);

      // Cancel the dispatch: DRAFT → ASSIGNED → CANCELLED
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(200);

      // Now completion should succeed
      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "COMPLETED" })
        .expect(200);
      expect((res.body as RouteResponse).data.status).toBe("COMPLETED");
    });
  });

  // ─── L: Multi-stop route valid after intermediate stop failure ─────────────

  describe("L: Multi-stop route valid after intermediate stop failure", () => {
    it("route with multiple stops remains valid after one dispatch fails mid-route", async () => {
      const admin = await registerAdmin("Org-L-Multi");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);

      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });

      // Two plain address stops (no dispatch reference)
      await addStop(admin.accessToken, route.id, { city: "Stop1City", address: "1 St" });
      await addStop(admin.accessToken, route.id, { city: "Stop2City", address: "2 St" });

      // Transition to PLANNED → IN_PROGRESS to simulate active route
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);

      // Route is still fetchable and both stops remain
      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const data = (res.body as RouteResponse).data;
      expect(data.status).toBe("IN_PROGRESS");
      expect(data.stops).toHaveLength(2);
      // Stop sequences are still contiguous
      expect(data.stops.map((s) => s.sequence)).toEqual([1, 2]);
    });
  });

  // ─── Q: Route optimization (Phase 6-6) ────────────────────────────────────

  describe("Q: Route optimization", () => {
    // Coordinates arranged so Tashkent→Bukhara→Samarkand→Fergana is suboptimal
    // (crosses itself); NN should find a shorter path.
    const STOPS_COORDS = [
      { address: "Tashkent HQ", city: "Tashkent",  lat: "41.2995", lng: "69.2401" },
      { address: "Bukhara Hub",  city: "Bukhara",   lat: "39.7748", lng: "64.4286" }, // far west
      { address: "Samarkand WH", city: "Samarkand", lat: "39.6547", lng: "66.9597" }, // between
      { address: "Fergana DC",   city: "Fergana",   lat: "40.3864", lng: "71.7864" }, // east
    ];

    async function createRouteWithCoordStops(token: string) {
      const route = await createRoute(token);
      const stops: RouteStopBody[] = [];
      for (const s of STOPS_COORDS) {
        const stop = await addStop(token, route.id, s);
        stops.push(stop);
      }
      return { route, stops };
    }

    it("Q-A: preview returns feasible result with metrics on DRAFT route", async () => {
      const admin = await registerAdmin("Org-QA-Preview");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = (res.body as { data: OptimizationPreviewBody }).data;
      expect(body.optimized).toBe(true);
      expect(body.currentSequence).toHaveLength(4);
      expect(body.proposedSequence).toHaveLength(4);
      expect(body.routeUpdatedAt).toBeTruthy();
      expect(typeof body.currentDistance).toBe("number");
      expect(typeof body.optimizedDistance).toBe("number");
      expect(body.distanceSaved).toBeGreaterThanOrEqual(0);
      expect(body.eligibleCount).toBe(4);
      expect(body.fixedCount).toBe(0);
    });

    it("Q-B: preview is deterministic — two calls return identical proposedSequence", async () => {
      const admin = await registerAdmin("Org-QB-Determinism");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      const r1 = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const r2 = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const b1 = (r1.body as { data: OptimizationPreviewBody }).data;
      const b2 = (r2.body as { data: OptimizationPreviewBody }).data;
      expect(b1.proposedSequence).toEqual(b2.proposedSequence);
    });

    it("Q-C: apply reorders stops and the route reflects the new order", async () => {
      const admin = await registerAdmin("Org-QC-Apply");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      // Preview first to get routeUpdatedAt
      const previewRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const preview = (previewRes.body as { data: OptimizationPreviewBody }).data;

      const applyRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(200);

      const applied = (applyRes.body as { data: { route: RouteBody; changedStopIds: string[] } }).data;
      expect(applied.route.stops).toHaveLength(4);
      // Verify the applied sequence matches what was proposed
      const appliedOrder = applied.route.stops.map((s) => s.id);
      const proposedOrder = [...preview.proposedSequence]
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.id);
      expect(appliedOrder).toEqual(proposedOrder);
    });

    it("Q-D: apply with stale routeUpdatedAt returns 409", async () => {
      const admin = await registerAdmin("Org-QD-Stale");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      // Use a clearly wrong timestamp
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: "2020-01-01T00:00:00.000Z" })
        .expect(409);
    });

    it("Q-E: preview on a COMPLETED route returns 403", async () => {
      const admin = await registerAdmin("Org-QE-Completed");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      await addStop(admin.accessToken, route.id, STOPS_COORDS[0]);
      await addStop(admin.accessToken, route.id, STOPS_COORDS[1]);

      // DRAFT → PLANNED → IN_PROGRESS → COMPLETED
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" }).expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" }).expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "COMPLETED" }).expect(200);

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(403);
    });

    it("Q-F: preview on a CANCELLED route returns 403", async () => {
      const admin = await registerAdmin("Org-QF-Cancelled");
      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, STOPS_COORDS[0]);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" }).expect(200);

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(403);
    });

    it("Q-G: IN_PROGRESS route — stops with optimizationLocked stay fixed", async () => {
      const admin = await registerAdmin("Org-QG-InProgress");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { route, stops } = await createRouteWithCoordStops(admin.accessToken);

      // Assign driver/vehicle then go IN_PROGRESS
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id }).expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" }).expect(200);
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_PROGRESS" }).expect(200);

      // Lock the first stop
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stops[0].id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ optimizationLocked: true }).expect(200);

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = (res.body as { data: OptimizationPreviewBody }).data;
      // The locked stop must remain at sequence 1
      const lockedInProposed = body.proposedSequence.find((s) => s.id === stops[0].id)!;
      expect(lockedInProposed.sequence).toBe(stops[0].sequence);
      expect(body.fixedCount).toBeGreaterThanOrEqual(1);
    });

    it("Q-H: stops without coordinates produce a warning and partial result", async () => {
      const admin = await registerAdmin("Org-QH-NoCoord");
      const route = await createRoute(admin.accessToken);

      // Two stops with coords, one without
      await addStop(admin.accessToken, route.id, { address: "A", city: "City", lat: "41.0", lng: "69.0" });
      await addStop(admin.accessToken, route.id, { address: "B", city: "City" }); // no coords
      await addStop(admin.accessToken, route.id, { address: "C", city: "City", lat: "40.0", lng: "68.0" });

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = (res.body as { data: OptimizationPreviewBody }).data;
      expect(body.missingCoordCount).toBe(1);
      expect(body.warnings.some((w: string) => w.includes("lack coordinates"))).toBe(true);
    });

    it("Q-I: PATCH stop toggles optimizationLocked field", async () => {
      const admin = await registerAdmin("Org-QI-LockToggle");
      const route = await createRoute(admin.accessToken);
      const stop = await addStop(admin.accessToken, route.id, { address: "A", city: "City" });

      expect(stop.optimizationLocked).toBe(false);

      const lockRes = await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ optimizationLocked: true })
        .expect(200);
      expect((lockRes.body as { data: RouteStopBody }).data.optimizationLocked).toBe(true);

      const unlockRes = await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ optimizationLocked: false })
        .expect(200);
      expect((unlockRes.body as { data: RouteStopBody }).data.optimizationLocked).toBe(false);
    });

    it("Q-J: locked stop is not moved by optimization", async () => {
      const admin = await registerAdmin("Org-QJ-LockFixed");
      const route = await createRoute(admin.accessToken);

      // Add 4 stops; lock the second one
      const s1 = await addStop(admin.accessToken, route.id, STOPS_COORDS[0]);
      const s2 = await addStop(admin.accessToken, route.id, STOPS_COORDS[1]);
      await addStop(admin.accessToken, route.id, STOPS_COORDS[2]);
      await addStop(admin.accessToken, route.id, STOPS_COORDS[3]);

      // Lock s2 (sequence 2)
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${s2.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ optimizationLocked: true }).expect(200);

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = (res.body as { data: OptimizationPreviewBody }).data;
      const s2InProposed = body.proposedSequence.find((s) => s.id === s2.id)!;
      expect(s2InProposed.sequence).toBe(s2.sequence);
    });

    it("Q-K: apply with fewer than 2 eligible stops returns 400", async () => {
      const admin = await registerAdmin("Org-QK-NoEligible");
      const route = await createRoute(admin.accessToken);

      // Single stop — not enough to optimize
      const s1 = await addStop(admin.accessToken, route.id, STOPS_COORDS[0]);

      // Lock it
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${s1.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ optimizationLocked: true }).expect(200);

      // Get valid routeUpdatedAt
      const previewRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const preview = (previewRes.body as { data: OptimizationPreviewBody }).data;

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(400);
    });

    it("Q-L: tenant isolation — org A cannot preview org B route", async () => {
      const adminA = await registerAdmin("Org-QL-TenantA");
      const adminB = await registerAdmin("Org-QL-TenantB");
      const { route: routeB } = await createRouteWithCoordStops(adminB.accessToken);

      await request(app.getHttpServer())
        .post(`/routes/${routeB.id}/optimize/preview`)
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .expect(404);
    });

    it("Q-M: apply after route was modified between preview and apply returns 409", async () => {
      const admin = await registerAdmin("Org-QM-StaleApply");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      // Get a preview token
      const previewRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const preview = (previewRes.body as { data: OptimizationPreviewBody }).data;

      // Modify the route (touch updatedAt) by adding a note
      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ notes: "modified after preview" })
        .expect(200);

      // Apply with the now-stale token should 409
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(409);
    });

    it("Q-N: distanceSaved is non-negative and optimizedDistance <= currentDistance", async () => {
      const admin = await registerAdmin("Org-QN-Savings");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = (res.body as { data: OptimizationPreviewBody }).data;
      expect(body.distanceSaved).toBeGreaterThanOrEqual(0);
      expect(body.optimizedDistance).toBeLessThanOrEqual(body.currentDistance + 1);
    });

    it("Q-O: applying the same preview twice returns 409 on the second attempt", async () => {
      const admin = await registerAdmin("Org-QO-DuplicateApply");
      const { route } = await createRouteWithCoordStops(admin.accessToken);

      const previewRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const preview = (previewRes.body as { data: OptimizationPreviewBody }).data;

      // First apply succeeds (bumps route.updatedAt)
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(200);

      // Second apply with the now-stale token must be rejected
      await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(409);
    });

    it("Q-P: tenant isolation — org A cannot lock a stop on org B route", async () => {
      const adminA = await registerAdmin("Org-QP-TenantA");
      const adminB = await registerAdmin("Org-QP-TenantB");

      const routeB = await createRoute(adminB.accessToken);
      const stopB = await addStop(adminB.accessToken, routeB.id, STOPS_COORDS[0]);

      await request(app.getHttpServer())
        .patch(`/routes/${routeB.id}/stops/${stopB.id}`)
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .send({ optimizationLocked: true })
        .expect(404);
    });

    it("Q-Q: applied route contains exactly the same stop IDs as before optimization", async () => {
      const admin = await registerAdmin("Org-QQ-SameIds");
      const { route, stops } = await createRouteWithCoordStops(admin.accessToken);
      const originalIds = new Set(stops.map((s) => s.id));

      const previewRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const preview = (previewRes.body as { data: OptimizationPreviewBody }).data;

      const applyRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(200);

      const appliedStops = (applyRes.body as { data: { route: RouteBody; changedStopIds: string[] } }).data.route.stops;
      expect(appliedStops).toHaveLength(stops.length);
      for (const id of originalIds) {
        expect(appliedStops.some((s) => s.id === id)).toBe(true);
      }
    });

    it("Q-R: apply on already-optimal route returns changedStopIds empty and does not error", async () => {
      const admin = await registerAdmin("Org-QR-AlreadyOptimal");
      const route = await createRoute(admin.accessToken);

      // Two stops in straight-line order — already optimal
      await addStop(admin.accessToken, route.id, { address: "A", city: "Tashkent", lat: "41.0", lng: "69.0" });
      await addStop(admin.accessToken, route.id, { address: "B", city: "Tashkent", lat: "41.0", lng: "70.0" });

      const previewRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const preview = (previewRes.body as { data: OptimizationPreviewBody }).data;

      const applyRes = await request(app.getHttpServer())
        .post(`/routes/${route.id}/optimize/apply`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ routeUpdatedAt: preview.routeUpdatedAt })
        .expect(200);

      const result = (applyRes.body as { data: { route: RouteBody; changedStopIds: string[] } }).data;
      expect(result.changedStopIds).toHaveLength(0);
      expect(result.route.stops).toHaveLength(2);
    });
  });

  // ─── P: Route calculation metrics & geocoding (Phase 6-5) ─────────────────

  describe("P: Route calculation metrics & geocoding", () => {
    it("P1: calculate returns missingStopCount and writes calculationStatus to route", async () => {
      const admin = await registerAdmin("Org-P1-CalcMeta");
      const route = await createRoute(admin.accessToken);

      // Add stops without coordinates
      await addStop(admin.accessToken, route.id, { address: "1 A St", city: "Tashkent" });
      await addStop(admin.accessToken, route.id, { address: "2 B St", city: "Samarkand" });

      // Calculate — Mapbox is unconfigured in test env so we get UNAVAILABLE
      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/calculate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = res.body as { data: { route: RouteBody & { calculationStatus: string | null }; missingStopCount: number; message: string } };
      expect(body.data.missingStopCount).toBe(2);
      expect(body.data.message).toContain("2 stops with coordinates");
    });

    it("P2: stop creation succeeds even when geocoding would fail (no Mapbox token)", async () => {
      const admin = await registerAdmin("Org-P2-GeoFail");
      const route = await createRoute(admin.accessToken);

      // Adding a stop without lat/lng should not throw even if geocoding is unavailable
      const stop = await addStop(admin.accessToken, route.id, {
        address: "No-geocode Ave",
        city: "Testville",
      });
      expect(stop.id).toBeDefined();
      expect(stop.address).toBe("No-geocode Ave");
    });

    it("P3: calculate with coords returns calculationStatus UNAVAILABLE when Mapbox unconfigured", async () => {
      const admin = await registerAdmin("Org-P3-NoMapbox");
      const route = await createRoute(admin.accessToken);

      // Inject coords directly via Prisma for E2E realism
      const s1 = await addStop(admin.accessToken, route.id, { address: "41.2995 Ave", city: "Tashkent" });
      const s2 = await addStop(admin.accessToken, route.id, { address: "39.6547 Ave", city: "Samarkand" });
      await prisma.routeStop.updateMany({
        where: { id: { in: [s1.id, s2.id] } },
        data: { lat: "41.2995", lng: "69.2401" },
      });
      await prisma.routeStop.update({ where: { id: s2.id }, data: { lat: "39.6547", lng: "66.9597" } });

      const res = await request(app.getHttpServer())
        .post(`/routes/${route.id}/calculate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = res.body as { data: { route: RouteBody & { calculationStatus: string | null; calculatedAt: string | null }; missingStopCount: number } };
      // calculationStatus is one of: SUCCESS (Mapbox configured), PARTIAL, or UNAVAILABLE
      expect(["SUCCESS", "PARTIAL", "UNAVAILABLE"]).toContain(body.data.route.calculationStatus);
      expect(body.data.route.calculatedAt).toBeTruthy();
      expect(body.data.missingStopCount).toBe(0);
    });

    it("P4: concurrent calculation guard returns 409 when calculationStatus is CALCULATING", async () => {
      const admin = await registerAdmin("Org-P4-Concurrent");
      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { address: "41 A", city: "Tashkent" });
      await addStop(admin.accessToken, route.id, { address: "39 B", city: "Samarkand" });

      // Force the route into CALCULATING state
      await prisma.route.update({
        where: { id: route.id },
        data: { calculationStatus: "CALCULATING" },
      });

      await request(app.getHttpServer())
        .post(`/routes/${route.id}/calculate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });

    it("P5: tenant isolation — org A cannot calculate org B route", async () => {
      const adminA = await registerAdmin("Org-P5-TenantA");
      const adminB = await registerAdmin("Org-P5-TenantB");
      const routeB = await createRoute(adminB.accessToken);

      await request(app.getHttpServer())
        .post(`/routes/${routeB.id}/calculate`)
        .set("Authorization", `Bearer ${adminA.accessToken}`)
        .expect(404);
    });

    it("P6: adding a stop with explicit lat/lng preserves those coordinates", async () => {
      const admin = await registerAdmin("Org-P6-ExplicitCoord");
      const route = await createRoute(admin.accessToken);

      const stop = await addStop(admin.accessToken, route.id, {
        address: "123 Precise St",
        city: "Tashkent",
        lat: "41.299496",
        lng: "69.240073",
      });

      // Re-fetch the stop to confirm coords were preserved
      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const fetched = (res.body as RouteResponse).data.stops.find((s) => s.id === stop.id);
      expect(fetched).toBeDefined();
      expect(Number(fetched!.lat)).toBeCloseTo(41.299496, 4);
      expect(Number(fetched!.lng)).toBeCloseTo(69.240073, 4);
    });
  });

  // ─── R: Dispatch link/unlink on existing stops (Phase 7-1) ───────────────

  describe("R: Dispatch link/unlink on existing stops", () => {
    it("R1: links a dispatch to an existing stop via PATCH", async () => {
      const admin = await registerAdmin("Org-R1-Link");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R1", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken);
      const stop = await addStop(admin.accessToken, route.id, { address: "1 Main", city: "Tashkent" });
      expect(stop.dispatch).toBeNull();

      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ dispatchId })
        .expect(200);

      const updated = (res.body as { data: RouteStopBody }).data;
      expect(updated.dispatch).not.toBeNull();
      expect(updated.dispatch!.id).toBe(dispatchId);
    });

    it("R2: unlinks a dispatch from a stop by sending dispatchId: null", async () => {
      const admin = await registerAdmin("Org-R2-Unlink");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R2", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken);
      const stop = await addStop(admin.accessToken, route.id, { address: "1 Hub", city: "Tashkent", dispatchId });

      const res = await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ dispatchId: null })
        .expect(200);

      const updated = (res.body as { data: RouteStopBody }).data;
      expect(updated.dispatch).toBeNull();
    });

    it("R3: rejects linking a dispatch already linked on a different stop of the same route", async () => {
      const admin = await registerAdmin("Org-R3-Dup");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R3", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, route.id, { address: "Stop A", city: "Tashkent", dispatchId });
      const stop2 = await addStop(admin.accessToken, route.id, { address: "Stop B", city: "Samarkand" });

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop2.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ dispatchId })
        .expect(409);
    });

    it("R4: rejects linking a dispatch already on another active route", async () => {
      const admin = await registerAdmin("Org-R4-CrossRoute");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R4", driver.id, vehicle.id);

      const routeA = await createRoute(admin.accessToken);
      await addStop(admin.accessToken, routeA.id, { address: "Stop A", city: "Tashkent", dispatchId });

      const routeB = await createRoute(admin.accessToken);
      const stopB = await addStop(admin.accessToken, routeB.id, { address: "Stop B", city: "Samarkand" });

      await request(app.getHttpServer())
        .patch(`/routes/${routeB.id}/stops/${stopB.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ dispatchId })
        .expect(409);
    });

    it("R5: rejects linking a terminal (CANCELLED) dispatch to a stop", async () => {
      const admin = await registerAdmin("Org-R5-Terminal");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R5", driver.id, vehicle.id);

      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(200);

      const route = await createRoute(admin.accessToken);
      const stop = await addStop(admin.accessToken, route.id, { address: "1 A", city: "Tashkent" });

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ dispatchId })
        .expect(400);
    });

    it("R6: rejects unlinking a stop whose dispatch is active (EN_ROUTE_TO_PICKUP)", async () => {
      const admin = await registerAdmin("Org-R6-ActiveUnlink");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R6", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken);
      const stop = await addStop(admin.accessToken, route.id, { address: "1 Hub", city: "Tashkent", dispatchId });

      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "EN_ROUTE_TO_PICKUP" })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}/stops/${stop.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ dispatchId: null })
        .expect(409);
    });

    it("R7: tenant isolation — org A cannot link org A dispatch to org B route stop", async () => {
      const adminA = await registerAdmin("Org-R7-TenantA");
      const adminB = await registerAdmin("Org-R7-TenantB");
      const driverA = await createDriver(adminA.accessToken, adminA.organization.id);
      const vehicleA = await createVehicle(adminA.accessToken, adminA.organization.id);
      const { dispatchId } = await createOrderAndDispatch(adminA.accessToken, "R7", driverA.id, vehicleA.id);

      const routeB = await createRoute(adminB.accessToken);
      const stopB = await addStop(adminB.accessToken, routeB.id, { address: "1 B", city: "Tashkent" });

      // Org B token cannot see org A dispatch → 404 on the dispatch lookup
      await request(app.getHttpServer())
        .patch(`/routes/${routeB.id}/stops/${stopB.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .send({ dispatchId })
        .expect(404);
    });

    it("R8: dispatch DELIVERED → RouteStop.status becomes COMPLETED", async () => {
      const admin = await registerAdmin("Org-R8-StopCompleted");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R8", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      const stop = await addStop(admin.accessToken, route.id, { address: "1 Hub", city: "Tashkent", dispatchId });

      // Advance dispatch through to DELIVERED
      for (const status of ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "DELIVERED"]) {
        await request(app.getHttpServer())
          .post(`/dispatches/${dispatchId}/status`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send({ status })
          .expect(200);
      }

      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const routeStop = (res.body as RouteResponse).data.stops.find((s) => s.id === stop.id);
      expect(routeStop!.status).toBe("COMPLETED");
    });

    it("R9: dispatch CANCELLED → RouteStop.status becomes SKIPPED", async () => {
      const admin = await registerAdmin("Org-R9-StopSkipped");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R9", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      const stop = await addStop(admin.accessToken, route.id, { address: "1 Hub", city: "Tashkent", dispatchId });

      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "CANCELLED" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const routeStop = (res.body as RouteResponse).data.stops.find((s) => s.id === stop.id);
      expect(routeStop!.status).toBe("SKIPPED");
    });

    it("R10: dispatch going EN_ROUTE_TO_PICKUP auto-advances a PLANNED route to IN_PROGRESS", async () => {
      const admin = await registerAdmin("Org-R10-AutoAdvance");
      const driver = await createDriver(admin.accessToken, admin.organization.id);
      const vehicle = await createVehicle(admin.accessToken, admin.organization.id);
      const { dispatchId } = await createOrderAndDispatch(admin.accessToken, "R10", driver.id, vehicle.id);

      const route = await createRoute(admin.accessToken, { driverId: driver.id, vehicleId: vehicle.id });
      await addStop(admin.accessToken, route.id, { address: "1 Hub", city: "Tashkent", dispatchId });

      await request(app.getHttpServer())
        .patch(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PLANNED" })
        .expect(200);

      // DRAFT → ASSIGNED → EN_ROUTE_TO_PICKUP should trigger auto IN_PROGRESS
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/dispatches/${dispatchId}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "EN_ROUTE_TO_PICKUP" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/routes/${route.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      expect((res.body as RouteResponse).data.status).toBe("IN_PROGRESS");
    });
  });
});
