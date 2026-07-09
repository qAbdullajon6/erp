'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import {
  useDispatchDetail,
  useUpdateDispatchStatus,
  useCancelDispatch,
} from '@/lib/hooks/use-dispatches';

interface DispatchesDetailProps {
  dispatchId: string;
}

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

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'En Route to Pickup',
  AT_PICKUP: 'At Pickup',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ASSIGNED: 'bg-blue-100 text-blue-800',
  EN_ROUTE_TO_PICKUP: 'bg-orange-100 text-orange-800',
  AT_PICKUP: 'bg-orange-100 text-orange-800',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export function DispatchesDetail({ dispatchId }: DispatchesDetailProps) {
  const router = useRouter();
  const canEdit = true;

  const { data: dispatch, loading, error, refetch } = useDispatchDetail(dispatchId);
  const { updateStatus, loading: updatingStatus } = useUpdateDispatchStatus(dispatchId);
  const { cancel, loading: cancelling } = useCancelDispatch(dispatchId);

  const [selectedNextStatus, setSelectedNextStatus] = useState<string>('');
  const [statusNote, setStatusNote] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (loading) {
    return <div className="animate-pulse h-96 bg-gray-200 rounded-lg" />;
  }

  if (error || !dispatch) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-lg">
        <p>{error || 'Dispatch not found'}</p>
        <button onClick={refetch} className="underline mt-2">
          Retry
        </button>
      </div>
    );
  }

  const validNextStatuses = STATUS_TRANSITIONS[dispatch.status] || [];
  const canCancel = CANCELLABLE_STATUSES.includes(dispatch.status);

  const handleStatusChange = async () => {
    if (!selectedNextStatus) return;
    try {
      await updateStatus({
        status: selectedNextStatus,
        note: statusNote || undefined,
      });
      setSelectedNextStatus('');
      setStatusNote('');
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this dispatch?')) return;
    try {
      await cancel();
      refetch();
      setShowCancelConfirm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel dispatch');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{dispatch.dispatchNumber}</h1>
          <span
            className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${
              statusColors[dispatch.status] || 'bg-gray-100 text-gray-800'
            }`}
          >
            {statusLabels[dispatch.status] || dispatch.status}
          </span>
        </div>
        <button
          onClick={() => router.navigate({ to: '/app/dispatches' })}
          className="text-gray-600 hover:underline"
        >
          ← Back to Dispatches
        </button>
      </div>

      {/* Order Information */}
      <div className="bg-white p-6 rounded-lg border space-y-4">
        <h2 className="font-semibold">Order Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-600 text-sm">Order Number</span>
            <p className="font-mono font-semibold">
              {dispatch.order?.orderNumber || '—'}
            </p>
          </div>
          <div>
            <span className="text-gray-600 text-sm">Customer</span>
            <p className="font-semibold">
              {dispatch.order?.customer?.companyName || '—'}
            </p>
          </div>
          <div>
            <span className="text-gray-600 text-sm">Pickup Location</span>
            <p>{dispatch.order?.pickupCity || '—'}</p>
          </div>
          <div>
            <span className="text-gray-600 text-sm">Delivery Location</span>
            <p>{dispatch.order?.deliveryCity || '—'}</p>
          </div>
        </div>
        <button
          onClick={() =>
            router.navigate({
              to: `/app/orders/${dispatch.orderId}`,
            })
          }
          className="text-blue-600 hover:underline text-sm"
        >
          View Full Order →
        </button>
      </div>

      {/* Assignment Information */}
      <div className="grid grid-cols-2 gap-6">
        {/* Driver */}
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <h2 className="font-semibold">Assigned Driver</h2>
          <div className="space-y-3">
            <div>
              <span className="text-gray-600 text-sm">Name</span>
              <p className="font-semibold">
                {dispatch.driver?.firstName} {dispatch.driver?.lastName}
              </p>
            </div>
            <div>
              <span className="text-gray-600 text-sm">Employee Code</span>
              <p className="font-mono">{dispatch.driver?.employeeCode || '—'}</p>
            </div>
            <div>
              <span className="text-gray-600 text-sm">Phone</span>
              <p>{dispatch.driver?.phone || '—'}</p>
            </div>
            <div>
              <span className="text-gray-600 text-sm">Status</span>
              <p>{dispatch.driver?.status || '—'}</p>
            </div>
          </div>
          {dispatch.driverId && (
            <button
              onClick={() =>
                router.navigate({
                  to: `/app/drivers/${dispatch.driverId}`,
                })
              }
              className="text-blue-600 hover:underline text-sm"
            >
              View Driver Profile →
            </button>
          )}
        </div>

        {/* Vehicle */}
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <h2 className="font-semibold">Assigned Vehicle</h2>
          <div className="space-y-3">
            <div>
              <span className="text-gray-600 text-sm">Plate Number</span>
              <p className="font-mono font-semibold">
                {dispatch.vehicle?.plateNumber || '—'}
              </p>
            </div>
            <div>
              <span className="text-gray-600 text-sm">Vehicle Code</span>
              <p className="font-mono">{dispatch.vehicle?.vehicleCode || '—'}</p>
            </div>
            <div>
              <span className="text-gray-600 text-sm">Type</span>
              <p>{dispatch.vehicle?.type || '—'}</p>
            </div>
            <div>
              <span className="text-gray-600 text-sm">Status</span>
              <p>{dispatch.vehicle?.status || '—'}</p>
            </div>
          </div>
          {dispatch.vehicleId && (
            <button
              onClick={() =>
                router.navigate({
                  to: `/app/vehicles/${dispatch.vehicleId}`,
                })
              }
              className="text-blue-600 hover:underline text-sm"
            >
              View Vehicle Details →
            </button>
          )}
        </div>
      </div>

      {/* Schedule Information */}
      <div className="bg-white p-6 rounded-lg border space-y-4">
        <h2 className="font-semibold">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-600 text-sm">Scheduled Pickup</span>
            <p className="font-semibold">
              {formatDate(dispatch.pickupDateScheduled)}
            </p>
          </div>
          <div>
            <span className="text-gray-600 text-sm">Actual Pickup</span>
            <p className="font-semibold">
              {dispatch.pickupDateActual
                ? formatDate(dispatch.pickupDateActual)
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-gray-600 text-sm">Scheduled Delivery</span>
            <p className="font-semibold">
              {formatDate(dispatch.deliveryDateScheduled)}
            </p>
          </div>
          <div>
            <span className="text-gray-600 text-sm">Actual Delivery</span>
            <p className="font-semibold">
              {dispatch.deliveryDateActual
                ? formatDate(dispatch.deliveryDateActual)
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Notes */}
      {dispatch.notes && (
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="font-semibold mb-3">Notes</h2>
          <p className="text-gray-700">{dispatch.notes}</p>
        </div>
      )}

      {/* Status Controls */}
      {canEdit && (validNextStatuses.length > 0 || canCancel) && (
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <h2 className="font-semibold">Status Management</h2>

          {validNextStatuses.length > 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium">Update Status</label>
              <select
                value={selectedNextStatus}
                onChange={(e) => setSelectedNextStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select next status...</option>
                {validNextStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status] || status}
                  </option>
                ))}
              </select>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Optional note for this transition..."
                rows={2}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <button
                onClick={handleStatusChange}
                disabled={!selectedNextStatus || updatingStatus}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {updatingStatus ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          )}

          {canCancel && (
            <div className="border-t pt-4">
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelling}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Dispatch'}
              </button>
              {showCancelConfirm && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-800 mb-2">
                    Are you sure you want to cancel this dispatch? This action cannot be
                    undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Yes, Cancel
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                    >
                      No, Keep It
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Status History Timeline */}
      {dispatch.statusHistory && dispatch.statusHistory.length > 0 && (
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <h2 className="font-semibold">Status Timeline</h2>
          <div className="space-y-3">
            {dispatch.statusHistory.map((entry, index) => (
              <div key={entry.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 bg-blue-600 rounded-full" />
                  {index < dispatch.statusHistory!.length - 1 && (
                    <div className="w-0.5 h-8 bg-gray-200" />
                  )}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{statusLabels[entry.status] || entry.status}</span>
                    <span className="text-gray-600 text-sm">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.note && (
                    <p className="text-gray-700 text-sm mt-1">{entry.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
