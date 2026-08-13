import { NotFoundException } from "@nestjs/common";
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
