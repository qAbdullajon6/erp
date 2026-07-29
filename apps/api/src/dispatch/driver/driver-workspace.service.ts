import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { DriverRejectReason, Prisma } from "@prisma/client";
import { createReadStream } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { generateUniqueExpenseNumber } from "../../expenses/expense-number.util";
import { PrismaService } from "../../prisma/prisma.service";
import { DriverActionEventsService } from "./driver-action-events.service";
import type {
  CreateDriverExpenseDto,
  CreateDriverFuelDto,
  CreateVehicleInspectionDto,
  UpdateOperationalStatusDto,
  UpdatePodMetaDto,
} from "./dto/driver-workspace.dto";

const UPLOAD_ROOT = join(process.cwd(), "uploads", "driver-proofs");
const EXPENSE_UPLOAD_ROOT = join(process.cwd(), "uploads", "expenses");
const INSPECTION_UPLOAD_ROOT = join(process.cwd(), "uploads", "inspections");

const RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RECEIPT_BYTES = 8_000_000;
const MAX_PHOTO_BYTES = 8_000_000;

type InspectionPhotoMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  createdAt: string;
};

@Injectable()
export class DriverWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DriverActionEventsService,
    private readonly audit: AuditService,
  ) {}

  async getMe(organizationId: string, userId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const openBreak = await this.prisma.driverBreak.findFirst({
      where: { organizationId, driverId: driver.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    const settings = await this.getOrCreateSettings(organizationId);
    return {
      ...this.toDriver(driver),
      onBreak: Boolean(openBreak),
      openBreak: openBreak
        ? { id: openBreak.id, startedAt: openBreak.startedAt.toISOString() }
        : null,
      podChecklist: {
        requirePhotos: settings.requirePhotos,
        requireSignature: settings.requireSignature,
        requireReceiverName: settings.requireReceiverName,
        requireReceiverPhone: settings.requireReceiverPhone,
        requireNotes: settings.requireNotes,
      },
    };
  }

  async listMyNotifications(organizationId: string, userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: {
        organizationId,
        isArchived: false,
        type: { startsWith: "DRIVER_" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const filtered = rows.filter((n) => {
      const meta = (n.metadata ?? {}) as { forDriverUserId?: string };
      // Assignment notices are driver-targeted; accept/reject are org-wide staff notices.
      if (n.type === "DRIVER_NEW_ASSIGNMENT") return meta.forDriverUserId === userId;
      return false;
    });
    return {
      items: filtered.map((n) => ({
        id: n.id,
        type: n.type,
        category: n.category,
        severity: n.severity,
        title: n.title,
        message: n.message,
        entityType: n.entityType,
        entityId: n.entityId,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
        metadata: n.metadata,
      })),
    };
  }

  async markNotificationRead(organizationId: string, userId: string, id: string) {
    const items = (await this.listMyNotifications(organizationId, userId)).items;
    const found = items.find((n) => n.id === id);
    if (!found) throw new NotFoundException("Notification not found");
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return {
      id: updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt?.toISOString() ?? null,
    };
  }

  async updateOperationalStatus(
    organizationId: string,
    userId: string,
    dto: UpdateOperationalStatusDto,
  ) {
    const driver = await this.resolveDriver(organizationId, userId);
    const updated = await this.prisma.driver.update({
      where: { id: driver.id },
      data: { operationalStatus: dto.status },
    });
    await this.events.record(organizationId, driver.id, "OPERATIONAL_STATUS_CHANGED", {
      payload: { status: dto.status },
    });
    return this.toDriver(updated);
  }

  async startBreak(organizationId: string, userId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const open = await this.prisma.driverBreak.findFirst({
      where: { organizationId, driverId: driver.id, endedAt: null },
    });
    if (open) throw new ConflictException("A break is already in progress");

    const row = await this.prisma.$transaction(async (tx) => {
      const brk = await tx.driverBreak.create({
        data: { organizationId, driverId: driver.id },
      });
      await tx.driver.update({
        where: { id: driver.id },
        data: { operationalStatus: "BREAK" },
      });
      return brk;
    });

    await this.events.record(organizationId, driver.id, "BREAK_STARTED", {
      payload: { breakId: row.id },
    });
    return { id: row.id, startedAt: row.startedAt.toISOString() };
  }

  async endBreak(organizationId: string, userId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const open = await this.prisma.driverBreak.findFirst({
      where: { organizationId, driverId: driver.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!open) throw new BadRequestException("No open break to end");

    const ended = await this.prisma.$transaction(async (tx) => {
      const brk = await tx.driverBreak.update({
        where: { id: open.id },
        data: { endedAt: new Date() },
      });
      await tx.driver.update({
        where: { id: driver.id },
        data: { operationalStatus: "AVAILABLE" },
      });
      return brk;
    });

    await this.events.record(organizationId, driver.id, "BREAK_ENDED", {
      payload: { breakId: ended.id },
    });
    return {
      id: ended.id,
      startedAt: ended.startedAt.toISOString(),
      endedAt: ended.endedAt!.toISOString(),
    };
  }

  async listMyExpenses(organizationId: string, userId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const rows = await this.prisma.expense.findMany({
      where: { organizationId, driverId: driver.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((e) => this.toExpense(e));
  }

  async createExpense(
    organizationId: string,
    userId: string,
    dto: CreateDriverExpenseDto,
    actor: CurrentUserPayload,
  ) {
    const driver = await this.resolveDriver(organizationId, userId);
    const expenseNumber = await generateUniqueExpenseNumber(this.prisma, organizationId);
    const expense = await this.prisma.expense.create({
      data: {
        organizationId,
        expenseNumber,
        category: dto.category,
        description: dto.description,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? "USD",
        notes: dto.notes,
        orderId: dto.orderId,
        vehicleId: dto.vehicleId ?? undefined,
        driverId: driver.id,
        odometerKm: dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : undefined,
        status: "PENDING",
      },
    });
    await this.events.record(organizationId, driver.id, "EXPENSE_SUBMITTED", {
      dispatchId: dto.dispatchId,
      payload: { expenseId: expense.id, category: dto.category },
    });
    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "expense.driver_submitted",
      entityType: "Expense",
      entityId: expense.id,
      metadata: { category: dto.category, amount: dto.amount },
    });
    return this.toExpense(expense);
  }

  async createFuel(
    organizationId: string,
    userId: string,
    dto: CreateDriverFuelDto,
    actor: CurrentUserPayload,
  ) {
    const noteParts = [
      dto.station ? `Station: ${dto.station}` : null,
      `Liters: ${dto.liters}`,
      dto.notes ?? null,
    ].filter(Boolean);
    return this.createExpense(
      organizationId,
      userId,
      {
        category: "FUEL",
        description: dto.station ? `Fuel — ${dto.station}` : "Fuel",
        amount: dto.amount,
        currency: dto.currency,
        notes: noteParts.join(" | "),
        vehicleId: dto.vehicleId,
        dispatchId: dto.dispatchId,
        odometerKm: dto.odometerKm,
      },
      actor,
    ).then(async (created) => {
      const driver = await this.resolveDriver(organizationId, userId);
      await this.events.record(organizationId, driver.id, "FUEL_ADDED", {
        dispatchId: dto.dispatchId,
        payload: { expenseId: created.id, liters: dto.liters, odometerKm: dto.odometerKm },
      });
      return created;
    });
  }

  async uploadExpenseReceipt(
    organizationId: string,
    userId: string,
    expenseId: string,
    file: Express.Multer.File,
  ) {
    const expense = await this.assertOwnExpense(organizationId, userId, expenseId);
    this.assertReceiptFile(file);

    if (expense.receiptPath) {
      await unlink(join(EXPENSE_UPLOAD_ROOT, expense.receiptPath)).catch(() => undefined);
    }

    const storageName = `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = join(organizationId, expenseId, storageName);
    await mkdir(join(EXPENSE_UPLOAD_ROOT, organizationId, expenseId), { recursive: true });
    await writeFile(join(EXPENSE_UPLOAD_ROOT, storagePath), file.buffer);

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptPath: storagePath },
    });
    return this.toExpense(updated);
  }

  async deleteExpenseReceipt(organizationId: string, userId: string, expenseId: string) {
    const expense = await this.assertOwnExpense(organizationId, userId, expenseId);
    if (!expense.receiptPath) return this.toExpense(expense);
    await unlink(join(EXPENSE_UPLOAD_ROOT, expense.receiptPath)).catch(() => undefined);
    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptPath: null },
    });
    return this.toExpense(updated);
  }

  async getExpenseReceiptFile(
    organizationId: string,
    userId: string,
    expenseId: string,
  ): Promise<{ file: StreamableFile; mimeType: string; fileName: string }> {
    const expense = await this.assertOwnExpense(organizationId, userId, expenseId);
    if (!expense.receiptPath) throw new NotFoundException("No receipt uploaded");
    const absolute = join(EXPENSE_UPLOAD_ROOT, expense.receiptPath);
    const fileName = expense.receiptPath.split("/").pop() ?? "receipt";
    const lower = fileName.toLowerCase();
    const mimeType = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    return {
      file: new StreamableFile(createReadStream(absolute)),
      mimeType,
      fileName,
    };
  }

  async listMyInspections(organizationId: string, userId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const rows = await this.prisma.vehicleInspection.findMany({
      where: { organizationId, driverId: driver.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { vehicle: { select: { id: true, vehicleCode: true, plateNumber: true } } },
    });
    return rows.map((r) => this.toInspection(r));
  }

  async getMyInspection(organizationId: string, userId: string, id: string) {
    const row = await this.assertOwnInspection(organizationId, userId, id);
    return this.toInspection(row);
  }

  async createInspection(
    organizationId: string,
    userId: string,
    dto: CreateVehicleInspectionDto,
  ) {
    const driver = await this.resolveDriver(organizationId, userId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId, archivedAt: null },
    });
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    const row = await this.prisma.vehicleInspection.create({
      data: {
        organizationId,
        driverId: driver.id,
        vehicleId: dto.vehicleId,
        dispatchId: dto.dispatchId,
        checklist: {
          tyres: dto.tyres,
          lights: dto.lights,
          brakes: dto.brakes,
          oil: dto.oil,
          coolant: dto.coolant,
          documents: dto.documents,
        },
        photos: [],
        notes: dto.notes,
        odometerKm: dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : undefined,
      },
      include: { vehicle: { select: { id: true, vehicleCode: true, plateNumber: true } } },
    });

    await this.events.record(organizationId, driver.id, "INSPECTION_COMPLETED", {
      dispatchId: dto.dispatchId,
      payload: { inspectionId: row.id, vehicleId: dto.vehicleId },
    });

    return this.toInspection(row);
  }

  async uploadInspectionPhoto(
    organizationId: string,
    userId: string,
    inspectionId: string,
    file: Express.Multer.File,
  ) {
    const inspection = await this.assertOwnInspection(organizationId, userId, inspectionId);
    this.assertPhotoFile(file);

    const photoId = randomUUID();
    const storageName = `${photoId}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = join(organizationId, inspectionId, storageName);
    await mkdir(join(INSPECTION_UPLOAD_ROOT, organizationId, inspectionId), { recursive: true });
    await writeFile(join(INSPECTION_UPLOAD_ROOT, storagePath), file.buffer);

    const photos = this.parsePhotos(inspection.photos);
    photos.push({
      id: photoId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    const updated = await this.prisma.vehicleInspection.update({
      where: { id: inspectionId },
      data: { photos },
      include: { vehicle: { select: { id: true, vehicleCode: true, plateNumber: true } } },
    });
    return this.toInspection(updated);
  }

  async getInspectionPhotoFile(
    organizationId: string,
    userId: string,
    inspectionId: string,
    photoId: string,
  ): Promise<{ file: StreamableFile; mimeType: string; fileName: string }> {
    const inspection = await this.assertOwnInspection(organizationId, userId, inspectionId);
    const photo = this.parsePhotos(inspection.photos).find((p) => p.id === photoId);
    if (!photo) throw new NotFoundException("Photo not found");
    return {
      file: new StreamableFile(createReadStream(join(INSPECTION_UPLOAD_ROOT, photo.storagePath))),
      mimeType: photo.mimeType,
      fileName: photo.fileName,
    };
  }

  async listProofs(organizationId: string, userId: string, dispatchId: string) {
    await this.assertOwnDispatch(organizationId, userId, dispatchId);
    const items = await this.prisma.dispatchDeliveryProof.findMany({
      where: { organizationId, dispatchId },
      orderBy: { createdAt: "desc" },
    });
    return { items: items.map((p) => this.toProof(p)) };
  }

  async uploadProof(
    organizationId: string,
    userId: string,
    dispatchId: string,
    type: "PHOTO" | "SIGNATURE",
    file: Express.Multer.File,
    meta?: UpdatePodMetaDto,
  ) {
    const { driver, dispatch } = await this.assertOwnDispatch(organizationId, userId, dispatchId);
    if (!file?.buffer?.length) throw new BadRequestException("File is required");

    const storageName = `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = join(organizationId, dispatchId, storageName);
    const absolutePath = join(UPLOAD_ROOT, storagePath);
    await mkdir(join(UPLOAD_ROOT, organizationId, dispatchId), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const proof = await this.prisma.dispatchDeliveryProof.create({
      data: {
        organizationId,
        dispatchId,
        orderId: dispatch.orderId,
        uploadedByUserId: userId,
        driverId: driver.id,
        type,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        storagePath,
        receiverName: meta?.receiverName,
        receiverPhone: meta?.receiverPhone,
        notes: meta?.notes,
        odometerKm: meta?.odometerKm != null ? new Prisma.Decimal(meta.odometerKm) : undefined,
      },
    });

    await this.events.record(organizationId, driver.id, "POD_UPLOADED", {
      dispatchId,
      payload: { proofId: proof.id, type },
    });

    return this.toProof(proof);
  }

  async updatePodMeta(
    organizationId: string,
    userId: string,
    dispatchId: string,
    dto: UpdatePodMetaDto,
  ) {
    await this.assertOwnDispatch(organizationId, userId, dispatchId);
    const latest = await this.prisma.dispatchDeliveryProof.findFirst({
      where: { organizationId, dispatchId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      const proof = await this.prisma.dispatchDeliveryProof.create({
        data: {
          organizationId,
          dispatchId,
          uploadedByUserId: userId,
          type: "PHOTO",
          fileName: "pod-meta.json",
          mimeType: "application/json",
          fileSizeBytes: 0,
          storagePath: join(organizationId, dispatchId, "pod-meta.json"),
          receiverName: dto.receiverName,
          receiverPhone: dto.receiverPhone,
          notes: dto.notes,
          odometerKm: dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : undefined,
          metadata: { metaOnly: true },
        },
      });
      return this.toProof(proof);
    }
    const updated = await this.prisma.dispatchDeliveryProof.update({
      where: { id: latest.id },
      data: {
        receiverName: dto.receiverName ?? latest.receiverName,
        receiverPhone: dto.receiverPhone ?? latest.receiverPhone,
        notes: dto.notes ?? latest.notes,
        odometerKm:
          dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : latest.odometerKm,
      },
    });
    return this.toProof(updated);
  }

  async getOrCreateSettings(organizationId: string) {
    const existing = await this.prisma.organizationDriverSettings.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;
    return this.prisma.organizationDriverSettings.create({
      data: { organizationId },
    });
  }

  async assertDeliveredChecklist(organizationId: string, dispatchId: string) {
    const settings = await this.getOrCreateSettings(organizationId);
    const proofs = await this.prisma.dispatchDeliveryProof.findMany({
      where: { organizationId, dispatchId },
    });
    const photos = proofs.filter(
      (p) => p.type === "PHOTO" && !(p.metadata as { metaOnly?: boolean } | null)?.metaOnly,
    );
    const signatures = proofs.filter((p) => p.type === "SIGNATURE");
    const withReceiver = proofs.find((p) => p.receiverName);
    const withPhone = proofs.find((p) => p.receiverPhone);
    const withNotes = proofs.find((p) => p.notes);

    const missing: string[] = [];
    if (settings.requirePhotos && photos.length === 0) missing.push("photos");
    if (settings.requireSignature && signatures.length === 0) missing.push("signature");
    if (settings.requireReceiverName && !withReceiver?.receiverName) missing.push("receiverName");
    if (settings.requireReceiverPhone && !withPhone?.receiverPhone) missing.push("receiverPhone");
    if (settings.requireNotes && !withNotes?.notes) missing.push("notes");

    if (missing.length > 0) {
      throw new BadRequestException(
        `Delivery checklist incomplete. Required: ${missing.join(", ")}`,
      );
    }
  }

  private assertReceiptFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (!RECEIPT_MIME.has(file.mimetype)) {
      throw new BadRequestException("Receipt must be JPEG, PNG, WebP, or PDF");
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new BadRequestException("Receipt must be 8MB or smaller");
    }
  }

  private assertPhotoFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (!PHOTO_MIME.has(file.mimetype)) {
      throw new BadRequestException("Photo must be JPEG, PNG, or WebP");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException("Photo must be 8MB or smaller");
    }
  }

  private async resolveDriver(organizationId: string, userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
    });
    if (!driver) throw new NotFoundException("No driver profile is linked to your account yet");
    return driver;
  }

  private async assertOwnDispatch(organizationId: string, userId: string, dispatchId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: dispatchId, organizationId, driverId: driver.id, status: { not: "DRAFT" } },
    });
    if (!dispatch) throw new NotFoundException("Dispatch not found");
    return { driver, dispatch };
  }

  private async assertOwnExpense(organizationId: string, userId: string, expenseId: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, organizationId, driverId: driver.id },
    });
    if (!expense) throw new NotFoundException("Expense not found");
    return expense;
  }

  private async assertOwnInspection(organizationId: string, userId: string, id: string) {
    const driver = await this.resolveDriver(organizationId, userId);
    const row = await this.prisma.vehicleInspection.findFirst({
      where: { id, organizationId, driverId: driver.id },
      include: { vehicle: { select: { id: true, vehicleCode: true, plateNumber: true } } },
    });
    if (!row) throw new NotFoundException("Inspection not found");
    return row;
  }

  private parsePhotos(raw: Prisma.JsonValue | null | undefined): InspectionPhotoMeta[] {
    if (!raw || !Array.isArray(raw)) return [];
    return raw as InspectionPhotoMeta[];
  }

  private toExpense(e: {
    id: string;
    expenseNumber: string;
    category: string;
    description: string;
    amount: Prisma.Decimal;
    currency: string;
    status: string;
    notes: string | null;
    receiptPath: string | null;
    odometerKm: Prisma.Decimal | null;
    expenseDate: Date;
    createdAt: Date;
  }) {
    return {
      id: e.id,
      expenseNumber: e.expenseNumber,
      category: e.category,
      description: e.description,
      amount: e.amount.toString(),
      currency: e.currency,
      status: e.status,
      notes: e.notes,
      hasReceipt: Boolean(e.receiptPath),
      receiptPath: e.receiptPath,
      odometerKm: e.odometerKm?.toString() ?? null,
      expenseDate: e.expenseDate.toISOString(),
      createdAt: e.createdAt.toISOString(),
    };
  }

  private toInspection(row: {
    id: string;
    vehicleId: string;
    dispatchId: string | null;
    checklist: Prisma.JsonValue;
    photos: Prisma.JsonValue | null;
    notes: string | null;
    odometerKm: Prisma.Decimal | null;
    createdAt: Date;
    vehicle?: { id: string; vehicleCode: string; plateNumber: string };
  }) {
    const photos = this.parsePhotos(row.photos);
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      dispatchId: row.dispatchId,
      checklist: row.checklist,
      notes: row.notes,
      odometerKm: row.odometerKm?.toString() ?? null,
      photos: photos.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        mimeType: p.mimeType,
        fileSize: p.fileSize,
        createdAt: p.createdAt,
      })),
      vehicle: row.vehicle
        ? {
            id: row.vehicle.id,
            vehicleCode: row.vehicle.vehicleCode,
            plateNumber: row.vehicle.plateNumber,
          }
        : undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDriver(driver: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    status: string;
    operationalStatus: string;
    licenseNumber: string | null;
    licenseExpiry: Date | null;
  }) {
    return {
      id: driver.id,
      employeeCode: driver.employeeCode,
      firstName: driver.firstName,
      lastName: driver.lastName,
      phone: driver.phone,
      email: driver.email,
      status: driver.status,
      operationalStatus: driver.operationalStatus,
      licenseNumber: driver.licenseNumber,
      licenseExpiry: driver.licenseExpiry?.toISOString() ?? null,
    };
  }

  private toProof(p: {
    id: string;
    dispatchId: string;
    orderId: string | null;
    type: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number | null;
    storagePath: string;
    receiverName: string | null;
    receiverPhone: string | null;
    notes: string | null;
    odometerKm: Prisma.Decimal | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      dispatchId: p.dispatchId,
      orderId: p.orderId,
      type: p.type,
      fileName: p.fileName,
      mimeType: p.mimeType,
      fileSize: p.fileSizeBytes ?? 0,
      storageKey: p.storagePath,
      receiverName: p.receiverName,
      receiverPhone: p.receiverPhone,
      notes: p.notes,
      odometerKm: p.odometerKm?.toString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}

export { DriverRejectReason };
