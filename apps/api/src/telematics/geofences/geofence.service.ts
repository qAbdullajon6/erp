import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DispatchStatus, Geofence, Prisma } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import { AlertService } from "../alerts/alert.service";
import type { CreateGeofenceDto } from "../dto/create-geofence.dto";
import type { ListGeofencesQueryDto } from "../dto/list-geofences-query.dto";
import type { UpdateGeofenceDto } from "../dto/update-geofence.dto";
import { isInsideGeofence, toGeofenceShape } from "../geo/geofence.util";
import { isValidCoordinate, type LatLng } from "../geo/haversine.util";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import { TelematicsSettingsService } from "../settings/telematics-settings.service";

export interface GeofenceEvalContext {
  organizationId: string;
  vehicleId: string;
  driverId?: string | null;
  tripId?: string | null;
  previous: LatLng | null;
  current: LatLng;
  occurredAt: Date;
  /// Master switch from TelematicsSettings.geofenceAlertsEnabled.
  alertsEnabled: boolean;
  vehicleLabel: string;
}

/// Geofences: their management (CRUD) and their evaluation at ingest.
///
/// The active-geofence set for an org is read on every GPS ping, so it is
/// cached in-process for a short TTL and invalidated on any write. A boundary
/// crossing is detected by comparing membership at the previous fix with
/// membership at the current one — ENTER = inside-now-not-before, EXIT = the
/// reverse — which needs no persisted "currently inside" flag and is robust to
/// missed pings.
/// Categories used for auto-created arrival fences. Free-form string — matches
/// the existing `category` field convention ("DEPOT" | "CUSTOMER" | ...).
export const AUTO_ARRIVAL_PICKUP_CATEGORY = "AUTO_ARRIVAL_PICKUP";
export const AUTO_ARRIVAL_DELIVERY_CATEGORY = "AUTO_ARRIVAL_DELIVERY";
/// Category for intermediate (mid-route) stop fences. One fence per active stop;
/// identified precisely via linkedDispatchStopId, never by category alone.
export const AUTO_ARRIVAL_INTERMEDIATE_CATEGORY = "AUTO_ARRIVAL_STOP";

@Injectable()
export class GeofenceService {
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly logger = new Logger(GeofenceService.name);
  private readonly activeCache = new Map<string, { value: Geofence[]; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly realtime: TelematicsRealtimeService,
    private readonly alerts: AlertService,
    private readonly settings: TelematicsSettingsService,
  ) {}

  // --- CRUD ---------------------------------------------------------------

  async create(organizationId: string, dto: CreateGeofenceDto, actor: CurrentUserPayload) {
    this.validateGeometry(dto);
    await this.assertLinkedCustomerInOrganization(organizationId, dto.linkedCustomerId);
    const geofence = await this.prisma.geofence.create({
      data: {
        organizationId,
        name: dto.name,
        type: dto.type,
        active: dto.active ?? true,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusM: dto.radiusM,
        polygon: dto.polygon ? (dto.polygon as unknown as Prisma.InputJsonValue) : undefined,
        color: dto.color,
        category: dto.category,
        linkedCustomerId: dto.linkedCustomerId,
        alertOnEnter: dto.alertOnEnter ?? false,
        alertOnExit: dto.alertOnExit ?? false,
        dwellThresholdSec: dto.dwellThresholdSec,
      },
    });
    this.activeCache.delete(organizationId);
    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "geofence.create",
      entityType: "Geofence",
      entityId: geofence.id,
      metadata: { name: geofence.name, type: geofence.type },
    });
    return this.toResponse(geofence);
  }

  async update(organizationId: string, id: string, dto: UpdateGeofenceDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) {
      throw new ConflictException("This geofence is archived — restore it first to make changes");
    }
    // Validate the resulting geometry, treating the update as a patch.
    this.validateGeometry({
      type: dto.type ?? existing.type,
      centerLat: dto.centerLat ?? existing.centerLat ?? undefined,
      centerLng: dto.centerLng ?? existing.centerLng ?? undefined,
      radiusM: dto.radiusM ?? existing.radiusM ?? undefined,
      polygon: dto.polygon ?? (existing.polygon as unknown as CreateGeofenceDto["polygon"]) ?? undefined,
    });
    await this.assertLinkedCustomerInOrganization(organizationId, dto.linkedCustomerId);

    const geofence = await this.prisma.geofence.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        active: dto.active,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusM: dto.radiusM,
        polygon: dto.polygon ? (dto.polygon as unknown as Prisma.InputJsonValue) : undefined,
        color: dto.color,
        category: dto.category,
        linkedCustomerId: dto.linkedCustomerId,
        alertOnEnter: dto.alertOnEnter,
        alertOnExit: dto.alertOnExit,
        dwellThresholdSec: dto.dwellThresholdSec,
      },
    });
    this.activeCache.delete(organizationId);
    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "geofence.update",
      entityType: "Geofence",
      entityId: id,
      metadata: { changes: dto },
    });
    return this.toResponse(geofence);
  }

  async list(organizationId: string, query: ListGeofencesQueryDto) {
    const where: Prisma.GeofenceWhereInput = {
      organizationId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.geofence.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.geofence.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async getById(organizationId: string, id: string) {
    return this.toResponse(await this.findOrThrow(organizationId, id));
  }

  async archive(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) throw new ConflictException("Geofence is already archived");
    const geofence = await this.prisma.geofence.update({ where: { id }, data: { archivedAt: new Date(), active: false } });
    this.activeCache.delete(organizationId);
    await this.audit.log({ organizationId, actorUserId: actor.userId, action: "geofence.archive", entityType: "Geofence", entityId: id });
    return this.toResponse(geofence);
  }

  async restore(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (!existing.archivedAt) throw new ConflictException("Geofence is not archived");
    const geofence = await this.prisma.geofence.update({ where: { id }, data: { archivedAt: null } });
    this.activeCache.delete(organizationId);
    await this.audit.log({ organizationId, actorUserId: actor.userId, action: "geofence.restore", entityType: "Geofence", entityId: id });
    return this.toResponse(geofence);
  }

  /// `Geofence.linkedCustomerId` carries no database foreign key (see the
  /// model), so nothing below this method would notice a customer id belonging
  /// to a different tenant — the row would simply be written, planting another
  /// organization's identifier inside this one's fleet configuration and
  /// leaking it back out through the geofence read. Checked the same way
  /// ExpensesService checks its optional order/vehicle/driver links.
  private async assertLinkedCustomerInOrganization(
    organizationId: string,
    linkedCustomerId?: string,
  ): Promise<void> {
    if (!linkedCustomerId) return;
    const customer = await this.prisma.customer.findFirst({
      where: { id: linkedCustomerId, organizationId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
  }

  // --- Auto-arrival geofence lifecycle -----------------------------------

  /// Creates a short-lived CIRCLE geofence around the stop coordinate when a
  /// dispatch becomes active for that stop. Idempotent: a second call for the
  /// same dispatch/type (or same dispatch/stop for INTERMEDIATE) is a no-op
  /// when an active auto-geofence already exists.
  ///
  /// For INTERMEDIATE: `stop` must be provided with the DispatchStop id and
  /// coordinates. The fence is linked via linkedDispatchStopId so the
  /// handleAutoArrivalEnter handler can verify it targets the current active stop.
  ///
  /// Never throws — a geofence-creation failure must not abort the dispatch
  /// status transition that triggered it. Callers should use `.catch()` or
  /// `await ... .catch()` and log the error at warn level.
  async createForDispatch(
    organizationId: string,
    dispatchId: string,
    arrivalType: "PICKUP" | "DELIVERY" | "INTERMEDIATE",
    stop?: { id: string; lat: { toNumber(): number } | null; lng: { toNumber(): number } | null; stopIndex: number },
  ): Promise<void> {
    const cfg = await this.settings.getOrCreate(organizationId);
    if (!cfg.arrivalGeofenceEnabled) return;

    if (arrivalType === "INTERMEDIATE") {
      await this.createIntermediateStopFence(organizationId, dispatchId, cfg, stop);
      return;
    }

    // Load dispatch with stop coordinates and scheduled dates in one query.
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: dispatchId, organizationId },
      select: {
        dispatchNumber: true,
        pickupDateScheduled: true,
        deliveryDateScheduled: true,
        order: {
          select: {
            pickupLat: true,
            pickupLng: true,
            deliveryLat: true,
            deliveryLng: true,
          },
        },
      },
    });

    if (!dispatch) {
      this.logger.warn(`createForDispatch: dispatch ${dispatchId} not found in org ${organizationId}`);
      return;
    }

    const rawLat = arrivalType === "PICKUP" ? dispatch.order.pickupLat : dispatch.order.deliveryLat;
    const rawLng = arrivalType === "PICKUP" ? dispatch.order.pickupLng : dispatch.order.deliveryLng;

    if (rawLat == null || rawLng == null) {
      this.logger.warn(
        `createForDispatch: no ${arrivalType.toLowerCase()} coordinates for dispatch ${dispatch.dispatchNumber} — skipping`,
      );
      return;
    }

    const lat = rawLat.toNumber();
    const lng = rawLng.toNumber();

    // Reject null-island (GPS unit with no fix often reports 0,0).
    if (lat === 0 && lng === 0) {
      this.logger.warn(
        `createForDispatch: (0,0) coordinates rejected for dispatch ${dispatch.dispatchNumber} — skipping`,
      );
      return;
    }

    if (!isValidCoordinate({ latitude: lat, longitude: lng })) {
      this.logger.warn(
        `createForDispatch: invalid coordinates (${lat},${lng}) for dispatch ${dispatch.dispatchNumber} — skipping`,
      );
      return;
    }

    const category =
      arrivalType === "PICKUP" ? AUTO_ARRIVAL_PICKUP_CATEGORY : AUTO_ARRIVAL_DELIVERY_CATEGORY;

    // Idempotency: skip if an active auto-geofence already exists for this
    // dispatch/type. Protects against duplicate calls from concurrent paths.
    const existing = await this.prisma.geofence.findFirst({
      where: { organizationId, linkedDispatchId: dispatchId, category, autoCreated: true, archivedAt: null },
      select: { id: true },
    });
    if (existing) return;

    const scheduledDate =
      arrivalType === "PICKUP" ? dispatch.pickupDateScheduled : dispatch.deliveryDateScheduled;
    const expiresAt = new Date(scheduledDate.getTime() + 24 * 60 * 60 * 1000);

    const name = `Auto-arrival: ${dispatch.dispatchNumber} ${arrivalType.toLowerCase()}`;

    await this.prisma.geofence.create({
      data: {
        organizationId,
        name,
        type: "CIRCLE",
        active: true,
        centerLat: lat,
        centerLng: lng,
        radiusM: cfg.arrivalGeofenceRadiusM,
        category,
        autoCreated: true,
        linkedDispatchId: dispatchId,
        expiresAt,
        alertOnEnter: false,
        alertOnExit: false,
      },
    });

    this.activeCache.delete(organizationId);
    this.logger.log(
      `createForDispatch: created ${arrivalType.toLowerCase()} fence for ${dispatch.dispatchNumber} (r=${cfg.arrivalGeofenceRadiusM}m @ ${lat},${lng})`,
    );
  }

  /// Atomically archives the current active intermediate-stop fence and creates
  /// the next one in a single transaction, eliminating the reliability gap where
  /// the old fence is archived but the new one has not yet been created.
  ///
  /// Replaces the two-step archiveIntermediateStopForDispatch +
  /// createForNextIntermediateStop pattern for the IN_TRANSIT rotation case.
  ///
  /// Idempotent: if the next-stop fence already exists (concurrent call won the
  /// race), the create step is skipped and the method returns normally.
  ///
  /// Never throws — a geofence failure must not abort the dispatch transition.
  async rotateIntermediateStopFence(
    organizationId: string,
    dispatchId: string,
  ): Promise<void> {
    const cfg = await this.settings.getOrCreate(organizationId);
    if (!cfg.arrivalGeofenceEnabled) return;

    // Resolve the next unvisited stop before opening the transaction.
    // The idempotency check inside the transaction prevents double-creation
    // even if the stop state changes between this read and the commit.
    const nextStop = await this.prisma.dispatchStop.findFirst({
      where: { dispatchId, stopType: "INTERMEDIATE", arrivedAt: null, failedAt: null },
      orderBy: { stopIndex: "asc" },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Archive any active intermediate fence — idempotent (WHERE archivedAt=null).
        await tx.geofence.updateMany({
          where: {
            organizationId,
            linkedDispatchId: dispatchId,
            category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
            autoCreated: true,
            archivedAt: null,
          },
          data: { active: false, archivedAt: new Date() },
        });

        if (!nextStop) return; // Archive was the only work needed.

        const lat = nextStop.lat?.toNumber() ?? null;
        const lng = nextStop.lng?.toNumber() ?? null;
        if (lat == null || lng == null) {
          this.logger.warn(`rotateIntermediateStopFence: no coordinates for dispatch ${dispatchId} stop ${nextStop.id} — skipping create`);
          return;
        }
        if (lat === 0 && lng === 0) {
          this.logger.warn(`rotateIntermediateStopFence: (0,0) rejected for dispatch ${dispatchId} stop ${nextStop.id} — skipping create`);
          return;
        }
        if (!isValidCoordinate({ latitude: lat, longitude: lng })) {
          this.logger.warn(`rotateIntermediateStopFence: invalid coordinates (${lat},${lng}) for dispatch ${dispatchId} stop ${nextStop.id} — skipping create`);
          return;
        }

        // 2. Idempotency: skip if a fence already exists for this stop.
        const existing = await tx.geofence.findFirst({
          where: {
            organizationId,
            linkedDispatchId: dispatchId,
            linkedDispatchStopId: nextStop.id,
            category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
            autoCreated: true,
            archivedAt: null,
          },
          select: { id: true },
        });
        if (existing) return;

        // 3. Load dispatch for naming — inside tx for snapshot consistency.
        const dispatch = await tx.dispatch.findFirst({
          where: { id: dispatchId, organizationId },
          select: { dispatchNumber: true, deliveryDateScheduled: true },
        });
        if (!dispatch) return;

        // 4. Create the next intermediate stop fence.
        const expiresAt = new Date(dispatch.deliveryDateScheduled.getTime() + 24 * 60 * 60 * 1000);
        await tx.geofence.create({
          data: {
            organizationId,
            name: `Auto-arrival: ${dispatch.dispatchNumber} stop ${nextStop.stopIndex}`,
            type: "CIRCLE",
            active: true,
            centerLat: lat,
            centerLng: lng,
            radiusM: cfg.arrivalGeofenceRadiusM,
            category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
            autoCreated: true,
            linkedDispatchId: dispatchId,
            linkedDispatchStopId: nextStop.id,
            expiresAt,
            alertOnEnter: false,
            alertOnExit: false,
          },
        });

        this.logger.log(
          `rotateIntermediateStopFence: archived existing + created stop-${nextStop.stopIndex} fence for dispatch ${dispatchId}`,
        );
      });
    } catch (err) {
      this.logger.warn(
        `rotateIntermediateStopFence: transaction failed for dispatch ${dispatchId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Invalidate after the transaction completes (or fails). A false invalidation
    // on failure costs one extra DB read; a stale cache on success costs a missed
    // auto-arrival — so always invalidate.
    this.activeCache.delete(organizationId);
  }

  /// Creates a geofence for the current (next unvisited) INTERMEDIATE DispatchStop.
  /// Resolves the stop from the DB if `stop` is not supplied — used from
  /// handleArrivalGeofenceHook which does not carry stop data.
  ///
  /// Never throws.
  async createForNextIntermediateStop(
    organizationId: string,
    dispatchId: string,
  ): Promise<void> {
    const cfg = await this.settings.getOrCreate(organizationId);
    if (!cfg.arrivalGeofenceEnabled) return;

    const stop = await this.prisma.dispatchStop.findFirst({
      where: { dispatchId, stopType: "INTERMEDIATE", arrivedAt: null, failedAt: null },
      orderBy: { stopIndex: "asc" },
    });
    if (!stop) return;

    await this.createIntermediateStopFence(organizationId, dispatchId, cfg, stop);
  }

  private async createIntermediateStopFence(
    organizationId: string,
    dispatchId: string,
    cfg: { arrivalGeofenceEnabled: boolean; arrivalGeofenceRadiusM: number },
    stop?: { id: string; lat: { toNumber(): number } | null; lng: { toNumber(): number } | null; stopIndex: number },
  ): Promise<void> {
    if (!stop) {
      this.logger.warn(`createIntermediateStopFence: no stop provided for dispatch ${dispatchId} — skipping`);
      return;
    }

    if (stop.lat == null || stop.lng == null) {
      this.logger.warn(`createIntermediateStopFence: no coordinates for dispatch ${dispatchId} stop ${stop.id} — skipping`);
      return;
    }

    const lat = stop.lat.toNumber();
    const lng = stop.lng.toNumber();

    if (lat === 0 && lng === 0) {
      this.logger.warn(`createIntermediateStopFence: (0,0) rejected for dispatch ${dispatchId} stop ${stop.id} — skipping`);
      return;
    }

    if (!isValidCoordinate({ latitude: lat, longitude: lng })) {
      this.logger.warn(`createIntermediateStopFence: invalid coordinates (${lat},${lng}) for dispatch ${dispatchId} stop ${stop.id} — skipping`);
      return;
    }

    // Idempotency: per-stop — check by linkedDispatchStopId so each stop gets
    // exactly one fence regardless of how many times the hook fires.
    const existing = await this.prisma.geofence.findFirst({
      where: {
        organizationId,
        linkedDispatchId: dispatchId,
        linkedDispatchStopId: stop.id,
        category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
        autoCreated: true,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (existing) return;

    // Load dispatch number for naming (best-effort — if dispatch vanished, skip).
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: dispatchId, organizationId },
      select: { dispatchNumber: true, deliveryDateScheduled: true },
    });
    if (!dispatch) return;

    const expiresAt = new Date(dispatch.deliveryDateScheduled.getTime() + 24 * 60 * 60 * 1000);
    const name = `Auto-arrival: ${dispatch.dispatchNumber} stop ${stop.stopIndex}`;

    await this.prisma.geofence.create({
      data: {
        organizationId,
        name,
        type: "CIRCLE",
        active: true,
        centerLat: lat,
        centerLng: lng,
        radiusM: cfg.arrivalGeofenceRadiusM,
        category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
        autoCreated: true,
        linkedDispatchId: dispatchId,
        linkedDispatchStopId: stop.id,
        expiresAt,
        alertOnEnter: false,
        alertOnExit: false,
      },
    });

    this.activeCache.delete(organizationId);
    this.logger.log(
      `createIntermediateStopFence: created fence for ${dispatch.dispatchNumber} stop ${stop.stopIndex} (r=${cfg.arrivalGeofenceRadiusM}m @ ${lat},${lng})`,
    );
  }

  /// Archives all active auto-created geofences for a given dispatch and
  /// arrival type. Intended to be called when the dispatch moves past that
  /// stop (pickup fence archived when IN_TRANSIT begins).
  ///
  /// Never throws — same safety contract as createForDispatch.
  async archiveForDispatch(
    organizationId: string,
    dispatchId: string,
    arrivalType: "PICKUP" | "DELIVERY",
  ): Promise<void> {
    const category =
      arrivalType === "PICKUP" ? AUTO_ARRIVAL_PICKUP_CATEGORY : AUTO_ARRIVAL_DELIVERY_CATEGORY;

    const { count } = await this.prisma.geofence.updateMany({
      where: { organizationId, linkedDispatchId: dispatchId, category, autoCreated: true, archivedAt: null },
      data: { active: false, archivedAt: new Date() },
    });

    if (count > 0) {
      this.activeCache.delete(organizationId);
      this.logger.log(`archiveForDispatch: archived ${count} ${arrivalType.toLowerCase()} fence(s) for dispatch ${dispatchId}`);
    }
  }

  /// Archives any active intermediate-stop geofence for the dispatch.
  /// Because we maintain at most ONE active intermediate fence per dispatch,
  /// this precisely targets the one that was just departed without needing the
  /// stop ID in the WHERE clause.
  ///
  /// Never throws.
  async archiveIntermediateStopForDispatch(
    organizationId: string,
    dispatchId: string,
  ): Promise<void> {
    const { count } = await this.prisma.geofence.updateMany({
      where: {
        organizationId,
        linkedDispatchId: dispatchId,
        category: AUTO_ARRIVAL_INTERMEDIATE_CATEGORY,
        autoCreated: true,
        archivedAt: null,
      },
      data: { active: false, archivedAt: new Date() },
    });

    if (count > 0) {
      this.activeCache.delete(organizationId);
      this.logger.log(`archiveIntermediateStopForDispatch: archived ${count} intermediate fence(s) for dispatch ${dispatchId}`);
    }
  }

  // --- Evaluation (ingest hot path) --------------------------------------

  /// Detects and records boundary crossings for one fix. Returns the events it
  /// created so ingestion can attribute them; never throws into ingestion — a
  /// geofence-evaluation failure must not lose the position.
  async evaluate(ctx: GeofenceEvalContext): Promise<void> {
    // First fix of a spell: establish a baseline, do not fire spurious enters.
    if (!ctx.previous) return;

    const fences = await this.getActive(ctx.organizationId);
    if (fences.length === 0) return;

    for (const fence of fences) {
      const shape = toGeofenceShape(fence);
      if (!shape) continue;

      const wasInside = isInsideGeofence(ctx.previous, shape);
      const isInside = isInsideGeofence(ctx.current, shape);

      if (isInside && !wasInside) {
        await this.recordCrossing(ctx, fence, "ENTER");
      } else if (!isInside && wasInside) {
        await this.recordCrossing(ctx, fence, "EXIT");
      } else if (isInside && fence.dwellThresholdSec) {
        await this.maybeDwell(ctx, fence);
      }
    }
  }

  private async recordCrossing(
    ctx: GeofenceEvalContext,
    fence: Geofence,
    type: "ENTER" | "EXIT",
  ): Promise<void> {
    let dwellSec: number | null = null;
    if (type === "EXIT") {
      const lastEnter = await this.prisma.geofenceEvent.findFirst({
        where: { organizationId: ctx.organizationId, geofenceId: fence.id, vehicleId: ctx.vehicleId, type: "ENTER" },
        orderBy: { occurredAt: "desc" },
      });
      if (lastEnter) {
        dwellSec = Math.max(0, Math.round((ctx.occurredAt.getTime() - lastEnter.occurredAt.getTime()) / 1000));
      }
    }

    const event = await this.prisma.geofenceEvent.create({
      data: {
        organizationId: ctx.organizationId,
        geofenceId: fence.id,
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId ?? null,
        tripId: ctx.tripId ?? null,
        type,
        occurredAt: ctx.occurredAt,
        latitude: ctx.current.latitude,
        longitude: ctx.current.longitude,
        dwellSec,
      },
    });

    this.realtime.publish(ctx.organizationId, {
      type: "geofence",
      vehicleId: ctx.vehicleId,
      at: ctx.occurredAt.toISOString(),
      payload: { eventId: event.id, geofenceId: fence.id, geofenceName: fence.name, type, dwellSec },
    });
    void this.workflowEvents.emit(
      ctx.organizationId,
      type === "ENTER" ? "vehicle.geofence.entered" : "vehicle.geofence.exited",
      { geofenceId: fence.id, geofenceName: fence.name, vehicleId: ctx.vehicleId, driverId: ctx.driverId, dwellSec },
    );

    const shouldAlert = ctx.alertsEnabled && (type === "ENTER" ? fence.alertOnEnter : fence.alertOnExit);
    if (shouldAlert) {
      await this.alerts.raise({
        organizationId: ctx.organizationId,
        type: type === "ENTER" ? "GEOFENCE_ENTER" : "GEOFENCE_EXIT",
        severity: fence.category === "RESTRICTED" ? "HIGH" : "MEDIUM",
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId ?? null,
        tripId: ctx.tripId ?? null,
        geofenceId: fence.id,
        title: `${ctx.vehicleLabel} ${type === "ENTER" ? "entered" : "left"} ${fence.name}`,
        message: `${ctx.vehicleLabel} ${type === "ENTER" ? "entered" : "exited"} the "${fence.name}" geofence.`,
        latitude: ctx.current.latitude,
        longitude: ctx.current.longitude,
        occurredAt: ctx.occurredAt,
        // Per-crossing, so each enter/exit is its own alert (not deduped).
        dedupeKey: null,
        metadata: { geofenceName: fence.name, category: fence.category, dwellSec },
      });
    }

    if (type === "ENTER" && fence.autoCreated && fence.linkedDispatchId) {
      await this.handleAutoArrivalEnter(ctx, fence).catch((err) => {
        this.logger.warn(`Auto-arrival handler failed for fence ${fence.id}: ${err instanceof Error ? err.message : err}`);
      });
    }
  }

  /// Fires when a vehicle ENTERS an auto-created arrival geofence.
  ///
  /// For PICKUP fences:        EN_ROUTE_TO_PICKUP → AT_PICKUP.
  /// For DELIVERY fences:      IN_TRANSIT → ARRIVED_AT_DELIVERY.
  /// For INTERMEDIATE fences:  IN_TRANSIT → AT_STOP (stamps the exact DispatchStop).
  ///
  /// All paths create a driver-targeted notification. The entire flow is
  /// idempotent: if the dispatch is already past the expected status, the
  /// findFirst guard returns null and the method exits immediately.
  ///
  /// For INTERMEDIATE, an additional guard verifies the fence's
  /// linkedDispatchStopId matches the *current* active intermediate stop
  /// (lowest stopIndex with arrivedAt IS NULL and failedAt IS NULL). This
  /// prevents stale fences or out-of-order fences from triggering.
  ///
  /// Never throws — callers wrap with .catch() to keep GPS ingestion non-blocking.
  private async handleAutoArrivalEnter(ctx: GeofenceEvalContext, fence: Geofence): Promise<void> {
    const isPickup = fence.category === AUTO_ARRIVAL_PICKUP_CATEGORY;
    const isDelivery = fence.category === AUTO_ARRIVAL_DELIVERY_CATEGORY;
    const isIntermediate = fence.category === AUTO_ARRIVAL_INTERMEDIATE_CATEGORY;
    if (!isPickup && !isDelivery && !isIntermediate) return;

    if (isIntermediate) {
      await this.handleAutoArrivalIntermediate(ctx, fence);
      return;
    }

    const expectedFromStatus: DispatchStatus = isPickup ? "EN_ROUTE_TO_PICKUP" : "IN_TRANSIT";
    const toStatus: DispatchStatus = isPickup ? "AT_PICKUP" : "ARRIVED_AT_DELIVERY";
    const notifType = isPickup ? "DRIVER_AUTO_ARRIVED_PICKUP" : "DRIVER_AUTO_ARRIVED_DELIVERY";
    const notifTitle = isPickup ? "Arrived at pickup" : "Arrived at delivery";
    const notifMessage = isPickup
      ? "You appear to have arrived at pickup. Confirm when ready."
      : "You appear to have arrived at delivery. Complete the delivery and POD when ready.";

    // Guard: only transition if the dispatch is in the expected preceding status.
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: fence.linkedDispatchId!, organizationId: ctx.organizationId, status: expectedFromStatus },
      select: { id: true, orderId: true, driver: { select: { userId: true } } },
    });
    if (!dispatch) return;

    // Atomically advance dispatch status + record history. Order projection update
    // is handled inline since GPS-triggered events have no human actor for OrderWriter.
    // ARRIVED_AT_DELIVERY projects to IN_TRANSIT (no order status change needed).
    const pickupActual = isPickup ? ctx.occurredAt : undefined;
    const deliveryActual = isDelivery ? ctx.occurredAt : undefined;
    // Compare-and-set: pin `status: expectedFromStatus` in the WHERE so a concurrent
    // GPS event that already transitioned this dispatch loses the race (count === 0)
    // rather than applying a duplicate transition on top of the new state.
    let transitioned = false;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.dispatch.updateMany({
        where: { id: dispatch.id, organizationId: ctx.organizationId, status: expectedFromStatus },
        data: {
          status: toStatus,
          ...(pickupActual ? { pickupDateActual: pickupActual } : {}),
          ...(deliveryActual ? { deliveryDateActual: deliveryActual } : {}),
        },
      });
      if (result.count !== 1) return; // race lost — another event already transitioned

      // Stamp arrivedAt for the PICKUP or DELIVERY stop. First-event semantics:
      // WHERE arrivedAt IS NULL ensures a concurrent or retried write never
      // overwrites the original timestamp. Silently no-ops for legacy dispatches
      // that pre-date Phase 5B and have no DispatchStop rows.
      const stopType = isPickup ? "PICKUP" : "DELIVERY";
      await tx.dispatchStop.updateMany({
        where: { dispatchId: dispatch.id, stopType, arrivedAt: null },
        data: { arrivedAt: ctx.occurredAt },
      });

      await tx.dispatchStatusHistory.create({
        data: { organizationId: ctx.organizationId, dispatchId: dispatch.id, status: toStatus, note: "Auto-arrival via GPS geofence" },
      });
      if (isPickup) {
        // AT_PICKUP projects order ASSIGNED → PICKED_UP.
        await tx.order.update({
          where: { id: dispatch.orderId },
          data: { status: "PICKED_UP" },
        });
      }
      transitioned = true;
    });

    if (!transitioned) return;

    // Create driver notification (idempotent: one per dispatch per arrival type).
    const driverUserId = dispatch.driver?.userId;
    if (driverUserId) {
      const dup = await this.prisma.notification.findFirst({
        where: { organizationId: ctx.organizationId, type: notifType, entityId: dispatch.id, isArchived: false },
      });
      if (!dup) {
        await this.prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            type: notifType,
            category: "OPERATIONS",
            severity: "LOW",
            title: notifTitle,
            message: notifMessage,
            entityType: "Dispatch",
            entityId: dispatch.id,
            metadata: { forDriverUserId: driverUserId, dispatchId: dispatch.id } satisfies Prisma.InputJsonObject,
          },
        });
      }
    }

    // Archive the delivery fence once delivery arrival is confirmed.
    if (isDelivery) {
      await this.archiveForDispatch(ctx.organizationId, dispatch.id, "DELIVERY");
    }

    void this.workflowEvents.emit(ctx.organizationId, "dispatch.auto_arrived", {
      dispatchId: dispatch.id,
      arrivalType: isPickup ? "PICKUP" : "DELIVERY",
      toStatus,
    });
    this.logger.log(`handleAutoArrivalEnter: dispatch ${dispatch.id} auto-transitioned → ${toStatus} via fence ${fence.id}`);
  }

  /// Handles GPS ENTER on an INTERMEDIATE stop geofence.
  ///
  /// Race safety: uses updateMany with a `status: "IN_TRANSIT"` compare-and-set
  /// so that only one concurrent GPS event can win the transition; the losing
  /// event detects result.count === 0 and exits without side effects.
  ///
  /// Stop-identity safety: verifies fence.linkedDispatchStopId matches the
  /// current active stop (lowest unvisited) before transitioning. A stale fence
  /// for a previously visited stop, or a fence for a future stop, returns early.
  ///
  /// DispatchStop stamping: uses updateMany with `arrivedAt: null` so a second
  /// concurrent write cannot overwrite the first arrival timestamp.
  ///
  /// Never throws.
  private async handleAutoArrivalIntermediate(ctx: GeofenceEvalContext, fence: Geofence): Promise<void> {
    if (!fence.linkedDispatchId || !fence.linkedDispatchStopId) return;

    // Guard 1: dispatch must be IN_TRANSIT (the transition source for AT_STOP).
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: fence.linkedDispatchId, organizationId: ctx.organizationId, status: "IN_TRANSIT" },
      select: { id: true, driver: { select: { userId: true } } },
    });
    if (!dispatch) return;

    // Guard 2: fence must be for the *current* active intermediate stop.
    // This prevents a stale fence for a completed stop or a pre-created future
    // stop fence (none exist currently, but defensive) from firing.
    const currentStop = await this.prisma.dispatchStop.findFirst({
      where: {
        dispatchId: fence.linkedDispatchId,
        stopType: "INTERMEDIATE",
        arrivedAt: null,
        failedAt: null,
      },
      orderBy: { stopIndex: "asc" },
    });
    if (!currentStop || currentStop.id !== fence.linkedDispatchStopId) return;

    // Atomically compare-and-set the dispatch status + stamp the stop.
    // updateMany with `status: "IN_TRANSIT"` in the WHERE is the compare; if
    // count === 0 another event won the race — bail without side effects.
    let transitioned = false;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.dispatch.updateMany({
        where: { id: dispatch.id, organizationId: ctx.organizationId, status: "IN_TRANSIT" },
        data: { status: "AT_STOP" },
      });
      if (result.count !== 1) return; // race lost — another event already transitioned

      // Stamp arrivedAt only if null (idempotent against a concurrent win that
      // already wrote a timestamp before this transaction committed).
      await tx.dispatchStop.updateMany({
        where: { id: currentStop.id, arrivedAt: null },
        data: { arrivedAt: ctx.occurredAt },
      });

      await tx.dispatchStatusHistory.create({
        data: {
          organizationId: ctx.organizationId,
          dispatchId: dispatch.id,
          status: "AT_STOP",
          note: "Auto-arrival via GPS geofence",
        },
      });

      transitioned = true;
    });

    if (!transitioned) return;

    // Driver notification — one per stop arrival (entityId = stop ID so each stop
    // gets its own dedup key even within the same dispatch).
    const driverUserId = dispatch.driver?.userId;
    if (driverUserId) {
      const dup = await this.prisma.notification.findFirst({
        where: {
          organizationId: ctx.organizationId,
          type: "DRIVER_AUTO_ARRIVED_STOP",
          entityId: currentStop.id,
          isArchived: false,
        },
      });
      if (!dup) {
        await this.prisma.notification.create({
          data: {
            organizationId: ctx.organizationId,
            type: "DRIVER_AUTO_ARRIVED_STOP",
            category: "OPERATIONS",
            severity: "LOW",
            title: "Arrived at intermediate stop",
            message: "You appear to have arrived at an intermediate stop. Confirm when ready.",
            entityType: "DispatchStop",
            entityId: currentStop.id,
            metadata: {
              forDriverUserId: driverUserId,
              dispatchId: dispatch.id,
              stopId: currentStop.id,
            } satisfies Prisma.InputJsonObject,
          },
        });
      }
    }

    // Intermediate fence stays ACTIVE — the driver is AT_STOP and may
    // re-enter after briefly leaving. It is archived by
    // archiveIntermediateStopForDispatch when the driver departs (AT_STOP → IN_TRANSIT).

    void this.workflowEvents.emit(ctx.organizationId, "dispatch.auto_arrived", {
      dispatchId: dispatch.id,
      arrivalType: "INTERMEDIATE",
      toStatus: "AT_STOP",
      stopId: currentStop.id,
    });
    this.logger.log(
      `handleAutoArrivalIntermediate: dispatch ${dispatch.id} auto-transitioned → AT_STOP via fence ${fence.id} (stop ${currentStop.id})`,
    );
  }

  private async maybeDwell(ctx: GeofenceEvalContext, fence: Geofence): Promise<void> {
    const lastEnter = await this.prisma.geofenceEvent.findFirst({
      where: { organizationId: ctx.organizationId, geofenceId: fence.id, vehicleId: ctx.vehicleId, type: "ENTER" },
      orderBy: { occurredAt: "desc" },
    });
    if (!lastEnter) return;
    const dwellSec = Math.round((ctx.occurredAt.getTime() - lastEnter.occurredAt.getTime()) / 1000);
    if (dwellSec < (fence.dwellThresholdSec ?? Infinity)) return;

    // Only one DWELL per stay: skip if we already recorded one since the enter.
    const already = await this.prisma.geofenceEvent.findFirst({
      where: {
        organizationId: ctx.organizationId,
        geofenceId: fence.id,
        vehicleId: ctx.vehicleId,
        type: "DWELL",
        occurredAt: { gte: lastEnter.occurredAt },
      },
    });
    if (already) return;

    await this.prisma.geofenceEvent.create({
      data: {
        organizationId: ctx.organizationId,
        geofenceId: fence.id,
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId ?? null,
        tripId: ctx.tripId ?? null,
        type: "DWELL",
        occurredAt: ctx.occurredAt,
        latitude: ctx.current.latitude,
        longitude: ctx.current.longitude,
        dwellSec,
      },
    });

    if (ctx.alertsEnabled) {
      await this.alerts.raise({
        organizationId: ctx.organizationId,
        type: "GEOFENCE_DWELL",
        severity: "LOW",
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId ?? null,
        tripId: ctx.tripId ?? null,
        geofenceId: fence.id,
        title: `${ctx.vehicleLabel} dwelling at ${fence.name}`,
        message: `${ctx.vehicleLabel} has been inside "${fence.name}" for ${Math.round(dwellSec / 60)} min.`,
        latitude: ctx.current.latitude,
        longitude: ctx.current.longitude,
        value: dwellSec,
        threshold: fence.dwellThresholdSec,
        occurredAt: ctx.occurredAt,
        dedupeKey: `dwell:${ctx.vehicleId}:${fence.id}:${lastEnter.id}`,
      });
    }
  }

  private async getActive(organizationId: string): Promise<Geofence[]> {
    const cached = this.activeCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.prisma.geofence.findMany({
      where: { organizationId, active: true, archivedAt: null },
    });
    this.activeCache.set(organizationId, { value, expiresAt: Date.now() + GeofenceService.CACHE_TTL_MS });
    return value;
  }

  private validateGeometry(dto: Pick<CreateGeofenceDto, "type" | "centerLat" | "centerLng" | "radiusM" | "polygon">): void {
    if (dto.type === "CIRCLE") {
      if (dto.centerLat == null || dto.centerLng == null || dto.radiusM == null || dto.radiusM <= 0) {
        throw new BadRequestException("A CIRCLE geofence requires centerLat, centerLng and a positive radiusM");
      }
    } else {
      if (!Array.isArray(dto.polygon) || dto.polygon.length < 3) {
        throw new BadRequestException("A POLYGON geofence requires at least 3 vertices");
      }
      for (const v of dto.polygon) {
        if (typeof v?.lat !== "number" || typeof v?.lng !== "number") {
          throw new BadRequestException("Each polygon vertex must be an object with numeric lat and lng");
        }
      }
    }
  }

  private async findOrThrow(organizationId: string, id: string): Promise<Geofence> {
    const geofence = await this.prisma.geofence.findFirst({ where: { id, organizationId } });
    if (!geofence) throw new NotFoundException("Geofence not found");
    return geofence;
  }

  private toResponse(g: Geofence) {
    return {
      id: g.id,
      organizationId: g.organizationId,
      name: g.name,
      type: g.type,
      active: g.active,
      centerLat: g.centerLat,
      centerLng: g.centerLng,
      radiusM: g.radiusM,
      polygon: g.polygon,
      color: g.color,
      category: g.category,
      linkedCustomerId: g.linkedCustomerId,
      alertOnEnter: g.alertOnEnter,
      alertOnExit: g.alertOnExit,
      dwellThresholdSec: g.dwellThresholdSec,
      archivedAt: g.archivedAt,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }
}
