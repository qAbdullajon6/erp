import { randomUUID } from "crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { DeviceService } from "../src/telematics/devices/device.service";
import { TelematicsRealtimeService } from "../src/telematics/realtime/telematics-realtime.service";
import { typedResponse } from "./support/typed-response";

interface IngestResponseBody {
  accepted: number;
  rejected: number;
  latest: { recordedAt: string };
  error?: { message: string };
  message: string;
}

/// Traccar → FlowERP bridge, exercised through the REAL ingest pipeline
/// (TelematicsIngestController → DeviceService → ProviderRegistry →
/// TrackingService → IngestionService → Postgres/Redis-SSE), never by
/// writing GpsPosition/VehicleTelematicsState directly.
///
/// Most payloads below use the flat wire shape (`id`, `lat`, `lon`,
/// `timestamp` in epoch seconds, `speed` in KNOTS) — a synthetic Navtelecom
/// S-2423 fix and a synthetic Teltonika FMB920 fix look IDENTICAL by the
/// time they reach this controller, proving the bridge is genuinely
/// vendor-agnostic. The "real Traccar webhook shape" test below additionally
/// covers what a real Traccar server actually POSTs (nested
/// `{ position, device }`, IMEI at `device.uniqueId`) — verified empirically
/// against a live traccar/traccar:6.4 container's `forward.url` output, not
/// assumed; see traccar.provider.ts.
///
/// Two organizations are created so the cross-tenant tests are real: same
/// IMEI string registered under two different orgs must never let one leak
/// into the other.
describe("Telematics: Traccar bridge (Navtelecom/Teltonika)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let devices: DeviceService;
  let realtime: TelematicsRealtimeService;

  interface OrgFixture {
    organizationId: string;
    userId: string;
    membershipId: string;
    vehicleId: string;
  }

  let orgA: OrgFixture;
  let orgB: OrgFixture;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  async function makeOrgFixture(suffix: string): Promise<OrgFixture> {
    const org = await prisma.organization.create({
      data: { name: `Traccar Bridge Test ${suffix}`, slug: `traccar-bridge-${suffix}-${randomUUID()}` },
    });
    createdOrgIds.push(org.id);

    const user = await prisma.user.create({
      data: {
        email: `traccar-${suffix}-${randomUUID()}@example.test`,
        firstName: "Ops",
        lastName: suffix,
        passwordHash: "not-a-real-hash",
      },
    });
    createdUserIds.push(user.id);

    const membership = await prisma.membership.create({
      data: { organizationId: org.id, userId: user.id, role: "ADMIN" },
    });

    await prisma.customer.create({
      data: {
        organizationId: org.id,
        customerCode: `CUS-${randomUUID().slice(0, 8)}`,
        companyName: `Bridge Customer ${suffix}`,
        contactName: "Test Contact",
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        vehicleCode: `VEH-BRIDGE-${suffix}-${randomUUID().slice(0, 6)}`,
        plateNumber: `BR-${suffix}-${randomUUID().slice(0, 5)}`,
        type: "Truck",
      },
    });

    return {
      organizationId: org.id,
      userId: user.id,
      membershipId: membership.id,
      vehicleId: vehicle.id,
    };
  }

  /// A fresh vehicle per position-posting scenario — several tests run as
  /// standalone `it`s (not nested in a shared `beforeEach`), and Traccar's
  /// wire timestamp is whole-seconds, so two accepted posts to the *same*
  /// vehicle within the same wall-clock second would otherwise collide with
  /// each other via the real duplicate/out-of-order guard in
  /// ingest-validation.ts. Isolating the vehicle removes that cross-test
  /// timing hazard without weakening what's actually being tested.
  async function makeVehicle(organizationId: string, label: string): Promise<string> {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-BRIDGE-${label}-${randomUUID().slice(0, 6)}`,
        plateNumber: `BR-${label}-${randomUUID().slice(0, 5)}`,
        type: "Truck",
      },
    });
    return vehicle.id;
  }

  async function createDevice(org: OrgFixture, externalId: string, name: string, vehicleId?: string) {
    const actor = {
      userId: org.userId,
      membershipId: org.membershipId,
      organizationId: org.organizationId,
      role: "ADMIN" as const,
      email: "actor@example.test",
      isPlatformAdmin: false,
    };
    const created = await devices.create(
      org.organizationId,
      { provider: "TRACCAR" as const, externalId, name, vehicleId: vehicleId ?? org.vehicleId },
      actor,
    );
    return { deviceId: created.id, secret: created.ingestSecret };
  }

  function navtelecomStyleFix(overrides: Record<string, unknown> = {}) {
    // Traccar's flat position shape. speed is KNOTS (provider converts to
    // km/h); timestamp is epoch seconds. This is what Traccar's Navtelecom
    // decoder (and every other protocol decoder) ultimately produces.
    return {
      id: "862531043215285", // shaped like a real IMEI, not the physical device's
      lat: 41.2995,
      lon: 69.2401, // Tashkent
      timestamp: Math.floor(Date.now() / 1000),
      speed: 32.4, // ~60 km/h in knots
      bearing: 180,
      altitude: 450,
      ignition: true,
      sat: 9,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    devices = app.get(DeviceService);
    realtime = app.get(TelematicsRealtimeService);

    orgA = await makeOrgFixture("a");
    orgB = await makeOrgFixture("b");
  });

  afterAll(async () => {
    await prisma.gpsPosition.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.vehicleTelematicsState.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.trip.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.telematicsAlert.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.telematicsDevice.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.vehicle.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.customer.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.membership.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  // ---------------------------------------------------------------------
  // 1-3: known IMEI -> correct vehicle -> GpsPosition, state, realtime
  // ---------------------------------------------------------------------
  describe("known IMEI", () => {
    it("creates a GpsPosition, updates VehicleTelematicsState, and publishes a realtime event", async () => {
      const imei = `862531${randomUUID().slice(0, 9)}`;
      const vehicleId = await makeVehicle(orgA.organizationId, "known-imei");
      const { deviceId, secret } = await createDevice(orgA, imei, "S-2423 Test Unit", vehicleId);

      // Spies on the real TelematicsRealtimeService the ingest pipeline calls
      // (IngestionService.realtime.publish) — verifies an actual publish call
      // fired for this org/vehicle, without depending on a live SSE HTTP
      // round-trip's timing (that transport is already covered elsewhere;
      // what the Traccar bridge specifically must prove is that a real
      // ingested position reaches the realtime layer at all).
      const publishSpy = jest.spyOn(realtime, "publish");

      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
        .send(navtelecomStyleFix({ id: imei }))
        .expect(201);

      const publishedForVehicle = publishSpy.mock.calls.filter(
        ([organizationId, event]) => organizationId === orgA.organizationId && event.vehicleId === vehicleId,
      );
      expect(publishedForVehicle.length).toBeGreaterThan(0);
      expect(publishedForVehicle.some(([, event]) => event.type === "position")).toBe(true);
      publishSpy.mockRestore();

      const position = await prisma.gpsPosition.findFirst({
        where: { organizationId: orgA.organizationId, vehicleId },
        orderBy: { createdAt: "desc" },
      });
      expect(position).not.toBeNull();
      expect(position!.latitude).toBeCloseTo(41.2995, 3);
      expect(position!.longitude).toBeCloseTo(69.2401, 3);
      expect(position!.deviceId).toBe(deviceId);

      const state = await prisma.vehicleTelematicsState.findUnique({
        where: { vehicleId },
      });
      expect(state).not.toBeNull();
      expect(state!.latitude).toBeCloseTo(41.2995, 3);
      // 32.4 knots -> ~60 km/h
      expect(state!.speedKph).toBeGreaterThan(55);
      expect(state!.speedKph).toBeLessThan(65);
    });
  });

  // ---------------------------------------------------------------------
  // Real Traccar webhook shape — nested {position, device}, IMEI at
  // device.uniqueId, Traccar's own numeric deviceId ignored for identity.
  // ---------------------------------------------------------------------
  it("parses a real Traccar forward.url-shaped webhook body (nested position/device)", async () => {
    const imei = `862531${randomUUID().slice(0, 9)}`;
    const vehicleId = await makeVehicle(orgA.organizationId, "real-shape");
    const { deviceId, secret } = await createDevice(orgA, imei, "Real Shape Probe", vehicleId);

    // Structurally identical to what a live traccar/traccar:6.4 instance
    // actually POSTs via forward.url/forward.type=json (verified empirically
    // against docker-compose.local.yml's Traccar container) — including
    // Traccar's own internal numeric `deviceId` on the position, which must
    // NOT be treated as the cross-tenant identifier.
    const res = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
      .send({
        position: {
          id: 7,
          attributes: { distance: 120.5, totalDistance: 4820.1, motion: true },
          deviceId: 1, // Traccar's own row id — must be ignored for identity
          protocol: "navtelecom",
          serverTime: new Date().toISOString(),
          deviceTime: new Date().toISOString(),
          fixTime: new Date().toISOString(),
          outdated: false,
          valid: true,
          latitude: 41.35,
          longitude: 69.3,
          altitude: 480.0,
          speed: 20.0, // knots
          course: 45.0,
          accuracy: 0.0,
        },
        device: {
          id: 1,
          uniqueId: imei,
          name: "Real Shape Probe",
          status: "online",
        },
      })
      .expect(201)
      .then(typedResponse<IngestResponseBody>);

    expect(res.body.accepted).toBe(1);

    const position = await prisma.gpsPosition.findFirst({
      where: { organizationId: orgA.organizationId, vehicleId },
      orderBy: { createdAt: "desc" },
    });
    expect(position).not.toBeNull();
    expect(position!.latitude).toBeCloseTo(41.35, 3);
    expect(position!.longitude).toBeCloseTo(69.3, 3);
    // 20 knots -> ~37 km/h
    expect(position!.speedKph).toBeGreaterThan(35);
    expect(position!.speedKph).toBeLessThan(40);
  });

  // ---------------------------------------------------------------------
  // 4: unknown device -> rejected, nothing written
  // ---------------------------------------------------------------------
  it("rejects an unknown deviceId with 401 and writes nothing", async () => {
    const bogusDeviceId = randomUUID();
    const before = await prisma.gpsPosition.count({ where: { organizationId: orgA.organizationId } });

    await request(app.getHttpServer())
      .post(`/telematics/ingest/${bogusDeviceId}?secret=anything`)
      .send(navtelecomStyleFix())
      .expect(401);

    const after = await prisma.gpsPosition.count({ where: { organizationId: orgA.organizationId } });
    expect(after).toBe(before);
  });

  // ---------------------------------------------------------------------
  // 5: cross-org isolation with the SAME IMEI registered in two orgs
  // ---------------------------------------------------------------------
  it("never lets org A's post affect org B's identically-IMEI'd device", async () => {
    const sharedImei = `862531${randomUUID().slice(0, 9)}`;
    const vehicleA = await makeVehicle(orgA.organizationId, "cross-org-a");
    const devA = await createDevice(orgA, sharedImei, "Org A unit", vehicleA);
    const devB = await createDevice(orgB, sharedImei, "Org B unit");

    await request(app.getHttpServer())
      .post(`/telematics/ingest/${devA.deviceId}?secret=${devA.secret}`)
      .send(navtelecomStyleFix({ id: sharedImei, lat: 40.0, lon: 65.0 }))
      .expect(201);

    const orgBPositionCount = await prisma.gpsPosition.count({
      where: { organizationId: orgB.organizationId, deviceId: devB.deviceId },
    });
    expect(orgBPositionCount).toBe(0);

    // And org A's own secret must not authenticate against org B's device row.
    await request(app.getHttpServer())
      .post(`/telematics/ingest/${devB.deviceId}?secret=${devA.secret}`)
      .send(navtelecomStyleFix({ id: sharedImei }))
      .expect(401);
  });

  // ---------------------------------------------------------------------
  // 6-7: IMEI cross-check — mismatch rejected, absence not rejected
  // ---------------------------------------------------------------------
  describe("IMEI cross-check", () => {
    it("rejects a payload whose device identifier does not match the authenticated device", async () => {
      const registeredImei = `862531${randomUUID().slice(0, 9)}`;
      const { deviceId, secret } = await createDevice(orgA, registeredImei, "Mismatch Probe");

      const before = await prisma.gpsPosition.count({ where: { organizationId: orgA.organizationId } });

      await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
        .send(navtelecomStyleFix({ id: "999999999999999" })) // a different IMEI
        .expect(401);

      const after = await prisma.gpsPosition.count({ where: { organizationId: orgA.organizationId } });
      expect(after).toBe(before);
    });

    it("does not reject a payload that carries no device identifier at all", async () => {
      const vehicleId = await makeVehicle(orgA.organizationId, "no-id");
      const { deviceId, secret } = await createDevice(orgA, `862531${randomUUID().slice(0, 9)}`, "No-Id Probe", vehicleId);

      const res = await request(app.getHttpServer())
        .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
        .send({
          latitude: 41.31,
          longitude: 69.25,
          speedKph: 10,
          recordedAt: new Date().toISOString(),
        })
      .expect(201)
      .then(typedResponse<IngestResponseBody>);

      expect(res.body.accepted).toBe(1);
    });
  });

  // ---------------------------------------------------------------------
  // 8: duplicate / repeated position handled safely
  // ---------------------------------------------------------------------
  it("does not create a duplicate GpsPosition for a repeated fix", async () => {
    const externalId = `862531${randomUUID().slice(0, 9)}`;
    const vehicleId = await makeVehicle(orgA.organizationId, "duplicate");
    const { deviceId, secret } = await createDevice(orgA, externalId, "Duplicate Probe", vehicleId);
    const fix = navtelecomStyleFix({ id: externalId });

    const first = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
      .send(fix)
      .expect(201)
      .then(typedResponse<IngestResponseBody>);
    expect(first.body.accepted).toBe(1);

    const second = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
      .send(fix) // exact same timestamp + coordinates
      .expect(201)
      .then(typedResponse<IngestResponseBody>);
    expect(second.body.accepted).toBe(0);
    expect(second.body.rejected).toBe(1);

    const device = await prisma.telematicsDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const count = await prisma.gpsPosition.count({
      where: { deviceId: device.id, recordedAt: new Date(fix.timestamp * 1000) },
    });
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------
  // 9: invalid coordinates rejected
  // ---------------------------------------------------------------------
  it("rejects out-of-range coordinates without crashing", async () => {
    const externalId = `862531${randomUUID().slice(0, 9)}`;
    const { deviceId, secret } = await createDevice(orgA, externalId, "Bad Coords Probe");

    const res = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
      .send(navtelecomStyleFix({ id: externalId, lat: 999, lon: 69.24 }))
      .expect(201)
      .then(typedResponse<IngestResponseBody>);

    expect(res.body.accepted).toBe(0);
    expect(res.body.rejected).toBe(1);
  });

  // ---------------------------------------------------------------------
  // 10: missing timestamp handled safely (defaults to now)
  // ---------------------------------------------------------------------
  it("accepts a fix with no timestamp, defaulting to receive time", async () => {
    const externalId = `862531${randomUUID().slice(0, 9)}`;
    const vehicleId = await makeVehicle(orgA.organizationId, "no-timestamp");
    const { deviceId, secret } = await createDevice(orgA, externalId, "No Timestamp Probe", vehicleId);
    const fix = navtelecomStyleFix({ id: externalId });
    delete (fix as Record<string, unknown>).timestamp;

    const before = Date.now();
    const res = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
      .send(fix)
      .expect(201)
      .then(typedResponse<IngestResponseBody>);

    expect(res.body.accepted).toBe(1);
    const recordedAt = new Date(res.body.latest.recordedAt).getTime();
    expect(recordedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(recordedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  // ---------------------------------------------------------------------
  // 11: malformed payload -> clean 400, not a 500
  // ---------------------------------------------------------------------
  it("returns a clean 400 for a payload with no coordinates at all", async () => {
    const { deviceId, secret } = await createDevice(orgA, `862531${randomUUID().slice(0, 9)}`, "Malformed Probe");

    const res = await request(app.getHttpServer())
      .post(`/telematics/ingest/${deviceId}?secret=${secret}`)
      .send({ id: "862531000000000", timestamp: Math.floor(Date.now() / 1000) })
      .expect(400)
      .then(typedResponse<IngestResponseBody>);

    expect(res.body.error?.message ?? res.body.message).toMatch(/lat|lon/i);
  });

  // ---------------------------------------------------------------------
  // 12: multiple devices/vehicles remain isolated
  // ---------------------------------------------------------------------
  it("keeps two devices on two vehicles in the same org fully isolated", async () => {
    const vehicle1Id = await makeVehicle(orgA.organizationId, "multi-1");
    const vehicle2Id = await makeVehicle(orgA.organizationId, "multi-2");
    const actor = {
      userId: orgA.userId,
      membershipId: orgA.membershipId,
      organizationId: orgA.organizationId,
      role: "ADMIN" as const,
      email: "actor@example.test",
      isPlatformAdmin: false,
    };
    const dev1ExternalId = `862531${randomUUID().slice(0, 9)}`;
    const dev1 = await createDevice(orgA, dev1ExternalId, "Multi Probe 1", vehicle1Id);
    await devices.create(
      orgA.organizationId,
      { provider: "TRACCAR" as const, externalId: `862531${randomUUID().slice(0, 9)}`, name: "Multi Probe 2", vehicleId: vehicle2Id },
      actor,
    );

    await request(app.getHttpServer())
      .post(`/telematics/ingest/${dev1.deviceId}?secret=${dev1.secret}`)
      .send(navtelecomStyleFix({ id: dev1ExternalId, lat: 41.0, lon: 69.0 }))
      .expect(201);

    const vehicle2State = await prisma.vehicleTelematicsState.findUnique({ where: { vehicleId: vehicle2Id } });
    expect(vehicle2State).toBeNull();

    const vehicle1State = await prisma.vehicleTelematicsState.findUnique({ where: { vehicleId: vehicle1Id } });
    expect(vehicle1State).not.toBeNull();
  });
});
