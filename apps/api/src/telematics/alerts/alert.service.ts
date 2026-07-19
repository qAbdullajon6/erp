import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  TelematicsAlert,
  TelematicsAlertStatus,
  TelematicsAlertType,
  NotificationSeverity,
} from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import type { ListAlertsQueryDto } from "../dto/list-alerts-query.dto";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";

export interface RaiseAlertInput {
  organizationId: string;
  type: TelematicsAlertType;
  severity: NotificationSeverity;
  vehicleId?: string | null;
  driverId?: string | null;
  tripId?: string | null;
  geofenceId?: string | null;
  title: string;
  message: string;
  latitude?: number | null;
  longitude?: number | null;
  value?: number | null;
  threshold?: number | null;
  occurredAt: Date;
  /// Stable key for a continuing condition. While an alert with this key is
  /// OPEN/ACKNOWLEDGED, re-raising updates it instead of creating a duplicate.
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
}

/// The alert engine and its management surface.
///
/// `raise` is the write path the ingestion pipeline calls; `acknowledge` /
/// `resolve` are the operator actions. Dedupe is the load-bearing idea: a
/// vehicle that stays over the limit for a minute produces ~20 pings, and each
/// would otherwise be an alert. The (organizationId, dedupeKey) unique slot
/// collapses a sustained condition into one row that is updated in place, and
/// is released (dedupeKey → null) the moment the alert resolves so a later
/// recurrence is a fresh alert rather than a resurrected one.
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: TelematicsRealtimeService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly audit: AuditService,
  ) {}

  /// Creates a new alert, or updates the open one sharing its dedupeKey.
  /// Returns whether a new alert was created (only new alerts fan out to
  /// workflows/notifications, so a sustained condition does not re-notify).
  async raise(input: RaiseAlertInput): Promise<{ alert: TelematicsAlert; isNew: boolean }> {
    if (input.dedupeKey) {
      const existing = await this.prisma.telematicsAlert.findUnique({
        where: { organizationId_dedupeKey: { organizationId: input.organizationId, dedupeKey: input.dedupeKey } },
      });
      if (existing) {
        const alert = await this.prisma.telematicsAlert.update({
          where: { id: existing.id },
          data: {
            occurredAt: input.occurredAt,
            value: input.value ?? existing.value,
            severity: input.severity,
            message: input.message,
            latitude: input.latitude ?? existing.latitude,
            longitude: input.longitude ?? existing.longitude,
          },
        });
        return { alert, isNew: false };
      }
    }

    try {
      const alert = await this.prisma.telematicsAlert.create({
        data: {
          organizationId: input.organizationId,
          type: input.type,
          severity: input.severity,
          status: "OPEN",
          vehicleId: input.vehicleId ?? null,
          driverId: input.driverId ?? null,
          tripId: input.tripId ?? null,
          geofenceId: input.geofenceId ?? null,
          title: input.title,
          message: input.message,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          value: input.value ?? null,
          threshold: input.threshold ?? null,
          occurredAt: input.occurredAt,
          dedupeKey: input.dedupeKey ?? null,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });

      // Side effects never block or fail ingestion.
      this.realtime.publish(input.organizationId, {
        type: "alert",
        vehicleId: alert.vehicleId,
        at: alert.occurredAt.toISOString(),
        payload: this.toResponse(alert) as unknown as Record<string, unknown>,
      });
      void this.workflowEvents.emit(input.organizationId, "telematics.alert.raised", {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        vehicleId: alert.vehicleId,
        driverId: alert.driverId,
        value: alert.value,
        threshold: alert.threshold,
      });
      void this.audit.log({
        organizationId: input.organizationId,
        action: "telematics.alert.raised",
        entityType: "TelematicsAlert",
        entityId: alert.id,
        metadata: { type: alert.type, severity: alert.severity, vehicleId: alert.vehicleId },
      });

      return { alert, isNew: true };
    } catch (err) {
      // A concurrent raise won the unique slot between our read and create.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && input.dedupeKey) {
        const existing = await this.prisma.telematicsAlert.findUnique({
          where: { organizationId_dedupeKey: { organizationId: input.organizationId, dedupeKey: input.dedupeKey } },
        });
        if (existing) return { alert: existing, isNew: false };
      }
      throw err;
    }
  }

  /// Clears an open alert when its condition ends (back under the limit, back
  /// online). Frees the dedupe slot so a future recurrence is a new alert.
  /// No-op when nothing is open for the key.
  async autoResolve(organizationId: string, dedupeKey: string): Promise<void> {
    const existing = await this.prisma.telematicsAlert.findUnique({
      where: { organizationId_dedupeKey: { organizationId, dedupeKey } },
    });
    if (!existing || existing.status === "RESOLVED") return;
    await this.prisma.telematicsAlert.update({
      where: { id: existing.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), dedupeKey: null, metadata: this.mergeMeta(existing, { autoResolved: true }) },
    });
  }

  async list(organizationId: string, query: ListAlertsQueryDto) {
    const where: Prisma.TelematicsAlertWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    };
    const [rows, total, openCount] = await Promise.all([
      this.prisma.telematicsAlert.findMany({
        where,
        orderBy: { occurredAt: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.telematicsAlert.count({ where }),
      this.prisma.telematicsAlert.count({ where: { organizationId, status: "OPEN" } }),
    ]);
    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
      openCount,
    };
  }

  async acknowledge(organizationId: string, id: string, actor: CurrentUserPayload) {
    const alert = await this.findOrThrow(organizationId, id);
    if (alert.status !== "OPEN") return this.toResponse(alert);
    const updated = await this.prisma.telematicsAlert.update({
      where: { id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedByUserId: actor.userId },
    });
    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "telematics.alert.acknowledge",
      entityType: "TelematicsAlert",
      entityId: id,
    });
    return this.toResponse(updated);
  }

  async resolve(organizationId: string, id: string, actor: CurrentUserPayload) {
    const alert = await this.findOrThrow(organizationId, id);
    if (alert.status === "RESOLVED") return this.toResponse(alert);
    const updated = await this.prisma.telematicsAlert.update({
      where: { id },
      // Release the dedupe slot so a recurrence is a fresh alert.
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByUserId: actor.userId, dedupeKey: null },
    });
    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "telematics.alert.resolve",
      entityType: "TelematicsAlert",
      entityId: id,
    });
    return this.toResponse(updated);
  }

  async getById(organizationId: string, id: string) {
    return this.toResponse(await this.findOrThrow(organizationId, id));
  }

  private async findOrThrow(organizationId: string, id: string): Promise<TelematicsAlert> {
    const alert = await this.prisma.telematicsAlert.findFirst({ where: { id, organizationId } });
    if (!alert) throw new NotFoundException("Alert not found");
    return alert;
  }

  private mergeMeta(alert: TelematicsAlert, extra: Record<string, unknown>): Prisma.InputJsonValue {
    const base = (alert.metadata as Record<string, unknown> | null) ?? {};
    return { ...base, ...extra } as Prisma.InputJsonValue;
  }

  private toResponse(a: TelematicsAlert) {
    return {
      id: a.id,
      organizationId: a.organizationId,
      type: a.type,
      severity: a.severity,
      status: a.status,
      vehicleId: a.vehicleId,
      driverId: a.driverId,
      tripId: a.tripId,
      geofenceId: a.geofenceId,
      title: a.title,
      message: a.message,
      latitude: a.latitude,
      longitude: a.longitude,
      value: a.value,
      threshold: a.threshold,
      occurredAt: a.occurredAt,
      acknowledgedAt: a.acknowledgedAt,
      resolvedAt: a.resolvedAt,
      metadata: a.metadata,
      createdAt: a.createdAt,
    };
  }
}

export { TelematicsAlertStatus };
