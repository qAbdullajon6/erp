export const CONFLICT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type ConflictSeverity = (typeof CONFLICT_SEVERITIES)[number];

export const CONFLICT_CATEGORIES = [
  "driver",
  "vehicle",
  "schedule",
  "capacity",
  "business",
  "operational",
] as const;
export type ConflictCategory = (typeof CONFLICT_CATEGORIES)[number];

export const CONFLICT_TYPES = [
  "driver.assigned",
  "driver.unavailable",
  "driver.inactive",
  "driver.on_leave",
  "driver.license_expired",
  "vehicle.assigned",
  "vehicle.unavailable",
  "vehicle.inactive",
  "vehicle.maintenance",
  "vehicle.inspection_expired",
  "vehicle.insurance_expired",
  "schedule.pickup_overlap",
  "schedule.delivery_overlap",
  "schedule.dispatch_overlap",
  "schedule.late_pickup",
  "schedule.late_delivery",
  "schedule.travel_impossible",
  "capacity.weight",
  "capacity.volume",
  "business.dispatch_cancelled",
  "business.dispatch_completed",
  "business.order_closed",
  "business.customer_blocked",
  "business.credit_hold",
  "operational.utilization",
] as const;
export type ConflictType = (typeof CONFLICT_TYPES)[number];

export const CONFLICT_ACTIONS = [
  "swap_driver",
  "swap_vehicle",
  "reschedule",
  "larger_vehicle",
  "contact_finance",
  "ignore",
  "recheck",
] as const;
export type ConflictAction = (typeof CONFLICT_ACTIONS)[number];

export interface ConflictRecommendation {
  action: ConflictAction;
  label: string;
  description?: string;
  payload?: Record<string, unknown>;
}

export interface DispatchConflict {
  id: string;
  type: ConflictType;
  category: ConflictCategory;
  severity: ConflictSeverity;
  message: string;
  description: string;
  recommendation: string;
  recommendations: ConflictRecommendation[];
  autoResolvable: boolean;
  ignored: boolean;
  resolved: boolean;
  detectedAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  details?: Record<string, unknown>;
}

export interface DispatchConflictSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unresolved: number;
}

export interface DispatchConflictsResponse {
  dispatchId: string;
  items: DispatchConflict[];
  summary: DispatchConflictSummary;
  checkedAt: string;
}

export function conflictCategory(type: ConflictType): ConflictCategory {
  const prefix = type.split(".")[0];
  if (CONFLICT_CATEGORIES.includes(prefix as ConflictCategory)) {
    return prefix as ConflictCategory;
  }
  return "operational";
}

export function summarizeConflicts(items: DispatchConflict[]): DispatchConflictSummary {
  const active = items.filter((c) => !c.ignored && !c.resolved);
  return {
    total: items.length,
    critical: active.filter((c) => c.severity === "critical").length,
    high: active.filter((c) => c.severity === "high").length,
    medium: active.filter((c) => c.severity === "medium").length,
    low: active.filter((c) => c.severity === "low").length,
    unresolved: active.length,
  };
}

const SEVERITY_RANK: Record<ConflictSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function highestConflictSeverity(
  conflicts: Pick<DispatchConflict, "severity">[],
): ConflictSeverity | null {
  if (conflicts.length === 0) return null;
  return conflicts.reduce(
    (best, conflict) =>
      SEVERITY_RANK[conflict.severity] > SEVERITY_RANK[best] ? conflict.severity : best,
    conflicts[0]!.severity,
  );
}
