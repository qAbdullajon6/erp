'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateCustomer, CreateCustomerInput, CustomerPaymentTerms } from '@/lib/api/customers';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';

const PAYMENT_TERMS: CustomerPaymentTerms[] = ['DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45'];

/// Optional text fields start as "" and stay "" unless the user edits them.
/// The API validates them as `@IsOptional() @IsEmail()` (and friends), which
/// rejects "" rather than treating it as absent — so drop empty strings
/// instead of sending them.
function stripEmptyOptionalFields(input: CreateCustomerInput): CreateCustomerInput {
  const cleaned = { ...input };
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'string' && value.trim() === '') {
      delete cleaned[key as keyof CreateCustomerInput];
    }
  }
  return cleaned;
}

export function CustomerCreateForm() {
  const navigate = useNavigate();
  const { create, loading, error } = useCreateCustomer();

  const [formData, setFormData] = useState<CreateCustomerInput>({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    country: '',
    city: '',
    address: '',
    taxId: '',
    paymentTerms: 'NET_30',
    creditLimit: 0,
    deliveryNotes: '',
    internalNotes: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value === '' ? undefined : value }));
    setIsDirty(true);
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.companyName?.trim()) {
      errors.companyName = 'Company name is required';
    } else if (formData.companyName.length > 200) {
      errors.companyName = 'Company name must be 200 characters or less';
    }

    if (!formData.contactName?.trim()) {
      errors.contactName = 'Contact name is required';
    } else if (formData.contactName.length > 200) {
      errors.contactName = 'Contact name must be 200 characters or less';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (formData.phone && formData.phone.length > 50) {
      errors.phone = 'Phone must be 50 characters or less';
    }

    if (formData.creditLimit && (formData.creditLimit < 0 || formData.creditLimit > 999999.99)) {
      errors.creditLimit = 'Credit limit must be between 0 and 999,999.99';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const result = await create(stripEmptyOptionalFields(formData));
      toast.success(`Customer "${result.companyName}" created successfully`);
      navigate({ to: `/app/customers/${result.id}` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create customer');
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      setDiscardOpen(true);
    } else {
      navigate({ to: '/app/customers' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-brand/10 bg-surface p-6">
      {/* Company & Contact */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground">
            Company Name *
          </label>
          <Input
            type="text"
            value={formData.companyName || ''}
            onChange={(e) => handleChange('companyName', e.target.value)}
            placeholder="Acme Corp"
            className="mt-1"
            maxLength={200}
            disabled={loading}
          />
          {validationErrors.companyName && (
            <p className="mt-1 text-xs text-destructive">{validationErrors.companyName}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            Contact Name *
          </label>
          <Input
            type="text"
            value={formData.contactName || ''}
            onChange={(e) => handleChange('contactName', e.target.value)}
            placeholder="John Doe"
            className="mt-1"
            maxLength={200}
            disabled={loading}
          />
          {validationErrors.contactName && (
            <p className="mt-1 text-xs text-destructive">{validationErrors.contactName}</p>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground">Email</label>
          <Input
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="john@acme.com"
            className="mt-1"
            disabled={loading}
          />
          {validationErrors.email && (
            <p className="mt-1 text-xs text-destructive">{validationErrors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">Phone</label>
          <Input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="mt-1"
            maxLength={50}
            disabled={loading}
          />
          {validationErrors.phone && (
            <p className="mt-1 text-xs text-destructive">{validationErrors.phone}</p>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Country</label>
          <Input
            type="text"
            value={formData.country || ''}
            onChange={(e) => handleChange('country', e.target.value)}
            placeholder="United States"
            className="mt-1"
            maxLength={100}
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">City</label>
          <Input
            type="text"
            value={formData.city || ''}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="New York"
            className="mt-1"
            maxLength={100}
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">Tax ID</label>
          <Input
            type="text"
            value={formData.taxId || ''}
            onChange={(e) => handleChange('taxId', e.target.value)}
            placeholder="12-3456789"
            className="mt-1"
            maxLength={100}
            disabled={loading}
          />
        </div>
      </div>

      {/* Address */}
      <div>
        <label className="block text-sm font-medium text-foreground">Address</label>
        <Input
          type="text"
          value={formData.address || ''}
          onChange={(e) => handleChange('address', e.target.value)}
          placeholder="123 Main St"
          className="mt-1"
          maxLength={300}
          disabled={loading}
        />
      </div>

      {/* Financial */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground">Payment Terms</label>
          <select
            value={formData.paymentTerms || 'NET_30'}
            onChange={(e) => handleChange('paymentTerms', e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={loading}
          >
            {PAYMENT_TERMS.map((term) => (
              <option key={term} value={term}>
                {term.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">Credit Limit</label>
          <Input
            type="number"
            value={formData.creditLimit || 0}
            onChange={(e) => handleChange('creditLimit', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="mt-1"
            step="0.01"
            min="0"
            disabled={loading}
          />
          {validationErrors.creditLimit && (
            <p className="mt-1 text-xs text-destructive">{validationErrors.creditLimit}</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground">Delivery Notes</label>
          <textarea
            value={formData.deliveryNotes || ''}
            onChange={(e) => handleChange('deliveryNotes', e.target.value)}
            placeholder="Special delivery instructions..."
            className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            rows={3}
            maxLength={2000}
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">Internal Notes</label>
          <textarea
            value={formData.internalNotes || ''}
            onChange={(e) => handleChange('internalNotes', e.target.value)}
            placeholder="Internal notes (not visible to customer)..."
            className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            rows={3}
            maxLength={2000}
            disabled={loading}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-brand/10 pt-6">
        <Button
          type="submit"
          disabled={loading}
          className="bg-gradient-brand text-brand-foreground hover:opacity-90"
        >
          {loading ? 'Creating...' : 'Create Customer'}
        </Button>
        <Button
          type="button"
          onClick={handleCancel}
          variant="outline"
          disabled={loading}
        >
          Cancel
        </Button>
      </div>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard this customer?"
        description="You have unsaved changes. Leaving now will lose everything you've typed."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => navigate({ to: '/app/customers' })}
        destructive
      />
    </form>
  );
}
