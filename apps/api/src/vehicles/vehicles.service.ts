import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Vehicle } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { PrismaService } from "../prisma/prisma.service";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { ListVehiclesQueryDto } from "./dto/list-vehicles-query.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import { generateUniqueVehicleCode } from "./vehicle-code.util";

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, query: ListVehiclesQueryDto) {
    const where: Prisma.VehicleWhereInput = {
      organizationId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { vehicleCode: { contains: query.search, mode: "insensitive" } },
              { plateNumber: { contains: query.search, mode: "insensitive" } },
              { type: { contains: query.search, mode: "insensitive" } },
              { make: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const vehicle = await this.findOrThrow(organizationId, id);
    return this.toResponse(vehicle);
  }

  async create(organizationId: string, dto: CreateVehicleDto, actor: CurrentUserPayload) {
    const vehicleCode = await this.resolveCodeForCreate(organizationId, dto.vehicleCode);

    const vehicle = await this.prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode,
        plateNumber: dto.plateNumber,
        type: dto.type,
        capacityKg: dto.capacityKg !== undefined ? new Prisma.Decimal(dto.capacityKg) : undefined,
        capacityM3: dto.capacityM3 !== undefined ? new Prisma.Decimal(dto.capacityM3) : undefined,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
        inspectionExpiry: dto.inspectionExpiry ? new Date(dto.inspectionExpiry) : undefined,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "vehicle.create",
      entityType: "Vehicle",
      entityId: vehicle.id,
      metadata: { vehicleCode: vehicle.vehicleCode, plateNumber: vehicle.plateNumber },
    });

    return this.toResponse(vehicle);
  }

  async update(organizationId: string, id: string, dto: UpdateVehicleDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);

    if (existing.archivedAt) {
      throw new ConflictException("This vehicle is archived — restore it first to make changes");
    }

    if (dto.vehicleCode && dto.vehicleCode !== existing.vehicleCode) {
      await this.assertCodeAvailable(organizationId, dto.vehicleCode);
    }

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        vehicleCode: dto.vehicleCode,
        plateNumber: dto.plateNumber,
        type: dto.type,
        capacityKg: dto.capacityKg !== undefined ? new Prisma.Decimal(dto.capacityKg) : undefined,
        capacityM3: dto.capacityM3 !== undefined ? new Prisma.Decimal(dto.capacityM3) : undefined,
        status: dto.status,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
        inspectionExpiry: dto.inspectionExpiry ? new Date(dto.inspectionExpiry) : undefined,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "vehicle.update",
      entityType: "Vehicle",
      entityId: id,
      metadata: { changes: dto },
    });

    return this.toResponse(updated);
  }

  async archive(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) {
      throw new ConflictException("Vehicle is already archived");
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "vehicle.archive",
      entityType: "Vehicle",
      entityId: id,
    });

    return this.toResponse(vehicle);
  }

  async restore(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (!existing.archivedAt) {
      throw new ConflictException("Vehicle is not archived");
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { archivedAt: null },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "vehicle.restore",
      entityType: "Vehicle",
      entityId: id,
    });

    return this.toResponse(vehicle);
  }

  private async resolveCodeForCreate(organizationId: string, requestedCode?: string): Promise<string> {
    if (!requestedCode) {
      return generateUniqueVehicleCode(this.prisma, organizationId);
    }
    await this.assertCodeAvailable(organizationId, requestedCode);
    return requestedCode;
  }

  private async assertCodeAvailable(organizationId: string, vehicleCode: string): Promise<void> {
    if (!isValidEntityCode(vehicleCode)) {
      throw new BadRequestException("vehicleCode may only contain letters, numbers and hyphens");
    }
    const conflict = await this.prisma.vehicle.findUnique({
      where: { organizationId_vehicleCode: { organizationId, vehicleCode } },
    });
    if (conflict) {
      throw new ConflictException("A vehicle with this vehicleCode already exists in this organization");
    }
  }

  /// Scoped by organizationId in the query itself, so a vehicle id from
  /// another organization returns 404. Exported for OrdersService's
  /// assignment validation.
  async findOrThrow(organizationId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, organizationId } });
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found");
    }
    return vehicle;
  }

  private toResponse(vehicle: Vehicle) {
    return {
      id: vehicle.id,
      organizationId: vehicle.organizationId,
      vehicleCode: vehicle.vehicleCode,
      plateNumber: vehicle.plateNumber,
      type: vehicle.type,
      capacityKg: vehicle.capacityKg?.toString() ?? null,
      capacityM3: vehicle.capacityM3?.toString() ?? null,
      status: vehicle.status,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      insuranceExpiry: vehicle.insuranceExpiry,
      inspectionExpiry: vehicle.inspectionExpiry,
      archivedAt: vehicle.archivedAt,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
  }
}
