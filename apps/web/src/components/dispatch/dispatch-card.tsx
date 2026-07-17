'use client';

import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { MoreVertical, AlertTriangle, Clock, Truck, User } from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusVariant } from '@/components/shared/status-badge';

interface DispatchCardProps {
  dispatch: ApiDispatch;
  pending: boolean;
  onOpen: (id: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
}

function getDeliveryUrgency(deliveryDate: string): { label: string; tone: string; isUrgent: boolean } {
  const target = new Date(deliveryDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours < 0) return { label: `${Math.abs(diffDays)}d late`, tone: 'text-destructive', isUrgent: true };
  if (diffHours < 12) return { label: 'Due today', tone: 'text-warning', isUrgent: true };
  if (diffHours < 36) return { label: 'Tomorrow', tone: 'text-warning', isUrgent: false };
  if (diffDays <= 3) return { label: `${diffDays}d left`, tone: 'text-muted-foreground', isUrgent: false };
  return { label: `${diffDays}d`, tone: 'text-muted-foreground', isUrgent: false };
}

const ACCENT_BORDER: Record<ReturnType<typeof statusVariant>, string> = {
  success: 'border-l-success/60',
  warning: 'border-l-warning/60',
  danger: 'border-l-destructive/60',
  brand: 'border-l-brand/60',
  muted: 'border-l-muted-foreground/20',
};

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
    disabled: dispatch.allowedTransitions.length === 0 || pending,
  });

  const driver = dispatch.driver;
  const vehicle = dispatch.vehicle;
  const customer = dispatch.order?.customer;
  const canCancel = dispatch.allowedTransitions.includes('CANCELLED');
  const isTerminal = dispatch.status === 'DELIVERED' || dispatch.status === 'CANCELLED';
  const urgency = !isTerminal ? getDeliveryUrgency(dispatch.deliveryDateScheduled) : null;

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        'group relative rounded-lg border border-l-[3px] border-border bg-card p-3 transition-all',
        ACCENT_BORDER[statusVariant(dispatch.status)],
        'hover:bg-muted/30 hover:shadow-sm',
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-brand' : '',
        pending ? 'opacity-60 animate-pulse' : '',
        urgency?.isUrgent ? 'ring-1 ring-destructive/20' : '',
      ].join(' ')}
      aria-label={`Dispatch ${dispatch.dispatchNumber}`}
      data-testid={`dispatch-card-${dispatch.dispatchNumber}`}
    >
      {/* Top row: dispatch number + urgency + menu */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="min-h-[44px] rounded text-left font-mono text-xs font-bold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
            onClick={() => onOpen(dispatch.id)}
            {...listeners}
            {...attributes}
          >
            {dispatch.dispatchNumber}
          </button>
        </div>

        {urgency && (
          <span className={`flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium ${urgency.tone}`}>
            {urgency.isUrgent && <AlertTriangle className="h-2.5 w-2.5" />}
            {urgency.label}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpen(dispatch.id)}>Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReassign(dispatch)} disabled={dispatch.allowedTransitions.length === 0}>Reassign</DropdownMenuItem>
            {dispatch.order && <DropdownMenuItem onClick={() => onViewOrder(dispatch.orderId)}>View order</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onCancel(dispatch)} disabled={!canCancel} className="text-destructive">Cancel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Route — the primary visual identifier */}
      <div className="mt-1.5 flex items-center gap-1 text-xs">
        <span className="truncate font-medium text-foreground">{dispatch.order?.pickupCity ?? '—'}</span>
        <span className="text-muted-foreground">→</span>
        <span className="truncate font-medium text-foreground">{dispatch.order?.deliveryCity ?? '—'}</span>
      </div>

      {/* Customer */}
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {customer?.companyName ?? 'Unknown'}
      </p>

      {/* Assignment — compact row */}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        {driver && (
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{driver.firstName} {driver.lastName?.charAt(0)}.</span>
          </span>
        )}
        {vehicle && (
          <span className="flex items-center gap-1 truncate">
            <Truck className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{vehicle.plateNumber}</span>
          </span>
        )}
      </div>
    </article>
  );
}

export const DispatchCard = memo(DispatchCardImpl);
