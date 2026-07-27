'use client';

import { Phone, User, Truck, Package, AlertTriangle } from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { BoardOpsCounts } from './dispatch-ops';
import { isDispatchOverdue } from './dispatch-ops';

/// Sticky operations rail — selected context + compact shift snapshot.
/// Avoids repeating the header filter strip; only adds selection context.

interface Props {
  selectedDispatch: ApiDispatch | null;
  board: DispatchBoardSummary | null;
  counts: BoardOpsCounts;
  onCallDriver?: (phone: string) => void;
}

export function OperationsRail({ selectedDispatch, board, counts, onCallDriver }: Props) {
  const driver = selectedDispatch?.driver;
  const vehicle = selectedDispatch?.vehicle;
  const order = selectedDispatch?.order;

  const driverBusyJobs =
    board && driver
      ? board.drivers.busy.filter((b) => b.driver.id === driver.id).length
      : 0;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-muted/15">
      <div className="shrink-0 border-b border-border/60 px-3.5 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Context
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 scrollbar-thin">
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <User className="h-3 w-3" aria-hidden="true" />
            Driver
          </p>
          {driver ? (
            <div className="rounded-lg border border-border/60 bg-card/80 p-3">
              <p className="text-sm font-medium text-foreground">
                {driver.firstName} {driver.lastName}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">{driver.employeeCode}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <StatusBadge status={driver.status} />
                {driver.phone && (
                  <button
                    type="button"
                    className="inline-flex min-h-7 items-center gap-1 text-xs font-medium text-brand hover:underline"
                    onClick={() => onCallDriver?.(driver.phone)}
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </button>
                )}
              </div>
              {driverBusyJobs > 1 && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {driverBusyJobs} live jobs
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
              No dispatch selected
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Truck className="h-3 w-3" aria-hidden="true" />
            Vehicle
          </p>
          {vehicle ? (
            <div className="rounded-lg border border-border/60 bg-card/80 p-3">
              <p className="font-mono text-sm font-medium text-foreground">{vehicle.plateNumber}</p>
              <p className="text-[11px] capitalize text-muted-foreground">
                {vehicle.type}
                <span className="mx-1">·</span>
                {vehicle.vehicleCode}
              </p>
              <div className="mt-1.5">
                <StatusBadge status={vehicle.status} />
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
              No dispatch selected
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Package className="h-3 w-3" aria-hidden="true" />
            Order
          </p>
          {order ? (
            <div className="rounded-lg border border-border/60 bg-card/80 p-3">
              <p className="font-mono text-sm font-medium text-foreground">{order.orderNumber}</p>
              <p className="mt-0.5 text-xs text-foreground">
                {order.pickupCity} → {order.deliveryCity}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {order.customer?.companyName ?? '—'}
              </p>
              <div className="mt-1.5">
                <StatusBadge status={order.status} />
              </div>
              {selectedDispatch && isDispatchOverdue(selectedDispatch) && (
                <p className="mt-1.5 text-[11px] font-semibold text-destructive">Delivery overdue</p>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
              No dispatch selected
            </p>
          )}
        </section>

        {/* Single compact snapshot — not a second copy of the filter strip */}
        <section className="space-y-2 border-t border-border/50 pt-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Shift snapshot
          </p>
          <ul className="space-y-0.5 text-xs">
            <RailStat label="Free drivers" value={counts.driversAvailable} tone="success" />
            <RailStat label="Free vehicles" value={counts.idleVehicles} tone="success" />
            <RailStat
              label="Busy drivers"
              value={board?.drivers.busy.length ?? 0}
              tone="muted"
            />
            <RailStat
              label="Unassigned"
              value={counts.needsAssignment}
              tone={counts.needsAssignment > 0 ? 'warning' : 'muted'}
            />
            <RailStat
              label="Overloaded"
              value={counts.needsReassignment}
              tone={counts.needsReassignment > 0 ? 'warning' : 'muted'}
            />
          </ul>
        </section>
      </div>
    </aside>
  );
}

function RailStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'destructive' | 'warning' | 'brand' | 'success' | 'muted';
}) {
  const toneClass = {
    destructive: 'text-destructive',
    warning: 'text-warning',
    brand: 'text-brand',
    success: 'text-success',
    muted: 'text-foreground',
  }[tone];

  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-1 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold tabular-nums', toneClass)}>{value}</span>
    </li>
  );
}
