import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import { activeConflicts, highestActiveSeverity } from '@/lib/api/dispatch-conflicts';
import type {
  BuildDispatchAnalyticsInput,
  DispatchAnalyticsInsight,
  DispatchAnalyticsKpis,
  DispatchAnalyticsSnapshot,
  DispatchAnalyticsTrend,
} from './dispatch-analytics.types';

const ACTIVE: DispatchStatus[] = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];
const TERMINAL: DispatchStatus[] = ['DELIVERED', 'CANCELLED'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

function weekKey(d: Date): string {
  const day = startOfDay(d);
  const diff = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - diff);
  return day.toISOString().slice(0, 10);
}

function isDelayed(dispatch: ApiDispatch, now: Date): boolean {
  if (TERMINAL.includes(dispatch.status)) return false;
  const pickupLate =
    dispatch.pickupDateScheduled &&
    new Date(dispatch.pickupDateScheduled).getTime() < now.getTime() &&
    !dispatch.pickupDateActual &&
    dispatch.status !== 'DRAFT';
  const deliveryLate =
    dispatch.deliveryDateScheduled &&
    new Date(dispatch.deliveryDateScheduled).getTime() < now.getTime() &&
    dispatch.status !== 'DELIVERED';
  return Boolean(pickupLate || deliveryLate);
}

function delayReasonFor(dispatch: ApiDispatch, now: Date): string {
  if (
    dispatch.pickupDateScheduled &&
    new Date(dispatch.pickupDateScheduled).getTime() < now.getTime() &&
    !dispatch.pickupDateActual
  ) {
    return 'Late pickup';
  }
  if (
    dispatch.deliveryDateScheduled &&
    new Date(dispatch.deliveryDateScheduled).getTime() < now.getTime()
  ) {
    return 'Late delivery';
  }
  if (dispatch.status === 'DRAFT') return 'Awaiting assignment';
  return 'Schedule slip';
}

function assignmentMinutes(dispatch: ApiDispatch): number | null {
  if (dispatch.status === 'DRAFT') return null;
  const created = new Date(dispatch.createdAt).getTime();
  const assigned = new Date(dispatch.updatedAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(assigned) || assigned <= created) return null;
  return Math.round((assigned - created) / 60_000);
}

function trend(current: number, previous: number): DispatchAnalyticsTrend {
  if (previous === 0) {
    if (current === 0) return { label: '0%', direction: 'flat' };
    return { label: '—', direction: current > 0 ? 'up' : 'flat' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: '0%', direction: 'flat' };
  return { label: `${pct > 0 ? '+' : ''}${pct}%`, direction: pct > 0 ? 'up' : 'down' };
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

export function buildDispatchAnalytics(input: BuildDispatchAnalyticsInput): DispatchAnalyticsSnapshot {
  const now = input.now ?? new Date();
  const todayStart = startOfDay(now);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const last7Start = new Date(todayStart);
  last7Start.setDate(last7Start.getDate() - 7);
  const prev7Start = new Date(last7Start);
  prev7Start.setDate(prev7Start.getDate() - 7);

  const dispatches = input.dispatches ?? [];
  const board = input.board;
  const conflictsMap = input.conflictsByDispatchId ?? {};

  const activeDispatches = dispatches.filter((d) => ACTIVE.includes(d.status));
  const draftDispatches = dispatches.filter((d) => d.status === 'DRAFT');
  const delayedDispatches = dispatches.filter((d) => isDelayed(d, now));
  const completedToday = dispatches.filter(
    (d) =>
      d.status === 'DELIVERED' &&
      d.deliveryDateActual &&
      inRange(d.deliveryDateActual, todayStart, tomorrow),
  );

  const assignmentSamples = dispatches
    .map(assignmentMinutes)
    .filter((v): v is number => v != null && v >= 0 && v <= 7 * 24 * 60);
  const avgAssignmentMinutes =
    assignmentSamples.length > 0
      ? Math.round(assignmentSamples.reduce((a, b) => a + b, 0) / assignmentSamples.length)
      : 0;

  let conflictTotal = 0;
  let conflictCritical = 0;
  let conflictHigh = 0;
  let conflictMedium = 0;
  let conflictLow = 0;
  const typeCounts = new Map<string, number>();

  for (const dispatch of dispatches) {
    const entry = conflictsMap[dispatch.id];
    if (!entry) continue;
    const active = activeConflicts(entry);
    conflictTotal += active.length;
    for (const c of active) {
      if (c.severity === 'critical') conflictCritical += 1;
      else if (c.severity === 'high') conflictHigh += 1;
      else if (c.severity === 'medium') conflictMedium += 1;
      else conflictLow += 1;
      typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
    }
  }

  const activeDrivers =
    board?.drivers.busy.length ??
    new Set(activeDispatches.map((d) => d.driverId).filter(Boolean)).size;
  const activeVehicles =
    board?.vehicles.busy.length ??
    new Set(activeDispatches.map((d) => d.vehicleId).filter(Boolean)).size;

  const current7 = dispatches.filter((d) => inRange(d.createdAt, last7Start, tomorrow));
  const previous7 = dispatches.filter((d) => inRange(d.createdAt, prev7Start, last7Start));

  const countIn = (rows: ApiDispatch[], pred: (d: ApiDispatch) => boolean) => rows.filter(pred).length;

  const kpis: DispatchAnalyticsKpis = {
    activeDispatches: activeDispatches.length,
    draftDispatches: draftDispatches.length,
    delayedDispatches: delayedDispatches.length,
    completedToday: completedToday.length,
    activeDrivers,
    activeVehicles,
    avgAssignmentMinutes,
    currentConflicts: conflictTotal,
    trends: {
      activeDispatches: trend(
        countIn(current7, (d) => ACTIVE.includes(d.status)),
        countIn(previous7, (d) => ACTIVE.includes(d.status)),
      ),
      draftDispatches: trend(
        countIn(current7, (d) => d.status === 'DRAFT'),
        countIn(previous7, (d) => d.status === 'DRAFT'),
      ),
      delayedDispatches: trend(
        countIn(current7, (d) => isDelayed(d, now)),
        countIn(previous7, (d) => isDelayed(d, now)),
      ),
      completedToday: trend(
        countIn(current7, (d) => d.status === 'DELIVERED'),
        countIn(previous7, (d) => d.status === 'DELIVERED'),
      ),
      activeDrivers: trend(activeDrivers, board?.drivers.busy.length ?? activeDrivers),
      activeVehicles: trend(activeVehicles, board?.vehicles.busy.length ?? activeVehicles),
      avgAssignmentMinutes: trend(avgAssignmentMinutes, avgAssignmentMinutes),
      currentConflicts: trend(conflictTotal, Math.max(0, conflictTotal - 1)),
    },
  };

  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    byDay.set(dayKey(d), 0);
  }
  for (const dispatch of dispatches) {
    const key = dayKey(new Date(dispatch.pickupDateScheduled));
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const statusCounts = new Map<string, number>();
  for (const dispatch of dispatches) {
    statusCounts.set(dispatch.status, (statusCounts.get(dispatch.status) ?? 0) + 1);
  }

  const driverCounts = new Map<string, { id: string; label: string; count: number }>();
  for (const dispatch of activeDispatches) {
    const id = dispatch.driverId;
    if (!id) continue;
    const label = dispatch.driver
      ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}`.trim()
      : id.slice(0, 8);
    const row = driverCounts.get(id) ?? { id, label, count: 0 };
    row.count += 1;
    driverCounts.set(id, row);
  }

  const vehicleCounts = new Map<string, { id: string; label: string; count: number }>();
  for (const dispatch of activeDispatches) {
    const id = dispatch.vehicleId;
    if (!id) continue;
    const label = dispatch.vehicle?.plateNumber ?? dispatch.vehicle?.vehicleCode ?? id.slice(0, 8);
    const row = vehicleCounts.get(id) ?? { id, label, count: 0 };
    row.count += 1;
    vehicleCounts.set(id, row);
  }

  const delayReasonCounts = new Map<string, number>();
  for (const dispatch of delayedDispatches) {
    const reason = delayReasonFor(dispatch, now);
    delayReasonCounts.set(reason, (delayReasonCounts.get(reason) ?? 0) + 1);
  }

  const weekly = new Map<string, number>();
  for (let i = 7; i >= 0; i -= 1) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i * 7);
    weekly.set(weekKey(d), 0);
  }
  for (const dispatch of dispatches) {
    const key = weekKey(new Date(dispatch.createdAt));
    if (weekly.has(key)) weekly.set(key, (weekly.get(key) ?? 0) + 1);
  }

  const routeCounts = new Map<string, DispatchAnalyticsSnapshot['topDelayedRoutes'][0]>();
  for (const dispatch of delayedDispatches) {
    const from = dispatch.order?.pickupCity ?? '—';
    const to = dispatch.order?.deliveryCity ?? '—';
    const route = `${from} → ${to}`;
    const row = routeCounts.get(route) ?? { route, count: 0, sampleDispatchId: dispatch.id };
    row.count += 1;
    routeCounts.set(route, row);
  }

  const driversNeedingAttention: DispatchAnalyticsSnapshot['driversNeedingAttention'] = [];
  for (const row of [...driverCounts.values()].sort((a, b) => b.count - a.count)) {
    if (row.count >= 2) {
      driversNeedingAttention.push({
        id: row.id,
        name: row.label,
        reason: 'Multiple active dispatches',
        dispatchCount: row.count,
      });
    }
  }
  for (const d of board?.drivers.onLeave ?? []) {
    driversNeedingAttention.push({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`.trim(),
      reason: 'On leave',
      dispatchCount: 0,
    });
  }
  for (const dispatch of dispatches) {
    const entry = conflictsMap[dispatch.id];
    if (!entry) continue;
    const driverConflicts = activeConflicts(entry).filter((c) => c.category === 'driver');
    if (driverConflicts.length === 0 || !dispatch.driver) continue;
    if (driversNeedingAttention.some((r) => r.id === dispatch.driverId)) continue;
    driversNeedingAttention.push({
      id: dispatch.driverId,
      name: `${dispatch.driver.firstName} ${dispatch.driver.lastName}`.trim(),
      reason: driverConflicts[0]?.message ?? 'Driver conflict',
      dispatchCount: 1,
    });
  }

  const vehiclesNeedingMaintenance: DispatchAnalyticsSnapshot['vehiclesNeedingMaintenance'] = [
    ...(board?.vehicles.maintenance ?? []).map((v) => ({
      id: v.id,
      plate: v.plateNumber,
      status: 'MAINTENANCE',
    })),
  ];
  for (const dispatch of dispatches) {
    const entry = conflictsMap[dispatch.id];
    if (!entry || !dispatch.vehicle) continue;
    const vehicleConflicts = activeConflicts(entry).filter((c) => c.category === 'vehicle');
    if (vehicleConflicts.length === 0) continue;
    if (vehiclesNeedingMaintenance.some((v) => v.id === dispatch.vehicleId)) continue;
    vehiclesNeedingMaintenance.push({
      id: dispatch.vehicleId,
      plate: dispatch.vehicle.plateNumber,
      status: vehicleConflicts[0]?.type ?? 'ATTENTION',
    });
  }

  const unassignedDispatches: DispatchAnalyticsSnapshot['unassignedDispatches'] = (
    board?.unassignedOrders ?? []
  ).slice(0, 8).map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    route: `${o.pickupCity} → ${o.deliveryCity}`,
    pickupDate: o.pickupDate,
  }));

  const insights = buildInsights({
    dispatches,
    board,
    conflictsMap,
    kpis,
    driverCounts,
    vehicleCounts,
    delayedDispatches,
    now,
  });

  return {
    kpis,
    dispatchesByDay: [...byDay.entries()].map(([label, value]) => ({ label, value })),
    dispatchesByStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    driverWorkload: [...driverCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    vehicleUtilization: [...vehicleCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    delayReasons: [...delayReasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    weeklyVolume: [...weekly.entries()].map(([label, value]) => ({ label, value })),
    topDelayedRoutes: [...routeCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    driversNeedingAttention: driversNeedingAttention.slice(0, 6),
    vehiclesNeedingMaintenance: vehiclesNeedingMaintenance.slice(0, 6),
    unassignedDispatches,
    conflictSummary: {
      total: conflictTotal,
      critical: conflictCritical,
      high: conflictHigh,
      medium: conflictMedium,
      low: conflictLow,
      byType: [...typeCounts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    },
    insights,
    generatedAt: now.toISOString(),
  };
}

function buildInsights(args: {
  dispatches: ApiDispatch[];
  board: BuildDispatchAnalyticsInput['board'];
  conflictsMap: BuildDispatchAnalyticsInput['conflictsByDispatchId'];
  kpis: DispatchAnalyticsKpis;
  driverCounts: Map<string, { id: string; label: string; count: number }>;
  vehicleCounts: Map<string, { id: string; label: string; count: number }>;
  delayedDispatches: ApiDispatch[];
  now: Date;
}): DispatchAnalyticsInsight[] {
  const insights: DispatchAnalyticsInsight[] = [];
  const { board, kpis, driverCounts, vehicleCounts, delayedDispatches, conflictsMap, dispatches } =
    args;

  const overloaded = [...driverCounts.values()].find((d) => d.count >= 2);
  if (overloaded) {
    insights.push({
      id: 'driver-overloaded',
      title: 'Driver overloaded',
      detail: `${overloaded.label} has ${overloaded.count} active dispatches. Rebalance workload or reschedule overlaps.`,
      severity: 'warning',
      actionLabel: 'Open board',
      actionTo: '/app/dispatches/board',
    });
  }

  const availableVehicles = board?.vehicles.available.length ?? 0;
  const totalVehicles =
    availableVehicles +
    (board?.vehicles.busy.length ?? 0) +
    (board?.vehicles.maintenance.length ?? 0);
  if (totalVehicles > 0 && availableVehicles / totalVehicles >= 0.5) {
    insights.push({
      id: 'vehicle-underutilized',
      title: 'Vehicle underutilized',
      detail: `${availableVehicles} of ${totalVehicles} vehicles are idle. Consider consolidating routes or assigning pending orders.`,
      severity: 'info',
      actionLabel: 'View unassigned',
      actionTo: '/app/dispatches',
      actionSearch: { tab: 'action' },
    });
  }

  const routeBuckets = new Map<string, number>();
  for (const d of delayedDispatches) {
    const route = `${d.order?.pickupCity ?? '—'} → ${d.order?.deliveryCity ?? '—'}`;
    routeBuckets.set(route, (routeBuckets.get(route) ?? 0) + 1);
  }
  const congested = [...routeBuckets.entries()].sort((a, b) => b[1] - a[1])[0];
  if (congested && congested[1] >= 2) {
    insights.push({
      id: 'route-congestion',
      title: 'Route congestion',
      detail: `${congested[0]} has ${congested[1]} delayed dispatches. Review pickup windows and driver allocation.`,
      severity: 'warning',
      actionLabel: 'Review delays',
      actionTo: '/app/dispatches',
      actionSearch: { tab: 'action' },
    });
  }

  if ((board?.unassignedOrders.length ?? 0) > 0 && (board?.drivers.available.length ?? 0) > 0) {
    const order = board!.unassignedOrders[0]!;
    const driver = board!.drivers.available[0]!;
    insights.push({
      id: 'assignment-rec',
      title: 'Assignment recommendation',
      detail: `Assign ${driver.firstName} ${driver.lastName} to ${order.orderNumber} (${order.pickupCity} → ${order.deliveryCity}).`,
      severity: 'info',
      actionLabel: 'Create dispatch',
      actionTo: '/app/dispatches',
      actionSearch: { create: true, orderId: order.id },
    });
  }

  if (kpis.currentConflicts > 0) {
    const worst = dispatches
      .map((d) => ({ d, entry: conflictsMap[d.id] }))
      .filter((x) => x.entry && activeConflicts(x.entry).length > 0)
      .sort((a, b) => {
        const sa = highestActiveSeverity(a.entry!) ?? 'low';
        const sb = highestActiveSeverity(b.entry!) ?? 'low';
        const rank = { critical: 4, high: 3, medium: 2, low: 1 };
        return rank[sb] - rank[sa];
      })[0];
    if (worst) {
      insights.push({
        id: 'conflict-attention',
        title: 'Conflict requires attention',
        detail: `${worst.d.dispatchNumber} has ${activeConflicts(worst.entry!).length} unresolved conflict(s). Open the dispatch to review engine recommendations.`,
        severity: 'critical',
        actionLabel: 'Open dispatch',
        actionTo: '/app/dispatches/$dispatchId',
        actionParams: { dispatchId: worst.d.id },
      });
    }
  }

  if (vehicleCounts.size > 0 && [...vehicleCounts.values()].every((v) => v.count <= 1) && availableVehicles === 0) {
    insights.push({
      id: 'fleet-maxed',
      title: 'Fleet at capacity',
      detail: 'All available vehicles are committed. Delay new assignments or release completed dispatches first.',
      severity: 'warning',
      actionLabel: 'Fleet status',
      actionTo: '/app/dispatches/board',
    });
  }

  return insights.slice(0, 6);
}
