import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DispatchStatus, Driver, DriverDocument, DriverEmergencyContact, Prisma, UsageMetricType } from "@prisma/client";
import { createReadStream, existsSync, mkdirSync, unlinkSync } from "fs";
import { writeFile } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowEventService } from "../workflows/triggers/workflow-event.service";
import { UsageMeteringService } from "../billing/usage-metering.service";
import { matchesDeclaredMimeType } from "../orders/order-document-signature.util";
import { generateUniqueDriverCode } from "./driver-code.util";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { ListDriversQueryDto } from "./dto/list-drivers-query.dto";
import { UpdateDriverDto } from "./dto/update-driver.dto";

const PHOTO_UPLOAD_ROOT = join(process.cwd(), "uploads", "driver-photos");
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/// Must stay aligned with AssignmentQueries.ACTIVE_DISPATCH_STATUSES plus DRAFT
/// (draft already reserves the driver under GiST). Duplicated here so Drivers
/// does not import the Dispatch package graph.
const LIVE_DISPATCH_STATUSES: DispatchStatus[] = [
  "DRAFT",
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
  "AT_STOP",
];

type DriverWithRelations = Driver & {
  emergencyContact: DriverEmergencyContact | null;
  driverDocuments: DriverDocument[];
};

const DRIVER_INCLUDE = {
  emergencyContact: true,
  driverDocuments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.DriverInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly usageMetering: UsageMeteringService,
  ) {}

  async list(organizationId: string, query: ListDriversQueryDto) {
    const where: Prisma.DriverWhereInput = {
      organizationId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { employeeCode: { contains: query.search, mode: "insensitive" } },
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row as DriverWithRelations)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const driver = await this.findOrThrowWithRelations(organizationId, id);
    return this.toResponse(driver);
  }

  /// Resolves the Driver profile linked to the calling DRIVER-role user
  /// (Driver.userId), never a client-supplied id. 404 (not a bare empty
  /// response) when no Driver row is linked yet — a DRIVER login account
  /// with no linked fleet profile is a real, expected state (e.g. a newly
  /// added user who hasn't been linked by an admin yet), and the frontend
  /// needs to tell that apart from a transient error.
  async getMe(organizationId: string, userId: string) {
    /// Archived profiles are treated as unlinked for the driver app — same
    /// rule telematics ingest already applies — so an archive cannot leave a
    /// ghost session advancing live dispatches.
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
      include: DRIVER_INCLUDE,
    });
    if (!driver) {
      throw new NotFoundException("No driver profile is linked to your account yet");
    }
    return this.toResponse(driver);
  }

  async create(organizationId: string, dto: CreateDriverDto, actor: CurrentUserPayload) {
    // Auto-generated codes are check-then-write: two concurrent creates can
    // both compute the same "next" EMP-000N and race the unique constraint.
    // A user-SUPPLIED code has already been existence-checked in
    // resolveCodeForCreate, so a collision there is a real conflict, not a
    // race to retry — only the auto-generated path retries.
    await this.usageMetering.enforceLimit(organizationId, UsageMetricType.DRIVERS, 1);

    const isAutoCode = !dto.employeeCode;
    let employeeCode = await this.resolveCodeForCreate(organizationId, dto.employeeCode);

    let driver: DriverWithRelations | undefined;
    for (let attempt = 0; ; attempt += 1) {
      try {
        driver = await this.prisma.$transaction(async (tx) => {
          const created = await tx.driver.create({
            data: {
              organizationId,
              employeeCode,
              firstName: dto.firstName,
              lastName: dto.lastName,
              phone: dto.phone,
              email: dto.email,
              profilePhotoUrl: dto.profilePhotoUrl,
              licenseNumber: dto.licenseNumber,
              licenseClass: dto.licenseClass,
              licenseIssueDate: dto.licenseIssueDate ? new Date(dto.licenseIssueDate) : undefined,
              licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined,
              licenseEndorsements: dto.licenseEndorsements,
              employmentType: dto.employmentType,
              hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
              department: dto.department,
              baseLocation: dto.baseLocation,
              workShift: dto.workShift,
              preferredRegions: dto.preferredRegions,
              availableDays: dto.availableDays ?? undefined,
              driverNotes: dto.driverNotes,
              internalNotes: dto.internalNotes,
            },
            include: DRIVER_INCLUDE,
          });

          if (dto.emergencyContact) {
            await tx.driverEmergencyContact.create({
              data: {
                driverId: created.id,
                organizationId,
                name: dto.emergencyContact.name,
                relationship: dto.emergencyContact.relationship,
                phone: dto.emergencyContact.phone,
                alternatePhone: dto.emergencyContact.alternatePhone,
                email: dto.emergencyContact.email,
                address: dto.emergencyContact.address,
              },
            });
          }

          return tx.driver.findUniqueOrThrow({
            where: { id: created.id },
            include: DRIVER_INCLUDE,
          });
        });
        break;
      } catch (err) {
        const isCodeConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isCodeConflict) throw err;
        if (!isAutoCode || attempt >= 2) {
          throw new ConflictException("A driver with this employeeCode already exists in this organization");
        }
        employeeCode = await generateUniqueDriverCode(this.prisma, organizationId);
      }
    }

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.create",
      entityType: "Driver",
      entityId: driver!.id,
      metadata: { employeeCode: driver!.employeeCode },
    });

    void this.workflowEvents.emit(organizationId, "driver.created", { id: driver!.id, employeeCode: driver!.employeeCode, firstName: driver!.firstName, lastName: driver!.lastName });

    return this.toResponse(driver!);
  }

  async update(organizationId: string, id: string, dto: UpdateDriverDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);

    if (existing.archivedAt) {
      throw new ConflictException("This driver is archived — restore it first to make changes");
    }

    if (dto.employeeCode && dto.employeeCode !== existing.employeeCode) {
      await this.assertCodeAvailable(organizationId, dto.employeeCode);
    }

    let updated: DriverWithRelations;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const d = await tx.driver.update({
          where: { id },
          data: {
            employeeCode: dto.employeeCode,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            email: dto.email,
            status: dto.status,
            profilePhotoUrl: dto.profilePhotoUrl,
            licenseNumber: dto.licenseNumber,
            licenseClass: dto.licenseClass,
            licenseIssueDate: dto.licenseIssueDate ? new Date(dto.licenseIssueDate) : undefined,
            licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined,
            licenseEndorsements: dto.licenseEndorsements,
            employmentType: dto.employmentType,
            hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
            department: dto.department,
            baseLocation: dto.baseLocation,
            workShift: dto.workShift,
            preferredRegions: dto.preferredRegions,
            availableDays: dto.availableDays !== undefined ? (dto.availableDays as Prisma.InputJsonValue) : undefined,
            driverNotes: dto.driverNotes,
            internalNotes: dto.internalNotes,
          },
          include: DRIVER_INCLUDE,
        });

        if (dto.emergencyContact) {
          await tx.driverEmergencyContact.upsert({
            where: { driverId: id },
            create: {
              driverId: id,
              organizationId,
              name: dto.emergencyContact.name,
              relationship: dto.emergencyContact.relationship,
              phone: dto.emergencyContact.phone,
              alternatePhone: dto.emergencyContact.alternatePhone,
              email: dto.emergencyContact.email,
              address: dto.emergencyContact.address,
            },
            update: {
              name: dto.emergencyContact.name,
              relationship: dto.emergencyContact.relationship,
              phone: dto.emergencyContact.phone,
              alternatePhone: dto.emergencyContact.alternatePhone,
              email: dto.emergencyContact.email,
              address: dto.emergencyContact.address,
            },
          });

          return tx.driver.findUniqueOrThrow({
            where: { id },
            include: DRIVER_INCLUDE,
          });
        }

        return d;
      });
    } catch (err) {
      this.rethrowCodeConflict(err);
      throw err;
    }

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.update",
      entityType: "Driver",
      entityId: id,
      metadata: { changes: dto },
    });

    return this.toResponse(updated);
  }

  /// Attaches a DRIVER-role login to this fleet profile so `/dispatches/my`
  /// and the driver mobile app resolve. Day-one onboarding path.
  async linkUser(organizationId: string, id: string, userId: string, actor: CurrentUserPayload) {
    const driver = await this.findOrThrow(organizationId, id);
    if (driver.archivedAt) {
      throw new ConflictException("This driver is archived — restore it before linking a login");
    }
    if (driver.userId && driver.userId !== userId) {
      throw new ConflictException("This driver already has a login linked — unlink it first");
    }
    if (driver.userId === userId) {
      return this.toResponse(driver as DriverWithRelations);
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        userId,
        status: "ACTIVE",
        role: "DRIVER",
      },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException(
        "User must be an active DRIVER-role member of this organization. Invite them with the Driver role first.",
      );
    }

    const taken = await this.prisma.driver.findFirst({
      where: { organizationId, userId, id: { not: id }, archivedAt: null },
      select: { id: true, employeeCode: true },
    });
    if (taken) {
      throw new ConflictException(
        `That login is already linked to driver ${taken.employeeCode}`,
      );
    }

    const updated = await this.prisma.driver.update({
      where: { id },
      data: { userId },
      include: DRIVER_INCLUDE,
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.link_user",
      entityType: "Driver",
      entityId: id,
      metadata: { userId },
    });

    return this.toResponse(updated);
  }

  async unlinkUser(organizationId: string, id: string, actor: CurrentUserPayload) {
    const driver = await this.findOrThrow(organizationId, id);
    if (!driver.userId) {
      return this.toResponse(driver as DriverWithRelations);
    }

    const liveDispatches = await this.prisma.dispatch.count({
      where: {
        organizationId,
        driverId: id,
        status: { in: [...LIVE_DISPATCH_STATUSES] },
      },
    });
    if (liveDispatches > 0) {
      throw new ConflictException(
        "Cannot unlink while this driver has live dispatches — finish or reassign them first",
      );
    }

    const updated = await this.prisma.driver.update({
      where: { id },
      data: { userId: null },
      include: DRIVER_INCLUDE,
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.unlink_user",
      entityType: "Driver",
      entityId: id,
      metadata: { previousUserId: driver.userId },
    });

    return this.toResponse(updated);
  }

  async archive(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) {
      throw new ConflictException("Driver is already archived");
    }

    const liveDispatches = await this.prisma.dispatch.count({
      where: {
        organizationId,
        driverId: id,
        status: { in: [...LIVE_DISPATCH_STATUSES] },
      },
    });
    if (liveDispatches > 0) {
      throw new ConflictException(
        `Cannot archive — this driver has ${liveDispatches} live dispatch${liveDispatches === 1 ? "" : "es"}. Reassign or cancel them first.`,
      );
    }

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: DRIVER_INCLUDE,
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.archive",
      entityType: "Driver",
      entityId: id,
    });

    return this.toResponse(driver);
  }

  async restore(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (!existing.archivedAt) {
      throw new ConflictException("Driver is not archived");
    }

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { archivedAt: null },
      include: DRIVER_INCLUDE,
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.restore",
      entityType: "Driver",
      entityId: id,
    });

    return this.toResponse(driver);
  }

  async uploadPhoto(organizationId: string, id: string, file: Express.Multer.File, actor: CurrentUserPayload) {
    if (!ALLOWED_PHOTO_MIME.has(file.mimetype)) {
      throw new BadRequestException("Only JPEG, PNG, or WebP images are allowed");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException("Photo must be 2 MB or smaller");
    }
    if (!matchesDeclaredMimeType(file.buffer, file.mimetype)) {
      throw new BadRequestException("File content does not match its declared type");
    }

    const driver = await this.findOrThrow(organizationId, id);

    const ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
    const dir = join(PHOTO_UPLOAD_ROOT, organizationId, id);
    mkdirSync(dir, { recursive: true });
    const fileName = `${randomUUID()}${ext}`;
    const absolutePath = join(dir, fileName);

    if (driver.profilePhotoUrl) {
      const dir = join(PHOTO_UPLOAD_ROOT, organizationId, id);
      if (existsSync(dir)) {
        try {
          const { readdirSync } = await import("fs");
          for (const f of readdirSync(dir)) {
            try { unlinkSync(join(dir, f)); } catch { /* best effort */ }
          }
        } catch { /* best effort */ }
      }
    }

    await writeFile(absolutePath, file.buffer);

    const serveUrl = `/api/drivers/${id}/photo/file`;
    const updated = await this.prisma.driver.update({
      where: { id },
      data: { profilePhotoUrl: serveUrl },
      include: DRIVER_INCLUDE,
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.photo_upload",
      entityType: "Driver",
      entityId: id,
      metadata: { fileName },
    });

    return this.toResponse(updated);
  }

  async removePhoto(organizationId: string, id: string, actor: CurrentUserPayload) {
    const driver = await this.findOrThrow(organizationId, id);
    if (!driver.profilePhotoUrl) {
      return this.toResponse(driver as DriverWithRelations);
    }

    const dir = join(PHOTO_UPLOAD_ROOT, organizationId, id);
    if (existsSync(dir)) {
      const { readdirSync } = await import("fs");
      for (const f of readdirSync(dir)) {
        try { unlinkSync(join(dir, f)); } catch { /* best effort */ }
      }
    }

    const updated = await this.prisma.driver.update({
      where: { id },
      data: { profilePhotoUrl: null },
      include: DRIVER_INCLUDE,
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "driver.photo_remove",
      entityType: "Driver",
      entityId: id,
    });

    return this.toResponse(updated);
  }

  async servePhoto(organizationId: string, id: string): Promise<{ mimeType: string; stream: ReturnType<typeof createReadStream> }> {
    await this.findOrThrow(organizationId, id);

    const dir = join(PHOTO_UPLOAD_ROOT, organizationId, id);
    if (!existsSync(dir)) {
      throw new NotFoundException("No photo found for this driver");
    }

    const { readdirSync } = await import("fs");
    const files = readdirSync(dir);
    if (files.length === 0) {
      throw new NotFoundException("No photo found for this driver");
    }

    const latestFile = files.sort().at(-1)!;
    const filePath = join(dir, latestFile);
    const ext = latestFile.split(".").at(-1)?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    return { mimeType, stream: createReadStream(filePath) };
  }

  private async resolveCodeForCreate(organizationId: string, requestedCode?: string): Promise<string> {
    if (!requestedCode) {
      return generateUniqueDriverCode(this.prisma, organizationId);
    }
    await this.assertCodeAvailable(organizationId, requestedCode);
    return requestedCode;
  }

  private async assertCodeAvailable(organizationId: string, employeeCode: string): Promise<void> {
    if (!isValidEntityCode(employeeCode)) {
      throw new BadRequestException("employeeCode may only contain letters, numbers and hyphens");
    }
    const conflict = await this.prisma.driver.findUnique({
      where: { organizationId_employeeCode: { organizationId, employeeCode } },
    });
    if (conflict) {
      throw new ConflictException("A driver with this employeeCode already exists in this organization");
    }
  }

  /// Scoped by organizationId in the query itself, so a driver id from
  /// another organization returns 404 — never leaking whether it exists
  /// elsewhere.
  private async findOrThrow(organizationId: string, id: string): Promise<Driver> {
    const driver = await this.prisma.driver.findFirst({ where: { id, organizationId } });
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    return driver;
  }

  private async findOrThrowWithRelations(organizationId: string, id: string): Promise<DriverWithRelations> {
    const driver = await this.prisma.driver.findFirst({
      where: { id, organizationId },
      include: DRIVER_INCLUDE,
    });
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    return driver;
  }

  private rethrowCodeConflict(err: unknown): void {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictException("A driver with this employeeCode already exists in this organization");
    }
  }

  private toResponse(driver: DriverWithRelations | (Driver & { emergencyContact?: DriverEmergencyContact | null; driverDocuments?: DriverDocument[] })) {
    return {
      id: driver.id,
      organizationId: driver.organizationId,
      employeeCode: driver.employeeCode,
      firstName: driver.firstName,
      lastName: driver.lastName,
      phone: driver.phone,
      email: driver.email,
      status: driver.status,
      profilePhotoUrl: driver.profilePhotoUrl,
      licenseNumber: driver.licenseNumber,
      licenseClass: driver.licenseClass,
      licenseIssueDate: driver.licenseIssueDate,
      licenseExpiry: driver.licenseExpiry,
      licenseEndorsements: driver.licenseEndorsements,
      employmentType: driver.employmentType,
      hireDate: driver.hireDate,
      department: driver.department,
      baseLocation: driver.baseLocation,
      workShift: driver.workShift,
      preferredRegions: driver.preferredRegions,
      availableDays: driver.availableDays,
      driverNotes: driver.driverNotes,
      internalNotes: driver.internalNotes,
      emergencyContact: "emergencyContact" in driver ? (driver.emergencyContact ?? null) : null,
      driverDocuments: "driverDocuments" in driver ? (driver.driverDocuments ?? []) : [],
      /// Present so fleet admins can see whether a login is linked; linking
      /// itself is still a seed/admin path until a dedicated endpoint ships.
      userId: driver.userId,
      archivedAt: driver.archivedAt,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    };
  }
}
