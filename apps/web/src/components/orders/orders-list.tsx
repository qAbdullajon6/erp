'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ordersAPI,
  useOrdersList,
  useArchiveOrder,
  useRestoreOrder,
  type OrderStatus,
  type Order,
} from '@/lib/api/orders';
import { useCustomersList } from '@/lib/api/customers';
import { useDashboardSummary, type DashboardSummary } from '@/lib/api/dashboard';
import { useCurrentUser } from '@/lib/api/auth';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/shared/list-states';
import { PageHeader } from '@/components/shared/page-header';
import { OrdersCreateSheet } from '@/components/orders/orders-create-sheet';
import { OrdersEditSheet } from '@/components/orders/orders-edit-sheet';
import {
  OrdersFiltersPanel,
  countActiveFilters,
  loadSavedFilters,
  loadVisibleColumns,
  persistSavedFilters,
  saveVisibleColumns,
  type OrdersFilterValues,
  type OrdersListColumn,
  type SavedOrdersFilter,
} from '@/components/orders/orders-filters-panel';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { SortHeader } from '@/components/shared/sort-header';
import { FilterTabs } from '@/components/shared/filter-tabs';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ORDER_OPERATIONAL_ROLES, ORDER_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import type { OrdersSearch } from '@/routes/app.orders.index';
import { formatMoney, formatDate, formatStopTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toCsv, downloadCsv } from '@/lib/csv';
import { toExcelXml, downloadExcel } from '@/lib/excel';
import {
  Plus,
  Package,
  Search,
  Download,
  Upload,
  Filter,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Truck,
  Timer,
  Columns3,
  Bookmark,
  MoreHorizontal,
  Copy,
  ExternalLink,
  Eye,
  Archive,
  ArchiveRestore,
  Loader2,
  CircleCheck,
  DollarSign,
  MapPin,
  CalendarDays,
  Clock,
  Info,
  Edit2,
  Scale,
  Ruler,
  Box,
} from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

type OrderSortField = 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt';

type WorkflowTab = 'action' | 'active' | 'completed' | 'all';

type ListSearchState = OrdersSearch & {
  tab?: WorkflowTab;
  sortBy?: OrderSortField;
};

function filtersFromSearch(search: ListSearchState): OrdersFilterValues {
  return {
    status: search.status,
    customerId: search.customerId,
    driverId: search.driverId,
    vehicleId: search.vehicleId,
    dispatcherId: search.dispatcherId,
    pickupDateFrom: search.pickupDateFrom,
    pickupDateTo: search.pickupDateTo,
    deliveryDateFrom: search.deliveryDateFrom,
    deliveryDateTo: search.deliveryDateTo,
    createdFrom: search.createdFrom,
    createdTo: search.createdTo,
    priceMin: search.priceMin,
    priceMax: search.priceMax,
    paymentStatus: search.paymentStatus,
    archivedOnly: search.archivedOnly,
  };
}

function searchFromFilters(
  prev: ListSearchState,
  filters: OrdersFilterValues,
): ListSearchState {
  return {
    ...prev,
    page: 1,
    status: filters.status,
    customerId: filters.customerId,
    driverId: filters.driverId,
    vehicleId: filters.vehicleId,
    dispatcherId: filters.dispatcherId,
    pickupDateFrom: filters.pickupDateFrom,
    pickupDateTo: filters.pickupDateTo,
    deliveryDateFrom: filters.deliveryDateFrom,
    deliveryDateTo: filters.deliveryDateTo,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    paymentStatus: filters.paymentStatus,
    archivedOnly: filters.archivedOnly || undefined,
  };
}

const TAB_CONFIG: { key: WorkflowTab; label: string; statuses: OrderStatus[] | null }[] = [
  { key: 'action', label: 'Needs Action', statuses: ['DRAFT', 'PENDING'] },
  { key: 'active', label: 'Active Shipments', statuses: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
  { key: 'completed', label: 'Completed', statuses: ['DELIVERED', 'CANCELLED'] },
  { key: 'all', label: 'All Orders', statuses: null },
];

/// Multi-status tabs use `statuses` (comma-separated IN filter) so pagination
/// stays server-side. Single-status / All tabs use the scalar `status` filter
/// or none.
function getTimeUrgency(iso: string): { label: string; tone: string; urgent: boolean } {
  const target = new Date(iso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours < 0) {
    const hoursLate = Math.abs(diffHours);
    if (hoursLate < 24) {
      return { label: `${Math.max(1, Math.ceil(hoursLate))}h overdue`, tone: 'text-destructive', urgent: true };
    }
    return { label: `${Math.ceil(hoursLate / 24)}d overdue`, tone: 'text-destructive', urgent: true };
  }
  if (diffHours < 24) return { label: formatDate(iso), tone: 'text-warning', urgent: true };
  if (diffDays <= 3) return { label: formatDate(iso), tone: 'text-warning', urgent: false };
  return { label: formatDate(iso), tone: 'text-muted-foreground', urgent: false };
}

function RouteIndicator({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="font-medium text-foreground">{from}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">{to}</span>
    </div>
  );
}

function UrgencyBadge({ date, label: contextLabel }: { date: string; label: string }) {
  const urgency = getTimeUrgency(date);
  const Icon = contextLabel === 'Pickup' ? MapPin : Truck;
  return (
    <div className={`flex items-center gap-1.5 text-xs ${urgency.tone}`}>
      {urgency.urgent ? (
        <AlertTriangle className="h-3 w-3 shrink-0" />
      ) : (
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
      <span>{contextLabel}: {urgency.label}</span>
    </div>
  );
}

function CargoStat({
  icon: Icon,
  label,
  value,
  empty,
  clamp,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  empty?: boolean;
  clamp?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 text-sm font-semibold', clamp ? 'line-clamp-1' : 'truncate', empty ? 'text-muted-foreground' : 'text-foreground')}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ExpandedOrderRow({
  order,
  customerName,
  customerContactName,
  canOperate,
  canWrite,
  colSpan,
  onEdit,
}: {
  order: Order;
  customerName: string;
  customerContactName: string | null;
  canOperate: boolean;
  canWrite: boolean;
  colSpan: number;
  onEdit: (order: Order) => void;
}) {
  const navigate = useNavigate();
  const needsAssign = canOperate && order.status === 'PENDING' && !order.driverId;
  const needsActivate = canOperate && order.status === 'DRAFT';
  const canEdit = canWrite && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && !order.archivedAt;

  const pickupTime = order.pickupWindowStart ? formatStopTime(order.pickupWindowStart) : null;
  const deliveryTime = order.deliveryWindowStart ? formatStopTime(order.deliveryWindowStart) : null;

  return (
    <tr className="bg-muted/[0.12]">
      <td colSpan={colSpan} className="p-0">
        <div className="grid grid-cols-1 gap-3 p-4">

          {/* Cargo stats */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <CargoStat
              icon={Package}
              label="Cargo"
              value={order.cargoDescription || 'Not set'}
              empty={!order.cargoDescription}
              clamp
            />
            <CargoStat
              icon={Scale}
              label="Weight"
              value={order.cargoWeightKg ? `${order.cargoWeightKg} kg` : 'Not set'}
              empty={!order.cargoWeightKg}
            />
            <CargoStat
              icon={Ruler}
              label="Volume"
              value={order.cargoVolumeM3 ? `${order.cargoVolumeM3} m³` : 'Not set'}
              empty={!order.cargoVolumeM3}
            />
            <CargoStat
              icon={Truck}
              label="Vehicle type"
              value={
                order.plannedVehicle
                  ? order.plannedVehicle.type.toLowerCase().replace(/_/g, ' ')
                  : 'Unassigned'
              }
              empty={!order.plannedVehicle}
            />
            <CargoStat
              icon={Box}
              label="Value"
              value={formatMoney(order.price, order.currency)}
            />
          </div>

          {/* Bottom row: route + customer + actions */}
          <div className="flex flex-col gap-3 sm:flex-row">

          {/* Pickup & Delivery */}
          <div className="space-y-6 px-5 py-3 border border-border/70 rounded-xl flex-1">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Pickup</p>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{order.pickupAddress}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground pt-1 pl-5">
                <CalendarDays className="h-3 w-3 text-foreground" />
                <span>{order.pickupCity}</span>
                <span>·</span>
                <CalendarDays className="h-3 w-3 text-foreground" />
                <span>{formatDate(order.pickupDate)}</span>
                {pickupTime && (
                  <>
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    <span>{pickupTime}</span>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Delivery</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{order.deliveryAddress}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground pt-1 pl-5">
                <CalendarDays className="h-3 w-3 text-foreground" />
                <span>{order.deliveryCity}</span>
                <span>·</span>
                <CalendarDays className="h-3 w-3 text-foreground" />
                <span>{formatDate(order.deliveryDate)}</span>
                {deliveryTime && (
                  <>
                    <span>·</span>
                    <Clock className="h-3 w-3 text-foreground" />
                    <span>{deliveryTime}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="px-5 py-3 border border-border/70 rounded-xl flex-1">
            <div className="mb-2 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
            </div>
            <p className="text-sm font-semibold text-foreground">{customerName}</p>
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Contact</p>
                <p className="text-sm font-semibold text-foreground">
                  {(() => {
                    const name = order.pickupContactName ?? customerContactName;
                    const phone = order.pickupContactPhone ?? order.customer?.phone;
                    const parts = [name, phone].filter(Boolean);
                    return parts.length > 0 ? parts.join(' · ') : '—';
                  })()}
                </p>
              </div>
              {order.notes && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Notes</p>
                  <p className="text-sm text-foreground line-clamp-2">{order.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Value & Actions */}
          <div className="flex min-w-[220px] flex-1 border border-border/70 rounded-xl flex-col justify-between px-5 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Value</p>
              <p className="mt-0.5 font-mono text-xl font-bold text-foreground">{formatMoney(order.price, order.currency)}</p>
              {(order.freightCharge || order.fuelSurcharge || order.otherCharges) && (
                <div className="mt-3 space-y-1.5 pt-2">
                  
                  {order.freightCharge && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Freight</span>
                      <span className="font-mono text-foreground">{formatMoney(order.freightCharge, order.currency)}</span>
                    </div>
                  )}
                  {order.fuelSurcharge && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Fuel Surcharge</span>
                      <span className="font-mono text-foreground">{formatMoney(order.fuelSurcharge, order.currency)}</span>
                    </div>
                  )}
                  {order.otherCharges && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Other</span>
                      <span className="font-mono text-foreground">{formatMoney(order.otherCharges, order.currency)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-end gap-1.5">
              {needsAssign && (
                <Button size="sm" onClick={() => navigate({ to: `/app/orders/${order.id}` })}>
                  <Truck className="mr-1.5 h-3 w-3" />Assign
                </Button>
              )}
              {needsActivate && (
                <Button size="sm" onClick={() => navigate({ to: `/app/orders/${order.id}` })}>
                  Confirm Order
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(order)}>
                  <Edit2 className="mr-1.5 h-3 w-3" />Edit
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate({ to: `/app/orders/${order.id}` })}>
                Full Details
              </Button>
            </div>
          </div>

          </div>{/* end bottom row */}

        </div>
      </td>
    </tr>
  );
}

function OrdersKpiStrip({ summary }: { summary: DashboardSummary | null }) {
  const needsAction = summary?.ordersByStatus
    .filter((r) => ['DRAFT', 'PENDING'].includes(r.status))
    .reduce((sum, r) => sum + r.count, 0) ?? 0;
  const active = summary?.totals.activeOrders ?? 0;
  const completed = summary?.totals.deliveredOrders ?? 0;
  const total = summary?.totals.totalOrders ?? 0;
  const revenue = parseFloat(summary?.totals.totalRevenue ?? '0');
  const currency = summary?.currency ?? 'USD';

  const series = summary?.ordersTimeSeries ?? [];
  const thisMonth = series[series.length - 1]?.orders ?? 0;
  const lastMonth = series[series.length - 2]?.orders ?? 0;
  const momPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  const momLabel = momPct === null
    ? undefined
    : momPct > 0
      ? `+${momPct}% vs last month`
      : momPct < 0
        ? `${momPct}% vs last month`
        : 'Same as last month';

  const items = [
    { label: 'Total Orders',     value: String(total),                  sub: momLabel,             icon: Package,      color: 'bg-brand/10 text-brand',                subTone: momPct !== null && momPct > 0 ? 'text-emerald-500' : momPct !== null && momPct < 0 ? 'text-destructive' : undefined },
    { label: 'Needs Action',     value: String(needsAction),            sub: 'Requires attention', icon: AlertTriangle, color: 'bg-destructive/10 text-destructive',   subTone: undefined },
    { label: 'Active Shipments', value: String(active),                 sub: 'In transit',         icon: Truck,        color: 'bg-blue-500/10 text-blue-500',          subTone: undefined },
    { label: 'Completed',        value: String(completed),              sub: 'This month',         icon: CircleCheck,  color: 'bg-emerald-500/10 text-emerald-500',    subTone: undefined },
    { label: 'Total Value',      value: formatMoney(revenue, currency), sub: 'This month',         icon: DollarSign,   color: 'bg-amber-500/10 text-amber-500',        subTone: undefined },
  ];

  return (
    <div className="grid grid-cols-2 overflow-hidden gap-4 sm:grid-cols-5">
      {items.map(({ label, value, sub, subTone, icon: Icon, color }) => (
        <div key={label} className="flex items-center gap-3 bg-surface px-4 py-3 rounded-xl border border-border/70 bg-border/40">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', color)}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums leading-none text-foreground">{value}</p>
            {sub && <p className={cn('mt-0.5 text-[11px]', subTone ?? 'text-muted-foreground')}>{sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrdersList() {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchState = useSearch({ from: '/app/orders/' }) as ListSearchState;
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canWriteOrder = Boolean(role && ORDER_WRITE_ROLES.includes(role));
  const canOperateOrder = Boolean(role && ORDER_OPERATIONAL_ROLES.includes(role));

  const currentTab = searchState.tab || 'action';
  const page = searchState.page || 1;
  const limit = searchState.limit || 25;
  const search = searchState.search || '';
  const sortBy = searchState.sortBy || 'createdAt';
  const sortOrder = searchState.sortOrder || 'desc';
  const filters = filtersFromSearch(searchState);

  const activeTabConfig = TAB_CONFIG.find((t) => t.key === currentTab)!;
  const tabStatuses = filters.archivedOnly ? null : activeTabConfig.statuses;

  // Shared between the live list query and the "export all matching filters"
  // fetcher below, so the two can never silently drift apart on which filters
  // they apply.
  const listQuery = {
    page,
    limit,
    search: search || undefined,
    status:
      filters.status ??
      (tabStatuses?.length === 1 ? tabStatuses[0] : undefined),
    statuses:
      !filters.status && tabStatuses && tabStatuses.length > 1 ? tabStatuses : undefined,
    customerId: filters.customerId,
    driverId: filters.driverId,
    vehicleId: filters.vehicleId,
    dispatcherId: filters.dispatcherId,
    pickupDateFrom: filters.pickupDateFrom,
    pickupDateTo: filters.pickupDateTo,
    deliveryDateFrom: filters.deliveryDateFrom,
    deliveryDateTo: filters.deliveryDateTo,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    paymentStatus: filters.paymentStatus,
    archivedOnly: filters.archivedOnly,
    sortBy,
    sortOrder,
  };

  const { data, meta, loading, error, refetch } = useOrdersList(listQuery);

  const { archive } = useArchiveOrder();
  const { restore } = useRestoreOrder();

  const { data: dashboardSummary } = useDashboardSummary();

  const [localSearch, setLocalSearch] = useState(search);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeFilterCount = countActiveFilters(filters);
  const [visibleColumns, setVisibleColumns] = useState<OrdersListColumn[]>(loadVisibleColumns);
  const [savedFilters, setSavedFilters] = useState<SavedOrdersFilter[]>(loadSavedFilters);
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  // Deep-link support: /app/orders?create=true opens the sheet (the old
  // /app/orders/create route redirects here).
  const [createOpen, setCreateOpen] = useState(Boolean(searchState.create));
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  // Held rather than confirmed inline: the row menu unmounts the moment it is
  // clicked, taking an embedded dialog trigger with it.
  const [archiveTarget, setArchiveTarget] = useState<Order | null>(null);

  // Below `sm` the row collapses to route + status, with everything else one
  // tap away in the expanded panel. Switched here rather than with `hidden`
  // classes so the phone and desktop values never coexist in the document.
  const isNarrow = useMediaQuery('(max-width: 639px)');

  useEffect(() => {
    if (searchState.create) setCreateOpen(true);
  }, [searchState.create]);

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open && searchState.create) {
      navigate({
        to: '/app/orders',
        search: (prev) => ({ ...prev, create: undefined }),
        replace: true,
      });
    }
  };

  const handleCreated = (order: Order) => {
    // New orders are DRAFT — they live in the "Needs Action" tab. Jump there
    // (page 1, default sort) so the new row is on screen, then flash it.
    setHighlightId(order.id);
    navigate({ to: '/app/orders', search: { tab: 'action', page: 1 } });
    setTimeout(() => setHighlightId(null), 5000);
  };

  const { data: customers } = useCustomersList({ limit: 200, includeArchived: true });
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.companyName])),
    [customers],
  );
  const customerContactById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.contactName ?? null])),
    [customers],
  );

  const search_ = { page, limit, search, tab: currentTab, sortBy, sortOrder, ...filters };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    navigate({
      to: '/app/orders',
      search: (prev) => ({ ...prev, page: 1, search: debouncedSearch || undefined }),
    });
    // Only the settled value should trigger navigation — re-running this on
    // every render (e.g. from `search`/`navigate` identity changes) would
    // re-fire it before the debounce window even closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleSearch = (value: string) => {
    setLocalSearch(value);
  };

  const handleTabChange = (tab: WorkflowTab) => {
    navigate({ to: '/app/orders', search: { tab, page: 1, search: search || undefined } });
  };

  const handlePageChange = (newPage: number) => {
    navigate({ to: '/app/orders', search: { ...search_, page: newPage } });
  };

  const handleLimitChange = (newLimit: number) => {
    navigate({
      to: '/app/orders',
      search: { ...search_, page: 1, limit: newLimit },
    });
  };

  // Clamp out-of-range pages (e.g. "Page 3 of 2" after filters shrink results).
  useEffect(() => {
    if (loading) return;
    if (meta.totalPages > 0 && page > meta.totalPages) {
      navigate({
        to: '/app/orders',
        search: { ...search_, page: meta.totalPages },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, meta.totalPages, page]);

  const handleSort = (field: OrderSortField) => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    navigate({ to: '/app/orders', search: { ...search_, sortBy: field, sortOrder: newOrder } });
  };

  const sortProps = { activeField: sortBy, order: sortOrder, onSort: handleSort };

  const mapOrderForExport = (o: Order) => ({
    orderNumber: o.orderNumber,
    customer: customerNameById.get(o.customerId) ?? o.customerId,
    route: `${o.pickupCity} → ${o.deliveryCity}`,
    pickupDate: o.pickupDate,
    deliveryDate: o.deliveryDate,
    cargoDescription: o.cargoDescription,
    price: o.price,
    currency: o.currency,
    status: o.status,
  });
  const EXPORT_CSV_COLUMNS = [
    { key: 'orderNumber' as const, label: 'Order #' },
    { key: 'customer' as const, label: 'Customer' },
    { key: 'route' as const, label: 'Route' },
    { key: 'pickupDate' as const, label: 'Pickup Date' },
    { key: 'deliveryDate' as const, label: 'Delivery Date' },
    { key: 'cargoDescription' as const, label: 'Cargo' },
    { key: 'price' as const, label: 'Price' },
    { key: 'currency' as const, label: 'Currency' },
    { key: 'status' as const, label: 'Status' },
  ];
  const EXPORT_EXCEL_COLUMNS = [
    { key: 'orderNumber' as const, label: 'Order #' },
    { key: 'customer' as const, label: 'Customer' },
    { key: 'route' as const, label: 'Route' },
    { key: 'pickupDate' as const, label: 'Pickup Date' },
    { key: 'deliveryDate' as const, label: 'Delivery Date' },
    { key: 'price' as const, label: 'Price' },
    { key: 'status' as const, label: 'Status' },
  ];

  const handleExportCsv = () => {
    if (data.length === 0) {
      toast.error('No rows to export');
      return;
    }
    downloadCsv(`orders-${currentTab}-page-${page}.csv`, toCsv(data.map(mapOrderForExport), EXPORT_CSV_COLUMNS));
    toast.success(`Exported ${data.length} order${data.length === 1 ? '' : 's'} from this page`);
  };

  const handleExportExcel = () => {
    if (data.length === 0) {
      toast.error('No rows to export');
      return;
    }
    const xml = toExcelXml(data.map(mapOrderForExport), EXPORT_EXCEL_COLUMNS);
    downloadExcel(`orders-${currentTab}-page-${page}`, xml);
    toast.success(`Exported ${data.length} order${data.length === 1 ? '' : 's'} to Excel`);
  };

  // "This page" export above is capped by the page size the user is currently
  // viewing (≤100). This one walks every page matching the current filters —
  // the server itself caps a single request's `limit` at 100, so a full
  // export loops. MAX_EXPORT_ROWS is a sane upper bound so a very large,
  // unfiltered org can't turn one click into thousands of sequential requests.
  const MAX_EXPORT_ROWS = 5000;
  const fetchAllMatchingOrders = async (): Promise<{ rows: Order[]; capped: boolean }> => {
    const rows: Order[] = [];
    let fetchPage = 1;
    for (;;) {
      const res = await ordersAPI.listOrders({ ...listQuery, page: fetchPage, limit: 100 });
      rows.push(...res.items);
      const capped = rows.length >= MAX_EXPORT_ROWS;
      if (capped || res.items.length === 0 || rows.length >= res.meta.total) {
        return { rows: rows.slice(0, MAX_EXPORT_ROWS), capped };
      }
      fetchPage += 1;
    }
  };

  const handleExportAllCsv = async () => {
    setExportingAll(true);
    try {
      const { rows, capped } = await fetchAllMatchingOrders();
      if (rows.length === 0) {
        toast.error('No rows to export');
        return;
      }
      downloadCsv(`orders-${currentTab}-all.csv`, toCsv(rows.map(mapOrderForExport), EXPORT_CSV_COLUMNS));
      toast.success(
        `Exported ${rows.length} order${rows.length === 1 ? '' : 's'}${capped ? ` (capped at ${MAX_EXPORT_ROWS})` : ''}`,
      );
    } catch (err) {
      toast.error(describeError(err, 'Export failed'));
    } finally {
      setExportingAll(false);
    }
  };

  const handleExportAllExcel = async () => {
    setExportingAll(true);
    try {
      const { rows, capped } = await fetchAllMatchingOrders();
      if (rows.length === 0) {
        toast.error('No rows to export');
        return;
      }
      const xml = toExcelXml(rows.map(mapOrderForExport), EXPORT_EXCEL_COLUMNS);
      downloadExcel(`orders-${currentTab}-all`, xml);
      toast.success(
        `Exported ${rows.length} order${rows.length === 1 ? '' : 's'}${capped ? ` (capped at ${MAX_EXPORT_ROWS})` : ''} to Excel`,
      );
    } catch (err) {
      toast.error(describeError(err, 'Export failed'));
    } finally {
      setExportingAll(false);
    }
  };

  const handleApplyFilters = (values: OrdersFilterValues) => {
    navigate({
      to: '/app/orders',
      search: (prev) => searchFromFilters(prev as ListSearchState, values),
    });
  };

  const handleClearFilters = () => {
    navigate({
      to: '/app/orders',
      search: (prev) => ({
        tab: (prev as ListSearchState).tab,
        page: 1,
        search: (prev as ListSearchState).search,
        sortBy: (prev as ListSearchState).sortBy,
        sortOrder: (prev as ListSearchState).sortOrder,
        limit: (prev as ListSearchState).limit,
      }),
    });
  };

  const handleSaveCurrentFilter = () => {
    const name = saveFilterName.trim();
    if (!name) return;
    const next = [...savedFilters.filter((f) => f.name !== name), { name, values: filters }];
    setSavedFilters(next);
    persistSavedFilters(next);
    setSaveFilterOpen(false);
    setSaveFilterName('');
    toast.success(`Saved filter "${name}"`);
  };

  const toggleColumn = (col: OrdersListColumn, checked: boolean) => {
    const next = checked
      ? [...visibleColumns, col]
      : visibleColumns.filter((c) => c !== col);
    if (next.length === 0) {
      toast.error('Keep at least one column visible');
      return;
    }
    setVisibleColumns(next);
    saveVisibleColumns(next);
  };

  const copyOrderId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Order ID copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleArchiveFromList = async (order: Order) => {
    try {
      await archive(order.id);
      toast.success(`${order.orderNumber} archived`);
      setArchiveTarget(null);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive'));
    }
  };

  const handleRestoreFromList = async (order: Order) => {
    try {
      await restore(order.id);
      toast.success(`${order.orderNumber} restored`);
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore'));
    }
  };

  // Selection only ever refers to rows currently on screen — a new page,
  // tab, or filter set means the selected ids may no longer be visible (or
  // may no longer mean what the user thinks), so it's cleared rather than
  // carried forward silently.
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentTab, page, search, sortBy, sortOrder, filtersKey]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedOrders = data.filter((o) => selectedIds.has(o.id));
  const pageAllSelected = data.length > 0 && data.every((o) => selectedIds.has(o.id));
  const pageSomeSelected = !pageAllSelected && data.some((o) => selectedIds.has(o.id));
  const bulkArchivable = selectedOrders.filter(
    (o) => !o.archivedAt && (o.status === 'DELIVERED' || o.status === 'CANCELLED'),
  );
  const bulkRestorable = selectedOrders.filter((o) => o.archivedAt);

  async function runBulk(orders: Order[], action: (id: string) => Promise<unknown>, verb: string) {
    setBulkRunning(true);
    let succeeded = 0;
    let failed = 0;
    for (const order of orders) {
      try {
        await action(order.id);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkRunning(false);
    setSelectedIds(new Set());
    if (failed === 0) {
      toast.success(`${verb} ${succeeded} order${succeeded === 1 ? '' : 's'}`);
    } else {
      toast.error(`${verb} ${succeeded} order${succeeded === 1 ? '' : 's'}, ${failed} failed`);
    }
  }

  const handleBulkArchive = () => runBulk(bulkArchivable, archive, 'Archived');
  const handleBulkRestore = () => runBulk(bulkRestorable, restore, 'Restored');

  // Only boost delayed/unassigned when the user has not chosen an explicit
  // column sort — otherwise Value/Status headers would lie about order.
  const sortedData = useMemo(() => {
    if (sortBy !== 'createdAt') return data;
    return [...data].sort((a, b) => {
      if (a.isDelayed && !b.isDelayed) return -1;
      if (!a.isDelayed && b.isDelayed) return 1;
      if (a.status === 'PENDING' && !a.driverId && !(b.status === 'PENDING' && !b.driverId)) return -1;
      if (!(a.status === 'PENDING' && !a.driverId) && b.status === 'PENDING' && !b.driverId) return 1;
      return 0;
    });
  }, [data, sortBy]);

  const delayedTotal = dashboardSummary?.delayedOrders.total ?? 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Orders"
        subtitle={loading ? undefined : `${meta.total} total order${meta.total === 1 ? '' : 's'}`}
        action={
          <>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              aria-label="Search orders by number, customer, phone, driver, or plate"
              placeholder="Search orders, driver, plate… (/)"
              value={localSearch}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-9 w-full pl-9 sm:w-72"
            />
          </div>

          {/* Filters toggle — lives in the action row */}
          <Button
            type="button"
            variant={filtersExpanded ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setFiltersExpanded((v) => !v)}
            aria-expanded={filtersExpanded}
            aria-label="Toggle filters"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1 text-muted-foreground"
              onClick={handleClearFilters}
              aria-label="Clear all filters"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exportingAll} aria-label="Export">
                {exportingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" />
                ) : (
                  <Download className="h-3.5 w-3.5 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>Export page (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>Export page (Excel)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportAllCsv}>
                Export all matching filters (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAllExcel}>
                Export all matching filters (Excel)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canWriteOrder && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/app/import' })}
              aria-label="Import"
            >
              <Upload className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Import</span>
            </Button>
          )}
          {canWriteOrder && (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              data-testid="orders-new-button"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Order
            </Button>
          )}
          </>
        }
      />

      {/* Filter panel — only mounted when open; eager-fetches dropdown data */}
      {filtersExpanded && (
        <OrdersFiltersPanel
          values={filters}
          onChange={handleApplyFilters}
          onClear={handleClearFilters}
          footer={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Columns3 className="h-3.5 w-3.5" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(
                    [
                      ['route', 'Route'],
                      ['orderNumber', 'Order #'],
                      ['timeline', 'Timeline'],
                      ['customer', 'Customer'],
                      ['value', 'Value'],
                      ['status', 'Status'],
                    ] as [OrdersListColumn, string][]
                  ).map(([col, label]) => (
                    <DropdownMenuCheckboxItem
                      key={col}
                      checked={visibleColumns.includes(col)}
                      onCheckedChange={(checked) => toggleColumn(col, checked === true)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Bookmark className="h-3.5 w-3.5" />
                    Saved filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {savedFilters.length === 0 && (
                    <DropdownMenuItem disabled>No saved filters</DropdownMenuItem>
                  )}
                  {savedFilters.map((sf) => (
                    <DropdownMenuItem key={sf.name} onClick={() => handleApplyFilters(sf.values)}>
                      {sf.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSaveFilterOpen(true)}>
                    Save current filters…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      )}

      <FilterTabs
        tabs={TAB_CONFIG}
        value={currentTab}
        onChange={handleTabChange}
        label="Order workflow"
        activeCount={meta.total}
      />

      <OrdersKpiStrip summary={dashboardSummary} />

      {canOperateOrder && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmDialog
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRunning || bulkArchivable.length === 0}
                >
                  {bulkRunning ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Archive {bulkArchivable.length > 0 ? `(${bulkArchivable.length})` : ''}
                </Button>
              }
              title={`Archive ${bulkArchivable.length} order${bulkArchivable.length === 1 ? '' : 's'}?`}
              description={`${bulkArchivable.length} selected order${
                bulkArchivable.length === 1 ? '' : 's'
              } will leave the active list. Nothing is deleted — you can restore them from the Archived filter.`}
              confirmLabel={`Archive ${bulkArchivable.length}`}
              onConfirm={handleBulkArchive}
              destructive
            />
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning || bulkRestorable.length === 0}
              onClick={handleBulkRestore}
            >
              {bulkRunning ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
              )}
              Restore {bulkRestorable.length > 0 ? `(${bulkRestorable.length})` : ''}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
          {selectedOrders.length > bulkArchivable.length + bulkRestorable.length && (
            <span className="text-xs text-muted-foreground">
              Some selected orders aren&apos;t eligible for either action and will be skipped.
            </span>
          )}
        </div>
      )}

      {currentTab === 'action' && delayedTotal > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            {delayedTotal} order{delayedTotal === 1 ? '' : 's'} overdue
          </span>
          {sortBy === 'createdAt' && (
            <span className="text-sm text-muted-foreground">— delayed and unassigned rise to the top of this page</span>
          )}
        </div>
      )}

      {/* Main content area */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-surface">
        {/* Column widths follow whichever columns the user has switched on, so
            the skeleton is the shape of the table they are about to get. */}
        {loading && (
          <TableSkeleton
            columns={isNarrow ? [3, 2] : visibleColumns.map((column) => (column === 'route' ? 3 : 2))}
            label="Loading orders"
          />
        )}
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && sortedData.length === 0 && search && (
          <EmptyState
            icon={Package}
            title="No orders match your search"
            description={`No results for "${search}" in ${activeTabConfig.label}. Try a different term or clear the search.`}
            action={
              <Button
                onClick={() => {
                  setLocalSearch('');
                  navigate({ to: '/app/orders', search: { ...search_, page: 1, search: undefined } });
                }}
                variant="outline"
              >
                Clear search
              </Button>
            }
          />
        )}
        {!loading && !error && sortedData.length === 0 && !search && (
          <EmptyState
            icon={Package}
            title={
              currentTab === 'all' && meta.total === 0 && activeFilterCount === 0
                ? 'No orders yet'
                : currentTab === 'action'
                  ? 'All caught up'
                  : 'No orders here'
            }
            description={
              currentTab === 'all' && meta.total === 0 && activeFilterCount === 0
                ? 'Create your first order to start managing shipments.'
                : currentTab === 'action'
                  ? 'No orders need your attention right now.'
                  : 'No orders match this view.'
            }
            action={
              currentTab === 'all' && meta.total === 0 && activeFilterCount === 0 && canWriteOrder ? (
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Order
                </Button>
              ) : currentTab !== 'action' && canWriteOrder ? (
                <Button onClick={() => setCreateOpen(true)} variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Order
                </Button>
              ) : undefined
            }
          />
        )}
        {!loading && !error && sortedData.length > 0 && (
          <div className="max-h-[calc(100vh-20rem)] overflow-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/30">
                  {canOperateOrder && (
                    <th className="w-8 py-3 pl-3 pr-0 sm:pl-4">
                      <Checkbox
                        aria-label="Select all orders on this page"
                        checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            const pageIds = sortedData.map((o) => o.id);
                            if (checked) pageIds.forEach((id) => next.add(id));
                            else pageIds.forEach((id) => next.delete(id));
                            return next;
                          });
                        }}
                      />
                    </th>
                  )}
                  {isNarrow ? (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Order</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Route</th>
                      {visibleColumns.includes('orderNumber') && (
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Order #</th>
                      )}
                      {visibleColumns.includes('timeline') && (
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline</th>
                      )}
                      {visibleColumns.includes('customer') && (
                        <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground xl:table-cell">Customer</th>
                      )}
                      {visibleColumns.includes('value') && (
                        <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground xl:table-cell">
                          <div className="flex justify-end">
                            <SortHeader field="price" label="Value" {...sortProps} />
                          </div>
                        </th>
                      )}
                      {visibleColumns.includes('status') && (
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <div className="flex justify-end">
                            <SortHeader field="status" label="Status" {...sortProps} />
                          </div>
                        </th>
                      )}
                    </>
                  )}
                  <th className="w-20 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sortedData.map((order) => {
                  const isExpanded = expandedId === order.id;
                  const customerName = customerNameById.get(order.customerId) ?? '—';
                  const customerContactName = customerContactById.get(order.customerId) ?? null;
                  const isOverdue = order.isDelayed;
                  const needsAssignment = order.status === 'PENDING' && !order.driverId;
                  const isHighlighted = highlightId === order.id;

                  return (
                    <Fragment key={order.id}>
                      <tr
                        data-testid="order-row"
                        tabIndex={0}
                        role="button"
                        aria-expanded={isExpanded}
                        aria-label={`Order ${order.orderNumber}, ${isExpanded ? 'collapse' : 'expand'} details`}
                        className={cn(
                          'group cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                          isHighlighted
                            ? 'animate-pulse bg-brand/10 hover:bg-brand/15'
                            : isOverdue
                              ? 'bg-destructive/[0.03] hover:bg-destructive/[0.05]'
                              : needsAssignment
                                ? 'bg-warning/[0.03] hover:bg-warning/[0.05]'
                                : 'hover:bg-muted/30',
                          isExpanded && 'bg-muted/20',
                        )}
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedId(isExpanded ? null : order.id);
                          }
                        }}
                      >
                        {canOperateOrder && (
                          <td className="py-2.5 pl-3 pr-0 sm:pl-4" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              aria-label={`Select order ${order.orderNumber}`}
                              checked={selectedIds.has(order.id)}
                              onCheckedChange={(checked) => toggleSelected(order.id, checked === true)}
                            />
                          </td>
                        )}

                        {isNarrow && (
                          <>
                            <td className="px-4 py-2.5">
                              <div className="space-y-0.5">
                                <RouteIndicator from={order.pickupCity} to={order.deliveryCity} />
                                <p className="font-mono text-[11px] text-muted-foreground">{order.orderNumber}</p>
                                {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                                  <div className="flex flex-wrap gap-x-3 pt-0.5">
                                    <UrgencyBadge date={order.pickupDate} label="Pickup" />
                                    <UrgencyBadge date={order.deliveryDate} label="Deliver" />
                                  </div>
                                )}
                                {(order.archivedAt || needsAssignment) && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                    {order.archivedAt && (
                                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Archived</span>
                                    )}
                                    {needsAssignment && (
                                      <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                                        <Timer className="h-3 w-3" />Unassigned
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right align-top">
                              <StatusBadge status={order.status} />
                            </td>
                          </>
                        )}

                        {!isNarrow && (
                          <td className="px-4 py-2.5">
                            <div className="space-y-0.5">
                              <RouteIndicator from={order.pickupCity} to={order.deliveryCity} />
                              {!visibleColumns.includes('orderNumber') && (
                                <p className="font-mono text-[11px] text-muted-foreground">{order.orderNumber}</p>
                              )}
                            </div>
                          </td>
                        )}

                        {!isNarrow && visibleColumns.includes('orderNumber') && (
                          <td className="px-4 py-2.5">
                            <p className="font-mono text-xs text-foreground">{order.orderNumber}</p>
                          </td>
                        )}

                        {!isNarrow && visibleColumns.includes('timeline') && (
                          <td className="px-4 py-2.5">
                            <div className="space-y-0.5">
                              {order.status === 'DELIVERED' || order.status === 'CANCELLED' ? (
                                <span className="text-xs text-muted-foreground">
                                  {order.status === 'DELIVERED' ? 'Delivered' : 'Cancelled'}{' '}
                                  {formatDate(order.deliveredAt || order.cancelledAt || order.updatedAt)}
                                </span>
                              ) : (
                                <>
                                  <UrgencyBadge date={order.pickupDate} label="Pickup" />
                                  <UrgencyBadge date={order.deliveryDate} label="Deliver" />
                                </>
                              )}
                            </div>
                          </td>
                        )}

                        {!isNarrow && visibleColumns.includes('customer') && (
                          <td className="hidden px-4 py-2.5 xl:table-cell">
                            <span className="text-sm text-foreground">{customerName}</span>
                          </td>
                        )}

                        {!isNarrow && visibleColumns.includes('value') && (
                          <td className="hidden px-4 py-2.5 text-right xl:table-cell">
                            <span className="font-mono text-sm font-semibold text-foreground">
                              {formatMoney(order.price, order.currency)}
                            </span>
                          </td>
                        )}

                        {!isNarrow && visibleColumns.includes('status') && (
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {order.archivedAt && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Archived</span>
                              )}
                              {needsAssignment && (
                                <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                                  <Timer className="h-3 w-3" />Unassigned
                                </span>
                              )}
                              <StatusBadge status={order.status} />
                            </div>
                          </td>
                        )}

                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  aria-label="More actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate({ to: `/app/orders/${order.id}` })}>
                                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                  Open detail
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => copyOrderId(order.id)}>
                                  <Copy className="mr-2 h-3.5 w-3.5" />
                                  Copy order ID
                                </DropdownMenuItem>
                                {canOperateOrder && !order.archivedAt &&
                                  (order.status === 'DELIVERED' || order.status === 'CANCELLED') && (
                                    <DropdownMenuItem onClick={() => setArchiveTarget(order)}>
                                      <Archive className="mr-2 h-3.5 w-3.5" />
                                      Archive
                                    </DropdownMenuItem>
                                  )}
                                {canOperateOrder && order.archivedAt && (
                                  <DropdownMenuItem onClick={() => handleRestoreFromList(order)}>
                                    <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                                    Restore
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <ExpandedOrderRow
                          key={`${order.id}-expanded`}
                          order={order}
                          customerName={customerName}
                          customerContactName={customerContactName}
                          canOperate={canOperateOrder}
                          canWrite={canWriteOrder}
                          colSpan={99}
                          onEdit={setEditingOrder}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationBar
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        onPageChange={handlePageChange}
        limit={limit}
        onLimitChange={handleLimitChange}
        prevTestId="orders-prev-page"
        nextTestId="orders-next-page"
      />

      {canWriteOrder && (
        <OrdersCreateSheet
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          onCreated={handleCreated}
          defaultCustomerId={searchState.customerId}
        />
      )}

      {canWriteOrder && editingOrder && (
        <OrdersEditSheet
          open={editingOrder !== null}
          onOpenChange={(open) => {
            if (!open) setEditingOrder(null);
          }}
          order={editingOrder}
          onUpdated={() => {
            void refetch();
            setEditingOrder(null);
          }}
        />
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={`Archive ${archiveTarget?.orderNumber ?? 'this order'}?`}
        description="It leaves the active list and stops appearing in day-to-day views. Nothing is deleted — you can restore it from the Archived filter."
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiveTarget) void handleArchiveFromList(archiveTarget);
        }}
        destructive
      />

      <Dialog open={saveFilterOpen} onOpenChange={setSaveFilterOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save filter preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="filter-name">Name</Label>
            <Input
              id="filter-name"
              value={saveFilterName}
              onChange={(e) => setSaveFilterName(e.target.value)}
              placeholder="e.g. Overdue Tashkent"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveFilterOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCurrentFilter} disabled={!saveFilterName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
