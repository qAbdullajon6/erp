'use client';

import { Link } from '@tanstack/react-router';
import type { Order, OrderStatus } from '@/lib/api/orders';
import type { Driver } from '@/lib/api/drivers';
import type { Vehicle } from '@/lib/api/vehicles';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { Vehicle as LiveVehicle } from '@/lib/api/telematics';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AlertTriangle, Check, Radio, Truck, User, X } from 'lucide-react';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Created' },
  { status: 'PENDING', label: 'Planned' },
  { status: 'ASSIGNED', label: 'Assigned' },
  { status: 'PICKED_UP', label: 'Pickup' },
  { status: 'IN_TRANSIT', label: 'Transit' },
  { status: 'DELIVERED', label: 'Delivered' },
];

const STEP_INDEX: Record<OrderStatus, number> = {
  DRAFT: 0,
  PENDING: 1,
  ASSIGNED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  CANCELLED: -1,
};

interface OrderTimelineProps {
  order: Order;
  driver?: Driver | null;
  vehicle?: Vehicle | null;
  dispatch?: ApiDispatch | null;
  live?: LiveVehicle | null;
  onStageClick?: (status: OrderStatus) => void;
}

/// Dense mission strip: progress + live context chips (only real data).
export function OrderTimeline({
  order,
  driver,
  vehicle,
  dispatch,
  live,
  onStageClick,
}: OrderTimelineProps) {
  const reachedAt = new Map<OrderStatus, string>();
  for (const entry of order.statusHistory ?? []) {
    if (!reachedAt.has(entry.status)) reachedAt.set(entry.status, entry.createdAt);
  }
  if (!reachedAt.has('DRAFT')) reachedAt.set('DRAFT', order.createdAt);

  const cancelled = order.status === 'CANCELLED';
  const currentStep = cancelled
    ? Math.max(0, ...[...reachedAt.keys()].map((s) => STEP_INDEX[s]).filter((i) => i >= 0))
    : STEP_INDEX[order.status];

  const chips: { key: string; node: React.ReactNode }[] = [];
  if (order.isDelayed) {
    chips.push({
      key: 'delay',
      node: (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Delayed
        </span>
      ),
    });
  }
  if (driver) {
    chips.push({
      key: 'driver',
      node: (
        <Link
          to="/app/drivers/$driverId"
          params={{ driverId: driver.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand">
            {(driver.firstName[0] ?? '') + (driver.lastName[0] ?? '')}
          </span>
          {driver.firstName} {driver.lastName}
        </Link>
      ),
    });
  }
  if (vehicle) {
    chips.push({
      key: 'vehicle',
      node: (
        <Link
          to="/app/vehicles/$vehicleId"
          params={{ vehicleId: vehicle.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground hover:bg-muted"
        >
          <Truck className="h-3 w-3 text-brand" />
          {vehicle.plateNumber}
        </Link>
      ),
    });
  }
  if (dispatch) {
    chips.push({
      key: 'dispatch',
      node: (
        <Link
          to="/app/dispatches/$dispatchId"
          params={{ dispatchId: dispatch.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground hover:bg-muted"
        >
          {dispatch.dispatchNumber}
          <span className="font-sans font-medium capitalize text-muted-foreground">
            · {dispatch.status.toLowerCase().replace(/_/g, ' ')}
          </span>
        </Link>
      ),
    });
  }
  if (live?.movementState && live.movementState !== 'UNKNOWN') {
    chips.push({
      key: 'live',
      node: (
        <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium capitalize text-brand">
          <Radio className="h-3 w-3" />
          {live.movementState.toLowerCase()}
          {live.speedKph != null ? ` · ${Math.round(live.speedKph)} km/h` : ''}
          {live.lastReceivedAt ? ` · GPS ${formatRelativeTime(live.lastReceivedAt)}` : ''}
        </span>
      ),
    });
  }
  if (!driver && order.status === 'PENDING') {
    chips.push({
      key: 'unassigned',
      node: (
        <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
          <User className="h-3 w-3" />
          Needs assignment
        </span>
      ),
    });
  }

  return (
    <div className="space-y-2.5">
      <ol className="flex w-full items-start" aria-label="Shipment timeline">
        {STEPS.map((step, i) => {
          const time = reachedAt.get(step.status);
          const isReached = i <= currentStep;
          const isCurrent = !cancelled && i === currentStep;
          const isDone = isReached && !isCurrent;
          const clickable = Boolean(onStageClick && isReached && time);

          return (
            <li key={step.status} className="flex min-w-0 flex-1 items-start">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStageClick?.(step.status)}
                className={cn(
                  'flex w-full flex-col items-center px-0.5 py-0.5 text-center',
                  clickable &&
                    'cursor-pointer rounded-md hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                  !clickable && 'cursor-default',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
                    isCurrent
                      ? 'bg-brand text-brand-foreground ring-2 ring-brand/30'
                      : isDone
                        ? 'bg-brand/20 text-brand'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'mt-1 text-[11px] leading-none',
                    isCurrent ? 'font-semibold text-foreground' : isDone ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 hidden text-[9px] tabular-nums text-muted-foreground sm:block">
                  {time && isReached
                    ? formatDateTime(time).replace(/,\s*\d{4}/, '').replace(/\s*(AM|PM)/, '')
                    : '—'}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'mt-[11px] h-0.5 min-w-[8px] flex-1 rounded-full',
                    i < currentStep ? 'bg-brand/45' : 'bg-border',
                  )}
                />
              )}
            </li>
          );
        })}
        {cancelled && (
          <li className="flex shrink-0 items-start pl-1">
            <div className="flex flex-col items-center px-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                <X className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 text-[11px] font-semibold text-destructive">Cancelled</span>
            </div>
          </li>
        )}
      </ol>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
          {chips.map((c) => (
            <span key={c.key}>{c.node}</span>
          ))}
        </div>
      )}
    </div>
  );
}
