'use client';

import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import type { MovementState, TrackingHistoryPoint, TrackingVehicle } from '@/lib/api/tracking';

export type Vehicle = TrackingVehicle;

export const LIVE_DISPATCH: DispatchStatus[] = [
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
];

export type TrackingAvailability =
  | 'tracking'
  | 'waiting_for_gps'
  | 'gps_lost'
  | 'driver_offline'
  | 'vehicle_offline'
  | 'no_active_dispatch'
  | 'unknown';

export type FleetOpsContext = {
  liveDispatch: ApiDispatch | null;
};

/// Risk is derived only from live telematics + open-alert membership.
export type FleetRiskState = 'critical' | 'elevated' | 'normal' | 'unknown';

export function hasCoordinates(v: Vehicle): boolean {
  return v.latitude != null && v.longitude != null;
}

/// Honest tracking availability from live telematics fields only — never invents
/// a state the API did not support.
export function trackingAvailability(
  v: Vehicle,
  ctx?: FleetOpsContext | null,
): TrackingAvailability {
  const assigned = v.hasActiveDispatch === true || Boolean(ctx?.liveDispatch);
  const coords = hasCoordinates(v);
  const offline = v.isStale || v.movementState === 'OFFLINE';
  const driverApp = v.sessionSource === 'DRIVER_APP';

  if (!assigned && !v.sessionId) {
    return 'no_active_dispatch';
  }

  if (v.sessionId && !coords && !offline) {
    return 'waiting_for_gps';
  }

  if (coords && offline && v.sessionId) {
    return 'gps_lost';
  }

  if (offline) {
    return driverApp || Boolean(v.driverId) ? 'driver_offline' : 'vehicle_offline';
  }

  if (coords) {
    return 'tracking';
  }

  if (v.sessionId) {
    return 'waiting_for_gps';
  }

  return 'unknown';
}

export function trackingAvailabilityLabel(state: TrackingAvailability): string {
  switch (state) {
    case 'tracking':
      return 'Tracking';
    case 'waiting_for_gps':
      return 'Waiting for GPS';
    case 'gps_lost':
      return 'GPS Lost';
    case 'driver_offline':
      return 'Driver Offline';
    case 'vehicle_offline':
      return 'Vehicle Offline';
    case 'no_active_dispatch':
      return 'No Active Dispatch';
    case 'unknown':
      return 'Unknown';
  }
}

export function trackingAvailabilityClass(state: TrackingAvailability): string {
  switch (state) {
    case 'tracking':
      return 'bg-success/15 text-success ring-1 ring-inset ring-success/25';
    case 'waiting_for_gps':
      return 'bg-warning/15 text-warning ring-1 ring-inset ring-warning/25';
    case 'gps_lost':
      return 'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25';
    case 'driver_offline':
      return 'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25';
    case 'vehicle_offline':
      return 'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25';
    case 'no_active_dispatch':
      return 'bg-muted text-muted-foreground ring-1 ring-inset ring-border/60';
    case 'unknown':
      return 'bg-muted text-muted-foreground ring-1 ring-inset ring-border/60';
  }
}

export function fleetRiskState(
  v: Vehicle,
  hasOpenAlert: boolean,
): FleetRiskState {
  if (hasOpenAlert) return 'critical';
  if (v.movementState === 'OFFLINE' || v.isStale) return 'elevated';
  if (v.movementState === 'UNKNOWN' || !hasCoordinates(v)) return 'unknown';
  return 'normal';
}

export function fleetRiskLabel(state: FleetRiskState): string {
  switch (state) {
    case 'critical':
      return 'Critical';
    case 'elevated':
      return 'Elevated';
    case 'normal':
      return 'Normal';
    case 'unknown':
      return 'Unknown';
  }
}

export function fleetRiskClass(state: FleetRiskState): string {
  switch (state) {
    case 'critical':
      return 'bg-destructive/15 text-destructive';
    case 'elevated':
      return 'bg-warning/15 text-warning';
    case 'normal':
      return 'bg-success/15 text-success';
    case 'unknown':
      return 'bg-muted text-muted-foreground';
  }
}

export function movementLabel(state: MovementState): string {
  switch (state) {
    case 'MOVING':
      return 'Moving';
    case 'IDLING':
      return 'Idle';
    case 'STOPPED':
      return 'Stopped';
    case 'OFFLINE':
      return 'Offline';
    default:
      return 'Unknown';
  }
}

export function movementToneClass(state: MovementState): string {
  switch (state) {
    case 'MOVING':
      return 'bg-success/15 text-success';
    case 'IDLING':
      return 'bg-warning/15 text-warning';
    case 'STOPPED':
      return 'bg-brand/15 text-brand';
    case 'OFFLINE':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/// Marker colour tokens (hex) — Mapbox circle / marker paint needs concrete values.
export function movementMarkerColor(state: MovementState): string {
  switch (state) {
    case 'MOVING':
      return '#22c55e';
    case 'IDLING':
      return '#f59e0b';
    case 'STOPPED':
      return '#6366f1';
    case 'OFFLINE':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}

export function buildFleetDispatchIndex(dispatches: ApiDispatch[]): Map<string, FleetOpsContext> {
  const map = new Map<string, FleetOpsContext>();
  for (const d of dispatches) {
    const vehicleId = d.vehicle?.id ?? d.vehicleId;
    if (!vehicleId) continue;
    if (!LIVE_DISPATCH.includes(d.status)) continue;
    if (!map.has(vehicleId)) {
      map.set(vehicleId, { liveDispatch: d });
    }
  }
  return map;
}

export function vehicleDisplayName(v: Vehicle): string {
  return v.plateNumber || v.vehicleCode || 'Vehicle';
}

export function vehicleSecondaryCode(v: Vehicle): string | null {
  if (v.plateNumber && v.vehicleCode) return v.vehicleCode;
  return null;
}

export function formatDurationSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

export function formatDistanceKm(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(n >= 10 ? 1 : 2)} km`;
}

export type FleetStripCounts = {
  tracked: number;
  offline: number;
  noGps: number;
  assigned: number;
  idle: number;
  moving: number;
  stopped: number;
  withDriver: number;
  noDriver: number;
  withAlerts: number;
};

export function computeFleetStrip(
  vehicles: Vehicle[],
  dispatchIndex: Map<string, FleetOpsContext>,
  alertVehicleIds: Set<string> = new Set(),
): FleetStripCounts {
  let tracked = 0;
  let offline = 0;
  let noGps = 0;
  let assigned = 0;
  let idle = 0;
  let moving = 0;
  let stopped = 0;
  let withDriver = 0;
  let noDriver = 0;
  let withAlerts = 0;

  for (const v of vehicles) {
    const track = trackingAvailability(v, dispatchIndex.get(v.vehicleId));
    if (track === 'tracking') tracked += 1;
    if (
      track === 'driver_offline' ||
      track === 'vehicle_offline' ||
      track === 'gps_lost'
    ) {
      offline += 1;
    }
    if (track === 'waiting_for_gps' || !hasCoordinates(v)) noGps += 1;
    if (dispatchIndex.has(v.vehicleId)) assigned += 1;
    if (v.movementState === 'IDLING') idle += 1;
    if (v.movementState === 'MOVING') moving += 1;
    if (v.movementState === 'STOPPED') stopped += 1;
    if (v.driverId || v.driverName) withDriver += 1;
    else noDriver += 1;
    if (alertVehicleIds.has(v.vehicleId)) withAlerts += 1;
  }

  return {
    tracked,
    offline,
    noGps,
    assigned,
    idle,
    moving,
    stopped,
    withDriver,
    noDriver,
    withAlerts,
  };
}

export type FleetFilter =
  | 'all'
  | 'moving'
  | 'idle'
  | 'stopped'
  | 'offline'
  | 'no_gps'
  | 'assigned'
  | 'has_alerts'
  | 'has_driver'
  | 'no_driver';

export const FLEET_FILTER_GROUPS: {
  label: string;
  filters: FleetFilter[];
}[] = [
  { label: 'Movement', filters: ['moving', 'idle', 'stopped', 'offline'] },
  { label: 'GPS', filters: ['no_gps'] },
  {
    label: 'Assignment',
    filters: ['assigned', 'has_driver', 'no_driver'],
  },
  { label: 'Alerts', filters: ['has_alerts'] },
];

export function fleetFilterLabel(filter: FleetFilter): string {
  switch (filter) {
    case 'all':
      return 'All';
    case 'moving':
      return 'Moving';
    case 'idle':
      return 'Idle';
    case 'stopped':
      return 'Stopped';
    case 'offline':
      return 'Offline';
    case 'no_gps':
      return 'No GPS';
    case 'assigned':
      return 'Active dispatch';
    case 'has_alerts':
      return 'Has alerts';
    case 'has_driver':
      return 'Has driver';
    case 'no_driver':
      return 'No driver';
  }
}

export function filterFleetVehicles(
  vehicles: Vehicle[],
  filter: FleetFilter,
  search: string,
  dispatchIndex: Map<string, FleetOpsContext>,
  alertVehicleIds: Set<string> = new Set(),
): Vehicle[] {
  const q = search.trim().toLowerCase();
  return vehicles.filter((v) => {
    if (q) {
      const ctx = dispatchIndex.get(v.vehicleId)?.liveDispatch;
      const hay = [
        v.plateNumber,
        v.vehicleCode,
        v.driverName,
        ctx?.dispatchNumber,
        ctx?.order?.orderNumber,
        ctx?.order?.customer?.companyName,
        ctx?.order?.customer?.contactName,
        ctx?.driver
          ? `${ctx.driver.firstName} ${ctx.driver.lastName}`
          : null,
        ctx?.vehicle?.plateNumber,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    switch (filter) {
      case 'moving':
        return v.movementState === 'MOVING';
      case 'idle':
        return v.movementState === 'IDLING';
      case 'stopped':
        return v.movementState === 'STOPPED';
      case 'offline': {
        const track = trackingAvailability(v, dispatchIndex.get(v.vehicleId));
        return (
          track === 'driver_offline' ||
          track === 'vehicle_offline' ||
          track === 'gps_lost'
        );
      }
      case 'no_gps':
        return !hasCoordinates(v);
      case 'assigned':
        return dispatchIndex.has(v.vehicleId);
      case 'has_alerts':
        return alertVehicleIds.has(v.vehicleId);
      case 'has_driver':
        return Boolean(v.driverId || v.driverName);
      case 'no_driver':
        return !v.driverId && !v.driverName;
      case 'all':
      default:
        return true;
    }
  });
}

/// Timeline events derived only from history points the API returns.
export type HistoryTimelineKind =
  | 'moving'
  | 'idle'
  | 'stopped'
  | 'offline'
  | 'unknown';

export type HistoryTimelineEvent = {
  id: string;
  kind: HistoryTimelineKind;
  label: string;
  at: string;
  endAt: string;
  durationSec: number;
  pointCount: number;
};

export function buildHistoryTimeline(
  points: TrackingHistoryPoint[],
): HistoryTimelineEvent[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const events: HistoryTimelineEvent[] = [];
  let segmentStart = sorted[0];
  let count = 1;

  const flush = (end: TrackingHistoryPoint, pointCount: number) => {
    const startMs = Date.parse(segmentStart.at);
    const endMs = Date.parse(end.at);
    const kind = movementToTimelineKind(segmentStart.movementState);
    events.push({
      id: `${segmentStart.at}-${end.at}-${kind}`,
      kind,
      label: timelineLabel(kind),
      at: segmentStart.at,
      endAt: end.at,
      durationSec: Math.max(0, Math.round((endMs - startMs) / 1000)),
      pointCount,
    });
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const point = sorted[i];
    if (point.movementState === segmentStart.movementState) {
      count += 1;
      continue;
    }
    flush(sorted[i - 1], count);
    segmentStart = point;
    count = 1;
  }
  flush(sorted[sorted.length - 1], count);
  return events;
}

function movementToTimelineKind(state: MovementState): HistoryTimelineKind {
  switch (state) {
    case 'MOVING':
      return 'moving';
    case 'IDLING':
      return 'idle';
    case 'STOPPED':
      return 'stopped';
    case 'OFFLINE':
      return 'offline';
    default:
      return 'unknown';
  }
}

function timelineLabel(kind: HistoryTimelineKind): string {
  switch (kind) {
    case 'moving':
      return 'Moving';
    case 'idle':
      return 'Idle';
    case 'stopped':
      return 'Stopped';
    case 'offline':
      return 'Offline';
    case 'unknown':
      return 'Unknown movement';
  }
}

export type FleetPrefs = {
  filter: FleetFilter;
  search: string;
  clusters: boolean;
  labels: boolean;
  traffic: boolean;
  follow: boolean;
  mapStyle: 'streets' | 'dark' | 'satellite' | 'navigation';
};

export const FLEET_PREFS_KEY = 'flowerp.fleet-tracking.prefs';
export const FLEET_MAP_VIEW_KEY = 'flowerp.fleet-tracking.mapView';

export function readFleetPrefs(): Partial<FleetPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FLEET_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<FleetPrefs>;
  } catch {
    return {};
  }
}

export function writeFleetPrefs(prefs: Partial<FleetPrefs>): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = readFleetPrefs();
    localStorage.setItem(FLEET_PREFS_KEY, JSON.stringify({ ...prev, ...prefs }));
  } catch {
    // ignore
  }
}

export function readMapView(): { center: [number, number]; zoom: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(FLEET_MAP_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { center?: [number, number]; zoom?: number };
    if (
      Array.isArray(parsed.center) &&
      parsed.center.length === 2 &&
      typeof parsed.zoom === 'number'
    ) {
      return { center: parsed.center, zoom: parsed.zoom };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeMapView(center: [number, number], zoom: number): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      FLEET_MAP_VIEW_KEY,
      JSON.stringify({ center, zoom }),
    );
  } catch {
    // ignore
  }
}
