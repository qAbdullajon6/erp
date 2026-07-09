'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useCreateDispatch } from '@/lib/hooks/use-dispatches';
import { useOrdersList } from '@/lib/api/orders';
import { useDriversList } from '@/lib/api/drivers';
import { useVehiclesList } from '@/lib/api/vehicles';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { FormField, FormError } from '@/components/shared/form-field';
import { DetailField } from '@/components/shared/detail-field';
import { StatusBadge } from '@/components/shared/status-badge';

/// An order that is already delivered or cancelled can never receive a new
/// dispatch, so it is left out of the picker rather than shown and rejected
/// by the API on submit.
const DISPATCHABLE_ORDER_STATUSES = new Set(['DRAFT', 'PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']);

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

export function DispatchesCreateForm() {
  const router = useRouter();
  const { create, loading: creating, error: submitError } = useCreateDispatch();
  const { data: ordersData } = useOrdersList({ page: 1, limit: 100 });
  const { data: driversData } = useDriversList({ includeArchived: false, limit: 100 });
  const { data: vehiclesData } = useVehiclesList({ includeArchived: false, limit: 100 });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    orderId: '',
    driverId: '',
    vehicleId: '',
    notes: '',
  });

  const selectableOrders = (ordersData ?? []).filter((o) => DISPATCHABLE_ORDER_STATUSES.has(o.status));
  const selectableDrivers = (driversData?.items ?? []).filter((d) => d.status === 'ACTIVE' && !d.archivedAt);
  const selectableVehicles = (vehiclesData?.items ?? []).filter((v) => v.status === 'AVAILABLE' && !v.archivedAt);

  const selectedOrder = selectableOrders.find((o) => o.id === formData.orderId);
  const selectedDriver = selectableDrivers.find((d) => d.id === formData.driverId);
  const selectedVehicle = selectableVehicles.find((v) => v.id === formData.vehicleId);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.orderId.trim()) newErrors.orderId = 'Order is required';
    if (!formData.driverId.trim()) newErrors.driverId = 'Driver is required';
    if (!formData.vehicleId.trim()) newErrors.vehicleId = 'Vehicle is required';
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validateForm();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await create({
        orderId: formData.orderId,
        driverId: formData.driverId,
        vehicleId: formData.vehicleId,
        notes: formData.notes || undefined,
      });
      router.navigate({ to: `/app/dispatches/${result.id}` });
    } catch {
      // Surfaced through submitError below.
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Create Dispatch" subtitle="Assign a driver and vehicle to an order" />

      {submitError && <FormError message={submitError} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField id="orderId" label="Order" required error={errors.orderId}>
              <select
                id="orderId"
                value={formData.orderId}
                onChange={(e) => {
                  setFormData({ ...formData, orderId: e.target.value });
                  setErrors({ ...errors, orderId: '' });
                }}
                className={`${SELECT_CLASS} ${errors.orderId ? 'border-destructive' : ''}`}
              >
                <option value="">Select an order...</option>
                {selectableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber} ({order.status})
                  </option>
                ))}
              </select>
            </FormField>

            {selectedOrder && (
              <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-2">
                <DetailField label="Order #" value={selectedOrder.orderNumber} mono />
                <DetailField label="Status" value={<StatusBadge status={selectedOrder.status} />} />
                <DetailField label="Pickup" value={selectedOrder.pickupCity} />
                <DetailField label="Delivery" value={selectedOrder.deliveryCity} />
                <DetailField label="Scheduled Pickup" value={formatDate(selectedOrder.pickupDate)} />
                <DetailField label="Scheduled Delivery" value={formatDate(selectedOrder.deliveryDate)} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Driver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField id="driverId" label="Driver" required error={errors.driverId}>
              <select
                id="driverId"
                value={formData.driverId}
                onChange={(e) => {
                  setFormData({ ...formData, driverId: e.target.value });
                  setErrors({ ...errors, driverId: '' });
                }}
                className={`${SELECT_CLASS} ${errors.driverId ? 'border-destructive' : ''}`}
              >
                <option value="">Select a driver...</option>
                {selectableDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.firstName} {driver.lastName} ({driver.phone})
                  </option>
                ))}
              </select>
            </FormField>

            {selectedDriver && (
              <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-2">
                <DetailField label="Code" value={selectedDriver.employeeCode} mono />
                <DetailField label="Status" value={<StatusBadge status={selectedDriver.status} />} />
                <DetailField label="Phone" value={selectedDriver.phone} />
                <DetailField label="License" value={selectedDriver.licenseNumber} mono />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField id="vehicleId" label="Vehicle" required error={errors.vehicleId}>
              <select
                id="vehicleId"
                value={formData.vehicleId}
                onChange={(e) => {
                  setFormData({ ...formData, vehicleId: e.target.value });
                  setErrors({ ...errors, vehicleId: '' });
                }}
                className={`${SELECT_CLASS} ${errors.vehicleId ? 'border-destructive' : ''}`}
              >
                <option value="">Select a vehicle...</option>
                {selectableVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} — {vehicle.type}
                    {vehicle.capacityKg ? ` (${vehicle.capacityKg}kg)` : ''}
                  </option>
                ))}
              </select>
            </FormField>

            {selectedVehicle && (
              <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-2">
                <DetailField label="Code" value={selectedVehicle.vehicleCode} mono />
                <DetailField label="Status" value={<StatusBadge status={selectedVehicle.status} />} />
                <DetailField label="Plate" value={selectedVehicle.plateNumber} mono />
                <DetailField label="Type" value={<span className="capitalize">{selectedVehicle.type}</span>} />
                <DetailField label="Capacity (kg)" value={selectedVehicle.capacityKg} />
                <DetailField label="Capacity (m³)" value={selectedVehicle.capacityM3} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes about this dispatch..."
              rows={3}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={creating}
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            {creating ? 'Creating...' : 'Create Dispatch'}
          </Button>
          <Button type="button" onClick={() => router.navigate({ to: '/app/dispatches' })} variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
