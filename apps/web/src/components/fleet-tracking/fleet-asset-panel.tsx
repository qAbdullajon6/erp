'use client';

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/api/describe-error';
import type { TrackingHistoryPoint, TrackingVehicle } from '@/lib/api/tracking';
import type { ApiDispatch } from '@/lib/api/dispatches';
import {
  useAcknowledgeAlertMutation,
  useGeofenceEventsQuery,
  useResolveAlertMutation,
  useTelematicsAlertsQuery,
  useTelematicsHealthQuery,
  useTelematicsTripsQuery,
  type GeofenceEventItem,
  type TelematicsAlert,
  type TelematicsTrip,
} from '@/lib/api/telematics';
import { useReverseGeocodeQuery } from '@/lib/api/tracking-map';
import {
  fleetRiskClass,
  fleetRiskLabel,
  fleetRiskState,
  formatDistanceKm,
  formatDurationSec,
  hasCoordinates,
  movementLabel,
  movementToneClass,
  trackingAvailability,
  trackingAvailabilityClass,
  trackingAvailabilityLabel,
  vehicleDisplayName,
  vehicleSecondaryCode,
} from '@/components/fleet-tracking/fleet-ops';
import { FleetHistoryTimeline } from '@/components/fleet-tracking/fleet-history-timeline';
import {
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  MapPin,
  Package,
  Play,
  Truck,
  UserRound,
} from 'lucide-react';

const RAIL_BTN =
  'flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none';

type AlertFilter = 'active' | 'critical' | 'warning' | 'resolved';

interface Props {
  vehicle: TrackingVehicle | null;
  liveDispatch: ApiDispatch | null;
  streamLive: boolean;
  streamStatusLabel: string;
  historyPointCount?: number;
  recentHistory?: TrackingHistoryPoint[];
  detailLoading?: boolean;
  hasOpenAlert?: boolean;
}

export function FleetAssetPanel({
  vehicle,
  liveDispatch,
  streamLive,
  streamStatusLabel,
  historyPointCount,
  recentHistory = [],
  detailLoading = false,
  hasOpenAlert: hasOpenAlertProp,
}: Props) {
  if (!vehicle) {
    return (
      <aside className="flex h-full flex-col border-l border-border/60 bg-muted/10">
        <div className="border-b border-border/50 px-3 py-2.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Selected asset
          </h2>
        </div>
        <EmptyState
          compact
          icon={Truck}
          title="No vehicle selected"
          description="Select a unit from the fleet list or map to inspect tracking and assignment."
        />
      </aside>
    );
  }

  return (
    <FleetAssetPanelBody
      vehicle={vehicle}
      liveDispatch={liveDispatch}
      streamLive={streamLive}
      streamStatusLabel={streamStatusLabel}
      historyPointCount={historyPointCount}
      recentHistory={recentHistory}
      detailLoading={detailLoading}
      hasOpenAlertProp={hasOpenAlertProp}
    />
  );
}

function FleetAssetPanelBody({
  vehicle,
  liveDispatch,
  streamLive,
  streamStatusLabel,
  historyPointCount,
  recentHistory,
  detailLoading,
  hasOpenAlertProp,
}: {
  vehicle: TrackingVehicle;
  liveDispatch: ApiDispatch | null;
  streamLive: boolean;
  streamStatusLabel: string;
  historyPointCount?: number;
  recentHistory: TrackingHistoryPoint[];
  detailLoading: boolean;
  hasOpenAlertProp?: boolean;
}) {
  const openAlertsQuery = useTelematicsAlertsQuery(
    { vehicleId: vehicle.vehicleId, status: 'OPEN', limit: 20 },
    { enabled: !!vehicle.vehicleId },
  );
  const hasOpenAlert =
    hasOpenAlertProp ??
    (openAlertsQuery.data?.items?.some((a) => a.status === 'OPEN') ?? false);

  const track = trackingAvailability(vehicle, { liveDispatch });
  const code = vehicleSecondaryCode(vehicle);
  const risk = fleetRiskState(vehicle, hasOpenAlert);
  const customerId = liveDispatch?.order?.customer?.id;
  const customerName = liveDispatch?.order?.customer?.companyName;
  const driverId = vehicle.driverId ?? liveDispatch?.driver?.id ?? liveDispatch?.driverId;
  const driverName =
    vehicle.driverName ||
    (liveDispatch?.driver
      ? `${liveDispatch.driver.firstName} ${liveDispatch.driver.lastName}`
      : null);
  const orderId = liveDispatch?.orderId;
  const dispatchId = vehicle.dispatchId ?? liveDispatch?.id ?? null;
  const route =
    liveDispatch?.order?.pickupCity && liveDispatch?.order?.deliveryCity
      ? `${liveDispatch.order.pickupCity} → ${liveDispatch.order.deliveryCity}`
      : null;

  return (
    <aside className="flex h-full flex-col border-l border-border/60 bg-muted/10">
      <div className="border-b border-border/50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-sm font-semibold text-foreground">
              {vehicleDisplayName(vehicle)}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {[code, vehicle.vehicleCode !== vehicle.plateNumber ? vehicle.vehicleCode : null]
                .filter(Boolean)
                .join(' · ') || 'Fleet unit'}
              {detailLoading ? ' · refreshing…' : ''}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              trackingAvailabilityClass(track),
            )}
          >
            {trackingAvailabilityLabel(track)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3 scrollbar-thin">
        <Section title="Identity">
          <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
            <Row label="Plate" mono>
              {vehicle.plateNumber ?? '—'}
            </Row>
            <Row label="Code" mono>
              {vehicle.vehicleCode ?? '—'}
            </Row>
            <Row label="Active trip" mono>
              {vehicle.tripId ? `${vehicle.tripId.slice(0, 8)}…` : '—'}
            </Row>
          </dl>
        </Section>

        <Section title="Assignment">
          {!liveDispatch && !dispatchId ? (
            <EmptyState
              compact
              icon={Package}
              title="No live dispatch"
              description="This unit has no active dispatch right now."
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
              {liveDispatch ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={liveDispatch.status} />
                    <span className="font-mono font-semibold text-foreground">
                      {liveDispatch.dispatchNumber}
                    </span>
                  </div>
                  {route && (
                    <p className="flex items-center gap-1 text-muted-foreground">
                      {liveDispatch.order?.pickupCity}
                      <ArrowRight className="h-3 w-3" />
                      {liveDispatch.order?.deliveryCity}
                    </p>
                  )}
                </>
              ) : null}
              <dl className="space-y-1.5 pt-1">
                <Row label="Driver">{driverName ?? '—'}</Row>
                <Row label="Dispatch" mono>
                  {liveDispatch?.dispatchNumber ?? (dispatchId ? `${dispatchId.slice(0, 8)}…` : '—')}
                </Row>
                <Row label="Order" mono>
                  {liveDispatch?.order?.orderNumber ?? '—'}
                </Row>
                <Row label="Customer">{customerName ?? '—'}</Row>
                <Row label="Status">
                  {liveDispatch ? statusLabel(liveDispatch.status) : '—'}
                </Row>
              </dl>
            </div>
          )}
        </Section>

        <Section title="Telemetry">
          <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
            <Row label="Movement">
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  movementToneClass(vehicle.movementState),
                )}
              >
                {movementLabel(vehicle.movementState)}
              </span>
            </Row>
            <Row label="Speed">
              {vehicle.speedKph != null ? `${Math.round(vehicle.speedKph)} km/h` : '—'}
            </Row>
            <Row label="Heading">
              {vehicle.heading != null ? `${Math.round(vehicle.heading)}°` : '—'}
            </Row>
            <Row label="Fuel">
              {vehicle.fuelLevelPct != null ? `${Math.round(vehicle.fuelLevelPct)}%` : '—'}
            </Row>
            <Row label="Ignition">
              {vehicle.ignitionOn != null ? (vehicle.ignitionOn ? 'On' : 'Off') : '—'}
            </Row>
            <Row label="Odometer">
              {vehicle.odometerKm != null
                ? `${Math.round(vehicle.odometerKm).toLocaleString()} km`
                : '—'}
            </Row>
            <Row label="Offline / stale">
              {vehicle.isStale || vehicle.movementState === 'OFFLINE' ? 'Yes' : 'No'}
            </Row>
            <Row label="Stream">{streamStatusLabel}</Row>
            <Row label="Last received">
              {vehicle.lastReceivedAt ? formatRelativeTime(vehicle.lastReceivedAt) : '—'}
            </Row>
            <Row label="Last recorded">
              {vehicle.lastRecordedAt ? formatRelativeTime(vehicle.lastRecordedAt) : '—'}
            </Row>
            <Row label="Last heartbeat">
              {vehicle.lastHeartbeatAt ? formatRelativeTime(vehicle.lastHeartbeatAt) : '—'}
            </Row>
            {!streamLive && (
              <Row label="Note">
                <span className="text-muted-foreground">SSE disconnected — snapshot mode</span>
              </Row>
            )}
          </dl>
        </Section>

        <Section title="Location">
          <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
            <Row label="Coordinates" mono>
              {hasCoordinates(vehicle)
                ? `${vehicle.latitude!.toFixed(5)}, ${vehicle.longitude!.toFixed(5)}`
                : '—'}
            </Row>
            {hasCoordinates(vehicle) ? (
              <ReverseGeocodeRows lat={vehicle.latitude!} lng={vehicle.longitude!} />
            ) : (
              <Row label="Address">—</Row>
            )}
          </dl>
        </Section>

        <Section title="Risk">
          <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
            <Row label="Risk level">
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  fleetRiskClass(risk),
                )}
              >
                {fleetRiskLabel(risk)}
              </span>
            </Row>
            <Row label="Open alerts">
              {openAlertsQuery.isLoading
                ? '…'
                : String(openAlertsQuery.data?.openCount ?? (hasOpenAlert ? 1 : 0))}
            </Row>
          </dl>
        </Section>

        <FleetHistoryTimeline
          points={recentHistory}
          loading={detailLoading && recentHistory.length === 0}
        />
        {historyPointCount != null && historyPointCount > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {historyPointCount} GPS point{historyPointCount === 1 ? '' : 's'} in the last 2 hours.
          </p>
        )}

        <TripHistorySection vehicleId={vehicle.vehicleId} />
        <AlertsSection vehicleId={vehicle.vehicleId} />
        <GeofenceEventsSection vehicleId={vehicle.vehicleId} />
        <HealthSection vehicleId={vehicle.vehicleId} />

        <Section title="Quick actions">
          <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
            <Link
              to="/app/vehicles/$vehicleId"
              params={{ vehicleId: vehicle.vehicleId }}
              className={RAIL_BTN}
            >
              <Truck className="h-3.5 w-3.5" />
              Open Vehicle
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </Link>
            {driverId ? (
              <Link
                to="/app/drivers/$driverId"
                params={{ driverId }}
                className={RAIL_BTN}
              >
                <UserRound className="h-3.5 w-3.5" />
                Open Driver
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null}
            {liveDispatch ? (
              <Link
                to="/app/dispatches/$dispatchId"
                params={{ dispatchId: liveDispatch.id }}
                className={RAIL_BTN}
              >
                <MapPin className="h-3.5 w-3.5" />
                Open Dispatch
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null}
            {orderId ? (
              <Link to="/app/orders/$orderId" params={{ orderId }} className={RAIL_BTN}>
                <Package className="h-3.5 w-3.5" />
                Open Order
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null}
            {customerId ? (
              <Link
                to="/app/customers/$customerId"
                params={{ customerId }}
                className={RAIL_BTN}
              >
                <Building2 className="h-3.5 w-3.5" />
                Open Customer
                <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TripHistorySection({ vehicleId }: { vehicleId: string }) {
  const tripsQuery = useTelematicsTripsQuery({ vehicleId, limit: 8 });
  const items = tripsQuery.data?.items ?? [];
  const current = items.find((t) => t.status === 'ACTIVE') ?? null;
  const previous = items.filter((t) => t.id !== current?.id);

  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Trips
      </h3>
      {tripsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading trips…</p>
      ) : tripsQuery.isError ? (
        <p className="text-xs text-destructive">
          {tripsQuery.errorMessage ?? 'Failed to load trips'}
        </p>
      ) : items.length === 0 ? (
        <EmptyState compact title="No trips yet" description="Trips appear when the vehicle starts moving." />
      ) : (
        <div className="space-y-2">
          {current && <TripCard trip={current} badge="Current" />}
          {previous.slice(0, 5).map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </section>
  );
}

function TripCard({ trip, badge }: { trip: TelematicsTrip; badge?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{trip.status}</span>
        {badge && (
          <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
            {badge}
          </span>
        )}
      </div>
      <dl className="mt-1.5 space-y-1">
        <Row label="Started">{formatRelativeTime(trip.startedAt)}</Row>
        {trip.endedAt && <Row label="Ended">{formatRelativeTime(trip.endedAt)}</Row>}
        <Row label="Duration">{formatDurationSec(trip.durationSec)}</Row>
        <Row label="Distance">{formatDistanceKm(trip.distanceKm)}</Row>
      </dl>
      {trip.pointCount > 0 ? (
        <Button asChild size="sm" variant="outline" className="mt-2 h-7 w-full text-[10px]">
          <Link
            to="/app/fleet-tracking/replay/$tripId"
            params={{ tripId: trip.id }}
          >
            <Play className="mr-1.5 h-3 w-3" />
            Open replay
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function AlertsSection({ vehicleId }: { vehicleId: string }) {
  const [filter, setFilter] = useState<AlertFilter>('active');
  const alertsQuery = useTelematicsAlertsQuery({ vehicleId, limit: 40 });
  const acknowledge = useAcknowledgeAlertMutation();
  const resolve = useResolveAlertMutation();

  const filtered = useMemo(() => {
    const items = alertsQuery.data?.items ?? [];
    switch (filter) {
      case 'critical':
        return items.filter((a) => a.severity === 'CRITICAL');
      case 'warning':
        return items.filter((a) => a.severity === 'HIGH' || a.severity === 'MEDIUM');
      case 'resolved':
        return items.filter((a) => a.status === 'RESOLVED');
      case 'active':
      default:
        return items.filter((a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
    }
  }, [alertsQuery.data?.items, filter]);

  const busyId =
    acknowledge.isPending
      ? (acknowledge.variables as string | undefined)
      : resolve.isPending
        ? (resolve.variables as string | undefined)
        : undefined;

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Alerts
          {alertsQuery.data?.openCount != null && (
            <span className="ml-1 tabular-nums text-muted-foreground">
              · {alertsQuery.data.openCount} open
            </span>
          )}
        </h3>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(
          [
            { key: 'active', label: 'Active' },
            { key: 'critical', label: 'Critical' },
            { key: 'warning', label: 'Warning' },
            { key: 'resolved', label: 'Resolved' },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={filter === tab.key ? 'secondary' : 'outline'}
            className="h-7 px-2 text-[10px]"
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {alertsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading alerts…</p>
      ) : alertsQuery.isError ? (
        <p className="text-xs text-destructive">
          {alertsQuery.errorMessage ?? 'Failed to load alerts'}
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState compact title="No alerts" description={`Nothing in “${filter}”.`} />
      ) : (
        <ul className="space-y-2">
          {filtered.slice(0, 8).map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              busy={busyId === alert.id}
              onAcknowledge={() => acknowledge.mutate(alert.id)}
              onResolve={() => resolve.mutate(alert.id)}
              actionError={
                (acknowledge.error && acknowledge.variables === alert.id
                  ? describeError(acknowledge.error, 'Acknowledge failed')
                  : null) ||
                (resolve.error && resolve.variables === alert.id
                  ? describeError(resolve.error, 'Resolve failed')
                  : null)
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertCard({
  alert,
  busy,
  onAcknowledge,
  onResolve,
  actionError,
}: {
  alert: TelematicsAlert;
  busy: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  actionError: string | null;
}) {
  return (
    <li className="rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityPill severity={alert.severity} />
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          {alert.status}
        </span>
      </div>
      <p className="mt-1 font-medium text-foreground">{alert.title}</p>
      <p className="mt-0.5 text-muted-foreground">{alert.message}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {formatRelativeTime(alert.occurredAt)} · {alert.type}
      </p>
      {actionError && <p className="mt-1 text-[10px] text-destructive">{actionError}</p>}
      {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alert.status === 'OPEN' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              disabled={busy}
              onClick={onAcknowledge}
            >
              Acknowledge
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[10px]"
            disabled={busy}
            onClick={onResolve}
          >
            <Check className="mr-1 h-3 w-3" />
            Resolve
          </Button>
        </div>
      )}
    </li>
  );
}

function GeofenceEventsSection({ vehicleId }: { vehicleId: string }) {
  const eventsQuery = useGeofenceEventsQuery({ vehicleId, limit: 10 });
  const items = eventsQuery.data?.items ?? [];

  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Geofence events
      </h3>
      {eventsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading events…</p>
      ) : eventsQuery.isError ? (
        <p className="text-xs text-destructive">
          {eventsQuery.errorMessage ?? 'Failed to load geofence events'}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          title="No geofence events"
          description="Enter, exit, and dwell events will appear here."
        />
      ) : (
        <ul className="space-y-1.5">
          {items.map((event) => (
            <GeofenceEventRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GeofenceEventRow({ event }: { event: GeofenceEventItem }) {
  return (
    <li className="rounded-md border border-border/50 bg-surface px-2.5 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            event.type === 'ENTER' && 'bg-success/15 text-success',
            event.type === 'EXIT' && 'bg-brand/15 text-brand',
            event.type === 'DWELL' && 'bg-warning/15 text-warning',
          )}
        >
          {event.type === 'ENTER' ? 'Entered' : event.type === 'EXIT' ? 'Exited' : 'Dwell'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatRelativeTime(event.occurredAt)}
        </span>
      </div>
      {event.dwellSec != null && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Dwell {formatDurationSec(event.dwellSec)}
        </p>
      )}
    </li>
  );
}

function HealthSection({ vehicleId }: { vehicleId: string }) {
  const healthQuery = useTelematicsHealthQuery(vehicleId);
  const row = healthQuery.data?.vehicles?.[0];

  if (healthQuery.isLoading) {
    return (
      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Health
        </h3>
        <p className="text-xs text-muted-foreground">Loading health…</p>
      </section>
    );
  }

  if (!row || (!row.recordedAt && row.openHealthAlerts === 0)) {
    return null;
  }

  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Health
      </h3>
      <dl className="panel-dl">
        <Row label="Fuel">
          {row.fuelLevelPct != null ? `${Math.round(row.fuelLevelPct)}%` : '—'}
        </Row>
        <Row label="Battery">
          {row.batteryVoltage != null ? `${row.batteryVoltage.toFixed(1)} V` : '—'}
        </Row>
        <Row label="Check engine">
          {row.checkEngineOn != null ? (row.checkEngineOn ? 'On' : 'Off') : '—'}
        </Row>
        <Row label="Health alerts">
          {row.openHealthAlerts > 0 ? String(row.openHealthAlerts) : '—'}
        </Row>
        <Row label="Snapshot">
          {row.recordedAt ? formatRelativeTime(row.recordedAt) : '—'}
        </Row>
      </dl>
    </section>
  );
}

function ReverseGeocodeRows({ lat, lng }: { lat: number; lng: number }) {
  const geo = useReverseGeocodeQuery({ lat, lng });
  if (geo.isLoading) {
    return <Row label="Address">Looking up…</Row>;
  }
  if (geo.errorMessage) {
    return (
      <Row label="Address">
        <span className="text-muted-foreground">{geo.errorMessage}</span>
      </Row>
    );
  }
  const data = geo.data;
  if (!data || (!data.placeName && !data.street && !data.city)) {
    return <Row label="Address">—</Row>;
  }
  return (
    <>
      <Row label="Street">{data.street ?? '—'}</Row>
      <Row label="City">{data.city ?? '—'}</Row>
      <Row label="Region">{data.region ?? '—'}</Row>
      <Row label="Country">{data.country ?? '—'}</Row>
      {!data.street && data.placeName ? (
        <Row label="Place">{data.placeName}</Row>
      ) : null}
    </>
  );
}

function SeverityPill({ severity }: { severity: TelematicsAlert['severity'] }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        severity === 'CRITICAL' && 'bg-destructive/15 text-destructive',
        severity === 'HIGH' && 'bg-warning/15 text-warning',
        severity === 'MEDIUM' && 'bg-brand/15 text-brand',
        severity === 'LOW' && 'bg-muted text-muted-foreground',
      )}
    >
      {severity}
    </span>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right font-medium text-foreground', mono && 'font-mono')}>
        {children}
      </dd>
    </div>
  );
}
