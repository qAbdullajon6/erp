'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDispatchDetail, useUpdateDispatchStatus, useCancelDispatch } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { DetailField } from '@/components/shared/detail-field';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface DispatchesDetailProps {
  dispatchId: string;
}

/// Mirrors the server-side transition map in DispatchesService — forward-only,
/// one step at a time, with DELIVERED and CANCELLED terminal.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ASSIGNED'],
  ASSIGNED: ['EN_ROUTE_TO_PICKUP'],
  EN_ROUTE_TO_PICKUP: ['AT_PICKUP'],
  AT_PICKUP: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const CANCELLABLE_STATUSES = ['DRAFT', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function formatDate(dateString?: string) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DispatchesDetail({ dispatchId }: DispatchesDetailProps) {
  const router = useRouter();

  const { data: dispatch, loading, error, refetch } = useDispatchDetail(dispatchId);
  const { updateStatus, loading: updatingStatus } = useUpdateDispatchStatus(dispatchId);
  const { cancel, loading: cancelling } = useCancelDispatch(dispatchId);

  const [selectedNextStatus, setSelectedNextStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  if (loading) return <LoadingState label="Loading dispatch..." />;

  if (error || !dispatch) {
    return <ErrorState message={error || 'Dispatch not found'} onRetry={refetch} />;
  }

  const validNextStatuses = STATUS_TRANSITIONS[dispatch.status] || [];
  const canCancel = CANCELLABLE_STATUSES.includes(dispatch.status);

  const handleStatusChange = async () => {
    if (!selectedNextStatus) return;
    try {
      await updateStatus({ status: selectedNextStatus, note: statusNote || undefined });
      setSelectedNextStatus('');
      setStatusNote('');
      refetch();
      toast.success('Dispatch status updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleCancel = async () => {
    try {
      await cancel();
      refetch();
      toast.success('Dispatch cancelled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel dispatch');
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

      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 sm:grid-cols-2">
            <DetailField label="Order Number" value={dispatch.order?.orderNumber} mono />
            <DetailField label="Customer" value={dispatch.order?.customer?.companyName} />
            <DetailField label="Pickup Location" value={dispatch.order?.pickupCity} />
            <DetailField label="Delivery Location" value={dispatch.order?.deliveryCity} />
          </div>
          <Button
            onClick={() => router.navigate({ to: `/app/orders/${dispatch.orderId}` })}
            variant="link"
            className="gap-1 px-0"
          >
            View Full Order
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assigned Driver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 sm:grid-cols-2">
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
                className="gap-1 px-0"
              >
                View Driver Profile
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assigned Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 sm:grid-cols-2">
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
                className="gap-1 px-0"
              >
                View Vehicle Details
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <DetailField label="Scheduled Pickup" value={formatDate(dispatch.pickupDateScheduled)} />
            <DetailField
              label="Actual Pickup"
              value={dispatch.pickupDateActual ? formatDate(dispatch.pickupDateActual) : null}
            />
            <DetailField label="Scheduled Delivery" value={formatDate(dispatch.deliveryDateScheduled)} />
            <DetailField
              label="Actual Delivery"
              value={dispatch.deliveryDateActual ? formatDate(dispatch.deliveryDateActual) : null}
            />
          </div>
        </CardContent>
      </Card>

      {dispatch.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{dispatch.notes}</p>
          </CardContent>
        </Card>
      )}

      {(validNextStatuses.length > 0 || canCancel) && (
        <Card>
          <CardHeader>
            <CardTitle>Status Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  description="This cannot be undone. The order will need a new dispatch to be delivered."
                  confirmLabel="Yes, cancel it"
                  onConfirm={handleCancel}
                  destructive
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {dispatch.statusHistory && dispatch.statusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dispatch.statusHistory.map((entry, index) => (
                <div key={entry.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-brand" />
                    {index < dispatch.statusHistory!.length - 1 && <div className="h-8 w-0.5 bg-brand/20" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.status} />
                      <span className="text-sm text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {entry.note && <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
