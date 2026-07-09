'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useCreateDriver, type CreateDriverInput } from '@/lib/api/drivers';

export function DriversCreateForm() {
  const router = useRouter();
  const { mutate, loading, error: submitError } = useCreateDriver();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CreateDriverInput>({
    firstName: '',
    lastName: '',
    phone: '',
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (formData.firstName.length > 100) newErrors.firstName = 'Max 100 characters';

    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (formData.lastName.length > 100) newErrors.lastName = 'Max 100 characters';

    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    if (formData.phone.length > 50) newErrors.phone = 'Max 50 characters';

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (formData.employeeCode && !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(formData.employeeCode)) {
      newErrors.employeeCode = 'Only letters, numbers, and hyphens allowed';
    }
    if (formData.employeeCode && formData.employeeCode.length > 50) {
      newErrors.employeeCode = 'Max 50 characters';
    }

    if (formData.licenseExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(formData.licenseExpiry)) {
      newErrors.licenseExpiry = 'Use YYYY-MM-DD format';
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
      router.navigate({ to: `/app/drivers/${result.id}` });
    } catch {
      // Error already in submitError state
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Create Driver</h1>

      {submitError && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">First Name *</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              data-testid="drivers-first-name"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.firstName && <p className="text-red-600 text-sm mt-1">{errors.firstName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Last Name *</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              data-testid="drivers-last-name"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.lastName && <p className="text-red-600 text-sm mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Phone *</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            data-testid="drivers-phone"
            className="w-full px-3 py-2 border rounded-lg"
          />
          {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value || undefined })}
            data-testid="drivers-email"
            className="w-full px-3 py-2 border rounded-lg"
          />
          {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">License Number</label>
            <input
              type="text"
              value={formData.licenseNumber || ''}
              onChange={(e) =>
                setFormData({ ...formData, licenseNumber: e.target.value || undefined })
              }
              data-testid="drivers-license-number"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">License Expiry (YYYY-MM-DD)</label>
            <input
              type="date"
              value={formData.licenseExpiry || ''}
              onChange={(e) =>
                setFormData({ ...formData, licenseExpiry: e.target.value || undefined })
              }
              data-testid="drivers-license-expiry"
              className="w-full px-3 py-2 border rounded-lg"
            />
            {errors.licenseExpiry && <p className="text-red-600 text-sm mt-1">{errors.licenseExpiry}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Employee Code (Optional)</label>
          <input
            type="text"
            placeholder="Leave empty to auto-generate"
            value={formData.employeeCode || ''}
            onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value || undefined })}
            data-testid="drivers-employee-code"
            className="w-full px-3 py-2 border rounded-lg"
          />
          {errors.employeeCode && <p className="text-red-600 text-sm mt-1">{errors.employeeCode}</p>}
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            data-testid="drivers-submit-button"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Driver'}
          </button>
          <button
            type="button"
            onClick={() => router.navigate({ to: '/app/drivers' })}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
