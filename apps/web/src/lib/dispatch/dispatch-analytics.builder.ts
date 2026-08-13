import { activeConflicts, highestActiveSeverity } from '@/lib/api/dispatch-conflicts';
import type {
  BuildDispatchAnalyticsInsightsInput,
  DispatchAnalyticsInsight,
  DispatchAnalyticsInsightsSnapshot,
} from './dispatch-analytics.types';

/// The board/conflict-derived half of Dispatch Analytics — see the file
/// comment in dispatch-analytics.types.ts for why this stays client-side
/// while KPIs/trends/historical charts moved to DispatchAnalyticsService.
export function buildDispatchAnalyticsInsights(
  input: BuildDispatchAnalyticsInsightsInput,
): DispatchAnalyticsInsightsSnapshot {
  const now = input.now ?? new Date();
  const { activeDispatches, board, conflictsByDispatchId: conflictsMap, topDelayedRoutes } = input;

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

  let conflictTotal = 0;
  let conflictCritical = 0;
  let conflictHigh = 0;
  let conflictMedium = 0;
  let conflictLow = 0;
  const typeCounts = new Map<string, number>();
  for (const dispatch of activeDispatches) {
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

  const driversNeedingAttention: DispatchAnalyticsInsightsSnapshot['driversNeedingAttention'] = [];
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
  for (const dispatch of activeDispatches) {
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

  const vehiclesNeedingMaintenance: DispatchAnalyticsInsightsSnapshot['vehiclesNeedingMaintenance'] = [
    ...(board?.vehicles.maintenance ?? []).map((v) => ({
      id: v.id,
      plate: v.plateNumber,
      status: 'MAINTENANCE',
    })),
  ];
  for (const dispatch of activeDispatches) {
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

  const unassignedDispatches: DispatchAnalyticsInsightsSnapshot['unassignedDispatches'] = (
    board?.unassignedOrders ?? []
  ).slice(0, 8).map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    route: `${o.pickupCity} → ${o.deliveryCity}`,
    pickupDate: o.pickupDate,
  }));

  const conflictSummary: DispatchAnalyticsInsightsSnapshot['conflictSummary'] = {
    total: conflictTotal,
    critical: conflictCritical,
    high: conflictHigh,
    medium: conflictMedium,
    low: conflictLow,
    byType: [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };

  const insights = buildInsights({
    dispatches: activeDispatches,
    board,
    conflictsMap,
    conflictTotal,
    driverCounts,
    vehicleCounts,
    topDelayedRoutes,
    now,
  });

  return {
    driversNeedingAttention: driversNeedingAttention.slice(0, 6),
    vehiclesNeedingMaintenance: vehiclesNeedingMaintenance.slice(0, 6),
    unassignedDispatches,
    conflictSummary,
    insights,
    generatedAt: now.toISOString(),
  };
}

function buildInsights(args: {
  dispatches: BuildDispatchAnalyticsInsightsInput['activeDispatches'];
  board: BuildDispatchAnalyticsInsightsInput['board'];
  conflictsMap: BuildDispatchAnalyticsInsightsInput['conflictsByDispatchId'];
  conflictTotal: number;
  driverCounts: Map<string, { id: string; label: string; count: number }>;
  vehicleCounts: Map<string, { id: string; label: string; count: number }>;
  topDelayedRoutes: BuildDispatchAnalyticsInsightsInput['topDelayedRoutes'];
  now: Date;
}): DispatchAnalyticsInsight[] {
  const insights: DispatchAnalyticsInsight[] = [];
  const { board, driverCounts, vehicleCounts, conflictTotal, conflictsMap, dispatches, topDelayedRoutes } = args;

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

  const congested = topDelayedRoutes[0];
  if (congested && congested.count >= 2) {
    insights.push({
      id: 'route-congestion',
      title: 'Route congestion',
      detail: `${congested.route} has ${congested.count} delayed dispatches. Review pickup windows and driver allocation.`,
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

  if (conflictTotal > 0) {
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
