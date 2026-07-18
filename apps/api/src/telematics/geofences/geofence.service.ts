import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Geofence, Prisma } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import { AlertService } from "../alerts/alert.service";
import type { CreateGeofenceDto } from "../dto/create-geofence.dto";
import type { ListGeofencesQueryDto } from "../dto/list-geofences-query.dto";
import type { UpdateGeofenceDto } from "../dto/update-geofence.dto";
import { isInsideGeofence, toGeofenceShape } from "../geo/geofence.util";
import type { LatLng } from "../geo/haversine.util";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";

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
@Injectable()
export class GeofenceService {
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly activeCache = new Map<string, { value: Geofence[]; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly realtime: TelematicsRealtimeService,
    private readonly alerts: AlertService,
  ) {}

  // --- CRUD ---------------------------------------------------------------

  async create(organizationId: string, dto: CreateGeofenceDto, actor: CurrentUserPayload) {
    this.validateGeometry(dto);
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
    } as CreateGeofenceDto);

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
