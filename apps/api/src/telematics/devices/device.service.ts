import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma, TelematicsDevice } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateDeviceDto } from "../dto/create-device.dto";
import type { ListDevicesQueryDto } from "../dto/list-devices-query.dto";
import type { UpdateDeviceDto } from "../dto/update-device.dto";
import { generateDeviceSecret, hashDeviceSecret, timingSafeSecretEquals } from "./device-secret.util";

/// Manages GPS devices and their binding to vehicles, and authenticates their
/// ingest posts. The ingest secret is shown once at create/rotate and stored
/// only as a SHA-256 hash — the same one-time-reveal contract as an API key.
export interface AuthenticatedDevice {
  deviceId: string;
  organizationId: string;
  vehicleId: string;
  provider: import("@prisma/client").TelematicsProviderType;
}

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(organizationId: string, dto: CreateDeviceDto, actor: CurrentUserPayload) {
    if (dto.vehicleId) {
      await this.assertVehicle(organizationId, dto.vehicleId);
    }
    await this.assertExternalIdAvailable(organizationId, dto.provider, dto.externalId);

    const secret = generateDeviceSecret();
    let device: TelematicsDevice;
    try {
      device = await this.prisma.telematicsDevice.create({
        data: {
          organizationId,
          name: dto.name,
          provider: dto.provider,
          externalId: dto.externalId,
          vehicleId: dto.vehicleId ?? null,
          ingestSecretHash: secret.hash,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("A device with this provider and external id already exists");
      }
      throw err;
    }

    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "telematics.device.create",
      entityType: "TelematicsDevice",
      entityId: device.id,
      metadata: { provider: device.provider, externalId: device.externalId },
    });

    // The secret is revealed exactly once, here.
    return { ...this.toResponse(device), ingestSecret: secret.rawSecret, secretPrefix: secret.prefix };
  }

  async list(organizationId: string, query: ListDevicesQueryDto) {
    const where: Prisma.TelematicsDeviceWhereInput = {
      organizationId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { externalId: { contains: query.search, mode: "insensitive" } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.telematicsDevice.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.telematicsDevice.count({ where }),
    ]);
    return {
      items: rows.map((d) => this.toResponse(d)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async getById(organizationId: string, id: string) {
    return this.toResponse(await this.findOrThrow(organizationId, id));
  }

  async update(organizationId: string, id: string, dto: UpdateDeviceDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) throw new ConflictException("Device is archived — restore it first to make changes");
    if (dto.vehicleId) await this.assertVehicle(organizationId, dto.vehicleId);

    const device = await this.prisma.telematicsDevice.update({
      where: { id },
      data: {
        name: dto.name,
        vehicleId: dto.vehicleId === undefined ? undefined : dto.vehicleId,
        active: dto.active,
      },
    });
    await this.audit.log({ organizationId, actorUserId: actor.userId, action: "telematics.device.update", entityType: "TelematicsDevice", entityId: id, metadata: { changes: dto } });
    return this.toResponse(device);
  }

  async rotateSecret(organizationId: string, id: string, actor: CurrentUserPayload) {
    await this.findOrThrow(organizationId, id);
    const secret = generateDeviceSecret();
    await this.prisma.telematicsDevice.update({ where: { id }, data: { ingestSecretHash: secret.hash } });
    await this.audit.log({ organizationId, actorUserId: actor.userId, action: "telematics.device.rotate_secret", entityType: "TelematicsDevice", entityId: id });
    return { id, ingestSecret: secret.rawSecret, secretPrefix: secret.prefix };
  }

  async archive(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) throw new ConflictException("Device is already archived");
    const device = await this.prisma.telematicsDevice.update({ where: { id }, data: { archivedAt: new Date(), active: false } });
    await this.audit.log({ organizationId, actorUserId: actor.userId, action: "telematics.device.archive", entityType: "TelematicsDevice", entityId: id });
    return this.toResponse(device);
  }

  async restore(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (!existing.archivedAt) throw new ConflictException("Device is not archived");
    const device = await this.prisma.telematicsDevice.update({ where: { id }, data: { archivedAt: null } });
    await this.audit.log({ organizationId, actorUserId: actor.userId, action: "telematics.device.restore", entityType: "TelematicsDevice", entityId: id });
    return this.toResponse(device);
  }

  /// Authenticates an ingest post. Loads by id, verifies the presented secret
  /// in constant time, and rejects an archived/inactive/unbound device. Never
  /// reveals which of those failed — every failure is a flat 401.
  async authenticateForIngest(deviceId: string, presentedSecret: string): Promise<AuthenticatedDevice> {
    const device = await this.prisma.telematicsDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.archivedAt || !device.active || !device.ingestSecretHash) {
      throw new UnauthorizedException("Invalid device credentials");
    }
    const presentedHash = hashDeviceSecret(presentedSecret);
    if (!timingSafeSecretEquals(presentedHash, device.ingestSecretHash)) {
      throw new UnauthorizedException("Invalid device credentials");
    }
    if (!device.vehicleId) {
      throw new BadRequestException("This device is not bound to a vehicle yet");
    }
    return { deviceId: device.id, organizationId: device.organizationId, vehicleId: device.vehicleId, provider: device.provider };
  }

  private async assertVehicle(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { id: true } });
    if (!vehicle) throw new NotFoundException("Vehicle not found");
  }

  private async assertExternalIdAvailable(organizationId: string, provider: CreateDeviceDto["provider"], externalId: string): Promise<void> {
    const conflict = await this.prisma.telematicsDevice.findUnique({
      where: { organizationId_provider_externalId: { organizationId, provider, externalId } },
    });
    if (conflict) throw new ConflictException("A device with this provider and external id already exists");
  }

  private async findOrThrow(organizationId: string, id: string): Promise<TelematicsDevice> {
    const device = await this.prisma.telematicsDevice.findFirst({ where: { id, organizationId } });
    if (!device) throw new NotFoundException("Device not found");
    return device;
  }

  private toResponse(d: TelematicsDevice) {
    return {
      id: d.id,
      organizationId: d.organizationId,
      name: d.name,
      provider: d.provider,
      externalId: d.externalId,
      vehicleId: d.vehicleId,
      active: d.active,
      lastSeenAt: d.lastSeenAt,
      // The hash is never serialised; whether a secret is set is surfaced instead.
      hasIngestSecret: d.ingestSecretHash != null,
      archivedAt: d.archivedAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
