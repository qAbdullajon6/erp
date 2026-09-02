'use client';

import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  MoreVertical,
  AlertTriangle,
  Phone,
  ExternalLink,
  Route,
  User,
  Truck,
  GripVertical,
  Radio,
} from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { DispatchConflictSummary } from '@/lib/api/dispatch-conflicts';
import { DispatchConflictBadge } from '@/components/dispatch/dispatch-conflict-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusVariant } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { getDeliveryUrgency, WAITING_PICKUP } from './dispatch-ops';

interface DispatchCardProps {
  dispatch: ApiDispatch;
  pending: boolean;
  selected?: boolean;
  canWrite?: boolean;
  conflictSummary?: DispatchConflictSummary;
  onOpen: (id: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
  onCall?: (dispatch: ApiDispatch) => void;
}

const ACCENT_BORDER: Record<ReturnType<typeof statusVariant>, string> = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-destructive',
  brand: 'border-l-brand',
  muted: 'border-l-muted-foreground/40',
};

function DispatchCardImpl({
  dispatch,
  pending,
  selected = false,
  canWrite = true,
  conflictSummary,
  onOpen,
  onReassign,
  onCancel,
  onViewOrder,
  onCall,
}: DispatchCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dispatch.id,
    data: { dispatch },
    disabled: !canWrite || dispatch.allowedTransitions.length === 0 || pending,
  });

  const driver = dispatch.driver;
  const vehicle = dispatch.vehicle;
  const customer = dispatch.order?.customer;
  const canCancel = canWrite && dispatch.allowedTransitions.includes('CANCELLED');
  const canReassign = canWrite && dispatch.allowedTransitions.length > 0;
  const isTerminal = dispatch.status === 'DELIVERED' || dispatch.status === 'CANCELLED';
  const urgency = !isTerminal ? getDeliveryUrgency(dispatch.deliveryDateScheduled) : null;
  const waiting = WAITING_PICKUP.has(dispatch.status);
  const activeRoute = dispatch.routeContext?.find(
    (r) => r.routeStatus !== 'CANCELLED' && r.routeStatus !== 'COMPLETED',
  );
  /// Urgency label already encodes Late / Due today — only show Waiting as extra chip.
  const showWaitingChip = waiting && !urgency?.isLate;

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border border-l-[3px] border-border/70 bg-card p-3 transition-colors',
        ACCENT_BORDER[statusVariant(dispatch.status)],
        'hover:bg-muted/30',
        isDragging && 'opacity-50 shadow-md ring-2 ring-brand',
        pending && 'animate-pulse opacity-60',
        urgency?.isLate && 'bg-destructive/5',
        !urgency?.isLate && urgency?.dueToday && 'bg-warning/5',
        dispatch.status === 'IN_TRANSIT' && !urgency?.isLate && 'bg-brand/[0.03]',
        selected && 'ring-1 ring-inset ring-brand',
      )}
      aria-label={`Dispatch ${dispatch.dispatchNumber}${urgency?.isLate ? ', late' : ''}`}
      data-testid={`dispatch-card-${dispatch.dispatchNumber}`}
    >
      <div className="flex items-start gap-1">
        {canWrite && dispatch.allowedTransitions.length > 0 && (
          <button
            type="button"
            className="mt-0.5 shrink-0 touch-none rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`Drag ${dispatch.dispatchNumber}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <button
              type="button"
              className="min-h-7 rounded text-left font-mono text-sm font-bold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => onOpen(dispatch.id)}
            >
              {dispatch.dispatchNumber}
            </button>

            <div className="flex items-center gap-0.5">
              <DispatchConflictBadge summary={conflictSummary} />
              {urgency && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold',
                    urgency.tone,
                  )}
                >
                  {urgency.isUrgent && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
                  {urgency.label}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Actions for ${dispatch.dispatchNumber}`}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => onOpen(dispatch.id)}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open
                  </DropdownMenuItem>
                  {driver?.phone && onCall && (
                    <DropdownMenuItem onClick={() => onCall(dispatch)}>
                      <Phone className="mr-2 h-3.5 w-3.5" />
                      Call
                    </DropdownMenuItem>
                  )}
                  {canWrite && (
                    <DropdownMenuItem onClick={() => onReassign(dispatch)} disabled={!canReassign}>
                      Reassign
                    </DropdownMenuItem>
                  )}
                  {dispatch.order && (
                    <DropdownMenuItem onClick={() => onViewOrder(dispatch.orderId)}>
                      View order
                    </DropdownMenuItem>
                  )}
                  {canWrite && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onCancel(dispatch)}
                        disabled={!canCancel}
                        className="text-destructive"
                      >
                        Cancel
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <button
            type="button"
            className="mt-1 flex w-full items-center gap-1 text-left text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onOpen(dispatch.id)}
          >
            <span className={cn('truncate text-foreground', isTerminal ? 'font-medium' : 'font-semibold')}>
              {dispatch.order?.pickupCity ?? '—'}
            </span>
            <span
              className={cn('shrink-0', dispatch.status === 'IN_TRANSIT' ? 'text-brand' : 'text-muted-foreground')}
              aria-hidden="true"
            >
              →
            </span>
            <span className={cn('truncate text-foreground', isTerminal ? 'font-medium' : 'font-semibold')}>
              {dispatch.order?.deliveryCity ?? '—'}
            </span>
          </button>

          <p className="mt-1 truncate text-xs text-muted-foreground">
            {customer?.companyName ?? 'Unknown'}
          </p>

          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {driver ? (
              <span className="flex min-w-0 items-center gap-0.5 truncate">
                <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {driver.firstName} {driver.lastName?.charAt(0)}.
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground/80">No driver</span>
            )}
            {vehicle && (
              <span className="flex min-w-0 items-center gap-0.5 truncate">
                <Truck className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono">{vehicle.plateNumber}</span>
                {vehicle.type && (
                  <span className="truncate capitalize text-muted-foreground/60">
                    · {vehicle.type}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {dispatch.status === 'IN_TRANSIT' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-brand">
                <Radio className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                Live
              </span>
            )}
            {showWaitingChip && (
              <span className="rounded bg-warning/15 px-1.5 py-px text-[10px] font-medium text-warning">
                Waiting pickup
              </span>
            )}
            {activeRoute && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-brand">
                <Route className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                {activeRoute.routeNumber}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export const DispatchCard = memo(DispatchCardImpl);
