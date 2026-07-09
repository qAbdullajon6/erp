'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useOrder,
  useUpdateOrder,
  useAssignOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  type Order,
  type UpdateOrderInput,
  type OrderStatus,
} from '@/lib/api/orders';
import { useDriversList } from '@/lib/api/drivers';
import { useVehiclesList } from '@/lib/api/vehicles';
import { toast } from 'sonner';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['ASSIGNED'],
  ASSIGNED: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

interface OrderDetailProps {
  orderId: string;
}

export function OrdersDetail({ orderId }: OrderDetailProps) {
  const navigate = useNavigate();
  const { data: order, loading, error, refetch } = useOrder(orderId);
  const { update: updateOrder, loading: updateLoading } = useUpdateOrder();
  const { assign, loading: assignLoading } = useAssignOrder();
  const { updateStatus, loading: statusLoading } = useUpdateOrderStatus();
  const { cancel, loading: cancelLoading } = useCancelOrder();

  // Fetch drivers and vehicles for assignment
  const { data: driversData, loading: driversLoading } = useDriversList({
    limit: 100,
    status: 'ACTIVE',
    includeArchived: false,
  });
  const { data: vehiclesData, loading: vehiclesLoading } = useVehiclesList({
    limit: 100,
    status: 'AVAILABLE',
    includeArchived: false,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateOrderInput>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [showAssign, setShowAssign] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [assignError, setAssignError] = useState('');

  const [showCancel, setShowCancel] = useState(false);
  const [cancelNote, setCancelNote] = useState('');

  useEffect(() => {
    if (order && !isEditing) {
      setEditData({});
    }
  }, [order, isEditing]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          <p className="mt-4 text-sm text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  if (!order) {
    return <div className="text-center py-12 text-muted-foreground">Order not found</div>;
  }

  const allowedTransitions = ALLOWED_TRANSITIONS[order.status] || [];
  const canEdit = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const canAssign = ['PENDING', 'ASSIGNED'].includes(order.status);
  const canCancel = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

  const handleSaveEdit = async () => {
    try {
      await updateOrder(orderId, editData);
      toast.success('Order updated successfully');
      setIsEditing(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order');
    }
  };

  const handleAssign = async () => {
    if (!driverId || !vehicleId) {
      setAssignError('Both driver and vehicle are required');
      return;
    }

    try {
      await assign(orderId, { driverId, vehicleId });
      toast.success('Order assigned successfully');
      setShowAssign(false);
      setDriverId('');
      setVehicleId('');
      setAssignError('');
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign order';
      setAssignError(message);
    }
  };

  const handleStatusTransition = async (newStatus: OrderStatus) => {
    try {
      await updateStatus(orderId, { status: newStatus });
      toast.success(`Order moved to ${newStatus}`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleCancel = async () => {
    try {
      await cancel(orderId, { note: cancelNote });
      toast.success('Order cancelled successfully');
      setShowCancel(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel order');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">{order.orderNumber}</h1>
          <div className="mt-2 flex items-center gap-4">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
                order.status === 'DRAFT'
                  ? 'bg-gray-100 text-gray-800'
                  : order.status === 'DELIVERED'
                    ? 'bg-green-100 text-green-800'
                    : order.status === 'CANCELLED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
              }`}
            >
              {order.status.replace(/_/g, ' ')}
            </span>
            {order.isDelayed && (
              <span className="inline-block rounded-full px-3 py-1 text-sm font-medium bg-red-100 text-red-800">
                Delayed
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: '/app/orders' })}>
          Back
        </Button>
      </div>

      {/* Core Order Information */}
      <div className="rounded-lg border border-brand/10 bg-surface p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-foreground mb-4">Order Information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Customer ID</p>
              <p className="font-medium text-foreground">{order.customerId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="font-medium text-foreground">
                {order.currency} {parseFloat(order.price).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium text-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Updated</p>
              <p className="font-medium text-foreground">{new Date(order.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-brand/10 pt-6">
          <h2 className="font-semibold text-foreground mb-4">Pickup Details</h2>
          <div className="space-y-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Address:</span> {order.pickupAddress}, {order.pickupCity}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Date:</span> {new Date(order.pickupDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="border-t border-brand/10 pt-6">
          <h2 className="font-semibold text-foreground mb-4">Delivery Details</h2>
          <div className="space-y-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Address:</span> {order.deliveryAddress}, {order.deliveryCity}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Date:</span> {new Date(order.deliveryDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="border-t border-brand/10 pt-6">
          <h2 className="font-semibold text-foreground mb-4">Cargo Details</h2>
          <div className="space-y-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Description:</span> {order.cargoDescription}
            </p>
            {order.cargoWeightKg && (
              <p className="text-sm">
                <span className="text-muted-foreground">Weight:</span> {order.cargoWeightKg} kg
              </p>
            )}
            {order.cargoVolumeM3 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Volume:</span> {order.cargoVolumeM3} m³
              </p>
            )}
          </div>
        </div>

        {order.notes && (
          <div className="border-t border-brand/10 pt-6">
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="text-sm text-foreground">{order.notes}</p>
          </div>
        )}

        {order.deliveryNotes && (
          <div className="border-t border-brand/10 pt-6">
            <p className="text-sm text-muted-foreground">Delivery Notes</p>
            <p className="text-sm text-foreground">{order.deliveryNotes}</p>
          </div>
        )}

        {order.driverId && (
          <div className="border-t border-brand/10 pt-6">
            <p className="text-sm text-muted-foreground">Assigned Driver</p>
            <p className="text-sm text-foreground">{order.driverId}</p>
          </div>
        )}

        {order.vehicleId && (
          <div className="border-t border-brand/10 pt-6">
            <p className="text-sm text-muted-foreground">Assigned Vehicle</p>
            <p className="text-sm text-foreground">{order.vehicleId}</p>
          </div>
        )}
      </div>

      {/* Status History */}
      {order.statusHistory && order.statusHistory.length > 0 && (
        <div className="rounded-lg border border-brand/10 bg-surface p-6">
          <h2 className="font-semibold text-foreground mb-4">Status History</h2>
          <div className="space-y-3">
            {order.statusHistory.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 pb-3 border-b border-brand/10 last:border-0">
                <div className="min-w-fit">
                  <p className="font-medium text-sm text-foreground">{entry.status.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                {entry.note && <p className="text-sm text-muted-foreground italic">{entry.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded-lg border border-brand/10 bg-surface p-6 space-y-4">
        <h2 className="font-semibold text-foreground">Actions</h2>

        {/* Status Transitions */}
        {allowedTransitions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Next Status</p>
            <div className="flex flex-wrap gap-2">
              {allowedTransitions.map((nextStatus) => (
                <Button
                  key={nextStatus}
                  size="sm"
                  onClick={() => handleStatusTransition(nextStatus)}
                  disabled={statusLoading}
                >
                  Move to {nextStatus.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Assign Driver/Vehicle */}
        {canAssign && (
          <div className="border-t border-brand/10 pt-4">
            <Button
              size="sm"
              variant={showAssign ? 'default' : 'outline'}
              onClick={() => setShowAssign(!showAssign)}
              disabled={assignLoading}
            >
              {order.driverId && order.vehicleId ? 'Reassign' : 'Assign'} Driver & Vehicle
            </Button>

            {showAssign && (
              <div className="mt-4 space-y-3 p-4 bg-background rounded-lg">
                <div>
                  <label className="text-sm font-medium text-foreground">Select Driver</label>
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    disabled={driversLoading}
                    data-testid="orders-assign-driver-select"
                    className="mt-1 w-full px-3 py-2 border rounded-lg bg-background"
                  >
                    <option value="">
                      {driversLoading ? 'Loading drivers...' : 'Choose a driver'}
                    </option>
                    {driversData?.items.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.firstName} {driver.lastName} ({driver.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Select Vehicle</label>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    disabled={vehiclesLoading}
                    data-testid="orders-assign-vehicle-select"
                    className="mt-1 w-full px-3 py-2 border rounded-lg bg-background"
                  >
                    <option value="">
                      {vehiclesLoading ? 'Loading vehicles...' : 'Choose a vehicle'}
                    </option>
                    {vehiclesData?.items.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.plateNumber} - {vehicle.type} ({vehicle.vehicleCode})
                      </option>
                    ))}
                  </select>
                </div>
                {assignError && <p className="text-sm text-red-500">{assignError}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAssign}
                    disabled={assignLoading || !driverId || !vehicleId || driversLoading || vehiclesLoading}
                  >
                    {assignLoading ? 'Assigning...' : 'Confirm Assignment'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAssign(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cancel Order */}
        {canCancel && (
          <div className="border-t border-brand/10 pt-4">
            <Button
              size="sm"
              variant={showCancel ? 'destructive' : 'outline'}
              onClick={() => setShowCancel(!showCancel)}
              disabled={cancelLoading}
            >
              Cancel Order
            </Button>

            {showCancel && (
              <div className="mt-4 space-y-3 p-4 bg-background rounded-lg">
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. The order will be marked as CANCELLED.
                </p>
                <div>
                  <label className="text-sm font-medium text-foreground">Reason (optional)</label>
                  <textarea
                    placeholder="Why is this order being cancelled?"
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancel}
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCancel(false)}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
