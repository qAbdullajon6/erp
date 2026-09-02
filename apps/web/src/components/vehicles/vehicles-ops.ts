'use client';

import type { Vehicle, VehicleStatus } from '@/lib/api/vehicles';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';

export const LIVE_DISPATCH: DispatchStatus[] = [
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
];

const DOC_WARN_DAYS = 30;

export type BadgeTier = 'primary' | 'secondary' | 'warning' | 'critical';

export type VehicleOpsBadge = {
  key: string;
  label: string;
  tier: BadgeTier;
  className: string;
};

export type VehicleOpsContext = {
  liveDispatch: ApiDispatch | null;
  completedCount: number;
  cancelledCount: number;
  activeCount: number;
};

export type OrderCargo = {
  cargoWeightKg: string | null;
  cargoVolumeM3: string | null;
};

const TIER_CLASS: Record<BadgeTier, string> = {
  primary: 'bg-success/15 text-success ring-1 ring-inset ring-success/25',
  secondary: 'bg-brand/12 text-brand ring-1 ring-inset ring-brand/20',
  warning: 'bg-warning/15 text-warning ring-1 ring-inset ring-warning/25',
  critical: 'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25',
};

export function isDateExpiring(iso: string | null | undefined, withinDays = DOC_WARN_DAYS): boolean {
  if (!iso) return false;
  const expiry = new Date(iso);
  if (Number.isNaN(expiry.getTime())) return false;
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + withinDays);
  return expiry >= now && expiry <= limit;
}

export function isDateExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const expiry = new Date(iso);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry < new Date();
}

export function isDispatchLate(dispatch: ApiDispatch | null): boolean {
  if (!dispatch || !LIVE_DISPATCH.includes(dispatch.status)) return false;
  return new Date(dispatch.deliveryDateScheduled) < new Date();
}

export function formatCapacity(capacityKg: string | null, capacityM3: string | null): string {
  if (!capacityKg && !capacityM3) return '—';
  const parts: string[] = [];
  if (capacityKg) parts.push(`${capacityKg} kg`);
  if (capacityM3) parts.push(`${capacityM3} m³`);
  return parts.join(' · ');
}

export function makeModelLabel(vehicle: Vehicle): string | null {
  const parts = [vehicle.make, vehicle.model, vehicle.year != null ? String(vehicle.year) : null].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

/// Over capacity only when both sides have numeric values from the API.
export function isOverCapacity(vehicle: Vehicle, cargo: OrderCargo | null | undefined): boolean {
  if (!cargo) return false;
  const weight = cargo.cargoWeightKg != null ? Number(cargo.cargoWeightKg) : NaN;
  const volume = cargo.cargoVolumeM3 != null ? Number(cargo.cargoVolumeM3) : NaN;
  const capKg = vehicle.capacityKg != null ? Number(vehicle.capacityKg) : NaN;
  const capM3 = vehicle.capacityM3 != null ? Number(vehicle.capacityM3) : NaN;
  if (Number.isFinite(capKg) && Number.isFinite(weight) && weight > capKg) return true;
  if (Number.isFinite(capM3) && Number.isFinite(volume) && volume > capM3) return true;
  return false;
}

export function vehicleAvailabilityLabel(
  vehicle: Vehicle,
  live: ApiDispatch | null,
): { label: string; tone: 'success' | 'brand' | 'warning' | 'muted' | 'danger'; tier: BadgeTier } {
  if (vehicle.archivedAt) return { label: 'Archived', tone: 'danger', tier: 'critical' };
  if (vehicle.status === 'MAINTENANCE') {
    return { label: 'Out of service', tone: 'warning', tier: 'critical' };
  }
  if (vehicle.status === 'INACTIVE') return { label: 'Idle', tone: 'muted', tier: 'secondary' };
  if (live) {
    if (live.status === 'IN_TRANSIT') return { label: 'Driving', tone: 'brand', tier: 'primary' };
    if (live.status === 'AT_PICKUP') return { label: 'Loading', tone: 'brand', tier: 'secondary' };
    if (live.status === 'EN_ROUTE_TO_PICKUP') {
      return { label: 'Assigned', tone: 'brand', tier: 'primary' };
    }
    return { label: 'Assigned', tone: 'brand', tier: 'primary' };
  }
  if (vehicle.status === 'IN_USE') return { label: 'Assigned', tone: 'brand', tier: 'primary' };
  return { label: 'Available', tone: 'success', tier: 'primary' };
}

export function buildVehicleOpsIndex(dispatches: ApiDispatch[]): Map<string, VehicleOpsContext> {
  const map = new Map<string, VehicleOpsContext>();
  const ensure = (id: string) => {
    let row = map.get(id);
    if (!row) {
      row = { liveDispatch: null, completedCount: 0, cancelledCount: 0, activeCount: 0 };
      map.set(id, row);
    }
    return row;
  };

  for (const d of dispatches) {
    const vehicleId = d.vehicle?.id ?? d.vehicleId;
    if (!vehicleId) continue;
    const row = ensure(vehicleId);
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

export function vehicleInitials(plateNumber: string): string {
  const clean = plateNumber.replace(/[^A-Za-z0-9]/g, '');
  return (clean.slice(0, 2) || 'V').toUpperCase();
}

function badge(key: string, label: string, tier: BadgeTier): VehicleOpsBadge {
  return { key, label, tier, className: TIER_CLASS[tier] };
}

export function vehiclePrimaryBadge(vehicle: Vehicle, live: ApiDispatch | null): VehicleOpsBadge {
  const avail = vehicleAvailabilityLabel(vehicle, live);
  if (vehicle.archivedAt) return badge('archived', 'Archived', 'critical');
  if (vehicle.status === 'MAINTENANCE') return badge('oos', 'Out of service', 'critical');
  if (vehicle.status === 'INACTIVE') return badge('idle', 'Idle', 'secondary');
  if (live?.status === 'IN_TRANSIT') return badge('driving', 'Driving', 'primary');
  if (live?.status === 'AT_PICKUP') return badge('loading', 'Loading', 'secondary');
  if (live || vehicle.status === 'IN_USE') return badge('assigned', 'Assigned', 'primary');
  return badge('available', avail.label, avail.tier);
}

export function vehicleRiskBadges(
  vehicle: Vehicle,
  live: ApiDispatch | null,
  cargo?: OrderCargo | null,
): VehicleOpsBadge[] {
  const badges: VehicleOpsBadge[] = [];
  if (vehicle.archivedAt) return [badge('archived', 'Archived', 'critical')];

  if (!live && vehicle.status === 'AVAILABLE') {
    badges.push(badge('nodisp', 'No dispatch', 'secondary'));
  }
  if (live && !live.driver) {
    badges.push(badge('nodriver', 'No driver', 'warning'));
  }
  if (isOverCapacity(vehicle, cargo)) {
    badges.push(badge('overcap', 'Over capacity', 'warning'));
  }
  if (isDateExpired(vehicle.inspectionExpiry)) {
    badges.push(badge('insp-exp', 'Inspection expired', 'critical'));
  } else if (isDateExpiring(vehicle.inspectionExpiry)) {
    badges.push(badge('insp-due', 'Inspection due', 'warning'));
  }
  if (isDateExpired(vehicle.insuranceExpiry)) {
    badges.push(badge('ins-exp', 'Registration expired', 'critical'));
  } else if (isDateExpiring(vehicle.insuranceExpiry)) {
    badges.push(badge('ins-warn', 'Registration expiring', 'warning'));
  }
  if (isDispatchLate(live)) {
    badges.push(badge('late', 'Late delivery', 'critical'));
  }
  if (live?.status === 'CANCELLED') {
    badges.push(badge('cancelled', 'Cancelled', 'critical'));
  }
  return badges;
}

export type VehicleTimelineItem = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  kind: 'account' | 'dispatch' | 'driver' | 'status' | 'done' | 'cancel';
};

export function buildVehicleTimeline(
  vehicle: Vehicle,
  dispatches: ApiDispatch[],
): VehicleTimelineItem[] {
  const items: VehicleTimelineItem[] = [];

  items.push({
    id: `created-${vehicle.id}`,
    at: vehicle.createdAt,
    title: 'Vehicle created',
    detail: `${vehicle.plateNumber} · ${vehicle.vehicleCode}`,
    kind: 'account',
  });

  for (const d of dispatches) {
    items.push({
      id: `disp-created-${d.id}`,
      at: d.createdAt,
      title: 'Dispatch assigned',
      detail: [d.dispatchNumber, d.order?.orderNumber].filter(Boolean).join(' · '),
      kind: 'dispatch',
    });

    if (d.driver) {
      // The dispatch's driver can be reassigned after creation, and `d.driver`
      // always reflects the CURRENT one — so this must not be timestamped at
      // `d.createdAt`, or a same-day reassignment would silently rewrite the
      // original driver out of the timeline under a stale date. `updatedAt` is
      // the closest real timestamp we have for "this driver is current as of."
      items.push({
        id: `drv-assigned-${d.id}`,
        at: d.updatedAt,
        title: 'Assigned',
        detail: `${d.driver.firstName} ${d.driver.lastName} · ${d.dispatchNumber}`,
        kind: 'driver',
      });
    }

    for (const entry of d.statusHistory ?? []) {
      if (entry.status === 'ASSIGNED' && entry.createdAt === d.createdAt) continue;
      const kind: VehicleTimelineItem['kind'] =
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
        detail: [d.dispatchNumber, entry.status.replace(/_/g, ' '), entry.note]
          .filter(Boolean)
          .join(' · '),
        kind,
      });
    }

    if (d.status === 'DELIVERED' || d.status === 'CANCELLED') {
      // Terminal dispatches imply the vehicle was released from that assignment.
      const endAt = d.deliveryDateActual ?? d.updatedAt;
      items.push({
        id: `unassigned-${d.id}`,
        at: endAt,
        title: 'Unassigned',
        detail: d.dispatchNumber,
        kind: 'status',
      });
    }
  }

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

/// Distinct calendar days touched by loaded dispatch schedules (pickup or delivery).
export function assignedDaysCount(dispatches: ApiDispatch[]): number | null {
  if (dispatches.length === 0) return null;
  const days = new Set<string>();
  for (const d of dispatches) {
    for (const iso of [d.pickupDateScheduled, d.deliveryDateScheduled]) {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) continue;
      days.add(`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`);
    }
  }
  return days.size > 0 ? days.size : null;
}

export function statusToFilter(status: VehicleStatus | 'ARCHIVED' | 'ALL' | 'ASSIGNED'): {
  status?: VehicleStatus;
  includeArchived?: boolean;
} {
  if (status === 'ALL') return { includeArchived: false };
  if (status === 'ARCHIVED') return { includeArchived: true };
  if (status === 'ASSIGNED') return { status: 'IN_USE', includeArchived: false };
  return { status, includeArchived: false };
}
