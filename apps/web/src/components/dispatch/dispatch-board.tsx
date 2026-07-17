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
import { List, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { dispatchesAPI } from '@/lib/api/dispatches';
import { useInvalidateOperationalState } from '@/lib/api/invalidate';
import { useDispatches, useDispatchBoardSummary } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/list-states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BOARD_COLUMNS, canDropInto, groupByStatus, isCancelDrop } from './board-columns';
import { DispatchCard } from './dispatch-card';
import { DispatchReassignDialog } from './dispatch-reassign-dialog';
import { DispatchSearch } from './dispatch-search';
import { WorkQueue, buildWorkQueue, type QueueItem } from './work-queue';
import { SelectedWorkPanel, type Selection as PanelSelection } from './selected-work-panel';

/// The Dispatch workspace (UX Specification, final — Dispatch Redesign v2).
///
/// A presentation layer, and nothing else. Every rule it appears to know is one the
/// server told it:
///
///   - which column a card is in        -> dispatch.status
///   - where a card may be dragged      -> dispatch.allowedTransitions (R13, served)
///   - who may take a reassignment      -> GET /dispatch/availability (AR4)
///
/// There is no transition table in this file, no availability calculation, and no
/// projection. Drag and drop is optimistic ONLY visually: the drag overlay follows
/// the cursor, but the CARD does not move until the server has said yes. If the API
/// refuses, the card was never anywhere else, so there is nothing to roll back —
/// which is the most reliable rollback there is.
///
/// Layout is a single vertical flow, not a mode switch: Work Queue + Selected Work
/// sit side by side above the Board. When the queue is empty, that row collapses to
/// a one-line banner and the Board fills the space — nobody clicks a tab to see it.

const BOARD_PAGE_SIZE = 200;

/// How long a resolved queue row stays visible (checkmark held, then fades) before
/// it is actually removed and the next item is auto-selected. Matches the UX spec's
/// timeline: 300ms holding the checkmark + 250ms fading out.
const RESOLVE_HOLD_MS = 550;

type Selection = { kind: 'dispatch'; id: string } | { kind: 'order'; id: string };

function toSelection(item: QueueItem): Selection {
  return item.target === 'order' ? { kind: 'order', id: item.id } : { kind: 'dispatch', id: item.id };
}

export function DispatchBoard() {
  const navigate = useNavigate();
  const invalidate = useInvalidateOperationalState();

  const { data, loading, refreshing, error, refetch } = useDispatches(1, BOARD_PAGE_SIZE);
  const { data: boardSummary } = useDispatchBoardSummary();

  const [dragging, setDragging] = useState<ApiDispatch | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<ApiDispatch | null>(null);
  const [cancelling, setCancelling] = useState<ApiDispatch | null>(null);
  const [announcement, setAnnouncement] = useState('');

  /// Selection is an ID, not a snapshot — an action taken INSIDE the panel
  /// invalidates and refetches, and the panel must show that fresh copy, not
  /// the object it was opened with.
  const [selection, setSelection] = useState<Selection | null>(null);
  /// Items mid fade-out: still rendered (with a resolved look) for
  /// RESOLVE_HOLD_MS after the mutation that removed them from the live
  /// queue succeeded, so the row never just vanishes.
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  const workspaceRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => groupByStatus(data ?? []), [data]);
  const queueItems = useMemo(
    () => buildWorkQueue(data ?? [], boardSummary?.unassignedOrders ?? []),
    [data, boardSummary],
  );

  const queueItemsRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  // Position-stable merge: a resolving item keeps its slot for RESOLVE_HOLD_MS
  // even after the live data (post-refetch) no longer contains it. Cheap to
  // recompute every render — this only touches a couple dozen rows at most —
  // and only actually changes when `queueItems` or `resolvingIds` do.
  const itemsById = useMemo(() => new Map(queueItems.map((i) => [i.id, i] as const)), [queueItems]);
  const snapshotRef = useRef<Map<string, QueueItem>>(new Map());
  queueItems.forEach((i) => snapshotRef.current.set(i.id, i));
  const displayOrderRef = useRef<string[]>([]);
  const liveIds = queueItems.map((i) => i.id);
  const keep = displayOrderRef.current.filter((id) => itemsById.has(id) || resolvingIds.has(id));
  const freshIds = liveIds.filter((id) => !keep.includes(id));
  displayOrderRef.current = [...keep, ...freshIds];
  const displayItems = displayOrderRef.current
    .map((id) => itemsById.get(id) ?? snapshotRef.current.get(id))
    .filter((i): i is QueueItem => Boolean(i));

  const selectedDispatch = useMemo(
    () => (selection?.kind === 'dispatch' ? (data ?? []).find((d) => d.id === selection.id) ?? null : null),
    [data, selection],
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

  /// Focus follows selection (spec section 11) — but only for navigation the
  /// user drove with the keyboard or that happened automatically (resolve).
  /// A plain click already puts focus exactly where the browser expects it;
  /// stealing it back would be redundant, not helpful.
  const focusQueueItem = useCallback((id: string) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-queue-item="${CSS.escape(id)}"]`)?.focus();
    });
  }, []);

  /// Marks a queue item as resolved by ID — called after any mutation that
  /// could remove it from the live queue (assign, reassign, a status
  /// transition, cancel). Deliberately generic: the caller doesn't need to
  /// know whether `id` is actually in the queue right now.
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
    workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const boardRef = useRef<HTMLDivElement>(null);
  const wasQueueEmptyRef = useRef(false);

  // On first load, the top-ranked item is already the dispatcher's answer to
  // "what's first" — select it without waiting for a click.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (queueItems.length === 0) return;
    hasAutoSelectedRef.current = true;
    setSelection(toSelection(queueItems[0]));
  }, [queueItems]);

  // When the queue empties out entirely, the Board becomes the primary
  // surface — scroll it into view rather than leaving the dispatcher looking
  // at a banner with the actual content below the fold.
  useEffect(() => {
    const isEmptyNow = queueItems.length === 0;
    if (isEmptyNow && !wasQueueEmptyRef.current) {
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      scrollWorkspaceIntoView();
    },
    [scrollWorkspaceIntoView],
  );
  const handleViewFullDetail = useCallback((id: string) => void navigate({ to: `/app/dispatches/${id}` }), [navigate]);
  const handleViewOrder = useCallback(
    (orderId: string) => void navigate({ to: `/app/orders/${orderId}` }),
    [navigate],
  );

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

  /// The Work Queue's one-primary-action rule, resolved here: Assign selects
  /// (the form needs input, so it can't complete in zero clicks), Call dials
  /// immediately, Reassign opens the existing dialog immediately. Selecting
  /// is a side effect of all three, so the panel always reflects the last
  /// thing touched.
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
        setReassigning(item.dispatch);
      }
    },
    [],
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

  // Keyboard: j/k navigate the queue, Enter/e runs the selected item's
  // primary action, / focuses search — all disabled while a field has focus
  // or a modal is open, so typing in the search box or the reassign dialog
  // never gets hijacked.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (reassigning || cancelling) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !inField) {
        e.preventDefault();
        document.getElementById('dispatch-search-input')?.focus();
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
  }, [reassigning, cancelling, selection, selectRelative, handlePrimaryAction]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="w-0 min-w-full flex flex-col gap-4 overflow-x-auto pb-4 md:flex-row md:items-start">
          {BOARD_COLUMNS.map((column) => (
            <div key={column.status} className="w-full shrink-0 rounded-xl border border-border p-3 md:w-72">
              <Skeleton className="mb-3 h-5 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const isEmpty = (data?.length ?? 0) === 0;
  const queueEmpty = queueItems.length === 0;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Dispatch"
        subtitle="What needs a decision right now — the board is where it gets executed."
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {refreshing ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Updating...
              </span>
            ) : null}
            {!isEmpty && <DispatchSearch dispatches={data ?? []} onSelect={handleSearchSelect} />}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void navigate({ to: '/app/dispatches' })}>
              <List className="h-4 w-4" aria-hidden="true" />
              List view
            </Button>
          </div>
        }
      />

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Workspace: Queue + Selected Work. Collapses to a one-line banner
          when there is nothing to queue AND nothing selected — the Board
          becomes the page's primary content without any click to get there. */}
      <div ref={workspaceRef}>
        {queueEmpty && !panelSelection ? (
          <div className="rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-foreground">
            All clear — nothing needs attention.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border xl:grid-cols-[24rem_1fr]">
            <div className="border-b border-border xl:border-b-0 xl:border-r">
              {queueEmpty ? (
                <div className="p-4 text-sm text-muted-foreground">All clear — nothing needs attention.</div>
              ) : (
                <WorkQueue
                  items={displayItems}
                  resolvedIds={resolvingIds}
                  selectedId={selection?.id ?? null}
                  onSelect={(item) => setSelection(toSelection(item))}
                  onPrimaryAction={handlePrimaryAction}
                  onViewFullDetail={handleViewFullDetail}
                  onViewOrder={handleViewOrder}
                  onReassign={setReassigning}
                />
              )}
            </div>
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
        )}
      </div>

      {isEmpty ? (
        <EmptyState
          title="No dispatches yet"
          description="A dispatch is created when a driver and a vehicle are assigned to an order. Assign one, and it will appear here."
          action={
            <Button variant="outline" onClick={() => void navigate({ to: '/app/orders' })}>
              Go to orders
            </Button>
          }
        />
      ) : null}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* w-0 min-w-full: 7 fixed-width columns give this row a large
            intrinsic content size that, left as width:auto, bled through the
            surrounding layout and widened <main> itself by exactly the
            sidebar's width — every other element on the page (including the
            header's search box) then sat that far off the right edge. width:0
            forces a definite basis so intrinsic sizing is ignored, and
            min-width:full re-expands it to the actually available space. */}
        <div
          ref={boardRef}
          className={[
            'w-0 min-w-full flex flex-col gap-4 overflow-x-auto pb-4 md:flex-row md:items-start',
            isEmpty ? 'hidden' : '',
          ].join(' ')}
        >
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.status}
              status={column.status}
              title={column.title}
              terminal={column.terminal}
              dispatches={columns[column.status]}
              pendingId={pendingId}
              draggingDispatch={dragging}
              onOpen={handleOpenDispatch}
              onReassign={setReassigning}
              onCancel={setCancelling}
              onViewOrder={handleViewOrder}
            />
          ))}
        </div>

        <DragOverlay>
          {dragging ? (
            <div className="rounded-lg border border-brand bg-card p-3 shadow-lg">
              <p className="font-mono text-sm font-semibold">{dragging.dispatchNumber}</p>
              <p className="text-xs text-muted-foreground">{dragging.order?.customer?.companyName ?? ''}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
    </div>
  );
}

interface BoardColumnProps {
  status: DispatchStatus;
  title: string;
  terminal: boolean;
  dispatches: ApiDispatch[];
  pendingId: string | null;
  draggingDispatch: ApiDispatch | null;
  onOpen: (id: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
}

function BoardColumn({
  status,
  title,
  terminal,
  dispatches,
  pendingId,
  draggingDispatch,
  onOpen,
  onReassign,
  onCancel,
  onViewOrder,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const isLegalTarget = draggingDispatch ? canDropInto(draggingDispatch, status) : true;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${title}, ${dispatches.length} ${dispatches.length === 1 ? 'dispatch' : 'dispatches'}`}
      className={[
        'flex w-full shrink-0 flex-col rounded-xl border p-3 transition-all duration-150 md:w-72',
        terminal ? 'bg-muted/40' : 'bg-gradient-to-b from-surface to-surface/60',
        isOver && isLegalTarget ? 'border-brand ring-2 ring-brand/30' : 'border-border',
        draggingDispatch && !isLegalTarget ? 'opacity-40' : '',
      ].join(' ')}
      data-testid={`board-column-${status}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand" aria-hidden="true">
          {dispatches.length}
        </span>
      </header>

      <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-2 overflow-y-auto scrollbar-thin">
        {dispatches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Nothing here
          </p>
        ) : (
          dispatches.map((dispatch) => (
            <DispatchCard
              key={dispatch.id}
              dispatch={dispatch}
              pending={pendingId === dispatch.id}
              onOpen={onOpen}
              onReassign={onReassign}
              onCancel={onCancel}
              onViewOrder={onViewOrder}
            />
          ))
        )}
      </div>
    </section>
  );
}
