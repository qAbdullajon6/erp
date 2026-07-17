'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import {
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  X,
  Route as RouteIcon,
  ArrowRight,
  AlertTriangle,
  User,
  Truck,
  Clock,
  ChevronRight,
  MapPin,
} from 'lucide-react';

type ViewMode = 'all' | 'active' | 'overdue' | 'completed';

const ACTIVE_STATUSES: DispatchStatus[] = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];
const COMPLETED_STATUSES: DispatchStatus[] = ['DELIVERED', 'CANCELLED'];

function getDispatchUrgency(d: ApiDispatch): { label: string; tone: string; isLate: boolean } {
  if (COMPLETED_STATUSES.includes(d.status)) return { label: '', tone: '', isLate: false };
  const target = new Date(d.deliveryDateScheduled);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: 'text-destructive', isLate: true };
  if (diffHours < 12) return { label: 'Due today', tone: 'text-warning', isLate: false };
  if (diffHours < 36) return { label: 'Tomorrow', tone: 'text-warning', isLate: false };
  return { label: `${diffDays}d`, tone: 'text-muted-foreground', isLate: false };
}

function DispatchRow({ dispatch }: { dispatch: ApiDispatch }) {
  const router = useRouter();
  const urgency = getDispatchUrgency(dispatch);
  const isTerminal = COMPLETED_STATUSES.includes(dispatch.status);

  return (
    <div
      className={`group flex cursor-pointer items-center gap-4 border-b border-border px-4 py-3 transition-colors hover:bg-muted/30 ${urgency.isLate ? 'bg-destructive/3' : ''}`}
      onClick={() => router.navigate({ to: `/app/dispatches/${dispatch.id}` })}
      data-testid="dispatch-row"
    >
      {/* Status indicator dot */}
      <div className="flex flex-col items-center gap-1">
        <div className={`h-2.5 w-2.5 rounded-full ${
          dispatch.status === 'IN_TRANSIT' ? 'bg-brand animate-pulse' :
          dispatch.status === 'DELIVERED' ? 'bg-success' :
          dispatch.status === 'CANCELLED' ? 'bg-muted-foreground' :
          urgency.isLate ? 'bg-destructive' :
          'bg-warning'
        }`} />
      </div>

      {/* Route + dispatch ID */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-foreground">{dispatch.order?.pickupCity ?? '—'}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">{dispatch.order?.deliveryCity ?? '—'}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{dispatch.dispatchNumber}</span>
          <span>&middot;</span>
          <span>{dispatch.order?.customer?.companyName ?? 'Unknown'}</span>
        </div>
      </div>

      {/* Driver & vehicle */}
      <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
        {dispatch.driver && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {dispatch.driver.firstName} {dispatch.driver.lastName?.charAt(0)}.
          </span>
        )}
        {dispatch.vehicle && (
          <span className="flex items-center gap-1 font-mono">
            <Truck className="h-3 w-3" />
            {dispatch.vehicle.plateNumber}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="hidden w-32 text-right text-xs text-muted-foreground md:block">
        {isTerminal ? (
          <span>{formatDate(dispatch.deliveryDateScheduled)}</span>
        ) : (
          <span className={urgency.tone}>
            {urgency.isLate && <AlertTriangle className="mr-1 inline h-3 w-3" />}
            {urgency.label}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="w-28 text-right">
        <StatusBadge status={dispatch.status} />
      </div>

      {/* Navigate chevron */}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

export function DispatchesList() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const debouncedSearch = useDebouncedValue(search, 300);

  const statusFromView = viewMode === 'active'
    ? undefined
    : viewMode === 'completed'
      ? 'DELIVERED'
      : statusFilter || undefined;

  const { data, meta, loading, refreshing, error, refetch } = useDispatches(page, 25, {
    search: debouncedSearch || undefined,
    status: statusFromView,
  });

  const items = data ?? [];

  const filteredItems = useMemo(() => {
    if (viewMode === 'active') return items.filter((d) => ACTIVE_STATUSES.includes(d.status));
    if (viewMode === 'overdue') return items.filter((d) => getDispatchUrgency(d).isLate);
    if (viewMode === 'completed') return items.filter((d) => COMPLETED_STATUSES.includes(d.status));
    return items;
  }, [items, viewMode]);

  const overdueCount = useMemo(() => items.filter((d) => getDispatchUrgency(d).isLate).length, [items]);
  const activeCount = useMemo(() => items.filter((d) => ACTIVE_STATUSES.includes(d.status)).length, [items]);

  const hasFilters = Boolean(search || statusFilter);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Dispatches</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `${meta?.total ?? 0} total`}
            {refreshing && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => router.navigate({ to: '/app/dispatches/board' })} variant="outline" size="sm" data-testid="dispatch-board-button">
            <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
            Board
          </Button>
          <Button onClick={() => router.navigate({ to: '/app/dispatches/create' })} size="sm" className="bg-gradient-brand text-brand-foreground hover:opacity-90" data-testid="create-dispatch-button">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Search + view mode tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search dispatches..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            data-testid="dispatches-search-input"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'active' as const, label: `Active (${activeCount})` },
            { key: 'overdue' as const, label: `Overdue (${overdueCount})`, urgent: overdueCount > 0 },
            { key: 'completed' as const, label: 'Completed' },
          ]).map((mode) => (
            <button
              key={mode.key}
              onClick={() => { setViewMode(mode.key); setPage(1); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode.key
                  ? 'bg-brand/10 text-brand'
                  : mode.urgent
                    ? 'text-destructive hover:bg-destructive/5'
                    : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode.key === 'overdue' && overdueCount > 0 && <AlertTriangle className="mr-1 inline h-3 w-3" />}
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}

        {loading && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <EmptyState
            icon={RouteIcon}
            title={viewMode === 'overdue' ? 'No overdue dispatches' : 'No dispatches found'}
            description={
              viewMode === 'overdue'
                ? 'All dispatches are on schedule.'
                : hasFilters
                  ? 'Try adjusting your filters.'
                  : 'Assign a driver and vehicle to create a dispatch.'
            }
            action={
              viewMode === 'all' && !hasFilters ? (
                <Button onClick={() => router.navigate({ to: '/app/dispatches/create' })} variant="outline">
                  Create dispatch
                </Button>
              ) : undefined
            }
          />
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <div className="max-h-[calc(100vh-18rem)] overflow-auto scrollbar-thin">
            {filteredItems.map((dispatch) => (
              <DispatchRow key={dispatch.id} dispatch={dispatch} />
            ))}
          </div>
        )}
      </div>

      {meta && (
        <PaginationBar
          page={page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
          prevTestId="dispatches-prev-page"
          nextTestId="dispatches-next-page"
        />
      )}
    </div>
  );
}
