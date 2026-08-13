'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDriversList, type Driver, type DriverStatus } from '@/lib/api/drivers';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
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
  isWorkingToday,
  type DriverOpsBadge,
} from '@/components/drivers/drivers-ops';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatRelativeTime } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Download,
  Edit2,
  ExternalLink,
  IdCard,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Truck,
  UserRoundCog,
} from 'lucide-react';
import { toast } from 'sonner';

type CrmTab = 'active' | 'available' | 'on_leave' | 'inactive' | 'archived' | 'all';

/// ListDriversQueryDto caps `limit` at 100 — asking for more is a 400, not a big page.
const ROSTER_FETCH_LIMIT = 100;

const TAB_CONFIG: { key: CrmTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'available', label: 'Available' },
  { key: 'on_leave', label: 'On Leave' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

function tabToQuery(tab: CrmTab): {
  status?: DriverStatus;
  includeArchived?: boolean;
} {
  switch (tab) {
    case 'active':
    case 'available':
      return { status: 'ACTIVE', includeArchived: false };
    case 'on_leave':
      return { status: 'ON_LEAVE', includeArchived: false };
    case 'inactive':
      return { status: 'INACTIVE', includeArchived: false };
    case 'archived':
      return { includeArchived: true };
    case 'all':
    default:
      return { includeArchived: false };
  }
}

export function DriversList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/drivers/' });

  const tab = (TAB_CONFIG.some((t) => t.key === searchState.tab)
    ? searchState.tab
    : 'active') as CrmTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const createOpen = Boolean(searchState.create);
  const highlightId = typeof searchState.highlight === 'string' ? searchState.highlight : null;
  const tabQuery = tabToQuery(tab);

  /// Tabs whose rows are narrowed client-side from a single wide fetch.
  const clientFilterTab = tab === 'archived' || tab === 'available';

  const { items, meta, loading, error, refetch } = useDriversList({
    page: clientFilterTab ? 1 : page,
    limit: clientFilterTab ? ROSTER_FETCH_LIMIT : 20,
    search: search || undefined,
    status: tabQuery.status,
    includeArchived: tabQuery.includeArchived,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const liveDispatches = useDispatches(1, 200, {
    statuses: LIVE_DISPATCH,
  });

  const opsIndex = useMemo(
    () => buildDriverOpsIndex(liveDispatches.data ?? []),
    [liveDispatches.data],
  );

  /// This fetch is capped at 200 (see ROSTER_FETCH_LIMIT comment above for the
  /// same ceiling on the driver side). An org running more live dispatches than
  /// that at once would have some drivers' availability/vehicle badges below
  /// silently understated rather than shown as unknown — surface it instead.
  const liveDispatchesTruncated = (liveDispatches.meta?.total ?? 0) > 200;

  const activeMeta = useDriversList({ status: 'ACTIVE', limit: 1 });
  const onLeaveMeta = useDriversList({ status: 'ON_LEAVE', limit: 1 });
  const inactiveMeta = useDriversList({ status: 'INACTIVE', limit: 1 });

  const [localSearch, setLocalSearch] = useState(search);
  const [selectedId, setSelectedId] = useState<string | null>(highlightId);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [assignDispatch, setAssignDispatch] = useState<Driver | null>(null);
  const [assignVehicle, setAssignVehicle] = useState<Driver | null>(null);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    if (highlightId) setSelectedId(highlightId);
  }, [highlightId]);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    navigate({
      to: '/app/drivers',
      search: (prev) => ({
        ...prev,
        page: 1,
        search: debouncedSearch || undefined,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const displayRows = useMemo(() => {
    if (tab === 'archived') {
      return items.filter((d) => Boolean(d.archivedAt));
    }
    if (tab === 'available') {
      return items.filter(
        (d) => !d.archivedAt && d.status === 'ACTIVE' && !opsIndex.get(d.id)?.liveDispatch,
      );
    }
    return items;
  }, [items, tab, opsIndex]);

  const stripCounts = useMemo(() => {
    let available = 0;
    let driving = 0;
    let noVehicle = 0;
    let assignedToday = 0;
    let licenseExpiring = 0;
    for (const d of items) {
      if (d.archivedAt) continue;
      const live = opsIndex.get(d.id)?.liveDispatch ?? null;
      if (d.status === 'ACTIVE' && !live) available += 1;
      if (live?.status === 'IN_TRANSIT') driving += 1;
      if (live && !live.vehicle) noVehicle += 1;
      if (isWorkingToday(live)) assignedToday += 1;
      if (isLicenseExpiring(d.licenseExpiry)) licenseExpiring += 1;
    }
    return {
      available,
      driving,
      noVehicle,
      assignedToday,
      licenseExpiring,
      onLeave: onLeaveMeta.meta?.total ?? 0,
      inactive: inactiveMeta.meta?.total ?? 0,
      archived: items.filter((d) => d.archivedAt).length,
    };
  }, [items, opsIndex, onLeaveMeta.meta?.total, inactiveMeta.meta?.total]);

  const setCreateOpen = (open: boolean) => {
    navigate({
      to: '/app/drivers',
      search: (prev) => ({ ...prev, create: open ? true : undefined }),
    });
  };

  const setTab = (next: CrmTab) => {
    navigate({
      to: '/app/drivers',
      search: {
        page: 1,
        search: search || undefined,
        tab: next,
      },
    });
  };

  const handleExport = () => {
    if (displayRows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const rows = displayRows.map((d) => {
      const live = opsIndex.get(d.id)?.liveDispatch ?? null;
      const avail = driverAvailabilityLabel(d, live);
      return {
        code: d.employeeCode,
        name: `${d.firstName} ${d.lastName}`,
        phone: d.phone,
        email: d.email ?? '',
        status: d.status,
        availability: avail.label,
        vehicle: live?.vehicle?.plateNumber ?? '',
        dispatch: live?.dispatchNumber ?? '',
        order: live?.order?.orderNumber ?? '',
        license: d.licenseNumber ?? '',
        licenseExpiry: d.licenseExpiry ?? '',
        updatedAt: d.updatedAt,
      };
    });
    downloadCsv(
      `drivers-page-${page}.csv`,
      toCsv(rows, [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'status', label: 'Status' },
        { key: 'availability', label: 'Availability' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'dispatch', label: 'Dispatch' },
        { key: 'order', label: 'Order' },
        { key: 'license', label: 'License' },
        { key: 'licenseExpiry', label: 'License expiry' },
        { key: 'updatedAt', label: 'Updated' },
      ]),
    );
    toast.success('Exported current page');
  };

  const summaryChips = [
    { key: 'available', label: 'Available', value: stripCounts.available },
    { key: 'driving', label: 'Driving', value: stripCounts.driving },
    { key: 'novehicle', label: 'No vehicle', value: stripCounts.noVehicle },
    { key: 'today', label: 'Working today', value: stripCounts.assignedToday },
    { key: 'license', label: 'License expiring', value: stripCounts.licenseExpiring },
    { key: 'leave', label: 'On leave', value: stripCounts.onLeave },
    { key: 'inactive', label: 'Inactive', value: stripCounts.inactive },
  ].filter((c) => c.value > 0);

  const hasFilters = Boolean(search || tab !== 'active');
  const activeCount = activeMeta.meta?.total ?? 0;

  return (
    <div className="space-y-4" data-testid="drivers-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Drivers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : error
                ? 'Could not load drivers'
                : `${meta?.total ?? 0} in roster · ${activeCount} active`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search name, code, email, phone…"
            data-testid="drivers-search-input"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button
          size="sm"
          variant={tab === 'available' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('available')}
        >
          Available
        </Button>
        <Button
          size="sm"
          variant={tab === 'on_leave' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('on_leave')}
        >
          On leave
        </Button>
        <Button
          size="sm"
          variant={tab === 'archived' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('archived')}
        >
          Archived
        </Button>
      </div>

      {liveDispatchesTruncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          Live dispatches exceed what this page can total — availability, vehicle, and dispatch
          badges below may be understated for some drivers. Open a driver to see their own current
          assignment.
        </div>
      )}

      {summaryChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summaryChips.map((chip) => (
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

      <div className="flex flex-wrap gap-1 border-b border-border/60">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
        {loading && <DriversListSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={() => void refetch()} />}

        {!loading && !error && displayRows.length === 0 && (
          <EmptyState
            title={hasFilters ? 'No drivers match' : 'No drivers yet'}
            description={
              hasFilters
                ? 'Try another tab or clear search.'
                : 'Add a driver before assigning dispatches.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => setTab('active')}>
                  Show active
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  New Driver
                </Button>
              )
            }
          />
        )}

        {!loading && !error && displayRows.length > 0 && (
          <ul className="divide-y divide-border/50" role="listbox" aria-label="Drivers">
            {displayRows.map((driver) => {
              const live = opsIndex.get(driver.id)?.liveDispatch ?? null;
              return (
                <DriverOpsRow
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
          </ul>
        )}
      </div>

      {!clientFilterTab && !loading && !error && (meta?.totalPages ?? 0) > 1 && (
        <PaginationBar
          page={meta?.page ?? 1}
          totalPages={meta?.totalPages ?? 1}
          total={meta?.total ?? 0}
          onPageChange={(newPage) =>
            navigate({
              to: '/app/drivers',
              search: (prev) => ({ ...prev, page: newPage }),
            })
          }
        />
      )}

      <DriversCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(d) =>
          navigate({
            to: '/app/drivers',
            search: { tab: 'active', highlight: d.id, page: 1 },
          })
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

function DriverOpsRow({
  driver,
  live,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onAssignDispatch,
  onAssignVehicle,
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
  const vehicleId = live?.vehicle?.id ?? live?.vehicleId;
  const orderId = live?.orderId;
  const customerId = live?.order?.customer?.id;

  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={cn(
        'group relative px-4 py-2.5 outline-none transition-colors hover:bg-muted/25 focus-visible:bg-muted/30 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-brand/5 ring-1 ring-inset ring-brand/30',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-center gap-3">
        {/* LEFT — identity */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex min-w-0 flex-[1.2] items-center gap-2.5 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[11px] font-bold text-brand">
            {driverInitials(driver.firstName, driver.lastName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-semibold leading-tight text-foreground">
                {driver.firstName} {driver.lastName}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {driver.employeeCode}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0 text-[11px] leading-tight text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-2.5 w-2.5" />
                {driver.phone}
              </span>
              {driver.licenseNumber && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <IdCard className="h-2.5 w-2.5" />
                  {driver.licenseNumber}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* CENTER — availability + risks */}
        <div className="hidden min-w-0 flex-1 flex-col justify-center gap-1 sm:flex">
          <div className="flex flex-wrap items-center gap-1">
            <OpsChip badge={primary} />
            {driver.status === 'ACTIVE' && !driver.archivedAt && primary.key !== 'available' && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Active
              </span>
            )}
          </div>
          {risks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {risks.slice(0, 3).map((b) => (
                <OpsChip key={b.key} badge={b} dense />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — vehicle / dispatch / order / updated */}
        <div
          className="hidden min-w-0 flex-[1.15] items-center gap-3 lg:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <OpsEntity
            label="Vehicle"
            value={live?.vehicle?.plateNumber}
            href={
              vehicleId
                ? { to: '/app/vehicles/$vehicleId' as const, params: { vehicleId } }
                : null
            }
          />
          <OpsEntity
            label="Dispatch"
            value={live?.dispatchNumber}
            href={
              live
                ? { to: '/app/dispatches/$dispatchId' as const, params: { dispatchId: live.id } }
                : null
            }
          />
          <OpsEntity
            label="Order"
            value={live?.order?.orderNumber}
            href={
              orderId
                ? { to: '/app/orders/$orderId' as const, params: { orderId } }
                : null
            }
          />
          <div className="w-[4.5rem] shrink-0 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Updated
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={driver.updatedAt}>
              {formatRelativeTime(driver.updatedAt)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div
          className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="sr-only">Open</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 px-0" asChild>
            <a href={`tel:${driver.phone}`}>
              <Phone className="h-3.5 w-3.5" />
              <span className="sr-only">Call</span>
            </a>
          </Button>
          {canAssign && (
            <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={onAssignDispatch}>
              <UserRoundCog className="h-3.5 w-3.5" />
              <span className="sr-only">Assign dispatch</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 px-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onOpen}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`tel:${driver.phone}`}>
                  <Phone className="mr-2 h-3.5 w-3.5" />
                  Call
                </a>
              </DropdownMenuItem>
              {canAssign && (
                <DropdownMenuItem onClick={onAssignDispatch}>
                  <UserRoundCog className="mr-2 h-3.5 w-3.5" />
                  Assign dispatch
                </DropdownMenuItem>
              )}
              {canAssign && (
                <DropdownMenuItem onClick={onAssignVehicle}>
                  <Truck className="mr-2 h-3.5 w-3.5" />
                  Assign vehicle
                </DropdownMenuItem>
              )}
              {customerId && (
                <DropdownMenuItem asChild>
                  <Link to="/app/customers/$customerId" params={{ customerId }}>
                    Open customer
                  </Link>
                </DropdownMenuItem>
              )}
              {!driver.archivedAt && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile assignment strip */}
      <div
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[11px] lg:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <OpsChip badge={primary} dense />
        {risks.slice(0, 2).map((b) => (
          <OpsChip key={b.key} badge={b} dense />
        ))}
        <span className="text-muted-foreground">
          {live?.vehicle?.plateNumber ?? 'No vehicle'}
          {' · '}
          {live?.dispatchNumber ?? 'No dispatch'}
        </span>
      </div>
    </li>
  );
}

function OpsChip({ badge, dense }: { badge: DriverOpsBadge; dense?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold',
        dense ? 'px-1.5 py-0 text-[10px] leading-4' : 'px-2 py-0.5 text-[10px] leading-4',
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

function OpsEntity({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href: { to: '/app/vehicles/$vehicleId'; params: { vehicleId: string } }
    | { to: '/app/dispatches/$dispatchId'; params: { dispatchId: string } }
    | { to: '/app/orders/$orderId'; params: { orderId: string } }
    | null;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {!value || !href ? (
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">—</p>
      ) : (
        <Link
          {...href}
          className="mt-0.5 block truncate font-mono text-xs font-medium text-brand underline-offset-2 hover:underline focus-visible:underline"
        >
          {value}
        </Link>
      )}
    </div>
  );
}

function DriversListSkeleton() {
  return (
    <div className="divide-y divide-border/50" aria-busy="true" aria-label="Loading drivers">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
          <div className="hidden flex-1 gap-3 lg:flex">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

