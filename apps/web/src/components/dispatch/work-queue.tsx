'use client';

import { forwardRef } from 'react';
import {
  MoreVertical,
  Phone,
  UserRoundCog,
  ExternalLink,
  AlertTriangle,
  Timer,
  Package,
} from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { BoardOrderSummary, DispatchBoardSummary } from '@/lib/api/dashboard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  NON_TERMINAL,
  WAITING_PICKUP,
  formatElapsed,
  hoursSince,
  isDispatchOverdue,
  isToday,
  minutesUntil,
  overloadedDriverIds,
} from './dispatch-ops';

/// Operations Queue — ranked decisions for a dispatcher who keeps this open all day.
/// Priority: Critical → Overdue → Waiting pickup → Needs reassignment → Needs assignment.
/// Primary CTA is one action; everything else lives in the overflow menu.

export type QueueSection =
  | 'critical'
  | 'overdue'
  | 'waiting_pickup'
  | 'needs_reassignment'
  | 'needs_assignment';

export type QueueItem =
  | {
      id: string;
      target: 'order';
      section: 'needs_assignment';
      tone: 'warning' | 'destructive';
      riskLabel: string;
      dispatchNumber?: undefined;
      route: string;
      customer: string;
      driver: string;
      vehicle: string;
      elapsed: string;
      primaryLabel: 'Assign';
      order: BoardOrderSummary;
    }
  | {
      id: string;
      target: 'dispatch';
      section: Exclude<QueueSection, 'needs_assignment'>;
      tone: 'destructive' | 'warning';
      riskLabel: string;
      dispatchNumber: string;
      route: string;
      customer: string;
      driver: string;
      vehicle: string;
      elapsed: string;
      primaryLabel: 'Call' | 'Reassign' | 'Open';
      dispatch: ApiDispatch;
    };

const SECTION_META: { key: QueueSection; label: string; urgent?: boolean }[] = [
  { key: 'critical', label: 'Critical', urgent: true },
  { key: 'overdue', label: 'Overdue', urgent: true },
  { key: 'waiting_pickup', label: 'Waiting pickup' },
  { key: 'needs_reassignment', label: 'Needs reassignment' },
  { key: 'needs_assignment', label: 'Needs assignment' },
];

function routeOf(d: ApiDispatch): string {
  return `${d.order?.pickupCity ?? '—'} → ${d.order?.deliveryCity ?? '—'}`;
}

function driverLabel(d: ApiDispatch): string {
  return d.driver ? `${d.driver.firstName} ${d.driver.lastName?.charAt(0)}.` : '—';
}

function vehicleLabel(d: ApiDispatch): string {
  return d.vehicle?.plateNumber ?? '—';
}

export function buildWorkQueue(
  dispatches: ApiDispatch[],
  unassignedOrders: BoardOrderSummary[],
  board: DispatchBoardSummary | null,
): QueueItem[] {
  const overloaded = overloadedDriverIds(board);
  const seen = new Set<string>();
  const out: QueueItem[] = [];

  const pushDispatch = (item: Extract<QueueItem, { target: 'dispatch' }>) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };

  // Critical — vehicle in maintenance on a live job
  dispatches
    .filter((d) => NON_TERMINAL.has(d.status) && d.vehicle?.status === 'MAINTENANCE')
    .forEach((d) => {
      pushDispatch({
        id: d.id,
        target: 'dispatch',
        section: 'critical',
        tone: 'destructive',
        riskLabel: 'Vehicle down',
        dispatchNumber: d.dispatchNumber,
        route: routeOf(d),
        customer: d.order?.customer?.companyName ?? '—',
        driver: driverLabel(d),
        vehicle: vehicleLabel(d),
        elapsed: formatElapsed(d.updatedAt),
        primaryLabel: 'Reassign',
        dispatch: d,
      });
    });

  // Overdue
  dispatches
    .filter(isDispatchOverdue)
    .sort(
      (a, b) =>
        new Date(a.deliveryDateScheduled).getTime() - new Date(b.deliveryDateScheduled).getTime(),
    )
    .forEach((d) => {
      pushDispatch({
        id: d.id,
        target: 'dispatch',
        section: 'overdue',
        tone: 'destructive',
        riskLabel: `${hoursSince(d.deliveryDateScheduled)}h late`,
        dispatchNumber: d.dispatchNumber,
        route: routeOf(d),
        customer: d.order?.customer?.companyName ?? '—',
        driver: driverLabel(d),
        vehicle: vehicleLabel(d),
        elapsed: `${hoursSince(d.deliveryDateScheduled)}h`,
        primaryLabel: d.driver?.phone ? 'Call' : 'Open',
        dispatch: d,
      });
    });

  // Waiting pickup
  dispatches
    .filter((d) => WAITING_PICKUP.has(d.status) && !isDispatchOverdue(d))
    .sort(
      (a, b) =>
        new Date(a.pickupDateScheduled).getTime() - new Date(b.pickupDateScheduled).getTime(),
    )
    .forEach((d) => {
      const mins = minutesUntil(d.pickupDateScheduled);
      const when =
        mins <= 0 ? 'Pickup passed' : mins < 60 ? `Pickup ${mins}m` : isToday(d.pickupDateScheduled) ? 'Pickup today' : 'Waiting';
      pushDispatch({
        id: d.id,
        target: 'dispatch',
        section: 'waiting_pickup',
        tone: 'warning',
        riskLabel: when,
        dispatchNumber: d.dispatchNumber,
        route: routeOf(d),
        customer: d.order?.customer?.companyName ?? '—',
        driver: driverLabel(d),
        vehicle: vehicleLabel(d),
        elapsed: formatElapsed(d.updatedAt),
        primaryLabel: d.driver?.phone ? 'Call' : 'Open',
        dispatch: d,
      });
    });

  // Needs reassignment — rejected by driver
  dispatches
    .filter((d) => NON_TERMINAL.has(d.status) && d.driverAcceptanceStatus === 'REJECTED')
    .forEach((d) => {
      pushDispatch({
        id: d.id,
        target: 'dispatch',
        section: 'needs_reassignment',
        tone: 'destructive',
        riskLabel: 'Driver rejected',
        dispatchNumber: d.dispatchNumber,
        route: routeOf(d),
        customer: d.order?.customer?.companyName ?? '—',
        driver: driverLabel(d),
        vehicle: vehicleLabel(d),
        elapsed: formatElapsed(d.updatedAt),
        primaryLabel: 'Reassign',
        dispatch: d,
      });
    });

  // Needs reassignment — overloaded drivers
  dispatches
    .filter((d) => NON_TERMINAL.has(d.status) && overloaded.has(d.driverId))
    .forEach((d) => {
      pushDispatch({
        id: d.id,
        target: 'dispatch',
        section: 'needs_reassignment',
        tone: 'warning',
        riskLabel: 'Overloaded',
        dispatchNumber: d.dispatchNumber,
        route: routeOf(d),
        customer: d.order?.customer?.companyName ?? '—',
        driver: driverLabel(d),
        vehicle: vehicleLabel(d),
        elapsed: formatElapsed(d.updatedAt),
        primaryLabel: 'Reassign',
        dispatch: d,
      });
    });

  // Needs assignment — unassigned orders (re-dispatch orders surfaced separately)
  [...unassignedOrders]
    .sort((a, b) => new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime())
    .forEach((order) => {
      const failed = order.lastFailedDelivery ?? null;
      out.push({
        id: order.id,
        target: 'order',
        section: 'needs_assignment',
        tone: failed ? 'destructive' : 'warning',
        riskLabel: failed ? 'Re-dispatch needed' : 'Unassigned',
        route: `${order.pickupCity} → ${order.deliveryCity}`,
        customer: order.customerName ?? '—',
        driver: '—',
        vehicle: '—',
        elapsed: order.createdAt ? formatElapsed(order.createdAt) : '—',
        primaryLabel: 'Assign',
        order,
      });
    });

  return out;
}

const TONE_BORDER: Record<QueueItem['tone'], string> = {
  destructive: 'border-l-destructive',
  warning: 'border-l-warning',
};

const TONE_RISK: Record<QueueItem['tone'], string> = {
  destructive: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/10 text-warning',
};

interface RowProps {
  item: QueueItem;
  selected: boolean;
  resolved: boolean;
  canWrite: boolean;
  onSelect: (item: QueueItem) => void;
  onPrimaryAction: (item: QueueItem) => void;
  onViewFullDetail: (id: string) => void;
  onViewOrder: (orderId: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCall: (dispatch: ApiDispatch) => void;
}

export const WorkQueueRow = forwardRef<HTMLDivElement, RowProps>(function WorkQueueRow(
  {
    item,
    selected,
    resolved,
    canWrite,
    onSelect,
    onPrimaryAction,
    onViewFullDetail,
    onViewOrder,
    onReassign,
    onCall,
  },
  ref,
) {
  const writePrimary = item.primaryLabel === 'Assign' || item.primaryLabel === 'Reassign';
  const showPrimary = canWrite || !writePrimary || item.primaryLabel === 'Call' || item.primaryLabel === 'Open';

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-queue-item={item.id}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && showPrimary) {
          e.preventDefault();
          onPrimaryAction(item);
        }
      }}
      className={cn(
        'group cursor-pointer border-b border-l-[3px] border-border/60 outline-none transition-all duration-200 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        TONE_BORDER[item.tone],
        selected ? 'bg-brand/10' : 'hover:bg-muted/40',
        resolved
          ? 'pointer-events-none max-h-0 overflow-hidden !border-b-0 !py-0 opacity-0'
          : 'max-h-36 opacity-100 px-3 py-2.5',
      )}
    >
      {!resolved && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-foreground">
                {item.target === 'dispatch' ? item.dispatchNumber : item.order.orderNumber}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  TONE_RISK[item.tone],
                )}
              >
                {item.tone === 'destructive' ? (
                  <AlertTriangle className="h-2.5 w-2.5" />
                ) : (
                  <Timer className="h-2.5 w-2.5" />
                )}
                {item.riskLabel}
              </span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {item.elapsed}
              </span>
            </div>
            <p className="truncate text-sm font-medium text-foreground">{item.route}</p>
            <p className="truncate text-[11px] text-muted-foreground">{item.customer}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {item.driver}
              <span className="mx-1 text-border">·</span>
              <span className="font-mono">{item.vehicle}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {showPrimary ? (
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => onPrimaryAction(item)}>
                {item.primaryLabel}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => onSelect(item)}>
                View
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label="Queue item actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {item.target === 'dispatch' && (
                  <>
                    <DropdownMenuItem onClick={() => onSelect(item)}>
                      <Package className="mr-2 h-3.5 w-3.5" />
                      Open
                    </DropdownMenuItem>
                    {item.dispatch.driver?.phone && (
                      <DropdownMenuItem onClick={() => onCall(item.dispatch)}>
                        <Phone className="mr-2 h-3.5 w-3.5" />
                        Call
                      </DropdownMenuItem>
                    )}
                    {canWrite && item.dispatch.allowedTransitions.length > 0 && (
                      <DropdownMenuItem onClick={() => onReassign(item.dispatch)}>
                        <UserRoundCog className="mr-2 h-3.5 w-3.5" />
                        Reassign
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onViewFullDetail(item.dispatch.id)}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Full detail
                    </DropdownMenuItem>
                    {item.dispatch.order && (
                      <DropdownMenuItem onClick={() => onViewOrder(item.dispatch.orderId)}>
                        Open order
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {item.target === 'order' && (
                  <DropdownMenuItem onClick={() => onViewOrder(item.order.id)}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    View order
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
});

interface WorkQueueProps {
  items: QueueItem[];
  resolvedIds: Set<string>;
  selectedId: string | null;
  canWrite?: boolean;
  onSelect: (item: QueueItem) => void;
  onPrimaryAction: (item: QueueItem) => void;
  onViewFullDetail: (id: string) => void;
  onViewOrder: (orderId: string) => void;
  onReassign: (dispatch: ApiDispatch) => void;
  onCall: (dispatch: ApiDispatch) => void;
}

export function WorkQueue({
  items,
  resolvedIds,
  selectedId,
  canWrite = true,
  onSelect,
  onPrimaryAction,
  onViewFullDetail,
  onViewOrder,
  onReassign,
  onCall,
}: WorkQueueProps) {
  const bySection = SECTION_META.map((section) => ({
    ...section,
    items: items.filter((i) => i.section === section.key),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3.5 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Operations Queue
          {items.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
              {items.length}
            </span>
          ) : null}
        </h2>
      </div>
      <div
        role="listbox"
        aria-label="Operations queue"
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        {bySection.map((section) => (
          <div key={section.key}>
            <div className={cn(
              'sticky top-0 z-[1] border-b border-border/50 bg-background/95 px-3.5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80',
              section.urgent && 'border-destructive/20 bg-destructive/5 supports-[backdrop-filter]:bg-destructive/5',
            )}>
              <p className={cn(
                'text-[10px] font-semibold uppercase tracking-wider',
                section.urgent ? 'text-destructive' : 'text-foreground/70',
              )}>
                {section.label}
                <span className={cn(
                  'ml-1 tabular-nums',
                  section.urgent ? 'text-destructive/70' : 'text-muted-foreground',
                )}>{section.items.length}</span>
              </p>
            </div>
            {section.items.map((item) => (
              <WorkQueueRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                resolved={resolvedIds.has(item.id)}
                canWrite={canWrite}
                onSelect={onSelect}
                onPrimaryAction={onPrimaryAction}
                onViewFullDetail={onViewFullDetail}
                onViewOrder={onViewOrder}
                onReassign={onReassign}
                onCall={onCall}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
