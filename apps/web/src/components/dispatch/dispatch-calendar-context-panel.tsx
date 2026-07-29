'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowRight,
  Building2,
  MapPin,
  Package,
  Truck,
  User,
  UserRoundCog,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { statusLabel } from '@/components/shared/status-badge';
import { useDispatchDetail, useUpdateDispatchStatus } from '@/lib/hooks/use-dispatches';
import { cn } from '@/lib/utils';
import { DispatchReassignDialog } from '@/components/dispatch/dispatch-reassign-dialog';
import { DispatchConflictPanel } from '@/components/dispatch/dispatch-conflict-panel';
import {
  CALENDAR_STATUS_DOT,
  driverShortName,
  type CalendarEvent,
} from './dispatch-calendar-utils';

interface DispatchCalendarContextPanelProps {
  event: CalendarEvent | null;
  canWrite: boolean;
  onClose: () => void;
  onOpenDispatch: (id: string) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onMutated: () => Promise<void>;
}

export function DispatchCalendarContextPanel({
  event,
  canWrite,
  onClose,
  onOpenDispatch,
  onOpenOrder,
  onOpenCustomer,
  onMutated,
}: DispatchCalendarContextPanelProps) {
  const dispatchId = event?.id;
  const { data: detail, loading: detailLoading } = useDispatchDetail(dispatchId ?? '');
  const live = detail ?? event?.dispatch;
  const { updateStatus, loading: statusSaving } = useUpdateDispatchStatus(dispatchId ?? '');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [statusChoice, setStatusChoice] = useState<string>('');

  useEffect(() => {
    setStatusChoice('');
    setReassignOpen(false);
  }, [dispatchId]);

  const handleStatusChange = async (status: DispatchStatus) => {
    if (!dispatchId || !live) return;
    try {
      await updateStatus({ status });
      toast.success(`${live.dispatchNumber} → ${statusLabel(status)}`);
      await onMutated();
    } catch (err) {
      toast.error(describeError(err, 'Status change rejected'));
    }
  };

  const nextStatuses = live?.allowedTransitions.filter((s) => s !== 'CANCELLED') ?? [];
  const canReassign = canWrite && (live?.allowedTransitions.length ?? 0) > 0;

  return (
    <>
      <aside
        className="flex h-full w-full flex-col border-l border-white/[0.08] bg-surface/80 transition-opacity duration-150"
        data-testid="calendar-context-panel"
        aria-label="Selected dispatch"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Dispatcher workspace
          </p>
          {event ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0"
              onClick={onClose}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        {!live || !event ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <Package className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No dispatch selected</p>
            <p className="text-xs text-muted-foreground">
              Select an event to change status, reassign resources, or jump to order and customer.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
            <div className="border-b border-white/[0.08] px-3 py-3">
              <div className="flex items-start gap-2">
                <span
                  className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', CALENDAR_STATUS_DOT[live.status])}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold tracking-tight text-foreground">
                    {live.dispatchNumber}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {statusLabel(live.status)}
                    {detailLoading ? ' · updating…' : null}
                  </p>
                </div>
              </div>
              <p className="mt-2 truncate text-sm text-foreground/90">
                {live.order?.customer?.companyName ?? '—'}
              </p>
            </div>

            {canWrite && nextStatuses.length > 0 && (
              <div className="space-y-2 border-b border-white/[0.08] px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Quick status
                </p>
                <Select
                  value={statusChoice}
                  onValueChange={(v) => {
                    setStatusChoice(v);
                    void handleStatusChange(v as DispatchStatus);
                  }}
                  disabled={statusSaving}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="calendar-context-status">
                    <SelectValue placeholder="Change status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {nextStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {nextStatuses.slice(0, 2).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="secondary"
                      className="h-7 flex-1 text-[11px] transition-all duration-150"
                      disabled={statusSaving}
                      onClick={() => void handleStatusChange(s)}
                    >
                      {statusLabel(s)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {canWrite && canReassign && (
              <div className="space-y-2 border-b border-white/[0.08] px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Quick reassign
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] transition-all duration-150"
                    onClick={() => setReassignOpen(true)}
                    data-testid="calendar-context-reassign"
                  >
                    <UserRoundCog className="mr-1 h-3 w-3" />
                    Driver / Vehicle
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 border-b border-white/[0.08] px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Details
              </p>
              <PanelRow icon={User} label="Driver" value={driverShortName(live)} />
              <PanelRow icon={Truck} label="Vehicle" value={live.vehicle?.plateNumber ?? '—'} />
              <PanelRow icon={Package} label="Order" value={live.order?.orderNumber ?? '—'} />
              <PanelRow
                icon={MapPin}
                label="Route"
                value={`${live.order?.pickupCity ?? '—'} → ${live.order?.deliveryCity ?? '—'}`}
              />
            </div>

            <div className="border-b border-white/[0.08] px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Schedule
              </p>
              <dl className="space-y-2 text-sm">
                <ScheduleRow label="Pickup" value={format(event.start, 'EEE, MMM d · HH:mm')} />
                <ScheduleRow label="ETA" value={format(event.end, 'EEE, MMM d · HH:mm')} />
              </dl>
            </div>

            <div className="border-b border-white/[0.08] px-3 py-3">
              <DispatchConflictPanel
                dispatchId={live.id}
                compact
                onSwapDriver={() => setReassignOpen(true)}
                onSwapVehicle={() => setReassignOpen(true)}
              />
            </div>

            {live.statusHistory && live.statusHistory.length > 0 && (
              <div className="border-b border-white/[0.08] px-3 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Timeline
                </p>
                <ol className="space-y-2">
                  {live.statusHistory.slice(0, 4).map((entry) => (
                    <li key={entry.id} className="flex gap-2 text-xs">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/80" />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{statusLabel(entry.status)}</p>
                        <p className="text-muted-foreground">
                          {format(new Date(entry.createdAt), 'MMM d · HH:mm')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="mt-auto space-y-1.5 border-t border-white/[0.08] p-3">
              <Button
                className="w-full bg-gradient-brand text-brand-foreground transition-all duration-150 hover:opacity-90"
                size="sm"
                data-testid="calendar-open-dispatch"
                onClick={() => onOpenDispatch(live.id)}
              >
                Open dispatch
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
              {live.orderId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={() => onOpenOrder(live.orderId)}
                >
                  <Package className="mr-1 h-3 w-3" />
                  Open order
                </Button>
              ) : null}
              {live.order?.customer?.id ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={() => onOpenCustomer(live.order!.customer!.id)}
                >
                  <Building2 className="mr-1 h-3 w-3" />
                  Open customer
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </aside>

      <DispatchReassignDialog
        dispatch={reassignOpen ? (live as ApiDispatch) : null}
        onClose={() => setReassignOpen(false)}
        onSuccess={() => {
          void onMutated();
        }}
      />
    </>
  );
}

function PanelRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function ScheduleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}
