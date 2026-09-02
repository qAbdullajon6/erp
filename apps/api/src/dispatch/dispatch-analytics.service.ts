import { Injectable } from "@nestjs/common";
import { DispatchStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";
import {
  bucketKeyFor,
  DateRange,
  enumerateBuckets,
  percentChange,
  resolveBucketGranularity,
} from "../reports/report-filters.util";
import { startOfTodayUtc, wasDeliveredOnTime } from "../common/schedule-lateness.util";
import { ACTIVE_DISPATCH_STATUSES } from "./assignment/assignment.queries";
import { DispatchAnalyticsQueryDto } from "./dto/dispatch-analytics-query.dto";

const TERMINAL: DispatchStatus[] = ["DELIVERED", "CANCELLED"];
const TOP_N = 8;
const TOP_ROUTES = 6;

export interface Trend {
  current: number;
  previous: number | null;
  percentChange: number | null;
}

function buildTrend(current: number, previous: number | null): Trend {
  return { current, previous, percentChange: previous == null ? null : percentChange(current, previous) };
}

/// Real backend aggregation for Dispatch Analytics (replaces the previous
/// client-side approximation over the 200 most-recently-scheduled dispatches).
/// Every number here is computed with a database query scoped to the caller's
/// organization and, for period metrics, the requested date range — never a
/// fixed-size slice that silently misses data for a busy organization.
@Injectable()
export class DispatchAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  async getAnalytics(organizationId: string, dto: DispatchAnalyticsQueryDto) {
    // Reuses the same date-range/comparison-period resolution (and the same
    // 366-day cap) that /reports/operations already validates against — one
    // definition of "previous period" for the whole app (Phase 3).
    const filter = await this.reportsService.resolveFilter(organizationId, dto);
    const { range, comparisonRange, timezone } = filter;

    const [live, period, previousPeriod, dispatchesByDay, dispatchesByStatus, driverWorkload, vehicleUtilization, delayed] =
      await Promise.all([
        this.computeLive(organizationId),
        this.computePeriodMetrics(organizationId, range),
        comparisonRange ? this.computePeriodMetrics(organizationId, comparisonRange) : null,
        this.computeDispatchesByDay(organizationId, range, timezone),
        this.computeDispatchesByStatus(organizationId, range),
        this.computeDriverWorkload(organizationId, range),
        this.computeVehicleUtilization(organizationId, range),
        this.computeDelayed(organizationId),
      ]);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        comparisonFrom: comparisonRange?.from.toISOString() ?? null,
        comparisonTo: comparisonRange?.to.toISOString() ?? null,
      },
      live,
      period: {
        dispatchesCreated: buildTrend(period.dispatchesCreated, previousPeriod?.dispatchesCreated ?? null),
        completed: buildTrend(period.completed, previousPeriod?.completed ?? null),
        cancelled: buildTrend(period.cancelled, previousPeriod?.cancelled ?? null),
        onTimeDeliveryRate: buildTrend(period.onTimeDeliveryRate, previousPeriod?.onTimeDeliveryRate ?? null),
        avgAssignmentMinutes: buildTrend(period.avgAssignmentMinutes, previousPeriod?.avgAssignmentMinutes ?? null),
        avgTripDurationMinutes: buildTrend(period.avgTripDurationMinutes, previousPeriod?.avgTripDurationMinutes ?? null),
      },
      dispatchesByDay,
      dispatchesByStatus,
      driverWorkload,
      vehicleUtilization,
      delayReasons: delayed.reasons,
      topDelayedRoutes: delayed.routes,
    };
  }

  /// Right-now gauges — deliberately NOT date-range scoped (see the `trends`
  /// comment in the frontend types: there is no historical "active dispatches
  /// 7 days ago" fact to compare against, so these are reported without a
  /// trend rather than with a fabricated one).
  private async computeLive(organizationId: string) {
    const now = new Date();
    const [activeDispatches, draftDispatches, delayedCount] = await Promise.all([
      this.prisma.dispatch.count({
        where: { organizationId, status: { in: ACTIVE_DISPATCH_STATUSES }, order: { archivedAt: null } },
      }),
      this.prisma.dispatch.count({ where: { organizationId, status: "DRAFT", order: { archivedAt: null } } }),
      this.prisma.dispatch.count({
        where: {
          organizationId,
          status: { notIn: TERMINAL },
          order: { archivedAt: null },
          OR: [{ pickupDateScheduled: { lt: startOfTodayUtc(now) } }, { deliveryDateScheduled: { lt: startOfTodayUtc(now) } }],
        },
      }),
    ]);
    return { activeDispatches, draftDispatches, delayedDispatches: delayedCount };
  }

  private async computePeriodMetrics(organizationId: string, range: DateRange) {
    const [dispatchesCreated, deliveredRows, cancelled, assignmentMinutes] = await Promise.all([
      this.prisma.dispatch.count({
        where: { organizationId, createdAt: { gte: range.from, lte: range.to }, order: { archivedAt: null } },
      }),
      this.prisma.dispatch.findMany({
        where: {
          organizationId,
          status: "DELIVERED",
          deliveryDateActual: { gte: range.from, lte: range.to },
          order: { archivedAt: null },
        },
        select: { deliveryDateActual: true, deliveryDateScheduled: true, pickupDateActual: true },
      }),
      // CANCELLED is terminal — nothing updates the row again after the
      // cancel transition, so `updatedAt` reliably marks that moment.
      this.prisma.dispatch.count({
        where: {
          organizationId,
          status: "CANCELLED",
          updatedAt: { gte: range.from, lte: range.to },
          order: { archivedAt: null },
        },
      }),
      this.computeAssignmentMinutes(organizationId, range),
    ]);

    const delivered = deliveredRows.length;
    const onTime = deliveredRows.filter(
      (d) => d.deliveryDateActual && wasDeliveredOnTime(d.deliveryDateActual, d.deliveryDateScheduled),
    ).length;
    const onTimeDeliveryRate = delivered > 0 ? Math.round((onTime / delivered) * 1000) / 10 : 0;

    const tripDurations = deliveredRows
      .filter((d) => d.pickupDateActual && d.deliveryDateActual)
      .map((d) => (d.deliveryDateActual!.getTime() - d.pickupDateActual!.getTime()) / 60_000)
      .filter((m) => m >= 0);
    const avgTripDurationMinutes =
      tripDurations.length > 0 ? Math.round(tripDurations.reduce((a, b) => a + b, 0) / tripDurations.length) : 0;

    const avgAssignmentMinutes =
      assignmentMinutes.length > 0
        ? Math.round(assignmentMinutes.reduce((a, b) => a + b, 0) / assignmentMinutes.length)
        : 0;

    return {
      dispatchesCreated,
      completed: delivered,
      cancelled,
      onTimeDeliveryRate,
      avgAssignmentMinutes,
      avgTripDurationMinutes,
    };
  }

  /// True assignment time: the gap between the DRAFT and ASSIGNED rows this
  /// dispatch actually recorded in DispatchStatusHistory (R13's own audit
  /// trail), for dispatches assigned within `range` — not a proxy inferred
  /// from `updatedAt` (Phase 4 requirement: real timestamps, not proxies).
  ///
  /// Simplification: a dispatch undone back to DRAFT and reassigned produces
  /// more than one DRAFT/ASSIGNED pair; this pairs the latest ASSIGNED row
  /// against the latest DRAFT row rather than chronologically matching every
  /// pair. That path is rare (an explicit board Undo followed by a fresh
  /// assign) and does not affect the common case this average is meant to
  /// describe.
  private async computeAssignmentMinutes(organizationId: string, range: DateRange): Promise<number[]> {
    const assignedRows = await this.prisma.dispatchStatusHistory.findMany({
      where: {
        organizationId,
        status: "ASSIGNED",
        createdAt: { gte: range.from, lte: range.to },
        dispatch: { order: { archivedAt: null } },
      },
      select: { dispatchId: true, createdAt: true },
    });
    if (assignedRows.length === 0) return [];

    const dispatchIds = [...new Set(assignedRows.map((r) => r.dispatchId))];
    const draftRows = await this.prisma.dispatchStatusHistory.findMany({
      where: { organizationId, status: "DRAFT", dispatchId: { in: dispatchIds } },
      select: { dispatchId: true, createdAt: true },
    });
    const draftByDispatch = new Map(draftRows.map((r) => [r.dispatchId, r.createdAt]));

    const minutes: number[] = [];
    for (const row of assignedRows) {
      const draftAt = draftByDispatch.get(row.dispatchId);
      if (!draftAt) continue;
      const diff = (row.createdAt.getTime() - draftAt.getTime()) / 60_000;
      if (diff >= 0) minutes.push(Math.round(diff));
    }
    return minutes;
  }

  /// Real day/month-bucketed series over the WHOLE matching range, not a
  /// fixed 14-day window — granularity adapts the same way Reports' own
  /// time-series charts do (resolveBucketGranularity), so a year-long range
  /// still renders as a readable line instead of 365 bars.
  private async computeDispatchesByDay(organizationId: string, range: DateRange, timezone: string) {
    const granularity = resolveBucketGranularity(range);
    const rows = await this.prisma.dispatch.findMany({
      where: {
        organizationId,
        pickupDateScheduled: { gte: range.from, lte: range.to },
        order: { archivedAt: null },
      },
      select: { pickupDateScheduled: true },
    });
    const counts = new Map<string, number>();
    for (const key of enumerateBuckets(range, granularity, timezone)) counts.set(key, 0);
    for (const row of rows) {
      const key = bucketKeyFor(row.pickupDateScheduled, granularity, timezone);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { granularity, points: [...counts.entries()].map(([label, value]) => ({ label, value })) };
  }

  private async computeDispatchesByStatus(organizationId: string, range: DateRange) {
    const grouped = await this.prisma.dispatch.groupBy({
      by: ["status"],
      where: { organizationId, createdAt: { gte: range.from, lte: range.to }, order: { archivedAt: null } },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  private async computeDriverWorkload(organizationId: string, range: DateRange) {
    const grouped = await this.prisma.dispatch.groupBy({
      by: ["driverId"],
      where: { organizationId, createdAt: { gte: range.from, lte: range.to }, order: { archivedAt: null } },
      _count: { _all: true },
      orderBy: { _count: { driverId: "desc" } },
      take: TOP_N,
    });
    if (grouped.length === 0) return [];
    const drivers = await this.prisma.driver.findMany({
      where: { id: { in: grouped.map((g) => g.driverId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`.trim()]));
    return grouped.map((g) => ({
      id: g.driverId,
      label: nameById.get(g.driverId) ?? g.driverId.slice(0, 8),
      count: g._count._all,
    }));
  }

  private async computeVehicleUtilization(organizationId: string, range: DateRange) {
    const grouped = await this.prisma.dispatch.groupBy({
      by: ["vehicleId"],
      where: { organizationId, createdAt: { gte: range.from, lte: range.to }, order: { archivedAt: null } },
      _count: { _all: true },
      orderBy: { _count: { vehicleId: "desc" } },
      take: TOP_N,
    });
    if (grouped.length === 0) return [];
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: grouped.map((g) => g.vehicleId) } },
      select: { id: true, plateNumber: true },
    });
    const plateById = new Map(vehicles.map((v) => [v.id, v.plateNumber]));
    return grouped.map((g) => ({
      id: g.vehicleId,
      label: plateById.get(g.vehicleId) ?? g.vehicleId.slice(0, 8),
      count: g._count._all,
    }));
  }

  /// Delay is a live concept — "late" is always relative to right now, not
  /// to the selected historical range — so this is deliberately independent
  /// of `range`, matching `computeLive`'s delayedDispatches count.
  private async computeDelayed(organizationId: string) {
    const now = new Date();
    const rows = await this.prisma.dispatch.findMany({
      where: {
        organizationId,
        status: { notIn: TERMINAL },
        order: { archivedAt: null },
        OR: [{ pickupDateScheduled: { lt: startOfTodayUtc(now) } }, { deliveryDateScheduled: { lt: startOfTodayUtc(now) } }],
      },
      select: {
        status: true,
        pickupDateScheduled: true,
        pickupDateActual: true,
        deliveryDateScheduled: true,
        order: { select: { pickupCity: true, deliveryCity: true } },
      },
    });

    const nowMs = now.getTime();
    const reasonCounts = new Map<string, number>();
    const routeCounts = new Map<string, number>();

    for (const d of rows) {
      const reason =
        d.pickupDateScheduled.getTime() < nowMs && !d.pickupDateActual
          ? "Late pickup"
          : d.deliveryDateScheduled.getTime() < nowMs
            ? "Late delivery"
            : d.status === "DRAFT"
              ? "Awaiting assignment"
              : "Schedule slip";
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

      const route = `${d.order?.pickupCity ?? "—"} → ${d.order?.deliveryCity ?? "—"}`;
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    }

    return {
      reasons: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      routes: [...routeCounts.entries()]
        .map(([route, count]) => ({ route, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_ROUTES),
    };
  }
}
