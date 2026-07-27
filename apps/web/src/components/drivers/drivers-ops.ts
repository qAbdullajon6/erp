'use client';

import type { Driver, DriverStatus } from '@/lib/api/drivers';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';

export const LIVE_DISPATCH: DispatchStatus[] = [
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
];

const LICENSE_WARN_DAYS = 30;

export type BadgeTier = 'primary' | 'secondary' | 'warning' | 'critical';

export type DriverOpsBadge = {
  key: string;
  label: string;
  tier: BadgeTier;
  className: string;
};

export type DriverOpsContext = {
  liveDispatch: ApiDispatch | null;
  completedCount: number;
  cancelledCount: number;
  activeCount: number;
};

const TIER_CLASS: Record<BadgeTier, string> = {
  primary: 'bg-success/15 text-success ring-1 ring-inset ring-success/25',
  secondary: 'bg-brand/12 text-brand ring-1 ring-inset ring-brand/20',
  warning: 'bg-warning/15 text-warning ring-1 ring-inset ring-warning/25',
  critical: 'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25',
};

export function isLicenseExpiring(
  licenseExpiry: string | null | undefined,
  withinDays = LICENSE_WARN_DAYS,
): boolean {
  if (!licenseExpiry) return false;
  const expiry = new Date(licenseExpiry);
  if (Number.isNaN(expiry.getTime())) return false;
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + withinDays);
  return expiry >= now && expiry <= limit;
}

export function isLicenseExpired(licenseExpiry: string | null | undefined): boolean {
  if (!licenseExpiry) return false;
  const expiry = new Date(licenseExpiry);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry < new Date();
}

export function isWorkingToday(dispatch: ApiDispatch | null): boolean {
  if (!dispatch) return false;
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const inToday = (iso: string) => {
    const dt = new Date(iso);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  };
  return inToday(dispatch.pickupDateScheduled) || inToday(dispatch.deliveryDateScheduled);
}

export function isDispatchLate(dispatch: ApiDispatch | null): boolean {
  if (!dispatch || !LIVE_DISPATCH.includes(dispatch.status)) return false;
  return new Date(dispatch.deliveryDateScheduled) < new Date();
}

/// Operational availability label derived from driver.status + live dispatch (real data only).
export function driverAvailabilityLabel(
  driver: Driver,
  live: ApiDispatch | null,
): { label: string; tone: 'success' | 'brand' | 'warning' | 'muted' | 'danger'; tier: BadgeTier } {
  if (driver.archivedAt) return { label: 'Archived', tone: 'danger', tier: 'critical' };
  if (driver.status === 'ON_LEAVE') return { label: 'Resting', tone: 'warning', tier: 'secondary' };
  if (driver.status === 'INACTIVE') return { label: 'Inactive', tone: 'muted', tier: 'warning' };
  if (live) {
    if (live.status === 'IN_TRANSIT') return { label: 'Driving', tone: 'brand', tier: 'primary' };
    if (live.status === 'AT_PICKUP' || live.status === 'EN_ROUTE_TO_PICKUP') {
      return { label: 'Waiting pickup', tone: 'brand', tier: 'secondary' };
    }
    return { label: 'On assignment', tone: 'brand', tier: 'secondary' };
  }
  return { label: 'Available', tone: 'success', tier: 'primary' };
}

/// Dispatch phase label for the center column (secondary hierarchy).
export function dispatchPhaseLabel(live: ApiDispatch | null): string | null {
  if (!live) return null;
  switch (live.status) {
    case 'IN_TRANSIT':
      return 'Driving';
    case 'AT_PICKUP':
    case 'EN_ROUTE_TO_PICKUP':
      return 'Waiting pickup';
    case 'ASSIGNED':
      return 'On assignment';
    default:
      return null;
  }
}

export function buildDriverOpsIndex(dispatches: ApiDispatch[]): Map<string, DriverOpsContext> {
  const map = new Map<string, DriverOpsContext>();
  const ensure = (id: string) => {
    let row = map.get(id);
    if (!row) {
      row = { liveDispatch: null, completedCount: 0, cancelledCount: 0, activeCount: 0 };
      map.set(id, row);
    }
    return row;
  };

  for (const d of dispatches) {
    if (!d.driverId) continue;
    const row = ensure(d.driverId);
    if (LIVE_DISPATCH.includes(d.status)) {
      row.activeCount += 1;
      if (!row.liveDispatch) row.liveDispatch = d;
    } else if (d.status === 'DELIVERED') {
      row.completedCount += 1;
    } else if (d.status === 'CANCELLED') {
      row.cancelledCount += 1;
    }
  }
  return map;
}

export function driverInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';
}

function badge(key: string, label: string, tier: BadgeTier): DriverOpsBadge {
  return { key, label, tier, className: TIER_CLASS[tier] };
}

/// Primary roster/ops chip — one clear answer to “what is he doing now?”
export function driverPrimaryBadge(driver: Driver, live: ApiDispatch | null): DriverOpsBadge {
  const avail = driverAvailabilityLabel(driver, live);
  if (driver.archivedAt) return badge('archived', 'Archived', 'critical');
  if (driver.status === 'ON_LEAVE') return badge('resting', 'Resting', 'secondary');
  if (driver.status === 'INACTIVE') return badge('inactive', 'Inactive', 'warning');
  if (live?.status === 'IN_TRANSIT') return badge('driving', 'Driving', 'primary');
  if (live) {
    const phase = dispatchPhaseLabel(live);
    if (phase === 'Waiting pickup') return badge('waiting', 'Waiting pickup', 'secondary');
    return badge('assigned', 'On assignment', 'secondary');
  }
  if (driver.status === 'ACTIVE') return badge('available', 'Available', 'primary');
  return badge('status', avail.label, avail.tier);
}

/// Risk / exception badges only — never duplicates the primary chip.
export function driverRiskBadges(driver: Driver, live: ApiDispatch | null): DriverOpsBadge[] {
  const badges: DriverOpsBadge[] = [];
  if (driver.archivedAt) return [badge('archived', 'Archived', 'critical')];

  if (live && !live.vehicle) {
    badges.push(badge('novehicle', 'No vehicle', 'warning'));
  }
  if (!live && driver.status === 'ACTIVE') {
    badges.push(badge('nodisp', 'No dispatch', 'secondary'));
  }
  if (isLicenseExpired(driver.licenseExpiry)) {
    badges.push(badge('licexp', 'License expired', 'critical'));
  } else if (isLicenseExpiring(driver.licenseExpiry)) {
    badges.push(badge('licwarn', 'License expiring', 'warning'));
  }
  if (isDispatchLate(live)) {
    badges.push(badge('late', 'Late delivery', 'critical'));
  }
  if (live?.status === 'CANCELLED') {
    badges.push(badge('cancelled', 'Cancelled', 'critical'));
  }
  if (isWorkingToday(live)) {
    badges.push(badge('today', 'Working today', 'secondary'));
  }
  return badges;
}

export type DriverTimelineItem = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  kind: 'account' | 'dispatch' | 'vehicle' | 'status' | 'done' | 'cancel';
};

/// Merge real events from driver + dispatches + statusHistory. No invented events.
export function buildDriverTimeline(
  driver: Driver,
  dispatches: ApiDispatch[],
): DriverTimelineItem[] {
  const items: DriverTimelineItem[] = [];

  items.push({
    id: `created-${driver.id}`,
    at: driver.createdAt,
    title: 'Driver created',
    detail: driver.employeeCode,
    kind: 'account',
  });

  for (const d of dispatches) {
    items.push({
      id: `disp-created-${d.id}`,
      at: d.createdAt,
      title: 'Dispatch assigned',
      detail: [
        d.dispatchNumber,
        d.order?.orderNumber,
        d.vehicle?.plateNumber ? `Vehicle ${d.vehicle.plateNumber}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      kind: 'dispatch',
    });

    if (d.vehicle?.plateNumber) {
      items.push({
        id: `veh-assigned-${d.id}`,
        at: d.createdAt,
        title: 'Vehicle assigned',
        detail: `${d.vehicle.plateNumber}${d.vehicle.type ? ` · ${d.vehicle.type}` : ''}`,
        kind: 'vehicle',
      });
    }

    for (const entry of d.statusHistory ?? []) {
      if (entry.status === 'ASSIGNED' && entry.createdAt === d.createdAt) continue;
      const kind: DriverTimelineItem['kind'] =
        entry.status === 'DELIVERED'
          ? 'done'
          : entry.status === 'CANCELLED'
            ? 'cancel'
            : 'status';
      items.push({
        id: `hist-${entry.id}`,
        at: entry.createdAt,
        title:
          entry.status === 'DELIVERED'
            ? 'Dispatch completed'
            : entry.status === 'CANCELLED'
              ? 'Dispatch cancelled'
              : 'Status changed',
        detail: [
          d.dispatchNumber,
          entry.status.replace(/_/g, ' '),
          entry.note,
        ]
          .filter(Boolean)
          .join(' · '),
        kind,
      });
    }

    if (d.status === 'DELIVERED' && d.deliveryDateActual) {
      const already = items.some(
        (i) => i.id.startsWith(`hist-`) && i.title === 'Dispatch completed' && i.detail?.includes(d.dispatchNumber),
      );
      if (!already) {
        items.push({
          id: `delivered-${d.id}`,
          at: d.deliveryDateActual,
          title: 'Dispatch completed',
          detail: d.dispatchNumber,
          kind: 'done',
        });
      }
    }
  }

  // Dedupe identical title+at+detail (e.g. vehicle assigned same instant as dispatch).
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.at}|${item.title}|${item.detail ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 30);
}

export function computableSuccessRate(completed: number, cancelled: number): number | null {
  const denom = completed + cancelled;
  if (denom <= 0) return null;
  return Math.round((completed / denom) * 100);
}

export function statusToFilter(status: DriverStatus | 'ARCHIVED' | 'ALL'): {
  status?: DriverStatus;
  includeArchived?: boolean;
} {
  if (status === 'ALL') return { includeArchived: false };
  if (status === 'ARCHIVED') return { status: undefined, includeArchived: true };
  return { status, includeArchived: false };
}
