import { NotFoundException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { TelematicsService } from "./telematics.service";

describe("TelematicsService.liveVehicle", () => {
  const organizationId = "org-1";
  const vehicleId = "veh-1";

  let prisma: {
    vehicleTelematicsState: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock };
    gpsPosition: { findMany: jest.Mock };
    trip: { findFirst: jest.Mock };
  };
  let service: TelematicsService;

  beforeEach(() => {
    prisma = {
      vehicleTelematicsState: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicle: { findFirst: jest.fn() },
      gpsPosition: { findMany: jest.fn() },
      trip: { findFirst: jest.fn() },
    };
    service = new TelematicsService(prisma as never, {
      getOrCreate: jest.fn(),
    } as never);
  });

  it("404s archived vehicles with the same message as missing vehicles", async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.liveVehicle(organizationId, vehicleId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.liveVehicle(organizationId, vehicleId)).rejects.toThrow(
      "Vehicle not found",
    );
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: vehicleId,
          organizationId,
          archivedAt: null,
        },
      }),
    );
    expect(prisma.gpsPosition.findMany).not.toHaveBeenCalled();
  });

  it("404s cross-org vehicle ids without leaking existence", async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.liveVehicle("other-org", vehicleId)).rejects.toThrow(
      "Vehicle not found",
    );
  });
});

describe("TelematicsService.trackForOrder", () => {
  const organizationId = "org-1";
  const orderId = "order-1";
  const vehicleId = "veh-1";

  const liveState = {
    latitude: new Decimal("41.3111"),
    longitude: new Decimal("69.2797"),
    speedKph: new Decimal("40"),
    heading: new Decimal("180"),
    movementState: "MOVING",
    lastRecordedAt: new Date("2026-01-01T10:00:00Z"),
  };

  function makeService(order: unknown, state: unknown, trip: unknown = null) {
    const p = {
      order: { findFirst: jest.fn().mockResolvedValue(order) },
      vehicleTelematicsState: { findFirst: jest.fn().mockResolvedValue(state) },
      trip: { findFirst: jest.fn().mockResolvedValue(trip) },
    };
    return {
      service: new TelematicsService(p as never, { getOrCreate: jest.fn() } as never),
      prisma: p,
    };
  }

  it("404s when order not found", async () => {
    const { service: svc } = makeService(null, null);
    await expect(svc.trackForOrder(organizationId, orderId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns no-tracking message when no vehicle assigned", async () => {
    const { service: svc } = makeService({ id: orderId, status: "PENDING", vehicleId: null, deliveryLat: null, deliveryLng: null }, null);
    const result = await svc.trackForOrder(organizationId, orderId);
    expect(result.tracking).toBeNull();
    expect(result.eta).toBeNull();
  });

  it("returns no-tracking message when telematics state not yet available", async () => {
    const { service: svc } = makeService({ id: orderId, status: "ASSIGNED", vehicleId, deliveryLat: null, deliveryLng: null }, null);
    const result = await svc.trackForOrder(organizationId, orderId);
    expect(result.tracking).toBeNull();
    expect(result.eta).toBeNull();
  });

  it("returns tracking with null ETA when delivery coords are not yet geocoded", async () => {
    const { service: svc } = makeService(
      { id: orderId, status: "IN_TRANSIT", vehicleId, deliveryLat: null, deliveryLng: null },
      liveState,
    );
    const result = await svc.trackForOrder(organizationId, orderId);
    expect(result.tracking).not.toBeNull();
    expect(result.eta).toBeNull();
  });

  it("computes ETA when delivery coordinates are available", async () => {
    const deliveryLat = new Decimal("41.2995");
    const deliveryLng = new Decimal("69.2401");
    const { service: svc } = makeService(
      { id: orderId, status: "IN_TRANSIT", vehicleId, deliveryLat, deliveryLng },
      liveState,
    );
    const result = await svc.trackForOrder(organizationId, orderId);
    expect(result.tracking).not.toBeNull();
    expect(result.eta).not.toBeNull();
    expect(result.eta!.remainingKm).toBeGreaterThan(0);
    expect(result.eta!.etaSeconds).toBeGreaterThan(0);
    expect(result.eta!.etaMinutes).toBeGreaterThanOrEqual(0);
    expect(result.eta!.etaAt).toBeInstanceOf(Date);
  });

  it("uses trip average speed in ETA when active trip exists", async () => {
    const deliveryLat = new Decimal("41.2995");
    const deliveryLng = new Decimal("69.2401");
    const { service: svc, prisma: p } = makeService(
      { id: orderId, status: "IN_TRANSIT", vehicleId, deliveryLat, deliveryLng },
      { ...liveState, speedKph: new Decimal("0") },
      { avgSpeedKph: new Decimal("50") },
    );
    const result = await svc.trackForOrder(organizationId, orderId);
    expect(result.eta).not.toBeNull();
    expect(p.trip.findFirst).toHaveBeenCalled();
  });
});
