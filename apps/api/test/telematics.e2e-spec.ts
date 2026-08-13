import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import request from "supertest";
import { configureApp } from "../src/app.config";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { typedResponse } from "./support/typed-response";
import {
  loginAs,
  SEEDED_ACCOUNTANT_EMAIL,
  SEEDED_ADMIN_EMAIL,
  SEEDED_DRIVER_EMAIL,
  SEEDED_ORG_SLUG,
} from "./support/seeded-org";

interface DeviceBody {
  id: string;
  externalId: string;
}

interface LiveVehicleBody {
  vehicleId: string;
  latitude: number;
  longitude: number;
  movementState: string;
}

interface TripBody {
  id: string;
  status: string;
  vehicleId: string;
}

interface GeofenceEventBody {
  geofenceId: string;
  type: string;
}

interface AlertBody {
  id: string;
  type: string;
  vehicleId: string;
  status: string;
}

interface TelematicsResponseBody {
  error?: { statusCode: number; message?: string };
  data: {
    id: string;
    ingestSecret: string;
    provider: string;
    externalId: string;
    vehicleId: string;
    name: string;
    type: string;
    status: string;
    accepted: number;
    rejected: number;
    latest: { latitude: number; longitude: number };
    items: DeviceBody[] | TripBody[] | GeofenceEventBody[] | AlertBody[];
    vehicles: LiveVehicleBody[];
    vehicle: { id: string };
    state: { latitude: number; longitude: number; speedKph: number };
    trail: unknown[];
    remainingKm: number;
    etaMinutes: number;
    estimate: boolean;
    tripId: string;
    activeTrip?: { id: string };
    distanceKm: number;
    durationSec: number;
    maxSpeedKph: number;
    points: Array<{ lat: number; lng: number }>;
    polygon: unknown[];
    speedLimitKph: number;
    fleet: { totalVehicles: number };
    totalTrips: number;
    openAlerts: unknown;
  };
}

interface RealtimeEventBody {
  type: string;
  vehicleId: string;
}

describe("Fleet Telematics E2E", () => {
  let telemetryClock = Date.now() - 30 * 60_000;
  const nextRecordedAt = (advanceMs = 60_000) =>
    new Date((telemetryClock += advanceMs)).toISOString();

  let app: INestApplication;
  let appUrl: string;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let organizationId: string;
  let customerId: string;
  let vehicleId: string;
  let driverId: string;
  let deviceId: string;
  let deviceSecret: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    appUrl = await app.getUrl();

    prisma = app.get(PrismaService);

    // Clean up telematics data
    await prisma.gpsPosition.deleteMany({});
    await prisma.vehicleTelematicsState.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.geofenceEvent.deleteMany({});
    await prisma.telematicsAlert.deleteMany({});
    await prisma.telematicsDevice.deleteMany({});

    const org = await prisma.organization.findFirst({ where: { slug: SEEDED_ORG_SLUG } });
    if (!org) throw new Error(`Seeded organisation "${SEEDED_ORG_SLUG}" not found — is the database seeded?`);
    organizationId = org.id;
    const customer = await prisma.customer.findFirst({
      where: { organizationId },
      select: { id: true },
    });
    if (!customer) throw new Error(`Seeded customer for "${SEEDED_ORG_SLUG}" not found`);
    customerId = customer.id;

    const driverUser = await prisma.user.findFirst({ where: { email: SEEDED_DRIVER_EMAIL } });
    if (!driverUser) throw new Error(`Seeded driver "${SEEDED_DRIVER_EMAIL}" not found — is the database seeded?`);

    adminToken = await loginAs(app, SEEDED_ADMIN_EMAIL);
    driverToken = await loginAs(app, SEEDED_DRIVER_EMAIL);

    // Create test vehicle
    const vehicleRes = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        vehicleCode: "FLEET-TEST-001",
        plateNumber: "TEST-GPS-01",
        type: "VAN",
        capacity: 1000,
      })
      .then(typedResponse<TelematicsResponseBody>);
    vehicleId = vehicleRes.body.data.id;

    const driver = await prisma.driver.findFirst({
      where: { organizationId: org.id, userId: driverUser.id },
      select: { id: true },
    });
    if (!driver) throw new Error(`Seeded driver profile for "${SEEDED_DRIVER_EMAIL}" not found`);
    driverId = driver.id;
  });

  afterAll(async () => {
    await prisma.gpsPosition.deleteMany({});
    await prisma.vehicleTelematicsState.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.geofenceEvent.deleteMany({});
    await prisma.telematicsAlert.deleteMany({});
    await prisma.telematicsDevice.deleteMany({});
    await app.close();
  });

  describe("Device Management", () => {
    it("should create a GPS device with Traccar provider", async () => {
      const res = await request(app.getHttpServer())
        .post("/telematics/devices")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          provider: "TRACCAR",
          externalId: "TEST-IMEI-123456789",
          name: "Test GPS Tracker",
          vehicleId,
          config: { traccarDeviceId: 1 },
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      deviceId = res.body.data.id;
      deviceSecret = res.body.data.ingestSecret;

      expect(res.body.data.provider).toBe("TRACCAR");
      expect(res.body.data.externalId).toBe("TEST-IMEI-123456789");
      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(deviceSecret).toMatch(/^flowtel_live_/);
    });

    it("should list devices", async () => {
      const res = await request(app.getHttpServer())
        .get("/telematics/devices")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const devices = res.body.data.items as DeviceBody[];
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].externalId).toBe("TEST-IMEI-123456789");
    });

    it("should get device by id", async () => {
      const res = await request(app.getHttpServer())
        .get(`/telematics/devices/${deviceId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.id).toBe(deviceId);
      expect(res.body.data.ingestSecret).toBeUndefined(); // Secret never returned after creation
    });
  });

  describe("Position Ingestion (Traccar Webhook)", () => {
    it("should reject ingest with invalid secret", async () => {
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=invalid_secret`)
        .send({
          latitude: 40.7128,
          longitude: -74.006,
          speed: 0,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        })
        .expect(401);
    });

    it("should ingest position via device webhook", async () => {
      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 40.7128,
          longitude: -74.006,
          speed: 0,
          heading: 90,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.accepted).toBe(1);
      expect(res.body.data.rejected).toBe(0);
      expect(res.body.data.latest).toBeDefined();
      expect(res.body.data.latest.latitude).toBe(40.7128);
      expect(res.body.data.latest.longitude).toBe(-74.006);
    });

    it("should ingest batch of positions", async () => {
      const positions = [
        {
          latitude: 40.7128,
          longitude: -74.006,
          speed: 30 / 1.852,
          heading: 45,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        },
        {
          latitude: 40.7589,
          longitude: -73.9851,
          speed: 50 / 1.852,
          heading: 45,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        },
        {
          latitude: 40.8501,
          longitude: -73.8662,
          speed: 60 / 1.852,
          heading: 45,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        },
      ];

      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send(positions)
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.accepted).toBe(3);
      expect(res.body.data.rejected).toBe(0);
    });

    it("should reject positions with invalid coordinates", async () => {
      const before = await prisma.gpsPosition.count({ where: { vehicleId } });
      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          positions: [
            { latitude: 999, longitude: -74.006, speed: 0, timestamp: nextRecordedAt() },
            { latitude: 40.7128, longitude: 999, speed: 0, timestamp: nextRecordedAt() },
          ],
        })
        .expect(400)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.error?.statusCode).toBe(400);
      await expect(prisma.gpsPosition.count({ where: { vehicleId } })).resolves.toBe(before);
    });
  });

  describe("Live Map API", () => {
    it("should get live fleet positions", async () => {
      const res = await request(app.getHttpServer())
        .get("/telematics/live")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.vehicles).toBeDefined();
      expect(res.body.data.vehicles.length).toBeGreaterThan(0);

      const vehicle = res.body.data.vehicles.find((item) => item.vehicleId === vehicleId);
      expect(vehicle).toBeDefined();
      expect(vehicle!.latitude).toBe(40.8501);
      expect(vehicle!.longitude).toBe(-73.8662);
      expect(vehicle!.movementState).toBe("MOVING");
    });

    it("should get single vehicle live state", async () => {
      const res = await request(app.getHttpServer())
        .get(`/telematics/live/${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.vehicle.id).toBe(vehicleId);
      expect(res.body.data.state).toBeDefined();
      expect(res.body.data.state.latitude).toBe(40.8501);
      expect(res.body.data.state.speedKph).toBe(60);
      expect(res.body.data.trail).toBeDefined();
      expect(res.body.data.trail.length).toBeGreaterThan(0);
    });

    it("should calculate ETA to destination", async () => {
      const res = await request(app.getHttpServer())
        .get(`/telematics/vehicles/${vehicleId}/eta?lat=42.3601&lng=-71.0589`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.remainingKm).toBeGreaterThan(0);
      expect(res.body.data.etaMinutes).toBeGreaterThan(0);
      expect(res.body.data.estimate).toBe(true);
    });
  });

  describe("Trip Detection", () => {
    it("should auto-open trip when vehicle starts moving", async () => {
      // Post a stationary position first
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 41.0,
          longitude: -74.0,
          speed: 0,
          timestamp: nextRecordedAt(120_000),
          ignitionOn: false,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      // Wait for stop classification
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now post a moving position
      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 41.1,
          longitude: -74.1,
          speed: 60 / 1.852,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.tripId).toBeDefined();

      // Verify trip exists
      const tripsRes = await request(app.getHttpServer())
        .get("/telematics/trips")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const trip = (tripsRes.body.data.items as TripBody[]).find(
        (item) => item.id === res.body.data.tripId,
      );
      expect(trip).toBeDefined();
      expect(trip!.status).toBe("ACTIVE");
      expect(trip!.vehicleId).toBe(vehicleId);
    });

    it("should rollup trip aggregates", async () => {
      // Get active trip
      const liveRes = await request(app.getHttpServer())
        .get(`/telematics/live/${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const tripId = liveRes.body.data.activeTrip?.id;
      expect(tripId).toBeDefined();

      // Post more positions to accumulate aggregates
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send([
            {
              latitude: 41.2,
              longitude: -74.2,
              speed: 80 / 1.852,
              timestamp: nextRecordedAt(),
              ignitionOn: true,
            },
            {
              latitude: 41.3,
              longitude: -74.3,
              speed: 90 / 1.852,
              timestamp: nextRecordedAt(),
              ignitionOn: true,
            },
          ])
        .expect(201);

      // Get trip details
      const tripRes = await request(app.getHttpServer())
        .get(`/telematics/trips/${tripId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(Number(tripRes.body.data.distanceKm)).toBeGreaterThan(0);
      expect(tripRes.body.data.durationSec).toBeGreaterThan(0);
      expect(tripRes.body.data.maxSpeedKph).toBeGreaterThanOrEqual(90);
    });

    it("should replay trip route", async () => {
      const liveRes = await request(app.getHttpServer())
        .get(`/telematics/live/${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const tripId = liveRes.body.data.activeTrip?.id;

      const res = await request(app.getHttpServer())
        .get(`/telematics/trips/${tripId}/replay?limit=100`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.points).toBeDefined();
      expect(res.body.data.points.length).toBeGreaterThan(0);
      expect(res.body.data.points[0].lat).toBeDefined();
      expect(res.body.data.points[0].lng).toBeDefined();
    });
  });

  describe("Geofencing", () => {
    let geofenceId: string;

    it("should create a circular geofence", async () => {
      const res = await request(app.getHttpServer())
        .post("/telematics/geofences")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test Depot",
          type: "CIRCLE",
          centerLat: 41.5,
          centerLng: -74.5,
          radiusM: 500,
          alertOnEnter: true,
          alertOnExit: true,
          dwellThresholdSec: 300,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      geofenceId = res.body.data.id;
      expect(res.body.data.name).toBe("Test Depot");
      expect(res.body.data.type).toBe("CIRCLE");
    });

    it("should trigger geofence enter event", async () => {
      // Post position inside geofence
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 41.5,
          longitude: -74.5,
          speed: 30 / 1.852,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        })
        .expect(201);

      // Check geofence events
      const res = await request(app.getHttpServer())
        .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const enterEvent = (res.body.data.items as GeofenceEventBody[]).find(
        (event) => event.geofenceId === geofenceId && event.type === "ENTER",
      );
      expect(enterEvent).toBeDefined();
    });

    it("should trigger geofence exit event", async () => {
      // Post position outside geofence
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 42.0,
          longitude: -75.0,
          speed: 40 / 1.852,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        })
        .expect(201);

      // Check for exit event
      const res = await request(app.getHttpServer())
        .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const exitEvent = (res.body.data.items as GeofenceEventBody[]).find(
        (event) => event.geofenceId === geofenceId && event.type === "EXIT",
      );
      expect(exitEvent).toBeDefined();
    });

    it("should create a polygon geofence", async () => {
      const res = await request(app.getHttpServer())
        .post("/telematics/geofences")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test Zone",
          type: "POLYGON",
          polygon: [
            { lat: 43.0, lng: -75.0 },
            { lat: 43.0, lng: -74.5 },
            { lat: 43.5, lng: -74.5 },
            { lat: 43.5, lng: -75.0 },
          ],
          alertOnEnter: true,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.type).toBe("POLYGON");
      expect(res.body.data.polygon).toHaveLength(4);
    });
  });

  describe("Alerts", () => {
    it("should trigger speeding alert", async () => {
      // Get current settings to know speed limit
      const settingsRes = await request(app.getHttpServer())
        .get("/telematics/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const speedLimit = settingsRes.body.data.speedLimitKph;

      // Post position exceeding speed limit
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 44.0,
          longitude: -75.0,
          speed: (speedLimit + 30) / 1.852,
          timestamp: nextRecordedAt(),
          ignitionOn: true,
        })
        .expect(201);

      // Check for speeding alert
      const res = await request(app.getHttpServer())
        .get("/telematics/alerts?vehicleId=" + vehicleId)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const speedingAlert = (res.body.data.items as AlertBody[]).find(
        (alert) => alert.type === "SPEEDING" && alert.vehicleId === vehicleId,
      );
      expect(speedingAlert).toBeDefined();
      expect(speedingAlert!.status).toBe("OPEN");
    });

    it("should acknowledge alert", async () => {
      const alertsRes = await request(app.getHttpServer())
        .get("/telematics/alerts")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const alert = (alertsRes.body.data.items as AlertBody[])[0];

      await request(app.getHttpServer())
        .post(`/telematics/alerts/${alert.id}/acknowledge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/telematics/alerts/${alert.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.status).toBe("ACKNOWLEDGED");
    });

    it("should resolve alert", async () => {
      const alertsRes = await request(app.getHttpServer())
        .get("/telematics/alerts")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const alert = (alertsRes.body.data.items as AlertBody[])[0];

      await request(app.getHttpServer())
        .post(`/telematics/alerts/${alert.id}/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/telematics/alerts/${alert.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.status).toBe("RESOLVED");
    });
  });

  describe("Historical Playback", () => {
    it("should get historical positions for time range", async () => {
      const from = new Date(Date.now() - 3600000).toISOString();
      const to = new Date().toISOString();

      const res = await request(app.getHttpServer())
        .get(`/telematics/vehicles/${vehicleId}/playback?from=${from}&to=${to}&limit=100`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.vehicleId).toBe(vehicleId);
      expect(res.body.data.points).toBeDefined();
      expect(res.body.data.points.length).toBeGreaterThan(0);
    });
  });

  describe("Driver Position Reporting", () => {
    it("should allow driver to post own location", async () => {
      const order = await prisma.order.create({
        data: {
          organizationId,
          orderNumber: `ORD-GPS-${randomUUID().slice(0, 8)}`,
          customerId,
          pickupAddress: "1 Depot Rd",
          pickupCity: "Tashkent",
          pickupDate: new Date("2040-01-10T08:00:00.000Z"),
          deliveryAddress: "123 Test St",
          deliveryCity: "New York",
          deliveryDate: new Date("2040-01-11T18:00:00.000Z"),
          cargoDescription: "GPS test freight",
          price: "100.00",
          status: "PENDING",
        },
      });

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          driverId,
          vehicleId,
          scheduledDate: new Date().toISOString(),
        })
        .expect(200);

      // Driver posts location
      const res = await request(app.getHttpServer())
        .post("/telematics/my-location")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({
          positions: [
            {
              latitude: 45.0,
              longitude: -76.0,
              speedKph: 50,
              recordedAt: nextRecordedAt(),
              ignitionOn: true,
            },
          ],
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.accepted).toBe(1);

      // Verify position appears in live map
      const liveRes = await request(app.getHttpServer())
        .get(`/telematics/live/${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(liveRes.body.data.state.latitude).toBe(45.0);
      expect(liveRes.body.data.state.longitude).toBe(-76.0);
    });

    it("should reject driver location when no active dispatch", async () => {
      // Complete the dispatch
      const dispatches = await prisma.dispatch.findMany({
        where: { driverId, status: { in: ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] } },
      });

      for (const dispatch of dispatches) {
        await request(app.getHttpServer())
          .post(`/dispatches/${dispatch.id}/cancel`)
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(201);
      }

      // Try to post location without active dispatch
      await request(app.getHttpServer())
        .post("/telematics/my-location")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({
          positions: [
            {
              latitude: 45.1,
              longitude: -76.1,
              speedKph: 50,
              recordedAt: nextRecordedAt(),
            },
          ],
        })
        .expect(404);
    });
  });

  describe("Analytics", () => {
    it("should get fleet overview analytics", async () => {
      const res = await request(app.getHttpServer())
        .get("/telematics/analytics/overview")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.fleet.totalVehicles).toBeGreaterThan(0);
      expect(res.body.data.totalTrips).toBeGreaterThanOrEqual(0);
      expect(res.body.data.openAlerts).toBeDefined();
    });

    it("should get fleet utilization analytics", async () => {
      const from = new Date(Date.now() - 86400000).toISOString();
      const to = new Date().toISOString();

      const res = await request(app.getHttpServer())
        .get(`/telematics/analytics/fleet-utilization?from=${from}&to=${to}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.data.vehicles).toBeDefined();
    });
  });

  describe("RBAC", () => {
    /// Uses the seeded accountant rather than creating one here. The local
    /// version stored the literal string "hashed" as the password hash, so its
    /// login always failed and the request that followed carried no token —
    /// the endpoint answered 401 (unauthenticated) and never exercised the
    /// role check this test exists to prove.
    it("should deny access to telematics for non-ops roles", async () => {
      const accountantToken = await loginAs(app, SEEDED_ACCOUNTANT_EMAIL);

      await request(app.getHttpServer())
        .get("/telematics/live")
        .set("Authorization", `Bearer ${accountantToken}`)
        .expect(403);
    });
  });

  describe("SSE Live Stream", () => {
    async function receiveEvent(path: string, trigger: () => Promise<void>) {
      return new Promise<RealtimeEventBody>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for SSE event")), 10_000);
        const req = httpRequest(
          new URL(path, appUrl),
          { headers: { Authorization: `Bearer ${adminToken}`, Accept: "text/event-stream" } },
          (res) => {
            if (!res.headers["content-type"]?.includes("text/event-stream")) {
              clearTimeout(timeout);
              reject(new Error(`Expected SSE content type, got ${res.headers["content-type"]}`));
              res.destroy();
              return;
            }

            let buffer = "";
            res.on("data", (chunk: Buffer) => {
              buffer += chunk.toString();
              const match = buffer.match(/data:\s*(\{.+\})\r?\n\r?\n/);
              if (!match) return;
              clearTimeout(timeout);
              res.destroy();
              resolve(JSON.parse(match[1]) as RealtimeEventBody);
            });

            void trigger().catch((error: unknown) => {
              clearTimeout(timeout);
              res.destroy();
              reject(error instanceof Error ? error : new Error(String(error)));
            });
          },
        );
        req.on("error", reject);
        req.end();
      });
    }

    it("should connect to SSE stream and receive events", async () => {
      const event = await receiveEvent("/telematics/live-stream", async () => {
        await request(app.getHttpServer())
          .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
          .send({
            latitude: 46.0,
            longitude: -77.0,
            speed: 55 / 1.852,
            timestamp: nextRecordedAt(),
            ignitionOn: true,
          })
          .expect(201);
      });

      expect(["position", "state", "alert", "geofence", "trip"]).toContain(event.type);
    });

    it("should filter SSE stream by vehicleIds", async () => {
      const event = await receiveEvent(
        `/telematics/live-stream?vehicleIds=${vehicleId}`,
        async () => {
          await request(app.getHttpServer())
            .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
            .send({
              latitude: 46.1,
              longitude: -77.1,
              speed: 60 / 1.852,
              timestamp: nextRecordedAt(),
              ignitionOn: true,
            })
            .expect(201);
        },
      );

      expect(event.vehicleId).toBe(vehicleId);
    });
  });
});
