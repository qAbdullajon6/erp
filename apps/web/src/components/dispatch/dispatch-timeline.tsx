'use client';

import { Link } from '@tanstack/react-router';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import type { Vehicle as LiveVehicle } from '@/lib/api/telematics';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AlertTriangle, Check, Radio, Truck, User, X } from 'lucide-react';

const STEPS: { status: DispatchStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'ASSIGNED', label: 'Assigned' },
  { status: 'EN_ROUTE_TO_PICKUP', label: 'To pickup' },
  { status: 'AT_PICKUP', label: 'At pickup' },
  { status: 'IN_TRANSIT', label: 'Transit' },
  { status: 'DELIVERED', label: 'Delivered' },
];

const STEP_INDEX: Record<DispatchStatus, number> = {
  DRAFT: 0,
  ASSIGNED: 1,
  EN_ROUTE_TO_PICKUP: 2,
  AT_PICKUP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  CANCELLED: -1,
};

interface DispatchTimelineProps {
  dispatch: ApiDispatch;
  live?: LiveVehicle | null;
  overdue?: boolean;
  onStageClick?: (status: DispatchStatus) => void;
}

/// Dense mission strip for a dispatch — progress from `status` / history only.
export function DispatchTimeline({
  dispatch,
  live,
  overdue,
  onStageClick,
}: DispatchTimelineProps) {
  const reachedAt = new Map<DispatchStatus, string>();
  for (const entry of dispatch.statusHistory ?? []) {
    const s = entry.status as DispatchStatus;
    if (!reachedAt.has(s)) reachedAt.set(s, entry.createdAt);
  }
  if (!reachedAt.has(dispatch.status) && dispatch.status !== 'CANCELLED') {
    reachedAt.set(dispatch.status, dispatch.updatedAt);
  }
  if (!reachedAt.has('ASSIGNED') && dispatch.status !== 'DRAFT' && dispatch.status !== 'CANCELLED') {
    reachedAt.set('ASSIGNED', dispatch.createdAt);
  }

  const cancelled = dispatch.status === 'CANCELLED';
  const currentStep = cancelled
    ? Math.max(0, ...[...reachedAt.keys()].map((s) => STEP_INDEX[s]).filter((i) => i >= 0))
    : STEP_INDEX[dispatch.status];

  const chips: { key: string; node: React.ReactNode }[] = [];
  if (overdue) {
    chips.push({
      key: 'late',
      node: (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Late
        </span>
      ),
    });
  }
  if (dispatch.driver) {
    chips.push({
      key: 'driver',
      node: (
        <Link
          to="/app/drivers/$driverId"
          params={{ driverId: dispatch.driver.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand">
            {(dispatch.driver.firstName[0] ?? '') + (dispatch.driver.lastName[0] ?? '')}
          </span>
          {dispatch.driver.firstName} {dispatch.driver.lastName}
        </Link>
      ),
    });
  }
  if (dispatch.vehicle) {
    chips.push({
      key: 'vehicle',
      node: (
        <Link
          to="/app/vehicles/$vehicleId"
          params={{ vehicleId: dispatch.vehicle.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground hover:bg-muted"
        >
          <Truck className="h-3 w-3 text-brand" />
          {dispatch.vehicle.plateNumber}
        </Link>
      ),
    });
  }
  if (dispatch.order) {
    chips.push({
      key: 'order',
      node: (
        <Link
          to="/app/orders/$orderId"
          params={{ orderId: dispatch.orderId }}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground hover:bg-muted"
        >
          {dispatch.order.orderNumber}
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
  if (!dispatch.driver) {
    chips.push({
      key: 'unassigned',
      node: (
        <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
          <User className="h-3 w-3" />
          No driver
        </span>
      ),
    });
  }

  return (
    <div className="space-y-2.5">
      <ol className="flex w-full items-start" aria-label="Dispatch mission timeline">
        {STEPS.map((step, i) => {
          const done = !cancelled && currentStep > i;
          const current = !cancelled && currentStep === i;
          const skipped = cancelled && currentStep < i;
          const at = reachedAt.get(step.status);
          return (
            <li key={step.status} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i > 0 && (
                <span
                  className={cn(
                    'absolute left-0 right-1/2 top-[11px] h-0.5 -translate-y-1/2',
                    done || current ? 'bg-brand' : 'bg-border',
                    cancelled && skipped && 'bg-border',
                  )}
                  aria-hidden="true"
                />
              )}
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    'absolute left-1/2 right-0 top-[11px] h-0.5 -translate-y-1/2',
                    done ? 'bg-brand' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                disabled={!onStageClick}
                onClick={() => onStageClick?.(step.status)}
                className={cn(
                  'relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[10px]',
                  done && 'border-brand bg-brand text-brand-foreground',
                  current && 'border-brand bg-background text-brand ring-4 ring-brand/15',
                  !done && !current && 'border-border bg-background text-muted-foreground',
                  cancelled && step.status === 'CANCELLED' && 'border-destructive',
                  onStageClick && 'cursor-pointer hover:opacity-90',
                )}
                aria-current={current ? 'step' : undefined}
                aria-label={step.label}
              >
                {done ? <Check className="h-3 w-3" /> : cancelled && skipped ? <X className="h-2.5 w-2.5" /> : i + 1}
              </button>
              <span
                className={cn(
                  'mt-1.5 max-w-full truncate px-0.5 text-center text-[10px] font-medium',
                  current ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
              {at && (
                <span className="max-w-full truncate px-0.5 text-center text-[9px] text-muted-foreground">
                  {formatRelativeTime(at)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {cancelled && (
        <p className="text-xs font-medium text-destructive">This dispatch was cancelled.</p>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">{chips.map((c) => <span key={c.key}>{c.node}</span>)}</div>
      )}
    </div>
  );
}
