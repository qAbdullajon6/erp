'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useCreateVehicle, type CreateVehicleInput } from '@/lib/api/vehicles';

export function VehiclesCreateForm() {
  const router = useRouter();
  const { mutate, loading, error: submitError } = useCreateVehicle();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CreateVehicleInput>({
    plateNumber: '',
    type: '',
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.plateNumber.trim()) newErrors.plateNumber = 'Plate number is required';
    if (formData.plateNumber.length > 50) newErrors.plateNumber = 'Max 50 characters';

    if (!formData.type.trim()) newErrors.type = 'Type is required';
    if (formData.type.length > 100) newErrors.type = 'Max 100 characters';

    if (formData.capacityKg !== undefined && formData.capacityKg < 0) {
      newErrors.capacityKg = 'Capacity must be >= 0';
    }

    if (formData.capacityM3 !== undefined && formData.capacityM3 < 0) {
      newErrors.capacityM3 = 'Capacity must be >= 0';
    }

    if (formData.year && (formData.year < 1980 || formData.year > new Date().getUTCFullYear() + 1)) {
      newErrors.year = 'Year must be between 1980 and current year + 1';
    }

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
      const result = await mutate(formData);
      router.navigate({ to: `/app/vehicles/${result.id}` });
    } catch {
      // Error already in submitError state
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Create Vehicle</h1>

      {submitError && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plate Number *</label>
            <input
              type="text"
              value={formData.plateNumber}
              onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
              data-testid="vehicles-plate-number"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.plateNumber && <p className="text-red-600 text-sm mt-1">{errors.plateNumber}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type *</label>
            <input
              type="text"
              placeholder="e.g., Box Truck, Van"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              data-testid="vehicles-type"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.type && <p className="text-red-600 text-sm mt-1">{errors.type}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Capacity (kg)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.capacityKg || ''}
              onChange={(e) => setFormData({ ...formData, capacityKg: e.target.value ? parseFloat(e.target.value) : undefined })}
              data-testid="vehicles-capacity-kg"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.capacityKg && <p className="text-red-600 text-sm mt-1">{errors.capacityKg}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Capacity (m³)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.capacityM3 || ''}
              onChange={(e) => setFormData({ ...formData, capacityM3: e.target.value ? parseFloat(e.target.value) : undefined })}
              data-testid="vehicles-capacity-m3"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.capacityM3 && <p className="text-red-600 text-sm mt-1">{errors.capacityM3}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Make</label>
            <input
              type="text"
              value={formData.make || ''}
              onChange={(e) => setFormData({ ...formData, make: e.target.value || undefined })}
              data-testid="vehicles-make"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <input
              type="text"
              value={formData.model || ''}
              onChange={(e) => setFormData({ ...formData, model: e.target.value || undefined })}
              data-testid="vehicles-model"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Year</label>
            <input
              type="number"
              min="1980"
              max={new Date().getUTCFullYear() + 1}
              value={formData.year || ''}
              onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })}
              data-testid="vehicles-year"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.year && <p className="text-red-600 text-sm mt-1">{errors.year}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Vehicle Code (Optional)</label>
            <input
              type="text"
              placeholder="Leave empty to auto-generate"
              value={formData.vehicleCode || ''}
              onChange={(e) => setFormData({ ...formData, vehicleCode: e.target.value || undefined })}
              data-testid="vehicles-code"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Insurance Expiry</label>
            <input
              type="date"
              value={formData.insuranceExpiry || ''}
              onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value || undefined })}
              data-testid="vehicles-insurance-expiry"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Inspection Expiry</label>
            <input
              type="date"
              value={formData.inspectionExpiry || ''}
              onChange={(e) => setFormData({ ...formData, inspectionExpiry: e.target.value || undefined })}
              data-testid="vehicles-inspection-expiry"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            data-testid="vehicles-submit-button"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Vehicle'}
          </button>
          <button
            type="button"
            onClick={() => router.navigate({ to: '/app/vehicles' })}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
