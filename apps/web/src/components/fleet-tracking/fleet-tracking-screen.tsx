'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import {
  useTrackingHistoryQuery,
  useTrackingLiveQuery,
  useTrackingVehicleQuery,
  type StreamStatus,
  type TrackingVehicle,
} from '@/lib/api/tracking';
import {
  useTelematicsAlertsQuery,
  useTelematicsAnalyticsOverviewQuery,
  useTelematicsFuelQuery,
  useTelematicsHealthQuery,
} from '@/lib/api/telematics';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { FleetMap, type FleetMapHandle } from '@/components/fleet-tracking/fleet-map';
import { VehicleSidebar } from '@/components/fleet-tracking/vehicle-sidebar';
import { FleetAssetPanel } from '@/components/fleet-tracking/fleet-asset-panel';
import { FleetAnalyticsStrip } from '@/components/fleet-tracking/fleet-analytics-strip';
import {
  LIVE_DISPATCH,
  FLEET_FILTER_GROUPS,
  buildFleetDispatchIndex,
  computeFleetStrip,
  filterFleetVehicles,
  fleetFilterLabel,
  hasCoordinates,
  readFleetPrefs,
  writeFleetPrefs,
  type FleetFilter,
  type FleetPrefs,
} from '@/components/fleet-tracking/fleet-ops';
import type { FleetMapStyleOption } from '@/components/fleet-tracking/fleet-map-toolbar';
import { useCurrentUser } from '@/lib/api/auth';
import type { MembershipRole } from '@/lib/api/organizations';
import { ADMIN_OPS_ROLES } from '@/lib/role-access';
import { cn } from '@/lib/utils';
import {
  Bug,
  Cpu,
  Focus,
  Hexagon,
  LayoutList,
  Map as MapIcon,
  MapPin,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Truck,
  X,
  ZoomIn,
} from 'lucide-react';

type MobilePane = 'map' | 'list' | 'asset';

const SELECTION_STORAGE_KEY = 'flowerp.fleet-tracking.selectedVehicleId';

const DEFAULT_PREFS: FleetPrefs = {
  filter: 'all',
  search: '',
  clusters: true,
  labels: true,
  traffic: false,
  follow: false,
  mapStyle: 'streets',
};

function streamLabel(status: StreamStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'connecting':
      return 'Reconnecting';
    case 'disconnected':
      return 'Disconnected';
  }
}

function readStoredSelection(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SELECTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSelection(vehicleId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (vehicleId) sessionStorage.setItem(SELECTION_STORAGE_KEY, vehicleId);
    else sessionStorage.removeItem(SELECTION_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

function loadInitialPrefs(): FleetPrefs {
  const saved = readFleetPrefs();
  return { ...DEFAULT_PREFS, ...saved };
}

export function FleetTrackingScreen() {
  const { data: currentUser } = useCurrentUser();
  const canManageDevices =
    !!currentUser &&
    ADMIN_OPS_ROLES.includes(currentUser.membership.role as MembershipRole);

  const initialPrefs = useMemo(() => loadInitialPrefs(), []);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    isSuccess,
    refetch,
    dataUpdatedAt,
    errorMessage,
  } = useTrackingLiveQuery();
  const analytics = useTelematicsAnalyticsOverviewQuery({ enabled: true });
  const fuel = useTelematicsFuelQuery({ enabled: true });
  const health = useTelematicsHealthQuery(null, { fleetWide: true });
  const openAlertsQuery = useTelematicsAlertsQuery(
    { status: 'OPEN', limit: 100 },
    { requireVehicleId: false },
  );

  const alertVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const alert of openAlertsQuery.data?.items ?? []) {
      if (alert.vehicleId) ids.add(alert.vehicleId);
    }
    return ids;
  }, [openAlertsQuery.data?.items]);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(() =>
    readStoredSelection(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [vehicles, setVehicles] = useState<TrackingVehicle[]>([]);
  const [search, setSearch] = useState(initialPrefs.search);
  const [filter, setFilter] = useState<FleetFilter>(initialPrefs.filter);
  const [clusters, setClusters] = useState(initialPrefs.clusters);
  const [labels, setLabels] = useState(initialPrefs.labels);
  const [traffic, setTraffic] = useState(initialPrefs.traffic);
  const [follow, setFollow] = useState(initialPrefs.follow);
  const [mapStyle, setMapStyle] = useState<FleetMapStyleOption>(initialPrefs.mapStyle);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('disconnected');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('map');
  const mapRef = useRef<FleetMapHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const liveDispatches = useDispatches(1, 200, { statuses: LIVE_DISPATCH });
  const dispatchIndex = useMemo(
    () => buildFleetDispatchIndex(liveDispatches.data ?? []),
    [liveDispatches.data],
  );

  const vehicleDetail = useTrackingVehicleQuery(selectedVehicleId);
  const historyQuery = useTrackingHistoryQuery(selectedVehicleId, {
    enabled: !!selectedVehicleId,
    hours: 2,
    limit: 200,
  });

  useEffect(() => {
    writeFleetPrefs({ filter, search, clusters, labels, traffic, follow, mapStyle });
  }, [filter, search, clusters, labels, traffic, follow, mapStyle]);

  useEffect(() => {
    if (isSuccess && data) setVehicles(data);
  }, [data, isSuccess]);

  useEffect(() => {
    const detail = vehicleDetail.data;
    if (!detail) return;
    setVehicles((prev) =>
      prev.map((v) => (v.vehicleId === detail.vehicleId ? { ...v, ...detail } : v)),
    );
  }, [vehicleDetail.data]);

  useEffect(() => {
    if (selectedVehicleId && vehicles.length > 0 && !vehicles.some((v) => v.vehicleId === selectedVehicleId)) {
      setSelectedVehicleId(null);
      writeStoredSelection(null);
    }
  }, [vehicles, selectedVehicleId]);

  useEffect(() => {
    writeStoredSelection(selectedVehicleId);
  }, [selectedVehicleId]);

  const filtered = useMemo(
    () => filterFleetVehicles(vehicles, filter, search, dispatchIndex, alertVehicleIds),
    [vehicles, filter, search, dispatchIndex, alertVehicleIds],
  );

  const strip = useMemo(
    () => computeFleetStrip(vehicles, dispatchIndex, alertVehicleIds),
    [vehicles, dispatchIndex, alertVehicleIds],
  );

  const selected = useMemo(
    () => vehicles.find((v) => v.vehicleId === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const selectedDispatch = selected
    ? dispatchIndex.get(selected.vehicleId)?.liveDispatch ?? null
    : null;

  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const onStreamStatusChange = useCallback((status: StreamStatus) => {
    setStreamStatus(status);
  }, []);

  const handleSelectVehicle = useCallback(
    (vehicleId: string, opts?: { additive?: boolean }) => {
      if (opts?.additive) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          const removing = next.has(vehicleId);
          if (removing) next.delete(vehicleId);
          else next.add(vehicleId);

          setSelectedVehicleId((current) => {
            if (removing && current === vehicleId) {
              const remaining = Array.from(next);
              return remaining[0] ?? null;
            }
            if (!removing) return vehicleId;
            return current;
          });

          return next;
        });
      } else {
        setSelectedVehicleId(vehicleId);
        setSelectedIds(new Set([vehicleId]));
      }
      setMobilePane('asset');
    },
    [],
  );

  const handleMapSelectVehicle = useCallback(
    (vehicleId: string | null) => {
      if (!vehicleId) {
        setSelectedVehicleId(null);
        setSelectedIds(new Set());
        return;
      }
      handleSelectVehicle(vehicleId);
    },
    [handleSelectVehicle],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedVehicleId(null);
  }, []);

  const handleFitSelected = useCallback(() => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : selectedVehicleId ? [selectedVehicleId] : [];
    if (ids.length > 0) mapRef.current?.fitSelected(ids);
  }, [selectedIds, selectedVehicleId]);

  const moveSelection = useCallback(
    (delta: number, additive: boolean) => {
      if (filtered.length === 0) return;
      const ids = filtered.map((v) => v.vehicleId);
      const current = selectedVehicleId ? ids.indexOf(selectedVehicleId) : -1;
      const nextIndex =
        current < 0
          ? delta > 0
            ? 0
            : ids.length - 1
          : Math.max(0, Math.min(ids.length - 1, current + delta));
      const nextId = ids[nextIndex] ?? null;
      if (!nextId) return;
      if (additive) {
        handleSelectVehicle(nextId, { additive: true });
      } else {
        handleSelectVehicle(nextId);
      }
    },
    [filtered, selectedVehicleId, handleSelectVehicle],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        if (event.key === 'Escape') {
          (target as HTMLInputElement).blur();
          event.preventDefault();
        }
        return;
      }

      if (event.key === '/' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, event.shiftKey);
        return;
      }
      if (event.key === 'Escape') {
        handleClearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveSelection, handleClearSelection]);

  const stripChips = [
    { key: 'tracked', label: 'Tracked', value: strip.tracked },
    { key: 'offline', label: 'Offline', value: strip.offline },
    { key: 'nogps', label: 'No GPS', value: strip.noGps },
    { key: 'assigned', label: 'Assigned', value: strip.assigned },
    { key: 'idle', label: 'Idle', value: strip.idle },
    { key: 'moving', label: 'Moving', value: strip.moving },
    { key: 'withAlerts', label: 'Alerts', value: strip.withAlerts },
  ].filter((c) => c.value > 0);

  const filterCounts: Record<FleetFilter, number> = {
    all: vehicles.length,
    moving: strip.moving,
    idle: strip.idle,
    stopped: strip.stopped,
    offline: strip.offline,
    no_gps: strip.noGps,
    assigned: strip.assigned,
    has_alerts: strip.withAlerts,
    has_driver: strip.withDriver,
    no_driver: strip.noDriver,
  };

  const trackedOnMap = vehicles.filter(hasCoordinates).length;
  const emptyFleet = isSuccess && vehicles.length === 0;
  const streamLive = streamStatus === 'live';
  const streamConnecting = streamStatus === 'connecting';
  const loadErrorMessage =
    errorMessage ?? 'Failed to load the live fleet. Please try again.';
  const selectionCount = selectedIds.size;

  return (
    <div
      className="flex h-[calc(100vh-4rem)] flex-col"
      data-testid="fleet-tracking-page"
    >
      <div className="shrink-0 space-y-2.5 border-b border-border/70 bg-surface px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Fleet Tracking
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isLoading
                ? 'Loading live fleet…'
                : isError
                  ? loadErrorMessage
                  : emptyFleet
                    ? 'No live tracking devices connected'
                    : `${vehicles.length} tracked unit${vehicles.length === 1 ? '' : 's'} · ${trackedOnMap} on map`}
              {!streamLive && !isLoading && !isError && !emptyFleet && (
                <span className="text-warning">
                  {' '}
                  · Live stream {streamConnecting ? 'reconnecting' : 'offline'} — positions may be stale
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <LivePill status={streamStatus} updatedAt={dataUpdatedAt} />
            <Button size="sm" variant="outline" className="h-8" asChild>
              <Link to="/app/geofences">
                <Hexagon className="mr-1.5 h-3.5 w-3.5" />
                Geofences
              </Link>
            </Button>
            {canManageDevices ? (
              <Button size="sm" variant="outline" className="h-8" asChild>
                <Link to="/app/devices">
                  <Cpu className="mr-1.5 h-3.5 w-3.5" />
                  Devices
                </Link>
              </Button>
            ) : null}
            {canManageDevices ? (
              <Button size="sm" variant="outline" className="h-8" asChild>
                <Link to="/app/fleet-tracking/debug">
                  <Bug className="mr-1.5 h-3.5 w-3.5" />
                  Debug
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="hidden h-8 lg:inline-flex"
              onClick={() => mapRef.current?.fitAll()}
              disabled={trackedOnMap === 0}
            >
              <Focus className="mr-1.5 h-3.5 w-3.5" />
              Fit vehicles
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="hidden h-8 lg:inline-flex"
              onClick={() => mapRef.current?.toggleFullscreen()}
            >
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Fullscreen
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="hidden h-8 md:inline-flex lg:hidden"
              onClick={() => setLeftCollapsed((v) => !v)}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {!isLoading && !isError && !emptyFleet && (
          <FleetAnalyticsStrip
            overview={analytics.data}
            fuel={fuel.data}
            healthRows={health.data?.vehicles}
            loading={analytics.isLoading || fuel.isLoading || health.isLoading}
            errorMessage={analytics.errorMessage}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plate, code, driver, customer, registration… (press /)"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Search fleet"
            />
          </div>
        </div>

        <div className="space-y-2">
          {FLEET_FILTER_GROUPS.map((group) => {
            const options = group.filters.filter(
              (f) => filterCounts[f] > 0 || f === filter,
            );
            if (options.length === 0) return null;
            return (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </span>
                {options.map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'secondary' : 'outline'}
                    className="h-8"
                    onClick={() => setFilter(f)}
                  >
                    {fleetFilterLabel(f)}
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      {filterCounts[f]}
                    </span>
                  </Button>
                ))}
              </div>
            );
          })}
          <Button
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'outline'}
            className="h-8"
            onClick={() => setFilter('all')}
          >
            {fleetFilterLabel('all')}
            <span className="ml-1.5 tabular-nums text-muted-foreground">{filterCounts.all}</span>
          </Button>
        </div>

        {selectionCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2">
            <span className="text-sm font-medium text-foreground">
              {selectionCount} vehicle{selectionCount === 1 ? '' : 's'} selected
            </span>
            <Button size="sm" variant="outline" className="h-8" onClick={handleFitSelected}>
              <ZoomIn className="mr-1.5 h-3.5 w-3.5" />
              Fit bounds
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                if (selectedVehicleId) mapRef.current?.focusVehicle(selectedVehicleId);
                else handleFitSelected();
              }}
              disabled={!selectedVehicleId && selectionCount === 0}
            >
              <Focus className="mr-1.5 h-3.5 w-3.5" />
              Zoom selected
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={handleClearSelection}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        )}

        {stripChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {stripChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-xs text-foreground"
              >
                <span className="text-muted-foreground">{chip.label}</span>
                <span className="font-semibold tabular-nums">{chip.value}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1 md:hidden">
          {(
            [
              { key: 'map', label: 'Map', icon: MapIcon },
              { key: 'list', label: 'Fleet', icon: LayoutList },
              { key: 'asset', label: 'Asset', icon: Truck },
            ] as const
          ).map((pane) => (
            <Button
              key={pane.key}
              size="sm"
              variant={mobilePane === pane.key ? 'secondary' : 'outline'}
              className="h-8 flex-1"
              onClick={() => setMobilePane(pane.key)}
            >
              <pane.icon className="mr-1.5 h-3.5 w-3.5" />
              {pane.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading live fleet…" />
      ) : isError ? (
        <ErrorState message={loadErrorMessage} onRetry={() => void refetch()} />
      ) : emptyFleet ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-xl border border-border/70 bg-surface p-2 shadow-sm">
            <EmptyState
              icon={MapPin}
              title="No live tracking devices connected"
              description="Vehicles, drivers, and dispatches continue operating normally — live location is unavailable until a telematics device reports into this organization."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/vehicles" search={{}}>
                      Open Vehicles
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/dispatches" search={{}}>
                      Open Dispatches
                    </Link>
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              'min-h-0 shrink-0 border-r border-border/60 bg-surface',
              'hidden md:flex md:flex-col',
              leftCollapsed ? 'md:w-0 md:overflow-hidden md:border-0' : 'md:w-[22%]',
              mobilePane === 'list' && 'flex w-full md:w-[22%]',
            )}
          >
            <VehicleSidebar
              vehicles={filtered}
              selectedVehicleId={selectedVehicleId}
              selectedIds={selectedIds}
              dispatchIndex={dispatchIndex}
              onSelectVehicle={handleSelectVehicle}
              onClearSelection={handleClearSelection}
              onFitSelected={handleFitSelected}
            />
          </div>

          <div
            className={cn(
              'relative min-h-0 min-w-0 flex-1',
              mobilePane !== 'map' && 'hidden md:block',
            )}
          >
            <FleetMap
              ref={mapRef}
              vehicles={vehicles}
              selectedIds={selectedIdList}
              selectedVehicleId={selectedVehicleId}
              historyPoints={historyQuery.data?.points ?? []}
              mapStyle={mapStyle}
              clusters={clusters}
              traffic={traffic}
              labels={labels}
              follow={follow}
              onMapStyleChange={setMapStyle}
              onClustersChange={setClusters}
              onTrafficChange={setTraffic}
              onLabelsChange={setLabels}
              onFollowChange={setFollow}
              onVehiclesUpdate={setVehicles}
              onSelectVehicle={handleMapSelectVehicle}
              onStreamStatusChange={onStreamStatusChange}
              className="h-full"
            />
          </div>

          <div
            className={cn(
              'min-h-0 shrink-0 bg-surface',
              'hidden lg:flex lg:w-[22%] lg:flex-col',
              mobilePane === 'asset' && 'flex w-full lg:w-[22%]',
            )}
          >
            <FleetAssetPanel
              vehicle={selected}
              liveDispatch={selectedDispatch}
              streamLive={streamLive}
              streamStatusLabel={streamLabel(streamStatus)}
              historyPointCount={historyQuery.data?.pointCount}
              recentHistory={historyQuery.data?.points}
              detailLoading={vehicleDetail.isFetching}
              hasOpenAlert={selected ? alertVehicleIds.has(selected.vehicleId) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LivePill({ status, updatedAt }: { status: StreamStatus; updatedAt: number }) {
  const live = status === 'live';
  const connecting = status === 'connecting';
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
        live
          ? 'border-success/30 bg-success/10 text-success'
          : connecting
            ? 'border-warning/30 bg-warning/10 text-warning'
            : 'border-border/60 bg-muted/30 text-muted-foreground',
      )}
      title={
        live
          ? updatedAt
            ? `Live · snapshot ${new Date(updatedAt).toLocaleString()}`
            : 'Live stream connected'
          : connecting
            ? 'Reconnecting to live stream…'
            : 'Live stream disconnected — showing last snapshot'
      }
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          live
            ? 'animate-pulse bg-success'
            : connecting
              ? 'animate-pulse bg-warning'
              : 'bg-muted-foreground/50',
        )}
      />
      {streamLabel(status)}
    </span>
  );
}
