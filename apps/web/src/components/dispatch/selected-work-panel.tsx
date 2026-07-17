'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import type { BoardOrderSummary } from '@/lib/api/dashboard';
import { describeError } from '@/lib/api/describe-error';
import { useAvailability } from '@/lib/api/availability';
import { useCreateDispatch, useUpdateDispatchStatus } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

/// The right-hand pane of the Work Queue master-detail (UX spec, final). Not
/// a Sheet, not a Dialog — a permanent surface that renders whatever is
/// selected right where the dispatcher is already looking. Two shapes:
///   - an ORDER with no dispatch yet -> the assign form, inline (nothing to
///     undo, so no modal is warranted)
///   - a DISPATCH -> driver/vehicle/status/next-action, always visible;
///     route and timeline behind a closed-by-default disclosure, since they
///     are looked at far less often than the fields above them.

const NEXT_ACTION_LABEL: Partial<Record<DispatchStatus, string>> = {
  ASSIGNED: 'Confirm Assignment',
  EN_ROUTE_TO_PICKUP: 'Move to Pickup',
  AT_PICKUP: 'Mark Arrived at Pickup',
  IN_TRANSIT: 'Start Transit',
  DELIVERED: 'Mark Delivered',
};

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export type Selection = { kind: 'dispatch'; dispatch: ApiDispatch } | { kind: 'order'; order: BoardOrderSummary };

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
  if (!selection) {
    return (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Nothing selected</p>
        <p className="text-xs text-muted-foreground">
          Pick an item from the queue, search, or the board below.
        </p>
      </div>
    );
  }

  return selection.kind === 'order' ? (
    <AssignForm order={selection.order} onAssigned={onAssigned} />
  ) : (
    <DispatchDetail
      dispatch={selection.dispatch}
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

  const { data: availability, loading: availabilityLoading } = useAvailability({
    pickupDate: order.pickupDate,
    deliveryDate: order.deliveryDate,
  });
  const { create, loading: saving } = useCreateDispatch();

  const noneFree = (availability?.drivers.length ?? 0) === 0 || (availability?.vehicles.length ?? 0) === 0;

  const handleAssign = async () => {
    if (!driverId || !vehicleId) {
      setError('Choose a driver and a vehicle');
      return;
    }
    try {
      await create({ orderId: order.id, driverId, vehicleId });
      toast.success(`${order.orderNumber} assigned`);
      onAssigned(order.id);
    } catch (err) {
      setError(describeError(err, 'Failed to assign'));
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</p>
        <p className="text-xs text-muted-foreground">
          {order.pickupCity} → {order.deliveryCity}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!availabilityLoading && noneFree && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Nobody is free for these dates yet.
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="assign-driver" className="mb-1 block text-xs font-medium text-muted-foreground">
            Driver
          </label>
          <select
            id="assign-driver"
            className={SELECT_CLASS}
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            disabled={availabilityLoading}
          >
            <option value="">{availabilityLoading ? 'Checking who is free...' : 'Select a driver...'}</option>
            {availability?.drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.firstName} {driver.lastName} ({driver.employeeCode})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="assign-vehicle" className="mb-1 block text-xs font-medium text-muted-foreground">
            Vehicle
          </label>
          <select
            id="assign-vehicle"
            className={SELECT_CLASS}
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={availabilityLoading}
          >
            <option value="">{availabilityLoading ? 'Checking what is free...' : 'Select a vehicle...'}</option>
            {availability?.vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber} — {vehicle.type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => void handleAssign()}
        disabled={saving || availabilityLoading || !driverId || !vehicleId}
      >
        {saving ? 'Assigning...' : 'Assign'}
      </Button>
    </div>
  );
}

function DispatchDetail({
  dispatch,
  onReassign,
  onCancel,
  onViewOrder,
  onViewFullDetail,
  onStatusChanged,
}: {
  dispatch: ApiDispatch;
  onReassign: (dispatch: ApiDispatch) => void;
  onCancel: (dispatch: ApiDispatch) => void;
  onViewOrder: (orderId: string) => void;
  onViewFullDetail: (id: string) => void;
  onStatusChanged: (dispatchId: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { updateStatus, loading: statusSaving } = useUpdateDispatchStatus(dispatch.id);

  const canCancel = dispatch.allowedTransitions.includes('CANCELLED');
  const nextStatuses = dispatch.allowedTransitions.filter((s) => s !== 'CANCELLED');

  const handleNextAction = async (status: DispatchStatus) => {
    try {
      await updateStatus({ status });
      toast.success(`${dispatch.dispatchNumber} moved to ${statusLabel(status).toLowerCase()}`);
      onStatusChanged(dispatch.id);
    } catch (err) {
      toast.error(describeError(err, 'Move rejected'));
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <p className="font-mono text-sm font-semibold text-foreground">{dispatch.dispatchNumber}</p>
        <StatusBadge status={dispatch.status} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{dispatch.order?.customer?.companyName ?? 'Unknown customer'}</p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Driver</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="font-medium text-foreground">
              {dispatch.driver ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}` : '—'}
            </p>
            {dispatch.driver?.phone && (
              <a href={`tel:${dispatch.driver.phone}`} className="text-brand hover:text-brand/80" aria-label="Call driver">
                <Phone className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vehicle</p>
          <p className="mt-0.5 font-mono font-medium text-foreground">{dispatch.vehicle?.plateNumber ?? '—'}</p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next</h3>
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => (
            <Button key={status} size="sm" disabled={statusSaving} onClick={() => void handleNextAction(status)}>
              {NEXT_ACTION_LABEL[status] ?? statusLabel(status)}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={dispatch.allowedTransitions.length === 0} onClick={() => onReassign(dispatch)}>
            Reassign
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={!canCancel}
            onClick={() => onCancel(dispatch)}
          >
            Cancel
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Details
        </button>

        {detailsOpen && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Route</p>
              <p className="mt-0.5 text-sm text-foreground">
                {dispatch.order?.pickupCity ?? '—'} → {dispatch.order?.deliveryCity ?? '—'}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Timeline</p>
              <ul className="space-y-1.5">
                {(dispatch.statusHistory ?? []).map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-foreground">{statusLabel(entry.status)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(entry.createdAt)}>
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
                {(dispatch.statusHistory ?? []).length === 0 && (
                  <li className="text-sm text-muted-foreground">No history yet.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-border pt-3 text-sm">
        {dispatch.order && (
          <button
            type="button"
            className="flex items-center gap-1 text-brand hover:underline"
            onClick={() => onViewOrder(dispatch.orderId)}
          >
            View order <ExternalLink className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => onViewFullDetail(dispatch.id)}
        >
          Full details <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
