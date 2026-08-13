import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "../src/app.config";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { typedResponse } from "./support/typed-response";
import { loginAs, SEEDED_ADMIN_EMAIL } from "./support/seeded-org";

interface TripListItemBody {
  id: string;
}

interface TripLifecycleResponseBody {
  data: {
    id: string;
    ingestSecret: string;
    tripId: string;
    activeTrip?: { id: string };
    vehicleId: string;
    status: string;
    distanceKm: number;
    items: TripListItemBody[];
  };
}

describe("Telematics Trip Lifecycle E2E", () => {
  let telemetryClock = Date.now() - 10 * 60_000;
  const nextRecordedAt = (advanceMs = 60_000) =>
    new Date((telemetryClock += advanceMs)).toISOString();

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
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.gpsPosition.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.telematicsDevice.deleteMany({});

    adminToken = await loginAs(app, SEEDED_ADMIN_EMAIL);

    // Create vehicle
    const vehicleRes = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vehicleCode: "TRIP-TEST-001", plateNumber: "TRIP-01", type: "VAN", capacity: 1000 })
      .then(typedResponse<TripLifecycleResponseBody>);
    vehicleId = vehicleRes.body.data.id;

    // Create device
    const deviceRes = await request(app.getHttpServer())
      .post("/telematics/devices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        provider: "MANUAL",
        externalId: "TRIP-TEST-DEVICE",
        name: "Trip Test Device",
        vehicleId,
      })
      .then(typedResponse<TripLifecycleResponseBody>);
    deviceId = deviceRes.body.data.id;
    deviceSecret = deviceRes.body.data.ingestSecret;
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
        recordedAt: nextRecordedAt(),
        ignitionOn: false,
      })
      .expect(201)
      .then(typedResponse<TripLifecycleResponseBody>);

    // Wait for stop classification
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Post moving position
    const res = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 40.1,
        longitude: -74.1,
        speedKph: 60,
        recordedAt: nextRecordedAt(180_000),
        ignitionOn: true,
      })
      .expect(201)
      .then(typedResponse<TripLifecycleResponseBody>);

    expect(res.body.data.tripId).toBeDefined();

    // 3. Verify trip exists
    const trip = await prisma.trip.findUnique({ where: { id: res.body.data.tripId } });
    expect(trip).toBeDefined();
    expect(trip!.status).toBe("ACTIVE");
    expect(trip!.vehicleId).toBe(vehicleId);
  });

  it("should rollup trip aggregates with each position", async () => {
    const live = await request(app.getHttpServer())
      .get(`/telematics/live/${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<TripLifecycleResponseBody>);

    const tripId = live.body.data.activeTrip?.id;
    expect(tripId).toBeDefined();

    // Post multiple positions
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send([
          {
            latitude: 40.2,
            longitude: -74.2,
            speedKph: 80,
            recordedAt: nextRecordedAt(),
            ignitionOn: true,
          },
          {
            latitude: 40.3,
            longitude: -74.3,
            speedKph: 100,
            recordedAt: nextRecordedAt(),
            ignitionOn: true,
          },
          {
            latitude: 40.4,
            longitude: -74.4,
            speedKph: 90,
            recordedAt: nextRecordedAt(),
            ignitionOn: true,
          },
        ])
      .expect(201);

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
      .expect(200)
      .then(typedResponse<TripLifecycleResponseBody>);

    const tripId = live.body.data.activeTrip?.id;
    expect(tripId).toBeDefined();

    // Trip should still be active
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    expect(trip!.status).toBe("ACTIVE");
  });

  it("should report trip correctly in API responses", async () => {
    const live = await request(app.getHttpServer())
      .get(`/telematics/live/${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<TripLifecycleResponseBody>);

    const tripId = live.body.data.activeTrip?.id;

    // Get trip detail
    const tripRes = await request(app.getHttpServer())
      .get(`/telematics/trips/${tripId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<TripLifecycleResponseBody>);

    expect(tripRes.body.data.id).toBe(tripId);
    expect(tripRes.body.data.vehicleId).toBe(vehicleId);
    expect(tripRes.body.data.status).toBe("ACTIVE");
    expect(Number(tripRes.body.data.distanceKm)).toBeGreaterThan(0);

    // List trips
    const listRes = await request(app.getHttpServer())
      .get("/telematics/trips")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<TripLifecycleResponseBody>);

    const found = listRes.body.data.items.find((trip) => trip.id === tripId);
    expect(found).toBeDefined();
  });
});
