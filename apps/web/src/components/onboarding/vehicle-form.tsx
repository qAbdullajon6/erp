'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap } from 'lucide-react';

interface VehicleFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

export function VehicleForm({ onSuccess, onCancel }: VehicleFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    vehicleCode: 'VEH-001',
    plateNumber: '',
    type: 'Van',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    capacityKg: '',
    capacityM3: '',
    insuranceExpiry: '',
    inspectionExpiry: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'year' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        capacityKg: formData.capacityKg ? parseFloat(formData.capacityKg) : null,
        capacityM3: formData.capacityM3 ? parseFloat(formData.capacityM3) : null,
        insuranceExpiry: formData.insuranceExpiry ? new Date(formData.insuranceExpiry).toISOString() : null,
        inspectionExpiry: formData.inspectionExpiry ? new Date(formData.inspectionExpiry).toISOString() : null,
      };

      const response = await fetch('/api/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create vehicle');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg bg-orange-100 p-2">
          <Zap className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Add Your First Vehicle</h2>
          <p className="text-sm text-slate-600">Register a vehicle for your fleet</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vehicle Code */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Vehicle Code
            </label>
            <Input
              type="text"
              name="vehicleCode"
              value={formData.vehicleCode}
              onChange={handleChange}
              placeholder="e.g., VEH-001"
              required
            />
          </div>

          {/* Plate Number */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Plate Number *
            </label>
            <Input
              type="text"
              name="plateNumber"
              value={formData.plateNumber}
              onChange={handleChange}
              placeholder="e.g., T-001-ABC"
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Type
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Van">Van</option>
              <option value="Truck">Truck</option>
              <option value="Motorcycle">Motorcycle</option>
              <option value="Car">Car</option>
            </select>
          </div>

          {/* Make */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Make
            </label>
            <Input
              type="text"
              name="make"
              value={formData.make}
              onChange={handleChange}
              placeholder="e.g., Toyota"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Model
            </label>
            <Input
              type="text"
              name="model"
              value={formData.model}
              onChange={handleChange}
              placeholder="e.g., Hiace"
            />
          </div>

          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Year
            </label>
            <Input
              type="number"
              name="year"
              value={formData.year}
              onChange={handleChange}
              min="2000"
              max={new Date().getFullYear() + 1}
            />
          </div>

          {/* Capacity (kg) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Capacity (kg)
            </label>
            <Input
              type="number"
              name="capacityKg"
              value={formData.capacityKg}
              onChange={handleChange}
              placeholder="e.g., 1500"
            />
          </div>

          {/* Capacity (m³) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Capacity (m³)
            </label>
            <Input
              type="number"
              name="capacityM3"
              value={formData.capacityM3}
              onChange={handleChange}
              placeholder="e.g., 8"
            />
          </div>

          {/* Insurance Expiry */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Insurance Expiry
            </label>
            <Input
              type="date"
              name="insuranceExpiry"
              value={formData.insuranceExpiry}
              onChange={handleChange}
            />
          </div>

          {/* Inspection Expiry */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Inspection Expiry
            </label>
            <Input
              type="date"
              name="inspectionExpiry"
              value={formData.inspectionExpiry}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-6">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Creating...' : 'Add Vehicle'}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1"
            >
              Skip for Now
            </Button>
          )}
        </div>
      </form>

      <p className="text-xs text-slate-500 pt-4">
        * Required fields. You can add more vehicles later.
      </p>
    </div>
  );
}
