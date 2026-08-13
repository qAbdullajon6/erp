'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDispatches, useDispatchBoardSummary } from '@/lib/hooks/use-dispatches';
import { useCurrentUser } from '@/lib/api/auth';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/shared/list-states';
import { PageHeader } from '@/components/shared/page-header';
import { DispatchesCreateSheet } from '@/components/dispatch/dispatches-create-sheet';
import { DispatchReassignDialog } from '@/components/dispatch/dispatch-reassign-dialog';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { FilterTabs } from '@/components/shared/filter-tabs';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DISPATCH_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import type { DispatchesSearch } from '@/routes/app.dispatches.index';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import { formatDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import {
  Plus,
  Search,
  Download,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Phone,
  Route as RouteIcon,
  Timer,
  UserRoundCog,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { DispatchViewToggle } from '@/components/dispatch/dispatch-view-toggle';

type WorkflowTab = 'action' | 'active' | 'in_transit' | 'delivered' | 'cancelled' | 'all';

type ListSearchState = DispatchesSearch & {
  tab?: WorkflowTab;
};

const WAITING_PICKUP: DispatchStatus[] = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP'];
const NEEDS_ACTION: DispatchStatus[] = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP'];
const ACTIVE: DispatchStatus[] = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];
const TERMINAL: DispatchStatus[] = ['DELIVERED', 'CANCELLED'];

const TAB_CONFIG: { key: WorkflowTab; label: string; statuses: DispatchStatus[] | null }[] = [
  { key: 'action', label: 'Needs Action', statuses: NEEDS_ACTION },
  { key: 'active', label: 'Active', statuses: ACTIVE },
  { key: 'in_transit', label: 'In Transit', statuses: ['IN_TRANSIT'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
  { key: 'all', label: 'All', statuses: null },
];

function getTimeUrgency(iso: string): { label: string; tone: string; urgent: boolean; isLate: boolean; dueToday: boolean } {
  const target = new Date(iso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours < 0) {
    const hoursLate = Math.abs(diffHours);
    if (hoursLate < 24) {
      return {
        label: `${Math.max(1, Math.ceil(hoursLate))}h overdue`,
        tone: 'text-destructive',
        urgent: true,
        isLate: true,
        dueToday: false,
      };
    }
    return {
      label: `${Math.ceil(hoursLate / 24)}d overdue`,
      tone: 'text-destructive',
      urgent: true,
      isLate: true,
      dueToday: false,
    };
  }
  if (diffHours < 24) {
    return { label: 'Today', tone: 'text-warning', urgent: true, isLate: false, dueToday: true };
  }
  if (diffHours < 48) {
    return { label: 'Tomorrow', tone: 'text-warning', urgent: false, isLate: false, dueToday: false };
  }
  if (diffDays <= 3) {
    return { label: `${diffDays} days`, tone: 'text-muted-foreground', urgent: false, isLate: false, dueToday: false };
  }
  return {
    label: formatDate(iso),
    tone: 'text-muted-foreground',
    urgent: false,
    isLate: false,
    dueToday: false,
  };
}

function isDispatchLate(d: ApiDispatch): boolean {
  if (TERMINAL.includes(d.status)) return false;
  return getTimeUrgency(d.deliveryDateScheduled).isLate;
}

function isWaitingPickup(d: ApiDispatch): boolean {
  return WAITING_PICKUP.includes(d.status);
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
  return (
    <div className={`flex items-center gap-1 text-xs ${urgency.tone}`}>
      {urgency.urgent && <AlertTriangle className="h-3 w-3" />}
      <span>
        {contextLabel}: {urgency.label}
      </span>
    </div>
  );
}

function RiskBadges({ dispatch, align = 'end' }: { dispatch: ApiDispatch; align?: 'start' | 'end' }) {
  const delivery = getTimeUrgency(dispatch.deliveryDateScheduled);
  const chips: { key: string; label: string; className: string }[] = [];

  if (!TERMINAL.includes(dispatch.status)) {
    if (delivery.isLate) {
      chips.push({ key: 'late', label: 'Late', className: 'bg-destructive/10 text-destructive' });
    } else if (delivery.dueToday) {
      chips.push({ key: 'due', label: 'Due Today', className: 'bg-warning/10 text-warning' });
    }
  }

  if (isWaitingPickup(dispatch)) {
    chips.push({ key: 'wait', label: 'Waiting Pickup', className: 'bg-warning/10 text-warning' });
  } else if (dispatch.status === 'IN_TRANSIT') {
    chips.push({ key: 'transit', label: 'In Transit', className: 'bg-brand/10 text-brand' });
  } else if (dispatch.status === 'DELIVERED') {
    chips.push({ key: 'done', label: 'Delivered', className: 'bg-success/10 text-success' });
  } else if (dispatch.status === 'CANCELLED') {
    chips.push({ key: 'cancel', label: 'Cancelled', className: 'bg-muted text-muted-foreground' });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', align === 'end' ? 'justify-end' : 'justify-start')}>
      {chips.map((c) => (
        <span
          key={c.key}
          className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', c.className)}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function ExpandedDispatchRow({
  dispatch,
  canWrite,
  onOpen,
  onReassign,
  onCall,
}: {
  dispatch: ApiDispatch;
  canWrite: boolean;
  onOpen: () => void;
  onReassign: () => void;
  onCall: () => void;
}) {
  const canReassign = canWrite && !TERMINAL.includes(dispatch.status);
  const canCall = Boolean(dispatch.driver?.phone);

  return (
    <TableRow className="bg-surface/50">
      <TableCell colSpan={7} className="p-0">
        <div className="grid grid-cols-1 gap-6 border-t border-brand/5 px-4 py-4 sm:px-6 md:grid-cols-3">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pickup</p>
              <p className="mt-1 text-sm text-foreground">{dispatch.order?.pickupCity ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{formatDate(dispatch.pickupDateScheduled)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Delivery</p>
              <p className="mt-1 text-sm text-foreground">{dispatch.order?.deliveryCity ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{formatDate(dispatch.deliveryDateScheduled)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Driver</p>
              <p className="mt-1 text-sm text-foreground">
                {dispatch.driver
                  ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}`
                  : '—'}
              </p>
              {dispatch.driver?.phone && (
                <p className="text-xs text-muted-foreground">{dispatch.driver.phone}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vehicle</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {dispatch.vehicle?.plateNumber ?? '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch justify-between gap-3 md:items-end">
            <div className="text-left md:text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Order</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {dispatch.order?.orderNumber ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {dispatch.order?.customer?.companyName ?? '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {canReassign && (
                <Button size="sm" variant="default" onClick={onReassign}>
                  <UserRoundCog className="mr-1.5 h-3 w-3" />
                  Reassign
                </Button>
              )}
              {canCall && (
                <Button size="sm" variant="outline" onClick={onCall}>
                  <Phone className="mr-1.5 h-3 w-3" />
                  Call driver
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onOpen}>
                Open
              </Button>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function DispatchesList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/dispatches/' }) as ListSearchState;
  const { data: currentUser } = useCurrentUser();
  const canWrite = Boolean(
    currentUser && DISPATCH_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  const currentTab = searchState.tab || 'action';
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const isNarrow = useMediaQuery('(max-width: 639px)');

  const activeTabConfig = TAB_CONFIG.find((t) => t.key === currentTab) ?? TAB_CONFIG[0];
  const tabStatuses = activeTabConfig.statuses;

  const { data, meta, loading, error, refetch } = useDispatches(page, 25, {
    search: search || undefined,
    status: tabStatuses?.length === 1 ? tabStatuses[0] : undefined,
    statuses: tabStatuses && tabStatuses.length > 1 ? tabStatuses : undefined,
  });

  /// Strip stats from a wider active slice + board (overloaded drivers). No fake fields.
  const { data: activeSlice, meta: activeMeta } = useDispatches(1, 100, { statuses: ACTIVE });
  const { data: board } = useDispatchBoardSummary({ enabled: true });

  const items = data ?? [];
  const stripItems = activeSlice ?? [];
  /// The strip counts only the first 100 active dispatches — accurate for a
  /// normal shift, but an org running 500+ shipments/day can have more active
  /// dispatches than that. Say so rather than silently under-reporting.
  const stripTruncated = (activeMeta?.total ?? 0) > 100;

  const overdueCount = useMemo(() => stripItems.filter(isDispatchLate).length, [stripItems]);
  const waitingPickupCount = useMemo(() => stripItems.filter(isWaitingPickup).length, [stripItems]);
  const reassignmentCount = useMemo(() => {
    if (!board) return 0;
    const byDriver = new Map<string, number>();
    for (const b of board.drivers.busy) {
      byDriver.set(b.driver.id, (byDriver.get(b.driver.id) ?? 0) + 1);
    }
    return [...byDriver.values()].filter((n) => n > 1).length;
  }, [board]);

  const showPriorityStrip = overdueCount > 0 || waitingPickupCount > 0 || reassignmentCount > 0;

  const [localSearch, setLocalSearch] = useState(search);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(Boolean(searchState.create));
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<ApiDispatch | null>(null);

  useEffect(() => {
    if (searchState.create) setCreateOpen(true);
  }, [searchState.create]);

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open && (searchState.create || searchState.orderId)) {
      navigate({
        to: '/app/dispatches',
        search: (prev) => ({ ...prev, create: undefined, orderId: undefined }),
        replace: true,
      });
    }
  };

  const handleCreated = (dispatch: ApiDispatch) => {
    setHighlightId(dispatch.id);
    setSelectedId(dispatch.id);
    navigate({ to: '/app/dispatches', search: { tab: 'action', page: 1 } });
    setTimeout(() => setHighlightId(null), 5000);
  };

  const search_ = { page, search, tab: currentTab };

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    navigate({
      to: '/app/dispatches',
      search: (prev) => ({ ...prev, page: 1, search: debouncedSearch || undefined }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleSearch = (value: string) => {
    setLocalSearch(value);
  };

  const handleTabChange = (tab: WorkflowTab) => {
    navigate({ to: '/app/dispatches', search: { tab, page: 1, search: search || undefined } });
  };

  const handlePageChange = (newPage: number) => {
    navigate({ to: '/app/dispatches', search: { ...search_, page: newPage } });
  };

  const openDispatch = (id: string) => {
    navigate({ to: '/app/dispatches/$dispatchId', params: { dispatchId: id } });
  };

  const callDriver = (dispatch: ApiDispatch) => {
    const phone = dispatch.driver?.phone;
    if (!phone) {
      toast.error('No driver phone on file');
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const handleExport = () => {
    if (items.length === 0) {
      toast.error('No rows to export');
      return;
    }
    const csv = toCsv(
      items.map((d) => ({
        dispatchNumber: d.dispatchNumber,
        orderNumber: d.order?.orderNumber ?? '',
        customer: d.order?.customer?.companyName ?? '',
        route: `${d.order?.pickupCity ?? ''} → ${d.order?.deliveryCity ?? ''}`,
        driver: d.driver ? `${d.driver.firstName} ${d.driver.lastName}` : '',
        vehicle: d.vehicle?.plateNumber ?? '',
        status: d.status,
        pickupDate: d.pickupDateScheduled,
        deliveryDate: d.deliveryDateScheduled,
      })),
      [
        { key: 'dispatchNumber', label: 'Dispatch #' },
        { key: 'orderNumber', label: 'Order #' },
        { key: 'customer', label: 'Customer' },
        { key: 'route', label: 'Route' },
        { key: 'driver', label: 'Driver' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'status', label: 'Status' },
        { key: 'pickupDate', label: 'Pickup Date' },
        { key: 'deliveryDate', label: 'Delivery Date' },
      ],
    );
    downloadCsv(`dispatches-${currentTab}-page-${page}.csv`, csv);
    toast.success(`Exported ${items.length} dispatch${items.length === 1 ? '' : 'es'} from this page`);
  };

  const metaSafe = meta ?? { page: 1, limit: 25, total: 0, totalPages: 0 };

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Dispatch"
        subtitle={
          loading ? undefined : `${metaSafe.total} total dispatch${metaSafe.total === 1 ? '' : 'es'}`
        }
        action={
          <>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search dispatches by number, city, or customer"
              placeholder="Search dispatch #, city, customer..."
              value={localSearch}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-9 w-full pl-9 sm:w-64"
              data-testid="dispatches-search-input"
            />
          </div>
          <DispatchViewToggle current="list" />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export page
          </Button>
          {canWrite && (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              data-testid="create-dispatch-button"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Dispatch
            </Button>
          )}
          </>
        }
      />

      <FilterTabs
        tabs={TAB_CONFIG}
        value={currentTab}
        onChange={handleTabChange}
        label="Dispatch workflow"
        activeCount={metaSafe.total}
      />

      {showPriorityStrip && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/20 px-4 py-2.5">
          {overdueCount > 0 && (
            <button
              type="button"
              onClick={() => handleTabChange('action')}
              className="flex items-center gap-2 text-sm font-medium text-destructive hover:underline"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {overdueCount} dispatch{overdueCount === 1 ? '' : 'es'} overdue
            </button>
          )}
          {reassignmentCount > 0 && (
            <span className="flex items-center gap-2 text-sm font-medium text-warning">
              <UserRoundCog className="h-4 w-4 shrink-0" />
              {reassignmentCount} driver{reassignmentCount === 1 ? '' : 's'} need
              {reassignmentCount === 1 ? 's' : ''} reassignment
            </span>
          )}
          {waitingPickupCount > 0 && (
            <button
              type="button"
              onClick={() => handleTabChange('action')}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
            >
              <Timer className="h-4 w-4 shrink-0 text-warning" />
              {waitingPickupCount} waiting pickup
            </button>
          )}
          {stripTruncated && (
            <span className="text-xs text-muted-foreground">
              (counts from the first 100 active dispatches — more may be active)
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        {loading && <TableSkeleton columns={[3, 2, 2, 2, 2, 2]} label="Loading dispatches" />}
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && items.length === 0 && search && (
          <EmptyState
            icon={RouteIcon}
            title="No dispatches match your search"
            description={`No results for "${search}" in ${activeTabConfig.label}. Try a different term or clear the search.`}
            action={
              <Button
                onClick={() => {
                  setLocalSearch('');
                  navigate({ to: '/app/dispatches', search: { ...search_, page: 1, search: undefined } });
                }}
                variant="outline"
              >
                Clear search
              </Button>
            }
          />
        )}
        {!loading && !error && items.length === 0 && !search && (
          <EmptyState
            icon={RouteIcon}
            title={currentTab === 'action' ? 'All caught up' : 'No dispatches found'}
            description={
              currentTab === 'action'
                ? 'No dispatches need your attention right now.'
                : 'Assign a driver and vehicle to create a dispatch.'
            }
            action={
              currentTab !== 'action' && canWrite ? (
                <Button onClick={() => setCreateOpen(true)} variant="outline">
                  Create dispatch
                </Button>
              ) : undefined
            }
          />
        )}
        {!loading && !error && items.length > 0 && (
          <div className="max-h-[calc(100vh-20rem)] overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface">
                <TableRow className="border-b border-border bg-surface/95 backdrop-blur hover:bg-surface/95">
                  <TableHead className="w-8" />
                  <TableHead className="font-medium text-xs uppercase tracking-wider">Route</TableHead>
                  {!isNarrow && (
                    <TableHead className="font-medium text-xs uppercase tracking-wider">Timeline</TableHead>
                  )}
                  <TableHead className="hidden font-medium text-xs uppercase tracking-wider md:table-cell">
                    Customer
                  </TableHead>
                  <TableHead className="hidden font-medium text-xs uppercase tracking-wider lg:table-cell">
                    Fleet
                  </TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider text-right">
                    Status
                  </TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((dispatch) => {
                  const isExpanded = expandedId === dispatch.id;
                  const isSelected = selectedId === dispatch.id;
                  const isHighlighted = highlightId === dispatch.id;
                  const isLate = isDispatchLate(dispatch);
                  const waiting = isWaitingPickup(dispatch);
                  const canReassign = canWrite && !TERMINAL.includes(dispatch.status);
                  const canCall = Boolean(dispatch.driver?.phone);
                  // Its own column with room to breathe on a desktop; folded
                  // under the route on a phone, where a separate column left it
                  // wrapping over three lines and pushed Status off the screen.
                  const timeline =
                    dispatch.status === 'DELIVERED' || dispatch.status === 'CANCELLED' ? (
                      <span className="text-xs text-muted-foreground">
                        {dispatch.status === 'DELIVERED' ? 'Delivered' : 'Cancelled'}{' '}
                        {formatDate(
                          dispatch.deliveryDateActual ||
                            dispatch.deliveryDateScheduled ||
                            dispatch.updatedAt,
                        )}
                      </span>
                    ) : (
                      <>
                        <UrgencyBadge date={dispatch.pickupDateScheduled} label="Pickup" />
                        <UrgencyBadge date={dispatch.deliveryDateScheduled} label="Deliver" />
                      </>
                    );

                  return (
                    <Fragment key={dispatch.id}>
                      <TableRow
                        data-testid="dispatch-row"
                        tabIndex={0}
                        role="button"
                        aria-expanded={isExpanded}
                        aria-selected={isSelected}
                        aria-label={`Dispatch ${dispatch.dispatchNumber}, ${isExpanded ? 'collapse' : 'expand'} details`}
                        className={cn(
                          'cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                          isHighlighted && 'animate-pulse bg-brand/10 hover:bg-brand/15',
                          !isHighlighted && isLate && 'bg-destructive/3 hover:bg-destructive/5',
                          !isHighlighted && !isLate && waiting && 'bg-warning/3 hover:bg-warning/5',
                          !isHighlighted && !isLate && !waiting && 'hover:bg-muted/50',
                          isSelected && 'ring-1 ring-inset ring-brand/40',
                          isExpanded && 'bg-muted/30',
                        )}
                        onClick={() => {
                          setSelectedId(dispatch.id);
                          setExpandedId(isExpanded ? null : dispatch.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedId(dispatch.id);
                            setExpandedId(isExpanded ? null : dispatch.id);
                          }
                        }}
                        onDoubleClick={() => openDispatch(dispatch.id)}
                      >
                        <TableCell className="py-3 pl-4 pr-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="space-y-0.5">
                            <RouteIndicator
                              from={dispatch.order?.pickupCity ?? '—'}
                              to={dispatch.order?.deliveryCity ?? '—'}
                            />
                            <p className="font-mono text-xs text-muted-foreground">
                              {dispatch.dispatchNumber}
                            </p>
                            {isNarrow && (
                              <>
                                <div className="flex flex-wrap gap-x-3">{timeline}</div>
                                <RiskBadges dispatch={dispatch} align="start" />
                              </>
                            )}
                          </div>
                        </TableCell>

                        {!isNarrow && (
                          <TableCell className="py-3">
                            <div className="space-y-0.5">{timeline}</div>
                          </TableCell>
                        )}

                        <TableCell className="hidden py-3 md:table-cell">
                          <span className="text-sm text-foreground">
                            {dispatch.order?.customer?.companyName ?? '—'}
                          </span>
                        </TableCell>

                        <TableCell className="hidden py-3 lg:table-cell">
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <p className="text-sm text-foreground">
                              {dispatch.driver
                                ? `${dispatch.driver.firstName} ${dispatch.driver.lastName?.charAt(0)}.`
                                : '—'}
                            </p>
                            <p className="font-mono">{dispatch.vehicle?.plateNumber ?? '—'}</p>
                          </div>
                        </TableCell>

                        <TableCell className="py-3 text-right align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            <StatusBadge status={dispatch.status} />
                            {!isNarrow && <RiskBadges dispatch={dispatch} />}
                          </div>
                        </TableCell>

                        <TableCell className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Actions for ${dispatch.dispatchNumber}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openDispatch(dispatch.id)}>
                                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                Open
                              </DropdownMenuItem>
                              {canReassign && (
                                <DropdownMenuItem onClick={() => setReassignTarget(dispatch)}>
                                  <UserRoundCog className="mr-2 h-3.5 w-3.5" />
                                  Reassign
                                </DropdownMenuItem>
                              )}
                              {canCall && (
                                <DropdownMenuItem onClick={() => callDriver(dispatch)}>
                                  <Phone className="mr-2 h-3.5 w-3.5" />
                                  Call driver
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedId(dispatch.id);
                                  setExpandedId(dispatch.id);
                                }}
                              >
                                View row details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <ExpandedDispatchRow
                          key={`${dispatch.id}-expanded`}
                          dispatch={dispatch}
                          canWrite={canWrite}
                          onOpen={() => openDispatch(dispatch.id)}
                          onReassign={() => setReassignTarget(dispatch)}
                          onCall={() => callDriver(dispatch)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PaginationBar
        page={metaSafe.page}
        totalPages={metaSafe.totalPages}
        total={metaSafe.total}
        onPageChange={handlePageChange}
        prevTestId="dispatches-prev-page"
        nextTestId="dispatches-next-page"
      />

      {canWrite && (
        <DispatchesCreateSheet
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          onCreated={handleCreated}
          initialOrderId={searchState.orderId}
        />
      )}

      <DispatchReassignDialog
        dispatch={reassignTarget}
        onClose={() => setReassignTarget(null)}
      />
    </div>
  );
}
