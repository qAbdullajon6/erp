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

  // Orders
  PENDING: 'warning',
  ASSIGNED: 'brand',
  PICKED_UP: 'brand',
  IN_TRANSIT: 'brand',
  DELIVERED: 'success',

  // Dispatch
  EN_ROUTE_TO_PICKUP: 'brand',
  AT_PICKUP: 'brand',

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

  // Finance
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  SENT: 'brand',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? 'muted';
}

/** Renders `IN_TRANSIT` as `In Transit`. */
export function statusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {statusLabel(status)}
    </Badge>
  );
}
