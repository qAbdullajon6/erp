import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useRoutesList, useDeleteRouteMutation, type RouteStatus } from '@/lib/api/routes';
import { PageHeader } from '@/components/shared/page-header';
import { FilterTabs, type FilterTab } from '@/components/shared/filter-tabs';
import { ListSkeleton, ErrorState, EmptyState } from '@/components/shared/list-states';
import { Button } from '@/components/ui/button';
import { RouteStatusBadge } from './route-status-badge';
import { RouteCreateSheet } from './route-create-sheet';
import { formatRouteDistance, formatRouteDuration } from './route-utils';
import { formatDate } from '@/lib/format';
import {
  CalendarDays,
  Navigation,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ApiRoute } from '@/lib/api/routes';

type StatusFilter = 'ALL' | RouteStatus;

const STATUS_TABS: readonly FilterTab<StatusFilter>[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'PLANNED', label: 'Planned' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

interface RoutesListProps {
  initialStatus?: StatusFilter;
  initialSearch?: string;
  initialFromDate?: string;
  initialToDate?: string;
  onSearchChange?: (v: string) => void;
  onStatusChange?: (v: StatusFilter) => void;
  onFromDateChange?: (v: string) => void;
  onToDateChange?: (v: string) => void;
}

export function RoutesListPage({
  initialStatus = 'ALL',
  initialSearch = '',
  initialFromDate = '',
  initialToDate = '',
  onSearchChange,
  onStatusChange,
  onFromDateChange,
  onToDateChange,
}: RoutesListProps) {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [createOpen, setCreateOpen] = useState(false);

  const apiStatus = statusFilter === 'ALL' ? undefined : statusFilter;

  const { data: routes, isLoading, error, refetch } = useRoutesList({
    status: apiStatus,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    limit: 100,
  });

  const { mutate: deleteRoute } = useDeleteRouteMutation();

  // Client-side text search (API doesn't support free-text search)
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return routes;
    const q = searchQuery.toLowerCase();
    return routes.filter((r) =>
      r.routeNumber.toLowerCase().includes(q) ||
      (r.driver && `${r.driver.firstName} ${r.driver.lastName}`.toLowerCase().includes(q)) ||
      (r.vehicle && r.vehicle.plateNumber.toLowerCase().includes(q)),
    );
  }, [routes, searchQuery]);

  const handleStatusChange = (v: StatusFilter) => {
    setStatusFilter(v);
    onStatusChange?.(v);
  };

  const handleSearch = (v: string) => {
    setSearchQuery(v);
    onSearchChange?.(v);
  };

  const handleFromDate = (v: string) => {
    setFromDate(v);
    onFromDateChange?.(v);
  };

  const handleToDate = (v: string) => {
    setToDate(v);
    onToDateChange?.(v);
  };

  const handleDelete = (route: ApiRoute, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${route.routeNumber}? This cannot be undone.`)) return;
    deleteRoute(route.id, {
      onSuccess: () => toast.success(`${route.routeNumber} deleted`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete route'),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Routes"
        subtitle="Plan and manage delivery routes for your fleet."
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Navigation className="h-4 w-4" aria-hidden />
            New Route
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
        <FilterTabs
          tabs={STATUS_TABS}
          value={statusFilter}
          onChange={handleStatusChange}
          label="Route status filter"
          activeCount={filtered.length}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-border/40 px-4 py-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="Search by route #, driver, or vehicle…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-border/50 bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFromDate(e.target.value)}
              aria-label="From date"
              className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleToDate(e.target.value)}
              aria-label="To date"
              className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Refresh */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            aria-label="Refresh routes"
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
        {isLoading ? (
          <ListSkeleton rows={6} showAvatar={false} label="Loading routes" />
        ) : error ? (
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Navigation}
            title={searchQuery ? 'No routes match your search' : 'No routes yet'}
            description={
              searchQuery
                ? 'Try a different search term or clear the filters.'
                : 'Create your first route to start planning deliveries.'
            }
            action={
              !searchQuery ? (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                  <Navigation className="h-3.5 w-3.5" aria-hidden />
                  New Route
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Table header */}
            <div className="hidden grid-cols-[2fr_1.2fr_1.5fr_1.2fr_0.8fr_0.8fr_0.8fr_48px] items-center gap-3 border-b border-border/40 bg-muted/30 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Route</span>
              <span>Status</span>
              <span>Planned Date</span>
              <span>Driver / Vehicle</span>
              <span>Stops</span>
              <span>Distance</span>
              <span>Duration</span>
              <span />
            </div>

            <div className="divide-y divide-border/30">
              {filtered.map((route) => (
                <RouteRow
                  key={route.id}
                  route={route}
                  onDelete={handleDelete}
                  onClick={() =>
                    navigate({ to: '/app/routes/$routeId', params: { routeId: route.id } })
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>

      <RouteCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

interface RouteRowProps {
  route: ApiRoute;
  onClick: () => void;
  onDelete: (route: ApiRoute, e: React.MouseEvent) => void;
}

function RouteRow({ route, onClick, onDelete }: RouteRowProps) {
  const deletable = route.status === 'DRAFT' || route.status === 'PLANNED' || route.status === 'CANCELLED';

  return (
    <div
      role="row"
      onClick={onClick}
      className={cn(
        'group grid cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/20',
        'grid-cols-[1fr_auto] sm:grid-cols-[2fr_1.2fr_1.5fr_1.2fr_0.8fr_0.8fr_0.8fr_48px]',
      )}
    >
      {/* Route number */}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{route.routeNumber}</p>
        {route.notes && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{route.notes}</p>
        )}
      </div>

      {/* Status */}
      <div className="hidden sm:block">
        <RouteStatusBadge status={route.status} size="sm" />
      </div>

      {/* Planned date */}
      <div className="hidden sm:flex sm:items-center sm:gap-1.5 sm:text-xs sm:text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {formatDate(route.plannedDate)}
      </div>

      {/* Driver / vehicle */}
      <div className="hidden min-w-0 flex-col sm:flex">
        {route.driver ? (
          <span className="flex items-center gap-1 truncate text-xs text-foreground">
            <User className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            {route.driver.firstName} {route.driver.lastName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
        {route.vehicle ? (
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Truck className="h-3 w-3 shrink-0" aria-hidden />
            {route.vehicle.plateNumber}
          </span>
        ) : null}
      </div>

      {/* Stops */}
      <div className="hidden text-sm tabular-nums text-foreground sm:block">
        {route.stops.length}
      </div>

      {/* Distance */}
      <div className="hidden text-xs text-muted-foreground sm:block">
        {formatRouteDistance(route.totalDistanceM)}
      </div>

      {/* Duration */}
      <div className="hidden text-xs text-muted-foreground sm:block">
        {formatRouteDuration(route.totalDurationSec)}
      </div>

      {/* Mobile status + actions */}
      <div className="flex items-center gap-1.5 sm:hidden">
        <RouteStatusBadge status={route.status} size="sm" />
      </div>

      {/* Delete */}
      <div className="flex items-center justify-end">
        {deletable && (
          <button
            type="button"
            onClick={(e) => onDelete(route, e)}
            aria-label={`Delete ${route.routeNumber}`}
            className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
