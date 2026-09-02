'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { WorkspaceHeader } from '@/components/shared/page-header';
import { SearchInput } from '@/components/shared/search-input';
import {
  mergeLiveFleetSnapshot,
  mergeVehicleDetail,
  useTrackingHistoryQuery,
  useTrackingLiveQuery,
  useTrackingVehicleQuery,
  type StreamStatus,
  type TrackingVehicle,
} from '@/lib/api/tracking';
import {
  useTelematicsAlertsQuery,
} from '@/lib/api/telematics';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useGeofencesList } from '@/lib/api/telematics-geofences';
import { FleetMap, type FleetMapHandle } from '@/components/fleet-tracking/fleet-map';
import { VehicleSidebar } from '@/components/fleet-tracking/vehicle-sidebar';
import { FleetAssetPanel } from '@/components/fleet-tracking/fleet-asset-panel';
import {
  LIVE_DISPATCH,
  buildFleetDispatchIndex,
  computeFleetStrip,
  filterFleetVehicles,
  hasCoordinates,
  readFleetPrefs,
  writeFleetPrefs,
  type FleetFilter,
  type FleetPrefs,
} from '@/components/fleet-tracking/fleet-ops';
import {
  describeFleetStreamPill,
  fleetSnapshotPollIntervalMs,
  isLiveGpsDataStream,
  isSelectionHiddenByFilter,
  isSseTransportConnected,
  resolveDeepLinkSelection,
  shouldSyncSelectionToSearch,
  streamStatusLabel,
} from '@/components/fleet-tracking/fleet-tracking-hardening';
import { formatRelativeTime } from '@/lib/format';
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
  MapPin,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Truck,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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

  const navigate = useNavigate({ from: '/app/fleet-tracking' });
  const { vehicleId: vehicleIdFromUrl } = useSearch({ from: '/app/fleet-tracking' });

  const initialPrefs = useMemo(() => loadInitialPrefs(), []);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(() =>
    vehicleIdFromUrl ?? readStoredSelection(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = vehicleIdFromUrl ?? readStoredSelection();
    return initial ? new Set([initial]) : new Set();
  });
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
  const workspaceRef = useRef<HTMLDivElement>(null);
  const urlSelectionHydrated = useRef(false);
  /// Tracks prior URL vehicleId so we only clear selection when the user
  /// navigates away from a deep link (back/forward), not while sessionStorage
  /// selection is waiting to be validated against the live snapshot.
  const prevUrlVehicleIdRef = useRef<string | null | undefined>(undefined);
  /// Selection value the URL is currently asking for, while the state update
  /// carrying it is still in flight. `undefined` means nothing is pending.
  const awaitingUrlRef = useRef<string | null | undefined>(undefined);

  // SSE is the primary live path (FleetMap â†’ /tracking/live-stream). When the
  // stream is down, poll the snapshot so a newly arriving real GPS fix still
  // surfaces without waiting for window focus.
  const snapshotPollMs = fleetSnapshotPollIntervalMs(streamStatus);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    isSuccess,
    refetch,
    errorMessage,
  } = useTrackingLiveQuery({
    refetchInterval: snapshotPollMs === false ? undefined : snapshotPollMs,
  });
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

  // Active geofences drawn under the vehicle markers â€” see FleetMap. The
  // dedicated Geofences page already rendered these correctly; this map
  // simply never fetched them.
  const geofencesQuery = useGeofencesList({ active: true, limit: 100 });

  const liveDispatches = useDispatches(1, 200, { statuses: LIVE_DISPATCH });
  const dispatchIndex = useMemo(
    () => buildFleetDispatchIndex(liveDispatches.data ?? []),
    [liveDispatches.data],
  );

  const vehicleDetail = useTrackingVehicleQuery(selectedVehicleId, {
    refetchInterval: snapshotPollMs,
  });
  const historyQuery = useTrackingHistoryQuery(selectedVehicleId, {
    enabled: !!selectedVehicleId,
    hours: 2,
    limit: 200,
  });

  useEffect(() => {
    writeFleetPrefs({ filter, search, clusters, labels, traffic, follow, mapStyle });
  }, [filter, search, clusters, labels, traffic, follow, mapStyle]);

  useEffect(() => {
    if (isSuccess && data) {
      setVehicles((prev) => mergeLiveFleetSnapshot(prev, data));
    }
  }, [data, isSuccess]);

  useEffect(() => {
    const detail = vehicleDetail.data;
    if (!detail) return;
    setVehicles((prev) =>
      prev.map((v) =>
        v.vehicleId === detail.vehicleId ? mergeVehicleDetail(v, detail) : v,
      ),
    );
  }, [vehicleDetail.data]);

  // URL → selection (deep link, refresh, back/forward). Invalid/unauthorized
  // ids are cleared once the live fleet is known — never leak cross-org info.
  useEffect(() => {
    // First paint: prefer ?vehicleId= (already used in useState init). Do not
    // wipe a sessionStorage fallback when the URL has no vehicleId yet — the
    // selection→URL effect will promote it into the query string only after
    // the live snapshot confirms the vehicle belongs to this org.
    if (!urlSelectionHydrated.current) {
      urlSelectionHydrated.current = true;
      prevUrlVehicleIdRef.current = vehicleIdFromUrl ?? null;
      if (vehicleIdFromUrl) {
        setSelectedVehicleId(vehicleIdFromUrl);
        setSelectedIds(new Set([vehicleIdFromUrl]));
      }
      return;
    }

    const fromUrl = vehicleIdFromUrl ?? null;
    const prevUrl = prevUrlVehicleIdRef.current;
    prevUrlVehicleIdRef.current = fromUrl;

    if (fromUrl) {
      awaitingUrlRef.current = fromUrl;
      setSelectedVehicleId((prev) => (prev === fromUrl ? prev : fromUrl));
      setSelectedIds((prev) => {
        if (prev.size === 1 && prev.has(fromUrl)) return prev;
        return new Set([fromUrl]);
      });
      return;
    }

    // URL lost vehicleId after having one (browser back, the sidebar entry
    // linking to the bare route, or the fail-closed strip below).
    // Do not clear when URL never had an id — sessionStorage selection may be
    // pending validation and must not fight the snapshot wait state.
    if (prevUrl) {
      awaitingUrlRef.current = null;
      setSelectedVehicleId(null);
      setSelectedIds(new Set());
    }
  }, [vehicleIdFromUrl]);

  useEffect(() => {
    const decision = resolveDeepLinkSelection({
      selectedVehicleId,
      // Authoritative snapshot is `data` from the query — not local `vehicles`
      // state, which lags one render behind `isSuccess` and caused the race.
      fleetSnapshotSucceeded: isSuccess && Array.isArray(data),
      fleetSnapshotFailed: isError,
      fleetVehicleIds: (data ?? []).map((v) => v.vehicleId),
    });
    if (decision !== 'clear') return;
    // Missing from org fleet (bad id, archived, or other-tenant) — fail closed.
    setSelectedVehicleId(null);
    setSelectedIds(new Set());
    writeStoredSelection(null);
    void navigate({
      search: (prev) => {
        const next = { ...prev };
        delete next.vehicleId;
        return next;
      },
      replace: true,
    });
  }, [data, selectedVehicleId, isSuccess, isError, navigate]);

  useEffect(() => {
    // The effect above has just taken a URL change and called setState for it,
    // but that state lands on the *next* render — so on this pass
    // `selectedVehicleId` still holds the value the URL just moved away from.
    // Acting on it would navigate straight back to the old id, which the other
    // effect would then undo, and the two would trade the query string forever
    // (clicking the sidebar's Fleet Tracking entry with a vehicle selected used
    // to hang the page doing exactly this). Stand down until state has caught
    // up with the URL; from then on this effect owns the sync again.
    if (awaitingUrlRef.current !== undefined) {
      if (awaitingUrlRef.current !== selectedVehicleId) return;
      awaitingUrlRef.current = undefined;
    }

    writeStoredSelection(selectedVehicleId);
    const urlId = vehicleIdFromUrl ?? null;
    const snapshotSucceeded = isSuccess && Array.isArray(data);
    const fleetVehicleIds = (data ?? []).map((v) => v.vehicleId);
    const selectionDecision = resolveDeepLinkSelection({
      selectedVehicleId,
      fleetSnapshotSucceeded: snapshotSucceeded,
      fleetSnapshotFailed: isError,
      fleetVehicleIds,
    });
    const urlDecision = resolveDeepLinkSelection({
      selectedVehicleId: urlId,
      fleetSnapshotSucceeded: snapshotSucceeded,
      fleetSnapshotFailed: isError,
      fleetVehicleIds,
    });
    if (
      !shouldSyncSelectionToSearch({
        selectedVehicleId,
        urlVehicleId: urlId,
        selectionDecision,
        urlDecision,
      })
    ) {
      return;
    }

    void navigate({
      search: (prev) => {
        if (selectedVehicleId) return { ...prev, vehicleId: selectedVehicleId };
        const next = { ...prev };
        delete next.vehicleId;
        return next;
      },
      replace: true,
    });
  }, [selectedVehicleId, vehicleIdFromUrl, navigate, data, isSuccess, isError]);

  // Close mobile sheets if the viewport grows to desktop (asset panel is visible).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => {
      if (!mq.matches) setMobilePane('map');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
      // Asset Sheet is mobile-only (lg side panel covers desktop). Opening it
      // on desktop leaves a full-screen blur overlay with a md:hidden panel.
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        setMobilePane('asset');
      }
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

  const stripChipDefs: Array<{ key: string; label: string; value: number; filter: FleetFilter }> = [
    { key: 'all', label: 'All', value: vehicles.length, filter: 'all' },
    { key: 'moving', label: 'Moving', value: strip.moving, filter: 'moving' },
    { key: 'idle', label: 'Idle', value: strip.idle, filter: 'idle' },
    { key: 'stopped', label: 'Stopped', value: strip.stopped, filter: 'stopped' },
    { key: 'offline', label: 'Offline', value: strip.offline, filter: 'offline' },
    { key: 'nogps', label: 'No GPS', value: strip.noGps, filter: 'no_gps' },
    { key: 'assigned', label: 'Assigned', value: strip.assigned, filter: 'assigned' },
    { key: 'withAlerts', label: 'Alerts', value: strip.withAlerts, filter: 'has_alerts' },
    { key: 'has_driver', label: 'With driver', value: strip.withDriver, filter: 'has_driver' },
    { key: 'no_driver', label: 'No driver', value: strip.noDriver, filter: 'no_driver' },
  ];
  const stripChips = stripChipDefs.filter(
    (c) => c.filter === 'all' || c.value > 0 || c.filter === filter,
  );

  const trackedOnMap = filtered.filter(hasCoordinates).length;
  const emptyFleet = isSuccess && vehicles.length === 0;
  const streamLiveData = isLiveGpsDataStream(streamStatus);
  const sseConnected = isSseTransportConnected(streamStatus);
  const streamReconnecting =
    streamStatus === 'connecting' || streamStatus === 'reconnecting';
  const loadErrorMessage =
    errorMessage ?? 'Failed to load the live fleet. Please try again.';
  const selectionCount = selectedIds.size;
  const selectionHiddenByFilter = isSelectionHiddenByFilter(
    selectedVehicleId,
    filtered.map((v) => v.vehicleId),
    vehicles.map((v) => v.vehicleId),
  );

  return (
    <div
      className="flex h-[calc(100vh-4rem)] flex-col"
      data-testid="fleet-tracking-page"
    >
      <WorkspaceHeader
        title="Fleet Tracking"
        status={
          <LivePill
            status={streamStatus}
            lastReceivedAt={selected?.lastReceivedAt ?? null}
            isStale={selected?.isStale}
          />
        }
        subtitle={
          <>
            {isLoading
              ? 'Loading live fleet…'
              : isError
                ? loadErrorMessage
                : emptyFleet
                  ? 'No live tracking devices connected'
                  : `${filtered.length} shown · ${vehicles.length} total · ${trackedOnMap} on map`}
            {!sseConnected && !isLoading && !isError && !emptyFleet && (
              <span className="text-warning">
                {' '}
                · Stream {streamReconnecting ? 'reconnecting' : 'offline'}
              </span>
            )}
            {sseConnected && !streamLiveData && !isLoading && !isError && !emptyFleet && (
              <span className="text-muted-foreground">
                {' '}
                · Connected · waiting for GPS events
              </span>
            )}
          </>
        }
        action={
          <>
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
              className="hidden h-8 md:inline-flex"
              onClick={() => setLeftCollapsed((v) => !v)}
              aria-label={leftCollapsed ? 'Show fleet list' : 'Hide fleet list'}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8" aria-label="More fleet actions">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/app/geofences">
                    <Hexagon className="mr-2 h-3.5 w-3.5" />
                    Geofences
                  </Link>
                </DropdownMenuItem>
                {canManageDevices ? (
                  <DropdownMenuItem asChild>
                    <Link to="/app/devices">
                      <Cpu className="mr-2 h-3.5 w-3.5" />
                      Devices
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {canManageDevices ? (
                  <DropdownMenuItem asChild>
                    <Link to="/app/fleet-tracking/debug">
                      <Bug className="mr-2 h-3.5 w-3.5" />
                      Diagnostics
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <SearchInput
          className="min-w-[14rem]"
          ref={searchRef}
          size="sm"
          value={search}
          onChange={setSearch}
          placeholder="Search plate, code, driver… (/)"
          label="Search fleet"
        />

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Fleet status filters"
        >
          {stripChips.map((chip) => (
            <Button
              key={chip.key}
              size="sm"
              variant={filter === chip.filter ? 'secondary' : 'outline'}
              className="h-7 px-2.5 text-xs"
              aria-pressed={filter === chip.filter}
              onClick={() => setFilter(chip.filter)}
            >
              {chip.label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{chip.value}</span>
            </Button>
          ))}
        </div>

        {selectionHiddenByFilter && selectedVehicleId ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-foreground">
            <span>Selected vehicle is hidden by the active filter.</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setFilter('all');
                setSearch('');
              }}
            >
              Clear filter
            </Button>
          </div>
        ) : null}

        {selectionCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5">
            <span className="text-xs font-medium text-foreground">
              {selectionCount} selected
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={handleFitSelected}>
              <ZoomIn className="mr-1.5 h-3.5 w-3.5" />
              Fit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                if (selectedVehicleId) mapRef.current?.focusVehicle(selectedVehicleId);
                else handleFitSelected();
              }}
              disabled={!selectedVehicleId && selectionCount === 0}
            >
              <Focus className="mr-1.5 h-3.5 w-3.5" />
              Zoom
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={handleClearSelection}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        )}
      </WorkspaceHeader>

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
        <div ref={workspaceRef} className="relative flex min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              'min-h-0 shrink-0 border-r border-border/60 bg-surface',
              'hidden md:flex md:flex-col',
              leftCollapsed ? 'md:w-0 md:overflow-hidden md:border-0' : 'md:w-[22%]',
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

          <div className="relative min-h-0 min-w-0 flex-1">
            <FleetMap
              ref={mapRef}
              vehicles={filtered}
              selectedIds={selectedIdList}
              selectedVehicleId={selectionHiddenByFilter ? null : selectedVehicleId}
              geofences={geofencesQuery.items}
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
              fullscreenRootRef={workspaceRef}
              className="h-full"
            />

            <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-lg border border-border/70 bg-surface/95 p-1 shadow-sm md:hidden">
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => setMobilePane('list')}
              >
                <LayoutList className="mr-1.5 h-3.5 w-3.5" />
                Fleet
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => setMobilePane('asset')}
              >
                <Truck className="mr-1.5 h-3.5 w-3.5" />
                Asset
              </Button>
            </div>
          </div>

          <div className="hidden min-h-0 shrink-0 bg-surface lg:flex lg:w-[22%] lg:flex-col">
            <FleetAssetPanel
              vehicle={selected}
              liveDispatch={selectedDispatch}
              streamLive={sseConnected}
              streamStatusLabel={streamStatusLabel(streamStatus)}
              streamStatus={streamStatus}
              historyPointCount={historyQuery.data?.pointCount}
              recentHistory={historyQuery.data?.points ?? []}
              detailLoading={vehicleDetail.isFetching}
              hasOpenAlert={selected ? alertVehicleIds.has(selected.vehicleId) : undefined}
            />
          </div>

          <Sheet
            open={mobilePane === 'list'}
            onOpenChange={(open) => setMobilePane(open ? 'list' : 'map')}
          >
            <SheetContent side="bottom" className="flex h-[75vh] flex-col p-0 md:hidden">
              <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
                <SheetTitle>Fleet</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1">
                <VehicleSidebar
                  vehicles={filtered}
                  selectedVehicleId={selectedVehicleId}
                  selectedIds={selectedIds}
                  dispatchIndex={dispatchIndex}
                  onSelectVehicle={(id, opts) => {
                    handleSelectVehicle(id, opts);
                    setMobilePane('map');
                  }}
                  onClearSelection={handleClearSelection}
                  onFitSelected={handleFitSelected}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet
            open={mobilePane === 'asset'}
            onOpenChange={(open) => setMobilePane(open ? 'asset' : 'map')}
          >
            <SheetContent side="bottom" className="flex h-[80vh] flex-col p-0 md:hidden">
              <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
                <SheetTitle>Selected asset</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-hidden">
                <FleetAssetPanel
                  vehicle={selected}
                  liveDispatch={selectedDispatch}
                  streamLive={sseConnected}
                  streamStatusLabel={streamStatusLabel(streamStatus)}
                  streamStatus={streamStatus}
                  historyPointCount={historyQuery.data?.pointCount}
                  recentHistory={historyQuery.data?.points ?? []}
                  detailLoading={vehicleDetail.isFetching}
                  hasOpenAlert={selected ? alertVehicleIds.has(selected.vehicleId) : undefined}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}

function LivePill({
  status,
  lastReceivedAt,
  isStale,
}: {
  status: StreamStatus;
  lastReceivedAt: string | null;
  isStale?: boolean;
}) {
  const relative = lastReceivedAt ? formatRelativeTime(lastReceivedAt) : null;
  const pill = describeFleetStreamPill({
    streamStatus: status,
    lastReceivedAt,
    isStale,
    lastReceivedRelative: relative,
  });
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 text-xs font-medium',
        pill.tone === 'live'
          ? 'border-success/30 bg-success/10 text-success'
          : pill.tone === 'connected'
            ? 'border-primary/30 bg-primary/10 text-primary'
            : pill.tone === 'warn'
              ? 'border-warning/30 bg-warning/10 text-warning'
              : 'border-border/60 bg-muted/30 text-muted-foreground',
      )}
      title={pill.title}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          pill.tone === 'live'
            ? 'animate-pulse bg-success'
            : pill.tone === 'connected'
              ? 'bg-primary'
              : pill.tone === 'warn'
                ? 'animate-pulse bg-warning'
                : 'bg-muted-foreground/50',
        )}
        aria-hidden
      />
      <span className="truncate">{pill.label}</span>
    </span>
  );
}
