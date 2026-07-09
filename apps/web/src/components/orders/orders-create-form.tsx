'use client';

import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateOrder, type CreateOrderInput } from '@/lib/api/orders';
import { customersAPI } from '@/lib/api/customers';
import { toast } from 'sonner';

interface FormErrors {
  [key: string]: string;
}

export function OrdersCreateForm() {
  const navigate = useNavigate();
  const { create, loading, error: createError } = useCreateOrder();

  const [customers, setCustomers] = useState<any[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [formData, setFormData] = useState<CreateOrderInput>({
    customerId: '',
    pickupAddress: '',
    pickupCity: '',
    pickupDate: '',
    deliveryAddress: '',
    deliveryCity: '',
    deliveryDate: '',
    cargoDescription: '',
    price: 0,
    currency: 'USD',
  });

  const [validationErrors, setValidationErrors] = useState<FormErrors>({});
  const [isDirty, setIsDirty] = useState(false);

  // Load active customers
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const response = await customersAPI.list({ status: 'ACTIVE', limit: 100 });
        setCustomers(response.items);
      } catch (err) {
        console.error('Failed to load customers:', err);
        toast.error('Failed to load customers');
      } finally {
        setCustomersLoading(false);
      }
    };

    loadCustomers();
  }, []);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // Clear error for this field when user starts typing
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.customerId) {
      errors.customerId = 'Customer is required';
    }

    if (!formData.pickupAddress?.trim()) {
      errors.pickupAddress = 'Pickup address is required';
    } else if (formData.pickupAddress.length > 300) {
      errors.pickupAddress = 'Pickup address must be 300 characters or less';
    }

    if (!formData.pickupCity?.trim()) {
      errors.pickupCity = 'Pickup city is required';
    } else if (formData.pickupCity.length > 100) {
      errors.pickupCity = 'Pickup city must be 100 characters or less';
    }

    if (!formData.pickupDate) {
      errors.pickupDate = 'Pickup date is required';
    }

    if (!formData.deliveryAddress?.trim()) {
      errors.deliveryAddress = 'Delivery address is required';
    } else if (formData.deliveryAddress.length > 300) {
      errors.deliveryAddress = 'Delivery address must be 300 characters or less';
    }

    if (!formData.deliveryCity?.trim()) {
      errors.deliveryCity = 'Delivery city is required';
    } else if (formData.deliveryCity.length > 100) {
      errors.deliveryCity = 'Delivery city must be 100 characters or less';
    }

    if (!formData.deliveryDate) {
      errors.deliveryDate = 'Delivery date is required';
    }

    if (formData.pickupDate && formData.deliveryDate) {
      const pickup = new Date(formData.pickupDate);
      const delivery = new Date(formData.deliveryDate);
      if (delivery < pickup) {
        errors.deliveryDate = 'Delivery date cannot be before pickup date';
      }
    }

    if (!formData.cargoDescription?.trim()) {
      errors.cargoDescription = 'Cargo description is required';
    } else if (formData.cargoDescription.length > 2000) {
      errors.cargoDescription = 'Cargo description must be 2000 characters or less';
    }

    if (formData.cargoWeightKg !== undefined && formData.cargoWeightKg < 0) {
      errors.cargoWeightKg = 'Weight must be greater than or equal to 0';
    }

    if (formData.cargoVolumeM3 !== undefined && formData.cargoVolumeM3 < 0) {
      errors.cargoVolumeM3 = 'Volume must be greater than or equal to 0';
    }

    if (formData.price === undefined || formData.price === '' || formData.price < 0) {
      errors.price = 'Price is required and must be greater than or equal to 0';
    }

    if (formData.currency && !/^[A-Z]{3}$/.test(formData.currency)) {
      errors.currency = 'Currency must be a 3-letter ISO code (e.g. USD)';
    }

    if (formData.notes && formData.notes.length > 2000) {
      errors.notes = 'Notes must be 2000 characters or less';
    }

    if (formData.deliveryNotes && formData.deliveryNotes.length > 2000) {
      errors.deliveryNotes = 'Delivery notes must be 2000 characters or less';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix validation errors');
      return;
    }

    try {
      const result = await create(formData);
      toast.success('Order created successfully');
      navigate({ to: `/app/orders/${result.id}` });
    } catch (err) {
      // Error is already set in hook
      toast.error(createError || 'Failed to create order');
    }
  };

  const getInputClass = (fieldName: string) => {
    const baseClass = 'mt-1';
    return validationErrors[fieldName] ? `${baseClass} border-red-500` : baseClass;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-foreground">Create Order</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fill in the order details below</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 rounded-lg border border-brand/10 bg-surface p-6">
        {/* Customer Selection */}
        <div className="space-y-4 pb-6 border-b border-brand/10">
          <h2 className="font-semibold text-foreground">Customer</h2>
          <div>
            <label className="text-sm font-medium text-foreground">Customer *</label>
            <select
              value={formData.customerId}
              onChange={(e) => handleChange('customerId', e.target.value)}
              disabled={customersLoading}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="orders-customer-select"
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} ({c.contactName})
                </option>
              ))}
            </select>
            {validationErrors.customerId && (
              <p className="mt-1 text-sm text-red-500">{validationErrors.customerId}</p>
            )}
          </div>
        </div>

        {/* Pickup Information */}
        <div className="space-y-4 pb-6 border-b border-brand/10">
          <h2 className="font-semibold text-foreground">Pickup Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Address *</label>
              <Input
                type="text"
                placeholder="123 Main St"
                value={formData.pickupAddress}
                onChange={(e) => handleChange('pickupAddress', e.target.value)}
                maxLength={300}
                className={getInputClass('pickupAddress')}
                data-testid="orders-pickup-address"
              />
              {validationErrors.pickupAddress && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.pickupAddress}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">City *</label>
              <Input
                type="text"
                placeholder="New York"
                value={formData.pickupCity}
                onChange={(e) => handleChange('pickupCity', e.target.value)}
                maxLength={100}
                className={getInputClass('pickupCity')}
                data-testid="orders-pickup-city"
              />
              {validationErrors.pickupCity && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.pickupCity}</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Date *</label>
            <Input
              type="date"
              value={formData.pickupDate}
              onChange={(e) => handleChange('pickupDate', e.target.value)}
              className={getInputClass('pickupDate')}
              data-testid="orders-pickup-date"
            />
            {validationErrors.pickupDate && (
              <p className="mt-1 text-sm text-red-500">{validationErrors.pickupDate}</p>
            )}
          </div>
        </div>

        {/* Delivery Information */}
        <div className="space-y-4 pb-6 border-b border-brand/10">
          <h2 className="font-semibold text-foreground">Delivery Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Address *</label>
              <Input
                type="text"
                placeholder="456 Oak Ave"
                value={formData.deliveryAddress}
                onChange={(e) => handleChange('deliveryAddress', e.target.value)}
                maxLength={300}
                className={getInputClass('deliveryAddress')}
                data-testid="orders-delivery-address"
              />
              {validationErrors.deliveryAddress && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.deliveryAddress}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">City *</label>
              <Input
                type="text"
                placeholder="Los Angeles"
                value={formData.deliveryCity}
                onChange={(e) => handleChange('deliveryCity', e.target.value)}
                maxLength={100}
                className={getInputClass('deliveryCity')}
                data-testid="orders-delivery-city"
              />
              {validationErrors.deliveryCity && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.deliveryCity}</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Date *</label>
            <Input
              type="date"
              value={formData.deliveryDate}
              onChange={(e) => handleChange('deliveryDate', e.target.value)}
              className={getInputClass('deliveryDate')}
              data-testid="orders-delivery-date"
            />
            {validationErrors.deliveryDate && (
              <p className="mt-1 text-sm text-red-500">{validationErrors.deliveryDate}</p>
            )}
          </div>
        </div>

        {/* Cargo Information */}
        <div className="space-y-4 pb-6 border-b border-brand/10">
          <h2 className="font-semibold text-foreground">Cargo Details</h2>
          <div>
            <label className="text-sm font-medium text-foreground">Description *</label>
            <textarea
              placeholder="Describe the cargo to be transported"
              value={formData.cargoDescription}
              onChange={(e) => handleChange('cargoDescription', e.target.value)}
              maxLength={2000}
              rows={3}
              className={`mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                validationErrors.cargoDescription ? 'border-red-500' : ''
              }`}
              data-testid="orders-cargo-description"
            />
            {validationErrors.cargoDescription && (
              <p className="mt-1 text-sm text-red-500">{validationErrors.cargoDescription}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Weight (kg)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={formData.cargoWeightKg || ''}
                onChange={(e) => handleChange('cargoWeightKg', e.target.value ? parseFloat(e.target.value) : 0)}
                step="0.01"
                min="0"
                className={getInputClass('cargoWeightKg')}
                data-testid="orders-cargo-weight"
              />
              {validationErrors.cargoWeightKg && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.cargoWeightKg}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Volume (m³)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={formData.cargoVolumeM3 || ''}
                onChange={(e) => handleChange('cargoVolumeM3', e.target.value ? parseFloat(e.target.value) : 0)}
                step="0.01"
                min="0"
                className={getInputClass('cargoVolumeM3')}
                data-testid="orders-cargo-volume"
              />
              {validationErrors.cargoVolumeM3 && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.cargoVolumeM3}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-4 pb-6 border-b border-brand/10">
          <h2 className="font-semibold text-foreground">Pricing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Price *</label>
              <Input
                type="number"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => handleChange('price', e.target.value ? parseFloat(e.target.value) : 0)}
                step="0.01"
                min="0"
                className={getInputClass('price')}
                data-testid="orders-price"
              />
              {validationErrors.price && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.price}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Currency</label>
              <Input
                type="text"
                placeholder="USD"
                value={formData.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
                maxLength={3}
                className={getInputClass('currency')}
                data-testid="orders-currency"
              />
              {validationErrors.currency && (
                <p className="mt-1 text-sm text-red-500">{validationErrors.currency}</p>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-4">
          <h2 className="font-semibold text-foreground">Additional Information</h2>
          <div>
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              placeholder="Any additional notes for this order"
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              maxLength={2000}
              rows={2}
              className={`mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                validationErrors.notes ? 'border-red-500' : ''
              }`}
              data-testid="orders-notes"
            />
            {validationErrors.notes && (
              <p className="mt-1 text-sm text-red-500">{validationErrors.notes}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Delivery Notes</label>
            <textarea
              placeholder="Special instructions for delivery"
              value={formData.deliveryNotes || ''}
              onChange={(e) => handleChange('deliveryNotes', e.target.value)}
              maxLength={2000}
              rows={2}
              className={`mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                validationErrors.deliveryNotes ? 'border-red-500' : ''
              }`}
              data-testid="orders-delivery-notes"
            />
            {validationErrors.deliveryNotes && (
              <p className="mt-1 text-sm text-red-500">{validationErrors.deliveryNotes}</p>
            )}
          </div>
        </div>

        {/* Form Error */}
        {createError && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {createError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t border-brand/10">
          <Button
            type="submit"
            disabled={loading}
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
            data-testid="orders-submit-button"
          >
            {loading ? 'Creating...' : 'Create Order'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: '/app/orders' })}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
