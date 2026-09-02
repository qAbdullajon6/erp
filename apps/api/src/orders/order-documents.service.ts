import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OrderDocumentKind, UsageMetricType } from "@prisma/client";
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsageMeteringService, BYTES_PER_GB } from "../billing/usage-metering.service";
import { assertOrderExists } from "./order-exists.util";
import { matchesDeclaredMimeType } from "./order-document-signature.util";

const UPLOAD_ROOT = join(process.cwd(), "uploads", "orders");
/// Single source of truth for the upload size cap — orders.controller.ts's
/// Multer interceptor limit imports this too, so the two enforcement points
/// (interceptor + this service's own check) cannot silently diverge.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

@Injectable()
export class OrderDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly usageMetering: UsageMeteringService,
  ) {}

  async list(organizationId: string, orderId: string) {
    await assertOrderExists(this.prisma, organizationId, orderId);
    const rows = await this.prisma.orderDocument.findMany({
      where: { organizationId, orderId },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return { items: rows.map((row) => this.toResponse(row)) };
  }

  async upload(
    organizationId: string,
    orderId: string,
    file: Express.Multer.File,
    kind: OrderDocumentKind | undefined,
    actor: CurrentUserPayload,
  ) {
    await assertOrderExists(this.prisma, organizationId, orderId);
    if (!file?.buffer?.length) {
      throw new BadRequestException("No file uploaded");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException(`File exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB limit`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
    // The mimetype above is the client-supplied Content-Type — spoofable.
    // Verify the bytes actually match before writing anything to disk.
    if (!matchesDeclaredMimeType(file.buffer, file.mimetype)) {
      throw new BadRequestException("File content does not match its declared type");
    }

    const resolvedKind = kind ?? OrderDocumentKind.ATTACHMENT;
    if (resolvedKind === OrderDocumentKind.POD) {
      const existingPod = await this.prisma.orderDocument.findFirst({
        where: { organizationId, orderId, kind: OrderDocumentKind.POD },
      });
      if (existingPod) {
        throw new BadRequestException("A POD document already exists — delete it before uploading a new one");
      }
    }

    await this.usageMetering.enforceLimit(
      organizationId,
      UsageMetricType.STORAGE_GB,
      file.size / BYTES_PER_GB,
    );

    mkdirSync(join(UPLOAD_ROOT, organizationId, orderId), { recursive: true });
    const storageName = `${randomUUID()}-${file.originalname.replace(/[^\w.\-()+ ]/g, "_")}`;
    const storagePath = join(organizationId, orderId, storageName);
    const absolutePath = join(UPLOAD_ROOT, storagePath);
    writeFileSync(absolutePath, file.buffer);

    const doc = await this.prisma.orderDocument.create({
      data: {
        organizationId,
        orderId,
        kind: resolvedKind,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        storagePath,
        uploadedByUserId: actor.userId,
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.document.upload",
      entityType: "Order",
      entityId: orderId,
      metadata: { documentId: doc.id, kind: doc.kind, fileName: doc.fileName },
    });

    return this.toResponse(doc);
  }

  async rename(
    organizationId: string,
    orderId: string,
    documentId: string,
    fileName: string,
    actor: CurrentUserPayload,
  ) {
    const doc = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, organizationId, orderId },
    });
    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    const trimmed = fileName.trim();
    if (!trimmed) {
      throw new BadRequestException("File name is required");
    }

    const updated = await this.prisma.orderDocument.update({
      where: { id: documentId },
      data: { fileName: trimmed },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.document.rename",
      entityType: "Order",
      entityId: orderId,
      metadata: {
        documentId,
        from: doc.fileName,
        to: trimmed,
      },
    });

    return this.toResponse(updated);
  }

  async delete(organizationId: string, orderId: string, documentId: string, actor: CurrentUserPayload) {
    const doc = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, organizationId, orderId },
    });
    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    const absolutePath = join(UPLOAD_ROOT, doc.storagePath);
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }

    await this.prisma.orderDocument.delete({ where: { id: documentId } });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.document.delete",
      entityType: "Order",
      entityId: orderId,
      metadata: { documentId, fileName: doc.fileName },
    });
  }

  async openFile(organizationId: string, orderId: string, documentId: string) {
    const doc = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, organizationId, orderId },
    });
    if (!doc) {
      throw new NotFoundException("Document not found");
    }
    const absolutePath = join(UPLOAD_ROOT, doc.storagePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException("File not found on disk");
    }
    return { doc, stream: createReadStream(absolutePath) };
  }

  private toResponse(
    row: {
      id: string;
      organizationId: string;
      orderId: string;
      kind: OrderDocumentKind;
      fileName: string;
      mimeType: string;
      fileSizeBytes: number | null;
      storagePath: string;
      uploadedByUserId: string | null;
      createdAt: Date;
      uploadedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
    },
  ) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      orderId: row.orderId,
      kind: row.kind,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      uploadedByUserId: row.uploadedByUserId,
      createdAt: row.createdAt,
      uploadedBy: row.uploadedBy ?? null,
    };
  }
}
