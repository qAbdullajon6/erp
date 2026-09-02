import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TrackingSessionSource, TrackingSessionStatus } from "@prisma/client";
import type { IngestionService } from "../ingestion/ingestion.service";
import type { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import type { TelematicsSettingsService } from "../settings/telematics-settings.service";
import { TrackingService } from "./tracking.service";

describe("TrackingService", () => {
  const organizationId = "org-1";
  const vehicleId = "veh-1";
  const driverId = "drv-1";

  let prisma: {
    vehicleTelematicsState: { findMany: jest.Mock; findFirst: jest.Mock };
    trackingSession: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    vehicle: { findFirst: jest.Mock; findMany: jest.Mock };
    driver: { findFirst: jest.Mock; findMany: jest.Mock };
    dispatch: { findFirst: jest.Mock; findMany: jest.Mock };
    telematicsDevice: { findFirst: jest.Mock };
    gpsPosition: { findMany: jest.Mock };
  };
  let ingestion: { ingestForVehicle: jest.Mock };
  let settings: { getOrCreate: jest.Mock };
  let realtime: { publish: jest.Mock };
  let service: TrackingService;

  beforeEach(() => {
    prisma = {
      vehicleTelematicsState: { findMany: jest.fn(), findFirst: jest.fn() },
      trackingSession: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      vehicle: { findFirst: jest.fn(), findMany: jest.fn() },
      driver: { findFirst: jest.fn(), findMany: jest.fn() },
      dispatch: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      telematicsDevice: { findFirst: jest.fn() },
      gpsPosition: { findMany: jest.fn() },
    };
    ingestion = {
      ingestForVehicle: jest.fn().mockResolvedValue({
        accepted: 1,
        rejected: 0,
        tripId: "trip-1",
        latest: {
          latitude: 41.3,
          longitude: 69.2,
          speedKph: 40,
          movementState: "MOVING",
          recordedAt: new Date("2026-07-26T10:00:00.000Z"),
        },
      }),
    };
    settings = {
      getOrCreate: jest.fn().mockResolvedValue({ offlineThresholdSec: 600 }),
    };
    realtime = { publish: jest.fn() };

    service = new TrackingService(
      prisma as never,
      ingestion as unknown as IngestionService,
      settings as unknown as TelematicsSettingsService,
      realtime as unknown as TelematicsRealtimeService,
      { recordEvent: jest.fn(), recordPacket: jest.fn() } as never,
    );
  });

  it("receiveForVehicle persists GPS via ingestion and opens a tracking session", async () => {
    prisma.trackingSession.findFirst.mockResolvedValue(null);
    prisma.trackingSession.create.mockResolvedValue({ id: "sess-1" });

    const result = await service.receiveForVehicle(
      organizationId,
      vehicleId,
      [
        {
          recordedAt: new Date("2026-07-26T10:00:00.000Z"),
          latitude: 41.3,
          longitude: 69.2,
          speedKph: 40,
          heading: 90,
          altitudeM: null,
          accuracyM: null,
          ignitionOn: true,
          odometerKm: null,
          fuelLevelPct: null,
          satellites: null,
        },
      ],
      { source: TrackingSessionSource.STAFF },
    );

    expect(ingestion.ingestForVehicle).toHaveBeenCalledWith(
      { organizationId, vehicleId, driverId: undefined, deviceId: undefined, source: TrackingSessionSource.STAFF },
      expect.any(Array),
    );
    expect(prisma.trackingSession.create).toHaveBeenCalled();
    expect(result.sessionId).toBe("sess-1");
    expect(result.accepted).toBe(1);
    expect(result.latest?.latitude).toBe(41.3);
  });

  it("vehicleLatest returns null coordinates when no live state exists", async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: vehicleId,
      vehicleCode: "V-1",
      plateNumber: "01A001AA",
    });
    prisma.vehicleTelematicsState.findFirst.mockResolvedValue(null);
    prisma.trackingSession.findFirst.mockResolvedValue(null);

    const latest = await service.vehicleLatest(organizationId, vehicleId);
    expect(latest.latitude).toBeNull();
    expect(latest.longitude).toBeNull();
    expect(latest.isStale).toBe(true);
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: vehicleId,
          organizationId,
          archivedAt: null,
        },
      }),
    );
  });

  it("vehicleLatest 404s for archived vehicles without leaking existence", async () => {
    // Prisma returns null when archivedAt: null is in the where clause.
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.vehicleLatest(organizationId, vehicleId)).rejects.toEqual(
      expect.objectContaining({
        message: "Vehicle not found",
      }),
    );
    await expect(service.vehicleLatest(organizationId, vehicleId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vehicleTelematicsState.findFirst).not.toHaveBeenCalled();
  });

  it("vehicleLatest 404s for cross-org vehicle ids (same message as archived)", async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.vehicleLatest("other-org", vehicleId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.vehicleLatest("other-org", vehicleId)).rejects.toThrow(
      "Vehicle not found",
    );
  });

  it("heartbeat rejects ended sessions and publishes for active ones", async () => {
    prisma.trackingSession.findFirst.mockResolvedValue({
      id: "sess-1",
      organizationId,
      vehicleId,
      driverId,
      deviceId: null,
      dispatchId: null,
      source: TrackingSessionSource.DRIVER_APP,
      status: TrackingSessionStatus.ENDED,
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
      lastPositionAt: null,
      endedAt: new Date(),
    });

    await expect(service.heartbeat(organizationId, "sess-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.trackingSession.findFirst.mockResolvedValue({
      id: "sess-1",
      organizationId,
      vehicleId,
      driverId,
      deviceId: null,
      dispatchId: null,
      source: TrackingSessionSource.DRIVER_APP,
      status: TrackingSessionStatus.ACTIVE,
      startedAt: new Date(),
      lastHeartbeatAt: new Date("2026-07-26T09:00:00.000Z"),
      lastPositionAt: null,
      endedAt: null,
    });
    prisma.trackingSession.update.mockResolvedValue({
      id: "sess-1",
      organizationId,
      vehicleId,
      driverId,
      deviceId: null,
      dispatchId: null,
      source: TrackingSessionSource.DRIVER_APP,
      status: TrackingSessionStatus.ACTIVE,
      startedAt: new Date("2026-07-26T08:00:00.000Z"),
      lastHeartbeatAt: new Date("2026-07-26T10:00:00.000Z"),
      lastPositionAt: null,
      endedAt: null,
    });

    const view = await service.heartbeat(organizationId, "sess-1");
    expect(realtime.publish).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ type: "heartbeat", vehicleId }),
    );
    expect(view.sessionId).toBe("sess-1");
    expect(view.isStale).toBe(false);
  });

  it("history requires vehicleId or driverId", async () => {
    await expect(
      service.history(organizationId, {
        from: new Date("2026-07-26T00:00:00.000Z"),
        to: new Date("2026-07-26T23:59:59.000Z"),
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dispatchLatest 404s when dispatch is missing", async () => {
    prisma.dispatch.findFirst.mockResolvedValue(null);
    await expect(service.dispatchLatest(organizationId, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
