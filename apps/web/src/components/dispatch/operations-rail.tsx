'use client';

import { Phone, AlertTriangle } from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';
import { StatusBadge } from '@/components/shared/status-badge';
import { DriverOperationalStatusBadge } from '@/components/shared/driver-operational-status-badge';
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

  const boardDriver =
    board && driver
      ? board.drivers.available.find((d) => d.id === driver.id) ??
        board.drivers.busy.find((b) => b.driver.id === driver.id)?.driver ??
        board.drivers.onBreak?.find((d) => d.id === driver.id) ??
        board.drivers.onLeave.find((d) => d.id === driver.id) ??
        null
      : null;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-muted/15">
      <div className="shrink-0 border-b border-border/60 px-3.5 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assignment
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin">
        {!driver && !vehicle && !order ? (
          <p className="pt-2 text-center text-xs text-muted-foreground/60">Select a dispatch</p>
        ) : (
          <>
            {driver && (
              <div className="rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                    {(driver.firstName[0] ?? '') + (driver.lastName[0] ?? '')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-foreground">
                        {driver.firstName} {driver.lastName}
                      </p>
                      <StatusBadge status={driver.status} />
                    </div>
                    {driver.phone && (
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-brand hover:underline"
                        onClick={() => onCallDriver?.(driver.phone)}
                      >
                        <Phone className="h-2.5 w-2.5" />
                        {driver.phone}
                      </button>
                    )}
                    {boardDriver?.operationalStatus && (
                      <div className="mt-1">
                        <DriverOperationalStatusBadge
                          status={boardDriver.operationalStatus}
                          onBreak={boardDriver.onBreak}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {driverBusyJobs > 1 && (
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-warning">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {driverBusyJobs} active jobs
                  </p>
                )}
              </div>
            )}

            {vehicle && (
              <div className="rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-foreground">{vehicle.plateNumber}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                      {vehicle.type} · {vehicle.vehicleCode}
                    </p>
                  </div>
                  <StatusBadge status={vehicle.status} />
                </div>
              </div>
            )}

            {order && (
              <div className="rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                <p className="font-mono text-[11px] font-semibold text-brand">{order.orderNumber}</p>
                <p className="mt-0.5 text-xs font-medium text-foreground">
                  {order.pickupCity} → {order.deliveryCity}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {order.customer?.companyName ?? '—'}
                </p>
                {selectedDispatch && isDispatchOverdue(selectedDispatch) && (
                  <p className="mt-1 text-[10px] font-semibold text-destructive">Delivery overdue</p>
                )}
              </div>
            )}
          </>
        )}

        <section className="space-y-1 border-t border-border/50 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Shift
          </p>
          <ul className="space-y-0.5 text-xs">
            <RailStat label="Free drivers" value={counts.driversAvailable} tone="success" />
            <RailStat label="Free vehicles" value={counts.idleVehicles} tone="success" />
            <RailStat label="Busy drivers" value={board?.drivers.busy.length ?? 0} tone="muted" />
            <RailStat
              label="Unassigned"
              value={counts.needsAssignment}
              tone={counts.needsAssignment > 0 ? 'warning' : 'muted'}
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
