'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useCreateDispatch } from '@/lib/hooks/use-dispatches';
import { useOrdersList } from '@/lib/api/orders';
import { useDriversList } from '@/lib/api/drivers';
import { useVehiclesList } from '@/lib/api/vehicles';

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

  const selectedOrder = ordersData?.find((o) => o.id === formData.orderId);
  const selectedDriver = driversData?.items?.find((d) => d.id === formData.driverId);
  const selectedVehicle = vehiclesData?.items?.find((v) => v.id === formData.vehicleId);

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
    } catch (err) {
      // Error already in submitError state
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Create Dispatch</h1>

      {submitError && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Order Selection */}
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Order *</label>
            <select
              value={formData.orderId}
              onChange={(e) => {
                setFormData({ ...formData, orderId: e.target.value });
                setErrors({ ...errors, orderId: '' });
              }}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.orderId ? 'border-red-500' : ''
              }`}
            >
              <option value="">Select an order...</option>
              {ordersData?.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} ({order.status})
                </option>
              ))}
            </select>
            {errors.orderId && (
              <p className="text-red-600 text-sm mt-1">{errors.orderId}</p>
            )}
          </div>

          {selectedOrder && (
            <div className="bg-gray-50 p-4 rounded border space-y-2">
              <h3 className="font-semibold text-sm">Order Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Order #:</span> {selectedOrder.orderNumber}
                </div>
                <div>
                  <span className="text-gray-600">Status:</span> {selectedOrder.status}
                </div>
                <div>
                  <span className="text-gray-600">Pickup:</span>{' '}
                  {selectedOrder.pickupCity || 'N/A'}
                </div>
                <div>
                  <span className="text-gray-600">Delivery:</span>{' '}
                  {selectedOrder.deliveryCity || 'N/A'}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Scheduled Pickup:</span>{' '}
                  {formatDate(selectedOrder.pickupDate)}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Scheduled Delivery:</span>{' '}
                  {formatDate(selectedOrder.deliveryDate)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Driver Selection */}
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Driver *</label>
            <select
              value={formData.driverId}
              onChange={(e) => {
                setFormData({ ...formData, driverId: e.target.value });
                setErrors({ ...errors, driverId: '' });
              }}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.driverId ? 'border-red-500' : ''
              }`}
            >
              <option value="">Select a driver...</option>
              {driversData?.items
                ?.filter((d) => d.status === 'ACTIVE' && !d.archivedAt)
                .map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.firstName} {driver.lastName} ({driver.phone})
                  </option>
                ))}
            </select>
            {errors.driverId && (
              <p className="text-red-600 text-sm mt-1">{errors.driverId}</p>
            )}
          </div>

          {selectedDriver && (
            <div className="bg-gray-50 p-4 rounded border space-y-2">
              <h3 className="font-semibold text-sm">Driver Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Code:</span>{' '}
                  {selectedDriver.employeeCode}
                </div>
                <div>
                  <span className="text-gray-600">Status:</span> {selectedDriver.status}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Phone:</span> {selectedDriver.phone}
                </div>
                {selectedDriver.licenseNumber && (
                  <div className="col-span-2">
                    <span className="text-gray-600">License:</span>{' '}
                    {selectedDriver.licenseNumber}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Vehicle Selection */}
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Vehicle *</label>
            <select
              value={formData.vehicleId}
              onChange={(e) => {
                setFormData({ ...formData, vehicleId: e.target.value });
                setErrors({ ...errors, vehicleId: '' });
              }}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.vehicleId ? 'border-red-500' : ''
              }`}
            >
              <option value="">Select a vehicle...</option>
              {vehiclesData?.items
                ?.filter((v) => v.status === 'AVAILABLE' && !v.archivedAt)
                .map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} - {vehicle.type} (Cap: {vehicle.capacityKg}kg)
                  </option>
                ))}
            </select>
            {errors.vehicleId && (
              <p className="text-red-600 text-sm mt-1">{errors.vehicleId}</p>
            )}
          </div>

          {selectedVehicle && (
            <div className="bg-gray-50 p-4 rounded border space-y-2">
              <h3 className="font-semibold text-sm">Vehicle Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Code:</span> {selectedVehicle.vehicleCode}
                </div>
                <div>
                  <span className="text-gray-600">Type:</span> {selectedVehicle.type}
                </div>
                <div>
                  <span className="text-gray-600">Plate:</span> {selectedVehicle.plateNumber}
                </div>
                <div>
                  <span className="text-gray-600">Status:</span> {selectedVehicle.status}
                </div>
                <div>
                  <span className="text-gray-600">Capacity (kg):</span>{' '}
                  {selectedVehicle.capacityKg || 'N/A'}
                </div>
                <div>
                  <span className="text-gray-600">Capacity (m³):</span>{' '}
                  {selectedVehicle.capacityM3 || 'N/A'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white p-6 rounded-lg border">
          <label className="block text-sm font-medium mb-2">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Optional notes about this dispatch..."
            rows={3}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        {/* Form Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={creating}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Dispatch'}
          </button>
          <button
            type="button"
            onClick={() => router.navigate({ to: '/app/dispatches' })}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
