'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useCreateVehicle, type CreateVehicleInput } from '@/lib/api/vehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { FormField, FormError } from '@/components/shared/form-field';
import { toast } from 'sonner';

/** Number inputs come back as '' when cleared; the API wants the key absent. */
function toOptionalNumber(value: string): number | undefined {
  return value === '' ? undefined : parseFloat(value);
}

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
      toast.success(`Vehicle "${result.plateNumber}" created`);
      router.navigate({ to: `/app/vehicles/${result.id}` });
    } catch {
      // Surfaced through submitError below.
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Create Vehicle" subtitle="Add a vehicle to your fleet" />

      {submitError && <FormError message={submitError} />}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="plateNumber" label="Plate Number" required error={errors.plateNumber}>
                <Input
                  id="plateNumber"
                  value={formData.plateNumber}
                  onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
                  data-testid="vehicles-plate-number"
                />
              </FormField>

              <FormField id="type" label="Type" required error={errors.type} hint="e.g. box truck, refrigerated truck">
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  data-testid="vehicles-type"
                />
              </FormField>

              <FormField id="capacityKg" label="Capacity (kg)" error={errors.capacityKg}>
                <Input
                  id="capacityKg"
                  type="number"
                  value={formData.capacityKg ?? ''}
                  onChange={(e) => setFormData({ ...formData, capacityKg: toOptionalNumber(e.target.value) })}
                  data-testid="vehicles-capacity-kg"
                />
              </FormField>

              <FormField id="capacityM3" label="Capacity (m³)" error={errors.capacityM3}>
                <Input
                  id="capacityM3"
                  type="number"
                  value={formData.capacityM3 ?? ''}
                  onChange={(e) => setFormData({ ...formData, capacityM3: toOptionalNumber(e.target.value) })}
                  data-testid="vehicles-capacity-m3"
                />
              </FormField>

              <FormField id="make" label="Make">
                <Input
                  id="make"
                  value={formData.make || ''}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value || undefined })}
                  data-testid="vehicles-make"
                />
              </FormField>

              <FormField id="model" label="Model">
                <Input
                  id="model"
                  value={formData.model || ''}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value || undefined })}
                  data-testid="vehicles-model"
                />
              </FormField>

              <FormField id="year" label="Year" error={errors.year}>
                <Input
                  id="year"
                  type="number"
                  value={formData.year ?? ''}
                  onChange={(e) => setFormData({ ...formData, year: toOptionalNumber(e.target.value) })}
                  data-testid="vehicles-year"
                />
              </FormField>

              <FormField id="vehicleCode" label="Vehicle Code" hint="Leave empty to auto-generate">
                <Input
                  id="vehicleCode"
                  value={formData.vehicleCode || ''}
                  onChange={(e) => setFormData({ ...formData, vehicleCode: e.target.value || undefined })}
                  data-testid="vehicles-code"
                />
              </FormField>

              <FormField id="insuranceExpiry" label="Insurance Expiry">
                <Input
                  id="insuranceExpiry"
                  type="date"
                  value={formData.insuranceExpiry || ''}
                  onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value || undefined })}
                  data-testid="vehicles-insurance-expiry"
                />
              </FormField>

              <FormField id="inspectionExpiry" label="Inspection Expiry">
                <Input
                  id="inspectionExpiry"
                  type="date"
                  value={formData.inspectionExpiry || ''}
                  onChange={(e) => setFormData({ ...formData, inspectionExpiry: e.target.value || undefined })}
                  data-testid="vehicles-inspection-expiry"
                />
              </FormField>
            </div>

            <div className="flex gap-3 border-t border-brand/10 pt-4">
              <Button
                type="submit"
                disabled={loading}
                data-testid="vehicles-submit-button"
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                {loading ? 'Creating...' : 'Create Vehicle'}
              </Button>
              <Button type="button" onClick={() => router.navigate({ to: '/app/vehicles' })} variant="outline">
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
