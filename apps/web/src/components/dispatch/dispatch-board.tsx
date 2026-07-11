'use client';

import { useMemo, useState } from 'react';
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
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/list-states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BOARD_COLUMNS, canDropInto, groupByStatus, isCancelDrop } from './board-columns';
import { DispatchCard } from './dispatch-card';
import { DispatchReassignDialog } from './dispatch-reassign-dialog';

/// The Dispatch Board (Task 8.10).
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

/// A board wants every dispatch, not a page of ten. The list endpoint's `limit` has
/// no server-side maximum, so this asks for a workable board's worth in one request
/// rather than paginating a Kanban.
const BOARD_PAGE_SIZE = 200;

export function DispatchBoard() {
  const navigate = useNavigate();
  const invalidate = useInvalidateOperationalState();

  const { data, loading, refreshing, error, refetch } = useDispatches(1, BOARD_PAGE_SIZE);

  const [dragging, setDragging] = useState<ApiDispatch | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<ApiDispatch | null>(null);
  const [cancelling, setCancelling] = useState<ApiDispatch | null>(null);
  /// Announced politely to screen readers after a move settles.
  const [announcement, setAnnouncement] = useState('');

  const sensors = useSensors(
    // A small distance so a click on the dispatch number still opens it rather than
    // starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => groupByStatus(data ?? []), [data]);

  const handleDragStart = (event: DragStartEvent) => {
    setDragging((event.active.data.current as { dispatch: ApiDispatch } | undefined)?.dispatch ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const dispatch = (event.active.data.current as { dispatch: ApiDispatch } | undefined)?.dispatch;
    setDragging(null);

    const target = event.over?.id as DispatchStatus | undefined;
    if (!dispatch || !target || target === dispatch.status) return;

    // The server already told us what is legal. Refusing here is not the UI
    // inventing a rule — it is the UI repeating one, and it saves a round trip that
    // could only ever end in a 409.
    if (!canDropInto(dispatch, target)) {
      toast.error(
        `${dispatch.dispatchNumber} cannot move to ${target.replace(/_/g, ' ').toLowerCase()}`,
      );
      return;
    }

    setPendingId(dispatch.id);
    try {
      // Cancellation has its own endpoint; everything else is a status transition.
      if (isCancelDrop(target)) {
        await dispatchesAPI.cancel(dispatch.id);
      } else {
        await dispatchesAPI.updateStatus(dispatch.id, { status: target });
      }

      // The card moves because the SERVER moved it: invalidate, refetch, re-render.
      // Nothing was written into the cache by hand (Task 8.9, rule 4).
      await invalidate();
      const label = target.replace(/_/g, ' ').toLowerCase();
      toast.success(`${dispatch.dispatchNumber} moved to ${label}`);
      setAnnouncement(`${dispatch.dispatchNumber} moved to ${label}`);
    } catch (err) {
      // The card never left its column, so there is no fake state to undo. Say what
      // the server said, verbatim — a 409 explains itself.
      const message = describeError(err, 'Move rejected');
      toast.error(message);
      setAnnouncement(`Move rejected. ${message}`);
    } finally {
      setPendingId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    try {
      await dispatchesAPI.cancel(cancelling.id);
      await invalidate();
      toast.success(`${cancelling.dispatchNumber} cancelled`);
      setAnnouncement(`${cancelling.dispatchNumber} cancelled`);
    } catch (err) {
      toast.error(describeError(err, 'Failed to cancel dispatch'));
    } finally {
      setCancelling(null);
    }
  };

  if (loading) return <LoadingState label="Loading the board..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const isEmpty = (data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dispatch Board"
        subtitle="Every dispatch, by the state the operation is actually in."
        action={
          <div className="flex items-center gap-3">
            {/* A quiet, non-blocking hint that the board is catching up after a
                move. It must NOT replace the board with a spinner: the cards are
                still valid, and blanking them out on every mutation would make the
                board feel broken. */}
            {refreshing ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Updating...
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void navigate({ to: '/app/dispatches' })}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              List view
            </Button>
          </div>
        }
      />

      {/* Screen readers are told the outcome of a move, which they cannot see. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
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
        {/*
          Desktop: a multi-column Kanban.
          Tablet: the same board, scrolled horizontally.
          Mobile: one column per row — a grouped list, which is what a Kanban
          degrades to honestly on a narrow screen.
        */}
        <div
          className={[
            'flex flex-col gap-4 overflow-x-auto pb-4 md:flex-row md:items-start',
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
              onOpen={(id) => void navigate({ to: `/app/dispatches/${id}` })}
              onReassign={setReassigning}
              onCancel={setCancelling}
              onViewOrder={(orderId) => void navigate({ to: `/app/orders/${orderId}` })}
            />
          ))}
        </div>

        <DragOverlay>
          {dragging ? (
            <div className="rounded-lg border border-brand bg-card p-3 shadow-lg">
              <p className="font-mono text-sm font-semibold">{dragging.dispatchNumber}</p>
              <p className="text-xs text-muted-foreground">
                {dragging.order?.customer?.companyName ?? ''}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DispatchReassignDialog dispatch={reassigning} onClose={() => setReassigning(null)} />

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

  // While a card is in the air, columns it cannot legally land in are dimmed. The
  // legality is the server's answer, carried on the card.
  const isLegalTarget = draggingDispatch ? canDropInto(draggingDispatch, status) : true;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${title}, ${dispatches.length} ${dispatches.length === 1 ? 'dispatch' : 'dispatches'}`}
      className={[
        'flex w-full shrink-0 flex-col rounded-xl border bg-surface p-3 md:w-72',
        isOver && isLegalTarget ? 'border-brand ring-2 ring-brand/30' : 'border-border',
        draggingDispatch && !isLegalTarget ? 'opacity-40' : '',
        terminal ? 'bg-muted/40' : '',
      ].join(' ')}
      data-testid={`board-column-${status}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          aria-hidden="true"
        >
          {dispatches.length}
        </span>
      </header>

      <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-2 overflow-y-auto">
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
