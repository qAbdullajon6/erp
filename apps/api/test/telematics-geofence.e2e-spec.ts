import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Telematics Geofence E2E", () => {
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
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.geofenceEvent.deleteMany({});
    await prisma.geofence.deleteMany({});
    await prisma.gpsPosition.deleteMany({});
    await prisma.telematicsDevice.deleteMany({});

    // Setup
    const authRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@test.com", password: "password" });
    adminToken = authRes.body.accessToken;

    const vehicleRes = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vehicleCode: "GEO-TEST-001", plateNumber: "GEO-01", type: "VAN", capacity: 1000 });
    vehicleId = vehicleRes.body.id;

    const deviceRes = await request(app.getHttpServer())
      .post("/telematics/devices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        provider: "MANUAL",
        externalId: "GEO-TEST-DEVICE",
        name: "Geofence Test Device",
        vehicleId,
      });
    deviceId = deviceRes.body.id;
    deviceSecret = deviceRes.body.secret;
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
        latitude: 50.0,
        longitude: -75.0,
        radiusM: 500,
        alertOnEnter: true,
        alertOnExit: true,
      })
      .expect(201);

    circleGeofenceId = res.body.id;
    expect(res.body.type).toBe("CIRCLE");
    expect(res.body.radiusM).toBe(500);
  });

  it("should create polygon geofence", async () => {
    const res = await request(app.getHttpServer())
      .post("/telematics/geofences")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Zone Polygon",
        type: "POLYGON",
        vertices: [
          { lat: 51.0, lng: -76.0 },
          { lat: 51.0, lng: -75.5 },
          { lat: 51.5, lng: -75.5 },
          { lat: 51.5, lng: -76.0 },
        ],
        alertOnEnter: true,
      })
      .expect(201);

    polygonGeofenceId = res.body.id;
    expect(res.body.type).toBe("POLYGON");
    expect(res.body.vertices).toHaveLength(4);
  });

  it("should trigger ENTER event for circle geofence", async () => {
    // Post position inside circle
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
      .send({
        latitude: 50.0,
        longitude: -75.0,
        speedKph: 30,
        recordedAt: new Date().toISOString(),
        ignitionOn: true,
      })
      .expect(200);

    // Check events
    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const enterEvent = res.body.events.find(
      (e: any) => e.geofenceId === circleGeofenceId && e.eventType === "ENTER"
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
        speedKph: 40,
        recordedAt: new Date().toISOString(),
        ignitionOn: true,
      })
      .expect(200);

    // Check for exit
    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const exitEvent = res.body.events.find(
      (e: any) => e.geofenceId === circleGeofenceId && e.eventType === "EXIT"
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
        speedKph: 35,
        recordedAt: new Date().toISOString(),
        ignitionOn: true,
      })
      .expect(200);

    // Check events
    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const enterEvent = res.body.events.find(
      (e: any) => e.geofenceId === polygonGeofenceId && e.eventType === "ENTER"
    );
    expect(enterEvent).toBeDefined();
  });

  it("should list geofences", async () => {
    const res = await request(app.getHttpServer())
      .get("/telematics/geofences")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.geofences.length).toBeGreaterThanOrEqual(2);
  });

  it("should archive geofence", async () => {
    await request(app.getHttpServer())
      .post(`/telematics/geofences/${circleGeofenceId}/archive`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/telematics/geofences/${circleGeofenceId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.archivedAt).toBeDefined();
  });
});
