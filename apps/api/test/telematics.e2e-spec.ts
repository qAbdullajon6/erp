import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { IncomingMessage } from "node:http";
import request from "supertest";
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
  eventType: string;
}

interface AlertBody {
  id: string;
  type: string;
  vehicleId: string;
  status: string;
}

interface TelematicsResponseBody {
  accessToken: string;
  id: string;
  secret: string;
  provider: string;
  externalId: string;
  vehicleId: string;
  name: string;
  type: string;
  status: string;
  accepted: number;
  rejected: number;
  latest: { latitude: number; longitude: number };
  devices: DeviceBody[];
  vehicles: LiveVehicleBody[];
  vehicle: { id: string };
  state: { latitude: number; longitude: number; speedKph: number };
  trail: unknown[];
  remainingKm: number;
  etaMinutes: number;
  estimate: boolean;
  tripId: string;
  activeTrip?: { id: string };
  trips: TripBody[];
  distanceKm: number;
  durationSec: number;
  maxSpeedKph: number;
  points: Array<{ lat: number; lng: number }>;
  vertices: unknown[];
  events: GeofenceEventBody[];
  speedLimitKph: number;
  alerts: AlertBody[];
  totalVehicles: number;
  activeTrips: unknown;
  openAlerts: unknown;
}

interface RealtimeEventBody {
  type: string;
  vehicleId: string;
}

describe("Fleet Telematics E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let vehicleId: string;
  let driverId: string;
  let deviceId: string;
  let deviceSecret: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

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
    vehicleId = vehicleRes.body.id;

    // Create test driver
    const driverRes = await request(app.getHttpServer())
      .post("/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: driverUser.id,
        licenseNumber: "DL-GPS-001",
        licenseExpiry: "2027-12-31",
      })
      .then(typedResponse<TelematicsResponseBody>);
    driverId = driverRes.body.id;
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

      deviceId = res.body.id;
      deviceSecret = res.body.secret;

      expect(res.body.provider).toBe("TRACCAR");
      expect(res.body.externalId).toBe("TEST-IMEI-123456789");
      expect(res.body.vehicleId).toBe(vehicleId);
      expect(deviceSecret).toMatch(/^flowtel_live_/);
    });

    it("should list devices", async () => {
      const res = await request(app.getHttpServer())
        .get("/telematics/devices")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.devices.length).toBeGreaterThan(0);
      expect(res.body.devices[0].externalId).toBe("TEST-IMEI-123456789");
    });

    it("should get device by id", async () => {
      const res = await request(app.getHttpServer())
        .get(`/telematics/devices/${deviceId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.id).toBe(deviceId);
      expect(res.body.secret).toBeUndefined(); // Secret never returned after creation
    });
  });

  describe("Position Ingestion (Traccar Webhook)", () => {
    it("should reject ingest with invalid secret", async () => {
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=invalid_secret`)
        .send({
          latitude: 40.7128,
          longitude: -74.006,
          speedKph: 0,
          recordedAt: new Date().toISOString(),
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
          speedKph: 0,
          heading: 90,
          recordedAt: new Date().toISOString(),
          ignitionOn: true,
        })
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.accepted).toBe(1);
      expect(res.body.rejected).toBe(0);
      expect(res.body.latest).toBeDefined();
      expect(res.body.latest.latitude).toBe(40.7128);
      expect(res.body.latest.longitude).toBe(-74.006);
    });

    it("should ingest batch of positions", async () => {
      const positions = [
        {
          latitude: 40.7128,
          longitude: -74.006,
          speedKph: 30,
          heading: 45,
          recordedAt: new Date(Date.now() - 30000).toISOString(),
          ignitionOn: true,
        },
        {
          latitude: 40.7589,
          longitude: -73.9851,
          speedKph: 50,
          heading: 45,
          recordedAt: new Date(Date.now() - 20000).toISOString(),
          ignitionOn: true,
        },
        {
          latitude: 40.8501,
          longitude: -73.8662,
          speedKph: 60,
          heading: 45,
          recordedAt: new Date(Date.now() - 10000).toISOString(),
          ignitionOn: true,
        },
      ];

      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({ positions })
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.accepted).toBe(3);
      expect(res.body.rejected).toBe(0);
    });

    it("should reject positions with invalid coordinates", async () => {
      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          positions: [
            { latitude: 999, longitude: -74.006, speedKph: 0, recordedAt: new Date().toISOString() },
            { latitude: 40.7128, longitude: 999, speedKph: 0, recordedAt: new Date().toISOString() },
          ],
        })
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.accepted).toBe(0);
      expect(res.body.rejected).toBe(2);
    });
  });

  describe("Live Map API", () => {
    it("should get live fleet positions", async () => {
      const res = await request(app.getHttpServer())
        .get("/telematics/live")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.vehicles).toBeDefined();
      expect(res.body.vehicles.length).toBeGreaterThan(0);

      const vehicle = res.body.vehicles.find((item) => item.vehicleId === vehicleId);
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

      expect(res.body.vehicle.id).toBe(vehicleId);
      expect(res.body.state).toBeDefined();
      expect(res.body.state.latitude).toBe(40.8501);
      expect(res.body.state.speedKph).toBe(60);
      expect(res.body.trail).toBeDefined();
      expect(res.body.trail.length).toBeGreaterThan(0);
    });

    it("should calculate ETA to destination", async () => {
      const res = await request(app.getHttpServer())
        .get(`/telematics/vehicles/${vehicleId}/eta?lat=42.3601&lng=-71.0589`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.vehicleId).toBe(vehicleId);
      expect(res.body.remainingKm).toBeGreaterThan(0);
      expect(res.body.etaMinutes).toBeGreaterThan(0);
      expect(res.body.estimate).toBe(true);
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
          speedKph: 0,
          recordedAt: new Date(Date.now() - 120000).toISOString(),
          ignitionOn: false,
        })
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      // Wait for stop classification
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now post a moving position
      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 41.1,
          longitude: -74.1,
          speedKph: 60,
          recordedAt: new Date().toISOString(),
          ignitionOn: true,
        })
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.tripId).toBeDefined();

      // Verify trip exists
      const tripsRes = await request(app.getHttpServer())
        .get("/telematics/trips")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const trip = tripsRes.body.trips.find((item) => item.id === res.body.tripId);
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

      const tripId = liveRes.body.activeTrip?.id;
      expect(tripId).toBeDefined();

      // Post more positions to accumulate aggregates
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          positions: [
            {
              latitude: 41.2,
              longitude: -74.2,
              speedKph: 80,
              recordedAt: new Date(Date.now() - 10000).toISOString(),
              ignitionOn: true,
            },
            {
              latitude: 41.3,
              longitude: -74.3,
              speedKph: 90,
              recordedAt: new Date().toISOString(),
              ignitionOn: true,
            },
          ],
        })
        .expect(200);

      // Get trip details
      const tripRes = await request(app.getHttpServer())
        .get(`/telematics/trips/${tripId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(tripRes.body.distanceKm).toBeGreaterThan(0);
      expect(tripRes.body.durationSec).toBeGreaterThan(0);
      expect(tripRes.body.maxSpeedKph).toBeGreaterThanOrEqual(90);
    });

    it("should replay trip route", async () => {
      const liveRes = await request(app.getHttpServer())
        .get(`/telematics/live/${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const tripId = liveRes.body.activeTrip?.id;

      const res = await request(app.getHttpServer())
        .get(`/telematics/trips/${tripId}/replay?limit=100`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.tripId).toBe(tripId);
      expect(res.body.points).toBeDefined();
      expect(res.body.points.length).toBeGreaterThan(0);
      expect(res.body.points[0].lat).toBeDefined();
      expect(res.body.points[0].lng).toBeDefined();
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
          latitude: 41.5,
          longitude: -74.5,
          radiusM: 500,
          alertOnEnter: true,
          alertOnExit: true,
          dwellThresholdSec: 300,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      geofenceId = res.body.id;
      expect(res.body.name).toBe("Test Depot");
      expect(res.body.type).toBe("CIRCLE");
    });

    it("should trigger geofence enter event", async () => {
      // Post position inside geofence
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 41.5,
          longitude: -74.5,
          speedKph: 30,
          recordedAt: new Date().toISOString(),
          ignitionOn: true,
        })
        .expect(200);

      // Check geofence events
      const res = await request(app.getHttpServer())
        .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const enterEvent = res.body.events.find(
        (event) => event.geofenceId === geofenceId && event.eventType === "ENTER",
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
          speedKph: 40,
          recordedAt: new Date().toISOString(),
          ignitionOn: true,
        })
        .expect(200);

      // Check for exit event
      const res = await request(app.getHttpServer())
        .get(`/telematics/geofences/events?vehicleId=${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const exitEvent = res.body.events.find(
        (event) => event.geofenceId === geofenceId && event.eventType === "EXIT",
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
          vertices: [
            { lat: 43.0, lng: -75.0 },
            { lat: 43.0, lng: -74.5 },
            { lat: 43.5, lng: -74.5 },
            { lat: 43.5, lng: -75.0 },
          ],
          alertOnEnter: true,
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.type).toBe("POLYGON");
      expect(res.body.vertices).toHaveLength(4);
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

      const speedLimit = settingsRes.body.speedLimitKph;

      // Post position exceeding speed limit
      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
        .send({
          latitude: 44.0,
          longitude: -75.0,
          speedKph: speedLimit + 30,
          recordedAt: new Date().toISOString(),
          ignitionOn: true,
        })
        .expect(200);

      // Check for speeding alert
      const res = await request(app.getHttpServer())
        .get("/telematics/alerts?vehicleId=" + vehicleId)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const speedingAlert = res.body.alerts.find(
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

      const alert = alertsRes.body.alerts[0];

      await request(app.getHttpServer())
        .post(`/telematics/alerts/${alert.id}/acknowledge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/telematics/alerts/${alert.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.status).toBe("ACKNOWLEDGED");
    });

    it("should resolve alert", async () => {
      const alertsRes = await request(app.getHttpServer())
        .get("/telematics/alerts")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      const alert = alertsRes.body.alerts[0];

      await request(app.getHttpServer())
        .post(`/telematics/alerts/${alert.id}/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/telematics/alerts/${alert.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.status).toBe("RESOLVED");
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

      expect(res.body.vehicleId).toBe(vehicleId);
      expect(res.body.points).toBeDefined();
      expect(res.body.points.length).toBeGreaterThan(0);
    });
  });

  describe("Driver Position Reporting", () => {
    it("should allow driver to post own location", async () => {
      // Create a dispatch for the driver
      const orderRes = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          customerName: "GPS Test Customer",
          deliveryAddress: "123 Test St",
          deliveryCity: "New York",
          deliveryPostalCode: "10001",
          orderDate: new Date().toISOString(),
        })
        .expect(201)
        .then(typedResponse<TelematicsResponseBody>);

      await request(app.getHttpServer())
        .post(`/orders/${orderRes.body.id}/assign`)
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
              recordedAt: new Date().toISOString(),
              ignitionOn: true,
            },
          ],
        })
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.accepted).toBe(1);

      // Verify position appears in live map
      const liveRes = await request(app.getHttpServer())
        .get(`/telematics/live/${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(liveRes.body.state.latitude).toBe(45.0);
      expect(liveRes.body.state.longitude).toBe(-76.0);
    });

    it("should reject driver location when no active dispatch", async () => {
      // Complete the dispatch
      const dispatches = await prisma.dispatch.findMany({
        where: { driverId, status: { in: ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] } },
      });

      for (const dispatch of dispatches) {
        await request(app.getHttpServer())
          .post(`/dispatches/${dispatch.id}/status`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ status: "DELIVERED" })
          .expect(200);
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
              recordedAt: new Date().toISOString(),
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

      expect(res.body.totalVehicles).toBeGreaterThan(0);
      expect(res.body.activeTrips).toBeDefined();
      expect(res.body.openAlerts).toBeDefined();
    });

    it("should get fleet utilization analytics", async () => {
      const from = new Date(Date.now() - 86400000).toISOString();
      const to = new Date().toISOString();

      const res = await request(app.getHttpServer())
        .get(`/telematics/analytics/fleet-utilization?from=${from}&to=${to}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .then(typedResponse<TelematicsResponseBody>);

      expect(res.body.vehicles).toBeDefined();
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
    it("should connect to SSE stream and receive events", (done) => {
      const req = request(app.getHttpServer())
        .get("/telematics/live-stream")
        .set("Authorization", `Bearer ${adminToken}`)
        .timeout(15000);

      let receivedEvent = false;

      req.on("response", (res: IncomingMessage) => {
        expect(res.headers["content-type"]).toContain("text/event-stream");

        res.on("data", (chunk: Buffer) => {
          const data = chunk.toString();
          if (data.startsWith("data:") && !receivedEvent) {
            receivedEvent = true;
            const json = JSON.parse(
              data.replace("data: ", "").trim(),
            ) as unknown as RealtimeEventBody;
            expect(json.type).toBeDefined();
            expect(["position", "state", "alert", "geofence", "trip"]).toContain(json.type);
            res.destroy(); // Close connection
            done();
          }
        });

        // Post a position to trigger SSE event
        setTimeout(() => {
          void request(app.getHttpServer())
            .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
            .send({
              latitude: 46.0,
              longitude: -77.0,
              speedKph: 55,
              recordedAt: new Date().toISOString(),
              ignitionOn: true,
            })
            .then(
              () => undefined,
              (error: unknown) => {
                done(error instanceof Error ? error : new Error(String(error)));
              },
            );
        }, 1000);
      });

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "ECONNRESET") done(err);
      });
    });

    it("should filter SSE stream by vehicleIds", (done) => {
      const req = request(app.getHttpServer())
        .get(`/telematics/live-stream?vehicleIds=${vehicleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .timeout(15000);

      let receivedEvent = false;

      req.on("response", (res: IncomingMessage) => {
        res.on("data", (chunk: Buffer) => {
          const data = chunk.toString();
          if (data.startsWith("data:") && !receivedEvent) {
            receivedEvent = true;
            const json = JSON.parse(
              data.replace("data: ", "").trim(),
            ) as unknown as RealtimeEventBody;
            expect(json.vehicleId).toBe(vehicleId);
            res.destroy();
            done();
          }
        });

        setTimeout(() => {
          void request(app.getHttpServer())
            .post(`/telematics/ingest/${deviceId}?secret=${deviceSecret}`)
            .send({
              latitude: 46.1,
              longitude: -77.1,
              speedKph: 60,
              recordedAt: new Date().toISOString(),
              ignitionOn: true,
            })
            .then(
              () => undefined,
              (error: unknown) => {
                done(error instanceof Error ? error : new Error(String(error)));
              },
            );
        }, 1000);
      });

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "ECONNRESET") done(err);
      });
    });
  });
});
