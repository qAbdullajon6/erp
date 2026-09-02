import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import { AssignmentQueries } from "../assignment/assignment.queries";
import {
  detectDispatchConflicts,
  type DispatchConflictContext,
} from "./dispatch-conflict.engine";
import type { DispatchConflict, DispatchConflictsResponse } from "./dispatch-conflict.types";
import { highestConflictSeverity, summarizeConflicts } from "./dispatch-conflict.types";
import type { CheckDispatchConflictsDto } from "./dto/check-dispatch-conflicts.dto";

const DISPATCH_CONFLICT_INCLUDE = {
  order: { include: { customer: true } },
  driver: true,
  vehicle: true,
} satisfies Prisma.DispatchInclude;

@Injectable()
export class DispatchConflictsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentQueries: AssignmentQueries,
    private readonly auditService: AuditService,
  ) {}

  async getConflicts(
    organizationId: string,
    dispatchId: string,
  ): Promise<DispatchConflictsResponse> {
    return this.evaluate(organizationId, dispatchId, {});
  }

  async checkConflicts(
    organizationId: string,
    dispatchId: string,
    dto: CheckDispatchConflictsDto,
    actor: CurrentUserPayload,
  ): Promise<DispatchConflictsResponse> {
    const auditAction = dto.recordAudit ? "dispatch.conflict_rechecked" : undefined;
    const hasOverrides = Boolean(
      dto.driverId || dto.vehicleId || dto.pickupDateScheduled || dto.deliveryDateScheduled,
    );
    const persistState = !(hasOverrides && dto.recordAudit === false);
    return this.evaluate(organizationId, dispatchId, dto, actor, auditAction, persistState);
  }

  async batchConflicts(
    organizationId: string,
    dispatchIds: string[],
  ): Promise<Record<string, DispatchConflictsResponse>> {
    const uniqueIds = [...new Set(dispatchIds)].slice(0, 200);
    const entries = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const result = await this.getConflicts(organizationId, id);
          return [id, result] as const;
        } catch {
          return null;
        }
      }),
    );
    return Object.fromEntries(entries.filter(Boolean) as [string, DispatchConflictsResponse][]);
  }

  async ignoreConflict(
    organizationId: string,
    dispatchId: string,
    conflictId: string,
    actor: CurrentUserPayload,
  ): Promise<DispatchConflictsResponse> {
    const detected = await this.detectRaw(organizationId, dispatchId, {});
    await this.mergeWithState(organizationId, dispatchId, detected);
    const conflict = detected.find((c) => c.id === conflictId);
    if (!conflict) {
      throw new NotFoundException("Conflict not found on this dispatch");
    }

    await this.prisma.dispatchConflictState.update({
      where: {
        dispatchId_conflictKey: { dispatchId, conflictKey: conflict.id },
      },
      data: {
        ignoredAt: new Date(),
        ignoredByUserId: actor.userId,
        resolvedAt: null,
        resolvedByUserId: null,
        lastDetectedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.conflict_ignored",
      entityType: "Dispatch",
      entityId: dispatchId,
      metadata: { conflictId, type: conflict.type },
    });

    return this.buildResponse(organizationId, dispatchId);
  }

  async resolveConflict(
    organizationId: string,
    dispatchId: string,
    conflictId: string,
    actor: CurrentUserPayload,
  ): Promise<DispatchConflictsResponse> {
    const detected = await this.detectRaw(organizationId, dispatchId, {});
    await this.mergeWithState(organizationId, dispatchId, detected);
    const conflict = detected.find((c) => c.id === conflictId);
    if (!conflict) {
      throw new NotFoundException("Conflict not found on this dispatch");
    }

    await this.prisma.dispatchConflictState.update({
      where: {
        dispatchId_conflictKey: { dispatchId, conflictKey: conflict.id },
      },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: actor.userId,
        ignoredAt: null,
        ignoredByUserId: null,
        lastDetectedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.conflict_resolved",
      entityType: "Dispatch",
      entityId: dispatchId,
      metadata: { conflictId, type: conflict.type },
    });

    return this.buildResponse(organizationId, dispatchId);
  }

  private async buildResponse(
    organizationId: string,
    dispatchId: string,
    overrides: CheckDispatchConflictsDto = {},
  ): Promise<DispatchConflictsResponse> {
    const items = await this.detectRaw(organizationId, dispatchId, overrides);
    const merged = await this.mapWithExistingState(organizationId, dispatchId, items);
    return {
      dispatchId,
      items: merged,
      summary: summarizeConflicts(merged),
      checkedAt: new Date().toISOString(),
    };
  }

  private async evaluate(
    organizationId: string,
    dispatchId: string,
    overrides: CheckDispatchConflictsDto,
    actor?: CurrentUserPayload,
    auditAction?: string,
    persistState = true,
  ): Promise<DispatchConflictsResponse> {
    const items = await this.detectRaw(organizationId, dispatchId, overrides);
    const merged = await this.mergeWithState(organizationId, dispatchId, items, persistState);

    if (auditAction && actor && merged.some((c) => !c.ignored && !c.resolved)) {
      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: auditAction,
        entityType: "Dispatch",
        entityId: dispatchId,
        metadata: {
          count: merged.length,
          unresolved: merged.filter((c) => !c.ignored && !c.resolved).length,
        },
      });
    }

    return {
      dispatchId,
      items: merged,
      summary: summarizeConflicts(merged),
      checkedAt: new Date().toISOString(),
    };
  }

  private async detectRaw(
    organizationId: string,
    dispatchId: string,
    overrides: CheckDispatchConflictsDto,
  ): Promise<DispatchConflict[]> {
    const dispatch = await this.loadDispatch(organizationId, dispatchId);
    const effective = await this.applyOverrides(organizationId, dispatch, overrides);

    const window = {
      pickupDate: effective.pickupDateScheduled,
      deliveryDate: effective.deliveryDateScheduled,
    };

    const [reservations, balanceAgg] = await Promise.all([
      this.assignmentQueries.reservationsIn(organizationId, window, {
        dispatchId,
        orderId: effective.orderId,
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          customerId: effective.order.customerId,
          balanceDue: { gt: 0 },
        },
        _sum: { balanceDue: true },
      }),
    ]);

    return detectDispatchConflicts({
      dispatch: effective,
      reservations,
      customerBalanceDue: balanceAgg._sum.balanceDue ?? new Prisma.Decimal(0),
    });
  }

  private async mergeWithState(
    organizationId: string,
    dispatchId: string,
    detected: DispatchConflict[],
    persistState = true,
  ): Promise<DispatchConflict[]> {
    const states = await this.prisma.dispatchConflictState.findMany({
      where: { organizationId, dispatchId },
      include: {
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const stateByKey = new Map(states.map((s) => [s.conflictKey, s]));

    const now = new Date();
    const newlyDetected: DispatchConflict[] = [];
    for (const conflict of detected) {
      const isNew = !stateByKey.has(conflict.id);
      if (persistState) {
        await this.prisma.dispatchConflictState.upsert({
          where: {
            dispatchId_conflictKey: { dispatchId, conflictKey: conflict.id },
          },
          create: {
            organizationId,
            dispatchId,
            conflictKey: conflict.id,
            type: conflict.type,
            severity: conflict.severity,
            firstDetectedAt: now,
            lastDetectedAt: now,
          },
          update: {
            type: conflict.type,
            severity: conflict.severity,
            lastDetectedAt: now,
          },
        });
      }
      if (isNew) {
        newlyDetected.push(conflict);
      }
    }

    if (persistState && newlyDetected.length > 0) {
      await this.auditService.log({
        organizationId,
        action: "dispatch.conflict_detected",
        entityType: "Dispatch",
        entityId: dispatchId,
        metadata: {
          dispatchId,
          count: newlyDetected.length,
          highestSeverity: highestConflictSeverity(newlyDetected),
          types: newlyDetected.map((conflict) => conflict.type),
        },
      });
    }

    if (persistState) {
      return this.mapWithExistingState(organizationId, dispatchId, detected);
    }

    return this.mapWithExistingState(organizationId, dispatchId, detected, stateByKey);
  }

  private async mapWithExistingState(
    organizationId: string,
    dispatchId: string,
    detected: DispatchConflict[],
    cachedStates?: Map<
      string,
      {
        conflictKey: string;
        ignoredAt: Date | null;
        resolvedAt: Date | null;
        firstDetectedAt: Date;
        resolvedBy: { firstName: string; lastName: string } | null;
      }
    >,
  ): Promise<DispatchConflict[]> {
    const stateByKey =
      cachedStates ??
      new Map(
        (
          await this.prisma.dispatchConflictState.findMany({
            where: { organizationId, dispatchId },
            include: {
              resolvedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          })
        ).map((state) => [state.conflictKey, state]),
      );

    return detected.map((conflict) => {
      const state = stateByKey.get(conflict.id);
      const ignored = Boolean(state?.ignoredAt);
      const resolved = Boolean(state?.resolvedAt);
      const resolvedBy = state?.resolvedBy
        ? `${state.resolvedBy.firstName} ${state.resolvedBy.lastName}`.trim()
        : null;
      return {
        ...conflict,
        ignored,
        resolved,
        detectedAt: state?.firstDetectedAt?.toISOString() ?? conflict.detectedAt,
        resolvedAt: state?.resolvedAt?.toISOString() ?? null,
        resolvedBy,
      };
    });
  }

  private async loadDispatch(
    organizationId: string,
    dispatchId: string,
  ): Promise<DispatchConflictContext> {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: dispatchId, organizationId },
      include: DISPATCH_CONFLICT_INCLUDE,
    });
    if (!dispatch) {
      throw new NotFoundException("Dispatch not found");
    }
    return dispatch;
  }

  private async applyOverrides(
    organizationId: string,
    dispatch: DispatchConflictContext,
    overrides: CheckDispatchConflictsDto,
  ): Promise<DispatchConflictContext> {
    const next: DispatchConflictContext = { ...dispatch };
    if (overrides.driverId && overrides.driverId !== dispatch.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: overrides.driverId, organizationId },
      });
      if (driver) {
        next.driverId = driver.id;
        next.driver = driver;
      }
    }
    if (overrides.vehicleId && overrides.vehicleId !== dispatch.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: overrides.vehicleId, organizationId },
      });
      if (vehicle) {
        next.vehicleId = vehicle.id;
        next.vehicle = vehicle;
      }
    }
    if (overrides.pickupDateScheduled) {
      next.pickupDateScheduled = new Date(overrides.pickupDateScheduled);
    }
    if (overrides.deliveryDateScheduled) {
      next.deliveryDateScheduled = new Date(overrides.deliveryDateScheduled);
    }
    return next;
  }
}
