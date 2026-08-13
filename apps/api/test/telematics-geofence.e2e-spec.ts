import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "../src/app.config";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { typedResponse } from "./support/typed-response";
import { loginAs, SEEDED_ADMIN_EMAIL } from "./support/seeded-org";

interface GeofenceEventBody {
  geofenceId: string;
  type: string;
}

interface GeofenceResponseBody {
  data: {
    id: string;
    ingestSecret: string;
    type: string;
    radiusM: number;
    polygon: unknown[];
    items: GeofenceEventBody[] | unknown[];
    archivedAt: string;
  };
}

describe("Telematics Geofence E2E", () => {
  let telemetryClock = Date.now() - 10 * 60_000;
  const nextRecordedAt = () => new Date((telemetryClock += 60_000)).toISOString();

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let deviceId: string;
  let deviceSecret: string;
  let vehicleId: string;
  let circleGeofenceId: string;
  let polygonGeofenceId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.geofenceEvent.deleteMany({});
    await prisma.geofence.deleteMany({});
    await prisma.gpsPosition.deleteMany({});
    await prisma.telematicsDevice.deleteMany({});

    // Setup
    adminToken = await loginAs(app, SEEDED_ADMIN_EMAIL);

    const vehicleRes = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vehicleCode: "GEO-TEST-001", plateNumber: "GEO-01", type: "VAN", capacity: 1000 })
      .then(typedResponse<GeofenceResponseBody>);
    vehicleId = vehicleRes.body.data.id;

    const deviceRes = await request(app.getHttpServer())
      .post("/telematics/devices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        provider: "MANUAL",
        externalId: "GEO-TEST-DEVICE",
        name: "Geofence Test Device",
        vehicleId,
      })
      .then(typedResponse<GeofenceResponseBody>);
    deviceId = deviceRes.body.data.id;
    deviceSecret = deviceRes.body.data.ingestSecret;
  });

  afterAll(async () => {
    await prisma.geofenceEvent.deleteMany({});
    await prisma.geofence.deleteMany({});
    await prisma.gpsPosition.deleteMany({});
    await prisma.telematicsDevice.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it("should create circular geofence", async () => {
    const res = await request(app.getHttpServer())
      .post("/telematics/geofences")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Depot Circle",
        type: "CIRCLE",
        centerLat: 50.0,
        centerLng: -75.0,
        radiusM: 500,
        alertOnEnter: true,
        alertOnExit: true,
      })
      .expect(201)
      .then(typedResponse<GeofenceResponseBody>);

    circleGeofenceId = res.body.data.id;
    expect(res.body.data.type).toBe("CIRCLE");
    expect(res.body.data.radiusM).toBe(500);
  });

  it("should create polygon geofence", async () => {
    const res = await request(app.getHttpServer())
      .post("/telematics/geofences")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Zone Polygon",
        type: "POLYGON",
        polygon: [
          { lat: 51.0, lng: -76.0 },
          { lat: 51.0, lng: -75.5 },
          { lat: 51.5, lng: -75.5 },
          { lat: 51.5, lng: -76.0 },
        ],
        alertOnEnter: true,
      })
      .expect(201)
      .then(typedResponse<GeofenceResponseBody>);

    polygonGeofenceId = res.body.data.id;
    expect(res.body.data.type).toBe("POLYGON");
    expect(res.body.data.polygon).toHaveLength(4);
  });

  it("should trigger ENTER event for circle geofence", async () => {
    // The first fix establishes a baseline by design; cross the boundary with
    // a second fix so this proves a real OUTSIDE -> INSIDE transition.
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 49.0,
        longitude: -76.0,
        speed: 20 / 1.852,
        timestamp: nextRecordedAt(),
        ignitionOn: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 50.0,
        longitude: -75.0,
        speed: 30 / 1.852,
        timestamp: nextRecordedAt(),
        ignitionOn: true,
      })
      .expect(201);

    // Check events
    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<GeofenceResponseBody>);

    const enterEvent = (res.body.data.items as GeofenceEventBody[]).find(
      (e) => e.geofenceId === circleGeofenceId && e.type === "ENTER",
    );
    expect(enterEvent).toBeDefined();
  });

  it("should trigger EXIT event for circle geofence", async () => {
    // Post position outside circle
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 52.0,
        longitude: -77.0,
        speed: 40 / 1.852,
        timestamp: nextRecordedAt(),
        ignitionOn: true,
      })
      .expect(201);

    // Check for exit
    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<GeofenceResponseBody>);

    const exitEvent = (res.body.data.items as GeofenceEventBody[]).find(
      (e) => e.geofenceId === circleGeofenceId && e.type === "EXIT",
    );
    expect(exitEvent).toBeDefined();
  });

  it("should trigger ENTER event for polygon geofence", async () => {
    // Post position inside polygon
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 51.25,
        longitude: -75.75,
        speed: 35 / 1.852,
        timestamp: nextRecordedAt(),
        ignitionOn: true,
      })
      .expect(201);

    // Check events
    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<GeofenceResponseBody>);

    const enterEvent = (res.body.data.items as GeofenceEventBody[]).find(
      (e) => e.geofenceId === polygonGeofenceId && e.type === "ENTER",
    );
    expect(enterEvent).toBeDefined();
  });

  it("should list geofences", async () => {
    const res = await request(app.getHttpServer())
      .get("/telematics/geofences")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<GeofenceResponseBody>);

    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it("should archive geofence", async () => {
    await request(app.getHttpServer())
      .post(`/telematics/geofences/${circleGeofenceId}/archive`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/${circleGeofenceId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .then(typedResponse<GeofenceResponseBody>);

    expect(res.body.data.archivedAt).toBeDefined();
  });
});
