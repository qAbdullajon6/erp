import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { hashDeviceSecret } from "./device-secret.util";
import { DeviceService } from "./device.service";

describe("DeviceService vehicle binding", () => {
  const actor: CurrentUserPayload = {
    userId: "11111111-1111-4111-8111-111111111111",
    membershipId: "22222222-2222-4222-8222-222222222222",
    organizationId: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN",
    email: "admin@example.test",
    isPlatformAdmin: false,
  };
  const deviceId = "44444444-4444-4444-8444-444444444444";
  const vehicleId = "55555555-5555-4555-8555-555555555555";
  const now = new Date("2026-08-12T12:00:00.000Z");
  const device = {
    id: deviceId,
    organizationId: actor.organizationId,
    vehicleId: null,
    provider: "TRACCAR",
    externalId: "862531043215285",
    name: "S-2423",
    ingestSecretHash: hashDeviceSecret("device-secret"),
    active: true,
    config: null,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  function makeService() {
    const prisma = {
      telematicsDevice: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      prisma,
      audit,
      service: new DeviceService(prisma as never, audit as never),
    };
  }

  it("binds an organization device to an active organization vehicle", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findFirst.mockResolvedValue(device);
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
    prisma.telematicsDevice.update.mockResolvedValue({ ...device, vehicleId });

    const result = await service.update(
      actor.organizationId,
      deviceId,
      { vehicleId },
      actor,
    );

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: {
        id: vehicleId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });
    expect(prisma.telematicsDevice.update).toHaveBeenCalledWith({
      where: { id: deviceId },
      data: { name: undefined, vehicleId, active: undefined },
    });
    expect(result.vehicleId).toBe(vehicleId);
  });

  it("unbinds without requiring a vehicle lookup", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findFirst.mockResolvedValue({ ...device, vehicleId });
    prisma.telematicsDevice.update.mockResolvedValue(device);

    const result = await service.update(
      actor.organizationId,
      deviceId,
      { vehicleId: null },
      actor,
    );

    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    expect(prisma.telematicsDevice.update).toHaveBeenCalledWith({
      where: { id: deviceId },
      data: { name: undefined, vehicleId: null, active: undefined },
    });
    expect(result.vehicleId).toBeNull();
  });

  it.each([
    ["another organization", null],
    ["an archived vehicle", null],
  ])("rejects binding to %s", async (_label, vehicle) => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findFirst.mockResolvedValue(device);
    prisma.vehicle.findFirst.mockResolvedValue(vehicle);

    await expect(
      service.update(actor.organizationId, deviceId, { vehicleId }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not expose or update a device from another organization", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findFirst.mockResolvedValue(null);

    await expect(
      service.update(actor.organizationId, deviceId, { vehicleId }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    expect(prisma.telematicsDevice.update).not.toHaveBeenCalled();
  });

  it("rejects a duplicate provider external id in the same organization", async () => {
    const { service, prisma } = makeService();
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
    prisma.telematicsDevice.findUnique.mockResolvedValue(device);

    await expect(
      service.create(
        actor.organizationId,
        {
          name: "Duplicate S-2423",
          provider: "TRACCAR",
          externalId: device.externalId,
          vehicleId,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.telematicsDevice.create).not.toHaveBeenCalled();
  });

  it("resolves an authenticated IMEI device to its explicit active vehicle binding", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findUnique.mockResolvedValue({
      ...device,
      vehicleId,
      vehicle: { organizationId: actor.organizationId, archivedAt: null },
    });

    await expect(
      service.authenticateForIngest(deviceId, "device-secret"),
    ).resolves.toEqual({
      deviceId,
      organizationId: actor.organizationId,
      vehicleId,
      provider: "TRACCAR",
      externalId: "862531043215285",
    });
  });

  it("rejects ingest when the bound vehicle is archived or cross-organization", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findUnique.mockResolvedValue({
      ...device,
      vehicleId,
      vehicle: {
        organizationId: "66666666-6666-4666-8666-666666666666",
        archivedAt: now,
      },
    });

    await expect(
      service.authenticateForIngest(deviceId, "device-secret"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("stops ingest after a device is unbound", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findUnique.mockResolvedValue({
      ...device,
      vehicle: null,
    });

    await expect(
      service.authenticateForIngest(deviceId, "device-secret"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("scopes vehicle binding list filters to the current organization", async () => {
    const { service, prisma } = makeService();
    prisma.telematicsDevice.findMany.mockResolvedValue([]);
    prisma.telematicsDevice.count.mockResolvedValue(0);

    await service.list(actor.organizationId, {
      page: 1,
      limit: 20,
      includeArchived: false,
      vehicleId,
    });

    expect(prisma.telematicsDevice.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: actor.organizationId,
        vehicleId,
        archivedAt: null,
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
  });
});
