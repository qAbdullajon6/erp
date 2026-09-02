'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  MapPin,
  Phone,
  UserRoundCog,
  Package,
  Truck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ApiDispatch, ApiDispatchStop, DispatchStatus } from '@/lib/api/dispatches';
import type { BoardOrderSummary } from '@/lib/api/dashboard';
import { describeError } from '@/lib/api/describe-error';
import { useAvailability } from '@/lib/api/availability';
import { useAssignOrder } from '@/lib/api/orders';
import { useDispatchDetail, useUpdateDispatch, useUpdateDispatchStatus } from '@/lib/hooks/use-dispatches';
import { useCurrentUser } from '@/lib/api/auth';
import { DISPATCH_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getDeliveryUrgency, isDispatchOverdue, WAITING_PICKUP } from './dispatch-ops';

/// Selected dispatch / order workspace — permanent surface beside the queue.
/// Status transitions come only from `allowedTransitions` (server).

const NEXT_ACTION_LABEL: Partial<Record<DispatchStatus, string>> = {
  EN_ROUTE_TO_PICKUP: 'Head to pickup',
  AT_PICKUP: 'Arrived at pickup',
  AT_STOP: 'At stop',
  ARRIVED_AT_DELIVERY: 'Arrived — confirm delivery',
  IN_TRANSIT: 'Mark picked up',
  DELIVERED: 'Mark delivered',
};

// ─── Stop progress ────────────────────────────────────────────────────────────

type StopState = 'done' | 'active' | 'current' | 'upcoming';

function stopState(stop: ApiDispatchStop, prevDone: boolean): StopState {
  if (stop.completedAt) return 'done';
  if (stop.arrivedAt) return 'active';
  if (prevDone) return 'current';
  return 'upcoming';
}

function StopsProgress({ stops }: { stops: ApiDispatchStop[] }) {
  const sorted = [...stops].sort((a, b) => a.stopIndex - b.stopIndex);
  const entries = sorted.map((stop, i) => {
    const prev = sorted[i - 1];
    const prevDone = i === 0 || Boolean(prev?.completedAt);
    return { stop, state: stopState(stop, prevDone) };
  });

  return (
    <div>
      {entries.map(({ stop, state }, idx) => {
        const isLast = idx === entries.length - 1;
        const label =
          stop.placeName ??
          (stop.stopType === 'PICKUP'
            ? `Pickup · ${stop.city}`
            : stop.stopType === 'DELIVERY'
              ? `Delivery · ${stop.city}`
              : stop.city);

        return (
          <div key={stop.id} className="flex items-stretch gap-3">
            {/* Track column */}
            <div className="flex w-5 shrink-0 flex-col items-center pt-0.5">
              {state === 'done' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              ) : state === 'active' ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/20 ring-2 ring-brand/40">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                </span>
              ) : state === 'current' ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 ring-1 ring-brand/30">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/50">
                  <Circle className="h-3 w-3 text-border/60" />
                </span>
              )}
              {!isLast && (
                <div
                  className={cn(
                    'mt-1 w-0.5 flex-1',
                    state === 'done' ? 'bg-success/30' : 'bg-border/30',
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div
              className={cn(
                'min-w-0 rounded-lg px-2.5 py-2',
                !isLast && 'mb-1',
                (state === 'active' || state === 'current') && 'bg-brand/5',
              )}
            >
              <p
                className={cn(
                  'text-sm font-medium leading-5',
                  state === 'done' && 'text-muted-foreground',
                  (state === 'active' || state === 'current') && 'text-foreground',
                  state === 'upcoming' && 'text-muted-foreground/50',
                )}
              >
                {label}
              </p>
              {state === 'done' && stop.completedAt && (
                <p className="mt-0.5 text-[11px] text-success/80">
                  Departed {formatRelativeTime(stop.completedAt)}
                </p>
              )}
              {state === 'active' && stop.arrivedAt && (
                <p className="mt-0.5 text-[11px] font-medium text-brand">
                  Arrived {formatRelativeTime(stop.arrivedAt)}
                </p>
              )}
              {state === 'current' && (
                <p className="mt-0.5 text-[11px] font-medium text-brand">En route · approaching</p>
              )}
              {stop.instructions && (state === 'current' || state === 'active') && (
                <p className="mt-1 text-[11px] italic text-muted-foreground/70 line-clamp-1">
                  {stop.instructions}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type Selection =
  | { kind: 'dispatch'; dispatch: ApiDispatch }
  | { kind: 'order'; order: BoardOrderSummary };

interface Props {
  selection: Selection | null;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
  onViewFullDetail: (id: string) => void;
  onAssigned: (orderId: string) => void;
  onStatusChanged: (dispatchId: string) => void;
}

export function SelectedWorkPanel({
  selection,
  onReassign,
  onCancel,
  onViewOrder,
  onViewFullDetail,
  onAssigned,
  onStatusChanged,
}: Props) {
  const { data: currentUser } = useCurrentUser();
  const canWrite = Boolean(
    currentUser && DISPATCH_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  if (!selection) {
    return (
      <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-1.5 p-6 text-center">
        <Truck className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">No shipment selected</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Select a queue item or click a board card to inspect it here.
        </p>
      </div>
    );
  }

  if (selection.kind === 'order') {
    if (!canWrite) {
      return (
        <div className="space-y-2 p-4">
          <p className="font-mono text-sm font-semibold text-foreground">{selection.order.orderNumber}</p>
          <p className="text-sm text-muted-foreground">
            This order needs a driver. Ask a dispatcher or operations manager to assign it.
          </p>
        </div>
      );
    }
    return <AssignForm order={selection.order} onAssigned={onAssigned} />;
  }

  return (
    <DispatchWorkspace
      dispatch={selection.dispatch}
      canWrite={canWrite}
      onReassign={onReassign}
      onCancel={onCancel}
      onViewOrder={onViewOrder}
      onViewFullDetail={onViewFullDetail}
      onStatusChanged={onStatusChanged}
    />
  );
}

// ─── Assign form ──────────────────────────────────────────────────────────────

function AssignForm({ order, onAssigned }: { order: BoardOrderSummary; onAssigned: (orderId: string) => void }) {
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDriverId('');
    setVehicleId('');
    setError('');
  }, [order.id]);

  const {
    data: availability,
    loading: availabilityLoading,
    error: availabilityError,
    refetch: refetchAvailability,
  } = useAvailability({
    pickupDate: order.pickupDate,
    deliveryDate: order.deliveryDate,
  });
  const { assign, loading: saving } = useAssignOrder();

  const noneFree =
    !availabilityLoading &&
    !availabilityError &&
    ((availability?.drivers.length ?? 0) === 0 || (availability?.vehicles.length ?? 0) === 0);

  const handleAssign = async () => {
    if (!driverId || !vehicleId) {
      setError('Choose a driver and a vehicle');
      return;
    }
    try {
      await assign(order.id, { driverId, vehicleId });
      toast.success(`${order.orderNumber} assigned`);
      onAssigned(order.id);
    } catch (err) {
      setError(describeError(err, 'Failed to assign'));
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</p>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            Needs assignment
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-base font-semibold text-foreground">
          <span>{order.pickupCity}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
          <span>{order.deliveryCity}</span>
        </p>
        {order.customerName && (
          <p className="mt-0.5 text-sm text-muted-foreground">{order.customerName}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Pickup {formatDate(order.pickupDate)} · Delivery {formatDate(order.deliveryDate)}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {availabilityError ? (
        <div className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{availabilityError}</p>
          <Button size="sm" variant="outline" onClick={() => void refetchAvailability()}>
            Retry
          </Button>
        </div>
      ) : noneFree ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          No free drivers or vehicles for this window.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Driver</label>
          <Select value={driverId || undefined} onValueChange={setDriverId} disabled={availabilityLoading || Boolean(availabilityError)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={availabilityLoading ? 'Checking…' : 'Select driver'} />
            </SelectTrigger>
            <SelectContent>
              {availability?.drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Vehicle</label>
          <Select value={vehicleId || undefined} onValueChange={setVehicleId} disabled={availabilityLoading || Boolean(availabilityError)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={availabilityLoading ? 'Checking…' : 'Select vehicle'} />
            </SelectTrigger>
            <SelectContent>
              {availability?.vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.plateNumber} — {v.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        className="w-full bg-gradient-brand text-brand-foreground hover:opacity-90"
        onClick={() => void handleAssign()}
        disabled={saving || availabilityLoading || Boolean(availabilityError) || !driverId || !vehicleId}
      >
        {saving ? 'Assigning…' : 'Assign driver'}
      </Button>
    </div>
  );
}

// ─── Dispatch workspace ───────────────────────────────────────────────────────

function DispatchWorkspace({
  dispatch,
  canWrite,
  onReassign,
  onCancel,
  onViewOrder,
  onViewFullDetail,
  onStatusChanged,
}: {
  dispatch: ApiDispatch;
  canWrite: boolean;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
  onViewFullDetail: (id: string) => void;
  onStatusChanged: (dispatchId: string) => void;
}) {
  const { data: detail } = useDispatchDetail(dispatch.id);
  const live = detail ?? dispatch;
  const { updateStatus, loading: statusSaving } = useUpdateDispatchStatus(dispatch.id);
  const { update: updateNotes, loading: notesSaving } = useUpdateDispatch(dispatch.id);

  const [notes, setNotes] = useState(live.notes ?? '');
  useEffect(() => {
    setNotes(live.notes ?? '');
  }, [live.id, live.notes]);

  const canCancel = canWrite && live.allowedTransitions.includes('CANCELLED');
  const nextStatuses = canWrite
    ? live.allowedTransitions.filter((s) => s !== 'CANCELLED')
    : [];
  const canReassign = canWrite && live.allowedTransitions.length > 0;
  const overdue = isDispatchOverdue(live);
  const waiting = WAITING_PICKUP.has(live.status);
  const urgency =
    live.status !== 'DELIVERED' && live.status !== 'CANCELLED'
      ? getDeliveryUrgency(live.deliveryDateScheduled)
      : null;
  const isLive = live.status === 'IN_TRANSIT' || live.status === 'AT_STOP' || live.status === 'EN_ROUTE_TO_PICKUP' || live.status === 'AT_PICKUP' || live.status === 'ARRIVED_AT_DELIVERY';

  const handleNextAction = async (status: DispatchStatus) => {
    try {
      await updateStatus({ status });
      toast.success(`${live.dispatchNumber} → ${statusLabel(status)}`);
      onStatusChanged(live.id);
    } catch (err) {
      toast.error(describeError(err, 'Move rejected'));
    }
  };

  const saveNotes = async () => {
    try {
      await updateNotes({ notes: notes.trim() || undefined });
      toast.success('Notes saved');
    } catch (err) {
      toast.error(describeError(err, 'Failed to save notes'));
    }
  };

  const history = live.statusHistory ?? [];
  const stops = live.stops ?? [];
  const hasStops = stops.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Hero header ─────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/50 bg-card/40 px-5 py-4">

        {/* Tier 1 — dispatch ID + status badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] font-medium text-muted-foreground/70">
            {live.dispatchNumber}
          </span>
          <StatusBadge status={live.status} />
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden />
              Live
            </span>
          )}
          {overdue && (
            <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              Late
            </span>
          )}
          {!overdue && urgency?.dueToday && (
            <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              Due today
            </span>
          )}
          {waiting && !urgency?.isLate && (
            <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
              Waiting pickup
            </span>
          )}
        </div>

        {/* Tier 2 — route hero */}
        <div className="mt-3 flex items-center gap-2">
          <span className="truncate text-xl font-bold tracking-tight text-foreground">
            {live.order?.pickupCity ?? '—'}
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-brand" />
          <span className="truncate text-xl font-bold tracking-tight text-foreground">
            {live.order?.deliveryCity ?? '—'}
          </span>
        </div>

        {/* Tier 3 — customer */}
        {live.order?.customer?.companyName && (
          <p className="mt-1 text-sm text-muted-foreground">
            {live.order.customer.companyName}
            {live.order.orderNumber && (
              <span className="ml-2 font-mono text-[11px] opacity-50">{live.order.orderNumber}</span>
            )}
          </p>
        )}

        {/* Tier 4 — crew */}
        <div className="mt-3.5 flex items-center gap-2.5">
          {live.driver ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                {(live.driver.firstName[0] ?? '') + (live.driver.lastName[0] ?? '')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {live.driver.firstName} {live.driver.lastName}
                </p>
                {live.driver.phone ? (
                  <a
                    href={`tel:${live.driver.phone}`}
                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    {live.driver.phone}
                  </a>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    <User className="mr-0.5 inline h-2.5 w-2.5" />
                    {live.driver.employeeCode}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60">No driver assigned</span>
          )}
          {live.vehicle && (
            <div className="shrink-0 rounded-lg border border-border/60 bg-background/50 px-3 py-1.5 text-right">
              <p className="font-mono text-xs font-bold text-foreground">{live.vehicle.plateNumber}</p>
              <p className="text-[10px] capitalize text-muted-foreground">{live.vehicle.type}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">

        {/* Stop progress */}
        {hasStops && (
          <div className="border-b border-border/40 px-5 py-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Route progress
            </p>
            <StopsProgress stops={stops} />
          </div>
        )}

        {/* Schedule */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Pickup</p>
              <p className="mt-0.5 font-semibold text-foreground">{formatDate(live.pickupDateScheduled)}</p>
              {live.pickupDateActual && (
                <p className="text-[10px] text-success">Actual {formatDateTime(live.pickupDateActual)}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Delivery</p>
              <p className={cn('mt-0.5 font-semibold', overdue ? 'text-destructive' : 'text-foreground')}>
                {formatDate(live.deliveryDateScheduled)}
              </p>
              {urgency && (
                <p className={cn('text-[10px] font-medium', urgency.tone)}>{urgency.label}</p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {nextStatuses.map((status) => (
              <Button
                key={status}
                size="sm"
                disabled={statusSaving}
                onClick={() => void handleNextAction(status)}
                className={cn(
                  'h-8',
                  (status === 'DELIVERED' || status === 'AT_STOP' || status === 'ARRIVED_AT_DELIVERY') &&
                    'bg-gradient-brand text-brand-foreground hover:opacity-90',
                )}
              >
                {NEXT_ACTION_LABEL[status] ?? statusLabel(status)}
              </Button>
            ))}
            {canReassign && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => onReassign(live)}>
                <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
                Reassign
              </Button>
            )}
            {live.driver?.phone && (
              <Button size="sm" variant="outline" className="h-8" asChild>
                <a href={`tel:${live.driver.phone}`}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Call
                </a>
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive" onClick={() => onCancel(live)}>
                Cancel
              </Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {live.order && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onViewOrder(live.orderId)}>
                <Package className="mr-1 h-3 w-3" />
                Order
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onViewFullDetail(live.id)}>
              <ExternalLink className="mr-1 h-3 w-3" />
              Full detail
            </Button>
          </div>
          {!canWrite && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              View only — status changes require a dispatcher.
            </p>
          )}
        </div>

        {/* Activity + Notes */}
        <div className="space-y-4 px-5 py-3">
          {history.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Activity
              </p>
              <ul className="space-y-1">
                {[...history].reverse().slice(0, 4).map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-foreground">{statusLabel(entry.status)}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" title={formatDateTime(entry.createdAt)}>
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canWrite && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Dispatcher notes…"
                className="min-h-[3rem] text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-1.5 h-7 text-[11px]"
                disabled={notesSaving || notes === (live.notes ?? '')}
                onClick={() => void saveNotes()}
              >
                {notesSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
