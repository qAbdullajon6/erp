'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDispatchDetail, useUpdateDispatchStatus, useCancelDispatch } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';
import { DetailField } from '@/components/shared/detail-field';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SectionHeader } from '@/components/ui/section-header';
import { ArrowLeft, ArrowRight, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';
import { formatDateTime } from '@/lib/format';
import { DeliveryProofPanel, isTerminalStatus } from './delivery-proof-panel';
import { DispatchReassignDialog } from './dispatch-reassign-dialog';

interface DispatchesDetailProps {
  dispatchId: string;
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function DispatchesDetail({ dispatchId }: DispatchesDetailProps) {
  const router = useRouter();

  const { data: dispatch, loading, error, refetch } = useDispatchDetail(dispatchId);
  const { updateStatus, loading: updatingStatus } = useUpdateDispatchStatus(dispatchId);
  const { cancel, loading: cancelling } = useCancelDispatch(dispatchId);

  const [selectedNextStatus, setSelectedNextStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  // Reuses the exact same reassignment dialog the Board's card menu opens —
  // previously the only way to reassign was from the Board; this screen had
  // no path to it at all.
  const [showReassign, setShowReassign] = useState(false);

  if (loading) return <LoadingState label="Loading dispatch..." />;

  if (error || !dispatch) {
    return <ErrorState message={error || 'Dispatch not found'} onRetry={refetch} />;
  }

  // Straight from the server (Task 8.10). The transition table used to be copied
  // into this file; it is now the API's answer, so this screen cannot offer a
  // button the API would refuse. Cancellation has its own endpoint, so it is split
  // out of the forward moves rather than computed separately.
  const validNextStatuses = dispatch.allowedTransitions.filter((s) => s !== 'CANCELLED');
  const canCancel = dispatch.allowedTransitions.includes('CANCELLED');
  // Same gate the Board's "Reassign" menu item uses (disabled once terminal).
  const canReassign = dispatch.allowedTransitions.length > 0;

  const handleStatusChange = async () => {
    if (!selectedNextStatus) return;
    try {
      await updateStatus({ status: selectedNextStatus, note: statusNote || undefined });
      setSelectedNextStatus('');
      setStatusNote('');
      // Invalidated by the mutation (Task 8.9) — no manual refetch chain.
      toast.success('Dispatch status updated');
    } catch (err) {
      toast.error(describeError(err, 'Failed to update status'));
    }
  };

  const handleCancel = async () => {
    try {
      await cancel();
      // Invalidated by the mutation (Task 8.9) — no manual refetch chain.
      toast.success('Dispatch cancelled');
    } catch (err) {
      toast.error(describeError(err, 'Failed to cancel dispatch'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={dispatch.dispatchNumber}
        subtitle={<StatusBadge status={dispatch.status} />}
        action={
          <Button onClick={() => router.navigate({ to: '/app/dispatches' })} variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dispatches
          </Button>
        }
      />

      {/* Timeline — moved above the informational cards: what's already
          happened is what a dispatcher orients on first. */}
      {dispatch.statusHistory && dispatch.statusHistory.length > 0 && (
        <SurfaceCard className="p-6">
          <SectionHeader title="Timeline" />
          <div className="mt-4 space-y-0">
            {dispatch.statusHistory.map((entry, index) => {
              const isLast = index === dispatch.statusHistory!.length - 1;
              const isLatest = index === 0;
              return (
                <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {!isLast && <div className="absolute left-[5px] top-3 h-full w-px bg-brand/15" />}
                  <div
                    className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      isLatest ? 'bg-brand ring-4 ring-brand/15' : 'bg-muted-foreground/40'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {entry.note && <p className="mt-1 text-sm text-muted-foreground italic">{entry.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard className="p-6">
        <SectionHeader title="Order Information" />
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <DetailField label="Order Number" value={dispatch.order?.orderNumber} mono />
          <DetailField label="Customer" value={dispatch.order?.customer?.companyName} />
          <DetailField label="Pickup Location" value={dispatch.order?.pickupCity} />
          <DetailField label="Delivery Location" value={dispatch.order?.deliveryCity} />
        </div>
        <Button
          onClick={() => router.navigate({ to: `/app/orders/${dispatch.orderId}` })}
          variant="link"
          className="mt-4 gap-1 px-0"
        >
          View Full Order
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </SurfaceCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SurfaceCard className="p-6">
          <div className="flex items-center justify-between gap-2">
            <SectionHeader title="Assigned Driver" />
            {canReassign && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowReassign(true)}>
                <Repeat className="h-3.5 w-3.5" />
                Reassign
              </Button>
            )}
          </div>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <DetailField
              label="Name"
              value={dispatch.driver ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}` : null}
            />
            <DetailField label="Employee Code" value={dispatch.driver?.employeeCode} mono />
            <DetailField label="Phone" value={dispatch.driver?.phone} />
            <DetailField
              label="Status"
              value={dispatch.driver ? <StatusBadge status={dispatch.driver.status} /> : null}
            />
          </div>
          {dispatch.driverId && (
            <Button
              onClick={() => router.navigate({ to: `/app/drivers/${dispatch.driverId}` })}
              variant="link"
              className="mt-4 gap-1 px-0"
            >
              View Driver Profile
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <SectionHeader title="Assigned Vehicle" />
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <DetailField label="Plate Number" value={dispatch.vehicle?.plateNumber} mono />
            <DetailField label="Vehicle Code" value={dispatch.vehicle?.vehicleCode} mono />
            <DetailField
              label="Type"
              value={dispatch.vehicle ? <span className="capitalize">{dispatch.vehicle.type}</span> : null}
            />
            <DetailField
              label="Status"
              value={dispatch.vehicle ? <StatusBadge status={dispatch.vehicle.status} /> : null}
            />
          </div>
          {dispatch.vehicleId && (
            <Button
              onClick={() => router.navigate({ to: `/app/vehicles/${dispatch.vehicleId}` })}
              variant="link"
              className="mt-4 gap-1 px-0"
            >
              View Vehicle Details
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-6">
        <SectionHeader title="Schedule" />
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <DetailField label="Scheduled Pickup" value={formatDateTime(dispatch.pickupDateScheduled)} />
          <DetailField
            label="Actual Pickup"
            value={dispatch.pickupDateActual ? formatDateTime(dispatch.pickupDateActual) : null}
          />
          <DetailField label="Scheduled Delivery" value={formatDateTime(dispatch.deliveryDateScheduled)} />
          <DetailField
            label="Actual Delivery"
            value={dispatch.deliveryDateActual ? formatDateTime(dispatch.deliveryDateActual) : null}
          />
        </div>
      </SurfaceCard>

      {dispatch.notes && (
        <SurfaceCard className="p-6">
          <SectionHeader title="Notes" />
          <p className="mt-4 text-muted-foreground">{dispatch.notes}</p>
        </SurfaceCard>
      )}

      <DeliveryProofPanel
        dispatchId={dispatchId}
        deliveryNotes={dispatch.deliveryNotes}
        deliveryProofCount={dispatch.deliveryProofCount}
        isTerminal={isTerminalStatus(dispatch.status)}
      />

      {(validNextStatuses.length > 0 || canCancel) && (
        <SurfaceCard className="p-6 space-y-4">
          <SectionHeader title="Status Management" />

          {validNextStatuses.length > 0 && (
            <div className="space-y-4">
              <FormField id="nextStatus" label="Update Status">
                <select
                  id="nextStatus"
                  value={selectedNextStatus}
                  onChange={(e) => setSelectedNextStatus(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Select next status...</option>
                  {validNextStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </FormField>

              <Textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Optional note for this transition..."
                rows={2}
              />

              <Button
                onClick={handleStatusChange}
                disabled={!selectedNextStatus || updatingStatus}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                {updatingStatus ? 'Updating...' : 'Update Status'}
              </Button>
            </div>
          )}

          {canCancel && (
            <div className="border-t border-brand/10 pt-4">
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={cancelling} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    {cancelling ? 'Cancelling...' : 'Cancel Dispatch'}
                  </Button>
                }
                title="Cancel this dispatch?"
                description="The driver and vehicle are released, and the order returns to the unassigned pool. This cannot be undone."
                confirmLabel="Yes, cancel it"
                onConfirm={handleCancel}
                destructive
              />
            </div>
          )}
        </SurfaceCard>
      )}

      <DispatchReassignDialog dispatch={showReassign ? dispatch : null} onClose={() => setShowReassign(false)} />
    </div>
  );
}
