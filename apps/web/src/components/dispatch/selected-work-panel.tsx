'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Phone,
  UserRoundCog,
  Package,
  StickyNote,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
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
  IN_TRANSIT: 'Mark picked up',
  DELIVERED: 'Mark delivered',
};

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
      <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Nothing selected</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Pick a queue item, search, or a board card — this panel stays with you.
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
    <div className="space-y-4 p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</p>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            Needs assignment
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
          <span className="font-medium">{order.pickupCity}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{order.deliveryCity}</span>
        </p>
        {order.customerName && (
          <p className="mt-0.5 text-xs text-muted-foreground">{order.customerName}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Pickup {formatDate(order.pickupDate)} · Delivery {formatDate(order.deliveryDate)}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {availabilityError ? (
        <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{availabilityError}</p>
          <Button size="sm" variant="outline" onClick={() => void refetchAvailability()}>
            Retry
          </Button>
        </div>
      ) : noneFree ? (
        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          No free drivers or vehicles for this pickup–delivery window.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Driver</label>
          <Select
            value={driverId || undefined}
            onValueChange={setDriverId}
            disabled={availabilityLoading || Boolean(availabilityError)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={availabilityLoading ? 'Checking…' : 'Select driver'} />
            </SelectTrigger>
            <SelectContent>
              {availability?.drivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.firstName} {driver.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Vehicle</label>
          <Select
            value={vehicleId || undefined}
            onValueChange={setVehicleId}
            disabled={availabilityLoading || Boolean(availabilityError)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={availabilityLoading ? 'Checking…' : 'Select vehicle'} />
            </SelectTrigger>
            <SelectContent>
              {availability?.vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.plateNumber} — {vehicle.type}
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
        {saving ? 'Assigning…' : 'Assign'}
      </Button>
    </div>
  );
}

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
  const { data: detail, loading: detailLoading, error: detailError } = useDispatchDetail(dispatch.id);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm font-semibold text-foreground">{live.dispatchNumber}</p>
              <StatusBadge status={live.status} />
            </div>
            <p className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-foreground">{live.order?.pickupCity ?? '—'}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium text-foreground">{live.order?.deliveryCity ?? '—'}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {live.order?.customer?.companyName ?? 'Unknown customer'}
              {live.order?.orderNumber ? (
                <span className="ml-1.5 font-mono">· {live.order.orderNumber}</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {overdue && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                Late
              </span>
            )}
            {!overdue && urgency?.dueToday && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                Due today
              </span>
            )}
            {waiting && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                Waiting pickup
              </span>
            )}
            {live.status === 'IN_TRANSIT' && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                In transit
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Driver</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="font-medium text-foreground">
                {live.driver ? `${live.driver.firstName} ${live.driver.lastName}` : '—'}
              </p>
              {live.driver?.phone && (
                <a
                  href={`tel:${live.driver.phone}`}
                  className="text-brand hover:text-brand/80"
                  aria-label="Call driver"
                >
                  <Phone className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Vehicle</p>
            <p className="mt-0.5 font-mono font-medium text-foreground">
              {live.vehicle?.plateNumber ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
        {/* Timeline / stage */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
              <p className="text-muted-foreground">Pickup</p>
              <p className="mt-0.5 font-medium text-foreground">{formatDate(live.pickupDateScheduled)}</p>
              {live.pickupDateActual && (
                <p className="text-[10px] text-success">Actual {formatDateTime(live.pickupDateActual)}</p>
              )}
            </div>
            <div
              className={cn(
                'rounded-md border px-2.5 py-2',
                overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/20',
              )}
            >
              <p className="text-muted-foreground">Delivery</p>
              <p className={cn('mt-0.5 font-medium', overdue ? 'text-destructive' : 'text-foreground')}>
                {formatDate(live.deliveryDateScheduled)}
              </p>
              {urgency && (
                <p className={cn('text-[10px]', urgency.tone)}>{urgency.label}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Current stage:{' '}
            <span className="font-medium text-foreground">{statusLabel(live.status)}</span>
            {nextStatuses[0] && (
              <>
                {' '}
                · Next:{' '}
                <span className="font-medium text-foreground">
                  {NEXT_ACTION_LABEL[nextStatuses[0]] ?? statusLabel(nextStatuses[0])}
                </span>
              </>
            )}
          </p>
        </section>

        {/* Actions */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actions
          </h3>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((status) => (
              <Button
                key={status}
                size="sm"
                disabled={statusSaving}
                onClick={() => void handleNextAction(status)}
                className={
                  status === 'DELIVERED' || status === 'IN_TRANSIT'
                    ? 'bg-gradient-brand text-brand-foreground hover:opacity-90'
                    : undefined
                }
              >
                {NEXT_ACTION_LABEL[status] ?? statusLabel(status)}
              </Button>
            ))}
            {canReassign && (
              <Button size="sm" variant="outline" onClick={() => onReassign(live)}>
                <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
                Reassign
              </Button>
            )}
            {live.driver?.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${live.driver.phone}`}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Call
                </a>
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onCancel(live)}
              >
                Cancel
              </Button>
            )}
            {!canWrite && (
              <p className="text-xs text-muted-foreground">View only — status changes require a dispatcher.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {live.order && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onViewOrder(live.orderId)}>
                <Package className="mr-1 h-3 w-3" />
                Open order
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onViewFullDetail(live.id)}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Open detail
            </Button>
          </div>
        </section>

        {/* Quick notes */}
        {canWrite && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              Quick notes
            </h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Dispatcher notes…"
              className="min-h-[4rem] text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={notesSaving || notes === (live.notes ?? '')}
              onClick={() => void saveNotes()}
            >
              {notesSaving ? 'Saving…' : 'Save notes'}
            </Button>
          </section>
        )}

        {/* Recent activity — from detail endpoint when available */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </h3>
          {detailLoading && history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading activity…</p>
          ) : detailError && history.length === 0 ? (
            <p className="text-xs text-destructive">Could not load activity.</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No status changes recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...history].reverse().slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground">{statusLabel(entry.status)}</span>
                  <span
                    className="shrink-0 text-[11px] text-muted-foreground"
                    title={formatDateTime(entry.createdAt)}
                  >
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
