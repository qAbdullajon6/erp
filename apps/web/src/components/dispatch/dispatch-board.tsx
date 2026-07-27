'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useNavigate } from '@tanstack/react-router';
import {
  List,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  AlertTriangle,
  Timer,
  Truck,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';
import { useCurrentUser } from '@/lib/api/auth';
import type { MembershipRole } from '@/lib/api/organizations';
import { describeError } from '@/lib/api/describe-error';
import { dispatchesAPI } from '@/lib/api/dispatches';
import { useInvalidateOperationalState } from '@/lib/api/invalidate';
import { DISPATCH_WRITE_ROLES } from '@/lib/role-access';
import { useDispatches, useDispatchBoardSummary } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/shared/list-states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DispatchesCreateSheet } from '@/components/dispatch/dispatches-create-sheet';
import { BOARD_COLUMNS, canDropInto, groupByStatus, isCancelDrop } from './board-columns';
import { DispatchCard } from './dispatch-card';
import { DispatchReassignDialog } from './dispatch-reassign-dialog';
import { DispatchSearch } from './dispatch-search';
import { WorkQueue, buildWorkQueue, type QueueItem } from './work-queue';
import { SelectedWorkPanel, type Selection as PanelSelection } from './selected-work-panel';
import { OperationsRail } from './operations-rail';
import { computeBoardOpsCounts, type BoardOpsCounts } from './dispatch-ops';
import { cn } from '@/lib/utils';

/// Dispatch Board — logistics operations workspace.
/// Presentation only: columns from status, moves from allowedTransitions,
/// availability from GET /dispatch/availability. Drag is visually optimistic only.

const BOARD_PAGE_SIZE = 200;
const RESOLVE_HOLD_MS = 550;
/// Same cadence as Overview Command Center — shift stays live while this tab is open.
const LIVE_REFRESH_MS = 30_000;

type Selection = { kind: 'dispatch'; id: string } | { kind: 'order'; id: string };

type BoardFilter = 'all' | 'overdue' | 'waiting' | 'in_transit' | 'delivered_today';

function toSelection(item: QueueItem): Selection {
  return item.target === 'order' ? { kind: 'order', id: item.id } : { kind: 'dispatch', id: item.id };
}

function secondsSince(ts: number): number {
  if (!ts) return 0;
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}

export function DispatchBoard() {
  const navigate = useNavigate();
  const invalidate = useInvalidateOperationalState();
  const { data: currentUser } = useCurrentUser();
  const canWrite = Boolean(
    currentUser && DISPATCH_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  const { data, meta, loading, refreshing, error, refetch, dataUpdatedAt } = useDispatches(
    1,
    BOARD_PAGE_SIZE,
    undefined,
    { refetchInterval: LIVE_REFRESH_MS },
  );
  const {
    data: boardSummary,
    error: boardSummaryError,
    refetch: refetchBoardSummary,
    isFetching: boardSummaryFetching,
    dataUpdatedAt: boardSummaryUpdatedAt,
  } = useDispatchBoardSummary({ refetchInterval: LIVE_REFRESH_MS });
  const boardTruncated = (meta?.total ?? 0) > BOARD_PAGE_SIZE;

  const [dragging, setDragging] = useState<ApiDispatch | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<ApiDispatch | null>(null);
  const [cancelling, setCancelling] = useState<ApiDispatch | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [boardFilter, setBoardFilter] = useState<BoardFilter>('all');
  const [, setTick] = useState(0);

  /// Keep the "Live · Ns" label honest between polls without a new network call.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const workspaceRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const allDispatches = data ?? [];
  const counts = useMemo(
    () => computeBoardOpsCounts(allDispatches, boardSummary),
    [allDispatches, boardSummary],
  );

  const filteredForBoard = useMemo(() => {
    switch (boardFilter) {
      case 'overdue':
        return allDispatches.filter(
          (d) =>
            d.status !== 'DELIVERED' &&
            d.status !== 'CANCELLED' &&
            new Date(d.deliveryDateScheduled).getTime() < Date.now(),
        );
      case 'waiting':
        return allDispatches.filter((d) =>
          ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP'].includes(d.status),
        );
      case 'in_transit':
        return allDispatches.filter((d) => d.status === 'IN_TRANSIT');
      case 'delivered_today':
        return allDispatches.filter((d) => {
          if (d.status !== 'DELIVERED') return false;
          const when = d.deliveryDateActual || d.updatedAt;
          return new Date(when).toDateString() === new Date().toDateString();
        });
      default:
        return allDispatches;
    }
  }, [allDispatches, boardFilter]);

  const columns = useMemo(() => groupByStatus(filteredForBoard), [filteredForBoard]);
  const queueItems = useMemo(
    () => buildWorkQueue(allDispatches, boardSummary?.unassignedOrders ?? [], boardSummary),
    [allDispatches, boardSummary],
  );

  const queueItemsRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  /// Snapshots for fade-out rows — updated in an effect, never during render.
  const snapshotRef = useRef<Map<string, QueueItem>>(new Map());
  useEffect(() => {
    for (const item of queueItems) {
      snapshotRef.current.set(item.id, item);
    }
  }, [queueItems]);

  const displayOrderRef = useRef<string[]>([]);
  const displayItems = useMemo(() => {
    const itemsById = new Map(queueItems.map((i) => [i.id, i] as const));
    const liveIds = queueItems.map((i) => i.id);
    const keep = displayOrderRef.current.filter((id) => itemsById.has(id) || resolvingIds.has(id));
    const freshIds = liveIds.filter((id) => !keep.includes(id));
    const orderedIds = [...keep, ...freshIds];
    return orderedIds
      .map((id) => itemsById.get(id) ?? snapshotRef.current.get(id))
      .filter((i): i is QueueItem => Boolean(i));
  }, [queueItems, resolvingIds]);

  useEffect(() => {
    displayOrderRef.current = displayItems.map((i) => i.id);
  }, [displayItems]);

  const selectedDispatch = useMemo(
    () =>
      selection?.kind === 'dispatch'
        ? allDispatches.find((d) => d.id === selection.id) ?? null
        : null,
    [allDispatches, selection],
  );
  const selectedOrder = useMemo(
    () =>
      selection?.kind === 'order'
        ? (boardSummary?.unassignedOrders ?? []).find((o) => o.id === selection.id) ?? null
        : null,
    [boardSummary, selection],
  );
  const panelSelection: PanelSelection | null = selectedDispatch
    ? { kind: 'dispatch', dispatch: selectedDispatch }
    : selectedOrder
      ? { kind: 'order', order: selectedOrder }
      : null;

  const focusQueueItem = useCallback((id: string) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-queue-item="${CSS.escape(id)}"]`)?.focus();
    });
  }, []);

  const markResolving = useCallback(
    (id: string) => {
      setResolvingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        let nextId: string | null = null;
        setSelection((sel) => {
          if (!sel || sel.id !== id) return sel;
          const remaining = queueItemsRef.current.filter((i) => i.id !== id);
          nextId = remaining[0]?.id ?? null;
          return remaining[0] ? toSelection(remaining[0]) : null;
        });
        if (nextId) focusQueueItem(nextId);
      }, RESOLVE_HOLD_MS);
    },
    [focusQueueItem],
  );

  const scrollWorkspaceIntoView = useCallback(() => {
    workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const boardRef = useRef<HTMLDivElement>(null);
  const wasQueueEmptyRef = useRef(false);

  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (queueItems.length === 0) return;
    hasAutoSelectedRef.current = true;
    setSelection(toSelection(queueItems[0]));
  }, [queueItems]);

  useEffect(() => {
    const isEmptyNow = queueItems.length === 0;
    if (isEmptyNow && !wasQueueEmptyRef.current) {
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    wasQueueEmptyRef.current = isEmptyNow;
  }, [queueItems]);

  const handleDragStart = (event: DragStartEvent) => {
    setDragging((event.active.data.current as { dispatch: ApiDispatch } | undefined)?.dispatch ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const dispatch = (event.active.data.current as { dispatch: ApiDispatch } | undefined)?.dispatch;
    setDragging(null);

    const target = event.over?.id as DispatchStatus | undefined;
    if (!dispatch || !target || target === dispatch.status) return;

    if (!canWrite) {
      toast.error('You do not have permission to move dispatches');
      return;
    }

    if (!canDropInto(dispatch, target)) {
      toast.error(`${dispatch.dispatchNumber} cannot move to ${target.replace(/_/g, ' ').toLowerCase()}`);
      return;
    }

    setPendingId(dispatch.id);
    try {
      if (isCancelDrop(target)) {
        await dispatchesAPI.cancel(dispatch.id);
      } else {
        await dispatchesAPI.updateStatus(dispatch.id, { status: target });
      }
      await invalidate();
      const label = target.replace(/_/g, ' ').toLowerCase();
      toast.success(`${dispatch.dispatchNumber} moved to ${label}`);
      setAnnouncement(`${dispatch.dispatchNumber} moved to ${label}`);
      markResolving(dispatch.id);
    } catch (err) {
      const message = describeError(err, 'Move rejected');
      toast.error(message);
      setAnnouncement(`Move rejected. ${message}`);
    } finally {
      setPendingId(null);
    }
  };

  const handleOpenDispatch = useCallback(
    (id: string) => {
      setSelection({ kind: 'dispatch', id });
      scrollWorkspaceIntoView();
    },
    [scrollWorkspaceIntoView],
  );
  const handleSearchSelect = useCallback(
    (dispatch: ApiDispatch) => {
      setSelection({ kind: 'dispatch', id: dispatch.id });
      setBoardFilter('all');
      scrollWorkspaceIntoView();
    },
    [scrollWorkspaceIntoView],
  );
  const handleViewFullDetail = useCallback(
    (id: string) => void navigate({ to: '/app/dispatches/$dispatchId', params: { dispatchId: id } }),
    [navigate],
  );
  const handleViewOrder = useCallback(
    (orderId: string) => void navigate({ to: '/app/orders/$orderId', params: { orderId } }),
    [navigate],
  );

  const callDriver = useCallback((dispatch: ApiDispatch) => {
    if (!dispatch.driver?.phone) {
      toast.error('No driver phone on file');
      return;
    }
    window.location.href = `tel:${dispatch.driver.phone}`;
  }, []);

  const confirmCancel = async () => {
    if (!cancelling) return;
    try {
      await dispatchesAPI.cancel(cancelling.id);
      await invalidate();
      toast.success(`${cancelling.dispatchNumber} cancelled`);
      setAnnouncement(`${cancelling.dispatchNumber} cancelled`);
      markResolving(cancelling.id);
    } catch (err) {
      toast.error(describeError(err, 'Failed to cancel dispatch'));
    } finally {
      setCancelling(null);
    }
  };

  const handlePrimaryAction = useCallback(
    (item: QueueItem) => {
      if (item.target === 'order') {
        setSelection({ kind: 'order', id: item.id });
        return;
      }
      setSelection({ kind: 'dispatch', id: item.id });
      if (item.primaryLabel === 'Call') {
        if (item.dispatch.driver?.phone) window.location.href = `tel:${item.dispatch.driver.phone}`;
      } else if (item.primaryLabel === 'Reassign') {
        if (!canWrite) return;
        setReassigning(item.dispatch);
      }
    },
    [canWrite],
  );

  const selectRelative = useCallback(
    (delta: number) => {
      const items = queueItemsRef.current;
      if (items.length === 0) return;
      let nextId: string | null = null;
      setSelection((sel) => {
        const idx = sel ? items.findIndex((i) => i.id === sel.id) : -1;
        const nextIdx = idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), items.length - 1);
        nextId = items[nextIdx].id;
        return toSelection(items[nextIdx]);
      });
      if (nextId) focusQueueItem(nextId);
    },
    [focusQueueItem],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (reassigning || cancelling || createOpen) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !inField) {
        e.preventDefault();
        document.getElementById('dispatch-search-input')?.focus();
        return;
      }
      if (e.key === 'Escape' && !inField) {
        if (selection) {
          e.preventDefault();
          setSelection(null);
          setAnnouncement('Selection cleared');
        }
        return;
      }
      if (inField) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        selectRelative(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectRelative(-1);
      } else if (e.key === 'Enter' || e.key === 'e') {
        const current = selection && queueItemsRef.current.find((i) => i.id === selection.id);
        if (current) handlePrimaryAction(current);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reassigning, cancelling, createOpen, selection, selectRelative, handlePrimaryAction]);

  const handleRefresh = () => {
    void refetch();
    void refetchBoardSummary();
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading dispatch board">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-[min(22rem,50vh)] w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {BOARD_COLUMNS.map((column) => (
            <Skeleton key={column.status} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const isEmpty = allDispatches.length === 0;
  const queueEmpty = queueItems.length === 0;
  const filterEmpty = boardFilter !== 'all' && filteredForBoard.length === 0;
  const isRefreshing = refreshing || boardSummaryFetching;
  const lastSyncAt = Math.max(dataUpdatedAt ?? 0, boardSummaryUpdatedAt ?? 0);
  const ageSec = secondsSince(lastSyncAt);

  const filterChips: { key: BoardFilter; label: string; count: number; urgent?: boolean }[] = [
    { key: 'all', label: 'All', count: allDispatches.length },
    { key: 'overdue', label: 'Overdue', count: counts.overdue, urgent: counts.overdue > 0 },
    { key: 'waiting', label: 'Waiting', count: counts.waitingPickup },
    { key: 'in_transit', label: 'In Transit', count: counts.inTransit },
    { key: 'delivered_today', label: 'Delivered Today', count: counts.deliveredToday },
  ];

  /// Unique ops chips only — do not restate Overdue/Waiting already in filters.
  const opsChips = [
    counts.needsReassignment > 0 && {
      key: 'reassign',
      label: `${counts.needsReassignment} need reassignment`,
      tone: 'warning' as const,
      icon: Timer,
    },
    counts.driversAvailable > 0 && {
      key: 'drivers',
      label: `${counts.driversAvailable} drivers free`,
      tone: 'success' as const,
      icon: Truck,
    },
    counts.idleVehicles > 0 && {
      key: 'vehicles',
      label: `${counts.idleVehicles} vehicles free`,
      tone: 'success' as const,
      icon: Truck,
    },
    counts.pickupToday > 0 &&
      boardFilter !== 'waiting' && {
        key: 'pickup',
        label: `${counts.pickupToday} pickup today`,
        tone: 'warning' as const,
        icon: Package,
        onClick: () => setBoardFilter('waiting'),
      },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    tone: 'warning' | 'success';
    icon: typeof AlertTriangle;
    onClick?: () => void;
  }>;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      {/* Sticky chrome — survives page scroll on 1366×768 */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 border-b border-border/80 bg-background/95 px-1 pb-2 pt-0.5 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Dispatch Board
            </h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {meta?.total ?? allDispatches.length} dispatches
              {counts.overdue > 0 ? (
                <span className="text-destructive"> · {counts.overdue} overdue</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {!isEmpty && <DispatchSearch dispatches={allDispatches} onSelect={handleSearchSelect} />}

            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium',
                isRefreshing
                  ? 'border-border text-muted-foreground'
                  : 'border-success/40 bg-success/10 text-success',
              )}
              title="Refreshes every 30s while this tab is open"
            >
              {isRefreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
              )}
              {isRefreshing ? 'Updating' : ageSec < 5 ? 'Live' : `Live · ${ageSec}s`}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 px-0"
              onClick={handleRefresh}
              aria-label="Refresh board now"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            </Button>

            <div
              className="inline-flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Dispatch view"
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => void navigate({ to: '/app/dispatches' })}
              >
                <List className="h-3.5 w-3.5" />
                List
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                aria-current="page"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </Button>
            </div>

            {canWrite && (
              <Button
                size="sm"
                className="h-8 bg-gradient-brand text-brand-foreground hover:opacity-90"
                onClick={() => setCreateOpen(true)}
                data-testid="board-create-dispatch"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </Button>
            )}
          </div>
        </div>

        {/* Single strip: filters + unique ops (no duplicate overdue/waiting chips) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Board filters">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={boardFilter === chip.key}
                onClick={() => setBoardFilter(chip.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  boardFilter === chip.key
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-border text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground',
                  chip.urgent && boardFilter !== chip.key && 'border-destructive/30 text-destructive',
                )}
              >
                {chip.urgent && boardFilter !== chip.key ? (
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {chip.label}
                <span className="tabular-nums opacity-80">{chip.count}</span>
              </button>
            ))}
          </div>
          {opsChips.length > 0 && (
            <>
              <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
              {opsChips.map((chip) => {
                const Icon = chip.icon;
                const Comp = chip.onClick ? 'button' : 'span';
                return (
                  <Comp
                    key={chip.key}
                    type={chip.onClick ? 'button' : undefined}
                    onClick={chip.onClick}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-xs font-medium',
                      chip.tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success',
                      chip.onClick && 'hover:underline',
                    )}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {chip.label}
                  </Comp>
                );
              })}
            </>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {boardSummaryError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <p className="text-destructive">{boardSummaryError}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Unassigned orders and free fleet may be incomplete.
          </p>
          <Button variant="outline" size="sm" className="mt-2 h-7" onClick={() => void refetchBoardSummary()}>
            Retry summary
          </Button>
        </div>
      ) : null}

      {boardTruncated ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
          Showing newest {BOARD_PAGE_SIZE} of {meta?.total ?? 0}. Use List or search for older dispatches.
        </div>
      ) : null}

      {/* Workspace — Queue 18–20% | Workspace 60–64% | Rail 18–20% */}
      <div
        ref={workspaceRef}
        className="min-h-0 overflow-hidden rounded-xl border border-border/70 bg-surface"
      >
        {queueEmpty && !panelSelection ? (
          <div className="px-5 py-4 text-sm text-foreground">
            <span className="font-medium text-success">All clear</span>
            <span className="text-muted-foreground"> — nothing needs attention. Use the board below.</span>
          </div>
        ) : (
          <div className="grid h-[min(34rem,calc(100vh-12rem))] grid-cols-1 divide-y divide-border/50 lg:grid-cols-[18%_minmax(0,1fr)_18%] lg:divide-x lg:divide-y-0">
            <div className="min-h-0 overflow-hidden">
              {queueEmpty ? (
                <div className="p-5 text-sm text-muted-foreground">All clear — nothing in queue.</div>
              ) : (
                <WorkQueue
                  items={displayItems}
                  resolvedIds={resolvingIds}
                  selectedId={selection?.id ?? null}
                  canWrite={canWrite}
                  onSelect={(item) => setSelection(toSelection(item))}
                  onPrimaryAction={handlePrimaryAction}
                  onViewFullDetail={handleViewFullDetail}
                  onViewOrder={handleViewOrder}
                  onReassign={setReassigning}
                  onCall={callDriver}
                />
              )}
            </div>
            <div className="min-h-0 overflow-hidden bg-background/40">
              <SelectedWorkPanel
                selection={panelSelection}
                onReassign={setReassigning}
                onCancel={setCancelling}
                onViewOrder={handleViewOrder}
                onViewFullDetail={handleViewFullDetail}
                onAssigned={(orderId) => markResolving(orderId)}
                onStatusChanged={(dispatchId) => markResolving(dispatchId)}
              />
            </div>
            <div className="hidden min-h-0 overflow-hidden lg:block">
              <OperationsRail
                selectedDispatch={selectedDispatch}
                board={boardSummary}
                counts={counts}
                onCallDriver={(phone) => {
                  window.location.href = `tel:${phone}`;
                }}
              />
            </div>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState
          title="No dispatches yet"
          description="Assign a driver and vehicle to an order — it will land here."
          action={
            canWrite ? (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                New Dispatch
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void navigate({ to: '/app/orders', search: {} })}>
                Go to orders
              </Button>
            )
          }
        />
      ) : null}

      {filterEmpty ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">
            No dispatches match{' '}
            <span className="font-medium text-foreground">
              {filterChips.find((c) => c.key === boardFilter)?.label}
            </span>
            .
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setBoardFilter('all')}>
            Clear filter
          </Button>
        </div>
      ) : null}

      {/* Board — wider columns, horizontal scroll (not 7 squeezed into one row) */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          ref={boardRef}
          className={cn(
            'w-0 min-w-full flex gap-4 overflow-x-auto pb-3 scrollbar-thin',
            isEmpty && 'hidden',
          )}
        >
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.status}
              status={column.status}
              title={column.shortTitle}
              fullTitle={column.title}
              terminal={column.terminal}
              dispatches={columns[column.status]}
              pendingId={pendingId}
              draggingDispatch={dragging}
              selectedId={selection?.kind === 'dispatch' ? selection.id : null}
              canWrite={canWrite}
              onOpen={handleOpenDispatch}
              onReassign={setReassigning}
              onCancel={setCancelling}
              onViewOrder={handleViewOrder}
              onCall={callDriver}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="w-56 rounded-md border-2 border-brand bg-card p-3 shadow-lg">
              <p className="font-mono text-sm font-semibold">{dragging.dispatchNumber}</p>
              <p className="truncate text-xs text-muted-foreground">
                {dragging.order?.pickupCity} → {dragging.order?.deliveryCity}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-[10px] text-muted-foreground">
        Shortcuts: <kbd className="rounded border border-border px-1">/</kbd> search ·{' '}
        <kbd className="rounded border border-border px-1">j</kbd>/
        <kbd className="rounded border border-border px-1">k</kbd> queue ·{' '}
        <kbd className="rounded border border-border px-1">Enter</kbd> action ·{' '}
        <kbd className="rounded border border-border px-1">Esc</kbd> clear
      </p>

      <DispatchReassignDialog
        dispatch={reassigning}
        onClose={() => setReassigning(null)}
        onSuccess={(id) => markResolving(id)}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => (open ? null : setCancelling(null))}
        title={`Cancel ${cancelling?.dispatchNumber ?? ''}?`}
        description="The driver and vehicle are released and the order returns to the unassigned pool."
        confirmLabel="Cancel dispatch"
        onConfirm={() => void confirmCancel()}
        destructive
      />

      {canWrite && (
        <DispatchesCreateSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(d) => {
            setBoardFilter('all');
            setSelection({ kind: 'dispatch', id: d.id });
            scrollWorkspaceIntoView();
          }}
        />
      )}
    </div>
  );
}

interface BoardColumnProps {
  status: DispatchStatus;
  title: string;
  fullTitle: string;
  terminal: boolean;
  dispatches: ApiDispatch[];
  pendingId: string | null;
  draggingDispatch: ApiDispatch | null;
  selectedId: string | null;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
  onCall: (dispatch: ApiDispatch) => void;
}

function BoardColumn({
  status,
  title,
  fullTitle,
  terminal,
  dispatches,
  pendingId,
  draggingDispatch,
  selectedId,
  canWrite,
  onOpen,
  onReassign,
  onCancel,
  onViewOrder,
  onCall,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canWrite });
  const isLegalTarget = canWrite && draggingDispatch ? canDropInto(draggingDispatch, status) : true;
  const showDropHint = Boolean(draggingDispatch && isLegalTarget);

  return (
    <section
      ref={setNodeRef}
      aria-label={`${fullTitle}, ${dispatches.length} ${dispatches.length === 1 ? 'dispatch' : 'dispatches'}`}
      title={fullTitle}
      className={cn(
        'flex w-[17rem] shrink-0 flex-col rounded-xl border border-border/70 bg-card/60 p-3 transition-colors duration-150 sm:w-[18rem]',
        terminal ? 'bg-muted/20' : 'bg-card/60',
        isOver && isLegalTarget && 'border-brand bg-brand/5 ring-2 ring-brand/35',
        draggingDispatch && !isLegalTarget && 'opacity-35',
        showDropHint && !isOver && 'border-dashed border-brand/45',
        !draggingDispatch && 'border-border/70',
      )}
      data-testid={`board-column-${status}`}
    >
      <header className="mb-2.5 flex items-center justify-between gap-1 px-0.5">
        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
            terminal ? 'bg-muted text-muted-foreground' : 'bg-brand/10 text-brand',
          )}
          aria-hidden="true"
        >
          {dispatches.length}
        </span>
      </header>

      <div className="flex max-h-[min(28rem,calc(100vh-20rem))] flex-col gap-2.5 overflow-y-auto scrollbar-thin">
        {dispatches.length === 0 ? (
          <p
            className={cn(
              'rounded-lg border border-dashed py-10 text-center text-xs',
              showDropHint
                ? 'border-brand/50 bg-brand/5 font-medium text-brand'
                : 'border-border/60 text-muted-foreground',
            )}
          >
            {showDropHint ? 'Drop here' : '—'}
          </p>
        ) : (
          <>
            {showDropHint && isOver && (
              <p className="rounded-md border border-brand/40 bg-brand/5 py-2 text-center text-xs font-medium text-brand">
                Drop to move
              </p>
            )}
            {dispatches.map((dispatch) => (
              <DispatchCard
                key={dispatch.id}
                dispatch={dispatch}
                pending={pendingId === dispatch.id}
                selected={selectedId === dispatch.id}
                canWrite={canWrite}
                onOpen={onOpen}
                onReassign={onReassign}
                onCancel={onCancel}
                onViewOrder={onViewOrder}
                onCall={onCall}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
