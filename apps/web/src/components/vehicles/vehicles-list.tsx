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
import { useVehiclesList, type Vehicle, type VehicleStatus } from '@/lib/api/vehicles';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useOrdersList } from '@/lib/api/orders';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { SearchInput } from '@/components/shared/search-input';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { VehiclesCreateSheet } from '@/components/vehicles/vehicles-create-sheet';
import { VehiclesEditSheet } from '@/components/vehicles/vehicles-edit-sheet';
import { VehiclesAssignDispatchSheet } from '@/components/vehicles/vehicles-assign-dispatch-sheet';
import { VehiclesAssignDriverSheet } from '@/components/vehicles/vehicles-assign-driver-sheet';
import {
  LIVE_DISPATCH,
  buildVehicleOpsIndex,
  isDateExpiring,
  isDateExpired,
  isOverCapacity,
  vehicleAvailabilityLabel,
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
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  MoreHorizontal,
  Package,
  Plus,
  Shield,
  SlidersHorizontal,
  Truck,
  UserCircle,
  UserRound,
  Weight,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

type FleetTab = 'available' | 'assigned' | 'maintenance' | 'archived' | 'all';

/// ListVehiclesQueryDto caps `limit` at 100 — asking for more is a 400, not a big page.
const FLEET_FETCH_LIMIT = 100;

const TAB_CONFIG: { key: FleetTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'archived', label: 'Archived' },
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
  const opsIndex = useMemo(
    () => buildVehicleOpsIndex(liveDispatches.data ?? []),
    [liveDispatches.data],
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

  /// liveDispatches is capped at 200 and the cargo lookup at 100 orders — an
  /// org past either ceiling gets some understated availability/capacity
  /// badges below rather than a silent, confidently-wrong number.
  const dataTruncated =
    (liveDispatches.meta?.total ?? 0) > 200 || (ordersQuery.meta?.total ?? 0) > 100;

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
    let docsExpiring = 0;
    let inspectionDue = 0;
    for (const v of items) {
      if (v.archivedAt) continue;
      const live = opsIndex.get(v.id)?.liveDispatch ?? null;
      const cargo = live?.orderId ? cargoByOrderId.get(live.orderId) : null;
      if (v.status === 'AVAILABLE' && !live) available += 1;
      if (live || v.status === 'IN_USE') assigned += 1;
      if (isOverCapacity(v, cargo)) void 0;
      if (isDateExpiring(v.insuranceExpiry) || isDateExpiring(v.inspectionExpiry)) {
        docsExpiring += 1;
      }
      if (isDateExpiring(v.inspectionExpiry)) inspectionDue += 1;
    }
    return {
      available,
      assigned,
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
        year: v.year ?? '',
        status: v.status,
        availability: avail.label,
        driver: live?.driver
          ? `${live.driver.firstName} ${live.driver.lastName}`
          : '',
        dispatch: live?.dispatchNumber ?? '',
        order: live?.order?.orderNumber ?? '',
        capacityKg: v.capacityKg ?? '',
        capacityM3: v.capacityM3 ?? '',
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
        { key: 'year', label: 'Year' },
        { key: 'status', label: 'Status' },
        { key: 'availability', label: 'Availability' },
        { key: 'driver', label: 'Driver' },
        { key: 'dispatch', label: 'Dispatch' },
        { key: 'order', label: 'Order' },
        { key: 'capacityKg', label: 'Capacity (kg)' },
        { key: 'capacityM3', label: 'Capacity (m³)' },
        { key: 'updatedAt', label: 'Updated' },
      ]),
    );
    toast.success('Exported current page');
  };

  const tabCounts: Partial<Record<FleetTab, number>> = {
    available: stripCounts.available,
    assigned: stripCounts.assigned,
    maintenance: stripCounts.maintenance,
  };

  const hasFilters = Boolean(search || (tab !== 'available' && tab !== 'all'));

  const metaLimit = meta?.limit ?? 20;
  const totalCount = meta?.total ?? 0;
  const fromRow = totalCount === 0 ? 0 : (page - 1) * metaLimit + 1;
  const toRow = Math.min(page * metaLimit, totalCount);

  return (
    <div className="space-y-5" data-testid="vehicles-page">
      <PageHeader
        title="Vehicles"
        subtitle="Fleet management and vehicle tracking"
        action={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={displayRows.length === 0}
            >
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
          </>
        }
      />

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <SearchInput
          className="min-w-[16rem] flex-1"
          value={localSearch}
          onChange={setLocalSearch}
          placeholder="Search plate, code, make, model, VIN…"
          label="Search vehicles"
          testId="vehicles-search-input"
        />
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
      </div>

      {dataTruncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          Live dispatches or order cargo data exceed what this page can total — availability and
          dispatch badges may be understated for some vehicles.
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <MetricCard
          label="Total"
          value={loading ? null : (meta?.total ?? 0)}
          icon={Truck}
          iconColor="text-brand"
          bgColor="bg-brand/10"
        />
        <MetricCard
          label="Available"
          value={loading ? null : stripCounts.available}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
        <MetricCard
          label="Assigned"
          value={loading ? null : stripCounts.assigned}
          icon={Activity}
          iconColor="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <MetricCard
          label="Maintenance"
          value={loading ? null : stripCounts.maintenance}
          icon={Wrench}
          iconColor="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <MetricCard
          label="Docs Expiring"
          value={loading ? null : stripCounts.docsExpiring}
          icon={FileText}
          iconColor="text-orange-500"
          bgColor="bg-orange-500/10"
        />
        <MetricCard
          label="Inspection Due"
          value={loading ? null : stripCounts.inspectionDue}
          icon={ClipboardCheck}
          iconColor="text-red-500"
          bgColor="bg-red-500/10"
        />
      </div>

      {/* Tab strip */}
      <div className="border-b border-border/60">
        <div className="flex items-center">
          {TAB_CONFIG.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'text-foreground after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-brand'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {tabCounts[t.key] !== undefined && (
                <span
                  className={cn(
                    'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-[18px]',
                    tab === t.key
                      ? 'bg-brand/15 text-brand'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tabCounts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
        {loading && <VehiclesTableSkeleton />}
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
                <Button variant="outline" onClick={() => setTab('all')}>
                  Show all vehicles
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Vehicle
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Driver
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Dispatch
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Capacity
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Documents
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="flex items-center gap-1">
                      Updated
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                    </span>
                  </th>
                  <th className="w-16 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {displayRows.map((vehicle) => {
                  const live = opsIndex.get(vehicle.id)?.liveDispatch ?? null;
                  const cargo = live?.orderId ? cargoByOrderId.get(live.orderId) : null;
                  return (
                    <VehicleTableRow
                      key={vehicle.id}
                      vehicle={vehicle}
                      live={live}
                      cargo={cargo}
                      selected={selectedId === vehicle.id || highlightId === vehicle.id}
                      onSelect={() => setSelectedId(vehicle.id)}
                      onOpen={() =>
                        navigate({
                          to: '/app/vehicles/$vehicleId',
                          params: { vehicleId: vehicle.id },
                        })
                      }
                      onEdit={() => setEditing(vehicle)}
                      onAssignDispatch={() => setAssignDispatch(vehicle)}
                      onAssignDriver={() => setAssignDriver(vehicle)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer row count */}
        {!loading && !error && displayRows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border/40 bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
            {clientFilterTab ? (
              <span>{displayRows.length} vehicle{displayRows.length !== 1 ? 's' : ''}</span>
            ) : (
              <span>
                Showing {fromRow} to {toRow} of {totalCount} vehicles
              </span>
            )}
            <span>{clientFilterTab ? displayRows.length : metaLimit} per page</span>
          </div>
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

function vehicleModelYearLabel(vehicle: Vehicle): string | null {
  const mm = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
  if (mm && vehicle.year) return `${mm} • ${vehicle.year}`;
  if (mm) return mm;
  if (vehicle.year) return String(vehicle.year);
  return null;
}

function VehicleTableRow({
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
  const risks = vehicleRiskBadges(vehicle, live, cargo);
  const canAssign =
    !vehicle.archivedAt &&
    vehicle.status !== 'MAINTENANCE' &&
    vehicle.status !== 'INACTIVE';
  const modelYear = vehicleModelYearLabel(vehicle);
  const driverId = live?.driver?.id ?? live?.driverId;
  const orderId = live?.orderId;

  return (
    <tr
      className={cn(
        'group cursor-pointer transition-colors hover:bg-muted/20',
        selected && 'bg-brand/5 ring-1 ring-inset ring-brand/20',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      {/* Vehicle */}
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex items-center gap-3 text-left"
        >
          <div className="relative h-[56px] w-[90px] shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
            <img
              src="/isuzi.png"
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: '6px',
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="whitespace-nowrap font-mono text-sm font-semibold text-foreground">
                {vehicle.plateNumber}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {vehicle.vehicleCode}
              </span>
            </div>
            {modelYear && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">{modelYear}</div>
            )}
            <div className="mt-0.5 text-[11px] text-muted-foreground">{vehicle.type}</div>
            {vehicle.vin && (
              <div className="mt-0.5 flex items-center gap-1">
                <Barcode className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  VIN: {vehicle.vin}
                </span>
              </div>
            )}
          </div>
        </button>
      </td>

      {/* Status — primary + all risk badges */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <OpsChip badge={primary} />
          {risks.map((b) => (
            <OpsChip key={b.key} badge={b} />
          ))}
        </div>
      </td>

      {/* Driver */}
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        {live?.driver && driverId ? (
          <div className="flex items-center gap-1.5">
            <UserCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <Link
              to="/app/drivers/$driverId"
              params={{ driverId }}
              className="text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              {live.driver.firstName} {live.driver.lastName}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <UserCircle className="h-3.5 w-3.5 shrink-0 text-foreground" />
              <span className="text-xs text-foreground">–</span>
            </div>
            <span className="pl-5 text-[11px] text-muted-foreground/50">Unassigned</span>
          </div>
        )}
      </td>

      {/* Dispatch */}
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        {live?.dispatchNumber ? (
          <Link
            to="/app/dispatches/$dispatchId"
            params={{ dispatchId: live.id }}
            className="font-mono text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            {live.dispatchNumber}
          </Link>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-foreground">–</span>
            <span className="text-[11px] text-muted-foreground/50">No active dispatch</span>
          </div>
        )}
      </td>

      {/* Order */}
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        {live?.order?.orderNumber && orderId ? (
          <Link
            to="/app/orders/$orderId"
            params={{ orderId }}
            className="font-mono text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            {live.order.orderNumber}
          </Link>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-foreground">–</span>
            <span className="text-[11px] text-muted-foreground/50">No active order</span>
          </div>
        )}
      </td>

      {/* Capacity — icon per row */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          {vehicle.capacityKg ? (
            <div className="flex items-center gap-1.5">
              <Weight className="h-3.5 w-3.5 shrink-0 text-foreground" />
              <span className="whitespace-nowrap text-xs text-foreground">
                {vehicle.capacityKg} kg
              </span>
            </div>
          ) : null}
          {vehicle.capacityM3 ? (
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 shrink-0 text-foreground" />
              <span className="whitespace-nowrap text-xs text-foreground">
                {vehicle.capacityM3} m³
              </span>
            </div>
          ) : null}
          {!vehicle.capacityKg && !vehicle.capacityM3 && (
            <span className="font-mono text-xs text-muted-foreground/40">—</span>
          )}
        </div>
      </td>

      {/* Documents — shield for insurance, clipboard for inspection */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <DocDateWithIcon icon={Shield} date={vehicle.insuranceExpiry} />
          <DocDateWithIcon icon={ClipboardCheck} date={vehicle.inspectionExpiry} />
        </div>
      </td>

      {/* Updated */}
      <td className="px-4 py-4">
        <span className="text-xs text-muted-foreground" title={vehicle.updatedAt}>
          {formatRelativeTime(vehicle.updatedAt)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onOpen}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="sr-only">Open</span>
          </Button>
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
      </td>
    </tr>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  iconColor,
  bgColor,
}: {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', bgColor)}>
          <Icon className={cn('h-3.5 w-3.5', iconColor)} />
        </span>
      </div>
      {value === null ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      )}
    </div>
  );
}

function OpsChip({ badge }: { badge: VehicleOpsBadge }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4',
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

function DocDateWithIcon({
  icon: Icon,
  date,
}: {
  icon: React.ComponentType<{ className?: string }>;
  date: string | null | undefined;
}) {
  if (!date) {
    return (
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/30" />
        <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
      </div>
    );
  }
  const expired = isDateExpired(date);
  const expiring = !expired && isDateExpiring(date);
  const formatted = new Date(date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <div className="flex items-center gap-1.5">
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          expired
            ? 'text-destructive'
            : expiring
              ? 'text-amber-500'
              : 'text-muted-foreground/50',
        )}
      />
      <span
        className={cn(
          'text-[11px] font-medium',
          expired
            ? 'text-destructive'
            : expiring
              ? 'text-amber-500'
              : 'text-muted-foreground',
        )}
      >
        {formatted}
      </span>
    </div>
  );
}

function VehiclesTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px]">
        <thead>
          <tr className="border-b border-border/60 bg-muted/20">
            <th className="w-10 px-3 py-3">
              <Skeleton className="h-4 w-4 rounded" />
            </th>
            {['Vehicle', 'Status', 'Driver', 'Dispatch', 'Order', 'Capacity', 'Documents', 'Updated', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40" aria-busy="true" aria-label="Loading vehicles">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="w-10 px-3 py-4">
                <Skeleton className="h-4 w-4 rounded" />
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-[56px] w-[90px] shrink-0 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </td>
              <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
              <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
              <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
              <td className="px-4 py-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </td>
              <td className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
              <td className="px-4 py-4"><Skeleton className="h-7 w-7" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
