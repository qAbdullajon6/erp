import type { ApiDispatch } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';
import type { DispatchConflictsResponse } from '@/lib/api/dispatch-conflicts';
import type { DispatchAnalyticsRouteRow } from '@/lib/api/dispatch-analytics';

/// Everything in this file is the CLIENT half of Dispatch Analytics —
/// board/conflict-derived operational recommendations that describe "right
/// now" and genuinely have no historical-aggregation equivalent (a
/// recommendation isn't a number you can bucket by day). Every KPI, trend,
/// and chart that IS a real aggregate now comes from the backend
/// (DispatchAnalyticsService via lib/api/dispatch-analytics.ts) — see
/// dispatch-analytics.builder.ts for why this half stays client-side.

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

export interface DispatchAnalyticsInsightsSnapshot {
  driversNeedingAttention: DispatchAnalyticsAttentionDriver[];
  vehiclesNeedingMaintenance: DispatchAnalyticsMaintenanceVehicle[];
  unassignedDispatches: DispatchAnalyticsUnassignedRow[];
  conflictSummary: DispatchAnalyticsConflictSummary;
  insights: DispatchAnalyticsInsight[];
  generatedAt: string;
}

export interface BuildDispatchAnalyticsInsightsInput {
  /// Every non-terminal dispatch (DRAFT and every ACTIVE status), fetched
  /// with `statuses=<non-terminal set>` — NOT a fixed-size recent slice.
  /// Every insight here describes an actionable, live situation, so it must
  /// see every open dispatch, not the 200 most recently scheduled regardless
  /// of whether they're still open. Bounded in practice by fleet capacity
  /// (an org can't have more concurrently-open dispatches than it has
  /// driver/vehicle pairs to run them), not by total historical volume.
  activeDispatches: ApiDispatch[];
  board: DispatchBoardSummary | null;
  conflictsByDispatchId: Record<string, DispatchConflictsResponse>;
  /// Backend-computed (DispatchAnalyticsService.computeDelayed), not
  /// re-derived client-side — one implementation of "what counts as late".
  topDelayedRoutes: DispatchAnalyticsRouteRow[];
  now?: Date;
}
