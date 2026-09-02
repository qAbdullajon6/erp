import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DriverDocumentType, DriverLicenseClass, Prisma } from "@prisma/client";
import { createReadStream, existsSync, mkdirSync, unlinkSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { matchesDeclaredMimeType } from "../orders/order-document-signature.util";
import { CreateDriverDocumentDto } from "./dto/create-driver-document.dto";
import { UpdateDriverDocumentDto } from "./dto/update-driver-document.dto";

const UPLOAD_ROOT = join(process.cwd(), "uploads", "driver-documents");
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type DocumentStatus =
  | "MISSING"
  | "VALID"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "NOT_REQUIRED";

/// Types shown in the document list by default (even when no row exists)
const REQUIRED_TYPES: DriverDocumentType[] = ["DRIVER_LICENSE", "PASSPORT_ID", "MEDICAL_CERTIFICATE"];
const OPTIONAL_TYPES: DriverDocumentType[] = ["ADR_CERTIFICATE", "BACKGROUND_CHECK"];
const ALL_TRACKED_TYPES = [...REQUIRED_TYPES, ...OPTIONAL_TYPES];

const ROLES_THAT_CAN_VERIFY = ["ADMIN", "OPERATIONS_MANAGER"] as const;

function computeStatus(
  doc: { storagePath: string | null; verifiedAt: Date | null; rejectedAt: Date | null; expiryDate: Date | null } | null,
  isRequired: boolean,
  expiryWarningDays: number,
): DocumentStatus {
  if (!doc) return isRequired ? "MISSING" : "NOT_REQUIRED";
  if (doc.rejectedAt) return "REJECTED";
  if (!doc.storagePath) return "PENDING_REVIEW";
  if (!doc.verifiedAt) return "PENDING_REVIEW";
  if (doc.expiryDate) {
    const now = new Date();
    if (doc.expiryDate < now) return "EXPIRED";
    const threshold = new Date(now.getTime() + expiryWarningDays * 24 * 60 * 60 * 1000);
    if (doc.expiryDate < threshold) return "EXPIRING_SOON";
  }
  return "VALID";
}

function toResponse(
  doc: Prisma.DriverDocumentGetPayload<object>,
  status: DocumentStatus,
) {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    driverId: doc.driverId,
    type: doc.type,
    status,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    fileName: doc.fileName,
    hasFile: Boolean(doc.storagePath),
    mimeType: doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    licenseClass: doc.licenseClass,
    endorsements: doc.endorsements,
    uploadedByUserId: doc.uploadedByUserId,
    verifiedAt: doc.verifiedAt,
    verifiedByUserId: doc.verifiedByUserId,
    rejectedAt: doc.rejectedAt,
    rejectedByUserId: doc.rejectedByUserId,
    rejectionReason: doc.rejectionReason,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function virtualMissing(type: DriverDocumentType, driverId: string, organizationId: string, isRequired: boolean) {
  return {
    id: null as string | null,
    organizationId,
    driverId,
    type,
    status: isRequired ? ("MISSING" as DocumentStatus) : ("NOT_REQUIRED" as DocumentStatus),
    documentNumber: null as string | null,
    issueDate: null as Date | null,
    expiryDate: null as Date | null,
    fileName: null as string | null,
    hasFile: false,
    mimeType: null as string | null,
    fileSizeBytes: null as number | null,
    licenseClass: null as DriverLicenseClass | null,
    endorsements: null as string | null,
    uploadedByUserId: null as string | null,
    verifiedAt: null as Date | null,
    verifiedByUserId: null as string | null,
    rejectedAt: null as Date | null,
    rejectedByUserId: null as string | null,
    rejectionReason: null as string | null,
    notes: null as string | null,
    createdAt: null as Date | null,
    updatedAt: null as Date | null,
  };
}

@Injectable()
export class DriverDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, driverId: string) {
    await this.assertDriverAccess(organizationId, driverId);

    const settings = await this.prisma.notificationSettings.findFirst({ where: { organizationId }, select: { expiryWarningDays: true } });
    const expiryWarningDays = settings?.expiryWarningDays ?? 30;

    const rows = await this.prisma.driverDocument.findMany({
      where: { organizationId, driverId },
      orderBy: { createdAt: "asc" },
    });

    const byType = new Map(rows.map((r) => [r.type, r]));

    const result = ALL_TRACKED_TYPES.map((type) => {
      const doc = byType.get(type) ?? null;
      const isRequired = REQUIRED_TYPES.includes(type);
      const status = computeStatus(doc, isRequired, expiryWarningDays);
      if (!doc) return virtualMissing(type, driverId, organizationId, isRequired);
      return toResponse(doc, status);
    });

    // Add any OTHER / custom type rows not in the tracked list
    for (const row of rows) {
      if (!ALL_TRACKED_TYPES.includes(row.type)) {
        const status = computeStatus(row, false, expiryWarningDays);
        result.push(toResponse(row, status));
      }
    }

    return { items: result };
  }

  async create(organizationId: string, driverId: string, dto: CreateDriverDocumentDto, actor: CurrentUserPayload) {
    await this.assertDriverAccess(organizationId, driverId);

    const existing = await this.prisma.driverDocument.findFirst({
      where: { organizationId, driverId, type: dto.type },
    });
    if (existing) {
      throw new BadRequestException(`A ${dto.type} document already exists for this driver. Use PATCH to update it.`);
    }

    const doc = await this.prisma.driverDocument.create({
      data: {
        organizationId,
        driverId,
        type: dto.type,
        documentNumber: dto.documentNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        licenseClass: dto.licenseClass,
        endorsements: dto.endorsements,
        notes: dto.notes,
      },
    });

    // For DRIVER_LICENSE, sync back to Driver flat fields
    if (dto.type === "DRIVER_LICENSE") {
      await this.syncLicenseToDriver(driverId, doc);
    }

    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.create", entityType: "DriverDocument", entityId: doc.id, metadata: { type: dto.type } });

    return toResponse(doc, "PENDING_REVIEW");
  }

  async update(organizationId: string, driverId: string, docId: string, dto: UpdateDriverDocumentDto, actor: CurrentUserPayload) {
    const doc = await this.findOrThrow(organizationId, driverId, docId);

    const updated = await this.prisma.driverDocument.update({
      where: { id: docId },
      data: {
        documentNumber: dto.documentNumber !== undefined ? dto.documentNumber : undefined,
        issueDate: dto.issueDate !== undefined ? (dto.issueDate ? new Date(dto.issueDate) : null) : undefined,
        expiryDate: dto.expiryDate !== undefined ? (dto.expiryDate ? new Date(dto.expiryDate) : null) : undefined,
        licenseClass: dto.licenseClass !== undefined ? dto.licenseClass : undefined,
        endorsements: dto.endorsements !== undefined ? dto.endorsements : undefined,
        notes: dto.notes !== undefined ? dto.notes : undefined,
        // Reset verification when metadata changes
        verifiedAt: null,
        verifiedByUserId: null,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
      },
    });

    if (doc.type === "DRIVER_LICENSE") {
      await this.syncLicenseToDriver(driverId, updated);
    }

    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.update", entityType: "DriverDocument", entityId: docId });

    const settings = await this.prisma.notificationSettings.findFirst({ where: { organizationId }, select: { expiryWarningDays: true } });
    const status = computeStatus(updated, false, settings?.expiryWarningDays ?? 30);
    return toResponse(updated, status);
  }

  async uploadFile(organizationId: string, driverId: string, docId: string, file: Express.Multer.File, actor: CurrentUserPayload) {
    const doc = await this.findOrThrow(organizationId, driverId, docId);

    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException("File type not allowed. Supported: PDF, JPEG, PNG, WebP, Word, GIF.");
    }
    if (file.size > MAX_DOC_BYTES) {
      throw new BadRequestException("File must be 10 MB or smaller.");
    }
    if (!matchesDeclaredMimeType(file.buffer, file.mimetype)) {
      throw new BadRequestException("File content does not match its declared type.");
    }

    // Remove old file if exists
    if (doc.storagePath && existsSync(doc.storagePath)) {
      try { unlinkSync(doc.storagePath); } catch { /* best effort */ }
    }

    const dir = join(UPLOAD_ROOT, organizationId, driverId);
    mkdirSync(dir, { recursive: true });
    const ext = file.originalname.includes(".") ? "." + file.originalname.split(".").pop()!.toLowerCase() : "";
    const storedName = `${randomUUID()}${ext}`;
    const storagePath = join(dir, storedName);

    await writeFile(storagePath, file.buffer);

    const updated = await this.prisma.driverDocument.update({
      where: { id: docId },
      data: {
        fileName: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedByUserId: actor.userId,
        // Reset verification when file is replaced
        verifiedAt: null,
        verifiedByUserId: null,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
      },
    });

    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.upload", entityType: "DriverDocument", entityId: docId, metadata: { fileName: file.originalname } });

    const settings = await this.prisma.notificationSettings.findFirst({ where: { organizationId }, select: { expiryWarningDays: true } });
    return toResponse(updated, computeStatus(updated, false, settings?.expiryWarningDays ?? 30));
  }

  async serveFile(organizationId: string, driverId: string, docId: string) {
    const doc = await this.findOrThrow(organizationId, driverId, docId);
    if (!doc.storagePath || !existsSync(doc.storagePath)) {
      throw new NotFoundException("No file uploaded for this document.");
    }
    return {
      mimeType: doc.mimeType ?? "application/octet-stream",
      fileName: doc.fileName ?? "document",
      stream: createReadStream(doc.storagePath),
    };
  }

  async removeFile(organizationId: string, driverId: string, docId: string, actor: CurrentUserPayload) {
    const doc = await this.findOrThrow(organizationId, driverId, docId);
    if (doc.storagePath && existsSync(doc.storagePath)) {
      try { unlinkSync(doc.storagePath); } catch { /* best effort */ }
    }
    const updated = await this.prisma.driverDocument.update({
      where: { id: docId },
      data: {
        fileName: null, storagePath: null, mimeType: null, fileSizeBytes: null,
        uploadedByUserId: null, verifiedAt: null, verifiedByUserId: null,
        rejectedAt: null, rejectedByUserId: null, rejectionReason: null,
      },
    });
    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.remove_file", entityType: "DriverDocument", entityId: docId });
    return toResponse(updated, "PENDING_REVIEW");
  }

  async verify(organizationId: string, driverId: string, docId: string, actor: CurrentUserPayload) {
    if (!ROLES_THAT_CAN_VERIFY.includes(actor.role as "ADMIN" | "OPERATIONS_MANAGER")) {
      throw new ForbiddenException("Only ADMIN or OPERATIONS_MANAGER can verify documents.");
    }
    const doc = await this.findOrThrow(organizationId, driverId, docId);
    if (!doc.storagePath) {
      throw new BadRequestException("Cannot verify a document with no file uploaded.");
    }

    const updated = await this.prisma.driverDocument.update({
      where: { id: docId },
      data: { verifiedAt: new Date(), verifiedByUserId: actor.userId, rejectedAt: null, rejectedByUserId: null, rejectionReason: null },
    });

    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.verify", entityType: "DriverDocument", entityId: docId });

    const settings = await this.prisma.notificationSettings.findFirst({ where: { organizationId }, select: { expiryWarningDays: true } });
    return toResponse(updated, computeStatus(updated, false, settings?.expiryWarningDays ?? 30));
  }

  async reject(organizationId: string, driverId: string, docId: string, reason: string, actor: CurrentUserPayload) {
    if (!ROLES_THAT_CAN_VERIFY.includes(actor.role as "ADMIN" | "OPERATIONS_MANAGER")) {
      throw new ForbiddenException("Only ADMIN or OPERATIONS_MANAGER can reject documents.");
    }
    await this.findOrThrow(organizationId, driverId, docId);

    const updated = await this.prisma.driverDocument.update({
      where: { id: docId },
      data: { rejectedAt: new Date(), rejectedByUserId: actor.userId, rejectionReason: reason, verifiedAt: null, verifiedByUserId: null },
    });

    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.reject", entityType: "DriverDocument", entityId: docId, metadata: { reason } });

    return toResponse(updated, "REJECTED");
  }

  async remove(organizationId: string, driverId: string, docId: string, actor: CurrentUserPayload) {
    const doc = await this.findOrThrow(organizationId, driverId, docId);
    if (doc.storagePath && existsSync(doc.storagePath)) {
      try { unlinkSync(doc.storagePath); } catch { /* best effort */ }
    }

    if (doc.type === "DRIVER_LICENSE") {
      await this.prisma.$transaction([
        this.prisma.driverDocument.delete({ where: { id: docId } }),
        this.prisma.driver.update({
          where: { id: driverId },
          data: {
            licenseNumber: null,
            licenseIssueDate: null,
            licenseExpiry: null,
            licenseClass: null,
            licenseEndorsements: null,
          },
        }),
      ]);
    } else {
      await this.prisma.driverDocument.delete({ where: { id: docId } });
    }

    await this.auditService.log({ organizationId, actorUserId: actor.userId, action: "driver_document.delete", entityType: "DriverDocument", entityId: docId });
  }

  private async assertDriverAccess(organizationId: string, driverId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, organizationId } });
    if (!driver) throw new NotFoundException("Driver not found.");
  }

  private async findOrThrow(organizationId: string, driverId: string, docId: string) {
    const doc = await this.prisma.driverDocument.findFirst({ where: { id: docId, driverId, organizationId } });
    if (!doc) throw new NotFoundException("Document not found.");
    return doc;
  }

  private async syncLicenseToDriver(driverId: string, doc: { documentNumber: string | null; issueDate: Date | null; expiryDate: Date | null; licenseClass: DriverLicenseClass | null; endorsements: string | null }) {
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        licenseNumber: doc.documentNumber,
        licenseIssueDate: doc.issueDate,
        licenseExpiry: doc.expiryDate,
        licenseClass: doc.licenseClass,
        licenseEndorsements: doc.endorsements,
      },
    });
  }
}
