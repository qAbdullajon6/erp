'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useCurrentUser } from '@/lib/api/auth';
import { DISPATCH_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import type { CalendarSearch } from '@/routes/app.dispatches.calendar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/list-states';
import { DispatchesCreateSheet } from '@/components/dispatch/dispatches-create-sheet';
import { DispatchViewToggle } from '@/components/dispatch/dispatch-view-toggle';
import { DispatchCalendarFiltersBar } from '@/components/dispatch/dispatch-calendar-filters-bar';
import { DispatchCalendarGrid } from '@/components/dispatch/dispatch-calendar-grid';
import { DispatchCalendarKpis } from '@/components/dispatch/dispatch-calendar-kpis';
import { DispatchCalendarContextPanel } from '@/components/dispatch/dispatch-calendar-context-panel';
import { applyKpiFocus, computeCalendarKpis } from '@/components/dispatch/dispatch-calendar-stats';
import { useDispatchConflictsBatch, dispatchConflictKeys } from '@/lib/api/dispatch-conflicts';
import { useInvalidateOperationalState } from '@/lib/api/invalidate';
import type { CalendarKpiKey } from '@/components/dispatch/dispatch-calendar-kpis';
import { cn } from '@/lib/utils';
import {
  applyDatePreset,
  customRangeBounds,
  type CalendarDatePreset,
  type CalendarFilterState,
  type CalendarKpiFocus,
} from './dispatch-calendar-filters';
import {
  groupEventsByDay,
  parseCalendarDate,
  parseCalendarView,
  rangeLabel,
  shiftAnchor,
  toCalendarEvent,
  toDateParam,
  visibleRange,
  type CalendarEvent,
  type CalendarView,
} from './dispatch-calendar-utils';

const CALENDAR_PAGE_SIZE = 200;

function filtersFromSearch(search: CalendarSearch): CalendarFilterState {
  return {
    driverId: search.driver,
    vehicleId: search.vehicle,
    customerId: search.customer,
    status: search.dispatchStatus,
    q: search.q,
    preset: search.preset,
    from: search.from,
    to: search.to,
    kpiFocus: search.kpiFocus,
  };
}

function toSearchParams(
  view: CalendarView,
  date: Date,
  filters: CalendarFilterState,
): CalendarSearch {
  const out: CalendarSearch = {
    view,
    date: toDateParam(date),
  };
  if (filters.driverId) out.driver = filters.driverId;
  if (filters.vehicleId) out.vehicle = filters.vehicleId;
  if (filters.customerId) out.customer = filters.customerId;
  if (filters.status) out.dispatchStatus = filters.status;
  if (filters.q) out.q = filters.q;
  if (filters.preset) out.preset = filters.preset;
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  if (filters.kpiFocus) out.kpiFocus = filters.kpiFocus;
  return out;
}

export function DispatchCalendar() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/app/dispatches/calendar' });
  const view = parseCalendarView(search.view);
  const anchor = parseCalendarDate(search.date);
  const filters = filtersFromSearch(search);

  const { data: user } = useCurrentUser();
  const canWrite = Boolean(
    user && DISPATCH_WRITE_ROLES.includes(user.membership.role as MembershipRole),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [openFilter, setOpenFilter] = useState<'driver' | 'vehicle' | null>(null);

  const range = useMemo(() => {
    if (filters.preset === 'custom') {
      const custom = customRangeBounds(filters.from, filters.to);
      if (custom) return custom;
    }
    return visibleRange(anchor, view);
  }, [anchor, view, filters.preset, filters.from, filters.to]);

  const fromDate = range.start.toISOString();
  const toDate = range.end.toISOString();

  const { data, loading, refreshing, error, refetch, dataUpdatedAt } = useDispatches(
    1,
    CALENDAR_PAGE_SIZE,
    {
      fromDate,
      toDate,
      sortBy: 'pickupDateScheduled',
      sortOrder: 'asc',
      driverId: filters.driverId,
      vehicleId: filters.vehicleId,
      customerId: filters.customerId,
      status: filters.status,
      search: filters.q,
    },
    { refetchInterval: 30_000 },
  );

  const allEvents = useMemo(() => (data ?? []).map(toCalendarEvent), [data]);
  const conflictBatch = useDispatchConflictsBatch(
    allEvents.map((e) => e.dispatch.id),
    allEvents.length > 0,
  );
  const displayEvents = useMemo(
    () => applyKpiFocus(allEvents, filters.kpiFocus, conflictBatch.data),
    [allEvents, filters.kpiFocus, conflictBatch.data],
  );
  const byDay = useMemo(() => groupEventsByDay(displayEvents), [displayEvents]);
  const kpis = useMemo(
    () => computeCalendarKpis(allEvents, conflictBatch.data),
    [allEvents, conflictBatch.data],
  );

  useEffect(() => {
    if (!selected) return;
    const fresh = allEvents.find((e) => e.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [allEvents, selected?.id]);

  const replaceSearch = useCallback((next: CalendarSearch) => {
    void navigate({
      to: '/app/dispatches/calendar',
      search: next,
      replace: true,
    });
  }, [navigate]);

  const setCalendarNav = useCallback(
    (next: { view?: CalendarView; date?: Date }) => {
      replaceSearch(
        toSearchParams(next.view ?? view, next.date ?? anchor, {
          ...filters,
          preset: undefined,
          from: undefined,
          to: undefined,
        }),
      );
    },
    [anchor, filters, replaceSearch, view],
  );

  const setFilters = useCallback(
    (patch: Partial<CalendarFilterState> & { clear?: boolean }) => {
      if (patch.clear) {
        replaceSearch(toSearchParams(view, anchor, {}));
        return;
      }
      const next: CalendarFilterState = { ...filters, ...patch };
      if ('driverId' in patch && patch.driverId === undefined) delete next.driverId;
      if ('vehicleId' in patch && patch.vehicleId === undefined) delete next.vehicleId;
      if ('customerId' in patch && patch.customerId === undefined) delete next.customerId;
      if ('status' in patch && patch.status === undefined) delete next.status;
      if ('q' in patch && patch.q === undefined) delete next.q;
      if ('kpiFocus' in patch && patch.kpiFocus === undefined) delete next.kpiFocus;
      if ('preset' in patch && patch.preset === undefined) {
        delete next.preset;
        delete next.from;
        delete next.to;
      }
      if ('from' in patch && patch.from === undefined) delete next.from;
      if ('to' in patch && patch.to === undefined) delete next.to;

      let nextView = view;
      let nextAnchor = anchor;
      if (next.preset === 'custom' && (patch.from || patch.to)) {
        const bounds = customRangeBounds(next.from, next.to);
        if (bounds) {
          nextView = 'week';
          nextAnchor = bounds.start;
        }
      }
      replaceSearch(toSearchParams(nextView, nextAnchor, next));
    },
    [anchor, filters, replaceSearch, view],
  );

  const applyPreset = useCallback(
    (preset: CalendarDatePreset) => {
      const applied = applyDatePreset(preset);
      replaceSearch(
        toSearchParams(applied.view, applied.date, {
          ...filters,
          preset,
          from: applied.from,
          to: applied.to,
        }),
      );
    },
    [filters, replaceSearch],
  );

  const openDispatch = (id: string) => {
    setSelected(null);
    void navigate({ to: '/app/dispatches/$dispatchId', params: { dispatchId: id } });
  };

  const openOrder = (orderId: string) => {
    void navigate({ to: '/app/orders/$orderId', params: { orderId } });
  };

  const openCustomer = (customerId: string) => {
    void navigate({ to: '/app/customers/$customerId', params: { customerId } });
  };

  const queryClient = useQueryClient();
  const invalidateOperationalState = useInvalidateOperationalState();

  /// Reschedule (drag/resize) and status changes made from the calendar go
  /// straight through `dispatchesAPI` rather than the `use-dispatches` mutation
  /// hooks, so they must invalidate the same roots those hooks invalidate
  /// (orders, availability, board, dashboard, reports — see invalidate.ts) —
  /// not just the calendar's own query — or every other screen shows a stale
  /// window after a drag.
  const handleMutated = useCallback(async () => {
    await Promise.all([
      refetch(),
      invalidateOperationalState(),
      queryClient.invalidateQueries({ queryKey: dispatchConflictKeys.all }),
    ]);
  }, [invalidateOperationalState, queryClient, refetch]);

  const handleKpiClick = useCallback(
    (key: CalendarKpiKey) => {
      if (key === 'total') {
        setFilters({ clear: true });
        return;
      }
      if (key === 'drivers') {
        setOpenFilter('driver');
        return;
      }
      if (key === 'vehicles') {
        setOpenFilter('vehicle');
        return;
      }
      const focusMap: Record<string, CalendarKpiFocus> = {
        active: 'active',
        delayed: 'delayed',
        completed: 'completed',
        conflicts: 'conflicts',
      };
      const nextFocus = focusMap[key];
      if (!nextFocus) return;
      const isOn = filters.kpiFocus === nextFocus;
      setFilters({
        kpiFocus: isOn ? undefined : nextFocus,
        status: nextFocus === 'completed' ? (isOn ? undefined : 'DELIVERED') : undefined,
      });
    },
    [filters.kpiFocus, setFilters],
  );

  if (loading && !data) {
    return (
      <div
        className="-mx-4 -mt-6 -mb-6 flex h-[calc(100dvh-4rem)] flex-col gap-2 p-3 sm:-mx-8 sm:-mt-8 sm:-mb-8"
        data-testid="dispatch-calendar-loading"
      >
        <Skeleton className="h-8 w-full max-w-2xl" />
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="min-h-0 flex-1 rounded-lg" />
      </div>
    );
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={() => void refetch()} />;
  }

  const ageSec = dataUpdatedAt ? Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000)) : 0;

  return (
    <div
      className="-mx-4 -mt-6 -mb-6 flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden sm:-mx-8 sm:-mt-8 sm:-mb-8"
      data-testid="dispatch-calendar"
    >
      {/* Operations chrome — compact, full width */}
      <div className="shrink-0 space-y-2 border-b border-white/[0.08] bg-background/95 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Dispatch Calendar
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {format(anchor, 'EEEE, MMM d')} · {rangeLabel(anchor, view)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium',
                refreshing
                  ? 'border-border text-muted-foreground'
                  : 'border-success/40 bg-success/10 text-success',
              )}
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
              )}
              {refreshing ? 'Updating' : ageSec < 5 ? 'Live' : `Live · ${ageSec}s`}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 rounded-full border-white/[0.08] px-0"
              onClick={() => void refetch()}
              aria-label="Refresh calendar"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </Button>

            <DispatchViewToggle current="calendar" />

            {canWrite && (
              <Button
                size="sm"
                className="h-8 rounded-full bg-gradient-brand text-brand-foreground hover:opacity-90"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </Button>
            )}
          </div>
        </div>

        <DispatchCalendarKpis
          kpis={kpis}
          activeFocus={filters.kpiFocus}
          onKpiClick={handleKpiClick}
        />

        <DispatchCalendarFiltersBar
          filters={filters}
          onChange={setFilters}
          onApplyPreset={applyPreset}
          openFilter={openFilter}
          onOpenFilterHandled={() => setOpenFilter(null)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-full border border-white/[0.08] bg-muted/20 p-0.5"
            role="group"
            aria-label="Calendar view mode"
          >
            {([
              ['month', 'Month'],
              ['week', 'Week'],
              ['day', 'Day'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                data-testid={`calendar-view-${id}`}
                onClick={() => setCalendarNav({ view: id })}
                className={cn(
                  'h-7 rounded-full px-3 text-xs font-medium transition-all duration-150',
                  view === id
                    ? 'bg-gradient-brand text-brand-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 rounded-full border-white/[0.08] px-0"
              aria-label="Previous"
              data-testid="calendar-prev"
              onClick={() => setCalendarNav({ date: shiftAnchor(anchor, view, -1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-white/[0.08] px-3 text-xs"
              data-testid="calendar-today"
              onClick={() => applyPreset('today')}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 rounded-full border-white/[0.08] px-0"
              aria-label="Next"
              data-testid="calendar-next"
              onClick={() => setCalendarNav({ date: shiftAnchor(anchor, view, 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p
            className="ml-auto text-xs font-medium text-muted-foreground sm:text-sm"
            data-testid="calendar-range-label"
          >
            {rangeLabel(anchor, view)}
          </p>
        </div>
      </div>

      {/* Workspace: calendar + context rail */}
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-card">
          <DispatchCalendarGrid
            view={view}
            anchor={anchor}
            byDay={byDay}
            canWrite={canWrite}
            selectedId={selected?.id}
            onSelect={setSelected}
            onDayClick={(day) => setCalendarNav({ view: 'day', date: day })}
            onRescheduled={handleMutated}
            onQuickOpen={(id) => {
              const match = allEvents.find((e) => e.id === id);
              if (match) setSelected(match);
            }}
            conflictsByDispatchId={conflictBatch.data}
          />
        </div>

        <div
          className={cn(
            'shrink-0 border-t border-white/[0.08] xl:w-80 xl:border-t-0',
            selected ? 'flex h-64 xl:h-auto' : 'hidden xl:flex',
          )}
        >
          <DispatchCalendarContextPanel
            event={selected}
            canWrite={canWrite}
            onClose={() => setSelected(null)}
            onOpenDispatch={openDispatch}
            onOpenOrder={openOrder}
            onOpenCustomer={openCustomer}
            onMutated={handleMutated}
          />
        </div>
      </div>

      <DispatchesCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(d) => openDispatch(d.id)}
      />
    </div>
  );
}
