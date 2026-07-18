import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Telematics Trip Lifecycle E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let deviceId: string;
  let deviceSecret: string;
  let vehicleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.gpsPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.telematicsDevice.deleteMany({});

    // Get org and auth
    const org = await prisma.organization.findFirst({ where: { slug: "test-org" } });
    const authRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@test.com", password: "password" });
    adminToken = authRes.body.accessToken;

    // Create vehicle
    const vehicleRes = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vehicleCode: "TRIP-TEST-001", plateNumber: "TRIP-01", type: "VAN", capacity: 1000 });
    vehicleId = vehicleRes.body.id;

    // Create device
    const deviceRes = await request(app.getHttpServer())
      .post("/telematics/devices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        provider: "MANUAL",
        externalId: "TRIP-TEST-DEVICE",
        name: "Trip Test Device",
        vehicleId,
      });
    deviceId = deviceRes.body.id;
    deviceSecret = deviceRes.body.secret;
  });

  afterAll(async () => {
    await prisma.gpsPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.telematicsDevice.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it("should auto-open trip when vehicle starts moving from stopped state", async () => {
    // 1. Post stopped position
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 40.0,
        longitude: -74.0,
        speedKph: 0,
        recordedAt: new Date(Date.now() - 180000).toISOString(),
        ignitionOn: false,
      })
      .expect(200);

    // Wait for stop classification
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Post moving position
    const res = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 40.1,
        longitude: -74.1,
        speedKph: 60,
        recordedAt: new Date().toISOString(),
        ignitionOn: true,
      })
      .expect(200);

    expect(res.body.tripId).toBeDefined();

    // 3. Verify trip exists
    const trip = await prisma.trip.findUnique({ where: { id: res.body.tripId } });
    expect(trip).toBeDefined();
    expect(trip!.status).toBe("ACTIVE");
    expect(trip!.vehicleId).toBe(vehicleId);
  });

  it("should rollup trip aggregates with each position", async () => {
    const live = await request(app.getHttpServer())
      .get(`/telematics/live/${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const tripId = live.body.activeTrip?.id;
    expect(tripId).toBeDefined();

    // Post multiple positions
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        positions: [
          {
            latitude: 40.2,
            longitude: -74.2,
            speedKph: 80,
            recordedAt: new Date(Date.now() - 20000).toISOString(),
            ignitionOn: true,
          },
          {
            latitude: 40.3,
            longitude: -74.3,
            speedKph: 100,
            recordedAt: new Date(Date.now() - 10000).toISOString(),
            ignitionOn: true,
          },
          {
            latitude: 40.4,
            longitude: -74.4,
            speedKph: 90,
            recordedAt: new Date().toISOString(),
            ignitionOn: true,
          },
        ],
      })
      .expect(200);

    // Check trip aggregates
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    expect(trip).toBeDefined();
    expect(Number(trip!.distanceKm)).toBeGreaterThan(0);
    expect(trip!.durationSec).toBeGreaterThan(0);
    expect(trip!.maxSpeedKph).toBeGreaterThanOrEqual(100);
    expect(trip!.pointCount).toBeGreaterThan(0);
  });

  it("should NOT auto-close active trip immediately", async () => {
    const live = await request(app.getHttpServer())
      .get(`/telematics/live/${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const tripId = live.body.activeTrip?.id;
    expect(tripId).toBeDefined();

    // Trip should still be active
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    expect(trip!.status).toBe("ACTIVE");
  });

  it("should report trip correctly in API responses", async () => {
    const live = await request(app.getHttpServer())
      .get(`/telematics/live/${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const tripId = live.body.activeTrip?.id;

    // Get trip detail
    const tripRes = await request(app.getHttpServer())
      .get(`/telematics/trips/${tripId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(tripRes.body.id).toBe(tripId);
    expect(tripRes.body.vehicleId).toBe(vehicleId);
    expect(tripRes.body.status).toBe("ACTIVE");
    expect(Number(tripRes.body.distanceKm)).toBeGreaterThan(0);

    // List trips
    const listRes = await request(app.getHttpServer())
      .get("/telematics/trips")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const found = listRes.body.trips.find((t: any) => t.id === tripId);
    expect(found).toBeDefined();
  });
});
