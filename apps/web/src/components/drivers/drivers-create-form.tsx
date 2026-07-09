'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useCreateDriver, type CreateDriverInput } from '@/lib/api/drivers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { FormField, FormError } from '@/components/shared/form-field';
import { toast } from 'sonner';

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
      toast.success(`Driver "${result.firstName} ${result.lastName}" created`);
      router.navigate({ to: `/app/drivers/${result.id}` });
    } catch {
      // Surfaced through submitError below.
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Create Driver" subtitle="Add a driver to your fleet" />

      {submitError && <FormError message={submitError} />}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="firstName" label="First Name" required error={errors.firstName}>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  data-testid="drivers-first-name"
                />
              </FormField>

              <FormField id="lastName" label="Last Name" required error={errors.lastName}>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  data-testid="drivers-last-name"
                />
              </FormField>
            </div>

            <FormField id="phone" label="Phone" required error={errors.phone}>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                data-testid="drivers-phone"
              />
            </FormField>

            <FormField id="email" label="Email" error={errors.email}>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value || undefined })}
                data-testid="drivers-email"
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="licenseNumber" label="License Number">
                <Input
                  id="licenseNumber"
                  value={formData.licenseNumber || ''}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value || undefined })}
                  data-testid="drivers-license-number"
                />
              </FormField>

              <FormField id="licenseExpiry" label="License Expiry" error={errors.licenseExpiry}>
                <Input
                  id="licenseExpiry"
                  type="date"
                  value={formData.licenseExpiry || ''}
                  onChange={(e) => setFormData({ ...formData, licenseExpiry: e.target.value || undefined })}
                  data-testid="drivers-license-expiry"
                />
              </FormField>
            </div>

            <FormField
              id="employeeCode"
              label="Employee Code"
              error={errors.employeeCode}
              hint="Leave empty to auto-generate"
            >
              <Input
                id="employeeCode"
                value={formData.employeeCode || ''}
                onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value || undefined })}
                data-testid="drivers-employee-code"
              />
            </FormField>

            <div className="flex gap-3 border-t border-brand/10 pt-4">
              <Button
                type="submit"
                disabled={loading}
                data-testid="drivers-submit-button"
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                {loading ? 'Creating...' : 'Create Driver'}
              </Button>
              <Button type="button" onClick={() => router.navigate({ to: '/app/drivers' })} variant="outline">
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
