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
import { useVehiclesList, type Vehicle, type VehicleStatus } from '@/lib/api/vehicles';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useOrdersList } from '@/lib/api/orders';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { VehiclesCreateSheet } from '@/components/vehicles/vehicles-create-sheet';
import { VehiclesEditSheet } from '@/components/vehicles/vehicles-edit-sheet';
import { VehiclesAssignDispatchSheet } from '@/components/vehicles/vehicles-assign-dispatch-sheet';
import { VehiclesAssignDriverSheet } from '@/components/vehicles/vehicles-assign-driver-sheet';
import {
  LIVE_DISPATCH,
  buildVehicleOpsIndex,
  formatCapacity,
  isDateExpiring,
  isOverCapacity,
  makeModelLabel,
  vehicleAvailabilityLabel,
  vehicleInitials,
  vehiclePrimaryBadge,
  vehicleRiskBadges,
  type OrderCargo,
  type VehicleOpsBadge,
} from '@/components/vehicles/vehicles-ops';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatRelativeTime } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import {
  Download,
  Edit2,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
  Truck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

type FleetTab = 'available' | 'assigned' | 'maintenance' | 'archived' | 'all';

/// ListVehiclesQueryDto caps `limit` at 100 — asking for more is a 400, not a big page.
const FLEET_FETCH_LIMIT = 100;

const TAB_CONFIG: { key: FleetTab; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

function tabToQuery(tab: FleetTab): {
  status?: VehicleStatus;
  includeArchived?: boolean;
} {
  switch (tab) {
    case 'available':
      return { status: 'AVAILABLE', includeArchived: false };
    case 'assigned':
      // Status alone misses AVAILABLE units that still have a live dispatch.
      return { includeArchived: false };
    case 'maintenance':
      return { status: 'MAINTENANCE', includeArchived: false };
    case 'archived':
      return { includeArchived: true };
    case 'all':
    default:
      return { includeArchived: false };
  }
}

export function VehiclesList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/vehicles/' });

  const tab = (TAB_CONFIG.some((t) => t.key === searchState.tab)
    ? searchState.tab
    : 'available') as FleetTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const createOpen = Boolean(searchState.create);
  const highlightId = typeof searchState.highlight === 'string' ? searchState.highlight : null;
  const tabQuery = tabToQuery(tab);

  const clientFilterTab = tab === 'archived' || tab === 'assigned' || tab === 'available';

  const { items, meta, loading, error, refetch } = useVehiclesList({
    page: clientFilterTab ? 1 : page,
    limit: clientFilterTab ? FLEET_FETCH_LIMIT : 20,
    search: search || undefined,
    status: tabQuery.status,
    includeArchived: tabQuery.includeArchived,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const liveDispatches = useDispatches(1, 200, { statuses: LIVE_DISPATCH });
  const allDispatchesForCounts = useDispatches(1, 200);
  const opsIndex = useMemo(
    () => buildVehicleOpsIndex([...(liveDispatches.data ?? []), ...(allDispatchesForCounts.data ?? [])]),
    [liveDispatches.data, allDispatchesForCounts.data],
  );

  const orderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of liveDispatches.data ?? []) {
      if (d.orderId) ids.add(d.orderId);
    }
    return [...ids];
  }, [liveDispatches.data]);

  const ordersQuery = useOrdersList(
    { limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: orderIds.length > 0 },
  );
  const cargoByOrderId = useMemo(() => {
    const map = new Map<string, OrderCargo>();
    for (const o of ordersQuery.data) {
      map.set(o.id, {
        cargoWeightKg: o.cargoWeightKg,
        cargoVolumeM3: o.cargoVolumeM3,
      });
    }
    return map;
  }, [ordersQuery.data]);

  const availableMeta = useVehiclesList({ status: 'AVAILABLE', limit: 1 });
  const inUseMeta = useVehiclesList({ status: 'IN_USE', limit: 1 });
  const maintenanceMeta = useVehiclesList({ status: 'MAINTENANCE', limit: 1 });

  const [localSearch, setLocalSearch] = useState(search);
  const [selectedId, setSelectedId] = useState<string | null>(highlightId);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [assignDispatch, setAssignDispatch] = useState<Vehicle | null>(null);
  const [assignDriver, setAssignDriver] = useState<Vehicle | null>(null);

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
      to: '/app/vehicles',
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
      return items.filter((v) => Boolean(v.archivedAt));
    }
    if (tab === 'available') {
      return items.filter(
        (v) =>
          !v.archivedAt &&
          v.status === 'AVAILABLE' &&
          !opsIndex.get(v.id)?.liveDispatch,
      );
    }
    if (tab === 'assigned') {
      return items.filter(
        (v) =>
          !v.archivedAt &&
          (v.status === 'IN_USE' || Boolean(opsIndex.get(v.id)?.liveDispatch)),
      );
    }
    return items;
  }, [items, tab, opsIndex]);

  const stripCounts = useMemo(() => {
    let available = 0;
    let assigned = 0;
    let overCapacity = 0;
    let docsExpiring = 0;
    let inspectionDue = 0;
    for (const v of items) {
      if (v.archivedAt) continue;
      const live = opsIndex.get(v.id)?.liveDispatch ?? null;
      const cargo = live?.orderId ? cargoByOrderId.get(live.orderId) : null;
      if (v.status === 'AVAILABLE' && !live) available += 1;
      if (live || v.status === 'IN_USE') assigned += 1;
      if (isOverCapacity(v, cargo)) overCapacity += 1;
      if (isDateExpiring(v.insuranceExpiry) || isDateExpiring(v.inspectionExpiry)) {
        docsExpiring += 1;
      }
      if (isDateExpiring(v.inspectionExpiry)) inspectionDue += 1;
    }
    return {
      available,
      assigned,
      overCapacity,
      docsExpiring,
      inspectionDue,
      maintenance: maintenanceMeta.meta?.total ?? 0,
    };
  }, [items, opsIndex, cargoByOrderId, maintenanceMeta.meta?.total]);

  const setCreateOpen = (open: boolean) => {
    navigate({
      to: '/app/vehicles',
      search: (prev) => ({ ...prev, create: open ? true : undefined }),
    });
  };

  const setTab = (next: FleetTab) => {
    navigate({
      to: '/app/vehicles',
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
    const rows = displayRows.map((v) => {
      const live = opsIndex.get(v.id)?.liveDispatch ?? null;
      const avail = vehicleAvailabilityLabel(v, live);
      return {
        plate: v.plateNumber,
        code: v.vehicleCode,
        type: v.type,
        make: v.make ?? '',
        model: v.model ?? '',
        status: v.status,
        availability: avail.label,
        driver: live?.driver
          ? `${live.driver.firstName} ${live.driver.lastName}`
          : '',
        dispatch: live?.dispatchNumber ?? '',
        order: live?.order?.orderNumber ?? '',
        capacity: formatCapacity(v.capacityKg, v.capacityM3),
        updatedAt: v.updatedAt,
      };
    });
    downloadCsv(
      `vehicles-page-${page}.csv`,
      toCsv(rows, [
        { key: 'plate', label: 'Plate' },
        { key: 'code', label: 'Code' },
        { key: 'type', label: 'Type' },
        { key: 'make', label: 'Make' },
        { key: 'model', label: 'Model' },
        { key: 'status', label: 'Status' },
        { key: 'availability', label: 'Availability' },
        { key: 'driver', label: 'Driver' },
        { key: 'dispatch', label: 'Dispatch' },
        { key: 'order', label: 'Order' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'updatedAt', label: 'Updated' },
      ]),
    );
    toast.success('Exported current page');
  };

  const summaryChips = [
    { key: 'available', label: 'Available', value: stripCounts.available },
    { key: 'assigned', label: 'Assigned', value: stripCounts.assigned },
    { key: 'overcap', label: 'Over capacity', value: stripCounts.overCapacity },
    { key: 'docs', label: 'Documents expiring', value: stripCounts.docsExpiring },
    { key: 'insp', label: 'Inspection due', value: stripCounts.inspectionDue },
    { key: 'maint', label: 'Maintenance', value: stripCounts.maintenance },
  ].filter((c) => c.value > 0);

  const hasFilters = Boolean(search || tab !== 'available');
  const availableCount = availableMeta.meta?.total ?? 0;
  const assignedCount = inUseMeta.meta?.total ?? 0;

  return (
    <div className="space-y-4" data-testid="vehicles-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Vehicles</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : error
                ? 'Could not load vehicles'
                : `${meta?.total ?? 0} in fleet · ${availableCount} available · ${assignedCount} assigned`}
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
            data-testid="create-vehicle-button"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Vehicle
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search plate, code, make, model…"
            data-testid="vehicles-search-input"
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
          variant={tab === 'assigned' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('assigned')}
        >
          Assigned
        </Button>
        <Button
          size="sm"
          variant={tab === 'maintenance' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('maintenance')}
        >
          Maintenance
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
        {loading && <VehiclesListSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={() => void refetch()} />}

        {!loading && !error && displayRows.length === 0 && (
          <EmptyState
            title={hasFilters ? 'No vehicles match' : 'No vehicles yet'}
            description={
              hasFilters
                ? 'Try another tab or clear search.'
                : 'Add a vehicle before assigning dispatches.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => setTab('available')}>
                  Show available
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  New Vehicle
                </Button>
              )
            }
          />
        )}

        {!loading && !error && displayRows.length > 0 && (
          <ul className="divide-y divide-border/50" role="listbox" aria-label="Vehicles">
            {displayRows.map((vehicle) => {
              const live = opsIndex.get(vehicle.id)?.liveDispatch ?? null;
              const cargo = live?.orderId ? cargoByOrderId.get(live.orderId) : null;
              return (
                <VehicleOpsRow
                  key={vehicle.id}
                  vehicle={vehicle}
                  live={live}
                  cargo={cargo}
                  selected={selectedId === vehicle.id || highlightId === vehicle.id}
                  onSelect={() => setSelectedId(vehicle.id)}
                  onOpen={() =>
                    navigate({ to: '/app/vehicles/$vehicleId', params: { vehicleId: vehicle.id } })
                  }
                  onEdit={() => setEditing(vehicle)}
                  onAssignDispatch={() => setAssignDispatch(vehicle)}
                  onAssignDriver={() => setAssignDriver(vehicle)}
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
              to: '/app/vehicles',
              search: (prev) => ({ ...prev, page: newPage }),
            })
          }
        />
      )}

      <VehiclesCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(v) =>
          navigate({
            to: '/app/vehicles',
            search: { tab: 'available', highlight: v.id, page: 1 },
          })
        }
      />

      {editing && (
        <VehiclesEditSheet
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          vehicle={editing}
        />
      )}

      {assignDispatch && (
        <VehiclesAssignDispatchSheet
          open={Boolean(assignDispatch)}
          onOpenChange={(open) => !open && setAssignDispatch(null)}
          vehicle={assignDispatch}
        />
      )}

      {assignDriver && (
        <VehiclesAssignDriverSheet
          open={Boolean(assignDriver)}
          onOpenChange={(open) => !open && setAssignDriver(null)}
          vehicle={assignDriver}
          liveDispatch={opsIndex.get(assignDriver.id)?.liveDispatch ?? null}
        />
      )}
    </div>
  );
}

function VehicleOpsRow({
  vehicle,
  live,
  cargo,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onAssignDispatch,
  onAssignDriver,
}: {
  vehicle: Vehicle;
  live: ApiDispatch | null;
  cargo: OrderCargo | null | undefined;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onAssignDispatch: () => void;
  onAssignDriver: () => void;
}) {
  const primary = vehiclePrimaryBadge(vehicle, live);
  const risks = vehicleRiskBadges(vehicle, live, cargo).filter((b) => b.key !== primary.key);
  const canAssign =
    !vehicle.archivedAt &&
    vehicle.status !== 'MAINTENANCE' &&
    vehicle.status !== 'INACTIVE';
  const mm = makeModelLabel(vehicle);
  const driverId = live?.driver?.id ?? live?.driverId;
  const orderId = live?.orderId;
  const route =
    live?.order?.pickupCity && live?.order?.deliveryCity
      ? `${live.order.pickupCity} → ${live.order.deliveryCity}`
      : null;

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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex min-w-0 flex-[1.2] items-center gap-2.5 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[11px] font-bold text-brand">
            {vehicleInitials(vehicle.plateNumber)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-mono text-sm font-semibold leading-tight text-foreground">
                {vehicle.plateNumber}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {vehicle.vehicleCode}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0 text-[11px] leading-tight text-muted-foreground">
              <span>{vehicle.type}</span>
              {mm && <span className="truncate">{mm}</span>}
              {route && <span className="truncate text-foreground/80">{route}</span>}
            </div>
          </div>
        </button>

        <div className="hidden min-w-0 flex-1 flex-col justify-center gap-1 sm:flex">
          <div className="flex flex-wrap items-center gap-1">
            <OpsChip badge={primary} />
          </div>
          {risks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {risks.slice(0, 3).map((b) => (
                <OpsChip key={b.key} badge={b} dense />
              ))}
            </div>
          )}
        </div>

        <div
          className="hidden min-w-0 flex-[1.25] items-center gap-3 lg:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <OpsEntity
            label="Driver"
            value={
              live?.driver
                ? `${live.driver.firstName} ${live.driver.lastName}`
                : null
            }
            href={
              driverId
                ? { to: '/app/drivers/$driverId' as const, params: { driverId } }
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
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Capacity
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-foreground">
              {formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
            </p>
          </div>
          <div className="w-[4.5rem] shrink-0 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Updated
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={vehicle.updatedAt}>
              {formatRelativeTime(vehicle.updatedAt)}
            </p>
          </div>
        </div>

        <div
          className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="sr-only">Open</span>
          </Button>
          {canAssign && (
            <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={onAssignDispatch}>
              <Truck className="h-3.5 w-3.5" />
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
              {canAssign && (
                <DropdownMenuItem onClick={onAssignDispatch}>
                  <Truck className="mr-2 h-3.5 w-3.5" />
                  Assign dispatch
                </DropdownMenuItem>
              )}
              {canAssign && (
                <DropdownMenuItem onClick={onAssignDriver}>
                  <UserRound className="mr-2 h-3.5 w-3.5" />
                  Assign driver
                </DropdownMenuItem>
              )}
              {!vehicle.archivedAt && (
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

      <div
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[11px] lg:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <OpsChip badge={primary} dense />
        {risks.slice(0, 2).map((b) => (
          <OpsChip key={b.key} badge={b} dense />
        ))}
        <span className="text-muted-foreground">
          {live?.driver
            ? `${live.driver.firstName} ${live.driver.lastName}`
            : 'No driver'}
          {' · '}
          {live?.dispatchNumber ?? 'No dispatch'}
        </span>
      </div>
    </li>
  );
}

function OpsChip({ badge, dense }: { badge: VehicleOpsBadge; dense?: boolean }) {
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
  href:
    | { to: '/app/drivers/$driverId'; params: { driverId: string } }
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
          className="mt-0.5 block truncate text-xs font-medium text-brand underline-offset-2 hover:underline focus-visible:underline"
        >
          {value}
        </Link>
      )}
    </div>
  );
}

function VehiclesListSkeleton() {
  return (
    <div className="divide-y divide-border/50" aria-busy="true" aria-label="Loading vehicles">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
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
