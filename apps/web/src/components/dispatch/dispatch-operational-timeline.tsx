'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { auditLogsAPI, type AuditLogEntry } from '@/lib/api/audit-logs';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { Invoice } from '@/lib/api/invoices';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  buildDispatchOperationalTimeline,
  filterTimelineEvents,
  parseTimelineFilter,
  TIMELINE_FILTER_OPTIONS,
  type OperationalTimelineEvent,
  type TimelineEventKind,
  type TimelineFilterCategory,
} from './dispatch-operational-timeline.builder';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bot,
  CircleDot,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Receipt,
  RotateCcw,
  Search,
  Truck,
  User,
  Wallet,
} from 'lucide-react';

const PAGE_SIZE = 25;
const LIVE_REFETCH_MS = 30_000;

const KIND_STYLES: Record<
  TimelineEventKind,
  { icon: typeof Package; ring: string; iconClass: string }
> = {
  create: {
    icon: CircleDot,
    ring: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600',
  },
  edit: {
    icon: Pencil,
    ring: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    iconClass: 'text-sky-600',
  },
  assignment: {
    icon: User,
    ring: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    iconClass: 'text-blue-600',
  },
  status: {
    icon: Package,
    ring: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
    iconClass: 'text-orange-600',
  },
  document: {
    icon: FileText,
    ring: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
    iconClass: 'text-violet-600',
  },
  invoice: {
    icon: Receipt,
    ring: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600',
  },
  payment: {
    icon: Wallet,
    ring: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600',
  },
  conflict: {
    icon: AlertTriangle,
    ring: 'bg-red-500/15 text-red-700 dark:text-red-400',
    iconClass: 'text-red-600',
  },
  gps: {
    icon: MapPin,
    ring: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
    iconClass: 'text-cyan-600',
  },
  note: {
    icon: MessageSquare,
    ring: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    iconClass: 'text-slate-600',
  },
  undo: {
    icon: RotateCcw,
    ring: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    iconClass: 'text-amber-600',
  },
  archive: {
    icon: Archive,
    ring: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
    iconClass: 'text-zinc-600',
  },
  restore: {
    icon: ArchiveRestore,
    ring: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
    iconClass: 'text-zinc-600',
  },
  schedule: {
    icon: Truck,
    ring: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    iconClass: 'text-blue-600',
  },
  cancel: {
    icon: AlertTriangle,
    ring: 'bg-red-500/15 text-red-700 dark:text-red-400',
    iconClass: 'text-red-600',
  },
};

type EventVisualStyle = (typeof KIND_STYLES)[TimelineEventKind];

/**
 * Presentation-only icon resolver.
 * Location / GPS milestones → MapPin + cyan.
 * Lifecycle status transitions → Package + orange (even if kind is `gps`).
 */
function resolveEventStyle(event: OperationalTimelineEvent): EventVisualStyle {
  const title = event.title.toLowerCase();

  // Lifecycle status titles always keep the Package treatment.
  const isLifecycleStatus =
    title === 'draft' ||
    title === 'assigned' ||
    title === 'in transit' ||
    title === 'delivered' ||
    title === 'cancelled' ||
    title === 'status changed' ||
    title === 'status undone' ||
    title.startsWith('cargo loaded');

  if (isLifecycleStatus) {
    return KIND_STYLES.status;
  }

  const isLocationEvent =
    event.kind === 'gps' ||
    title.includes('en route') ||
    title.includes('arrived at pickup') ||
    title.includes('arrived at destination') ||
    title.includes('gps') ||
    title.includes('location') ||
    /\barrival\b/.test(title);

  if (isLocationEvent) {
    return KIND_STYLES.gps;
  }

  return KIND_STYLES[event.kind] ?? KIND_STYLES.status;
}

export interface DispatchOperationalTimelineProps {
  dispatch: ApiDispatch;
  invoice?: Invoice | null;
  resolveDriverName?: (id: string | null | undefined) => string;
  resolveVehiclePlate?: (id: string | null | undefined) => string;
  enabled?: boolean;
  className?: string;
}

async function fetchAllAuditPages(
  params: Parameters<typeof auditLogsAPI.list>[0],
  maxPages = 4,
): Promise<AuditLogEntry[]> {
  const items: AuditLogEntry[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const result = await auditLogsAPI.list({ ...params, page, limit: PAGE_SIZE });
    items.push(...result.items);
    totalPages = result.meta.totalPages;
    if (result.items.length === 0) break;
    page += 1;
  }

  return items;
}

function TimelineDiff({
  diff,
  diffKey,
}: {
  diff: { label: string; from: string; to: string };
  diffKey: string;
}) {
  return (
    <div
      key={diffKey}
      className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
    >
      <p className="mb-1 font-medium text-muted-foreground">{diff.label}</p>
      <div className="flex flex-col gap-0.5 font-medium text-foreground">
        <span>{diff.from}</span>
        <span className="text-muted-foreground" aria-hidden>
          ↓
        </span>
        <span>{diff.to}</span>
      </div>
    </div>
  );
}

function TimelineEventRow({
  event,
  isLast,
}: {
  event: OperationalTimelineEvent;
  isLast: boolean;
}) {
  const style = resolveEventStyle(event);
  const Icon = style.icon;
  const relative = formatRelativeTime(event.at);

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!isLast ? (
        <span
          className="absolute left-[13px] top-7 h-[calc(100%-0.5rem)] w-px bg-border/80"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-border/40',
          style.ring,
        )}
      >
        <Icon className={cn('h-3.5 w-3.5', style.iconClass)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">{event.title}</p>
          <time
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            dateTime={event.at}
            title={formatDateTime(event.at)}
          >
            {relative === 'just now' ? 'Just now' : relative}
            <span className="mx-1 text-border">·</span>
            {new Date(event.at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
        {event.subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{event.subtitle}</p>
        ) : null}
        {event.actor ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="h-3 w-3" aria-hidden />
            {event.actor}
          </p>
        ) : null}
        {event.detail ? (
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {event.detail}
          </p>
        ) : null}
        {event.fieldLabels && event.fieldLabels.length > 0 && !event.diffs?.length ? (
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {event.fieldLabels.map((label, i) => (
              <li key={`${event.id}-fl-${i}-${label}`}>{label}</li>
            ))}
          </ul>
        ) : null}
        {event.diffs?.map((diff, i) => (
          <TimelineDiff
            key={`${event.id}-diff-${i}-${diff.label}`}
            diffKey={`${event.id}-diff-${i}-${diff.label}`}
            diff={diff}
          />
        ))}
      </div>
    </li>
  );
}

export function DispatchOperationalTimeline({
  dispatch,
  invoice,
  resolveDriverName,
  resolveVehiclePlate,
  enabled = true,
  className,
}: DispatchOperationalTimelineProps) {
  const navigate = useNavigate({ from: '/app/dispatches/$dispatchId' });
  const search = useSearch({ from: '/app/dispatches/$dispatchId' });

  const filter = parseTimelineFilter(search.tlFilter);
  const searchQuery = typeof search.tlQ === 'string' ? search.tlQ : '';

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [extraPages, setExtraPages] = useState(0);
  const [livePulse, setLivePulse] = useState(false);
  const prevCountRef = useRef(0);
  const searchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const setFilter = useCallback(
    (next: TimelineFilterCategory) => {
      void navigate({
        search: (prev) => {
          const out = { ...prev };
          if (next === 'all') delete out.tlFilter;
          else out.tlFilter = next;
          return out;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const commitSearch = useCallback(
    (value: string) => {
      void navigate({
        search: (prev) => {
          const out = { ...prev };
          const trimmed = value.trim();
          if (!trimmed) delete out.tlQ;
          else out.tlQ = trimmed;
          return out;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => commitSearch(value), 250);
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const dispatchAuditQuery = useQuery({
    queryKey: ['audit-logs', 'dispatch-timeline', dispatch.id, extraPages],
    queryFn: () =>
      fetchAllAuditPages(
        {
          entityType: 'Dispatch',
          entityId: dispatch.id,
          sortOrder: 'desc',
          limit: PAGE_SIZE,
        },
        1 + extraPages,
      ),
    enabled,
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
  });

  const orderAuditQuery = useQuery({
    queryKey: ['audit-logs', 'dispatch-timeline-order', dispatch.orderId],
    queryFn: () =>
      auditLogsAPI.list({
        entityType: 'Order',
        entityId: dispatch.orderId,
        sortOrder: 'desc',
        limit: 100,
      }),
    enabled: enabled && Boolean(dispatch.orderId),
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
    select: (data) => data.items,
  });

  const invoiceAuditQuery = useQuery({
    queryKey: ['audit-logs', 'dispatch-timeline-invoice', invoice?.id],
    queryFn: () =>
      auditLogsAPI.list({
        entityType: 'Invoice',
        entityId: invoice!.id,
        sortOrder: 'desc',
        limit: 50,
      }),
    enabled: enabled && Boolean(invoice?.id),
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
    select: (data) => data.items,
  });

  const loading =
    dispatchAuditQuery.isPending ||
    (Boolean(dispatch.orderId) && orderAuditQuery.isPending) ||
    (Boolean(invoice?.id) && invoiceAuditQuery.isPending);

  const events = useMemo(
    () =>
      buildDispatchOperationalTimeline({
        dispatch,
        dispatchAuditLogs: dispatchAuditQuery.data ?? [],
        orderAuditLogs: orderAuditQuery.data ?? [],
        invoiceAuditLogs: invoiceAuditQuery.data ?? [],
        invoice,
        resolveDriverName,
        resolveVehiclePlate,
      }),
    [
      dispatch,
      dispatchAuditQuery.data,
      orderAuditQuery.data,
      invoiceAuditQuery.data,
      invoice,
      resolveDriverName,
      resolveVehiclePlate,
    ],
  );

  const filtered = useMemo(
    () => filterTimelineEvents(events, filter, searchQuery),
    [events, filter, searchQuery],
  );

  const canLoadMore = useMemo(() => {
    const loaded = dispatchAuditQuery.data?.length ?? 0;
    return loaded >= PAGE_SIZE * (1 + extraPages);
  }, [dispatchAuditQuery.data, extraPages]);

  const loadOlder = useCallback(() => {
    setExtraPages((p) => p + 1);
  }, []);

  useEffect(() => {
    if (events.length > prevCountRef.current && prevCountRef.current > 0) {
      setLivePulse(true);
      const t = window.setTimeout(() => setLivePulse(false), 2000);
      prevCountRef.current = events.length;
      return () => window.clearTimeout(t);
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Timeline filters">
          {TIMELINE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={filter === opt.id}
              onClick={() => setFilter(opt.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === opt.id
                  ? 'bg-foreground text-background'
                  : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search timeline…"
            className="h-8 pl-8 text-xs"
            aria-label="Search timeline"
          />
        </div>
      </div>

      {livePulse ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live — timeline updated
        </p>
      ) : null}

      {loading && events.length === 0 ? (
        <div className="space-y-4 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {searchQuery || filter !== 'all'
            ? 'No events match your filters.'
            : 'No operational history recorded yet.'}
        </p>
      ) : (
        <ol className="relative" aria-live="polite" aria-relevant="additions">
          {filtered.map((event, index) => (
            <TimelineEventRow
              key={`${event.id}-${index}`}
              event={event}
              isLast={index === filtered.length - 1 && !canLoadMore}
            />
          ))}
        </ol>
      )}

      {canLoadMore ? (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={loadOlder}
            disabled={dispatchAuditQuery.isFetching}
          >
            {dispatchAuditQuery.isFetching ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              'Load older events'
            )}
          </Button>
        </div>
      ) : null}

      <p className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
        <Bot className="h-3 w-3" aria-hidden />
        Structured for AI summaries — operational history, not raw audit dump.
      </p>
    </div>
  );
}
