'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDriversList, type Driver } from '@/lib/api/drivers';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { SearchInput } from '@/components/shared/search-input';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { DriverAvatar } from '@/components/drivers/driver-avatar';
import { DriversCreateSheet } from '@/components/drivers/drivers-create-sheet';
import { DriversEditSheet } from '@/components/drivers/drivers-edit-sheet';
import { DriversAssignDispatchSheet } from '@/components/drivers/drivers-assign-dispatch-sheet';
import { DriversAssignVehicleSheet } from '@/components/drivers/drivers-assign-vehicle-sheet';
import {
  LIVE_DISPATCH,
  buildDriverOpsIndex,
  driverAvailabilityLabel,
  driverInitials,
  driverPrimaryBadge,
  driverRiskBadges,
  isLicenseExpiring,
  isLicenseExpired,
  type DriverOpsBadge,
} from '@/components/drivers/drivers-ops';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatRelativeTime, formatDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Clock,
  Download,
  Edit2,
  Eye,
  Filter,
  MoreHorizontal,
  Phone,
  Plus,
  Truck,
  UserRoundCog,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type CrmTab = 'all' | 'available' | 'on_trip' | 'assigned' | 'on_leave' | 'inactive' | 'archived';

const ROSTER_FETCH_LIMIT = 100;

interface TabDef {
  key: CrmTab;
  label: string;
  dot?: string;       // dot color class
  activeCls: string;  // active pill class
  countCls: string;   // count badge class (any active state)
}

const TAB_CONFIG: TabDef[] = [
  {
    key: 'all',
    label: 'All',
    activeCls: 'border-foreground/20 text-foreground bg-muted/40',
    countCls: 'bg-muted/80 text-muted-foreground',
  },
  {
    key: 'available',
    label: 'Available',
    dot: 'bg-emerald-500',
    activeCls: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10',
    countCls: 'bg-emerald-500/20 text-emerald-400',
  },
  {
    key: 'on_trip',
    label: 'On Trip',
    dot: 'bg-sky-500',
    activeCls: 'border-sky-500/50 text-sky-400 bg-sky-500/10',
    countCls: 'bg-sky-500/20 text-sky-400',
  },
  {
    key: 'assigned',
    label: 'Assigned',
    dot: 'bg-brand',
    activeCls: 'border-brand/50 text-brand bg-brand/10',
    countCls: 'bg-brand/20 text-brand',
  },
  {
    key: 'on_leave',
    label: 'On Leave',
    dot: 'bg-violet-500',
    activeCls: 'border-violet-500/50 text-violet-400 bg-violet-500/10',
    countCls: 'bg-violet-500/20 text-violet-400',
  },
  {
    key: 'inactive',
    label: 'Inactive',
    activeCls: 'border-border text-muted-foreground bg-muted/40',
    countCls: 'bg-muted/60 text-muted-foreground',
  },
  {
    key: 'archived',
    label: 'Archived',
    activeCls: 'border-border text-muted-foreground bg-muted/40',
    countCls: 'bg-muted/60 text-muted-foreground',
  },
];

// ─── Status style overrides (on top of badge.className) ───────────────────────

function getStatusBadgeClass(key: string, fallback: string): string {
  switch (key) {
    case 'available':
      return 'bg-success/15 text-success ring-1 ring-inset ring-success/25';
    case 'driving':
    case 'waiting':
      return 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/25';
    case 'assigned':
      return 'bg-brand/15 text-brand ring-1 ring-inset ring-brand/25';
    case 'resting':
      return 'bg-violet-500/15 text-violet-400 ring-1 ring-inset ring-violet-500/25';
    case 'inactive':
      return 'bg-muted/60 text-muted-foreground';
    case 'archived':
      return 'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25';
    default:
      return fallback;
  }
}

function getStatusLabel(key: string, fallback: string): string {
  const MAP: Record<string, string> = {
    driving: 'On Trip',
    waiting: 'On Trip',
    assigned: 'Assigned',
    resting: 'On Leave',
  };
  return MAP[key] ?? fallback;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tabToQuery(tab: CrmTab): {
  status?: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  includeArchived?: boolean;
} {
  switch (tab) {
    case 'available':
    case 'on_trip':
    case 'assigned':
      return { status: 'ACTIVE', includeArchived: false };
    case 'on_leave':
      return { status: 'ON_LEAVE', includeArchived: false };
    case 'inactive':
      return { status: 'INACTIVE', includeArchived: false };
    case 'archived':
      return { includeArchived: true };
    default:
      return { includeArchived: false };
  }
}

const TRIP_STATUSES = new Set(['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT']);

function nextAvailableLabel(driver: Driver, live: ApiDispatch | null): string {
  if (driver.archivedAt || driver.status === 'INACTIVE' || driver.status === 'ON_LEAVE') return '—';
  if (!live) return 'Now';
  return formatDate(live.deliveryDateScheduled);
}

function vehicleStatusMeta(live: ApiDispatch | null): { label: string; cls: string } | null {
  if (!live?.vehicle) return null;
  if (TRIP_STATUSES.has(live.status))
    return { label: 'On Trip', cls: 'bg-sky-500/15 text-sky-400' };
  return { label: 'In Depot', cls: 'bg-muted/60 text-muted-foreground' };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DriversList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/drivers/' });

  const tab: CrmTab = (TAB_CONFIG.some((t) => t.key === searchState.tab)
    ? searchState.tab
    : 'all') as CrmTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const createOpen = Boolean(searchState.create);
  const highlightId = typeof searchState.highlight === 'string' ? searchState.highlight : null;

  const clientFilterTab = ['archived', 'available', 'on_trip', 'assigned'].includes(tab);

  const { items, meta, loading, error, refetch } = useDriversList({
    page: clientFilterTab ? 1 : page,
    limit: clientFilterTab ? ROSTER_FETCH_LIMIT : 20,
    search: search || undefined,
    ...tabToQuery(tab),
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const liveDispatches = useDispatches(1, 200, { statuses: LIVE_DISPATCH });
  const opsIndex = useMemo(
    () => buildDriverOpsIndex(liveDispatches.data ?? []),
    [liveDispatches.data],
  );
  const liveDispatchesTruncated = (liveDispatches.meta?.total ?? 0) > 200;

  const activeRoster = useDriversList({ status: 'ACTIVE', limit: ROSTER_FETCH_LIMIT });
  const onLeaveMeta = useDriversList({ status: 'ON_LEAVE', limit: 1 });
  const inactiveMeta = useDriversList({ status: 'INACTIVE', limit: 1 });

  const rosterCounts = useMemo(() => {
    let available = 0, onTrip = 0, assigned = 0, licenseExpiring = 0, licenseExpiredCount = 0;
    for (const d of activeRoster.items ?? []) {
      if (d.archivedAt) continue;
      const live = opsIndex.get(d.id)?.liveDispatch ?? null;
      if (!live) available++;
      else if (live.status === 'ASSIGNED') assigned++;
      else onTrip++;
      if (isLicenseExpiring(d.licenseExpiry)) licenseExpiring++;
      if (isLicenseExpired(d.licenseExpiry)) licenseExpiredCount++;
    }
    return { available, onTrip, assigned, licenseExpiring, licenseExpired: licenseExpiredCount };
  }, [activeRoster.items, opsIndex]);

  const totalAllDrivers =
    (activeRoster.meta?.total ?? 0) +
    (onLeaveMeta.meta?.total ?? 0) +
    (inactiveMeta.meta?.total ?? 0);

  const tabCounts: Partial<Record<CrmTab, number>> = {
    all: totalAllDrivers,
    available: rosterCounts.available,
    on_trip: rosterCounts.onTrip,
    assigned: rosterCounts.assigned,
    on_leave: onLeaveMeta.meta?.total,
    inactive: inactiveMeta.meta?.total,
  };

  const [localSearch, setLocalSearch] = useState(search);
  const [selectedId, setSelectedId] = useState<string | null>(highlightId);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [assignDispatch, setAssignDispatch] = useState<Driver | null>(null);
  const [assignVehicle, setAssignVehicle] = useState<Driver | null>(null);

  useEffect(() => { setLocalSearch(search); }, [search]);
  useEffect(() => { if (highlightId) setSelectedId(highlightId); }, [highlightId]);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    navigate({
      to: '/app/drivers',
      search: (prev) => ({ ...prev, page: 1, search: debouncedSearch || undefined }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const displayRows = useMemo(() => {
    if (tab === 'archived') return items.filter((d) => Boolean(d.archivedAt));
    if (tab === 'available')
      return items.filter((d) => !d.archivedAt && d.status === 'ACTIVE' && !opsIndex.get(d.id)?.liveDispatch);
    if (tab === 'on_trip')
      return items.filter((d) => !d.archivedAt && d.status === 'ACTIVE' && TRIP_STATUSES.has(opsIndex.get(d.id)?.liveDispatch?.status ?? ''));
    if (tab === 'assigned')
      return items.filter((d) => !d.archivedAt && d.status === 'ACTIVE' && opsIndex.get(d.id)?.liveDispatch?.status === 'ASSIGNED');
    return items;
  }, [items, tab, opsIndex]);

  const setCreateOpen = (open: boolean) => {
    navigate({ to: '/app/drivers', search: (prev) => ({ ...prev, create: open ? true : undefined }) });
  };

  const setTab = (next: CrmTab) => {
    navigate({ to: '/app/drivers', search: { page: 1, search: search || undefined, tab: next } });
  };

  const handleExport = () => {
    if (displayRows.length === 0) { toast.error('Nothing to export'); return; }
    const rows = displayRows.map((d) => {
      const live = opsIndex.get(d.id)?.liveDispatch ?? null;
      const avail = driverAvailabilityLabel(d, live);
      return {
        code: d.employeeCode, name: `${d.firstName} ${d.lastName}`,
        phone: d.phone, email: d.email ?? '', status: d.status,
        availability: avail.label, vehicle: live?.vehicle?.plateNumber ?? '',
        dispatch: live?.dispatchNumber ?? '', order: live?.order?.orderNumber ?? '',
        license: d.licenseNumber ?? '', licenseExpiry: d.licenseExpiry ?? '',
        updatedAt: d.updatedAt,
      };
    });
    downloadCsv(`drivers-${tab}.csv`, toCsv(rows, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' }, { key: 'availability', label: 'Availability' },
      { key: 'vehicle', label: 'Vehicle' }, { key: 'dispatch', label: 'Dispatch' },
      { key: 'order', label: 'Order' }, { key: 'license', label: 'License' },
      { key: 'licenseExpiry', label: 'License expiry' }, { key: 'updatedAt', label: 'Updated' },
    ]));
    toast.success('Exported current page');
  };

  const hasFilters = Boolean(search || tab !== 'all');

  const overviewStats = {
    total: totalAllDrivers,
    available: rosterCounts.available,
    onTrip: rosterCounts.onTrip,
    assigned: rosterCounts.assigned,
    onLeave: onLeaveMeta.meta?.total ?? 0,
    inactive: inactiveMeta.meta?.total ?? 0,
  };

  return (
    <div className="space-y-4" data-testid="drivers-page">
      <PageHeader
        title="Drivers"
        subtitle={
          loading
            ? 'Loading…'
            : error
              ? 'Could not load drivers'
              : `${totalAllDrivers} drivers · ${rosterCounts.available} available`
        }
        action={
          <>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={displayRows.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              size="sm"
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              onClick={() => setCreateOpen(true)}
              data-testid="create-driver-button"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Driver
            </Button>
          </>
        }
      />

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <SearchInput
          className="flex-1"
          value={localSearch}
          onChange={setLocalSearch}
          placeholder="Search name, phone, email, license, vehicle, plate..."
          label="Search drivers"
          testId="drivers-search-input"
        />
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
        </Button>
      </div>

      {liveDispatchesTruncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          Live dispatches exceed 200 — some vehicle and availability badges may be understated.
        </div>
      )}

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {TAB_CONFIG.map((t) => {
          const count = tabCounts[t.key];
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition-all',
                isActive
                  ? t.activeCls
                  : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground',
              )}
            >
              {t.dot && count != null && count > 0 && (
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.dot)} />
              )}
              {t.label}
              {count != null && (
                <span
                  className={cn(
                    'min-w-[1.2rem] rounded-full px-1 text-center text-[10px] font-bold tabular-nums leading-[1.5]',
                    isActive ? t.countCls : 'bg-muted/80 text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Two-column layout on xl */}
      <div className="xl:grid xl:items-start xl:grid-cols-[1fr_260px] xl:gap-4">

        {/* Main table */}
        <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
          {loading && <DriversTableSkeleton />}
          {error && !loading && <ErrorState message={error} onRetry={() => void refetch()} />}

          {!loading && !error && displayRows.length === 0 && (
            <EmptyState
              title={hasFilters ? 'No drivers match' : 'No drivers yet'}
              description={
                hasFilters
                  ? 'Try another tab or clear your search.'
                  : 'Add your first driver to start assigning dispatches.'
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={() => setTab('all')}>Show all drivers</Button>
                ) : (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Driver
                  </Button>
                )
              }
            />
          )}

          {!loading && !error && displayRows.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/[0.06]">
                  <th scope="col" className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Driver
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                    Vehicle
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">
                    Current Order
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground xl:table-cell">
                    Next Available
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
                    Updated
                  </th>
                  <th scope="col" className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {displayRows.map((driver) => {
                  const live = opsIndex.get(driver.id)?.liveDispatch ?? null;
                  return (
                    <DriverTableRow
                      key={driver.id}
                      driver={driver}
                      live={live}
                      selected={selectedId === driver.id || highlightId === driver.id}
                      onSelect={() => setSelectedId(driver.id)}
                      onOpen={() =>
                        navigate({ to: '/app/drivers/$driverId', params: { driverId: driver.id } })
                      }
                      onEdit={() => setEditing(driver)}
                      onAssignDispatch={() => setAssignDispatch(driver)}
                      onAssignVehicle={() => setAssignVehicle(driver)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Table footer with count */}
          {!loading && !error && displayRows.length > 0 && (
            <div className="border-t border-border/40 px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                {clientFilterTab
                  ? `Showing ${displayRows.length} driver${displayRows.length !== 1 ? 's' : ''}`
                  : `Showing ${((page - 1) * 20) + 1}–${Math.min(page * 20, meta?.total ?? 0)} of ${meta?.total ?? 0} drivers`
                }
              </p>
            </div>
          )}
        </div>

        {/* Overview panel */}
        <DriverOverviewPanel
          stats={overviewStats}
          licenseExpiring={rosterCounts.licenseExpiring}
          licenseExpired={rosterCounts.licenseExpired}
          className="hidden xl:sticky xl:top-4 xl:block"
        />
      </div>

      {/* Pagination */}
      {!clientFilterTab && !loading && !error && (meta?.totalPages ?? 0) > 1 && (
        <PaginationBar
          page={meta?.page ?? 1}
          totalPages={meta?.totalPages ?? 1}
          total={meta?.total ?? 0}
          onPageChange={(newPage) =>
            navigate({ to: '/app/drivers', search: (prev) => ({ ...prev, page: newPage }) })
          }
        />
      )}

      {/* Sheets */}
      <DriversCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(d) =>
          navigate({ to: '/app/drivers', search: { tab: 'all', highlight: d.id, page: 1 } })
        }
      />
      {editing && (
        <DriversEditSheet
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          driver={editing}
        />
      )}
      {assignDispatch && (
        <DriversAssignDispatchSheet
          open={Boolean(assignDispatch)}
          onOpenChange={(open) => !open && setAssignDispatch(null)}
          driver={assignDispatch}
        />
      )}
      {assignVehicle && (
        <DriversAssignVehicleSheet
          open={Boolean(assignVehicle)}
          onOpenChange={(open) => !open && setAssignVehicle(null)}
          driver={assignVehicle}
          liveDispatch={opsIndex.get(assignVehicle.id)?.liveDispatch ?? null}
        />
      )}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function DriverTableRow({
  driver, live, selected, onSelect, onOpen, onEdit, onAssignDispatch, onAssignVehicle,
}: {
  driver: Driver;
  live: ApiDispatch | null;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onAssignDispatch: () => void;
  onAssignVehicle: () => void;
}) {
  const primary = driverPrimaryBadge(driver, live);
  const risks = driverRiskBadges(driver, live).filter((b) => b.key !== primary.key);
  const canAssign = !driver.archivedAt && driver.status === 'ACTIVE';
  const vehicleId = live?.vehicle?.id ?? live?.vehicleId ?? null;
  const orderId = live?.orderId ?? null;
  const vehicle = live?.vehicle ?? null;
  const order = live?.order ?? null;
  const nextAvail = nextAvailableLabel(driver, live);
  const vehStatus = vehicleStatusMeta(live);

  // Secondary status info
  const statusSecondary: string | null = (() => {
    if (primary.key === 'assigned') return 'Trip not started';
    if (driver.status === 'INACTIVE') return 'Not active';
    return null;
  })();

  return (
    <tr
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={cn(
        'group relative outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/20',
        selected && 'bg-brand/[0.04]',
      )}
    >
      {/* Driver identity */}
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="flex items-center gap-3 text-left focus:outline-none"
        >
          <DriverAvatar driver={driver} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">
              {driver.firstName} {driver.lastName}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{driver.employeeCode}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Phone className="h-2.5 w-2.5 shrink-0" />
              {driver.phone}
            </p>
          </div>
        </button>
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <div className="space-y-1">
          <OpsChip badge={primary} />
          {statusSecondary && (
            <p className="text-[10px] text-muted-foreground">{statusSecondary}</p>
          )}
          {risks.slice(0, 1).map((b) => (
            <OpsChip key={b.key} badge={b} dense />
          ))}
        </div>
      </td>

      {/* Vehicle */}
      <td className="hidden px-3 py-3 md:table-cell" onClick={(e) => e.stopPropagation()}>
        {vehicle ? (
          <div className="min-w-0">
            {vehicleId ? (
              <Link
                to="/app/vehicles/$vehicleId"
                params={{ vehicleId }}
                className="group/veh block"
              >
                <p className="truncate text-sm font-medium capitalize text-foreground group-hover/veh:text-brand">
                  {vehicle.type?.toLowerCase().replace(/_/g, ' ') ?? vehicle.plateNumber}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {vehicle.plateNumber}
                </p>
              </Link>
            ) : (
              <>
                <p className="truncate text-sm font-medium capitalize text-foreground">
                  {vehicle.type?.toLowerCase().replace(/_/g, ' ') ?? vehicle.plateNumber}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {vehicle.plateNumber}
                </p>
              </>
            )}
            {vehStatus && (
              <span className={cn(
                'mt-1 inline-block rounded px-1.5 py-0 text-[10px] font-medium leading-4',
                vehStatus.cls,
              )}>
                {vehStatus.label}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] italic text-muted-foreground/60">No vehicle</span>
        )}
      </td>

      {/* Current Order */}
      <td className="hidden px-3 py-3 lg:table-cell" onClick={(e) => e.stopPropagation()}>
        {order && orderId ? (
          <Link
            to="/app/orders/$orderId"
            params={{ orderId }}
            className="group/ord block min-w-0"
          >
            <p className="font-mono text-sm font-semibold text-brand group-hover/ord:underline">
              {order.orderNumber}
            </p>
            {order.pickupCity && order.deliveryCity && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="max-w-[52px] truncate">{order.pickupCity}</span>
                <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                <span className="max-w-[52px] truncate">{order.deliveryCity}</span>
              </p>
            )}
            {live?.deliveryDateScheduled && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                ETA {formatDate(live.deliveryDateScheduled)}
              </p>
            )}
          </Link>
        ) : (
          <span className="text-[11px] italic text-muted-foreground/60">No active order</span>
        )}
      </td>

      {/* Next Available */}
      <td className="hidden px-3 py-3 xl:table-cell">
        {nextAvail === 'Now' ? (
          <span className="text-sm font-semibold text-success">Now</span>
        ) : nextAvail === '—' ? (
          <span className="text-[11px] text-muted-foreground/60">—</span>
        ) : (
          <div>
            <p className="text-sm font-medium text-foreground">{nextAvail}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5 shrink-0" />
              scheduled
            </p>
          </div>
        )}
      </td>

      {/* Updated */}
      <td className="hidden px-3 py-3 text-right sm:table-cell">
        <span className="text-[11px] text-muted-foreground" title={driver.updatedAt}>
          {formatRelativeTime(driver.updatedAt)}
        </span>
      </td>

      {/* Actions — always visible */}
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          {/* Phone — hidden below md */}
          <Button size="sm" variant="ghost" className="hidden h-7 items-center gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground md:flex" asChild>
            <a href={`tel:${driver.phone}`}>
              <Phone className="h-3 w-3 shrink-0" />
              <span className="max-w-[90px] truncate font-mono">{driver.phone}</span>
            </a>
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={onOpen} title="Open driver">
            <Eye className="h-3.5 w-3.5" />
            <span className="sr-only">Open driver</span>
          </Button>
          {!driver.archivedAt && (
            <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={onEdit} title="Edit driver">
              <Edit2 className="h-3.5 w-3.5" />
              <span className="sr-only">Edit driver</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 px-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpen}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                Open driver
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`tel:${driver.phone}`}>
                  <Phone className="mr-2 h-3.5 w-3.5" />
                  Call
                </a>
              </DropdownMenuItem>
              {canAssign && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onAssignDispatch}>
                    <UserRoundCog className="mr-2 h-3.5 w-3.5" />
                    Assign dispatch
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAssignVehicle}>
                    <Truck className="mr-2 h-3.5 w-3.5" />
                    Assign vehicle
                  </DropdownMenuItem>
                </>
              )}
              {orderId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/app/orders/$orderId" params={{ orderId }}>View current order</Link>
                  </DropdownMenuItem>
                </>
              )}
              {!driver.archivedAt && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Edit driver
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function OpsChip({ badge, dense }: { badge: DriverOpsBadge; dense?: boolean }) {
  const overrideClass = getStatusBadgeClass(badge.key, badge.className);
  const label = getStatusLabel(badge.key, badge.label);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        dense ? 'px-1.5 py-0 text-[10px] leading-4' : 'px-2 py-0.5 text-xs leading-[1.4]',
        overrideClass,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({
  segments,
  total,
  size = 140,
}: {
  segments: { value: number; color: string }[];
  total: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const sw = 15;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;

  const active = segments.filter((s) => s.value > 0);
  let cumLen = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
        {total > 0 && active.map((seg, i) => {
          const segLen = (seg.value / total) * circ;
          const off = cumLen;
          cumLen += segLen;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={sw}
              strokeDasharray={`${segLen} ${circ}`}
              strokeDashoffset={-off}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
        <span className="text-[10px] text-muted-foreground">Total</span>
      </div>
    </div>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────

function DriverOverviewPanel({
  stats, licenseExpiring, licenseExpired, className,
}: {
  stats: { total: number; available: number; onTrip: number; assigned: number; onLeave: number; inactive: number };
  licenseExpiring: number;
  licenseExpired: number;
  className?: string;
}) {
  const statusRows = [
    { label: 'Available', count: stats.available, dot: 'bg-emerald-500', text: 'text-success',          hex: '#22c55e' },
    { label: 'On Trip',   count: stats.onTrip,    dot: 'bg-sky-500',     text: 'text-sky-400',          hex: '#38bdf8' },
    { label: 'Assigned',  count: stats.assigned,  dot: 'bg-brand',       text: 'text-brand',            hex: '#f97316' },
    { label: 'On Leave',  count: stats.onLeave,   dot: 'bg-violet-500',  text: 'text-violet-400',       hex: '#a855f7' },
    { label: 'Inactive',  count: stats.inactive,  dot: 'bg-muted-foreground', text: 'text-muted-foreground', hex: '#4b5563' },
  ];

  const donutSegments = statusRows.map((r) => ({ value: r.count, color: r.hex }));

  const attention = [
    ...(licenseExpired > 0
      ? [{ label: 'License expired', count: licenseExpired, cls: 'bg-destructive/[0.07] text-destructive border-destructive/20', icon: AlertCircle }]
      : []),
    ...(licenseExpiring > 0
      ? [{ label: 'License expiring soon', count: licenseExpiring, cls: 'bg-warning/[0.07] text-warning border-warning/20', icon: Clock }]
      : []),
  ];

  return (
    <aside className={cn('space-y-3', className)}>
      {/* Stats */}
      <div className="rounded-xl border border-border/70 bg-surface p-4">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Driver Overview
        </p>

        {/* Donut + legend */}
        <div className="flex items-center gap-4">
          <DonutChart segments={donutSegments} total={stats.total} size={112} />
          <div className="min-w-0 flex-1 space-y-1.5">
            {statusRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', row.dot)} />
                  <span className="text-[11px] text-foreground/80">{row.label}</span>
                </div>
                <span className={cn('text-[11px] font-bold tabular-nums', row.text)}>{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Filters — only show when we have real data */}
      {attention.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-surface p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Quick Filters
          </p>
          <div className="space-y-1.5">
            {attention.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className={cn('flex items-center justify-between rounded-lg border px-2.5 py-2', f.cls)}>
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">{f.label}</span>
                  </div>
                  <span className="text-xs font-bold tabular-nums">{f.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border border-border/70 bg-surface p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Legend
        </p>
        <div className="space-y-2.5 text-xs">
          {[
            { dot: 'bg-emerald-500',       label: 'Available', desc: 'Driver is free and ready'         },
            { dot: 'bg-sky-500',           label: 'On Trip',   desc: 'Driver is on an active delivery'  },
            { dot: 'bg-brand',             label: 'Assigned',  desc: 'Driver assigned, trip not started' },
            { dot: 'bg-violet-500',        label: 'On Leave',  desc: 'Driver is on leave'               },
            { dot: 'bg-muted-foreground',  label: 'Inactive',  desc: 'Driver not active'                },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2">
              <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', item.dot)} />
              <div className="min-w-0">
                <span className="font-medium text-foreground/80">{item.label}</span>
                <span className="text-muted-foreground"> — {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DriversTableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading drivers">
      <div className="border-b border-border/50 bg-muted/[0.06] px-4 py-2.5">
        <div className="flex gap-6">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="hidden h-2.5 w-16 md:block" />
          <Skeleton className="hidden h-2.5 w-20 lg:block" />
        </div>
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/40 px-4 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-[1.5] space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
          <div className="hidden flex-1 space-y-1.5 md:block">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-2.5 w-14" />
          </div>
          <div className="hidden flex-1 space-y-1.5 lg:block">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <Skeleton className="hidden h-3 w-10 sm:block" />
          <Skeleton className="h-6 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}
