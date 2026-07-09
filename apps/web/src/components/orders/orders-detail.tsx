'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { useDriversList, driversAPI, type Driver } from '@/lib/api/drivers';
import { useVehiclesList, vehiclesAPI, type Vehicle } from '@/lib/api/vehicles';
import { customersAPI, type Customer } from '@/lib/api/customers';
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

  // Resolve the customer/driver/vehicle names for display — the order
  // record itself only carries their ids. Fetched directly via the API
  // singletons (not the useDriver/useVehicle hooks) so a null driverId/
  // vehicleId can be skipped instead of firing a request to `/drivers/`.
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assignedDriver, setAssignedDriver] = useState<Driver | null>(null);
  const [assignedVehicle, setAssignedVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!order?.customerId) return;
    customersAPI.getById(order.customerId).then(setCustomer).catch(() => setCustomer(null));
  }, [order?.customerId]);

  useEffect(() => {
    if (!order?.driverId) {
      setAssignedDriver(null);
      return;
    }
    driversAPI.getById(order.driverId).then(setAssignedDriver).catch(() => setAssignedDriver(null));
  }, [order?.driverId]);

  useEffect(() => {
    if (!order?.vehicleId) {
      setAssignedVehicle(null);
      return;
    }
    vehiclesAPI.getById(order.vehicleId).then(setAssignedVehicle).catch(() => setAssignedVehicle(null));
  }, [order?.vehicleId]);

  useEffect(() => {
    if (order && !isEditing) {
      setEditData({});
    }
  }, [order, isEditing]);

  const handleStartEdit = () => {
    if (!order) return;
    setEditData({
      pickupAddress: order.pickupAddress,
      pickupCity: order.pickupCity,
      pickupDate: order.pickupDate.slice(0, 10),
      deliveryAddress: order.deliveryAddress,
      deliveryCity: order.deliveryCity,
      deliveryDate: order.deliveryDate.slice(0, 10),
      cargoDescription: order.cargoDescription,
      cargoWeightKg: order.cargoWeightKg ? Number(order.cargoWeightKg) : undefined,
      cargoVolumeM3: order.cargoVolumeM3 ? Number(order.cargoVolumeM3) : undefined,
      price: Number(order.price),
      currency: order.currency,
      notes: order.notes ?? '',
      deliveryNotes: order.deliveryNotes ?? '',
    });
    setEditErrors({});
    setIsEditing(true);
  };

  const handleEditChange = (field: keyof UpdateOrderInput, value: string | number) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    setEditErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

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

  // PENDING -> ASSIGNED is only reachable through the Assign panel below
  // (POST /orders/:id/assign) until a driver and vehicle are set — the
  // backend rejects a bare status update to ASSIGNED before that, so this
  // quick-transition button is hidden until it would actually succeed.
  const allowedTransitions = (ALLOWED_TRANSITIONS[order.status] || []).filter(
    (status) => status !== 'ASSIGNED' || (order.driverId && order.vehicleId),
  );
  const canEdit = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const canAssign = ['PENDING', 'ASSIGNED'].includes(order.status);
  const canCancel = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

  const validateEdit = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editData.pickupAddress?.trim()) errors.pickupAddress = 'Pickup address is required';
    if (!editData.pickupCity?.trim()) errors.pickupCity = 'Pickup city is required';
    if (!editData.pickupDate) errors.pickupDate = 'Pickup date is required';
    if (!editData.deliveryAddress?.trim()) errors.deliveryAddress = 'Delivery address is required';
    if (!editData.deliveryCity?.trim()) errors.deliveryCity = 'Delivery city is required';
    if (!editData.deliveryDate) errors.deliveryDate = 'Delivery date is required';
    if (editData.pickupDate && editData.deliveryDate && new Date(editData.deliveryDate) < new Date(editData.pickupDate)) {
      errors.deliveryDate = 'Delivery date cannot be before pickup date';
    }
    if (!editData.cargoDescription?.trim()) errors.cargoDescription = 'Cargo description is required';
    if (editData.price === undefined || editData.price < 0) errors.price = 'Price must be 0 or greater';
    if (editData.currency && !/^[A-Z]{3}$/.test(editData.currency)) {
      errors.currency = 'Currency must be a 3-letter ISO code (e.g. USD)';
    }
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!validateEdit()) {
      toast.error('Please fix validation errors');
      return;
    }
    try {
      await updateOrder(orderId, editData);
      toast.success('Order updated successfully');
      setIsEditing(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditErrors({});
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Order Information</h2>
            {canEdit && !isEditing && (
              <Button size="sm" variant="outline" onClick={handleStartEdit} data-testid="orders-edit-button">
                Edit
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Customer</p>
              <p className="font-medium text-foreground">{customer?.companyName ?? order.customerId}</p>
            </div>
            {!isEditing ? (
              <div>
                <p className="text-sm text-muted-foreground">Price</p>
                <p className="font-medium text-foreground">
                  {order.currency} {parseFloat(order.price).toFixed(2)}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-foreground">Price *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editData.price ?? 0}
                    onChange={(e) => handleEditChange('price', e.target.value ? parseFloat(e.target.value) : 0)}
                    className={editErrors.price ? 'mt-1 border-red-500' : 'mt-1'}
                  />
                  {editErrors.price && <p className="mt-1 text-xs text-red-500">{editErrors.price}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Currency</label>
                  <Input
                    type="text"
                    maxLength={3}
                    value={editData.currency ?? ''}
                    onChange={(e) => handleEditChange('currency', e.target.value)}
                    className={editErrors.currency ? 'mt-1 border-red-500' : 'mt-1'}
                  />
                  {editErrors.currency && <p className="mt-1 text-xs text-red-500">{editErrors.currency}</p>}
                </div>
              </div>
            )}
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
          {!isEditing ? (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Address:</span> {order.pickupAddress}, {order.pickupCity}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Date:</span> {new Date(order.pickupDate).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Address *</label>
                <Input
                  value={editData.pickupAddress ?? ''}
                  onChange={(e) => handleEditChange('pickupAddress', e.target.value)}
                  className={editErrors.pickupAddress ? 'mt-1 border-red-500' : 'mt-1'}
                />
                {editErrors.pickupAddress && <p className="mt-1 text-xs text-red-500">{editErrors.pickupAddress}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">City *</label>
                <Input
                  value={editData.pickupCity ?? ''}
                  onChange={(e) => handleEditChange('pickupCity', e.target.value)}
                  className={editErrors.pickupCity ? 'mt-1 border-red-500' : 'mt-1'}
                />
                {editErrors.pickupCity && <p className="mt-1 text-xs text-red-500">{editErrors.pickupCity}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Date *</label>
                <Input
                  type="date"
                  value={editData.pickupDate ?? ''}
                  onChange={(e) => handleEditChange('pickupDate', e.target.value)}
                  className={editErrors.pickupDate ? 'mt-1 border-red-500' : 'mt-1'}
                />
                {editErrors.pickupDate && <p className="mt-1 text-xs text-red-500">{editErrors.pickupDate}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-brand/10 pt-6">
          <h2 className="font-semibold text-foreground mb-4">Delivery Details</h2>
          {!isEditing ? (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Address:</span> {order.deliveryAddress}, {order.deliveryCity}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Date:</span> {new Date(order.deliveryDate).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Address *</label>
                <Input
                  value={editData.deliveryAddress ?? ''}
                  onChange={(e) => handleEditChange('deliveryAddress', e.target.value)}
                  className={editErrors.deliveryAddress ? 'mt-1 border-red-500' : 'mt-1'}
                />
                {editErrors.deliveryAddress && <p className="mt-1 text-xs text-red-500">{editErrors.deliveryAddress}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">City *</label>
                <Input
                  value={editData.deliveryCity ?? ''}
                  onChange={(e) => handleEditChange('deliveryCity', e.target.value)}
                  className={editErrors.deliveryCity ? 'mt-1 border-red-500' : 'mt-1'}
                />
                {editErrors.deliveryCity && <p className="mt-1 text-xs text-red-500">{editErrors.deliveryCity}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Date *</label>
                <Input
                  type="date"
                  value={editData.deliveryDate ?? ''}
                  onChange={(e) => handleEditChange('deliveryDate', e.target.value)}
                  className={editErrors.deliveryDate ? 'mt-1 border-red-500' : 'mt-1'}
                />
                {editErrors.deliveryDate && <p className="mt-1 text-xs text-red-500">{editErrors.deliveryDate}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-brand/10 pt-6">
          <h2 className="font-semibold text-foreground mb-4">Cargo Details</h2>
          {!isEditing ? (
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
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Description *</label>
                <textarea
                  value={editData.cargoDescription ?? ''}
                  onChange={(e) => handleEditChange('cargoDescription', e.target.value)}
                  rows={3}
                  className={`mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                    editErrors.cargoDescription ? 'border-red-500' : ''
                  }`}
                />
                {editErrors.cargoDescription && <p className="mt-1 text-xs text-red-500">{editErrors.cargoDescription}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground">Weight (kg)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editData.cargoWeightKg ?? ''}
                    onChange={(e) => handleEditChange('cargoWeightKg', e.target.value ? parseFloat(e.target.value) : 0)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Volume (m³)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editData.cargoVolumeM3 ?? ''}
                    onChange={(e) => handleEditChange('cargoVolumeM3', e.target.value ? parseFloat(e.target.value) : 0)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {(order.notes || isEditing) && (
          <div className="border-t border-brand/10 pt-6">
            {!isEditing ? (
              <>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm text-foreground">{order.notes}</p>
              </>
            ) : (
              <div>
                <label className="text-sm font-medium text-foreground">Notes</label>
                <textarea
                  value={editData.notes ?? ''}
                  onChange={(e) => handleEditChange('notes', e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {(order.deliveryNotes || isEditing) && (
          <div className="border-t border-brand/10 pt-6">
            {!isEditing ? (
              <>
                <p className="text-sm text-muted-foreground">Delivery Notes</p>
                <p className="text-sm text-foreground">{order.deliveryNotes}</p>
              </>
            ) : (
              <div>
                <label className="text-sm font-medium text-foreground">Delivery Notes</label>
                <textarea
                  value={editData.deliveryNotes ?? ''}
                  onChange={(e) => handleEditChange('deliveryNotes', e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {order.driverId && (
          <div className="border-t border-brand/10 pt-6">
            <p className="text-sm text-muted-foreground">Assigned Driver</p>
            <p className="text-sm text-foreground">
              {assignedDriver ? `${assignedDriver.firstName} ${assignedDriver.lastName} (${assignedDriver.employeeCode})` : order.driverId}
            </p>
          </div>
        )}

        {order.vehicleId && (
          <div className="border-t border-brand/10 pt-6">
            <p className="text-sm text-muted-foreground">Assigned Vehicle</p>
            <p className="text-sm text-foreground">
              {assignedVehicle ? `${assignedVehicle.plateNumber} — ${assignedVehicle.type}` : order.vehicleId}
            </p>
          </div>
        )}

        {isEditing && (
          <div className="flex gap-3 border-t border-brand/10 pt-6">
            <Button size="sm" onClick={handleSaveEdit} disabled={updateLoading} data-testid="orders-save-edit-button">
              {updateLoading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={updateLoading}>
              Cancel
            </Button>
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

        {/* Cancel Order — a modal rather than an inline expander, so the
            irreversible action always gets an explicit, focused confirmation.
            It carries a reason field, so it is a Dialog and not the plain
            ConfirmDialog. */}
        {canCancel && (
          <div className="border-t border-brand/10 pt-4">
            <Dialog open={showCancel} onOpenChange={setShowCancel}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  disabled={cancelLoading}
                >
                  Cancel Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel order {order.orderNumber}?</DialogTitle>
                  <DialogDescription>
                    This cannot be undone. The order will be marked as CANCELLED and can no longer be dispatched.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <label htmlFor="cancelNote" className="text-sm font-medium text-foreground">
                    Reason (optional)
                  </label>
                  <Textarea
                    id="cancelNote"
                    placeholder="Why is this order being cancelled?"
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                  />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCancel(false)} disabled={cancelLoading}>
                    Keep order
                  </Button>
                  <Button variant="destructive" onClick={handleCancel} disabled={cancelLoading}>
                    {cancelLoading ? 'Cancelling...' : 'Cancel order'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}
