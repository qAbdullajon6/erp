'use client';

import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'success' | 'warning' | 'muted' | 'brand' | 'danger';

/// Single source of truth for how a domain status is coloured, so the same
/// status never renders green on one screen and grey on another. Statuses are
/// grouped by meaning rather than by module: terminal-good (DELIVERED, PAID,
/// ACTIVE) is success, in-flight is brand, waiting is warning, and
/// failed/cancelled/archived is danger.
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  // Shared / lifecycle
  ACTIVE: 'success',
  INACTIVE: 'muted',
  ARCHIVED: 'danger',
  DRAFT: 'muted',
  CANCELLED: 'danger',
  DELAYED: 'danger',

  // Orders
  PENDING: 'warning',
  ASSIGNED: 'brand',
  PICKED_UP: 'brand',
  IN_TRANSIT: 'brand',
  DELIVERED: 'success',

  // Dispatch
  EN_ROUTE_TO_PICKUP: 'brand',
  AT_PICKUP: 'brand',
  ARRIVED_AT_DELIVERY: 'warning',
  DELIVERY_FAILED: 'danger',

  // Drivers
  ON_LEAVE: 'warning',

  // Vehicles
  AVAILABLE: 'success',
  IN_USE: 'brand',
  MAINTENANCE: 'warning',

  // Customers
  AT_RISK: 'warning',

  // Memberships
  INVITED: 'brand',
  REMOVED: 'danger',

  // Sales leads
  NEW: 'brand',
  CONTACTED: 'warning',
  QUALIFIED: 'success',
  CLOSED: 'muted',

  // Finance
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  SENT: 'brand',
  APPROVED: 'success',
  REJECTED: 'danger',

  // Billing / subscriptions — ACTIVE/CANCELLED already covered above under
  // lifecycle. TRIAL is in-flight (brand), a suspended plan is a warning the
  // operator must act on, an expired one is terminal-bad.
  TRIAL: 'brand',
  SUSPENDED: 'warning',
  EXPIRED: 'danger',

  // Workflow executions — CANCELLED already covered above under lifecycle.
  QUEUED: 'warning',
  RUNNING: 'brand',
  COMPLETED: 'success',
  FAILED: 'danger',
  TIMED_OUT: 'danger',
};

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? 'muted';
}

/// Title-casing every word turns an acronym into a word: SALES_CRM_MANAGER
/// read as "Sales Crm Manager" in the role picker and on every member row.
const ACRONYMS = new Set(['API', 'CRM', 'ETA', 'GPS', 'ID', 'KPI', 'POD', 'SMS', 'VAT']);

/** Renders `IN_TRANSIT` as `In Transit`, and `SALES_CRM_MANAGER` as `Sales CRM Manager`. */
export function statusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => (ACRONYMS.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(' ');
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {statusLabel(status)}
    </Badge>
  );
}
