'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateOrder, type CreateOrderInput } from '@/lib/api/orders';
import { useCustomersList } from '@/lib/api/customers';
import { PageHeader } from '@/components/shared/page-header';
import { FormField, FormError } from '@/components/shared/form-field';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SectionHeader } from '@/components/ui/section-header';
import { formatMoney } from '@/lib/format';
import { ArrowRight, Package, MapPin, Wallet, StickyNote } from 'lucide-react';
import { toast } from 'sonner';

interface FormErrors {
  [key: string]: string;
}

export function OrdersCreateForm() {
  const navigate = useNavigate();
  const { create, loading, error: createError } = useCreateOrder();

  // Same list every other screen uses (orders-list.tsx, dispatches-create-form.tsx)
  // instead of a page-local fetch+useState duplicate of it.
  const { data: customers, loading: customersLoading, error: customersError } = useCustomersList({
    status: 'ACTIVE',
    limit: 100,
  });

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

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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

    if (formData.price === undefined || Number.isNaN(formData.price) || formData.price < 0) {
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
    } catch {
      // Error is already set in hook
      toast.error(createError || 'Failed to create order');
    }
  };

  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const hasRoute = formData.pickupCity && formData.deliveryCity;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Create Order" subtitle="Fill in the shipment details below" />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* Main form — left, two-thirds width on desktop */}
        <div className="space-y-6 lg:col-span-2">
          <SurfaceCard className="p-6">
            <SectionHeader title="Customer" />
            {customersError && <FormError message={customersError} />}
            <div className="mt-4">
              <FormField id="customerId" label="Customer" required error={validationErrors.customerId}>
                <select
                  id="customerId"
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
              </FormField>
            </div>
          </SurfaceCard>

          {/* Shipment — pickup and delivery side by side with a route
              connector, so the two ends of the trip read as one shipment
              rather than two disconnected sections. */}
          <SurfaceCard className="p-6">
            <SectionHeader title="Shipment" subtitle="Pickup and delivery" />
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  Pickup
                </div>
                <FormField id="pickupAddress" label="Address" required error={validationErrors.pickupAddress}>
                  <Input
                    id="pickupAddress"
                    type="text"
                    placeholder="123 Main St"
                    value={formData.pickupAddress}
                    onChange={(e) => handleChange('pickupAddress', e.target.value)}
                    maxLength={300}
                    data-testid="orders-pickup-address"
                  />
                </FormField>
                <FormField id="pickupCity" label="City" required error={validationErrors.pickupCity}>
                  <Input
                    id="pickupCity"
                    type="text"
                    placeholder="New York"
                    value={formData.pickupCity}
                    onChange={(e) => handleChange('pickupCity', e.target.value)}
                    maxLength={100}
                    data-testid="orders-pickup-city"
                  />
                </FormField>
                <FormField id="pickupDate" label="Date" required error={validationErrors.pickupDate}>
                  <Input
                    id="pickupDate"
                    type="date"
                    value={formData.pickupDate}
                    onChange={(e) => handleChange('pickupDate', e.target.value)}
                    data-testid="orders-pickup-date"
                  />
                </FormField>
              </div>

              <div className="space-y-4 border-t border-brand/10 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  Delivery
                </div>
                <FormField id="deliveryAddress" label="Address" required error={validationErrors.deliveryAddress}>
                  <Input
                    id="deliveryAddress"
                    type="text"
                    placeholder="456 Oak Ave"
                    value={formData.deliveryAddress}
                    onChange={(e) => handleChange('deliveryAddress', e.target.value)}
                    maxLength={300}
                    data-testid="orders-delivery-address"
                  />
                </FormField>
                <FormField id="deliveryCity" label="City" required error={validationErrors.deliveryCity}>
                  <Input
                    id="deliveryCity"
                    type="text"
                    placeholder="Los Angeles"
                    value={formData.deliveryCity}
                    onChange={(e) => handleChange('deliveryCity', e.target.value)}
                    maxLength={100}
                    data-testid="orders-delivery-city"
                  />
                </FormField>
                <FormField id="deliveryDate" label="Date" required error={validationErrors.deliveryDate}>
                  <Input
                    id="deliveryDate"
                    type="date"
                    value={formData.deliveryDate}
                    onChange={(e) => handleChange('deliveryDate', e.target.value)}
                    data-testid="orders-delivery-date"
                  />
                </FormField>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <SectionHeader title="Cargo" />
            <div className="mt-4 space-y-4">
              <FormField id="cargoDescription" label="Description" required error={validationErrors.cargoDescription}>
                <Textarea
                  id="cargoDescription"
                  placeholder="Describe the cargo to be transported"
                  value={formData.cargoDescription}
                  onChange={(e) => handleChange('cargoDescription', e.target.value)}
                  maxLength={2000}
                  rows={3}
                  data-testid="orders-cargo-description"
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="cargoWeightKg" label="Weight (kg)" error={validationErrors.cargoWeightKg}>
                  <Input
                    id="cargoWeightKg"
                    type="number"
                    placeholder="0.00"
                    value={formData.cargoWeightKg || ''}
                    onChange={(e) => handleChange('cargoWeightKg', e.target.value ? parseFloat(e.target.value) : 0)}
                    step="0.01"
                    min="0"
                    data-testid="orders-cargo-weight"
                  />
                </FormField>
                <FormField id="cargoVolumeM3" label="Volume (m³)" error={validationErrors.cargoVolumeM3}>
                  <Input
                    id="cargoVolumeM3"
                    type="number"
                    placeholder="0.00"
                    value={formData.cargoVolumeM3 || ''}
                    onChange={(e) => handleChange('cargoVolumeM3', e.target.value ? parseFloat(e.target.value) : 0)}
                    step="0.01"
                    min="0"
                    data-testid="orders-cargo-volume"
                  />
                </FormField>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <SectionHeader title="Pricing" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField id="price" label="Price" required error={validationErrors.price}>
                <Input
                  id="price"
                  type="number"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={(e) => handleChange('price', e.target.value ? parseFloat(e.target.value) : 0)}
                  step="0.01"
                  min="0"
                  data-testid="orders-price"
                />
              </FormField>
              <FormField id="currency" label="Currency" error={validationErrors.currency}>
                <Input
                  id="currency"
                  type="text"
                  placeholder="USD"
                  value={formData.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  maxLength={3}
                  data-testid="orders-currency"
                />
              </FormField>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <SectionHeader title="Notes" subtitle="Optional" />
            <div className="mt-4 space-y-4">
              <FormField id="notes" label="Notes" error={validationErrors.notes}>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes for this order"
                  value={formData.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  maxLength={2000}
                  rows={2}
                  data-testid="orders-notes"
                />
              </FormField>
              <FormField id="deliveryNotes" label="Delivery Notes" error={validationErrors.deliveryNotes}>
                <Textarea
                  id="deliveryNotes"
                  placeholder="Special instructions for delivery"
                  value={formData.deliveryNotes || ''}
                  onChange={(e) => handleChange('deliveryNotes', e.target.value)}
                  maxLength={2000}
                  rows={2}
                  data-testid="orders-delivery-notes"
                />
              </FormField>
            </div>
          </SurfaceCard>
        </div>

        {/* Order Summary — right sidebar, sticky so the submit action stays
            reachable without scrolling back down a long form. Every value
            here is read straight from formData; nothing computed that isn't
            already an input (no invented profit/margin — there's no cost
            data yet at creation time). */}
        <div className="lg:sticky lg:top-6">
          <SurfaceCard className="p-6">
            <SectionHeader title="Order Summary" />

            <div className="mt-4 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="truncate font-medium text-foreground">
                    {selectedCustomer?.companyName ?? 'Not selected yet'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Route</p>
                  {hasRoute ? (
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="truncate">{formData.pickupCity}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{formData.deliveryCity}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Not set yet</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Wallet className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Order Value</p>
                  <p className="font-semibold text-foreground">
                    {formData.price ? formatMoney(formData.price, formData.currency || 'USD') : '—'}
                  </p>
                </div>
              </div>

              {(formData.notes || formData.deliveryNotes) && (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <StickyNote className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="line-clamp-2 text-muted-foreground">{formData.notes || formData.deliveryNotes}</p>
                  </div>
                </div>
              )}
            </div>

            {createError && (
              <div className="mt-4">
                <FormError message={createError} />
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 border-t border-brand/10 pt-6">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-brand text-brand-foreground hover:opacity-90"
                data-testid="orders-submit-button"
              >
                {loading ? 'Creating...' : 'Create Order'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate({ to: '/app/orders' })} disabled={loading}>
                Cancel
              </Button>
            </div>
          </SurfaceCard>
        </div>
      </form>
    </div>
  );
}
