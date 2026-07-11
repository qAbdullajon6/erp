'use client';

import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { MoreVertical, StickyNote } from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/shared/status-badge';

/// One dispatch on the board.
///
/// R2/R5: everything here is read straight off the Dispatch. The driver and the
/// vehicle come from `dispatch.driver` / `dispatch.vehicle` — never from the order,
/// whose driverId is only a projection (ADR-001) and could in principle lag. The
/// card derives nothing: no availability, no assignability, no capacity, no
/// overlap.

interface DispatchCardProps {
  dispatch: ApiDispatch;
  /// True while a move for THIS card is in flight. The card does not move — it
  /// waits. Nothing is faked (R3).
  pending: boolean;
  onOpen: (id: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
}

function formatWindow(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${new Date(from).toLocaleDateString('en-US', opts)} → ${new Date(to).toLocaleDateString('en-US', opts)}`;
}

function DispatchCardImpl({
  dispatch,
  pending,
  onOpen,
  onReassign,
  onCancel,
  onViewOrder,
}: DispatchCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dispatch.id,
    data: { dispatch },
    // A terminal dispatch has nowhere to go; the server says so via an empty
    // allowedTransitions, and we simply believe it.
    disabled: dispatch.allowedTransitions.length === 0 || pending,
  });

  const driver = dispatch.driver;
  const vehicle = dispatch.vehicle;
  const customer = dispatch.order?.customer;
  const canCancel = dispatch.allowedTransitions.includes('CANCELLED');

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        'rounded-lg border border-border bg-card p-3 shadow-sm',
        'focus-within:ring-2 focus-within:ring-ring',
        isDragging ? 'opacity-50' : '',
        pending ? 'opacity-60 animate-pulse' : '',
      ].join(' ')}
      aria-label={`Dispatch ${dispatch.dispatchNumber}, ${dispatch.status.replace(/_/g, ' ').toLowerCase()}`}
      data-testid={`dispatch-card-${dispatch.dispatchNumber}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* The drag handle is the card's own button, so it is reachable by keyboard
            and announces itself. dnd-kit gives it the right ARIA roles. */}
        <button
          type="button"
          className="min-h-[44px] rounded text-left font-mono text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
          onClick={() => onOpen(dispatch.id)}
          {...listeners}
          {...attributes}
        >
          {dispatch.dispatchNumber}
        </button>

        <div className="flex items-center gap-1">
          {dispatch.notes ? (
            <StickyNote
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label="Has notes"
              role="img"
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* 44px on touch, tighter on the desktop board where the pointer is
                  precise and vertical space on a card is scarce. */}
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 sm:h-7 sm:w-7"
                aria-label={`Actions for dispatch ${dispatch.dispatchNumber}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpen(dispatch.id)}>Open details</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onReassign(dispatch)}
                disabled={dispatch.allowedTransitions.length === 0}
              >
                Reassign
              </DropdownMenuItem>
              {dispatch.order ? (
                <DropdownMenuItem onClick={() => onViewOrder(dispatch.orderId)}>
                  View order
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onCancel(dispatch)}
                disabled={!canCancel}
                className="text-destructive"
              >
                Cancel dispatch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="mt-1 truncate text-sm text-foreground">
        {customer?.companyName ?? 'Unknown customer'}
      </p>

      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {dispatch.order?.pickupCity ?? '—'} → {dispatch.order?.deliveryCity ?? '—'}
      </p>

      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Driver:</dt>
          <dd className="truncate text-foreground">
            {driver ? `${driver.firstName} ${driver.lastName}` : '—'}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Vehicle:</dt>
          <dd className="truncate font-mono text-foreground">{vehicle?.plateNumber ?? '—'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Window:</dt>
          <dd className="text-foreground">
            {formatWindow(dispatch.pickupDateScheduled, dispatch.deliveryDateScheduled)}
          </dd>
        </div>
      </dl>

      <div className="mt-2">
        <StatusBadge status={dispatch.status} />
      </div>
    </article>
  );
}

/// Memoised: a board of 100 cards re-renders on every drag frame otherwise. The
/// props are primitives and a stable dispatch object from React Query's cache, so
/// referential equality actually holds.
export const DispatchCard = memo(DispatchCardImpl);
