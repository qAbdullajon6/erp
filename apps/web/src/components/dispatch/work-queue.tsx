'use client';

import { forwardRef } from 'react';
import { MoreVertical } from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { BoardOrderSummary } from '@/lib/api/dashboard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/// The Work Queue (UX spec, final). One ranked list, not four grouped cards —
/// each row states the ACTION ("Assign driver", "Call driver", "Reassign"),
/// never the problem ("Delayed", "Needs assignment"). Ranked by how broken
/// things already are, not by category: something already late outranks
/// something that might be late soon.
///
/// Every item carries exactly one primary action. Anything else it's
/// possible to do lives in the overflow menu — a queue row is a decision, not
/// a dashboard tile.

const NON_TERMINAL = new Set<ApiDispatch['status']>([
  'DRAFT',
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
]);
const NOT_YET_EN_ROUTE = new Set<ApiDispatch['status']>(['DRAFT', 'ASSIGNED']);

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

function hoursSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60));
}

export type QueueItem =
  | {
      id: string;
      target: 'order';
      tone: 'warning';
      headline: string;
      context: string;
      primaryLabel: 'Assign';
      order: BoardOrderSummary;
    }
  | {
      id: string;
      target: 'dispatch';
      tone: 'destructive' | 'warning';
      headline: string;
      context: string;
      primaryLabel: 'Call' | 'Reassign';
      dispatch: ApiDispatch;
    };

/// One flat, ranked list. Category order IS the priority rule: something
/// already broken (delayed, vehicle down) outranks something that is merely
/// upcoming (pickup soon) or waiting-but-not-yet-urgent (unassigned order).
/// Within a category, the most urgent instance comes first.
export function buildWorkQueue(dispatches: ApiDispatch[], unassignedOrders: BoardOrderSummary[]): QueueItem[] {
  const delayed = dispatches
    .filter((d) => NON_TERMINAL.has(d.status) && new Date(d.deliveryDateScheduled).getTime() < Date.now())
    .sort((a, b) => new Date(a.deliveryDateScheduled).getTime() - new Date(b.deliveryDateScheduled).getTime())
    .map<QueueItem>((d) => ({
      id: d.id,
      target: 'dispatch',
      tone: 'destructive',
      headline: 'Call driver',
      context: `${d.dispatchNumber} · ${hoursSince(d.deliveryDateScheduled)}h late`,
      primaryLabel: 'Call',
      dispatch: d,
    }));

  const vehicleIssue = dispatches
    .filter((d) => NON_TERMINAL.has(d.status) && d.vehicle?.status === 'MAINTENANCE')
    .map<QueueItem>((d) => ({
      id: d.id,
      target: 'dispatch',
      tone: 'destructive',
      headline: 'Reassign vehicle',
      context: `${d.dispatchNumber} · ${d.vehicle?.plateNumber ?? 'vehicle'} in maintenance`,
      primaryLabel: 'Reassign',
      dispatch: d,
    }));

  const pickupRisk = dispatches
    .filter((d) => NOT_YET_EN_ROUTE.has(d.status) && isToday(d.pickupDateScheduled))
    .sort((a, b) => new Date(a.pickupDateScheduled).getTime() - new Date(b.pickupDateScheduled).getTime())
    .map<QueueItem>((d) => {
      const mins = minutesUntil(d.pickupDateScheduled);
      const when = mins <= 0 ? 'pickup time passed' : mins < 60 ? `pickup in ${mins}m` : 'pickup today';
      return {
        id: d.id,
        target: 'dispatch',
        tone: 'warning',
        headline: 'Call driver',
        context: `${d.dispatchNumber} · ${when}`,
        primaryLabel: 'Call',
        dispatch: d,
      };
    });

  const needsAssignment = [...unassignedOrders]
    .sort((a, b) => new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime())
    .map<QueueItem>((order) => ({
      id: order.id,
      target: 'order',
      tone: 'warning',
      headline: 'Assign driver',
      context: `${order.orderNumber} · ${order.pickupCity} → ${order.deliveryCity}`,
      primaryLabel: 'Assign',
      order,
    }));

  return [...delayed, ...vehicleIssue, ...pickupRisk, ...needsAssignment];
}

const TONE_DOT: Record<QueueItem['tone'], string> = {
  destructive: 'bg-destructive',
  warning: 'bg-warning',
};

interface RowProps {
  item: QueueItem;
  selected: boolean;
  resolved: boolean;
  onSelect: (item: QueueItem) => void;
  onPrimaryAction: (item: QueueItem) => void;
  onViewFullDetail: (id: string) => void;
  onViewOrder: (orderId: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
}

export const WorkQueueRow = forwardRef<HTMLDivElement, RowProps>(function WorkQueueRow(
  { item, selected, resolved, onSelect, onPrimaryAction, onViewFullDetail, onViewOrder, onReassign },
  ref,
) {
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-queue-item={item.id}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPrimaryAction(item);
      }}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b border-l-2 border-border/60 border-l-transparent px-3 py-2.5 outline-none transition-all duration-200 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
        selected ? 'border-l-brand bg-brand/10' : 'hover:bg-muted/30',
        resolved ? 'pointer-events-none max-h-0 overflow-hidden !border-b-0 !py-0 opacity-0' : 'max-h-24 opacity-100',
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[item.tone])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{resolved ? '✓ Done' : item.headline}</p>
        <p className="truncate text-xs text-muted-foreground">{item.context}</p>
      </div>
      {!resolved && (
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => onPrimaryAction(item)}>
            {item.primaryLabel}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.target === 'dispatch' && (
                <>
                  <DropdownMenuItem onClick={() => onSelect(item)}>Open detail</DropdownMenuItem>
                  {item.primaryLabel !== 'Reassign' && item.dispatch.allowedTransitions.length > 0 && (
                    <DropdownMenuItem onClick={() => onReassign(item.dispatch)}>Reassign</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onViewFullDetail(item.dispatch.id)}>
                    View full detail
                  </DropdownMenuItem>
                </>
              )}
              {item.target === 'order' && (
                <DropdownMenuItem onClick={() => onViewOrder(item.order.id)}>View order</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});

interface WorkQueueProps {
  items: QueueItem[];
  resolvedIds: Set<string>;
  selectedId: string | null;
  onSelect: (item: QueueItem) => void;
  onPrimaryAction: (item: QueueItem) => void;
  onViewFullDetail: (id: string) => void;
  onViewOrder: (orderId: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
}

export function WorkQueue({
  items,
  resolvedIds,
  selectedId,
  onSelect,
  onPrimaryAction,
  onViewFullDetail,
  onViewOrder,
  onReassign,
}: WorkQueueProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Work Queue{items.length > 0 ? ` (${items.length})` : ''}
        </h2>
      </div>
      <div role="listbox" aria-label="Work queue" className="max-h-[26rem] overflow-y-auto scrollbar-thin">
        {items.map((item) => (
          <WorkQueueRow
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            resolved={resolvedIds.has(item.id)}
            onSelect={onSelect}
            onPrimaryAction={onPrimaryAction}
            onViewFullDetail={onViewFullDetail}
            onViewOrder={onViewOrder}
            onReassign={onReassign}
          />
        ))}
      </div>
    </div>
  );
}
