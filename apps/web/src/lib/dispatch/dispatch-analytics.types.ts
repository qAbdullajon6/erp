import type { ApiDispatch } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';
import type { DispatchConflictsResponse } from '@/lib/api/dispatch-conflicts';

export type DispatchAnalyticsFilter =
  | 'all'
  | 'active'
  | 'draft'
  | 'delayed'
  | 'completed_today'
  | 'conflicts';

export interface DispatchAnalyticsTrend {
  label: string;
  direction: 'up' | 'down' | 'flat';
}

export interface DispatchAnalyticsKpis {
  activeDispatches: number;
  draftDispatches: number;
  delayedDispatches: number;
  completedToday: number;
  activeDrivers: number;
  activeVehicles: number;
  avgAssignmentMinutes: number;
  currentConflicts: number;
  trends: {
    activeDispatches: DispatchAnalyticsTrend;
    draftDispatches: DispatchAnalyticsTrend;
    delayedDispatches: DispatchAnalyticsTrend;
    completedToday: DispatchAnalyticsTrend;
    activeDrivers: DispatchAnalyticsTrend;
    activeVehicles: DispatchAnalyticsTrend;
    avgAssignmentMinutes: DispatchAnalyticsTrend;
    currentConflicts: DispatchAnalyticsTrend;
  };
}

export interface DispatchAnalyticsChartPoint {
  label: string;
  value: number;
}

export interface DispatchAnalyticsStatusPoint {
  status: string;
  count: number;
}

export interface DispatchAnalyticsWorkloadRow {
  id: string;
  label: string;
  count: number;
}

export interface DispatchAnalyticsDelayReason {
  reason: string;
  count: number;
}

export interface DispatchAnalyticsRouteRow {
  route: string;
  count: number;
  sampleDispatchId?: string;
}

export interface DispatchAnalyticsAttentionDriver {
  id: string;
  name: string;
  reason: string;
  dispatchCount: number;
}

export interface DispatchAnalyticsMaintenanceVehicle {
  id: string;
  plate: string;
  status: string;
}

export interface DispatchAnalyticsUnassignedRow {
  orderId: string;
  orderNumber: string;
  customerName?: string | null;
  route: string;
  pickupDate: string;
}

export interface DispatchAnalyticsConflictSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byType: Array<{ type: string; count: number }>;
}

export type DispatchInsightSeverity = 'info' | 'warning' | 'critical';

export interface DispatchAnalyticsInsight {
  id: string;
  title: string;
  detail: string;
  severity: DispatchInsightSeverity;
  actionLabel?: string;
  actionHref?: string;
  actionTo?: '/app/dispatches/board' | '/app/dispatches' | '/app/dispatches/$dispatchId';
  actionSearch?: Record<string, string | boolean>;
  actionParams?: { dispatchId: string };
}

export interface DispatchAnalyticsSnapshot {
  kpis: DispatchAnalyticsKpis;
  dispatchesByDay: DispatchAnalyticsChartPoint[];
  dispatchesByStatus: DispatchAnalyticsStatusPoint[];
  driverWorkload: DispatchAnalyticsWorkloadRow[];
  vehicleUtilization: DispatchAnalyticsWorkloadRow[];
  delayReasons: DispatchAnalyticsDelayReason[];
  weeklyVolume: DispatchAnalyticsChartPoint[];
  topDelayedRoutes: DispatchAnalyticsRouteRow[];
  driversNeedingAttention: DispatchAnalyticsAttentionDriver[];
  vehiclesNeedingMaintenance: DispatchAnalyticsMaintenanceVehicle[];
  unassignedDispatches: DispatchAnalyticsUnassignedRow[];
  conflictSummary: DispatchAnalyticsConflictSummary;
  insights: DispatchAnalyticsInsight[];
  generatedAt: string;
}

export interface BuildDispatchAnalyticsInput {
  dispatches: ApiDispatch[];
  board: DispatchBoardSummary | null;
  conflictsByDispatchId: Record<string, DispatchConflictsResponse>;
  now?: Date;
}
